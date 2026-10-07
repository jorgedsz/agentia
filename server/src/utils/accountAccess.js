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

/**
 * May this requester configure the invoicing profile of that account?
 *
 * A different question from canManageAccount above, and deliberately NOT the
 * same answer. A BillingProfile is not something done TO an account from above:
 * it is the issuer identity of the partner it hangs off — its RNC, its bank
 * account, its numbering sequence — and the tax it defines applies to that
 * partner's whole subtree. So:
 *
 *   · the OWNER may read and write any account's profile (platform support);
 *   · a WHITELABEL or an AGENCY may read and write ONLY ITS OWN — which is the
 *     opposite of canManageAccount, that refuses self on purpose, and narrower
 *     than invoiceController's canReadAccount, that also allows the partners
 *     ABOVE the account (a provider's bank details are not its reseller's
 *     business, and the subtree rule would let a whitelabel mint an issuer
 *     under any agency it hosts);
 *   · a CLIENT may not touch any profile at all, not even its own. A client has
 *     no subtree and issues nothing, so a profile on a client row would be a
 *     dead issuer resolveTaxConfig never consults, plus a way to put a tax
 *     label on an account that cannot invoice.
 *
 * Refused BY ROLE first and by id second, and synchronous on purpose: it needs
 * no database, so it can be called as the very first thing a handler does —
 * before the upsert that would otherwise create a row under somebody else's id.
 */
const BILLING_PROFILE_SELF_ROLES = ['WHITELABEL', 'AGENCY'];

function canConfigureBillingProfile(requester, targetId) {
  if (!requester || !requester.role) return false;
  const target = Number(targetId);
  if (!Number.isInteger(target)) return false;
  if (requester.role === 'OWNER') return true;
  if (!BILLING_PROFILE_SELF_ROLES.includes(requester.role)) return false;
  return Number(requester.id) === target;
}

module.exports = { canManageAccount, managedAccountIds, canConfigureBillingProfile };
