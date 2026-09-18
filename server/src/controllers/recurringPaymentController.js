const axios = require('axios');
const whopService = require('../services/whopService');
const stripeService = require('../services/stripeService');
const { decrypt } = require('../utils/encryption');
const { getEffectiveBilling } = require('../utils/whopConfig');
const { getStripeConfigForUser } = require('../utils/stripeConfig');
const { getSavedCards, extractDeclineReason } = require('../utils/autoRecharge');

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

    // Clients under a partner billing through Stripe are charged on their saved
    // card each cycle, in that partner's Stripe — no checkout link, no Whop plan.
    const billing = await getEffectiveBilling(req.prisma, client.id).catch(() => ({ mode: 'platform' }));
    const provider = billing.mode === 'own_stripe' ? 'stripe_card' : 'whop';

    // Auto-create Whop product + one-time plan so we can spin a fresh checkout per cycle
    let whopProductId = null;
    let whopPlanId = null;
    if (provider === 'whop') try {
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
        provider,
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

    // Whop plan prices are fixed at creation. If amount changed, try to spin a
    // new plan so the next checkout link charges the new amount. We do this
    // BEFORE the DB write when possible, but failures here must not block the
    // core update — the amount still persists and the scheduler will retry
    // plan generation at next notification time.
    const newAmount = data.amount ?? existing.amount;
    const amountChanged = data.amount !== undefined && data.amount !== existing.amount;
    let whopWarning = null;
    // A Stripe entry has no plan to regenerate: the new amount is simply what the
    // next automatic charge takes from the saved card.
    if (amountChanged && existing.provider !== 'stripe_card') {
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
        data.lastCheckoutUrl = null;
        console.log(`[RecurringPayment] id=${id} amount changed ${existing.amount} → ${newAmount}; new Whop plan ${plan.id}`);
      } catch (err) {
        whopWarning = `Amount updated, but Whop plan regeneration failed (${err.response?.data?.message || err.message}). Next checkout link will still be generated on demand.`;
        console.error('recurringPayment.update: Whop plan regeneration failed — continuing with DB update:', err.response?.data || err.message);
        // Clear the stale Whop plan so fireNow/scheduler will re-attempt
        data.whopPlanId = null;
        data.lastCheckoutUrl = null;
      }
    }

    const item = await req.prisma.recurringPayment.update({
      where: { id },
      data,
      include: {
        user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } },
      },
    });
    res.json({ item, ...(whopWarning ? { warning: whopWarning } : {}) });
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
async function advanceToNextCycle(prisma, entry, { whopPaymentId, stripePaymentIntentId, source }) {
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
      lastStripePaymentIntentId: stripePaymentIntentId || entry.lastStripePaymentIntentId,
      // A paid cycle clears the previous decline and the failure dedup stamp.
      lastChargeError: null,
      lastFailureNotifiedForDate: null,
    },
    include: {
      user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } },
    },
  });

  console.log(`[RecurringPayment] Advanced id=${entry.id} (source=${source}) → next ${next.toISOString()}`);

  // Fire confirmation webhook (best-effort — never blocks the cycle advance)
  sendConfirmation(prisma, updated, { whopPaymentId, stripePaymentIntentId, source, paidAt: now }).catch((err) => {
    console.error(`[RecurringPayment] Confirmation webhook failed for id=${entry.id}:`, err.message);
  });

  return updated;
}

// ── Internal: send a payment-confirmed webhook ──
async function sendConfirmation(prisma, entry, { whopPaymentId, stripePaymentIntentId, source, paidAt }) {
  const settings = await prisma.platformSettings.findFirst();
  const webhookEnc = settings?.recurringPaymentWebhookUrl;
  const webhookUrl = webhookEnc ? decrypt(webhookEnc) : '';
  if (!webhookUrl) return; // silently skip if not configured

  const client = entry.user;
  const payload = {
    type: 'recurring_payment_confirmed',
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
    paidAt: (paidAt || new Date()).toISOString(),
    nextPaymentDate: entry.nextPaymentDate,
    whopPaymentId: whopPaymentId || null,
    stripePaymentIntentId: stripePaymentIntentId || null,
    // 'saved_card' means the client was charged automatically and owes nothing;
    // 'checkout_link' means they paid a link themselves.
    chargeMode: entry.provider === 'stripe_card' ? 'saved_card' : 'checkout_link',
    source: source || 'unknown',
    description: entry.description || null,
    sentAt: new Date().toISOString(),
  };

  await axios.post(webhookUrl, payload, { timeout: 15000 });
  console.log(`[RecurringPayment] Confirmation webhook sent for id=${entry.id} (source=${source})`);
}

