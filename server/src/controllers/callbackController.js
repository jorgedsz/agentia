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

    // Dump the full envelope once so we can see VAPI's actual shape when the
    // tool is called. A few different paths have been observed in the wild.
    console.log('[Callback] raw body keys:', Object.keys(req.body || {}), 'msg keys:',
      Object.keys(req.body?.message || {}));

    const msg = req.body?.message || {};
    const toolCall =
      msg.toolCalls?.[0] ||
      msg.toolCallList?.[0] ||
      msg.toolWithToolCallList?.[0]?.toolCall ||
      req.body?.toolCall ||
      null;

    // VAPI forwards arguments at multiple potential paths; check each. Arguments
    // may also arrive as a JSON-encoded string, so parse in that case.
    let argsRaw =
      toolCall?.function?.arguments ??
      toolCall?.arguments ??
      toolCall?.parameters ??
      msg.functionCall?.parameters ??
      msg.functionCall?.arguments ??
      req.body?.functionCall?.parameters ??
      req.body?.functionCall?.arguments ??
      {};
    if (typeof argsRaw === 'string') {
      try { argsRaw = JSON.parse(argsRaw); } catch { argsRaw = {}; }
    }
    const args = argsRaw || {};
    const callbackTime = args.callbackTime || args.time || args.datetime;
    const reason = args.reason || args.note || null;
    console.log('[Callback] scheduleCallback args:', JSON.stringify(args), 'userId:', userId, 'agentId:', agentId);
    if (!callbackTime) {
      console.log('[Callback] full envelope:', JSON.stringify(req.body).slice(0, 4000));
    }

    if (!callbackTime) {
      return res.status(200).json({
        results: [{
          toolCallId: toolCall?.id,
          result: JSON.stringify({
            success: false,
            message: 'MISSING_CALLBACKTIME: You must pass callbackTime as an ISO 8601 string (e.g. 2026-04-24T15:35:00). Compute it from {{currentDateTime}} plus the interval the customer requested ("in 5 minutes" = currentDateTime + 5m) and call this tool again. Do NOT say this message to the customer.'
          })
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

    console.log(`Callback scheduled: #${callback.id} for ${customerNumber} at ${scheduledAt.toISOString()} (agent: ${agentId})`);

    // Return a terse success to the LLM — intentionally no pre-formatted date
    // string, so the agent says a short natural confirmation in the call's
    // language (driven by the system prompt) rather than reading a full date.
    return res.status(200).json({
      results: [{
        toolCallId: toolCall?.id,
        result: JSON.stringify({
          success: true,
          message: 'Callback scheduled. Confirm with a short, natural phrase in the call language referencing the interval the customer asked for (e.g. "Listo, te llamo en 5 minutos" / "Done, I will call you in 5 minutes"). Do NOT read the full date back to the customer.',
          callbackId: callback.id
        })
      }]
    });
  } catch (error) {
    console.error('Schedule callback error:', error?.message, error?.stack);
    const toolCall = req.body?.message?.toolCalls?.[0] || req.body?.message?.toolCallList?.[0];
    return res.status(200).json({
      results: [{
        toolCallId: toolCall?.id,
        result: JSON.stringify({ success: false, message: `An error occurred while scheduling the callback: ${error?.message || 'unknown'}` })
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

        // Outbound-specific first message override
        const agentConfig = agent.config ? (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config) : {};
        const outboundGreeting = agentConfig.firstMessageOutbound;
        if (outboundGreeting && outboundGreeting.trim()) {
          callConfig.assistantOverrides = { firstMessage: outboundGreeting };
        }

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
