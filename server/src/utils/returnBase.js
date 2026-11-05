// Where a checkout sends the user back to.
//
// The app runs on the platform's domain (CLIENT_URL) and on every partner's own
// login domain (e.g. a whitelabel's panel). A user who pays or saves a card has
// to come back to the domain they were on: that is where their session lives,
// and a partner's client must never be dropped on the platform's own brand.
//
// The domain comes from the request (Origin, else Referer) and is only trusted
// when it is the platform's or a registered login domain, so nobody can use a
// checkout to bounce a user to a site of their choosing.

function clientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

const hostOf = (value) => {
  try {
    const u = new URL(String(value));
    return { protocol: u.protocol, host: u.hostname.toLowerCase().replace(/^www\./, '') };
  } catch {
    return null;
  }
};

async function returnBase(req) {
  const fallback = clientUrl();
  const from = hostOf(req.get('origin') || req.get('referer') || '');
  if (!from || from.protocol !== 'https:') return fallback;
  const platform = hostOf(fallback);
  if (platform && from.host === platform.host) return fallback;
  try {
    const prisma = req.prisma;
    const owned = (await prisma.user.findUnique({ where: { loginDomain: from.host }, select: { id: true } }))
      || (await prisma.loginDomain.findUnique({ where: { host: from.host }, select: { id: true } }));
    return owned ? `https://${from.host}` : fallback;
  } catch {
    return fallback;
  }
}

/**
 * The base URL of a user's partner: the nearest partner above the account with
 * its own login domain, else the platform. For links built without a request
 * (scheduled notifications).
 */
async function partnerBase(prisma, userId) {
  try {
    const { getAncestorPartners } = require('./whopConfig');
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return clientUrl();
    for (const a of await getAncestorPartners(prisma, user)) {
      const p = await prisma.user.findUnique({ where: { id: a.id }, select: { loginDomain: true } });
      if (p?.loginDomain) return `https://${p.loginDomain}`;
    }
  } catch { /* fall back to the platform */ }
  return clientUrl();
}

module.exports = { returnBase, partnerBase };
