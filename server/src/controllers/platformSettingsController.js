const { encrypt, decrypt, mask } = require('../utils/encryption');

const getSettings = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can access platform settings' });
    }

    const settings = await req.prisma.platformSettings.findFirst();

    if (!settings) {
      return res.json({ vapiApiKey: '', openaiApiKey: '', anthropicApiKey: '', vapiPublicKey: '', elevenLabsApiKey: '', slackWebhookUrl: '', accountWebhookUrl: '', recurringPaymentWebhookUrl: '', n8nUrl: '', n8nApiKey: '', n8nPostgresMemoryCredentialId: '', chatbotGlobalRules: '', chatbotContextWindowLength: 10, hasVapi: false, hasOpenai: false, hasAnthropic: false, hasVapiPublicKey: false, hasElevenLabs: false, hasSlackWebhook: false, hasAccountWebhook: false, hasRecurringPaymentWebhook: false, hasN8nUrl: false, hasN8nApiKey: false });
    }

    const decryptedVapi = settings.vapiApiKey ? decrypt(settings.vapiApiKey) : '';
    const decryptedOpenai = settings.openaiApiKey ? decrypt(settings.openaiApiKey) : '';
    const decryptedAnthropic = settings.anthropicApiKey ? decrypt(settings.anthropicApiKey) : '';
    const decryptedVapiPublic = settings.vapiPublicKey ? decrypt(settings.vapiPublicKey) : '';
    const decryptedElevenLabs = settings.elevenLabsApiKey ? decrypt(settings.elevenLabsApiKey) : '';
    const decryptedSlackWebhook = settings.slackWebhookUrl ? decrypt(settings.slackWebhookUrl) : '';
    const decryptedAccountWebhook = settings.accountWebhookUrl ? decrypt(settings.accountWebhookUrl) : '';
    const decryptedRecurringWebhook = settings.recurringPaymentWebhookUrl ? decrypt(settings.recurringPaymentWebhookUrl) : '';
    const decryptedN8nUrl = settings.n8nUrl ? decrypt(settings.n8nUrl) : '';
    const decryptedN8nApiKey = settings.n8nApiKey ? decrypt(settings.n8nApiKey) : '';

    res.json({
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      openaiApiKey: decryptedOpenai ? mask(decryptedOpenai, 4) : '',
      anthropicApiKey: decryptedAnthropic ? mask(decryptedAnthropic, 4) : '',
      vapiPublicKey: decryptedVapiPublic ? mask(decryptedVapiPublic, 4) : '',
      elevenLabsApiKey: decryptedElevenLabs ? mask(decryptedElevenLabs, 4) : '',
      slackWebhookUrl: decryptedSlackWebhook ? mask(decryptedSlackWebhook, 4) : '',
      accountWebhookUrl: decryptedAccountWebhook ? mask(decryptedAccountWebhook, 4) : '',
      recurringPaymentWebhookUrl: decryptedRecurringWebhook ? mask(decryptedRecurringWebhook, 4) : '',
      n8nUrl: decryptedN8nUrl ? mask(decryptedN8nUrl, 4) : '',
      n8nApiKey: decryptedN8nApiKey ? mask(decryptedN8nApiKey, 4) : '',
      n8nPostgresMemoryCredentialId: settings.n8nPostgresMemoryCredentialId || '',
      chatbotGlobalRules: settings.chatbotGlobalRules || '',
      chatbotContextWindowLength: settings.chatbotContextWindowLength || 10,
      hasVapi: !!decryptedVapi,
      hasOpenai: !!decryptedOpenai,
      hasAnthropic: !!decryptedAnthropic,
      hasVapiPublicKey: !!decryptedVapiPublic,
      hasElevenLabs: !!decryptedElevenLabs,
      hasSlackWebhook: !!decryptedSlackWebhook,
      hasAccountWebhook: !!decryptedAccountWebhook,
      hasRecurringPaymentWebhook: !!decryptedRecurringWebhook,
      hasN8nUrl: !!decryptedN8nUrl,
      hasN8nApiKey: !!decryptedN8nApiKey
    });
  } catch (error) {
    console.error('Get platform settings error:', error);
    res.status(500).json({ error: 'Failed to fetch platform settings' });
  }
};

