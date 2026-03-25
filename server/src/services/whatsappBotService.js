/**
 * WhatsApp Bot Service
 * Processes incoming WA group messages: auto-creates projects, stores messages, detects alerts.
 */

// In-memory cache for project lookups: Map<"userId:chatId", projectId>
const projectCache = new Map();

// Alert detection rules — keyword lists per category
const ALERT_RULES = {
  cancelacion: {
    keywords: ['cancelar', 'cancelo', 'cancela', 'cancelación', 'cancelacion', 'cancel', 'canceling', 'cancelled'],
    nivel: 'critico',
    descripcion: 'Posible cancelación detectada'
  },
  reembolso: {
    keywords: ['reembolso', 'devolucion', 'devolución', 'refund', 'devolver dinero', 'money back'],
    nivel: 'critico',
    descripcion: 'Solicitud de reembolso detectada'
  },
  enojo: {
    keywords: ['molesto', 'enojado', 'furioso', 'indignado', 'inaceptable', 'pésimo', 'pesimo', 'horrible', 'angry', 'upset', 'frustrated', 'unacceptable'],
    nivel: 'alto',
    descripcion: 'Cliente posiblemente molesto'
  },
  urgente: {
    keywords: ['urgente', 'emergencia', 'asap', 'inmediato', 'lo antes posible', 'urgent', 'emergency', 'critical', 'ahora mismo'],
    nivel: 'alto',
    descripcion: 'Mensaje marcado como urgente'
  },
  entrega: {
    keywords: ['entrega', 'envío', 'envio', 'llegó', 'llego', 'no llegó', 'no llego', 'delivery', 'shipping', 'retraso', 'delay', 'tarde'],
    nivel: 'medio',
    descripcion: 'Tema de entrega detectado'
  },
  pago: {
    keywords: ['pago', 'factura', 'cobro', 'payment', 'invoice', 'billing', 'deuda', 'pendiente de pago'],
    nivel: 'medio',
    descripcion: 'Tema de pago detectado'
  }
};

/**
 * Clean group name — strip common suffixes, emojis prefixes, etc.
 */
function cleanGroupName(raw) {
  if (!raw) return 'Sin nombre';
  let name = raw.trim();
  // Remove trailing emojis
  name = name.replace(/[\u{1F600}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]+$/u, '').trim();
  // Remove common suffixes like " - ORAIA", " | Team", etc.
  name = name.replace(/\s*[-|]\s*(ORAIA|Team|Equipo|Bot|Grupo)\s*$/i, '').trim();
  return name || raw.trim();
}

/**
 * Check if sender matches any team keyword
 */
function isTeamMember(senderName, teamKeywords) {
  if (!senderName || !teamKeywords || teamKeywords.length === 0) return false;
  const lower = senderName.toLowerCase();
  return teamKeywords.some(kw => lower.includes(kw.toLowerCase()));
}

/**
 * Find or create a WaProject for a given group chat
 */
async function findOrCreateProject(prisma, userId, chatId, groupName) {
  const cacheKey = `${userId}:${chatId}`;

  if (projectCache.has(cacheKey)) {
    return projectCache.get(cacheKey);
  }

  let project = await prisma.waProject.findUnique({
    where: { userId_whatsappChatId: { userId, whatsappChatId: chatId } }
  });

  if (!project) {
    const cleaned = cleanGroupName(groupName);
    project = await prisma.waProject.create({
      data: {
        nombre: cleaned,
        whatsappChatId: chatId,
        userId,
        ultimaActividad: new Date()
      }
    });
  }

  projectCache.set(cacheKey, project.id);
  return project.id;
}

/**
 * Detect alerts in message text
 */
function detectAlerts(text, customRules) {
  const rules = customRules || ALERT_RULES;
  const lower = text.toLowerCase();
  const detected = [];

  for (const [tipo, rule] of Object.entries(rules)) {
    const match = rule.keywords.some(kw => lower.includes(kw));
    if (match) {
      detected.push({
        tipo,
        nivel: rule.nivel,
        descripcion: rule.descripcion
      });
    }
  }

  return detected;
}

