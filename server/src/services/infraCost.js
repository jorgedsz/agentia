// What an account costs to run — servers, numbers, licences — charged to its
// balance once a month.
//
// The charge lands on the 30th. February has no 30th, and neither do months a
// day short, so there the charge lands on the last day instead: every month
// gets exactly one charge, and none is skipped.
//
// The price is set by the OWNER or by the partner above the account, never by
// the account itself, and the charge is recorded like any other charge, so it
// shows up in the account's statement and reports.

const { notify } = require('./notifications');

const CHARGE_DAY = 30;
const MAX_COST = 100000;

const round = (n) => Math.round((n || 0) * 100) / 100;
const money = (n) => `$${round(n).toFixed(2)}`;

/** The day this month's charge falls on: the 30th, or the last day if sooner. */
function chargeDateFor(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(CHARGE_DAY, lastDay), 0, 0, 0, 0);
}

/**
 * Whether this account owes its monthly cost right now, and for which month.
 * Owing means: it has a price, that month's day has arrived, and the account
 * has not already been charged on or after it.
 */
function planFor(user, now = new Date()) {
  const cost = round(user?.infraMonthlyCost);
  if (!cost || cost <= 0) return { due: false, reason: 'no infrastructure cost set' };
  if (cost > MAX_COST) return { due: false, reason: 'cost above the allowed maximum' };

  const chargeDate = chargeDateFor(now);
  if (now < chargeDate) return { due: false, reason: 'this month\'s charge day has not arrived', chargeDate, amount: cost };

  const last = user.infraCostLastChargedAt ? new Date(user.infraCostLastChargedAt) : null;
  if (last && last >= chargeDate) return { due: false, reason: 'already charged this month', chargeDate, amount: cost };

  return { due: true, chargeDate, amount: cost };
}

/**
 * Charge one account if it owes. The claim is a conditional update, so two
 * sweeps running together charge once — the loser finds the month taken.
 * A balance too small is not a reason to skip: the cost is real either way and
 * the balance goes negative, exactly as usage does.
 */
async function runForAccount(prisma, userId, now = new Date()) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { charged: false, reason: 'account not found' };

  const plan = planFor(user, now);
  if (!plan.due) return { charged: false, reason: plan.reason };

  const claimed = await prisma.user.updateMany({
    where: {
      id: userId,
      OR: [
        { infraCostLastChargedAt: null },
        { infraCostLastChargedAt: { lt: plan.chargeDate } },
      ],
    },
    data: { infraCostLastChargedAt: now },
  });
  if (claimed.count !== 1) return { charged: false, reason: 'another run is already charging this month' };

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { vapiCredits: { decrement: plan.amount } },
    select: { vapiCredits: true },
  });
  const balanceAfter = round(updated.vapiCredits);

  const monthName = plan.chargeDate.toLocaleDateString('es', { month: 'long', year: 'numeric' });
  const adjustment = await prisma.creditAdjustment.create({
    data: {
      userId,
      amount: -plan.amount,
      concept: 'Infraestructura',
      note: user.infraCostNote ? `${user.infraCostNote} · ${monthName}` : `Coste mensual de infraestructura · ${monthName}`,
      source: 'system',
      actorId: null,
      balanceAfter,
    },
  });

  await notify(prisma, {
    userId,
    kind: 'infra_cost',
    title: `Coste de infraestructura: ${money(plan.amount)}`,
    body: `Se descontó el coste mensual. Tu saldo quedó en ${money(balanceAfter)}.`,
    link: '/dashboard/other-charges',
    data: { amount: plan.amount, balanceAfter, adjustmentId: adjustment.id },
  }).catch(() => null);

  console.log(`[InfraCost] Charged user ${userId} ${money(plan.amount)} (balance now ${money(balanceAfter)})`);
  return { charged: true, amount: plan.amount, balanceAfter, adjustment };
}

/** Every account with a price set; called on a timer. */
async function processInfraCosts(prisma, now = new Date()) {
  const accounts = await prisma.user.findMany({
    where: { infraMonthlyCost: { gt: 0 } },
    select: { id: true },
  });

  let charged = 0;
  for (const account of accounts) {
    try {
      const result = await runForAccount(prisma, account.id, now);
      if (result.charged) charged += 1;
    } catch (error) {
      console.error(`[InfraCost] User ${account.id}: ${error.message}`);
    }
  }
  return { accounts: accounts.length, charged };
}

module.exports = { CHARGE_DAY, MAX_COST, chargeDateFor, planFor, runForAccount, processInfraCosts, round };
