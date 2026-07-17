// Resolve which Whop account a user's credit purchases / auto-recharge should be
// created in. A WHITELABEL partner (e.g. LM Consulting) with its own Whop
// configured collects the money directly; every account under that partner
// (its agencies and their clients) routes to the same partner Whop. Accounts
// with no configured partner fall back to the platform's global Whop (env vars).

const { decrypt } = require('./encryption');
const crypto = require('crypto');

const PARTNER_SELECT = {
  id: true, role: true, whitelabelId: true, agencyId: true, billingMode: true,
  whopApiKey: true, whopCompanyId: true, whopWebhookSecret: true,
  whopCreditsProductId: true, whopWebhookToken: true,
};

/**
 * Resolve the billing mode that governs a user, by walking up the ownership chain
 * (self → agency → whitelabel). The nearest ancestor whose billingMode is
 * 'own_whop' or 'manual' governs; if none set one, the mode is 'platform'.
 * Returns { mode, partner } where partner is the governing agency/whitelabel row
 * (null for platform).
 */
async function getEffectiveBilling(prisma, userId) {
  let current = await prisma.user.findUnique({ where: { id: userId }, select: PARTNER_SELECT });
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.billingMode === 'own_whop' || current.billingMode === 'manual') {
      return { mode: current.billingMode, partner: current };
    }
    const parentId = current.agencyId || current.whitelabelId;
    if (!parentId) break;
    current = await prisma.user.findUnique({ where: { id: parentId }, select: PARTNER_SELECT });
  }
  return { mode: 'platform', partner: null };
}

/**
 * The partner whose OWN Whop should collect this user's payments, or null when the
 * user is on the platform Whop or on manual billing.
 */
async function resolveWhopPartner(prisma, userId) {
  const { mode, partner } = await getEffectiveBilling(prisma, userId);
  if (mode === 'own_whop' && partner?.whopApiKey && partner?.whopCompanyId) return partner;
  return null;
}

/**
 * Usable Whop config for a user's credit/auto-recharge flows.
 * Returns { apiKey, companyId, config, partner, source, isConfigured, mode }.
 * `config` is what you pass to whopService ({ apiKey, companyId }); `mode` is the
 * effective billing mode ('platform' | 'own_whop' | 'manual').
 */
async function getWhopConfigForUser(prisma, userId) {
  const { mode, partner } = await getEffectiveBilling(prisma, userId).catch(() => ({ mode: 'platform', partner: null }));

  // Manual billing: no self-service Whop purchases at all.
  if (mode === 'manual') {
    return { apiKey: null, companyId: null, config: undefined, partner, source: 'manual', isConfigured: false, mode };
  }

  // Own Whop: route to the partner's company (if they've entered their creds).
  if (mode === 'own_whop' && partner?.whopApiKey && partner?.whopCompanyId) {
    const apiKey = decrypt(partner.whopApiKey);
    return {
      apiKey, companyId: partner.whopCompanyId,
      config: { apiKey, companyId: partner.whopCompanyId },
      partner, source: 'partner', isConfigured: !!apiKey && !!partner.whopCompanyId, mode,
    };
  }

  // Platform (default) — or own_whop that isn't configured yet → platform Whop.
  return {
    apiKey: process.env.WHOP_API_KEY || null,
    companyId: process.env.WHOP_COMPANY_ID || null,
    config: undefined, // whopService falls back to env when config is undefined
    partner: null,
    source: 'global',
    isConfigured: !!process.env.WHOP_API_KEY,
    mode: mode === 'own_whop' ? 'own_whop' : 'platform',
  };
}

/**
 * Resolve the partner + decrypted webhook secret for an incoming partner webhook,
 * addressed by the per-partner token in the URL (/api/whop/webhook/:token).
 */
async function getPartnerByWebhookToken(prisma, token) {
  if (!token) return null;
  const partner = await prisma.user.findFirst({
    where: { whopWebhookToken: token },
    select: { id: true, whopWebhookSecret: true, whopCompanyId: true },
  });
  if (!partner) return null;
  return { partner, webhookSecret: decrypt(partner.whopWebhookSecret) };
}

/** Generate a URL-safe random token for a partner's webhook path. */
function generateWebhookToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  getEffectiveBilling,
  resolveWhopPartner,
  getWhopConfigForUser,
  getPartnerByWebhookToken,
  generateWebhookToken,
};
