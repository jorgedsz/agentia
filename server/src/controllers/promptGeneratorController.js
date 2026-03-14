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

const updatePrompt = async (req, res) => {
  try {
    const { currentPrompt, changeDescription, language } = req.body;

    if (!currentPrompt || !currentPrompt.trim()) {
      return res.status(400).json({ error: 'Current prompt is required' });
    }

    if (!changeDescription || !changeDescription.trim()) {
      return res.status(400).json({ error: 'Change description is required' });
    }

    const { openaiApiKey } = await getApiKeys(req.prisma);

    const result = await promptGeneratorService.updatePrompt(
      currentPrompt.trim(),
      changeDescription.trim(),
      language || 'en',
      openaiApiKey
    );

    res.json({ prompt: result.prompt });
  } catch (error) {
    console.error('Update prompt error:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
};

module.exports = { generatePrompt, updatePrompt };
