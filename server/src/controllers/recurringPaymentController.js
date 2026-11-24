const axios = require('axios');
const stripeService = require('../services/stripeService');
const { decrypt } = require('../utils/encryption');
const { getEffectiveBilling, cardProviderFor } = require('../utils/billingMode');
const azulPagos = require('../services/azulPagos');
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

// Entries are collected by charging the client's saved Stripe card. Rows made
// before the checkout-link provider was removed (2026-11) carry provider 'whop';
// they are still listed so the history stays visible, but
// nothing is ever sent or charged for them again.
const CARD_PROVIDERS = ['stripe_card', 'azul_card'];

function isLegacyEntry(entry) {
  return !CARD_PROVIDERS.includes(entry.provider);
}

// Log each skipped legacy entry once per process, not on every hourly pass.
const loggedLegacy = new Set();
function skipLegacy(entry) {
  if (!loggedLegacy.has(entry.id)) {
    loggedLegacy.add(entry.id);
    console.warn(`[RecurringPayment] id=${entry.id} uses the removed provider "${entry.provider}"; skipping it (charge it by hand or recreate it).`);
  }
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

    // Recurring payments are charged on the client's saved card each cycle: in the
    // Stripe of the partner that governs it, or on AZUL for platform clients.
    // Manual clients have no card payment, so there is nothing to collect with.
    const billing = await getEffectiveBilling(req.prisma, client.id).catch(() => ({ mode: 'platform' }));
    const cardProvider = cardProviderFor(billing.mode);
    if (!cardProvider) {
      return res.status(400).json({ error: 'This client has no card payment (its balance is topped up by hand), so a recurring payment cannot be collected from it.' });
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
        // Always explicit: the column still defaults to the removed provider.
        provider: cardProvider === 'azul' ? 'azul_card' : 'stripe_card',
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

    // A saved-card entry has no plan to regenerate: a new amount is simply what
    // the next automatic charge takes from the card.
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

    const item = await advanceToNextCycle(req.prisma, existing, { source: 'manual' });
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
    if (isLegacyEntry(existing)) {
      return res.status(400).json({ error: 'This recurring payment was paid through a provider that no longer exists. Recreate it to collect from the client\'s card.' });
    }

    const result = await sendNotification(req.prisma, existing);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('recurringPayment.fireNow error:', err);
    res.status(500).json({ error: err.message || 'Failed to send notification' });
  }
};

// ── Internal: advance to next cycle after payment ──
async function advanceToNextCycle(prisma, entry, { stripePaymentIntentId, source }) {
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
  sendConfirmation(prisma, updated, { stripePaymentIntentId, source, paidAt: now }).catch((err) => {
    console.error(`[RecurringPayment] Confirmation webhook failed for id=${entry.id}:`, err.message);
  });

  return updated;
}

// ── Internal: send a payment-confirmed webhook ──
async function sendConfirmation(prisma, entry, { stripePaymentIntentId, source, paidAt }) {
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
    stripePaymentIntentId: stripePaymentIntentId || null,
    // 'saved_card' means the client was charged automatically and owes nothing;
    // 'checkout_link' means they paid a link themselves.
    chargeMode: CARD_PROVIDERS.includes(entry.provider) ? 'saved_card' : 'checkout_link',
    source: source || 'unknown',
    description: entry.description || null,
    sentAt: new Date().toISOString(),
  };

  await axios.post(webhookUrl, payload, { timeout: 15000 });
  console.log(`[RecurringPayment] Confirmation webhook sent for id=${entry.id} (source=${source})`);
}

// ── Internal: send a payment-FAILED webhook ──
// reason: 'card_declined' (saved card refused the automatic charge) | 'no_card'
// (nothing saved to charge) | 'stripe_not_configured'
async function sendFailureNotification(prisma, entry, { reason, declineReason } = {}) {
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
    chargeMode: CARD_PROVIDERS.includes(entry.provider) ? 'saved_card' : 'checkout_link',
    // What the bank said, so the message to the client can be specific.
    declineReason: declineReason || null,
    description: entry.description || null,
    sentAt: new Date().toISOString(),
  };

  await axios.post(webhookUrl, payload, { timeout: 15000 });
  console.log(`[RecurringPayment] Failure webhook sent for id=${entry.id} (reason=${reason})`);
}

