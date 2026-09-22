// Whether an account should see its Twilio balance. A partner (e.g. LM Consulting)
// with hideTwilioBalance hides it from every account below it — its agencies and
// their clients — but still sees its own. Walks the ownership chain upward
// (agency → whitelabel) starting from the parent, never from the account itself.
async function hidesTwilioBalance(prisma, userId) {
  if (!userId) return false;
  const select = { id: true, hideTwilioBalance: true, agencyId: true, whitelabelId: true };
  const seen = new Set([userId]);
  const self = await prisma.user.findUnique({ where: { id: userId }, select });
  let parentId = self ? self.agencyId || self.whitelabelId : null;
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId);
    const current = await prisma.user.findUnique({ where: { id: parentId }, select });
    if (!current) break;
    if (current.hideTwilioBalance) return true;
    parentId = current.agencyId || current.whitelabelId;
  }
  return false;
}

module.exports = { hidesTwilioBalance };
