const promptGeneratorService = require('../services/promptGeneratorService');
const { getApiKeys } = require('../utils/getApiKeys');

const generatePrompt = async (req, res) => {
  try {
    const { description, agentType, language } = req.body;

    if (!description || !description.trim()) {
      return res.status(400).json({ error: 'Description is required' });
    }

    const { openaiApiKey } = await getApiKeys(req.prisma);

    const result = await promptGeneratorService.generatePrompt(
      description.trim(),
      agentType || 'outbound',
      language || 'en',
      openaiApiKey
    );

    res.json({ prompt: result.prompt, firstMessage: result.firstMessage });
  } catch (error) {
    console.error('Generate prompt error:', error);
    res.status(500).json({ error: 'Failed to generate prompt' });
  }
};

module.exports = { generatePrompt };
