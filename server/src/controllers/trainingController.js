const vapiService = require('../services/vapiService');
const openaiService = require('../services/openaiService');
const { getVapiKeyForUser, getApiKeys } = require('../utils/getApiKeys');

const SERVER_URL = process.env.APP_URL || process.env.RAILWAY_PUBLIC_DOMAIN
  ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
  : 'http://localhost:5000';

function buildTrainingAddendum(agent, config) {
  const lang = config.transcriberLanguage || 'en';

  if (lang === 'es' || lang === 'multi') {
    return `

---
MODO ENTRENAMIENTO (oculto) — el usuario es tu entrenador, no un cliente.

Reglas:
- Escuchá. Antes de aceptar un cambio, repetí con tus palabras lo que pidió ("Entendí que…"). Si es ambiguo, preguntá UNA cosa específica.
- Roleplay: cuando pida "actuá como X" o "simulá Y", asumí el rol totalmente hasta que diga "pausa", "stop" o "fuera de personaje".
- Solo podés editar firstMessage, systemPrompt, name. Si pide otra cosa, decílo y ofrecé lo más cercano.
- Tono conversacional, respuestas cortas (1-3 oraciones). Nada de monólogos.

Usá propose_change cuando: (a) te pida un cambio explícito, o (b) critique algo concreto editable. Antes de llamarla, confirmá en voz alta el cambio. Una llamada por cambio. Después, ensayá el nuevo comportamiento y pedí feedback ("¿así?").`;
  }

  return `

---
TRAINING MODE (hidden) — the user is your trainer, not a customer.

Rules:
- Listen. Before accepting a change, restate it in your own words ("So you want…"). If ambiguous, ask ONE specific question.
- Roleplay: when they say "act as X" or "simulate Y", commit fully to the role until they say "pause", "stop", or "out of character".
- You can only edit firstMessage, systemPrompt, name. If they ask for anything else, say so and offer the closest match.
- Conversational tone, short answers (1-3 sentences). No monologues.

Use propose_change when: (a) explicit change request, or (b) concrete editable critique. Confirm verbally first. One call per change. After, rehearse the new behavior and ask "does that sound right?".`;
}

