const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

/**
 * POST /api/callbacks/schedule — Public endpoint called by VAPI tool
 * Static params via query string: userId, agentId
 * Dynamic params via VAPI function args: callbackTime, reason
 * Customer number from VAPI call context: req.body.message.call.customer.number
 */
async function scheduleCallback(req, res) {
  try {
    const { userId, agentId } = req.query;

    if (!userId || !agentId) {
      return res.status(400).json({
        results: [{ error: 'Missing required query params: userId, agentId' }]
      });
    }

    // Extract VAPI function arguments
    const toolCall = req.body?.message?.toolCalls?.[0] || req.body?.message?.toolCallList?.[0];
    const args = toolCall?.function?.arguments || {};
    const { callbackTime, reason } = args;

    if (!callbackTime) {
      return res.status(200).json({
        results: [{
          toolCallId: toolCall?.id,
          result: JSON.stringify({ success: false, message: 'Missing required parameter: callbackTime. Please ask the customer for a date and time.' })
        }]
      });
    }

    // Parse the callback time
    const scheduledAt = new Date(callbackTime);
    if (isNaN(scheduledAt.getTime())) {
      return res.status(200).json({
        results: [{
          toolCallId: toolCall?.id,
          result: JSON.stringify({ success: false, message: 'Invalid callbackTime format. Please use ISO 8601 format (e.g., 2026-03-17T14:00:00).' })
        }]
      });
    }

    // Get customer number from VAPI call context
    const customerNumber = req.body?.message?.call?.customer?.number;
    if (!customerNumber) {
      return res.status(200).json({
        results: [{
          toolCallId: toolCall?.id,
          result: JSON.stringify({ success: false, message: 'Could not determine customer phone number from call context.' })
        }]
      });
    }

    // Find the agent's assigned phone number to use as fromNumber
    const agent = await req.prisma.agent.findUnique({
      where: { id: agentId },
      include: { phoneNumbers: true }
    });

    const fromNumber = agent?.phoneNumbers?.[0]?.phoneNumber || null;

    // Create the scheduled callback record
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

    // Format the date nicely for the confirmation message
    const formattedDate = scheduledAt.toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const formattedTime = scheduledAt.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', hour12: true
    });

    console.log(`Callback scheduled: #${callback.id} for ${customerNumber} at ${scheduledAt.toISOString()} (agent: ${agentId})`);

    return res.status(200).json({
      results: [{
        toolCallId: toolCall?.id,
        result: JSON.stringify({
          success: true,
          message: `Callback scheduled for ${formattedDate} at ${formattedTime}.`,
          callbackId: callback.id
        })
      }]
    });
  } catch (error) {
    console.error('Schedule callback error:', error);
    const toolCall = req.body?.message?.toolCalls?.[0] || req.body?.message?.toolCallList?.[0];
    return res.status(200).json({
      results: [{
        toolCallId: toolCall?.id,
        result: JSON.stringify({ success: false, message: 'An error occurred while scheduling the callback. Please try again.' })
      }]
    });
  }
}

/**
 * Process due callbacks — called by setInterval scheduler
 */
