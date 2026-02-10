const express = require('express');
const router = express.Router();
const vapiService = require('../services/vapiService');
const { getApiKeys } = require('../utils/getApiKeys');

// POST /api/call/trigger - Public endpoint to trigger outbound calls
// No authentication required - designed for external systems (Make.com, Zapier, GHL webhooks, etc.)
router.post('/', async (req, res) => {
  try {
    const { from, to, agentId, clientId, ...variables } = req.body;

    // 1. Validate required fields
    const missing = [];
    if (!from) missing.push('from');
    if (!to) missing.push('to');
    if (!agentId) missing.push('agentId');
    if (!clientId) missing.push('clientId');

    if (missing.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Missing required fields: from, to, agentId, clientId`,
        missing
      });
    }

    // 2. Look up Agent
    const agent = await req.prisma.agent.findUnique({
      where: { id: parseInt(agentId) }
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

    // 3. Look up User (client)
    const user = await req.prisma.user.findUnique({
      where: { id: parseInt(clientId) }
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        error: `Client not found. No user exists with ID ${clientId}`
      });
    }

    if (user.vapiCredits <= 0) {
      return res.status(403).json({
        success: false,
        error: `Insufficient credits for user '${user.email}'. Current balance: $${user.vapiCredits.toFixed(2)}. Please add credits before making calls.`,
        credits: user.vapiCredits
      });
    }

    // 4. Look up PhoneNumber by the "from" number
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

    // 5. Set up VAPI API key
    const { vapiApiKey } = await getApiKeys(req.prisma);
    if (!vapiApiKey) {
      return res.status(500).json({
        success: false,
        error: 'VAPI API key is not configured. Please set it in Platform Settings.'
      });
    }
    vapiService.setApiKey(vapiApiKey);

    // 6. Build call config
    const callConfig = {
      assistantId: agent.vapiId,
      phoneNumberId: phoneNumber.vapiPhoneNumberId,
      customer: {
        number: to,
        name: variables.firstName || undefined
      }
    };

    // Add variable overrides if any extra fields were provided
    if (Object.keys(variables).length > 0) {
      callConfig.assistantOverrides = {
        variableValues: variables
      };
    }

    // 7. Create the call via VAPI
    const call = await vapiService.createCall(callConfig);

    // 8. Create CallLog for billing tracking
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
