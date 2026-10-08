// Issuing an invoice for a settled payment.
//
// This only fires for a partner whose BillingProfile exists AND has its tax
// switched on (see issueInvoiceForPurchase below) - a partner with a profile
// but taxEnabled: false keeps behaving exactly as it did before this feature
// existed: no tax, no invoice. That's deliberate: it's what lets this whole
// feature ship dark, one partner at a time, by flipping a single flag.
//
// THE TAX ON THE DOCUMENT IS COMPUTED HERE, FROM THE PROFILE - never read off
// the purchase. CreditPurchase.taxAmount is what the CARD paid in tax, and that
// is 0 whenever the partner only SHOWS the tax instead of charging it
// (BillingProfile.chargeTaxToClient, see utils/taxes.js). Reading the purchase
// would then print a document with no tax row at all, which is the opposite of
// what taxEnabled means. Computing it from the profile is correct in both
// modes:
//
//   · tax charged     purchase.amount already equals credits + taxAmount, so
//                     the invoice total matches the card to the cent.
//   · tax not charged  the invoice total deliberately EXCEEDS what was
//                     collected, and `amountPaid` records the difference so the
//                     document can say so instead of hiding it.
//
// THE RETENCIÓN IS COMPUTED THE SAME WAY, AND THE NET IS GROSSED UP FROM THE
// MONEY THAT ARRIVED. BillingProfile.retentionRate is a WITHHOLDING, and the
// money the client paid is what the issuer RECEIVES - so it is the TOTAL A
// PAGAR at the bottom of the block, not the net at the top of it. The net is
// what the document would have asked for before the withholding, which is the
// received amount divided by (1 - rate): at 27% a $100 purchase invoices as
// TOTAL NETO 136.99 · RETENCIÓN 36.99 · TOTAL A PAGAR 100.00.
//
// THAT DIVISION IS WHAT THE OWNER'S ACCOUNTANT'S OWN INVOICE DOES, and it is
// the reason this is a division and not a multiplication. His document reads
// TOTAL NETO 2,191.82 · RETENCIÓN 591.79 · TOTAL A PAGAR 1,600.00, and
// 1600 / (1 - 0.27) = 2,191.78 reproduces it while 1600 * 1.27 = 2,032 does
// not. The owner first described it as a multiplication, was shown the
// discrepancy against his own paper, and chose the division.
//
// That document has no tax row at all (taxRate left at 0 with taxEnabled on,
// which is what still lets invoices be issued). With BOTH rates set the
// grossed-up net is also what the tax is taken on, and the total is
// subtotal + taxAmount - retention = received + taxAmount - see buildInvoiceData.

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
 * The issuer half of the frozen document, as the JSON string that goes in the
 * column. Split out of buildInvoiceData so that regeneration (which refreshes
 * the snapshots without necessarily touching the money) cannot grow a second
 * copy of this shape that drifts from the one issuance writes.
 *
 * Frozen at issue time - a Dominican accountant may need to read this years
 * after the issuer's own profile changed or the client's account was deleted
 * (Invoice.userId is nullable + SetNull for exactly that reason). Every value
 * defaults to '' rather than null/undefined because the renderer prints these
 * fields directly.
 */