// ── Internal: send a payment-FAILED webhook ──
// reason: 'payment_declined' (Whop payment.failed) | 'overdue' (not paid by due
// date) | 'card_declined' (saved card refused the automatic charge) | 'no_card'
// (nothing saved to charge) | 'stripe_not_configured'
async function sendFailureNotification(prisma, entry, { reason, whopPaymentId, declineReason } = {}) {
  const settings = await prisma.platformSettings.findFirst();
  const webhookEnc = settings?.recurringPaymentWebhookUrl;
  const webhookUrl = webhookEnc ? decrypt(webhookEnc) : '';
  if (!webhookUrl) return; // silently skip if not configured

  let client = entry.user;
  if (!client) {
    client = await prisma.user.findUnique({
      where: { id: entry.userId },
      select: { id: true, name: true, email: true, phoneNumber: true, companyName: true },
    });
  }

  const payload = {
    type: 'recurring_payment_failed',
    reason: reason || 'unknown',
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
    nextPaymentDate: entry.nextPaymentDate,
    paymentLink: entry.lastCheckoutUrl || null,
    whopPaymentId: whopPaymentId || null,
    chargeMode: entry.provider === 'stripe_card' ? 'saved_card' : 'checkout_link',
    // What the bank said, so the message to the client can be specific.
    declineReason: declineReason || null,
    description: entry.description || null,
    sentAt: new Date().toISOString(),
  };

  await axios.post(webhookUrl, payload, { timeout: 15000 });
  console.log(`[RecurringPayment] Failure webhook sent for id=${entry.id} (reason=${reason})`);
}

