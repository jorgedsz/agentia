// Role constants
const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
};

// Check if user has required role
const requireRole = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
};

// Check if user can access target user's data
const canAccessUser = async (req, res, next) => {
  const targetUserId = parseInt(req.params.userId || req.params.id);
  const currentUser = req.user;

  // Owner can access anyone
  if (currentUser.role === ROLES.OWNER) {
    return next();
  }

  // Agency can access themselves and their users
  if (currentUser.role === ROLES.AGENCY) {
    if (currentUser.id === targetUserId) {
      return next();
    }

    const targetUser = await req.prisma.user.findUnique({
      where: { id: targetUserId }
    });

    if (targetUser && targetUser.agencyId === currentUser.id) {
      return next();
    }

    return res.status(403).json({ error: 'Cannot access this user' });
  }

  // User can only access themselves
  if (currentUser.id === targetUserId) {
    return next();
  }

  return res.status(403).json({ error: 'Cannot access this user' });
};

module.exports = {
  ROLES,
  requireRole,
  canAccessUser
};
