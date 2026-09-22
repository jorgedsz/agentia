// Building a credit checkout for one account, independent of who asked for it.
//
// The same two flows are needed from three places: the credits panel inside the
// app, the public payment page a client opens from a link or an embed, and any
// future surface. They must route the money identically — through the Stripe of
// the partner that governs the account, or through Whop — so the logic lives
// here and each caller only supplies its own return URLs.

const { getWhopConfigForUser, getAncestorPartners } = require('../utils/whopConfig');
const { getStripeConfigForUser } = require('../utils/stripeConfig');

const MANUAL_BILLING_MSG = 'Tu proveedor gestiona el saldo de tu cuenta. Contáctalo para recargar créditos.';

// Charges the platform makes on its own, as opposed to ones a person started.
const AUTOMATIC_KINDS = new Set(['auto_recharge', 'cycle_topup']);

/**
 * What a credit charge is called on the card statement, in the Stripe dashboard
 * and on the receipt — so a client can tell a top-up they asked for from one the
 * platform made for them.
 */
function creditsLabel(kind) {
  return AUTOMATIC_KINDS.has(kind) ? 'Auto-Recharge Credits' : 'Manual Purchase Credits';
}

/**
 * Why a person may not load credit right now, or null. Loading by hand while
 * the automation is about to charge (or already charging) the same card is how
 * one balance got two simultaneous charges: so it is refused while auto-recharge
 * is due or a top-up is still settling.
 */
