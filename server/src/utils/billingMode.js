// Which billing mode governs an account, and the partners above it.
//
// A WHITELABEL partner (e.g. LM Consulting) may bill its subtree through its own
// Stripe (own_stripe), or keep its clients on manual billing (manual). Everyone
// else is on `platform`, which has no self-service card payment: the owner tops
// the balance up by hand from the panel, exactly as for `manual`.
//
// `own_whop` was a third mode until Whop was removed (2026-11). Rows still
// carrying it are treated as `platform`.

const crypto = require('crypto');

const PARTNER_SELECT = {
  id: true, role: true, whitelabelId: true, agencyId: true, billingMode: true,
  stripeSecretKey: true, stripePublishableKey: true, stripeWebhookSecret: true,
  stripeWebhookToken: true,
};

/**
 * The partners above a user, nearest first: a CLIENT yields [its agency/whitelabel,
 * that partner's whitelabel]; an AGENCY yields [its whitelabel]; a WHITELABEL/OWNER
 * yields []. Used to inherit a partner-wide setting down its whole subtree.
 */
async function getAncestorPartners(prisma, user) {
  const chain = [];
  const seen = new Set([user.id]);
  let current = user;
  // A client hangs off agencyId; an agency hangs off whitelabelId. Follow whichever
  // link the row has, stopping at the top (or on a cycle / missing row).
  while (chain.length < 5) {
    const parentId = current.agencyId || current.whitelabelId;
    if (!parentId || seen.has(parentId)) break;
    seen.add(parentId);
    const parent = await prisma.user.findUnique({ where: { id: parentId }, select: PARTNER_SELECT });
    if (!parent) break;
    chain.push(parent);
    current = parent;
  }
  return chain;
}

/**
 * Resolve the billing mode that governs a user.
 *
 * A partner's `manual` billingMode governs the accounts DIRECTLY under it (its
 * clients), NOT the partner itself: agencies and whitelabels are always on the
 * platform (they pay the OWNER). Only a CLIENT is governed — by its direct
 * parent partner (the account referenced by agencyId, which may be an AGENCY or
 * a WHITELABEL acting as the client's provider).
 *
 * Returns { mode, partner } where mode is 'platform' | 'own_stripe' | 'manual'
 * and partner is the governing agency/whitelabel row (null for platform).
 */
async function getEffectiveBilling(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: PARTNER_SELECT });
  if (!user) return { mode: 'platform', partner: null };

  // Stripe (own_stripe) governs the partner's ENTIRE subtree - its agencies and
  // their clients alike - so every payment under that partner lands in its Stripe.
  // Checked before the manual rule below, which governs only a partner's direct clients.
  // Walk from the nearest partner upward: the closest provider that made an
  // explicit choice wins. An agency set to manual is not overridden by a Stripe
  // partner further up - its own rule governs its clients. A legacy `own_whop`
  // is no longer an explicit choice: it reads as platform, so the walk goes on.
  const ancestors = await getAncestorPartners(prisma, user);
  for (const partner of ancestors) {
    if (partner.billingMode === 'own_stripe') return { mode: 'own_stripe', partner };
    if (partner.billingMode === 'manual') break;
  }

  // Partners (AGENCY / WHITELABEL) and the OWNER are always on the platform.
  if (user.role !== 'CLIENT') return { mode: 'platform', partner: null };

  const parentId = user.agencyId; // the client's direct provider
  if (!parentId) return { mode: 'platform', partner: null };
  const partner = await prisma.user.findUnique({ where: { id: parentId }, select: PARTNER_SELECT });
  if (partner && partner.billingMode === 'manual') {
    return { mode: 'manual', partner };
  }
  return { mode: 'platform', partner: null };
}

/**
 * Which card processor collects for a billing mode: the partner's Stripe for
 * own_stripe, AZUL (through pagos-azul, Nebo AI's own merchant) for platform, and
 * none for manual. Platform has no card payment while pagos-azul is not
 * configured. `azul` is the pagos-azul client (injected by tests).
 * Returns 'stripe' | 'azul' | null.
 */
function cardProviderFor(mode, azul = require('../services/azulPagos').cliente()) {
  if (mode === 'own_stripe') return 'stripe';
  if (mode === 'manual') return null;
  return azul.habilitado ? 'azul' : null; // platform (and legacy own_whop)
}

/**
 * Whether an account can pay by card on its own (buy credits, save a card,
 * auto-recharge): only when its billing mode has a card processor.
 */
function isSelfServiceMode(mode, azul) {
  return cardProviderFor(mode, azul) !== null;
}

/** Generate a URL-safe random token for a partner's webhook path. */
function generateWebhookToken() {
  return crypto.randomBytes(24).toString('hex');
}

module.exports = {
  getAncestorPartners,
  getEffectiveBilling,
  cardProviderFor,
  isSelfServiceMode,
  generateWebhookToken,
};