function buildIssuerSnapshot(profile) {
  return JSON.stringify({
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
}

/**
 * The client half, same reasoning as buildIssuerSnapshot above.
 *
 * client.email has no billing* counterpart on the User model (only
 * billingCompany/Rnc/Address/City/Phone exist) - the account's own email is
 * always present (required + unique), so it is used as-is rather than invented
 * as a fallback chain of its own.
 */
function buildClientSnapshot(client) {
  return JSON.stringify({
    company: client.billingCompany || client.companyName || client.name || '',
    rnc: client.billingRnc || '',
    address: client.billingAddress || '',
    city: client.billingCity || '',
    phone: client.billingPhone || client.phoneNumber || '',
    email: client.email || '',
  });
}

/**
 * The plain object for prisma.invoice.create({ data }). Pure and synchronous:
 * every value it needs is already on `profile`, `client` and `purchase`.
 */
function buildInvoiceData({ profile, client, purchase, number, issuedAt = new Date() }) {
  // WHAT THE CLIENT PAID IS WHAT THE ISSUER RECEIVES, so it belongs at the
  // BOTTOM of the totals block and the net is grossed up from it - see the file
  // header. `purchase.credits` is still exactly what reached the balance in
  // either mode; it is only its place on the document that changed.
  const received = purchase.credits;
  // Off the ISSUER'S PROFILE at issue time, exactly like the tax below and for
  // the same reason (see the file header): the purchase has no column that could
  // carry it, and the rate that governs the document is the issuer's.
  //
  // NOT gated on `taxEnabled`. That flag means "this partner's invoices show
  // the TAX", and the owner's configuration is precisely the one where the tax
  // is off and the retention is 27 - gating the retention behind taxEnabled
  // would make his document unreachable. Issuance itself is still gated on
  // taxEnabled (see issueInvoiceForPurchase), so a partner that invoices at all
  // has it on regardless; this only decides what the totals block says.
  const retentionRate = profile.retentionRate || 0;
  // A RATE AT OR ABOVE 100 HAS NO NET TO SPEAK OF: the divisor below is
  // 1 - rate/100, which is 0 at exactly 100 (Infinity) and negative above it (a
  // negative net). sanitizeProfileInput refuses to STORE such a rate, but a row
  // saved before it did can still be read back here, so this throws rather than
  // freezing Infinity - or a negative total - into a fiscal document. Same
  // reasoning as the uncaught amountToSpanishWords RangeError further down: this
  // runs inside the issuance $transaction, so the throw rolls the correlative
  // back instead of filing a defective invoice.
  if (retentionRate >= 100) {
    throw new RangeError(
      `retentionRate must be below 100 to gross the net up, got ${retentionRate}`,
    );
  }
  // THE NET, GROSSED UP. At rate 0 the divisor is 1 and `received` is handed
  // through UNTOUCHED - not even rounded - so a profile with no retention
  // produces byte-for-byte the document it produced before any of this existed.
  const subtotal = retentionRate > 0
    ? round2(received / (1 - retentionRate / 100))
    : received;
  // round2 rather than hand-rolled rounding, and it throws on a non-finite
  // subtotal exactly as the `total` line below already did.
  const taxRate = profile.taxEnabled ? (profile.taxRate || 0) : 0;
  const taxAmount = round2((subtotal * taxRate) / 100);
  // THE RETENCIÓN IS SUBTRACTED, NOT ADDED - that is the whole difference
  // between it and the tax above. Taken at its nominal rate off the grossed-up
  // net, which is also what brings the total back to exactly what was received.
  //
  // THE INVARIANT: `total` equals `received`, to the cent, whenever no tax is
  // set. That is not luck and it is not approximate. In integer cents, with
  // f = 1 - rate/100 and c the cents received: subtotal = c/f + d with
  // |d| <= 0.5 (one round2), retention = subtotal*(1-f) + e with |e| <= 0.5
  // (the other), so subtotal - retention = c + d*f - e. For f < 1 that error is
  // strictly below 1 cent, and both sides are whole cents, so it is 0 cents.
  // Measured as well as argued: every cent from 0.01 to 2,000.00 at each of 17
  // rates (0.01, 1, 5, 10, 16, 18, 27, 30, 33.33, 50, 66.67, 75, 90, 99, 99.5,
  // 99.99, 12.345) - 3,400,000 cases, 0 mismatches - and deriving the retention
  // the other way round instead, as `subtotal - received`, gave a figure
  // IDENTICAL to this one in all 3,400,000. So the money wins at no cost to the
  // retention's nominal percentage, and the nominal form is kept because it is
  // the one the renderer can read the rate back out of (rateFromAmount in
  // InvoiceDocument.jsx divides the retention by the subtotal). The sweep is
  // pinned as a permanent test in tests/invoiceService.test.js.
  const retention = round2((subtotal * retentionRate) / 100);
  // A partner that sets BOTH rates gets both rows. The tax is taken on the
  // GROSSED-UP net, so the total comes out at received + taxAmount: the
  // retention cancels itself against the gross-up and the document asks for the
  // money that arrived plus the tax. See the warning on the config screen -
  // with the tax not charged to the client, that excess is the shortfall band.
  const total = round2(subtotal + taxAmount - retention);
  // What was really collected for this document, so it can be reconciled
  // against the payment. With no tax it now equals `total` exactly - that is the
  // invariant the retention arithmetic above exists to hold - and it falls BELOW
  // the total by the tax whenever the tax is shown without being charged, which
  // is the case where the document's TOTAL A PAGAR is knowingly above the money
  // that came in and the renderer prints the shortfall. Null
  // only if the purchase carries no usable amount at all, which reads as
  // "unknown" and makes the renderer say nothing rather than invent a shortfall.
  const amountPaid = Number.isFinite(purchase.amount) ? purchase.amount : null;
  const taxLabel = profile.taxLabel || 'ITBIS';
  // Frozen onto the document for the same reason taxLabel is: the issuer may
  // later remit under a different form, and an invoice already in an
  // accountant's hands must keep the name it was issued under. Blank or absent
  // falls back to the literal the format printed before the column existed.
  const retentionLabel = profile.retentionLabel?.trim() || 'RETENCIÓN';
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

  // WHEN THE CLIENT ACTUALLY PAID, frozen onto the document like everything
  // else on it. `settledAt` is stamped by utils/creditSettlement.js in the one
  // conditional update that turns the payment into balance, so from now on this
  // is the real collection moment.
  //
  // THE FALLBACK IS `createdAt` AND NOT A NULL. Every purchase settled before
  // that column existed has settledAt null, and `createdAt` is when the
  // checkout or the charge was STARTED: seconds before the money for an
  // off-session charge, and at most the minutes a client spent on a hosted
  // Stripe page otherwise. So for history this is accurate to within minutes
  // and never wrong by a day - which is the unit a fiscal document is read in -
  // whereas printing nothing at all would leave the owner with a document that
  // answers the question for new payments and refuses to for old ones. What is
  // deliberately NOT used is `updatedAt`: it moves on any later write to the
  // purchase (the usage report stamping reportSentAt, for one), so it is not a
  // payment date at all and would drift arbitrarily far from one.
  const paidAt = purchase.settledAt ?? purchase.createdAt;

  // Frozen now, at issue time - see buildIssuerSnapshot / buildClientSnapshot.
  const issuerSnapshot = buildIssuerSnapshot(profile);
  const clientSnapshot = buildClientSnapshot(client);

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
    retentionLabel,
    total,
    amountPaid,
    totalInWords,
    conceptLines,
    issuerSnapshot,
    clientSnapshot,
    issuedAt,
    dueAt,
    paidAt,
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

/**
 * The plain object for prisma.invoice.update({ data }) when an invoice is
 * REBUILT from current data while keeping its number.
 *
 * Freezing the snapshots is right once a partner is set up and wrong while it
 * still is: a wrong RNC, a missing logo or a typo in the bank line is otherwise
 * baked into every document already issued. This is the way out, and the owner
 * accepted its cost - a client holding the previous copy of this number will
 * find it changed - which is why `regeneratedAt` is part of the same write and
 * is printed on the document.
 *
 * WHAT IT DELIBERATELY DOES NOT RETURN: `number`, `profileId`, `userId`,
 * `creditPurchaseId` and `issuedAt`. It is the same document, not a new one, so
 * its identity and its date are the caller's and are not up for recomputation -
 * moving `issuedAt` would misdate the whole sequence. Everything else is taken
 * again from `profile`, `client` and `purchase`.
 *
 * THE MONEY IS BUILT BY buildInvoiceData AND NOWHERE ELSE. That function is the
 * one that knows the tax comes off the ISSUER and not off the payment, and that
 * `purchase.credits` is the money RECEIVED with the net grossed up from it (so a
 * regenerated document follows a change of retention rate the same way issuance
 * would, net and total together); a second arithmetic here could disagree
 * with the one issuance uses, and a document whose total depends on which code
 * path wrote it is worse than no feature at all. Its identity fields are
 * stripped off the result rather than never computed, so this stays one source.
 *
 * WHEN THE PURCHASE IS GONE (creditPurchaseId null, because the payment or the
 * whole account was deleted - the FK is SetNull so the invoice outlives it)
 * there is nothing left to recompute the amounts FROM, and the figures stored on
 * the row are the only surviving record of them. The party snapshots are
 * refreshed and every money field is left exactly as it is: an invoice that
 * suddenly totalled 0.00 because its payment was deleted would be a destroyed
 * fiscal record, not a corrected one. `paidAt` follows the same rule and for
 * the same reason - the date the client paid was read off that purchase, so
 * with the purchase gone the stored date is all that is left of it. `dueAt` is
 * still recomputed, since it needs only the unchanged `issuedAt` and the
 * profile's current `dueDays` and asks nothing of the purchase.
 *
 * A missing `client` (an orphaned invoice whose account was deleted) leaves
 * `clientSnapshot` untouched for the same reason: the snapshot is all that is
 * left of who the document was addressed to.
 */
function buildRegeneratedInvoiceData({ invoice, profile, client, purchase, regeneratedAt = new Date() }) {
  const data = {
    issuerSnapshot: buildIssuerSnapshot(profile),
    dueAt: addDays(invoice.issuedAt, profile.dueDays || 0),
    regeneratedAt,
  };
  if (client) data.clientSnapshot = buildClientSnapshot(client);

  // No payment left to rebuild the amounts from: snapshots only.
  if (!purchase || !client) return data;

  const fresh = buildInvoiceData({
    profile,
    client,
    purchase,
    number: invoice.number,
    issuedAt: invoice.issuedAt,
  });

  return {
    ...data,
    subtotal: fresh.subtotal,
    taxLabel: fresh.taxLabel,
    taxRate: fresh.taxRate,
    taxAmount: fresh.taxAmount,
    retention: fresh.retention,
    retentionLabel: fresh.retentionLabel,
    total: fresh.total,
    amountPaid: fresh.amountPaid,
    totalInWords: fresh.totalInWords,
    conceptLines: fresh.conceptLines,
    clientSnapshot: fresh.clientSnapshot,
    issuerSnapshot: fresh.issuerSnapshot,
    dueAt: fresh.dueAt,
    // Taken again off the purchase, so it is listed HERE and never in `data`
    // above: with no purchase left there is nothing to read the payment date
    // from, and the value stored on the row is the only surviving record of it -
    // exactly the rule the money fields follow, for exactly the same reason.
    paidAt: fresh.paidAt,
  };
}

module.exports = {
  issueInvoiceForPurchase,
  buildInvoiceData,
  buildRegeneratedInvoiceData,
  buildIssuerSnapshot,
  buildClientSnapshot,
  formatNumber,
  conceptFor,
};
