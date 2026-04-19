const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');
const { decryptPHI } = require('../utils/phiEncryption');
const { logAudit } = require('../utils/auditLog');
const { getAgentRate } = require('../utils/pricingUtils');

// Categorize a VAPI call into an outcome
const categorizeOutcome = (call) => {
  const reason = call.endedReason;

  // No answer (customer didn't pick up, voicemail, busy)
  const noAnswerReasons = [
    'customer-did-not-answer', 'voicemail', 'customer-busy'
  ];
  if (noAnswerReasons.includes(reason)) return 'no_answer';

  // Error / connection failures → failed
  const failedReasons = [
    'assistant-error', 'assistant-not-found', 'db-error', 'no-server-available',
    'pipeline-error-extra-function-failed', 'pipeline-error-first-message-failed',
    'pipeline-error-function-filler-failed', 'pipeline-error-function-failed',
    'pipeline-error-openai-llm-failed', 'pipeline-error-azure-openai-llm-failed',
    'pipeline-error-openai-voice-failed', 'pipeline-error-cartesia-voice-failed',
    'pipeline-error-eleven-labs-voice-failed', 'pipeline-error-deepgram-transcriber-failed',
    'pipeline-no-available-model', 'server-shutdown', 'twilio-failed-to-connect-call',
    'assistant-join-timed-out',
    'customer-did-not-give-microphone-permission', 'manually-canceled',
    'phone-call-provider-closed-websocket'
  ];

  if (failedReasons.includes(reason)) return 'failed';
  if (reason === 'assistant-forwarded-call') return 'transferred';

  // Check structured data for booking/interest signals
  const structured = call.analysis?.structuredData;
  if (structured) {
    const json = typeof structured === 'string' ? (() => { try { return JSON.parse(structured); } catch { return structured; } })() : structured;

    // Check for booking signal
    if (json.booked === true || json.appointmentBooked === true ||
        json.booking_status === 'booked' || json.outcome === 'booked') {
      return 'booked';
    }
    // Check for not interested signal
    if (json.interested === false || json.not_interested === true ||
        json.outcome === 'not_interested') {
      return 'not_interested';
    }
  }

  // Check summary for booking keywords
  const summary = (call.analysis?.summary || '').toLowerCase();
  if (summary.includes('appointment booked') || summary.includes('booking confirmed') ||
      summary.includes('scheduled an appointment') || summary.includes('successfully booked')) {
    return 'booked';
  }
  if (summary.includes('not interested') || summary.includes('declined') ||
      summary.includes('do not call')) {
    return 'not_interested';
  }

  // Normal endings → answered
  const answeredReasons = [
    'customer-ended-call', 'assistant-ended-call', 'assistant-said-end-call-phrase',
    'silence-timed-out', 'exceeded-max-duration'
  ];
  if (answeredReasons.includes(reason)) return 'answered';

  return 'unknown';
};

const createCall = async (req, res) => {
  try {
    const { agentId, phoneNumberId, customerNumber, customerName } = req.body;

    if (!agentId || !phoneNumberId || !customerNumber) {
      return res.status(400).json({
        error: 'agentId, phoneNumberId, and customerNumber are required'
      });
    }

    // Check if voice agents are enabled
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { vapiCredits: true, voiceAgentsEnabled: true, callsPaused: true }
    });

    if (!user?.voiceAgentsEnabled) {
      return res.status(403).json({ error: 'Voice agents are disabled for this account.' });
    }

    if (user.callsPaused) {
      return res.status(403).json({ error: 'Calls are currently paused for this account.' });
    }

    if (!user || user.vapiCredits <= 0) {
      return res.status(403).json({
        error: 'Insufficient VAPI credits. Please contact your administrator to add credits.',
        code: 'INSUFFICIENT_CREDITS',
        credits: user?.vapiCredits || 0
      });
    }

    // Get the agent to verify ownership and get vapiId
    const agent = await req.prisma.agent.findFirst({
      where: {
        id: agentId,
        userId: req.user.id
      }
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    if (!agent.vapiId) {
      return res.status(400).json({ error: 'Agent is not connected to VAPI' });
    }

    // Verify phone number belongs to user
    const phoneNumber = await req.prisma.phoneNumber.findFirst({
      where: {
        id: parseInt(phoneNumberId),
        telephonyCredential: {
          userId: req.user.id
        }
      }
    });

    if (!phoneNumber) {
      return res.status(404).json({ error: 'Phone number not found' });
    }

    if (!phoneNumber.vapiPhoneNumberId) {
      return res.status(400).json({ error: 'Phone number is not imported to VAPI' });
    }

    // Set per-account VAPI key
    const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
    if (!vapiKey) {
      return res.status(400).json({ error: 'No VAPI API key configured for this account.' });
    }
    vapiService.setApiKey(vapiKey);

    // Create the call via VAPI
    const call = await vapiService.createCall({
      assistantId: agent.vapiId,
      phoneNumberId: phoneNumber.vapiPhoneNumberId,
      customer: {
        number: customerNumber,
        name: customerName
      }
    });

    console.log('[Call] VAPI response:', JSON.stringify(call, null, 2));

    if (!call || !call.id) {
      console.error('[Call] VAPI returned no call ID. Response:', call);
      return res.status(502).json({ error: 'VAPI returned an invalid response — the call may not have been placed. Check your VAPI dashboard and Twilio geo-permissions.' });
    }

    // Track the call for billing
    await req.prisma.callLog.create({
      data: {
        vapiCallId: call.id,
        userId: req.user.id,
        type: 'outbound',
        durationSeconds: 0,
        costCharged: 0,
        billed: false,
        agentId: agent.id
      }
    });

    res.json({
      message: 'Call initiated successfully',
      callId: call.id,
      call
    });
  } catch (error) {
    console.error('Create call error:', error);
    res.status(500).json({ error: error.message || 'Failed to create call' });
  }
};

