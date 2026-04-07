const vapiService = require('../services/vapiService');
const { getVapiKeyForUser } = require('../utils/getApiKeys');

const SERVER_URL = process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:5000';

function buildTrainingPrompt(agent, config) {
  const lang = config.transcriberLanguage || 'en';
  const configSummary = [
    `Name: ${agent.name}`,
    `First Message: ${config.firstMessage || '(not set)'}`,
    `System Prompt (preview): ${config.systemPrompt ? config.systemPrompt.substring(0, 500) + '...' : '(not set)'}`,
  ].join('\n');

  if (lang === 'es' || lang === 'multi') {
    return `Eres un asistente de entrenamiento. El usuario quiere modificar la configuración de su agente de voz a través de esta llamada.

CONFIGURACIÓN ACTUAL DEL AGENTE:
${configSummary}

CAMPOS QUE SE PUEDEN MODIFICAR:
- firstMessage: El mensaje inicial que dice el agente al contestar
- systemPrompt: Las instrucciones del sistema del agente
- name: El nombre del agente

REGLAS:
1. Cuando el usuario pida un cambio, CONFIRMA lo que entendiste antes de llamar la herramienta propose_change
2. Después de registrar un cambio, ENSAYA el nuevo comportamiento (por ejemplo, si cambian el firstMessage, dilo en voz alta)
3. Habla siempre en español
4. Sé conciso y profesional
5. Si el usuario pide algo que no puedes cambiar, explícale qué campos están disponibles`;
  }

  return `You are a training assistant. The user wants to modify their voice agent's configuration through this call.

CURRENT AGENT CONFIGURATION:
${configSummary}

FIELDS THAT CAN BE MODIFIED:
- firstMessage: The initial message the agent says when answering
- systemPrompt: The agent's system instructions
- name: The agent's name

RULES:
1. When the user requests a change, CONFIRM what you understood before calling the propose_change tool
2. After recording a change, REHEARSE the new behavior (e.g., if they change firstMessage, say it out loud)
3. Always speak in English
4. Be concise and professional
5. If the user asks for something you can't change, explain which fields are available`;
}

function buildVapiConfig(agent, config, sessionToken) {
  const lang = config.transcriberLanguage || 'en';
  const toolCallUrl = `${SERVER_URL}/api/training/propose-change?sessionToken=${sessionToken}`;

  return {
    model: {
      provider: config.modelProvider || 'openai',
      model: config.modelName || 'gpt-4o',
      messages: [
        { role: 'system', content: buildTrainingPrompt(agent, config) }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'propose_change',
            description: 'Record a proposed change to the agent configuration',
            parameters: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  enum: ['firstMessage', 'systemPrompt', 'name'],
                  description: 'The agent config field to change'
                },
                newValue: {
                  type: 'string',
                  description: 'The new value for the field'
                },
                description: {
                  type: 'string',
                  description: 'Brief description of what this change does'
                }
              },
              required: ['field', 'newValue', 'description']
            }
          },
          server: { url: toolCallUrl }
        }
      ]
    },
    voice: config.voiceProvider === '11labs'
      ? { provider: '11labs', voiceId: config.voiceId || 'sarah' }
      : { provider: config.voiceProvider || 'vapi', voiceId: config.voiceId || 'sarah' },
    firstMessage: lang === 'es' || lang === 'multi'
      ? 'Hola, estoy en modo entrenamiento. ¿Qué cambios quieres hacer a tu agente?'
      : "Hi, I'm in training mode. What changes would you like to make to your agent?",
    transcriber: {
      provider: config.transcriberProvider || 'deepgram',
      model: 'nova-2',
      language: lang,
    },
  };
}

// POST /api/training/sessions
const createSession = async (req, res) => {
  try {
    const { agentId } = req.body;
    if (!agentId) return res.status(400).json({ error: 'agentId is required' });

    const agent = await req.prisma.agent.findFirst({
      where: { id: agentId, userId: req.user.id }
    });
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    const config = agent.config ? JSON.parse(agent.config) : {};

    const session = await req.prisma.trainingSession.create({
      data: {
        agentId,
        userId: req.user.id,
        proposedChanges: '[]',
      },
    });

    const vapiConfig = buildVapiConfig(agent, config, session.sessionToken);

    res.json({ session, vapiConfig });
  } catch (error) {
    console.error('[Training] createSession error:', error);
    res.status(500).json({ error: 'Failed to create training session' });
  }
};

