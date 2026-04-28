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

// Detect the iv:tag:ciphertext hex shape produced by utils/encryption.encrypt().
const ENCRYPTED_RE = /^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/i;
const isEncrypted = (val) => typeof val === 'string' && ENCRYPTED_RE.test(val);

// Encrypt SQL-agent DB credentials before they hit the `config` JSON column.
// Idempotent: if the string is already ciphertext (user saved without editing), leave it alone.
const encryptDbCredentials = (config) => {
  if (!config || !config.database) return config;
  const db = { ...config.database };
  if (db.connectionString && !isEncrypted(db.connectionString)) {
    db.connectionString = encrypt(db.connectionString);
  }
  return { ...config, database: db };
};

// Mask DB credentials for UI responses. Clients never see the ciphertext or plaintext —
// they get a display-only preview and a flag so the UI can decide whether to prompt for a new value.
const maskConnectionString = (raw) => {
  if (!raw) return '';
  const tail = raw.slice(-6);
  return `••••••••${tail}`;
};

const maskDbCredentials = (config) => {
  if (!config || !config.database || !config.database.connectionString) return config;
  let preview = '';
  try {
    const plaintext = isEncrypted(config.database.connectionString)
      ? decrypt(config.database.connectionString)
      : config.database.connectionString;
    preview = maskConnectionString(plaintext);
  } catch {
    preview = '••••••••';
  }
  return {
    ...config,
    database: {
      ...config.database,
      connectionString: '',
      connectionStringPreview: preview,
      hasConnectionString: true,
    },
  };
};