const getCall = async (req, res) => {
  try {
    const { id } = req.params;
    const vapiKeyGet = await getVapiKeyForUser(req.prisma, req.user.id);
    if (vapiKeyGet) vapiService.setApiKey(vapiKeyGet);
    const call = await vapiService.getCall(id);
    res.json({ call });
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Failed to get call details' });
  }
};

const listCalls = async (req, res) => {
  try {
    const vapiKeyList = await getVapiKeyForUser(req.prisma, req.user.id);
    if (vapiKeyList) vapiService.setApiKey(vapiKeyList);

    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const { createdAtLt, createdAtGt, assistantId } = req.query;

    // Fetch VAPI calls and local data in parallel
    const callsPromise = vapiService.listCalls({ limit: limit + 1, createdAtLt, createdAtGt, assistantId });

    // Start DB queries immediately (don't wait for VAPI to finish first)
    const agentsPromise = req.prisma.agent.findMany({
      where: { userId: req.user.id },
      select: { id: true, name: true, vapiId: true }
    });
    const userPromise = req.prisma.user.findUnique({
      where: { id: req.user.id }, select: { vapiCredits: true }
    });

    const [rawCalls, allAgents, user] = await Promise.all([callsPromise, agentsPromise, userPromise]);

    // Check if there are more results beyond the current page
    const hasMore = rawCalls.length > limit;
    const calls = hasMore ? rawCalls.slice(0, limit) : rawCalls;

    // Build agent lookup map
    const agentMap = {};
    for (const agent of allAgents) { if (agent.vapiId) agentMap[agent.vapiId] = agent; }

    // Batch-fetch all call logs in 1 query
    const vapiCallIds = calls.map(c => c.id);
    const allCallLogs = await req.prisma.callLog.findMany({ where: { vapiCallId: { in: vapiCallIds } } });
    const callLogMap = {};
    for (const log of allCallLogs) { callLogMap[log.vapiCallId] = log; }

    // Enrich calls using the maps (no DB queries in the loop)
    const callLogIds = [];
    for (const call of calls) {
      if (call.assistantId && agentMap[call.assistantId]) {
        call.agentName = agentMap[call.assistantId].name;
        call.agentLocalId = agentMap[call.assistantId].id;
      }

      if (!call.duration && call.startedAt && call.endedAt) {
        call.duration = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
      }

      const callLog = callLogMap[call.id];
      if (callLog) {
        const decrypted = decryptPHI(callLog);
        call.billed = decrypted.billed;
        call.costCharged = decrypted.costCharged;
        call.outcome = decrypted.outcome;
        call.callLogId = decrypted.id;
        call.transcript = decrypted.transcript;
        call.summary = decrypted.summary;
        call.structuredData = decrypted.structuredData;
        call.customerNumber = decrypted.customerNumber;
        call.recordingUrl = decrypted.recordingUrl;
        if (decrypted.durationSeconds > 0) {
          call.duration = decrypted.durationSeconds;
        }
        callLogIds.push(decrypted.id);
      }
    }

    // Audit log: PHI access (fire-and-forget)
    if (callLogIds.length > 0) {
      logAudit(req.prisma, {
        userId: req.user.id,
        actorId: req.user.id,
        actorType: 'user',
        action: 'phi.access',
        resourceType: 'call_log',
        details: { callLogIds, count: callLogIds.length },
        req
      });
    }

    // Build pagination cursors from the calls' createdAt timestamps
    const firstCall = calls[0];
    const lastCall = calls[calls.length - 1];

    // Respond immediately — billing sync runs in background
    res.json({
      calls,
      agents: allAgents,
      userCredits: user?.vapiCredits,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore && lastCall ? lastCall.createdAt : null,
        prevCursor: firstCall ? firstCall.createdAt : null,
      }
    });

    // Background: sync billing for any calls the webhook might have missed
    syncCallBilling(req.prisma, calls).catch(err =>
      console.error('Background billing sync error:', err)
    );
  } catch (error) {
    console.error('List calls error:', error);
    res.status(500).json({ error: 'Failed to list calls' });
  }
};

