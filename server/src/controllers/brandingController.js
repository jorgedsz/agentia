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
      canEdit: user.role === 'OWNER' || user.role === 'AGENCY'
    };

    // If client and no custom branding, inherit from agency
    if (user.role === 'CLIENT' && user.agencyId && !user.companyName && !user.companyLogo) {
      const agency = await prisma.user.findUnique({
        where: { id: user.agencyId },
        select: {
          companyName: true,
          companyLogo: true,
          companyTagline: true
        }
      });
      if (agency) {
        branding.companyName = agency.companyName;
        branding.companyLogo = agency.companyLogo;
        branding.companyTagline = agency.companyTagline;
        branding.inheritedFrom = 'agency';
      }
    }

    res.json(branding);
  } catch (error) {
    console.error('Error getting branding:', error);
    res.status(500).json({ error: 'Failed to get branding' });
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

    if (user.role !== 'OWNER' && user.role !== 'AGENCY') {
      return res.status(403).json({ error: 'Only owners and agencies can update branding' });
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