// Post-call analysis: send the full transcript + current agent config to a
// strong LLM and ask it to propose well-formed changes. Captures implicit
// feedback the in-call agent missed and rewrites prompts cleanly instead of
// echoing the trainer verbatim.
async function analyzeTranscript({ prisma, userId, agent, transcript, config, inCallChanges }) {
  const { openaiApiKey } = await getApiKeys(prisma);
  if (!openaiApiKey || !transcript || transcript.trim().length < 50) return [];

  const lang = config.transcriberLanguage || 'en';
  const isEs = lang === 'es' || lang === 'multi';

  const systemPrompt = isEs
    ? `Sos un coach experto en prompts de agentes de IA de voz. Te paso la transcripción de una sesión de entrenamiento entre un humano (entrenador) y un agente. Tu tarea: identificar mejoras concretas al prompt del agente y proponerlas como ediciones limpias.

REGLAS DURAS:
- Solo proponés cambios a estos campos: firstMessage, systemPrompt, name.
- "newValue" SIEMPRE es el texto COMPLETO del campo después del cambio, no un diff. Para systemPrompt es el prompt entero reescrito.
- Si el entrenador no pidió/sugirió cambios claros, devolvé un array vacío. NO inventes mejoras.
- Si el entrenador critica algo pero no es traducible a una edición concreta del prompt, omitilo.
- Las propuestas tienen que respetar y preservar la estructura existente del prompt (tono, idioma, secciones). Mejorás, no reescribís de cero a menos que el entrenador lo pida.

Devolvé SOLO JSON con esta forma:
{
  "changes": [
    { "field": "firstMessage|systemPrompt|name", "newValue": "...", "description": "razón corta del cambio (1 oración)" }
  ]
}`
    : `You are an expert coach for AI voice-agent prompts. I'm giving you a training-session transcript between a human (trainer) and an agent. Your task: identify concrete improvements to the agent's prompt and propose them as clean edits.

HARD RULES:
- Only propose changes to these fields: firstMessage, systemPrompt, name.
- "newValue" is ALWAYS the FULL field text after the change, never a diff. For systemPrompt, it's the entire rewritten prompt.
- If the trainer didn't ask for or suggest clear changes, return an empty array. Don't invent improvements.
- If the trainer critiques something that doesn't translate to a concrete prompt edit, skip it.
- Proposals must respect and preserve the existing prompt structure (tone, language, sections). You're improving, not rewriting from scratch — unless the trainer explicitly asked for a full rewrite.

Return ONLY JSON in this shape:
{
  "changes": [
    { "field": "firstMessage|systemPrompt|name", "newValue": "...", "description": "short reason for the change (1 sentence)" }
  ]
}`;

  const context = `CURRENT AGENT CONFIG:
- name: ${agent.name}
- firstMessage: ${config.firstMessage || '(empty)'}
- systemPrompt:
"""
${config.systemPrompt || '(empty)'}
"""

IN-CALL CHANGES the agent already proposed during the session (these are noisy — feel free to refine, merge, or drop them):
${JSON.stringify(inCallChanges || [], null, 2)}

TRAINING TRANSCRIPT:
${transcript}`;

  try {
    const resp = await openaiService.chatCompletion({
      prisma,
      apiKey: openaiApiKey,
      userId,
      // gpt-4o gives noticeably better prompt-engineering proposals than 4o-mini.
      // Analysis runs once per training session, so the extra cost is negligible.
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 2000,
    });
    const raw = resp.choices?.[0]?.message?.content?.trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    const changes = Array.isArray(parsed.changes) ? parsed.changes : [];
    return changes
      .filter(c => c && ['firstMessage', 'systemPrompt', 'name'].includes(c.field) && typeof c.newValue === 'string' && c.newValue.trim())
      .map(c => ({
        field: c.field,
        oldValue: c.field === 'name' ? agent.name : (config[c.field] || ''),
        newValue: c.newValue.trim(),
        description: (c.description || '').toString().trim(),
        source: 'analysis',
        timestamp: new Date().toISOString(),
      }));
  } catch (err) {
    console.error('[Training] analyzeTranscript failed:', err.message);
    return [];
  }
}

