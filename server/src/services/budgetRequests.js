// Money asked for a budget, and the decision on it.
//
// Marketing asks the API for an amount; nothing moves. Someone who may approve
// — the account itself, the partner above it, or the OWNER — approves, and only
// then does the money leave the main balance and land in the budget. Approving
// is the transfer, so an approval that cannot be funded is not an approval.

const budgets = require('./budgets');

const round = (n) => Math.round((n || 0) * 100) / 100;
const money = (n) => `$${round(n).toFixed(2)}`;

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const MAX_AMOUNT = 1000000;

function cleanAmount(value) {
  const amount = round(parseFloat(value));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new RequestError('Indica un monto válido.');
  }
  return amount;
}

function shape(row) {
  return {
    id: row.id,
    status: row.status,
    amount: round(row.amount),
    approvedAmount: row.approvedAmount === null || row.approvedAmount === undefined ? null : round(row.approvedAmount),
    budget: row.budget ? { id: row.budget.id, name: row.budget.name, slug: row.budget.slug, balance: round(row.budget.balance) } : undefined,
    account: row.user ? { id: row.user.id, name: row.user.companyName || row.user.name || row.user.email } : undefined,
    description: row.description || null,
    reference: row.reference || null,
    requestedBy: row.requestedBy,
    decidedAt: row.decidedAt || null,
    decisionNote: row.decisionNote || null,
    createdAt: row.createdAt,
  };
}

const withRelations = {
  budget: { select: { id: true, name: true, slug: true, balance: true } },
  user: { select: { id: true, companyName: true, name: true, email: true } },
};

/**
 * Ask for money for a budget. A reference already used returns the first
 * request instead of asking twice, so a tool can retry after a timeout.
 */
async function create(prisma, { userId, slug, amount: rawAmount, description, reference, requestedBy = 'api' }) {
  const amount = cleanAmount(rawAmount);
  const ref = (reference || '').trim() || null;

  if (ref) {
    const existing = await prisma.budgetRequest.findUnique({ where: { reference: ref }, include: withRelations });
    if (existing) {
      if (existing.userId !== userId) throw new RequestError('Esa referencia pertenece a otra cuenta.', 409);
      return { request: shape(existing), duplicate: true };
    }
  }

  const budget = await prisma.budget.findFirst({ where: { userId, slug, archived: false } });
  if (!budget) throw new RequestError(`No existe el presupuesto "${slug}".`, 404);

  const created = await prisma.budgetRequest.create({
    data: {
      userId,
      budgetId: budget.id,
      amount,
      description: (description || '').trim().slice(0, 300) || null,
      reference: ref,
      requestedBy,
    },
    include: withRelations,
  });

  return { request: shape(created), duplicate: false };
}

