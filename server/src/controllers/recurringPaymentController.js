const axios = require('axios');
const whopService = require('../services/whopService');
const { decrypt } = require('../utils/encryption');

const PERIOD_DAYS = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

function resolvePeriodDays(label, customDays) {
  if (label === 'custom') return Math.max(1, parseInt(customDays) || 30);
  return PERIOD_DAYS[label] || 30;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function isOwner(req) {
  return req.user?.role === 'OWNER';
}

// ── GET /api/recurring-payments ──
const list = async (req, res) => {
  try {
    const where = isOwner(req) ? {} : { userId: req.user.id };
    const items = await req.prisma.recurringPayment.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } },
      },
      orderBy: { nextPaymentDate: 'asc' },
    });
    res.json({ items });
  } catch (err) {
    console.error('recurringPayment.list error:', err);
    res.status(500).json({ error: 'Failed to list recurring payments' });
  }
};

// ── POST /api/recurring-payments ──
const create = async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only OWNER can create recurring payments' });

    const {
      userId,
      description,
      amount,
      currency,
      periodLabel,
      periodDays,
      daysBeforeNotify,
      firstPaymentDate,
      notes,
    } = req.body;

    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) return res.status(400).json({ error: 'amount must be > 0' });

    const client = await req.prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!client) return res.status(404).json({ error: 'Client user not found' });

    const label = periodLabel || 'monthly';
    const days = resolvePeriodDays(label, periodDays);
    const notifyBefore = Math.max(0, parseInt(daysBeforeNotify ?? 3) || 0);
    const firstDate = firstPaymentDate ? new Date(firstPaymentDate) : addDays(new Date(), days);

    // Auto-create Whop product + one-time plan so we can spin a fresh checkout per cycle
    let whopProductId = null;
    let whopPlanId = null;
    try {
      const product = await whopService.createProduct(
        `Recurring - ${client.name || client.email} - $${amt}`,
        description || `Recurring payment for ${client.email}`
      );
      whopProductId = product.id;
      const plan = await whopService.createPlan(whopProductId, {
        price: amt,
        billingCycle: 'lifetime', // one-time plan, reused each cycle
        name: `Recurring $${amt} - ${client.email}`,
      });
      whopPlanId = plan.id;
    } catch (err) {
      console.error('recurringPayment.create: Whop plan creation failed:', err.response?.data || err.message);
      return res.status(500).json({ error: 'Failed to create Whop plan for recurring payment. Check WHOP_API_KEY and WHOP_COMPANY_ID.' });
    }

    const item = await req.prisma.recurringPayment.create({
      data: {
        userId: parseInt(userId),
        createdBy: req.user.id,
        description: description || null,
        amount: amt,
        currency: currency || 'USD',
        periodLabel: label,
        periodDays: days,
        daysBeforeNotify: notifyBefore,
        nextPaymentDate: firstDate,
        status: 'active',
        whopProductId,
        whopPlanId,
        notes: notes || null,
      },
      include: {
        user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } },
      },
    });

    res.status(201).json({ item });
  } catch (err) {
    console.error('recurringPayment.create error:', err);
    res.status(500).json({ error: 'Failed to create recurring payment' });
  }
};

// ── PATCH /api/recurring-payments/:id ──
const update = async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only OWNER can edit recurring payments' });
    const id = parseInt(req.params.id);
    const existing = await req.prisma.recurringPayment.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const { description, amount, currency, periodLabel, periodDays, daysBeforeNotify, nextPaymentDate, status, notes } = req.body;
    const data = {};
    if (description !== undefined) data.description = description || null;
    if (amount !== undefined) {
      const a = parseFloat(amount);
      if (a > 0) data.amount = a;
    }
    if (currency !== undefined) data.currency = currency;
    if (periodLabel !== undefined) {
      data.periodLabel = periodLabel;
      data.periodDays = resolvePeriodDays(periodLabel, periodDays ?? existing.periodDays);
    } else if (periodDays !== undefined) {
      data.periodDays = Math.max(1, parseInt(periodDays) || existing.periodDays);
    }
    if (daysBeforeNotify !== undefined) data.daysBeforeNotify = Math.max(0, parseInt(daysBeforeNotify) || 0);
    if (nextPaymentDate !== undefined) data.nextPaymentDate = new Date(nextPaymentDate);
    if (status !== undefined && ['active', 'paused', 'cancelled'].includes(status)) data.status = status;
    if (notes !== undefined) data.notes = notes || null;

    // Whop plan prices are fixed at creation. If amount changed, spin a new plan
    // so the next generated checkout link charges the new amount.
    const newAmount = data.amount ?? existing.amount;
    const amountChanged = data.amount !== undefined && data.amount !== existing.amount;
    if (amountChanged) {
      try {
        const clientEmail = existing.user?.email || 'client';
        let productId = existing.whopProductId;
        if (!productId) {
          const product = await whopService.createProduct(
            `Recurring - ${existing.user?.name || clientEmail} - $${newAmount}`,
            data.description ?? existing.description ?? `Recurring payment for ${clientEmail}`
          );
          productId = product.id;
          data.whopProductId = productId;
        }
        const plan = await whopService.createPlan(productId, {
          price: newAmount,
          billingCycle: 'lifetime',
          name: `Recurring $${newAmount} - ${clientEmail}`,
        });
        data.whopPlanId = plan.id;
        data.lastCheckoutUrl = null; // old link was priced at the old amount
        console.log(`[RecurringPayment] id=${id} amount changed ${existing.amount} → ${newAmount}; new Whop plan ${plan.id}`);
      } catch (err) {
        console.error('recurringPayment.update: Whop plan regeneration failed:', err.response?.data || err.message);
        return res.status(500).json({ error: 'Failed to regenerate Whop plan for new amount. Old plan still active.' });
      }
    }

    const item = await req.prisma.recurringPayment.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } },
      },
    });
    res.json({ item });
  } catch (err) {
    console.error('recurringPayment.update error:', err);
    res.status(500).json({ error: 'Failed to update recurring payment' });
  }
};

