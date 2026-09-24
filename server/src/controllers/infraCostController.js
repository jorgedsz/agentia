// The monthly infrastructure cost of an account.
//
// Only the OWNER or a partner above the account may set it — an account may
// never set its own, the same rule that governs any other charge. Everyone can
// see what their own costs, which is what the charge on their statement says
// anyway.

const infraCost = require('../services/infraCost');
const { canManageAccount, managedAccountIds } = require('../utils/accountAccess');
const { logAudit } = require('../utils/auditLog');

const round = (n) => Math.round((n || 0) * 100) / 100;

function shape(user, now = new Date()) {
  const plan = infraCost.planFor(user, now);
  return {
    id: user.id,
    name: user.companyName || user.name || user.email,
    role: user.role,
    monthlyCost: user.infraMonthlyCost ? round(user.infraMonthlyCost) : 0,
    note: user.infraCostNote || null,
    balance: round(user.vapiCredits),
    lastChargedAt: user.infraCostLastChargedAt || null,
    // When the next charge lands: this month's day if it has not passed, else
    // the same day next month.
    nextChargeAt: user.infraMonthlyCost > 0
      ? (plan.due ? now : nextAfter(now))
      : null,
  };
}

function nextAfter(now) {
  const thisMonth = infraCost.chargeDateFor(now);
  if (now < thisMonth) return thisMonth;
  return infraCost.chargeDateFor(new Date(now.getFullYear(), now.getMonth() + 1, 1));
}

// GET /api/infra-cost — every account this user may set a cost for
const list = async (req, res) => {
  try {
    const allowed = await managedAccountIds(req.prisma, req.user);
    if (allowed && allowed.length === 0) return res.json({ accounts: [] });

    const users = await req.prisma.user.findMany({
      where: { ...(allowed ? { id: { in: allowed } } : { role: { not: 'OWNER' } }) },
      orderBy: { id: 'asc' },
    });
    const now = new Date();
    res.json({ accounts: users.map((u) => shape(u, now)) });
  } catch (error) {
    console.error('Error listing infrastructure costs:', error);
    res.status(500).json({ error: 'Failed to list infrastructure costs' });
  }
};

// GET /api/infra-cost/me — what this account itself is charged
const mine = async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(shape(user));
  } catch (error) {
    console.error('Error reading infrastructure cost:', error);
    res.status(500).json({ error: 'Failed to read infrastructure cost' });
  }
};

// PUT /api/infra-cost/:userId  Body: { amount, note? }
const set = async (req, res) => {
  try {
    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.params.userId) } });
    if (!target) return res.status(404).json({ error: 'User not found' });

    // canManageAccount is the rule itself: true for the OWNER, true for a
    // partner above this account, false for the account itself.
    if (!(await canManageAccount(req.prisma, req.user, target))) {
      return res.status(403).json({ error: 'Solo el owner o el socio del que depende la cuenta puede poner este coste.' });
    }

    const raw = req.body?.amount;
    const amount = raw === '' || raw === null || raw === undefined ? 0 : parseFloat(raw);
    if (!Number.isFinite(amount) || amount < 0 || amount > infraCost.MAX_COST) {
      return res.status(400).json({ error: `Indica un monto entre 0 y ${infraCost.MAX_COST}.` });
    }

    const updated = await req.prisma.user.update({
      where: { id: target.id },
      data: {
        infraMonthlyCost: amount > 0 ? round(amount) : null,
        infraCostNote: (req.body?.note || '').trim().slice(0, 200) || null,
      },
    });

    logAudit(req.prisma, {
      userId: target.id,
      actorId: req.user.id,
      actorType: 'user',
      action: 'infra_cost.set',
      resourceType: 'user',
      resourceId: String(target.id),
      details: { from: round(target.infraMonthlyCost), to: round(amount) },
      req,
    });

    res.json(shape(updated));
  } catch (error) {
    console.error('Error setting infrastructure cost:', error);
    res.status(500).json({ error: 'Failed to set infrastructure cost' });
  }
};

// POST /api/infra-cost/:userId/charge-now — charge this month early, if it is
// owed. Same rule as setting the price.
const chargeNow = async (req, res) => {
  try {
    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.params.userId) } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!(await canManageAccount(req.prisma, req.user, target))) {
      return res.status(403).json({ error: 'Solo el owner o el socio del que depende la cuenta puede cobrar este coste.' });
    }

    // A charge asked for by hand should not wait for the 30th, so the run is
    // told this month's day has arrived. The month is still claimed, so the
    // sweep will not charge it again on the 30th.
    const effectiveNow = new Date(Math.max(Date.now(), infraCost.chargeDateFor(new Date()).getTime()));
    const result = await infraCost.runForAccount(req.prisma, target.id, effectiveNow);
    if (!result.charged) return res.status(409).json({ error: `No se cobró: ${result.reason}` });

    const fresh = await req.prisma.user.findUnique({ where: { id: target.id } });
    res.json({ charged: true, amount: result.amount, account: shape(fresh) });
  } catch (error) {
    console.error('Error charging infrastructure cost:', error);
    res.status(500).json({ error: 'Failed to charge infrastructure cost' });
  }
};

module.exports = { list, mine, set, chargeNow };