async function listFor(prisma, userId, { status, limit = 50 } = {}) {
  const rows = await prisma.budgetRequest.findMany({
    where: { userId, ...(status ? { status } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(parseInt(limit) || 50, 1), 200),
    include: withRelations,
  });
  return rows.map(shape);
}

async function getFor(prisma, userId, id) {
  const row = await prisma.budgetRequest.findUnique({ where: { id: parseInt(id) }, include: withRelations });
  if (!row || row.userId !== userId) throw new RequestError('Solicitud no encontrada.', 404);
  return shape(row);
}

/**
 * Every account whose requests this person may decide: their own, plus the
 * whole subtree below them. The OWNER gets null, meaning "no limit".
 */
async function decidableAccountIds(prisma, user) {
  if (!user) return [];
  if (user.role === 'OWNER') return null;
  const ids = new Set([user.id]);
  if (user.role === 'AGENCY' || user.role === 'WHITELABEL') {
    let frontier = [user.id];
    // A subtree is at most partner → agency → client, but loop anyway so a
    // deeper tree is not silently cut off.
    for (let depth = 0; depth < 5 && frontier.length; depth += 1) {
      const children = await prisma.user.findMany({
        where: { OR: [{ agencyId: { in: frontier } }, { whitelabelId: { in: frontier } }] },
        select: { id: true },
      });
      frontier = children.map((c) => c.id).filter((id) => !ids.has(id));
      frontier.forEach((id) => ids.add(id));
    }
  }
  return [...ids];
}

// The requests this person may act on, pending first.
async function inboxFor(prisma, user, { status, limit = 100 } = {}) {
  const allowed = await decidableAccountIds(prisma, user);
  if (allowed && allowed.length === 0) return [];
  const rows = await prisma.budgetRequest.findMany({
    where: {
      ...(allowed ? { userId: { in: allowed } } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: Math.min(Math.max(parseInt(limit) || 100, 1), 300),
    include: withRelations,
  });
  return rows.map(shape);
}

async function loadDecidable(prisma, user, id) {
  const row = await prisma.budgetRequest.findUnique({ where: { id: parseInt(id) }, include: withRelations });
  if (!row) throw new RequestError('Solicitud no encontrada.', 404);
  const allowed = await decidableAccountIds(prisma, user);
  if (allowed && !allowed.includes(row.userId)) {
    throw new RequestError('No puedes decidir sobre esta solicitud.', 403);
  }
  return row;
}

const inTransaction = (prisma, work) =>
  (typeof prisma.$transaction === 'function' ? prisma.$transaction(work) : work(prisma));

/**
 * Approve and fund in one step. The amount may be lower than what was asked
 * for; it may never be higher. The claim and the transfer live in the same
 * transaction, so two people approving at once fund the budget once, and an
 * approval the main balance cannot cover leaves the request pending.
 */
async function approve(prisma, user, id, { amount: rawAmount, note } = {}) {
  const row = await loadDecidable(prisma, user, id);
  if (row.status !== 'pending') {
    throw new RequestError(`Esta solicitud ya fue ${row.status === 'approved' ? 'aprobada' : 'rechazada'}.`, 409);
  }

  const amount = rawAmount === undefined || rawAmount === null || rawAmount === '' ? round(row.amount) : cleanAmount(rawAmount);
  if (amount > round(row.amount)) {
    throw new RequestError(`No puedes aprobar más de lo solicitado (${money(row.amount)}).`);
  }

  return inTransaction(prisma, async (tx) => {
    // Whoever's update lands first owns the decision.
    const claimed = await tx.budgetRequest.updateMany({
      where: { id: row.id, status: 'pending' },
      data: {
        status: 'approved',
        approvedAmount: amount,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: (note || '').trim().slice(0, 300) || null,
      },
    });
    if (claimed.count !== 1) throw new RequestError('Esta solicitud ya fue atendida por alguien más.', 409);

    const account = await tx.user.findUnique({ where: { id: row.userId }, select: { vapiCredits: true } });
    if (round(account?.vapiCredits) < amount) {
      throw new RequestError(
        `El saldo principal de la cuenta (${money(account?.vapiCredits)}) no alcanza para enviar ${money(amount)}. `
        + `Faltan ${money(amount - round(account?.vapiCredits))}; la solicitud queda pendiente.`,
        402,
      );
    }

    const { movement, budgetBalance, mainBalance } = await budgets.transfer(tx, {
      userId: row.userId,
      budgetId: row.budgetId,
      amount,
      direction: 'in',
      description: `Solicitud #${row.id} aprobada${note ? `: ${note.trim().slice(0, 200)}` : ''}`,
      actorId: user.id,
      source: 'panel',
    });

    await tx.budgetRequest.update({ where: { id: row.id }, data: { movementId: movement.id } });
    const updated = await tx.budgetRequest.findUnique({ where: { id: row.id }, include: withRelations });

    return { request: shape(updated), budgetBalance, mainBalance };
  });
}

async function reject(prisma, user, id, { note } = {}) {
  const row = await loadDecidable(prisma, user, id);
  if (row.status !== 'pending') {
    throw new RequestError(`Esta solicitud ya fue ${row.status === 'approved' ? 'aprobada' : 'rechazada'}.`, 409);
  }

  const claimed = await prisma.budgetRequest.updateMany({
    where: { id: row.id, status: 'pending' },
    data: {
      status: 'rejected',
      decidedById: user.id,
      decidedAt: new Date(),
      decisionNote: (note || '').trim().slice(0, 300) || null,
    },
  });
  if (claimed.count !== 1) throw new RequestError('Esta solicitud ya fue atendida por alguien más.', 409);

  const updated = await prisma.budgetRequest.findUnique({ where: { id: row.id }, include: withRelations });
  return { request: shape(updated) };
}

module.exports = {
  RequestError,
  create,
  listFor,
  getFor,
  inboxFor,
  decidableAccountIds,
  approve,
  reject,
  shape,
};
