const OpenAI = require('openai');
const { getApiKeys } = require('../utils/getApiKeys');

/**
 * GET /api/wa-projects
 * List all projects for the authenticated user
 */
const listProjects = async (req, res) => {
  try {
    const { q, status, sortBy } = req.query;
    const where = { userId: req.user.id };

    if (status && status !== 'all') {
      where.estado = status;
    }

    if (q) {
      where.OR = [
        { nombre: { contains: q, mode: 'insensitive' } },
        { cliente: { contains: q, mode: 'insensitive' } },
        { responsable: { contains: q, mode: 'insensitive' } }
      ];
    }

    let orderBy = { ultimaActividad: 'desc' };
    if (sortBy === 'nombre') orderBy = { nombre: 'asc' };
    if (sortBy === 'alertas') orderBy = { alertasCount: 'desc' };
    if (sortBy === 'mensajes') orderBy = { totalMensajes: 'desc' };

    const projects = await req.prisma.waProject.findMany({
      where,
      orderBy,
      include: {
        _count: { select: { alerts: { where: { resuelta: false } } } }
      }
    });

    res.json({ projects });
  } catch (error) {
    console.error('Error listing projects:', error);
    res.status(500).json({ error: 'Failed to list projects' });
  }
};

/**
 * GET /api/wa-projects/stats
 * Dashboard aggregate stats
 */
const getProjectStats = async (req, res) => {
  try {
    const userId = req.user.id;

    const [active, atRisk, unresolvedAlerts, msgsToday] = await Promise.all([
      req.prisma.waProject.count({ where: { userId, estado: 'activo' } }),
      req.prisma.waProject.count({ where: { userId, estado: 'en_riesgo' } }),
      req.prisma.waProjectAlert.count({
        where: { project: { userId }, resuelta: false }
      }),
      req.prisma.waProjectMessage.count({
        where: {
          project: { userId },
          timestamp: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      })
    ]);

    res.json({ active, atRisk, unresolvedAlerts, msgsToday });
  } catch (error) {
    console.error('Error getting project stats:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
};

/**
 * GET /api/wa-projects/:id
 * Single project detail
 */
const getProject = async (req, res) => {
  try {
    const project = await req.prisma.waProject.findFirst({
      where: { id: parseInt(req.params.id), userId: req.user.id },
      include: {
        _count: { select: { messages: true, alerts: { where: { resuelta: false } } } }
      }
    });

    if (!project) return res.status(404).json({ error: 'Project not found' });
    res.json({ project });
  } catch (error) {
    console.error('Error getting project:', error);
    res.status(500).json({ error: 'Failed to get project' });
  }
};

/**
 * PUT /api/wa-projects/:id
 * Update project fields
 */
const updateProject = async (req, res) => {
  try {
    const { estado, prioridad, responsable, cliente, descripcionEmpresa, objetivoProyecto, colorEmoji, projectType } = req.body;

    const existing = await req.prisma.waProject.findFirst({
      where: { id: parseInt(req.params.id), userId: req.user.id }
    });
    if (!existing) return res.status(404).json({ error: 'Project not found' });

    const data = {};
    if (estado !== undefined) data.estado = estado;
    if (prioridad !== undefined) data.prioridad = prioridad;
    if (responsable !== undefined) data.responsable = responsable;
    if (cliente !== undefined) data.cliente = cliente;
    if (descripcionEmpresa !== undefined) data.descripcionEmpresa = descripcionEmpresa;
    if (objetivoProyecto !== undefined) data.objetivoProyecto = objetivoProyecto;
    if (colorEmoji !== undefined) data.colorEmoji = colorEmoji;
    if (projectType !== undefined) data.projectType = projectType;

    const project = await req.prisma.waProject.update({
      where: { id: parseInt(req.params.id) },
      data
    });

    res.json({ project });
  } catch (error) {
    console.error('Error updating project:', error);
    res.status(500).json({ error: 'Failed to update project' });
  }
};

/**
 * GET /api/wa-projects/:id/messages
 * Paginated messages for a project
 */
const getProjectMessages = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const limit = parseInt(req.query.limit) || 50;
    const before = req.query.before ? parseInt(req.query.before) : undefined;

    // Verify ownership
    const project = await req.prisma.waProject.findFirst({
      where: { id: projectId, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const where = { projectId };
    if (before) {
      where.id = { lt: before };
    }

    const messages = await req.prisma.waProjectMessage.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: limit
    });

    res.json({ messages: messages.reverse() });
  } catch (error) {
    console.error('Error getting messages:', error);
    res.status(500).json({ error: 'Failed to get messages' });
  }
};

/**
 * GET /api/wa-projects/:id/alerts
 * Alerts for a specific project
 */
const getProjectAlerts = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);

    const project = await req.prisma.waProject.findFirst({
      where: { id: projectId, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    const alerts = await req.prisma.waProjectAlert.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      include: { message: { select: { contenido: true, sender: true, timestamp: true } } }
    });

    res.json({ alerts });
  } catch (error) {
    console.error('Error getting alerts:', error);
    res.status(500).json({ error: 'Failed to get alerts' });
  }
};

