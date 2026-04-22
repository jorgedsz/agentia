const axios = require('axios');
const { findGhlConnection, ghlRequest } = require('./ghlController');
const { getApiKeys } = require('../utils/getApiKeys');

const INTERVAL_MS = 60 * 1000; // 1 minute — short tick so minute-granularity thresholds fire close to on-time
// opp_in_stage paginates GHL every run, so we keep it on the original 30-min cadence
// instead of hammering GHL each minute.
const OPP_IN_STAGE_INTERVAL_MS = 30 * 60 * 1000;
let lastOppInStageRunAt = 0;
let schedulerInterval = null;
let isProcessing = false;

// GHL errors that mean "give up — manual intervention is needed; retrying
// will only spam the API with the same 4xx every cycle."
const TERMINAL_GHL_ERROR_RE = /opportunity doesn't exist or is deleted|contact not found/i;
function isTerminalGhlError(message) {
  return TERMINAL_GHL_ERROR_RE.test(message || '');
}

// All three count as "done" for dedup so the scheduler stops re-checking:
//   completed       — action ran successfully
//   failed_permanent — give up, manual fix needed
//   skipped_filter  — pipeline filter rejected this contact (no opp in
//                     pipeline, or opp stage in excluded list). Without
//                     this marker, the scheduler would re-look-up GHL
//                     for every blocked contact on every tick.
const DONE_STATUSES = ['completed', 'failed_permanent', 'skipped_filter'];

// ── Scheduler ─────────────────────────────────────────────

function startScheduler(prisma) {
  if (schedulerInterval) return;
  console.log('[Chatbot Follow-Up] Scheduler started (interval: 1 min)');
  processChatbotFollowUps(prisma);
  schedulerInterval = setInterval(() => processChatbotFollowUps(prisma), INTERVAL_MS);
}

async function processChatbotFollowUps(prisma) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    // Pre-check OpenAI availability once per run so we can skip ai_message
    // actions gracefully instead of logging a key-missing error per contact.
    const { openaiApiKey } = await getApiKeys(prisma);
    const openaiAvailable = !!openaiApiKey;

    const chatbots = await prisma.chatbot.findMany({
      where: { isActive: true, isArchived: false },
    });

    const runOppInStage = Date.now() - lastOppInStageRunAt >= OPP_IN_STAGE_INTERVAL_MS;
    if (runOppInStage) lastOppInStageRunAt = Date.now();

    for (const chatbot of chatbots) {
      let config;
      try {
        config = chatbot.config ? JSON.parse(chatbot.config) : {};
      } catch {
        continue;
      }

      const followUpRulesConfig = config.followUpRulesConfig;
      if (!followUpRulesConfig?.enabled || !followUpRulesConfig.rules?.length) continue;

      for (let ruleIndex = 0; ruleIndex < followUpRulesConfig.rules.length; ruleIndex++) {
        const rule = followUpRulesConfig.rules[ruleIndex];
        try {
          if (rule.conditionType === 'opp_in_stage') {
            if (!runOppInStage) continue;
            await processOppInStageRule(prisma, chatbot, rule, ruleIndex, openaiAvailable);
          } else if (rule.conditionType === 'inactive_conversation') {
            await processInactiveConversationRule(prisma, chatbot, rule, ruleIndex, openaiAvailable);
          }
        } catch (err) {
          console.error(`[Chatbot Follow-Up] Rule ${ruleIndex} error for chatbot ${chatbot.id}:`, err.message);
        }
      }
    }
  } catch (err) {
    console.error('[Chatbot Follow-Up] Scheduler error:', err.message);
  } finally {
    isProcessing = false;
  }
}

// ── Rule Processors ───────────────────────────────────────

