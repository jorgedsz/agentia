const test = require('node:test');
const assert = require('node:assert');
const { round2, computeCharge, resolveTaxConfig } = require('../src/utils/taxes');

// The two modes the feature now has. SHOWN is the default a partner gets when
// it switches its invoicing on: its invoices carry the 27%, but no client is
// charged anything extra. CHARGED is the same partner with
// chargeTaxToClient flipped on, which is the behaviour that used to be the only
// one — $100 of balance costs the card $127.
const ITBIS_SHOWN = { taxEnabled: true, chargeTaxToClient: false, taxRate: 27, taxLabel: 'ITBIS' };
const ITBIS = { taxEnabled: true, chargeTaxToClient: true, taxRate: 27, taxLabel: 'ITBIS' };
const NONE = { taxEnabled: false, chargeTaxToClient: false, taxRate: 0, taxLabel: 'ITBIS' };

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

// THE DEFAULT MODE. The partner's invoices show 27% ITBIS, but the client is
// charged nothing extra: $100 asked for is $100 on the card. The rate and the
// label still come through, because the invoice and the panel display them.
test('tax shown but not charged: the client pays exactly what it asked for', () => {
  const c = computeCharge(100, ITBIS_SHOWN);
  assert.deepStrictEqual(c, { subtotal: 100, taxRate: 27, taxLabel: 'ITBIS', taxAmount: 0, total: 100 });
});

test('tax shown but not charged: total equals subtotal at every magnitude', () => {
  for (const s of [0.01, 1, 7.77, 12.5, 15.5, 33.33, 99.99, 250, 1000.01]) {
    const c = computeCharge(s, ITBIS_SHOWN);
    assert.strictEqual(c.taxAmount, 0, `taxAmount must be 0 at ${s}`);
    assert.strictEqual(c.total, c.subtotal, `total must equal subtotal at ${s}`);
  }
});

// chargeTaxToClient on its own does nothing: a tax that appears on no invoice
// must never reach a card.
test('chargeTaxToClient without taxEnabled charges nothing', () => {
  const c = computeCharge(100, { taxEnabled: false, chargeTaxToClient: true, taxRate: 27, taxLabel: 'ITBIS' });
  assert.strictEqual(c.taxRate, 0);
  assert.strictEqual(c.taxAmount, 0);
  assert.strictEqual(c.total, 100);
});

// A config object from before this split (no chargeTaxToClient key at all)
// must read as "do not charge", never as "charge".
test('a taxConfig with no chargeTaxToClient key charges nothing', () => {
  const c = computeCharge(100, { taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' });
  assert.strictEqual(c.taxAmount, 0);
  assert.strictEqual(c.total, 100);
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
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(cfg.taxEnabled, true);
  assert.strictEqual(cfg.taxRate, 27);
  assert.strictEqual(cfg.profile.id, 5);
  // Not configured on the profile, so the client is charged nothing extra.
  assert.strictEqual(cfg.chargeTaxToClient, false);
});

test('resolveTaxConfig reports chargeTaxToClient off and on, straight off the profile', async () => {
  const makePrisma = (chargeTaxToClient) => ({
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: {
      findUnique: async () => ({ id: 5, ownerId: 9, taxEnabled: true, chargeTaxToClient, taxRate: 27, taxLabel: 'ITBIS' }),
    },
  });

  const shown = await resolveTaxConfig(makePrisma(false), 1, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(shown.taxEnabled, true);
  assert.strictEqual(shown.chargeTaxToClient, false);
  assert.strictEqual(shown.taxRate, 27);
  assert.strictEqual(computeCharge(100, shown).total, 100);

  const charged = await resolveTaxConfig(makePrisma(true), 1, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(charged.chargeTaxToClient, true);
  assert.strictEqual(computeCharge(100, charged).total, 127);
});

// The same account, the same 27% — and still nothing charged, because the tax
// is only shown. This is the whole point of the split: taxEnabled governs the
// document, chargeTaxToClient governs the card.
test('a tax-enabled profile with chargeTaxToClient off never reaches the card, even through resolveTaxConfig', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: {
      findUnique: async () => ({ id: 5, ownerId: 9, taxEnabled: true, chargeTaxToClient: false, taxRate: 27, taxLabel: 'ITBIS' }),
    },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9, mode: 'own_stripe' });
  const c = computeCharge(250, cfg);
  assert.strictEqual(c.subtotal, 250);
  assert.strictEqual(c.taxAmount, 0);
  assert.strictEqual(c.total, 250);
  assert.strictEqual(c.taxRate, 27);
  assert.strictEqual(c.taxLabel, 'ITBIS');
});

test('a profile with the tax switched off resolves to rate 0', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: { findUnique: async () => ({ id: 5, ownerId: 9, taxEnabled: false, taxRate: 27, taxLabel: 'ITBIS' }) },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
});

