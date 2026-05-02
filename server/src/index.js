require('dotenv').config();
const express = require('express');
const http = require('http');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const { Server: SocketIOServer } = require('socket.io');
const { Client: WAClient, LocalAuth } = require('whatsapp-web.js');

const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const userRoutes = require('./routes/users');
const twilioRoutes = require('./routes/twilio');
const telephonyRoutes = require('./routes/telephony');
const phoneNumberRoutes = require('./routes/phoneNumbers');
const teamMemberRoutes = require('./routes/teamMembers');
const callRoutes = require('./routes/calls');
const creditsRoutes = require('./routes/credits');
const ratesRoutes = require('./routes/rates');
const ghlRoutes = require('./routes/ghl');
const ghlController = require('./controllers/ghlController');
const calendarRoutes = require('./routes/calendar');
const promptGeneratorRoutes = require('./routes/promptGenerator');
const platformSettingsRoutes = require('./routes/platformSettings');
const accountSettingsRoutes = require('./routes/accountSettings');
const brandingRoutes = require('./routes/branding');
const voiceRoutes = require('./routes/voices');
const chatRoutes = require('./routes/chat');
const ticketRoutes = require('./routes/tickets');
const callTriggerRoutes = require('./routes/callTrigger');
const vapiWebhookRoutes = require('./routes/vapiWebhook');
const vapiKeyPoolRoutes = require('./routes/vapiKeyPool');
const recordingRoutes = require('./routes/recordings');
const complianceRoutes = require('./routes/compliance');
const pricingRoutes = require('./routes/pricing');
const chatbotRoutes = require('./routes/chatbots');
const reportRoutes = require('./routes/reports');
const chatbotMessageRoutes = require('./routes/chatbotMessages');
const paymentRoutes = require('./routes/payments');
const toolRoutes = require('./routes/tools');
const chatbotCallRoutes = require('./routes/chatbotCall');
const chatbotGhlRoutes = require('./routes/chatbotGhl');
const chatbotSqlRoutes = require('./routes/chatbotSql');
const credentialsRoutes = require('./routes/credentials');
const callbackRoutes = require('./routes/callbacks');
const callbackController = require('./controllers/callbackController');
const followUpRoutes = require('./routes/followUps');
const followUpController = require('./controllers/followUpController');
const chatbotFollowUpRoutes = require('./routes/chatbotFollowUps');
const chatbotFollowUpController = require('./controllers/chatbotFollowUpController');
const demoRoutes = require('./routes/demo');
const portalRoutes = require('./routes/portal');
const googleWorkspaceRoutes = require('./routes/googleWorkspace');
const trainingRoutes = require('./routes/training');
const whopRoutes = require('./routes/whop');
const recurringPaymentRoutes = require('./routes/recurringPayments');
const recurringPaymentController = require('./controllers/recurringPaymentController');
const { startCalendarMetaRefresher } = require('./services/calendarMetaRefresher');
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');

const app = express();
// Railway (and most PaaS) sit behind a load balancer that sets
// X-Forwarded-For. Trust the first proxy so express-rate-limit and
// req.ip resolve client addresses correctly.
app.set('trust proxy', 1);
const server = http.createServer(app);
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// ── Socket.IO ──────────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL || 'http://localhost:5173',
  process.env.WEBSITE_URL || 'https://swordaisolutions.com'
].filter(Boolean);

const io = new SocketIOServer(server, {
  cors: { origin: allowedOrigins, credentials: true }
});

// ── WhatsApp session store ─────────────────────────────────
// Map<sessionId, { client, status, qr }>
const waSessions = new Map();

function createWhatsAppClient(sessionId) {
  if (waSessions.has(sessionId)) return waSessions.get(sessionId);

  const entry = { client: null, status: 'initializing', qr: null };
  waSessions.set(sessionId, entry);

  const client = new WAClient({
    authStrategy: new LocalAuth({ clientId: sessionId }),
    puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] }
  });

  entry.client = client;

  client.on('qr', (qr) => {
    entry.qr = qr;
    entry.status = 'qr';
    io.emit('whatsapp:qr', { sessionId, qr });
  });

  client.on('ready', () => {
    entry.status = 'ready';
    entry.qr = null;
    io.emit('whatsapp:ready', { sessionId });
    console.log(`[WA] Session ${sessionId} ready`);
  });

  client.on('authenticated', () => {
    entry.status = 'authenticated';
    io.emit('whatsapp:authenticated', { sessionId });
  });

  client.on('auth_failure', () => {
    entry.status = 'auth_failure';
    io.emit('whatsapp:auth_failure', { sessionId });
  });

  client.on('disconnected', (reason) => {
    entry.status = 'disconnected';
    io.emit('whatsapp:disconnected', { sessionId, reason });
    waSessions.delete(sessionId);
  });

  // Forward every message (sent & received) to connected clients
  client.on('message_create', (msg) => {
    // Only forward group messages
    if (!msg.from.endsWith('@g.us') && !msg.to?.endsWith('@g.us')) return;
    const groupId = msg.from.endsWith('@g.us') ? msg.from : msg.to;
    io.emit('whatsapp:message', {
      sessionId,
      groupId,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        from: msg.from,
        fromMe: msg.fromMe,
        timestamp: msg.timestamp,
        author: msg.author || null
      }
    });
  });

  client.initialize();
  return entry;
}

