const crypto = require('crypto');

// PUBLIC — Get client info + call logs by portal token
const getByToken = async (req, res) => {
  try {
    const { token } = req.params;

    const user = await req.prisma.user.findUnique({
      where: { portalToken: token },
      select: {
        id: true,
        name: true,
        email: true,
        companyName: true,
        createdAt: true,
      },
    });

    if (!user) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    const callLogs = await req.prisma.callLog.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        vapiCallId: true,
        type: true,
        durationSeconds: true,
        outcome: true,
        summary: true,
        recordingUrl: true,
        customerNumber: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Also fetch chatbot message sessions grouped by sessionId
    const messageSessions = await req.prisma.chatbotMessage.groupBy({
      by: ['sessionId', 'chatbotName', 'contactName'],
      where: { userId: user.id, isTest: false },
      _count: true,
      _max: { createdAt: true },
      _min: { createdAt: true },
      orderBy: { _max: { createdAt: 'desc' } },
    });

    res.json({
      client: user,
      sessions: callLogs,
      messageSessions: messageSessions.map(s => ({
        sessionId: s.sessionId,
        chatbotName: s.chatbotName,
        contactName: s.contactName,
        messageCount: s._count,
        lastMessageAt: s._max.createdAt,
        firstMessageAt: s._min.createdAt,
      })),
    });
  } catch (error) {
    console.error('[Portal] getByToken error:', error);
    res.status(500).json({ error: 'Failed to load portal' });
  }
};

// PUBLIC — Get full session detail by portal token + session ID
const getSessionByToken = async (req, res) => {
  try {
    const { token, sessionId } = req.params;

    const user = await req.prisma.user.findUnique({
      where: { portalToken: token },
      select: { id: true, name: true, email: true, companyName: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    const callLog = await req.prisma.callLog.findUnique({
      where: { id: parseInt(sessionId) },
    });

    if (!callLog || callLog.userId !== user.id) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      client: user,
      session: {
        id: callLog.id,
        vapiCallId: callLog.vapiCallId,
        type: callLog.type,
        durationSeconds: callLog.durationSeconds,
        outcome: callLog.outcome,
        summary: callLog.summary,
        recordingUrl: callLog.recordingUrl,
        transcript: callLog.transcript,
        structuredData: callLog.structuredData,
        customerNumber: callLog.customerNumber,
        createdAt: callLog.createdAt,
      },
    });
  } catch (error) {
    console.error('[Portal] getSessionByToken error:', error);
    res.status(500).json({ error: 'Failed to load session' });
  }
};

// PUBLIC — Get chatbot messages for a session by portal token
const getMessagesByToken = async (req, res) => {
  try {
    const { token, sessionId } = req.params;

    const user = await req.prisma.user.findUnique({
      where: { portalToken: token },
      select: { id: true, name: true, email: true, companyName: true },
    });

    if (!user) {
      return res.status(404).json({ error: 'Portal not found' });
    }

    const messages = await req.prisma.chatbotMessage.findMany({
      where: { userId: user.id, sessionId, isTest: false },
      orderBy: { createdAt: 'asc' },
    });

    if (messages.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    res.json({
      client: user,
      messages,
      sessionId,
      chatbotName: messages[0].chatbotName,
      contactName: messages[0].contactName,
    });
  } catch (error) {
    console.error('[Portal] getMessagesByToken error:', error);
    res.status(500).json({ error: 'Failed to load messages' });
  }
};

// AUTH REQUIRED — Generate or retrieve portal token for a client
const generateToken = async (req, res) => {
  try {
    const clientId = parseInt(req.params.id);

    // Verify target is a CLIENT user
    const client = await req.prisma.user.findUnique({
      where: { id: clientId },
      select: { id: true, role: true, agencyId: true, portalToken: true },
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    // Authorization: OWNER can generate for anyone, AGENCY only for their own clients
    const isOwner = req.user.role === 'OWNER';
    const isAgency = req.user.role === 'AGENCY' && client.agencyId === req.user.id;
    if (!isOwner && !isAgency) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    // If token already exists, return it
    if (client.portalToken) {
      return res.json({ portalToken: client.portalToken });
    }

    // Generate new 128-bit random token
    const portalToken = crypto.randomBytes(16).toString('hex');

    await req.prisma.user.update({
      where: { id: clientId },
      data: { portalToken },
    });

    res.json({ portalToken });
  } catch (error) {
    console.error('[Portal] generateToken error:', error);
    res.status(500).json({ error: 'Failed to generate portal token' });
  }
};

module.exports = { getByToken, getSessionByToken, getMessagesByToken, generateToken };