const updateSettings = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can update platform settings' });
    }

    const { vapiApiKey, openaiApiKey, anthropicApiKey, vapiPublicKey, elevenLabsApiKey, slackWebhookUrl, accountWebhookUrl, recurringPaymentWebhookUrl, n8nUrl, n8nApiKey, n8nPostgresMemoryCredentialId, chatbotGlobalRules, chatbotContextWindowLength } = req.body;

    const existing = await req.prisma.platformSettings.findFirst();

    const data = {};
    if (vapiApiKey !== undefined) {
      data.vapiApiKey = vapiApiKey ? encrypt(vapiApiKey) : null;
    }
    if (openaiApiKey !== undefined) {
      data.openaiApiKey = openaiApiKey ? encrypt(openaiApiKey) : null;
    }
    if (anthropicApiKey !== undefined) {
      data.anthropicApiKey = anthropicApiKey ? encrypt(anthropicApiKey) : null;
    }
    if (vapiPublicKey !== undefined) {
      data.vapiPublicKey = vapiPublicKey ? encrypt(vapiPublicKey) : null;
    }
    if (elevenLabsApiKey !== undefined) {
      data.elevenLabsApiKey = elevenLabsApiKey ? encrypt(elevenLabsApiKey) : null;
    }
    if (slackWebhookUrl !== undefined) {
      data.slackWebhookUrl = slackWebhookUrl ? encrypt(slackWebhookUrl) : null;
    }
    if (accountWebhookUrl !== undefined) {
      data.accountWebhookUrl = accountWebhookUrl ? encrypt(accountWebhookUrl) : null;
    }
    if (recurringPaymentWebhookUrl !== undefined) {
      data.recurringPaymentWebhookUrl = recurringPaymentWebhookUrl ? encrypt(recurringPaymentWebhookUrl) : null;
    }
    if (n8nUrl !== undefined) {
      data.n8nUrl = n8nUrl ? encrypt(n8nUrl) : null;
    }
    if (n8nApiKey !== undefined) {
      data.n8nApiKey = n8nApiKey ? encrypt(n8nApiKey) : null;
    }
    if (n8nPostgresMemoryCredentialId !== undefined) {
      const trimmed = typeof n8nPostgresMemoryCredentialId === 'string' ? n8nPostgresMemoryCredentialId.trim() : '';
      data.n8nPostgresMemoryCredentialId = trimmed || null;
    }
    if (chatbotGlobalRules !== undefined) {
      data.chatbotGlobalRules = typeof chatbotGlobalRules === 'string' && chatbotGlobalRules.trim()
        ? chatbotGlobalRules
        : null;
    }
    if (chatbotContextWindowLength !== undefined) {
      const n = parseInt(chatbotContextWindowLength, 10);
      if (Number.isFinite(n) && n >= 1 && n <= 200) {
        data.chatbotContextWindowLength = n;
      }
    }

    let settings;
    if (existing) {
      settings = await req.prisma.platformSettings.update({
        where: { id: existing.id },
        data
      });
    } else {
      settings = await req.prisma.platformSettings.create({ data });
    }

    const decryptedVapi = settings.vapiApiKey ? decrypt(settings.vapiApiKey) : '';
    const decryptedOpenai = settings.openaiApiKey ? decrypt(settings.openaiApiKey) : '';
    const decryptedAnthropic = settings.anthropicApiKey ? decrypt(settings.anthropicApiKey) : '';
    const decryptedVapiPublic = settings.vapiPublicKey ? decrypt(settings.vapiPublicKey) : '';
    const decryptedElevenLabs = settings.elevenLabsApiKey ? decrypt(settings.elevenLabsApiKey) : '';
    const decryptedSlackWebhook = settings.slackWebhookUrl ? decrypt(settings.slackWebhookUrl) : '';
    const decryptedAccountWebhook = settings.accountWebhookUrl ? decrypt(settings.accountWebhookUrl) : '';
    const decryptedRecurringWebhook = settings.recurringPaymentWebhookUrl ? decrypt(settings.recurringPaymentWebhookUrl) : '';
    const decryptedN8nUrl = settings.n8nUrl ? decrypt(settings.n8nUrl) : '';
    const decryptedN8nApiKey = settings.n8nApiKey ? decrypt(settings.n8nApiKey) : '';

    res.json({
      message: 'Platform settings updated',
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      openaiApiKey: decryptedOpenai ? mask(decryptedOpenai, 4) : '',
      anthropicApiKey: decryptedAnthropic ? mask(decryptedAnthropic, 4) : '',
      vapiPublicKey: decryptedVapiPublic ? mask(decryptedVapiPublic, 4) : '',
      elevenLabsApiKey: decryptedElevenLabs ? mask(decryptedElevenLabs, 4) : '',
      slackWebhookUrl: decryptedSlackWebhook ? mask(decryptedSlackWebhook, 4) : '',
      accountWebhookUrl: decryptedAccountWebhook ? mask(decryptedAccountWebhook, 4) : '',
      recurringPaymentWebhookUrl: decryptedRecurringWebhook ? mask(decryptedRecurringWebhook, 4) : '',
      n8nUrl: decryptedN8nUrl ? mask(decryptedN8nUrl, 4) : '',
      n8nApiKey: decryptedN8nApiKey ? mask(decryptedN8nApiKey, 4) : '',
      n8nPostgresMemoryCredentialId: settings.n8nPostgresMemoryCredentialId || '',
      chatbotGlobalRules: settings.chatbotGlobalRules || '',
      chatbotContextWindowLength: settings.chatbotContextWindowLength || 10,
      hasVapi: !!decryptedVapi,
      hasOpenai: !!decryptedOpenai,
      hasAnthropic: !!decryptedAnthropic,
      hasVapiPublicKey: !!decryptedVapiPublic,
      hasElevenLabs: !!decryptedElevenLabs,
      hasSlackWebhook: !!decryptedSlackWebhook,
      hasAccountWebhook: !!decryptedAccountWebhook,
      hasRecurringPaymentWebhook: !!decryptedRecurringWebhook,
      hasN8nUrl: !!decryptedN8nUrl,
      hasN8nApiKey: !!decryptedN8nApiKey
    });
  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
};

