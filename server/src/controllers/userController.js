const bcrypt = require('bcrypt');
const { ROLES } = require('../middleware/roleMiddleware');

// Get all users (OWNER only) - includes owners, agencies, and clients
const getAllUsers = async (req, res) => {
  try {
    const users = await req.prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        vapiCredits: true,
        outboundRate: true,
        inboundRate: true,
        agencyId: true,
        createdAt: true,
        agency: {
          select: { id: true, name: true, email: true }
        },
        _count: {
          select: { clients: true, agents: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ users });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// Get all agencies (OWNER only)
const getAllAgencies = async (req, res) => {
  try {
    const agencies = await req.prisma.user.findMany({
      where: { role: ROLES.AGENCY },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        _count: {
          select: { clients: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ agencies });
  } catch (error) {
    console.error('Get agencies error:', error);
    res.status(500).json({ error: 'Failed to fetch agencies' });
  }
};

// Get agency's clients (AGENCY or OWNER)
const getAgencyClients = async (req, res) => {
  try {
    const agencyId = req.user.role === ROLES.AGENCY
      ? req.user.id
      : parseInt(req.params.agencyId);

    const clients = await req.prisma.user.findMany({
      where: { agencyId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: {
          select: { agents: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ clients });
  } catch (error) {
    console.error('Get agency clients error:', error);
    res.status(500).json({ error: 'Failed to fetch clients' });
  }
};

// Create agency (OWNER only)
const createAgency = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const existingUser = await req.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const agency = await req.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: ROLES.AGENCY
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    // Auto-assign a VAPI key from the pool
    let vapiKeyWarning = null;
    const availableKey = await req.prisma.vapiKeyPool.findFirst({
      where: { assignedUserId: null }
    });
    if (availableKey) {
      await req.prisma.$transaction([
        req.prisma.vapiKeyPool.update({
          where: { id: availableKey.id },
          data: { assignedUserId: agency.id }
        }),
        req.prisma.user.update({
          where: { id: agency.id },
          data: {
            vapiApiKey: availableKey.vapiApiKey,
            vapiPublicKey: availableKey.vapiPublicKey
          }
        })
      ]);
    } else {
      vapiKeyWarning = 'No VAPI keys available in the pool. Add more keys in Settings > VAPI Key Pool.';
    }

    res.status(201).json({
      message: 'Agency created successfully',
      agency,
      vapiKeyWarning
    });
  } catch (error) {
    console.error('Create agency error:', error);
    res.status(500).json({ error: 'Failed to create agency' });
  }
};

// Create client under agency (AGENCY or OWNER)
const createClient = async (req, res) => {
  try {
    const { email, password, name, agencyId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Determine agency
    let assignedAgencyId;
    if (req.user.role === ROLES.AGENCY) {
      assignedAgencyId = req.user.id;
    } else if (req.user.role === ROLES.OWNER) {
      assignedAgencyId = agencyId || null;
    }

    const existingUser = await req.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const client = await req.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: ROLES.CLIENT,
        agencyId: assignedAgencyId
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        agencyId: true,
        createdAt: true
      }
    });

    // Auto-assign a VAPI key from the pool
    let vapiKeyWarning = null;
    const availableKey = await req.prisma.vapiKeyPool.findFirst({
      where: { assignedUserId: null }
    });
    if (availableKey) {
      await req.prisma.$transaction([
        req.prisma.vapiKeyPool.update({
          where: { id: availableKey.id },
          data: { assignedUserId: client.id }
        }),
        req.prisma.user.update({
          where: { id: client.id },
          data: {
            vapiApiKey: availableKey.vapiApiKey,
            vapiPublicKey: availableKey.vapiPublicKey
          }
        })
      ]);
    } else {
      vapiKeyWarning = 'No VAPI keys available in the pool. Add more keys in Settings > VAPI Key Pool.';
    }

    res.status(201).json({
      message: 'Client created successfully',
      client,
      vapiKeyWarning
    });
  } catch (error) {
    console.error('Create client error:', error);
    res.status(500).json({ error: 'Failed to create client' });
  }
};

// Update user role (OWNER only)
const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!Object.values(ROLES).includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    const user = await req.prisma.user.update({
      where: { id: parseInt(id) },
      data: { role },
      select: {
        id: true,
        email: true,
        name: true,
        role: true
      }
    });

    res.json({
      message: 'Role updated',
      user
    });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Failed to update role' });
  }
};

// Delete user/client (OWNER or AGENCY for their clients)
const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id);

    // Check permissions
    if (req.user.role === ROLES.AGENCY) {
      const targetUser = await req.prisma.user.findUnique({
        where: { id: targetId }
      });

      if (!targetUser || targetUser.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Cannot delete this client' });
      }
    }

    // Release any assigned VAPI key back to the pool
    await req.prisma.vapiKeyPool.updateMany({
      where: { assignedUserId: targetId },
      data: { assignedUserId: null }
    });

    await req.prisma.user.delete({
      where: { id: targetId }
    });

    res.json({ message: 'Deleted successfully' });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Failed to delete' });
  }
};

