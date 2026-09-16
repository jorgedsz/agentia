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
  return true;
}

module.exports = { settleCreditPurchase };