// POST /api/training/propose-change?sessionToken=X (public — VAPI calls this)
const proposeChange = async (req, res) => {
  try {
    const { sessionToken } = req.query;
    if (!sessionToken) return res.status(400).json({ error: 'sessionToken required' });

    const session = await req.prisma.trainingSession.findUnique({
      where: { sessionToken },
      include: { agent: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'in_progress') {
      return res.status(400).json({ error: 'Session is not in progress' });
    }

    // Extract tool call data from VAPI format
    const toolCall = req.body.message?.toolCalls?.[0];
    if (!toolCall) return res.status(400).json({ error: 'No tool call found' });

    const args = typeof toolCall.function?.arguments === 'string'
      ? JSON.parse(toolCall.function.arguments)
      : toolCall.function?.arguments;

    const { field, newValue, description } = args;
    if (!field || !newValue) {
      return res.json({
        results: [{ toolCallId: toolCall.id, result: 'Error: field and newValue are required' }]
      });
    }

    // Look up old value from agent config
    const agentConfig = session.agent.config ? JSON.parse(session.agent.config) : {};
    const fieldMap = {
      firstMessage: agentConfig.firstMessage,
      systemPrompt: agentConfig.systemPrompt,
      name: session.agent.name,
    };
    const oldValue = fieldMap[field] || '';

    // Append to proposed changes
    const changes = JSON.parse(session.proposedChanges || '[]');
    changes.push({
      field,
      oldValue,
      newValue,
      description: description || '',
      timestamp: new Date().toISOString(),
    });

    await req.prisma.trainingSession.update({
      where: { id: session.id },
      data: { proposedChanges: JSON.stringify(changes) },
    });

    res.json({
      results: [{
        toolCallId: toolCall.id,
        result: `Change recorded: ${field} will be updated. ${description || ''}`
      }]
    });
  } catch (error) {
    console.error('[Training] proposeChange error:', error);
    res.status(500).json({ error: 'Failed to record change' });
  }
};

// GET /api/training/sessions?agentId=X
const listSessions = async (req, res) => {
  try {
    const { agentId } = req.query;
    if (!agentId) return res.status(400).json({ error: 'agentId query param required' });

    const sessions = await req.prisma.trainingSession.findMany({
      where: { agentId, userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, status: true, proposedChanges: true, createdAt: true },
    });

    res.json(sessions.map(s => ({
      ...s,
      changesCount: JSON.parse(s.proposedChanges || '[]').length,
      proposedChanges: undefined,
    })));
  } catch (error) {
    console.error('[Training] listSessions error:', error);
    res.status(500).json({ error: 'Failed to list sessions' });
  }
};

// GET /api/training/sessions/:id
const getSession = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const session = await req.prisma.trainingSession.findUnique({
      where: { id },
      include: { agent: { select: { id: true, name: true, userId: true } } },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });

    res.json({ ...session, proposedChanges: JSON.parse(session.proposedChanges || '[]') });
  } catch (error) {
    console.error('[Training] getSession error:', error);
    res.status(500).json({ error: 'Failed to get session' });
  }
};

// POST /api/training/sessions/:id/complete
const completeSession = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { transcript } = req.body;

    const session = await req.prisma.trainingSession.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Session is not in progress' });

    const updated = await req.prisma.trainingSession.update({
      where: { id },
      data: { status: 'completed', transcript: transcript || null },
    });

    res.json({ ...updated, proposedChanges: JSON.parse(updated.proposedChanges || '[]') });
  } catch (error) {
    console.error('[Training] completeSession error:', error);
    res.status(500).json({ error: 'Failed to complete session' });
  }
};

// POST /api/training/sessions/:id/accept — Apply changes to agent + sync to VAPI
const acceptSession = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const session = await req.prisma.trainingSession.findUnique({
      where: { id },
      include: { agent: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (session.status !== 'completed') return res.status(400).json({ error: 'Session must be completed first' });

    const changes = JSON.parse(session.proposedChanges || '[]');
    if (changes.length === 0) return res.status(400).json({ error: 'No changes to apply' });

    // Apply changes to agent config
    const config = session.agent.config ? JSON.parse(session.agent.config) : {};
    let agentName = session.agent.name;

    for (const change of changes) {
      if (change.field === 'firstMessage') config.firstMessage = change.newValue;
      else if (change.field === 'systemPrompt') config.systemPrompt = change.newValue;
      else if (change.field === 'name') agentName = change.newValue;
    }

    // Update agent in DB
    await req.prisma.agent.update({
      where: { id: session.agentId },
      data: { name: agentName, config: JSON.stringify(config) },
    });

    // Sync to VAPI if connected
    if (session.agent.vapiId) {
      try {
        const vapiKey = await getVapiKeyForUser(req.prisma, session.userId);
        if (vapiKey) {
          vapiService.setApiKey(vapiKey);
          await vapiService.updateAgent(session.agent.vapiId, { name: agentName, ...config });
        }
      } catch (vapiErr) {
        console.error('[Training] VAPI sync failed:', vapiErr.message);
      }
    }

    await req.prisma.trainingSession.update({
      where: { id },
      data: { status: 'accepted' },
    });

    res.json({ ok: true, applied: changes.length });
  } catch (error) {
    console.error('[Training] acceptSession error:', error);
    res.status(500).json({ error: 'Failed to accept session' });
  }
};

// POST /api/training/sessions/:id/reject
const rejectSession = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const session = await req.prisma.trainingSession.findUnique({ where: { id } });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (session.status !== 'completed') return res.status(400).json({ error: 'Session must be completed first' });

    await req.prisma.trainingSession.update({
      where: { id },
      data: { status: 'rejected' },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('[Training] rejectSession error:', error);
    res.status(500).json({ error: 'Failed to reject session' });
  }
};

module.exports = { createSession, proposeChange, listSessions, getSession, completeSession, acceptSession, rejectSession };
