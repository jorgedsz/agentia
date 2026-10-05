// Issuing an invoice for a settled payment.
//
// This only fires for a partner whose BillingProfile exists AND has its tax
// switched on (see issueInvoiceForPurchase below) - a partner with a profile
// but taxEnabled: false keeps behaving exactly as it did before this feature
// existed: no tax, no invoice. That's deliberate: it's what lets this whole
// feature ship dark, one partner at a time, by flipping a single flag.

const { round2, resolveTaxConfig } = require('../utils/taxes');
const { amountToSpanishWords } = require('../utils/numberToWords');

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

const PERIOD_DATE_FORMAT = new Intl.DateTimeFormat('es-DO', {
  timeZone: 'America/Santo_Domingo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** "FAC-" + 124 padded to 6 -> "FAC-000124". "B02" + 7 padded to 8 -> "B0200000007". */
function formatNumber(profile, correlative) {
  return `${profile.invoicePrefix}${String(correlative).padStart(profile.invoicePadding, '0')}`;
}

/**
 * The DESCRIPCIÓN row text for a purchase, in Spanish. billingPeriodId wins
 * over `kind` whenever it's set - a payment that settles a billing period is
 * described as that settlement regardless of how it was collected.
 */
function conceptFor(purchase) {
  if (purchase.billingPeriodId) return 'Liquidación del periodo facturado';
  if (purchase.kind === 'auto_recharge') return 'Recarga automática de saldo';
  if (purchase.kind === 'cycle_topup') {
    if (!purchase.periodStart || !purchase.periodEnd) return 'Consumo del periodo';
    const start = PERIOD_DATE_FORMAT.format(new Date(purchase.periodStart));
    const end = PERIOD_DATE_FORMAT.format(new Date(purchase.periodEnd));
    return `Consumo del periodo ${start} – ${end}`;
  }
  // "manual" (hosted checkout) and "manual_card" (off-session 1-click) both
  // land here - a plain balance top-up with nothing more specific to say.
  return 'Recarga de saldo — créditos de consumo';
}

/**
 * The plain object for prisma.invoice.create({ data }). Pure and synchronous:
 * every value it needs is already on `profile`, `client` and `purchase`.
 */
function buildInvoiceData({ profile, client, purchase, number, issuedAt = new Date() }) {
  const subtotal = purchase.credits;
  const taxAmount = purchase.taxAmount || 0;
  const retention = 0; // v1 always writes 0 - see Invoice.retention in schema.prisma
  const total = round2(subtotal + taxAmount - retention);
  const taxRate = purchase.taxRate || 0;
  const taxLabel = profile.taxLabel || 'ITBIS';
  const currency = 'USD';

  // amountToSpanishWords throws a RangeError at/above 1,000,000 (see its own
  // file header - a million+ is out of scope for a credit top-up or a
  // monthly settlement). That's deliberately left UNCAUGHT here rather than
  // swallowed into a placeholder: this runs inside the same $transaction
  // that bumps the profile's correlative and inserts the Invoice row, so a
  // throw here rolls both back instead of leaving a fiscal document on file
  // that is missing its legally-expected "TOTAL EN LETRAS" band. A total
  // this large almost certainly means something upstream is wrong (a credit
  // purchase should never reach seven figures); failing loudly at issue time
  // surfaces that immediately instead of shipping a defective invoice.
  const totalInWords = amountToSpanishWords(total);

  const conceptLines = JSON.stringify([{ description: conceptFor(purchase), total: subtotal }]);

  const dueAt = addDays(issuedAt, profile.dueDays || 0);

  // Frozen now, at issue time - a Dominican accountant may need to read this
  // years after the issuer's own profile changed or the client's account was
  // deleted (Invoice.userId is nullable + SetNull for exactly that reason).
  // Every value defaults to '' rather than null/undefined because the
  // renderer prints these fields directly.
  const issuerSnapshot = JSON.stringify({
    issuerName: profile.issuerName || '',
    issuerRnc: profile.issuerRnc || '',
    brandName: profile.brandName || '',
    slogan: profile.slogan || '',
    logoUrl: profile.logoUrl || '',
    bankName: profile.bankName || '',
    bankAccount: profile.bankAccount || '',
    swift: profile.swift || '',
    routingNumber: profile.routingNumber || '',
    paymentMethod: profile.paymentMethod || '',
    paymentTerms: profile.paymentTerms || '',
    site1: {
      name: profile.site1Name || '',
      phone: profile.site1Phone || '',
      city: profile.site1City || '',
      address: profile.site1Address || '',
    },
    site2: {
      name: profile.site2Name || '',
      phone: profile.site2Phone || '',
      city: profile.site2City || '',
      address: profile.site2Address || '',
    },
    contactEmail: profile.contactEmail || '',
    contactWeb: profile.contactWeb || '',
  });

  // client.email has no billing* counterpart on the User model (only
  // billingCompany/Rnc/Address/City/Phone exist) - the account's own email
  // is always present (required + unique), so it's used as-is rather than
  // invented as a fallback chain of its own.
  const clientSnapshot = JSON.stringify({
    company: client.billingCompany || client.companyName || client.name || '',
    rnc: client.billingRnc || '',
    address: client.billingAddress || '',
    city: client.billingCity || '',
    phone: client.billingPhone || client.phoneNumber || '',
    email: client.email || '',
  });

  return {
    number,
    profileId: profile.id,
    userId: client.id,
    creditPurchaseId: purchase.id,
    currency,
    subtotal,
    taxLabel,
    taxRate,
    taxAmount,
    retention,
    total,
    totalInWords,
    conceptLines,
    issuerSnapshot,
    clientSnapshot,
    issuedAt,
    dueAt,
  };
}

/**
 * Issue (or return the already-issued) invoice for a settled CreditPurchase.
 * Returns null when this payment isn't one that gets invoiced at all: no
 * governing BillingProfile, or one that exists with its tax still off.
 */
async function issueInvoiceForPurchase(prisma, purchase) {
  const existing = await prisma.invoice.findUnique({ where: { creditPurchaseId: purchase.id } });
  if (existing) return existing;

  // Both a profile AND taxEnabled must be true. A profile alone (tax not yet
  // switched on) must not start producing invoices - see file header.
  const { profile, taxEnabled } = await resolveTaxConfig(prisma, purchase.userId);
  if (!profile || !taxEnabled) return null;

  // The client always exists at issue time - this runs right after its own
  // payment settled. No defensive null handling here; Invoice.userId is
  // nullable only so the invoice can survive a LATER account deletion.
  const client = await prisma.user.findUnique({ where: { id: purchase.userId } });
  if (!client) return null;

  return prisma.$transaction(async (tx) => {
    // The correlative is taken by bumping the counter inside this same
    // transaction: if the insert below fails, the increment rolls back with
    // it instead of burning a number nobody used.
    const bumped = await tx.billingProfile.update({
      where: { id: profile.id },
      data: { invoiceNextNumber: { increment: 1 } },
    });
    const correlative = bumped.invoiceNextNumber - 1;
    const number = formatNumber(bumped, correlative);
    const data = buildInvoiceData({ profile: bumped, client, purchase, number });
    return tx.invoice.create({ data });
  });
}

module.exports = { issueInvoiceForPurchase, buildInvoiceData, formatNumber, conceptFor };
