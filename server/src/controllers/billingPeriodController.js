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

async function resolveTarget(req, res) {
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

// GET /api/billing-periods/:userId
const list = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
    if (!target) return;

    const periods = await billing.syncPeriods(req.prisma, target);
    const { mode } = await getEffectiveBilling(req.prisma, target.id).catch(() => ({ mode: 'platform' }));
    const isStripe = mode === 'own_stripe';

    res.json({
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

// GET /api/billing-periods/:userId/:periodId — the detail behind one month
const detail = async (req, res) => {
  try {
    const target = await resolveTarget(req, res);
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
      report: {
        ...report,
        // Dates travel as ISO strings; the screen formats them.
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
      },
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

module.exports = { list, detail, charge, markPaid };