// ── DELETE /api/recurring-payments/:id ──
const remove = async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only OWNER can delete recurring payments' });
    const id = parseInt(req.params.id);
    await req.prisma.recurringPayment.delete({ where: { id } });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('recurringPayment.remove error:', err);
    res.status(500).json({ error: 'Failed to delete recurring payment' });
  }
};

// ── POST /api/recurring-payments/:id/mark-paid ──
// Manually mark the current cycle as paid and advance to the next.
const markPaid = async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only OWNER can mark payments' });
    const id = parseInt(req.params.id);
    const existing = await req.prisma.recurringPayment.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const item = await advanceToNextCycle(req.prisma, existing, { whopPaymentId: null, source: 'manual' });
    res.json({ item });
  } catch (err) {
    console.error('recurringPayment.markPaid error:', err);
    res.status(500).json({ error: 'Failed to mark paid' });
  }
};

// ── POST /api/recurring-payments/:id/fire-now ──
// Owner can manually fire the webhook notification immediately.
const fireNow = async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only OWNER can fire notifications' });
    const id = parseInt(req.params.id);
    const existing = await req.prisma.recurringPayment.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!existing) return res.status(404).json({ error: 'Not found' });

    const result = await sendNotification(req.prisma, existing);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('recurringPayment.fireNow error:', err);
    res.status(500).json({ error: err.message || 'Failed to send notification' });
  }
};

// ── Internal: advance to next cycle after payment ──
async function advanceToNextCycle(prisma, entry, { whopPaymentId, source }) {
  const now = new Date();
  // Advance from the current scheduled date, not `now`, so cycles stay aligned
  const base = entry.nextPaymentDate < now ? now : entry.nextPaymentDate;
  const next = addDays(base, entry.periodDays);

  const updated = await prisma.recurringPayment.update({
    where: { id: entry.id },
    data: {
      lastPaidAt: now,
      lastNotifiedAt: null,
      lastNotifiedForDate: null,
      nextPaymentDate: next,
      lastWhopPaymentId: whopPaymentId || entry.lastWhopPaymentId,
    },
    include: {
      user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } },
    },
  });

  console.log(`[RecurringPayment] Advanced id=${entry.id} (source=${source}) → next ${next.toISOString()}`);
  return updated;
}