function getThresholdMs(rule) {
  let value = rule.thresholdValue ?? rule.daysThreshold;
  if (!value) return null;
  const unit = rule.thresholdUnit || 'days';
  // The scheduler ticks every 30 minutes (INTERVAL_MS), so anything smaller
  // than 30 min is meaningless. Snap minute thresholds to the nearest 30.
  if (unit === 'minutes') {
    value = Math.max(30, Math.round(value / 30) * 30);
  }
  const multiplier = unit === 'minutes' ? 60 * 1000
    : unit === 'hours' ? 60 * 60 * 1000
    : 24 * 60 * 60 * 1000;
  return value * multiplier;
}

async function processOppInStageRule(prisma, chatbot, rule, ruleIndex, openaiAvailable = true) {
  const thresholdMs = getThresholdMs(rule);
  if (!rule.pipelineId || !rule.stageId || !thresholdMs) return;

  const conn = await findGhlConnection(chatbot.userId, prisma);
  if (!conn) {
    console.log(`[Chatbot Follow-Up] Skipping opp_in_stage: no GHL connection for user ${chatbot.userId}`);
    return;
  }

  const thresholdDate = new Date(Date.now() - thresholdMs);
  let page = 1;
  let hasMore = true;

  // Skip ai_message when OpenAI isn't configured — prevents per-contact
  // key-missing log spam.
  const actions = (rule.actions || []).filter(a => openaiAvailable || a.type !== 'ai_message');
  if (!actions.length) return;

  // Circuit breaker on consecutive GHL 429s.
  let consecutiveRateLimits = 0;
  const RATE_LIMIT_CIRCUIT_BREAKER = 3;

  while (hasMore) {
    if (consecutiveRateLimits >= RATE_LIMIT_CIRCUIT_BREAKER) {
      console.warn(`[Chatbot Follow-Up] Aborting opp_in_stage rule ${ruleIndex} — GHL rate limit tripped.`);
      break;
    }

    let opps;
    try {
      const data = await ghlRequest(
        `/opportunities/search?location_id=${conn.locationId}&pipeline_id=${rule.pipelineId}&pipeline_stage_id=${rule.stageId}&limit=20&page=${page}`,
        conn.token
      );
      opps = data?.opportunities || [];
      hasMore = opps.length === 20;
      consecutiveRateLimits = 0;
    } catch (err) {
      console.error(`[Chatbot Follow-Up] GHL search error:`, err.message);
      if (/too many requests|rate limit/i.test(err.message || '')) {
        consecutiveRateLimits++;
        await sleep(2000);
        continue;
      }
      break;
    }

    for (const opp of opps) {
      const lastChange = new Date(opp.lastStageChangeAt || opp.updatedAt || opp.createdAt);
      if (lastChange > thresholdDate) continue;

      for (const action of actions) {
        const done = await prisma.chatbotFollowUpLog.findFirst({
          where: {
            chatbotId: chatbot.id,
            ruleIndex,
            targetId: opp.id,
            actionType: action.type,
            status: { in: DONE_STATUSES },
          },
        });
        if (done) continue;

        await executeAction(prisma, chatbot, conn, rule, ruleIndex, opp.id, opp.contact, action);
      }

      // Throttle between opportunities too.
      await sleep(250);
    }

    if (hasMore) await sleep(1000);
    page++;
  }
}

