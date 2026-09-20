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

module.exports = { canManageAccount };