async function processCallbacks(prisma) {
  try {
    const dueCallbacks = await prisma.scheduledCallback.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() }
      },
      take: 20 // Process in batches
    });

    if (dueCallbacks.length === 0) return;

    console.log(`Processing ${dueCallbacks.length} due callback(s)...`);

    for (const callback of dueCallbacks) {
      try {
        // 1. Look up user and validate
        const user = await prisma.user.findUnique({
          where: { id: callback.userId }
        });

        if (!user) {
          console.error(`Callback #${callback.id}: User ${callback.userId} not found`);
          await prisma.scheduledCallback.update({
            where: { id: callback.id },
            data: { status: 'failed' }
          });
          continue;
        }

        if (!user.voiceAgentsEnabled || user.callsPaused || user.vapiCredits <= 0) {
          console.error(`Callback #${callback.id}: User ${user.email} - voiceAgents=${user.voiceAgentsEnabled}, paused=${user.callsPaused}, credits=${user.vapiCredits}`);
          await prisma.scheduledCallback.update({
            where: { id: callback.id },
            data: { status: 'failed' }
          });
          continue;
        }

        // 2. Look up agent
        const agent = await prisma.agent.findUnique({
          where: { id: callback.agentId },
          include: { phoneNumbers: true }
        });

        if (!agent || !agent.vapiId) {
          console.error(`Callback #${callback.id}: Agent ${callback.agentId} not found or no vapiId`);
          await prisma.scheduledCallback.update({
            where: { id: callback.id },
            data: { status: 'failed' }
          });
          continue;
        }

        // 3. Find phone number: use fromNumber if set, else agent's first assigned phone
        let phoneNumber = null;
        if (callback.fromNumber) {
          phoneNumber = await prisma.phoneNumber.findFirst({
            where: { phoneNumber: callback.fromNumber }
          });
        }
        if (!phoneNumber && agent.phoneNumbers.length > 0) {
          phoneNumber = agent.phoneNumbers[0];
        }

        if (!phoneNumber || !phoneNumber.vapiPhoneNumberId) {
          console.error(`Callback #${callback.id}: No valid phone number found`);
          await prisma.scheduledCallback.update({
            where: { id: callback.id },
            data: { status: 'failed' }
          });
          continue;
        }

        // 4. Get VAPI API key (user's own or from pool)
        const vapiKey = await getVapiKeyForUser(prisma, callback.userId);
        if (!vapiKey) {
          console.error(`Callback #${callback.id}: No VAPI API key available`);
          await prisma.scheduledCallback.update({
            where: { id: callback.id },
            data: { status: 'failed' }
          });
          continue;
        }
        vapiService.setApiKey(vapiKey);

        // 5. Create the outbound call via VAPI
        const callConfig = {
          assistantId: agent.vapiId,
          phoneNumberId: phoneNumber.vapiPhoneNumberId,
          customer: {
            number: callback.customerNumber
          }
        };

        console.log(`Callback #${callback.id}: Initiating call to ${callback.customerNumber} via agent ${agent.name}`);
        const call = await vapiService.createCall(callConfig);

        // 6. Create CallLog record
        const callLog = await prisma.callLog.create({
          data: {
            vapiCallId: call.id,
            userId: callback.userId,
            type: 'outbound',
            durationSeconds: 0,
            costCharged: 0,
            billed: false,
            agentId: agent.id,
            customerNumber: callback.customerNumber
          }
        });

        // 7. Update callback status
        await prisma.scheduledCallback.update({
          where: { id: callback.id },
          data: {
            status: 'completed',
            callLogId: callLog.id
          }
        });

        console.log(`Callback #${callback.id}: Call initiated successfully (callId: ${call.id})`);
      } catch (err) {
        console.error(`Callback #${callback.id}: Failed -`, err.message);
        await prisma.scheduledCallback.update({
          where: { id: callback.id },
          data: { status: 'failed' }
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('Callback processor error:', error.message);
  }
}

/**
 * Start the callback scheduler (called once from index.js after app.listen)
 */
let schedulerInterval = null;
function startScheduler(prisma) {
  if (schedulerInterval) return; // Already running
  console.log('Callback scheduler started (interval: 30s)');
  schedulerInterval = setInterval(() => processCallbacks(prisma), 30000);
}

/**
 * GET /api/callbacks — List callbacks for the authenticated user's agents
 */
async function listCallbacks(req, res) {
  try {
    const userId = req.user.id;

    // Get all agents for this user (id + name for enrichment)
    const agents = await req.prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true }
    });
    const agentIds = agents.map(a => a.id);
    const agentNameMap = {};
    for (const a of agents) agentNameMap[a.id] = a.name;

    const callbacks = await req.prisma.scheduledCallback.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { scheduledAt: 'desc' },
      take: 100
    });

    const enriched = callbacks.map(cb => ({ ...cb, agentName: agentNameMap[cb.agentId] || cb.agentId }));

    res.json({ callbacks: enriched });
  } catch (error) {
    console.error('List callbacks error:', error);
    res.status(500).json({ error: 'Failed to list callbacks' });
  }
}

/**
 * PATCH /api/callbacks/:id — Update a pending callback (e.g. reschedule)
 */
async function updateCallback(req, res) {
  try {
    const callbackId = parseInt(req.params.id);
    const userId = req.user.id;
    const { scheduledAt } = req.body;

    const callback = await req.prisma.scheduledCallback.findUnique({
      where: { id: callbackId }
    });

    if (!callback) {
      return res.status(404).json({ error: 'Callback not found' });
    }
    if (callback.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (callback.status !== 'pending') {
      return res.status(400).json({ error: `Cannot update callback with status: ${callback.status}` });
    }

    const data = {};
    if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      data.scheduledAt = parsed;
    }

    const updated = await req.prisma.scheduledCallback.update({
      where: { id: callbackId },
      data
    });

    res.json({ success: true, callback: updated });
  } catch (error) {
    console.error('Update callback error:', error);
    res.status(500).json({ error: 'Failed to update callback' });
  }
}

/**
 * DELETE /api/callbacks/:id — Delete a callback
 */
async function deleteCallback(req, res) {
  try {
    const callbackId = parseInt(req.params.id);
    const userId = req.user.id;

    const callback = await req.prisma.scheduledCallback.findUnique({
      where: { id: callbackId }
    });

    if (!callback) {
      return res.status(404).json({ error: 'Callback not found' });
    }
    if (callback.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await req.prisma.scheduledCallback.delete({
      where: { id: callbackId }
    });

    res.json({ success: true, message: 'Callback deleted' });
  } catch (error) {
    console.error('Delete callback error:', error);
    res.status(500).json({ error: 'Failed to delete callback' });
  }
}

module.exports = {
  scheduleCallback,
  processCallbacks,
  startScheduler,
  listCallbacks,
  updateCallback,
  deleteCallback
};