async function processInactiveConversationRule(prisma, chatbot, rule, ruleIndex, openaiAvailable = true) {
  const thresholdMs = getThresholdMs(rule);
  if (!thresholdMs) return;

  const thresholdDate = new Date(Date.now() - thresholdMs);

  const inactiveContacts = await prisma.$queryRaw`
    SELECT "contactId", MAX("createdAt") as "lastMessageAt"
    FROM "ChatbotMessage"
    WHERE "chatbotId" = ${chatbot.id}
      AND "contactId" IS NOT NULL
      AND "contactId" != ''
    GROUP BY "contactId"
    HAVING MAX("createdAt") < ${thresholdDate}
  `;

  const conn = await findGhlConnection(chatbot.userId, prisma);
  const needsOpp = (rule.actions || []).some(a => a.type === 'move_stage');

  // Optional opportunity scoping: if pipelineId is set, the rule fires only
  // for contacts that have an opp in that pipeline AND whose stage is not in
  // excludedStageIds. No pipelineId → today's behavior (fires for all inactive).
  const hasPipelineFilter = !!rule.pipelineId;
  const excludedStageIds = Array.isArray(rule.excludedStageIds) ? rule.excludedStageIds : [];

  // Filter out ai_message actions when OpenAI isn't configured so we
  // don't spam the log with key-missing errors for every contact.
  const actions = (rule.actions || []).filter(a => openaiAvailable || a.type !== 'ai_message');
  if (!actions.length) return;

  // Batch-load already-completed action log entries for this rule in one
  // query, so we can skip contacts whose actions are all done BEFORE
  // making any GHL calls. Without this, a 1-min tick would re-query GHL
  // for every already-processed contact on every tick.
  //
  // Dedup is time-aware: a log row is "done" only if it was written AFTER
  // the contact's last message. If the contact has resumed the conversation
  // since the last fire, the prior log is treated as stale (different
  // conversation cycle) so the rule can fire again. Without this, a contact
  // who got followed up once would never get followed up again, even on a
  // brand new conversation weeks later.
  const actionTypes = actions.map(a => a.type);
  const doneLogs = await prisma.chatbotFollowUpLog.findMany({
    where: {
      chatbotId: chatbot.id,
      ruleIndex,
      actionType: { in: actionTypes },
      status: { in: DONE_STATUSES },
    },
    select: { targetId: true, actionType: true, createdAt: true },
  });
  const doneAt = new Map();
  for (const l of doneLogs) {
    doneAt.set(`${l.targetId}::${l.actionType}`, l.createdAt);
  }
  const isDone = (contactId, actionType, lastMessageAt) => {
    const at = doneAt.get(`${contactId}::${actionType}`);
    if (!at) return false;
    return new Date(at) > new Date(lastMessageAt);
  };

  // Circuit breaker: if GHL keeps returning 429 we bail out of the run
  // instead of grinding through every contact. The next scheduler tick
  // retries with a fresh quota.
  let consecutiveRateLimits = 0;
  const RATE_LIMIT_CIRCUIT_BREAKER = 3;

  for (const contact of inactiveContacts) {
    if (consecutiveRateLimits >= RATE_LIMIT_CIRCUIT_BREAKER) {
      console.warn(`[Chatbot Follow-Up] Aborting rule ${ruleIndex} — GHL rate limit tripped. Will retry next cycle.`);
      break;
    }

    // Short-circuit: if every action for this contact is already completed
    // for the current conversation cycle (log row is newer than last message),
    // don't touch GHL at all.
    const pendingActions = actions.filter(a => !isDone(contact.contactId, a.type, contact.lastMessageAt));
    if (pendingActions.length === 0) continue;

    // Look up the contact's opportunity when either (a) a pending action is
    // move_stage and we need the id, or (b) pipelineId is set and we need to
    // verify pipeline+stage to apply the filter.
    const pendingNeedsOpp = needsOpp && pendingActions.some(a => a.type === 'move_stage');
    const needsOppLookup = pendingNeedsOpp || hasPipelineFilter;
    let opportunityId = null;
    let opportunityStageId = null;
    let oppLookupRan = false;
    if (needsOppLookup && conn) {
      try {
        const pipelineFilter = rule.pipelineId ? `&pipeline_id=${rule.pipelineId}` : '';
        const data = await ghlRequest(
          `/opportunities/search?location_id=${conn.locationId}&contact_id=${contact.contactId}${pipelineFilter}`,
          conn.token
        );
        const opps = data?.opportunities || [];
        if (opps.length) {
          opportunityId = opps[0].id;
          opportunityStageId = opps[0].pipelineStageId || opps[0].stageId || null;
        }
        oppLookupRan = true;
        consecutiveRateLimits = 0;
      } catch (err) {
        console.error(`[Chatbot Follow-Up] Opportunity lookup failed for contact ${contact.contactId}:`, err.message);
        if (/too many requests|rate limit/i.test(err.message || '')) {
          consecutiveRateLimits++;
          continue;
        }
      }
    }

    // Pipeline filter: skip when contact has no opp in the rule's pipeline,
    // or when the opp's current stage is in the excluded list. We MUST write
    // a log row here (status='skipped_filter') so the next tick's dedup
    // short-circuits before another GHL lookup — without it, every blocked
    // contact triggers a fresh /opportunities/search call every 60s forever.
    // The time-aware dedup handles the "contact resumed conversation" case:
    // when they message again, this log row becomes stale and the scheduler
    // re-evaluates with a fresh lookup.
    if (hasPipelineFilter) {
      const blocked = !opportunityId
        ? 'no opp in pipeline'
        : (excludedStageIds.length && excludedStageIds.includes(opportunityStageId))
          ? `opp stage ${opportunityStageId} is excluded`
          : null;
      if (blocked) {
        for (const action of pendingActions) {
          await markActionSkippedFilter(prisma, chatbot.id, ruleIndex, rule.conditionType, contact.contactId, action.type, blocked);
        }
        if (oppLookupRan) await sleep(250);
        continue;
      }
    }

    for (const action of pendingActions) {
      if (action.type === 'move_stage' && !opportunityId) {
        // No GHL opportunity for this contact (never created, or admin
        // deleted it). Don't fall back to PUT /opportunities/{contactId} —
        // that always 400s. Mark permanent so we stop retrying.
        await markActionPermanentFailed(
          prisma, chatbot.id, ruleIndex, rule.conditionType,
          contact.contactId, 'move_stage',
          'No GHL opportunity for contact — skipping move_stage.'
        );
        continue;
      }
      const ghlTargetId = action.type === 'move_stage' ? opportunityId : contact.contactId;
      await executeAction(prisma, chatbot, conn, rule, ruleIndex, contact.contactId, { id: contact.contactId }, action, ghlTargetId);
    }

    // Throttle between contacts that actually triggered GHL work.
    await sleep(250);
  }
}

