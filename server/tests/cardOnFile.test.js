const test = require('node:test');
const assert = require('node:assert');
const { cardOnFile, cardsOnFile, _cache } = require('../src/services/cardOnFile');

test.beforeEach(() => _cache.clear());

const stripePm = (last4, brand = 'visa') => ({ id: 'pm_1', card: { brand, last4, exp_month: 8, exp_year: 2029 } });
const fetchersFrom = (byProvider, calls = []) => ({
  stripe: async (_p, _u, id) => { calls.push(['stripe', id]); return byProvider.stripe(id); },
});

test('Stripe account: brand, last four and expiry of the primary card', async () => {
  const user = { id: 1, stripePaymentMethodId: 'pm_1' };
  const card = await cardOnFile({}, user, { mode: 'own_stripe', fetchers: fetchersFrom({ stripe: () => stripePm('4242') }) });
  assert.deepStrictEqual(card, { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 });
});

test('flat card fields are tolerated', async () => {
  const user = { id: 1, stripePaymentMethodId: 'pm_9' };
  const flat = await cardOnFile({}, user, { mode: 'own_stripe', fetchers: fetchersFrom({ stripe: () => ({ last4: '1111', brand: 'amex' }) }) });
  assert.strictEqual(flat.last4, '1111');
  assert.strictEqual(flat.brand, 'amex');
});

test('platform and manual accounts have no card, even with an id left on the row', async () => {
  const calls = [];
  const f = fetchersFrom({ stripe: () => stripePm('4242') }, calls);
  const user = { id: 1, stripePaymentMethodId: 'pm_1' };
  assert.strictEqual(await cardOnFile({}, user, { mode: 'platform', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, user, { mode: 'manual', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, user, { mode: 'own_whop', fetchers: f }), null);
  assert.deepStrictEqual(calls, []);
});

test('no card, manual billing, or a provider error give null', async () => {
  const f = fetchersFrom({ stripe: () => { throw Object.assign(new Error('nope'), { response: { status: 403 } }); } });
  assert.strictEqual(await cardOnFile({}, { id: 1 }, { mode: 'own_stripe', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, { id: 1, stripePaymentMethodId: 'pm' }, { mode: 'manual', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, { id: 1, stripePaymentMethodId: 'pm' }, { mode: 'own_stripe', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, { id: 1, stripePaymentMethodId: 'pm' }, { mode: 'platform', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, null, { mode: 'platform', fetchers: f }), null);
});

test('the same payment method is asked once; a new card is asked again', async () => {
  const calls = [];
  const f = fetchersFrom({ stripe: (id) => stripePm(id === 'pm_1' ? '4242' : '1881') }, calls);
  const user = { id: 1, stripePaymentMethodId: 'pm_1' };
  await cardOnFile({}, user, { mode: 'own_stripe', fetchers: f });
  await cardOnFile({}, user, { mode: 'own_stripe', fetchers: f });
  const nueva = await cardOnFile({}, { ...user, stripePaymentMethodId: 'pm_2' }, { mode: 'own_stripe', fetchers: f });
  assert.strictEqual(calls.length, 2);
  assert.strictEqual(nueva.last4, '1881');
});

test('both slots at once', async () => {
  const user = { id: 1, stripePaymentMethodId: 'pm_1', stripePaymentMethodIdBackup: 'pm_2' };
  const f = fetchersFrom({ stripe: (id) => stripePm(id === 'pm_1' ? '4242' : '5555', id === 'pm_1' ? 'visa' : 'mastercard') });
  const r = await cardsOnFile({}, user, { mode: 'own_stripe', fetchers: f });
  assert.strictEqual(r.card.last4, '4242');
  assert.strictEqual(r.backupCard.last4, '5555');
  assert.strictEqual(r.backupCard.brand, 'mastercard');
});
