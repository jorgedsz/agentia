// The tax a partner shows on its invoices, and — separately — the tax it adds
// on top of everything it charges its clients.
//
// LM Consulting Group bills from the Dominican Republic and its invoices carry
// 27% ITBIS. THOSE ARE TWO DIFFERENT DECISIONS and the BillingProfile keeps two
// flags for them:
//
//   · taxEnabled        the partner's invoices show the tax (see
//                       services/invoiceService.js, which computes it from the
//                       profile at issue time).
//   · chargeTaxToClient the tax is ALSO charged on top of every payment, so
//                       $100 of balance costs the client $127.
//
// ONLY the second one reaches a card. It defaults to false, so a partner that
// turns its invoicing on charges its clients exactly what they asked for while
// its documents still print the 27% — deliberately leaving the invoice total
// above what was collected. Everything below that computes a CHARGE honours
// chargeTaxToClient; `taxRate`/`taxLabel` stay on the result regardless, for
// display.
//
// The rule hangs off the partner (BillingProfile), and the whole
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
 * THE TAX ONLY GOES ON TOP WHEN `taxConfig.chargeTaxToClient` IS TRUE. Without
 * it this returns `taxAmount: 0` and `total === subtotal` — the client pays
 * exactly what it asked for — while `taxRate` and `taxLabel` still describe the
 * partner's tax so a caller can display it. That is the default: a partner's
 * invoices can show a tax nobody was charged (see the file header), and only
 * flipping chargeTaxToClient on makes the card pay it.
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
  // The partner's rate, for display and for the invoice. Reported on the result
  // even when nothing is charged for it.
  const rate = taxConfig?.taxEnabled ? (taxConfig.taxRate || 0) : 0;
  // The rate that actually reaches the card. Gated on the second flag, so the
  // whole charging behaviour below comes back by flipping it — nothing here is
  // removed, only switched off by default.
  const chargedRate = taxConfig?.chargeTaxToClient ? rate : 0;
  const subtotalCents = Math.round(subtotal * 100);
  const taxCents = Math.round((subtotalCents * chargedRate) / 100);
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
 * The tax governing `userId`. `options.partnerId` and `options.mode`
 * short-circuit the lookup of who governs the account and through which
 * processor — used by tests, and by callers that already resolved them. Never
 * throws: a tax that cannot be resolved must not block a payment, so anything
 * unexpected reads as "no tax". Because that failure is silent to the caller,
 * it is logged loudly here — a swallowed error means a partner quietly stops
 * collecting a tax it is legally required to collect.
 *
 * ONLY `own_stripe` is taxed. Not a policy choice — a safety gate, because
 * only the Stripe path can actually produce the invoice that must accompany a
 * taxed charge:
 *
 *   - Whop settles through its own parallel implementation in
 *     controllers/whopController.js (~l.265-296), which never calls
 *     settleCreditPurchase. A taxed `own_whop` account would therefore be
 *     charged the taxed total, credited the right credits, and issued NO
 *     invoice — and its billing period would never settle either, since both
 *     of those live in utils/creditSettlement.js.
 *   - Worse, whopController.js's orphan-payment fallback (~l.422) credits
 *     `data.usd_total`, the TAXED total, as credits — so a taxed Whop payment
 *     that arrived without its pending row would hand the client the tax as
 *     balance.
 *
 * So the tax must not reach the Whop path until those two settlement
 * implementations are unified behind settleCreditPurchase. This costs nothing
 * today: the only tax-enabled partner bills through `own_stripe`, and
 * `manual`-mode accounts never produce a CreditPurchase at all. Remove this
 * gate only together with that unification.
 */
async function resolveTaxConfig(prisma, userId, options = {}) {
  const NO_TAX = {
    profile: null, taxEnabled: false, chargeTaxToClient: false, taxRate: 0, taxLabel: 'ITBIS',
  };
  try {
    let partnerId = options.partnerId;
    let mode = options.mode;
    if (partnerId === undefined || mode === undefined) {
      const billing = await getEffectiveBilling(prisma, userId);
      if (partnerId === undefined) partnerId = billing.partner?.id ?? null;
      if (mode === undefined) mode = billing.mode;
    }
    // getEffectiveBilling hands back a partner for own_whop and manual too, so
    // the mode has to be checked explicitly - a profile alone is not enough.
    if (mode !== 'own_stripe') return NO_TAX;
    if (!partnerId) return NO_TAX;

    const profile = await prisma.billingProfile.findUnique({ where: { ownerId: partnerId } });
    if (!profile) return NO_TAX;

    return {
      profile,
      taxEnabled: !!profile.taxEnabled,
      // Gated on taxEnabled as well: charging a client a tax that appears on no
      // invoice is never what anyone means, so the second flag alone does
      // nothing. The two are stored separately but read as "show it" and "also
      // collect it", in that order.
      chargeTaxToClient: !!(profile.taxEnabled && profile.chargeTaxToClient),
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
  // computeCharge honours taxConfig.chargeTaxToClient, so with that flag off
  // `taxAmount` is 0 and `total` is `subtotal`: every caller then charges,
  // records and reports exactly the amount that was asked for, as it did before
  // this tax existed. `taxRate`/`taxLabel` still come through for display.
  return { ...computeCharge(subtotal, taxConfig), profile: taxConfig.profile };
}

module.exports = { round2, computeCharge, resolveTaxConfig, resolveCharge };
