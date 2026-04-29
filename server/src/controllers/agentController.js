const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');
const { logAudit } = require('../utils/auditLog');

// Get the public base URL for this server (VAPI needs publicly reachable URLs)
const getPublicBaseUrl = () => {
  if (process.env.APP_URL) return process.env.APP_URL;
  // Derive from GHL_REDIRECT_URI (already set on Railway)
  if (process.env.GHL_REDIRECT_URI) {
    try {
      const url = new URL(process.env.GHL_REDIRECT_URI);
      return url.origin;
    } catch {}
  }
  // Railway auto-sets this
  if (process.env.RAILWAY_PUBLIC_DOMAIN) {
    return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  return null;
};

// Rewrite localhost URLs in tools to use the production URL
// VAPI servers call these URLs directly, so they must be publicly reachable
const rewriteToolUrls = (config) => {
  const publicUrl = getPublicBaseUrl();
  if (!publicUrl || !config?.tools) return config;
  return {
    ...config,
    tools: config.tools.map(tool => {
      if (tool.url && /^https?:\/\/localhost(:\d+)?/.test(tool.url)) {
        return { ...tool, url: tool.url.replace(/^https?:\/\/localhost(:\d+)?/, publicUrl) };
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
      orderBy: { createdAt: 'desc' },
      include: { phoneNumbers: { select: { id: true } } }
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
        id: id,
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
    const { name, description, config, agentType } = req.body;
    console.log('Create agent request - name:', name, 'agentType:', agentType, 'config:', JSON.stringify(config, null, 2));

    if (!name) {
      return res.status(400).json({ error: 'Agent name is required' });
    }

    let vapiId = null;
    let vapiWarning = null;

    // Try to create VAPI agent if service is configured
    const vapiApiKey = await getVapiKeyForUser(req.prisma, req.user.id);
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
        description: description || null,
        agentType: agentType || 'outbound',
        vapiId,
        config: savedConfig ? JSON.stringify(savedConfig) : null,
        userId: req.user.id
      }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'agent.create',
      resourceType: 'agent',
      resourceId: agent.id,
      details: { name: agent.name, agentType: agent.agentType },
      req
    });

    const isOwner = req.user.role === 'OWNER';
    res.status(201).json({
      message: vapiWarning ? (isOwner ? vapiWarning : 'Agent saved') : 'Agent created successfully',
      vapiWarning: isOwner ? vapiWarning : (vapiWarning ? 'Agent saved' : null),
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
    const { name, description, config, agentType } = req.body;
    console.log('=== UPDATE AGENT REQUEST ===');
    console.log('Agent ID:', id, '| Name:', name, '| Type:', agentType);
    console.log('Tools count:', config?.tools?.length || 0);
    console.log('System prompt length:', config?.systemPrompt?.length || 0);
    console.log('Calendar config:', JSON.stringify(config?.calendarConfig || {}, null, 2));

    // Verify ownership
    const existingAgent = await req.prisma.agent.findFirst({
      where: {
        id: id,
        userId: req.user.id
      }
    });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Update VAPI agent if exists
    let vapiWarning = null;
    let vapiNotice = null;
    let vapiSyncInfo = null;
    const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
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
          vapiId: existingAgent.vapiId,
          webhookUrl: vapiResult.serverUrl || vapiResult.server?.url || 'NOT SET'
        };

        // Verify tools were actually saved
        const toolErrors = vapiResult._toolErrors || [];
        const toolErrorDetail = toolErrors.length > 0 ? ` Errors: ${toolErrors.join('; ')}` : '';
        if (sentToolCount > 0 && returnedToolCount === 0) {
          vapiWarning = `VAPI: 0 of ${sentToolCount} tools saved.${toolErrorDetail}`;
        } else if (sentToolCount !== returnedToolCount) {
          vapiWarning = `VAPI saved ${returnedToolCount} of ${sentToolCount} tools.${toolErrorDetail}`;
        }
      } catch (vapiError) {
        console.error('=== VAPI FAILED ===');
        console.error('Error:', vapiError.message);

        // Self-heal: if the stored vapiId points at an assistant that no
        // longer exists in VAPI, clear it and create a fresh one so the
        // agent is usable again without manual DB surgery.
        const msg = vapiError.message || '';
        const assistantMissing = /does not exist/i.test(msg) || /couldn'?t get assistant/i.test(msg);
        if (assistantMissing) {
          try {
            console.log('=== VAPI SELF-HEAL: recreating missing assistant ===');
            const fixedConfig = rewriteToolUrls(config) || config;
            const vapiAgent = await vapiService.createAgent({ name, ...fixedConfig });
            await req.prisma.agent.update({
              where: { id: id },
              data: { vapiId: vapiAgent.id }
            });
            existingAgent.vapiId = vapiAgent.id;
            vapiNotice = `Previous VAPI assistant was missing — created a new one (${vapiAgent.id}).`;
            vapiSyncInfo = { vapiId: vapiAgent.id, recreated: true };
          } catch (recreateErr) {
            console.error('=== VAPI SELF-HEAL FAILED ===', recreateErr.message);
            vapiWarning = `Agent saved locally but VAPI recreate failed: ${recreateErr.message}`;
          }
        } else {
          vapiWarning = `Agent saved locally but VAPI update failed: ${vapiError.message}`;
        }
      }
    } else if (!existingAgent.vapiId && vapiKey) {
      // Agent was created without VAPI — try to create it now
      try {
        vapiService.setApiKey(vapiKey);
        const fixedConfig = rewriteToolUrls(config) || config;
        const vapiAgent = await vapiService.createAgent({ name, ...fixedConfig });
        // Store the new vapiId
        await req.prisma.agent.update({
          where: { id: id },
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
    const updateData = { name, description: description || null, config: savedConfig ? JSON.stringify(savedConfig) : null };
    if (agentType) updateData.agentType = agentType;

    const agent = await req.prisma.agent.update({
      where: { id: id },
      data: updateData
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'agent.update',
      resourceType: 'agent',
      resourceId: agent.id,
      details: { name: agent.name },
      req
    });

    const isOwner = req.user.role === 'OWNER';
    // For non-owners we hide the detailed VAPI diagnostics, but the save
    // itself succeeded — route it through vapiNotice (green) so the UI
    // doesn't render "Agent saved" in red.
    res.json({
      message: vapiWarning ? (isOwner ? vapiWarning : 'Agent saved') : 'Agent updated successfully',
      vapiWarning: isOwner ? vapiWarning : null,
      vapiNotice: isOwner ? vapiNotice : (vapiWarning ? 'Agent saved' : vapiNotice),
      vapiSyncInfo: isOwner ? vapiSyncInfo : null,
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Update agent error:', error);
    res.status(500).json({ error: 'Failed to update agent' });
  }
};

const duplicateAgent = async (req, res) => {
  try {
    const { id } = req.params;

    const original = await req.prisma.agent.findFirst({
      where: { id, userId: req.user.id }
    });

    if (!original) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const originalConfig = parseConfig(original.config);

    // Create a new VAPI agent from the config
    let vapiId = null;
    let vapiWarning = null;
    const vapiApiKey = await getVapiKeyForUser(req.prisma, req.user.id);
    if (vapiApiKey && originalConfig) {
      try {
        vapiService.setApiKey(vapiApiKey);
        const fixedConfig = rewriteToolUrls(originalConfig) || originalConfig;
        const vapiAgent = await vapiService.createAgent({
          name: `${original.name} (Copy)`,
          ...fixedConfig
        });
        vapiId = vapiAgent.id;
      } catch (vapiError) {
        console.error('VAPI agent creation failed during duplicate:', vapiError.message);
        vapiWarning = `Agent duplicated locally but VAPI creation failed: ${vapiError.message}`;
      }
    } else if (!vapiApiKey) {
      vapiWarning = 'VAPI API key not configured. Agent duplicated locally only.';
    }

    const savedConfig = originalConfig ? JSON.stringify(rewriteToolUrls(originalConfig) || originalConfig) : null;
    const agent = await req.prisma.agent.create({
      data: {
        name: `${original.name} (Copy)`,
        description: original.description,
        agentType: original.agentType,
        vapiId,
        config: savedConfig,
        userId: req.user.id
      }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'agent.duplicate',
      resourceType: 'agent',
      resourceId: agent.id,
      details: { name: agent.name, sourceAgentId: original.id },
      req
    });

    const isOwner = req.user.role === 'OWNER';
    res.status(201).json({
      message: vapiWarning ? (isOwner ? vapiWarning : 'Agent duplicated') : 'Agent duplicated successfully',
      vapiWarning: isOwner ? vapiWarning : (vapiWarning ? 'Agent duplicated' : null),
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Duplicate agent error:', error);
    res.status(500).json({ error: 'Failed to duplicate agent' });
  }
};

const importAgent = async (req, res) => {
  try {
    const { agentId } = req.body || {};
    if (!agentId || typeof agentId !== 'string') {
      return res.status(400).json({ error: 'agentId is required' });
    }

    const source = await req.prisma.agent.findUnique({ where: { id: agentId } });
    if (!source) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const sourceConfig = parseConfig(source.config);

    let vapiId = null;
    let vapiWarning = null;
    const vapiApiKey = await getVapiKeyForUser(req.prisma, req.user.id);
    if (vapiApiKey && sourceConfig) {
      try {
        vapiService.setApiKey(vapiApiKey);
        const fixedConfig = rewriteToolUrls(sourceConfig) || sourceConfig;
        const vapiAgent = await vapiService.createAgent({
          name: `${source.name} (Imported)`,
          ...fixedConfig
        });
        vapiId = vapiAgent.id;
      } catch (vapiError) {
        console.error('VAPI agent creation failed during import:', vapiError.message);
        vapiWarning = `Agent imported locally but VAPI creation failed: ${vapiError.message}`;
      }
    } else if (!vapiApiKey) {
      vapiWarning = 'VAPI API key not configured. Agent imported locally only.';
    }

    const savedConfig = sourceConfig ? JSON.stringify(rewriteToolUrls(sourceConfig) || sourceConfig) : null;
    const agent = await req.prisma.agent.create({
      data: {
        name: `${source.name} (Imported)`,
        description: source.description,
        agentType: source.agentType,
        vapiId,
        config: savedConfig,
        userId: req.user.id
      }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'agent.import',
      resourceType: 'agent',
      resourceId: agent.id,
      details: { name: agent.name, sourceAgentId: source.id, sourceUserId: source.userId },
      req
    });

    const isOwner = req.user.role === 'OWNER';
    res.status(201).json({
      message: vapiWarning ? (isOwner ? vapiWarning : 'Agent imported') : 'Agent imported successfully',
      vapiWarning: isOwner ? vapiWarning : (vapiWarning ? 'Agent imported' : null),
      agent: { ...agent, config: parseConfig(agent.config) }
    });
  } catch (error) {
    console.error('Import agent error:', error);
    res.status(500).json({ error: 'Failed to import agent' });
  }
};

const deleteAgent = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify ownership
    const existingAgent = await req.prisma.agent.findFirst({
      where: {
        id: id,
        userId: req.user.id
      }
    });

    if (!existingAgent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Delete VAPI agent if exists
    const vapiDelKey = await getVapiKeyForUser(req.prisma, req.user.id);
    if (existingAgent.vapiId && vapiDelKey) {
      try {
        vapiService.setApiKey(vapiDelKey);
        await vapiService.deleteAgent(existingAgent.vapiId);
      } catch (vapiError) {
        console.error('VAPI agent deletion failed:', vapiError);
      }
    }

    await req.prisma.agent.delete({
      where: { id: id }
    });

    logAudit(req.prisma, {
      userId: req.user.id,
      actorId: req.isTeamMember ? req.teamMember.id : req.user.id,
      actorEmail: req.isTeamMember ? req.teamMember.email : req.user.email,
      actorType: req.isTeamMember ? 'team_member' : 'user',
      action: 'agent.delete',
      resourceType: 'agent',
      resourceId: id,
      details: { name: existingAgent.name },
      req
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
      where: { id: id, userId: req.user.id }
    });

    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    if (!agent.vapiId) return res.json({ error: 'Agent has no VAPI ID', agent: { id: agent.id, name: agent.name, vapiId: null } });

    const vapiKey = await getVapiKeyForUser(req.prisma, req.user.id);
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

// ── Public share (voice) ───────────────────────────────────
const crypto = require('crypto');
const { decrypt } = require('../utils/encryption');

const generateShareToken = () => crypto.randomBytes(24).toString('base64url');
const hashIp = (ip) => crypto.createHash('sha256').update(`agentShareIp:${ip || 'unknown'}`).digest('hex').slice(0, 32);

const todayDate = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const getAgentShareUsage = async (prisma, agentId, scope) => {
  const usage = await prisma.agentShareUsage.findUnique({
    where: { agentId_date_scope: { agentId, date: todayDate(), scope } }
  });
  return usage?.count || 0;
};

const incrementAgentShareUsage = async (prisma, agentId, scope) => {
  const date = todayDate();
  const usage = await prisma.agentShareUsage.upsert({
    where: { agentId_date_scope: { agentId, date, scope } },
    create: { agentId, date, scope, count: 1 },
    update: { count: { increment: 1 } }
  });
  return usage.count;
};

// Resolve the Vapi public key for a chatbot/agent owner. Mirrors the logic in
// platformSettingsController.getVapiPublicKey but without `req.user` (the
// caller is the public visitor; we look up the agent owner instead).
const resolveVapiPublicKeyForUser = async (prisma, userId) => {
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { vapiPublicKey: true }
    });
    if (user?.vapiPublicKey) {
      try {
        const dec = decrypt(user.vapiPublicKey);
        if (dec) return dec;
      } catch { /* fall through */ }
    }
  }
  const settings = await prisma.platformSettings.findFirst();
  if (settings?.vapiPublicKey) {
    try {
      const dec = decrypt(settings.vapiPublicKey);
      if (dec) return dec;
    } catch { /* fall through */ }
  }
  return null;
};

const enableAgentShare = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await req.prisma.agent.findFirst({ where: { id, userId: req.user.id } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const token = agent.publicShareToken || generateShareToken();
    const updated = await req.prisma.agent.update({
      where: { id: agent.id },
      data: { publicShareToken: token, publicShareEnabled: true }
    });
    res.json({
      enabled: updated.publicShareEnabled,
      token: updated.publicShareToken,
      dailyLimit: updated.publicShareDailyLimit,
      ipDailyLimit: updated.publicShareIpDailyLimit,
      maxDurationSeconds: updated.publicShareMaxDurationSeconds
    });
  } catch (error) {
    console.error('Enable agent share error:', error);
    res.status(500).json({ error: 'Failed to enable sharing' });
  }
};

const regenerateAgentShareToken = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await req.prisma.agent.findFirst({ where: { id, userId: req.user.id } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    const updated = await req.prisma.agent.update({
      where: { id: agent.id },
      data: { publicShareToken: generateShareToken(), publicShareEnabled: true }
    });
    res.json({ enabled: true, token: updated.publicShareToken });
  } catch (error) {
    console.error('Regenerate agent share token error:', error);
    res.status(500).json({ error: 'Failed to regenerate token' });
  }
};

const disableAgentShare = async (req, res) => {
  try {
    const { id } = req.params;
    const agent = await req.prisma.agent.findFirst({ where: { id, userId: req.user.id } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });
    await req.prisma.agent.update({
      where: { id: agent.id },
      data: { publicShareEnabled: false }
    });
    res.json({ enabled: false });
  } catch (error) {
    console.error('Disable agent share error:', error);
    res.status(500).json({ error: 'Failed to disable sharing' });
  }
};

const updateAgentShareLimits = async (req, res) => {
  try {
    const { id } = req.params;
    const { dailyLimit, ipDailyLimit, maxDurationSeconds } = req.body || {};
    const data = {};
    if (Number.isInteger(dailyLimit) && dailyLimit > 0) data.publicShareDailyLimit = dailyLimit;
    if (Number.isInteger(ipDailyLimit) && ipDailyLimit > 0) data.publicShareIpDailyLimit = ipDailyLimit;
    if (Number.isInteger(maxDurationSeconds) && maxDurationSeconds >= 30 && maxDurationSeconds <= 1800) {
      data.publicShareMaxDurationSeconds = maxDurationSeconds;
    }
    if (!Object.keys(data).length) return res.status(400).json({ error: 'No valid limit fields provided' });

    const agent = await req.prisma.agent.findFirst({ where: { id, userId: req.user.id } });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const updated = await req.prisma.agent.update({ where: { id: agent.id }, data });
    res.json({
      dailyLimit: updated.publicShareDailyLimit,
      ipDailyLimit: updated.publicShareIpDailyLimit,
      maxDurationSeconds: updated.publicShareMaxDurationSeconds
    });
  } catch (error) {
    console.error('Update agent share limits error:', error);
    res.status(500).json({ error: 'Failed to update limits' });
  }
};

const findSharedAgent = async (prisma, id, token) => {
  if (!id || !token) return null;
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) return null;
  if (!agent.publicShareEnabled) return null;
  if (!agent.publicShareToken || agent.publicShareToken !== token) return null;
  return agent;
};

const getPublicAgentInfo = async (req, res) => {
  try {
    const { id, token } = req.params;
    const agent = await findSharedAgent(req.prisma, id, token);
    if (!agent) return res.status(404).json({ error: 'Not found' });
    if (!agent.vapiId) return res.status(422).json({ error: 'Agent is not deployed yet.' });

    const vapiPublicKey = await resolveVapiPublicKeyForUser(req.prisma, agent.userId);
    if (!vapiPublicKey) return res.status(422).json({ error: 'Voice service is not configured.' });

    res.json({
      id: agent.id,
      name: agent.name,
      description: agent.description || '',
      vapiAssistantId: agent.vapiId,
      vapiPublicKey,
      maxDurationSeconds: agent.publicShareMaxDurationSeconds
    });
  } catch (error) {
    console.error('Public agent info error:', error);
    res.status(500).json({ error: 'Failed to load' });
  }
};

const postPublicAgentCallStart = async (req, res) => {
  try {
    const { id, token } = req.params;
    const agent = await findSharedAgent(req.prisma, id, token);
    if (!agent) return res.status(404).json({ error: 'Not found' });

    // Owner credit check — voice is metered per minute. Require a small buffer.
    const owner = await req.prisma.user.findUnique({
      where: { id: agent.userId },
      select: { vapiCredits: true }
    });
    if ((owner?.vapiCredits || 0) < 0.10) {
      return res.status(402).json({ error: 'This shared agent is temporarily unavailable.' });
    }

    const ip = (req.headers['x-forwarded-for']?.toString().split(',')[0].trim()) || req.ip || req.socket.remoteAddress || '';
    const ipScope = hashIp(ip);
    const [totalUsed, ipUsed] = await Promise.all([
      getAgentShareUsage(req.prisma, agent.id, 'all'),
      getAgentShareUsage(req.prisma, agent.id, ipScope)
    ]);
    if (totalUsed >= agent.publicShareDailyLimit) {
      return res.status(429).json({ error: 'Daily call limit reached for this share link.' });
    }
    if (ipUsed >= agent.publicShareIpDailyLimit) {
      return res.status(429).json({ error: 'You have reached the call limit for today.' });
    }

    await Promise.all([
      incrementAgentShareUsage(req.prisma, agent.id, 'all'),
      incrementAgentShareUsage(req.prisma, agent.id, ipScope)
    ]);

    res.json({
      allowed: true,
      maxDurationSeconds: agent.publicShareMaxDurationSeconds,
      // Echo the metadata the client should attach to the Vapi call so the
      // webhook can tag the resulting CallLog as a shared call.
      metadata: { source: 'public_share', agentId: agent.id }
    });
  } catch (error) {
    console.error('Public agent call-start error:', error);
    res.status(500).json({ error: 'Failed to start call' });
  }
};

module.exports = {
  getAgents,
  getAgent,
  createAgent,
  updateAgent,
  duplicateAgent,
  importAgent,
  deleteAgent,
  checkVapiSync,
  enableAgentShare,
  regenerateAgentShareToken,
  disableAgentShare,
  updateAgentShareLimits,
  getPublicAgentInfo,
  postPublicAgentCallStart
};