// ── Internal: send a notification via webhook ──
async function sendNotification(prisma, entry) {
  // Resolve webhook URL from PlatformSettings
  const settings = await prisma.platformSettings.findFirst();
  const webhookEnc = settings?.recurringPaymentWebhookUrl;
  const webhookUrl = webhookEnc ? decrypt(webhookEnc) : '';
  if (!webhookUrl) {
    throw new Error('Recurring payment webhook URL not configured in Platform Settings');
  }

  // Load client if not included
  let client = entry.user;
  if (!client) {
    client = await prisma.user.findUnique({
      where: { id: entry.userId },
      select: { id: true, name: true, email: true, phoneNumber: true, companyName: true },
    });
  }

  // Generate a fresh Whop checkout session for this cycle
  let checkoutUrl = null;
  let checkoutId = null;
  if (entry.whopPlanId) {
    try {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const session = await whopService.createCheckoutSession({
        planId: entry.whopPlanId,
        metadata: {
          userId: String(entry.userId),
          type: 'recurring_payment',
          recurringPaymentId: String(entry.id),
        },
        redirectUrl: `${clientUrl}/payments?checkout=success`,
      });
      checkoutUrl = session.purchase_url;
      checkoutId = session.id;
    } catch (err) {
      console.error(`[RecurringPayment] Whop checkout creation failed for id=${entry.id}:`, err.response?.data || err.message);
      throw new Error('Failed to generate Whop checkout link');
    }
  }

  const payload = {
    type: 'recurring_payment_due',
    recurringPaymentId: entry.id,
    client: {
      id: client?.id,
      name: client?.name || null,
      email: client?.email || null,
      phoneNumber: client?.phoneNumber || null,
      companyName: client?.companyName || null,
    },
    amount: entry.amount,
    currency: entry.currency,
    period: entry.periodLabel,
    periodDays: entry.periodDays,
    daysBeforeNotify: entry.daysBeforeNotify,
    nextPaymentDate: entry.nextPaymentDate,
    paymentLink: checkoutUrl,
    checkoutId,
    description: entry.description || null,
    sentAt: new Date().toISOString(),
  };

  try {
    await axios.post(webhookUrl, payload, { timeout: 15000 });
  } catch (err) {
    console.error(`[RecurringPayment] Webhook POST failed for id=${entry.id}:`, err.response?.status, err.message);
    throw new Error('Webhook request failed');
  }

  await prisma.recurringPayment.update({
    where: { id: entry.id },
    data: {
      lastNotifiedAt: new Date(),
      lastNotifiedForDate: entry.nextPaymentDate,
      lastCheckoutUrl: checkoutUrl,
    },
  });

  console.log(`[RecurringPayment] Notified id=${entry.id} (client ${client?.email}) — due ${entry.nextPaymentDate.toISOString()}`);
  return { paymentLink: checkoutUrl, client };
}

// ── Scheduler ──
let schedulerInterval = null;
let isProcessing = false;
const SCHEDULER_INTERVAL_MS = 60 * 60 * 1000; // hourly check

function startScheduler(prisma) {
  if (schedulerInterval) return;
  console.log('[RecurringPayment] Scheduler started (hourly)');
  processDueNotifications(prisma);
  schedulerInterval = setInterval(() => processDueNotifications(prisma), SCHEDULER_INTERVAL_MS);
}

async function processDueNotifications(prisma) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const today = startOfDay(new Date());
    const active = await prisma.recurringPayment.findMany({
      where: { status: 'active' },
      include: { user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } } },
    });

    for (const entry of active) {
      try {
        const triggerDate = addDays(entry.nextPaymentDate, -entry.daysBeforeNotify);
        if (today < startOfDay(triggerDate)) continue;

        // Dedup: don't notify twice for the same nextPaymentDate
        if (entry.lastNotifiedForDate && new Date(entry.lastNotifiedForDate).getTime() === new Date(entry.nextPaymentDate).getTime()) {
          continue;
        }

        await sendNotification(prisma, entry);
      } catch (err) {
        console.error(`[RecurringPayment] Entry ${entry.id} failed:`, err.message);
      }
    }
  } catch (err) {
    console.error('[RecurringPayment] Scheduler error:', err);
  } finally {
    isProcessing = false;
  }
}

// ── Whop webhook integration: called from whopController on payment.succeeded ──
async function handleWhopPaymentForRecurring(prisma, paymentData, metadata) {
  // Fast path: metadata has our id
  const recurringPaymentId = metadata?.recurringPaymentId ? parseInt(metadata.recurringPaymentId) : null;
  if (recurringPaymentId) {
    const entry = await prisma.recurringPayment.findUnique({ where: { id: recurringPaymentId } });
    if (entry) {
      await advanceToNextCycle(prisma, entry, { whopPaymentId: paymentData.id, source: 'whop_webhook' });
      return true;
    }
  }

  // Fallback: match by plan + user
  const planId = paymentData.plan?.id || paymentData.membership?.plan_id;
  if (planId) {
    const entry = await prisma.recurringPayment.findFirst({
      where: { whopPlanId: planId, status: 'active' },
      orderBy: { nextPaymentDate: 'asc' },
    });
    if (entry) {
      await advanceToNextCycle(prisma, entry, { whopPaymentId: paymentData.id, source: 'whop_webhook_fallback' });
      return true;
    }
  }

  return false;
}

module.exports = {
  list,
  create,
  update,
  remove,
  markPaid,
  fireNow,
  startScheduler,
  processDueNotifications,
  handleWhopPaymentForRecurring,
};
