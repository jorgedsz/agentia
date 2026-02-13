require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const agentRoutes = require('./routes/agents');
const userRoutes = require('./routes/users');
const twilioRoutes = require('./routes/twilio');
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
const { generalLimiter, authLimiter } = require('./middleware/rateLimiter');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false
}));
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());
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
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
