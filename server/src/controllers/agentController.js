const vapiService = require('../services/vapiService');
const { getApiKeys } = require('../utils/getApiKeys');

// Rewrite localhost URLs in tools to use the production APP_URL
// VAPI servers call these URLs directly, so they must be publicly reachable
const rewriteToolUrls = (config) => {
  const appUrl = process.env.APP_URL;
  if (!appUrl || !config?.tools) return config;
  return {
    ...config,
    tools: config.tools.map(tool => {
      if (tool.url && /^https?:\/\/localhost(:\d+)?/.test(tool.url)) {
        return { ...tool, url: tool.url.replace(/^https?:\/\/localhost(:\d+)?/, appUrl) };
      }
      return tool;
    })
  };
};

const parseConfig = (config) => {
  if (!config) return null;
  try {
    return JSON.parse(config);
  } catch {
    return null;
  }
};

const getAgents = async (req, res) => {
  try {
    const agents = await req.prisma.agent.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' }
    });

    // Parse config JSON strings
    const agentsWithParsedConfig = agents.map(agent => ({
      ...agent,
      config: parseConfig(agent.config)
    }));

    res.json({ agents: agentsWithParsedConfig });
  } catch (error) {
    console.error('Get agents error:', error);
    res.status(500).json({ error: 'Failed to fetch agents' });
  }
};

const getAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const agent = await req.prisma.agent.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    });

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json({ agent: { ...agent, config: parseConfig(agent.config) } });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({ error: 'Failed to fetch agent' });
  }
};

