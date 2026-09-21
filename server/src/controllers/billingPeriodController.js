// The billing-periods screen: an account's months, what each one cost, which
// are still owed, the day-by-day detail behind any of them, and paying one.
//
// Admin-side only (the OWNER, or the partner above the account). Clients settle
// their balance through their own payment page.

const billing = require('../services/billingPeriods');
const { buildPaymentReport } = require('../services/paymentReport');
const { canManageAccount } = require('../utils/accountAccess');
const { getEffectiveBilling } = require('../utils/whopConfig');
const { extractDeclineReason } = require('../utils/autoRecharge');
const { logAudit } = require('../utils/auditLog');

/**
 * The account a request is about. `:userId` may be "me" — every account can
 * read its own statements and reports. Reading someone else's, and every write
 * (charging, marking paid, cut settings), stays with the OWNER or the partner
 * above the account.
 */
async function resolveTarget(req, res, { allowSelf = false } = {}) {
  const isSelf = req.params.userId === 'me' || parseInt(req.params.userId) === req.user?.id;
  const id = req.params.userId === 'me' ? req.user?.id : parseInt(req.params.userId);

  const target = await req.prisma.user.findUnique({ where: { id } });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  if (isSelf) {
    if (allowSelf) return target;
    res.status(403).json({ error: 'Esta acción la hace tu proveedor.' });
    return null;
  }
  if (!(await canManageAccount(req.prisma, req.user, target))) {
    res.status(403).json({ error: 'You cannot manage this account.' });
    return null;
  }
  return target;
}

// GET /api/billing-periods/:userId
const list = async (req, res) => {
  try {
    const target = await resolveTarget(req, res, { allowSelf: true });
    if (!target) return;

    const periods = await billing.syncPeriods(req.prisma, target);
    const { mode } = await getEffectiveBilling(req.prisma, target.id).catch(() => ({ mode: 'platform' }));
    const isStripe = mode === 'own_stripe';

    res.json({
      readOnly: target.id === req.user.id,
      account: {
        id: target.id,
        name: target.companyName || target.name || target.email,
        email: target.email,
        balance: Math.round(target.vapiCredits * 100) / 100,
      },
      provider: isStripe ? 'stripe' : mode,
      hasCard: !!(isStripe ? target.stripePaymentMethodId : target.whopPaymentMethodId),
      timezone: billing.TIMEZONE,
      periods,
    });
  } catch (error) {
    console.error('Billing periods list error:', error.message);
    res.status(500).json({ error: 'Failed to load the billing periods' });
  }
};

/**
 * GET /api/billing-periods/:userId/report?from=YYYY-MM-DD&to=YYYY-MM-DD
 * The same detail as a month, over any dates you like — for the week a client
 * asks about, or a cut that doesn't line up with a calendar month. Nothing is
 * stored: a free range is a question, not a statement.
 */
const rangeReport = async (req, res) => {
  try {
    const target = await resolveTarget(req, res, { allowSelf: true });
    if (!target) return;

    const { from, to } = req.query || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from || '') || !/^\d{4}-\d{2}-\d{2}$/.test(to || '')) {
      return res.status(400).json({ error: 'Indica las fechas como AAAA-MM-DD (from y to).' });
    }

    // Whole local days, so "del 1 al 15" includes everything that happened on
    // the 15th in the client's own timezone.
    const start = billing.dayStart(from);
    const end = billing.dayEnd(to);
    if (!(start <= end)) {
      return res.status(400).json({ error: 'La fecha inicial debe ser anterior a la final.' });
    }

    const report = await buildPaymentReport(req.prisma, {
      id: 0,
      userId: target.id,
      amount: 0,
      periodStart: start,
      periodEnd: end,
      createdAt: end,
    });

    res.json({
      account: {
        id: target.id,
        name: target.companyName || target.name || target.email,
        email: target.email,
      },
      period: {
        id: null,
        label: billing.rangeLabel(start, end),
        usageAmount: report.totals.usage,
        status: 'range',
      },
      report: serializeReport(report),
    });
  } catch (error) {
    console.error('Billing range report error:', error.message);
    res.status(500).json({ error: 'Failed to build the report' });
  }
};

/** Dates as ISO strings and entries flattened, ready for the screen. */
function serializeReport(report) {
  return {
    ...report,
    period: { start: report.period.start.toISOString(), end: report.period.end.toISOString() },
    days: report.days.map((day) => ({
      date: day.key,
      label: day.label,
      calls: day.calls,
      messages: day.messages,
      total: Math.round(day.total * 100) / 100,
      items: day.items.map((item) => ({
        at: item.at.toISOString(),
        kind: item.kind,
        detail: item.detail,
        cost: Math.round(item.cost * 100) / 100,
      })),
    })),
  };
}

