// Moving an account's balance by hand: a marketing credit, a charge for
// something other than consumption, a correction, a discount.
//
// Two ways in, one set of rules. From outside the dashboard (the API) the
// caller proves who it is with its own trigger API key; from the panel, with its
// session. Either way the caller must be the OWNER or a partner above the
// account — never the account itself, which could otherwise top itself up.

const { decrypt } = require('../utils/encryption');
const { canManageAccount } = require('../utils/accountAccess');
const { logAudit } = require('../utils/auditLog');

const MAX_ADJUSTMENT = 100000;

const round = (n) => Math.round(n * 100) / 100;

/** Check the input shared by API and panel. Returns { error } or the clean values. */
function validate(body) {
  const operation = body?.operation === 'subtract' ? 'subtract' : 'add';
  const raw = parseFloat(body?.amount);
  if (!Number.isFinite(raw) || raw <= 0 || raw > MAX_ADJUSTMENT) {
    return { error: `amount must be a positive number up to ${MAX_ADJUSTMENT}` };
  }
  const concept = (body?.concept || '').trim();
  if (!concept) return { error: 'concept is required (for example "marketing")' };

  return {
    signedAmount: operation === 'subtract' ? -round(raw) : round(raw),
    concept: concept.slice(0, 80),
    note: (body?.note || '').trim().slice(0, 500) || null,
    reference: (body?.reference || '').trim() || null,
  };
}

/**
 * Move the balance and record it. Returns { adjustment, duplicate }. A known
 * reference returns the first result untouched, so a retry never doubles.
 */
async function applyAdjustment(prisma, { target, actorId, signedAmount, concept, note, reference, source, req }) {
  if (reference) {
    const existing = await prisma.creditAdjustment.findUnique({ where: { reference } });
    if (existing) return { adjustment: existing, duplicate: true };
  }

  const updated = await prisma.user.update({
    where: { id: target.id },
    data: { vapiCredits: { increment: signedAmount } },
    select: { vapiCredits: true },
  });
  const balanceAfter = round(updated.vapiCredits);

  const adjustment = await prisma.creditAdjustment.create({
    data: {
      userId: target.id,
      amount: signedAmount,
      concept,
      note,
      reference,
      source,
      actorId,
      balanceAfter,
    },
  });

  logAudit(prisma, {
    userId: target.id,
    actorId,
    actorType: source === 'api' ? 'api' : 'user',
    action: 'credits.adjust',
    resourceType: 'user',
    resourceId: String(target.id),
    details: { amount: signedAmount, concept, reference, balanceAfter, source },
    req,
  });

  return { adjustment, duplicate: false };
}

/** The ledger for one account, newest first, with who made each move. */
async function ledgerFor(prisma, userId, limit) {
  const rows = await prisma.creditAdjustment.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  const actorIds = [...new Set(rows.map((r) => r.actorId).filter(Boolean))];
  // Names are only a label on each row; failing to fetch them must never hide
  // the ledger itself.
  const actors = actorIds.length
    ? await Promise.resolve()
      .then(() => prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true, companyName: true } }))
      .catch(() => [])
    : [];
  const actorName = Object.fromEntries(actors.map((a) => [a.id, a.companyName || a.name || a.email]));

  return rows.map((a) => ({
    id: a.id,
    amount: a.amount,
    concept: a.concept,
    note: a.note,
    reference: a.reference,
    source: a.source,
    by: actorName[a.actorId] || null,
    balanceAfter: a.balanceAfter,
    at: a.createdAt,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// API — authenticated with the caller's own trigger key
// ──────────────────────────────────────────────────────────────────────────

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
 * Body: { callerId, apiKey, clientId, amount, operation: 'add'|'subtract',
 *         concept: 'marketing', note?, reference? }
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

    const input = validate(req.body);
    if (input.error) return res.status(400).json({ success: false, error: input.error });

    const { adjustment, duplicate } = await applyAdjustment(req.prisma, {
      target, actorId: caller.id, source: 'api', req, ...input,
    });

    if (duplicate) {
      return res.json({
        success: true,
        duplicate: true,
        message: 'This reference was already applied; the balance was not moved again.',
        adjustmentId: adjustment.id,
        clientId: adjustment.userId,
        amount: adjustment.amount,
        balance: adjustment.balanceAfter,
      });
    }

    res.status(201).json({
      success: true,
      adjustmentId: adjustment.id,
      clientId: target.id,
      concept: adjustment.concept,
      amount: adjustment.amount,
      previousBalance: round(adjustment.balanceAfter - adjustment.amount),
      balance: adjustment.balanceAfter,
      currency: 'USD',
    });
  } catch (error) {
    console.error('Credit adjustment error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to adjust the balance' });
  }
};

/** GET /api/credits/adjustments?callerId=..&apiKey=..&clientId=..&limit=.. */
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
    res.json({
      success: true,
      clientId: target.id,
      balance: round(target.vapiCredits),
      adjustments: await ledgerFor(req.prisma, target.id, limit),
    });
  } catch (error) {
    console.error('Credit adjustments list error:', error.message);
    res.status(500).json({ success: false, error: 'Failed to list adjustments' });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Panel — the "Otros cobros" screen, authenticated by session
// ──────────────────────────────────────────────────────────────────────────

async function panelTarget(req, res) {
  const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.params.userId) } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  if (!(await canManageAccount(req.prisma, req.user, target))) {
    res.status(403).json({ error: 'You cannot manage this account.' });
    return null;
  }
  return target;
}

// GET /api/credits/:userId/adjustments
const panelList = async (req, res) => {
  try {
    const target = await panelTarget(req, res);
    if (!target) return;
    res.json({
      account: { id: target.id, name: target.companyName || target.name || target.email, balance: round(target.vapiCredits) },
      adjustments: await ledgerFor(req.prisma, target.id, 200),
    });
  } catch (error) {
    console.error('Panel adjustments list error:', error.message);
    res.status(500).json({ error: 'Failed to list the charges' });
  }
};

// POST /api/credits/:userId/adjustments  Body: { amount, operation, concept, note? }
const panelCreate = async (req, res) => {
  try {
    const target = await panelTarget(req, res);
    if (!target) return;

    const input = validate(req.body);
    if (input.error) return res.status(400).json({ error: input.error });

    const { adjustment } = await applyAdjustment(req.prisma, {
      target, actorId: req.user.id, source: 'panel', req, ...input, reference: null,
    });

    res.status(201).json({
      success: true,
      balance: adjustment.balanceAfter,
      message: adjustment.amount < 0
        ? `Se descontaron $${Math.abs(adjustment.amount).toFixed(2)} por ${adjustment.concept}.`
        : `Se abonaron $${adjustment.amount.toFixed(2)} por ${adjustment.concept}.`,
      adjustments: await ledgerFor(req.prisma, target.id, 200),
    });
  } catch (error) {
    console.error('Panel adjustment error:', error.message);
    res.status(500).json({ error: 'Failed to record the charge' });
  }
};

module.exports = { adjustBalance, listAdjustments, panelList, panelCreate };
