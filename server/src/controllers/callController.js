const vapiService = require('../services/vapiService');

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
        billed: false
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
    const call = await vapiService.getCall(id);
    res.json({ call });
  } catch (error) {
    console.error('Get call error:', error);
    res.status(500).json({ error: 'Failed to get call details' });
  }
};

const listCalls = async (req, res) => {
  try {
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

      // Add billing info
      const callLog = await req.prisma.callLog.findUnique({
        where: { vapiCallId: call.id }
      });
      if (callLog) {
        call.billed = callLog.billed;
        call.costCharged = callLog.costCharged;
        // Use stored duration if available
        if (callLog.durationSeconds > 0) {
          call.duration = callLog.durationSeconds;
        }
      }
      return call;
    }));

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

    // Check if already billed
    const existingLog = await prisma.callLog.findUnique({
      where: { vapiCallId: call.id }
    });

    console.log(`Call ${call.id}: existingLog=${existingLog ? JSON.stringify(existingLog) : 'null'}`);

    // Skip only if already billed WITH a cost (re-bill if cost was 0)
    if (existingLog && existingLog.billed && existingLog.costCharged > 0) {
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

    if (!userId && call.assistantId) {
      const agent = await prisma.agent.findFirst({
        where: { vapiId: call.assistantId }
      });
      if (agent) {
        userId = agent.userId;
      }
    }

    if (!userId) {
      console.log(`Skipping call ${call.id}: no userId found`);
      continue;
    }

    // Get user's personal rates
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { outboundRate: true, inboundRate: true }
    });

    // Use user's rates or defaults
    const outboundRate = user?.outboundRate ?? 0.10;
    const inboundRate = user?.inboundRate ?? 0.05;
    const rate = isOutbound ? outboundRate : inboundRate;
    const cost = durationMinutes * rate;

    console.log(`Billing call ${call.id}: duration=${durationSeconds}s, minutes=${durationMinutes}, rate=${rate}, cost=${cost}, userId=${userId}`);

    // Create or update call log
    if (existingLog) {
      await prisma.callLog.update({
        where: { id: existingLog.id },
        data: {
          durationSeconds,
          costCharged: cost,
          billed: true
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
          billed: true
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
  listCalls
};