// GET /api/billing-periods/:userId/:periodId — the detail behind one month
const detail = async (req, res) => {
  try {
    const target = await resolveTarget(req, res, { allowSelf: true });
    if (!target) return;

    const period = await req.prisma.billingPeriod.findFirst({
      where: { id: parseInt(req.params.periodId), userId: target.id },
    });
    if (!period) return res.status(404).json({ error: 'Period not found' });

    // The same builder the post-payment email uses, pointed at this month.
    const report = await buildPaymentReport(req.prisma, {
      id: period.id,
      userId: target.id,
      amount: period.usageAmount,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      createdAt: period.periodEnd,
    });

    res.json({
      account: {
        id: target.id,
        name: target.companyName || target.name || target.email,
        email: target.email,
      },
      period: billing.decorate(period),
      report: serializeReport(report),
    });
  } catch (error) {
    console.error('Billing period detail error:', error.message);
    res.status(500).json({ error: 'Failed to load the period detail' });
  }
};

// POST /api/billing-periods/:userId/:periodId/charge — collect one month from
// the saved card. The amount is the month's own outstanding, never a free input.
const charge = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return;

    const period = await req.prisma.billingPeriod.findFirst({
      where: { id: parseInt(req.params.periodId), userId: target.id },
    });
    if (!period) return res.status(404).json({ error: 'Period not found' });

    const decorated = billing.decorate(period);
    if (!decorated.payable) {
      return res.status(400).json({
        error: period.status === 'open'
          ? 'Este mes todavía está en curso; se puede cobrar cuando cierre.'
          : 'Este período ya está cubierto.',
      });
    }
    if (decorated.outstanding < 0.5) {
      return res.status(400).json({ error: 'El saldo del período es menor al mínimo que acepta Stripe ($0.50).' });
    }

    const { mode } = await getEffectiveBilling(req.prisma, target.id).catch(() => ({ mode: 'platform' }));
    const isStripe = mode === 'own_stripe';
    if (!(isStripe ? target.stripePaymentMethodId : target.whopPaymentMethodId)) {
      return res.status(400).json({ error: 'La cuenta no tiene una tarjeta guardada. El cliente debe agregarla desde su panel.' });
    }

    const { performOffSessionCharge } = require('./creditsController');
    let result;
    try {
      result = await performOffSessionCharge(req.prisma, target, decorated.outstanding, 'manual_card', null, {
        billingPeriodId: period.id,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
      });
    } catch (error) {
      const reason = extractDeclineReason(error);
      console.error(`[BillingPeriods] Charging ${decorated.label} for user ${target.id} failed:`, reason);
      return res.status(400).json({ error: reason });
    }

    logAudit(req.prisma, {
      userId: target.id,
      actorId: req.user.id,
      actorType: 'user',
      action: 'billing_period.charge',
      resourceType: 'billing_period',
      resourceId: String(period.id),
      details: { period: decorated.label, amount: decorated.outstanding },
      req,
    });

    const settled = isStripe && result?.status === 'succeeded';
    const periods = await billing.syncPeriods(req.prisma, target);
    res.json({
      success: true,
      settled,
      amount: decorated.outstanding,
      message: settled
        ? `Cobro aprobado. ${decorated.label} queda pagado.`
        : 'Cobro enviado. El período se marcará pagado al confirmarse.',
      periods,
    });
  } catch (error) {
    console.error('Billing period charge error:', error.message);
    res.status(500).json({ error: 'Failed to charge the period' });
  }
};

// POST /api/billing-periods/:userId/:periodId/mark-paid — for a month settled
// outside the platform (transfer, cash). Records who said so and why.
const markPaid = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return;

    const period = await req.prisma.billingPeriod.findFirst({
      where: { id: parseInt(req.params.periodId), userId: target.id },
    });
    if (!period) return res.status(404).json({ error: 'Period not found' });

    const decorated = billing.decorate(period);
    if (decorated.outstanding <= 0) {
      return res.status(400).json({ error: 'Este período ya está cubierto.' });
    }

    const note = (req.body?.note || '').trim() || 'Marcado como pagado manualmente';
    await billing.applyPayment(req.prisma, period.id, decorated.outstanding, { note });

    logAudit(req.prisma, {
      userId: target.id,
      actorId: req.user.id,
      actorType: 'user',
      action: 'billing_period.mark_paid',
      resourceType: 'billing_period',
      resourceId: String(period.id),
      details: { period: decorated.label, amount: decorated.outstanding, note },
      req,
    });

    const periods = await billing.syncPeriods(req.prisma, target);
    res.json({ success: true, periods, message: `${decorated.label} marcado como pagado.` });
  } catch (error) {
    console.error('Billing period mark-paid error:', error.message);
    res.status(500).json({ error: 'Failed to mark the period as paid' });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Cut billing: charge every ~15 days, always holding a week in reserve
// ──────────────────────────────────────────────────────────────────────────

// GET /api/billing-periods/:userId/cycle — the account's position in its cut
const cyclePlan = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return;

    const cycle = require('../services/cycleBilling');
    const plan = await cycle.planFor(req.prisma, target);
    const { mode } = await getEffectiveBilling(req.prisma, target.id).catch(() => ({ mode: 'platform' }));
    const isStripe = mode === 'own_stripe';

    res.json({
      plan,
      hasCard: !!(isStripe ? target.stripePaymentMethodId : target.whopPaymentMethodId),
      lastChargeAt: target.cycleLastChargeAt,
      lastError: target.autoRechargeLastError || null,
    });
  } catch (error) {
    console.error('Cycle plan error:', error.message);
    res.status(500).json({ error: 'Failed to read the cut' });
  }
};

