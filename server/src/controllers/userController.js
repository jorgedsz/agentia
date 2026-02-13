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

    // Cannot delete yourself
    if (targetId === req.user.id) {
      return res.status(403).json({ error: 'Cannot delete your own account' });
    }

    const targetUser = await req.prisma.user.findUnique({
      where: { id: targetId }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Cannot delete an OWNER account
    if (targetUser.role === ROLES.OWNER) {
      return res.status(403).json({ error: 'Cannot delete an owner account' });
    }

    // AGENCY can only delete their own clients
    if (req.user.role === ROLES.AGENCY && targetUser.agencyId !== req.user.id) {
      return res.status(403).json({ error: 'Cannot delete this client' });
    }

    // Delete related data first to avoid foreign key constraints
    await req.prisma.callLog.deleteMany({ where: { userId: targetId } });
    await req.prisma.agent.deleteMany({ where: { userId: targetId } });
    await req.prisma.calendarIntegration.deleteMany({ where: { userId: targetId } });

    // Release any assigned VAPI key back to the pool
    await req.prisma.vapiKeyPool.updateMany({
      where: { assignedUserId: targetId },
      data: { assignedUserId: null }
    });

    // Unlink clients if deleting an agency
    if (targetUser.role === ROLES.AGENCY) {
      await req.prisma.user.updateMany({
        where: { agencyId: targetId },
        data: { agencyId: null }
      });
    }

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

// Get dashboard overview data (all roles)
const getDashboardOverview = async (req, res) => {
  try {
    const { role, id } = req.user;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterdayStart = new Date(todayStart);
    yesterdayStart.setDate(yesterdayStart.getDate() - 1);
    const weekAgo = new Date(todayStart);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(todayStart);
    monthAgo.setMonth(monthAgo.getMonth() - 1);

    // Build user filter for calls based on role
    let callUserFilter = {};
    let agentFilter = {};
    let clientFilter = {};

    if (role === ROLES.OWNER) {
      // Owner sees everything
      callUserFilter = {};
      agentFilter = {};
      clientFilter = { role: ROLES.CLIENT };
    } else if (role === ROLES.AGENCY) {
      // Agency sees own + their clients' data
      const clientIds = await req.prisma.user.findMany({
        where: { agencyId: id },
        select: { id: true }
      });
      const userIds = [id, ...clientIds.map(c => c.id)];
      callUserFilter = { userId: { in: userIds } };
      agentFilter = { userId: { in: userIds } };
      clientFilter = { agencyId: id };
    } else {
      // Client sees only own data
      callUserFilter = { userId: id };
      agentFilter = { userId: id };
    }

    // Run all queries in parallel
    const [
      callsToday,
      callsYesterday,
      currentUser,
      totalAgents,
      newAgentsThisWeek,
      totalClients,
      newClientsThisMonth,
      dailyCalls,
      summaryAgg,
      topAgentsRaw
    ] = await Promise.all([
      // Calls today
      req.prisma.callLog.count({
        where: { ...callUserFilter, createdAt: { gte: todayStart } }
      }),
      // Calls yesterday
      req.prisma.callLog.count({
        where: { ...callUserFilter, createdAt: { gte: yesterdayStart, lt: todayStart } }
      }),
      // Current user for balance
      req.prisma.user.findUnique({
        where: { id },
        select: { vapiCredits: true }
      }),
      // Total agents
      req.prisma.agent.count({ where: agentFilter }),
      // New agents this week
      req.prisma.agent.count({
        where: { ...agentFilter, createdAt: { gte: weekAgo } }
      }),
      // Total clients (OWNER/AGENCY only)
      (role === ROLES.OWNER || role === ROLES.AGENCY)
        ? req.prisma.user.count({ where: clientFilter })
        : Promise.resolve(0),
      // New clients this month (OWNER/AGENCY only)
      (role === ROLES.OWNER || role === ROLES.AGENCY)
        ? req.prisma.user.count({ where: { ...clientFilter, createdAt: { gte: monthAgo } } })
        : Promise.resolve(0),
      // Daily calls for last 7 days
      req.prisma.callLog.groupBy({
        by: ['createdAt'],
        where: { ...callUserFilter, createdAt: { gte: weekAgo } },
        _count: { id: true },
        orderBy: { createdAt: 'asc' }
      }),
      // Summary aggregates
      req.prisma.callLog.aggregate({
        where: { ...callUserFilter, createdAt: { gte: weekAgo } },
        _count: { id: true },
        _sum: { durationSeconds: true, costCharged: true }
      }),
      // Top agents by call count
      req.prisma.callLog.groupBy({
        by: ['agentId'],
        where: { ...callUserFilter, agentId: { not: null } },
        _count: { id: true },
        _sum: { costCharged: true, durationSeconds: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5
      })
    ]);

    // Process daily calls into date buckets
    const dailyMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyMap[key] = 0;
    }
    dailyCalls.forEach(row => {
      const key = new Date(row.createdAt).toISOString().split('T')[0];
      if (dailyMap[key] !== undefined) {
        dailyMap[key] += row._count.id;
      }
    });
    const dailyCallsFormatted = Object.entries(dailyMap).map(([date, count]) => ({ date, count }));

    // Fetch agent names for top agents
    const agentIds = topAgentsRaw.filter(a => a.agentId).map(a => a.agentId);
    const agentNames = agentIds.length > 0
      ? await req.prisma.agent.findMany({
          where: { id: { in: agentIds } },
          select: { id: true, name: true }
        })
      : [];
    const agentNameMap = {};
    agentNames.forEach(a => { agentNameMap[a.id] = a.name; });

    const topAgents = topAgentsRaw.map(a => ({
      id: a.agentId,
      name: agentNameMap[a.agentId] || `Agent #${a.agentId}`,
      calls: a._count.id,
      cost: a._sum.costCharged || 0,
      duration: a._sum.durationSeconds || 0
    }));

    // Top clients (OWNER/AGENCY only)
    let topClients = [];
    if (role === ROLES.OWNER || role === ROLES.AGENCY) {
      const clientUserFilter = role === ROLES.OWNER
        ? {}
        : { userId: { in: (await req.prisma.user.findMany({ where: { agencyId: id }, select: { id: true } })).map(c => c.id) } };

      const topClientsRaw = await req.prisma.callLog.groupBy({
        by: ['userId'],
        where: clientUserFilter,
        _count: { id: true },
        _sum: { costCharged: true, durationSeconds: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5
      });

      if (topClientsRaw.length > 0) {
        const clientUserIds = topClientsRaw.map(c => c.userId);
        const clientUsers = await req.prisma.user.findMany({
          where: { id: { in: clientUserIds } },
          select: { id: true, name: true, email: true }
        });
        const clientMap = {};
        clientUsers.forEach(u => { clientMap[u.id] = u; });

        topClients = topClientsRaw.map(c => ({
          id: c.userId,
          name: clientMap[c.userId]?.name || clientMap[c.userId]?.email || `User #${c.userId}`,
          email: clientMap[c.userId]?.email || '',
          calls: c._count.id,
          cost: c._sum.costCharged || 0,
          duration: c._sum.durationSeconds || 0
        }));
      }
    }

    res.json({
      callsToday,
      callsYesterday,
      totalBalance: currentUser?.vapiCredits || 0,
      totalAgents,
      newAgentsThisWeek,
      totalClients,
      newClientsThisMonth,
      dailyCalls: dailyCallsFormatted,
      summary: {
        totalCalls: summaryAgg._count.id || 0,
        totalDuration: summaryAgg._sum.durationSeconds || 0,
        totalCost: summaryAgg._sum.costCharged || 0
      },
      topAgents,
      topClients
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
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
  getDashboardStats,
  getDashboardOverview
};