const createAgent = async (req, res) => {
  try {
    const { name, config, agentType } = req.body;
    console.log('Create agent request - name:', name, 'agentType:', agentType, 'config:', JSON.stringify(config, null, 2));

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    let vapiId = null;
    let vapiWarning = null;

    // Try to create VAPI agent if service is configured
    const { vapiApiKey } = await getApiKeys(req.prisma);
    if (vapiApiKey) {
      try {
        vapiService.setApiKey(vapiApiKey);
        const fixedConfig = rewriteToolUrls(config) || config;
        const vapiAgent = await vapiService.createAgent({
          name,
          ...fixedConfig
        });
        vapiId = vapiAgent.id;
        console.log('VAPI agent created:', vapiId);
      } catch (vapiError) {
        console.error('VAPI agent creation failed:', vapiError.message);
        vapiWarning = `Agent saved locally but VAPI creation failed: ${vapiError.message}`;
      }
    } else {
      vapiWarning = 'VAPI API key not configured. Agent saved locally only.';
    }

    const savedConfig = rewriteToolUrls(config) || config;
    const agent = await req.prisma.agent.create({
      data: {
        name,
        agentType: agentType || 'outbound',
        vapiId,
        config: savedConfig ? JSON.stringify(savedConfig) : null,
        userId: req.user.id
      }
    });

    res.status(201).json({
      message: vapiWarning || 'Agent created successfully',
      vapiWarning,
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Create agent error:', error);
    res.status(500).json({ error: 'Failed to create agent' });
  }
};

const updateAgent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, config, agentType } = req.body;
    console.log('=== UPDATE AGENT REQUEST ===');
    console.log('Agent ID:', id, '| Name:', name, '| Type:', agentType);
    console.log('Tools count:', config?.tools?.length || 0);
    console.log('System prompt length:', config?.systemPrompt?.length || 0);
    console.log('Calendar config:', JSON.stringify(config?.calendarConfig || {}, null, 2));

    // Verify ownership
    const existingAgent = await req.prisma.agent.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update VAPI agent if exists
    let vapiWarning = null;
    let vapiSyncInfo = null;
    const { vapiApiKey: vapiKey } = await getApiKeys(req.prisma);
    if (existingAgent.vapiId && vapiKey) {
      try {
        vapiService.setApiKey(vapiKey);
        const fixedConfig = rewriteToolUrls(config) || config;
        const vapiPayload = { name, ...fixedConfig };
        const sentToolCount = vapiPayload.tools?.length || 0;
        const sentToolNames = (vapiPayload.tools || []).map(t => t.function?.name || t.type).join(', ');
        console.log('=== CALLING VAPI UPDATE ===');
        console.log('VAPI ID:', existingAgent.vapiId);
        console.log('Sending tools:', sentToolCount, '(' + sentToolNames + ')');
        console.log('Sending prompt length:', vapiPayload.systemPrompt?.length || 0);

        const vapiResult = await vapiService.updateAgent(existingAgent.vapiId, vapiPayload);
        const returnedToolCount = vapiResult.model?.toolIds?.length || 0;
        const returnedPromptLength = vapiResult.model?.systemPrompt?.length || 0;
        console.log('=== VAPI RESULT ===');
        console.log('Returned toolIds:', returnedToolCount, vapiResult.model?.toolIds);
        console.log('Returned prompt length:', returnedPromptLength);

        vapiSyncInfo = {
          sentTools: sentToolCount,
          savedTools: returnedToolCount,
          sentPromptLength: vapiPayload.systemPrompt?.length || 0,
          savedPromptLength: returnedPromptLength,
          vapiId: existingAgent.vapiId
        };

        // Verify tools were actually saved
        if (sentToolCount > 0 && returnedToolCount === 0) {
          vapiWarning = `VAPI update succeeded but 0 tools saved (sent ${sentToolCount}: ${sentToolNames}). Tool creation may have failed.`;
        } else if (sentToolCount !== returnedToolCount) {
          vapiWarning = `VAPI saved ${returnedToolCount} of ${sentToolCount} tools. Some may have been rejected.`;
        }
      } catch (vapiError) {
        console.error('=== VAPI FAILED ===');
        console.error('Error:', vapiError.message);
        vapiWarning = `Agent saved locally but VAPI update failed: ${vapiError.message}`;
      }
    } else if (!existingAgent.vapiId && vapiKey) {
      // Agent was created without VAPI — try to create it now
      try {
        vapiService.setApiKey(vapiKey);
        const fixedConfig = rewriteToolUrls(config) || config;
        const vapiAgent = await vapiService.createAgent({ name, ...fixedConfig });
        // Store the new vapiId
        await req.prisma.agent.update({
          where: { id: parseInt(id) },
          data: { vapiId: vapiAgent.id }
        });
        existingAgent.vapiId = vapiAgent.id;
        console.log('=== VAPI CREATED (was missing) ===', vapiAgent.id);
      } catch (vapiError) {
        console.error('=== VAPI CREATE FAILED ===');
        console.error('Error:', vapiError.message);
        vapiWarning = `Agent saved locally but VAPI creation failed: ${vapiError.message}`;
      }
    } else {
      console.log('=== VAPI SKIPPED ===');
      console.log('vapiId:', existingAgent.vapiId, 'apiKey exists:', !!vapiKey);
      vapiWarning = !vapiKey ? 'VAPI API key not configured. Agent saved locally only.' : 'Agent has no VAPI ID.';
    }

    const savedConfig = rewriteToolUrls(config) || config;
    const updateData = { name, config: savedConfig ? JSON.stringify(savedConfig) : null };
    if (agentType) updateData.agentType = agentType;

    const agent = await req.prisma.agent.update({
      where: { id: parseInt(id) },
      data: updateData
    });

    res.json({
      message: vapiWarning || 'Agent updated successfully',
      vapiWarning,
      vapiSyncInfo,
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existingAgent = await req.prisma.agent.findFirst({
      where: {
        id: parseInt(id),
        userId: req.user.id
      }
    });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Delete VAPI agent if exists
    const { vapiApiKey: vapiDelKey } = await getApiKeys(req.prisma);
    if (existingAgent.vapiId && vapiDelKey) {
      try {
        vapiService.setApiKey(vapiDelKey);
        await vapiService.deleteAgent(existingAgent.vapiId);
      } catch (vapiError) {
        console.error('VAPI agent deletion failed:', vapiError);
      }
    }

    await req.prisma.agent.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Agent deleted successfully' });
  } catch (error) {
    console.error('Delete agent error:', error);
    res.status(500).json({ error: 'Failed to delete agent' });
  }
};

// Debug: Check what VAPI actually has for this agent
const checkVapiSync = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await req.prisma.agent.findFirst({
      where: { id: parseInt(id), userId: req.user.id }
    });

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.vapiId) return res.json({ error: 'Agent has no VAPI ID', agent: { id: agent.id, name: agent.name, vapiId: null } });

    const { vapiApiKey: vapiKey } = await getApiKeys(req.prisma);
    if (!vapiKey) return res.json({ error: 'No VAPI API key configured' });

    vapiService.setApiKey(vapiKey);
    const vapiAgent = await vapiService.getAgent(agent.vapiId);

    const localConfig = JSON.parse(agent.config || '{}');

    res.json({
      local: {
        id: agent.id,
        name: agent.name,
        vapiId: agent.vapiId,
        toolCount: localConfig.tools?.length || 0,
        toolNames: (localConfig.tools || []).map(t => t.function?.name || t.type),
        promptLength: localConfig.systemPrompt?.length || 0
      },
      vapi: {
        id: vapiAgent.id,
        name: vapiAgent.name,
        modelProvider: vapiAgent.model?.provider,
        modelName: vapiAgent.model?.model,
        toolIds: vapiAgent.model?.toolIds || [],
        toolCount: vapiAgent.model?.toolIds?.length || 0,
        promptLength: vapiAgent.model?.systemPrompt?.length || 0,
        promptPreview: vapiAgent.model?.systemPrompt?.substring(0, 100) + '...',
        firstMessage: vapiAgent.firstMessage,
        voice: vapiAgent.voice
      }
    });
  } catch (error) {
    console.error('Check VAPI sync error:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  deleteAgent,
  checkVapiSync
};
