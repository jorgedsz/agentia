import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agentsAPI, phoneNumbersAPI, callsAPI, creditsAPI, ghlAPI, calendarAPI, promptGeneratorAPI, platformSettingsAPI, voicesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'

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
const TTS_LATENCY = { '11labs': 500 }

const MODELS_BY_PROVIDER = {
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

const MAX_LATENCY = 5000 // ms

function getModelLatency(provider, model, voiceProv, sttProv) {
  const models = MODELS_BY_PROVIDER[provider] || []
  const m = models.find(entry => entry.model === model)
  if (!m) return null
  const stt = STT_LATENCY[sttProv] || STT_LATENCY.deepgram
  const tts = TTS_LATENCY[voiceProv] || 500
  return { stt, sttProvider: sttProv || 'deepgram', model: m.llmLatency, tts, total: stt + m.llmLatency + tts }
}

const VOICE_PROVIDERS = [
  { id: '11labs', label: 'ElevenLabs', icon: '||' },
]


const TOOL_TYPES = [
  { id: 'function', label: 'Custom Function (Webhook)' },
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
  const { t } = useLanguage()
  const ta = (key) => t('agentEdit.' + key)

  const [agent, setAgent] = useState(null)
  const [agentType, setAgentType] = useState('outbound')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [showAgentInfoModal, setShowAgentInfoModal] = useState(false)
  const [language, setLanguage] = useState('en')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [modelProvider, setModelProvider] = useState('openai')
  const [modelName, setModelName] = useState('gpt-4o')
  const [voiceProvider, setVoiceProvider] = useState('11labs')
  const [voiceId, setVoiceId] = useState('')
  const [addVoiceManually, setAddVoiceManually] = useState(false)
  const [customVoiceId, setCustomVoiceId] = useState('')
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [voicesList, setVoicesList] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voiceSearch, setVoiceSearch] = useState('')
  const [voiceProviderFilter, setVoiceProviderFilter] = useState('all')
  const [voiceGenderFilter, setVoiceGenderFilter] = useState('all')
  const [voiceAccentFilter, setVoiceAccentFilter] = useState('all')
  const [voiceLanguageFilter, setVoiceLanguageFilter] = useState('all')
  const [previewPlayingId, setPreviewPlayingId] = useState(null)
  const voiceAudioRef = useRef(null)

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
  const [advancedSubPanel, setAdvancedSubPanel] = useState(null) // null = grid view, or 'voiceModel', 'voiceTuning', 'bgSound', 'tools', 'webhook', 'recording', 'transcript', 'summary'
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const providerDropdownRef = useRef(null)

  // Calendar settings (multi-provider)
  const [calendarConfig, setCalendarConfig] = useState({
    enabled: false,
    provider: '',        // 'ghl', 'google', 'calendly', 'hubspot', 'calcom'
    integrationId: '',   // CalendarIntegration.id (or empty for legacy GHL)
    calendarId: '',
    timezone: 'America/New_York',
    appointmentDuration: 30, // minutes: 10, 15, 30, 45, 60, 90
    enableGetContact: true,
    enableCreateContact: true,
    enableCheckAvailability: true,
    enableCreateEvent: true,
    calendars: []        // Multi-calendar: [{ id, name, scenario, provider, integrationId, calendarId, timezone, appointmentDuration }]
  })

  // Per-calendar-entry dropdown data: { [entryId]: { calendars: [], loading: false, error: '' } }
  const [providerCalendarsMap, setProviderCalendarsMap] = useState({})
  // Track which multi-calendar entry is expanded (null = all collapsed)
  const [expandedCalendarEntry, setExpandedCalendarEntry] = useState(null)

  // Call Transfer settings
  const [showTransferModal, setShowTransferModal] = useState(false)
  const [transferConfig, setTransferConfig] = useState({
    enabled: false,
    destinationType: 'number',
    destinationValue: '',
    description: '',
    message: '',
    transfers: []
  })
  const [expandedTransferEntry, setExpandedTransferEntry] = useState(null)

  // GHL Integration state (legacy)
  const [ghlStatus, setGhlStatus] = useState({ isConnected: false, locationId: null, locationName: null })
  const [ghlCalendars, setGhlCalendars] = useState([])
  const [ghlCalendarsLoading, setGhlCalendarsLoading] = useState(false)
  const [ghlError, setGhlError] = useState('')

  // Multi-provider calendar state
  const [calendarIntegrations, setCalendarIntegrations] = useState([])
  const [providerCalendars, setProviderCalendars] = useState([])
  const [providerCalendarsLoading, setProviderCalendarsLoading] = useState(false)
  const [providerError, setProviderError] = useState('')

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
    summaryPrompt: '',
    successEvaluationEnabled: false,
    successEvaluationRubric: '',
    successEvaluationPrompt: '',
    structuredDataEnabled: false,
    structuredDataSchema: '{\n  "type": "object",\n  "properties": {}\n}',
    structuredDataPrompt: ''
  })

  // Call Behavior settings (stop speaking, start speaking, voicemail detection, timeouts)
  const [callBehaviorSettings, setCallBehaviorSettings] = useState({
    stopSpeakingEnabled: false,
    stopSpeakingNumWords: 2,
    stopSpeakingVoiceSeconds: 0.2,
    stopSpeakingBackoffSeconds: 1,
    startSpeakingEnabled: false,
    startSpeakingWaitSeconds: 0.4,
    startSpeakingSmartEndpointing: false,
    startSpeakingSmartProvider: 'livekit',
    startSpeakingOnPunctuationSeconds: 0.1,
    startSpeakingOnNoPunctuationSeconds: 1.5,
    startSpeakingOnNumberSeconds: 0.5,
    voicemailDetectionEnabled: false,
    maxDurationSeconds: 1800,
    silenceTimeoutSeconds: 30
  })

  // Call section
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [selectedPhone, setSelectedPhone] = useState('')
  const [assignedPhoneId, setAssignedPhoneId] = useState('')
  const [assigningPhone, setAssigningPhone] = useState(false)
  const [customerNumber, setCustomerNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [calling, setCalling] = useState(false)
  const [callStatus, setCallStatus] = useState('')
  const [userCredits, setUserCredits] = useState(null)
  const [showCallModal, setShowCallModal] = useState(false)

  // Test Call state
  const [showTestCallModal, setShowTestCallModal] = useState(false)
  const [testCallStatus, setTestCallStatus] = useState('idle') // idle, connecting, active, ended
  const [testCallTranscript, setTestCallTranscript] = useState([])
  const [testCallMuted, setTestCallMuted] = useState(false)
  const [testCallVolume, setTestCallVolume] = useState(0)
  const [testCallElapsed, setTestCallElapsed] = useState(0)
  const vapiInstanceRef = useRef(null)
  const testCallTimerRef = useRef(null)
  const transcriptEndRef = useRef(null)

  useEffect(() => {
    fetchAgent()
    fetchPhoneNumbers()
    fetchCredits()
    fetchGhlStatus()
    fetchCalendarIntegrations()
  }, [id])

  const fetchGhlStatus = async () => {
    try {
      const response = await ghlAPI.getStatus()
      setGhlStatus(response.data)
    } catch (err) {
      console.error('Failed to fetch GHL status:', err)
    }
  }

  const fetchCalendarIntegrations = async () => {
    try {
      const response = await calendarAPI.listIntegrations()
      setCalendarIntegrations(response.data.integrations || [])
    } catch (err) {
      console.error('Failed to fetch calendar integrations:', err)
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

  const fetchProviderCalendars = async (integrationId) => {
    setProviderCalendarsLoading(true)
    setProviderError('')
    try {
      const response = await calendarAPI.getCalendars(integrationId)
      setProviderCalendars(response.data.calendars || [])
    } catch (err) {
      setProviderError(err.response?.data?.error || 'Failed to fetch calendars')
      setProviderCalendars([])
    } finally {
      setProviderCalendarsLoading(false)
    }
  }

  const handleOpenCalendarModal = () => {
    setShowCalendarModal(true)
    // Load calendars based on current provider selection
    if (calendarConfig.calendars && calendarConfig.calendars.length >= 2) {
      // Multi-calendar mode: load calendars for each entry
      calendarConfig.calendars.forEach(entry => {
        if (entry.integrationId) {
          fetchCalendarsForEntry(entry.id, entry.integrationId)
        } else if (entry.provider === 'ghl' && ghlStatus.isConnected) {
          fetchGhlCalendars()
        }
      })
    } else if (calendarConfig.provider === 'ghl' && !calendarConfig.integrationId && ghlStatus.isConnected) {
      fetchGhlCalendars()
    } else if (calendarConfig.integrationId) {
      fetchProviderCalendars(calendarConfig.integrationId)
    } else if (ghlStatus.isConnected) {
      fetchGhlCalendars()
    }
  }

  // Multi-calendar helpers
  const getActiveCalendars = () => {
    if (calendarConfig.calendars && calendarConfig.calendars.length >= 2) {
      return calendarConfig.calendars
    }
    // Single calendar mode: synthesize from top-level fields
    return [{
      id: 'single',
      name: '',
      scenario: '',
      provider: calendarConfig.provider,
      integrationId: calendarConfig.integrationId,
      calendarId: calendarConfig.calendarId,
      timezone: calendarConfig.timezone,
      appointmentDuration: calendarConfig.appointmentDuration
    }]
  }

  const updateCalendarEntry = (entryId, updates) => {
    setCalendarConfig(prev => ({
      ...prev,
      calendars: prev.calendars.map(c => c.id === entryId ? { ...c, ...updates } : c)
    }))
  }

  const removeCalendarEntry = (entryId) => {
    setCalendarConfig(prev => {
      const remaining = prev.calendars.filter(c => c.id !== entryId)
      if (remaining.length <= 1) {
        // Revert to single-calendar mode
        const single = remaining[0] || {}
        return {
          ...prev,
          provider: single.provider || '',
          integrationId: single.integrationId || '',
          calendarId: single.calendarId || '',
          timezone: single.timezone || 'America/New_York',
          appointmentDuration: single.appointmentDuration || 30,
          calendars: []
        }
      }
      return { ...prev, calendars: remaining }
    })
  }

  const fetchCalendarsForEntry = async (entryId, integrationId) => {
    setProviderCalendarsMap(prev => ({
      ...prev,
      [entryId]: { calendars: prev[entryId]?.calendars || [], loading: true, error: '' }
    }))
    try {
      const response = await calendarAPI.getCalendars(integrationId)
      setProviderCalendarsMap(prev => ({
        ...prev,
        [entryId]: { calendars: response.data.calendars || [], loading: false, error: '' }
      }))
    } catch (err) {
      setProviderCalendarsMap(prev => ({
        ...prev,
        [entryId]: { calendars: [], loading: false, error: err.response?.data?.error || 'Failed to fetch calendars' }
      }))
    }
  }

  const addCalendarEntry = () => {
    const newId = `cal_${Date.now()}`
    if (!calendarConfig.calendars || calendarConfig.calendars.length < 2) {
      // Migrate current single config into calendars[0], add empty calendars[1]
      const firstEntry = {
        id: `cal_${Date.now() - 1}`,
        name: '',
        scenario: '',
        provider: calendarConfig.provider || '',
        integrationId: calendarConfig.integrationId || '',
        calendarId: calendarConfig.calendarId || '',
        timezone: calendarConfig.timezone || 'America/New_York',
        appointmentDuration: calendarConfig.appointmentDuration || 30
      }
      // Copy existing provider calendars into the map for migrated entry
      const isLegacyGhl = calendarConfig.provider === 'ghl' && !calendarConfig.integrationId
      const existingCalendars = isLegacyGhl ? ghlCalendars : providerCalendars
      if (existingCalendars.length > 0) {
        setProviderCalendarsMap(prev => ({
          ...prev,
          [firstEntry.id]: { calendars: existingCalendars, loading: false, error: '' }
        }))
      }
      setCalendarConfig(prev => ({
        ...prev,
        calendars: [
          firstEntry,
          { id: newId, name: '', scenario: '', provider: '', integrationId: '', calendarId: '', timezone: 'America/New_York', appointmentDuration: 30 }
        ]
      }))
      setExpandedCalendarEntry(newId)
    } else {
      // Already in multi-mode, just add a new entry
      setCalendarConfig(prev => ({
        ...prev,
        calendars: [
          ...prev.calendars,
          { id: newId, name: '', scenario: '', provider: '', integrationId: '', calendarId: '', timezone: 'America/New_York', appointmentDuration: 30 }
        ]
      }))
      setExpandedCalendarEntry(newId)
    }
  }

  // Transfer helpers
  const getActiveTransfers = () => {
    if (transferConfig.transfers && transferConfig.transfers.length >= 2) {
      return transferConfig.transfers
    }
    if (transferConfig.destinationValue) {
      return [{
        id: 'single',
        name: '',
        scenario: transferConfig.description,
        destinationType: transferConfig.destinationType,
        destinationValue: transferConfig.destinationValue,
        message: transferConfig.message
      }]
    }
    return []
  }

  const updateTransferEntry = (entryId, updates) => {
    setTransferConfig(prev => ({
      ...prev,
      transfers: prev.transfers.map(t => t.id === entryId ? { ...t, ...updates } : t)
    }))
  }

  const removeTransferEntry = (entryId) => {
    setTransferConfig(prev => {
      const remaining = prev.transfers.filter(t => t.id !== entryId)
      if (remaining.length <= 1) {
        const single = remaining[0] || {}
        return {
          ...prev,
          destinationType: single.destinationType || 'number',
          destinationValue: single.destinationValue || '',
          description: single.scenario || '',
          message: single.message || '',
          transfers: []
        }
      }
      return { ...prev, transfers: remaining }
    })
  }

  const addTransferEntry = () => {
    const newId = `xfer_${Date.now()}`
    if (!transferConfig.transfers || transferConfig.transfers.length < 2) {
      const firstEntry = {
        id: `xfer_${Date.now() - 1}`,
        name: '',
        scenario: transferConfig.description || '',
        destinationType: transferConfig.destinationType || 'number',
        destinationValue: transferConfig.destinationValue || '',
        message: transferConfig.message || ''
      }
      setTransferConfig(prev => ({
        ...prev,
        transfers: [
          firstEntry,
          { id: newId, name: '', scenario: '', destinationType: 'number', destinationValue: '', message: '' }
        ]
      }))
      setExpandedTransferEntry(newId)
    } else {
      setTransferConfig(prev => ({
        ...prev,
        transfers: [
          ...prev.transfers,
          { id: newId, name: '', scenario: '', destinationType: 'number', destinationValue: '', message: '' }
        ]
      }))
      setExpandedTransferEntry(newId)
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
      setDescription(agentData.description || '')
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

      // Check if it's a custom/manual voice ID (not found in the fetched voices list)
      if (savedVoiceId && voicesList.length > 0) {
        const isKnownVoice = voicesList.some(v => v.voiceId === savedVoiceId)
        if (!isKnownVoice) {
          setAddVoiceManually(true)
          setCustomVoiceId(savedVoiceId)
        }
      }

      // Load transcriber config
      if (agentData.config?.transcriberProvider) {
        setTranscriberProvider(agentData.config.transcriberProvider)
      }
      if (agentData.config?.transcriberLanguage) {
        setTranscriberLanguage(agentData.config.transcriberLanguage)
      }

      // Load calendar config (backward compat: legacy agents have no provider/integrationId)
      if (agentData.config?.calendarConfig) {
        const saved = agentData.config.calendarConfig
        setCalendarConfig({
          ...saved,
          provider: saved.provider || (saved.enabled ? 'ghl' : ''),
          integrationId: saved.integrationId || '',
          calendars: saved.calendars || []
        })
      }

      // Load transfer config
      if (agentData.config?.transferConfig) {
        setTransferConfig(agentData.config.transferConfig)
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


      // Load tools (filter out calendar + transfer tools — they're rebuilt from config on save)
      const isCalendarTool = (toolName) => toolName && (toolName.startsWith('check_calendar_availability') || toolName.startsWith('book_appointment'))
      const isTransferTool = (tool) => tool.type === 'transferCall'
      const savedTools = (agentData.config?.tools || []).filter(t => !isCalendarTool(t.function?.name || t.name) && !isTransferTool(t))
      setTools(savedTools)

      // Load server config
      if (agentData.config?.serverUrl || agentData.config?.serverConfig) {
        const cfg = agentData.config
        setServerConfig({
          serverUrl: cfg.serverUrl || '',
          serverUrlSecret: cfg.serverUrlSecret || '',
          serverMessages: cfg.serverMessages || ['end-of-call-report'],
          summaryPrompt: cfg.summaryPrompt || '',
          successEvaluationEnabled: cfg.successEvaluationEnabled || false,
          successEvaluationRubric: cfg.successEvaluationRubric || '',
          successEvaluationPrompt: cfg.successEvaluationPrompt || '',
          structuredDataEnabled: cfg.structuredDataEnabled || false,
          structuredDataSchema: cfg.structuredDataSchema || '{\n  "type": "object",\n  "properties": {}\n}',
          structuredDataPrompt: cfg.structuredDataPrompt || ''
        })
      }
      // Load call behavior settings
      if (agentData.config) {
        const cfg = agentData.config
        setCallBehaviorSettings({
          stopSpeakingEnabled: cfg.stopSpeakingEnabled || false,
          stopSpeakingNumWords: cfg.stopSpeakingNumWords ?? 2,
          stopSpeakingVoiceSeconds: cfg.stopSpeakingVoiceSeconds ?? 0.2,
          stopSpeakingBackoffSeconds: cfg.stopSpeakingBackoffSeconds ?? 1,
          startSpeakingEnabled: cfg.startSpeakingEnabled || false,
          startSpeakingWaitSeconds: cfg.startSpeakingWaitSeconds ?? 0.4,
          startSpeakingSmartEndpointing: cfg.startSpeakingSmartEndpointing || false,
          startSpeakingSmartProvider: cfg.startSpeakingSmartProvider || 'livekit',
          startSpeakingOnPunctuationSeconds: cfg.startSpeakingOnPunctuationSeconds ?? 0.1,
          startSpeakingOnNoPunctuationSeconds: cfg.startSpeakingOnNoPunctuationSeconds ?? 1.5,
          startSpeakingOnNumberSeconds: cfg.startSpeakingOnNumberSeconds ?? 0.5,
          voicemailDetectionEnabled: cfg.voicemailDetectionEnabled || false,
          maxDurationSeconds: cfg.maxDurationSeconds ?? 1800,
          silenceTimeoutSeconds: cfg.silenceTimeoutSeconds ?? 30
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
      // Track which phone is assigned to THIS agent
      const assigned = allNumbers.find(p => p.agentId === parseInt(id))
      setAssignedPhoneId(assigned ? assigned.id.toString() : '')
    } catch (err) {
      console.error('Failed to fetch phone numbers:', err)
    }
  }

  const handlePhoneAssignment = async (newPhoneId) => {
    setAssigningPhone(true)
    setError('')
    try {
      // Unassign the currently assigned phone if there is one
      if (assignedPhoneId) {
        await phoneNumbersAPI.unassign(assignedPhoneId)
      }
      // Assign the new phone if not "none"
      if (newPhoneId) {
        await phoneNumbersAPI.assignToAgent(newPhoneId, id)
      }
      setAssignedPhoneId(newPhoneId)
      await fetchPhoneNumbers()
      setSuccess(newPhoneId ? 'Phone number assigned successfully' : 'Phone number unassigned')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Failed to assign phone number:', err)
      setError(err.response?.data?.error || 'Failed to assign phone number')
      await fetchPhoneNumbers()
    } finally {
      setAssigningPhone(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const finalVoiceId = addVoiceManually ? customVoiceId : voiceId

      // Build calendar tools using unified API endpoints (supports all providers)
      const calendarTools = []
      const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      // Sanitize agent name for use in tool names (lowercase, underscores, no special chars)
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

      if (calendarConfig.enabled) {
        const activeCalendars = getActiveCalendars().filter(c => c.calendarId)
        const isMultiCalendar = activeCalendars.length >= 2

        activeCalendars.forEach((cal, idx) => {
          // Determine the base URL: use legacy GHL path for legacy GHL agents, unified path for everything else
          const useLegacyGhl = cal.provider === 'ghl' && !cal.integrationId

          const queryParamsObj = {
            calendarId: cal.calendarId,
            timezone: cal.timezone || 'America/New_York',
            userId: user?.id?.toString() || '',
            duration: (cal.appointmentDuration || 30).toString()
          }

          // Add provider/integrationId for unified calendar API
          if (!useLegacyGhl) {
            queryParamsObj.provider = cal.provider
            if (cal.integrationId) {
              queryParamsObj.integrationId = cal.integrationId
            }
          }

          const queryParams = new URLSearchParams(queryParamsObj).toString()
          const checkUrl = useLegacyGhl ? `${apiBaseUrl}/ghl/check-availability?${queryParams}` : `${apiBaseUrl}/calendar/check-availability?${queryParams}`
          const bookUrl = useLegacyGhl ? `${apiBaseUrl}/ghl/book-appointment?${queryParams}` : `${apiBaseUrl}/calendar/book-appointment?${queryParams}`

          // Tool name suffix: plain for single, indexed for multi
          const toolSuffix = isMultiCalendar ? `${safeName}_${idx + 1}` : safeName
          const descPrefix = isMultiCalendar && cal.name ? `[${cal.name}] ` : ''

          // Check Availability Tool
          calendarTools.push({
            type: 'apiRequest',
            method: 'POST',
            url: checkUrl,
            name: `check_calendar_availability_${toolSuffix}`,
            description: `${descPrefix}Check available appointment slots on a specific date. You MUST call this BEFORE booking to see what times are open.`,
            body: {
              type: 'object',
              properties: {
                date: {
                  type: 'string',
                  description: 'The date to check availability for in YYYY-MM-DD format (e.g., 2026-02-08)'
                }
              },
              required: ['date']
            },
            timeoutSeconds: 30,
            messages: [
              {
                type: 'request-start',
                content: 'Un momento, déjame verificar los horarios disponibles...'
              }
            ]
          })

          // Book Appointment Tool
          calendarTools.push({
            type: 'apiRequest',
            method: 'POST',
            url: bookUrl,
            name: `book_appointment_${toolSuffix}`,
            description: `${descPrefix}Book an appointment for the customer. Use this after confirming the date, time, and collecting customer contact information.`,
            body: {
              type: 'object',
              properties: {
                startTime: {
                  type: 'string',
                  description: 'The appointment start time in ISO 8601 format (e.g., 2026-02-08T10:00:00)'
                },
                endTime: {
                  type: 'string',
                  description: 'The appointment end time in ISO 8601 format (e.g., 2026-02-08T10:30:00). Defaults to 30 minutes after startTime if not provided.'
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
            },
            timeoutSeconds: 30,
            messages: [
              {
                type: 'request-start',
                content: 'Un momento, déjame reservar tu cita...'
              }
            ]
          })
        })
      }

      // Build a single transferCall tool with all destinations (VAPI only allows one per agent)
      const transferTools = []
      if (transferConfig.enabled) {
        const activeTransfers = getActiveTransfers().filter(entry => entry.destinationValue)

        if (activeTransfers.length > 0) {
          const destinations = []
          const messages = []

          activeTransfers.forEach((entry) => {
            // Build destination based on type
            const destination = { type: entry.destinationType }
            if (entry.destinationType === 'number') {
              destination.number = entry.destinationValue
              if (entry.message) destination.message = entry.message
              if (entry.scenario || entry.name) destination.description = entry.scenario || entry.name
            } else if (entry.destinationType === 'sip') {
              destination.sipUri = entry.destinationValue
              if (entry.message) destination.message = entry.message
              if (entry.scenario || entry.name) destination.description = entry.scenario || entry.name
            } else if (entry.destinationType === 'assistant') {
              destination.assistantName = entry.destinationValue
              destination.description = entry.scenario || entry.name || ''
              if (entry.message) destination.message = entry.message
            }
            destinations.push(destination)

            // Add per-destination message with condition
            if (entry.message) {
              messages.push({
                type: 'request-start',
                content: entry.message,
                conditions: [{
                  param: 'destination',
                  operator: 'eq',
                  value: entry.destinationValue
                }]
              })
            }
          })

          // Build function parameters with destination enum
          const destValues = activeTransfers.map(e => e.destinationValue)
          const toolDescription = activeTransfers.length === 1
            ? (activeTransfers[0].scenario || `Transfer the call to ${activeTransfers[0].destinationValue}`)
            : 'Use this function to transfer the call to the appropriate destination based on the conversation context.'

          const transferTool = {
            type: 'transferCall',
            destinations,
            function: {
              name: 'transferCall',
              description: toolDescription,
              parameters: {
                type: 'object',
                properties: {
                  destination: {
                    type: 'string',
                    enum: destValues,
                    description: 'The destination to transfer the call to.'
                  }
                },
                required: ['destination']
              }
            },
            messages
          }

          transferTools.push(transferTool)
        }
      }

      // Merge regular tools with calendar + transfer tools (filter duplicates)
      const isCalTool = (toolName) => toolName && (toolName.startsWith('check_calendar_availability') || toolName.startsWith('book_appointment'))
      const isXferTool = (tool) => tool.type === 'transferCall'
      const regularTools = tools.filter(t => !isCalTool(t.function?.name || t.name) && !isXferTool(t))
      const allTools = [...regularTools, ...calendarTools, ...transferTools]
      console.log('Saving agent - tools:', allTools.length, 'calendar:', calendarTools.length, 'transfer:', transferTools.length, 'regular:', regularTools.length, allTools.map(t => t.function?.name || t.name || t.type))

      // Generate calendar booking instructions if calendar is enabled
      let finalSystemPrompt = systemPrompt
      if (calendarConfig.enabled) {
        const activeCalendars = getActiveCalendars().filter(c => c.calendarId)
        const isMultiCalendar = activeCalendars.length >= 2

        if (isMultiCalendar) {
          // Multi-calendar prompt
          const calendarList = activeCalendars.map((cal, idx) => {
            const num = idx + 1
            return `- **${cal.name}**: ${cal.scenario}
  - Check availability: "check_calendar_availability_${safeName}_${num}"
  - Book appointment: "book_appointment_${safeName}_${num}"`
          }).join('\n')

          const calendarInstructions = `

## APPOINTMENT BOOKING INSTRUCTIONS (PRIORITY — OVERRIDE ANY PHASE/SCRIPT FLOW)

IMPORTANT: If the customer asks to schedule, book, or make an appointment AT ANY POINT in the conversation, IMMEDIATELY start the booking process below. Do NOT wait for any other phase or step to complete first. Appointment booking always takes priority.

### Available Calendars
${calendarList}

### Date & Time Reference
Today's date and time is provided in the {{currentDateTime}} variable. ALWAYS use this as reference when the user says "today", "tomorrow", "next Monday", etc. Calculate the correct date in YYYY-MM-DD format based on {{currentDateTime}}. NEVER guess or invent a date.

### Booking Flow

**Step 1 — Determine the right calendar**
Based on what the customer needs, select the appropriate calendar from the list above. If it's not clear which calendar to use, ask a brief clarifying question (e.g., "Are you looking to schedule a sales consultation or a support call?").

**Step 2 — Ask for preferred date**
Ask: "What date works best for you?"

**Step 3 — Check availability**
Call the correct "check_calendar_availability_..." function for the chosen calendar with the date in YYYY-MM-DD format.
- "tomorrow" = the day after {{currentDateTime}}
- "today" = the date from {{currentDateTime}}
- Calculate any relative date from {{currentDateTime}}

**Step 4 — Present available times**
Read back 3-5 of the best available times in a natural way. For example: "I have 9:00 AM, 10:30 AM, and 2:00 PM available. Which one works for you?"
- Do NOT read all 16 slots — pick a few spread throughout the day.
- If no slots are available, say so and offer to check another date.

**Step 5 — User picks a time → Collect info and book IMMEDIATELY**
Once the user selects a time slot, collect their name and email (phone is optional), then IMMEDIATELY call the correct "book_appointment_..." function for the chosen calendar. Do NOT hesitate or wait — call the function right away.
- startTime: combine the selected date + time in ISO 8601 format (e.g., 2026-02-08T09:00:00)
- contactName: the customer's full name
- contactEmail: the customer's email address
- contactPhone: optional
- notes: optional

**Step 6 — Confirm the booking**
After the function returns success, confirm: "Your appointment is booked for [date] at [time]. You'll receive a confirmation email at [email]."

### Critical Rules
- NEVER skip calling the book function after the user picks a time. You MUST call it.
- NEVER invent or guess dates. Always calculate from {{currentDateTime}}.
- If the user provides incomplete info (no name/email), ask for it, then IMMEDIATELY book.
- Keep your responses short and natural during the booking flow.
- NEVER read internal error messages or technical details to the customer. If a tool returns an error, handle it gracefully in your own words and in the conversation language.
- If booking fails, try the next closest available time slot automatically. If all attempts fail, apologize and offer to try another date.`

          finalSystemPrompt = systemPrompt + calendarInstructions

        } else if (activeCalendars.length === 1) {
          // Single calendar prompt (original behavior)
          const calendarInstructions = `

## APPOINTMENT BOOKING INSTRUCTIONS (PRIORITY — OVERRIDE ANY PHASE/SCRIPT FLOW)

IMPORTANT: If the customer asks to schedule, book, or make an appointment AT ANY POINT in the conversation, IMMEDIATELY start the booking process below. Do NOT wait for any other phase or step to complete first. Appointment booking always takes priority.

### Date & Time Reference
Today's date and time is provided in the {{currentDateTime}} variable. ALWAYS use this as reference when the user says "today", "tomorrow", "next Monday", etc. Calculate the correct date in YYYY-MM-DD format based on {{currentDateTime}}. NEVER guess or invent a date.

### Booking Flow

**Step 1 — Ask for preferred date**
When the customer wants to book, ask: "What date works best for you?"

**Step 2 — Check availability**
Call the "check_calendar_availability_${safeName}" function with the date in YYYY-MM-DD format.
- "tomorrow" = the day after {{currentDateTime}}
- "today" = the date from {{currentDateTime}}
- Calculate any relative date from {{currentDateTime}}

**Step 3 — Present available times**
Read back 3-5 of the best available times in a natural way. For example: "I have 9:00 AM, 10:30 AM, and 2:00 PM available. Which one works for you?"
- Do NOT read all 16 slots — pick a few spread throughout the day.
- If no slots are available, say so and offer to check another date.

**Step 4 — User picks a time → Collect info and book IMMEDIATELY**
Once the user selects a time slot, collect their name and email (phone is optional), then IMMEDIATELY call the "book_appointment_${safeName}" function. Do NOT hesitate or wait — call the function right away.
- startTime: combine the selected date + time in ISO 8601 format (e.g., 2026-02-08T09:00:00)
- contactName: the customer's full name
- contactEmail: the customer's email address
- contactPhone: optional
- notes: optional

**Step 5 — Confirm the booking**
After the function returns success, confirm: "Your appointment is booked for [date] at [time]. You'll receive a confirmation email at [email]."

### Critical Rules
- NEVER skip calling "book_appointment_${safeName}" after the user picks a time. You MUST call it.
- NEVER invent or guess dates. Always calculate from {{currentDateTime}}.
- If the user provides incomplete info (no name/email), ask for it, then IMMEDIATELY book.
- Keep your responses short and natural during the booking flow.
- NEVER read internal error messages or technical details to the customer. If a tool returns an error, handle it gracefully in your own words and in the conversation language. For example, if a date is wrong, simply ask the customer for another date.
- If booking fails, try the next closest available time slot automatically. If all attempts fail, apologize and offer to try another date.`

          finalSystemPrompt = systemPrompt + calendarInstructions
        }
      }

      // Generate transfer instructions if transfer is enabled
      if (transferConfig.enabled) {
        const activeTransfers = getActiveTransfers().filter(e => e.destinationValue)

        if (activeTransfers.length >= 2) {
          const transferList = activeTransfers.map((entry) => {
            return `- **${entry.name || entry.destinationValue}**: ${entry.scenario || 'No scenario specified'} → destination: "${entry.destinationValue}"`
          }).join('\n')

          const transferInstructions = `

## CALL TRANSFER INSTRUCTIONS

You have the ability to transfer this call using the "transferCall" tool. Pass the correct destination based on the situation.

### Available Destinations
${transferList}

### Transfer Rules
- Only transfer when the situation clearly matches one of the scenarios above.
- Before transferring, briefly inform the caller (e.g., "Let me connect you with the right department").
- If unsure which destination to use, ask the caller a clarifying question.
- NEVER transfer without a clear reason matching a scenario above.`

          finalSystemPrompt = finalSystemPrompt + transferInstructions
        } else if (activeTransfers.length === 1) {
          const entry = activeTransfers[0]
          const transferInstructions = `

## CALL TRANSFER INSTRUCTIONS

You have the ability to transfer this call. Use the "transferCall" tool when appropriate.

### When to Transfer
${entry.scenario || entry.description || 'Transfer when the caller requests to be connected to another person or department.'}

### Transfer Rules
- Before transferring, briefly inform the caller (e.g., "Let me connect you now").
- Only transfer when the situation clearly warrants it.`

          finalSystemPrompt = finalSystemPrompt + transferInstructions
        }
      }

      const response = await agentsAPI.update(id, {
        name,
        description,
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
          calendarConfig: (() => {
            // Sync top-level fields from calendars[0] for backward compat
            if (calendarConfig.calendars && calendarConfig.calendars.length >= 2) {
              const first = calendarConfig.calendars[0]
              return {
                ...calendarConfig,
                provider: first.provider,
                integrationId: first.integrationId,
                calendarId: first.calendarId,
                timezone: first.timezone,
                appointmentDuration: first.appointmentDuration
              }
            }
            return calendarConfig
          })(),
          transferConfig,
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
          summaryPrompt: serverConfig.summaryPrompt,
          successEvaluationEnabled: serverConfig.successEvaluationEnabled,
          successEvaluationRubric: serverConfig.successEvaluationRubric,
          successEvaluationPrompt: serverConfig.successEvaluationPrompt,
          structuredDataEnabled: serverConfig.structuredDataEnabled,
          structuredDataSchema: serverConfig.structuredDataSchema,
          structuredDataPrompt: serverConfig.structuredDataPrompt,
          // Call behavior settings
          ...callBehaviorSettings,
          ...(serverConfig.serverUrl && {
            serverUrl: serverConfig.serverUrl,
            serverUrlSecret: serverConfig.serverUrlSecret,
            serverMessages: serverConfig.serverMessages,
          })
        }
      })

      // Show VAPI sync result
      const syncInfo = response.data?.vapiSyncInfo
      if (response.data?.vapiWarning) {
        setError(response.data.vapiWarning)
        setTimeout(() => setError(''), 10000)
      } else if (syncInfo) {
        setSuccess(`Agent saved — VAPI synced (${syncInfo.savedTools} tools, prompt: ${syncInfo.savedPromptLength} chars)`)
        setTimeout(() => setSuccess(''), 5000)
      } else {
        setSuccess('Agent saved successfully')
        setTimeout(() => setSuccess(''), 3000)
      }
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

  // Test Call functions
  const startTestCall = async () => {
    try {
      setTestCallStatus('connecting')
      setTestCallTranscript([])
      setTestCallElapsed(0)
      setTestCallMuted(false)
      setTestCallVolume(0)

      // Fetch VAPI public key
      const { data } = await platformSettingsAPI.getVapiPublicKey()
      const publicKey = data.vapiPublicKey

      // Dynamically import Vapi SDK
      const { default: Vapi } = await import('@vapi-ai/web')
      const vapi = new Vapi(publicKey)
      vapiInstanceRef.current = vapi

      // Set up event listeners
      vapi.on('call-start', () => {
        setTestCallStatus('active')
        testCallTimerRef.current = setInterval(() => {
          setTestCallElapsed(prev => prev + 1)
        }, 1000)
      })

      vapi.on('call-end', () => {
        setTestCallStatus('ended')
        if (testCallTimerRef.current) {
          clearInterval(testCallTimerRef.current)
          testCallTimerRef.current = null
        }
      })

      vapi.on('message', (msg) => {
        if (msg.type === 'transcript') {
          if (msg.transcriptType === 'final') {
            setTestCallTranscript(prev => [...prev, {
              role: msg.role === 'assistant' ? 'Agent' : 'You',
              text: msg.transcript
            }])
          }
        } else if (msg.type === 'conversation-update' && msg.conversation) {
          // Use conversation-update as fallback for transcript
          const messages = msg.conversation
          setTestCallTranscript(
            messages
              .filter(m => m.role === 'assistant' || m.role === 'user')
              .map(m => ({
                role: m.role === 'assistant' ? 'Agent' : 'You',
                text: m.content
              }))
          )
        }
      })

      vapi.on('volume-level', (level) => {
        setTestCallVolume(level)
      })

      vapi.on('error', (err) => {
        console.error('VAPI test call error:', err)
        setTestCallStatus('ended')
        setTestCallTranscript(prev => [...prev, {
          role: 'System',
          text: `Error: ${err.message || 'Call failed'}`
        }])
        if (testCallTimerRef.current) {
          clearInterval(testCallTimerRef.current)
          testCallTimerRef.current = null
        }
      })

      // Start the call with the agent's vapiId and mark as test call
      await vapi.start(agent.vapiId)
    } catch (err) {
      console.error('Failed to start test call:', err)
      setTestCallStatus('ended')
      const errorMsg = err.response?.data?.error || err.message || 'Failed to start call'
      setTestCallTranscript(prev => [...prev, {
        role: 'System',
        text: `Error: ${errorMsg}`
      }])
    }
  }

  const stopTestCall = () => {
    if (vapiInstanceRef.current) {
      vapiInstanceRef.current.stop()
      vapiInstanceRef.current = null
    }
    if (testCallTimerRef.current) {
      clearInterval(testCallTimerRef.current)
      testCallTimerRef.current = null
    }
    setTestCallStatus('ended')
  }

  const toggleTestCallMute = () => {
    if (vapiInstanceRef.current) {
      const newMuted = !testCallMuted
      vapiInstanceRef.current.setMuted(newMuted)
      setTestCallMuted(newMuted)
    }
  }

  const closeTestCallModal = () => {
    if (vapiInstanceRef.current) {
      vapiInstanceRef.current.stop()
      vapiInstanceRef.current = null
    }
    if (testCallTimerRef.current) {
      clearInterval(testCallTimerRef.current)
      testCallTimerRef.current = null
    }
    setShowTestCallModal(false)
    setTestCallStatus('idle')
    setTestCallTranscript([])
    setTestCallElapsed(0)
    setTestCallMuted(false)
    setTestCallVolume(0)
  }

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [testCallTranscript])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (vapiInstanceRef.current) {
        vapiInstanceRef.current.stop()
        vapiInstanceRef.current = null
      }
      if (testCallTimerRef.current) {
        clearInterval(testCallTimerRef.current)
        testCallTimerRef.current = null
      }
    }
  }, [])

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secs = (seconds % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  const handleProviderChange = (newProvider) => {
    setVoiceProvider(newProvider)
    // Set first voice from the fetched list as default
    if (voicesList.length > 0 && !addVoiceManually) {
      setVoiceId(voicesList[0].voiceId)
    }
  }

  const openVoicePicker = async () => {
    setShowVoicePicker(true)
    setVoiceSearch('')
    setVoiceProviderFilter('all')
    setVoiceGenderFilter('all')
    setVoiceAccentFilter('all')
    setVoiceLanguageFilter('all')
    if (voicesList.length === 0) {
      setVoicesLoading(true)
      try {
        const res = await voicesAPI.list()
        setVoicesList(res.data)
      } catch (err) {
        console.error('Failed to load voices:', err)
      } finally {
        setVoicesLoading(false)
      }
    }
  }

  const closeVoicePicker = () => {
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
      voiceAudioRef.current = null
    }
    setPreviewPlayingId(null)
    setShowVoicePicker(false)
  }

  const handleVoicePreview = (voice) => {
    if (previewPlayingId === voice.voiceId) {
      if (voiceAudioRef.current) {
        voiceAudioRef.current.pause()
        voiceAudioRef.current = null
      }
      setPreviewPlayingId(null)
      return
    }
    if (voiceAudioRef.current) {
      voiceAudioRef.current.pause()
    }
    if (!voice.previewUrl) return
    const audio = new Audio(voice.previewUrl)
    voiceAudioRef.current = audio
    setPreviewPlayingId(voice.voiceId)
    audio.play().catch(() => setPreviewPlayingId(null))
    audio.addEventListener('ended', () => { setPreviewPlayingId(null); voiceAudioRef.current = null })
    audio.addEventListener('error', () => { setPreviewPlayingId(null); voiceAudioRef.current = null })
  }

  const selectVoiceFromPicker = (voice) => {
    setVoiceProvider('11labs')
    setVoiceId(voice.voiceId)
    setAddVoiceManually(false)
    setCustomVoiceId('')
    closeVoicePicker()
  }

  const getFilteredPickerVoices = () => {
    return voicesList.filter(v => {
      if (voiceProviderFilter === 'custom' && !v.isCustom) return false
      if (voiceProviderFilter === '11labs' && (v.isCustom || v.provider !== '11labs')) return false
      if (voiceGenderFilter !== 'all' && v.gender !== voiceGenderFilter) return false
      if (voiceAccentFilter !== 'all' && (v.accent || '').toLowerCase() !== voiceAccentFilter) return false
      if (voiceLanguageFilter !== 'all' && !(v.languages || []).includes(voiceLanguageFilter)) return false
      if (voiceSearch && !v.name.toLowerCase().includes(voiceSearch.toLowerCase()) &&
          !(v.accent || '').toLowerCase().includes(voiceSearch.toLowerCase()) &&
          !(v.description || '').toLowerCase().includes(voiceSearch.toLowerCase())) return false
      return true
    })
  }

  const getCurrentVoiceName = () => {
    if (addVoiceManually) return customVoiceId || 'Custom Voice ID'
    const found = voicesList.find(v => v.voiceId === voiceId)
    return found ? found.name : voiceId || 'Select a voice'
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
    setAdvancedSubPanel(null)
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
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{ta('notFound')}</h2>
          <button
            onClick={() => navigate('/dashboard/agents')}
            className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
          >
            {ta('backToDashboard')}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-dark-bg">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between px-6 py-3 text-sm text-gray-500">
        <span>{t('agents.title')}</span>
        <div className="flex items-center gap-2">
          <button onClick={() => navigate('/dashboard')} className="hover:text-primary-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </button>
          <span>/</span>
          <span>{t('agents.title')}</span>
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
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">ID: {agent.id}</span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${agentType === 'inbound' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : assignedPhoneId ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
              {agentType === 'inbound' ? ta('inbound') : assignedPhoneId ? 'Inbound & Outbound' : ta('outbound')}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${agent.vapiId ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {agent.vapiId ? ta('connected') : ta('local')}
            </span>
          </div>
          <button
            onClick={() => setShowAgentInfoModal(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg"
            title="Edit agent info"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
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

          {/* AI Provider & Model Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                {ta('aiProvider')}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <div className="relative">
                <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">{ta('selectProvider')}</label>
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
                {ta('llmModel')}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <div className="relative">
                <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">{ta('selectModel')}</label>
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
              {ta('firstMessage')}
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </label>
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">{ta('firstMessage')}</label>
              <input
                type="text"
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder="Hello! How can I help you today?"
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Voice Selection - Card-based picker */}
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">{ta('voice')}</label>
            <div className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {getCurrentVoiceName()}
                  </span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    ElevenLabs
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {TTS_LATENCY['11labs']}ms {ta('latency').toLowerCase()}
                </p>
              </div>
              <button
                type="button"
                onClick={openVoicePicker}
                className="px-3 py-1.5 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 transition-colors"
              >
                {ta('changeVoice')}
              </button>
            </div>
          </div>



          {/* Transcriber Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Transcriber Provider */}
            <div>
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">{ta('transcriberProvider')}</label>
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
              <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">{ta('transcriberLanguage')}</label>
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
            const ttsLabel = 'ElevenLabs'
            const segments = [
              { label: `STT (${sttLabel})`, value: latency.stt, color: '#3b82f6', max: MAX_LATENCY, suffix: 'ms' },
              { label: 'Model (LLM)', value: latency.model, color: '#f97316', max: MAX_LATENCY, suffix: 'ms' },
              { label: `TTS (${ttsLabel})`, value: latency.tts, color: '#60a5fa', max: MAX_LATENCY, suffix: 'ms' },
            ]
            return (
              <div className="rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-600 dark:text-gray-400">{ta('latency')}</span>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Calendar Options */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                {ta('calendarOptions')}
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
                <p className="text-xs mt-1 text-green-600">
                  {calendarConfig.calendars && calendarConfig.calendars.length >= 2
                    ? `${calendarConfig.calendars.length} calendars configured`
                    : `${calendarConfig.provider === 'google' ? 'Google Calendar' :
                       calendarConfig.provider === 'calendly' ? 'Calendly' :
                       calendarConfig.provider === 'hubspot' ? 'HubSpot' :
                       calendarConfig.provider === 'calcom' ? 'Cal.com' :
                       'GoHighLevel'} ${ta('connected')}`
                  }
                </p>
              )}
            </div>

            {/* Call Transfer */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                Call Transfer
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <button
                onClick={() => setShowTransferModal(true)}
                className={`p-4 rounded-xl border-2 transition-all ${
                  transferConfig.enabled
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                    : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                }`}
              >
                <svg className={`w-8 h-8 mx-auto ${transferConfig.enabled ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 3h6m0 0v6m0-6l-6 6" />
                </svg>
              </button>
              {transferConfig.enabled && (
                <p className="text-xs mt-1 text-green-600">
                  {transferConfig.transfers && transferConfig.transfers.length >= 2
                    ? `${transferConfig.transfers.length} transfers configured`
                    : transferConfig.destinationValue
                      ? `${transferConfig.destinationType === 'sip' ? 'SIP' : transferConfig.destinationType === 'assistant' ? 'Assistant' : 'Phone'}: ${transferConfig.destinationValue}`
                      : 'Enabled'
                  }
                </p>
              )}
            </div>

            {/* Advanced Options */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                {ta('advancedOptions')}
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <button
                onClick={() => { setAdvancedSubPanel(null); setShowAdvancedModal(true) }}
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
              <label className="text-sm text-gray-600 dark:text-gray-400">{ta('systemPrompt')}</label>
              <button
                type="button"
                onClick={() => setShowPromptGenerator(true)}
                className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-purple-600 bg-purple-50 dark:bg-purple-900/20 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                </svg>
                {ta('generatePrompt')}
              </button>
            </div>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              rows={24}
              placeholder={ta('promptPlaceholder')}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent font-mono text-sm resize-y"
            />
            <div className="flex justify-end mt-2">
              <button
                onClick={copyPrompt}
                title={ta('copy')}
                className="p-2 text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
            </div>
          </div>

        </div>

        {/* Bottom Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-dark-border">
          {/* Left: Phone Number Assignment */}
          <div className="flex items-center gap-2 min-w-0">
            {phoneNumbers.length > 0 ? (
              <>
                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <div className="relative">
                  <select
                    value={assignedPhoneId}
                    onChange={(e) => handlePhoneAssignment(e.target.value)}
                    disabled={assigningPhone}
                    className="pl-3 pr-8 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent appearance-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">No phone assigned</option>
                    {phoneNumbers.map((phone) => {
                      const assignedToOther = phone.agentId && phone.agentId !== parseInt(id)
                      return (
                        <option key={phone.id} value={phone.id.toString()} disabled={assignedToOther}>
                          {phone.phoneNumber}{assignedToOther ? ` (${phone.agent?.name || 'other agent'})` : ''}
                        </option>
                      )
                    })}
                  </select>
                  <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                    {assigningPhone ? (
                      <svg className="w-4 h-4 text-gray-400 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    )}
                  </div>
                </div>
                {assignedPhoneId && (
                  <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">Inbound</span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400">No phone numbers</span>
            )}
          </div>

          {/* Right: Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowCallModal(true)}
              disabled={!agent.vapiId}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {ta('launchCall')}
            </button>
            <button
              onClick={() => setShowTestCallModal(true)}
              disabled={!agent.vapiId}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              {ta('testAgent')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-6 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  {ta('saving')}
                </>
              ) : (
                ta('saveChanges')
              )}
            </button>
          </div>
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

      {/* Test Call Modal */}
      {showTestCallModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-md">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Test Agent</h3>
              <button onClick={closeTestCallModal} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Call Status & Volume Indicator */}
              <div className="flex flex-col items-center gap-3">
                <div className="relative">
                  <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                    testCallStatus === 'active'
                      ? 'bg-green-100 dark:bg-green-900/30'
                      : testCallStatus === 'connecting'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30'
                      : 'bg-gray-100 dark:bg-gray-800'
                  }`}>
                    {testCallStatus === 'active' && (
                      <div
                        className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping"
                        style={{ opacity: Math.min(testCallVolume * 2, 0.6) }}
                      />
                    )}
                    <svg className={`w-8 h-8 ${
                      testCallStatus === 'active' ? 'text-green-600 dark:text-green-400'
                        : testCallStatus === 'connecting' ? 'text-yellow-600 dark:text-yellow-400'
                        : 'text-gray-400'
                    }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                    </svg>
                  </div>
                </div>
                <span className={`text-sm font-medium ${
                  testCallStatus === 'active' ? 'text-green-600 dark:text-green-400'
                    : testCallStatus === 'connecting' ? 'text-yellow-600 dark:text-yellow-400'
                    : testCallStatus === 'ended' ? 'text-gray-500'
                    : 'text-gray-500 dark:text-gray-400'
                }`}>
                  {testCallStatus === 'idle' && 'Ready to call'}
                  {testCallStatus === 'connecting' && 'Connecting...'}
                  {testCallStatus === 'active' && 'Call Active'}
                  {testCallStatus === 'ended' && 'Call Ended'}
                </span>
              </div>

              {/* Controls */}
              <div className="flex items-center justify-center gap-4">
                {testCallStatus === 'active' && (
                  <button
                    onClick={toggleTestCallMute}
                    className={`p-3 rounded-full transition-colors ${
                      testCallMuted
                        ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                    }`}
                    title={testCallMuted ? 'Unmute' : 'Mute'}
                  >
                    {testCallMuted ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                      </svg>
                    )}
                  </button>
                )}

                {(testCallStatus === 'idle' || testCallStatus === 'ended') ? (
                  <button
                    onClick={startTestCall}
                    className="p-4 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors shadow-lg"
                    title="Start Call"
                  >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  </button>
                ) : testCallStatus === 'connecting' ? (
                  <button
                    disabled
                    className="p-4 rounded-full bg-yellow-500 text-white cursor-not-allowed shadow-lg"
                  >
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                  </button>
                ) : (
                  <button
                    onClick={stopTestCall}
                    className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg"
                    title="End Call"
                  >
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.91 3.1c.46.36.66.96.5 1.52-.5 1.58-1.33 3.04-2.43 4.28-.37.42-.92.63-1.48.55-1.98-.29-3.86-.97-5.53-1.96a18.8 18.8 0 01-5.53 1.96c-.56.08-1.11-.13-1.48-.55-1.1-1.24-1.93-2.7-2.43-4.28a1.47 1.47 0 01.5-1.52h.25z" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Transcript */}
              <div className="bg-gray-50 dark:bg-dark-hover rounded-lg border border-gray-200 dark:border-dark-border">
                <div className="px-3 py-2 border-b border-gray-200 dark:border-dark-border">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Transcript</span>
                </div>
                <div className="h-48 overflow-y-auto p-3 space-y-2">
                  {testCallTranscript.length === 0 ? (
                    <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                      {testCallStatus === 'idle' || testCallStatus === 'ended'
                        ? 'Start a call to see the transcript'
                        : 'Waiting for conversation...'}
                    </p>
                  ) : (
                    testCallTranscript.map((entry, i) => (
                      <div key={i} className={`text-sm ${
                        entry.role === 'Agent'
                          ? 'text-blue-700 dark:text-blue-400'
                          : entry.role === 'System'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        <span className="font-medium">{entry.role}:</span> {entry.text}
                      </div>
                    ))
                  )}
                  <div ref={transcriptEndRef} />
                </div>
              </div>

              {/* Timer */}
              {(testCallStatus === 'active' || testCallStatus === 'ended') && testCallElapsed > 0 && (
                <div className="text-center">
                  <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                    {formatElapsed(testCallElapsed)} elapsed
                  </span>
                </div>
              )}
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
                {editingTool ? ta('editTool') : ta('addTool')}
              </h3>
              <button onClick={() => { setShowToolModal(false); resetToolForm(); setAdvancedSubPanel(null); setShowAdvancedModal(true); }} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('toolType')}</label>
                <select
                  value={toolForm.type}
                  onChange={(e) => setToolForm({ ...toolForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                >
                  {TOOL_TYPES.map(tt => (
                    <option key={tt.id} value={tt.id}>{tt.id === 'function' ? ta('customFunction') : ta('endCallTool')}</option>
                  ))}
                </select>
              </div>

              {toolForm.type === 'function' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('functionName')} *</label>
                    <input
                      type="text"
                      value={toolForm.functionName}
                      onChange={(e) => setToolForm({ ...toolForm, functionName: e.target.value })}
                      placeholder="book_appointment"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('description')} *</label>
                    <input
                      type="text"
                      value={toolForm.functionDescription}
                      onChange={(e) => setToolForm({ ...toolForm, functionDescription: e.target.value })}
                      placeholder="Schedule a customer appointment"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('webhookUrl')} *</label>
                    <input
                      type="url"
                      value={toolForm.webhookUrl}
                      onChange={(e) => setToolForm({ ...toolForm, webhookUrl: e.target.value })}
                      placeholder="https://your-server.com/webhook"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('parametersJson')}</label>
                    <textarea
                      value={toolForm.functionParameters}
                      onChange={(e) => setToolForm({ ...toolForm, functionParameters: e.target.value })}
                      rows={4}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {toolForm.type === 'endCall' && (
                <div>
                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('endMessage')}</label>
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
                onClick={() => { setShowToolModal(false); resetToolForm(); setAdvancedSubPanel(null); setShowAdvancedModal(true); }}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                {ta('cancel')}
              </button>
              <button
                onClick={handleSaveTool}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
              >
                {editingTool ? ta('update') : ta('save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calendar Options Modal (Multi-Provider) */}
      {showCalendarModal && (() => {
        const PROVIDER_ICONS = {
          ghl: (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="4" fill="#FF6B35"/>
              <path d="M7 8h10v2H7V8zm0 3h7v2H7v-2zm0 3h10v2H7v-2z" fill="white"/>
            </svg>
          ),
          google: (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
          ),
          calendly: (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11" fill="#006BFF"/>
              <path d="M15.9 9.2c-.4-.7-1-1.2-1.7-1.5-.7-.3-1.5-.4-2.3-.2-.8.1-1.5.5-2 1.1-.6.6-.9 1.3-1 2.1-.1.8.1 1.6.4 2.3.4.7 1 1.2 1.7 1.5.7.3 1.5.4 2.3.2.5-.1 1-.3 1.4-.6l1.3 1.3c-.7.5-1.4.9-2.3 1.1-1.1.2-2.2.1-3.2-.4s-1.8-1.2-2.3-2.2c-.5-1-.7-2.1-.5-3.2.2-1.1.7-2 1.5-2.8.8-.8 1.7-1.3 2.8-1.5 1.1-.2 2.2 0 3.2.5s1.7 1.3 2.2 2.3l-1.5.7z" fill="white"/>
            </svg>
          ),
          hubspot: (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <path d="M17.5 8.2V5.8c.6-.3 1-.9 1-1.6 0-1-.8-1.8-1.8-1.8s-1.8.8-1.8 1.8c0 .7.4 1.3 1 1.6v2.4c-.9.2-1.7.6-2.3 1.2L7.5 5.3c0-.1.1-.3.1-.4 0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2c.4 0 .7-.1 1-.3l5.9 4c-.4.7-.6 1.5-.6 2.4 0 1.1.4 2.2 1.1 3l-1.3 1.3c-.2-.1-.4-.1-.6-.1-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5 1.5-.7 1.5-1.5c0-.2 0-.4-.1-.6l1.3-1.3c.8.7 1.9 1.1 3 1.1 2.6 0 4.7-2.1 4.7-4.7 0-2.3-1.7-4.2-3.9-4.6zm-.7 7.5c-1.6 0-2.9-1.3-2.9-2.9s1.3-2.9 2.9-2.9 2.9 1.3 2.9 2.9-1.3 2.9-2.9 2.9z" fill="#FF7A59"/>
            </svg>
          ),
          calcom: (
            <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
              <rect width="24" height="24" rx="4" fill="#111827"/>
              <path d="M6 9.5C6 7.01 8.01 5 10.5 5h3C15.99 5 18 7.01 18 9.5v5c0 2.49-2.01 4.5-4.5 4.5h-3C8.01 19 6 16.99 6 14.5v-5z" stroke="white" strokeWidth="2"/>
            </svg>
          )
        }

        const PROVIDER_NAMES = {
          ghl: 'GoHighLevel',
          google: 'Google Calendar',
          calendly: 'Calendly',
          hubspot: 'HubSpot',
          calcom: 'Cal.com'
        }

        // Build connected accounts list (shared across single & multi modes)
        const connectedAccounts = []
        if (ghlStatus?.isConnected) {
          connectedAccounts.push({
            key: 'ghl-legacy', provider: 'ghl', integrationId: '',
            icon: PROVIDER_ICONS.ghl, label: 'GoHighLevel',
            sublabel: ghlStatus.locationName || '', connected: true
          })
        }
        calendarIntegrations.filter(i => i.isConnected).forEach(i => {
          connectedAccounts.push({
            key: `${i.provider}:${i.id}`, provider: i.provider,
            integrationId: String(i.id), icon: PROVIDER_ICONS[i.provider],
            label: PROVIDER_NAMES[i.provider] || i.provider,
            sublabel: i.accountLabel || '', connected: true
          })
        })
        const connectedProviderSet = new Set(connectedAccounts.map(a => a.provider))
        if (ghlStatus?.isConnected) connectedProviderSet.add('ghl')
        const allProviders = ['ghl', 'google', 'calendly', 'hubspot', 'calcom']
        const notConnectedProviders = allProviders.filter(p => !connectedProviderSet.has(p))

        const isMultiCalendarMode = calendarConfig.calendars && calendarConfig.calendars.length >= 2

        // Render a provider dropdown for a given entry (single or multi)
        const renderProviderDropdown = (currentProvider, currentIntegrationId, onSelect, dropdownId) => {
          const currentKey = currentIntegrationId
            ? `${currentProvider}:${currentIntegrationId}`
            : currentProvider === 'ghl' && !currentIntegrationId && ghlStatus?.isConnected
              ? 'ghl-legacy'
              : currentProvider || ''
          const currentAccount = connectedAccounts.find(a => a.key === currentKey)
          const currentNotConnected = !currentAccount && currentProvider
            ? notConnectedProviders.includes(currentProvider) ? currentProvider : null
            : null

          return (
            <div>
              <button
                type="button"
                onClick={() => setShowProviderDropdown(showProviderDropdown === dropdownId ? false : dropdownId)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-left"
              >
                {currentAccount ? (
                  <>
                    {currentAccount.icon}
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-gray-900 dark:text-white">{currentAccount.label}</span>
                      {currentAccount.sublabel && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 ml-1.5">- {currentAccount.sublabel}</span>
                      )}
                    </div>
                  </>
                ) : currentNotConnected ? (
                  <>
                    {PROVIDER_ICONS[currentNotConnected]}
                    <span className="text-sm text-gray-900 dark:text-white">{PROVIDER_NAMES[currentNotConnected]}</span>
                    <span className="text-xs text-red-400 ml-auto">Not connected</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400">Select a provider</span>
                )}
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-auto transition-transform ${showProviderDropdown === dropdownId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className={`${showProviderDropdown === dropdownId ? '' : 'hidden'} mt-1 w-full bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg max-h-64 overflow-y-auto`}>
                {connectedAccounts.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Connected</div>
                    {connectedAccounts.map(account => (
                      <button
                        key={account.key}
                        type="button"
                        onClick={() => {
                          onSelect(account.provider, account.integrationId)
                          setShowProviderDropdown(false)
                        }}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-hover text-left ${currentKey === account.key ? 'bg-primary-50 dark:bg-primary-900/20' : ''}`}
                      >
                        {account.icon}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm text-gray-900 dark:text-white">{account.label}</span>
                          {account.sublabel && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 block truncate">{account.sublabel}</span>
                          )}
                        </div>
                        {currentKey === account.key && (
                          <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </>
                )}
                {notConnectedProviders.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide border-t border-gray-100 dark:border-dark-border mt-1">Not Connected</div>
                    {notConnectedProviders.map(providerId => (
                      <button
                        key={providerId}
                        type="button"
                        onClick={() => {
                          onSelect(providerId, '')
                          setShowProviderDropdown(false)
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 dark:hover:bg-dark-hover text-left opacity-60"
                      >
                        {PROVIDER_ICONS[providerId]}
                        <span className="text-sm text-gray-900 dark:text-white">{PROVIDER_NAMES[providerId]}</span>
                        <span className="text-xs text-gray-400 ml-auto">Setup required</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          )
        }

        // Render calendar dropdown for a given entry
        const renderCalendarDropdown = (entryProvider, entryIntegrationId, entryCalendarId, entryTimezone, onCalendarSelect, entryId) => {
          const isLegacyGhl = entryProvider === 'ghl' && !entryIntegrationId
          if (!entryProvider) return null

          const isConnected = entryIntegrationId || (entryProvider === 'ghl' && ghlStatus?.isConnected) || connectedProviderSet.has(entryProvider)
          if (!isConnected) return null

          // For multi-calendar, use per-entry data; for single, use shared state
          let calendars, loading, error
          if (isMultiCalendarMode && entryId !== 'single') {
            const mapData = providerCalendarsMap[entryId]
            if (isLegacyGhl) {
              calendars = ghlCalendars; loading = ghlCalendarsLoading; error = ghlError
            } else {
              calendars = mapData?.calendars || []; loading = mapData?.loading || false; error = mapData?.error || ''
            }
          } else {
            calendars = isLegacyGhl ? ghlCalendars : providerCalendars
            loading = isLegacyGhl ? ghlCalendarsLoading : providerCalendarsLoading
            error = isLegacyGhl ? ghlError : providerError
          }

          return (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Calendar *</label>
              {error && (
                <div className="p-2 mb-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              {loading ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                  <span className="text-sm text-gray-500">Loading calendars...</span>
                </div>
              ) : calendars.length > 0 ? (
                <select
                  value={entryCalendarId}
                  onChange={(e) => {
                    const selectedCal = calendars.find(c => c.id === e.target.value)
                    onCalendarSelect(e.target.value, selectedCal?.timezone || entryTimezone)
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                >
                  <option value="">Select a calendar</option>
                  {calendars.map(cal => (
                    <option key={cal.id} value={cal.id}>{cal.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 py-2">
                  No calendars found for this account.
                </div>
              )}
            </div>
          )
        }

        // Render "not connected" warning for a provider
        const renderNotConnectedWarning = (entryProvider, entryIntegrationId) => {
          if (!entryProvider) return null
          const isConnected = entryIntegrationId || (entryProvider === 'ghl' && ghlStatus?.isConnected) || connectedProviderSet.has(entryProvider)
          if (isConnected) return null
          return (
            <div className="flex items-center gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm text-yellow-700 dark:text-yellow-300">This provider is not connected yet.</p>
              </div>
              <button
                onClick={() => {
                  setShowCalendarModal(false)
                  navigate('/dashboard/settings?tab=calendars')
                }}
                className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-xs font-medium whitespace-nowrap"
              >
                Go to Settings
              </button>
            </div>
          )
        }

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-dark-card flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border z-10">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Calendar Options</h3>
              <button onClick={() => setShowCalendarModal(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Enable Calendar Integration toggle */}
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Calendar Integration</label>
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

              {calendarConfig.enabled && (
                <>
                  {/* ===== SINGLE CALENDAR MODE ===== */}
                  {!isMultiCalendarMode && (
                    <>
                      <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Calendar Provider *</label>
                        {renderProviderDropdown(
                          calendarConfig.provider,
                          calendarConfig.integrationId,
                          (provider, integrationId) => {
                            setCalendarConfig({ ...calendarConfig, provider, integrationId, calendarId: '' })
                            setProviderCalendars([])
                            setProviderError('')
                            if (provider === 'ghl' && !integrationId) {
                              fetchGhlCalendars()
                            } else if (integrationId) {
                              fetchProviderCalendars(integrationId)
                            }
                          },
                          'single'
                        )}
                      </div>

                      {renderNotConnectedWarning(calendarConfig.provider, calendarConfig.integrationId)}

                      {renderCalendarDropdown(
                        calendarConfig.provider,
                        calendarConfig.integrationId,
                        calendarConfig.calendarId,
                        calendarConfig.timezone,
                        (calendarId, timezone) => setCalendarConfig({ ...calendarConfig, calendarId, timezone }),
                        'single'
                      )}

                      {calendarConfig.provider && (
                        <>
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
                          <div>
                            <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Appointment Duration</label>
                            <select
                              value={calendarConfig.appointmentDuration || 30}
                              onChange={(e) => setCalendarConfig({ ...calendarConfig, appointmentDuration: parseInt(e.target.value) })}
                              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                            >
                              <option value={10}>10 minutes</option>
                              <option value={15}>15 minutes</option>
                              <option value={30}>30 minutes</option>
                              <option value={45}>45 minutes</option>
                              <option value={60}>60 minutes</option>
                              <option value={90}>90 minutes</option>
                            </select>
                          </div>
                        </>
                      )}

                      {/* Add another calendar button (only when a calendar is already configured) */}
                      {calendarConfig.provider && calendarConfig.calendarId && (
                        <button
                          type="button"
                          onClick={addCalendarEntry}
                          className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                        >
                          + Add another calendar
                        </button>
                      )}
                    </>
                  )}

                  {/* ===== MULTI CALENDAR MODE ===== */}
                  {isMultiCalendarMode && (
                    <>
                      <div className="border-t border-gray-200 dark:border-dark-border pt-4 space-y-4">
                        {calendarConfig.calendars.map((entry, idx) => {
                          const isExpanded = expandedCalendarEntry === entry.id
                          const providerLabel = PROVIDER_NAMES[entry.provider] || ''
                          const subtitle = entry.name || `Calendar ${idx + 1}`

                          return (
                          <div key={entry.id} className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                            {/* Collapsible header */}
                            <button
                              type="button"
                              onClick={() => setExpandedCalendarEntry(isExpanded ? null : entry.id)}
                              className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 dark:bg-dark-hover text-left hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
                            >
                              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                              </svg>
                              <div className="flex-1 min-w-0">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">{subtitle}</span>
                                {providerLabel && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{providerLabel}</span>
                                )}
                              </div>
                              {entry.calendarId && (
                                <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
                              )}
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeCalendarEntry(entry.id) }}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                                title="Remove calendar"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </button>

                            {/* Expandable content */}
                            {isExpanded && (
                              <div className="p-4 space-y-3 border-t border-gray-200 dark:border-dark-border">
                                {/* Name */}
                                <div>
                                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Name *</label>
                                  <input
                                    type="text"
                                    value={entry.name}
                                    onChange={(e) => updateCalendarEntry(entry.id, { name: e.target.value })}
                                    placeholder="e.g., Sales Consultation"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                  />
                                </div>

                                {/* Scenario */}
                                <div>
                                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Scenario *</label>
                                  <textarea
                                    value={entry.scenario}
                                    onChange={(e) => updateCalendarEntry(entry.id, { scenario: e.target.value })}
                                    placeholder="e.g., Use when customer wants a sales demo"
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm resize-none"
                                  />
                                </div>

                                {/* Provider */}
                                <div>
                                  <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Provider *</label>
                                  {renderProviderDropdown(
                                    entry.provider,
                                    entry.integrationId,
                                    (provider, integrationId) => {
                                      updateCalendarEntry(entry.id, { provider, integrationId, calendarId: '' })
                                      if (provider === 'ghl' && !integrationId) {
                                        fetchGhlCalendars()
                                      } else if (integrationId) {
                                        fetchCalendarsForEntry(entry.id, integrationId)
                                      }
                                    },
                                    `multi-${entry.id}`
                                  )}
                                </div>

                                {renderNotConnectedWarning(entry.provider, entry.integrationId)}

                                {/* Calendar dropdown */}
                                {renderCalendarDropdown(
                                  entry.provider,
                                  entry.integrationId,
                                  entry.calendarId,
                                  entry.timezone,
                                  (calendarId, timezone) => updateCalendarEntry(entry.id, { calendarId, timezone }),
                                  entry.id
                                )}

                                {/* Timezone & Duration */}
                                {entry.provider && (
                                  <>
                                    <div>
                                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Timezone</label>
                                      <select
                                        value={entry.timezone}
                                        onChange={(e) => updateCalendarEntry(entry.id, { timezone: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                      >
                                        {TIMEZONES.map(tz => (
                                          <option key={tz} value={tz}>{tz}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Duration</label>
                                      <select
                                        value={entry.appointmentDuration || 30}
                                        onChange={(e) => updateCalendarEntry(entry.id, { appointmentDuration: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                      >
                                        <option value={10}>10 minutes</option>
                                        <option value={15}>15 minutes</option>
                                        <option value={30}>30 minutes</option>
                                        <option value={45}>45 minutes</option>
                                        <option value={60}>60 minutes</option>
                                        <option value={90}>90 minutes</option>
                                      </select>
                                    </div>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                          )
                        })}

                        {/* Add Calendar button */}
                        <button
                          type="button"
                          onClick={addCalendarEntry}
                          className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                        >
                          + Add Calendar
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
            {(() => {
              // Validate: all calendars must be fully configured
              const isValid = !calendarConfig.enabled || (() => {
                if (isMultiCalendarMode) {
                  return calendarConfig.calendars.every(c => c.name && c.scenario && c.provider && c.calendarId)
                }
                // Single mode: just need provider + calendarId (or not enabled)
                return !calendarConfig.provider || calendarConfig.calendarId
              })()

              return (
                <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
                  <button
                    onClick={() => setShowCalendarModal(false)}
                    disabled={!isValid}
                    className={`px-4 py-2 rounded-lg ${isValid ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                  >
                    Done
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
        )
      })()}

      {/* Call Transfer Modal */}
      {showTransferModal && (() => {
        const isMultiTransferMode = transferConfig.transfers && transferConfig.transfers.length >= 2

        return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Call Transfer Options</h3>
              <button onClick={() => setShowTransferModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-900 dark:text-white">Enable Call Transfer</span>
                <button
                  type="button"
                  onClick={() => setTransferConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${transferConfig.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${transferConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {transferConfig.enabled && (
                <>
                  {!isMultiTransferMode ? (
                    /* Single Transfer Mode */
                    <div className="space-y-4">
                      {/* Description / When to transfer */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">When to transfer</label>
                        <input
                          type="text"
                          value={transferConfig.description}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, description: e.target.value }))}
                          placeholder="e.g., When customer wants to speak with a human agent"
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      {/* Destination Type */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Destination type</label>
                        <select
                          value={transferConfig.destinationType}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, destinationType: e.target.value, destinationValue: '' }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
                        >
                          <option value="number">Phone Number</option>
                          <option value="sip">SIP URI</option>
                          <option value="assistant">Assistant</option>
                        </select>
                      </div>

                      {/* Destination Value */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {transferConfig.destinationType === 'number' ? 'Phone number' : transferConfig.destinationType === 'sip' ? 'SIP URI' : 'Assistant name or ID'}
                        </label>
                        <input
                          type="text"
                          value={transferConfig.destinationValue}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, destinationValue: e.target.value }))}
                          placeholder={transferConfig.destinationType === 'number' ? '+1234567890' : transferConfig.destinationType === 'sip' ? 'sip:user@domain.com' : 'Assistant name'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      {/* Transfer Message */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">Message before transferring</label>
                        <input
                          type="text"
                          value={transferConfig.message}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, message: e.target.value }))}
                          placeholder="e.g., Let me connect you now, please hold..."
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                        />
                      </div>

                      {/* Add Another Transfer Button */}
                      <button
                        type="button"
                        onClick={addTransferEntry}
                        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                      >
                        + Add another transfer destination
                      </button>
                    </div>
                  ) : (
                    /* Multi Transfer Mode */
                    <div className="space-y-3">
                      {transferConfig.transfers.map((entry) => {
                        const isExpanded = expandedTransferEntry === entry.id
                        return (
                          <div key={entry.id} className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                            {/* Collapsed Header */}
                            <button
                              type="button"
                              onClick={() => setExpandedTransferEntry(isExpanded ? null : entry.id)}
                              className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-dark-card hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors"
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <svg className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                                <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                  {entry.name || 'Untitled Transfer'}
                                </span>
                                {entry.destinationValue && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    ({entry.destinationType === 'sip' ? 'SIP' : entry.destinationType === 'assistant' ? 'Asst' : 'Phone'}: {entry.destinationValue})
                                  </span>
                                )}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); removeTransferEntry(entry.id) }}
                                className="text-red-400 hover:text-red-600 ml-2 flex-shrink-0"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                              </button>
                            </button>

                            {/* Expanded Content */}
                            {isExpanded && (
                              <div className="p-3 space-y-3 border-t border-gray-200 dark:border-dark-border">
                                {/* Name */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Name</label>
                                  <input
                                    type="text"
                                    value={entry.name}
                                    onChange={(e) => updateTransferEntry(entry.id, { name: e.target.value })}
                                    placeholder="e.g., Sales Department"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  />
                                </div>

                                {/* Scenario */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Scenario (when to use)</label>
                                  <input
                                    type="text"
                                    value={entry.scenario}
                                    onChange={(e) => updateTransferEntry(entry.id, { scenario: e.target.value })}
                                    placeholder="e.g., When customer wants to speak with sales"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  />
                                </div>

                                {/* Destination Type */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Destination type</label>
                                  <select
                                    value={entry.destinationType}
                                    onChange={(e) => updateTransferEntry(entry.id, { destinationType: e.target.value, destinationValue: '' })}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
                                  >
                                    <option value="number">Phone Number</option>
                                    <option value="sip">SIP URI</option>
                                    <option value="assistant">Assistant</option>
                                  </select>
                                </div>

                                {/* Destination Value */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    {entry.destinationType === 'number' ? 'Phone number' : entry.destinationType === 'sip' ? 'SIP URI' : 'Assistant name or ID'}
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.destinationValue}
                                    onChange={(e) => updateTransferEntry(entry.id, { destinationValue: e.target.value })}
                                    placeholder={entry.destinationType === 'number' ? '+1234567890' : entry.destinationType === 'sip' ? 'sip:user@domain.com' : 'Assistant name'}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  />
                                </div>

                                {/* Transfer Message */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Message before transferring</label>
                                  <input
                                    type="text"
                                    value={entry.message}
                                    onChange={(e) => updateTransferEntry(entry.id, { message: e.target.value })}
                                    placeholder="e.g., Let me connect you now..."
                                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}

                      {/* Add Transfer Button */}
                      <button
                        type="button"
                        onClick={addTransferEntry}
                        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                      >
                        + Add Transfer
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {(() => {
              const isValid = !transferConfig.enabled || (() => {
                if (isMultiTransferMode) {
                  return transferConfig.transfers.every(t => t.name && t.scenario && t.destinationValue)
                }
                return !transferConfig.destinationValue || transferConfig.destinationValue.trim() !== '' || true
              })()

              return (
                <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
                  <button
                    onClick={() => setShowTransferModal(false)}
                    disabled={!isValid}
                    className={`px-4 py-2 rounded-lg ${isValid ? 'bg-primary-600 text-white hover:bg-primary-700' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                  >
                    Done
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
        )
      })()}

      {/* Advanced Options Modal */}
      {showAdvancedModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Grid View (default) */}
            {!advancedSubPanel && (
              <>
                <div className="p-6 pb-2">
                  <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white">{ta('advancedOptions')}</h3>
                </div>
                <div className="p-6 pt-4">
                  <div className="grid grid-cols-3 gap-4">
                    {/* Voice Model */}
                    <button onClick={() => setAdvancedSubPanel('voiceModel')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('voiceModel')}</span>
                      <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                    </button>

                    {/* Voice Tuning */}
                    <button onClick={() => setAdvancedSubPanel('voiceTuning')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('voiceTuning')}</span>
                      <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                      </div>
                    </button>

                    {/* Background Sound */}
                    <button onClick={() => setAdvancedSubPanel('bgSound')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('backgroundSound')}</span>
                      <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </div>
                    </button>

                    {/* Agent Tools */}
                    <button onClick={() => setAdvancedSubPanel('tools')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('agentTools')}</span>
                      <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </button>

                    {/* Webhook */}
                    <button onClick={() => setAdvancedSubPanel('webhook')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('postCallWebhook')}</span>
                      <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                    </button>

                    {/* Structured Data */}
                    <button onClick={() => setAdvancedSubPanel('structuredData')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('structuredData')}</span>
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${serverConfig.structuredDataEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40'}`}>
                        <svg className={`w-7 h-7 ${serverConfig.structuredDataEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                      </div>
                      {serverConfig.structuredDataEnabled && <span className="text-[10px] text-green-600 font-medium -mt-1">ON</span>}
                    </button>

                    {/* Stop Speaking */}
                    <button onClick={() => setAdvancedSubPanel('stopSpeaking')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('stopSpeaking')}</span>
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${callBehaviorSettings.stopSpeakingEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40'}`}>
                        <svg className={`w-7 h-7 ${callBehaviorSettings.stopSpeakingEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </div>
                      {callBehaviorSettings.stopSpeakingEnabled && <span className="text-[10px] text-green-600 font-medium -mt-1">ON</span>}
                    </button>

                    {/* Start Speaking */}
                    <button onClick={() => setAdvancedSubPanel('startSpeaking')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('startSpeaking')}</span>
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${callBehaviorSettings.startSpeakingEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40'}`}>
                        <svg className={`w-7 h-7 ${callBehaviorSettings.startSpeakingEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      {callBehaviorSettings.startSpeakingEnabled && <span className="text-[10px] text-green-600 font-medium -mt-1">ON</span>}
                    </button>

                    {/* Voicemail Detection */}
                    <button onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, voicemailDetectionEnabled: !callBehaviorSettings.voicemailDetectionEnabled })} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('voicemail')}</span>
                      <div className={`w-14 h-14 rounded-xl flex items-center justify-center transition-colors ${callBehaviorSettings.voicemailDetectionEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40'}`}>
                        <svg className={`w-7 h-7 ${callBehaviorSettings.voicemailDetectionEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      {callBehaviorSettings.voicemailDetectionEnabled && <span className="text-[10px] text-green-600 font-medium -mt-1">ON</span>}
                    </button>

                    {/* Call Timeouts */}
                    <button onClick={() => setAdvancedSubPanel('callTimeouts')} className="flex flex-col items-center gap-2 group">
                      <span className="text-xs text-primary-600 dark:text-primary-400 text-center">{ta('callTimeouts')}</span>
                      <div className="w-14 h-14 rounded-xl bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center group-hover:bg-primary-100 dark:group-hover:bg-primary-900/40 transition-colors">
                        <svg className="w-7 h-7 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </button>
                  </div>
                </div>
                <div className="p-4 pt-2">
                  <button
                    onClick={() => { setAdvancedSubPanel(null); setShowAdvancedModal(false) }}
                    className="w-full py-2.5 text-primary-600 border border-primary-600 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors font-medium"
                  >
                    {ta('close')}
                  </button>
                </div>
              </>
            )}

            {/* Sub-panel: Voice Model */}
            {advancedSubPanel === 'voiceModel' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('voiceModel')}</h3>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { value: 'eleven_multilingual_v2', label: ta('voiceModelMultilingualV2'), desc: ta('voiceModelMultilingualV2Desc') },
                    { value: 'eleven_flash_v2_5', label: ta('voiceModelFlashV25'), desc: ta('voiceModelFlashV25Desc') },
                    { value: 'eleven_flash_v2', label: ta('voiceModelFlashV2'), desc: ta('voiceModelFlashV2Desc') },
                    { value: 'eleven_turbo_v2_5', label: ta('voiceModelTurboV25'), desc: ta('voiceModelTurboV25Desc') },
                    { value: 'eleven_turbo_v2', label: ta('voiceModelTurboV2'), desc: ta('voiceModelTurboV2Desc') }
                  ].map(model => (
                    <button
                      key={model.value}
                      onClick={() => setVoiceSettings({ ...voiceSettings, model: model.value })}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${voiceSettings.model === model.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{model.label}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{model.desc}</p>
                      </div>
                      {voiceSettings.model === model.value && (
                        <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Sub-panel: Voice Tuning */}
            {advancedSubPanel === 'voiceTuning' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('voiceTuning')}</h3>
                </div>
                <div className="p-4 space-y-5">
                  {[
                    { key: 'stability', label: ta('stability'), min: 0, max: 1, step: 0.05, left: ta('variable'), right: ta('stable'), fmt: v => v.toFixed(2) },
                    { key: 'similarityBoost', label: ta('similarityBoost'), min: 0, max: 1, step: 0.05, left: ta('low'), right: ta('high'), fmt: v => v.toFixed(2) },
                    { key: 'speed', label: ta('speed'), min: 0.5, max: 1.2, step: 0.1, left: ta('slower'), right: ta('faster'), fmt: v => v.toFixed(1) },
                    { key: 'style', label: ta('styleExaggeration'), min: 0, max: 1, step: 0.05, left: ta('none'), right: ta('exaggerated'), fmt: v => v.toFixed(2) }
                  ].map(s => (
                    <div key={s.key}>
                      <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-1">
                        <span>{s.label}</span>
                        <span className="text-primary-600 font-medium">{s.fmt(voiceSettings[s.key])}</span>
                      </div>
                      <input type="range" min={s.min} max={s.max} step={s.step} value={voiceSettings[s.key]}
                        onChange={(e) => setVoiceSettings({ ...voiceSettings, [s.key]: parseFloat(e.target.value) })}
                        className="w-full h-2 bg-gray-200 dark:bg-dark-hover rounded-lg appearance-none cursor-pointer accent-primary-600"
                      />
                      <div className="flex justify-between text-[10px] text-gray-400 mt-0.5"><span>{s.left}</span><span>{s.right}</span></div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-dark-border">
                    <div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{ta('useSpeakerBoost')}</span>
                      <p className="text-xs text-gray-400">{ta('similarityBoost')}</p>
                    </div>
                    <button
                      onClick={() => setVoiceSettings({ ...voiceSettings, useSpeakerBoost: !voiceSettings.useSpeakerBoost })}
                      className={`w-11 h-6 rounded-full transition-colors ${voiceSettings.useSpeakerBoost ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${voiceSettings.useSpeakerBoost ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sub-panel: Background Sound */}
            {advancedSubPanel === 'bgSound' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('backgroundSound')}</h3>
                </div>
                <div className="p-4 space-y-3">
                  {[
                    { value: 'off', label: 'Off', desc: 'No background noise' },
                    { value: 'office', label: 'Office', desc: 'Subtle office ambience' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setVoiceSettings({ ...voiceSettings, backgroundSound: opt.value })}
                      className={`w-full flex items-center justify-between p-3 rounded-lg border transition-colors text-left ${voiceSettings.backgroundSound === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                    >
                      <div>
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{opt.label}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
                      </div>
                      {voiceSettings.backgroundSound === opt.value && (
                        <svg className="w-5 h-5 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Sub-panel: Agent Tools */}
            {advancedSubPanel === 'tools' && (
              <>
                <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
                  <div className="flex items-center gap-3">
                    <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('agentTools')}</h3>
                  </div>
                  <button onClick={openAddToolModal} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700">+ {ta('add')}</button>
                </div>
                <div className="p-4">
                  {tools.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-dark-hover rounded-lg border border-dashed border-gray-300 dark:border-dark-border">
                      <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <p className="text-sm text-gray-500">{ta('noToolsConfigured')}</p>
                      <p className="text-xs text-gray-400 mt-1">{ta('addToolsDesc')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tools.map((tool, index) => {
                        const getToolLabel = (tl) => {
                          if (tl.type === 'function') return tl.function?.name || ta('function')
                          if (tl.type === 'ghl.contact.get') return ta('getContact')
                          if (tl.type === 'ghl.contact.create') return ta('createContact')
                          if (tl.type === 'ghl.calendar.availability.check') return ta('checkAvailability')
                          if (tl.type === 'ghl.calendar.event.create') return ta('bookAppointment')
                          return tl.type
                        }
                        const getToolBadge = (tb) => {
                          if (tb.type.startsWith('ghl.')) return 'GHL'
                          return tb.type
                        }
                        return (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg border border-gray-200 dark:border-dark-border">
                            <div>
                              <span className="font-medium text-sm text-gray-900 dark:text-white">{getToolLabel(tool)}</span>
                              <span className={`ml-2 px-2 py-0.5 text-xs rounded ${tool.type.startsWith('ghl.') ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'}`}>{getToolBadge(tool)}</span>
                            </div>
                            <div className="flex gap-1">
                              <button onClick={() => openEditToolModal(tool, index)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => handleDeleteTool(index)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Webhook */}
            {advancedSubPanel === 'webhook' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('postCallWebhook')}</h3>
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{ta('webhookUrlLabel')}</label>
                    <input
                      type="url"
                      value={serverConfig.serverUrl}
                      onChange={(e) => setServerConfig({ ...serverConfig, serverUrl: e.target.value })}
                      placeholder="https://your-server.com/webhook"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">{ta('receivesCallData')}</p>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{ta('webhookSecret')}</label>
                    <input
                      type="password"
                      value={serverConfig.serverUrlSecret}
                      onChange={(e) => setServerConfig({ ...serverConfig, serverUrlSecret: e.target.value })}
                      placeholder="Secret for authentication"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Sub-panel: Structured Data */}
            {advancedSubPanel === 'structuredData' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('structuredData')}</h3>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('structuredDataFullDesc')}</p>

                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ta('enableStructuredDataToggle')}</span>
                    <button
                      onClick={() => setServerConfig({ ...serverConfig, structuredDataEnabled: !serverConfig.structuredDataEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${serverConfig.structuredDataEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${serverConfig.structuredDataEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {serverConfig.structuredDataEnabled && (
                    <>
                      {/* JSON Schema */}
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{ta('jsonSchema')}</label>
                        <textarea
                          value={serverConfig.structuredDataSchema}
                          onChange={(e) => setServerConfig({ ...serverConfig, structuredDataSchema: e.target.value })}
                          rows={8}
                          placeholder={'{\n  "type": "object",\n  "properties": {\n    "customerName": { "type": "string" },\n    "appointmentDate": { "type": "string" },\n    "issue": { "type": "string" }\n  }\n}'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm font-mono"
                          spellCheck={false}
                        />
                        <p className="text-xs text-gray-400 mt-1">{ta('jsonSchemaPlaceholder')}</p>
                      </div>

                      {/* Extraction Prompt */}
                      <div>
                        <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{ta('extractionInstructions')}</label>
                        <textarea
                          value={serverConfig.structuredDataPrompt}
                          onChange={(e) => setServerConfig({ ...serverConfig, structuredDataPrompt: e.target.value })}
                          rows={3}
                          placeholder="Extract the customer's name, appointment date they requested, and the issue they described..."
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                        />
                        <p className="text-xs text-gray-400 mt-1">{ta('extractionInstructionsDesc')}</p>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Stop Speaking */}
            {advancedSubPanel === 'stopSpeaking' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('stopSpeakingPlan')}</h3>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('stopSpeakingDesc')}</p>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ta('enableStopSpeaking')}</span>
                    <button
                      onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, stopSpeakingEnabled: !callBehaviorSettings.stopSpeakingEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${callBehaviorSettings.stopSpeakingEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${callBehaviorSettings.stopSpeakingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {callBehaviorSettings.stopSpeakingEnabled && (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">{ta('numberOfWords')}</label>
                          <span className="text-xs text-gray-500">{callBehaviorSettings.stopSpeakingNumWords}</span>
                        </div>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          step={1}
                          value={callBehaviorSettings.stopSpeakingNumWords}
                          onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, stopSpeakingNumWords: parseInt(e.target.value) })}
                          className="w-full accent-primary-600"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">{ta('wordsBeforeStop')}</p>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">{ta('voiceSeconds')}</label>
                          <span className="text-xs text-gray-500">{callBehaviorSettings.stopSpeakingVoiceSeconds}s</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={2}
                          step={0.1}
                          value={callBehaviorSettings.stopSpeakingVoiceSeconds}
                          onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, stopSpeakingVoiceSeconds: parseFloat(e.target.value) })}
                          className="w-full accent-primary-600"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">{ta('voiceActivityDuration')}</p>
                      </div>

                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">{ta('backoffSeconds')}</label>
                          <span className="text-xs text-gray-500">{callBehaviorSettings.stopSpeakingBackoffSeconds}s</span>
                        </div>
                        <input
                          type="range"
                          min={0.5}
                          max={5}
                          step={0.5}
                          value={callBehaviorSettings.stopSpeakingBackoffSeconds}
                          onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, stopSpeakingBackoffSeconds: parseFloat(e.target.value) })}
                          className="w-full accent-primary-600"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">{ta('backoffCooldown')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Start Speaking */}
            {advancedSubPanel === 'startSpeaking' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('startSpeakingPlan')}</h3>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('startSpeakingDesc')}</p>

                  <div className="flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ta('enableStartSpeaking')}</span>
                    <button
                      onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingEnabled: !callBehaviorSettings.startSpeakingEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${callBehaviorSettings.startSpeakingEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${callBehaviorSettings.startSpeakingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {callBehaviorSettings.startSpeakingEnabled && (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">{ta('waitSeconds')}</label>
                          <span className="text-xs text-gray-500">{callBehaviorSettings.startSpeakingWaitSeconds}s</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={5}
                          step={0.1}
                          value={callBehaviorSettings.startSpeakingWaitSeconds}
                          onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingWaitSeconds: parseFloat(e.target.value) })}
                          className="w-full accent-primary-600"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">{ta('waitSecondsDesc')}</p>
                      </div>

                      <div className="border-t border-gray-200 dark:border-dark-border pt-4">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{ta('smartEndpointing')}</span>
                          <button
                            onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingSmartEndpointing: !callBehaviorSettings.startSpeakingSmartEndpointing })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${callBehaviorSettings.startSpeakingSmartEndpointing ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${callBehaviorSettings.startSpeakingSmartEndpointing ? 'translate-x-6' : 'translate-x-1'}`} />
                          </button>
                        </div>
                        <p className="text-xs text-gray-400 mb-3">{ta('smartEndpointingDesc')}</p>

                        {callBehaviorSettings.startSpeakingSmartEndpointing && (
                          <div>
                            <label className="block text-xs text-gray-600 dark:text-gray-400 mb-1">{ta('provider')}</label>
                            <div className="flex flex-wrap gap-2">
                              {['livekit', 'vapi', 'krisp', 'deepgram-flux', 'assembly'].map(p => (
                                <button
                                  key={p}
                                  onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingSmartProvider: p })}
                                  className={`py-1.5 px-3 rounded-lg text-xs font-medium border transition-colors ${callBehaviorSettings.startSpeakingSmartProvider === p ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                                >
                                  {p.charAt(0).toUpperCase() + p.slice(1)}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      {!callBehaviorSettings.startSpeakingSmartEndpointing && (
                        <div className="border-t border-gray-200 dark:border-dark-border pt-4 space-y-4">
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{ta('transcriptionEndpointing')}</p>

                          <div>
                            <div className="flex justify-between mb-1">
                              <label className="text-xs text-gray-600 dark:text-gray-400">{ta('onPunctuation')}</label>
                              <span className="text-xs text-gray-500">{callBehaviorSettings.startSpeakingOnPunctuationSeconds}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={callBehaviorSettings.startSpeakingOnPunctuationSeconds}
                              onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingOnPunctuationSeconds: parseFloat(e.target.value) })}
                              className="w-full accent-primary-600"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">{ta('onPunctuationDesc')}</p>
                          </div>

                          <div>
                            <div className="flex justify-between mb-1">
                              <label className="text-xs text-gray-600 dark:text-gray-400">{ta('onNoPunctuation')}</label>
                              <span className="text-xs text-gray-500">{callBehaviorSettings.startSpeakingOnNoPunctuationSeconds}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={5}
                              step={0.1}
                              value={callBehaviorSettings.startSpeakingOnNoPunctuationSeconds}
                              onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingOnNoPunctuationSeconds: parseFloat(e.target.value) })}
                              className="w-full accent-primary-600"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">{ta('onNoPunctuationDesc')}</p>
                          </div>

                          <div>
                            <div className="flex justify-between mb-1">
                              <label className="text-xs text-gray-600 dark:text-gray-400">{ta('onNumber')}</label>
                              <span className="text-xs text-gray-500">{callBehaviorSettings.startSpeakingOnNumberSeconds}s</span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={3}
                              step={0.1}
                              value={callBehaviorSettings.startSpeakingOnNumberSeconds}
                              onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingOnNumberSeconds: parseFloat(e.target.value) })}
                              className="w-full accent-primary-600"
                            />
                            <p className="text-xs text-gray-400 mt-0.5">{ta('onNumberDesc')}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Call Timeouts */}
            {advancedSubPanel === 'callTimeouts' && (
              <>
                <div className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-dark-border">
                  <button onClick={() => setAdvancedSubPanel(null)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('callTimeouts')}</h3>
                </div>
                <div className="p-4 space-y-4 overflow-y-auto max-h-[60vh]">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('callTimeoutsDesc')}</p>

                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs text-gray-600 dark:text-gray-400">{ta('maxCallDuration')}</label>
                      <span className="text-xs text-gray-500">{Math.floor(callBehaviorSettings.maxDurationSeconds / 60)} {ta('min')}</span>
                    </div>
                    <input
                      type="range"
                      min={60}
                      max={7200}
                      step={60}
                      value={callBehaviorSettings.maxDurationSeconds}
                      onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, maxDurationSeconds: parseInt(e.target.value) })}
                      className="w-full accent-primary-600"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">{ta('maxCallDurationDesc')} ({callBehaviorSettings.maxDurationSeconds}s)</p>
                  </div>

                  <div>
                    <div className="flex justify-between mb-1">
                      <label className="text-xs text-gray-600 dark:text-gray-400">{ta('silenceTimeoutLabel')}</label>
                      <span className="text-xs text-gray-500">{callBehaviorSettings.silenceTimeoutSeconds}s</span>
                    </div>
                    <input
                      type="range"
                      min={5}
                      max={120}
                      step={5}
                      value={callBehaviorSettings.silenceTimeoutSeconds}
                      onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, silenceTimeoutSeconds: parseInt(e.target.value) })}
                      className="w-full accent-primary-600"
                    />
                    <p className="text-xs text-gray-400 mt-0.5">{ta('silenceTimeoutDesc')}</p>
                  </div>
                </div>
              </>
            )}

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

      {/* Voice Picker Modal */}
      {showVoicePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={closeVoicePicker}>
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Choose a Voice</h2>
              <button onClick={closeVoicePicker} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-200 dark:border-dark-border">
              <select
                value={voiceProviderFilter}
                onChange={(e) => setVoiceProviderFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">All Voices</option>
                <option value="11labs">ElevenLabs</option>
                <option value="custom">Custom</option>
              </select>
              <select
                value={voiceGenderFilter}
                onChange={(e) => setVoiceGenderFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">All Genders</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <select
                value={voiceAccentFilter}
                onChange={(e) => setVoiceAccentFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">All Accents</option>
                <option value="american">American</option>
                <option value="british">British</option>
                <option value="australian">Australian</option>
                <option value="swedish">Swedish</option>
                <option value="transatlantic">Transatlantic</option>
                <option value="mexican">Mexican</option>
                <option value="colombian">Colombian</option>
                <option value="argentinian">Argentinian</option>
                <option value="chilean">Chilean</option>
                <option value="peruvian">Peruvian</option>
                <option value="venezuelan">Venezuelan</option>
                <option value="cuban">Cuban</option>
                <option value="dominican">Dominican</option>
                <option value="puerto rican">Puerto Rican</option>
                <option value="ecuadorian">Ecuadorian</option>
                <option value="uruguayan">Uruguayan</option>
                <option value="paraguayan">Paraguayan</option>
                <option value="bolivian">Bolivian</option>
                <option value="costarrican">Costa Rican</option>
                <option value="panamanian">Panamanian</option>
                <option value="guatemalan">Guatemalan</option>
                <option value="honduran">Honduran</option>
                <option value="salvadoran">Salvadoran</option>
                <option value="nicaraguan">Nicaraguan</option>
                <option value="spanish">Spanish (Spain)</option>
              </select>
              <select
                value={voiceLanguageFilter}
                onChange={(e) => setVoiceLanguageFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">All Languages</option>
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="fr">French</option>
                <option value="de">German</option>
                <option value="it">Italian</option>
                <option value="pt">Portuguese</option>
                <option value="pl">Polish</option>
                <option value="nl">Dutch</option>
                <option value="ru">Russian</option>
                <option value="ja">Japanese</option>
                <option value="zh">Chinese</option>
                <option value="ko">Korean</option>
                <option value="hi">Hindi</option>
                <option value="ar">Arabic</option>
                <option value="sv">Swedish</option>
                <option value="da">Danish</option>
                <option value="fi">Finnish</option>
                <option value="no">Norwegian</option>
                <option value="tr">Turkish</option>
                <option value="el">Greek</option>
                <option value="cs">Czech</option>
                <option value="ro">Romanian</option>
                <option value="hu">Hungarian</option>
                <option value="sk">Slovak</option>
                <option value="uk">Ukrainian</option>
                <option value="vi">Vietnamese</option>
                <option value="id">Indonesian</option>
                <option value="ms">Malay</option>
                <option value="he">Hebrew</option>
              </select>
              <div className="relative flex-1 min-w-[150px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={voiceSearch}
                  onChange={(e) => setVoiceSearch(e.target.value)}
                  placeholder="Search..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Voice Grid */}
            <div className="flex-1 overflow-y-auto p-4">
              {voicesLoading ? (
                <div className="flex justify-center py-10">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {/* Manual Voice ID Card */}
                  <div className={`rounded-lg border border-dashed p-3 flex flex-col justify-between ${addVoiceManually && customVoiceId ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' : 'border-gray-300 dark:border-dark-border'}`}>
                    <div className="mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Add Voice ID Manually</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Paste an ElevenLabs voice ID</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customVoiceId}
                        onChange={(e) => setCustomVoiceId(e.target.value)}
                        placeholder="Voice ID..."
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        disabled={!customVoiceId.trim()}
                        onClick={(e) => {
                          e.stopPropagation()
                          setVoiceProvider('11labs')
                          setVoiceId(customVoiceId.trim())
                          setAddVoiceManually(true)
                          closeVoicePicker()
                        }}
                        className="px-2.5 py-1.5 rounded-md bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        Use
                      </button>
                    </div>
                  </div>
                  {getFilteredPickerVoices().map((voice) => {
                    const isPlaying = previewPlayingId === voice.voiceId
                    const isSelected = !addVoiceManually && voiceId === voice.voiceId
                    return (
                      <div
                        key={`${voice.provider}-${voice.voiceId}`}
                        className={`relative rounded-lg border p-3 cursor-pointer transition-all ${
                          isSelected
                            ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500'
                            : isPlaying
                              ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                              : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                        onClick={() => selectVoiceFromPicker(voice)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{voice.name}</span>
                          {isSelected && (
                            <svg className="w-4 h-4 text-primary-600 flex-shrink-0 ml-1" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        {voice.description && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">{voice.description}</p>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                              voice.isCustom
                                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                            }`}>
                              {voice.isCustom ? 'Custom' : 'ElevenLabs'}
                            </span>
                            {voice.gender && (
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                voice.gender === 'female'
                                  ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
                                  : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                              }`}>
                                {voice.gender === 'female' ? 'F' : 'M'}
                              </span>
                            )}
                            {voice.accent && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                                {voice.accent.charAt(0).toUpperCase() + voice.accent.slice(1)}
                              </span>
                            )}
                            {(voice.languages || []).length > 3 ? (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">
                                {voice.languages.length} langs
                              </span>
                            ) : (voice.languages || []).map(lang => (
                              <span key={lang} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">
                                {lang.toUpperCase()}
                              </span>
                            ))}
                          </div>
                          {voice.previewUrl && (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleVoicePreview(voice) }}
                              className={`p-1 rounded-full transition-colors ${
                                isPlaying
                                  ? 'text-primary-600 bg-primary-100 dark:bg-primary-900/30'
                                  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-hover'
                              }`}
                            >
                              {isPlaying ? (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <rect x="6" y="4" width="4" height="16" rx="1" />
                                  <rect x="14" y="4" width="4" height="16" rx="1" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                  <path d="M8 5v14l11-7z" />
                                </svg>
                              )}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {!voicesLoading && getFilteredPickerVoices().length === 0 && (
                <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">No voices match your filters</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Agent Info Modal */}
      {showAgentInfoModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowAgentInfoModal(false)}>
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Agent Info</h3>
              <button onClick={() => setShowAgentInfoModal(false)} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Agent name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
                  placeholder="Short description of this agent's purpose..."
                />
              </div>
              {assignedPhoneId && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Agent Type</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'outbound', label: 'Outbound', desc: 'Makes outgoing calls only' },
                      { value: 'inbound', label: 'Inbound & Outbound', desc: 'Receives and makes calls' }
                    ].map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => setAgentType(opt.value)}
                        className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${agentType === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300' : 'border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                      >
                        <div className="text-center">
                          <div>{opt.label}</div>
                          <div className="text-[10px] font-normal opacity-70 mt-0.5">{opt.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowAgentInfoModal(false)}
                className="w-full py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors font-medium text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
