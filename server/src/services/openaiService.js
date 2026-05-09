const OpenAI = require('openai');

// USD per 1M tokens. Source: platform.openai.com/docs/pricing (Nov 2025).
// Keep entries lower-case; lookup falls back to longest-prefix match for dated suffixes.
const PRICING = {
  'gpt-5.2': { input: 2.00, output: 8.00 },
  'gpt-5-mini': { input: 0.40, output: 1.60 },
  'gpt-5-nano': { input: 0.10, output: 0.40 },
  'gpt-4.1': { input: 2.00, output: 8.00 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
  'o4-mini': { input: 1.10, output: 4.40 },
  'o3-mini': { input: 1.10, output: 4.40 },
  'o1-preview': { input: 15.00, output: 60.00 },
  'o1-mini': { input: 3.00, output: 12.00 },
  'o1': { input: 15.00, output: 60.00 },
  'text-embedding-3-small': { input: 0.020, output: 0 },
  'text-embedding-3-large': { input: 0.130, output: 0 },
  'text-embedding-ada-002': { input: 0.100, output: 0 },
};

function lookupRate(model) {
  const m = (model || '').toLowerCase();
  if (PRICING[m]) return PRICING[m];
  // Longest-prefix match for dated variants like "gpt-4o-2024-08-06".
  let best = null;
  for (const key of Object.keys(PRICING)) {
    if (m.startsWith(key) && (!best || key.length > best.length)) best = key;
  }
  return best ? PRICING[best] : { input: 0, output: 0 };
}

function calculateCost(model, promptTokens = 0, completionTokens = 0) {
  const rate = lookupRate(model);
  return (promptTokens / 1_000_000) * rate.input + (completionTokens / 1_000_000) * rate.output;
}

async function logUsage(prisma, { model, promptTokens, completionTokens, userId }) {
  if (!prisma) return;
  try {
    const cost = calculateCost(model, promptTokens, completionTokens);
    await prisma.openAiUsageLog.create({
      data: {
        model: model || 'unknown',
        promptTokens: promptTokens || 0,
        completionTokens: completionTokens || 0,
        costUsd: cost,
        userId: userId || null,
      },
    });
  } catch (err) {
    // Never let usage logging break the request path.
    console.error('[openaiService] logUsage failed:', err.message);
  }
}

function getClient(apiKey) {
  return new OpenAI({ apiKey, timeout: 60000 });
}

async function* wrapStream(stream, prisma, ctx) {
  let usage = null;
  for await (const chunk of stream) {
    if (chunk.usage) usage = chunk.usage;
    yield chunk;
  }
  if (usage) {
    await logUsage(prisma, {
      model: ctx.model,
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      userId: ctx.userId,
    });
  }
}

async function chatCompletion({ prisma, apiKey, userId, ...params }) {
  const client = getClient(apiKey);
  if (params.stream) {
    const merged = { ...params, stream_options: { ...(params.stream_options || {}), include_usage: true } };
    const stream = await client.chat.completions.create(merged);
    return wrapStream(stream, prisma, { model: params.model, userId });
  }
  const response = await client.chat.completions.create(params);
  if (response?.usage) {
    await logUsage(prisma, {
      model: params.model,
      promptTokens: response.usage.prompt_tokens,
      completionTokens: response.usage.completion_tokens,
      userId,
    });
  }
  return response;
}

async function embeddings({ prisma, apiKey, userId, ...params }) {
  const client = getClient(apiKey);
  const response = await client.embeddings.create(params);
  if (response?.usage) {
    await logUsage(prisma, {
      model: params.model,
      promptTokens: response.usage.prompt_tokens,
      completionTokens: 0,
      userId,
    });
  }
  return response;
}

async function getBalance(prisma) {
  const settings = await prisma.platformSettings.findFirst();
  const starting = settings?.openaiBalance ?? 0;
  const agg = await prisma.openAiUsageLog.aggregate({ _sum: { costUsd: true } });
  const used = agg?._sum?.costUsd || 0;
  return {
    starting,
    used,
    remaining: Math.max(0, starting - used),
    updatedAt: settings?.openaiBalanceUpdatedAt || null,
  };
}

module.exports = {
  chatCompletion,
  embeddings,
  calculateCost,
  logUsage,
  getBalance,
  PRICING,
};