/**
 * Update project aggregate stats (message count, alert count, last message, last activity)
 */
async function updateProjectStats(prisma, projectId, messageText) {
  const [msgCount, alertCount] = await Promise.all([
    prisma.waProjectMessage.count({ where: { projectId } }),
    prisma.waProjectAlert.count({ where: { projectId, resuelta: false } })
  ]);

  const preview = messageText.length > 120 ? messageText.substring(0, 120) + '...' : messageText;

  await prisma.waProject.update({
    where: { id: projectId },
    data: {
      totalMensajes: msgCount,
      alertasCount: alertCount,
      ultimoMensaje: preview,
      ultimaActividad: new Date()
    }
  });
}

/**
 * Main entry point — called from index.js message_create handler
 */
async function handleBotMessage(prisma, io, userId, sessionId, waMsg) {
  try {
    // Guard: only group messages
    const isGroup = waMsg.from?.endsWith('@g.us') || waMsg.to?.endsWith('@g.us');
    if (!isGroup) return;

    // Guard: skip media-only messages
    if (waMsg.hasMedia && !waMsg.body) return;

    // Guard: skip very short messages
    const body = (waMsg.body || '').trim();
    if (body.length < 2) return;

    // Load bot config for this user
    let config = await prisma.waBotConfig.findUnique({ where: { userId } });
    if (!config) {
      // Auto-create default config
      config = await prisma.waBotConfig.create({
        data: { userId }
      });
    }

    if (!config.enabled) return;

    // Parse config fields
    const blockedGroups = JSON.parse(config.blockedGroups || '[]');
    const teamKeywords = JSON.parse(config.teamKeywords || '[]');

    // Determine group chat ID and name
    const chatId = waMsg.from?.endsWith('@g.us') ? waMsg.from : waMsg.to;

    // Guard: blocked group
    if (blockedGroups.includes(chatId)) return;

    // Get group name (from chat metadata if available)
    let groupName = chatId;
    try {
      // waMsg._data may contain notifyName or chat info
      if (waMsg._data?.notifyName) {
        groupName = waMsg._data.notifyName;
      }
    } catch (_) { /* ignore */ }

    // Find or create project
    const projectId = await findOrCreateProject(prisma, userId, chatId, groupName);

    // Determine sender
    const sender = waMsg.author || waMsg.from || 'unknown';
    const senderName = waMsg._data?.notifyName || sender;
    const isFromTeam = waMsg.fromMe || isTeamMember(senderName, teamKeywords);

    // Store message
    const timestamp = waMsg.timestamp
      ? new Date(waMsg.timestamp * 1000)
      : new Date();

    const message = await prisma.waProjectMessage.create({
      data: {
        projectId,
        sender: senderName,
        contenido: body,
        timestamp,
        esDelCliente: !isFromTeam,
        fuente: 'whatsapp'
      }
    });

    // Detect alerts (only for client messages)
    let alerts = [];
    if (!isFromTeam) {
      const detected = detectAlerts(body);
      if (detected.length > 0) {
        alerts = await Promise.all(
          detected.map(alert =>
            prisma.waProjectAlert.create({
              data: {
                projectId,
                messageId: message.id,
                tipo: alert.tipo,
                nivel: alert.nivel,
                descripcion: alert.descripcion
              }
            })
          )
        );
      }
    }

    // Update project stats
    await updateProjectStats(prisma, projectId, body);

    // Emit real-time update
    io.emit('whatsapp:project-update', {
      userId,
      sessionId,
      projectId,
      message: {
        id: message.id,
        sender: senderName,
        contenido: body,
        timestamp,
        esDelCliente: !isFromTeam
      },
      alerts: alerts.map(a => ({ id: a.id, tipo: a.tipo, nivel: a.nivel, descripcion: a.descripcion }))
    });

  } catch (error) {
    console.error('[WA Bot] Error processing message:', error);
  }
}

module.exports = {
  handleBotMessage,
  cleanGroupName,
  isTeamMember,
  findOrCreateProject,
  detectAlerts,
  updateProjectStats,
  ALERT_RULES
};
