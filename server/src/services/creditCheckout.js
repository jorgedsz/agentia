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
 * Start a credit purchase for `userId`.
 * Returns the Stripe shape ({ provider, checkoutUrl, purchaseId, amount }) or the
 * Whop shape ({ checkoutId, planId, purchaseUrl, amount }), matching what each
 * provider's front-end expects.
 */
async function createCreditCheckout(prisma, userId, amount, { successUrl, cancelUrl }) {
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
    const purchase = await prisma.creditPurchase.create({
      data: { userId, amount, credits: amount, status: 'pending', kind: 'manual' },
    });

    const session = await stripeService.createPaymentCheckout({
      customerId,
      amount,
      productName: `Credits ($${amount})`,
      description: `Créditos $${amount} · ${user.companyName || user.name || user.email}`,
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
    name: `Credits ($${amount})`,
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
    data: { userId, amount, credits: amount, status: 'pending', whopPlanId: plan.id },
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
  resolveReceiptEmail,
  createCreditCheckout,
  createCardSetupCheckout,
  confirmStripeCheckout,
  reconcileStripePayment,
};