// Analytics endpoint
const getAnalytics = async (req, res) => {
  try {
    const { startDate, endDate, agentId } = req.query;
    const userId = req.user.id;

    // Build where clause
    const where = { userId };
    if (agentId) where.agentId = agentId;
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate);
    }

    // Get all matching call logs
    const callLogs = await req.prisma.callLog.findMany({
      where,
      orderBy: { createdAt: 'asc' }
    });

    const totalCalls = callLogs.length;
    const totalDuration = callLogs.reduce((sum, c) => sum + c.durationSeconds, 0);
    const totalCost = callLogs.reduce((sum, c) => sum + c.costCharged, 0);

    // Count outcomes
    const outcomeCounts = { booked: 0, answered: 0, failed: 0, not_interested: 0, transferred: 0, voicemail: 0, unknown: 0 };
    for (const log of callLogs) {
      if (outcomeCounts.hasOwnProperty(log.outcome)) {
        outcomeCounts[log.outcome]++;
      } else {
        outcomeCounts.unknown++;
      }
    }

    const answeredTotal = outcomeCounts.answered + outcomeCounts.booked + outcomeCounts.not_interested + outcomeCounts.transferred;
    const answerRate = totalCalls > 0 ? (answeredTotal / totalCalls) * 100 : 0;
    const bookingRate = totalCalls > 0 ? (outcomeCounts.booked / totalCalls) * 100 : 0;
    const avgDuration = totalCalls > 0 ? totalDuration / totalCalls : 0;

    // Daily counts
    const dailyMap = {};
    for (const log of callLogs) {
      const day = log.createdAt.toISOString().slice(0, 10);
      if (!dailyMap[day]) {
        dailyMap[day] = { date: day, total: 0, booked: 0, answered: 0, failed: 0, not_interested: 0, transferred: 0, voicemail: 0, unknown: 0 };
      }
      dailyMap[day].total++;
      if (dailyMap[day].hasOwnProperty(log.outcome)) {
        dailyMap[day][log.outcome]++;
      } else {
        dailyMap[day].unknown++;
      }
    }
    const dailyCounts = Object.values(dailyMap);

    // Get user's agents for the filter dropdown
    const agents = await req.prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true }
    });

    res.json({
      summary: { totalCalls, answerRate, bookingRate, avgDuration, totalCost },
      outcomeCounts,
      dailyCounts,
      agents
    });
  } catch (error) {
    console.error('Get analytics error:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
};

// Manual outcome override
const updateOutcome = async (req, res) => {
  try {
    const { id } = req.params;
    const { outcome } = req.body;

    const validOutcomes = ['answered', 'booked', 'not_interested', 'failed', 'transferred', 'voicemail', 'unknown'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: `Invalid outcome. Must be one of: ${validOutcomes.join(', ')}` });
    }

    const callLog = await req.prisma.callLog.findFirst({
      where: { id: parseInt(id), userId: req.user.id }
    });

    if (!callLog) {
      return res.status(404).json({ error: 'Call log not found' });
    }

    const updated = await req.prisma.callLog.update({
      where: { id: callLog.id },
      data: { outcome }
    });

    res.json({ message: 'Outcome updated', callLog: updated });
  } catch (error) {
    console.error('Update outcome error:', error);
    res.status(500).json({ error: 'Failed to update outcome' });
  }
};