// ── Action Executors ──────────────────────────────────────

async function markActionSkippedFilter(prisma, chatbotId, ruleIndex, conditionType, targetId, actionType, reason) {
  const details = JSON.stringify({ reason });
  await prisma.chatbotFollowUpLog.upsert({
    where: {
      chatbotId_ruleIndex_targetId_actionType: { chatbotId, ruleIndex, targetId, actionType },
    },
    create: { chatbotId, ruleIndex, conditionType, targetId, actionType, status: 'skipped_filter', details },
    update: { status: 'skipped_filter', details, createdAt: new Date() },
  });
}

async function markActionPermanentFailed(prisma, chatbotId, ruleIndex, conditionType, targetId, actionType, errorMessage) {
  const details = JSON.stringify({ error: errorMessage });
  await prisma.chatbotFollowUpLog.upsert({
    where: {
      chatbotId_ruleIndex_targetId_actionType: { chatbotId, ruleIndex, targetId, actionType },
    },
    create: { chatbotId, ruleIndex, conditionType, targetId, actionType, status: 'failed_permanent', details },
    // createdAt resets on re-fire so time-aware dedup ('done' = log newer
    // than contact's last message) works across conversation cycles.
    update: { status: 'failed_permanent', details, createdAt: new Date() },
  });
}

