// Budgets ("bolsillos") — the API outside tools use to read and spend them, and
// the panel an account uses to fund them from its main balance.
//
// The API authenticates with the account's OWN key: spending your own budget is
// safe (it can only move money you already set aside), and there is deliberately
// no API call that adds money to a budget. Funding only happens from the panel,
// out of the main balance.

const budgets = require('../services/budgets');
const { authenticateAccountKey } = require('../utils/apiKeyAuth');
const { canManageAccount } = require('../utils/accountAccess');
const { logAudit } = require('../utils/auditLog');

const round = (n) => Math.round((n || 0) * 100) / 100;

function fail(res, error) {
  if (error instanceof budgets.BudgetError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  console.error('Budget error:', error.message);
  return res.status(500).json({ success: false, error: 'Budget operation failed' });
}

// ──────────────────────────────────────────────────────────────────────────
// API — clientId + apiKey of the account itself
// ──────────────────────────────────────────────────────────────────────────

async function apiAccount(req, res) {
  const clientId = req.query?.clientId ?? req.body?.clientId;
  const apiKey = req.query?.apiKey ?? req.body?.apiKey;
  const auth = await authenticateAccountKey(req.prisma, clientId, apiKey);
  if (auth.error) {
    res.status(auth.status).json({ success: false, error: auth.error });
    return null;
  }
  if (!(await budgets.budgetsEnabledFor(req.prisma, auth.user))) {
    res.status(403).json({ success: false, error: 'Budgets are not enabled for this account.' });
    return null;
  }
  return auth.user;
}

// GET /api/budgets?clientId=..&apiKey=..
const apiList = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;
    res.json({
      success: true,
      clientId: user.id,
      mainBalance: round(user.vapiCredits),
      currency: 'USD',
      budgets: (await budgets.listBudgets(req.prisma, user.id)).map(({ name, slug, balance }) => ({ name, slug, balance })),
    });
  } catch (error) { fail(res, error); }
};

// GET /api/budgets/:slug?clientId=..&apiKey=..
const apiGet = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;
    const budget = (await budgets.listBudgets(req.prisma, user.id)).find((b) => b.slug === req.params.slug);
    if (!budget) return res.status(404).json({ success: false, error: `No budget "${req.params.slug}"` });
    res.json({ success: true, name: budget.name, slug: budget.slug, balance: budget.balance, currency: 'USD' });
  } catch (error) { fail(res, error); }
};

// POST /api/budgets/:slug/debit  Body: { clientId, apiKey, amount, description?, reference? }
const apiDebit = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;

    const result = await budgets.debit(req.prisma, {
      userId: user.id,
      slug: req.params.slug,
      amount: req.body?.amount,
      description: req.body?.description,
      reference: req.body?.reference,
      actorId: user.id,
      source: 'api',
    });

    if (!result.duplicate) {
      logAudit(req.prisma, {
        userId: user.id,
        actorId: user.id,
        actorType: 'api',
        action: 'budget.debit',
        resourceType: 'budget',
        resourceId: String(result.movement.budgetId),
        details: { slug: req.params.slug, amount: -result.movement.amount, reference: result.movement.reference },
        req,
      });
    }

    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      ...(result.duplicate ? { message: 'This reference was already applied; nothing was spent again.' } : {}),
      movementId: result.movement.id,
      budget: req.params.slug,
      amount: Math.abs(result.movement.amount),
      balance: result.budgetBalance,
      currency: 'USD',
    });
  } catch (error) { fail(res, error); }
};

// GET /api/budgets/:slug/movements?clientId=..&apiKey=..&limit=..
const apiMovements = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;
    const budget = (await budgets.listBudgets(req.prisma, user.id)).find((b) => b.slug === req.params.slug);
    if (!budget) return res.status(404).json({ success: false, error: `No budget "${req.params.slug}"` });
    const movements = await budgets.movementsFor(req.prisma, {
      userId: user.id, budgetId: budget.id, limit: parseInt(req.query?.limit) || 100,
    });
    res.json({ success: true, budget: budget.slug, balance: budget.balance, movements });
  } catch (error) { fail(res, error); }
};