// ── Internal: send a notification via webhook ──
// Only saved-card entries are notified; a legacy entry has no way to be paid.
async function sendNotification(prisma, entry) {
  if (isLegacyEntry(entry)) {
    skipLegacy(entry);
    return { skipped: true, reason: 'legacy_provider' };
  }
  return sendUpcomingChargeNotice(prisma, entry);
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
    select: { stripePaymentMethodId: true, stripePaymentMethodIdBackup: true, azulTarjetaId: true, azulTarjetaIdBackup: true },
  });
  const hasCard = getSavedCards(account, entry.provider === 'azul_card' ? 'azul' : 'stripe').length > 0;

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
async function chargeSavedCard(prisma, entry, deps = {}) {
  const user = await prisma.user.findUnique({ where: { id: entry.userId } });
  if (!user) return { charged: false, reason: 'no_card' };
  if (entry.provider === 'azul_card') return chargeSavedAzulCard(prisma, entry, user, deps.azul || azulPagos.cliente());

  const stripe = await getStripeConfigForUser(prisma, entry.userId);
  if (!stripe.isConfigured) {
    return { charged: false, reason: 'stripe_not_configured' };
  }

  const cards = getSavedCards(user);
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

// The AZUL version of chargeSavedCard. One idempotency key per entry, cycle and
// card: a retry within the same cycle can never charge the client twice.
async function chargeSavedAzulCard(prisma, entry, user, azul) {
  if (!azul.habilitado) return { charged: false, reason: 'azul_not_configured' };
  const cards = getSavedCards(user, 'azul');
  if (cards.length === 0) return { charged: false, reason: 'no_card' };

  await prisma.recurringPayment.update({
    where: { id: entry.id },
    data: { lastChargeAttemptAt: new Date() },
  });

  const cycle = new Date(entry.nextPaymentDate).toISOString().slice(0, 10);
  let lastDecline = null;
  for (const card of cards) {
    try {
      const orden = await azul.cobrarTarjeta({
        tarjetaId: card.paymentMethodId,
        monto: entry.amount,
        referencia: `NEBO-RP-${entry.id}`,
        descripcion: entry.description || `Pago recurrente ${entry.periodLabel}`,
        idempotencia: `nebo-rp-${entry.id}-${cycle}${card.slot === 'backup' ? '-b' : ''}`,
      });
      if (orden.estado === 'aprobada') {
        console.log(`[RecurringPayment] Charged $${entry.amount} on ${card.slot} AZUL card for id=${entry.id}`);
        return { charged: true, paymentIntentId: orden.id };
      }
      lastDecline = orden.estado === 'por-verificar'
        ? 'AZUL no confirmó el cobro; revísalo en el portal de AZUL antes de volver a cobrar.'
        : (orden.error || 'La tarjeta fue declinada.');
      // An unconfirmed charge may have gone through: never try the backup on top of it.
      if (orden.estado === 'por-verificar') break;
    } catch (err) {
      lastDecline = err.message;
      console.error(`[RecurringPayment] ${card.slot} AZUL card failed for id=${entry.id}: ${lastDecline}`);
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
    where: { status: 'active', provider: { in: CARD_PROVIDERS }, nextPaymentDate: { lte: now } },
    include: { user: { select: { id: true, name: true, email: true, phoneNumber: true, companyName: true } } },
  });

  for (const entry of due) {
    try {
      if (entry.lastChargeAttemptAt && (now - new Date(entry.lastChargeAttemptAt)) < CHARGE_RETRY_MS) continue;

      const result = await chargeSavedCard(prisma, entry);
      if (result.charged) {
        await advanceToNextCycle(prisma, entry, { stripePaymentIntentId: result.paymentIntentId, source: entry.provider });
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
    if (isLegacyEntry(entry)) {
      return res.status(400).json({ error: 'This recurring payment was paid through a provider that no longer exists, not a saved card.' });
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
        // A legacy entry can no longer be paid or charged: skip it entirely
        // instead of telling the client every cycle that it is overdue.
        if (isLegacyEntry(entry)) {
          skipLegacy(entry);
          continue;
        }

        // Past due: saved-card entries are owned by the charge sweep above,
        // which already notifies with the real decline reason. Don't
        // double-message them.
        if (startOfDay(new Date(entry.nextPaymentDate)) < today) continue;

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
  chargeSavedCard,
};