function buildVapiConfig(agent, config, sessionToken) {
  const toolCallUrl = `${SERVER_URL}/api/training/propose-change?sessionToken=${sessionToken}`;

  // Use the agent's real system prompt + append training instructions
  const basePrompt = config.systemPrompt || '';
  const trainingPrompt = basePrompt + buildTrainingAddendum(agent, config);

  return {
    // Tighter response timing for training — trainers want snappy
    // back-and-forth, not the polished pacing of a customer call.
    responseDelaySeconds: 0.2,
    silenceTimeoutSeconds: 20,
    numWordsToInterruptAssistant: 2,
    model: {
      provider: config.modelProvider || 'openai',
      model: config.modelName || 'gpt-4o',
      maxTokens: 300,
      temperature: 0.5,
      messages: [
        { role: 'system', content: trainingPrompt }
      ],
      tools: [
        {
          type: 'function',
          function: {
            name: 'propose_change',
            description: 'Record a proposed edit to your own configuration. Call this ONLY after you have verbally confirmed the change with the trainer. Each call records one change to one field. The trainer reviews and accepts/rejects all changes at the end of the session — do not call this preemptively.',
            parameters: {
              type: 'object',
              properties: {
                field: {
                  type: 'string',
                  enum: ['firstMessage', 'systemPrompt', 'name'],
                  description: 'Which field to edit: firstMessage (short spoken greeting), systemPrompt (long behavior instructions), or name.'
                },
                newValue: {
                  type: 'string',
                  description: 'The COMPLETE new value for the field after the edit — not a diff or just the changed sentence. For systemPrompt, include the full prompt text preserving existing sections you are not changing.'
                },
                description: {
                  type: 'string',
                  description: 'One short sentence stating what the change does and why — e.g. "Shorten greeting and remove company tagline."'
                }
              },
              required: ['field', 'newValue', 'description']
            }
          },
          server: { url: toolCallUrl }
        }
      ]
    },
    // Use the exact same voice config as the agent (reuse vapiService builder)
    voice: vapiService.buildVoiceConfig(config),
    // Use the agent's actual first message
    firstMessage: config.firstMessage || `Hello! I'm ${agent.name}. How can I help you today?`,
    // Use the exact same transcriber config as the agent
    transcriber: vapiService.buildTranscriberConfig(config),
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

    const session = await req.prisma.trainingSession.findUnique({
      where: { id },
      include: { agent: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (session.status !== 'in_progress') return res.status(400).json({ error: 'Session is not in progress' });

    const inCallChanges = JSON.parse(session.proposedChanges || '[]').map(c => ({ ...c, source: 'in_call' }));
    const config = session.agent.config ? JSON.parse(session.agent.config) : {};

    // Run the LLM analysis on the transcript to extract higher-quality proposals
    // than the in-call agent typically produces. Falls back to just the in-call
    // changes if analysis fails or returns nothing.
    const analyzed = await analyzeTranscript({
      prisma: req.prisma,
      userId: req.user.id,
      agent: session.agent,
      transcript,
      config,
      inCallChanges,
    });

    // Merge: if analysis produced a change for a field, it supersedes the in-call
    // one (post-call has more context and the full transcript). Otherwise keep
    // the in-call change.
    const byField = new Map();
    for (const c of inCallChanges) byField.set(c.field, c);
    for (const c of analyzed) byField.set(c.field, c);
    const finalChanges = Array.from(byField.values());

    const updated = await req.prisma.trainingSession.update({
      where: { id },
      data: {
        status: 'completed',
        transcript: transcript || null,
        proposedChanges: JSON.stringify(finalChanges),
      },
    });

    res.json({ ...updated, proposedChanges: finalChanges });
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

    // Prefer edited changes from the client (the reviewer may have tweaked the
    // proposed newValue before accepting); fall back to the stored proposals.
    // Only allow the three trainable fields.
    const ALLOWED = ['firstMessage', 'systemPrompt', 'name'];
    let changes = Array.isArray(req.body?.changes) && req.body.changes.length
      ? req.body.changes.filter(c => c && ALLOWED.includes(c.field) && typeof c.newValue === 'string')
      : JSON.parse(session.proposedChanges || '[]');
    if (changes.length === 0) return res.status(400).json({ error: 'No changes to apply' });

    // Snapshot current config/name BEFORE applying, so this session can be reverted
    const previousConfig = session.agent.config || JSON.stringify({});
    const previousName = session.agent.name;

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
      data: {
        status: 'accepted',
        proposedChanges: JSON.stringify(changes), // persist the (possibly edited) applied changes
        previousConfig,
        previousName,
      },
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

// POST /api/training/sessions/:id/revert
// Restores the agent config/name snapshot taken when this accepted session was applied.
const revertSession = async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const session = await req.prisma.trainingSession.findUnique({
      where: { id },
      include: { agent: true },
    });
    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.userId !== req.user.id) return res.status(403).json({ error: 'Not authorized' });
    if (session.status !== 'accepted') return res.status(400).json({ error: 'Only accepted sessions can be reverted' });
    if (!session.previousConfig) return res.status(400).json({ error: 'No snapshot available to revert to' });

    const config = JSON.parse(session.previousConfig);
    const agentName = session.previousName || session.agent.name;

    await req.prisma.agent.update({
      where: { id: session.agentId },
      data: { name: agentName, config: session.previousConfig },
    });

    // Sync the restored config back to VAPI if connected
    if (session.agent.vapiId) {
      try {
        const vapiKey = await getVapiKeyForUser(req.prisma, session.userId);
        if (vapiKey) {
          vapiService.setApiKey(vapiKey);
          await vapiService.updateAgent(session.agent.vapiId, { name: agentName, ...config });
        }
      } catch (vapiErr) {
        console.error('[Training] VAPI sync (revert) failed:', vapiErr.message);
      }
    }

    await req.prisma.trainingSession.update({
      where: { id },
      data: { status: 'reverted' },
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('[Training] revertSession error:', error);
    res.status(500).json({ error: 'Failed to revert session' });
  }
};

module.exports = { createSession, proposeChange, listSessions, getSession, completeSession, acceptSession, rejectSession, revertSession };
