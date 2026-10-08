// Handing a freshly issued invoice to n8n, which sends the mail.
//
// The owner's rule: every time a client loads credits and an invoice is issued,
// the receipt goes out by email — to the client AND to a fixed address of the
// issuer (its bookkeeper) — and WE do not send it. n8n already has the Google
// account connected for the usage report, so the invoice is handed over ALREADY
// ASSEMBLED (`html` plus every figure as structured data) and the sending flow
// lives there.
//
// This mirrors services/paymentReport.js deliberately: same `postToWebhook`,
// same encrypted-setting read, same `{ type, to, subject, html, ...data }`
// payload, and the same promise that a mail problem can never turn a good
// payment into an error — every path below returns `{ sent: false, reason }`
// instead of throwing.
//
// WHERE IT DIFFERS FROM THE REPORT, and why:
//
//   · NO GMAIL FALLBACK. The report falls back to gmailService when no webhook
//     is configured; an invoice does not. The owner asked for the document to
//     be handed to n8n, and an unconfigured webhook therefore means NO
//     automatic delivery at all — nothing changes for anyone — rather than the
//     platform quietly starting to email fiscal documents from its own account.
//   · A `cc`. The issuer's bookkeeper gets a copy of every invoice issued under
//     that profile (BillingProfile.invoiceCopyTo), and the key is left OUT of
//     the payload entirely when no copy address is configured, so the n8n flow
//     can forward `cc` straight through without testing it for emptiness.
//   · EXACTLY-ONCE is stamped on the invoice, not on the payment.
//     Invoice.deliveredAt is what keeps a repeat from re-sending a receipt the
//     client already has: issueInvoiceForPurchase hands back the invoice
//     ALREADY ON FILE when there is one, and the on-demand repair route calls
//     it again. A FAILED delivery leaves the column null on purpose, so the
//     invoice stays eligible.

const axios = require('axios');
const { decrypt } = require('../utils/encryption');
const { resolveReceiptEmail } = require('./creditCheckout');
const { present } = require('../controllers/invoiceController');
const { renderInvoiceHtml } = require('./invoiceHtml');

const money = (n, currency) => `${currency || 'USD'} ${(Number(n) || 0).toFixed(2)}`;

/** The configured webhook that emails invoices, or null. */
async function invoiceWebhookUrl(prisma) {
  try {
    const settings = await prisma.platformSettings.findFirst();
    return settings?.invoiceWebhookUrl ? decrypt(settings.invoiceWebhookUrl) : null;
  } catch (error) {
    console.error('[InvoiceDelivery] Could not read the invoice webhook:', error.message);
    return null;
  }
}

/**
 * The issuer's own copy address — its bookkeeper — read LIVE off the profile
 * that issued the document and not off the frozen issuerSnapshot. It says where
 * the mail goes, not what the paper says: the address in force now is the right
 * one, exactly as the webhook URL is.
 *
 * Blank, unset or unreadable means "no copy", and the invoice then goes to the
 * client alone rather than not going at all.
 */
async function copyToFor(prisma, invoice) {
  try {
    const profile = await prisma.billingProfile.findUnique({
      where: { id: invoice.profileId },
      select: { invoiceCopyTo: true },
    });
    return profile?.invoiceCopyTo?.trim() || null;
  } catch (error) {
    console.error('[InvoiceDelivery] Could not read the issuer copy address:', error.message);
    return null;
  }
}

async function postToWebhook(url, payload) {
  try {
    await axios.post(url, payload, { timeout: 15000 });
    return { sent: true, via: 'webhook' };
  } catch (error) {
    return { sent: false, reason: `webhook failed: ${error.response?.status || error.message}` };
  }
}

/**
 * Hand one invoice to the delivery webhook and stamp `deliveredAt`.
 *
 * `invoice` is the ROW, as issueInvoiceForPurchase returns it. Returns
 * `{ sent, reason? }` and never throws: this runs fire-and-forget behind a card
 * charge that already went through.
 */
