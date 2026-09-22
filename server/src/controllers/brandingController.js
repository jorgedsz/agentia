const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Resolve the effective "Credits" label for a user by walking up the ownership
// chain (self → agency → whitelabel). Returns null if nobody set a custom one, so
// the client falls back to the default word.
async function resolveCreditsLabel(userId) {
  const seen = new Set();
  let current = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, creditsLabel: true, agencyId: true, whitelabelId: true },
  });
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    if (current.creditsLabel) return current.creditsLabel;
    const parentId = current.agencyId || current.whitelabelId;
    if (!parentId) break;
    current = await prisma.user.findUnique({
      where: { id: parentId },
      select: { id: true, creditsLabel: true, agencyId: true, whitelabelId: true },
    });
  }
  return null;
}

// Public — resolve whitelabel branding from the request's Host header so
// custom domains (e.g. lmconsultingai.com) can show the right logo/name on
// the login page before the user is authenticated. Returns null fields when
// no whitelabel owns this domain so the client falls back to defaults.
exports.getBrandingByHost = async (req, res) => {
  try {
    // Allow ?host=... as a fallback for local dev / when running behind a
    // proxy that rewrites the Host header.
    const rawHost = (req.query.host || req.headers.host || '').toString();
    const host = rawHost.toLowerCase().split(':')[0].replace(/^www\./, '');
    if (!host) return res.json({ branding: null });

    const select = {
      companyName: true, companyLogo: true, companyIcon: true,
      companyTagline: true, creditsLabel: true,
    };

    // The partner's first domain lives on the account itself; any further one
    // (a partner running both its own domain and a panel domain) is a row in
    // loginDomains.
    let user = await prisma.user.findUnique({ where: { loginDomain: host }, select });
    if (!user) {
      const extra = await prisma.loginDomain.findUnique({
        where: { host },
        select: { user: { select } },
      });
      user = extra?.user || null;
    }

    if (!user) return res.json({ branding: null });

    res.json({
      branding: {
        companyName: user.companyName,
        companyLogo: user.companyLogo,
        // What the browser tab and a shared link show. A square icon is better
        // for that, but the logo is a reasonable stand-in.
        companyIcon: user.companyIcon || user.companyLogo || null,
        companyTagline: user.companyTagline,
        creditsLabel: user.creditsLabel || null
      }
    });
  } catch (err) {
    console.error('getBrandingByHost error:', err);
    res.json({ branding: null });
  }
};

// Get branding for current user (or their agency's branding for clients)
exports.getBranding = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        companyName: true,
        companyLogo: true,
        companyIcon: true,
        companyTagline: true,
        agencyId: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // For clients, get their agency's branding if they don't have their own
    let branding = {
      companyName: user.companyName,
      companyLogo: user.companyLogo,
      companyIcon: user.companyIcon,
      companyTagline: user.companyTagline,
      creditsLabel: await resolveCreditsLabel(userId),
      canEdit: user.role === 'OWNER' || user.role === 'WHITELABEL' || user.role === 'AGENCY'
    };

    // If agency and no custom branding, inherit from whitelabel
    if (user.role === 'AGENCY' && !user.companyName && !user.companyLogo) {
      const agencyFull = await prisma.user.findUnique({
        where: { id: userId },
        select: { whitelabelId: true }
      });
      if (agencyFull?.whitelabelId) {
        const wl = await prisma.user.findUnique({
          where: { id: agencyFull.whitelabelId },
          select: { companyName: true, companyLogo: true, companyTagline: true }
        });
        if (wl && (wl.companyName || wl.companyLogo)) {
          branding.companyName = wl.companyName;
          branding.companyLogo = wl.companyLogo;
          branding.companyTagline = wl.companyTagline;
          branding.inheritedFrom = 'whitelabel';
        }
      }
    }

    // If client and no custom branding, walk up: agency → whitelabel
    if (user.role === 'CLIENT' && user.agencyId && !user.companyName && !user.companyLogo) {
      const agency = await prisma.user.findUnique({
        where: { id: user.agencyId },
        select: {
          companyName: true,
          companyLogo: true,
          companyTagline: true,
          whitelabelId: true
        }
      });
      if (agency && (agency.companyName || agency.companyLogo)) {
        branding.companyName = agency.companyName;
        branding.companyLogo = agency.companyLogo;
        branding.companyTagline = agency.companyTagline;
        branding.inheritedFrom = 'agency';
      } else if (agency?.whitelabelId) {
        // Agency has no branding either — try their whitelabel
        const wl = await prisma.user.findUnique({
          where: { id: agency.whitelabelId },
          select: { companyName: true, companyLogo: true, companyTagline: true }
        });
        if (wl && (wl.companyName || wl.companyLogo)) {
          branding.companyName = wl.companyName;
          branding.companyLogo = wl.companyLogo;
          branding.companyTagline = wl.companyTagline;
          branding.inheritedFrom = 'whitelabel';
        }
      }
    }

    res.json(branding);
  } catch (error) {
    console.error('Error getting branding:', error);
    res.status(500).json({ error: 'Failed to get branding' });
  }
};

