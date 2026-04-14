const bcrypt = require('bcrypt');
const { ROLES } = require('../middleware/roleMiddleware');
const { decrypt } = require('../utils/encryption');

// Fire account creation webhook (non-blocking)
const fireAccountWebhook = async (prisma, account, type) => {
  try {
    const settings = await prisma.platformSettings.findFirst();
    if (!settings?.accountWebhookUrl) return;

    const url = decrypt(settings.accountWebhookUrl);
    if (!url) return;

    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'account.created',
        type, // "client" or "agency"
        account: {
          id: account.id,
          email: account.email,
          name: account.name || null,
          phoneNumber: account.phoneNumber || null,
          role: account.role,
          agencyId: account.agencyId || null,
          createdAt: account.createdAt,
        },
        timestamp: new Date().toISOString(),
      }),
    }).catch(err => console.error('[Webhook] Account creation webhook failed:', err.message));
  } catch (err) {
    console.error('[Webhook] Error preparing account webhook:', err.message);
  }
};

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
        voiceAgentsEnabled: true,
        chatbotsEnabled: true,
        crmEnabled: true,
        agentGeneratorEnabled: true,
        callsPaused: true,
        messagesPaused: true,
        agencyId: true,
        whitelabelId: true,
        createdAt: true,
        agency: {
          select: { id: true, name: true, email: true }
        },
        whitelabel: {
          select: { id: true, name: true, email: true }
        },
        _count: {
          select: { clients: true, agents: true, agencies: true }
        },
        waProjects: {
          select: {
            id: true,
            nombre: true,
            estado: true,
            whatsappChatId: true,
            totalMensajes: true,
            alertasCount: true,
            ultimaActividad: true
          }
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

// Get all agencies (OWNER sees all, WHITELABEL sees their own)
const getAllAgencies = async (req, res) => {
  try {
    const where = { role: ROLES.AGENCY };
    if (req.user.role === ROLES.WHITELABEL) {
      where.whitelabelId = req.user.id;
    }

    const agencies = await req.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        whitelabelId: true,
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

// Get agency's clients (AGENCY, WHITELABEL, or OWNER)
const getAgencyClients = async (req, res) => {
  try {
    let where;

    if (req.user.role === ROLES.AGENCY) {
      where = { agencyId: req.user.id };
    } else if (req.user.role === ROLES.WHITELABEL) {
      if (req.params.agencyId) {
        // Verify the agency belongs to this whitelabel
        const agency = await req.prisma.user.findUnique({
          where: { id: parseInt(req.params.agencyId) },
          select: { whitelabelId: true }
        });
        if (!agency || agency.whitelabelId !== req.user.id) {
          return res.status(403).json({ error: 'Agency does not belong to you' });
        }
        where = { agencyId: parseInt(req.params.agencyId) };
      } else {
        // All clients under whitelabel's agencies + direct clients
        const myAgencies = await req.prisma.user.findMany({
          where: { role: ROLES.AGENCY, whitelabelId: req.user.id },
          select: { id: true }
        });
        const agencyIds = myAgencies.map(a => a.id);
        where = { agencyId: { in: [...agencyIds, req.user.id] } };
      }
    } else {
      // OWNER - specific agency or all
      const agencyId = req.params.agencyId ? parseInt(req.params.agencyId) : undefined;
      where = agencyId ? { agencyId } : { role: ROLES.CLIENT };
    }

    const clients = await req.prisma.user.findMany({
      where,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true,
        _count: {
          select: { agents: true }
        },
        waProjects: {
          select: {
            id: true,
            nombre: true,
            estado: true,
            whatsappChatId: true,
            totalMensajes: true,
            alertasCount: true,
            ultimaActividad: true
          }
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
    const { email, password, name, phoneNumber } = req.body;

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

    const agencyData = {
      email,
      password: hashedPassword,
      name,
      phoneNumber: phoneNumber || null,
      role: ROLES.AGENCY
    };

    // WHITELABEL: link agency to themselves
    if (req.user.role === ROLES.WHITELABEL) {
      agencyData.whitelabelId = req.user.id;
    }
    // OWNER: optionally link to a whitelabel
    if (req.user.role === ROLES.OWNER && req.body.whitelabelId) {
      agencyData.whitelabelId = parseInt(req.body.whitelabelId);
    }

    const agency = await req.prisma.user.create({
      data: agencyData,
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
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

    // Fire webhook
    fireAccountWebhook(req.prisma, agency, 'agency');

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
    const { email, password, name, phoneNumber, agencyId } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Determine agency
    let assignedAgencyId;
    if (req.user.role === ROLES.AGENCY) {
      assignedAgencyId = req.user.id;
    } else if (req.user.role === ROLES.WHITELABEL) {
      if (agencyId) {
        // Verify the agency belongs to this whitelabel
        const agency = await req.prisma.user.findUnique({
          where: { id: parseInt(agencyId) },
          select: { whitelabelId: true }
        });
        if (!agency || agency.whitelabelId !== req.user.id) {
          return res.status(403).json({ error: 'Agency does not belong to you' });
        }
        assignedAgencyId = parseInt(agencyId);
      } else {
        // Link directly to whitelabel
        assignedAgencyId = req.user.id;
      }
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
        phoneNumber: phoneNumber || null,
        role: ROLES.CLIENT,
        agencyId: assignedAgencyId
      },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
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

    // Fire webhook
    fireAccountWebhook(req.prisma, client, 'client');

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

// Delete user/client (OWNER, WHITELABEL, or AGENCY for their clients)
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

    // WHITELABEL can delete their agencies and their agencies' clients
    if (req.user.role === ROLES.WHITELABEL) {
      if (targetUser.whitelabelId === req.user.id) {
        // Direct agency - OK
      } else if (targetUser.agencyId) {
        const agency = await req.prisma.user.findUnique({
          where: { id: targetUser.agencyId },
          select: { whitelabelId: true }
        });
        if (!agency || agency.whitelabelId !== req.user.id) {
          return res.status(403).json({ error: 'Cannot delete this user' });
        }
      } else {
        return res.status(403).json({ error: 'Cannot delete this user' });
      }
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

    // Unlink agencies if deleting a whitelabel
    if (targetUser.role === ROLES.WHITELABEL) {
      await req.prisma.user.updateMany({
        where: { whitelabelId: targetId },
        data: { whitelabelId: null }
      });
    }

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

// Update user billing (credits and rates) - OWNER and WHITELABEL
const updateUserBilling = async (req, res) => {
  try {
    const { id } = req.params;
    const { credits, creditOperation, outboundRate, inboundRate, voiceAgentsEnabled, chatbotsEnabled, crmEnabled, agentGeneratorEnabled, callsPaused, messagesPaused } = req.body;

    const targetUser = await req.prisma.user.findUnique({
      where: { id: parseInt(id) }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // WHITELABEL can only manage billing for their agencies and clients
    if (req.user.role === ROLES.WHITELABEL) {
      let allowed = false;
      if (targetUser.whitelabelId === req.user.id) {
        allowed = true;
      } else if (targetUser.agencyId) {
        const agency = await req.prisma.user.findUnique({
          where: { id: targetUser.agencyId },
          select: { whitelabelId: true }
        });
        if (agency && agency.whitelabelId === req.user.id) allowed = true;
      }
      if (!allowed) {
        return res.status(403).json({ error: 'Cannot manage billing for this user' });
      }
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

    // Handle feature toggles
    if (voiceAgentsEnabled !== undefined) {
      updateData.voiceAgentsEnabled = Boolean(voiceAgentsEnabled);
    }
    if (chatbotsEnabled !== undefined) {
      updateData.chatbotsEnabled = Boolean(chatbotsEnabled);
    }
    if (crmEnabled !== undefined) {
      updateData.crmEnabled = Boolean(crmEnabled);
    }
    if (agentGeneratorEnabled !== undefined) {
      updateData.agentGeneratorEnabled = Boolean(agentGeneratorEnabled);
    }
    if (callsPaused !== undefined) {
      updateData.callsPaused = Boolean(callsPaused);
    }
    if (messagesPaused !== undefined) {
      updateData.messagesPaused = Boolean(messagesPaused);
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
        inboundRate: true,
        voiceAgentsEnabled: true,
        chatbotsEnabled: true,
        crmEnabled: true,
        agentGeneratorEnabled: true,
        callsPaused: true,
        messagesPaused: true
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
      const [totalClients, totalAgencies, totalAgents, totalCalls] = await Promise.all([
        req.prisma.user.count({ where: { role: ROLES.CLIENT } }),
        req.prisma.user.count({ where: { role: ROLES.AGENCY } }),
        req.prisma.agent.count(),
        req.prisma.callLog.count()
      ]);
      stats = { totalClients, totalAgencies, totalAgents, totalCalls };
    } else if (role === ROLES.WHITELABEL) {
      const myAgencies = await req.prisma.user.findMany({
        where: { role: ROLES.AGENCY, whitelabelId: id },
        select: { id: true }
      });
      const agencyIds = myAgencies.map(a => a.id);
      const userIds = [id, ...agencyIds];

      // Clients under my agencies + directly under me
      const clientIds = await req.prisma.user.findMany({
        where: { role: ROLES.CLIENT, agencyId: { in: userIds } },
        select: { id: true }
      });
      const allUserIds = [...userIds, ...clientIds.map(c => c.id)];

      const [totalAgencies, totalClients, totalAgents, totalCalls] = await Promise.all([
        Promise.resolve(agencyIds.length),
        Promise.resolve(clientIds.length),
        req.prisma.agent.count({ where: { userId: { in: allUserIds } } }),
        req.prisma.callLog.count({ where: { userId: { in: allUserIds } } })
      ]);
      stats = { totalAgencies, totalClients, totalAgents, totalCalls };
    } else if (role === ROLES.AGENCY) {
      const [totalClients, totalAgents, totalCalls] = await Promise.all([
        req.prisma.user.count({ where: { agencyId: id } }),
        req.prisma.agent.count({
          where: {
            user: { OR: [{ id }, { agencyId: id }] }
          }
        }),
        req.prisma.callLog.count({
          where: {
            user: { OR: [{ id }, { agencyId: id }] }
          }
        })
      ]);
      stats = { totalClients, totalAgents, totalCalls };
    } else {
      const [totalAgents, totalCalls] = await Promise.all([
        req.prisma.agent.count({ where: { userId: id } }),
        req.prisma.callLog.count({ where: { userId: id } })
      ]);
      stats = { totalAgents, totalCalls };
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
    } else if (role === ROLES.WHITELABEL) {
      // Whitelabel sees own + agencies + agencies' clients
      const myAgencies = await req.prisma.user.findMany({
        where: { role: ROLES.AGENCY, whitelabelId: id },
        select: { id: true }
      });
      const agencyIds = myAgencies.map(a => a.id);
      const myClients = await req.prisma.user.findMany({
        where: { role: ROLES.CLIENT, agencyId: { in: [id, ...agencyIds] } },
        select: { id: true }
      });
      const allUserIds = [id, ...agencyIds, ...myClients.map(c => c.id)];
      callUserFilter = { userId: { in: allUserIds } };
      agentFilter = { userId: { in: allUserIds } };
      clientFilter = { agencyId: { in: [id, ...agencyIds] } };
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

    // Build chatbot message filter based on role
    let chatbotUserFilter = {};
    if (role === ROLES.OWNER) {
      chatbotUserFilter = {};
    } else if (role === ROLES.WHITELABEL) {
      chatbotUserFilter = callUserFilter; // same user set
    } else if (role === ROLES.AGENCY) {
      chatbotUserFilter = callUserFilter;
    } else {
      chatbotUserFilter = { userId: id };
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
      topAgentsRaw,
      messagesToday,
      messagesYesterday,
      dailyMessages,
      messagesSummaryAgg,
      topChatbotsRaw
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
      // Total clients (OWNER/WHITELABEL/AGENCY only)
      (role === ROLES.OWNER || role === ROLES.WHITELABEL || role === ROLES.AGENCY)
        ? req.prisma.user.count({ where: clientFilter })
        : Promise.resolve(0),
      // New clients this month (OWNER/WHITELABEL/AGENCY only)
      (role === ROLES.OWNER || role === ROLES.WHITELABEL || role === ROLES.AGENCY)
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
      }),
      // Chatbot messages today
      req.prisma.chatbotMessage.count({
        where: { ...chatbotUserFilter, createdAt: { gte: todayStart } }
      }),
      // Chatbot messages yesterday
      req.prisma.chatbotMessage.count({
        where: { ...chatbotUserFilter, createdAt: { gte: yesterdayStart, lt: todayStart } }
      }),
      // Daily chatbot messages for last 7 days
      req.prisma.chatbotMessage.groupBy({
        by: ['createdAt'],
        where: { ...chatbotUserFilter, createdAt: { gte: weekAgo } },
        _count: { id: true },
        orderBy: { createdAt: 'asc' }
      }),
      // Chatbot messages summary aggregates
      req.prisma.chatbotMessage.aggregate({
        where: { ...chatbotUserFilter, createdAt: { gte: weekAgo } },
        _count: { id: true },
        _sum: { costCharged: true }
      }),
      // Top chatbots by message count
      req.prisma.chatbotMessage.groupBy({
        by: ['chatbotId', 'chatbotName'],
        where: { ...chatbotUserFilter },
        _count: { id: true },
        _sum: { costCharged: true },
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

    // Process daily chatbot messages into date buckets
    const dailyMsgMap = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(todayStart);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      dailyMsgMap[key] = 0;
    }
    dailyMessages.forEach(row => {
      const key = new Date(row.createdAt).toISOString().split('T')[0];
      if (dailyMsgMap[key] !== undefined) {
        dailyMsgMap[key] += row._count.id;
      }
    });
    const dailyMessagesFormatted = Object.entries(dailyMsgMap).map(([date, count]) => ({ date, count }));

    // Top chatbots
    const topChatbots = topChatbotsRaw.map(c => ({
      id: c.chatbotId,
      name: c.chatbotName || `Chatbot #${c.chatbotId}`,
      messages: c._count.id,
      cost: c._sum.costCharged || 0
    }));

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

    // Top clients (OWNER/WHITELABEL/AGENCY only)
    let topClients = [];
    if (role === ROLES.OWNER || role === ROLES.WHITELABEL || role === ROLES.AGENCY) {
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
      topClients,
      // Chatbot data
      messagesToday,
      messagesYesterday,
      dailyMessages: dailyMessagesFormatted,
      messagesSummary: {
        totalMessages: messagesSummaryAgg._count.id || 0,
        totalCost: messagesSummaryAgg._sum.costCharged || 0
      },
      topChatbots
    });
  } catch (error) {
    console.error('Get dashboard overview error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard overview' });
  }
};

// Create whitelabel (OWNER only)
const createWhitelabel = async (req, res) => {
  try {
    const { email, password, name, phoneNumber } = req.body;

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

    const whitelabel = await req.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phoneNumber: phoneNumber || null,
        role: ROLES.WHITELABEL
      },
      select: {
        id: true,
        email: true,
        name: true,
        phoneNumber: true,
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
          data: { assignedUserId: whitelabel.id }
        }),
        req.prisma.user.update({
          where: { id: whitelabel.id },
          data: {
            vapiApiKey: availableKey.vapiApiKey,
            vapiPublicKey: availableKey.vapiPublicKey
          }
        })
      ]);
    } else {
      vapiKeyWarning = 'No VAPI keys available in the pool. Add more keys in Settings > VAPI Key Pool.';
    }

    // Fire webhook
    fireAccountWebhook(req.prisma, whitelabel, 'whitelabel');

    res.status(201).json({
      message: 'Whitelabel created successfully',
      whitelabel,
      vapiKeyWarning
    });
  } catch (error) {
    console.error('Create whitelabel error:', error);
    res.status(500).json({ error: 'Failed to create whitelabel' });
  }
};

module.exports = {
  getAllUsers,
  getAllAgencies,
  getAgencyClients,
  createAgency,
  createClient,
  createWhitelabel,
  updateUserRole,
  updateUserBilling,
  deleteUser,
  getDashboardStats,
  getDashboardOverview
};
