require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
const promptGeneratorRoutes = require('./routes/promptGenerator');
const platformSettingsRoutes = require('./routes/platformSettings');
const brandingRoutes = require('./routes/branding');

const app = express();
const prisma = new PrismaClient();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(express.json());

// Make prisma available in routes
app.use((req, res, next) => {
  req.prisma = prisma;
  next();
});

// Routes
app.use('/api/auth', authRoutes);
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
app.use('/api/prompt-generator', promptGeneratorRoutes);
app.use('/api/platform-settings', platformSettingsRoutes);
app.use('/api/branding', brandingRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// One-time seed endpoint (remove after use)
const bcrypt = require('bcrypt');
const { execSync } = require('child_process');

// Sync database schema
app.get('/api/sync-db-xyz123', async (req, res) => {
  try {
    const output = execSync('npx prisma db push --accept-data-loss', {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: { ...process.env }
    });
    res.json({ message: 'Database synced!', output });
  } catch (error) {
    res.status(500).json({ error: error.message, stderr: error.stderr });
  }
});

app.get('/api/seed-owner-xyz123', async (req, res) => {
  try {
    const existing = await prisma.user.findFirst({ where: { role: 'OWNER' } });
    if (existing) {
      return res.json({ message: 'Owner already exists', email: existing.email });
    }
    const hashedPassword = await bcrypt.hash('test123', 10);
    const owner = await prisma.user.create({
      data: {
        email: 'jorgedsz1504@gmail.com',
        password: hashedPassword,
        name: 'Jorge',
        role: 'OWNER'
      }
    });
    res.json({ message: 'Owner created!', email: owner.email });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
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
