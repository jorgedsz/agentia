const test = require('node:test');
const assert = require('node:assert');
const { createCreditCheckout, createCardSetupCheckout, CheckoutError, MANUAL_BILLING_MSG } = require('../src/services/creditCheckout');
const { isSelfServiceMode } = require('../src/utils/billingMode');

// Platform accounts pay by card through AZUL only when pagos-azul is configured;
// these tests run without PAGOS_AZUL_*, so platform behaves like manual here.

function prismaFor(rows) {
  return {
    user: { findUnique: async ({ where }) => rows[where.id] || null },
    creditPurchase: {
      findFirst: async () => null,
      create: async () => { throw new Error('no purchase may be recorded'); },
    },
    billingProfile: { findFirst: async () => null },
  };
}

test('the card processor follows the billing mode', () => {
  const { cardProviderFor } = require('../src/utils/billingMode');
  const azulOn = { habilitado: true };
  const azulOff = { habilitado: false };
  assert.strictEqual(cardProviderFor('own_stripe', azulOn), 'stripe');
  assert.strictEqual(cardProviderFor('platform', azulOn), 'azul');
  assert.strictEqual(cardProviderFor('platform', azulOff), null);
  assert.strictEqual(cardProviderFor('own_whop', azulOn), 'azul'); // legacy reads as platform
  assert.strictEqual(cardProviderFor('manual', azulOn), null);
  assert.strictEqual(isSelfServiceMode('own_stripe', azulOff), true);
  assert.strictEqual(isSelfServiceMode('platform', azulOff), false);
  assert.strictEqual(isSelfServiceMode('manual', azulOn), false);
});

for (const [label, rows] of [
  ['a platform agency', { 1: { id: 1, role: 'AGENCY', agencyId: null, whitelabelId: null, billingMode: 'platform', vapiCredits: 0 } }],
  ['a client under a legacy own_whop partner', {
    1: { id: 1, role: 'CLIENT', agencyId: 9, whitelabelId: null, billingMode: 'platform', vapiCredits: 0 },
    9: { id: 9, role: 'AGENCY', agencyId: null, whitelabelId: null, billingMode: 'own_whop' },
  }],
  ['a client under a manual partner', {
    1: { id: 1, role: 'CLIENT', agencyId: 9, whitelabelId: null, billingMode: 'platform', vapiCredits: 0 },
    9: { id: 9, role: 'AGENCY', agencyId: null, whitelabelId: null, billingMode: 'manual' },
  }],
]) {
  test(`${label} cannot buy credits or save a card`, async () => {
    const prisma = prismaFor(rows);
    const urls = { successUrl: 'https://x/ok', cancelUrl: 'https://x/no' };
    for (const attempt of [
      () => createCreditCheckout(prisma, 1, 50, urls),
      () => createCardSetupCheckout(prisma, 1, 'primary', urls),
    ]) {
      await assert.rejects(attempt, (err) => {
        assert.ok(err instanceof CheckoutError);
        assert.strictEqual(err.status, 403);
        assert.strictEqual(err.message, MANUAL_BILLING_MSG);
        return true;
      });
    }
  });
}
