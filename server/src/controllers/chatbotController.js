const OpenAI = require('openai');
const { encrypt, decrypt } = require('../utils/encryption');
const { logAudit } = require('../utils/auditLog');
const { getApiKeys } = require('../utils/getApiKeys');
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
      where: { id: parseInt(id), userId: req.user.id }
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
      where: { id: parseInt(id), userId: req.user.id }
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
      where: { id: parseInt(id) },
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
      where: { id: parseInt(id), userId: req.user.id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const newActive = !chatbot.isActive;

    const updated = await req.prisma.chatbot.update({
      where: { id: parseInt(id) },
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
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    const chatbot = await req.prisma.chatbot.findFirst({
      where: { id: parseInt(id), userId: req.user.id }
    });

    if (!chatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    const config = parseConfig(chatbot.config) || {};
    const systemPrompt = config.systemPromptBase || config.systemPrompt || 'You are a helpful assistant.';
    const modelName = config.modelName || 'gpt-4o';

    const { openaiApiKey } = await getApiKeys(req.prisma);
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    const openai = new OpenAI({ apiKey: openaiApiKey });

    // Validate the call works before switching to SSE
    let stream;
    try {
      stream = await openai.chat.completions.create({
        model: modelName,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.map(m => ({ role: m.role, content: m.content }))
        ],
        stream: true,
        temperature: 0.7,
        max_tokens: 2048
      });
    } catch (apiError) {
      const msg = apiError?.error?.message || apiError?.message || 'OpenAI API call failed';
      console.error('Test chatbot OpenAI error:', msg, apiError);
      return res.status(422).json({ error: msg });
    }

    // SSE streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    const msg = error?.error?.message || error?.message || 'Unknown error';
    console.error('Test chatbot error:', msg, error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: msg });
    }
  }
};

module.exports = {
  getChatbots,
  getChatbot,
  createChatbot,
  updateChatbot,
  toggleChatbot,
  testChatbot
};
