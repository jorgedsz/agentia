const jwt = require('jsonwebtoken');

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
};

/**
 * Get list of accounts the current user can access
 * GET /api/auth/accessible-accounts
 */
const getAccessibleAccounts = async (req, res) => {
  try {
    const { user } = req;

    if (user.role === ROLES.CLIENT) {
      return res.status(403).json({ error: 'Clients cannot access other accounts' });
    }

    let accounts = [];

    if (user.role === ROLES.OWNER) {
      // Owner can access all agencies and clients
      accounts = await req.prisma.user.findMany({
        where: {
          id: { not: user.id },
          role: { in: [ROLES.AGENCY, ROLES.CLIENT] }
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          agency: {
            select: { id: true, name: true, email: true }
          },
          _count: {
            select: { agents: true, clients: true }
          }
        },
        orderBy: [{ role: 'asc' }, { name: 'asc' }]
      });
    } else if (user.role === ROLES.AGENCY) {
      // Agency can only access their own clients
      accounts = await req.prisma.user.findMany({
        where: {
          agencyId: user.id,
          role: ROLES.CLIENT
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          _count: {
            select: { agents: true }
          }
        },
        orderBy: { name: 'asc' }
      });
    }

    res.json({ accounts });
  } catch (error) {
    console.error('Error fetching accessible accounts:', error);
    res.status(500).json({ error: 'Failed to fetch accounts' });
  }
};

/**
 * Switch to another user's account (impersonation)
 * POST /api/auth/switch-account
 */
const switchAccount = async (req, res) => {
  try {
    const { user } = req;
    const { targetUserId } = req.body;

    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID is required' });
    }

    if (user.role === ROLES.CLIENT) {
      return res.status(403).json({ error: 'Clients cannot switch accounts' });
    }

    // Get the target user
    const targetUser = await req.prisma.user.findUnique({
      where: { id: parseInt(targetUserId) },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        agencyId: true
      }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found' });
    }

    // Authorization checks
    if (user.role === ROLES.AGENCY) {
      // Agency can only switch to their own clients
      if (targetUser.agencyId !== user.id) {
        return res.status(403).json({ error: 'You can only access your own clients' });
      }
    }

    // Owner can access anyone (no additional check needed)

    // Determine the original user (for nested impersonation prevention)
    const originalUserId = req.originalUserId || user.id;
    const originalUserRole = req.originalUserRole || user.role;

    // Create a new token with impersonation info
    const token = jwt.sign(
      {
        userId: targetUser.id,
        originalUserId: originalUserId,
        originalUserRole: originalUserRole,
        isImpersonating: true
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: `Switched to ${targetUser.name || targetUser.email}'s account`,
      token,
      user: targetUser,
      originalUser: {
        id: originalUserId,
        role: originalUserRole
      }
    });
  } catch (error) {
    console.error('Error switching account:', error);
    res.status(500).json({ error: 'Failed to switch account' });
  }
};

/**
 * Switch back to original account
 * POST /api/auth/switch-back
 */
const switchBack = async (req, res) => {
  try {
    const originalUserId = req.originalUserId;

    if (!originalUserId) {
      return res.status(400).json({ error: 'Not currently impersonating any account' });
    }

    // Get the original user
    const originalUser = await req.prisma.user.findUnique({
      where: { id: originalUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        agencyId: true
      }
    });

    if (!originalUser) {
      return res.status(404).json({ error: 'Original user not found' });
    }

    // Create a new token for the original user (no impersonation)
    const token = jwt.sign(
      { userId: originalUser.id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Switched back to your account',
      token,
      user: originalUser
    });
  } catch (error) {
    console.error('Error switching back:', error);
    res.status(500).json({ error: 'Failed to switch back' });
  }
};

module.exports = {
  getAccessibleAccounts,
  switchAccount,
  switchBack
};
