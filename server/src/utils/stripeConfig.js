// Resolve which partner's Stripe account a user's payments belong to.
//
// Stripe is always partner-owned: a partner (e.g. LM Consulting Group) set to
// billingMode "own_stripe" collects with its own keys, and its ENTIRE subtree —
// its agencies and their clients — pays into that same Stripe account. There is
// no platform-wide Stripe fallback; accounts outside such a subtree keep using
// Whop. The inheritance itself lives in whopConfig.getEffectiveBilling.

const { decrypt } = require('./encryption');
const { getEffectiveBilling } = require('./whopConfig');

/**
 * Stripe credentials that govern this user, or isConfigured:false when Stripe
 * does not apply (or the partner hasn't finished entering its keys).
 * Returns { mode, partner, secretKey, publishableKey, isConfigured }.
 */
async function getStripeConfigForUser(prisma, userId) {
  const { mode, partner } = await getEffectiveBilling(prisma, userId)
    .catch(() => ({ mode: 'platform', partner: null }));

  if (mode !== 'own_stripe' || !partner) {
    return { mode, partner: null, secretKey: null, publishableKey: null, isConfigured: false };
  }

  let secretKey = null;
  try {
    secretKey = decrypt(partner.stripeSecretKey);
  } catch (error) {
    // A key that can't be decrypted (rotated ENCRYPTION_KEY, corrupt row) must
    // read as "not configured" rather than crash the payment flow.
    console.error(`[stripeConfig] Could not decrypt Stripe key for partner ${partner.id}:`, error.message);
  }

  return {
    mode,
    partner,
    secretKey,
    publishableKey: partner.stripePublishableKey || null,
    isConfigured: !!secretKey,
  };
}

/** True when this user pays through a partner's Stripe. */
async function isStripeBilled(prisma, userId) {
  const { mode } = await getEffectiveBilling(prisma, userId).catch(() => ({ mode: 'platform' }));
  return mode === 'own_stripe';
}

/**
 * Resolve the partner + decrypted signing secret for an incoming webhook,
 * addressed by the per-partner token in the URL (/api/stripe/webhook/:token).
 */
async function getPartnerByStripeWebhookToken(prisma, token) {
  if (!token) return null;
  const partner = await prisma.user.findFirst({
    where: { stripeWebhookToken: token },
    select: { id: true, stripeSecretKey: true, stripeWebhookSecret: true },
  });
  if (!partner || !partner.stripeWebhookSecret) return null;
  try {
    return {
      partner,
      webhookSecret: decrypt(partner.stripeWebhookSecret),
      secretKey: decrypt(partner.stripeSecretKey),
    };
  } catch (error) {
    console.error(`[stripeConfig] Could not decrypt webhook config for partner ${partner.id}:`, error.message);
    return null;
  }
}

module.exports = {
  getStripeConfigForUser,
  isStripeBilled,
  getPartnerByStripeWebhookToken,
};
