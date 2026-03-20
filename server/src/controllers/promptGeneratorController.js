const promptGeneratorService = require('../services/promptGeneratorService');
const { getApiKeys } = require('../utils/getApiKeys');

const generatePrompt = async (req, res) => {
  try {
    const { botType, direction, language, companyName, industry, tone, goals, typeConfig, additionalNotes } = req.body;

    if (!botType || !['sales', 'support', 'booking', 'survey'].includes(botType)) {
      return res.status(400).json({ error: 'Valid botType is required (sales, support, booking, survey)' });
    }
    if (!companyName || !companyName.trim()) {
      return res.status(400).json({ error: 'Company name is required' });
    }
    if (!goals || !goals.trim()) {
      return res.status(400).json({ error: 'Goals are required' });
    }

    const { openaiApiKey } = await getApiKeys(req.prisma);

    const wizardData = {
      botType,
      direction: direction || 'outbound',
      language: language || 'en',
      companyName: companyName.trim(),
      industry: industry || '',
      tone: tone || 'professional',
      goals: goals.trim(),
      typeConfig: typeConfig || {},
      additionalNotes: additionalNotes ? additionalNotes.trim() : ''
    };

    const result = await promptGeneratorService.generatePrompt(wizardData, openaiApiKey);

    res.json({ prompt: result.prompt, firstMessage: result.firstMessage });
  } catch (error) {
    console.error('Generate prompt error:', error.message || error);
    if (error.response) console.error('OpenAI response:', error.response?.data);
    res.status(500).json({ error: 'Failed to generate prompt: ' + (error.message || 'Unknown error') });
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
