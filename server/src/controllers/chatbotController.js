const { encrypt, decrypt } = require('../utils/encryption');
const { logAudit } = require('../utils/auditLog');
const n8nService = require('../services/n8nService');
const { getN8nConfig } = require('../utils/getN8nConfig');
const { findGhlConnection, ghlRequest } = require('./ghlController');
const messageBuffer = require('../services/messageBuffer');
const { transcribeAudio, analyzeImage } = require('../services/mediaProcessor');

const getServerBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.GHL_REDIRECT_URI) {
    try { return new URL(process.env.GHL_REDIRECT_URI).origin; } catch {}
  }
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return null;
};

const parseConfig = (config) => {
  if (!config) return null;
  try {
    return JSON.parse(config);
  } catch {
    return null;
  }
};

const getChatbots = async (req, res) => {
  try {
    const chatbots = await req.prisma.chatbot.findMany({
      where: { userId: req.user.id, isArchived: false },
      orderBy: { createdAt: 'desc' }
    });

    const chatbotsWithParsedConfig = chatbots.map(chatbot => ({
      ...chatbot,
      config: parseConfig(chatbot.config),
      outputUrl: chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null
    }));

    res.json({ chatbots: chatbotsWithParsedConfig });
  } catch (error) {
    console.error('Get chatbots error:', error);
    res.status(500).json({ error: 'Failed to fetch chatbots' });
  }
};

const getChatbot = async (req, res) => {
  try {
    const { id } = req.params;

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id: id, userId: req.user.id, isArchived: false }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    res.json({
      chatbot: {
        ...chatbot,
        config: parseConfig(chatbot.config),
        outputUrl: chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null
      }
    });
  } catch (error) {
    console.error('Get chatbot error:', error);
    res.status(500).json({ error: 'Failed to fetch chatbot' });
  }
};

const createChatbot = async (req, res) => {
  try {
    const { name, description, config, chatbotType, outputType, outputUrl } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Chatbot name is required' });
    }

    const chatbot = await req.prisma.chatbot.create({
      data: {
        name,
        description: description || null,
        chatbotType: chatbotType || 'standard',
        outputType: outputType || 'respond_to_webhook',
        outputUrl: outputUrl ? encrypt(outputUrl) : null,
        config: config ? JSON.stringify(config) : null,
        userId: req.user.id
      }
    });

    // Create n8n workflow if n8n is configured
    let n8nWorkflowId = null;
    let n8nWebhookUrl = null;
    let n8nWarning = null;
    try {
      const n8nConfig = await getN8nConfig(req.prisma);
      if (n8nConfig) {
        console.log('n8n config found, creating workflow for chatbot:', chatbot.id, 'n8n URL:', n8nConfig.url);
        n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
        const chatbotWithDecryptedUrl = { ...chatbot, outputUrl: outputUrl || null, config: config || {}, serverBaseUrl: getServerBaseUrl() };
        const workflow = await n8nService.createWorkflow(chatbotWithDecryptedUrl);
        n8nWorkflowId = workflow.id;
        n8nWebhookUrl = `${n8nConfig.url.replace(/\/+$/, '')}/webhook/chatbot-${chatbot.id}`;

        await req.prisma.chatbot.update({
          where: { id: chatbot.id },
          data: { n8nWorkflowId: String(workflow.id), n8nWebhookUrl: n8nWebhookUrl }
        });

        // Activate the workflow
        await n8nService.activateWorkflow(workflow.id);
        console.log('n8n workflow created and activated:', workflow.id);
      } else {
        console.warn('n8n config not found in PlatformSettings — skipping workflow creation');
        n8nWarning = 'n8n is not configured. Go to Settings > API Keys > n8n Integration to set it up.';
      }
    } catch (n8nError) {
      console.error('n8n workflow creation failed (chatbot saved without workflow):', n8nError.message);
      n8nWarning = `n8n workflow creation failed: ${n8nError.message}`;
    }

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'chatbot.create',
      resourceType: 'chatbot',
      resourceId: chatbot.id,
      details: { name: chatbot.name, chatbotType: chatbot.chatbotType },
      req
    });

    const response = {
      message: 'Chatbot created successfully',
      chatbot: {
        ...chatbot,
        config: parseConfig(chatbot.config),
        outputUrl: outputUrl || null,
        n8nWorkflowId,
        n8nWebhookUrl
      }
    };
    if (n8nWarning) response.n8nWarning = n8nWarning;
    res.status(201).json(response);
  } catch (error) {
    console.error('Create chatbot error:', error);
    res.status(500).json({ error: 'Failed to create chatbot' });
  }
};