// ── Internal: send a notification via webhook ──
async function sendNotification(prisma, entry) {
  if (entry.provider === 'stripe_card') return sendUpcomingChargeNotice(prisma, entry);

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

  // Lazy plan creation: if plan is missing (e.g. amount was updated and regen
  // failed at edit time), create one now so the webhook has a valid link.
  let whopPlanId = entry.whopPlanId;
  let whopProductId = entry.whopProductId;
  if (!whopPlanId) {
    try {
      if (!whopProductId) {
        const product = await whopService.createProduct(
          `Recurring - ${client?.name || client?.email || 'client'} - $${entry.amount}`,
          entry.description || `Recurring payment for ${client?.email || 'client'}`
        );
        whopProductId = product.id;
      }
      const plan = await whopService.createPlan(whopProductId, {
        price: entry.amount,
        billingCycle: 'lifetime',
        name: `Recurring $${entry.amount} - ${client?.email || 'client'}`,
      });
      whopPlanId = plan.id;
      await prisma.recurringPayment.update({
        where: { id: entry.id },
        data: { whopPlanId, whopProductId },
      });
      console.log(`[RecurringPayment] Lazy-created Whop plan ${whopPlanId} for id=${entry.id}`);
    } catch (err) {
      console.error(`[RecurringPayment] Lazy plan creation failed for id=${entry.id}:`, err.response?.data || err.message);
      throw new Error('Failed to create Whop plan for recurring payment');
    }
  }

  // Generate a fresh Whop checkout session for this cycle
  let checkoutUrl = null;
  let checkoutId = null;
  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await whopService.createCheckoutSession({
      planId: whopPlanId,
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

// ── Internal: heads-up before an automatic charge ──
// A saved-card entry gets no payment link: the client is told we are about to
// charge the card, and — when there is no card on file — that they need to add one.
async function sendUpcomingChargeNotice(prisma, entry) {
  const settings = await prisma.platformSettings.findFirst();
  const webhookEnc = settings?.recurringPaymentWebhookUrl;
  const webhookUrl = webhookEnc ? decrypt(webhookEnc) : '';
  if (!webhookUrl) {
    throw new Error('Recurring payment webhook URL not configured in Platform Settings');
  }

  const client = entry.user || await prisma.user.findUnique({
    where: { id: entry.userId },
    select: { id: true, name: true, email: true, phoneNumber: true, companyName: true },
  });
  // Read the card straight from the account: entry.user comes from the scheduler's
  // include, which selects contact fields only and would always look card-less.
  const account = await prisma.user.findUnique({
    where: { id: entry.userId },
    select: { stripePaymentMethodId: true, stripePaymentMethodIdBackup: true },
  });
  const hasCard = !!(account?.stripePaymentMethodId || account?.stripePaymentMethodIdBackup);

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
    // No link to pay: the card on file is charged on the due date.
    paymentLink: null,
    chargeMode: 'saved_card',
    hasCard,
    description: entry.description || null,
    sentAt: new Date().toISOString(),
  };

  await axios.post(webhookUrl, payload, { timeout: 15000 });

  await prisma.recurringPayment.update({
    where: { id: entry.id },
    data: { lastNotifiedAt: new Date(), lastNotifiedForDate: entry.nextPaymentDate },
  });

  console.log(`[RecurringPayment] Upcoming-charge notice sent for id=${entry.id} (card on file: ${hasCard})`);
  return { paymentLink: null, chargeMode: 'saved_card', hasCard, client };
}

// ── Internal: charge one saved-card entry now ──
// Tries the primary card and then the backup. Returns
// { charged, reason?, declineReason? }; never throws.
async function chargeSavedCard(prisma, entry) {
  const user = await prisma.user.findUnique({ where: { id: entry.userId } });
  if (!user) return { charged: false, reason: 'no_card' };

  const stripe = await getStripeConfigForUser(prisma, entry.userId);
  if (!stripe.isConfigured) {
    return { charged: false, reason: 'stripe_not_configured' };
  }

  const cards = getSavedCards(user, 'stripe');
  if (cards.length === 0) return { charged: false, reason: 'no_card' };

  // Stamp the attempt before charging: a crash mid-charge must not leave the
  // hourly scheduler retrying a card that may already have been charged.
  await prisma.recurringPayment.update({
    where: { id: entry.id },
    data: { lastChargeAttemptAt: new Date() },
  });

  let lastDecline = null;
  for (const card of cards) {
    try {
      const intent = await stripeService.chargeOffSession({
        customerId: await stripeService.ensureCustomer(prisma, user, stripe.secretKey),
        paymentMethodId: card.paymentMethodId,
        amount: entry.amount,
        description: entry.description || `Pago recurrente ${entry.periodLabel}`,
        receiptEmail: await require('../services/creditCheckout').resolveReceiptEmail(prisma, user),
        metadata: {
          userId: String(entry.userId),
          type: 'recurring_payment',
          recurringPaymentId: String(entry.id),
        },
      }, stripe.secretKey);

      if (intent.status === 'succeeded') {
        console.log(`[RecurringPayment] Charged $${entry.amount} on ${card.slot} card for id=${entry.id}`);
        return { charged: true, paymentIntentId: intent.id };
      }
      // Anything else (needs 3-D Secure, still processing) can't be treated as
      // paid — the client has to complete it themselves.
      lastDecline = `El cobro quedó en estado "${intent.status}" y necesita que el cliente lo confirme.`;
    } catch (err) {
      lastDecline = extractDeclineReason(err);
      console.error(`[RecurringPayment] ${card.slot} card declined for id=${entry.id}: ${lastDecline}`);
    }
  }

  return { charged: false, reason: 'card_declined', declineReason: lastDecline };
}

// Don't retry a declined card every hour — once a day is enough, and it keeps
// the client's bank from flagging us.
const CHARGE_RETRY_MS = 20 * 60 * 60 * 1000;

/**
 * Charge every saved-card entry whose due date has arrived. Runs inside the same
 * hourly scheduler pass, before the notification sweep, so a successful charge
 * advances the cycle instead of the entry being reported as overdue.
 */
async function chargeDueRecurringPayments(prisma) {
  const now = new Date();
  const due = await prisma.recurringPayment.findMany({
    where: { status: 'active', provider: 'stripe_card', nextPaymentDate: { lte: now } },
    include: { user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } } },
  });

  for (const entry of due) {
    try {
      if (entry.lastChargeAttemptAt && (now - new Date(entry.lastChargeAttemptAt)) < CHARGE_RETRY_MS) continue;

      const result = await chargeSavedCard(prisma, entry);
      if (result.charged) {
        await advanceToNextCycle(prisma, entry, { stripePaymentIntentId: result.paymentIntentId, source: 'stripe_card' });
        continue;
      }

      await prisma.recurringPayment.update({
        where: { id: entry.id },
        data: { lastChargeError: result.declineReason || result.reason },
      });

      // Tell the client once per cycle, not once per retry.
      const alreadyFlagged = entry.lastFailureNotifiedForDate &&
        new Date(entry.lastFailureNotifiedForDate).getTime() === new Date(entry.nextPaymentDate).getTime();
      if (!alreadyFlagged) {
        await sendFailureNotification(prisma, entry, { reason: result.reason, declineReason: result.declineReason });
        await prisma.recurringPayment.update({
          where: { id: entry.id },
          data: { lastFailureNotifiedForDate: entry.nextPaymentDate },
        });
      }
    } catch (err) {
      console.error(`[RecurringPayment] Charge pass failed for id=${entry.id}:`, err.message);
    }
  }
}

