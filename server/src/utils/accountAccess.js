// Who may act on whose account.
//
// The OWNER may act on any account. A partner may act on the accounts inside its
// own subtree and nowhere else — resolved by walking up from the target, so it
// holds for an agency's clients as well as the agency itself. Nobody may use
// these admin paths on their own account: self-service has its own flows.

const { getAncestorPartners } = require('./whopConfig');

async function canManageAccount(prisma, requester, target) {
  if (!requester || !target || requester.id === target.id) return false;
  if (requester.role === 'OWNER') return true;
  if (requester.role !== 'AGENCY' && requester.role !== 'WHITELABEL') return false;

  const ancestors = await getAncestorPartners(prisma, target).catch(() => []);
  return ancestors.some((partner) => partner.id === requester.id);
}

/**
 * Every account this person may act on, walking down instead of up: their own
 * subtree, never themselves. The OWNER gets null, meaning "no limit".
 */
async function managedAccountIds(prisma, requester) {
  if (!requester) return [];
  if (requester.role === 'OWNER') return null;
  if (requester.role !== 'AGENCY' && requester.role !== 'WHITELABEL') return [];

  const ids = new Set();
  let frontier = [requester.id];
  // partner → agency → client is as deep as the tree goes today; the loop
  // keeps going anyway so a deeper one is not silently cut off.
  for (let depth = 0; depth < 5 && frontier.length; depth += 1) {
    const children = await prisma.user.findMany({
      where: { OR: [{ agencyId: { in: frontier } }, { whitelabelId: { in: frontier } }] },
      select: { id: true },
    });
    frontier = children.map((c) => c.id).filter((id) => id !== requester.id && !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  return [...ids];
}

module.exports = { canManageAccount, managedAccountIds };
