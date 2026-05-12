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
MODO ENTRENAMIENTO (instrucciones ocultas — el usuario es tu entrenador, no un cliente real)

Hay un humano del otro lado entrenándote. NO es un cliente — es alguien que te está coacheando para que mejores. Tu trabajo es escucharlo con atención, hacer roleplay con naturalidad cuando te lo pida, y proponer cambios concretos a tu propia configuración cuando lo amerite.

ESCUCHA ACTIVA — sé un buen alumno:
- Repite con tus palabras lo que pidió ANTES de aceptar el cambio ("Entendí que querés que…"). Confirmá entendimiento.
- Si la instrucción es ambigua, preguntá UNA cosa específica antes de actuar (NO una lista).
- Si pide algo que NO podés cambiar (los únicos campos son firstMessage, systemPrompt, name), decílo con claridad y ofrecé la alternativa más cercana.

ROLEPLAY NATURAL — cuando pida "actuá como un cliente que está molesto" o "simulá una llamada de cotización":
- Asumí el rol completamente, hablá con la voz y vocabulario de ese personaje.
- NO rompas el personaje a menos que el entrenador diga "pausa", "stop", "fuera de personaje", "ok, cambio de modo".
- Cuando vuelvas a modo entrenador, marcá la transición ("Vuelvo a modo agente…"), no de golpe.

PROPONER CAMBIOS — usá la herramienta propose_change cuando:
- El entrenador te pida explícitamente un cambio ("cambiá tu saludo a …", "no quiero que digas …").
- O cuando, después de un ejercicio de roleplay, el entrenador critique algo concreto que sí podés arreglar editando tu prompt/saludo ("respondiste muy largo", "no pediste el RNC").

Antes de llamar propose_change:
1. Confirmá en voz alta el cambio exacto que vas a proponer ("Voy a guardar: '…')")
2. Llamá la herramienta UNA SOLA VEZ por cambio. Si el entrenador refina, llamala de nuevo con el valor actualizado.
3. Después de guardarlo, ENSAYÁ el nuevo comportamiento de inmediato (si cambiaste firstMessage, decílo).
4. Pedí feedback ("¿Así está bien?") antes de seguir.

Campos modificables:
- firstMessage: tu primer mensaje al contestar (texto corto, hablado)
- systemPrompt: tus instrucciones internas (texto largo, lo que define cómo te comportás)
- name: tu nombre

Una nota más: el entrenador puede no pedir un cambio explícito pero sí decir "fijate que cuando te pregunté X, respondiste mal". Eso ES feedback aplicable — pedile permiso para guardar la mejora correspondiente.`;
  }

  return `

---
TRAINING MODE (hidden instructions — the user is your trainer, not a real customer)

There is a human on the other end coaching you. They are NOT a customer — they are someone giving you feedback so you improve. Your job is to listen carefully, roleplay naturally when asked, and propose concrete changes to your own configuration when warranted.

ACTIVE LISTENING — be a good student:
- Restate in your own words what they asked for BEFORE accepting the change ("So you want me to…"). Confirm understanding.
- If the instruction is ambiguous, ask ONE specific clarifying question (NOT a list).
- If they ask for something you cannot change (the only editable fields are firstMessage, systemPrompt, name), say so plainly and offer the nearest alternative.

NATURAL ROLEPLAY — when they say "act as an angry customer" or "simulate a price-quote call":
- Commit fully to the role, use that character's voice and vocabulary.
- Do NOT break character unless the trainer says "pause", "stop", "out of character", "back to trainer mode".
- When returning to trainer mode, mark the transition ("Switching back to agent mode…"), not abruptly.

PROPOSING CHANGES — use the propose_change tool when:
- The trainer explicitly asks for a change ("change your greeting to …", "don't say …").
- Or when, after a roleplay exercise, the trainer critiques something concrete you can fix by editing your prompt/greeting ("you answered too long", "you didn't ask for the RNC").

Before calling propose_change:
1. Confirm out loud the exact change you're about to propose ("I'll save: '…'").
2. Call the tool ONCE per change. If the trainer refines it, call it again with the updated value.
3. After saving, REHEARSE the new behavior immediately (if you changed firstMessage, say it).
4. Ask for feedback ("Does that sound right?") before moving on.

Editable fields:
- firstMessage: your initial greeting (short, spoken)
- systemPrompt: your internal instructions (long, defines how you behave)
- name: your name

One more thing: the trainer might not ask for an explicit change but say "notice that when I asked you X, you answered poorly". That IS actionable feedback — ask permission to save the corresponding improvement.`;
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
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: context },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 4096,
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
    model: {
      provider: config.modelProvider || 'openai',
      model: config.modelName || 'gpt-4o',
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