const getChatbots = async (req, res) => {
  try {
    const chatbots = await req.prisma.chatbot.findMany({
      where: { userId: req.user.id, isArchived: false },
      orderBy: { createdAt: 'desc' }
    });

    const chatbotsWithParsedConfig = chatbots.map(chatbot => ({
      ...chatbot,
      config: maskDbCredentials(parseConfig(chatbot.config)),
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
        config: maskDbCredentials(parseConfig(chatbot.config)),
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

    const persistedConfig = config ? encryptDbCredentials(config) : null;

    const chatbot = await req.prisma.chatbot.create({
      data: {
        name,
        description: description || null,
        chatbotType: chatbotType || 'standard',
        outputType: outputType || 'respond_to_webhook',
        outputUrl: outputUrl ? encrypt(outputUrl) : null,
        config: persistedConfig ? JSON.stringify(persistedConfig) : null,
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
        const chatbotWithDecryptedUrl = { ...chatbot, outputUrl: outputUrl || null, config: persistedConfig || {}, serverBaseUrl: getServerBaseUrl() };
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
        config: maskDbCredentials(parseConfig(chatbot.config)),
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

    let persistedConfig = config || null;
    if (persistedConfig && persistedConfig.database) {
      const incoming = persistedConfig.database;
      // Client-side sends an empty connectionString when the user didn't retype the masked value —
      // in that case keep the previously saved ciphertext instead of wiping it.
      if (!incoming.connectionString) {
        const prev = parseConfig(existingChatbot.config);
        const prevCs = prev?.database?.connectionString || '';
        persistedConfig = {
          ...persistedConfig,
          database: { ...incoming, connectionString: prevCs },
        };
      }
      persistedConfig = encryptDbCredentials(persistedConfig);
    }

    const updateData = {
      name: name || existingChatbot.name,
      description: description !== undefined ? (description || null) : existingChatbot.description,
      config: persistedConfig ? JSON.stringify(persistedConfig) : existingChatbot.config,
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
          config: persistedConfig || parseConfig(chatbot.config) || {},
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
        config: maskDbCredentials(parseConfig(chatbot.config)),
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
        config: maskDbCredentials(parseConfig(updated.config)),
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

    // Check credits
    const owner = await req.prisma.user.findUnique({ where: { id: req.user.id }, select: { vapiCredits: true } });
    if ((owner?.vapiCredits || 0) < TEST_MESSAGE_COST) {
      return res.status(402).json({ error: 'Insufficient credits to run a test message.' });
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

    const testBody = { message, sessionId: sessionId || 'default', _testMode: true };
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

    const aiResponse = data.response || data.output || data.text || JSON.stringify(data);

    // Deduct test credits (fire-and-forget)
    req.prisma.user.update({
      where: { id: req.user.id },
      data: { vapiCredits: { decrement: TEST_MESSAGE_COST } }
    }).catch(err => console.error('Failed to deduct test chatbot credit:', err.message));

    // Log test message
    req.prisma.chatbotMessage.create({
      data: {
        chatbotId: chatbot.id,
        chatbotName: chatbot.name,
        userId: chatbot.userId,
        sessionId: testBody.sessionId || 'default',
        contactId: testBody.contactId || null,
        contactName: testBody.contactName || null,
        inputMessage: message,
        outputMessage: aiResponse,
        costCharged: TEST_MESSAGE_COST,
        status: 'success',
      }
    }).catch(err => console.error('Failed to log test chatbot message:', err.message));

    res.json({ response: aiResponse });
  } catch (error) {
    const msg = error?.message || 'Unknown error';
    console.error('Test chatbot error:', msg, error);
    res.status(500).json({ error: msg });
  }
};

// ── Helper: forward message to n8n, deduct credits, log ──────
const MESSAGE_COST = 0.01;
const TEST_MESSAGE_COST = 0.0025;

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
    console.log(`[Webhook proxy] RAW BODY:`, JSON.stringify(body, null, 2));

    // Support GHL webhook format: message may be an object {type, body} or a string
    // contactId may come as contact_id, contactId, customData.sessionId, or sessionId
    const contactId = body.contactId || body.contact_id || body.customData?.sessionId || body.sessionId || '';
    const sessionId = body.sessionId || body.customData?.sessionId || body.contact_id || '';
    const contactName = body.contactName || body.full_name || '';
    // Carry phone + email from the inbound webhook so the booking endpoint can
    // find/create the contact in the calendar's location when the inbound
    // contactId is from a different GHL location than the booking calendar.
    const contactPhone = body.contactPhone || body.phone || body.contact?.phone || '';
    const contactEmail = body.contactEmail || body.email || body.contact?.email || '';

    // Accept variables in two shapes:
    // 1. Nested: { variables: { foo: "bar" } } or { customData: { foo: "bar" } }  (legacy)
    // 2. Flat at top level: { foo: "bar", baz: "qux" }  (GHL voice-agent style)
    // Flat unknown keys are merged with the nested object; nested wins on conflict.
    const RESERVED_KEYS = new Set([
      'message', 'sessionId', 'contactId', 'contact_id', 'contactName', 'full_name',
      'contactPhone', 'phone', 'contact', 'contactEmail', 'email',
      'attachments', 'mediaUrl', 'customData', 'variables',
      'type', 'body', 'text', '_testMode', '_buffered'
    ]);
    const flatVars = {};
    for (const [k, v] of Object.entries(body || {})) {
      if (RESERVED_KEYS.has(k)) continue;
      if (v === null || v === undefined) continue;
      if (typeof v === 'object') continue;
      flatVars[k] = v;
    }
    const nestedVars = body.variables || body.customData || null;
    const mergedVars = { ...flatVars, ...(nestedVars && typeof nestedVars === 'object' ? nestedVars : {}) };
    const variables = Object.keys(mergedVars).length > 0 ? mergedVars : null;

    // Resolve media URL — GHL puts it in customData.attachments, variables.attachments, or body.attachments
    const msgObj = typeof body.message === 'object' ? body.message : null;
    const rawAttachment = body.customData?.attachments || body.variables?.attachments || body.attachments?.[0];
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
    console.log(`[Webhook proxy] media detection: msgText="${msgText}", mediaUrl="${mediaUrl}", isAudio=${isAudio}, isImage=${isImage}`);

    if (isAudio && mediaUrl) {
      console.log(`[Webhook proxy] Voice note detected, transcribing: ${mediaUrl}`);
      const transcription = await transcribeAudio(mediaUrl, req.prisma);
      message = `[Voice note]: ${transcription}`;
    } else if (isImage && mediaUrl) {
      console.log(`[Webhook proxy] Image detected, analyzing: ${mediaUrl}`);
      const description = await analyzeImage(mediaUrl, req.prisma);
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
    if (contactPhone) forwardBody.contactPhone = contactPhone;
    if (contactEmail) forwardBody.contactEmail = contactEmail;
    if (variables && typeof variables === 'object') forwardBody.variables = variables;
    console.log(`[Webhook proxy] chatbot=${id} resolved: message="${message}", contactId="${contactId}", sessionId="${sessionId || 'default'}", contactName="${contactName}", contactPhone="${contactPhone}", contactEmail="${contactEmail}"`);

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
 * Sync/regenerate the n8n workflow for an existing chatbot.
 * Useful after workflow template changes without needing to re-save the chatbot.
 * POST /api/chatbots/:id/sync-workflow (authenticated)
 */
const syncWorkflow = async (req, res) => {
  try {
    const { id } = req.params;

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const n8nConfig = await getN8nConfig(req.prisma);
    if (!n8nConfig) {
      return res.status(422).json({ error: 'n8n is not configured' });
    }

    n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
    const decryptedOutputUrl = chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null;
    const chatbotForN8n = {
      ...chatbot,
      outputUrl: decryptedOutputUrl,
      config: parseConfig(chatbot.config) || {},
      serverBaseUrl: getServerBaseUrl()
    };

    if (chatbot.n8nWorkflowId) {
      await n8nService.updateWorkflow(chatbot.n8nWorkflowId, chatbotForN8n);
      await n8nService.activateWorkflow(chatbot.n8nWorkflowId);
    } else {
      const workflow = await n8nService.createWorkflow(chatbotForN8n);
      const n8nWebhookUrl = `${n8nConfig.url.replace(/\/+$/, '')}/webhook/chatbot-${chatbot.id}`;
      await req.prisma.chatbot.update({
        where: { id: chatbot.id },
        data: { n8nWorkflowId: String(workflow.id), n8nWebhookUrl }
      });
      await n8nService.activateWorkflow(workflow.id);
    }

    res.json({ message: 'Workflow synced successfully' });
  } catch (error) {
    console.error('Sync workflow error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to sync workflow' });
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
    const { response: aiResponse, contactId, _testMode } = req.body;

    if (!aiResponse || !contactId) {
      return res.status(400).json({ error: 'response and contactId are required' });
    }

    // Skip real GHL API call when triggered from the test interface
    if (_testMode) {
      console.log(`ghlRespond: test mode — skipping GHL send for chatbot ${id}`);
      return res.json({ success: true, testMode: true });
    }

    const chatbot = await req.prisma.chatbot.findUnique({ where: { id } });
    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const messageTypeMap = {
      ghl_whatsapp: 'WhatsApp',
      ghl_facebook: 'FB',
      ghl_instagram: 'IG',
      ghl_sms: 'SMS'
    };
    const messageType = messageTypeMap[chatbot.chatbotType] || 'SMS';

    const conn = await findGhlConnection(chatbot.userId, req.prisma);
    if (!conn) {
      console.warn('ghlRespond: no GHL connection found for user', chatbot.userId, '— skipping GHL send (test/no-GHL mode)');
      return res.json({ success: true, skipped: true, reason: 'No GHL connection configured — message not sent to GHL' });
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

// Hit the Memory Manager webhook for a specific session. Returns the HTTP
// status code so the caller can detect a missing clear path (404).
async function postClearMemory(clearUrl, sessionId) {
  try {
    const resp = await fetch(clearUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId }),
      signal: AbortSignal.timeout(15000)
    });
    return resp.status;
  } catch {
    return 0;
  }
}

const clearMemory = async (req, res) => {
  try {
    const { id } = req.params;
    const { sessionId: reqSessionId, contactId: reqContactId } = req.body || {};

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id, userId: req.user.id, isArchived: false }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    if (!chatbot.n8nWebhookUrl || !chatbot.n8nWorkflowId) {
      return res.status(422).json({ error: 'Chatbot has no n8n workflow yet' });
    }

    // Derive the clear-memory webhook URL from the production one
    const clearUrl = chatbot.n8nWebhookUrl.replace(/\/chatbot-([^/]+)$/, '/chatbot-$1-clear');

    // Resolve the sessions to clear based on the requested scope.
    let sessionIds;
    let scope;
    if (reqSessionId) {
      sessionIds = [String(reqSessionId)];
      scope = `session:${reqSessionId}`;
    } else if (reqContactId) {
      const rows = await req.prisma.chatbotMessage.findMany({
        where: { chatbotId: id, contactId: String(reqContactId) },
        select: { sessionId: true },
        distinct: ['sessionId']
      });
      sessionIds = rows.map(r => r.sessionId).filter(Boolean);
      if (sessionIds.length === 0) {
        return res.status(404).json({ error: `No sessions found for contactId "${reqContactId}"` });
      }
      scope = `contact:${reqContactId}`;
    } else {
      const sessionRows = await req.prisma.chatbotMessage.findMany({
        where: { chatbotId: id },
        select: { sessionId: true },
        distinct: ['sessionId']
      });
      sessionIds = Array.from(new Set([
        'default',
        ...sessionRows.map(r => r.sessionId).filter(Boolean)
      ]));
      scope = 'all';
    }

    // Probe the clear webhook. If it 404s the workflow was deployed before the
    // Memory Manager path existed — re-sync once, then proceed.
    const probeStatus = await postClearMemory(clearUrl, sessionIds[0]);
    if (probeStatus === 404) {
      const n8nConfig = await getN8nConfig(req.prisma);
      if (!n8nConfig) {
        return res.status(422).json({ error: 'n8n is not configured' });
      }
      n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
      const chatbotForN8n = {
        ...chatbot,
        outputUrl: chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null,
        config: parseConfig(chatbot.config) || {},
        serverBaseUrl: getServerBaseUrl()
      };
      await n8nService.updateWorkflow(chatbot.n8nWorkflowId, chatbotForN8n);
      await n8nService.activateWorkflow(chatbot.n8nWorkflowId);
    }

    // Fire clear for each known session
    const results = await Promise.all(
      sessionIds.map(async sid => ({ sid, status: await postClearMemory(clearUrl, sid) }))
    );
    const cleared = results.filter(r => r.status >= 200 && r.status < 300).length;
    const failed = results.length - cleared;

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'chatbot.clear_memory',
      resourceType: 'chatbot',
      resourceId: id,
      details: { name: chatbot.name, scope, sessionsCleared: cleared, sessionsFailed: failed },
      req
    });

    if (cleared === 0) {
      return res.status(502).json({ error: 'Failed to clear memory on n8n' });
    }

    res.json({ message: 'Chatbot memory cleared', scope, sessionsCleared: cleared, sessionsFailed: failed });
  } catch (error) {
    console.error('Clear memory error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to clear memory' });
  }
};

const importChatbot = async (req, res) => {
  try {
    const { chatbotId } = req.body || {};
    if (!chatbotId || typeof chatbotId !== 'string') {
      return res.status(400).json({ error: 'chatbotId is required' });
    }

    const source = await req.prisma.chatbot.findUnique({ where: { id: chatbotId } });
    if (!source || source.isArchived) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    // Clone the persisted JSON config and outputUrl ciphertext as-is. They were
    // encrypted/encoded with the same app key, so they stay valid for the importer.
    const importedName = `${source.name} (Imported)`;
    const chatbot = await req.prisma.chatbot.create({
      data: {
        name: importedName,
        description: source.description,
        chatbotType: source.chatbotType,
        outputType: source.outputType,
        outputUrl: source.outputUrl,
        config: source.config,
        userId: req.user.id
      }
    });

    let n8nWorkflowId = null;
    let n8nWebhookUrl = null;
    let n8nWarning = null;
    try {
      const n8nConfig = await getN8nConfig(req.prisma);
      if (n8nConfig) {
        n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
        const decryptedOutputUrl = source.outputUrl ? (() => {
          try { return decrypt(source.outputUrl); } catch { return null; }
        })() : null;
        const chatbotForWorkflow = {
          ...chatbot,
          outputUrl: decryptedOutputUrl,
          config: parseConfig(chatbot.config) || {},
          serverBaseUrl: getServerBaseUrl()
        };
        const workflow = await n8nService.createWorkflow(chatbotForWorkflow);
        n8nWorkflowId = workflow.id;
        n8nWebhookUrl = `${n8nConfig.url.replace(/\/+$/, '')}/webhook/chatbot-${chatbot.id}`;
        await req.prisma.chatbot.update({
          where: { id: chatbot.id },
          data: { n8nWorkflowId: String(workflow.id), n8nWebhookUrl }
        });
        await n8nService.activateWorkflow(workflow.id);
      } else {
        n8nWarning = 'n8n is not configured. Chatbot imported without workflow.';
      }
    } catch (n8nError) {
      console.error('n8n workflow creation failed during chatbot import:', n8nError.message);
      n8nWarning = `Chatbot imported but n8n workflow creation failed: ${n8nError.message}`;
    }

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'chatbot.import',
      resourceType: 'chatbot',
      resourceId: chatbot.id,
      details: { name: chatbot.name, sourceChatbotId: source.id, sourceUserId: source.userId },
      req
    });

    const response = {
      message: n8nWarning || 'Chatbot imported successfully',
      chatbot: {
        ...chatbot,
        n8nWorkflowId,
        n8nWebhookUrl,
        config: maskDbCredentials(parseConfig(chatbot.config)),
        outputUrl: source.outputUrl ? (() => {
          try { return decrypt(source.outputUrl); } catch { return null; }
        })() : null
      }
    };
    if (n8nWarning) response.n8nWarning = n8nWarning;
    res.status(201).json(response);
  } catch (error) {
    console.error('Import chatbot error:', error);
    res.status(500).json({ error: 'Failed to import chatbot' });
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

// List recent n8n executions for this chatbot's workflow. Returns a compact shape —
// detail (including per-node runData) is fetched on-demand via getExecutionDetail.
const listExecutions = async (req, res) => {
  try {
    const { id } = req.params;
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id, userId: req.user.id },
      select: { n8nWorkflowId: true }
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });
    if (!chatbot.n8nWorkflowId) return res.json({ executions: [] });

    const n8nConfig = await getN8nConfig(req.prisma);
    if (!n8nConfig) return res.status(503).json({ error: 'n8n is not configured' });
    n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);

    const result = await n8nService.listExecutions(chatbot.n8nWorkflowId, limit);
    const executions = (result.data || []).map(e => ({
      id: e.id,
      status: e.status || (e.finished ? 'success' : (e.stoppedAt ? 'error' : 'running')),
      mode: e.mode,
      startedAt: e.startedAt,
      stoppedAt: e.stoppedAt,
      finished: e.finished,
      retryOf: e.retryOf,
    }));
    res.json({ executions });
  } catch (error) {
    console.error('listExecutions error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to list executions' });
  }
};

