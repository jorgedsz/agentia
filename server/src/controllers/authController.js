const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { logAudit } = require('../utils/auditLog');

const generateToken = (userId) => {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

// POST /api/auth/admin/reset-password — owner-only direct password reset.
// Body: { email, newPassword }. Looks up the target user by email and writes
// a fresh bcrypt hash. Audit-logged so the action is traceable.
const adminResetPassword = async (req, res) => {
  try {
    if (req.user?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can reset other users\' passwords' });
    }

    const { email: rawEmail, newPassword } = req.body || {};
    if (!rawEmail || !newPassword) {
      return res.status(400).json({ error: 'email and newPassword are required' });
    }
    if (typeof newPassword !== 'string' || newPassword.length < 6) {
      return res.status(400).json({ error: 'newPassword must be at least 6 characters' });
    }

    const email = String(rawEmail).trim().toLowerCase();
    const target = await req.prisma.user.findUnique({ where: { email } });
    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    const hashed = await bcrypt.hash(newPassword, 10);
    await req.prisma.user.update({
      where: { id: target.id },
      data: { password: hashed }
    });

    try {
      await logAudit(req.prisma, {
        userId: req.user.id,
        action: 'admin_reset_password',
        targetType: 'User',
        targetId: String(target.id),
        details: JSON.stringify({ targetEmail: email })
      });
    } catch (e) {
      console.warn('[adminResetPassword] audit log failed:', e.message);
    }

    return res.json({ success: true, userId: target.id, email });
  } catch (error) {
    console.error('adminResetPassword error:', error.message);
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};

const register = async (req, res) => {
  try {
    const { email: rawEmail, password, name } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const email = String(rawEmail).trim().toLowerCase();

    // Check if user already exists
    const existingUser = await req.prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (default role is USER)
    const user = await req.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'CLIENT'
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        createdAt: true
      }
    });

    // Generate token
    const token = generateToken(user.id);

    res.status(201).json({
      message: 'User registered successfully',
      user,
      token
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { email: rawEmail, password } = req.body;

    if (!rawEmail || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const email = String(rawEmail).trim().toLowerCase();

    // Find user
    const user = await req.prisma.user.findUnique({
      where: { email }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate token
    const token = generateToken(user.id);

    logAudit(req.prisma, {
      userId: user.id,
      actorId: user.id,
      actorEmail: user.email,
      actorType: 'user',
      action: 'auth.login',
      resourceType: 'user',
      resourceId: user.id,
      req
    });

    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        agencyId: user.agencyId
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

const getMe = async (req, res) => {
  try {
    const response = { user: req.user };

    // Include team member info if applicable
    if (req.isTeamMember) {
      response.isTeamMember = true;
      response.teamMember = req.teamMember;
    }

    // Include impersonation info if applicable
    if (req.isImpersonating) {
      response.isImpersonating = true;
      response.originalUser = {
        id: req.originalUserId,
        role: req.originalUserRole
      };
    }

    res.json(response);
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({ error: 'Failed to get user info' });
  }
};

// GET /api/auth/admin/inspect-chatbot?id=<chatbotId> — owner-only diagnostic.
// Surfaces the prompt sections relevant to GHL opportunity creation plus the
// configured ghl_manage_opportunity tool URLs so we can tell whether a given
// chatbot has the post-name-capture trigger (v2) or the first-turn trigger
// (v1) without needing Railway shell access.
const adminInspectChatbot = async (req, res) => {
  try {
    if (req.user?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can inspect chatbots' });
    }
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'id query param required' });

    const bot = await req.prisma.chatbot.findUnique({ where: { id } });
    if (!bot) return res.status(404).json({ error: 'Chatbot not found' });

    let cfg = {};
    try { cfg = JSON.parse(bot.config); } catch {}
    const prompt = cfg.systemPrompt || '';

    const sliceAt = (needle, len = 1500) => {
      const i = prompt.indexOf(needle);
      if (i < 0) return null;
      const end = Math.min(prompt.length, i + len);
      return prompt.slice(i, end);
    };

    const tools = (cfg.tools || cfg.customTools || []).filter(t =>
      (t.name || '').startsWith('ghl_manage_opportunity')
    ).map(t => ({
      name: t.name,
      url: t.url,
      requiredBody: t.body?.required,
      bodyKeys: Object.keys(t.body?.properties || {})
    }));

    return res.json({
      id: bot.id,
      name: bot.name,
      isArchived: bot.isArchived,
      promptLength: prompt.length,
      hasV2Trigger: prompt.includes('Apenas tengas el nombre'),
      hasV1Paso0: /## PASO 0 — REGISTRAR CONVERSACIÓN INICIADA/.test(prompt),
      reglasGhlBlock: sliceAt('REGLAS DE GHL', 800),
      paso0Block: sliceAt('## PASO 0', 1200),
      paso1TailContext: sliceAt('Si después de insistir', 600),
      ghlOpportunityTools: tools,
      n8nWorkflowId: bot.n8nWorkflowId
    });
  } catch (error) {
    console.error('adminInspectChatbot error:', error.message);
    return res.status(500).json({ error: 'Failed to inspect chatbot' });
  }
};

// POST /api/auth/admin/resync-chatbot-workflows — owner-only.
// Walks every non-archived chatbot with an n8nWorkflowId and re-pushes its
// workflow definition. Used to retrofit changes to the workflow builder
// (e.g. switching memory from RAM to Postgres-backed) onto existing bots.
const adminResyncChatbotWorkflows = async (req, res) => {
  try {
    if (req.user?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only owners can resync workflows' });
    }
    const n8nService = require('../services/n8nService');
    const { getN8nConfig } = require('../utils/getN8nConfig');
    const { decrypt } = require('../utils/encryption');

    const n8nConfig = await getN8nConfig(req.prisma);
    if (!n8nConfig) return res.status(422).json({ error: 'n8n is not configured' });
    n8nService.setConfig(n8nConfig.url, n8nConfig.apiKey, {
      pgMemoryCredentialId: n8nConfig.pgMemoryCredentialId,
      chatbotGlobalRules: n8nConfig.chatbotGlobalRules,
      chatbotContextWindowLength: n8nConfig.chatbotContextWindowLength
    });

    const chatbots = await req.prisma.chatbot.findMany({
      where: { isArchived: false, n8nWorkflowId: { not: null } }
    });

    const serverBaseUrl = (process.env.APP_URL || '').replace(/\/$/, '') || null;
    const results = [];
    for (const bot of chatbots) {
      try {
        let cfg;
        try { cfg = JSON.parse(bot.config); } catch { cfg = {}; }
        await n8nService.updateWorkflow(bot.n8nWorkflowId, {
          ...bot,
          outputUrl: bot.outputUrl ? decrypt(bot.outputUrl) : null,
          config: cfg,
          serverBaseUrl
        });
        await n8nService.activateWorkflow(bot.n8nWorkflowId);
        results.push({ id: bot.id, name: bot.name, status: 'ok' });
      } catch (err) {
        results.push({ id: bot.id, name: bot.name, status: 'failed', error: err.message });
      }
    }

    const ok = results.filter(r => r.status === 'ok').length;
    const failed = results.length - ok;
    return res.json({ total: results.length, ok, failed, results });
  } catch (error) {
    console.error('adminResyncChatbotWorkflows error:', error.message);
    return res.status(500).json({ error: 'Failed to resync workflows' });
  }
};

module.exports = {
  register,
  login,
  getMe,
  adminResetPassword,
  adminInspectChatbot,
  adminResyncChatbotWorkflows
};
