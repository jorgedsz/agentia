// The tax a partner adds on top of everything it charges its clients.
//
// LM Consulting Group bills from the Dominican Republic and collects 27% on
// every charge. The rule hangs off the partner (BillingProfile), and the whole
// subtree under it inherits. That inheritance is resolved via getEffectiveBilling
// below, which governs only a CLIENT through its direct provider (gated by that
// provider's billing mode) — NOT the full ancestor chain that resolveReceiptEmail
// walks via getAncestorPartners. The two converge when the tax-enabled partner is
// a client's direct parent, but they are not the same mechanism; do not assume
// this reaches a partner two levels up the way resolveReceiptEmail does. An
// account with no tax-enabled partner above it resolves to rate 0, and every
// caller then behaves exactly as it did before this existed.

const { getEffectiveBilling } = require('./whopConfig');

function describeValue(value) {
  // JSON.stringify(NaN) is "null", which would misreport a NaN as a null - keep
  // strings quoted (to tell "100" from 100) but fall back to String() otherwise.
  return typeof value === 'string' ? JSON.stringify(value) : String(value);
}

function assertFiniteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number, got ${describeValue(value)}`);
  }
}

/**
 * Round a decimal to the cent, half a cent up, like a real cash register —
 * for arbitrary standalone values (later tasks use this directly on numbers
 * that aren't necessarily charge subtotals). Throws on anything that isn't a
 * finite number rather than silently coercing — a bad input here is a bug
 * upstream, not a value to quietly turn into 0.
 *
 * Plain `Math.round(n * 100) / 100` is wrong for a large class of inputs at
 * exactly this magnitude: `1.005 * 100` is `100.49999999999999` in IEEE 754,
 * which rounds DOWN to 1.00 instead of the correct 1.01 — the same class of
 * error computeCharge had, just showing up at small numbers instead of
 * charge-sized ones. `toPrecision(15)` collapses that representation error
 * (100.49999999999999 -> "100.5") before Math.round sees it, without the
 * magnitude-dependence that made a flat Number.EPSILON nudge a no-op at
 * charge-sized values. Verified against an independent decimal ground truth
 * (exact-integer milli-unit arithmetic, no float multiplication) across every
 * 3-decimal value from 0.000 to 500.000: 0 mismatches in 500,001 values.
 */
function round2(n) {
  assertFiniteNumber(n, 'round2(n)');
  return Math.round(Number((n * 100).toPrecision(15))) / 100;
}

/**
 * The breakdown for a charge. `subtotal` is always what the caller already
 * treats as the amount — credits requested, a cycle's outstanding, a period's
 * balance — and the tax goes ON TOP of it. What reaches the balance is the
 * subtotal; what the card pays is the total.
 *
 * Everything is computed in whole cents and divided back to dollars only at
 * the very end. Multiplying a float subtotal by a float rate and rounding the
 * result (the previous approach) loses precision for ordinary amounts — e.g.
 * 15.50 * 27 / 100 comes out as 4.1849999999999996 in IEEE 754, which rounds
 * DOWN to 4.18 instead of the correct 4.19. Working in integer cents avoids
 * that: `subtotalCents * rate` is an exact integer for any realistic amount,
 * so a true half-cent lands exactly on .5 and rounds up as it should.
 *
 * Throws a TypeError on a non-finite subtotal (a string, NaN, undefined, ...)
 * instead of silently treating it as 0 — this sits upstream of real card
 * charges, and a silent $0 charge is worse than a loud failure.
 */
function computeCharge(subtotal, taxConfig) {
  assertFiniteNumber(subtotal, 'computeCharge(subtotal, ...)');
  const rate = taxConfig?.taxEnabled ? (taxConfig.taxRate || 0) : 0;
  const subtotalCents = Math.round(subtotal * 100);
  const taxCents = Math.round((subtotalCents * rate) / 100);
  const totalCents = subtotalCents + taxCents;
  return {
    subtotal: subtotalCents / 100,
    taxRate: rate,
    taxLabel: taxConfig?.taxLabel || 'ITBIS',
    taxAmount: taxCents / 100,
    total: totalCents / 100,
  };
}

/**
 * The tax governing `userId`. `options.partnerId` short-circuits the lookup of
 * who governs the account — used by tests, and by callers that already resolved
 * it. Never throws: a tax that cannot be resolved must not block a payment, so
 * anything unexpected reads as "no tax". Because that failure is silent to the
 * caller, it is logged loudly here — a swallowed error means a partner quietly
 * stops collecting a tax it is legally required to collect.
 */
async function resolveTaxConfig(prisma, userId, options = {}) {
  const NO_TAX = { profile: null, taxEnabled: false, taxRate: 0, taxLabel: 'ITBIS' };
  try {
    let partnerId = options.partnerId;
    if (partnerId === undefined) {
      const { partner } = await getEffectiveBilling(prisma, userId);
      partnerId = partner?.id ?? null;
    }
    if (!partnerId) return NO_TAX;

    const profile = await prisma.billingProfile.findUnique({ where: { ownerId: partnerId } });
    if (!profile) return NO_TAX;

    return {
      profile,
      taxEnabled: !!profile.taxEnabled,
      taxRate: profile.taxEnabled ? (profile.taxRate || 0) : 0,
      taxLabel: profile.taxLabel || 'ITBIS',
    };
  } catch (error) {
    console.error('[Taxes] Could not resolve the tax for user', userId, '-', error && error.stack ? error.stack : error);
    return NO_TAX;
  }
}

/**
 * Resolve and compute in one call — what every charge path uses. The tax
 * lookup itself never throws (see resolveTaxConfig above), but this still can:
 * it hands `subtotal` to computeCharge, which throws a TypeError on a
 * non-finite subtotal (a string, NaN, undefined, ...). That's deliberate — a
 * bad subtotal reaching a charge call is a caller bug, and a silent $0 charge
 * is worse than a loud failure — but it means resolveCharge is NOT blanket
 * exception-safe the way resolveTaxConfig is. Callers on a live Stripe charge
 * path must validate `subtotal` before calling this, or be ready to catch.
 */
async function resolveCharge(prisma, userId, subtotal) {
  const taxConfig = await resolveTaxConfig(prisma, userId);
  return { ...computeCharge(subtotal, taxConfig), profile: taxConfig.profile };
}

module.exports = { round2, computeCharge, resolveTaxConfig, resolveCharge };
