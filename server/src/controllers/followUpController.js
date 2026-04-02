const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');
const { decrypt } = require('../utils/encryption');

/**
 * Build context override for follow-up calls based on trigger outcome.
 * For failed/voicemail/unknown — no override (customer wasn't reached).
 * For answered — include summary, continue naturally.
 * For not_interested — include summary, approach gently.
 */
function buildContextOverride(triggerOutcome, previousSummary, existingSystemPrompt) {
  if (!previousSummary) return null;

  let contextBlock = null;

  if (triggerOutcome === 'answered') {
    contextBlock = `\n\n[FOLLOW-UP CONTEXT]\nThis is a follow-up call. In the previous conversation: ${previousSummary}.\nContinue naturally from where you left off.`;
  } else if (triggerOutcome === 'not_interested') {
    contextBlock = `\n\n[FOLLOW-UP CONTEXT]\nThis is a follow-up call. In the previous conversation the customer showed hesitation: ${previousSummary}.\nApproach gently, acknowledge the previous conversation, and see if their situation has changed.`;
  }

  // For failed, voicemail, unknown — no context (customer wasn't reached)
  if (!contextBlock) return null;

  return existingSystemPrompt ? existingSystemPrompt + contextBlock : contextBlock;
}

/**
 * Schedule a follow-up after a call ends.
 * Called by vapiWebhookController after processing end-of-call-report.
 */
async function scheduleFollowUp(prisma, callLog, agent, outcome, plainSummary) {
  try {
    const agentConfig = agent.config ? JSON.parse(agent.config) : {};
    const followUpConfig = agentConfig.followUpConfig;

    if (!followUpConfig || !followUpConfig.enabled) return;

    // Check if this outcome should trigger a follow-up
    if (!followUpConfig.outcomes || !followUpConfig.outcomes.includes(outcome)) return;

    const maxAttempts = followUpConfig.maxAttempts || 3;
    // Support per-attempt intervals array, fallback to single intervalMinutes for backward compat
    const intervals = Array.isArray(followUpConfig.intervals) ? followUpConfig.intervals : [];
    const fallbackInterval = followUpConfig.intervalMinutes || 120;

    // Check if this call itself was a follow-up (to track attempt chain)
    let attemptNumber = 1;
    const existingFollowUp = await prisma.scheduledFollowUp.findFirst({
      where: { callLogId: callLog.id }
    });

    if (existingFollowUp) {
      // This call was fired from a follow-up — check if we should schedule another
      if (existingFollowUp.attemptNumber >= maxAttempts) {
        console.log(`[Follow-Up] Max attempts (${maxAttempts}) reached for customer ${callLog.customerNumber}, agent ${agent.id}`);
        return;
      }
      attemptNumber = existingFollowUp.attemptNumber + 1;
    }

    // Dedup: check for existing pending follow-up for same customer+agent
    const pendingExists = await prisma.scheduledFollowUp.findFirst({
      where: {
        agentId: agent.id,
        customerNumber: callLog.customerNumber,
        status: 'pending'
      }
    });

    if (pendingExists) {
      console.log(`[Follow-Up] Pending follow-up already exists (#${pendingExists.id}) for ${callLog.customerNumber}, agent ${agent.id}`);
      return;
    }

    // Find the agent's assigned phone number
    const agentWithPhones = await prisma.agent.findUnique({
      where: { id: agent.id },
      include: { phoneNumbers: true }
    });
    const fromNumber = agentWithPhones?.phoneNumbers?.[0]?.phoneNumber || null;

    // Pick interval for this attempt (0-indexed: attempt 1 uses intervals[0])
    const intervalMinutes = intervals[attemptNumber - 1] || fallbackInterval;

    // Schedule the follow-up
    const scheduledAt = new Date(Date.now() + intervalMinutes * 60 * 1000);

    const followUp = await prisma.scheduledFollowUp.create({
      data: {
        userId: callLog.userId,
        agentId: agent.id,
        customerNumber: callLog.customerNumber,
        scheduledAt,
        attemptNumber,
        maxAttempts,
        intervalMinutes,
        triggerOutcome: outcome,
        previousSummary: plainSummary || null,
        previousCallLogId: callLog.id,
        fromNumber
      }
    });

    console.log(`[Follow-Up] Scheduled #${followUp.id}: attempt ${attemptNumber}/${maxAttempts}, fires at ${scheduledAt.toISOString()}, customer ${callLog.customerNumber}`);
  } catch (err) {
    console.error('[Follow-Up] scheduleFollowUp error:', err.message);
  }
}

