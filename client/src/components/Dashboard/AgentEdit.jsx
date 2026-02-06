import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agentsAPI, phoneNumbersAPI, callsAPI, creditsAPI, ghlAPI, promptGeneratorAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'it', label: 'Italian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'nl', label: 'Dutch' },
  { id: 'pl', label: 'Polish' },
  { id: 'ru', label: 'Russian' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'zh', label: 'Chinese' },
]

const TRANSCRIBER_PROVIDERS = [
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

const TRANSCRIBER_LANGUAGES = {
  'deepgram': [
    { id: 'multi', label: 'Multi (Auto-detect)' },
    { id: 'en', label: 'English' },
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'en-AU', label: 'English (AU)' },
    { id: 'es', label: 'Spanish' },
    { id: 'es-419', label: 'Spanish (LATAM)' },
    { id: 'fr', label: 'French' },
    { id: 'fr-CA', label: 'French (Canada)' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'pt-BR', label: 'Portuguese (Brazil)' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'zh', label: 'Chinese' },
    { id: 'zh-TW', label: 'Chinese (Traditional)' },
    { id: 'hi', label: 'Hindi' },
    { id: 'tr', label: 'Turkish' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'no', label: 'Norwegian' },
    { id: 'id', label: 'Indonesian' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
    { id: 'cs', label: 'Czech' },
    { id: 'el', label: 'Greek' },
    { id: 'ro', label: 'Romanian' },
    { id: 'bg', label: 'Bulgarian' },
    { id: 'ms', label: 'Malay' },
    { id: 'hu', label: 'Hungarian' },
    { id: 'ca', label: 'Catalan' },
    { id: 'ta', label: 'Tamil' },
  ],
  'assembly-ai': [
    { id: 'en', label: 'English' },
  ],
  'azure': [
    { id: 'en-US', label: 'English (US)' },
    { id: 'en-GB', label: 'English (UK)' },
    { id: 'en-AU', label: 'English (AU)' },
    { id: 'en-CA', label: 'English (Canada)' },
    { id: 'en-IN', label: 'English (India)' },
    { id: 'es-ES', label: 'Spanish (Spain)' },
    { id: 'es-MX', label: 'Spanish (Mexico)' },
    { id: 'es-US', label: 'Spanish (US)' },
    { id: 'fr-FR', label: 'French (France)' },
    { id: 'fr-CA', label: 'French (Canada)' },
    { id: 'de-DE', label: 'German' },
    { id: 'it-IT', label: 'Italian' },
    { id: 'pt-BR', label: 'Portuguese (Brazil)' },
    { id: 'pt-PT', label: 'Portuguese (Portugal)' },
    { id: 'nl-NL', label: 'Dutch' },
    { id: 'pl-PL', label: 'Polish' },
    { id: 'ru-RU', label: 'Russian' },
    { id: 'ja-JP', label: 'Japanese' },
    { id: 'ko-KR', label: 'Korean' },
    { id: 'zh-CN', label: 'Chinese (Simplified)' },
    { id: 'zh-TW', label: 'Chinese (Traditional)' },
    { id: 'hi-IN', label: 'Hindi' },
    { id: 'ar-SA', label: 'Arabic (Saudi)' },
    { id: 'ar-EG', label: 'Arabic (Egypt)' },
    { id: 'tr-TR', label: 'Turkish' },
    { id: 'uk-UA', label: 'Ukrainian' },
    { id: 'sv-SE', label: 'Swedish' },
    { id: 'da-DK', label: 'Danish' },
    { id: 'fi-FI', label: 'Finnish' },
    { id: 'nb-NO', label: 'Norwegian' },
    { id: 'th-TH', label: 'Thai' },
    { id: 'vi-VN', label: 'Vietnamese' },
    { id: 'he-IL', label: 'Hebrew' },
    { id: 'el-GR', label: 'Greek' },
    { id: 'ro-RO', label: 'Romanian' },
    { id: 'hu-HU', label: 'Hungarian' },
    { id: 'id-ID', label: 'Indonesian' },
    { id: 'cs-CZ', label: 'Czech' },
    { id: 'bg-BG', label: 'Bulgarian' },
    { id: 'ms-MY', label: 'Malay' },
    { id: 'ca-ES', label: 'Catalan' },
  ],
  'gladia': [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'zh', label: 'Chinese' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ar', label: 'Arabic' },
    { id: 'tr', label: 'Turkish' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'no', label: 'Norwegian' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
    { id: 'he', label: 'Hebrew' },
    { id: 'el', label: 'Greek' },
    { id: 'ro', label: 'Romanian' },
    { id: 'hu', label: 'Hungarian' },
    { id: 'id', label: 'Indonesian' },
    { id: 'cs', label: 'Czech' },
    { id: 'bg', label: 'Bulgarian' },
    { id: 'ms', label: 'Malay' },
    { id: 'ca', label: 'Catalan' },
    { id: 'ta', label: 'Tamil' },
  ],
  'google': [
    { id: 'Multilingual', label: 'Multilingual (Auto)' },
    { id: 'English', label: 'English' },
    { id: 'Spanish', label: 'Spanish' },
    { id: 'French', label: 'French' },
    { id: 'German', label: 'German' },
    { id: 'Italian', label: 'Italian' },
    { id: 'Portuguese', label: 'Portuguese' },
    { id: 'Dutch', label: 'Dutch' },
    { id: 'Polish', label: 'Polish' },
    { id: 'Russian', label: 'Russian' },
    { id: 'Japanese', label: 'Japanese' },
    { id: 'Korean', label: 'Korean' },
    { id: 'Chinese', label: 'Chinese' },
    { id: 'Hindi', label: 'Hindi' },
    { id: 'Arabic', label: 'Arabic' },
    { id: 'Turkish', label: 'Turkish' },
    { id: 'Ukrainian', label: 'Ukrainian' },
    { id: 'Swedish', label: 'Swedish' },
    { id: 'Danish', label: 'Danish' },
    { id: 'Finnish', label: 'Finnish' },
    { id: 'Norwegian', label: 'Norwegian' },
    { id: 'Thai', label: 'Thai' },
    { id: 'Vietnamese', label: 'Vietnamese' },
    { id: 'Hebrew', label: 'Hebrew' },
    { id: 'Greek', label: 'Greek' },
    { id: 'Romanian', label: 'Romanian' },
    { id: 'Hungarian', label: 'Hungarian' },
    { id: 'Indonesian', label: 'Indonesian' },
    { id: 'Czech', label: 'Czech' },
    { id: 'Bulgarian', label: 'Bulgarian' },
    { id: 'Croatian', label: 'Croatian' },
    { id: 'Bengali', label: 'Bengali' },
    { id: 'Slovak', label: 'Slovak' },
    { id: 'Slovenian', label: 'Slovenian' },
    { id: 'Serbian', label: 'Serbian' },
    { id: 'Swahili', label: 'Swahili' },
  ],
  'speechmatics': [
    { id: 'auto', label: 'Auto-detect' },
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'cmn', label: 'Chinese (Mandarin)' },
    { id: 'yue', label: 'Chinese (Cantonese)' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ar', label: 'Arabic' },
    { id: 'tr', label: 'Turkish' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'no', label: 'Norwegian' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
    { id: 'he', label: 'Hebrew' },
    { id: 'el', label: 'Greek' },
    { id: 'ro', label: 'Romanian' },
    { id: 'hu', label: 'Hungarian' },
    { id: 'id', label: 'Indonesian' },
    { id: 'cs', label: 'Czech' },
    { id: 'bg', label: 'Bulgarian' },
    { id: 'ms', label: 'Malay' },
    { id: 'ca', label: 'Catalan' },
    { id: 'ta', label: 'Tamil' },
  ],
  'talkscriber': [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'zh', label: 'Chinese' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ar', label: 'Arabic' },
    { id: 'tr', label: 'Turkish' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'no', label: 'Norwegian' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
  ],
  'openai': [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'zh', label: 'Chinese' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ar', label: 'Arabic' },
    { id: 'tr', label: 'Turkish' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
    { id: 'he', label: 'Hebrew' },
    { id: 'el', label: 'Greek' },
    { id: 'ro', label: 'Romanian' },
    { id: 'hu', label: 'Hungarian' },
    { id: 'id', label: 'Indonesian' },
    { id: 'cs', label: 'Czech' },
  ],
  '11labs': [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'zh', label: 'Chinese' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ar', label: 'Arabic' },
    { id: 'tr', label: 'Turkish' },
    { id: 'uk', label: 'Ukrainian' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
    { id: 'he', label: 'Hebrew' },
    { id: 'el', label: 'Greek' },
    { id: 'ro', label: 'Romanian' },
    { id: 'hu', label: 'Hungarian' },
    { id: 'id', label: 'Indonesian' },
    { id: 'cs', label: 'Czech' },
    { id: 'bg', label: 'Bulgarian' },
    { id: 'ms', label: 'Malay' },
    { id: 'ta', label: 'Tamil' },
  ],
  'cartesia': [
    { id: 'en', label: 'English' },
    { id: 'es', label: 'Spanish' },
    { id: 'fr', label: 'French' },
    { id: 'de', label: 'German' },
    { id: 'it', label: 'Italian' },
    { id: 'pt', label: 'Portuguese' },
    { id: 'nl', label: 'Dutch' },
    { id: 'pl', label: 'Polish' },
    { id: 'ru', label: 'Russian' },
    { id: 'ja', label: 'Japanese' },
    { id: 'ko', label: 'Korean' },
    { id: 'zh', label: 'Chinese' },
    { id: 'hi', label: 'Hindi' },
    { id: 'ar', label: 'Arabic' },
    { id: 'tr', label: 'Turkish' },
    { id: 'sv', label: 'Swedish' },
    { id: 'da', label: 'Danish' },
    { id: 'fi', label: 'Finnish' },
    { id: 'th', label: 'Thai' },
    { id: 'vi', label: 'Vietnamese' },
  ],
}

const LLM_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', icon: '🟢' },
  { id: 'anthropic', label: 'Anthropic', icon: '🟠' },
  { id: 'google', label: 'Google', icon: '🔵' },
  { id: 'groq', label: 'Groq', icon: '🟣' },
  { id: 'deepseek', label: 'DeepSeek', icon: '🔷' },
  { id: 'mistral', label: 'Mistral', icon: '🟡' },
]

// Latency estimates per component (ms)
const STT_LATENCY = {
  deepgram: 800,
  'assembly-ai': 1000,
  azure: 900,
  '11labs': 700,
  gladia: 900,
  google: 850,
  openai: 700,
  speechmatics: 850,
  talkscriber: 1000,
  cartesia: 750,
}
const TTS_LATENCY = { vapi: 500, '11labs': 500 }

const MODELS_BY_PROVIDER = {
  'openai': [
    { model: 'gpt-4o', label: 'GPT-4o', llmLatency: 700 },
    { model: 'gpt-4o-mini', label: 'GPT-4o Mini', llmLatency: 400 },
    { model: 'gpt-4-turbo', label: 'GPT-4 Turbo', llmLatency: 1200 },
    { model: 'gpt-4', label: 'GPT-4', llmLatency: 2000 },
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

const MAX_LATENCY = 5000 // ms

function getModelLatency(provider, model, voiceProv, sttProv) {
  const models = MODELS_BY_PROVIDER[provider] || []
  const m = models.find(entry => entry.model === model)
  if (!m) return null
  const stt = STT_LATENCY[sttProv] || STT_LATENCY.deepgram
  const tts = TTS_LATENCY[voiceProv] || TTS_LATENCY.vapi
  return { stt, sttProvider: sttProv || 'deepgram', model: m.llmLatency, tts, total: stt + m.llmLatency + tts }
}

const VOICE_PROVIDERS = [
  { id: 'vapi', label: 'VAPI Voices (Free)', icon: '◯' },
  { id: '11labs', label: 'ElevenLabs', icon: '||' },
]

const VOICES_BY_PROVIDER = {
  'vapi': [
    { voiceId: 'Lily', name: 'Lily (Female)' },
    { voiceId: 'Kylie', name: 'Kylie (Female)' },
    { voiceId: 'Savannah', name: 'Savannah (Female)' },
    { voiceId: 'Hana', name: 'Hana (Female)' },
    { voiceId: 'Neha', name: 'Neha (Female)' },
    { voiceId: 'Paige', name: 'Paige (Female)' },
    { voiceId: 'Leah', name: 'Leah (Female)' },
    { voiceId: 'Tara', name: 'Tara (Female)' },
    { voiceId: 'Jess', name: 'Jess (Female)' },
    { voiceId: 'Mia', name: 'Mia (Female)' },
    { voiceId: 'Zoe', name: 'Zoe (Female)' },
    { voiceId: 'Elliot', name: 'Elliot (Male)' },
    { voiceId: 'Rohan', name: 'Rohan (Male)' },
    { voiceId: 'Cole', name: 'Cole (Male)' },
    { voiceId: 'Harry', name: 'Harry (Male)' },
    { voiceId: 'Spencer', name: 'Spencer (Male)' },
    { voiceId: 'Leo', name: 'Leo (Male)' },
    { voiceId: 'Dan', name: 'Dan (Male)' },
    { voiceId: 'Zac', name: 'Zac (Male)' },
  ],
  '11labs': [
    { voiceId: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily - velvety actress' },
    { voiceId: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel - calm female' },
    { voiceId: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella - soft female' },
    { voiceId: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli - emotional female' },
    { voiceId: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda - friendly female' },
    { voiceId: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura - upbeat female' },
    { voiceId: 'jsCqWAovK2LkecY7zXl4', name: 'Freya - expressive female' },
    { voiceId: 'cgSgspJ2msm6clMCkdW9', name: 'Jessica - expressive female' },
    { voiceId: 'iP95p4xoKVk53GoZ742B', name: 'Chris - casual male' },
    { voiceId: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel - authoritative male' },
    { voiceId: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh - deep male' },
    { voiceId: 'ErXwobaYiN019PkySvjV', name: 'Antoni - well-rounded male' },
    { voiceId: 'pNInz6obpgDQGcFmaJgB', name: 'Adam - deep male' },
    { voiceId: 'flq6f7yk4E4fJM5XTYuZ', name: 'Michael - narrator male' },
    { voiceId: 'JBFqnCBsd6RMkjVDRZzb', name: 'George - British male' },
    { voiceId: 'nPczCjzI2devNBz1zQrb', name: 'Brian - deep male' },
  ],
}


const TOOL_TYPES = [
  { id: 'function', label: 'Custom Function (Webhook)' },
  { id: 'transferCall', label: 'Transfer Call' },
  { id: 'endCall', label: 'End Call' },
]

const TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Phoenix',
  'America/Anchorage',
  'Pacific/Honolulu',
  'America/Toronto',
  'America/Vancouver',
  'America/Mexico_City',
  'America/Sao_Paulo',
  'America/Buenos_Aires',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Rome',
  'Europe/Amsterdam',
  'Europe/Moscow',
  'Asia/Dubai',
  'Asia/Mumbai',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Sydney',
  'Australia/Melbourne',
  'Pacific/Auckland',
]

const TRANSFER_DESTINATION_TYPES = [
  { id: 'number', label: 'Phone Number' },
  { id: 'sip', label: 'SIP Endpoint' },
  { id: 'assistant', label: 'Another Assistant' },
]

const DEFAULT_SERVER_MESSAGES = [
  'conversation-update',
  'end-of-call-report',
  'function-call',
  'hang',
  'model-output',
  'phone-call-control',
  'speech-update',
  'status-update',
  'transcript',
  'tool-calls',
  'transfer-destination-request',
  'user-interrupted',
  'voice-input'
]

export default function AgentEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [agent, setAgent] = useState(null)
  const [agentType, setAgentType] = useState('outbound')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [modelProvider, setModelProvider] = useState('openai')
  const [modelName, setModelName] = useState('gpt-4o')
  const [voiceProvider, setVoiceProvider] = useState('vapi')
  const [voiceId, setVoiceId] = useState('Lily')
  const [addVoiceManually, setAddVoiceManually] = useState(false)
  const [customVoiceId, setCustomVoiceId] = useState('')

  // Transcriber settings
  const [transcriberProvider, setTranscriberProvider] = useState('deepgram')
  const [transcriberLanguage, setTranscriberLanguage] = useState('multi')

  // Prompt generator
  const [showPromptGenerator, setShowPromptGenerator] = useState(false)
  const [promptDescription, setPromptDescription] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  // Feature toggles
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [showAdvancedModal, setShowAdvancedModal] = useState(false)

  // Calendar settings (GoHighLevel)
  const [calendarConfig, setCalendarConfig] = useState({
    enabled: false,
    calendarId: '',
    timezone: 'America/New_York',
    enableGetContact: true,
    enableCreateContact: true,
    enableCheckAvailability: true,
    enableCreateEvent: true
  })

  // GHL Integration state
  const [ghlStatus, setGhlStatus] = useState({ isConnected: false, locationId: null, locationName: null })
  const [ghlCalendars, setGhlCalendars] = useState([])
  const [ghlCalendarsLoading, setGhlCalendarsLoading] = useState(false)
  const [ghlError, setGhlError] = useState('')

  // Voice settings (ElevenLabs)
  const [voiceSettings, setVoiceSettings] = useState({
    model: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 1,
    style: 0,
    useSpeakerBoost: false,
    optimizeLatency: 0,
    inputMinCharacters: 30,
    backgroundSound: 'off',
    backgroundSoundVolume: 0.5
  })


  // Tools section
  const [tools, setTools] = useState([])
  const [showToolModal, setShowToolModal] = useState(false)
  const [editingTool, setEditingTool] = useState(null)
  const [editingToolIndex, setEditingToolIndex] = useState(null)
  const [toolForm, setToolForm] = useState({
    type: 'function',
    functionName: '',
    functionDescription: '',
    functionParameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
    webhookUrl: '',
    async: false,
    destinationType: 'number',
    destinationValue: '',
    endCallMessage: ''
  })

  // Server/Post-call configuration
  const [serverConfig, setServerConfig] = useState({
    serverUrl: '',
    serverUrlSecret: '',
    serverMessages: ['end-of-call-report'],
    summaryEnabled: true,
    summaryPrompt: '',
    successEvaluationEnabled: false,
    successEvaluationRubric: '',
    successEvaluationPrompt: '',
    structuredDataEnabled: false,
    structuredDataSchema: '{\n  "type": "object",\n  "properties": {}\n}',
    structuredDataPrompt: '',
    recordingEnabled: true,
    transcriptEnabled: true
  })

  // Call section
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [selectedPhone, setSelectedPhone] = useState('')
  const [customerNumber, setCustomerNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [calling, setCalling] = useState(false)
  const [callStatus, setCallStatus] = useState('')
  const [userCredits, setUserCredits] = useState(null)
  const [showCallModal, setShowCallModal] = useState(false)

  useEffect(() => {
    fetchAgent()
    fetchPhoneNumbers()
    fetchCredits()
    fetchGhlStatus()
  }, [id])

  const fetchGhlStatus = async () => {
    try {
      const response = await ghlAPI.getStatus()
      setGhlStatus(response.data)
    } catch (err) {
      console.error('Failed to fetch GHL status:', err)
    }
  }

  const fetchGhlCalendars = async () => {
    setGhlCalendarsLoading(true)
    setGhlError('')
    try {
      const response = await ghlAPI.getCalendars()
      setGhlCalendars(response.data.calendars || [])
    } catch (err) {
      setGhlError(err.response?.data?.error || 'Failed to fetch calendars')
      setGhlCalendars([])
    } finally {
      setGhlCalendarsLoading(false)
    }
  }

  const handleOpenCalendarModal = () => {
    setShowCalendarModal(true)
    if (ghlStatus.isConnected) {
      fetchGhlCalendars()
    }
  }

  const fetchCredits = async () => {
    try {
      const response = await creditsAPI.list()
      const users = response.data.users || []
      const currentUser = users.find(u => u.id === user?.id)
      if (currentUser) {
        setUserCredits(currentUser.vapiCredits || 0)
      } else if (users.length > 0) {
        setUserCredits(users[0].vapiCredits || 0)
      }
    } catch (err) {
      console.error('Failed to fetch credits:', err)
    }
  }

  const fetchAgent = async () => {
    try {
      const response = await agentsAPI.get(id)
      const agentData = response.data.agent
      setAgent(agentData)
      setName(agentData.name || '')
      setAgentType(agentData.agentType || agentData.config?.agentType || 'outbound')
      // Use base prompt if available (without auto-generated calendar instructions)
      setSystemPrompt(agentData.config?.systemPromptBase || agentData.config?.systemPrompt || '')
      setFirstMessage(agentData.config?.firstMessage || '')
      setLanguage(agentData.config?.language || 'en')
      setModelProvider(agentData.config?.modelProvider || 'openai')
      setModelName(agentData.config?.modelName || 'gpt-4o')
      const savedProvider = agentData.config?.voiceProvider || '11labs'
      setVoiceProvider(savedProvider)
      const savedVoiceId = agentData.config?.voiceId || 'pFZP5JQG7iQjIQuC4Bku'
      setVoiceId(savedVoiceId)

      // Check if it's a custom voice ID
      const providerVoices = VOICES_BY_PROVIDER[savedProvider] || []
      const isKnownVoice = providerVoices.some(v => v.voiceId === savedVoiceId)
      if (!isKnownVoice && savedVoiceId) {
        setAddVoiceManually(true)
        setCustomVoiceId(savedVoiceId)
      }

      // Load transcriber config
      if (agentData.config?.transcriberProvider) {
        setTranscriberProvider(agentData.config.transcriberProvider)
      }
      if (agentData.config?.transcriberLanguage) {
        setTranscriberLanguage(agentData.config.transcriberLanguage)
      }

      // Load calendar config
      if (agentData.config?.calendarConfig) {
        setCalendarConfig(agentData.config.calendarConfig)
      }

      // Load voice settings
      if (agentData.config) {
        setVoiceSettings({
          model: agentData.config.elevenLabsModel || 'eleven_multilingual_v2',
          stability: agentData.config.stability ?? 0.5,
          similarityBoost: agentData.config.similarityBoost ?? 0.75,
          speed: agentData.config.speed ?? 1,
          style: agentData.config.style ?? 0,
          useSpeakerBoost: agentData.config.useSpeakerBoost || false,
          optimizeLatency: agentData.config.optimizeLatency ?? 0,
          inputMinCharacters: agentData.config.inputMinCharacters ?? 30,
          backgroundSound: agentData.config.backgroundSound || 'off',
          backgroundSoundVolume: agentData.config.backgroundSoundVolume ?? 0.5
        })
      }


      // Load tools
      setTools(agentData.config?.tools || [])

      // Load server config
      if (agentData.config?.serverUrl || agentData.config?.serverConfig) {
        const cfg = agentData.config
        setServerConfig({
          serverUrl: cfg.serverUrl || '',
          serverUrlSecret: cfg.serverUrlSecret || '',
          serverMessages: cfg.serverMessages || ['end-of-call-report'],
          summaryEnabled: cfg.summaryEnabled ?? true,
          summaryPrompt: cfg.summaryPrompt || '',
          successEvaluationEnabled: cfg.successEvaluationEnabled || false,
          successEvaluationRubric: cfg.successEvaluationRubric || '',
          successEvaluationPrompt: cfg.successEvaluationPrompt || '',
          structuredDataEnabled: cfg.structuredDataEnabled || false,
          structuredDataSchema: cfg.structuredDataSchema || '{\n  "type": "object",\n  "properties": {}\n}',
          structuredDataPrompt: cfg.structuredDataPrompt || '',
          recordingEnabled: cfg.recordingEnabled ?? true,
          transcriptEnabled: cfg.transcriptEnabled ?? true
        })
      }
    } catch (err) {
      setError('Failed to load agent')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const fetchPhoneNumbers = async () => {
    try {
      const response = await phoneNumbersAPI.list()
      const allNumbers = response.data.phoneNumbers || []
      setPhoneNumbers(allNumbers)
      const vapiNumber = allNumbers.find(p => p.vapiPhoneNumberId)
      if (vapiNumber) {
        setSelectedPhone(vapiNumber.id.toString())
      } else if (allNumbers.length > 0) {
        setSelectedPhone(allNumbers[0].id.toString())
      }
    } catch (err) {
      console.error('Failed to fetch phone numbers:', err)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const finalVoiceId = addVoiceManually ? customVoiceId : voiceId

      // Build GoHighLevel calendar tools using our custom API endpoints
      const calendarTools = []
      const apiBaseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api'

      if (calendarConfig.enabled && calendarConfig.calendarId) {
        // Build query params for the webhook URLs (VAPI doesn't support server.body)
        const queryParams = new URLSearchParams({
          calendarId: calendarConfig.calendarId,
          timezone: calendarConfig.timezone || 'America/New_York',
          userId: user?.id?.toString() || ''
        }).toString()

        // Check Availability Tool
        if (calendarConfig.enableCheckAvailability) {
          calendarTools.push({
            type: 'function',
            function: {
              name: 'check_calendar_availability',
              description: 'Check available appointment slots on a specific date. Use this when the customer wants to know what times are available for booking.',
              parameters: {
                type: 'object',
                properties: {
                  date: {
                    type: 'string',
                    description: 'The date to check availability for in YYYY-MM-DD format (e.g., 2024-01-15)'
                  }
                },
                required: ['date']
              }
            },
            server: {
              url: `${apiBaseUrl}/ghl/check-availability?${queryParams}`,
              timeoutSeconds: 30
            },
            async: false,
            messages: [
              {
                type: 'request-start',
                content: 'Let me check what times are available on that date...'
              }
            ]
          })
        }

        // Book Appointment Tool
        if (calendarConfig.enableCreateEvent) {
          calendarTools.push({
            type: 'function',
            function: {
              name: 'book_appointment',
              description: 'Book an appointment for the customer. Use this after confirming the date, time, and collecting customer contact information.',
              parameters: {
                type: 'object',
                properties: {
                  startTime: {
                    type: 'string',
                    description: 'The appointment start time in ISO 8601 format (e.g., 2024-01-15T10:00:00)'
                  },
                  contactName: {
                    type: 'string',
                    description: 'The customer\'s full name'
                  },
                  contactEmail: {
                    type: 'string',
                    description: 'The customer\'s email address'
                  },
                  contactPhone: {
                    type: 'string',
                    description: 'The customer\'s phone number (optional)'
                  },
                  notes: {
                    type: 'string',
                    description: 'Any additional notes for the appointment (optional)'
                  }
                },
                required: ['startTime', 'contactName', 'contactEmail']
              }
            },
            server: {
              url: `${apiBaseUrl}/ghl/book-appointment?${queryParams}`,
              timeoutSeconds: 30
            },
            async: false,
            messages: [
              {
                type: 'request-start',
                content: 'Perfect, let me book that appointment for you...'
              }
            ]
          })
        }
      }

      // Merge regular tools with calendar tools
      const allTools = [...tools, ...calendarTools]

      // Generate calendar booking instructions if calendar is enabled
      let finalSystemPrompt = systemPrompt
      if (calendarConfig.enabled && calendarConfig.calendarId) {
        const calendarInstructions = `

## APPOINTMENT BOOKING INSTRUCTIONS

You have access to calendar booking tools. Follow these steps when a customer wants to book an appointment:

1. **Check Availability First**: When the customer mentions wanting to book or schedule an appointment, ask them for their preferred date. Then use the "check_calendar_availability" function to see available time slots.

2. **Present Options**: After checking availability, present the available times to the customer in a friendly way. For example: "I have these times available on [date]: 9:00 AM, 10:30 AM, 2:00 PM. Which works best for you?"

3. **Collect Information**: Once they choose a time, collect their information:
   - Full name
   - Email address
   - Phone number (optional but recommended)

4. **Book the Appointment**: Use the "book_appointment" function with all the collected information to complete the booking.

5. **Confirm**: After booking, confirm the appointment details with the customer including the date, time, and that they'll receive a confirmation email.

Important:
- Always confirm the date and time before booking
- If no slots are available on their preferred date, offer to check another date
- Be helpful and conversational throughout the process`

        // Append calendar instructions to the system prompt
        finalSystemPrompt = systemPrompt + calendarInstructions
      }

      await agentsAPI.update(id, {
        name,
        agentType,
        config: {
          agentType,
          systemPrompt: finalSystemPrompt,
          systemPromptBase: systemPrompt, // Store original prompt without calendar instructions
          firstMessage,
          language,
          modelProvider,
          modelName,
          voiceProvider,
          voiceId: finalVoiceId,
          transcriberProvider,
          transcriberLanguage,
          calendarConfig,
          // Voice settings
          elevenLabsModel: voiceSettings.model,
          stability: voiceSettings.stability,
          similarityBoost: voiceSettings.similarityBoost,
          speed: voiceSettings.speed,
          style: voiceSettings.style,
          useSpeakerBoost: voiceSettings.useSpeakerBoost,
          optimizeLatency: voiceSettings.optimizeLatency,
          inputMinCharacters: voiceSettings.inputMinCharacters,
          backgroundSound: voiceSettings.backgroundSound,
          backgroundSoundVolume: voiceSettings.backgroundSoundVolume,
          tools: allTools,
          ...(serverConfig.serverUrl && {
            serverUrl: serverConfig.serverUrl,
            serverUrlSecret: serverConfig.serverUrlSecret,
            serverMessages: serverConfig.serverMessages,
            summaryEnabled: serverConfig.summaryEnabled,
            summaryPrompt: serverConfig.summaryPrompt,
            successEvaluationEnabled: serverConfig.successEvaluationEnabled,
            successEvaluationRubric: serverConfig.successEvaluationRubric,
            successEvaluationPrompt: serverConfig.successEvaluationPrompt,
            structuredDataEnabled: serverConfig.structuredDataEnabled,
            structuredDataSchema: serverConfig.structuredDataSchema,
            structuredDataPrompt: serverConfig.structuredDataPrompt,
            recordingEnabled: serverConfig.recordingEnabled,
            transcriptEnabled: serverConfig.transcriptEnabled
          })
        }
      })
      setSuccess('Agent saved successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save agent')
    } finally {
      setSaving(false)
    }
  }

  const handleCall = async () => {
    if (!selectedPhone || !customerNumber) {
      setCallStatus('Please select a phone number and enter customer number')
      return
    }

    if (!agent?.vapiId) {
      setCallStatus('Agent is not connected to VAPI. Please create a new agent.')
      return
    }

    const selectedPhoneData = phoneNumbers.find(p => p.id.toString() === selectedPhone)
    if (!selectedPhoneData?.vapiPhoneNumberId) {
      setCallStatus('Selected phone number is not connected to VAPI.')
      return
    }

    setCalling(true)
    setCallStatus('')

    try {
      const response = await callsAPI.create({
        agentId: agent.id,
        phoneNumberId: parseInt(selectedPhone),
        customerNumber,
        customerName
      })
      setCallStatus(`Call initiated! Call ID: ${response.data.call.id}`)
      setCustomerNumber('')
      setCustomerName('')
    } catch (err) {
      setCallStatus(err.response?.data?.error || 'Failed to initiate call')
    } finally {
      setCalling(false)
    }
  }

  const handleProviderChange = (newProvider) => {
    setVoiceProvider(newProvider)
    // Set first voice of the new provider as default
    const providerVoices = VOICES_BY_PROVIDER[newProvider] || []
    if (providerVoices.length > 0 && !addVoiceManually) {
      setVoiceId(providerVoices[0].voiceId)
    }
  }

  const copyPrompt = () => {
    navigator.clipboard.writeText(systemPrompt)
    setSuccess('Prompt copied to clipboard')
    setTimeout(() => setSuccess(''), 2000)
  }

  const handleGeneratePrompt = async () => {
    if (!promptDescription.trim()) return
    setGeneratingPrompt(true)
    setGeneratedPrompt('')
    try {
      const { data } = await promptGeneratorAPI.generate({
        description: promptDescription,
        agentType
      })
      setGeneratedPrompt(data.prompt)
    } catch (err) {
      setError('Failed to generate prompt')
      setTimeout(() => setError(''), 3000)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const handleUseGeneratedPrompt = () => {
    setSystemPrompt(generatedPrompt)
    setShowPromptGenerator(false)
    setPromptDescription('')
    setGeneratedPrompt('')
  }

  // Tool management functions
  const resetToolForm = () => {
    setToolForm({
      type: 'function',
      functionName: '',
      functionDescription: '',
      functionParameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
      webhookUrl: '',
      async: false,
      destinationType: 'number',
      destinationValue: '',
      endCallMessage: ''
    })
  }

  const openAddToolModal = () => {
    resetToolForm()
    setEditingTool(null)
    setEditingToolIndex(null)
    setShowAdvancedModal(false)
    setShowToolModal(true)
  }

  const openEditToolModal = (tool, index) => {
    setEditingTool(tool)
    setEditingToolIndex(index)

    if (tool.type === 'function') {
      setToolForm({
        type: 'function',
        functionName: tool.function?.name || '',
        functionDescription: tool.function?.description || '',
        functionParameters: JSON.stringify(tool.function?.parameters || {}, null, 2),
        webhookUrl: tool.server?.url || '',
        async: tool.async || false,
        destinationType: 'number',
        destinationValue: '',
        endCallMessage: ''
      })
    } else if (tool.type === 'transferCall') {
      const dest = tool.destinations?.[0] || {}
      setToolForm({
        type: 'transferCall',
        functionName: '',
        functionDescription: '',
        functionParameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
        webhookUrl: '',
        async: false,
        destinationType: dest.type || 'number',
        destinationValue: dest.number || dest.sipUri || dest.assistantId || '',
        endCallMessage: ''
      })
    } else if (tool.type === 'endCall') {
      setToolForm({
        type: 'endCall',
        functionName: '',
        functionDescription: '',
        functionParameters: '{\n  "type": "object",\n  "properties": {},\n  "required": []\n}',
        webhookUrl: '',
        async: false,
        destinationType: 'number',
        destinationValue: '',
        endCallMessage: tool.messages?.[0]?.content || ''
      })
    }

    setShowAdvancedModal(false)
    setShowToolModal(true)
  }

  const handleSaveTool = () => {
    let newTool = {}

    if (toolForm.type === 'function') {
      if (!toolForm.functionName || !toolForm.functionDescription || !toolForm.webhookUrl) {
        setError('Function name, description, and webhook URL are required')
        return
      }

      let parameters = {}
      try {
        parameters = JSON.parse(toolForm.functionParameters)
      } catch (e) {
        setError('Invalid JSON in parameters field')
        return
      }

      newTool = {
        type: 'function',
        function: {
          name: toolForm.functionName,
          description: toolForm.functionDescription,
          parameters
        },
        server: { url: toolForm.webhookUrl },
        async: toolForm.async
      }
    } else if (toolForm.type === 'transferCall') {
      if (!toolForm.destinationValue) {
        setError('Destination is required')
        return
      }

      const destination = { type: toolForm.destinationType }
      if (toolForm.destinationType === 'number') {
        destination.number = toolForm.destinationValue
      } else if (toolForm.destinationType === 'sip') {
        destination.sipUri = toolForm.destinationValue
      } else if (toolForm.destinationType === 'assistant') {
        destination.assistantId = toolForm.destinationValue
      }

      newTool = { type: 'transferCall', destinations: [destination] }
    } else if (toolForm.type === 'endCall') {
      newTool = { type: 'endCall' }
      if (toolForm.endCallMessage) {
        newTool.messages = [{ type: 'request-complete', content: toolForm.endCallMessage }]
      }
    }

    if (editingToolIndex !== null) {
      const updatedTools = [...tools]
      updatedTools[editingToolIndex] = newTool
      setTools(updatedTools)
    } else {
      setTools([...tools, newTool])
    }

    setShowToolModal(false)
    setShowAdvancedModal(true)
    resetToolForm()
    setError('')
  }

  const handleDeleteTool = (index) => {
    setTools(tools.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!agent) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Agent not found</h2>
          <button
            onClick={() => navigate('/dashboard/agents')}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            Back to Agents
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 py-3 text-sm text-gray-500">
        <span>Saved Agents</span>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard')} className="hover:text-primary-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <span>/</span>
          <span>Saved Agents</span>
        </div>
      </div>

      {/* Main Card */}
      <div className="mx-6 mb-6 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
              Edit - {name || 'AI Conversation Assistant'}
            </h1>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${agentType === 'inbound' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
              {agentType === 'inbound' ? 'Inbound' : 'Outbound'}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${agent.vapiId ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {agent.vapiId ? 'Connected' : 'Local'}
            </span>
          </div>
          <button
            onClick={() => navigate('/dashboard/agents')}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Error/Success Messages */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}
          {success && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
              {success}
            </div>
          )}

          {/* Language Row */}
          <div>
            <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
              Change Language
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </label>
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">Languages</label>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                {LANGUAGES.map(lang => (
                  <option key={lang.id} value={lang.id}>{lang.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* AI Provider & Model Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                AI Provider
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <div className="relative">
                <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">Select Provider</label>
                <select
                  value={modelProvider}
                  onChange={(e) => {
                    const newProvider = e.target.value
                    setModelProvider(newProvider)
                    // Set first model of the new provider as default
                    const providerModels = MODELS_BY_PROVIDER[newProvider] || []
                    if (providerModels.length > 0) {
                      setModelName(providerModels[0].model)
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {LLM_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.icon} {p.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                AI Model
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <div className="relative">
                <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">Select Model</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {(MODELS_BY_PROVIDER[modelProvider] || []).map(m => {
                    const lat = getModelLatency(modelProvider, m.model, voiceProvider, transcriberProvider)
                    return (
                      <option key={m.model} value={m.model}>
                        {m.label} · {lat ? `~${lat.total}ms` : ''}
                      </option>
                    )
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Opening Message */}
          <div>
            <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
              Opening Message
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </label>
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">Opening Message</label>
              <input
                type="text"
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="Hello! How can I help you today?"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Voice Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Provider */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Provider</label>
              <div className="relative">
                <select
                  value={voiceProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  disabled={addVoiceManually}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {VOICE_PROVIDERS.map(provider => (
                    <option key={provider.id} value={provider.id}>
                      {provider.icon} {provider.label} · {TTS_LATENCY[provider.id] || TTS_LATENCY.vapi}ms
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Voice */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Voice</label>
              <div className="relative">
                {addVoiceManually ? (
                  <input
                    type="text"
                    value={customVoiceId}
                    onChange={(e) => setCustomVoiceId(e.target.value)}
                    placeholder="Enter Voice ID..."
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                ) : (
                  <>
                    <select
                      value={voiceId}
                      onChange={(e) => setVoiceId(e.target.value)}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer"
                    >
                      {(VOICES_BY_PROVIDER[voiceProvider] || []).map(voice => (
                        <option key={voice.voiceId} value={voice.voiceId}>
                          {voice.name}
                        </option>
                      ))}
                    </select>
                    <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Add Voice ID Manually */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="addVoiceManually"
              checked={addVoiceManually}
              onChange={(e) => setAddVoiceManually(e.target.checked)}
              className="w-4 h-4 text-primary-600 bg-gray-100 border-gray-300 rounded focus:ring-primary-500 dark:bg-dark-card dark:border-dark-border"
            />
            <label htmlFor="addVoiceManually" className="text-sm text-gray-600 dark:text-gray-400">
              Add Voice ID Manually
            </label>
          </div>

          {/* Transcriber Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transcriber Provider */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Transcriber</label>
              <div className="relative">
                <select
                  value={transcriberProvider}
                  onChange={(e) => {
                    const newProvider = e.target.value
                    setTranscriberProvider(newProvider)
                    // Reset language to first available for new provider
                    const languages = TRANSCRIBER_LANGUAGES[newProvider] || []
                    if (languages.length > 0) {
                      setTranscriberLanguage(languages[0].id)
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer"
                >
                  {TRANSCRIBER_PROVIDERS.map(provider => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label} · {STT_LATENCY[provider.id] || 800}ms
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Transcriber Language */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">Transcriber Language</label>
              <div className="relative">
                <select
                  value={transcriberLanguage}
                  onChange={(e) => setTranscriberLanguage(e.target.value)}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer"
                >
                  {(TRANSCRIBER_LANGUAGES[transcriberProvider] || []).map(lang => (
                    <option key={lang.id} value={lang.id}>
                      {lang.label}
                    </option>
                  ))}
                </select>
                <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Latency Indicator */}
          {(() => {
            const latency = getModelLatency(modelProvider, modelName, voiceProvider, transcriberProvider)
            if (!latency) return null
            const sttLabel = (TRANSCRIBER_PROVIDERS.find(t => t.id === latency.sttProvider) || {}).label || 'Deepgram'
            const ttsLabel = voiceProvider === '11labs' ? 'ElevenLabs' : 'VAPI'
            const segments = [
              { label: `STT (${sttLabel})`, value: latency.stt, color: '#3b82f6', max: MAX_LATENCY, suffix: 'ms' },
              { label: 'Model (LLM)', value: latency.model, color: '#f97316', max: MAX_LATENCY, suffix: 'ms' },
              { label: `TTS (${ttsLabel})`, value: latency.tts, color: '#60a5fa', max: MAX_LATENCY, suffix: 'ms' },
            ]
            return (
              <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">Latency</span>
                  <span className="text-sm font-semibold text-gray-900 dark:text-white">~{latency.total}ms</span>
                </div>
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100 dark:bg-gray-700/50 relative">
                  {segments.map((seg, i) => (
                    <div
                      key={seg.label}
                      className="relative h-full cursor-pointer transition-all duration-300"
                      style={{ width: `${(seg.value / seg.max) * 100}%`, backgroundColor: seg.color }}
                      title={`${seg.label}: ${seg.value}${seg.suffix}`}
                    />
                  ))}
                </div>
                <div className="flex gap-3 mt-2.5 flex-wrap">
                  {segments.map((seg, i) => (
                    <span key={seg.label} className="flex items-center gap-1 text-[10px] text-gray-500 dark:text-gray-400">
                      <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: seg.color }} />
                      {seg.label} · {seg.value}ms
                    </span>
                  ))}
                </div>
              </div>
            )
          })()}

          {/* Feature Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Calendar Options */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                Calendar Options
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <button
                onClick={handleOpenCalendarModal}
                className={`p-4 rounded-xl border-2 transition-all ${
                  calendarConfig.enabled
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                }`}
              >
                <svg className={`w-8 h-8 mx-auto ${calendarConfig.enabled ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </button>
              {calendarConfig.enabled && (
                <p className="text-xs mt-1 text-green-600">GoHighLevel Connected</p>
              )}
            </div>

            {/* Advanced Options */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                Advanced Options
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <button
                onClick={() => setShowAdvancedModal(true)}
                className="p-4 rounded-xl border-2 border-gray-200 dark:border-dark-border hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-all"
              >
                <svg className="w-8 h-8 mx-auto text-gray-400 hover:text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </button>
            </div>
          </div>

          {/* Prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">Prompt</label>
              <button
                type="button"
                onClick={() => setShowPromptGenerator(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                Generate with AI
              </button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={12}
              placeholder="Enter your agent's instructions here..."
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm"
            />
          </div>

        </div>

        {/* Bottom Actions */}
        <div className="flex items-center gap-4 px-6 py-4 border-t border-gray-200 dark:border-dark-border">
          <button
            onClick={copyPrompt}
            className="flex items-center gap-2 px-4 py-2 text-sm text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Copy
          </button>
          <button
            onClick={() => setShowCallModal(true)}
            disabled={!agent.vapiId}
            className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Launch A Call
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Saving...
              </>
            ) : (
              'Save Agent'
            )}
          </button>
        </div>
      </div>

      {/* Call Modal */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Launch A Call</h3>
              <button onClick={() => setShowCallModal(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {userCredits !== null && (
                <div className={`text-sm ${userCredits > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  Available Credits: ${userCredits.toFixed(2)}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">From Phone Number</label>
                <select
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                >
                  {phoneNumbers.map((phone) => (
                    <option key={phone.id} value={phone.id}>
                      {phone.phoneNumber} {phone.vapiPhoneNumberId ? '✓' : '⚠'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Customer Phone Number</label>
                <input
                  type="tel"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Customer Name (Optional)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                />
              </div>
              {callStatus && (
                <div className={`text-sm p-3 rounded-lg ${callStatus.includes('initiated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {callStatus}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowCallModal(false)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleCall}
                disabled={calling || !customerNumber}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {calling ? 'Calling...' : 'Start Call'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Modal */}
      {showToolModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingTool ? 'Edit Tool' : 'Add Tool'}
              </h3>
              <button onClick={() => { setShowToolModal(false); resetToolForm(); setShowAdvancedModal(true); }} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Tool Type</label>
                <select
                  value={toolForm.type}
                  onChange={(e) => setToolForm({ ...toolForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                >
                  {TOOL_TYPES.map(t => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              {toolForm.type === 'function' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Function Name *</label>
                    <input
                      type="text"
                      value={toolForm.functionName}
                      onChange={(e) => setToolForm({ ...toolForm, functionName: e.target.value })}
                      placeholder="book_appointment"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Description *</label>
                    <input
                      type="text"
                      value={toolForm.functionDescription}
                      onChange={(e) => setToolForm({ ...toolForm, functionDescription: e.target.value })}
                      placeholder="Schedule a customer appointment"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Webhook URL *</label>
                    <input
                      type="url"
                      value={toolForm.webhookUrl}
                      onChange={(e) => setToolForm({ ...toolForm, webhookUrl: e.target.value })}
                      placeholder="https://your-server.com/webhook"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Parameters (JSON)</label>
                    <textarea
                      value={toolForm.functionParameters}
                      onChange={(e) => setToolForm({ ...toolForm, functionParameters: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {toolForm.type === 'transferCall' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Destination Type</label>
                    <select
                      value={toolForm.destinationType}
                      onChange={(e) => setToolForm({ ...toolForm, destinationType: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    >
                      {TRANSFER_DESTINATION_TYPES.map(t => (
                        <option key={t.id} value={t.id}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">
                      {toolForm.destinationType === 'number' ? 'Phone Number' : toolForm.destinationType === 'sip' ? 'SIP URI' : 'Assistant ID'} *
                    </label>
                    <input
                      type="text"
                      value={toolForm.destinationValue}
                      onChange={(e) => setToolForm({ ...toolForm, destinationValue: e.target.value })}
                      placeholder={toolForm.destinationType === 'number' ? '+14155552671' : toolForm.destinationType === 'sip' ? 'sip:user@domain.com' : 'assistant_id'}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                </>
              )}

              {toolForm.type === 'endCall' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">End Message (Optional)</label>
                  <input
                    type="text"
                    value={toolForm.endCallMessage}
                    onChange={(e) => setToolForm({ ...toolForm, endCallMessage: e.target.value })}
                    placeholder="Goodbye! Have a great day."
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => { setShowToolModal(false); resetToolForm(); setShowAdvancedModal(true); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTool}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                {editingTool ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Options Modal (GoHighLevel) */}
      {showCalendarModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Calendar Options (GoHighLevel)</h3>
              <button onClick={() => setShowCalendarModal(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {!ghlStatus.isConnected ? (
                /* Not Connected State */
                <div className="text-center py-6">
                  <div className="w-16 h-16 bg-yellow-100 dark:bg-yellow-900/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <h4 className="text-lg font-medium text-gray-900 dark:text-white mb-2">GoHighLevel Not Connected</h4>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Connect your GoHighLevel account in Settings to enable calendar features.
                  </p>
                  <button
                    onClick={() => {
                      setShowCalendarModal(false)
                      navigate('/dashboard/settings?tab=ghl')
                    }}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    Go to Settings
                  </button>
                </div>
              ) : (
                <>
                  {/* Enable Calendar Integration */}
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable GoHighLevel Integration</label>
                    <button
                      onClick={() => setCalendarConfig({ ...calendarConfig, enabled: !calendarConfig.enabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        calendarConfig.enabled ? 'bg-green-600' : 'bg-gray-300'
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        calendarConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Connected location info */}
                  <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <p className="text-sm text-green-700 dark:text-green-300">
                        Connected to: <strong>{ghlStatus.locationName || 'GoHighLevel'}</strong>
                      </p>
                    </div>
                  </div>

                  {calendarConfig.enabled && (
                    <>
                      {ghlError && (
                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                          <p className="text-sm text-red-600 dark:text-red-400">{ghlError}</p>
                        </div>
                      )}

                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Calendar *</label>
                        {ghlCalendarsLoading ? (
                          <div className="flex items-center gap-2 py-2">
                            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                            <span className="text-sm text-gray-500">Loading calendars...</span>
                          </div>
                        ) : ghlCalendars.length > 0 ? (
                          <select
                            value={calendarConfig.calendarId}
                            onChange={(e) => {
                              const selectedCal = ghlCalendars.find(c => c.id === e.target.value)
                              setCalendarConfig({
                                ...calendarConfig,
                                calendarId: e.target.value,
                                timezone: selectedCal?.timezone || calendarConfig.timezone
                              })
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                          >
                            <option value="">Select a calendar</option>
                            {ghlCalendars.map(cal => (
                              <option key={cal.id} value={cal.id}>{cal.name}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="text-sm text-gray-500 py-2">
                            No calendars found. Create a calendar in GoHighLevel first.
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Timezone</label>
                        <select
                          value={calendarConfig.timezone}
                          onChange={(e) => setCalendarConfig({ ...calendarConfig, timezone: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                        >
                          {TIMEZONES.map(tz => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>

                      {/* Tool Toggles */}
                      <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Available Functions</h4>
                        <div className="space-y-3">
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={calendarConfig.enableGetContact}
                              onChange={(e) => setCalendarConfig({ ...calendarConfig, enableGetContact: e.target.checked })}
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <div>
                              <span className="text-sm text-gray-900 dark:text-white">Get Contact</span>
                              <p className="text-xs text-gray-500">Retrieve existing contacts by email/phone</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={calendarConfig.enableCreateContact}
                              onChange={(e) => setCalendarConfig({ ...calendarConfig, enableCreateContact: e.target.checked })}
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <div>
                              <span className="text-sm text-gray-900 dark:text-white">Create Contact</span>
                              <p className="text-xs text-gray-500">Create new contacts in GoHighLevel</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={calendarConfig.enableCheckAvailability}
                              onChange={(e) => setCalendarConfig({ ...calendarConfig, enableCheckAvailability: e.target.checked })}
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <div>
                              <span className="text-sm text-gray-900 dark:text-white">Check Availability</span>
                              <p className="text-xs text-gray-500">Query available time slots on calendar</p>
                            </div>
                          </label>
                          <label className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={calendarConfig.enableCreateEvent}
                              onChange={(e) => setCalendarConfig({ ...calendarConfig, enableCreateEvent: e.target.checked })}
                              className="w-4 h-4 text-green-600 rounded"
                            />
                            <div>
                              <span className="text-sm text-gray-900 dark:text-white">Create Event</span>
                              <p className="text-xs text-gray-500">Book appointments on the calendar</p>
                            </div>
                          </label>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowCalendarModal(false)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Advanced Options Modal */}
      {showAdvancedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-dark-card flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Advanced Options</h3>
              <button onClick={() => setShowAdvancedModal(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Voice Settings Section */}
              <div>
                <h4 className="font-medium text-gray-900 dark:text-white mb-4">Voice Settings (ElevenLabs)</h4>

                <div className="grid grid-cols-2 gap-4">
                  {/* ElevenLabs Model */}
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Model</label>
                    <select
                      value={voiceSettings.model}
                      onChange={(e) => setVoiceSettings({ ...voiceSettings, model: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                    >
                      <option value="eleven_multilingual_v2">Multilingual v2</option>
                      <option value="eleven_flash_v2_5">Flash v2.5</option>
                      <option value="eleven_flash_v2">Flash v2</option>
                      <option value="eleven_turbo_v2_5">Turbo v2.5</option>
                      <option value="eleven_turbo_v2">Turbo v2</option>
                    </select>
                  </div>

                  {/* Background Sound */}
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Background Sound</label>
                    <select
                      value={voiceSettings.backgroundSound}
                      onChange={(e) => setVoiceSettings({ ...voiceSettings, backgroundSound: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                    >
                      <option value="off">Off</option>
                      <option value="office">Office</option>
                    </select>
                  </div>
                </div>

                {/* Sliders */}
                <div className="space-y-4 mt-4">
                  {/* Stability */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>Stability</span>
                      <span>{voiceSettings.stability.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceSettings.stability}
                      onChange={(e) => setVoiceSettings({ ...voiceSettings, stability: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Variable</span>
                      <span>Stable</span>
                    </div>
                  </div>

                  {/* Similarity Boost */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>Clarity + Similarity</span>
                      <span>{voiceSettings.similarityBoost.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceSettings.similarityBoost}
                      onChange={(e) => setVoiceSettings({ ...voiceSettings, similarityBoost: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Low</span>
                      <span>High</span>
                    </div>
                  </div>

                  {/* Speed */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>Speed</span>
                      <span>{voiceSettings.speed.toFixed(1)}</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="1.2"
                      step="0.1"
                      value={voiceSettings.speed}
                      onChange={(e) => setVoiceSettings({ ...voiceSettings, speed: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>Slower</span>
                      <span>Faster</span>
                    </div>
                  </div>

                  {/* Style */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                      <span>Style Exaggeration</span>
                      <span>{voiceSettings.style.toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={voiceSettings.style}
                      onChange={(e) => setVoiceSettings({ ...voiceSettings, style: parseFloat(e.target.value) })}
                      className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-primary-600"
                    />
                    <div className="flex justify-between text-xs text-gray-400">
                      <span>None</span>
                      <span>Exaggerated</span>
                    </div>
                  </div>

                  {/* Speaker Boost Toggle */}
                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">Speaker Boost</span>
                      <p className="text-xs text-gray-400">Enhance voice similarity</p>
                    </div>
                    <button
                      onClick={() => setVoiceSettings({ ...voiceSettings, useSpeakerBoost: !voiceSettings.useSpeakerBoost })}
                      className={`w-11 h-6 rounded-full transition-colors ${voiceSettings.useSpeakerBoost ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${voiceSettings.useSpeakerBoost ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Tools Section */}
              <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900 dark:text-white">Agent Tools</h4>
                  <button
                    onClick={openAddToolModal}
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    + Add Tool
                  </button>
                </div>

                {tools.length === 0 ? (
                  <div className="text-center py-6 bg-gray-50 dark:bg-dark-hover rounded-lg border border-dashed border-gray-300 dark:border-dark-border">
                    <p className="text-sm text-gray-500">No tools configured</p>
                    <p className="text-xs text-gray-400 mt-1">Add functions, call transfers, or other tools</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tools.map((tool, index) => {
                      const getToolLabel = (t) => {
                        if (t.type === 'function') return t.function?.name || 'Function'
                        if (t.type === 'ghl.contact.get') return 'Get Contact'
                        if (t.type === 'ghl.contact.create') return 'Create Contact'
                        if (t.type === 'ghl.calendar.availability.check') return 'Check Availability'
                        if (t.type === 'ghl.calendar.event.create') return 'Create Event'
                        return t.type
                      }
                      const getToolBadge = (t) => {
                        if (t.type.startsWith('ghl.')) return 'GoHighLevel'
                        return t.type
                      }
                      return (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg border border-gray-200 dark:border-dark-border">
                        <div>
                          <span className="font-medium text-sm text-gray-900 dark:text-white">
                            {getToolLabel(tool)}
                          </span>
                          <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                            tool.type.startsWith('ghl.') ? 'bg-green-100 text-green-700' :
                            'bg-primary-100 text-primary-700'
                          }`}>{getToolBadge(tool)}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => openEditToolModal(tool, index)} className="p-1 text-gray-500 hover:text-primary-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button onClick={() => handleDeleteTool(index)} className="p-1 text-gray-500 hover:text-red-600">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Webhook Section */}
              <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">Post-Call Webhook</h4>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Webhook URL</label>
                    <input
                      type="url"
                      value={serverConfig.serverUrl}
                      onChange={(e) => setServerConfig({ ...serverConfig, serverUrl: e.target.value })}
                      placeholder="https://your-server.com/webhook"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Receives call data after each call ends</p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">Webhook Secret (Optional)</label>
                    <input
                      type="password"
                      value={serverConfig.serverUrlSecret}
                      onChange={(e) => setServerConfig({ ...serverConfig, serverUrlSecret: e.target.value })}
                      placeholder="Secret for authentication"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  {/* Recording & Transcript toggles */}
                  <div className="grid grid-cols-2 gap-4 pt-2">
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                      <span className="text-sm text-gray-700 dark:text-gray-300">Recording</span>
                      <button
                        onClick={() => setServerConfig({ ...serverConfig, recordingEnabled: !serverConfig.recordingEnabled })}
                        className={`w-10 h-5 rounded-full transition-colors ${serverConfig.recordingEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${serverConfig.recordingEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                      <span className="text-sm text-gray-700 dark:text-gray-300">Transcript</span>
                      <button
                        onClick={() => setServerConfig({ ...serverConfig, transcriptEnabled: !serverConfig.transcriptEnabled })}
                        className={`w-10 h-5 rounded-full transition-colors ${serverConfig.transcriptEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                      >
                        <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${serverConfig.transcriptEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                      </button>
                    </div>
                  </div>

                  {/* Summary toggle */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">Call Summary</span>
                      <p className="text-xs text-gray-400">AI-generated summary</p>
                    </div>
                    <button
                      onClick={() => setServerConfig({ ...serverConfig, summaryEnabled: !serverConfig.summaryEnabled })}
                      className={`w-10 h-5 rounded-full transition-colors ${serverConfig.summaryEnabled ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full shadow transition-transform ${serverConfig.summaryEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Close Button */}
            <div className="sticky bottom-0 bg-white dark:bg-dark-card p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowAdvancedModal(false)}
                className="w-full py-2.5 text-orange-500 border border-orange-500 rounded-lg hover:bg-orange-50 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Prompt Generator Modal */}
      {showPromptGenerator && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Prompt Generator</h3>
                <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${agentType === 'inbound' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                  {agentType === 'inbound' ? 'Inbound' : 'Outbound'}
                </span>
              </div>
              <button
                onClick={() => { setShowPromptGenerator(false); setPromptDescription(''); setGeneratedPrompt('') }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">
                  Describe what your agent should do:
                </label>
                <textarea
                  value={promptDescription}
                  onChange={(e) => setPromptDescription(e.target.value)}
                  rows={3}
                  placeholder='E.g. "A friendly dental receptionist that books appointments and answers questions about services and pricing..."'
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !generatingPrompt) { e.preventDefault(); handleGeneratePrompt() } }}
                />
              </div>

              {!generatedPrompt && (
                <button
                  onClick={handleGeneratePrompt}
                  disabled={generatingPrompt || !promptDescription.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {generatingPrompt ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    'Generate Prompt'
                  )}
                </button>
              )}

              {generatedPrompt && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">Generated Prompt:</label>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border max-h-60 overflow-y-auto">
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{generatedPrompt}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {generatedPrompt && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={handleGeneratePrompt}
                  disabled={generatingPrompt}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
                >
                  {generatingPrompt ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      Regenerating...
                    </>
                  ) : (
                    'Regenerate'
                  )}
                </button>
                <button
                  onClick={handleUseGeneratedPrompt}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  Use This Prompt
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
