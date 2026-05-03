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

    // VAPI's apiRequest tool type POSTs the AI's arguments flat at the top
    // level of the body. Older "function" tools nest them under
    // message.toolCalls[0].function.arguments. Support both shapes.
    const msg = req.body?.message || {};
    const toolCall =
      msg.toolCalls?.[0] ||
      msg.toolCallList?.[0] ||
      msg.toolWithToolCallList?.[0]?.toolCall ||
      req.body?.toolCall ||
      null;

    let argsRaw =
      toolCall?.function?.arguments ??
      toolCall?.arguments ??
      toolCall?.parameters ??
      msg.functionCall?.parameters ??
      msg.functionCall?.arguments ??
      null;
    // Fallback: apiRequest tools send the arguments as the request body itself.
    if (!argsRaw && req.body && typeof req.body === 'object' && !req.body.message) {
      argsRaw = req.body;
    }
    if (typeof argsRaw === 'string') {
      try { argsRaw = JSON.parse(argsRaw); } catch { argsRaw = {}; }
    }
    const args = argsRaw || {};
    const callbackTime = args.callbackTime || args.time || args.datetime;
    // Default reason ensures the dashboard never shows "-" for callbacks the
    // LLM scheduled without populating the field (legacy agent configs that
    // pre-date `reason` being a required arg).
    const rawReason = args.reason || args.note || null;
    const reason = (typeof rawReason === 'string' && rawReason.trim()) ? rawReason.trim() : 'Callback solicitado por el cliente';
    console.log('[Callback] scheduleCallback args:', JSON.stringify(args), 'userId:', userId, 'agentId:', agentId);

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

    // Resolve customer number. apiRequest tools don't carry call context in the
    // body, so it's forwarded via the URL (customerNumber={{customerPhone}}).
    // Fall back to the legacy function-tool envelope path for older tools.
    // E.164 numbers start with "+", but the application/x-www-form-urlencoded
    // decoder turns "+" in query strings into a space, so reverse that.
    let rawCustomerNumber =
      req.query.customerNumber ||
      req.body?.message?.call?.customer?.number ||
      null;
    if (typeof rawCustomerNumber === 'string') {
      rawCustomerNumber = rawCustomerNumber.trim();
      if (/^\d{7,}$/.test(rawCustomerNumber)) rawCustomerNumber = `+${rawCustomerNumber}`;
    }
    const customerNumber = rawCustomerNumber && !/\{\{.+\}\}/.test(rawCustomerNumber)
      ? rawCustomerNumber
      : null;
    if (!customerNumber) {
      console.warn('[Callback] customerNumber missing — query:', req.query.customerNumber, 'msg path:', req.body?.message?.call?.customer?.number);
      return res.status(200).json({
        results: [{
          toolCallId: toolCall?.id,
          result: JSON.stringify({ success: false, message: 'Could not determine customer phone number from call context.' })
        }]
      });
    }

    // Resolve the from-number: prefer the actual phone the live VAPI call is
    // running on (so the callback dials from the same line), then the agent's
    // assigned phone, then any user-owned VAPI-imported phone.
    const callVapiPhoneId =
      req.body?.message?.call?.phoneNumberId ||
      req.body?.message?.phoneNumber?.id ||
      null;

    let fromNumber = null;
    if (callVapiPhoneId) {
      const livePhone = await req.prisma.phoneNumber.findFirst({
        where: { vapiPhoneNumberId: callVapiPhoneId }
      });
      if (livePhone?.phoneNumber) fromNumber = livePhone.phoneNumber;
    }
    if (!fromNumber) {
      const agent = await req.prisma.agent.findUnique({
        where: { id: agentId },
        include: { phoneNumbers: true }
      });
      fromNumber = agent?.phoneNumbers?.[0]?.phoneNumber || null;
    }
    if (!fromNumber) {
      const userPhone = await req.prisma.phoneNumber.findFirst({
        where: {
          telephonyCredential: { userId: parseInt(userId) },
          vapiPhoneNumberId: { not: null }
        }
      });
      fromNumber = userPhone?.phoneNumber || null;
    }

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

        // 3. Find phone number to dial out from. Try in order: the fromNumber
        //    captured at schedule time, an agent-assigned phone, then any of
        //    the user's VAPI-imported phones — agents often run with phones
        //    that are owned by the user but not formally bound to the agent.
        let phoneNumber = null;
        if (callback.fromNumber) {
          phoneNumber = await prisma.phoneNumber.findFirst({
            where: { phoneNumber: callback.fromNumber, vapiPhoneNumberId: { not: null } }
          });
        }
        if (!phoneNumber && agent.phoneNumbers.length > 0) {
          phoneNumber = agent.phoneNumbers.find(p => p.vapiPhoneNumberId) || null;
        }
        if (!phoneNumber) {
          phoneNumber = await prisma.phoneNumber.findFirst({
            where: {
              telephonyCredential: { userId: callback.userId },
              vapiPhoneNumberId: { not: null }
            }
          });
        }

        if (!phoneNumber || !phoneNumber.vapiPhoneNumberId) {
          console.error(`Callback #${callback.id}: No valid phone number found (fromNumber=${callback.fromNumber}, agentPhones=${agent.phoneNumbers.length})`);
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

        // 5. Create the outbound call via VAPI. Populate variableValues so
        // {{customerPhone}} resolves in tool URLs (matches dashboard call behavior)
        // and tools like schedule_callback can reach the customer number.
        const agentConfig = agent.config ? (typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config) : {};
        const variableValues = { customerPhone: callback.customerNumber };

        const callConfig = {
          assistantId: agent.vapiId,
          phoneNumberId: phoneNumber.vapiPhoneNumberId,
          customer: {
            number: callback.customerNumber
          },
          assistantOverrides: { variableValues }
        };

        const outboundGreeting = agentConfig.firstMessageOutbound;
        if (outboundGreeting && outboundGreeting.trim()) {
          callConfig.assistantOverrides.firstMessage = outboundGreeting;
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
        console.error(`Callback #${callback.id}: Failed -`, err?.message);
        if (err?.stack) console.error(err.stack);
        if (err?.response) {
          try { console.error('Upstream response:', JSON.stringify(err.response).slice(0, 1500)); } catch {}
        }
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
