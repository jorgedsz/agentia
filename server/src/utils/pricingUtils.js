/**
 * Dynamic pricing utilities
 * Resolves per-agent rates based on model + transcriber configuration.
 * Rate hierarchy: agency override > global (OWNER) default > hardcoded fallback.
 */

// Hardcoded fallback rates (used only when no DB records exist)
const DEFAULT_MODEL_RATE = 0.08;      // $/min
const DEFAULT_TRANSCRIBER_RATE = 0.02; // $/min

/**
 * Get effective model & transcriber rates for a user.
 * If the user belongs to an agency and the agency has overrides, those win.
 * Otherwise, global defaults (setById=0) are used.
 */
async function getEffectiveRates(prisma, userId) {
  // Determine if this user has an agency override
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { agencyId: true, role: true }
  });

  // The override setById: if user is a CLIENT under an agency, use agencyId
  // If user IS an agency, use their own id for their clients' overrides
  const overrideId = user?.agencyId || 0;

  // Fetch global defaults (setById=0)
  const globalModels = await prisma.modelRate.findMany({ where: { setById: 0 } });
  const globalTranscribers = await prisma.transcriberRate.findMany({ where: { setById: 0 } });

  // Fetch agency overrides if applicable
  let agencyModels = [];
  let agencyTranscribers = [];
  if (overrideId > 0) {
    agencyModels = await prisma.modelRate.findMany({ where: { setById: overrideId } });
    agencyTranscribers = await prisma.transcriberRate.findMany({ where: { setById: overrideId } });
  }

  // Build lookup maps: agency override > global
  const modelRates = {};
  for (const r of globalModels) {
    modelRates[`${r.provider}::${r.model}`] = r.rate;
  }
  for (const r of agencyModels) {
    modelRates[`${r.provider}::${r.model}`] = r.rate; // override
  }

  const transcriberRates = {};
  for (const r of globalTranscribers) {
    transcriberRates[r.provider] = r.rate;
  }
  for (const r of agencyTranscribers) {
    transcriberRates[r.provider] = r.rate; // override
  }

  return { modelRates, transcriberRates };
}

/**
 * Get the combined rate/min for a specific agent.
 * Parses agent.config to find modelProvider, model name, and transcriberProvider.
 * Returns { modelRate, transcriberRate, totalRate } or null if no dynamic pricing.
 */
async function getAgentRate(prisma, agent, userId) {
  let config;
  try {
    config = typeof agent.config === 'string' ? JSON.parse(agent.config) : agent.config;
  } catch {
    return null;
  }

  if (!config) return null;

  const modelProvider = config.modelProvider;
  const modelName = config.modelName;
  const transcriberProvider = config.transcriberProvider || 'deepgram';

  if (!modelProvider || !modelName) return null;

  const { modelRates, transcriberRates } = await getEffectiveRates(prisma, userId);

  const modelKey = `${modelProvider}::${modelName}`;
  const modelRate = modelRates[modelKey];
  const transcriberRate = transcriberRates[transcriberProvider];

  // Only use dynamic pricing if at least one rate exists in the DB
  if (modelRate === undefined && transcriberRate === undefined) return null;

  return {
    modelRate: modelRate ?? DEFAULT_MODEL_RATE,
    transcriberRate: transcriberRate ?? DEFAULT_TRANSCRIBER_RATE,
    totalRate: (modelRate ?? DEFAULT_MODEL_RATE) + (transcriberRate ?? DEFAULT_TRANSCRIBER_RATE)
  };
}

/**
 * Seed global default rates if none exist.
 * Called on server startup or on first pricing API access.
 */