// ── POST /api/recurring-payments/:id/charge-now ──
// Owner-triggered immediate charge of the client's saved card.
const chargeNow = async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ error: 'Only OWNER can charge recurring payments' });
    const id = parseInt(req.params.id);
    const entry = await req.prisma.recurringPayment.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } } },
    });
    if (!entry) return res.status(404).json({ error: 'Not found' });
    if (entry.provider !== 'stripe_card') {
      return res.status(400).json({ error: 'This recurring payment is collected with a checkout link, not a saved card.' });
    }

    const result = await chargeSavedCard(req.prisma, entry);
    if (!result.charged) {
      await req.prisma.recurringPayment.update({
        where: { id },
        data: { lastChargeError: result.declineReason || result.reason },
      });
      return res.status(400).json({ error: result.declineReason || 'No se pudo cobrar la tarjeta guardada.', reason: result.reason });
    }

    const item = await advanceToNextCycle(req.prisma, entry, { stripePaymentIntentId: result.paymentIntentId, source: 'manual_charge' });
    res.json({ item, charged: true });
  } catch (err) {
    console.error('recurringPayment.chargeNow error:', err);
    res.status(500).json({ error: 'Failed to charge saved card' });
  }
};

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

    // Collect saved-card entries first: a charge that goes through advances the
    // cycle, so the sweep below never reports it as overdue.
    await chargeDueRecurringPayments(prisma).catch((err) => {
      console.error('[RecurringPayment] Charge sweep error:', err.message);
    });

    const active = await prisma.recurringPayment.findMany({
      where: { status: 'active' },
      include: { user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } } },
    });

    for (const entry of active) {
      try {
        // Overdue check: the due date passed without a payment. A successful
        // payment advances nextPaymentDate, so an active entry with a past
        // nextPaymentDate means this cycle went unpaid. Notify once per cycle.
        if (startOfDay(new Date(entry.nextPaymentDate)) < today) {
          // Saved-card entries are owned by the charge sweep above, which already
          // notifies with the real decline reason. Don't double-message them.
          if (entry.provider === 'stripe_card') continue;
          const alreadyFlagged = entry.lastFailureNotifiedForDate &&
            new Date(entry.lastFailureNotifiedForDate).getTime() === new Date(entry.nextPaymentDate).getTime();
          if (!alreadyFlagged) {
            await sendFailureNotification(prisma, entry, { reason: 'overdue' });
            await prisma.recurringPayment.update({
              where: { id: entry.id },
              data: { lastFailureNotifiedForDate: entry.nextPaymentDate },
            });
          }
          continue;
        }

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

// ── Whop webhook integration: called from whopController on payment.failed ──
// A declined card during a recurring checkout. Notifies the client; does NOT
// advance the cycle (the payment isn't due yet/again).
async function handleWhopPaymentFailedForRecurring(prisma, paymentData, metadata) {
  const include = { user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } } };

  let entry = null;
  const recurringPaymentId = metadata?.recurringPaymentId ? parseInt(metadata.recurringPaymentId) : null;
  if (recurringPaymentId) {
    entry = await prisma.recurringPayment.findUnique({ where: { id: recurringPaymentId }, include });
  }
  if (!entry) {
    const planId = paymentData.plan?.id || paymentData.membership?.plan_id;
    if (planId) {
      entry = await prisma.recurringPayment.findFirst({
        where: { whopPlanId: planId, status: 'active' },
        orderBy: { nextPaymentDate: 'asc' },
        include,
      });
    }
  }
  if (!entry) return false;

  await sendFailureNotification(prisma, entry, { reason: 'payment_declined', whopPaymentId: paymentData.id });
  return true;
}

module.exports = {
  list,
  create,
  update,
  remove,
  markPaid,
  fireNow,
  chargeNow,
  startScheduler,
  processDueNotifications,
  chargeDueRecurringPayments,
  handleWhopPaymentForRecurring,
  handleWhopPaymentFailedForRecurring,
};
