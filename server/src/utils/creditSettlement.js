// Turning a paid charge into credits, exactly once.
//
// With Stripe the same payment can reach us twice: the off-session charge
// returns "succeeded" synchronously AND the payment_intent.succeeded webhook
// arrives moments later (plus checkout.session.completed for hosted checkouts).
// Every path funnels through here, and the pending row is claimed with a
// conditional update, so only the first caller adds the balance.

/**
 * Credit a pending CreditPurchase. Returns true if this call is the one that
 * credited it, false if it was already settled by another path.
 */
async function settleCreditPurchase(prisma, purchase, { paymentIntentId, payload } = {}) {
  const claimed = await prisma.creditPurchase.updateMany({
    where: { id: purchase.id, status: 'pending' },
    data: {
      status: 'completed',
      ...(paymentIntentId ? { stripePaymentIntentId: paymentIntentId } : {}),
      ...(payload ? { rawPayload: JSON.stringify(payload).slice(0, 10000) } : {}),
    },
  });

  if (claimed.count !== 1) return false; // another path already credited it

  await prisma.user.update({
    where: { id: purchase.userId },
    data: {
      vapiCredits: { increment: purchase.credits },
      // A charge that went through means the saved card works again.
      autoRechargeFailCount: 0,
      autoRechargeLastError: null,
      autoRechargeLastErrorAt: null,
    },
  });

  console.log(`[Credits] Added ${purchase.credits} credits to user ${purchase.userId} (purchase #${purchase.id})`);

  // Paying a specific month settles that statement, not just the running balance.
  //
  // By `credits`, the PRE-TAX subtotal — never `amount`. Where a partner
  // collects a tax the two differ: a client paying $127 for a month of $100
  // consumption paid $100 against that month and $27 of tax that belongs to the
  // issuer, not to the statement. Crediting the taxed total here would mark the
  // month paid while $27 of its consumption was never actually covered (and
  // would leave settledAmount above the month's own total).
  if (purchase.billingPeriodId) {
    await require('../services/billingPeriods')
      .applyPayment(prisma, purchase.billingPeriodId, purchase.credits)
      .catch((err) => console.error('[Credits] Could not settle the billing period:', err.message));
  }

  // Email the client the usage this payment covers. Fire-and-forget on purpose:
  // the money is already in and the balance already updated, so a mail problem
  // must never turn a good payment into an error.
  //
  // Started inside a Promise.resolve().then() so the `require` itself is
  // covered too: a module that fails to load, or an export that is missing,
  // throws SYNCHRONOUSLY, which a trailing .catch() cannot see. That throw
  // would escape past the balance update above - exactly what this comment
  // promises cannot happen - and answer 500 on a charge that succeeded.
  Promise.resolve()
    .then(() => require('../services/paymentReport').sendPaymentReport(prisma, purchase))
    .catch((err) => console.error('[Credits] Payment report failed:', err.message));

  // Issue the fiscal document for this payment, for the partners that need one
  // (none at all when no tax-enabled issuer governs the account — then this
  // returns null and nothing happens). Fire-and-forget for the same reason as
  // the report above: the money is in and the balance is updated, so failing to
  // produce the document must never turn a good payment into an error. A
  // payment left without an invoice is repaired on demand later — issuing is
  // idempotent, so the repair hands back the existing invoice rather than
  // burning a second number on the same payment.
  //
  // Same Promise.resolve() wrapper as the report above, for the same reason:
  // it is what makes the `require` failing count as a rejection instead of a
  // synchronous throw that no .catch() here could ever see.
  Promise.resolve()
    .then(() => require('../services/invoiceService').issueInvoiceForPurchase(prisma, purchase))
    .catch((err) => console.error('[Credits] Could not issue the invoice:', err.message));

  return true;
}

module.exports = { settleCreditPurchase };
