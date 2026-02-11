const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');
const { decryptPHI } = require('../utils/phiEncryption');
const { logAudit } = require('../utils/auditLog');
const { getAgentRate } = require('../utils/pricingUtils');

// Categorize a VAPI call into an outcome
const categorizeOutcome = (call) => {
  const reason = call.endedReason;

  // Error / connection failures → failed
  const failedReasons = [
    'assistant-error', 'assistant-not-found', 'db-error', 'no-server-available',
    'pipeline-error-extra-function-failed', 'pipeline-error-first-message-failed',
    'pipeline-error-function-filler-failed', 'pipeline-error-function-failed',
    'pipeline-error-openai-llm-failed', 'pipeline-error-azure-openai-llm-failed',
    'pipeline-error-openai-voice-failed', 'pipeline-error-cartesia-voice-failed',
    'pipeline-error-eleven-labs-voice-failed', 'pipeline-error-deepgram-transcriber-failed',
    'pipeline-no-available-model', 'server-shutdown', 'twilio-failed-to-connect-call',
    'assistant-join-timed-out', 'customer-busy', 'customer-did-not-answer',
    'customer-did-not-give-microphone-permission', 'manually-canceled',
    'phone-call-provider-closed-websocket'
  ];

  if (failedReasons.includes(reason)) return 'failed';
  if (reason === 'voicemail') return 'voicemail';
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

    // Check if user has VAPI credits
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { vapiCredits: true }
    });

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
        id: parseInt(agentId),
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
        twilioCredentials: {
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
    if (vapiKey) vapiService.setApiKey(vapiKey);

    // Create the call via VAPI
    const call = await vapiService.createCall({
      assistantId: agent.vapiId,
      phoneNumberId: phoneNumber.vapiPhoneNumberId,
      customer: {
        number: customerNumber,
        name: customerName
      }
    });

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

    res.status(201).json({
      message: 'Call initiated successfully',
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
    const calls = await vapiService.listCalls();

    // Auto-sync billing for completed calls
    let billingResult = { billedCount: 0, totalCharged: 0 };
    try {
      billingResult = await syncCallBilling(req.prisma, calls);
      console.log('Billing sync result:', billingResult);
    } catch (billingError) {
      console.error('Billing sync error:', billingError);
      // Don't fail the request if billing sync fails
    }

    // Enrich calls with agent names, duration, and billing info from our database
    const enrichedCalls = await Promise.all(calls.map(async (call) => {
      if (call.assistantId) {
        const agent = await req.prisma.agent.findFirst({
          where: { vapiId: call.assistantId },
          select: { id: true, name: true }
        });
        if (agent) {
          call.agentName = agent.name;
          call.agentLocalId = agent.id;
        }
      }

      // Calculate duration from timestamps if not available
      if (!call.duration && call.startedAt && call.endedAt) {
        const startTime = new Date(call.startedAt).getTime();
        const endTime = new Date(call.endedAt).getTime();
        call.duration = (endTime - startTime) / 1000; // in seconds
      }

      // Add billing info + outcome (decrypt PHI fields from DB)
      const callLog = await req.prisma.callLog.findUnique({
        where: { vapiCallId: call.id }
      });
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
        // Use stored duration if available
        if (decrypted.durationSeconds > 0) {
          call.duration = decrypted.durationSeconds;
        }
      }
      return call;
    }));

    // Audit log: PHI access
    const callLogIds = enrichedCalls.filter(c => c.callLogId).map(c => c.callLogId);
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

    // Get user's current credits to return
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { vapiCredits: true }
    });

    res.json({ calls: enrichedCalls, userCredits: user?.vapiCredits, billingResult });
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
    if (agentId) where.agentId = parseInt(agentId);
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
  // Note: We now use per-user rates from User model instead of global CallRate

  let billedCount = 0;
  let totalCharged = 0;

  console.log(`Processing ${vapiCalls.length} calls for billing`);

  for (const call of vapiCalls) {
    // Log all duration-related fields to find the correct one
    console.log(`Call ${call.id}: status=${call.status}, type=${call.type}, duration=${call.duration}, durationSeconds=${call.durationSeconds}, durationMinutes=${call.durationMinutes}, startedAt=${call.startedAt}, endedAt=${call.endedAt}`);

    // Skip if not ended
    if (call.status !== 'ended') {
      console.log(`Skipping call ${call.id}: not ended`);
      continue;
    }

    // Skip webCall type (test calls)
    if (call.type === 'webCall') {
      console.log(`Skipping call ${call.id}: webCall (test call)`);
      continue;
    }

    // Check if already billed
    const existingLog = await prisma.callLog.findUnique({
      where: { vapiCallId: call.id }
    });

    console.log(`Call ${call.id}: existingLog=${existingLog ? JSON.stringify(existingLog) : 'null'}`);

    // Skip only if already billed WITH a cost (re-bill if cost was 0)
    if (existingLog && existingLog.billed && existingLog.costCharged > 0) {
      // Still update outcome if it's unknown
      if (existingLog.outcome === 'unknown') {
        const outcome = categorizeOutcome(call);
        // Also resolve agentId if missing
        let agentId = existingLog.agentId;
        if (!agentId && call.assistantId) {
          const agent = await prisma.agent.findFirst({ where: { vapiId: call.assistantId } });
          if (agent) agentId = agent.id;
        }
        await prisma.callLog.update({
          where: { id: existingLog.id },
          data: { outcome, ...(agentId && !existingLog.agentId ? { agentId } : {}) }
        });
      }
      console.log(`Skipping call ${call.id}: already billed with cost ${existingLog.costCharged}`);
      continue;
    }

    // Determine call type
    const isOutbound = call.type === 'outboundPhoneCall';

    // Try multiple ways to get duration
    let durationSeconds = call.duration || call.durationSeconds || 0;

    // If no duration field, calculate from timestamps
    if (!durationSeconds && call.startedAt && call.endedAt) {
      const startTime = new Date(call.startedAt).getTime();
      const endTime = new Date(call.endedAt).getTime();
      durationSeconds = (endTime - startTime) / 1000;
    }

    const durationMinutes = durationSeconds / 60;

    console.log(`Call ${call.id}: calculated durationSeconds=${durationSeconds}, durationMinutes=${durationMinutes}`);

    // Find the user who owns this call first (to get their rates)
    let userId = existingLog?.userId;
    let agentId = existingLog?.agentId || null;

    if (!userId && call.assistantId) {
      const agent = await prisma.agent.findFirst({
        where: { vapiId: call.assistantId }
      });
      if (agent) {
        userId = agent.userId;
        agentId = agent.id;
      }
    }

    if (!userId) {
      console.log(`Skipping call ${call.id}: no userId found`);
      continue;
    }

    // Resolve agentId if we have userId but not agentId
    if (!agentId && call.assistantId) {
      const agent = await prisma.agent.findFirst({ where: { vapiId: call.assistantId } });
      if (agent) agentId = agent.id;
    }

    // Try dynamic pricing first (per-agent model+transcriber rates)
    let rate;
    let dynamicRate = null;

    if (agentId) {
      const agent = await prisma.agent.findUnique({ where: { id: agentId } });
      if (agent) {
        dynamicRate = await getAgentRate(prisma, agent, userId);
      }
    }

    if (dynamicRate) {
      rate = dynamicRate.totalRate;
    } else {
      // Fallback to legacy per-user rates
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { outboundRate: true, inboundRate: true }
      });
      const outboundRate = user?.outboundRate ?? 0.10;
      const inboundRate = user?.inboundRate ?? 0.05;
      rate = isOutbound ? outboundRate : inboundRate;
    }

    const cost = durationMinutes * rate;

    // Categorize outcome
    const outcome = categorizeOutcome(call);

    console.log(`Billing call ${call.id}: duration=${durationSeconds}s, minutes=${durationMinutes}, rate=${rate}, cost=${cost}, userId=${userId}, outcome=${outcome}`);

    // Create or update call log
    if (existingLog) {
      await prisma.callLog.update({
        where: { id: existingLog.id },
        data: {
          durationSeconds,
          costCharged: cost,
          billed: true,
          outcome,
          ...(agentId ? { agentId } : {})
        }
      });
    } else {
      await prisma.callLog.create({
        data: {
          vapiCallId: call.id,
          userId,
          type: isOutbound ? 'outbound' : 'inbound',
          durationSeconds,
          costCharged: cost,
          billed: true,
          outcome,
          ...(agentId ? { agentId } : {})
        }
      });
    }

    // Deduct from user's credits
    if (cost > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          vapiCredits: {
            decrement: cost
          }
        }
      });
      billedCount++;
      totalCharged += cost;
      console.log(`Billed user ${userId}: $${cost.toFixed(4)}`);
    }
  }

  return { billedCount, totalCharged };
};

module.exports = {
  createCall,
  getCall,
  listCalls,
  getAnalytics,
  updateOutcome
};
