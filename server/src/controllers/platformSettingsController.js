const { encrypt, decrypt, mask } = require('../utils/encryption');

const getSettings = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can access platform settings' });
    }

    const settings = await req.prisma.platformSettings.findFirst();

    if (!settings) {
      return res.json({ vapiApiKey: '', openaiApiKey: '', vapiPublicKey: '', elevenLabsApiKey: '', slackWebhookUrl: '', hasVapi: false, hasOpenai: false, hasVapiPublicKey: false, hasElevenLabs: false, hasSlackWebhook: false });
    }

    const decryptedVapi = settings.vapiApiKey ? decrypt(settings.vapiApiKey) : '';
    const decryptedOpenai = settings.openaiApiKey ? decrypt(settings.openaiApiKey) : '';
    const decryptedVapiPublic = settings.vapiPublicKey ? decrypt(settings.vapiPublicKey) : '';
    const decryptedElevenLabs = settings.elevenLabsApiKey ? decrypt(settings.elevenLabsApiKey) : '';
    const decryptedSlackWebhook = settings.slackWebhookUrl ? decrypt(settings.slackWebhookUrl) : '';

    res.json({
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      openaiApiKey: decryptedOpenai ? mask(decryptedOpenai, 4) : '',
      vapiPublicKey: decryptedVapiPublic ? mask(decryptedVapiPublic, 4) : '',
      elevenLabsApiKey: decryptedElevenLabs ? mask(decryptedElevenLabs, 4) : '',
      slackWebhookUrl: decryptedSlackWebhook ? mask(decryptedSlackWebhook, 4) : '',
      hasVapi: !!decryptedVapi,
      hasOpenai: !!decryptedOpenai,
      hasVapiPublicKey: !!decryptedVapiPublic,
      hasElevenLabs: !!decryptedElevenLabs,
      hasSlackWebhook: !!decryptedSlackWebhook
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

    const { vapiApiKey, openaiApiKey, vapiPublicKey, elevenLabsApiKey, slackWebhookUrl } = req.body;

    const existing = await req.prisma.platformSettings.findFirst();

    const data = {};
    if (vapiApiKey !== undefined) {
      data.vapiApiKey = vapiApiKey ? encrypt(vapiApiKey) : null;
    }
    if (openaiApiKey !== undefined) {
      data.openaiApiKey = openaiApiKey ? encrypt(openaiApiKey) : null;
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
    const decryptedVapiPublic = settings.vapiPublicKey ? decrypt(settings.vapiPublicKey) : '';
    const decryptedElevenLabs = settings.elevenLabsApiKey ? decrypt(settings.elevenLabsApiKey) : '';
    const decryptedSlackWebhook = settings.slackWebhookUrl ? decrypt(settings.slackWebhookUrl) : '';

    res.json({
      message: 'Platform settings updated',
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      openaiApiKey: decryptedOpenai ? mask(decryptedOpenai, 4) : '',
      vapiPublicKey: decryptedVapiPublic ? mask(decryptedVapiPublic, 4) : '',
      elevenLabsApiKey: decryptedElevenLabs ? mask(decryptedElevenLabs, 4) : '',
      slackWebhookUrl: decryptedSlackWebhook ? mask(decryptedSlackWebhook, 4) : '',
      hasVapi: !!decryptedVapi,
      hasOpenai: !!decryptedOpenai,
      hasVapiPublicKey: !!decryptedVapiPublic,
      hasElevenLabs: !!decryptedElevenLabs,
      hasSlackWebhook: !!decryptedSlackWebhook
    });
  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
};

const getVapiPublicKey = async (req, res) => {
  try {
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
