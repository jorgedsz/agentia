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

  const wh = new Webhook(secret);
  // standardwebhooks verify expects raw body string and headers object
  const payload = wh.verify(rawBody, headers);
  return payload;
}

module.exports = {
  createProduct,
  createPlan,
  createCheckoutSession,
  getMembership,
  cancelMembership,
  verifyWebhook,
  BILLING_PERIOD_DAYS,
};