// Set branding for a specific user (OWNER only — no need to switch accounts)
exports.setBrandingForUser = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can set branding for other accounts' });
    }

    const targetId = parseInt(req.params.userId);
    const target = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true }
    });

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (target.role === 'OWNER') {
      return res.status(403).json({ error: 'Cannot set branding for another owner' });
    }

    const { companyName, companyLogo, companyIcon, companyTagline, creditsLabel } = req.body;

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        companyName: companyName || null,
        companyLogo: companyLogo || null,
        companyTagline: companyTagline || null,
        ...(companyIcon !== undefined ? { companyIcon: (companyIcon || '').trim() || null } : {}),
        ...(creditsLabel !== undefined ? { creditsLabel: (creditsLabel || '').trim() || null } : {})
      },
      select: { companyName: true, companyLogo: true, companyIcon: true, companyTagline: true, creditsLabel: true }
    });

    res.json({ ...updated, userId: targetId });
  } catch (error) {
    console.error('Error setting branding for user:', error);
    res.status(500).json({ error: 'Failed to set branding' });
  }
};

// Update branding (OWNER and AGENCY only)
exports.updateBranding = async (req, res) => {
  try {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.role !== 'OWNER' && user.role !== 'WHITELABEL' && user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Only owners, whitelabels, and agencies can update branding' });
    }

    const { companyName, companyLogo, companyIcon, companyTagline, creditsLabel } = req.body;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        companyName: companyName || null,
        companyLogo: companyLogo || null,
        companyTagline: companyTagline || null,
        ...(companyIcon !== undefined ? { companyIcon: (companyIcon || '').trim() || null } : {}),
        ...(creditsLabel !== undefined ? { creditsLabel: (creditsLabel || '').trim() || null } : {})
      },
      select: {
        companyName: true,
        companyLogo: true,
        companyIcon: true,
        companyTagline: true,
        creditsLabel: true
      }
    });

    res.json({
      ...updated,
      canEdit: true
    });
  } catch (error) {
    console.error('Error updating branding:', error);
    res.status(500).json({ error: 'Failed to update branding' });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Login domains — the addresses this account is branded on
// ──────────────────────────────────────────────────────────────────────────

// "https://Panel.Nebo.com/" and "panel.nebo.com" are the same address. Store
// the shape the browser reports, so a lookup by Host header finds it.
function normalizeHost(value) {
  const raw = (value || '').toString().trim().toLowerCase();
  if (!raw) return null;
  const host = raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0].replace(/^www\./, '');
  // A real domain: labels of letters, digits and hyphens, with a suffix.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(host) ? host : null;
}

