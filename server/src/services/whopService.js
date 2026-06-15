const axios = require('axios');
const { Webhook } = require('standardwebhooks');

const WHOP_API_BASE = 'https://api.whop.com/api/v1';

function getHeaders() {
  return {
    Authorization: `Bearer ${process.env.WHOP_API_KEY}`,
    'Content-Type': 'application/json',
  };
}

// ── Products ──

async function createProduct(name, description) {
  const { data } = await axios.post(`${WHOP_API_BASE}/products`, {
    company_id: process.env.WHOP_COMPANY_ID,
    title: name,
    description: description || undefined,
    visibility: 'hidden', // managed internally, not on Whop storefront
  }, { headers: getHeaders() });
  return data;
}

// ── Plans ──

const BILLING_PERIOD_DAYS = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

async function createPlan(whopProductId, { price, billingCycle, name }) {
  const isLifetime = billingCycle === 'lifetime';
  const body = {
    company_id: process.env.WHOP_COMPANY_ID,
    product_id: whopProductId,
    initial_price: price,
    renewal_price: isLifetime ? undefined : price,
    billing_period: isLifetime ? undefined : BILLING_PERIOD_DAYS[billingCycle],
    plan_type: isLifetime ? 'one_time' : 'renewal',
  };

  const { data } = await axios.post(`${WHOP_API_BASE}/plans`, body, { headers: getHeaders() });
  return data;
}

// ── Checkout Sessions ──

async function createCheckoutSession({ planId, metadata, redirectUrl }) {
  const body = {
    plan_id: planId,
    metadata: metadata || {},
    redirect_url: redirectUrl || undefined,
  };

  const { data } = await axios.post(`${WHOP_API_BASE}/checkout_configurations`, body, { headers: getHeaders() });
  return data;
}

// ── Setup checkout (vault a card without charging) ──

// Creates a checkout configuration in "setup" mode. The customer enters their
// card once (no charge); on completion Whop fires `setup_intent.succeeded` with
// the saved payment_method.id and member.id, which we store for off-session
// charges. Returns the configuration ({ id, purchase_url, ... }); id is passed
// to the WhopCheckoutEmbed as `sessionId`.
async function createSetupCheckout({ metadata, redirectUrl }) {
  const body = {
    company_id: process.env.WHOP_COMPANY_ID,
    mode: 'setup',
    metadata: metadata || {},
    redirect_url: redirectUrl || undefined,
  };

  const { data } = await axios.post(`${WHOP_API_BASE}/checkout_configurations`, body, { headers: getHeaders() });
  return data;
}

// ── Off-session charge (auto-recharge / manual 1-click) ──

// Charges a previously-saved payment method without the customer present. Whop
// returns a payment object immediately (status "processing") and settles
// asynchronously — success/failure arrives via the payment.succeeded /
// payment.failed webhooks. An inline one-time plan keeps each charge keyed by a
// unique plan id, so the existing webhook attribution (CreditPurchase pending
// row → vapiCredits increment) works unchanged.
async function chargeOffSession({ memberId, paymentMethodId, amount, metadata }) {
  const body = {
    company_id: process.env.WHOP_COMPANY_ID,
    member_id: memberId,
    payment_method_id: paymentMethodId,
    plan: {
      initial_price: amount,
      currency: 'usd',
      plan_type: 'one_time',
    },
    metadata: metadata || {},
  };

  const { data } = await axios.post(`${WHOP_API_BASE}/payments`, body, { headers: getHeaders() });
  return data;
}

// ── Memberships ──

async function getMembership(membershipId) {
  const { data } = await axios.get(`${WHOP_API_BASE}/memberships/${membershipId}`, { headers: getHeaders() });
  return data;
}

async function cancelMembership(membershipId, mode = 'at_period_end') {
  const { data } = await axios.post(`${WHOP_API_BASE}/memberships/${membershipId}/cancel`, {
    cancellation_mode: mode,
  }, { headers: getHeaders() });
  return data;
}

// ── Webhook Verification ──

function verifyWebhook(rawBody, headers) {
  const secret = process.env.WHOP_WEBHOOK_SECRET;
  if (!secret) throw new Error('WHOP_WEBHOOK_SECRET is not configured');

  // Whop's webhook secret is a raw "ws_..." string. The standardwebhooks lib
  // expects a base64-encoded key (it base64-decodes it back to the raw HMAC key
  // bytes). Passing "ws_..." directly throws "Base64Coder: incorrect characters
  // for decoding". Whop's own SDK base64-encodes it first (webhookKey: btoa(secret)),
  // so we match that. If a secret is already in whsec_<base64> form, use it as-is.
  const key = secret.startsWith('whsec_') ? secret : Buffer.from(secret, 'utf8').toString('base64');

  const wh = new Webhook(key);
  // standardwebhooks verify expects raw body string and headers object
  const payload = wh.verify(rawBody, headers);
  return payload;
}

module.exports = {
  createProduct,
  createPlan,
  createCheckoutSession,
  createSetupCheckout,
  chargeOffSession,
  getMembership,
  cancelMembership,
  verifyWebhook,
  BILLING_PERIOD_DAYS,
};
