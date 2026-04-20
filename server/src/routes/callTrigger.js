const express = require('express');
const router = express.Router();
const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');
const { decrypt } = require('../utils/encryption');

// POST /api/call/trigger - Trigger outbound calls (requires x-api-key header)
router.post('/', async (req, res) => {
  try {
    console.log('=== Call Trigger - Incoming Request ===');
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    console.log('Query:', JSON.stringify(req.query, null, 2));
    console.log('Raw body type:', typeof req.body);
    console.log('Body keys:', Object.keys(req.body || {}));
    console.log('=======================================');

    // GHL webhooks may send data in different formats:
    // 1. Direct JSON body fields
    // 2. Query parameters
    // 3. Nested inside a "customData" or "custom_data" object
    // Merge all possible sources, with body taking priority
    const data = {
      ...req.query,
      ...(req.body?.customData || {}),
      ...(req.body?.custom_data || {}),
      ...req.body
    };

    const { from, to, agentId, clientId, ...variables } = data;

    // 0. Validate API key
    const apiKey = req.headers['x-api-key'];
    if (!apiKey) {
      return res.status(401).json({
        success: false,
        error: 'Missing x-api-key header. Generate a trigger API key in Account Settings.'
      });
    }

    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: clientId',
        missing: ['clientId'],
        debug: {
          bodyKeys: Object.keys(req.body || {}),
          queryKeys: Object.keys(req.query || {}),
          contentType: req.headers['content-type'],
          bodyPreview: JSON.stringify(req.body).substring(0, 500)
        }
      });
    }

    // Look up the user and validate the API key
    const user = await req.prisma.user.findUnique({
      where: { id: parseInt(clientId) }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Client not found. No user exists with ID ${clientId}`
      });
    }

    if (!user.voiceAgentsEnabled) {
      return res.status(403).json({
        success: false,
        error: 'Voice agents are disabled for this account.'
      });
    }

    if (user.callsPaused) {
      return res.status(403).json({
        success: false,
        error: 'Calls are currently paused for this account.'
      });
    }

    if (!user.triggerApiKey) {
      return res.status(401).json({
        success: false,
        error: 'No trigger API key configured for this account. Generate one in Account Settings.'
      });
    }

    const storedKey = decrypt(user.triggerApiKey);
    if (apiKey !== storedKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    // 1. Validate remaining required fields
    const missing = [];
    if (!from) missing.push('from');
    if (!to) missing.push('to');
    if (!agentId) missing.push('agentId');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: ${missing.join(', ')}`,
        missing
      });
    }

    // 2. Look up Agent
    const agent = await req.prisma.agent.findUnique({
      where: { id: agentId }
    });

    if (!agent) {
      return res.status(404).json({
        success: false,
        error: `Agent not found. No agent exists with ID ${agentId}`
      });
    }

    if (!agent.vapiId) {
      return res.status(400).json({
        success: false,
        error: `Agent '${agent.name}' (ID: ${agent.id}) is not connected to VAPI. Please sync the agent first.`
      });
    }

    // Check if agent has GHL functions enabled — if so, contactId is required
    const agentConfig = agent.config ? (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config) : {};
    const calCfg = agentConfig.calendarConfig || {};
    const activeCalendars = calCfg.calendars && calCfg.calendars.length >= 2
      ? calCfg.calendars
      : [{ provider: calCfg.provider }];
    const hasGhlCalendar = calCfg.enabled && activeCalendars.some(c => c.provider === 'ghl');
    const hasGhlCrm = agentConfig.ghlCrmConfig?.enabled;
    const hasGhlTools = (agentConfig.tools || []).some(t => t.type && t.type.startsWith('ghl.'));
    const hasGhlFunction = hasGhlCalendar || hasGhlCrm || hasGhlTools;

    if (hasGhlFunction && !variables.contactId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: contactId. This agent has GHL functions enabled, so the GHL contact ID must be included in the request body.',
        missing: ['contactId']
      });
    }

    if (user.vapiCredits <= 0) {
      return res.status(403).json({
        success: false,
        error: `Insufficient credits for user '${user.email}'. Current balance: $${user.vapiCredits.toFixed(2)}. Please add credits before making calls.`,
        credits: user.vapiCredits
      });
    }

    // 3. Look up PhoneNumber by the "from" number
    const phoneNumber = await req.prisma.phoneNumber.findFirst({
      where: { phoneNumber: from }
    });

    if (!phoneNumber) {
      return res.status(404).json({
        success: false,
        error: `Phone number '${from}' not found in the system. Make sure this number is imported and active.`
      });
    }

    if (!phoneNumber.vapiPhoneNumberId) {
      return res.status(400).json({
        success: false,
        error: `Phone number '${from}' is not imported to VAPI. Please import it first in Phone Numbers settings.`
      });
    }

    // 4. Set up VAPI API key — use the same per-user lookup the agent
    // save flow uses, so the call trigger talks to the same VAPI account
    // that owns the assistant.
    const vapiApiKey = await getVapiKeyForUser(req.prisma, parseInt(clientId));
    if (!vapiApiKey) {
      return res.status(500).json({
        success: false,
        error: 'VAPI API key is not configured. Please set it in Account Settings or Platform Settings.'
      });
    }
    vapiService.setApiKey(vapiApiKey);

    // 5. Build call config
    const callConfig = {
      assistantId: agent.vapiId,
      phoneNumberId: phoneNumber.vapiPhoneNumberId,
      customer: {
        number: to,
        name: variables.firstName || variables.name || undefined
      }
    };

    // Inject currentDateTime in the agent's calendar timezone so the AI knows today's date
    const calTimezone = (calCfg.calendars?.[0]?.timezone) || calCfg.timezone || 'America/New_York';
    const now = new Date();
    const currentDateTime = now.toLocaleString('en-US', {
      timeZone: calTimezone,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: 'numeric', minute: '2-digit', hour12: true
    });
    variables.currentDateTime = `${currentDateTime} (${calTimezone})`;

    // Add variable overrides (always includes currentDateTime now)
    callConfig.assistantOverrides = {
      variableValues: variables
    };

    // Outbound-specific first message override
    const outboundGreeting = agentConfig.firstMessageOutbound;
    if (outboundGreeting && outboundGreeting.trim()) {
      callConfig.assistantOverrides.firstMessage = outboundGreeting;
    }

    // 6. Create the call via VAPI
    const call = await vapiService.createCall(callConfig);

    // 7. Create CallLog for billing tracking
    await req.prisma.callLog.create({
      data: {
        vapiCallId: call.id,
        userId: parseInt(clientId),
        type: 'outbound',
        durationSeconds: 0,
        costCharged: 0,
        billed: false,
        agentId: agent.id
      }
    });

    res.status(201).json({
      success: true,
      callId: call.id,
      message: 'Call initiated successfully'
    });
  } catch (error) {
    console.error('Call trigger error:', error);

    // Pass through VAPI errors with context
    if (error.message && error.message.includes('VAPI')) {
      return res.status(500).json({
        success: false,
        error: `VAPI error: ${error.message}`
      });
    }

    res.status(500).json({
      success: false,
      error: `Internal server error: ${error.message}`
    });
  }
});

module.exports = router;