const updateChatbot = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, config, chatbotType, outputType, outputUrl } = req.body;

    const existingChatbot = await req.prisma.chatbot.findFirst({
      where: { id: id, userId: req.user.id }
    });

    if (!existingChatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const updateData = {
      name: name || existingChatbot.name,
      description: description !== undefined ? (description || null) : existingChatbot.description,
      config: config ? JSON.stringify(config) : existingChatbot.config,
      outputType: outputType || existingChatbot.outputType,
      outputUrl: outputUrl ? encrypt(outputUrl) : (outputUrl === '' ? null : existingChatbot.outputUrl)
    };
    if (chatbotType) updateData.chatbotType = chatbotType;

    const chatbot = await req.prisma.chatbot.update({
      where: { id: id },
      data: updateData
    });

    // Update n8n workflow if n8n is configured
    let n8nWarning = null;
    try {
      const n8nConfig = await getN8nConfig(req.prisma);
      if (n8nConfig) {
        console.log('n8n config found, updating workflow for chatbot:', chatbot.id, 'existing n8nWorkflowId:', existingChatbot.n8nWorkflowId);
        n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
        const decryptedOutputUrl = chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null;
        const chatbotForN8n = {
          ...chatbot,
          outputUrl: decryptedOutputUrl,
          config: config || parseConfig(chatbot.config) || {},
          serverBaseUrl: getServerBaseUrl()
        };

        if (existingChatbot.n8nWorkflowId) {
          // Update existing workflow
          await n8nService.updateWorkflow(existingChatbot.n8nWorkflowId, chatbotForN8n);
          await n8nService.activateWorkflow(existingChatbot.n8nWorkflowId);
          console.log('n8n workflow updated and activated:', existingChatbot.n8nWorkflowId);
        } else {
          // Create new workflow if one doesn't exist yet
          const workflow = await n8nService.createWorkflow(chatbotForN8n);
          const n8nWebhookUrl = `${n8nConfig.url.replace(/\/+$/, '')}/webhook/chatbot-${chatbot.id}`;
          await req.prisma.chatbot.update({
            where: { id: chatbot.id },
            data: { n8nWorkflowId: String(workflow.id), n8nWebhookUrl }
          });
          await n8nService.activateWorkflow(workflow.id);
          console.log('n8n workflow created and activated:', workflow.id);
        }
      } else {
        console.warn('n8n config not found in PlatformSettings — skipping workflow update');
        n8nWarning = 'n8n is not configured. Go to Settings > API Keys > n8n Integration to set it up.';
      }
    } catch (n8nError) {
      console.error('n8n workflow update failed:', n8nError.message);
      n8nWarning = `n8n workflow failed: ${n8nError.message}`;
    }

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'chatbot.update',
      resourceType: 'chatbot',
      resourceId: chatbot.id,
      details: { name: chatbot.name },
      req
    });

    const response = {
      message: 'Chatbot updated successfully',
      chatbot: {
        ...chatbot,
        config: parseConfig(chatbot.config),
        outputUrl: chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null
      }
    };
    if (n8nWarning) response.n8nWarning = n8nWarning;
    res.json(response);
  } catch (error) {
    console.error('Update chatbot error:', error);
    res.status(500).json({ error: 'Failed to update chatbot' });
  }
};

const toggleChatbot = async (req, res) => {
  try {
    const { id } = req.params;

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id: id, userId: req.user.id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const newActive = !chatbot.isActive;

    const updated = await req.prisma.chatbot.update({
      where: { id: id },
      data: { isActive: newActive }
    });

    // Activate/deactivate n8n workflow
    if (chatbot.n8nWorkflowId) {
      try {
        const n8nConfig = await getN8nConfig(req.prisma);
        if (n8nConfig) {
          n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
          if (newActive) {
            await n8nService.activateWorkflow(chatbot.n8nWorkflowId);
          } else {
            await n8nService.deactivateWorkflow(chatbot.n8nWorkflowId);
          }
        }
      } catch (n8nError) {
        console.error('n8n workflow toggle failed:', n8nError.message);
      }
    }

    res.json({
      message: `Chatbot ${newActive ? 'activated' : 'deactivated'} successfully`,
      chatbot: {
        ...updated,
        config: parseConfig(updated.config),
        outputUrl: updated.outputUrl ? decrypt(updated.outputUrl) : null
      }
    });
  } catch (error) {
    console.error('Toggle chatbot error:', error);
    res.status(500).json({ error: 'Failed to toggle chatbot' });
  }
};

