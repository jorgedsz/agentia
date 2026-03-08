const n8nService = require('../services/n8nService');
const { getN8nConfig } = require('../utils/getN8nConfig');
const { encrypt, decrypt } = require('../utils/encryption');
const { logAudit } = require('../utils/auditLog');

const parseConfig = (config) => {
  if (!config) return null;
  try {
    return JSON.parse(config);
  } catch {
    return null;
  }
};

const setupN8n = async (prisma) => {
  const config = await getN8nConfig(prisma);
  if (config) {
    n8nService.setConfig(config.url, config.apiKey);
    return true;
  }
  return false;
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

    // Create chatbot in DB first to get the ID
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

    // Try to create n8n workflow
    let n8nWarning = null;
    const n8nConfigured = await setupN8n(req.prisma);

    if (n8nConfigured) {
      try {
        const chatbotForN8n = {
          ...chatbot,
          outputUrl: outputUrl || null,
          config: config || {}
        };
        const workflow = await n8nService.createWorkflow(chatbotForN8n);

        // Activate the workflow
        try {
          await n8nService.activateWorkflow(workflow.id);
        } catch (activateErr) {
          console.error('Failed to activate n8n workflow:', activateErr.message);
        }

        // Build webhook URL
        const n8nConfig = await getN8nConfig(req.prisma);
        const webhookUrl = `${n8nConfig.url}/webhook/chatbot-${chatbot.id}`;

        // Update chatbot with n8n info
        await req.prisma.chatbot.update({
          where: { id: chatbot.id },
          data: {
            n8nWorkflowId: String(workflow.id),
            n8nWebhookUrl: webhookUrl
          }
        });

        chatbot.n8nWorkflowId = String(workflow.id);
        chatbot.n8nWebhookUrl = webhookUrl;
      } catch (n8nError) {
        console.error('n8n workflow creation failed:', n8nError.message);
        n8nWarning = `Chatbot saved but n8n workflow creation failed: ${n8nError.message}`;
      }
    } else {
      n8nWarning = 'n8n not configured. Chatbot saved locally only.';
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
      message: n8nWarning || 'Chatbot created successfully',
      n8nWarning,
      chatbot: {
        ...chatbot,
        config: parseConfig(chatbot.config),
        outputUrl: outputUrl || null
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

    // Update n8n workflow
    let n8nWarning = null;
    const n8nConfigured = await setupN8n(req.prisma);

    if (n8nConfigured) {
      const chatbotForN8n = {
        id: parseInt(id),
        name: name || existingChatbot.name,
        outputType: outputType || existingChatbot.outputType,
        outputUrl: outputUrl || null,
        config: config || parseConfig(existingChatbot.config) || {}
      };

      if (existingChatbot.n8nWorkflowId) {
        try {
          await n8nService.updateWorkflow(existingChatbot.n8nWorkflowId, chatbotForN8n);
          // Re-activate after update
          try {
            await n8nService.activateWorkflow(existingChatbot.n8nWorkflowId);
          } catch (activateErr) {
            console.error('Failed to re-activate n8n workflow:', activateErr.message);
          }
        } catch (n8nError) {
          console.error('n8n workflow update failed:', n8nError.message);
          n8nWarning = `Chatbot saved but n8n workflow update failed: ${n8nError.message}`;
        }
      } else {
        // No workflow yet — create one
        try {
          const workflow = await n8nService.createWorkflow(chatbotForN8n);
          try {
            await n8nService.activateWorkflow(workflow.id);
          } catch (activateErr) {
            console.error('Failed to activate new n8n workflow:', activateErr.message);
          }

          const n8nConfig = await getN8nConfig(req.prisma);
          const webhookUrl = `${n8nConfig.url}/webhook/chatbot-${id}`;

          existingChatbot.n8nWorkflowId = String(workflow.id);
          existingChatbot.n8nWebhookUrl = webhookUrl;
        } catch (n8nError) {
          console.error('n8n workflow creation failed:', n8nError.message);
          n8nWarning = `Chatbot saved but n8n workflow creation failed: ${n8nError.message}`;
        }
      }
    } else {
      n8nWarning = 'n8n not configured. Chatbot saved locally only.';
    }

    const updateData = {
      name: name || existingChatbot.name,
      description: description !== undefined ? (description || null) : existingChatbot.description,
      config: config ? JSON.stringify(config) : existingChatbot.config,
      outputType: outputType || existingChatbot.outputType,
      outputUrl: outputUrl ? encrypt(outputUrl) : (outputUrl === '' ? null : existingChatbot.outputUrl)
    };
    if (chatbotType) updateData.chatbotType = chatbotType;
    if (existingChatbot.n8nWorkflowId) updateData.n8nWorkflowId = existingChatbot.n8nWorkflowId;
    if (existingChatbot.n8nWebhookUrl) updateData.n8nWebhookUrl = existingChatbot.n8nWebhookUrl;

    const chatbot = await req.prisma.chatbot.update({
      where: { id: parseInt(id) },
      data: updateData
    });

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
      message: n8nWarning || 'Chatbot updated successfully',
      n8nWarning,
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

const deleteChatbot = async (req, res) => {
  try {
    const { id } = req.params;

    const existingChatbot = await req.prisma.chatbot.findFirst({
      where: { id: parseInt(id), userId: req.user.id }
    });

    if (!existingChatbot) {
      return res.status(404).json({ error: 'Chatbot not found' });
    }

    // Delete n8n workflow
    if (existingChatbot.n8nWorkflowId) {
      const n8nConfigured = await setupN8n(req.prisma);
      if (n8nConfigured) {
        try {
          await n8nService.deleteWorkflow(existingChatbot.n8nWorkflowId);
        } catch (n8nError) {
          console.error('n8n workflow deletion failed:', n8nError.message);
        }
      }
    }

    await req.prisma.chatbot.delete({
      where: { id: parseInt(id) }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'chatbot.delete',
      resourceType: 'chatbot',
      resourceId: id,
      details: { name: existingChatbot.name },
      req
    });

    res.json({ message: 'Chatbot deleted successfully' });
  } catch (error) {
    console.error('Delete chatbot error:', error);
    res.status(500).json({ error: 'Failed to delete chatbot' });
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

    // Toggle n8n workflow
    if (chatbot.n8nWorkflowId) {
      const n8nConfigured = await setupN8n(req.prisma);
      if (n8nConfigured) {
        try {
          if (newActive) {
            await n8nService.activateWorkflow(chatbot.n8nWorkflowId);
          } else {
            await n8nService.deactivateWorkflow(chatbot.n8nWorkflowId);
          }
        } catch (n8nError) {
          console.error('n8n workflow toggle failed:', n8nError.message);
        }
      }
    }

    const updated = await req.prisma.chatbot.update({
      where: { id: parseInt(id) },
      data: { isActive: newActive }
    });

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

module.exports = {
  getChatbots,
  getChatbot,
  createChatbot,
  updateChatbot,
  deleteChatbot,
  toggleChatbot
};
