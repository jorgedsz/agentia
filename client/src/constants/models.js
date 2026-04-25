export const TRANSCRIBER_PROVIDERS = [
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'assembly-ai', label: 'Assembly AI' },
  { id: 'azure', label: 'Azure' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'speechmatics', label: 'Speechmatics' },
  { id: 'talkscriber', label: 'Talkscriber' },
  { id: 'cartesia', label: 'Cartesia' },
]

export const MODELS_BY_PROVIDER = {
  'openai': [
    { model: 'gpt-5.2', label: 'GPT 5.2', llmLatency: 1350 },
    { model: 'gpt-5-mini', label: 'GPT 5 Mini', llmLatency: 700 },
    { model: 'gpt-5-nano', label: 'GPT 5 Nano', llmLatency: 400 },
    { model: 'gpt-4.1', label: 'GPT 4.1', llmLatency: 800 },
    { model: 'gpt-4.1-mini', label: 'GPT 4.1 Mini', llmLatency: 400 },
    { model: 'gpt-4.1-nano', label: 'GPT 4.1 Nano', llmLatency: 300 },
    { model: 'gpt-4o-mini', label: 'GPT-4o Mini', llmLatency: 400 },
    { model: 'o4-mini', label: 'o4-mini', llmLatency: 1000 },
  ],
  'anthropic': [
    { model: 'claude-opus-4-7', label: 'Claude Opus 4.7', llmLatency: 2000 },
    { model: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', llmLatency: 1100 },
    { model: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5', llmLatency: 500 },
  ],
  'groq': [
    { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', llmLatency: 200 },
    { model: 'llama-3.1-405b-reasoning', label: 'Llama 3.1 405B Reasoning', llmLatency: 200 },
    { model: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', llmLatency: 200 },
    { model: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', llmLatency: 200 },
    { model: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B', llmLatency: 200 },
    { model: 'gemma2-9b-it', label: 'Gemma 2 9B', llmLatency: 200 },
    { model: 'mistral-saba-24b', label: 'Mistral Saba 24B', llmLatency: 200 },
    { model: 'moonshotai/kimi-k2-instruct-0905', label: 'Moonshot Kimi K2', llmLatency: 200 },
    { model: 'compound-beta', label: 'Compound Beta', llmLatency: 200 },
  ],
  'deepseek': [
    { model: 'deepseek-chat', label: 'DeepSeek Chat', llmLatency: 600 },
    { model: 'deepseek-coder', label: 'DeepSeek Coder', llmLatency: 600 },
  ],
  'mistral': [
    { model: 'mistral-large-latest', label: 'Mistral Large', llmLatency: 800 },
    { model: 'mistral-medium-latest', label: 'Mistral Medium', llmLatency: 500 },
    { model: 'mistral-small-latest', label: 'Mistral Small', llmLatency: 300 },
  ],
}

export const MODEL_PROVIDER_LABELS = {
  'openai': 'OpenAI',
  'anthropic': 'Anthropic',
  'groq': 'Groq',
  'deepseek': 'DeepSeek',
  'mistral': 'Mistral',
}