const testChatbot = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sessionId, contactId: bodyContactId } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id: id, userId: req.user.id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    if (!chatbot.n8nWebhookUrl) {
      return res.status(422).json({ error: 'Chatbot has no n8n workflow configured. Save the chatbot first.' });
    }

    // Use the test webhook URL (appends -test to the production webhook path)
    const testWebhookUrl = chatbot.n8nWebhookUrl.replace(/\/chatbot-([^/]+)$/, '/chatbot-$1-test');

    // For GHL testing, include the test contact ID from calendarConfig or ghlCrmConfig
    const config = chatbot.config ? JSON.parse(chatbot.config) : {};
    const calendarConfig = config.calendarConfig || {};
    const ghlCrmConfig = config.ghlCrmConfig || {};
    // Body contactId (from test modal) takes priority over config value
    const ghlTestContactId = bodyContactId || calendarConfig.ghlTestContactId || ghlCrmConfig.ghlTestContactId || '';
    const ghlTestContactName = calendarConfig.ghlTestContactName || ghlCrmConfig.ghlTestContactName || '';

    const testBody = { message, sessionId: sessionId || 'default' };
    if (ghlTestContactId) {
      testBody.contactId = ghlTestContactId;
    }
    if (ghlTestContactName) {
      testBody.contactName = ghlTestContactName;
    }

    // Send message to n8n test webhook
    const n8nResponse = await fetch(testWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testBody),
      signal: AbortSignal.timeout(60000)
    });

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text().catch(() => '');
      console.error('n8n webhook error:', n8nResponse.status, errorText);
      return res.status(422).json({ error: `n8n workflow error (${n8nResponse.status}): ${errorText.substring(0, 200) || 'No response'}` });
    }

    const data = await n8nResponse.json().catch(async () => {
      const text = await n8nResponse.text().catch(() => '');
      return { response: text };
    });

    res.json({
      response: data.response || data.output || data.text || JSON.stringify(data)
    });
  } catch (error) {
    const msg = error?.message || 'Unknown error';
    console.error('Test chatbot error:', msg, error);
    res.status(500).json({ error: msg });
  }
};

// ── Helper: forward message to n8n, deduct credits, log ──────
const MESSAGE_COST = 0.01;

async function forwardToN8n(chatbot, forwardBody, prisma) {
  const { message, sessionId, contactId, contactName } = forwardBody;

  const n8nResponse = await fetch(chatbot.n8nWebhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(forwardBody),
    signal: AbortSignal.timeout(60000)
  });

  const responseText = await n8nResponse.text().catch(() => '');

  if (!n8nResponse.ok) {
    console.error(`Webhook proxy upstream error ${n8nResponse.status}:`, responseText.substring(0, 500));

    prisma.chatbotMessage.create({
      data: {
        chatbotId: chatbot.id,
        chatbotName: chatbot.name,
        userId: chatbot.userId,
        sessionId: sessionId || 'default',
        contactId: contactId || null,
        contactName: contactName || null,
        inputMessage: message,
        outputMessage: null,
        costCharged: 0,
        status: 'error',
        errorMessage: `Upstream error (${n8nResponse.status}): ${responseText.substring(0, 200) || 'No response'}`,
      }
    }).catch(err => console.error('Failed to log chatbot message:', err.message));

    const err = new Error(`Upstream error (${n8nResponse.status}): ${responseText.substring(0, 200) || 'No response'}`);
    err.statusCode = 502;
    throw err;
  }

  let data;
  try {
    data = JSON.parse(responseText);
  } catch {
    data = { response: responseText };
  }

  // Deduct credit
  try {
    await prisma.user.update({
      where: { id: chatbot.userId },
      data: { vapiCredits: { decrement: MESSAGE_COST } }
    });
  } catch (creditErr) {
    console.error('Failed to deduct chatbot message credit:', creditErr.message);
  }

  // Log successful message (fire-and-forget)
  prisma.chatbotMessage.create({
    data: {
      chatbotId: chatbot.id,
      chatbotName: chatbot.name,
      userId: chatbot.userId,
      sessionId: sessionId || 'default',
      contactId: contactId || null,
      contactName: contactName || null,
      inputMessage: message,
      outputMessage: data.response || data.output || JSON.stringify(data),
      costCharged: MESSAGE_COST,
      status: 'success',
    }
  }).catch(err => console.error('Failed to log chatbot message:', err.message));

  return data;
}

