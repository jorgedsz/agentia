export const TRANSCRIBER_PROVIDERS = [
  { id: 'deepgram', label: 'Deepgram' },
  { id: 'assembly-ai', label: 'Assembly AI' },
  { id: 'azure', label: 'Azure' },
  { id: '11labs', label: 'ElevenLabs' },
  { id: 'gladia', label: 'Gladia' },
  { id: 'google', label: 'Google' },
  { id: 'openai', label: 'OpenAI' },
  { id: 'speechmatics', label: 'Speechmatics' },
  { id: 'talkscriber', label: 'Talkscriber' },
  { id: 'cartesia', label: 'Cartesia' },
]

export const MODELS_BY_PROVIDER = {
  'openai': [
    { model: 'gpt-5.2', label: 'GPT 5.2', llmLatency: 1350 },
    { model: 'gpt-5.1', label: 'GPT 5.1', llmLatency: 1350 },
    { model: 'gpt-5', label: 'GPT 5', llmLatency: 1550 },
    { model: 'gpt-5-mini', label: 'GPT 5 Mini', llmLatency: 700 },
    { model: 'gpt-5-nano', label: 'GPT 5 Nano', llmLatency: 400 },
    { model: 'gpt-4.1', label: 'GPT 4.1', llmLatency: 800 },
    { model: 'gpt-4.1-mini', label: 'GPT 4.1 Mini', llmLatency: 400 },
    { model: 'gpt-4.1-nano', label: 'GPT 4.1 Nano', llmLatency: 300 },
    { model: 'gpt-4o', label: 'GPT-4o', llmLatency: 700 },
    { model: 'gpt-4o-mini', label: 'GPT-4o Mini', llmLatency: 400 },
    { model: 'o4-mini', label: 'o4-mini', llmLatency: 1000 },
    { model: 'o3', label: 'o3', llmLatency: 2000 },
    { model: 'o3-mini', label: 'o3-mini', llmLatency: 1000 },
    { model: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo', llmLatency: 300 },
  ],
  'anthropic': [
    { model: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet', llmLatency: 1200 },
    { model: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku', llmLatency: 500 },
    { model: 'claude-3-opus-20240229', label: 'Claude 3 Opus', llmLatency: 3000 },
  ],
  'google': [
    { model: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro', llmLatency: 800 },
    { model: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash', llmLatency: 300 },
  ],
  'groq': [
    { model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile', llmLatency: 200 },
    { model: 'llama-3.1-405b-reasoning', label: 'Llama 3.1 405B Reasoning', llmLatency: 200 },
    { model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant', llmLatency: 200 },
    { model: 'llama3-70b-8192', label: 'Llama 3 70B', llmLatency: 200 },
    { model: 'llama3-8b-8192', label: 'Llama 3 8B', llmLatency: 200 },
    { model: 'meta-llama/llama-4-maverick-17b-128e-instruct', label: 'Llama 4 Maverick 17B', llmLatency: 200 },
    { model: 'meta-llama/llama-4-scout-17b-16e-instruct', label: 'Llama 4 Scout 17B', llmLatency: 200 },
    { model: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B', llmLatency: 200 },
    { model: 'gemma2-9b-it', label: 'Gemma 2 9B', llmLatency: 200 },
    { model: 'mistral-saba-24b', label: 'Mistral Saba 24B', llmLatency: 200 },
    { model: 'moonshotai/kimi-k2-instruct-0905', label: 'Moonshot Kimi K2', llmLatency: 200 },
    { model: 'compound-beta', label: 'Compound Beta', llmLatency: 200 },
    { model: 'compound-beta-mini', label: 'Compound Beta Mini', llmLatency: 200 },
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
  'google': 'Google',
  'groq': 'Groq',
  'deepseek': 'DeepSeek',
  'mistral': 'Mistral',
}
