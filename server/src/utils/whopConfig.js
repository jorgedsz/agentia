// Resolve which Whop account a user's credit purchases / auto-recharge should be
// created in. A WHITELABEL partner (e.g. LM Consulting) with its own Whop
// configured collects the money directly; every account under that partner
// (its agencies and their clients) routes to the same partner Whop. Accounts
// with no configured partner fall back to the platform's global Whop (env vars).

const { decrypt } = require('./encryption');
const crypto = require('crypto');

const PARTNER_SELECT = {
  id: true, role: true, whitelabelId: true, agencyId: true,
  whopApiKey: true, whopCompanyId: true, whopWebhookSecret: true,
  whopCreditsProductId: true, whopWebhookToken: true,
};

/**
 * Walk up the ownership chain (client → agency → whitelabel) and return the
 * first WHITELABEL that has its own Whop configured, or null if none does.
 */
async function resolveWhopPartner(prisma, userId) {
  let current = await prisma.user.findUnique({ where: { id: userId }, select: PARTNER_SELECT });
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.role === 'WHITELABEL' && current.whopApiKey && current.whopCompanyId) {
      return current;
    }
    const parentId = current.agencyId || current.whitelabelId;
    if (!parentId) break;
    current = await prisma.user.findUnique({ where: { id: parentId }, select: PARTNER_SELECT });
  }
  return null;
}

/**
 * Usable Whop config for a user's credit/auto-recharge flows.
 * Returns { apiKey, companyId, config, partner, source, isConfigured } where
 * `config` is what you pass to whopService ({ apiKey, companyId }) and `partner`
 * is the WHITELABEL user row when routing to a partner (null for global).
 */
async function getWhopConfigForUser(prisma, userId) {
  const partner = await resolveWhopPartner(prisma, userId).catch(() => null);

  if (partner) {
    const apiKey = decrypt(partner.whopApiKey);
    return {
      apiKey,
      companyId: partner.whopCompanyId,
      config: { apiKey, companyId: partner.whopCompanyId },
      partner,
      source: 'partner',
      isConfigured: !!apiKey && !!partner.whopCompanyId,
    };
  }

  return {
    apiKey: process.env.WHOP_API_KEY || null,
    companyId: process.env.WHOP_COMPANY_ID || null,
    config: undefined, // whopService falls back to env when config is undefined
    partner: null,
    source: 'global',
    isConfigured: !!process.env.WHOP_API_KEY,
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
  resolveWhopPartner,
  getWhopConfigForUser,
  getPartnerByWebhookToken,
  generateWebhookToken,
};