/**
 * POST /api/wa-projects/:id/chat
 * PM Agent chat — SSE streaming endpoint
 */
const chatWithPMAgent = async (req, res) => {
  try {
    const projectId = parseInt(req.params.id);
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    // Verify ownership and load project context
    const project = await req.prisma.waProject.findFirst({
      where: { id: projectId, userId: req.user.id }
    });
    if (!project) return res.status(404).json({ error: 'Project not found' });

    // Fetch recent messages and alerts for context
    const [recentMessages, unresolvedAlerts] = await Promise.all([
      req.prisma.waProjectMessage.findMany({
        where: { projectId },
        orderBy: { timestamp: 'desc' },
        take: 30
      }),
      req.prisma.waProjectAlert.findMany({
        where: { projectId, resuelta: false },
        orderBy: { createdAt: 'desc' },
        take: 10
      })
    ]);

    // Build context summary
    const msgContext = recentMessages.reverse().map(m =>
      `[${m.timestamp.toISOString().slice(0, 16)}] ${m.esDelCliente ? 'CLIENT' : 'TEAM'} (${m.sender}): ${m.contenido}`
    ).join('\n');

    const alertContext = unresolvedAlerts.length > 0
      ? unresolvedAlerts.map(a => `- [${a.nivel.toUpperCase()}] ${a.tipo}: ${a.descripcion}`).join('\n')
      : 'No active alerts.';

    const systemPrompt = `You are a PM (Project Manager) AI assistant for the project "${project.nombre}".

Project Info:
- Name: ${project.nombre}
- Client: ${project.cliente || 'Not set'}
- Status: ${project.estado}
- Priority: ${project.prioridad}
- Responsible: ${project.responsable || 'Not assigned'}
- Total messages: ${project.totalMensajes}
- Description: ${project.descripcionEmpresa || 'Not set'}
- Objective: ${project.objetivoProyecto || 'Not set'}

Active Alerts:
${alertContext}

Recent Messages (last 30):
${msgContext || 'No messages yet.'}

Your role:
- Analyze project health and client sentiment
- Summarize recent activity and highlight issues
- Suggest action items based on alerts and message patterns
- Answer questions about the project in a concise, actionable way
- Respond in the same language the user writes to you`;

    // Get OpenAI key
    const { openaiApiKey } = await getApiKeys(req.prisma);
    if (!openaiApiKey) {
      return res.status(500).json({ error: 'OpenAI API key not configured' });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const openai = new OpenAI({ apiKey: openaiApiKey });

    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages.map(m => ({ role: m.role, content: m.content }))
      ],
      stream: true,
      temperature: 0.7,
      max_tokens: 1024
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        res.write(`data: ${JSON.stringify({ content })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error) {
    console.error('PM Agent chat error:', error);
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: 'Failed to process chat' });
    }
  }
};

module.exports = {
  listProjects,
  getProjectStats,
  getProject,
  updateProject,
  getProjectMessages,
  getProjectAlerts,
  chatWithPMAgent
};