// PUT /api/billing-periods/:userId/cycle — turn it on and shape the cut
const updateCycle = async (req, res) => {
  try {
    const target_ = await resolveTarget(req, res);
    if (!target_) return;
    const target = target_;

    const data = {};
    if (req.body?.enabled !== undefined) data.cycleBillingEnabled = !!req.body.enabled;

    const days = (value, min, max) => {
      const n = parseInt(value);
      return Number.isFinite(n) && n >= min && n <= max ? n : null;
    };

    if (req.body?.targetDays !== undefined) {
      const n = days(req.body.targetDays, 1, 120);
      if (n === null) return res.status(400).json({ error: 'El fondo objetivo debe ser de 1 a 120 días.' });
      data.cycleTargetDays = n;
    }
    if (req.body?.guaranteeDays !== undefined) {
      const n = days(req.body.guaranteeDays, 0, 60);
      if (n === null) return res.status(400).json({ error: 'La garantía debe ser de 0 a 60 días.' });
      // A guarantee as big as the fund would charge on every sweep.
      const target = data.cycleTargetDays ?? target_.cycleTargetDays ?? 21;
      if (n >= target) return res.status(400).json({ error: 'La garantía debe ser menor que el fondo objetivo.' });
      data.cycleGuaranteeDays = n;
    }
    if (req.body?.usageWindowDays !== undefined) {
      const n = days(req.body.usageWindowDays, 3, 90);
      if (n === null) return res.status(400).json({ error: 'La ventana de consumo debe ser de 3 a 90 días.' });
      data.cycleUsageWindowDays = n;
    }

    const updated = await req.prisma.user.update({ where: { id: target.id }, data });

    logAudit(req.prisma, {
      userId: target.id,
      actorId: req.user.id,
      actorType: 'user',
      action: 'billing_cycle.update',
      resourceType: 'user',
      resourceId: String(target.id),
      details: data,
      req,
    });

    const cycle = require('../services/cycleBilling');
    res.json({ success: true, plan: await cycle.planFor(req.prisma, updated) });
  } catch (error) {
    console.error('Cycle update error:', error.message);
    res.status(500).json({ error: 'Failed to save the cut settings' });
  }
};

// POST /api/billing-periods/:userId/cycle/run — charge the cut now, for when
// you don't want to wait for the sweep (after a card is fixed, say).
const runCycle = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return;

    const cycle = require('../services/cycleBilling');
    const result = await cycle.runForAccount(req.prisma, target.id);

    if (!result.charged) {
      return res.status(400).json({ error: result.reason || 'No hay nada que cobrar en este momento.', plan: result.plan });
    }

    logAudit(req.prisma, {
      userId: target.id,
      actorId: req.user.id,
      actorType: 'user',
      action: 'billing_cycle.charge',
      resourceType: 'user',
      resourceId: String(target.id),
      details: { amount: result.amount },
      req,
    });

    const fresh = await req.prisma.user.findUnique({ where: { id: target.id } });
    res.json({
      success: true,
      amount: result.amount,
      settled: result.settled,
      message: result.settled
        ? `Cobro aprobado por $${result.amount.toFixed(2)}. La cuenta queda con fondo para ${result.plan.targetDays} días.`
        : `Cobro enviado por $${result.amount.toFixed(2)}. El saldo se actualizará al confirmarse.`,
      plan: await cycle.planFor(req.prisma, fresh),
    });
  } catch (error) {
    console.error('Cycle run error:', error.message);
    res.status(500).json({ error: 'Failed to charge the cut' });
  }
};

module.exports = { list, detail, rangeReport, charge, markPaid, cyclePlan, updateCycle, runCycle };