async function seedDefaultRates(prisma) {
  const existingModel = await prisma.modelRate.findFirst({ where: { setById: 0 } });
  if (existingModel) return; // already seeded

  const defaultModels = [
    // OpenAI
    { provider: 'openai', model: 'gpt-5.2', rate: 0.15 },
    { provider: 'openai', model: 'gpt-5.1', rate: 0.15 },
    { provider: 'openai', model: 'gpt-5', rate: 0.15 },
    { provider: 'openai', model: 'gpt-5-mini', rate: 0.08 },
    { provider: 'openai', model: 'gpt-5-nano', rate: 0.05 },
    { provider: 'openai', model: 'gpt-4.1', rate: 0.10 },
    { provider: 'openai', model: 'gpt-4.1-mini', rate: 0.06 },
    { provider: 'openai', model: 'gpt-4.1-nano', rate: 0.04 },
    { provider: 'openai', model: 'gpt-4o', rate: 0.10 },
    { provider: 'openai', model: 'gpt-4o-mini', rate: 0.06 },
    { provider: 'openai', model: 'o4-mini', rate: 0.10 },
    { provider: 'openai', model: 'o3', rate: 0.20 },
    { provider: 'openai', model: 'o3-mini', rate: 0.10 },
    { provider: 'openai', model: 'gpt-3.5-turbo', rate: 0.04 },
    // Anthropic
    { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', rate: 0.12 },
    { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', rate: 0.06 },
    { provider: 'anthropic', model: 'claude-3-opus-20240229', rate: 0.25 },
    // Google
    { provider: 'google', model: 'gemini-1.5-pro', rate: 0.10 },
    { provider: 'google', model: 'gemini-1.5-flash', rate: 0.04 },
    // Groq
    { provider: 'groq', model: 'llama-3.3-70b-versatile', rate: 0.04 },
    { provider: 'groq', model: 'llama-3.1-405b-reasoning', rate: 0.06 },
    { provider: 'groq', model: 'llama-3.1-8b-instant', rate: 0.02 },
    { provider: 'groq', model: 'llama3-70b-8192', rate: 0.04 },
    { provider: 'groq', model: 'llama3-8b-8192', rate: 0.02 },
    { provider: 'groq', model: 'meta-llama/llama-4-maverick-17b-128e-instruct', rate: 0.03 },
    { provider: 'groq', model: 'meta-llama/llama-4-scout-17b-16e-instruct', rate: 0.03 },
    { provider: 'groq', model: 'deepseek-r1-distill-llama-70b', rate: 0.04 },
    { provider: 'groq', model: 'gemma2-9b-it', rate: 0.02 },
    { provider: 'groq', model: 'mistral-saba-24b', rate: 0.03 },
    { provider: 'groq', model: 'moonshotai/kimi-k2-instruct-0905', rate: 0.03 },
    { provider: 'groq', model: 'compound-beta', rate: 0.04 },
    { provider: 'groq', model: 'compound-beta-mini', rate: 0.03 },
    // DeepSeek
    { provider: 'deepseek', model: 'deepseek-chat', rate: 0.06 },
    { provider: 'deepseek', model: 'deepseek-coder', rate: 0.06 },
    // Mistral
    { provider: 'mistral', model: 'mistral-large-latest', rate: 0.10 },
    { provider: 'mistral', model: 'mistral-medium-latest', rate: 0.06 },
    { provider: 'mistral', model: 'mistral-small-latest', rate: 0.04 },
  ];

  const defaultTranscribers = [
    { provider: 'deepgram', rate: 0.02 },
    { provider: 'assembly-ai', rate: 0.03 },
    { provider: 'azure', rate: 0.02 },
    { provider: '11labs', rate: 0.03 },
    { provider: 'gladia', rate: 0.03 },
    { provider: 'google', rate: 0.02 },
    { provider: 'openai', rate: 0.02 },
    { provider: 'speechmatics', rate: 0.03 },
    { provider: 'talkscriber', rate: 0.02 },
    { provider: 'cartesia', rate: 0.02 },
  ];

  // Bulk create
  await prisma.modelRate.createMany({
    data: defaultModels.map(m => ({ ...m, setById: 0 })),
    skipDuplicates: true
  });

  await prisma.transcriberRate.createMany({
    data: defaultTranscribers.map(t => ({ ...t, setById: 0 })),
    skipDuplicates: true
  });
}

module.exports = {
  getEffectiveRates,
  getAgentRate,
  seedDefaultRates,
  DEFAULT_MODEL_RATE,
  DEFAULT_TRANSCRIBER_RATE
};
