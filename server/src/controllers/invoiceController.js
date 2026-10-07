// Reading the invoices a settled payment produced.
//
// Everything a rendered invoice shows comes from the snapshots frozen on the
// row at issue time — issuerSnapshot and clientSnapshot — and NEVER from the
// live BillingProfile or User. That is the whole point of freezing them: an
// invoice issued in March must keep saying what it said in March, after the
// issuer changes its RNC, after the client moves office, and after the
// client's account is deleted altogether (Invoice.userId is nullable + SetNull
// for exactly that reason). Any renderer added later must read `issuer` and
// `client` from here and look nothing up.

const { issueInvoiceForPurchase, conceptFor } = require('../services/invoiceService');
const { resolveTaxConfig } = require('../utils/taxes');
const { getAncestorPartners } = require('../utils/whopConfig');

// A client's own invoice list is a side panel, not an accounting export: a cap
// keeps one account with years of auto-recharges from returning thousands of
// rows to a browser.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

/**
 * Parse one of the frozen JSON snapshot columns. A column that cannot be
 * parsed must not take the whole response down with it: the rest of the
 * document (the numbers, the dates, the invoice number) is still readable and
 * still worth showing, so a broken snapshot degrades to the empty shape and is
 * logged instead of thrown.
 */
function parseSnapshot(raw, fallback, label, invoiceId) {
  if (raw === null || raw === undefined || raw === '') return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed === null || parsed === undefined ? fallback : parsed;
  } catch (error) {
    console.error(`[Invoices] Invoice ${invoiceId} has an unreadable ${label}:`, error.message);
    return fallback;
  }
}

/**
 * Everything the document needs, with the three JSON columns parsed into the
 * shapes a renderer reads: `lines` (the DESCRIPCIÓN rows), `issuer` and
 * `client`. Pure and synchronous — it looks nothing up.
 */
function present(invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    taxLabel: invoice.taxLabel,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    retention: invoice.retention,
    total: invoice.total,
    // What was ACTUALLY collected for this document. Below `total` whenever the
    // issuer shows the tax without charging it to the client - which is the
    // whole reason the column exists, since the document then asks for more
    // than the money that came in and has to say so. Null on an invoice issued
    // before the column existed: that means "unknown", not "nothing paid", and
    // the renderer must not print a shortfall for it.
    amountPaid: invoice.amountPaid ?? null,
    totalInWords: invoice.totalInWords,
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt ?? null,
    // The payment this invoice was issued for, when it still exists. Null on an
    // invoice whose purchase was deleted (SetNull) — the invoice survives it.
    // Spelled `purchaseId` here and in the payments list, and it is the same id
    // the /by-purchase/:purchaseId route takes: one name for one thing, so the
    // client never translates between two spellings. The COLUMN stays
    // `creditPurchaseId`; only the API shape is normalised.
    purchaseId: invoice.creditPurchaseId ?? null,
    lines: parseSnapshot(invoice.conceptLines, [], 'conceptLines', invoice.id),
    issuer: parseSnapshot(invoice.issuerSnapshot, {}, 'issuerSnapshot', invoice.id),
    client: parseSnapshot(invoice.clientSnapshot, {}, 'clientSnapshot', invoice.id),
  };
}

/**
 * May this requester read what belongs to that account? The account itself, the
 * OWNER, or a partner above it — the same rule every other money-facing read in
 * the panel applies, walked with the same helper (getAncestorPartners).
 */
async function canReadAccount(prisma, requester, accountId) {
  if (!requester || !accountId) return false;
  if (requester.role === 'OWNER') return true;
  if (requester.id === accountId) return true;
  const account = await prisma.user.findUnique({ where: { id: accountId } });
  if (!account) return false;
  const ancestors = await getAncestorPartners(prisma, account);
  return ancestors.some((a) => a.id === requester.id);
}

/**
 * May this requester read this invoice?
 *
 * ORPHANED INVOICES (userId null, because the account it was issued to was
 * deleted) need their own answer: there is no account left to own the document
 * and no ancestor chain left to walk, so the normal rule would decide nothing.
 * The choice here is the OWNER, plus the partner that ISSUED it — the account
 * that owns the invoice's BillingProfile, which is the legal issuer of the
 * document and whose numbering sequence produced its number. It is a bounded
 * identity check against a column on the row, so it cannot become a way for an
 * unrelated account to read an orphan: every other requester, partner or not,
 * is refused. The alternative (falling back to "nobody but the OWNER") would
 * lock a partner out of its own fiscal history the moment it deletes a client,
 * which is precisely the history Dominican bookkeeping requires it to keep.
 */
async function canReadInvoice(prisma, requester, invoice) {
  if (!requester || !invoice) return false;
  if (requester.role === 'OWNER') return true;
  if (invoice.userId) return canReadAccount(prisma, requester, invoice.userId);

  const profile = await prisma.billingProfile.findUnique({ where: { id: invoice.profileId } });
  return !!profile && profile.ownerId === requester.id;
}