/**
 * Process due follow-ups — called by scheduler (30s interval)
 */
async function processFollowUps(prisma) {
  try {
    const dueFollowUps = await prisma.scheduledFollowUp.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() }
      },
      take: 20
    });

    if (dueFollowUps.length === 0) return;

    console.log(`[Follow-Up] Processing ${dueFollowUps.length} due follow-up(s)...`);

    for (const followUp of dueFollowUps) {
      try {
        // 1. Validate user
        const user = await prisma.user.findUnique({
          where: { id: followUp.userId }
        });

        if (!user) {
          console.error(`[Follow-Up] #${followUp.id}: User ${followUp.userId} not found`);
          await prisma.scheduledFollowUp.update({
            where: { id: followUp.id },
            data: { status: 'failed' }
          });
          continue;
        }

        if (!user.voiceAgentsEnabled || user.callsPaused || user.vapiCredits <= 0) {
          console.error(`[Follow-Up] #${followUp.id}: User ${user.email} - voiceAgents=${user.voiceAgentsEnabled}, paused=${user.callsPaused}, credits=${user.vapiCredits}`);
          await prisma.scheduledFollowUp.update({
            where: { id: followUp.id },
            data: { status: 'failed' }
          });
          continue;
        }

        // 2. Validate agent
        const agent = await prisma.agent.findUnique({
          where: { id: followUp.agentId },
          include: { phoneNumbers: true }
        });

        if (!agent || !agent.vapiId) {
          console.error(`[Follow-Up] #${followUp.id}: Agent ${followUp.agentId} not found or no vapiId`);
          await prisma.scheduledFollowUp.update({
            where: { id: followUp.id },
            data: { status: 'failed' }
          });
          continue;
        }

        // 3. Find phone number
        let phoneNumber = null;
        if (followUp.fromNumber) {
          phoneNumber = await prisma.phoneNumber.findFirst({
            where: { phoneNumber: followUp.fromNumber }
          });
        }
        if (!phoneNumber && agent.phoneNumbers.length > 0) {
          phoneNumber = agent.phoneNumbers[0];
        }

        if (!phoneNumber || !phoneNumber.vapiPhoneNumberId) {
          console.error(`[Follow-Up] #${followUp.id}: No valid phone number found`);
          await prisma.scheduledFollowUp.update({
            where: { id: followUp.id },
            data: { status: 'failed' }
          });
          continue;
        }

        // 4. Get VAPI API key
        const vapiKey = await getVapiKeyForUser(prisma, followUp.userId);
        if (!vapiKey) {
          console.error(`[Follow-Up] #${followUp.id}: No VAPI API key available`);
          await prisma.scheduledFollowUp.update({
            where: { id: followUp.id },
            data: { status: 'failed' }
          });
          continue;
        }
        vapiService.setApiKey(vapiKey);

        // 5. Build call config with context override
        const callConfig = {
          assistantId: agent.vapiId,
          phoneNumberId: phoneNumber.vapiPhoneNumberId,
          customer: {
            number: followUp.customerNumber
          }
        };

        // Get existing system prompt from agent config for context injection
        const agentConfig = agent.config ? JSON.parse(agent.config) : {};
        const existingPrompt = agentConfig.systemPrompt || '';
        const overridePrompt = buildContextOverride(followUp.triggerOutcome, followUp.previousSummary, existingPrompt);

        if (overridePrompt) {
          callConfig.assistantOverrides = {
            model: {
              provider: agentConfig.modelProvider || 'openai',
              model: agentConfig.modelName || 'gpt-4',
              systemPrompt: overridePrompt
            }
          };
        }

        // 6. Create the outbound call via VAPI
        console.log(`[Follow-Up] #${followUp.id}: Initiating call to ${followUp.customerNumber} via agent ${agent.name} (attempt ${followUp.attemptNumber}/${followUp.maxAttempts})`);
        const call = await vapiService.createCall(callConfig);

        // 7. Create CallLog record
        const callLog = await prisma.callLog.create({
          data: {
            vapiCallId: call.id,
            userId: followUp.userId,
            type: 'outbound',
            durationSeconds: 0,
            costCharged: 0,
            billed: false,
            agentId: agent.id,
            customerNumber: followUp.customerNumber
          }
        });

        // 8. Update follow-up status
        await prisma.scheduledFollowUp.update({
          where: { id: followUp.id },
          data: {
            status: 'completed',
            callLogId: callLog.id
          }
        });

        console.log(`[Follow-Up] #${followUp.id}: Call initiated successfully (vapiCallId: ${call.id})`);
      } catch (err) {
        console.error(`[Follow-Up] #${followUp.id}: Failed -`, err.message);
        await prisma.scheduledFollowUp.update({
          where: { id: followUp.id },
          data: { status: 'failed' }
        }).catch(() => {});
      }
    }
  } catch (error) {
    console.error('[Follow-Up] Processor error:', error.message);
  }
}

