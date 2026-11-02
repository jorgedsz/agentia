// WHICH OF AN ISSUER'S COMPANIES ISSUES FOR A CLIENT.
//
// An issuer (the account resolved by getEffectiveBilling) may own several
// BillingProfiles, one per legal entity it invoices from. This is the only place
// that turns "issuer + client" into one of them, so automatic issuance, the tax
// added at checkout and hand-made invoices cannot disagree about which company
// a client belongs to:
//
//   1. the client's own assignment (User.issuerProfileId), but ONLY if that
//      company belongs to this issuer - an assignment left over from before the
//      client moved to another partner is ignored, never honoured;
//   2. otherwise the issuer's default (isDefault), falling back to its oldest
//      company if none is flagged;
//   3. null when the issuer has no company at all.
//
// Who the issuer IS stays the caller's question (resolveTaxConfig keeps its
// own_stripe gate; resolveManualIssuerProfile does not) - this only picks
// among that issuer's companies.

const BY_DEFAULT_THEN_AGE = [{ isDefault: 'desc' }, { id: 'asc' }];

async function pickIssuerProfile(prisma, ownerId, clientId = null) {
  if (!ownerId) return null;
  if (clientId) {
    const assigned = await prisma.billingProfile.findFirst({
      where: { ownerId, assignedClients: { some: { id: clientId } } },
    });
    if (assigned) return assigned;
  }
  return prisma.billingProfile.findFirst({ where: { ownerId }, orderBy: BY_DEFAULT_THEN_AGE });
}

/** One company, only if it belongs to `ownerId`; null otherwise (or for a non-numeric id). */
async function findOwnedProfile(prisma, ownerId, profileId) {
  const id = Number(profileId);
  if (!ownerId || !Number.isInteger(id)) return null;
  return prisma.billingProfile.findFirst({ where: { id, ownerId } });
}

/** All of an issuer's companies, default first, then oldest first. */
async function listIssuerProfiles(prisma, ownerId) {
  if (!ownerId) return [];
  return prisma.billingProfile.findMany({ where: { ownerId }, orderBy: BY_DEFAULT_THEN_AGE });
}

module.exports = { pickIssuerProfile, findOwnedProfile, listIssuerProfiles };
