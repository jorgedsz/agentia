// Charging by cuts, with a week always held in reserve.
//
// The account is funded in days of its own consumption rather than in fixed
// amounts. A funded account holds 21 days, of which the last 7 are a guarantee
// that is not meant to be spent: the moment the balance falls into that week,
// the card is charged back up to the full 21 days. With steady consumption that
// lands roughly every fortnight, and sooner if traffic spikes.
//
// The 21 days are the whole fund, not a cut plus an extra: the cut is simply
// what is left once the guarantee is set aside (21 − 7 = 14 days of spending).
//
// Everything is derived from the account's real usage, so a client that doubles
// its traffic is charged more, and sooner, without anyone touching a setting.

const { decryptPHI } = require('../utils/phiEncryption');
const { getEffectiveBilling } = require('./../utils/whopConfig');
const { recordAutoRechargeFailure, extractDeclineReason } = require('../utils/autoRecharge');

const MIN_CHARGE = 0.5;        // Stripe refuses less
const MAX_CHARGE = 10000;
const COOLDOWN_MS = 6 * 60 * 60 * 1000;   // don't charge the same account twice in a morning
const PENDING_STALE_MS = 30 * 60 * 1000;  // a charge still unconfirmed after this is treated as lost

const round = (n) => Math.round((n || 0) * 100) / 100;

/**
 * What the account spends per day, averaged over its recent history. Days with
 * no traffic count: a client that only calls on weekdays still has to cover the
 * weekend, and averaging over calendar days is what makes "21 days" mean
 * three weeks rather than three weeks of busy days.
 */
async function dailyAverage(prisma, userId, windowDays) {
  const days = Math.max(1, windowDays || 14);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const window = { userId, createdAt: { gte: since } };

  const [calls, messages] = await Promise.all([
    prisma.callLog.findMany({ where: window, select: { id: true, costCharged: true } }).catch(() => []),
    prisma.chatbotMessage.aggregate({ where: { ...window, isTest: false }, _sum: { costCharged: true } }).catch(() => null),
  ]);

  const callsCost = calls.reduce((sum, row) => sum + (decryptPHI(row).costCharged || 0), 0);
  const messagesCost = messages?._sum?.costCharged || 0;
  const total = callsCost + messagesCost;

  return { dailyAverage: round(total / days), windowDays: days, windowTotal: round(total) };
}

/**
 * The account's position in its cut: what it spends, what it should hold, and
 * whether it is time to charge. Pure reading — this is also what the screen
 * shows before anyone presses anything.
 */
async function planFor(prisma, user) {
  // The target is the whole fund, not an extra on top of the guarantee: 21 days
  // means 21, of which the last 7 are the reserve that triggers the next charge.
  const targetDays = user.cycleTargetDays || 21;
  const guaranteeDays = Math.min(user.cycleGuaranteeDays ?? 7, targetDays);
  const cycleDays = targetDays - guaranteeDays;
  const { dailyAverage: perDay, windowDays, windowTotal } = await dailyAverage(prisma, user.id, user.cycleUsageWindowDays);

  const balance = round(user.vapiCredits);
  const targetAmount = round(perDay * targetDays);
  const guaranteeAmount = round(perDay * guaranteeDays);
  const chargeAmount = round(Math.max(0, targetAmount - balance));
  // Days of runway left at the current rate. No consumption yet means no estimate.
  const daysLeft = perDay > 0 ? round(balance / perDay) : null;

  return {
    enabled: !!user.cycleBillingEnabled,
    cycleDays,
    guaranteeDays,
    targetDays,
    windowDays,
    windowTotal,
    dailyAverage: perDay,
    balance,
    guaranteeAmount,
    targetAmount,
    chargeAmount,
    daysLeft,
    // Time to charge once the balance has fallen into the guarantee week.
    due: perDay > 0 && balance <= guaranteeAmount && chargeAmount >= MIN_CHARGE,
  };
}