// ──────────────────────────────────────────────────────────────────────────
// Panel — the account itself ("me"), or the OWNER / partner above it
// ──────────────────────────────────────────────────────────────────────────

async function panelAccount(req, res) {
  const isSelf = req.params.userId === 'me' || parseInt(req.params.userId) === req.user?.id;
  const id = req.params.userId === 'me' ? req.user.id : parseInt(req.params.userId);
  const target = await req.prisma.user.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  if (!isSelf && !(await canManageAccount(req.prisma, req.user, target))) {
    res.status(403).json({ error: 'You cannot manage this account.' });
    return null;
  }
  return target;
}

async function panelState(prisma, target) {
  const fresh = await prisma.user.findUnique({ where: { id: target.id }, select: { vapiCredits: true } });
  return {
    enabled: true,
    account: { id: target.id, name: target.companyName || target.name || target.email },
    mainBalance: round(fresh?.vapiCredits),
    budgets: await budgets.listBudgets(prisma, target.id),
    movements: await budgets.movementsFor(prisma, { userId: target.id, limit: 100 }),
  };
}

// GET /api/budgets/panel/:userId
const panelGet = async (req, res) => {
  try {
    const target = await panelAccount(req, res);
    if (!target) return;
    if (!(await budgets.budgetsEnabledFor(req.prisma, target))) {
      return res.json({ enabled: false, account: { id: target.id, name: target.companyName || target.name || target.email } });
    }
    res.json(await panelState(req.prisma, target));
  } catch (error) { fail(res, error); }
};

async function requireEnabled(req, res, target) {
  if (await budgets.budgetsEnabledFor(req.prisma, target)) return true;
  res.status(403).json({ error: 'Los presupuestos no están activos para esta cuenta.' });
  return false;
}

// POST /api/budgets/panel/:userId  Body: { name }
const panelCreate = async (req, res) => {
  try {
    const target = await panelAccount(req, res);
    if (!target || !(await requireEnabled(req, res, target))) return;
    if (budgets.slugify(req.body?.name) === 'panel') {
      return res.status(400).json({ error: 'Ese nombre está reservado; elige otro.' });
    }
    await budgets.createBudget(req.prisma, target.id, req.body?.name);
    res.status(201).json(await panelState(req.prisma, target));
  } catch (error) { fail(res, error); }
};

// POST /api/budgets/panel/:userId/:budgetId/transfer  Body: { amount, direction: 'in'|'out', description? }
const panelTransfer = async (req, res) => {
  try {
    const target = await panelAccount(req, res);
    if (!target || !(await requireEnabled(req, res, target))) return;

    const result = await budgets.transfer(req.prisma, {
      userId: target.id,
      budgetId: parseInt(req.params.budgetId),
      amount: req.body?.amount,
      direction: req.body?.direction,
      description: req.body?.description,
      actorId: req.user.id,
      source: 'panel',
    });

    logAudit(req.prisma, {
      userId: target.id,
      actorId: req.user.id,
      actorType: 'user',
      action: `budget.${result.movement.kind}`,
      resourceType: 'budget',
      resourceId: String(result.movement.budgetId),
      details: { amount: result.movement.amount },
      req,
    });

    res.json({ ...(await panelState(req.prisma, target)), message: 'Transferencia realizada.' });
  } catch (error) { fail(res, error); }
};

// POST /api/budgets/panel/:userId/:budgetId/archive — only an empty budget
const panelArchive = async (req, res) => {
  try {
    const target = await panelAccount(req, res);
    if (!target || !(await requireEnabled(req, res, target))) return;

    const budget = await req.prisma.budget.findFirst({ where: { id: parseInt(req.params.budgetId), userId: target.id } });
    if (!budget) return res.status(404).json({ error: 'Presupuesto no encontrado.' });
    if (round(budget.balance) > 0) {
      return res.status(400).json({ error: 'Devuelve primero el saldo al principal; solo se archiva un presupuesto vacío.' });
    }
    await req.prisma.budget.update({ where: { id: budget.id }, data: { archived: true } });
    res.json(await panelState(req.prisma, target));
  } catch (error) { fail(res, error); }
};

module.exports = {
  apiList, apiGet, apiDebit, apiMovements,
  panelGet, panelCreate, panelTransfer, panelArchive,
};
