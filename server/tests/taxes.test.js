const test = require('node:test');
const assert = require('node:assert');
const { round2, computeCharge, resolveTaxConfig } = require('../src/utils/taxes');

const ITBIS = { taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' };
const NONE = { taxEnabled: false, taxRate: 0, taxLabel: 'ITBIS' };

test('round2 rounds half a cent up', () => {
  assert.strictEqual(round2(3.375), 3.38);
  assert.strictEqual(round2(0.005), 0.01);
  assert.strictEqual(round2(10), 10);
});

test('27% on a round amount', () => {
  const c = computeCharge(100, ITBIS);
  assert.deepStrictEqual(c, { subtotal: 100, taxRate: 27, taxLabel: 'ITBIS', taxAmount: 27, total: 127 });
});

test('27% landing on half a cent rounds up', () => {
  // 12.50 * 0.27 is exactly 3.375
  const c = computeCharge(12.5, ITBIS);
  assert.strictEqual(c.taxAmount, 3.38);
  assert.strictEqual(c.total, 15.88);
});

test('tax disabled leaves the amount alone', () => {
  const c = computeCharge(100, NONE);
  assert.strictEqual(c.taxAmount, 0);
  assert.strictEqual(c.total, 100);
  assert.strictEqual(c.taxRate, 0);
});

test('subtotal plus tax always equals total, to the cent', () => {
  for (const s of [1, 7.77, 12.5, 33.33, 99.99, 250, 1000.01]) {
    const c = computeCharge(s, ITBIS);
    assert.strictEqual(round2(c.subtotal + c.taxAmount), c.total, `failed at ${s}`);
  }
});

test('a client under a tax-enabled partner inherits the rate', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: { findUnique: async ({ where }) => (where.ownerId === 9 ? { id: 5, ownerId: 9, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' } : null) },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9 });
  assert.strictEqual(cfg.taxEnabled, true);
  assert.strictEqual(cfg.taxRate, 27);
  assert.strictEqual(cfg.profile.id, 5);
});

test('a profile with the tax switched off resolves to rate 0', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: { findUnique: async () => ({ id: 5, ownerId: 9, taxEnabled: false, taxRate: 27, taxLabel: 'ITBIS' }) },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9 });
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
});

test('an account with no partner above it resolves to rate 0', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: null, billingMode: 'platform' }) },
    billingProfile: { findUnique: async () => null },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: null });
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
  assert.strictEqual(cfg.profile, null);
});
