// Moving an account's balance by hand, from outside the dashboard.
//
// Used for credit that no payment provider was involved in: a marketing gift, a
// correction, a discount. It is deliberately NOT authenticated with the target
// account's own API key — a client could then top itself up without limit. The
// caller must be the OWNER or a partner above the account, and proves it with
// its own trigger API key.

const { decrypt } = require('../utils/encryption');
const { canManageAccount } = require('../utils/accountAccess');
const { logAudit } = require('../utils/auditLog');

const MAX_ADJUSTMENT = 100000;

const round = (n) => Math.round(n * 100) / 100;

/** Resolve the caller from its own trigger API key. */
async function authCaller(req, res) {
  const callerId = req.body?.callerId ?? req.query?.callerId;
  const apiKey = req.body?.apiKey ?? req.query?.apiKey;

  if (!callerId || !apiKey) {
    res.status(401).json({ success: false, error: 'callerId and apiKey are required' });
    return null;
  }

  const caller = await req.prisma.user.findUnique({ where: { id: parseInt(callerId) } });
  if (!caller) {
    res.status(404).json({ success: false, error: `Caller not found (id ${callerId})` });
    return null;
  }
  if (!caller.triggerApiKey) {
    res.status(401).json({ success: false, error: 'That account has no API key. Generate one in Account Settings.' });
    return null;
  }

  let storedKey = null;
  try { storedKey = decrypt(caller.triggerApiKey); } catch { /* unreadable key */ }
  if (apiKey !== storedKey) {
    res.status(401).json({ success: false, error: 'Invalid API key' });
    return null;
  }
  return caller;
}

/**
 * POST /api/credits/adjust
 * Body: {
 *   callerId, apiKey,          // who is making the move (OWNER or a partner above)
 *   clientId,                  // whose balance moves
 *   amount,                    // always positive; `operation` gives it a direction
 *   operation: 'add'|'subtract',
 *   concept: 'marketing',      // what it is for — shows in the ledger
 *   note?, reference?          // reference makes a retry safe
 * }
 */
const adjustBalance = async (req, res) => {
  try {
    const caller = await authCaller(req, res);
    if (!caller) return;

    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.body?.clientId) } });
    if (!target) {
      return res.status(404).json({ success: false, error: `Client not found (id ${req.body?.clientId})` });
    }
    if (!(await canManageAccount(req.prisma, caller, target))) {
      return res.status(403).json({ success: false, error: 'That API key cannot move this account\'s balance.' });
    }

    const operation = req.body?.operation === 'subtract' ? 'subtract' : 'add';
    const raw = parseFloat(req.body?.amount);
    if (!Number.isFinite(raw) || raw <= 0 || raw > MAX_ADJUSTMENT) {
      return res.status(400).json({ success: false, error: `amount must be a positive number up to ${MAX_ADJUSTMENT}` });
    }
    const concept = (req.body?.concept || '').trim();
    if (!concept) {
      return res.status(400).json({ success: false, error: 'concept is required (for example "marketing")' });
    }

    const reference = (req.body?.reference || '').trim() || null;
    if (reference) {
      // A retry after a timeout must not double the balance.
      const existing = await req.prisma.creditAdjustment.findUnique({ where: { reference } });
      if (existing) {
        return res.json({
          success: true,
          duplicate: true,
          message: 'This reference was already applied; the balance was not moved again.',
          adjustmentId: existing.id,
          clientId: existing.userId,
          amount: existing.amount,
          balance: existing.balanceAfter,
        });
      }
    }

    const amount = operation === 'subtract' ? -round(raw) : round(raw);
    const updated = await req.prisma.user.update({
      where: { id: target.id },
      data: { vapiCredits: { increment: amount } },
      select: { vapiCredits: true },
    });
    const balanceAfter = round(updated.vapiCredits);

    const adjustment = await req.prisma.creditAdjustment.create({
      data: {
        userId: target.id,
        amount,
        concept,
        note: (req.body?.note || '').trim() || null,
        reference,
        source: 'api',
        actorId: caller.id,
        balanceAfter,
      },
    });

    logAudit(req.prisma, {
      userId: target.id,
      actorId: caller.id,
      actorType: 'api',
      action: 'credits.adjust',
      resourceType: 'user',
      resourceId: String(target.id),
      details: { amount, concept, reference, balanceAfter },
      req,
    });

    res.status(201).json({
      success: true,
      adjustmentId: adjustment.id,
      clientId: target.id,
      concept,
      amount,
      previousBalance: round(balanceAfter - amount),
      balance: balanceAfter,
      currency: 'USD',
    });
  } catch (error) {
    console.error('Credit adjustment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to adjust the balance' });
  }
};

/**
 * GET /api/credits/adjustments?callerId=..&apiKey=..&clientId=..&limit=..
 * The moves made this way, newest first — so whoever calls the API can check
 * what it has already applied.
 */
const listAdjustments = async (req, res) => {
  try {
    const caller = await authCaller(req, res);
    if (!caller) return;

    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.query?.clientId) } });
    if (!target) return res.status(404).json({ success: false, error: 'Client not found' });
    if (!(await canManageAccount(req.prisma, caller, target))) {
      return res.status(403).json({ success: false, error: 'That API key cannot read this account.' });
    }

    const limit = Math.min(parseInt(req.query?.limit) || 50, 200);
    const adjustments = await req.prisma.creditAdjustment.findMany({
      where: { userId: target.id },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    res.json({
      success: true,
      clientId: target.id,
      balance: round(target.vapiCredits),
      adjustments: adjustments.map((a) => ({
        id: a.id,
        amount: a.amount,
        concept: a.concept,
        note: a.note,
        reference: a.reference,
        balanceAfter: a.balanceAfter,
        at: a.createdAt,
      })),
    });
  } catch (error) {
    console.error('Credit adjustments list error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list adjustments' });
  }
};

module.exports = { adjustBalance, listAdjustments };