async function manualTopUpBlocker(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const money = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;

  const inFlight = await Promise.resolve()
    .then(() => prisma.creditPurchase.findFirst({
      where: {
        userId,
        kind: { in: [...AUTOMATIC_KINDS] },
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    }))
    .catch(() => null);
  if (inFlight) {
    return `Hay una recarga automática de ${money(inFlight.amount)} en curso. Espera a que se confirme antes de cargar saldo.`;
  }

  const hasCard = !!(user.stripePaymentMethodId || user.whopPaymentMethodId);
  if (user.autoRechargeEnabled && !user.cycleBillingEnabled && hasCard
      && user.autoRechargeThreshold > 0 && user.vapiCredits < user.autoRechargeThreshold) {
    return `La auto-recarga está activa y tu saldo (${money(user.vapiCredits)}) está por debajo de ${money(user.autoRechargeThreshold)}: `
      + `se va a cargar sola por ${money(user.autoRechargeAmount)} en unos minutos. No hace falta cargar a mano.`;
  }

  if (user.cycleBillingEnabled && hasCard) {
    const plan = await require('./cycleBilling').planFor(prisma, user).catch(() => null);
    if (plan?.due) {
      return `El cobro por cortes está por cargar ${money(plan.chargeAmount)} automáticamente. No hace falta cargar a mano.`;
    }
  }

  return null;
}

/**
 * Where Stripe should send the receipt for this account's payments: the address
 * configured on the account, else the one configured on the nearest partner above
 * it, else the account's own email. Configured in the panel under Manage Billing.
 */
async function resolveReceiptEmail(prisma, user) {
  if (user.receiptEmail) return user.receiptEmail;
  const ancestors = await getAncestorPartners(prisma, user).catch(() => []);
  for (const a of ancestors) {
    const partner = await prisma.user.findUnique({ where: { id: a.id }, select: { receiptEmail: true } });
    if (partner?.receiptEmail) return partner.receiptEmail;
  }
  return user.email || null;
}

/** An error the caller should surface to the user, with an HTTP status. */
class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * The usage window a new payment will cover: from the end of the last settled
 * period (or that payment's date) up to now. Frozen on the purchase so the
 * report emailed afterwards accounts for exactly the amount charged, even if the
 * account keeps consuming while the client is on the checkout page.
 */
async function nextPeriodFor(prisma, userId) {
  let previous = null;
  try {
    previous = await prisma.creditPurchase.findFirst({
      where: { userId, status: 'completed' },
      orderBy: { id: 'desc' },
      select: { periodEnd: true, createdAt: true },
    });
  } catch (error) {
    // Never let working out the window block a payment; the report falls back to
    // the last 30 days.
    console.error('[Credits] Could not resolve the previous billing period:', error.message);
  }

  const end = new Date();
  const start = previous
    ? new Date(previous.periodEnd || previous.createdAt)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { periodStart: start, periodEnd: end };
}

/**
 * Start a credit purchase for `userId`.
 * Returns the Stripe shape ({ provider, checkoutUrl, purchaseId, amount }) or the
 * Whop shape ({ checkoutId, planId, purchaseUrl, amount }), matching what each
 * provider's front-end expects.
 */
async function createCreditCheckout(prisma, userId, amount, { successUrl, cancelUrl }) {
  const blocked = await manualTopUpBlocker(prisma, userId);
  if (blocked) throw new CheckoutError(blocked, 409);

  // Accounts under a partner billing through Stripe check out in that partner's
  // Stripe account; everyone else follows the Whop path below.
  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode === 'own_stripe') {
    if (!stripe.isConfigured) throw new CheckoutError('Payment processing is not configured');

    const stripeService = require('./stripeService');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const customerId = await stripeService.ensureCustomer(prisma, user, stripe.secretKey);

    // The pending row is created BEFORE the checkout so its id can ride along in
    // the session metadata - that id is how the webhook finds the buyer. Stripe
    // propagates metadata (Whop does not), so no one-time-plan trick is needed.
    const period = await nextPeriodFor(prisma, userId);
    const purchase = await prisma.creditPurchase.create({
      data: { userId, amount, credits: amount, status: 'pending', kind: 'manual', ...period },
    });

    const session = await stripeService.createPaymentCheckout({
      customerId,
      amount,
      productName: `${creditsLabel('manual')} ($${amount})`,
      description: `${creditsLabel('manual')} $${amount} · ${user.companyName || user.name || user.email}`,
      receiptEmail: await resolveReceiptEmail(prisma, user),
      metadata: {
        userId: String(userId),
        type: 'credits',
        purchaseId: String(purchase.id),
        credits: String(amount),
      },
      successUrl,
      cancelUrl,
      saveCard: true,
    }, stripe.secretKey);

    if (session.payment_intent) {
      await prisma.creditPurchase.update({
        where: { id: purchase.id },
        data: { stripePaymentIntentId: session.payment_intent },
      }).catch(() => {});
    }

    return { provider: 'stripe', checkoutUrl: session.url, purchaseId: purchase.id, amount };
  }

  // Route to the user's partner Whop (LM Consulting, etc.) when configured, so
  // the money lands in the partner's account; otherwise the platform's global Whop.
  const whop = await getWhopConfigForUser(prisma, userId);
  if (whop.mode === 'manual') throw new CheckoutError(MANUAL_BILLING_MSG, 403);
  if (!whop.isConfigured) throw new CheckoutError('Payment processing is not configured');

  const whopService = require('./whopService');

  // Resolve the "Credits" product for this billing account. Partners keep their
  // own credits product in their own Whop company (cached on the partner user);
  // the platform uses the shared Product row.
  let creditsProductId;
  if (whop.source === 'partner') {
    creditsProductId = whop.partner.whopCreditsProductId;
    if (!creditsProductId) {
      const whopProduct = await whopService.createProduct('Credits', 'VAPI call credits', whop.config);
      creditsProductId = whopProduct.id;
      await prisma.user.update({
        where: { id: whop.partner.id },
        data: { whopCreditsProductId: creditsProductId },
      });
    }
  } else {
    let creditsProduct = await prisma.product.findUnique({ where: { slug: 'credits' } });
    if (!creditsProduct) {
      creditsProduct = await prisma.product.create({
        data: { name: 'Credits', slug: 'credits', description: 'VAPI call credits', isActive: true, sortOrder: 999 },
      });
    }
    if (!creditsProduct.whopProductId) {
      const whopProduct = await whopService.createProduct('Credits', 'VAPI call credits', whop.config);
      creditsProduct = await prisma.product.update({
        where: { id: creditsProduct.id },
        data: { whopProductId: whopProduct.id },
      });
    }
    creditsProductId = creditsProduct.whopProductId;
  }

  // Create a one-time Whop plan for this exact amount, then the checkout.
  const plan = await whopService.createPlan(creditsProductId, {
    price: amount,
    billingCycle: 'lifetime',
    name: `${creditsLabel('manual')} ($${amount})`,
  }, whop.config);

  const session = await whopService.createCheckoutSession({
    planId: plan.id,
    metadata: { userId: String(userId), type: 'credits', credits: String(amount) },
    redirectUrl: successUrl,
  }, whop.config);

  // Record a PENDING purchase keyed by the unique one-time plan id. This is the
  // reliable link back to the buyer: Whop doesn't propagate checkout metadata to
  // webhooks and the payer's email may differ from their app account, but the
  // plan id we just created always appears in the payment webhook as data.plan.id.
  await prisma.creditPurchase.create({
    data: { userId, amount, credits: amount, status: 'pending', whopPlanId: plan.id, ...(await nextPeriodFor(prisma, userId)) },
  }).catch((err) => console.error('[Credits] Failed to create pending purchase:', err.message));

  return { checkoutId: session.id, planId: plan.id, purchaseUrl: session.purchase_url, amount };
}

/**
 * Start a card-vaulting checkout for `userId` (no charge).
 * Returns { provider: 'stripe', checkoutUrl } or { sessionId, purchaseUrl }.
 */
async function createCardSetupCheckout(prisma, userId, slot, { successUrl, cancelUrl }) {
  const requestedSlot = slot === 'backup' ? 'backup' : 'primary';

  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode === 'own_stripe') {
    if (!stripe.isConfigured) throw new CheckoutError('Payment processing is not configured');
    const stripeService = require('./stripeService');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    const customerId = await stripeService.ensureCustomer(prisma, user, stripe.secretKey);
    const session = await stripeService.createSetupCheckout({
      customerId,
      metadata: { userId: String(userId), type: 'setup', slot: requestedSlot },
      successUrl,
      cancelUrl,
    }, stripe.secretKey);
    return { provider: 'stripe', checkoutUrl: session.url };
  }

  const whop = await getWhopConfigForUser(prisma, userId);
  if (whop.mode === 'manual') throw new CheckoutError(MANUAL_BILLING_MSG, 403);
  if (!whop.isConfigured) throw new CheckoutError('Payment processing is not configured');

  const whopService = require('./whopService');
  const session = await whopService.createSetupCheckout({
    metadata: { userId: String(userId), type: 'setup', slot: requestedSlot },
    redirectUrl: successUrl,
  }, whop.config);
  return { sessionId: session.id, purchaseUrl: session.purchase_url };
}