// Who may change the domains of an account: the account itself if it is a
// partner, or the OWNER for anyone.
async function domainTarget(req, res) {
  const targetId = req.params.userId ? parseInt(req.params.userId) : req.user.id;
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, role: true, loginDomain: true },
  });
  if (!target) {
    res.status(404).json({ error: 'User not found' });
    return null;
  }
  const isSelf = target.id === req.user.id;
  const partnerRoles = ['OWNER', 'WHITELABEL', 'AGENCY'];
  if (req.user.role !== 'OWNER' && !(isSelf && partnerRoles.includes(req.user.role))) {
    res.status(403).json({ error: 'You cannot manage domains for this account.' });
    return null;
  }
  return target;
}

// Every domain branded to the account: the one on the account itself first,
// then the extra ones.
async function listDomains(target) {
  const extra = await prisma.loginDomain.findMany({
    where: { userId: target.id },
    orderBy: { createdAt: 'asc' },
    select: { id: true, host: true },
  });
  return [
    ...(target.loginDomain ? [{ id: null, host: target.loginDomain, primary: true }] : []),
    ...extra.map((d) => ({ ...d, primary: false })),
  ];
}

// GET /api/branding/domains[/:userId]
exports.getLoginDomains = async (req, res) => {
  try {
    const target = await domainTarget(req, res);
    if (!target) return;
    res.json({ domains: await listDomains(target) });
  } catch (error) {
    console.error('Error listing login domains:', error);
    res.status(500).json({ error: 'Failed to list domains' });
  }
};

// POST /api/branding/domains[/:userId]  Body: { host }
exports.addLoginDomain = async (req, res) => {
  try {
    const target = await domainTarget(req, res);
    if (!target) return;

    const host = normalizeHost(req.body?.host);
    if (!host) return res.status(400).json({ error: 'Escribe un dominio válido, por ejemplo panel.tudominio.com' });

    // A domain can only brand one account, so say who holds it rather than
    // failing on the unique constraint.
    const takenBy = await prisma.user.findUnique({ where: { loginDomain: host }, select: { id: true, companyName: true, email: true } })
      || (await prisma.loginDomain.findUnique({ where: { host }, select: { user: { select: { id: true, companyName: true, email: true } } } }))?.user;
    if (takenBy) {
      if (takenBy.id === target.id) return res.json({ domains: await listDomains(target), alreadyYours: true });
      return res.status(409).json({ error: `Ese dominio ya está en uso por ${takenBy.companyName || takenBy.email}.` });
    }

    // The account's first domain goes on the account itself, which is where
    // the rest of the platform reads it from.
    if (!target.loginDomain) {
      await prisma.user.update({ where: { id: target.id }, data: { loginDomain: host } });
      target.loginDomain = host;
    } else {
      await prisma.loginDomain.create({ data: { host, userId: target.id } });
    }

    res.status(201).json({ domains: await listDomains(target) });
  } catch (error) {
    console.error('Error adding login domain:', error);
    res.status(500).json({ error: 'Failed to add domain' });
  }
};

// DELETE /api/branding/domains/:host[/:userId]
exports.removeLoginDomain = async (req, res) => {
  try {
    const target = await domainTarget(req, res);
    if (!target) return;

    const host = normalizeHost(req.params.host);
    if (!host) return res.status(400).json({ error: 'Dominio inválido' });

    if (target.loginDomain === host) {
      // Promote one of the extras, so the account keeps a primary domain.
      const next = await prisma.loginDomain.findFirst({ where: { userId: target.id }, orderBy: { createdAt: 'asc' } });
      await prisma.user.update({ where: { id: target.id }, data: { loginDomain: next ? next.host : null } });
      if (next) await prisma.loginDomain.delete({ where: { id: next.id } });
      target.loginDomain = next ? next.host : null;
    } else {
      await prisma.loginDomain.deleteMany({ where: { host, userId: target.id } });
    }

    res.json({ domains: await listDomains(target) });
  } catch (error) {
    console.error('Error removing login domain:', error);
    res.status(500).json({ error: 'Failed to remove domain' });
  }
};