test('an account with no partner above it resolves to rate 0', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: null, billingMode: 'platform' }) },
    billingProfile: { findUnique: async () => null },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: null, mode: 'own_stripe' });
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
  assert.strictEqual(cfg.profile, null);
});

// The gate that keeps the tax on the Stripe path. Everything else about this
// account says "tax it" - a real partner above it, a profile with taxEnabled
// and a 27% rate - and it still resolves to no tax, purely because the money
// would be collected through Whop, whose settlement never issues an invoice.
// Asserted with the partner injected so the gate is proven to apply even to a
// caller that already resolved who governs the account. The mocks deliberately
// RESOLVE rather than throw: a throwing mock would land in resolveTaxConfig's
// own catch and return NO_TAX for the wrong reason, so this would pass with the
// gate deleted. With these, the same call under mode 'own_stripe' returns 27
// (asserted at the end), which is what makes the 0s above the gate's doing.
test('the tax is gated off anything but own_stripe, even with the partner injected', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, whitelabelId: null, billingMode: 'platform' }) },
    billingProfile: {
      findUnique: async ({ where }) => (where.ownerId === 9
        ? { id: 42, ownerId: 9, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' }
        : null),
    },
  };
  for (const mode of ['own_whop', 'manual', 'platform']) {
    const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9, mode });
    assert.strictEqual(cfg.taxEnabled, false, `${mode} must not be taxed`);
    assert.strictEqual(cfg.chargeTaxToClient, false, `${mode} must not charge a tax`);
    assert.strictEqual(cfg.taxRate, 0, `${mode} must resolve to rate 0`);
    assert.strictEqual(cfg.profile, null, `${mode} must resolve to no profile`);
  }

  // Same account, same profile, same mocks - only the mode differs.
  const taxed = await resolveTaxConfig(prisma, 1, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(taxed.taxRate, 27);
  assert.strictEqual(taxed.profile.id, 42);
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

// Drives resolveTaxConfig through its REAL call shape: no partnerId or mode
// override, so it must call getEffectiveBilling itself, which walks the
// user -> agency inheritance via prisma.user.findUnique (both directly and via
// getAncestorPartners) before taxes.js ever touches billingProfile. The tests
// above all pass `partnerId` explicitly, which bypasses this entirely.
//
// This is the own_whop shape, and the whole point is that it resolves to NO
// tax: getEffectiveBilling finds a real partner (id 9) with a profile that has
// taxEnabled and a 27% rate, and the mode gate still refuses it, because the
// Whop settlement path in whopController.js would collect the tax without ever
// issuing the invoice that has to accompany it. The own_stripe twin of this
// test below uses the SAME mock shape and does resolve to 27, which is what
// pins this 0 on the mode rather than on the mock.
test('a tax-enabled profile resolves to rate 0 when the money is collected through Whop', async () => {
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
  // Sanity: this mock really does put an own_whop partner above the account,
  // so the 0 below is the gate's doing and not a broken inheritance walk.
  const { getEffectiveBilling } = require('../src/utils/whopConfig');
  const billing = await getEffectiveBilling(prisma, 1);
  assert.strictEqual(billing.mode, 'own_whop');
  assert.strictEqual(billing.partner.id, 9);

  const cfg = await resolveTaxConfig(prisma, 1);
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
  assert.strictEqual(cfg.profile, null);
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