// ── Buffer flush callback (fire-and-forget) ──────────────────

function handleBufferFlush(bufferKey, mergedMessage, context) {
  const { chatbot, forwardBody, prisma } = context;

  const mergedBody = { ...forwardBody, message: mergedMessage, _buffered: true };

  forwardToN8n(chatbot, mergedBody, prisma).catch(err => {
    console.error(`[Chatbot] buffered flush failed for ${bufferKey}:`, err.message);
  });
}

// ── Webhook proxy (public, no auth) ──────────────────────────

const webhookProxy = async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    // Support GHL webhook format: message may be an object {type, body} or a string
    // contactId may come as contact_id, contactId, customData.sessionId, or sessionId
    const contactId = body.contactId || body.contact_id || body.customData?.sessionId || body.sessionId || '';
    const sessionId = body.sessionId || body.customData?.sessionId || body.contact_id || '';
    const contactName = body.contactName || body.full_name || '';
    const variables = body.variables || body.customData || null;

    // Resolve media URL — GHL puts it in variables.attachments (string) or body.attachments (array)
    const msgObj = typeof body.message === 'object' ? body.message : null;
    const rawAttachment = body.variables?.attachments || body.attachments?.[0];
    const mediaUrl = typeof rawAttachment === 'string' ? rawAttachment
      : rawAttachment?.url
      || msgObj?.mediaUrl
      || body.mediaUrl
      || null;

    // Detect media type: GHL message.type (2=image,3=audio), message text, or file extension
    const msgType = msgObj?.type;
    const msgText = typeof body.message === 'string' ? body.message : (msgObj?.body || '');
    const isAudio = msgType === 3
      || /voice\s*note/i.test(msgText)
      || /\.(mp3|ogg|wav|m4a|webm|opus|aac)(\?|$)/i.test(mediaUrl || '');
    const isImage = msgType === 2
      || /\.(jpg|jpeg|png|gif|webp|bmp|svg)(\?|$)/i.test(mediaUrl || '');

    let message;

    if (isAudio && mediaUrl) {
      console.log(`[Webhook proxy] Voice note detected, transcribing: ${mediaUrl}`);
      const transcription = await transcribeAudio(mediaUrl);
      message = `[Voice note]: ${transcription}`;
    } else if (isImage && mediaUrl) {
      console.log(`[Webhook proxy] Image detected, analyzing: ${mediaUrl}`);
      const description = await analyzeImage(mediaUrl);
      message = `[Image]: ${description}`;
    } else {
      // Text message (default)
      message = typeof body.message === 'string'
        ? body.message
        : (msgObj?.body || body.customData?.message || '');
    }

    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const chatbot = await req.prisma.chatbot.findUnique({
      where: { id: id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    // Check if chatbots are enabled for the owner
    const chatbotOwner = await req.prisma.user.findUnique({ where: { id: chatbot.userId }, select: { chatbotsEnabled: true, messagesPaused: true, vapiCredits: true } });
    if (!chatbotOwner?.chatbotsEnabled) {
      return res.status(403).json({ error: 'Chatbots are disabled for this account.' });
    }
    if (chatbotOwner?.messagesPaused) {
      return res.status(403).json({ error: 'Messages are currently paused for this account.' });
    }

    if ((chatbotOwner.vapiCredits || 0) < MESSAGE_COST) {
      return res.status(402).json({ error: 'Insufficient credits. Owner needs to add credits to continue.' });
    }

    if (!chatbot.isActive) {
      return res.status(422).json({ error: 'Chatbot is not active' });
    }

    if (!chatbot.n8nWebhookUrl) {
      return res.status(422).json({ error: 'Chatbot has no workflow configured' });
    }

    const forwardBody = { message, sessionId: sessionId || 'default', contactId };
    if (contactName) forwardBody.contactName = contactName;
    if (variables && typeof variables === 'object') forwardBody.variables = variables;
    console.log(`[Webhook proxy] chatbot=${id} resolved: message="${message}", contactId="${contactId}", sessionId="${sessionId || 'default'}", contactName="${contactName}"`);

    // Check for buffer/debounce config
    const config = parseConfig(chatbot.config);
    const bufferSeconds = config?.bufferSeconds || 0;

    if (bufferSeconds > 0) {
      const bufferKey = `${chatbot.id}:${forwardBody.sessionId}`;
      const context = { chatbot, forwardBody, prisma: req.prisma };
      console.log(`[Webhook proxy] buffering message for key="${bufferKey}" (delay=${bufferSeconds}s)`);
      const result = messageBuffer.addMessage(bufferKey, message, bufferSeconds, context, handleBufferFlush);
      console.log(`[Webhook proxy] buffer size: ${result.bufferSize}, flushed: ${result.flushed || false}`);
      return res.json({ queued: true, bufferSize: result.bufferSize });
    }

    // Synchronous path (no buffering)
    console.log(`Webhook proxy: chatbot ${id} (type: ${chatbot.chatbotType}) -> ${chatbot.n8nWebhookUrl}`);
    const data = await forwardToN8n(chatbot, forwardBody, req.prisma);
    res.json(data);
  } catch (error) {
    const msg = error?.message || 'Unknown error';
    console.error('Webhook proxy error:', msg);
    res.status(error.statusCode || 500).json({ error: msg });
  }
};

/**
 * GHL respond endpoint — called by n8n HTTP Request node for GHL chatbot types.
 * Sends the AI response to the contact via GHL Conversations API.
 * POST /api/chatbots/:id/ghl-respond (public, no auth)
 */
const ghlRespond = async (req, res) => {
  try {
    const { id } = req.params;
    const { response: aiResponse, contactId } = req.body;

    if (!aiResponse || !contactId) {
      return res.status(400).json({ error: 'response and contactId are required' });
    }

    const chatbot = await req.prisma.chatbot.findUnique({ where: { id } });
    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const messageType = chatbot.chatbotType === 'ghl_whatsapp' ? 'WhatsApp' : 'SMS';

    const conn = await findGhlConnection(chatbot.userId, req.prisma);
    if (!conn) {
      console.error('ghlRespond: no GHL connection found for user', chatbot.userId);
      return res.status(422).json({ error: 'No GHL connection found for this account' });
    }

    await ghlRequest('/conversations/messages', conn.token, {
      method: 'POST',
      body: JSON.stringify({
        type: messageType,
        contactId,
        message: aiResponse
      })
    }, '2021-04-15');

    console.log(`GHL ${messageType} response sent to contact ${contactId} (chatbot ${id})`);
    res.json({ success: true, messageType, contactId });
  } catch (error) {
    console.error('ghlRespond error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to send GHL message' });
  }
};

const deleteChatbot = async (req, res) => {
  try {
    const { id } = req.params;

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id: id, userId: req.user.id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    // Deactivate n8n workflow (preserve it instead of deleting)
    if (chatbot.n8nWorkflowId) {
      try {
        const n8nConfig = await getN8nConfig(req.prisma);
        if (n8nConfig) {
          n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
          await n8nService.deactivateWorkflow(chatbot.n8nWorkflowId);
        }
      } catch (n8nError) {
        console.error('n8n workflow deactivation failed:', n8nError.message);
      }
    }

    await req.prisma.chatbot.update({
      where: { id: id },
      data: { isArchived: true, isActive: false }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'chatbot.archive',
      resourceType: 'chatbot',
      resourceId: id,
      details: { name: chatbot.name },
      req
    });

    res.json({ message: 'Chatbot archived successfully' });
  } catch (error) {
    console.error('Delete chatbot error:', error);
    res.status(500).json({ error: 'Failed to delete chatbot' });
  }
};

module.exports = {
  getChatbots,
  getChatbot,
  createChatbot,
  updateChatbot,
  toggleChatbot,
  deleteChatbot,
  testChatbot,
  webhookProxy,
  ghlRespond,
  handleBufferFlush
};