const authMiddleware = require('./middleware/authMiddleware');

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  frameguard: false // handled manually below for selective iframe embedding
}));

// Allow iframe embedding from the marketing website
app.use((req, res, next) => {
  const websiteUrl = process.env.WEBSITE_URL || 'https://swordaisolutions.com';
  res.setHeader('Content-Security-Policy', `frame-ancestors 'self' ${websiteUrl}`);
  next();
});

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));

// Whop webhook needs raw body BEFORE express.json() parses it
app.use('/api/whop/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use('/api/', generalLimiter);

// Make prisma available in routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/agents', agentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/twilio', twilioRoutes);
app.use('/api/telephony', telephonyRoutes);
app.use('/api/phone-numbers', phoneNumberRoutes);
app.use('/api/team-members', teamMemberRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/rates', ratesRoutes);
app.use('/api/ghl', ghlRoutes);
// GHL OAuth callback at /api/oauth/callback (matches redirect URI configured in GHL marketplace)
app.get('/api/oauth/callback', ghlController.oauthCallback);
app.use('/api/calendar', calendarRoutes);
app.use('/api/prompt-generator', promptGeneratorRoutes);
app.use('/api/platform-settings', platformSettingsRoutes);
app.use('/api/account-settings', accountSettingsRoutes);
app.use('/api/branding', brandingRoutes);
app.use('/api/voices', voiceRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/call/trigger', callTriggerRoutes);
app.use('/api/vapi', vapiWebhookRoutes);
app.use('/api/vapi-key-pool', vapiKeyPoolRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/compliance', complianceRoutes);
app.use('/api/pricing', pricingRoutes);
app.use('/api/chatbots', chatbotRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/chatbot-messages', chatbotMessageRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/tools', toolRoutes);
app.use('/api/chatbot-call', chatbotCallRoutes);
app.use('/api/chatbot-ghl', chatbotGhlRoutes);
app.use('/api/chatbot-sql', chatbotSqlRoutes);
app.use('/api/credentials', credentialsRoutes);
app.use('/api/callbacks', callbackRoutes);
app.use('/api/follow-ups', followUpRoutes);
app.use('/api/chatbot-follow-ups', chatbotFollowUpRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/google-workspace', googleWorkspaceRoutes);
app.use('/api/training', trainingRoutes);
app.use('/api/whop', whopRoutes);
app.use('/api/recurring-payments', recurringPaymentRoutes);

// ── WhatsApp API endpoints ─────────────────────────────────

// Create / start a session
app.post('/api/whatsapp/sessions', authMiddleware, (req, res) => {
  const sessionId = req.body.sessionId || `wa-${req.user.id}-${Date.now()}`;
  const entry = createWhatsAppClient(sessionId);
  res.json({ sessionId, status: entry.status });
});

// List active sessions
app.get('/api/whatsapp/sessions', authMiddleware, (req, res) => {
  const sessions = [];
  for (const [id, entry] of waSessions) {
    sessions.push({ sessionId: id, status: entry.status });
  }
  res.json({ sessions });
});

// Get QR for a session
app.get('/api/whatsapp/sessions/:sessionId/qr', authMiddleware, (req, res) => {
  const entry = waSessions.get(req.params.sessionId);
  if (!entry) return res.status(404).json({ error: 'Session not found' });
  res.json({ qr: entry.qr, status: entry.status });
});

// Delete / destroy a session
app.delete('/api/whatsapp/sessions/:sessionId', authMiddleware, async (req, res) => {
  const entry = waSessions.get(req.params.sessionId);
  if (!entry) return res.status(404).json({ error: 'Session not found' });
  try { await entry.client.destroy(); } catch (_) { /* ignore */ }
  waSessions.delete(req.params.sessionId);
  res.json({ ok: true });
});

// List groups for a session
app.get('/api/whatsapp/sessions/:sessionId/groups', authMiddleware, async (req, res) => {
  const entry = waSessions.get(req.params.sessionId);
  if (!entry || entry.status !== 'ready') {
    return res.status(400).json({ error: 'Session not ready' });
  }
  try {
    const chats = await entry.client.getChats();
    const groups = chats
      .filter(c => c.isGroup)
      .map(c => ({ id: c.id._serialized, name: c.name, participantCount: c.participants?.length || 0 }));
    res.json({ groups });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get messages for a group
app.get('/api/whatsapp/sessions/:sessionId/groups/:groupId/messages', authMiddleware, async (req, res) => {
  const entry = waSessions.get(req.params.sessionId);
  if (!entry || entry.status !== 'ready') {
    return res.status(400).json({ error: 'Session not ready' });
  }
  try {
    const chat = await entry.client.getChatById(req.params.groupId);
    const limit = parseInt(req.query.limit) || 50;
    const msgs = await chat.fetchMessages({ limit });
    const messages = msgs.map(m => ({
      id: m.id._serialized,
      body: m.body,
      from: m.from,
      fromMe: m.fromMe,
      timestamp: m.timestamp,
      author: m.author || null
    }));
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Send a message to a group
app.post('/api/whatsapp/sessions/:sessionId/groups/:groupId/messages', authMiddleware, async (req, res) => {
  const entry = waSessions.get(req.params.sessionId);
  if (!entry || entry.status !== 'ready') {
    return res.status(400).json({ error: 'Session not ready' });
  }
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'body is required' });
  try {
    const sent = await entry.client.sendMessage(req.params.groupId, body);
    res.json({
      message: {
        id: sent.id._serialized,
        body: sent.body,
        from: sent.from,
        fromMe: true,
        timestamp: sent.timestamp,
        author: null
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch DWY groups for a session (groups with "DWY" in name)
app.get('/api/whatsapp/sessions/:sessionId/dwy-groups', authMiddleware, async (req, res) => {
  const entry = waSessions.get(req.params.sessionId);
  if (!entry || entry.status !== 'ready') {
    return res.status(400).json({ error: 'Session not ready' });
  }
  try {
    const chats = await entry.client.getChats();
    const dwyChats = chats.filter(c => c.isGroup && c.name && c.name.toUpperCase().includes('DWY'));

    // Look up existing WaProject records for these chats
    const chatIds = dwyChats.map(c => c.id._serialized);
    const existingProjects = await prisma.waProject.findMany({
      where: { whatsappChatId: { in: chatIds } },
      include: { client: { select: { id: true, name: true, email: true } } }
    });
    const projectMap = {};
    existingProjects.forEach(p => { projectMap[p.whatsappChatId] = p; });

    const groups = dwyChats.map(c => {
      const chatId = c.id._serialized;
      const project = projectMap[chatId];
      return {
        id: chatId,
        name: c.name,
        participantCount: c.participants?.length || 0,
        projectId: project?.id || null,
        clientId: project?.clientId || null,
        clientName: project?.client?.name || project?.client?.email || null
      };
    });

    res.json({ groups });
  } catch (err) {
    console.error('[DWY groups] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Link a WhatsApp group to a client (user)
app.post('/api/whatsapp/link-group', authMiddleware, async (req, res) => {
  const { whatsappChatId, groupName, clientId } = req.body;
  if (!whatsappChatId || !groupName) {
    return res.status(400).json({ error: 'whatsappChatId and groupName are required' });
  }
  try {
    const project = await prisma.waProject.upsert({
      where: { whatsappChatId },
      create: {
        whatsappChatId,
        nombre: groupName,
        clientId: clientId || null
      },
      update: {
        clientId: clientId || null,
        nombre: groupName
      },
      include: { client: { select: { id: true, name: true, email: true } } }
    });
    res.json({ project });
  } catch (err) {
    console.error('[Link group] Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), appUrl: process.env.APP_URL || 'NOT SET' });
});

// Serve frontend static files
const clientDist = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDist));

// SPA catch-all: serve index.html for any non-API route
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Graceful shutdown
const messageBuffer = require('./services/messageBuffer');
const { handleBufferFlush } = require('./controllers/chatbotController');

function gracefulShutdown(signal) {
  console.log(`[Server] ${signal} received, flushing message buffers...`);
  messageBuffer.clearAll(handleBufferFlush);
  prisma.$disconnect().then(() => process.exit(0));
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  callbackController.startScheduler(prisma);
  followUpController.startScheduler(prisma);
  chatbotFollowUpController.startScheduler(prisma);
  recurringPaymentController.startScheduler(prisma);
  startCalendarMetaRefresher(prisma);
});