// Helper function to sync billing for completed calls
const syncCallBilling = async (prisma, vapiCalls) => {
  let billedCount = 0;
  let totalCharged = 0;

  // Only process ended calls
  const endedCalls = vapiCalls.filter(c => c.status === 'ended');
  if (endedCalls.length === 0) return { billedCount, totalCharged };

  // Batch-fetch all existing call logs and agents upfront
  const vapiCallIds = endedCalls.map(c => c.id);
  const assistantIds = [...new Set(endedCalls.map(c => c.assistantId).filter(Boolean))];

  const [existingLogs, agents] = await Promise.all([
    prisma.callLog.findMany({ where: { vapiCallId: { in: vapiCallIds } } }),
    assistantIds.length > 0
      ? prisma.agent.findMany({ where: { vapiId: { in: assistantIds } } })
      : []
  ]);

  const logMap = {};
  for (const log of existingLogs) { logMap[log.vapiCallId] = log; }
  const agentByVapiId = {};
  const agentById = {};
  for (const agent of agents) {
    agentByVapiId[agent.vapiId] = agent;
    agentById[agent.id] = agent;
  }

  // Collect batch updates: unknown outcomes to fix, and calls to bill
  const outcomeUpdates = [];
  const callsToBill = [];

  for (const call of endedCalls) {
    const existingLog = logMap[call.id];

    // Already billed with cost > 0 — just fix unknown outcomes
    if (existingLog && existingLog.billed && existingLog.costCharged > 0) {
      if (existingLog.outcome === 'unknown') {
        const outcome = categorizeOutcome(call);
        let agentId = existingLog.agentId;
        if (!agentId && call.assistantId && agentByVapiId[call.assistantId]) {
          agentId = agentByVapiId[call.assistantId].id;
        }
        outcomeUpdates.push(prisma.callLog.update({
          where: { id: existingLog.id },
          data: { outcome, ...(agentId && !existingLog.agentId ? { agentId } : {}) }
        }));
      }
      continue;
    }

    // Resolve agent and userId
    let userId = existingLog?.userId;
    let agentId = existingLog?.agentId || null;
    const agent = call.assistantId ? agentByVapiId[call.assistantId] : null;

    if (!userId && agent) {
      userId = agent.userId;
      agentId = agent.id;
    }
    if (!agentId && agent) {
      agentId = agent.id;
    }
    if (!userId) continue;

    // Calculate duration
    let durationSeconds = call.duration || call.durationSeconds || 0;
    if (!durationSeconds && call.startedAt && call.endedAt) {
      durationSeconds = (new Date(call.endedAt).getTime() - new Date(call.startedAt).getTime()) / 1000;
    }

    callsToBill.push({ call, existingLog, userId, agentId, durationSeconds, agent });
  }

  // Fire outcome updates in parallel
  if (outcomeUpdates.length > 0) {
    await Promise.all(outcomeUpdates);
  }

  // Process billing — needs sequential user credit decrements per user
  // But we can batch-fetch user rates upfront
  const userIds = [...new Set(callsToBill.map(c => c.userId))];
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, outboundRate: true, inboundRate: true } })
    : [];
  const userMap = {};
  for (const u of users) { userMap[u.id] = u; }

  // Pre-compute agent rates for unique agents
  const agentRateCache = {};
  for (const { agentId, userId, agent } of callsToBill) {
    if (agentId && agent && !agentRateCache[agentId]) {
      try {
        agentRateCache[agentId] = await getAgentRate(prisma, agent, userId);
      } catch (e) {
        agentRateCache[agentId] = null;
      }
    }
  }

  for (const { call, existingLog, userId, agentId, durationSeconds } of callsToBill) {
    const isOutbound = call.type === 'outboundPhoneCall';
    const durationMinutes = durationSeconds / 60;

    const dynamicRate = agentId ? agentRateCache[agentId] : null;
    let rate;
    if (dynamicRate) {
      rate = dynamicRate.totalRate;
    } else {
      const user = userMap[userId];
      const outboundRate = user?.outboundRate ?? 0.10;
      const inboundRate = user?.inboundRate ?? 0.05;
      rate = isOutbound ? outboundRate : inboundRate;
    }

    const cost = durationMinutes * rate;
    const outcome = categorizeOutcome(call);

    if (existingLog) {
      await prisma.callLog.update({
        where: { id: existingLog.id },
        data: { durationSeconds, costCharged: cost, billed: true, outcome, ...(agentId ? { agentId } : {}) }
      });
    } else {
      await prisma.callLog.create({
        data: {
          vapiCallId: call.id, userId, type: isOutbound ? 'outbound' : 'inbound',
          durationSeconds, costCharged: cost, billed: true, outcome,
          ...(agentId ? { agentId } : {})
        }
      });
    }

    if (cost > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: { vapiCredits: { decrement: cost } }
      });
      billedCount++;
      totalCharged += cost;
    }
  }

  return { billedCount, totalCharged };
};

