const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

/**
 * POST /api/chatbot-call/trigger — Public endpoint called by chatbot tool (n8n)
 * Triggers an immediate outbound call via a voice agent.
 * Static params via query string: userId, agentId
 * Dynamic params via POST body: customerNumber, customerName
 */
async function triggerCall(req, res) {
  try {
    const { userId, agentId, phoneNumberId } = req.query;
    console.log(`[Chatbot Call] triggerCall — query:`, req.query, `body:`, JSON.stringify(req.body));

    if (!userId || !agentId) {
      return res.status(400).json({ success: false, message: 'Missing required query params: userId, agentId' });
    }

    const { customerNumber, customerName } = req.body || {};

    if (!customerNumber) {
      return res.json({ success: false, message: 'Missing required parameter: customerNumber. Please ask the customer for their phone number.' });
    }

    // Validate user
    const user = await req.prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }
    if (!user.voiceAgentsEnabled) {
      return res.json({ success: false, message: 'Voice agents are not enabled for this account.' });
    }
    if (user.callsPaused) {
      return res.json({ success: false, message: 'Calls are currently paused for this account.' });
    }
    if (user.vapiCredits <= 0) {
      return res.json({ success: false, message: 'Insufficient credits to make a call.' });
    }

    // Validate agent
    const agent = await req.prisma.agent.findUnique({
      where: { id: agentId },
      include: { phoneNumbers: true }
    });
    if (!agent || !agent.vapiId) {
      return res.json({ success: false, message: 'Agent not found or not synced to VAPI.' });
    }

    // Find phone number: use selected phoneNumberId from query, or fall back to agent's first assigned
    let phoneNumber = null;
    if (phoneNumberId) {
      phoneNumber = await req.prisma.phoneNumber.findUnique({ where: { id: parseInt(phoneNumberId) } });
    }
    if (!phoneNumber) {
      phoneNumber = agent.phoneNumbers?.[0];
    }
    if (!phoneNumber || !phoneNumber.vapiPhoneNumberId) {
      return res.json({ success: false, message: 'No phone number found. Please select a phone number in the call tool settings.' });
    }

    // Get VAPI key
    const vapiKey = await getVapiKeyForUser(req.prisma, parseInt(userId));
    if (!vapiKey) {
      return res.json({ success: false, message: 'No VAPI API key available.' });
    }
    vapiService.setApiKey(vapiKey);

    // Create the outbound call
    const callConfig = {
      assistantId: agent.vapiId,
      phoneNumberId: phoneNumber.vapiPhoneNumberId,
      customer: {
        number: customerNumber
      }
    };
    if (customerName) {
      callConfig.customer.name = customerName;
    }

    // Outbound-specific first message override
    const agentConfig = agent.config ? (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config) : {};
    const outboundGreeting = agentConfig.firstMessageOutbound;
    if (outboundGreeting && outboundGreeting.trim()) {
      callConfig.assistantOverrides = { firstMessage: outboundGreeting };
    }

    console.log(`[Chatbot Call] Triggering immediate call to ${customerNumber} via agent ${agent.name} (${agentId})`);
    const call = await vapiService.createCall(callConfig);

    // Create CallLog record
    await req.prisma.callLog.create({
      data: {
        vapiCallId: call.id,
        userId: parseInt(userId),
        type: 'outbound',
        durationSeconds: 0,
        costCharged: 0,
        billed: false,
        agentId: agent.id,
        customerNumber
      }
    });

    console.log(`[Chatbot Call] Call initiated successfully (callId: ${call.id})`);
    return res.json({ success: true, message: `Call initiated to ${customerNumber}. The AI agent "${agent.name}" will call them now.` });
  } catch (error) {
    console.error('[Chatbot Call] Trigger error:', error);
    return res.json({ success: false, message: `Error initiating call: ${error.message}` });
  }
}

/**
 * POST /api/chatbot-call/schedule — Public endpoint called by chatbot tool (n8n)
 * Schedules a callback for a future date/time.
 * Static params via query string: userId, agentId
 * Dynamic params via POST body: customerNumber, callbackTime, reason
 */
async function scheduleCall(req, res) {
  try {
    const { userId, agentId, phoneNumberId } = req.query;

    if (!userId || !agentId) {
      return res.status(400).json({ success: false, message: 'Missing required query params: userId, agentId' });
    }

    const { customerNumber, callbackTime, reason } = req.body || {};

    if (!customerNumber) {
      return res.json({ success: false, message: 'Missing required parameter: customerNumber. Please ask the customer for their phone number.' });
    }

    if (!callbackTime) {
      return res.json({ success: false, message: 'Missing required parameter: callbackTime. Please ask the customer when they would like to be called.' });
    }

    // Parse and validate the time
    const scheduledAt = new Date(callbackTime);
    if (isNaN(scheduledAt.getTime())) {
      return res.json({ success: false, message: 'Invalid callbackTime format. Please use ISO 8601 format (e.g., 2026-03-18T14:00:00).' });
    }

    // Reject dates in the past
    if (scheduledAt < new Date()) {
      const now = new Date().toISOString();
      return res.json({ success: false, message: `The scheduled time is in the past. Current server time is ${now}. Please provide a future date/time.` });
    }

    // Validate user
    const user = await req.prisma.user.findUnique({ where: { id: parseInt(userId) } });
    if (!user) {
      return res.json({ success: false, message: 'User not found.' });
    }

    // Validate agent and get phone number
    const agent = await req.prisma.agent.findUnique({
      where: { id: agentId },
      include: { phoneNumbers: true }
    });
    if (!agent) {
      return res.json({ success: false, message: 'Agent not found.' });
    }

    // Use selected phone number or fall back to agent's first assigned
    let fromNumber = null;
    if (phoneNumberId) {
      const pn = await req.prisma.phoneNumber.findUnique({ where: { id: parseInt(phoneNumberId) } });
      if (pn) fromNumber = pn.phoneNumber;
    }
    if (!fromNumber) {
      fromNumber = agent.phoneNumbers?.[0]?.phoneNumber || null;
    }

    // Create the scheduled callback record (reuses existing ScheduledCallback model)
    const callback = await req.prisma.scheduledCallback.create({
      data: {
        userId: parseInt(userId),
        agentId,
        customerNumber,
        scheduledAt,
        reason: reason || null,
        status: 'pending',
        fromNumber
      }
    });

    // Format date nicely for the confirmation message
    const formattedDate = scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const formattedTime = scheduledAt.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    console.log(`[Chatbot Call] Callback scheduled: #${callback.id} for ${customerNumber} at ${scheduledAt.toISOString()} (agent: ${agentId})`);

    return res.json({
      success: true,
      message: `Call scheduled for ${formattedDate} at ${formattedTime}. The AI agent "${agent.name}" will call ${customerNumber} at that time.`,
      callbackId: callback.id
    });
  } catch (error) {
    console.error('[Chatbot Call] Schedule error:', error);
    return res.json({ success: false, message: `Error scheduling call: ${error.message}` });
  }
}

module.exports = {
  triggerCall,
  scheduleCall
};