// Update user billing (credits and rates) - OWNER only
const updateUserBilling = async (req, res) => {
  try {
    const { id } = req.params;
    const { credits, creditOperation, outboundRate, inboundRate } = req.body;

    const targetUser = await req.prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateData = {};

    // Handle credits
    if (credits !== undefined && creditOperation) {
      const amount = parseFloat(credits);
      if (isNaN(amount) || amount < 0) {
        return res.status(400).json({ error: 'Credits must be a positive number' });
      }

      if (creditOperation === 'add') {
        updateData.vapiCredits = targetUser.vapiCredits + amount;
      } else if (creditOperation === 'subtract') {
        updateData.vapiCredits = Math.max(0, targetUser.vapiCredits - amount);
      } else if (creditOperation === 'set') {
        updateData.vapiCredits = amount;
      }
    }

    // Handle rates
    if (outboundRate !== undefined) {
      const rate = parseFloat(outboundRate);
      if (isNaN(rate) || rate < 0) {
        return res.status(400).json({ error: 'Outbound rate must be a positive number' });
      }
      updateData.outboundRate = rate;
    }

    if (inboundRate !== undefined) {
      const rate = parseFloat(inboundRate);
      if (isNaN(rate) || rate < 0) {
        return res.status(400).json({ error: 'Inbound rate must be a positive number' });
      }
      updateData.inboundRate = rate;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    const user = await req.prisma.user.update({
      where: { id: parseInt(id) },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        vapiCredits: true,
        outboundRate: true,
        inboundRate: true
      }
    });

    res.json({
      message: 'User billing updated successfully',
      user
    });
  } catch (error) {
    console.error('Update user billing error:', error);
    res.status(500).json({ error: 'Failed to update user billing' });
  }
};

// Get dashboard stats
const getDashboardStats = async (req, res) => {
  try {
    const { role, id } = req.user;
    let stats = {};

    if (role === ROLES.OWNER) {
      const [totalClients, totalAgencies, totalAgents] = await Promise.all([
        req.prisma.user.count({ where: { role: ROLES.CLIENT } }),
        req.prisma.user.count({ where: { role: ROLES.AGENCY } }),
        req.prisma.agent.count()
      ]);
      stats = { totalClients, totalAgencies, totalAgents };
    } else if (role === ROLES.AGENCY) {
      const [totalClients, totalAgents] = await Promise.all([
        req.prisma.user.count({ where: { agencyId: id } }),
        req.prisma.agent.count({
          where: {
            user: { OR: [{ id }, { agencyId: id }] }
          }
        })
      ]);
      stats = { totalClients, totalAgents };
    } else {
      const totalAgents = await req.prisma.agent.count({ where: { userId: id } });
      stats = { totalAgents };
    }

    res.json({ stats });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
};

module.exports = {
  getAllUsers,
  getAllAgencies,
  getAgencyClients,
  createAgency,
  createClient,
  updateUserRole,
  updateUserBilling,
  deleteUser,
  getDashboardStats
};
