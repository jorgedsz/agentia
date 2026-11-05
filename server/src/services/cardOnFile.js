// The saved card as people recognise it: brand and last four digits.
//
// The account only stores the provider's payment-method id (Stripe or Whop),
// so the digits are asked from the provider that governs the account. A saved
// payment method never changes its digits, so answers are cached by id.
// Anything that goes wrong (no permission on the key, provider down, card
// removed) returns null and the screens fall back to "card on file".

const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map(); // `${provider}:${id}` -> { at, card }

function columnsFor(mode, slot) {
  const backup = slot === 'backup';
  if (mode === 'own_stripe') return { provider: 'stripe', field: backup ? 'stripePaymentMethodIdBackup' : 'stripePaymentMethodId' };
  if (mode === 'manual') return null;
  return { provider: 'whop', field: backup ? 'whopPaymentMethodIdBackup' : 'whopPaymentMethodId' };
}

// Both providers answer with a `card` object; Whop has used flat fields too.
function toCard(pm) {
  const c = pm?.card || pm || {};
  const last4 = c.last4 || c.last_four || c.card_last4 || pm?.last4 || null;
  if (!last4) return null;
  const brand = c.brand || c.card_brand || c.network || pm?.brand || null;
  const expMonth = c.exp_month ?? c.expiration_month ?? null;
  const expYear = c.exp_year ?? c.expiration_year ?? null;
  return {
    brand: brand ? String(brand).toLowerCase() : null,
    last4: String(last4).slice(-4),
    expMonth: expMonth != null ? Number(expMonth) : null,
    expYear: expYear != null ? Number(expYear) : null,
  };
}

function defaultFetchers() {
  return {
    stripe: async (prisma, user, id) => {
      const { getStripeConfigForUser } = require('../utils/stripeConfig');
      const { secretKey } = await getStripeConfigForUser(prisma, user.id);
      if (!secretKey) return null;
      return require('./stripeService').getPaymentMethod(id, secretKey);
    },
    whop: async (prisma, user, id) => {
      const { getWhopConfigForUser } = require('../utils/whopConfig');
      const { config, isConfigured } = await getWhopConfigForUser(prisma, user.id);
      if (!isConfigured) return null;
      return require('./whopService').getPaymentMethod(id, config);
    },
  };
}

/**
 * { brand, last4, expMonth, expYear } of the account's card in `slot`
 * ('primary' | 'backup'), or null. `mode` is the account's billing mode
 * (getEffectiveBilling); pass it when the caller already has it.
 */
async function cardOnFile(prisma, user, { slot = 'primary', mode, fetchers } = {}) {
  try {
    if (!user) return null;
    if (!mode) {
      const { getEffectiveBilling } = require('../utils/whopConfig');
      mode = (await getEffectiveBilling(prisma, user.id).catch(() => ({ mode: 'platform' }))).mode;
    }
    const cols = columnsFor(mode, slot);
    const id = cols && user[cols.field];
    if (!id) return null;

    const key = `${cols.provider}:${id}`;
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.card;

    const fetch = (fetchers || defaultFetchers())[cols.provider];
    const card = toCard(await fetch(prisma, user, id));
    cache.set(key, { at: Date.now(), card });
    return card;
  } catch (error) {
    console.error(`[cardOnFile] user ${user?.id}: ${error.response?.status || ''} ${error.message}`);
    return null;
  }
}

/** Both slots at once. */
async function cardsOnFile(prisma, user, opts = {}) {
  const [card, backupCard] = await Promise.all([
    cardOnFile(prisma, user, { ...opts, slot: 'primary' }),
    cardOnFile(prisma, user, { ...opts, slot: 'backup' }),
  ]);
  return { card, backupCard };
}

module.exports = { cardOnFile, cardsOnFile, _cache: cache, _toCard: toCard };