/**
 * Start the follow-up scheduler (called once from index.js)
 */
let schedulerInterval = null;
function startScheduler(prisma) {
  if (schedulerInterval) return;
  console.log('[Follow-Up] Scheduler started (interval: 30s)');
  schedulerInterval = setInterval(() => processFollowUps(prisma), 30000);
}

/**
 * GET /api/follow-ups — List follow-ups for the authenticated user
 */
async function listFollowUps(req, res) {
  try {
    const userId = req.user.id;

    const agents = await req.prisma.agent.findMany({
      where: { userId },
      select: { id: true, name: true }
    });
    const agentIds = agents.map(a => a.id);
    const agentNameMap = {};
    for (const a of agents) agentNameMap[a.id] = a.name;

    const followUps = await req.prisma.scheduledFollowUp.findMany({
      where: { agentId: { in: agentIds } },
      orderBy: { scheduledAt: 'desc' },
      take: 100
    });

    const enriched = followUps.map(fu => ({ ...fu, agentName: agentNameMap[fu.agentId] || fu.agentId }));

    res.json({ followUps: enriched });
  } catch (error) {
    console.error('[Follow-Up] List error:', error);
    res.status(500).json({ error: 'Failed to list follow-ups' });
  }
}

/**
 * PATCH /api/follow-ups/:id — Update a pending follow-up (e.g. reschedule)
 */
async function updateFollowUp(req, res) {
  try {
    const followUpId = parseInt(req.params.id);
    const userId = req.user.id;
    const { scheduledAt } = req.body;

    const followUp = await req.prisma.scheduledFollowUp.findUnique({
      where: { id: followUpId }
    });

    if (!followUp) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }
    if (followUp.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }
    if (followUp.status !== 'pending') {
      return res.status(400).json({ error: `Cannot update follow-up with status: ${followUp.status}` });
    }

    const data = {};
    if (scheduledAt) {
      const parsed = new Date(scheduledAt);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      data.scheduledAt = parsed;
    }

    const updated = await req.prisma.scheduledFollowUp.update({
      where: { id: followUpId },
      data
    });

    res.json({ success: true, followUp: updated });
  } catch (error) {
    console.error('[Follow-Up] Update error:', error);
    res.status(500).json({ error: 'Failed to update follow-up' });
  }
}

/**
 * DELETE /api/follow-ups/:id — Delete a follow-up
 */
async function deleteFollowUp(req, res) {
  try {
    const followUpId = parseInt(req.params.id);
    const userId = req.user.id;

    const followUp = await req.prisma.scheduledFollowUp.findUnique({
      where: { id: followUpId }
    });

    if (!followUp) {
      return res.status(404).json({ error: 'Follow-up not found' });
    }
    if (followUp.userId !== userId) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    await req.prisma.scheduledFollowUp.delete({
      where: { id: followUpId }
    });

    res.json({ success: true, message: 'Follow-up deleted' });
  } catch (error) {
    console.error('[Follow-Up] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete follow-up' });
  }
}

module.exports = {
  scheduleFollowUp,
  processFollowUps,
  startScheduler,
  listFollowUps,
  updateFollowUp,
  deleteFollowUp
};
