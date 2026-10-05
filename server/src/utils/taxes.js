// The tax a partner adds on top of everything it charges its clients.
//
// LM Consulting Group bills from the Dominican Republic and collects 27% on
// every charge. The rule hangs off the partner (BillingProfile), and the whole
// subtree under it inherits — the same inheritance resolveReceiptEmail uses. An
// account with no tax-enabled partner above it resolves to rate 0, and every
// caller then behaves exactly as it did before this existed.

const { getEffectiveBilling } = require('./whopConfig');

/** Money is kept to the cent everywhere, rounded in exactly one place: here. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The breakdown for a charge. `subtotal` is always what the caller already
 * treats as the amount — credits requested, a cycle's outstanding, a period's
 * balance — and the tax goes ON TOP of it. What reaches the balance is the
 * subtotal; what the card pays is the total.
 */
function computeCharge(subtotal, taxConfig) {
  const rate = taxConfig?.taxEnabled ? (taxConfig.taxRate || 0) : 0;
  const base = round2(subtotal);
  const taxAmount = round2((base * rate) / 100);
  return {
    subtotal: base,
    taxRate: rate,
    taxLabel: taxConfig?.taxLabel || 'ITBIS',
    taxAmount,
    total: round2(base + taxAmount),
  };
}

/**
 * The tax governing `userId`. `options.partnerId` short-circuits the lookup of
 * who governs the account — used by tests, and by callers that already resolved
 * it. Never throws: a tax that cannot be resolved must not block a payment, so
 * anything unexpected reads as "no tax".
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
    console.error('[Taxes] Could not resolve the tax for user', userId, error.message);
    return NO_TAX;
  }
}

/** Resolve and compute in one call — what every charge path uses. */
async function resolveCharge(prisma, userId, subtotal) {
  const taxConfig = await resolveTaxConfig(prisma, userId);
  return { ...computeCharge(subtotal, taxConfig), profile: taxConfig.profile };
}

module.exports = { round2, computeCharge, resolveTaxConfig, resolveCharge };
