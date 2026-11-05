const test = require('node:test');
const assert = require('node:assert');
const { cardOnFile, cardsOnFile, _cache } = require('../src/services/cardOnFile');

test.beforeEach(() => _cache.clear());

const stripePm = (last4, brand = 'visa') => ({ id: 'pm_1', card: { brand, last4, exp_month: 8, exp_year: 2029 } });
const fetchersFrom = (byProvider, calls = []) => ({
  stripe: async (_p, _u, id) => { calls.push(['stripe', id]); return byProvider.stripe(id); },
  whop: async (_p, _u, id) => { calls.push(['whop', id]); return byProvider.whop(id); },
});

test('Stripe account: brand, last four and expiry of the primary card', async () => {
  const user = { id: 1, stripePaymentMethodId: 'pm_1', whopPaymentMethodId: 'wpm_x' };
  const card = await cardOnFile({}, user, { mode: 'own_stripe', fetchers: fetchersFrom({ stripe: () => stripePm('4242') }) });
  assert.deepStrictEqual(card, { brand: 'visa', last4: '4242', expMonth: 8, expYear: 2029 });
});

test('Whop account reads the Whop column and tolerates flat fields', async () => {
  const calls = [];
  const user = { id: 1, stripePaymentMethodId: 'pm_1', whopPaymentMethodId: 'wpm_9' };
  const card = await cardOnFile({}, user, {
    mode: 'platform',
    fetchers: fetchersFrom({ whop: () => ({ id: 'wpm_9', card: { brand: 'Mastercard', last4: '0005' } }) }, calls),
  });
  assert.deepStrictEqual(calls, [['whop', 'wpm_9']]);
  assert.deepStrictEqual(card, { brand: 'mastercard', last4: '0005', expMonth: null, expYear: null });
  _cache.clear();
  const flat = await cardOnFile({}, user, { mode: 'own_whop', fetchers: fetchersFrom({ whop: () => ({ last4: '1111', brand: 'amex' }) }) });
  assert.strictEqual(flat.last4, '1111');
});

test('no card, manual billing, or a provider error give null', async () => {
  const f = fetchersFrom({ stripe: () => { throw Object.assign(new Error('nope'), { response: { status: 403 } }); }, whop: () => ({}) });
  assert.strictEqual(await cardOnFile({}, { id: 1 }, { mode: 'own_stripe', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, { id: 1, whopPaymentMethodId: 'w' }, { mode: 'manual', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, { id: 1, stripePaymentMethodId: 'pm' }, { mode: 'own_stripe', fetchers: f }), null);
  assert.strictEqual(await cardOnFile({}, { id: 1, whopPaymentMethodId: 'w' }, { mode: 'platform', fetchers: f }), null);
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
