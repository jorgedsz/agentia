const test = require('node:test');
const assert = require('node:assert');
const { savedCardId, cardColumn } = require('../src/utils/savedCard');
const { getSavedCards } = require('../src/utils/autoRecharge');

const user = { stripePaymentMethodId: 'pm_1', stripePaymentMethodIdBackup: null, azulTarjetaId: 'tj1', azulTarjetaIdBackup: 'tj2' };

test('each processor has its own card columns', () => {
  assert.strictEqual(savedCardId(user, 'stripe'), 'pm_1');
  assert.strictEqual(savedCardId(user, 'azul'), 'tj1');
  assert.strictEqual(savedCardId(user, 'azul', 'backup'), 'tj2');
  assert.strictEqual(savedCardId(user, null), null);
  assert.strictEqual(cardColumn('azul', 'backup'), 'azulTarjetaIdBackup');
  assert.strictEqual(cardColumn('stripe'), 'stripePaymentMethodId');
});

test('saved cards are listed for the account processor', () => {
  assert.deepStrictEqual(getSavedCards(user, 'azul').map((c) => [c.paymentMethodId, c.slot]), [['tj1', 'primary'], ['tj2', 'backup']]);
  assert.deepStrictEqual(getSavedCards(user, 'stripe').map((c) => c.paymentMethodId), ['pm_1']);
  assert.deepStrictEqual(getSavedCards(user), getSavedCards(user, 'stripe'));
  assert.deepStrictEqual(getSavedCards(null, 'azul'), []);
});