/**
 * One settled payment, with its invoice attached when there is one.
 *
 * `invoiceExpected` is the difference between a document that FAILED to be
 * issued and one that was never due, and it keys on `billsWithTax` - whether
 * THE ACCOUNT bills with tax at all, which is exactly the gate
 * issueInvoiceForPurchase applies.
 *
 * It used to key on `taxAmount > 0` on the payment itself, on the reasoning
 * that a payment carrying tax was charged under the tax and so was due a
 * document. That reasoning died with BillingProfile.chargeTaxToClient: a
 * partner can now show the tax on its invoices without charging it, so every
 * payment carries taxAmount 0 and every row would read "predates the tax" while
 * the account is in fact invoicing all of them. The account-level flag is the
 * honest question: if this account bills with tax, each of its settled payments
 * is due an invoice, and a null one is a failed emission to repair.
 *
 * `billsWithTax` false keeps the quiet third state for a caller that lists
 * payments for an account that does not invoice at all - nothing went wrong
 * there, so an invoice can be offered rather than flagged.
 */
function presentPayment(purchase, billsWithTax = false) {
  const taxAmount = purchase.taxAmount || 0;
  return {
    purchaseId: purchase.id,
    // CreditPurchase has no settlement timestamp - `updatedAt` moves on any
    // later write (the report being emailed, for one), so the payment's own
    // createdAt is the stable date. Off-session charges settle within seconds
    // of it; a hosted checkout within the minutes the client spent on the page.
    paidAt: purchase.createdAt,
    // The same Spanish text the invoice's DESCRIPCIÓN row carries, from the same
    // helper, so the list and the document cannot describe one payment two ways.
    concept: conceptFor(purchase),
    // What the card paid. With the tax shown but not charged this equals
    // `credits`, and the invoice's own `total` below is HIGHER than it - the two
    // are reported side by side on purpose so that gap is visible in the list.
    amount: purchase.amount,
    // The pre-tax subtotal - what actually reached the balance.
    credits: purchase.credits,
    // The rate and the tax the CARD paid, which is 0 unless the partner charges
    // the tax on top. The tax the DOCUMENT shows is on the invoice, computed
    // from the issuer's profile at issue time.
    taxRate: purchase.taxRate || 0,
    taxAmount,
    invoiceExpected: !!billsWithTax,
    invoice: purchase.invoice
      ? {
        id: purchase.invoice.id,
        number: purchase.invoice.number,
        // What the DOCUMENT asks for, which may exceed `amount` above.
        total: purchase.invoice.total,
        issuedAt: purchase.invoice.issuedAt,
      }
      : null,
  };
}

/**
 * The settled PAYMENTS of one account, newest first, each with its invoice
 * attached or null.
 * GET /api/invoices?limit=50[&forUserId=42]
 *
 * Payments rather than invoices because an invoice that was never issued is
 * exactly the one that needs issuing, and it cannot appear in a list of
 * invoices. Emission after a settlement is fire-and-forget - it must never undo
 * a payment that already went through - so a payment can end up settled with no
 * document. Listed this way, that payment is visible with `invoice: null` and
 * its `purchaseId` is what GET /api/invoices/by-purchase/:purchaseId needs to
 * repair it. There is no other surface in the app that carries a purchase id.
 *
 * `forUserId` lists ANOTHER account's payments instead of the caller's, which
 * is what the Facturas page needs the moment the person opening it is the one
 * who ISSUES: the platform OWNER has no payments of his own and a partner's
 * clients are the ones who paid, so for both of them their own list is empty
 * and there is nothing to invoice from. Allowed only for the OWNER or a partner
 * above that account - the same rule, from the same helper, that
 * /by-purchase/:purchaseId already applies before it issues, so what can be
 * listed and what can be issued cannot drift apart. A refusal is 403 and not an
 * empty list: an empty list reads as "this client never paid", which is a lie
 * that would have a manager hunting for payments that are simply not his to
 * see.
 */
