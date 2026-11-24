// The saved card as people recognise it: brand and last four digits.
//
// The account only stores the processor's card id (a Stripe payment method or a
// pagos-azul tarjetaId), so the digits are asked from the processor that governs
// the account. A saved card never changes its digits, so answers are cached by id.
// Anything that goes wrong (no permission on the key, provider down, card
// removed) returns null and the screens fall back to "card on file".

const CACHE_MS = 12 * 60 * 60 * 1000;
const cache = new Map(); // `${provider}:${id}` -> { at, card }

function columnsFor(mode, slot, provider) {
  const { cardProviderFor } = require('../utils/billingMode');
  const { cardColumn } = require('../utils/savedCard');
  const p = provider || cardProviderFor(mode);
  // Manual accounts (and platform while AZUL is not configured) have no card
  // payment; legacy Whop cards left on old rows are never shown.
  return p ? { provider: p, field: cardColumn(p, slot) } : null;
}

// pagos-azul answers { marca, mascara: '****0026', vence: 'YYYYMM', activa }.
function azulToCard(t) {
  if (!t || t.activa === false) return null;
  const last4 = String(t.mascara || '').replace(/\D/g, '').slice(-4);
  if (!last4) return null;
  const vence = String(t.vence || '');
  return {
    brand: t.marca ? String(t.marca).toLowerCase() : null,
    last4,
    expMonth: vence.length === 6 ? Number(vence.slice(4, 6)) : null,
    expYear: vence.length === 6 ? Number(vence.slice(0, 4)) : null,
  };
}

// Stripe answers with a `card` object; flat fields are tolerated too.
function toCard(pm) {
  if (pm && pm.mascara !== undefined) return azulToCard(pm);
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
    azul: async (_prisma, _user, id) => require('./azulPagos').cliente().obtenerTarjeta(id),
  };
}

/**
 * { brand, last4, expMonth, expYear } of the account's card in `slot`
 * ('primary' | 'backup'), or null. `mode` is the account's billing mode
 * (getEffectiveBilling); pass it — or `provider` — when the caller already has it.
 */
async function cardOnFile(prisma, user, { slot = 'primary', mode, provider, fetchers } = {}) {
  try {
    if (!user) return null;
    if (!mode && !provider) {
      const { getEffectiveBilling } = require('../utils/billingMode');
      mode = (await getEffectiveBilling(prisma, user.id).catch(() => ({ mode: 'platform' }))).mode;
    }
    const cols = columnsFor(mode, slot, provider);
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