// Detail for one execution: returns nodes in execution order with status, timing, and
// small input/output previews. Large payloads are truncated to keep responses manageable.
const getExecutionDetail = async (req, res) => {
  try {
    const { id, executionId } = req.params;

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id, userId: req.user.id },
      select: { n8nWorkflowId: true }
    });
    if (!chatbot) return res.status(404).json({ error: 'Chatbot not found' });

    const n8nConfig = await getN8nConfig(req.prisma);
    if (!n8nConfig) return res.status(503).json({ error: 'n8n is not configured' });
    n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);

    const exec = await n8nService.getExecution(executionId);

    // Scope check: only return executions that belong to this chatbot's workflow
    if (chatbot.n8nWorkflowId && String(exec.workflowId) !== String(chatbot.n8nWorkflowId)) {
      return res.status(403).json({ error: 'Execution does not belong to this chatbot' });
    }

    const runData = exec.data?.resultData?.runData || {};
    const workflowNodes = exec.workflowData?.nodes || [];
    // nodeName → { type, parameters } lookup from the workflow snapshot stored on the execution
    const nodeMetaByName = Object.fromEntries(
      workflowNodes.map(n => [n.name, { type: n.type, parameters: n.parameters || {} }])
    );

    const PREVIEW_LIMIT = 4000;
    const truncate = (obj) => {
      if (obj === null || obj === undefined) return obj;
      try {
        const s = JSON.stringify(obj);
        if (s.length <= PREVIEW_LIMIT) return obj;
        return { _truncated: true, _length: s.length, preview: s.slice(0, PREVIEW_LIMIT) + '…' };
      } catch {
        return { _error: 'unserializable' };
      }
    };

    // Flatten runData: each node can have multiple runs. Build one entry per run
    // and sort by startTime so the UI can display them in execution order.
    const nodeRuns = [];
    for (const [nodeName, runs] of Object.entries(runData)) {
      (runs || []).forEach((run, runIndex) => {
        const outputBranches = Array.isArray(run?.data?.main)
          ? run.data.main.map(branch =>
              Array.isArray(branch) ? branch.map(item => item?.json ?? item) : branch
            )
          : [];
        const errorInfo = run?.error
          ? {
              message: run.error.message,
              name: run.error.name,
              description: run.error.description,
              stack: run.error.stack ? String(run.error.stack).slice(0, 1500) : undefined,
            }
          : null;
        const meta = nodeMetaByName[nodeName] || {};
        const sourceNode = run?.source?.[0]?.previousNode || null;
        nodeRuns.push({
          nodeName,
          nodeType: meta.type || null,
          parameters: meta.parameters ? truncate(meta.parameters) : {},
          source: sourceNode,
          runIndex,
          startTime: run.startTime,
          executionTime: run.executionTime,
          status: errorInfo ? 'error' : 'success',
          error: errorInfo,
          output: outputBranches.length ? truncate(outputBranches) : null,
        });
      });
    }
    nodeRuns.sort((a, b) => (a.startTime || 0) - (b.startTime || 0));

    // Fill in input by mapping each node's source → the previous node's output (same-or-earlier run).
    // This is a best-effort approximation — n8n itself derives input the same way at render time.
    const outputByNode = {};
    nodeRuns.forEach(n => {
      if (!outputByNode[n.nodeName]) outputByNode[n.nodeName] = [];
      outputByNode[n.nodeName].push(n.output);
    });
    nodeRuns.forEach(n => {
      if (n.source && outputByNode[n.source]) {
        n.input = outputByNode[n.source][0] ?? null;
      } else {
        n.input = null;
      }
    });

    res.json({
      execution: {
        id: exec.id,
        status: exec.status || (exec.finished ? 'success' : (exec.stoppedAt ? 'error' : 'running')),
        mode: exec.mode,
        startedAt: exec.startedAt,
        stoppedAt: exec.stoppedAt,
        finished: exec.finished,
        workflowId: exec.workflowId,
      },
      nodes: nodeRuns,
    });
  } catch (error) {
    console.error('getExecutionDetail error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to load execution' });
  }
};