const listMine = async (req, res) => {
  try {
    const requested = parseInt(req.query.limit);
    const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT, MAX_LIMIT);

    // Absent, this lists the caller and behaves exactly as it always did.
    let subjectId = req.user.id;
    if (req.query.forUserId !== undefined) {
      subjectId = parseInt(req.query.forUserId);
      if (!Number.isFinite(subjectId)) return res.status(400).json({ error: 'Cuenta no válida.' });

      if (!(await canReadAccount(req.prisma, req.user, subjectId))) {
        return res.status(403).json({ error: 'No puedes ver las facturas de esta cuenta.' });
      }
    }

    // The same gate issueInvoiceForPurchase applies: a profile AND its tax
    // switched on. An account that bills without tax has no invoices and never
    // will, so its screen gets an empty list and stays exactly as it is today
    // rather than growing a payments table it has no use for. resolveTaxConfig
    // never throws - it reads as "no tax" on any failure.
    //
    // RESOLVED FOR THE ACCOUNT BEING VIEWED, never for whoever is looking. The
    // flag answers "does THIS account bill with tax", and the manager asking is
    // typically one whose own account does not - LM's own payments carry no tax
    // - so reading it off the caller would tell a partner that its client's
    // payments cannot be invoiced while issuance happily invoices them.
    const { profile, taxEnabled } = await resolveTaxConfig(req.prisma, subjectId);
    if (!profile || !taxEnabled) return res.json({ billsWithTax: false, payments: [] });

    const purchases = await req.prisma.creditPurchase.findMany({
      where: { userId: subjectId, status: 'completed' },
      // By id, not createdAt: ids are monotonic and two payments in the same
      // second would otherwise come back in an arbitrary order.
      orderBy: { id: 'desc' },
      take: limit,
      select: {
        id: true,
        amount: true,
        credits: true,
        taxRate: true,
        taxAmount: true,
        createdAt: true,
        // conceptFor reads these to describe the payment.
        kind: true,
        billingPeriodId: true,
        periodStart: true,
        periodEnd: true,
        // Just enough to label and link the document; the document itself is
        // one more call, to GET /api/invoices/:id.
        invoice: { select: { id: true, number: true, total: true, issuedAt: true } },
      },
    });

    // `true` here, not a per-payment guess: this account bills with tax, so
    // every settled payment on it is due a document.
    res.json({ billsWithTax: true, payments: purchases.map((p) => presentPayment(p, true)) });
  } catch (error) {
    console.error('Error listing payments:', error.message);
    res.status(500).json({ error: 'No se pudieron cargar los pagos' });
  }
};

/**
 * The invoice for one payment, ISSUING it on the spot when it is missing.
 *
 * Emission after a settlement is fire-and-forget (a failure there must never
 * undo a payment that already went through), so a payment can end up settled
 * with no invoice on file. This endpoint is how that repairs itself: asking for
 * the invoice of a completed purchase issues it if it was never issued.
 * issueInvoiceForPurchase is idempotent and takes its number inside the same
 * transaction that bumps the sequence, so two clients asking at once cannot
 * produce two invoices or burn a number.
 *
 * GET /api/invoices/by-purchase/:purchaseId
 */
const getByPurchase = async (req, res) => {
  try {
    const purchaseId = parseInt(req.params.purchaseId);
    if (!Number.isFinite(purchaseId)) return res.status(400).json({ error: 'Pago no válido.' });

    const purchase = await req.prisma.creditPurchase.findUnique({ where: { id: purchaseId } });
    if (!purchase) return res.status(404).json({ error: 'Pago no encontrado.' });

    // Checked against the PAYMENT's account, before anything is issued: issuing
    // is a write, and nobody may trigger a write on an account they cannot read.
    if (!(await canReadAccount(req.prisma, req.user, purchase.userId))) {
      return res.status(403).json({ error: 'No puedes ver las facturas de esta cuenta.' });
    }

    const existing = await req.prisma.invoice.findUnique({ where: { creditPurchaseId: purchase.id } });
    if (existing) return res.json({ invoice: present(existing), issued: false });

    // Only a settled payment has an invoice to issue: a pending one may still
    // fail, and invoicing a failed payment would put a fiscal document on file
    // for money nobody paid.
    if (purchase.status !== 'completed') {
      return res.status(409).json({ error: 'Este pago todavía no está confirmado, así que no tiene factura.' });
    }

    const invoice = await issueInvoiceForPurchase(req.prisma, purchase);
    // Null means this payment is not one that gets invoiced at all — the
    // account bills with no tax, so there is no issuer and no document.
    if (!invoice) return res.status(404).json({ error: 'Este pago no genera factura.' });

    res.json({ invoice: present(invoice), issued: true });
  } catch (error) {
    console.error('Error reading the invoice for a payment:', error.message);
    res.status(500).json({ error: 'No se pudo cargar la factura' });
  }
};

/**
 * One invoice, with everything the document needs.
 * GET /api/invoices/:id
 */
const getOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (!Number.isFinite(id)) return res.status(404).json({ error: 'Factura no encontrada.' });

    const invoice = await req.prisma.invoice.findUnique({ where: { id } });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada.' });

    if (!(await canReadInvoice(req.prisma, req.user, invoice))) {
      return res.status(403).json({ error: 'No puedes ver esta factura.' });
    }

    res.json({ invoice: present(invoice) });
  } catch (error) {
    console.error('Error reading an invoice:', error.message);
    res.status(500).json({ error: 'No se pudo cargar la factura' });
  }
};

module.exports = {
  listMine,
  presentPayment,
  getOne,
  getByPurchase,
  present,
  canReadInvoice,
  canReadAccount,
};
