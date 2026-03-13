const { encrypt, decrypt } = require('../utils/encryption');
const { logAudit } = require('../utils/auditLog');
const n8nService = require('../services/n8nService');
const { getN8nConfig } = require('../utils/getN8nConfig');

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
      where: { userId: req.user.id },
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
      where: { id: id, userId: req.user.id }
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
    try {
      const n8nConfig = await getN8nConfig(req.prisma);
      if (n8nConfig) {
        n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
        const chatbotWithDecryptedUrl = { ...chatbot, outputUrl: outputUrl || null, config: config || {} };
        const workflow = await n8nService.createWorkflow(chatbotWithDecryptedUrl);
        n8nWorkflowId = workflow.id;
        n8nWebhookUrl = `${n8nConfig.url}/webhook/chatbot-${chatbot.id}`;

        await req.prisma.chatbot.update({
          where: { id: chatbot.id },
          data: { n8nWorkflowId: String(workflow.id), n8nWebhookUrl: n8nWebhookUrl }
        });

        // Activate the workflow
        await n8nService.activateWorkflow(workflow.id);
      }
    } catch (n8nError) {
      console.error('n8n workflow creation failed (chatbot saved without workflow):', n8nError.message);
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

    res.status(201).json({
      message: 'Chatbot created successfully',
      chatbot: {
        ...chatbot,
        config: parseConfig(chatbot.config),
        outputUrl: outputUrl || null,
        n8nWorkflowId,
        n8nWebhookUrl
      }
    });
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
    try {
      const n8nConfig = await getN8nConfig(req.prisma);
      if (n8nConfig) {
        n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey);
        const decryptedOutputUrl = chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null;
        const chatbotForN8n = {
          ...chatbot,
          outputUrl: decryptedOutputUrl,
          config: config || parseConfig(chatbot.config) || {}
        };

        if (existingChatbot.n8nWorkflowId) {
          // Update existing workflow
          await n8nService.updateWorkflow(existingChatbot.n8nWorkflowId, chatbotForN8n);
          await n8nService.activateWorkflow(existingChatbot.n8nWorkflowId);
        } else {
          // Create new workflow if one doesn't exist yet
          const workflow = await n8nService.createWorkflow(chatbotForN8n);
          const n8nWebhookUrl = `${n8nConfig.url}/webhook/chatbot-${chatbot.id}`;
          await req.prisma.chatbot.update({
            where: { id: chatbot.id },
            data: { n8nWorkflowId: String(workflow.id), n8nWebhookUrl }
          });
          await n8nService.activateWorkflow(workflow.id);
        }
      }
    } catch (n8nError) {
      console.error('n8n workflow update failed:', n8nError.message);
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

    res.json({
      message: 'Chatbot updated successfully',
      chatbot: {
        ...chatbot,
        config: parseConfig(chatbot.config),
        outputUrl: chatbot.outputUrl ? decrypt(chatbot.outputUrl) : null
      }
    });
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
    const { message, sessionId } = req.body;

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

    // For GHL calendar testing, include the test contact ID from calendarConfig
    const config = chatbot.config ? JSON.parse(chatbot.config) : {};
    const calendarConfig = config.calendarConfig || {};
    const ghlTestContactId = calendarConfig.ghlTestContactId || '';
    const ghlTestContactName = calendarConfig.ghlTestContactName || '';

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

const webhookProxy = async (req, res) => {
  try {
    const { id } = req.params;
    const { message, sessionId, variables } = req.body;

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
    const chatbotOwner = await req.prisma.user.findUnique({ where: { id: chatbot.userId }, select: { chatbotsEnabled: true } });
    if (!chatbotOwner?.chatbotsEnabled) {
      return res.status(403).json({ error: 'Chatbots are disabled for this account.' });
    }

    if (!chatbot.isActive) {
      return res.status(422).json({ error: 'Chatbot is not active' });
    }

    if (!chatbot.n8nWebhookUrl) {
      return res.status(422).json({ error: 'Chatbot has no workflow configured' });
    }

    console.log(`Webhook proxy: chatbot ${id} -> ${chatbot.n8nWebhookUrl}`);

    const forwardBody = { message, sessionId: sessionId || 'default', contactId: sessionId || '' };
    if (variables && typeof variables === 'object') {
      forwardBody.variables = variables;
    }

    const n8nResponse = await fetch(chatbot.n8nWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(forwardBody),
      signal: AbortSignal.timeout(60000)
    });

    const responseText = await n8nResponse.text().catch(() => '');

    if (!n8nResponse.ok) {
      console.error(`Webhook proxy upstream error ${n8nResponse.status}:`, responseText.substring(0, 500));
      return res.status(502).json({ error: `Upstream error (${n8nResponse.status}): ${responseText.substring(0, 200) || 'No response'}` });
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { response: responseText };
    }

    res.json(data);
  } catch (error) {
    const msg = error?.message || 'Unknown error';
    console.error('Webhook proxy error:', msg);
    res.status(500).json({ error: msg });
  }
};

module.exports = {
  getChatbots,
  getChatbot,
  createChatbot,
  updateChatbot,
  toggleChatbot,
  testChatbot,
  webhookProxy
};
