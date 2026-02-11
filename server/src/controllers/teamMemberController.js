const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { logAudit } = require('../utils/auditLog');

const TEAM_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
};

/**
 * Get all team members for the current account
 * GET /api/team-members
 */
const getTeamMembers = async (req, res) => {
  try {
    const accountId = req.user.id;

    const teamMembers = await req.prisma.teamMember.findMany({
      where: { accountId },
      select: {
        id: true,
        email: true,
        name: true,
        teamRole: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ teamMembers });
  } catch (error) {
    console.error('Error fetching team members:', error);
    res.status(500).json({ error: 'Failed to fetch team members' });
  }
};

/**
 * Create a new team member
 * POST /api/team-members
 */
const createTeamMember = async (req, res) => {
  try {
    const { email, password, name, teamRole } = req.body;
    const accountId = req.user.id;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    if (teamRole && !Object.values(TEAM_ROLES).includes(teamRole)) {
      return res.status(400).json({ error: 'Invalid team role. Must be "admin" or "user"' });
    }

    // Check if email already exists in Users or TeamMembers
    const existingUser = await req.prisma.user.findUnique({ where: { email } });
    const existingTeamMember = await req.prisma.teamMember.findUnique({ where: { email } });

    if (existingUser || existingTeamMember) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    const teamMember = await req.prisma.teamMember.create({
      data: {
        email,
        password: hashedPassword,
        name,
        teamRole: teamRole || TEAM_ROLES.USER,
        accountId
      },
      select: {
        id: true,
        email: true,
        name: true,
        teamRole: true,
        isActive: true,
        createdAt: true
      }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorType: 'user',
      action: 'team_member.create',
      resourceType: 'team_member',
      resourceId: teamMember.id,
      details: { email: teamMember.email, teamRole: teamMember.teamRole },
      req
    });

    res.status(201).json({
      message: 'Team member created successfully',
      teamMember
    });
  } catch (error) {
    console.error('Error creating team member:', error);
    res.status(500).json({ error: 'Failed to create team member' });
  }
};

/**
 * Update a team member
 * PUT /api/team-members/:id
 */
const updateTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, teamRole, isActive, password } = req.body;
    const accountId = req.user.id;

    // Verify team member belongs to this account
    const existing = await req.prisma.teamMember.findFirst({
      where: { id: parseInt(id), accountId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    if (teamRole && !Object.values(TEAM_ROLES).includes(teamRole)) {
      return res.status(400).json({ error: 'Invalid team role. Must be "admin" or "user"' });
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (teamRole !== undefined) updateData.teamRole = teamRole;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      if (password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }
      updateData.password = await bcrypt.hash(password, 10);
    }

    const teamMember = await req.prisma.teamMember.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        teamRole: true,
        isActive: true,
        updatedAt: true
      }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorType: 'user',
      action: 'team_member.update',
      resourceType: 'team_member',
      resourceId: teamMember.id,
      details: { email: teamMember.email },
      req
    });

    res.json({
      message: 'Team member updated successfully',
      teamMember
    });
  } catch (error) {
    console.error('Error updating team member:', error);
    res.status(500).json({ error: 'Failed to update team member' });
  }
};

/**
 * Delete a team member
 * DELETE /api/team-members/:id
 */
const deleteTeamMember = async (req, res) => {
  try {
    const { id } = req.params;
    const accountId = req.user.id;

    // Verify team member belongs to this account
    const existing = await req.prisma.teamMember.findFirst({
      where: { id: parseInt(id), accountId }
    });

    if (!existing) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    await req.prisma.teamMember.delete({
      where: { id: parseInt(id) }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.user.id,
      actorEmail: req.user.email,
      actorType: 'user',
      action: 'team_member.delete',
      resourceType: 'team_member',
      resourceId: id,
      details: { email: existing.email },
      req
    });

    res.json({ message: 'Team member deleted successfully' });
  } catch (error) {
    console.error('Error deleting team member:', error);
    res.status(500).json({ error: 'Failed to delete team member' });
  }
};

/**
 * Team member login
 * POST /api/team-members/login
 */
const teamMemberLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find team member
    const teamMember = await req.prisma.teamMember.findUnique({
      where: { email },
      include: {
        account: {
          select: {
            id: true,
            email: true,
            name: true,
            role: true
          }
        }
      }
    });

    if (!teamMember) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (!teamMember.isActive) {
      return res.status(401).json({ error: 'Account is deactivated' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, teamMember.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token with team member info
    const token = jwt.sign(
      {
        teamMemberId: teamMember.id,
        accountId: teamMember.accountId,
        isTeamMember: true
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: teamMember.id,
        email: teamMember.email,
        name: teamMember.name,
        teamRole: teamMember.teamRole,
        isTeamMember: true,
        account: teamMember.account
      }
    });
  } catch (error) {
    console.error('Team member login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

module.exports = {
  getTeamMembers,
  createTeamMember,
  updateTeamMember,
  deleteTeamMember,
  teamMemberLogin,
  TEAM_ROLES
};