// SQL-agent DB connection probe. Accepts a plaintext connection string OR an existing chatbot id
// (so the user can re-test an already-saved connection without retyping it). For now Postgres only —
// `pg` is already a server dependency. Queries `SELECT 1` with a short timeout and returns success or
// a normalized error message.
const testDbConnection = async (req, res) => {
  try {
    const { type = 'postgres', connectionString: rawCs, chatbotId } = req.body || {};

    if (type !== 'postgres') {
      return res.status(400).json({ error: `Unsupported database type: ${type}` });
    }

    let connectionString = rawCs;
    if (!connectionString && chatbotId) {
      const cb = await req.prisma.chatbot.findFirst({
        where: { id: chatbotId, userId: req.user.id },
        select: { config: true }
      });
      if (!cb) return res.status(404).json({ error: 'Chatbot not found' });
      const cfg = parseConfig(cb.config);
      const stored = cfg?.database?.connectionString;
      if (!stored) return res.status(400).json({ error: 'No stored connection string for this chatbot' });
      try {
        connectionString = isEncrypted(stored) ? decrypt(stored) : stored;
      } catch {
        return res.status(400).json({ error: 'Stored connection string is corrupted — re-enter it' });
      }
    }

    if (!connectionString) {
      return res.status(400).json({ error: 'connectionString is required' });
    }

    const { Client } = require('pg');
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 8000,
      statement_timeout: 8000,
      query_timeout: 8000,
    });

    const start = Date.now();
    try {
      await client.connect();
      const result = await client.query('SELECT 1 AS ok');
      await client.end();
      return res.json({
        success: true,
        latencyMs: Date.now() - start,
        rowCount: result.rowCount
      });
    } catch (dbErr) {
      try { await client.end(); } catch {}
      return res.status(400).json({ error: dbErr.message || 'Failed to connect' });
    }
  } catch (error) {
    console.error('testDbConnection error:', error);
    res.status(500).json({ error: 'Failed to test connection' });
  }
};

module.exports = {
  getChatbots,
  getChatbot,
  createChatbot,
  updateChatbot,
  toggleChatbot,
  importChatbot,
  deleteChatbot,
  testChatbot,
  testDbConnection,
  syncWorkflow,
  clearMemory,
  listExecutions,
  getExecutionDetail,
  webhookProxy,
  ghlRespond,
  handleBufferFlush
};
