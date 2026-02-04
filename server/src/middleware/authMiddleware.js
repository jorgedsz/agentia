const jwt = require('jsonwebtoken');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Handle team member tokens
    if (decoded.isTeamMember && decoded.teamMemberId) {
      const teamMember = await req.prisma.teamMember.findUnique({
        where: { id: decoded.teamMemberId },
        include: {
          account: {
            select: { id: true, email: true, name: true, role: true, agencyId: true, outboundRate: true, inboundRate: true }
          }
        }
      });

      if (!teamMember) {
        return res.status(401).json({ error: 'Team member not found' });
      }

      if (!teamMember.isActive) {
        return res.status(401).json({ error: 'Account is deactivated' });
      }

      // Set user as the parent account but mark as team member
      req.user = teamMember.account;
      req.isTeamMember = true;
      req.teamMember = {
        id: teamMember.id,
        email: teamMember.email,
        name: teamMember.name,
        teamRole: teamMember.teamRole
      };

      return next();
    }

    // Regular user authentication
    const user = await req.prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, name: true, role: true, agencyId: true, outboundRate: true, inboundRate: true }
    });

    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = user;

    // Handle impersonation - store original user info
    if (decoded.isImpersonating && decoded.originalUserId) {
      req.isImpersonating = true;
      req.originalUserId = decoded.originalUserId;
      req.originalUserRole = decoded.originalUserRole;
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired' });
    }
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

module.exports = authMiddleware;