/**
 * Confirm a Stripe checkout from the return redirect, without waiting for the
 * webhook. The session id in the URL is only a pointer: the session is fetched
 * from Stripe with the partner's own key, and must belong to this account and be
 * paid. Settling is idempotent, so the webhook arriving before or after this
 * never credits twice.
 * Returns { paid, credited, alreadySettled }.
 */
async function confirmStripeCheckout(prisma, userId, sessionId) {
  if (!/^cs_(test|live)_/.test(sessionId || '')) throw new CheckoutError('Invalid checkout session');

  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode !== 'own_stripe' || !stripe.isConfigured) {
    throw new CheckoutError('Stripe is not configured for this account');
  }

  const stripeService = require('./stripeService');
  const session = await stripeService.getCheckoutSession(sessionId, stripe.secretKey);
  const meta = session.metadata || {};
  if (meta.userId !== String(userId) || meta.type !== 'credits') {
    throw new CheckoutError('This payment does not belong to this account', 403);
  }
  if (session.payment_status !== 'paid') return { paid: false, credited: false, alreadySettled: false };

  const purchase = await prisma.creditPurchase.findUnique({ where: { id: parseInt(meta.purchaseId) } });
  if (!purchase || purchase.userId !== userId) throw new CheckoutError('Purchase not found', 404);

  const { settleCreditPurchase } = require('../utils/creditSettlement');
  const credited = await settleCreditPurchase(prisma, purchase, {
    paymentIntentId: session.payment_intent || undefined,
    payload: session,
  });
  return { paid: true, credited, alreadySettled: !credited };
}

/**
 * Credit a payment Stripe collected but the app never recorded — typically one
 * whose webhook failed to deliver. The PaymentIntent is read from the account's
 * Stripe, must have succeeded and belong to the account, and must carry the
 * purchase it paid for. Idempotent: an already-credited payment is left alone.
 * Returns { credited, alreadySettled, amount }.
 */
async function reconcileStripePayment(prisma, userId, paymentIntentId) {
  if (!/^pi_/.test(paymentIntentId || '')) throw new CheckoutError('That is not a Stripe payment id (pi_...)');

  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode !== 'own_stripe' || !stripe.isConfigured) {
    throw new CheckoutError('Stripe is not configured for this account');
  }

  const stripeService = require('./stripeService');
  const intent = await stripeService.getPaymentIntent(paymentIntentId, stripe.secretKey);
  const meta = intent.metadata || {};
  if (meta.userId !== String(userId)) {
    throw new CheckoutError('This payment does not belong to this account', 403);
  }
  if (intent.status !== 'succeeded') {
    throw new CheckoutError(`The payment has not completed (status: ${intent.status})`);
  }
  if (!meta.purchaseId) {
    throw new CheckoutError('This payment was not a credit purchase made through the app, so there is nothing to credit');
  }

  const purchase = await prisma.creditPurchase.findUnique({ where: { id: parseInt(meta.purchaseId) } });
  if (!purchase || purchase.userId !== userId) throw new CheckoutError('Purchase not found', 404);

  const { settleCreditPurchase } = require('../utils/creditSettlement');
  const credited = await settleCreditPurchase(prisma, purchase, { paymentIntentId: intent.id, payload: intent });
  return { credited, alreadySettled: !credited, amount: purchase.credits };
}

module.exports = {
  CheckoutError,
  MANUAL_BILLING_MSG,
  creditsLabel,
  manualTopUpBlocker,
  resolveReceiptEmail,
  nextPeriodFor,
  createCreditCheckout,
  createCardSetupCheckout,
  confirmStripeCheckout,
  reconcileStripePayment,
};
