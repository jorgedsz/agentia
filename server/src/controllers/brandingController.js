const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

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
      companyTagline: user.companyTagline,
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

    const { companyName, companyLogo, companyTagline } = req.body;

    const updated = await prisma.user.update({
      where: { id: targetId },
      data: {
        companyName: companyName || null,
        companyLogo: companyLogo || null,
        companyTagline: companyTagline || null
      },
      select: { companyName: true, companyLogo: true, companyTagline: true }
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

    const { companyName, companyLogo, companyTagline } = req.body;

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        companyName: companyName || null,
        companyLogo: companyLogo || null,
        companyTagline: companyTagline || null
      },
      select: {
        companyName: true,
        companyLogo: true,
        companyTagline: true
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
