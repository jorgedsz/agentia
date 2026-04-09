const axios = require('axios');
const { findGhlConnection, ghlRequest } = require('./ghlController');

const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let schedulerInterval = null;
let isProcessing = false;

// ── Scheduler ─────────────────────────────────────────────

function startScheduler(prisma) {
  if (schedulerInterval) return;
  console.log('[Chatbot Follow-Up] Scheduler started (interval: 5 min)');
  schedulerInterval = setInterval(() => processChatbotFollowUps(prisma), INTERVAL_MS);
}

async function processChatbotFollowUps(prisma) {
  if (isProcessing) return;
  isProcessing = true;
  try {
    const chatbots = await prisma.chatbot.findMany({
      where: { isActive: true, isArchived: false },
    });

    for (const chatbot of chatbots) {
      let config;
      try {
        config = chatbot.config ? JSON.parse(chatbot.config) : {};
      } catch {
        continue;
      }

      const followUpRulesConfig = config.followUpRulesConfig;
      if (!followUpRulesConfig?.enabled || !followUpRulesConfig.rules?.length) continue;

      console.log(`[Chatbot Follow-Up] Processing chatbot "${chatbot.name}" (${chatbot.id})`);

      for (let ruleIndex = 0; ruleIndex < followUpRulesConfig.rules.length; ruleIndex++) {
        const rule = followUpRulesConfig.rules[ruleIndex];
        try {
          if (rule.conditionType === 'opp_in_stage') {
            await processOppInStageRule(prisma, chatbot, rule, ruleIndex);
          } else if (rule.conditionType === 'inactive_conversation') {
            await processInactiveConversationRule(prisma, chatbot, rule, ruleIndex);
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

async function processOppInStageRule(prisma, chatbot, rule, ruleIndex) {
  if (!rule.pipelineId || !rule.stageId || !rule.daysThreshold) return;

  const conn = await findGhlConnection(chatbot.userId, prisma);
  if (!conn) {
    console.log(`[Chatbot Follow-Up] Skipping opp_in_stage: no GHL connection for user ${chatbot.userId}`);
    return;
  }

  const thresholdDate = new Date(Date.now() - rule.daysThreshold * 24 * 60 * 60 * 1000);
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    let opps;
    try {
      const data = await ghlRequest(
        `/opportunities/search?location_id=${conn.locationId}&pipeline_id=${rule.pipelineId}&pipeline_stage_id=${rule.stageId}&limit=20&page=${page}`,
        conn.token
      );
      opps = data?.opportunities || [];
      hasMore = opps.length === 20;
    } catch (err) {
      console.error(`[Chatbot Follow-Up] GHL search error:`, err.message);
      break;
    }

    for (const opp of opps) {
      const lastChange = new Date(opp.lastStageChangeAt || opp.updatedAt || opp.createdAt);
      if (lastChange > thresholdDate) continue;

      // Check dedup
      const existing = await prisma.chatbotFollowUpLog.findFirst({
        where: { chatbotId: chatbot.id, ruleIndex, targetId: opp.id },
      });
      if (existing) continue;

      for (const action of rule.actions || []) {
        await executeAction(prisma, chatbot, conn, rule, ruleIndex, opp.id, opp.contact, action);
      }
    }

    if (hasMore) await sleep(1000);
    page++;
  }
}

async function processInactiveConversationRule(prisma, chatbot, rule, ruleIndex) {
  if (!rule.daysThreshold) return;

  const thresholdDate = new Date(Date.now() - rule.daysThreshold * 24 * 60 * 60 * 1000);

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

  for (const contact of inactiveContacts) {
    const existing = await prisma.chatbotFollowUpLog.findFirst({
      where: { chatbotId: chatbot.id, ruleIndex, targetId: contact.contactId },
    });
    if (existing) continue;

    for (const action of rule.actions || []) {
      await executeAction(prisma, chatbot, conn, rule, ruleIndex, contact.contactId, { id: contact.contactId }, action);
    }
  }
}

// ── Action Executors ──────────────────────────────────────

async function executeAction(prisma, chatbot, conn, rule, ruleIndex, targetId, contact, action) {
  const contactName = contact?.name || contact?.firstName || contact?.contactName || 'there';
  try {
    switch (action.type) {
      case 'send_message':
        await executeSendMessage(chatbot, action, contact, contactName);
        break;
      case 'move_stage':
        await executeMoveStage(conn, targetId, action);
        break;
      case 'add_tag':
        await executeAddTag(conn, contact?.id || targetId, action);
        break;
      case 'notify_slack':
        await executeNotifySlack(prisma, action, contactName);
        break;
      default:
        console.log(`[Chatbot Follow-Up] Unknown action type: ${action.type}`);
        return;
    }

    await prisma.chatbotFollowUpLog.create({
      data: {
        chatbotId: chatbot.id,
        ruleIndex,
        conditionType: rule.conditionType,
        targetId,
        actionType: action.type,
        status: 'completed',
      },
    });
  } catch (err) {
    console.error(`[Chatbot Follow-Up] Action ${action.type} failed for ${targetId}:`, err.message);
    await prisma.chatbotFollowUpLog.create({
      data: {
        chatbotId: chatbot.id,
        ruleIndex,
        conditionType: rule.conditionType,
        targetId,
        actionType: action.type,
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
