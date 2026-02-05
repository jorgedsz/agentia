const { encrypt, decrypt, mask } = require('../utils/encryption');

const getSettings = async (req, res) => {
  try {
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the owner can access platform settings' });
    }

    const settings = await req.prisma.platformSettings.findFirst();

    if (!settings) {
      return res.json({ vapiApiKey: '', openaiApiKey: '', hasVapi: false, hasOpenai: false });
    }

    const decryptedVapi = settings.vapiApiKey ? decrypt(settings.vapiApiKey) : '';
    const decryptedOpenai = settings.openaiApiKey ? decrypt(settings.openaiApiKey) : '';

    res.json({
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      openaiApiKey: decryptedOpenai ? mask(decryptedOpenai, 4) : '',
      hasVapi: !!decryptedVapi,
      hasOpenai: !!decryptedOpenai
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

    const { vapiApiKey, openaiApiKey } = req.body;

    const existing = await req.prisma.platformSettings.findFirst();

    const data = {};
    if (vapiApiKey !== undefined) {
      data.vapiApiKey = vapiApiKey ? encrypt(vapiApiKey) : null;
    }
    if (openaiApiKey !== undefined) {
      data.openaiApiKey = openaiApiKey ? encrypt(openaiApiKey) : null;
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

    res.json({
      message: 'Platform settings updated',
      vapiApiKey: decryptedVapi ? mask(decryptedVapi, 4) : '',
      openaiApiKey: decryptedOpenai ? mask(decryptedOpenai, 4) : '',
      hasVapi: !!decryptedVapi,
      hasOpenai: !!decryptedOpenai
    });
  } catch (error) {
    console.error('Update platform settings error:', error);
    res.status(500).json({ error: 'Failed to update platform settings' });
  }
};

module.exports = { getSettings, updateSettings };
