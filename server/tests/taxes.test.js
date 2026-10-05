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

// Regression: these are NOT exact binary fractions, unlike 3.375/0.005/10
// above - they expose a case the first round2 (plain Math.round(n*100)/100,
// no epsilon handling at all) got wrong. 1.005*100 is 100.49999999999999 in
// IEEE 754, which used to round DOWN to 1.00 instead of the correct 1.01.
test('round2 is correct at small magnitudes, not just exact binary fractions', () => {
  assert.strictEqual(round2(1.005), 1.01);
  assert.strictEqual(round2(0.145), 0.15);
  assert.strictEqual(round2(1.255), 1.26);
});

// An independent ground truth for round2, built from the sweep's own integer
// index rather than from any float multiplication - i is an exact integer by
// construction (the loop variable), so `i % 10` / `Math.floor(i / 10)` are
// exact and share no arithmetic with round2's implementation.
test('round2 matches an independently computed decimal truth across a sweep', () => {
  let checked = 0;
  for (let i = 0; i <= 500000; i++) {
    const n = i / 1000; // 0.000 .. 500.000 in steps of 0.001
    const tenths = i % 10; // the digit deciding whether the 3rd decimal rounds the cent up
    const centsBase = Math.floor(i / 10);
    const expectedCents = tenths >= 5 ? centsBase + 1 : centsBase;
    const expected = expectedCents / 100;
    assert.strictEqual(round2(n), expected, `failed at ${n}`);
    checked++;
  }
  assert.strictEqual(checked, 500001);
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

// Regression: 15.50 * 27 / 100 is 4.1849999999999996 in IEEE 754 floats, which
// used to round DOWN to 4.18 (the tax was a cent short) instead of the correct
// 4.19. This is the exact value that exposed the bug.
test('27% of 15.50 is 4.19, not 4.18', () => {
  const c = computeCharge(15.5, ITBIS);
  assert.strictEqual(c.taxAmount, 4.19);
  assert.strictEqual(c.total, 19.69);
});

// An independent ground truth for "correct", computed with BigInt cent
// arithmetic so it can never share a floating-point rounding error with the
// code under test. Unlike "subtotal + tax === total" (which is true by
// construction no matter what taxAmount comes out to), this actually pins
// the VALUE of taxAmount against a value computed a different way.
function expectedTaxCents(subtotalDollars, ratePercent) {
  const cents = BigInt(Math.round(subtotalDollars * 100));
  const rate = BigInt(ratePercent);
  return Number((cents * rate + 50n) / 100n); // half up, exactly
}

test('taxAmount matches an independently computed cents value across a sweep', () => {
  let checked = 0;
  for (let cents = 1; cents <= 200000; cents++) {
    const subtotal = cents / 100;
    const c = computeCharge(subtotal, ITBIS);
    const expected = expectedTaxCents(subtotal, 27) / 100;
    assert.strictEqual(c.taxAmount, expected, `failed at subtotal ${subtotal}`);
    checked++;
  }
  assert.strictEqual(checked, 200000);
});

test('computeCharge throws on a non-numeric subtotal instead of silently charging $0', () => {
  assert.throws(() => computeCharge('100', ITBIS), TypeError);
  assert.throws(() => computeCharge(undefined, ITBIS), TypeError);
});

test('computeCharge throws on NaN', () => {
  assert.throws(() => computeCharge(NaN, ITBIS), TypeError);
});

test('resolveTaxConfig returns NO_TAX instead of throwing when prisma blows up', async () => {
  const prisma = {
    user: { findUnique: async () => { throw new Error('connection reset'); } },
    billingProfile: { findUnique: async () => { throw new Error('should not be reached'); } },
  };
  const cfg = await resolveTaxConfig(prisma, 1); // no partnerId override - exercises getEffectiveBilling too
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
  assert.strictEqual(cfg.profile, null);
});

// Drives resolveTaxConfig through its REAL call shape: no partnerId override,
// so it must call getEffectiveBilling itself, which walks the user -> agency
// inheritance via prisma.user.findUnique (both directly and via
// getAncestorPartners) before taxes.js ever touches billingProfile. The three
// tests above all pass `partnerId` explicitly, which bypasses this entirely.
test('resolveTaxConfig walks the real partner-inheritance path with no partnerId override', async () => {
  const CLIENT = { id: 1, role: 'CLIENT', agencyId: 9, whitelabelId: null, billingMode: 'platform' };
  const PARTNER = { id: 9, role: 'AGENCY', agencyId: null, whitelabelId: null, billingMode: 'own_whop' };
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id === 1) return CLIENT;
        if (where.id === 9) return PARTNER;
        return null;
      },
    },
    billingProfile: {
      findUnique: async ({ where }) => (where.ownerId === 9
        ? { id: 77, ownerId: 9, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' }
        : null),
    },
  };
  const cfg = await resolveTaxConfig(prisma, 1);
  assert.strictEqual(cfg.taxEnabled, true);
  assert.strictEqual(cfg.taxRate, 27);
  assert.strictEqual(cfg.profile.id, 77);
});

// LM Consulting's actual configuration is own_stripe, not own_whop - and
// getEffectiveBilling resolves it through a different branch: it returns as
// soon as it finds an own_stripe partner while walking ancestors (inside
// getAncestorPartners' loop), rather than via the separate direct-parent
// lookup own_whop/manual go through afterwards. This test mirrors that branch
// exactly (verified by calling getEffectiveBilling with this same mock
// directly) instead of assuming it behaves like the own_whop case above.
test('resolveTaxConfig walks the real inheritance path for an own_stripe partner (LM Consulting\'s actual setup)', async () => {
  const CLIENT = { id: 1, role: 'CLIENT', agencyId: 9, whitelabelId: null, billingMode: 'platform' };
  const PARTNER = { id: 9, role: 'WHITELABEL', agencyId: null, whitelabelId: null, billingMode: 'own_stripe' };
  const prisma = {
    user: {
      findUnique: async ({ where }) => {
        if (where.id === 1) return CLIENT;
        if (where.id === 9) return PARTNER;
        return null;
      },
    },
    billingProfile: {
      findUnique: async ({ where }) => (where.ownerId === 9
        ? { id: 88, ownerId: 9, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' }
        : null),
    },
  };
  const cfg = await resolveTaxConfig(prisma, 1);
  assert.strictEqual(cfg.taxEnabled, true);
  assert.strictEqual(cfg.taxRate, 27);
  assert.strictEqual(cfg.profile.id, 88);
});