async function executeAction(prisma, chatbot, conn, rule, ruleIndex, targetId, contact, action, ghlTargetId) {
  const contactName = contact?.name || contact?.firstName || contact?.contactName || 'there';
  const ghlId = ghlTargetId || targetId;
  try {
    switch (action.type) {
      case 'send_message':
        await executeSendMessage(chatbot, action, contact, contactName);
        break;
      case 'ai_message':
        await executeAiMessage(prisma, chatbot, action, contact, contactName, targetId);
        break;
      case 'move_stage':
        await executeMoveStage(conn, ghlId, action);
        break;
      case 'add_tag':
        await executeAddTag(conn, contact?.id || ghlId, action);
        break;
      case 'notify_slack':
        await executeNotifySlack(prisma, action, contactName);
        break;
      default:
        console.log(`[Chatbot Follow-Up] Unknown action type: ${action.type}`);
        return;
    }

    await prisma.chatbotFollowUpLog.upsert({
      where: {
        chatbotId_ruleIndex_targetId_actionType: {
          chatbotId: chatbot.id,
          ruleIndex,
          targetId,
          actionType: action.type,
        },
      },
      create: {
        chatbotId: chatbot.id,
        ruleIndex,
        conditionType: rule.conditionType,
        targetId,
        actionType: action.type,
        status: 'completed',
      },
      update: {
        status: 'completed',
        details: null,
        createdAt: new Date(),
      },
    });
  } catch (err) {
    const status = isTerminalGhlError(err.message) ? 'failed_permanent' : 'failed';
    console.error(`[Chatbot Follow-Up] Action ${action.type} ${status} for ${targetId}:`, err.message);
    const details = JSON.stringify({ error: err.message });
    await prisma.chatbotFollowUpLog.upsert({
      where: {
        chatbotId_ruleIndex_targetId_actionType: {
          chatbotId: chatbot.id,
          ruleIndex,
          targetId,
          actionType: action.type,
        },
      },
      create: {
        chatbotId: chatbot.id,
        ruleIndex,
        conditionType: rule.conditionType,
        targetId,
        actionType: action.type,
        status,
        details,
      },
      update: { status, details, createdAt: new Date() },
    });
  }
}

async function executeSendMessage(chatbot, action, contact, contactName) {
  if (!chatbot.n8nWebhookUrl) throw new Error('No n8nWebhookUrl configured');
  const message = (action.messageTemplate || '').replace(/\{\{contactName\}\}/g, contactName);
  await axios.post(chatbot.n8nWebhookUrl, {
    message,
    contactId: contact?.id,
    isFollowUp: true,
  });
}