const getVapiPublicKey = async (req, res) => {
  try {
    // Block if user has no credits
    if (req.user?.id) {
      const creditCheck = await req.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { vapiCredits: true }
      });
      if (!creditCheck || creditCheck.vapiCredits <= 0) {
        return res.status(403).json({
          error: 'Insufficient credits. Please add credits to make calls.',
          code: 'INSUFFICIENT_CREDITS',
          credits: creditCheck?.vapiCredits || 0
        });
      }
    }

    // Check per-account key first
    if (req.user?.id) {
      const user = await req.prisma.user.findUnique({
        where: { id: req.user.id },
        select: { vapiPublicKey: true }
      });
      if (user?.vapiPublicKey) {
        const userDecrypted = decrypt(user.vapiPublicKey);
        if (userDecrypted) {
          return res.json({ vapiPublicKey: userDecrypted });
        }
      }
    }

    // Fall back to global PlatformSettings
    const settings = await req.prisma.platformSettings.findFirst();

    if (!settings || !settings.vapiPublicKey) {
      return res.status(404).json({ error: 'VAPI Public Key not configured' });
    }

    const decrypted = decrypt(settings.vapiPublicKey);
    if (!decrypted) {
      return res.status(404).json({ error: 'VAPI Public Key not configured' });
    }

    res.json({ vapiPublicKey: decrypted });
  } catch (error) {
    console.error('Get VAPI public key error:', error);
    res.status(500).json({ error: 'Failed to fetch VAPI public key' });
  }
};

module.exports = { getSettings, updateSettings, getVapiPublicKey };