/** Reasons an account is skipped, in the order they are checked. */
async function blockedReason(prisma, user, plan) {
  if (!user.cycleBillingEnabled) return 'cut billing is off for this account';
  if (plan.dailyAverage <= 0) return 'no consumption yet to estimate a cut from';
  if (!plan.due) return null; // not blocked, simply not due
  if (plan.chargeAmount > MAX_CHARGE) return `the top-up would be $${plan.chargeAmount}, over the per-charge limit`;

  const { mode } = await getEffectiveBilling(prisma, user.id).catch(() => ({ mode: 'platform' }));
  if (mode === 'manual') return 'the provider loads this account by hand';

  const card = mode === 'own_stripe' ? user.stripePaymentMethodId : user.whopPaymentMethodId;
  if (!card) return 'no saved card to charge';

  if (user.cycleLastChargeAt && (Date.now() - new Date(user.cycleLastChargeAt).getTime()) < COOLDOWN_MS) {
    return 'charged recently; waiting out the cooldown';
  }

  // A charge that is still settling must not be duplicated. One that never
  // confirmed is released so a lost webhook cannot freeze billing forever.
  const pending = await prisma.creditPurchase.findFirst({
    where: { userId: user.id, kind: 'cycle_topup', status: 'pending' },
    orderBy: { createdAt: 'desc' },
  });
  if (pending) {
    const age = Date.now() - new Date(pending.createdAt).getTime();
    if (age < PENDING_STALE_MS) return 'a top-up is still settling';
    await prisma.creditPurchase.updateMany({
      where: { id: pending.id, status: 'pending' },
      data: { status: 'failed', errorMessage: 'El proveedor nunca confirmó este cobro (webhook no recibido).' },
    }).catch(() => {});
  }

  return null;
}

/**
 * Evaluate one account and charge it if the cut says so. Returns what happened,
 * and never throws: a failure is recorded against the account, not raised.
 */
async function runForAccount(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { charged: false, reason: 'account not found' };

  const plan = await planFor(prisma, user);
  const blocked = await blockedReason(prisma, user, plan);
  if (blocked) return { charged: false, reason: blocked, plan };
  if (!plan.due) return { charged: false, reason: 'not due yet', plan };

  // Stamp before charging, so a crash mid-charge cannot produce a second one.
  await prisma.user.update({ where: { id: user.id }, data: { cycleLastChargeAt: new Date() } });

  const { performOffSessionCharge } = require('../controllers/creditsController');
  try {
    const result = await performOffSessionCharge(prisma, user, plan.chargeAmount, 'cycle_topup');
    console.log(`[CycleBilling] Charged $${plan.chargeAmount} to user ${user.id} (balance $${plan.balance}, ~$${plan.dailyAverage}/day, target ${plan.targetDays} days)`);
    return { charged: true, amount: plan.chargeAmount, settled: result?.status === 'succeeded', plan };
  } catch (error) {
    const reason = extractDeclineReason(error);
    await recordAutoRechargeFailure(prisma, user.id, error);
    console.error(`[CycleBilling] Charge failed for user ${user.id}: ${reason}`);
    return { charged: false, reason, plan };
  }
}

/** Sweep every account on cut billing. Safe to call on a timer. */
async function processCycleBilling(prisma) {
  try {
    const accounts = await prisma.user.findMany({
      where: { cycleBillingEnabled: true },
      select: { id: true },
    });
    for (const { id } of accounts) {
      try {
        await runForAccount(prisma, id);
      } catch (error) {
        console.error(`[CycleBilling] Account ${id} failed:`, error.message);
      }
    }
  } catch (error) {
    console.error('[CycleBilling] Sweep failed:', error.message);
  }
}

module.exports = {
  MIN_CHARGE,
  MAX_CHARGE,
  dailyAverage,
  planFor,
  runForAccount,
  processCycleBilling,
};