async function executeAiMessage(prisma, chatbot, action, contact, contactName, targetId) {
  if (!chatbot.n8nWebhookUrl) throw new Error('No n8nWebhookUrl configured');

  const { openaiApiKey } = await getApiKeys(prisma);
  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured — set OPENAI_API_KEY env var or Platform Settings → openaiApiKey.');
  }

  // Fetch recent conversation history for this contact
  const recentMessages = await prisma.chatbotMessage.findMany({
    where: {
      chatbotId: chatbot.id,
      contactId: targetId,
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  if (recentMessages.length === 0) {
    throw new Error('No conversation history found for this contact');
  }

  // Build conversation summary for AI
  const conversationHistory = recentMessages
    .reverse()
    .map(m => `[${m.createdAt.toISOString().split('T')[0]}] ${m.inputMessage ? `Contact: ${m.inputMessage}` : ''}${m.outputMessage ? `\nBot: ${m.outputMessage}` : ''}`)
    .join('\n');

  // Get chatbot system prompt for context
  let chatbotConfig;
  try {
    chatbotConfig = chatbot.config ? JSON.parse(chatbot.config) : {};
  } catch {
    chatbotConfig = {};
  }
  const systemPromptBase = chatbotConfig.systemPromptBase || '';

  const userInstructions = (action.aiInstructions || '').trim();
  const lastMessageDate = recentMessages[recentMessages.length - 1]?.createdAt;
  const minutesSince = lastMessageDate
    ? Math.round((Date.now() - new Date(lastMessageDate).getTime()) / 60_000)
    : null;
  const inactivityLabel = minutesSince == null ? 'a while'
    : minutesSince < 60 ? `${minutesSince} minute${minutesSince === 1 ? '' : 's'}`
    : minutesSince < 1440 ? `${Math.round(minutesSince / 60)} hour${Math.round(minutesSince / 60) === 1 ? '' : 's'}`
    : `${Math.round(minutesSince / 1440)} day${Math.round(minutesSince / 1440) === 1 ? '' : 's'}`;

  // The user's instruction is the primary directive — don't bias the model
  // toward re-engagement when the user might want a farewell, a check-in,
  // a status update, or anything else.
  const directive = userInstructions
    ? `Your task: ${userInstructions}`
    : `Your task: Write a natural, concise message to re-engage the contact.`;

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You generate follow-up messages for a chatbot. The contact has been inactive for ${inactivityLabel}.

${directive}

${systemPromptBase ? `Chatbot personality/context (match this tone):\n${systemPromptBase.substring(0, 500)}\n\n` : ''}Rules:
- Write ONLY the message text, nothing else
- Follow the task above exactly — do not invent a different intent
- Match the chatbot's tone/language from the context
- Reference the previous conversation when it serves the task
- Keep it short (1-3 sentences)
- Use the contact's name (${contactName}) naturally if appropriate
- Do NOT use asterisks, bold, bullet points, or special formatting`
      },
      {
        role: 'user',
        content: `Conversation history with this contact:\n\n${conversationHistory}\n\nWrite the follow-up message now, following the task in the system instructions.`
      }
    ],
    temperature: 0.7,
    max_tokens: 200,
  });

  const aiMessage = response.choices[0]?.message?.content?.trim();
  if (!aiMessage) throw new Error('AI returned empty response');

  console.log(`[Chatbot Follow-Up] AI generated message for ${targetId}: "${aiMessage.substring(0, 80)}..."`);

  await axios.post(chatbot.n8nWebhookUrl, {
    message: aiMessage,
    contactId: contact?.id,
    isFollowUp: true,
    isAiGenerated: true,
  });
}

async function executeMoveStage(conn, oppId, action) {
  if (!conn) throw new Error('No GHL connection');
  if (!action.targetStageId) throw new Error('No targetStageId');
  await ghlRequest(`/opportunities/${oppId}`, conn.token, {
    method: 'PUT',
    body: JSON.stringify({ pipelineStageId: action.targetStageId }),
  });
}

async function executeAddTag(conn, contactId, action) {
  if (!conn) throw new Error('No GHL connection');
  if (!action.tags?.length) return;

  const contactData = await ghlRequest(`/contacts/${contactId}`, conn.token);
  const currentTags = contactData?.contact?.tags || contactData?.tags || [];
  const mergedTags = [...new Set([...currentTags, ...action.tags])];

  await ghlRequest(`/contacts/${contactId}`, conn.token, {
    method: 'PUT',
    body: JSON.stringify({ tags: mergedTags }),
  });
}

async function executeNotifySlack(prisma, action, contactName) {
  const { decrypt } = require('../utils/encryption');
  const settings = await prisma.platformSettings.findFirst();
  if (!settings?.slackWebhookUrl) throw new Error('No Slack webhook configured in platform settings');

  const webhookUrl = decrypt(settings.slackWebhookUrl);
  if (!webhookUrl) throw new Error('Failed to decrypt Slack webhook URL');

  const text = (action.slackMessage || '').replace(/\{\{contactName\}\}/g, contactName);
  await axios.post(webhookUrl, { text });
}

// ── Logs Endpoint ─────────────────────────────────────────

async function getFollowUpLogs(req, res) {
  try {
    const { chatbotId } = req.query;
    if (!chatbotId) return res.status(400).json({ error: 'chatbotId is required' });

    const chatbot = await req.prisma.chatbot.findUnique({ where: { id: chatbotId } });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });
    if (chatbot.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    const logs = await req.prisma.chatbotFollowUpLog.findMany({
      where: { chatbotId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json(logs);
  } catch (err) {
    console.error('[Chatbot Follow-Up] Logs error:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
}

// ── Utility ───────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { startScheduler, getFollowUpLogs };
