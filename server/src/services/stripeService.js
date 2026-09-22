const Stripe = require('stripe');

// Per-partner Stripe credentials. Unlike Whop, there is no platform-wide Stripe
// account: Stripe is only ever used by a partner that configured its own keys
// (billingMode = "own_stripe"), so every call here takes that partner's secret
// key. Clients are cached per key so we don't rebuild one on every request.
const clients = new Map();

function client(secretKey) {
  if (!secretKey) throw new Error('Stripe secret key is not configured');
  let c = clients.get(secretKey);
  if (!c) {
    c = new Stripe(secretKey, { apiVersion: '2024-06-20', maxNetworkRetries: 2 });
    clients.set(secretKey, c);
  }
  return c;
}

// Stripe works in the smallest currency unit (cents for USD).
function toCents(amount) {
  return Math.round(parseFloat(amount) * 100);
}
function fromCents(cents) {
  return Math.round(cents) / 100;
}

// ── Customers ──

// Every paying account gets one customer in the partner's Stripe. The id is
// stored on the account (stripeCustomerId) so saved cards, checkouts and
// off-session charges all attach to the same customer.
async function ensureCustomer(prisma, user, secretKey) {
  if (user.stripeCustomerId) return user.stripeCustomerId;

  const customer = await client(secretKey).customers.create({
    email: user.email || undefined,
    name: user.name || user.companyName || undefined,
    metadata: { userId: String(user.id) },
  });

  await prisma.user.update({ where: { id: user.id }, data: { stripeCustomerId: customer.id } });
  return customer.id;
}

// ── Checkout: one-time payment (credits, lifetime products) ──

async function createPaymentCheckout({ customerId, amount, productName, description, metadata, successUrl, cancelUrl, saveCard, receiptEmail }, secretKey) {
  return client(secretKey).checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: toCents(amount),
        product_data: { name: productName },
      },
    }],
    metadata: metadata || {},
    payment_intent_data: {
      // Vault the card from this purchase so auto-recharge can reuse it later.
      ...(saveCard ? { setup_future_usage: 'off_session' } : {}),
      // Without a description the Stripe dashboard lists the payment by its
      // raw pi_... id, which tells whoever reconciles it nothing.
      ...(description ? { description } : {}),
      // Stripe emails its own receipt to this address once the payment succeeds.
      ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
      // Metadata on the PaymentIntent too: the payment_intent.succeeded webhook
      // reads it without having to look the session up.
      metadata: metadata || {},
    },
    success_url: withSessionId(successUrl),
    cancel_url: cancelUrl,
  });
}

// Stripe substitutes the literal {CHECKOUT_SESSION_ID} on redirect. Carrying the
// session id back lets the return page confirm the payment itself instead of
// depending entirely on the webhook arriving.
function withSessionId(url) {
  if (!url || url.includes('{CHECKOUT_SESSION_ID}')) return url;
  return `${url}${url.includes('?') ? '&' : '?'}session_id={CHECKOUT_SESSION_ID}`;
}

async function getCheckoutSession(sessionId, secretKey) {
  return client(secretKey).checkout.sessions.retrieve(sessionId);
}

// ── Checkout: recurring subscription (monthly/quarterly/annual products) ──

const INTERVALS = {
  monthly: { interval: 'month', interval_count: 1 },
  quarterly: { interval: 'month', interval_count: 3 },
  annual: { interval: 'year', interval_count: 1 },
};

async function createSubscriptionCheckout({ customerId, amount, billingCycle, productName, metadata, successUrl, cancelUrl }, secretKey) {
  const recurring = INTERVALS[billingCycle];
  if (!recurring) throw new Error(`Unsupported billing cycle for Stripe subscription: ${billingCycle}`);

  return client(secretKey).checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: toCents(amount),
        recurring,
        product_data: { name: productName },
      },
    }],
    metadata: metadata || {},
    subscription_data: { metadata: metadata || {} },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

// ── Checkout: save a card without charging ──

async function createSetupCheckout({ customerId, metadata, successUrl, cancelUrl }, secretKey) {
  return client(secretKey).checkout.sessions.create({
    mode: 'setup',
    customer: customerId,
    payment_method_types: ['card'],
    metadata: metadata || {},
    setup_intent_data: { metadata: metadata || {} },
    success_url: successUrl,
    cancel_url: cancelUrl,
  });
}

// ── Off-session charge (auto-recharge / 1-click recharge) ──

// Charges a saved card with the customer absent. Unlike Whop, Stripe settles
// synchronously here: a returned status of "succeeded" means the money is in.
// A card that needs 3-D Secure raises authentication_required, which surfaces as
// a decline — the customer then has to pay through a hosted checkout instead.
async function chargeOffSession({ customerId, paymentMethodId, amount, description, metadata, receiptEmail, idempotencyKey }, secretKey) {
  return client(secretKey).paymentIntents.create({
    amount: toCents(amount),
    currency: 'usd',
    customer: customerId,
    payment_method: paymentMethodId,
    off_session: true,
    confirm: true,
    description: description || undefined,
    // An automatic charge is the one the customer least expects, so the receipt
    // matters most here.
    receipt_email: receiptEmail || undefined,
    metadata: metadata || {},
  }, idempotencyKey ? { idempotencyKey } : undefined);
}

// ── Payment methods ──

async function detachPaymentMethod(paymentMethodId, secretKey) {
  return client(secretKey).paymentMethods.detach(paymentMethodId);
}

async function getSetupIntent(setupIntentId, secretKey) {
  return client(secretKey).setupIntents.retrieve(setupIntentId);
}

async function getPaymentIntent(paymentIntentId, secretKey) {
  return client(secretKey).paymentIntents.retrieve(paymentIntentId);
}

async function cancelSubscription(subscriptionId, secretKey, { immediately = false } = {}) {
  const c = client(secretKey);
  return immediately
    ? c.subscriptions.cancel(subscriptionId)
    : c.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
}

// ── Webhooks ──

// Verifies the Stripe-Signature header against the partner's signing secret and
// returns the parsed event. Throws when the signature doesn't match, so an
// unverified payload can never reach the handlers.
let verifier = null;
function constructEvent(rawBody, signatureHeader, webhookSecret) {
  if (!webhookSecret) throw new Error('Stripe webhook secret is not configured');
  // Signature checking is local crypto and never calls the API, so this client
  // needs no real key - the partner's signing secret is what does the work.
  if (!verifier) verifier = new Stripe('sk_signature_verification_only');
  return verifier.webhooks.constructEvent(rawBody, signatureHeader, webhookSecret);
}

// Quick credential check for the admin UI: confirms the key works and reports
// whether it is a live or test key.
async function verifyCredentials(secretKey) {
  const account = await client(secretKey).accounts.retrieve();
  return {
    accountId: account.id,
    businessName: account.business_profile?.name || account.settings?.dashboard?.display_name || null,
    chargesEnabled: !!account.charges_enabled,
    livemode: !secretKey.startsWith('sk_test_'),
  };
}

module.exports = {
  toCents,
  fromCents,
  ensureCustomer,
  createPaymentCheckout,
  createSubscriptionCheckout,
  createSetupCheckout,
  chargeOffSession,
  detachPaymentMethod,
  getSetupIntent,
  getPaymentIntent,
  getCheckoutSession,
  withSessionId,
  cancelSubscription,
  constructEvent,
  verifyCredentials,
};
