// Budgets ("bolsillos"): money an account sets aside from its main balance for
// one purpose, so an outside tool can spend it without touching the rest.
//
// Three moves, and only three:
//   · transfer in  — main balance → budget (only money the account really has)
//   · transfer out — budget → main balance
//   · debit        — a tool spends from the budget
// Nothing else creates budget money, so a budget can never hold more than was
// paid in, and none of the moves can leave a balance below zero. Each one runs
// in a transaction with a conditional update, so two tools debiting the same
// budget at once cannot both spend the last dollar.

const { getAncestorPartners } = require('../utils/whopConfig');

const round = (n) => Math.round((n || 0) * 100) / 100;
const MAX_AMOUNT = 100000;

/** An error meant for the caller, with the HTTP status to send. */
class BudgetError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Budgets are on for an account when it, or any partner above it, has them
 * switched on — so enabling them on LM covers LM's whole tree.
 */
async function budgetsEnabledFor(prisma, user) {
  if (!user) return false;
  if (user.budgetsEnabled) return true;
  const ancestors = await getAncestorPartners(prisma, user).catch(() => []);
  for (const partner of ancestors) {
    const row = await prisma.user.findUnique({ where: { id: partner.id }, select: { budgetsEnabled: true } });
    if (row?.budgetsEnabled) return true;
  }
  return false;
}

/** "Marketing Q4" → "marketing-q4": the name the API uses. */
function slugify(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function cleanAmount(value) {
  const amount = round(parseFloat(value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new BudgetError(`El monto debe ser mayor a 0 y hasta ${MAX_AMOUNT}.`);
  }
  return amount;
}

// Interactive transaction when the client supports it, otherwise run in place.
function inTransaction(prisma, work) {
  return typeof prisma.$transaction === 'function' ? prisma.$transaction(work) : work(prisma);
}

async function listBudgets(prisma, userId, { includeArchived = false } = {}) {
  const budgets = await prisma.budget.findMany({
    where: { userId, ...(includeArchived ? {} : { archived: false }) },
    orderBy: { createdAt: 'asc' },
  });
  return budgets.map((b) => ({ id: b.id, name: b.name, slug: b.slug, balance: round(b.balance), archived: b.archived }));
}

async function createBudget(prisma, userId, name) {
  const clean = String(name || '').trim().slice(0, 60);
  const slug = slugify(clean);
  if (!clean || !slug) throw new BudgetError('Ponle un nombre al presupuesto.');

  const existing = await prisma.budget.findUnique({ where: { userId_slug: { userId, slug } } }).catch(() => null);
  if (existing && !existing.archived) throw new BudgetError(`Ya existe un presupuesto "${existing.name}".`, 409);
  if (existing) {
    // Re-creating an archived one brings it back, with its history intact.
    return prisma.budget.update({ where: { id: existing.id }, data: { archived: false, name: clean } });
  }
  return prisma.budget.create({ data: { userId, name: clean, slug } });
}

/**
 * Move money between the main balance and a budget.
 * direction 'in': main → budget. direction 'out': budget → main.
 */
async function transfer(prisma, { userId, budgetId, amount: rawAmount, direction, description, actorId, source = 'panel' }) {
  const amount = cleanAmount(rawAmount);
  if (direction !== 'in' && direction !== 'out') throw new BudgetError('Indica si el dinero entra o sale del presupuesto.');

  return inTransaction(prisma, async (tx) => {
    const budget = await tx.budget.findFirst({ where: { id: budgetId, userId, archived: false } });
    if (!budget) throw new BudgetError('Presupuesto no encontrado.', 404);

    if (direction === 'in') {
      // Only money the account actually has: the main balance may not be pushed
      // below zero to fund a budget, even on accounts allowed to run negative.
      const taken = await tx.user.updateMany({
        where: { id: userId, vapiCredits: { gte: amount } },
        data: { vapiCredits: { decrement: amount } },
      });
      if (taken.count !== 1) throw new BudgetError('El saldo principal no alcanza para esa transferencia.');
      await tx.budget.update({ where: { id: budget.id }, data: { balance: { increment: amount } } });
    } else {
      const taken = await tx.budget.updateMany({
        where: { id: budget.id, balance: { gte: amount } },
        data: { balance: { decrement: amount } },
      });
      if (taken.count !== 1) throw new BudgetError('El presupuesto no tiene ese saldo.');
      await tx.user.update({ where: { id: userId }, data: { vapiCredits: { increment: amount } } });
    }

    const after = await tx.budget.findUnique({ where: { id: budget.id } });
    const owner = await tx.user.findUnique({ where: { id: userId }, select: { vapiCredits: true } });

    const movement = await tx.budgetMovement.create({
      data: {
        budgetId: budget.id,
        userId,
        kind: direction === 'in' ? 'transfer_in' : 'transfer_out',
        amount: direction === 'in' ? amount : -amount,
        balanceAfter: round(after.balance),
        description: description || null,
        source,
        actorId: actorId || null,
      },
    });

    return { movement, budgetBalance: round(after.balance), mainBalance: round(owner.vapiCredits) };
  });
}

/**
 * Spend from a budget. A known reference returns the first result without
 * spending again, so a tool can safely retry after a timeout.
 */
async function debit(prisma, { userId, slug, amount: rawAmount, description, reference, actorId, source = 'api' }) {
  const amount = cleanAmount(rawAmount);
  const ref = (reference || '').trim() || null;

  if (ref) {
    const existing = await prisma.budgetMovement.findUnique({ where: { reference: ref } });
    if (existing) {
      if (existing.userId !== userId) throw new BudgetError('That reference belongs to another account.', 409);
      return { movement: existing, budgetBalance: existing.balanceAfter, duplicate: true };
    }
  }

  return inTransaction(prisma, async (tx) => {
    const budget = await tx.budget.findFirst({ where: { userId, slug, archived: false } });
    if (!budget) throw new BudgetError(`No existe el presupuesto "${slug}".`, 404);

    // Conditional: two debits racing for the same money cannot both succeed.
    const taken = await tx.budget.updateMany({
      where: { id: budget.id, balance: { gte: amount } },
      data: { balance: { decrement: amount } },
    });
    if (taken.count !== 1) {
      throw new BudgetError(`Saldo insuficiente en "${budget.name}": tiene $${round(budget.balance).toFixed(2)}.`, 402);
    }

    const after = await tx.budget.findUnique({ where: { id: budget.id } });
    const movement = await tx.budgetMovement.create({
      data: {
        budgetId: budget.id,
        userId,
        kind: 'debit',
        amount: -amount,
        balanceAfter: round(after.balance),
        description: (description || '').trim().slice(0, 300) || null,
        reference: ref,
        source,
        actorId: actorId || null,
      },
    });

    return { movement, budgetBalance: round(after.balance), duplicate: false };
  });
}

async function movementsFor(prisma, { userId, budgetId, limit = 100 }) {
  const rows = await prisma.budgetMovement.findMany({
    where: { userId, ...(budgetId ? { budgetId } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 500),
  });
  return rows.map((m) => ({
    id: m.id,
    budgetId: m.budgetId,
    kind: m.kind,
    amount: m.amount,
    balanceAfter: m.balanceAfter,
    description: m.description,
    reference: m.reference,
    source: m.source,
    at: m.createdAt,
  }));
}

module.exports = {
  BudgetError,
  budgetsEnabledFor,
  slugify,
  listBudgets,
  createBudget,
  transfer,
  debit,
  movementsFor,
};