async function deliverInvoice(prisma, invoice) {
  try {
    if (!invoice) return { sent: false, reason: 'no invoice' };
    // Already handed over. The guard is first so a repeat costs one field read
    // and no network call, and it is checked on the ROW rather than on a flag
    // the caller passes, because the row is the only thing both the settlement
    // path and any later repair share.
    if (invoice.deliveredAt) return { sent: false, reason: 'already delivered' };

    // Nothing configured, nothing happens — and deliberately no Gmail fallback
    // (see the file header). Read BEFORE the recipients and the html, so an
    // install that never wanted this pays for one settings read.
    const webhook = await invoiceWebhookUrl(prisma);
    if (!webhook) return { sent: false, reason: 'no invoice webhook configured' };

    // The account the document was issued TO. Null on an orphaned invoice whose
    // client account was deleted — which cannot happen on the issuance path
    // this is called from, but is handled rather than assumed.
    const user = invoice.userId
      ? await prisma.user.findUnique({ where: { id: invoice.userId } })
      : null;
    if (!user) return { sent: false, reason: 'account not found' };

    // The client's address: the same resolution the Stripe receipt uses, which
    // walks up to the partner and falls back to the account's own email.
    const [to, cc] = await Promise.all([
      resolveReceiptEmail(prisma, user),
      copyToFor(prisma, invoice),
    ]);
    if (!to) return { sent: false, reason: 'no client address' };

    // The same shape the panel and the React document read, so the html built
    // below and the document the client can download come from one source.
    const doc = present(invoice);
    const html = renderInvoiceHtml(doc);
    const payer = doc.client?.company || user.companyName || user.name || user.email;
    const subject = `Factura ${doc.number} · ${money(doc.total, doc.currency)} · ${payer}`;

    const result = await postToWebhook(webhook, {
      type: 'invoice',
      to,
      // Omitted entirely when the issuer configured no copy address.
      ...(cc ? { cc } : {}),
      subject,
      html,
      // The brand the client knows, off the FROZEN snapshot rather than looked
      // up: the document says it, so the email that carries it says the same.
      brand: doc.issuer?.brandName || doc.issuer?.issuerName || null,
      client: {
        id: user.id,
        name: user.companyName || user.name || user.email,
        email: user.email,
      },
      // Every figure on the document, so n8n can render its own version if the
      // ready-made html does not fit — the same reason the usage report ships
      // its day-by-day detail next to its html. `present` is what the panel
      // gets too, so there is one documented shape and not two.
      invoice: {
        id: doc.id,
        number: doc.number,
        currency: doc.currency,
        subtotal: doc.subtotal,
        taxLabel: doc.taxLabel,
        taxRate: doc.taxRate,
        taxAmount: doc.taxAmount,
        retention: doc.retention,
        retentionLabel: doc.retentionLabel,
        total: doc.total,
        amountPaid: doc.amountPaid,
        totalInWords: doc.totalInWords,
        issuedAt: doc.issuedAt,
        dueAt: doc.dueAt,
        paidAt: doc.paidAt,
        regeneratedAt: doc.regeneratedAt,
        purchaseId: doc.purchaseId,
        // The DESCRIPCIÓN rows, and both frozen snapshots.
        lines: doc.lines,
        issuer: doc.issuer,
        client: doc.client,
      },
    });

    if (result.sent) {
      // Stamped only on a delivery that actually went out. A failure leaves the
      // column null, which is what keeps the invoice eligible later.
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { deliveredAt: new Date() },
      }).catch(() => {});
      console.log(`[InvoiceDelivery] Invoice ${doc.number} handed over for ${to}${cc ? ` (cc ${cc})` : ''}`);
    } else {
      console.warn(`[InvoiceDelivery] Invoice ${doc.number} not delivered: ${result.reason}`);
    }
    return result;
  } catch (error) {
    console.error('[InvoiceDelivery] Failed:', error.message);
    return { sent: false, reason: error.message };
  }
}

module.exports = {
  deliverInvoice,
  invoiceWebhookUrl,
};
