const Anthropic = require('@anthropic-ai/sdk');
const { decrypt } = require('../utils/encryption');

// Approved model slugs for Reports. Defaults to Sonnet 4.6 — strong balance of
// quality and cost for analytical text. Opus 4.7 for the most demanding analyses,
// Haiku 4.5 for cheap quick passes.
const ALLOWED_MODELS = new Set([
  'claude-sonnet-4-6',
  'claude-opus-4-7',
  'claude-haiku-4-5-20251001'
]);

const DEFAULT_MODEL = 'claude-sonnet-4-6';

const getApiKey = async (prisma) => {
  const settings = await prisma.platformSettings.findFirst();
  if (!settings?.anthropicApiKey) return null;
  try {
    return decrypt(settings.anthropicApiKey);
  } catch {
    return null;
  }
};

const isModelAllowed = (model) => ALLOWED_MODELS.has(model);

/**
 * Run a report-style call against Claude.
 *
 * Returns { text, usage: { input_tokens, output_tokens } }.
 * Caches the system block (>=1024 tokens auto-cached, otherwise the explicit
 * cache_control hint here pins it). Reuse across re-runs of the same report.
 */
const runReport = async ({ apiKey, model, system, userPrompt, dataBlock, maxTokens = 4096 }) => {
  const client = new Anthropic({ apiKey });
  const chosenModel = isModelAllowed(model) ? model : DEFAULT_MODEL;

  const response = await client.messages.create({
    model: chosenModel,
    max_tokens: maxTokens,
    system: [
      {
        type: 'text',
        text: system,
        cache_control: { type: 'ephemeral' }
      }
    ],
    messages: [
      {
        role: 'user',
        content: dataBlock
          ? `${dataBlock}\n\n---\n\n${userPrompt}`
          : userPrompt
      }
    ]
  });

  const textBlocks = (response.content || []).filter((b) => b.type === 'text');
  const text = textBlocks.map((b) => b.text).join('\n').trim();

  return {
    text,
    model: chosenModel,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0
    }
  };
};

module.exports = {
  ALLOWED_MODELS: Array.from(ALLOWED_MODELS),
  DEFAULT_MODEL,
  isModelAllowed,
  getApiKey,
  runReport
};