// Advanced Analytics endpoint (multi-tab)
const getAdvancedAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const userId = req.user.id;
    const userRole = req.user.role;

    // Determine which users' data to query
    let userFilter;
    if (userRole === 'OWNER') {
      userFilter = {}; // All users
    } else if (userRole === 'AGENCY') {
      // Own data + own clients
      const clients = await req.prisma.user.findMany({
        where: { agencyId: userId },
        select: { id: true }
      });
      const clientIds = clients.map(c => c.id);
      userFilter = { userId: { in: [userId, ...clientIds] } };
    } else {
      userFilter = { userId };
    }

    // Date filter for callLogs
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.lte = new Date(endDate);
    }

    const callWhere = { ...userFilter, ...dateFilter };

    // ── REVENUE (OWNER only) ──
    let revenue = null;
    if (userRole === 'OWNER') {
      const activeUserProducts = await req.prisma.userProduct.findMany({
        where: { status: 'active' },
        include: { product: true, user: { select: { id: true, name: true, email: true } } }
      });

      // Compute MRR
      let mrr = 0;
      const revenueByProductMap = {};
      const revenueByBillingCycle = { monthly: 0, quarterly: 0, annual: 0, lifetime: 0 };

      for (const up of activeUserProducts) {
        let monthlyEquivalent = 0;
        switch (up.billingCycle) {
          case 'monthly': monthlyEquivalent = up.amount; break;
          case 'quarterly': monthlyEquivalent = up.amount / 3; break;
          case 'annual': monthlyEquivalent = up.amount / 12; break;
          case 'lifetime': monthlyEquivalent = 0; break;
        }
        mrr += monthlyEquivalent;
        revenueByBillingCycle[up.billingCycle] = (revenueByBillingCycle[up.billingCycle] || 0) + up.amount;

        const slug = up.product.slug;
        if (!revenueByProductMap[slug]) {
          revenueByProductMap[slug] = { productName: up.product.name, slug, count: 0, revenue: 0 };
        }
        revenueByProductMap[slug].count++;
        revenueByProductMap[slug].revenue += up.amount;
      }

      // Credits consumed (all call costs + chatbot message costs in range)
      const [creditsAgg, chatbotCreditsAgg] = await Promise.all([
        req.prisma.callLog.aggregate({
          where: dateFilter,
          _sum: { costCharged: true }
        }),
        req.prisma.chatbotMessage.aggregate({
          where: dateFilter,
          _sum: { costCharged: true }
        })
      ]);
      const creditsConsumed = (creditsAgg._sum.costCharged || 0) + (chatbotCreditsAgg._sum.costCharged || 0);

      // Total remaining credits across all users
      const creditsRemAgg = await req.prisma.user.aggregate({
        _sum: { vapiCredits: true }
      });
      const creditsRemaining = creditsRemAgg._sum.vapiCredits || 0;

      // Top spenders
      const allCallLogs = await req.prisma.callLog.groupBy({
        by: ['userId'],
        ...dateFilter.createdAt ? { where: dateFilter } : {},
        _sum: { costCharged: true },
        orderBy: { _sum: { costCharged: 'desc' } },
        take: 10
      });
      const topSpenderIds = allCallLogs.map(c => c.userId);
      const topSpenderUsers = topSpenderIds.length > 0 ? await req.prisma.user.findMany({
        where: { id: { in: topSpenderIds } },
        select: { id: true, name: true, email: true, vapiCredits: true }
      }) : [];
      const userMap = {};
      topSpenderUsers.forEach(u => { userMap[u.id] = u; });
      const topSpenders = allCallLogs.map(c => ({
        userId: c.userId,
        name: userMap[c.userId]?.name || 'Unknown',
        email: userMap[c.userId]?.email || '',
        totalCost: parseFloat((c._sum.costCharged || 0).toFixed(2)),
        credits: parseFloat((userMap[c.userId]?.vapiCredits || 0).toFixed(2))
      }));

      revenue = {
        mrr: parseFloat(mrr.toFixed(2)),
        arr: parseFloat((mrr * 12).toFixed(2)),
        totalActiveSubscriptions: activeUserProducts.length,
        revenueByProduct: Object.values(revenueByProductMap).map(r => ({
          ...r, revenue: parseFloat(r.revenue.toFixed(2))
        })),
        revenueByBillingCycle: Object.fromEntries(
          Object.entries(revenueByBillingCycle).map(([k, v]) => [k, parseFloat(v.toFixed(2))])
        ),
        creditsConsumed: parseFloat(creditsConsumed.toFixed(2)),
        creditsRemaining: parseFloat(creditsRemaining.toFixed(2)),
        topSpenders
      };
    }

    // ── AGENTS ──
    const agentWhere = userRole === 'OWNER' ? {} :
      userRole === 'AGENCY' ? { userId: { in: [userId, ...(userFilter.userId?.in?.slice(1) || [])] } } :
      { userId };

    const allAgents = await req.prisma.agent.findMany({
      where: agentWhere,
      select: { id: true, name: true, agentType: true, createdAt: true }
    });
    const agentMap = {};
    allAgents.forEach(a => { agentMap[a.id] = a; });

    // Per-agent call stats
    const agentCallStats = await req.prisma.callLog.groupBy({
      by: ['agentId'],
      where: { ...callWhere, agentId: { not: null } },
      _count: { id: true },
      _sum: { durationSeconds: true, costCharged: true }
    });

    // Per-agent outcome counts
    const agentOutcomeStats = await req.prisma.callLog.groupBy({
      by: ['agentId', 'outcome'],
      where: { ...callWhere, agentId: { not: null } },
      _count: { id: true }
    });
    const agentOutcomeMap = {};
    for (const row of agentOutcomeStats) {
      if (!row.agentId) continue;
      if (!agentOutcomeMap[row.agentId]) agentOutcomeMap[row.agentId] = {};
      agentOutcomeMap[row.agentId][row.outcome] = row._count.id;
    }

    const perAgent = agentCallStats.map(s => {
      const agent = agentMap[s.agentId] || {};
      const outcomes = agentOutcomeMap[s.agentId] || {};
      const totalCalls = s._count.id;
      const booked = outcomes.booked || 0;
      const answered = (outcomes.answered || 0) + booked + (outcomes.not_interested || 0) + (outcomes.transferred || 0);
      const failed = outcomes.failed || 0;
      const totalDuration = s._sum.durationSeconds || 0;
      const totalCost = s._sum.costCharged || 0;
      return {
        agentId: s.agentId,
        name: agent.name || 'Unknown',
        agentType: agent.agentType || 'unknown',
        totalCalls,
        totalDuration: parseFloat(totalDuration.toFixed(1)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        booked,
        answered,
        failed,
        bookingRate: totalCalls > 0 ? parseFloat(((booked / totalCalls) * 100).toFixed(1)) : 0,
        answerRate: totalCalls > 0 ? parseFloat(((answered / totalCalls) * 100).toFixed(1)) : 0,
        avgDuration: totalCalls > 0 ? parseFloat((totalDuration / totalCalls).toFixed(1)) : 0,
        costPerBooking: booked > 0 ? parseFloat((totalCost / booked).toFixed(2)) : 0
      };
    }).sort((a, b) => b.totalCalls - a.totalCalls);

    // Utilization by day (top 5 agents by call count)
    const top5AgentIds = perAgent.slice(0, 5).map(a => a.agentId);
    const dailyAgentLogs = top5AgentIds.length > 0 ? await req.prisma.callLog.findMany({
      where: { ...callWhere, agentId: { in: top5AgentIds } },
      select: { agentId: true, createdAt: true }
    }) : [];
    const utilizationMap = {};
    for (const log of dailyAgentLogs) {
      const day = log.createdAt.toISOString().slice(0, 10);
      const key = `${day}-${log.agentId}`;
      if (!utilizationMap[key]) {
        utilizationMap[key] = { date: day, agentId: log.agentId, agentName: agentMap[log.agentId]?.name || 'Unknown', calls: 0 };
      }
      utilizationMap[key].calls++;
    }

    const agents = {
      perAgent,
      utilizationByDay: Object.values(utilizationMap).sort((a, b) => a.date.localeCompare(b.date))
    };

    // ── CALLS (quality) ──
    const allCallLogsForQuality = await req.prisma.callLog.findMany({
      where: callWhere,
      select: { endedReason: true, type: true, createdAt: true, outcome: true, costCharged: true }
    });

    const endReasons = {};
    const inboundVsOutbound = { inbound: 0, outbound: 0 };
    const hourlyMap = {};
    let totalBooked = 0;
    let totalCostForBooking = 0;

    for (const log of allCallLogsForQuality) {
      // End reasons
      const reason = log.endedReason || 'unknown';
      endReasons[reason] = (endReasons[reason] || 0) + 1;

      // Inbound vs outbound
      if (log.type === 'inbound') inboundVsOutbound.inbound++;
      else inboundVsOutbound.outbound++;

      // Hourly heatmap
      const dt = log.createdAt;
      const dayOfWeek = dt.getUTCDay();
      const hour = dt.getUTCHours();
      const hkey = `${dayOfWeek}-${hour}`;
      if (!hourlyMap[hkey]) hourlyMap[hkey] = { dayOfWeek, hour, count: 0 };
      hourlyMap[hkey].count++;

      // Cost per booking
      if (log.outcome === 'booked') {
        totalBooked++;
        totalCostForBooking += (log.costCharged || 0);
      }
    }

    const calls = {
      endReasons,
      inboundVsOutbound,
      hourlyHeatmap: Object.values(hourlyMap),
      costPerBooking: totalBooked > 0 ? parseFloat((totalCostForBooking / totalBooked).toFixed(2)) : 0
    };

    // ── CLIENTS (OWNER/AGENCY only) ──
    let clients = null;
    if (userRole === 'OWNER' || userRole === 'AGENCY') {
      const clientWhere = userRole === 'OWNER'
        ? { role: 'CLIENT' }
        : { role: 'CLIENT', agencyId: userId };

      const allClients = await req.prisma.user.findMany({
        where: clientWhere,
        select: { id: true, name: true, email: true, createdAt: true, vapiCredits: true }
      });

      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      // Get last call date + call counts for each client
      const clientIds = allClients.map(c => c.id);
      const clientCallStats = clientIds.length > 0 ? await req.prisma.callLog.groupBy({
        by: ['userId'],
        where: { userId: { in: clientIds } },
        _count: { id: true },
        _max: { createdAt: true }
      }) : [];

      const monthlyCallStats = clientIds.length > 0 ? await req.prisma.callLog.groupBy({
        by: ['userId'],
        where: {
          userId: { in: clientIds },
          createdAt: { gte: new Date(`${currentMonth}-01`) }
        },
        _count: { id: true }
      }) : [];
      const monthlyMap = {};
      monthlyCallStats.forEach(s => { monthlyMap[s.userId] = s._count.id; });

      const callStatMap = {};
      clientCallStats.forEach(s => { callStatMap[s.userId] = s; });

      const clientActivity = [];
      const atRiskClients = [];
      let activeCount = 0;
      let newThisMonthCount = 0;

      for (const client of allClients) {
        const stats = callStatMap[client.id];
        const lastCallDate = stats?._max?.createdAt || null;
        const totalCalls = stats?._count?.id || 0;
        const callsThisMonth = monthlyMap[client.id] || 0;
        const isActive = lastCallDate && new Date(lastCallDate) >= thirtyDaysAgo;

        if (isActive) activeCount++;

        const clientCreatedMonth = `${client.createdAt.getFullYear()}-${String(client.createdAt.getMonth() + 1).padStart(2, '0')}`;
        if (clientCreatedMonth === currentMonth) newThisMonthCount++;

        clientActivity.push({
          userId: client.id,
          name: client.name || 'Unnamed',
          email: client.email,
          lastCallDate: lastCallDate ? lastCallDate.toISOString().slice(0, 10) : null,
          callsThisMonth,
          totalCalls,
          credits: parseFloat((client.vapiCredits || 0).toFixed(2)),
          status: isActive ? 'active' : 'inactive'
        });

        if (!isActive && totalCalls > 0) {
          const daysSinceLastCall = lastCallDate
            ? Math.floor((now.getTime() - new Date(lastCallDate).getTime()) / (1000 * 60 * 60 * 24))
            : 999;
          atRiskClients.push({
            userId: client.id,
            name: client.name || 'Unnamed',
            email: client.email,
            lastCallDate: lastCallDate ? lastCallDate.toISOString().slice(0, 10) : null,
            daysSinceLastCall,
            credits: parseFloat((client.vapiCredits || 0).toFixed(2))
          });
        }
      }

      // New clients over time (monthly)
      const newClientsMap = {};
      for (const client of allClients) {
        const month = `${client.createdAt.getFullYear()}-${String(client.createdAt.getMonth() + 1).padStart(2, '0')}`;
        newClientsMap[month] = (newClientsMap[month] || 0) + 1;
      }

      clients = {
        totalClients: allClients.length,
        activeClients: activeCount,
        newClientsOverTime: Object.entries(newClientsMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({ month, count })),
        clientActivity: clientActivity.sort((a, b) => b.callsThisMonth - a.callsThisMonth),
        atRiskClients: atRiskClients.sort((a, b) => b.daysSinceLastCall - a.daysSinceLastCall),
        newThisMonth: newThisMonthCount
      };
    }

    // ── GROWTH (OWNER/AGENCY) ──
    let growth = null;
    if (userRole === 'OWNER' || userRole === 'AGENCY') {
      const growthAgentWhere = userRole === 'OWNER' ? {} : agentWhere;

      const allGrowthAgents = await req.prisma.agent.findMany({
        where: growthAgentWhere,
        select: { createdAt: true }
      });

      const agentsOverTimeMap = {};
      for (const agent of allGrowthAgents) {
        const month = `${agent.createdAt.getFullYear()}-${String(agent.createdAt.getMonth() + 1).padStart(2, '0')}`;
        agentsOverTimeMap[month] = (agentsOverTimeMap[month] || 0) + 1;
      }

      const calIntWhere = userRole === 'OWNER' ? {} : { userId: { in: [userId, ...(userFilter.userId?.in?.slice(1) || [])] } };
      const totalCalendarIntegrations = await req.prisma.calendarIntegration.count({ where: calIntWhere });

      // Product adoption
      const productAdoption = [];
      if (userRole === 'OWNER') {
        const products = await req.prisma.product.findMany({ where: { isActive: true } });
        const totalUsers = await req.prisma.user.count();
        for (const product of products) {
          const activeUsers = await req.prisma.userProduct.count({
            where: { productId: product.id, status: 'active' }
          });
          productAdoption.push({
            productName: product.name,
            slug: product.slug,
            activeUsers,
            totalUsers,
            adoptionRate: totalUsers > 0 ? parseFloat(((activeUsers / totalUsers) * 100).toFixed(1)) : 0
          });
        }
      }

      const chatbotCountWhere = userRole === 'OWNER' ? {} : growthAgentWhere;
      const totalChatbots = await req.prisma.chatbot.count({ where: chatbotCountWhere });

      growth = {
        agentsOverTime: Object.entries(agentsOverTimeMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([month, count]) => ({ month, count })),
        totalAgents: allGrowthAgents.length,
        totalChatbots,
        totalCalendarIntegrations,
        productAdoption
      };
    }

    // ── CHATBOTS ──
    const chatbotMsgWhere = { ...userFilter, ...dateFilter };

    const totalChatbotMessages = await req.prisma.chatbotMessage.aggregate({
      where: chatbotMsgWhere,
      _count: { id: true },
      _sum: { costCharged: true }
    });

    // Per-chatbot stats
    const perChatbotRaw = await req.prisma.chatbotMessage.groupBy({
      by: ['chatbotId', 'chatbotName'],
      where: chatbotMsgWhere,
      _count: { id: true },
      _sum: { costCharged: true }
    });

    // Per-chatbot status breakdown
    const chatbotStatusRaw = await req.prisma.chatbotMessage.groupBy({
      by: ['chatbotId', 'status'],
      where: chatbotMsgWhere,
      _count: { id: true }
    });
    const chatbotStatusMap = {};
    for (const row of chatbotStatusRaw) {
      if (!chatbotStatusMap[row.chatbotId]) chatbotStatusMap[row.chatbotId] = {};
      chatbotStatusMap[row.chatbotId][row.status] = row._count.id;
    }

    const perChatbot = perChatbotRaw.map(c => {
      const statuses = chatbotStatusMap[c.chatbotId] || {};
      const total = c._count.id;
      const successCount = statuses.success || 0;
      const errorCount = statuses.error || 0;
      return {
        chatbotId: c.chatbotId,
        name: c.chatbotName || 'Unknown',
        totalMessages: total,
        totalCost: parseFloat((c._sum.costCharged || 0).toFixed(2)),
        successCount,
        errorCount,
        successRate: total > 0 ? parseFloat(((successCount / total) * 100).toFixed(1)) : 0
      };
    }).sort((a, b) => b.totalMessages - a.totalMessages);

    // Daily chatbot message counts
    const chatbotDailyRaw = await req.prisma.chatbotMessage.findMany({
      where: chatbotMsgWhere,
      select: { createdAt: true, status: true }
    });
    const chatbotDailyMap = {};
    const chatbotStatusTotals = { success: 0, error: 0 };
    for (const msg of chatbotDailyRaw) {
      const day = msg.createdAt.toISOString().slice(0, 10);
      if (!chatbotDailyMap[day]) chatbotDailyMap[day] = { date: day, total: 0, success: 0, error: 0 };
      chatbotDailyMap[day].total++;
      if (msg.status === 'error') {
        chatbotDailyMap[day].error++;
        chatbotStatusTotals.error++;
      } else {
        chatbotDailyMap[day].success++;
        chatbotStatusTotals.success++;
      }
    }
    const chatbotDailyCounts = Object.values(chatbotDailyMap).sort((a, b) => a.date.localeCompare(b.date));

    // Chatbot utilization by day (top 5 chatbots)
    const top5ChatbotIds = perChatbot.slice(0, 5).map(c => c.chatbotId);
    const chatbotUtilRaw = top5ChatbotIds.length > 0 ? await req.prisma.chatbotMessage.findMany({
      where: { ...chatbotMsgWhere, chatbotId: { in: top5ChatbotIds } },
      select: { chatbotId: true, chatbotName: true, createdAt: true }
    }) : [];
    const chatbotUtilMap = {};
    for (const msg of chatbotUtilRaw) {
      const day = msg.createdAt.toISOString().slice(0, 10);
      const key = `${day}-${msg.chatbotId}`;
      if (!chatbotUtilMap[key]) {
        chatbotUtilMap[key] = { date: day, chatbotId: msg.chatbotId, chatbotName: msg.chatbotName || 'Unknown', messages: 0 };
      }
      chatbotUtilMap[key].messages++;
    }

    const chatbots = {
      totalMessages: totalChatbotMessages._count.id || 0,
      totalCost: parseFloat((totalChatbotMessages._sum.costCharged || 0).toFixed(2)),
      perChatbot,
      dailyCounts: chatbotDailyCounts,
      statusTotals: chatbotStatusTotals,
      utilizationByDay: Object.values(chatbotUtilMap).sort((a, b) => a.date.localeCompare(b.date))
    };

    res.json({ revenue, agents, calls, clients, growth, chatbots });
  } catch (error) {
    console.error('Get advanced analytics error:', error);
    res.status(500).json({ error: 'Failed to get advanced analytics' });
  }
};

module.exports = {
  createCall,
  getCall,
  listCalls,
  getAnalytics,
  getAdvancedAnalytics,
  updateOutcome
};
