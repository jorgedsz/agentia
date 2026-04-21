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
            status: 'completed',
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

  // Filter out ai_message actions when OpenAI isn't configured so we
  // don't spam the log with key-missing errors for every contact.
  const actions = (rule.actions || []).filter(a => openaiAvailable || a.type !== 'ai_message');
  if (!actions.length) return;

  // Circuit breaker: if GHL keeps returning 429 we bail out of the run
  // instead of grinding through every contact. The next scheduler tick
  // (30 min later) will retry with a fresh quota.
  let consecutiveRateLimits = 0;
  const RATE_LIMIT_CIRCUIT_BREAKER = 3;

  for (const contact of inactiveContacts) {
    if (consecutiveRateLimits >= RATE_LIMIT_CIRCUIT_BREAKER) {
      console.warn(`[Chatbot Follow-Up] Aborting rule ${ruleIndex} — GHL rate limit tripped. Will retry next cycle.`);
      break;
    }

    // Look up the contact's opportunity when the rule moves stages. If a
    // pipelineId is configured, restrict to it; otherwise pick the first
    // opportunity the contact has.
    let opportunityId = null;
    if (needsOpp && conn) {
      try {
        const pipelineFilter = rule.pipelineId ? `&pipeline_id=${rule.pipelineId}` : '';
        const data = await ghlRequest(
          `/opportunities/search?location_id=${conn.locationId}&contact_id=${contact.contactId}${pipelineFilter}`,
          conn.token
        );
        const opps = data?.opportunities || [];
        if (opps.length) opportunityId = opps[0].id;
        consecutiveRateLimits = 0;
      } catch (err) {
        console.error(`[Chatbot Follow-Up] Opportunity lookup failed for contact ${contact.contactId}:`, err.message);
        if (/too many requests|rate limit/i.test(err.message || '')) {
          consecutiveRateLimits++;
          continue;
        }
      }
    }

    for (const action of actions) {
      // Skip if this exact action already completed for this contact.
      const done = await prisma.chatbotFollowUpLog.findFirst({
        where: {
          chatbotId: chatbot.id,
          ruleIndex,
          targetId: contact.contactId,
          actionType: action.type,
          status: 'completed',
        },
      });
      if (done) continue;

      const ghlTargetId = action.type === 'move_stage' && opportunityId
        ? opportunityId
        : contact.contactId;
      await executeAction(prisma, chatbot, conn, rule, ruleIndex, contact.contactId, { id: contact.contactId }, action, ghlTargetId);
    }

    // Throttle between contacts to stay under GHL's rate limit (the
    // opportunity lookup + move_stage + tag mutations add up quickly).
    await sleep(250);
  }
}

// ── Action Executors ──────────────────────────────────────

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
      },
    });
  } catch (err) {
    console.error(`[Chatbot Follow-Up] Action ${action.type} failed for ${targetId}:`, err.message);
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
        status: 'failed',
        details: JSON.stringify({ error: err.message }),
      },
      update: {
        status: 'failed',
        details: JSON.stringify({ error: err.message }),
      },
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

  const userInstructions = action.aiInstructions || '';
  const lastMessageDate = recentMessages[recentMessages.length - 1]?.createdAt;
  const daysSinceLastMessage = lastMessageDate
    ? Math.round((Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60 * 24))
    : 'unknown';

  const OpenAI = require('openai');
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `You are a follow-up message generator for a chatbot. Your job is to write a natural, concise follow-up message to re-engage a contact whose conversation has been inactive for ${daysSinceLastMessage} days.

${systemPromptBase ? `The chatbot's personality/context:\n${systemPromptBase.substring(0, 500)}\n` : ''}
${userInstructions ? `Additional instructions from the user:\n${userInstructions}\n` : ''}
Rules:
- Write ONLY the message text, nothing else
- Be natural and conversational, not salesy or pushy
- Reference the previous conversation context when relevant
- Keep it short (1-3 sentences)
- Use the contact's name (${contactName}) naturally
- Do NOT use asterisks, bold, bullet points, or special formatting`
      },
      {
        role: 'user',
        content: `Here is the conversation history with this contact:\n\n${conversationHistory}\n\nGenerate a follow-up message to re-engage this contact.`
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
