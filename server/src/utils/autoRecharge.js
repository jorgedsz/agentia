// Shared auto-recharge failure handling.
//
// A charge can fail two ways: synchronously (Whop rejects the API call) or
// asynchronously (Whop accepts it, then the payment.failed webhook arrives).
// Both funnel through recordAutoRechargeFailure so the fail counter, the stored
// decline reason (shown to the customer), and the auto-disable rule stay in one
// place.

const AUTO_RECHARGE_MAX_FAILS = 3; // consecutive failures before auto-recharge turns itself off

/**
 * Saved cards in priority order: primary first, then backup. Off-session charges
 * try them in this order — if the primary declines, the backup is tried next.
 * Returns [{ paymentMethodId, memberId, slot }].
 */
function getSavedCards(user) {
  const cards = [];
  if (user?.whopPaymentMethodId) {
    cards.push({ paymentMethodId: user.whopPaymentMethodId, memberId: user.whopMemberId || null, slot: 'primary' });
  }
  if (user?.whopPaymentMethodIdBackup) {
    cards.push({ paymentMethodId: user.whopPaymentMethodIdBackup, memberId: user.whopMemberIdBackup || null, slot: 'backup' });
  }
  return cards;
}

/**
 * Pull a human-readable decline reason out of a Whop error or webhook payload.
 * Falls back to a generic message so the customer never sees an empty reason.
 */
function extractDeclineReason(source) {
  if (!source) return 'The card was declined.';
  if (typeof source === 'string') return source;

  const candidates = [
    source.failure_reason,
    source.failure_message,
    source.last_payment_error?.message,
    source.error?.message,
    source.error_message,
    source.status_reason,
    source.decline_reason,
    // axios error shape
    source.response?.data?.error?.message,
    source.response?.data?.message,
    source.response?.data?.error,
    source.message,
  ];

  const reason = candidates.find((c) => typeof c === 'string' && c.trim());
  return reason ? reason.trim().slice(0, 500) : 'The card was declined.';
}

// A "stale card" error means the saved card / member doesn't exist in the Whop
// company we're charging — almost always because the card was vaulted in a
// different company (e.g. before the partner's own Whop was set up, or in the
// global company). It's NOT a bank decline: the fix is to re-add the card, not to
// retry it, so we don't count it toward the 3-strike auto-disable.
const STALE_CARD_MSG = 'Tu tarjeta guardada no es válida con el proveedor de pago actual. Quítala y agrégala de nuevo para que la auto-recarga funcione.';
function isStaleCardError(reasonSource) {
  const r = (typeof reasonSource === 'string' ? reasonSource : extractDeclineReason(reasonSource)).toLowerCase();
  return /member (was )?not found|member.*doesn'?t exist|payment ?method (was )?not found|no such (member|payment)|not found.*(member|payment)/.test(r);
}

/**
 * Record a failed auto-recharge charge: bump the consecutive-failure counter,
 * store the reason for the UI, and disable auto-recharge once it hits the cap.
 * A stale-card error is handled separately (clear, actionable, non-counting).
 * Returns { fails, disabled }. Never throws.
 */
async function recordAutoRechargeFailure(prisma, userId, reasonSource) {
  try {
    // Stale saved card (wrong Whop company): tell the user to re-add it and don't
    // disable auto-recharge — retrying the same card will never work.
    if (isStaleCardError(reasonSource)) {
      await prisma.user.update({
        where: { id: userId },
        data: { autoRechargeLastError: STALE_CARD_MSG, autoRechargeLastErrorAt: new Date() },
      });
      console.warn(`[Auto-Recharge] Stale saved card for user ${userId} (wrong Whop company) — asking to re-add: ${extractDeclineReason(reasonSource)}`);
      return { fails: 0, disabled: false, reason: STALE_CARD_MSG, staleCard: true };
    }

    const reason = extractDeclineReason(reasonSource);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { autoRechargeFailCount: true },
    });
    const fails = (user?.autoRechargeFailCount || 0) + 1;
    const disabled = fails >= AUTO_RECHARGE_MAX_FAILS;

    await prisma.user.update({
      where: { id: userId },
      data: {
        autoRechargeFailCount: fails,
        autoRechargeLastError: reason,
        autoRechargeLastErrorAt: new Date(),
        ...(disabled ? { autoRechargeEnabled: false } : {}),
      },
    });

    console.warn(
      `[Auto-Recharge] Charge failed for user ${userId} (fail ${fails}/${AUTO_RECHARGE_MAX_FAILS})` +
      `${disabled ? ' — AUTO-RECHARGE DISABLED' : ''}: ${reason}`
    );
    return { fails, disabled, reason };
  } catch (e) {
    console.error('[Auto-Recharge] Failed to record failure:', e.message);
    return { fails: 0, disabled: false, reason: null };
  }
}

module.exports = {
  AUTO_RECHARGE_MAX_FAILS,
  getSavedCards,
  extractDeclineReason,
  isStaleCardError,
  recordAutoRechargeFailure,
};
