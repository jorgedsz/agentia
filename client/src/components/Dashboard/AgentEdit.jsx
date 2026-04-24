import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agentsAPI, phoneNumbersAPI, callsAPI, creditsAPI, ghlAPI, calendarAPI, promptGeneratorAPI, accountSettingsAPI, voicesAPI, pricingAPI, toolsAPI, chatbotsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { TRANSCRIBER_PROVIDERS, MODELS_BY_PROVIDER } from '../../constants/models'
import TestCallModal from './TestCallModal'
import TrainingCallModal from './TrainingCallModal'

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

// TRANSCRIBER_PROVIDERS imported from constants/models.js

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
  { id: 'groq', label: 'Groq', icon: '🟣' },
  { id: 'deepseek', label: 'DeepSeek', icon: '🔷' },
  { id: 'mistral', label: 'Mistral', icon: '🟡' },
]

// Latency estimates per component (ms)
const STT_LATENCY = {
  deepgram: 800,
  'assembly-ai': 1000,
  azure: 900,
  openai: 700,
  speechmatics: 850,
  talkscriber: 1000,
  cartesia: 750,
}
const TTS_LATENCY = { '11labs': 500 }

// MODELS_BY_PROVIDER imported from constants/models.js

const MAX_LATENCY = 5000 // ms

function getSpeedTag(llmLatency) {
  if (llmLatency <= 200) return '⚡ Fastest'
  if (llmLatency <= 500) return '🟢 Fast'
  if (llmLatency <= 1000) return '🟡 Medium'
  if (llmLatency <= 2000) return '🟠 Slow'
  return '🔴 Slowest'
}

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
  { id: 'apiRequest', label: 'API Request (HTTP)' },
  { id: 'endCall', label: 'End Call' },
]

const HTTP_METHODS = ['POST', 'GET', 'PUT', 'PATCH', 'DELETE']

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
  const { t, language: uiLanguage } = useLanguage()
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
  const [firstMessageOutbound, setFirstMessageOutbound] = useState('')
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

  // Dynamic pricing rates
  const [modelRates, setModelRates] = useState({}) // { 'provider::model': rate }
  const [transcriberRates, setTranscriberRates] = useState({}) // { 'provider': rate }

  // Prompt generator
  const [showPromptGenerator, setShowPromptGenerator] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [generatedFirstMessage, setGeneratedFirstMessage] = useState('')
  const [promptMode, setPromptMode] = useState('generate')
  // Update mode state (kept as-is)
  const [updateDescription, setUpdateDescription] = useState('')
  const [updateLanguage, setUpdateLanguage] = useState('en')
  // Wizard state
  const [wizardStep, setWizardStep] = useState(1)
  const [wizBotType, setWizBotType] = useState('')
  const [wizDirection, setWizDirection] = useState('outbound')
  const [wizLanguage, setWizLanguage] = useState('en')
  const [wizCompanyName, setWizCompanyName] = useState('')
  const [wizIndustry, setWizIndustry] = useState('')
  const [wizTone, setWizTone] = useState('professional')
  const [wizGoals, setWizGoals] = useState('')
  const [wizTypeConfig, setWizTypeConfig] = useState({})
  const [wizAdditionalNotes, setWizAdditionalNotes] = useState('')

  // Feature toggles
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [showAdvancedModal, setShowAdvancedModal] = useState(false)
  const [showAfterCallModal, setShowAfterCallModal] = useState(false)
  const [advancedSubPanel, setAdvancedSubPanel] = useState(null) // null = grid view, or 'voiceModel', 'voiceTuning', 'bgSound', 'tools', 'webhook', 'recording', 'transcript', 'summary'
  const [advancedInfoPopup, setAdvancedInfoPopup] = useState(null) // which sub-panel info popup is open
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const providerDropdownRef = useRef(null)

  // API Trigger collapsible sections
  const [expandedSection, setExpandedSection] = useState(null)
  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  // Trigger variables
  const [variables, setVariables] = useState([])
  const [newVarName, setNewVarName] = useState('')
  const [newVarDefault, setNewVarDefault] = useState('')
  const [triggerApiKey, setTriggerApiKey] = useState('')

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
    contactId: '',       // GHL contact ID for testing (optional)
    appointmentTitle: '', // Optional title template for created appointments (supports {{contact.name}}, {{contactName}}, etc.)
    requiredFields: { contactName: true, contactEmail: true, contactPhone: false }, // Which contact fields the agent must collect
    calendars: []        // Multi-calendar: [{ id, name, scenario, provider, integrationId, calendarId, timezone, appointmentDuration, contactId, appointmentTitle, requiredFields }]
  })

  // Per-calendar-entry dropdown data: { [entryId]: { calendars: [], loading: false, error: '' } }
  const [providerCalendarsMap, setProviderCalendarsMap] = useState({})
  // Track which multi-calendar entry is expanded (null = all collapsed)
  const [expandedCalendarEntry, setExpandedCalendarEntry] = useState(null)

  // GHL CRM config
  const [ghlCrmConfig, setGhlCrmConfig] = useState({
    enabled: false,
    deleteOldTags: false,
    pipelineId: '',
    pipelineName: '',
    tagMapping: {
      booked: [], answered: [], not_interested: [],
      no_answer: [], failed: [], transferred: []
    },
    pipelineMapping: {
      booked: '', answered: '', not_interested: '',
      no_answer: '', failed: '', transferred: ''
    },
    userMapping: {
      booked: '', answered: '', not_interested: '',
      no_answer: '', failed: '', transferred: ''
    },
    noteMapping: {
      booked: { type: 'none', text: '' },
      answered: { type: 'none', text: '' },
      not_interested: { type: 'none', text: '' },
      no_answer: { type: 'none', text: '' },
      failed: { type: 'none', text: '' },
      transferred: { type: 'none', text: '' }
    }
  })
  const [ghlPipelines, setGhlPipelines] = useState([])
  const [ghlTags, setGhlTags] = useState([])
  const [ghlCustomFields, setGhlCustomFields] = useState([])
  const [ghlUsers, setGhlUsers] = useState([])
  const [ghlCrmLoading, setGhlCrmLoading] = useState(false)
  const [ghlCrmError, setGhlCrmError] = useState('')

  // Callback scheduling config
  const [callbackConfig, setCallbackConfig] = useState({
    enabled: false
  })

  // Follow-up calls config
  const [followUpConfig, setFollowUpConfig] = useState({
    enabled: false,
    maxAttempts: 3,
    intervals: [120, 120, 120],
    outcomes: ['no_answer', 'failed']
  })

  // Chatbot trigger config
  const [chatbotTriggerConfig, setChatbotTriggerConfig] = useState({
    enabled: false,
    chatbotId: '',
    chatbotName: '',
    triggerOn: 'always',
    outcomes: ['booked', 'answered'],
    structuredDataField: '',
    structuredDataValue: 'true',
    delayMinutes: 0,
    messageTemplate: ''
  })
  const [chatbotsList, setChatbotsList] = useState([])
  const [chatbotsLoading, setChatbotsLoading] = useState(false)

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
    type: 'apiRequest',
    functionName: '',
    functionDescription: '',
    httpMethod: 'POST',
    webhookUrl: '',
    httpHeaders: [],
    httpBodyFields: [],
    async: false,
    endCallMessage: ''
  })
  const [testRequestState, setTestRequestState] = useState({
    loading: false,
    expanded: false,
    testFields: [],
    result: null,
    error: null
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
    structuredDataFields: [],
    structuredDataPrompt: '',
    ghlCustomFields: []
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
  const [showTrainingModal, setShowTrainingModal] = useState(false)

  useEffect(() => {
    fetchAgent()
    fetchPhoneNumbers()
    fetchCredits()
    fetchTriggerKey()
    fetchGhlStatus()
    fetchCalendarIntegrations()
    fetchPricingRates()
    fetchVoicesList()
  }, [id])

  const fetchVoicesList = async () => {
    try {
      const res = await voicesAPI.list()
      setVoicesList(res.data)
    } catch (err) {
      console.error('Failed to load voices:', err)
    }
  }

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

  const fetchPricingRates = async () => {
    try {
      const [modelsRes, transcribersRes] = await Promise.all([
        pricingAPI.getModelRates(),
        pricingAPI.getTranscriberRates()
      ])
      // Build lookup maps — use global rates only (agency's own cost)
      // Overrides are for clients, not the agency's own agents
      const mRates = {}
      const rates = modelsRes.data.rates || modelsRes.data.globalRates || []
      rates.forEach(r => { mRates[`${r.provider}::${r.model}`] = r.rate })
      setModelRates(mRates)

      const tRates = {}
      const tList = transcribersRes.data.rates || transcribersRes.data.globalRates || []
      tList.forEach(r => { tRates[r.provider] = r.rate })
      setTranscriberRates(tRates)
    } catch (err) {
      console.error('Failed to fetch pricing rates:', err)
    }
  }

  const fetchGhlCalendars = async () => {
    setGhlCalendarsLoading(true)
    setGhlError('')
    try {
      const response = await ghlAPI.getCalendars()
      setGhlCalendars(response.data.calendars || [])
    } catch (err) {
      setGhlError(err.response?.data?.error || ta('failedFetchCalendars'))
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
      setProviderError(err.response?.data?.error || ta('failedFetchCalendars'))
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
      appointmentDuration: calendarConfig.appointmentDuration,
      contactId: calendarConfig.contactId,
      appointmentTitle: calendarConfig.appointmentTitle,
      requiredFields: calendarConfig.requiredFields
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
        [entryId]: { calendars: [], loading: false, error: err.response?.data?.error || ta('failedFetchCalendars') }
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

  const fetchTriggerKey = async () => {
    try {
      const { data } = await accountSettingsAPI.getTriggerKey()
      setTriggerApiKey(data.triggerApiKey || '')
    } catch (err) {
      // Key may not exist yet — leave blank
    }
  }

  const fetchGhlCrmData = async () => {
    setGhlCrmLoading(true)
    setGhlCrmError('')
    const errors = []
    try {
      const [pipelinesRes, tagsRes, customFieldsRes, usersRes] = await Promise.all([
        ghlAPI.getPipelines().catch(e => { errors.push(e.response?.data?.error || 'Pipelines failed'); return { data: { pipelines: [] } } }),
        ghlAPI.getTags().catch(e => { errors.push(e.response?.data?.error || 'Tags failed'); return { data: { tags: [] } } }),
        ghlAPI.getCustomFields().catch(e => { errors.push(e.response?.data?.error || 'Custom fields failed'); return { data: { customFields: [] } } }),
        ghlAPI.getUsers().catch(e => { errors.push(e.response?.data?.error || 'Users failed'); return { data: { users: [] } } })
      ])
      setGhlPipelines(pipelinesRes.data.pipelines || [])
      setGhlTags(tagsRes.data.tags || [])
      setGhlCustomFields(customFieldsRes.data.customFields || [])
      setGhlUsers(usersRes.data.users || [])
      if (errors.length > 0) {
        setGhlCrmError(errors[0] + (errors[0].includes('reconnect') ? '' : ' Try reconnecting GHL in Settings to grant CRM permissions.'))
      }
    } catch (err) {
      setGhlCrmError(ta('failedLoadGhlData'))
    } finally {
      setGhlCrmLoading(false)
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
      setFirstMessageOutbound(agentData.config?.firstMessageOutbound || '')
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

      // Load GHL CRM config
      if (agentData.config?.ghlCrmConfig) {
        setGhlCrmConfig(prev => ({ ...prev, ...agentData.config.ghlCrmConfig }))
      }

      // Load transfer config
      if (agentData.config?.transferConfig) {
        setTransferConfig(agentData.config.transferConfig)
      }

      // Load callback config
      if (agentData.config?.callbackConfig) {
        setCallbackConfig(agentData.config.callbackConfig)
      }

      // Load follow-up config
      if (agentData.config?.followUpConfig) {
        setFollowUpConfig(prev => ({ ...prev, ...agentData.config.followUpConfig }))
      }

      // Load chatbot trigger config
      if (agentData.config?.chatbotTriggerConfig) {
        setChatbotTriggerConfig(prev => ({ ...prev, ...agentData.config.chatbotTriggerConfig }))
      }

      // Load trigger variables
      setVariables(agentData.config?.variables || [])

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


      // Load tools (filter out calendar + transfer + callback tools — they're rebuilt from config on save)
      const isCalendarTool = (toolName) => toolName && (toolName.startsWith('check_calendar_availability') || toolName.startsWith('book_appointment'))
      const isCallbackTool = (toolName) => toolName && toolName.startsWith('schedule_callback')
      const isTransferTool = (tool) => tool.type === 'transferCall'
      const rawTools = (agentData.config?.tools || []).filter(t => !isCalendarTool(t.function?.name || t.name || '') && !isCallbackTool(t.function?.name || t.name || '') && !isTransferTool(t))
      // Normalize all tools to flat apiRequest format
      const savedTools = rawTools.map(t => {
        if (t.type === 'function' || (t.type === 'apiRequest' && (t.function || t.server || !t.url))) {
          // Extract fields from any format: flat, function+server, or hybrid
          return {
            type: 'apiRequest',
            name: t.name || t.function?.name || '',
            description: t.description || t.function?.description || '',
            method: t.method || 'POST',
            url: t.url || t.server?.url || '',
            headers: t.headers || { type: 'object', properties: {} },
            body: t.body || t.function?.parameters || { type: 'object', properties: {} },
            timeoutSeconds: t.timeoutSeconds || t.server?.timeoutSeconds || 20,
            ...(t.messages ? { messages: t.messages } : {})
          }
        }
        return t
      })
      setTools(savedTools)

      // Load server config
      if (agentData.config?.serverUrl || agentData.config?.serverConfig || agentData.config?.structuredDataEnabled || agentData.config?.ghlCustomFields) {
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
          structuredDataFields: (() => {
            try {
              const schema = cfg.structuredDataSchema ? JSON.parse(cfg.structuredDataSchema) : {}
              if (schema.properties) {
                return Object.entries(schema.properties).map(([k, v]) => ({
                  key: k, type: v.type || 'string', description: v.description || ''
                }))
              }
            } catch {}
            return []
          })(),
          structuredDataPrompt: cfg.structuredDataPrompt || '',
          ghlCustomFields: cfg.ghlCustomFields || []
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
      setError(ta('failedLoadAgent'))
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
      const assigned = allNumbers.find(p => p.agentId === id)
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
      setSuccess(newPhoneId ? ta('phoneAssignedSuccess') : ta('phoneUnassignedSuccess'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      console.error('Failed to assign phone number:', err)
      setError(err.response?.data?.error || ta('failedAssignPhone'))
      await fetchPhoneNumbers()
    } finally {
      setAssigningPhone(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault()

    if (!firstMessage.trim()) {
      setError(ta('firstMessageRequired'))
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const finalVoiceId = addVoiceManually ? customVoiceId : voiceId

      // Detect the effective language for tool messages.
      // The config 'language' may not be set for older agents — fall back to the
      // transcriber language (which the user explicitly picked) and to content.
      const effectiveLanguage = (() => {
        if (language === 'es' || (language && language.startsWith('es'))) return 'es'
        const tl = (transcriberLanguage || '').toLowerCase()
        if (tl.startsWith('es') || tl === 'spanish') return 'es'
        const fm = (firstMessage || '').trim().toLowerCase()
        if (/^[¡¿\s]*(hola|buenos|buenas|bienvenido|gracias por|qué tal|muy buenos)/.test(fm)) return 'es'
        const sp = (systemPrompt || '').toLowerCase()
        if (/español|hablas?\s+en\s+español|eres\s+un\s+asistente|tu\s+nombre\s+es|idioma.*español|responde\s+en\s+español/.test(sp)) return 'es'
        return language || 'en'
      })()

      // Build calendar tools using unified API endpoints (supports all providers)
      const calendarTools = []
      const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
      // Sanitize agent name for use in tool names (lowercase, underscores, no special chars)
      // VAPI limit: tool names must be <= 40 chars and match /^[a-zA-Z0-9_-]{1,40}$/
      // Longest prefix is "check_calendar_availability_" (28 chars), leaves 12 for suffix
      // For multi-calendar suffix is "${safeName}_${idx}", so cap safeName at 10 chars
      const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '').substring(0, 10).replace(/_$/g, '')

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

          // Add GHL contact ID for testing if provided (static test ID only)
          if (cal.provider === 'ghl' && cal.contactId) {
            queryParamsObj.contactId = cal.contactId
          }

          // Optional appointment title template (resolved server-side with contact vars)
          if (cal.appointmentTitle) {
            queryParamsObj.title = cal.appointmentTitle
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
                content: effectiveLanguage === 'es' ? 'Déjame revisar qué horarios tengo para ese día.' : 'Let me check what times are available for that day.'
              }
            ]
          })

          // Book Appointment Tool - build properties and required fields based on config
          const isGhl = cal.provider === 'ghl'
          const rf = cal.requiredFields || { contactName: true, contactEmail: true, contactPhone: false }
          const bookProperties = {
            startTime: {
              type: 'string',
              description: 'The appointment start time in ISO 8601 format (e.g., 2026-02-08T10:00:00)'
            },
            endTime: {
              type: 'string',
              description: 'The appointment end time in ISO 8601 format (e.g., 2026-02-08T10:30:00). Defaults to 30 minutes after startTime if not provided.'
            }
          }
          const bookRequired = ['startTime']

          if (isGhl) {
            // GHL calendars: prefer contactId from webhook, fall back to name/email for test/inbound calls
            bookProperties.contactId = {
              type: 'string',
              description: 'The GHL contact ID for this customer. The value is provided in the system instructions.'
            }
            bookProperties.contactName = { type: 'string', description: 'The customer\'s full name. Only needed when contactId is not available.' }
            bookProperties.contactEmail = { type: 'string', description: 'The customer\'s email address. Only needed when contactId is not available.' }
            // No extra required fields — system prompt tells AI which to use
          } else {
            // Non-GHL calendars: collect contact info from the customer
            if (rf.contactName) {
              bookProperties.contactName = { type: 'string', description: 'The customer\'s full name' }
              bookRequired.push('contactName')
            }
            if (rf.contactEmail) {
              bookProperties.contactEmail = { type: 'string', description: 'The customer\'s email address' }
              bookRequired.push('contactEmail')
            }
            if (rf.contactPhone) {
              bookProperties.contactPhone = { type: 'string', description: 'The customer\'s phone number' }
              bookRequired.push('contactPhone')
            }
          }
          bookProperties.notes = { type: 'string', description: 'Any additional notes for the appointment (optional)' }

          // Build description listing what data to collect
          const collectFields = []
          if (!isGhl && rf.contactName) collectFields.push('name')
          if (!isGhl && rf.contactEmail) collectFields.push('email')
          if (!isGhl && rf.contactPhone) collectFields.push('phone')
          const collectText = collectFields.length > 0 ? ` and collecting customer ${collectFields.join(', ')}` : ''

          calendarTools.push({
            type: 'apiRequest',
            method: 'POST',
            url: bookUrl,
            name: `book_appointment_${toolSuffix}`,
            description: isGhl
              ? `${descPrefix}Book an appointment for the customer. Follow the system instructions to determine whether to pass contactId or contactName/contactEmail.`
              : `${descPrefix}Book an appointment for the customer. Use this after confirming the date, time${collectText}.`,
            body: {
              type: 'object',
              properties: bookProperties,
              required: bookRequired
            },
            timeoutSeconds: 30,
            messages: [
              {
                type: 'request-start',
                content: effectiveLanguage === 'es' ? 'Perfecto, voy a agendar tu cita.' : 'Perfect, let me book your appointment.'
              }
            ]
          })
        })
      }

      // Build a single transferCall tool with all destinations (only one allowed per agent)
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

      // Build callback tool when enabled
      const callbackTools = []
      if (callbackConfig.enabled) {
        const cbIsEs = effectiveLanguage === 'es'
        const callbackUrl = `${apiBaseUrl}/callbacks/schedule?userId=${user?.id}&agentId=${id}`
        callbackTools.push({
          type: 'apiRequest',
          method: 'POST',
          url: callbackUrl,
          name: `schedule_callback_${safeName}`,
          description: cbIsEs
            ? 'Agenda una llamada de retorno para el cliente en una fecha y hora específicas. Úsalo cuando el cliente pida que lo llamen de vuelta más tarde.'
            : 'Schedule a callback for the customer at a specific date and time. Use this when the customer asks to be called back later.',
          body: {
            type: 'object',
            properties: {
              callbackTime: {
                type: 'string',
                description: cbIsEs
                  ? 'La fecha y hora de la llamada de retorno en formato ISO 8601 (por ejemplo, 2026-03-17T14:00:00). Calcúlalo a partir de {{currentDateTime}}.'
                  : 'The date and time for the callback in ISO 8601 format (e.g., 2026-03-17T14:00:00). Calculate from {{currentDateTime}}.'
              },
              reason: {
                type: 'string',
                description: cbIsEs
                  ? 'Motivo breve de la llamada de retorno (por ejemplo, "El cliente quiere revisar el precio tras leer la propuesta").'
                  : 'Brief reason for the callback (e.g., "Customer wants to discuss pricing after reviewing proposal")'
              }
            },
            required: ['callbackTime']
          },
          timeoutSeconds: 15,
          messages: [{
            type: 'request-start',
            content: cbIsEs ? 'Te agendo esa llamada de retorno...' : 'Let me schedule that callback for you...'
          }]
        })
      }

      // Merge regular tools with calendar + transfer + callback tools (filter duplicates)
      const isCalTool = (toolName) => toolName && (toolName.startsWith('check_calendar_availability') || toolName.startsWith('book_appointment'))
      const isCallbackToolName = (toolName) => toolName && toolName.startsWith('schedule_callback')
      const getToolName = (t) => t.function?.name || t.name || ''
      const regularTools = tools.filter(t => !isCalTool(getToolName(t)) && !isCallbackToolName(getToolName(t)))
      const allTools = [...regularTools, ...calendarTools, ...transferTools, ...callbackTools]

      // If at least 1 GHL function is enabled (GHL calendar, GHL CRM, or native GHL tools),
      // add contactId as body param so the LLM passes it from the {{contactId}} variable.
      // Skip calendar tools — GHL calendars already have contactId in their body params.
      const hasGhlCalendar = calendarConfig.enabled && getActiveCalendars().some(c => c.provider === 'ghl')
      const hasGhlFunction = hasGhlCalendar || ghlCrmConfig.enabled || allTools.some(t => t.type && t.type.startsWith('ghl.'))
      if (hasGhlFunction) {
        allTools.forEach(t => {
          if (t.type === 'apiRequest' && t.body?.properties) {
            const tName = t.name || ''
            // Skip calendar tools — they handle contactId themselves
            if (tName.startsWith('check_calendar_availability') || tName.startsWith('book_appointment')) return
            if (!t.body.properties.contactId) {
              t.body.properties.contactId = {
                type: 'string',
                description: 'The GHL contact ID for this customer. The value is provided in the system instructions.'
              }
            }
            if (!t.body.required) t.body.required = []
            if (!t.body.required.includes('contactId')) {
              t.body.required.push('contactId')
            }
          }
        })
      }

      // Generate calendar booking instructions if calendar is enabled
      let finalSystemPrompt = systemPrompt

      // If GHL functions are present but no GHL calendar, add contactId to system prompt
      // (GHL calendar adds its own "GHL Contact ID" section)
      const hasGhlCalActive = calendarConfig.enabled && getActiveCalendars().some(c => c.provider === 'ghl' && c.calendarId)
      if (hasGhlFunction && !hasGhlCalActive) {
        finalSystemPrompt += `\n\n### GHL Contact ID\nThe GHL contact ID for this customer is: "{{contactId}}"\nWhen calling GHL-related tools, pass this value as the contactId parameter.`
      }
      if (calendarConfig.enabled) {
        const activeCalendars = getActiveCalendars().filter(c => c.calendarId)
        const isMultiCalendar = activeCalendars.length >= 2

        if (isMultiCalendar) {
          // Multi-calendar prompt
          const allGhl = activeCalendars.every(c => c.provider === 'ghl')
          const someGhl = activeCalendars.some(c => c.provider === 'ghl')
          const calendarList = activeCalendars.map((cal, idx) => {
            const num = idx + 1
            const ghlTag = cal.provider === 'ghl' ? ' (GHL — uses contactId if available)' : ''
            return `- **${cal.name}**: ${cal.scenario}${ghlTag}
  - Check availability: "check_calendar_availability_${safeName}_${num}"
  - Book appointment: "book_appointment_${safeName}_${num}"`
          }).join('\n')

          const mIsEs = effectiveLanguage === 'es'
          const ghlContactIdNote = someGhl ? (mIsEs
            ? `\n\n### DATOS DEL CLIENTE (YA IDENTIFICADO)\nEl cliente ya está identificado en el sistema. Su contactId es: "{{contactId}}"\nPROHIBIDO pedir nombre, email, teléfono o cualquier dato personal al agendar en calendarios GHL. Usa este contactId directamente.`
            : `\n\n### CUSTOMER DATA (ALREADY IDENTIFIED)\nThe customer is already identified in the system. Their contactId is: "{{contactId}}"\nFORBIDDEN to ask for name, email, phone, or any personal data when booking GHL calendars. Use this contactId directly.`) : ''

          const calendarInstructions = `

## ${mIsEs ? 'INSTRUCCIONES DE AGENDAMIENTO DE CITAS (PRIORIDAD — ANULA CUALQUIER FLUJO DE FASES O GUIÓN)' : 'APPOINTMENT BOOKING INSTRUCTIONS (PRIORITY — OVERRIDE ANY PHASE/SCRIPT FLOW)'}

${mIsEs ? 'IMPORTANTE: Si el cliente pide agendar, reservar o hacer una cita EN CUALQUIER MOMENTO de la conversación, inicia INMEDIATAMENTE el proceso de abajo. NO esperes a que se complete ninguna otra fase. El agendamiento siempre tiene prioridad.' : 'IMPORTANT: If the customer asks to schedule, book, or make an appointment AT ANY POINT in the conversation, IMMEDIATELY start the booking process below. Do NOT wait for any other phase or step to complete first. Appointment booking always takes priority.'}

### ${mIsEs ? 'Calendarios Disponibles' : 'Available Calendars'}
${calendarList}${ghlContactIdNote}

### ${mIsEs ? 'Referencia de Fecha y Hora' : 'Date & Time Reference'}
${mIsEs ? 'La fecha y hora actual se encuentra en la variable {{currentDateTime}}. SIEMPRE usa esto como referencia cuando el usuario diga "hoy", "mañana", "el próximo lunes", etc. Calcula la fecha correcta en formato YYYY-MM-DD basándote en {{currentDateTime}}. NUNCA inventes o adivines una fecha.' : 'Today\'s date and time is provided in the {{currentDateTime}} variable. ALWAYS use this as reference when the user says "today", "tomorrow", "next Monday", etc. Calculate the correct date in YYYY-MM-DD format based on {{currentDateTime}}. NEVER guess or invent a date.'}

### ${mIsEs ? 'Flujo de Agendamiento' : 'Booking Flow'}

**${mIsEs ? 'Paso 1 — Determinar el calendario correcto' : 'Step 1 — Determine the right calendar'}**
${mIsEs ? 'Según lo que necesite el cliente, selecciona el calendario apropiado de la lista. Si no está claro cuál usar, haz una breve pregunta (ej: "¿Necesitas una consulta de ventas o una llamada de soporte?").' : 'Based on what the customer needs, select the appropriate calendar from the list above. If it\'s not clear which calendar to use, ask a brief clarifying question (e.g., "Are you looking to schedule a sales consultation or a support call?").'}

**${mIsEs ? 'Paso 2 — Preguntar la fecha preferida' : 'Step 2 — Ask for preferred date'}**
${mIsEs ? 'Pregunta: "¿Qué fecha te queda mejor?"' : 'Ask: "What date works best for you?"'}

**${mIsEs ? 'Paso 3 — Revisar disponibilidad' : 'Step 3 — Check availability'}**
${mIsEs ? 'Llama la función "check_calendar_availability_..." correcta para el calendario elegido con la fecha en formato YYYY-MM-DD.' : 'Call the correct "check_calendar_availability_..." function for the chosen calendar with the date in YYYY-MM-DD format.'}
- ${mIsEs ? '"mañana" = el día después de {{currentDateTime}}' : '"tomorrow" = the day after {{currentDateTime}}'}
- ${mIsEs ? '"hoy" = la fecha de {{currentDateTime}}' : '"today" = the date from {{currentDateTime}}'}
- ${mIsEs ? 'Calcula cualquier fecha relativa a partir de {{currentDateTime}}' : 'Calculate any relative date from {{currentDateTime}}'}

**${mIsEs ? 'Paso 4 — Presentar horarios disponibles' : 'Step 4 — Present available times'}**
${mIsEs
  ? `La función devuelve MUCHOS horarios. Tú DEBES mencionar SOLAMENTE 2 o 3, repartidos durante el día (uno en la mañana, uno al mediodía, uno en la tarde). Guarda el resto en tu memoria.
Ejemplo: "Tengo disponible a las 9 de la mañana, a la 1 y a las 4 de la tarde. ¿Cuál prefieres?"
- PROHIBIDO leer todos los horarios. Menciona MÁXIMO 3.
- Si el cliente dice "¿no tienes a las 10?" o pide otro horario, revisa la lista que ya tienes. Si está disponible, dile que sí.
- Si no hay horarios disponibles, dilo y ofrece revisar otra fecha.`
  : `The function returns MANY slots. You MUST mention ONLY 2 or 3, spread across the day (one morning, one midday, one afternoon). Keep the rest in memory.
Example: "I have 9 AM, 1 PM, and 4 PM available. Which works for you?"
- FORBIDDEN to read all slots. Mention MAXIMUM 3.
- If the customer asks "do you have 10 AM?" or requests another time, check the list you already have. If it's available, say yes.
- If no slots are available, say so and offer to check another date.`}

**${mIsEs ? 'Paso 5 — El cliente elige un horario → Agendar INMEDIATAMENTE' : 'Step 5 — User picks a time → Book IMMEDIATELY'}**
${allGhl
  ? (mIsEs
    ? `Cuando el cliente elija un horario, INMEDIATAMENTE llama la función "book_appointment_..." correcta.
PROHIBIDO pedir nombre, email o cualquier dato. El cliente ya está identificado.
- startTime: la fecha + hora seleccionada en formato ISO 8601 (ej: 2026-04-08T10:00:00)
- contactId: el valor que aparece en la sección "DATOS DEL CLIENTE" de arriba
- notes: opcional`
    : `Once the user selects a time slot, IMMEDIATELY call the correct "book_appointment_..." function.
FORBIDDEN to ask for name, email, or any data. The customer is already identified.
- startTime: the selected date + time in ISO 8601 format (e.g., 2026-04-08T10:00:00)
- contactId: the value from the "CUSTOMER DATA" section above
- notes: optional`)
  : someGhl
  ? (mIsEs
    ? `Cuando el cliente elija un horario:
- Para calendarios GHL: INMEDIATAMENTE llama la función con el contactId. PROHIBIDO pedir nombre o email — el cliente ya está identificado.
- Para otros calendarios: recopila nombre y email primero.
- startTime: ISO 8601 (ej: 2026-04-08T10:00:00)
- notes: opcional`
    : `Once the user selects a time slot:
- For GHL calendars: IMMEDIATELY call the function with the contactId. FORBIDDEN to ask for name or email — the customer is already identified.
- For other calendars: collect name and email first, then call the book function.
- startTime: ISO 8601 (e.g., 2026-04-08T10:00:00)
- notes: optional`)
  : (mIsEs
    ? `Cuando el cliente elija un horario, pide su nombre y email (teléfono es opcional), luego INMEDIATAMENTE llama la función "book_appointment_..." correcta. NO dudes ni esperes — llama la función de inmediato.
- startTime: ISO 8601 (ej: 2026-02-08T09:00:00)
- contactName / contactEmail
- contactPhone: opcional
- notes: opcional`
    : `Once the user selects a time slot, collect their name and email (phone is optional), then IMMEDIATELY call the correct "book_appointment_..." function. Do NOT hesitate or wait — call the function right away.
- startTime: ISO 8601 (e.g., 2026-02-08T09:00:00)
- contactName / contactEmail
- contactPhone: optional
- notes: optional`)}

**${mIsEs ? 'Paso 6 — Confirmar la cita' : 'Step 6 — Confirm the booking'}**
${mIsEs
  ? `Cuando la función responda exitosamente, confirma la cita brevemente. NO menciones el año.\nEjemplo: "Listo, tu cita quedó para el martes ocho de abril a las dos de la tarde.${allGhl ? '' : ' Te llegará un correo de confirmación.'}"`
  : `After the function returns success, confirm briefly. Do NOT mention the year.\nExample: "Done, your appointment is set for Tuesday, April eighth at two PM.${allGhl ? '' : " You'll receive a confirmation email."}"`}

### ${mIsEs ? 'Reglas Críticas' : 'Critical Rules'}
- ${mIsEs ? 'NUNCA omitas llamar la función de agendamiento después de que el cliente elija un horario. DEBES llamarla.' : 'NEVER skip calling the book function after the user picks a time. You MUST call it.'}
- ${mIsEs ? 'NUNCA inventes o adivines fechas. Siempre calcula a partir de {{currentDateTime}}.' : 'NEVER invent or guess dates. Always calculate from {{currentDateTime}}.'}${allGhl ? (mIsEs ? `\n- PROHIBIDO pedir nombre, email o teléfono. El cliente ya está identificado. Usa el contactId directamente.` : `\n- FORBIDDEN to ask for name, email, or phone. The customer is already identified. Use the contactId directly.`) : (mIsEs ? `\n- Si el cliente da información incompleta (sin nombre/email), pídela, luego agenda INMEDIATAMENTE.` : `\n- If the user provides incomplete info (no name/email), ask for it, then IMMEDIATELY book.`)}
- ${mIsEs ? 'Mantén tus respuestas cortas y naturales durante el flujo de agendamiento.' : 'Keep your responses short and natural during the booking flow.'}
- ${mIsEs ? 'NUNCA leas mensajes de error internos o detalles técnicos al cliente. Si una herramienta devuelve un error, manéjalo con tus propias palabras.' : 'NEVER read internal error messages or technical details to the customer. If a tool returns an error, handle it gracefully in your own words.'}
- ${mIsEs ? 'Si falla el agendamiento, intenta automáticamente con el siguiente horario disponible más cercano. Si todos fallan, discúlpate y ofrece intentar con otra fecha.' : 'If booking fails, try the next closest available time slot automatically. If all attempts fail, apologize and offer to try another date.'}
- ${mIsEs ? 'NUNCA mezcles idiomas. Habla COMPLETAMENTE en español en todo momento.' : 'NEVER mix languages. Speak ENTIRELY in the conversation language at all times.'}
- ${mIsEs ? 'NUNCA menciones el año al confirmar la cita. Solo di el día y la hora.' : 'NEVER mention the year when confirming. Just say the day and time.'}
- ${mIsEs ? 'MÁXIMO 3 horarios al presentar disponibilidad. NUNCA leas más de 3.' : 'MAXIMUM 3 time slots when presenting availability. NEVER read more than 3.'}`

          finalSystemPrompt = systemPrompt + calendarInstructions

        } else if (activeCalendars.length === 1) {
          // Single calendar prompt
          const singleCal = activeCalendars[0]
          const isSingleGhl = singleCal.provider === 'ghl'
          const isEs = effectiveLanguage === 'es'
          const ghlNote = isSingleGhl ? (isEs
            ? `\n\n### DATOS DEL CLIENTE (YA IDENTIFICADO)\nEl cliente ya está identificado en el sistema. Su contactId es: "{{contactId}}"\nPROHIBIDO pedir nombre, email, teléfono o cualquier dato personal. Usa este contactId directamente al agendar.`
            : `\n\n### CUSTOMER DATA (ALREADY IDENTIFIED)\nThe customer is already identified in the system. Their contactId is: "{{contactId}}"\nFORBIDDEN to ask for name, email, phone, or any personal data. Use this contactId directly when booking.`) : ''

          const calendarInstructions = `

## ${isEs ? 'INSTRUCCIONES DE AGENDAMIENTO DE CITAS (PRIORIDAD — ANULA CUALQUIER FLUJO DE FASES O GUIÓN)' : 'APPOINTMENT BOOKING INSTRUCTIONS (PRIORITY — OVERRIDE ANY PHASE/SCRIPT FLOW)'}

${isEs ? 'IMPORTANTE: Si el cliente pide agendar, reservar o hacer una cita EN CUALQUIER MOMENTO de la conversación, inicia INMEDIATAMENTE el proceso de abajo. NO esperes a que se complete ninguna otra fase. El agendamiento siempre tiene prioridad.' : 'IMPORTANT: If the customer asks to schedule, book, or make an appointment AT ANY POINT in the conversation, IMMEDIATELY start the booking process below. Do NOT wait for any other phase or step to complete first. Appointment booking always takes priority.'}${ghlNote}

### ${isEs ? 'Referencia de Fecha y Hora' : 'Date & Time Reference'}
${isEs ? 'La fecha y hora actual se encuentra en la variable {{currentDateTime}}. SIEMPRE usa esto como referencia cuando el usuario diga "hoy", "mañana", "el próximo lunes", etc. Calcula la fecha correcta en formato YYYY-MM-DD basándote en {{currentDateTime}}. NUNCA inventes o adivines una fecha.' : 'Today\'s date and time is provided in the {{currentDateTime}} variable. ALWAYS use this as reference when the user says "today", "tomorrow", "next Monday", etc. Calculate the correct date in YYYY-MM-DD format based on {{currentDateTime}}. NEVER guess or invent a date.'}

### ${isEs ? 'Flujo de Agendamiento' : 'Booking Flow'}

**${isEs ? 'Paso 1 — Preguntar la fecha preferida' : 'Step 1 — Ask for preferred date'}**
${isEs ? 'Cuando el cliente quiera agendar, pregunta: "¿Qué fecha te queda mejor?"' : 'When the customer wants to book, ask: "What date works best for you?"'}

**${isEs ? 'Paso 2 — Revisar disponibilidad' : 'Step 2 — Check availability'}**
${isEs ? `Llama la función "check_calendar_availability_${safeName}" con la fecha en formato YYYY-MM-DD.` : `Call the "check_calendar_availability_${safeName}" function with the date in YYYY-MM-DD format.`}
- ${isEs ? '"mañana" = el día después de {{currentDateTime}}' : '"tomorrow" = the day after {{currentDateTime}}'}
- ${isEs ? '"hoy" = la fecha de {{currentDateTime}}' : '"today" = the date from {{currentDateTime}}'}
- ${isEs ? 'Calcula cualquier fecha relativa a partir de {{currentDateTime}}' : 'Calculate any relative date from {{currentDateTime}}'}

**${isEs ? 'Paso 3 — Presentar horarios disponibles' : 'Step 3 — Present available times'}**
${isEs
  ? `La función devuelve MUCHOS horarios. Tú DEBES mencionar SOLAMENTE 2 o 3, repartidos durante el día (uno en la mañana, uno al mediodía, uno en la tarde). Guarda el resto en tu memoria.
Ejemplo: "Tengo disponible a las 9 de la mañana, a la 1 y a las 4 de la tarde. ¿Cuál prefieres?"
- PROHIBIDO leer todos los horarios. Menciona MÁXIMO 3.
- Si el cliente dice "¿no tienes a las 10?" o pide otro horario, revisa la lista que ya tienes. Si está disponible, dile que sí.
- Si no hay horarios disponibles, dilo y ofrece revisar otra fecha.`
  : `The function returns MANY slots. You MUST mention ONLY 2 or 3, spread across the day (one morning, one midday, one afternoon). Keep the rest in memory.
Example: "I have 9 AM, 1 PM, and 4 PM available. Which works for you?"
- FORBIDDEN to read all slots. Mention MAXIMUM 3.
- If the customer asks "do you have 10 AM?" or requests another time, check the list you already have. If it's available, say yes.
- If no slots are available, say so and offer to check another date.`}

${isSingleGhl ? `**${isEs ? 'Paso 4 — El cliente elige un horario → Agendar INMEDIATAMENTE' : 'Step 4 — User picks a time → Book IMMEDIATELY'}**
${isEs
  ? `Cuando el cliente elija un horario, INMEDIATAMENTE llama "book_appointment_${safeName}".
PROHIBIDO pedir nombre, email o cualquier dato. El cliente ya está identificado.
- startTime: la fecha + hora seleccionada en formato ISO 8601 (ej: 2026-04-08T10:00:00)
- contactId: el valor que aparece en la sección "DATOS DEL CLIENTE" de arriba
- notes: opcional`
  : `Once the user selects a time slot, IMMEDIATELY call "book_appointment_${safeName}".
FORBIDDEN to ask for name, email, or any data. The customer is already identified.
- startTime: the selected date + time in ISO 8601 format (e.g., 2026-04-08T10:00:00)
- contactId: the value from the "CUSTOMER DATA" section above
- notes: optional`}

**${isEs ? 'Paso 5 — Confirmar la cita' : 'Step 5 — Confirm the booking'}**
${isEs
  ? `Cuando la función responda exitosamente, confirma la cita brevemente. NO menciones el año.\nEjemplo: "Listo, tu cita quedó para el martes ocho de abril a las dos de la tarde."`
  : `After the function returns success, confirm briefly. Do NOT mention the year.\nExample: "Done, your appointment is set for Tuesday, April eighth at two PM."`}` : `**${isEs ? 'Paso 4 — El cliente elige un horario → Recopilar datos y agendar INMEDIATAMENTE' : 'Step 4 — User picks a time → Collect info and book IMMEDIATELY'}**
${isEs ? `Cuando el cliente elija un horario, pide su nombre y email (teléfono es opcional), luego INMEDIATAMENTE llama la función "book_appointment_${safeName}". NO dudes ni esperes — llama la función de inmediato.` : `Once the user selects a time slot, collect their name and email (phone is optional), then IMMEDIATELY call the "book_appointment_${safeName}" function. Do NOT hesitate or wait — call the function right away.`}
- startTime: ISO 8601 (e.g., 2026-02-08T09:00:00)
- contactName / contactEmail
- contactPhone: ${isEs ? 'opcional' : 'optional'}
- notes: ${isEs ? 'opcional' : 'optional'}

**${isEs ? 'Paso 5 — Confirmar la cita' : 'Step 5 — Confirm the booking'}**
${isEs
  ? `Cuando la función responda exitosamente, confirma la cita brevemente. NO menciones el año.\nEjemplo: "Listo, tu cita quedó para el martes ocho de abril a las dos de la tarde. Te llegará un correo de confirmación."`
  : `After the function returns success, confirm briefly. Do NOT mention the year.\nExample: "Done, your appointment is set for Tuesday, April eighth at two PM. You'll receive a confirmation email."`}`}

### ${isEs ? 'Reglas Críticas' : 'Critical Rules'}
- ${isEs ? `NUNCA omitas llamar "book_appointment_${safeName}" después de que el cliente elija un horario. DEBES llamarla.` : `NEVER skip calling "book_appointment_${safeName}" after the user picks a time. You MUST call it.`}
- ${isEs ? 'NUNCA inventes o adivines fechas. Siempre calcula a partir de {{currentDateTime}}.' : 'NEVER invent or guess dates. Always calculate from {{currentDateTime}}.'}${isSingleGhl ? (isEs ? `\n- PROHIBIDO pedir nombre, email o teléfono. El cliente ya está identificado. Usa el contactId directamente.` : `\n- FORBIDDEN to ask for name, email, or phone. The customer is already identified. Use the contactId directly.`) : (isEs ? `\n- Si el cliente da información incompleta (sin nombre/email), pídela, luego agenda INMEDIATAMENTE.` : `\n- If the user provides incomplete info (no name/email), ask for it, then IMMEDIATELY book.`)}
- ${isEs ? 'Mantén tus respuestas cortas y naturales durante el flujo de agendamiento.' : 'Keep your responses short and natural during the booking flow.'}
- ${isEs ? 'NUNCA leas mensajes de error internos o detalles técnicos al cliente. Si una herramienta devuelve un error, manéjalo con tus propias palabras. Por ejemplo, si una fecha está mal, simplemente pide otra fecha.' : 'NEVER read internal error messages or technical details to the customer. If a tool returns an error, handle it gracefully in your own words. For example, if a date is wrong, simply ask the customer for another date.'}
- ${isEs ? 'Si falla el agendamiento, intenta automáticamente con el siguiente horario disponible más cercano. Si todos fallan, discúlpate y ofrece intentar con otra fecha.' : 'If booking fails, try the next closest available time slot automatically. If all attempts fail, apologize and offer to try another date.'}
- ${isEs ? 'NUNCA mezcles idiomas. Habla COMPLETAMENTE en español en todo momento.' : 'NEVER mix languages. Speak ENTIRELY in the conversation language at all times.'}
- ${isEs ? 'NUNCA menciones el año al confirmar la cita. Solo di el día y la hora.' : 'NEVER mention the year when confirming. Just say the day and time.'}
- ${isEs ? 'MÁXIMO 3 horarios al presentar disponibilidad. NUNCA leas más de 3.' : 'MAXIMUM 3 time slots when presenting availability. NEVER read more than 3.'}`

          finalSystemPrompt = systemPrompt + calendarInstructions
        }
      }

      // Generate transfer instructions if transfer is enabled
      if (transferConfig.enabled) {
        const activeTransfers = getActiveTransfers().filter(e => e.destinationValue)
        const isEs = uiLanguage === 'es'

        if (activeTransfers.length >= 2) {
          const transferList = activeTransfers.map((entry) => {
            const noScenario = isEs ? 'Sin escenario especificado' : 'No scenario specified'
            return `- **${entry.name || entry.destinationValue}**: ${entry.scenario || noScenario} → destination: "${entry.destinationValue}"`
          }).join('\n')

          const transferInstructions = isEs ? `

## INSTRUCCIONES DE TRANSFERENCIA DE LLAMADA

Tienes la capacidad de transferir esta llamada usando la herramienta "transferCall". Pasa el destino correcto segun la situacion.

### Destinos Disponibles
${transferList}

### Reglas de Transferencia
- Solo transfiere cuando la situacion coincida claramente con uno de los escenarios anteriores.
- Antes de transferir, informa brevemente al llamante (ej: "Permitame conectarlo con el departamento adecuado").
- Si no estas seguro de que destino usar, haz una pregunta aclaratoria al llamante.
- NUNCA transfieras sin una razon clara que coincida con un escenario anterior.` : `

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
          const defaultScenario = isEs
            ? 'Transferir cuando el llamante solicite ser conectado con otra persona o departamento.'
            : 'Transfer when the caller requests to be connected to another person or department.'

          const transferInstructions = isEs ? `

## INSTRUCCIONES DE TRANSFERENCIA DE LLAMADA

Tienes la capacidad de transferir esta llamada. Usa la herramienta "transferCall" cuando sea apropiado.

### Cuando Transferir
${entry.scenario || entry.description || defaultScenario}

### Reglas de Transferencia
- Antes de transferir, informa brevemente al llamante (ej: "Permitame conectarlo ahora").
- Solo transfiere cuando la situacion lo justifique claramente.` : `

## CALL TRANSFER INSTRUCTIONS

You have the ability to transfer this call. Use the "transferCall" tool when appropriate.

### When to Transfer
${entry.scenario || entry.description || defaultScenario}

### Transfer Rules
- Before transferring, briefly inform the caller (e.g., "Let me connect you now").
- Only transfer when the situation clearly warrants it.`

          finalSystemPrompt = finalSystemPrompt + transferInstructions
        }
      }

      // Generate callback scheduling instructions if enabled
      if (callbackConfig.enabled) {
        const cbIsEs = effectiveLanguage === 'es'
        const callbackInstructions = cbIsEs
          ? `

## INSTRUCCIONES PARA AGENDAR LLAMADA DE RETORNO
Si el cliente pide que lo llamen de vuelta más tarde:
1. Confirma la fecha y hora deseadas.
2. Llama a la función "schedule_callback_${safeName}" con el callbackTime en formato ISO 8601.
3. Calcula las fechas a partir de {{currentDateTime}}.
4. Después de agendar, confirma: "He agendado una llamada de retorno para el [fecha] a las [hora]. Te llamaremos en ese momento."
- NUNCA adivines fechas. Siempre calcula a partir de {{currentDateTime}}.`
          : `

## CALLBACK SCHEDULING INSTRUCTIONS
If the customer asks to be called back at a later time:
1. Confirm the desired date and time
2. Call the "schedule_callback_${safeName}" function with the callbackTime in ISO 8601 format
3. Calculate dates relative to {{currentDateTime}}
4. After scheduling, confirm: "I've scheduled a callback for [date] at [time]. We'll call you back then."
- NEVER guess dates. Always calculate from {{currentDateTime}}.`

        finalSystemPrompt = finalSystemPrompt + callbackInstructions
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
          firstMessageOutbound,
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
          callbackConfig,
          followUpConfig: {
            ...followUpConfig,
            intervals: (followUpConfig.intervals || []).map((v, i) =>
              v === -1 ? ((followUpConfig.customIntervals || {})[i] || 120) : v
            ),
            customIntervals: undefined
          },
          ghlCrmConfig,
          chatbotTriggerConfig,
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
          variables,
          summaryPrompt: serverConfig.summaryPrompt,
          successEvaluationEnabled: serverConfig.successEvaluationEnabled,
          successEvaluationRubric: serverConfig.successEvaluationRubric,
          successEvaluationPrompt: serverConfig.successEvaluationPrompt,
          structuredDataEnabled: serverConfig.structuredDataEnabled,
          structuredDataSchema: (() => {
            const fields = (serverConfig.structuredDataFields || []).filter(f => f.key.trim())
            if (fields.length === 0) return '{\n  "type": "object",\n  "properties": {}\n}'
            const props = {}
            fields.forEach(f => {
              props[f.key.trim()] = { type: f.type || 'string', ...(f.description ? { description: f.description } : {}) }
            })
            return JSON.stringify({ type: 'object', properties: props }, null, 2)
          })(),
          structuredDataPrompt: serverConfig.structuredDataPrompt,
          ghlCustomFields: serverConfig.ghlCustomFields || [],
          // Call behavior settings
          ...callBehaviorSettings,
          ...(serverConfig.serverUrl && {
            serverUrl: serverConfig.serverUrl,
            serverUrlSecret: serverConfig.serverUrlSecret,
            serverMessages: serverConfig.serverMessages,
          })
        }
      })

      // Show sync result
      const syncInfo = response.data?.vapiSyncInfo
      if (response.data?.vapiWarning) {
        setError(response.data.vapiWarning)
        setTimeout(() => setError(''), 10000)
      } else if (response.data?.vapiNotice) {
        setSuccess(response.data.vapiNotice)
        setTimeout(() => setSuccess(''), 8000)
      } else if (syncInfo) {
        const webhookStatus = syncInfo.webhookUrl && syncInfo.webhookUrl !== 'NOT SET' ? '' : ` | ${ta('webhookNotSet')}`
        setSuccess(`${ta('agentSavedSynced')} (${syncInfo.savedTools} ${ta('tools')}, ${ta('prompt')}: ${syncInfo.savedPromptLength} ${ta('chars')}${webhookStatus})`)
        setTimeout(() => setSuccess(''), 8000)
      } else {
        setSuccess(ta('agentSavedSuccess'))
        setTimeout(() => setSuccess(''), 3000)
      }
    } catch (err) {
      console.error('=== SAVE ERROR ===', err)
      console.error('Response data:', err.response?.data)
      console.error('Message:', err.message)
      const status = err.response?.status
      const serverError = err.response?.data?.error
      const fallback = status === 413
        ? 'Payload too large — agent config exceeds server limit'
        : status
          ? `${ta('failedSaveAgent')} (HTTP ${status})`
          : `${ta('failedSaveAgent')}: ${err.message || 'network error'}`
      setError(serverError || fallback)
    } finally {
      setSaving(false)
    }
  }

  const handleCall = async () => {
    if (!selectedPhone || !customerNumber) {
      setCallStatus(ta('callSelectPhoneAndNumber'))
      return
    }

    if (!agent?.vapiId) {
      setCallStatus(ta('callAgentNotSynced'))
      return
    }

    const selectedPhoneData = phoneNumbers.find(p => p.id.toString() === selectedPhone)
    if (!selectedPhoneData?.vapiPhoneNumberId) {
      setCallStatus(ta('callPhoneNotSynced'))
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
      setCallStatus(`${ta('callInitiated')} ${response.data.call.id}`)
      setCustomerNumber('')
      setCustomerName('')
    } catch (err) {
      setCallStatus(err.response?.data?.error || ta('failedInitiateCall'))
    } finally {
      setCalling(false)
    }
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
      await fetchVoicesList()
      setVoicesLoading(false)
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
    // Convert Google Drive sharing URLs to direct download URLs
    const convertDriveUrl = (url) => {
      const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
      if (fileMatch) return `https://drive.usercontent.google.com/download?id=${fileMatch[1]}&export=download&confirm=t`
      const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
      if (openMatch) return `https://drive.usercontent.google.com/download?id=${openMatch[1]}&export=download&confirm=t`
      const ucMatch = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/)
      if (ucMatch) return `https://drive.usercontent.google.com/download?id=${ucMatch[1]}&export=download&confirm=t`
      return url
    }
    const rawUrl = convertDriveUrl(voice.previewUrl)
    const needsProxy = rawUrl.includes('drive.google.com') || rawUrl.includes('drive.usercontent.google.com') || rawUrl.includes('docs.google.com')
    const playUrl = needsProxy
      ? `${import.meta.env.VITE_API_URL || '/api'}/voices/audio-proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl
    const audio = new Audio(playUrl)
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
    setSuccess(ta('promptCopied'))
    setTimeout(() => setSuccess(''), 2000)
  }

  const handleGeneratePrompt = async () => {
    if (!wizCompanyName.trim() || !wizGoals.trim()) return
    setGeneratingPrompt(true)
    setGeneratedPrompt('')
    setGeneratedFirstMessage('')
    try {
      const { data } = await promptGeneratorAPI.generate({
        botType: wizBotType,
        direction: wizDirection,
        language: wizLanguage,
        companyName: wizCompanyName,
        industry: wizIndustry,
        tone: wizTone,
        goals: wizGoals,
        typeConfig: wizTypeConfig,
        additionalNotes: wizAdditionalNotes
      })
      setGeneratedPrompt(data.prompt)
      setGeneratedFirstMessage(data.firstMessage || '')
    } catch (err) {
      console.error('Generate prompt error:', err.response?.data || err.message || err)
      setError(err.response?.data?.error || ta('failedGeneratePrompt'))
      setTimeout(() => setError(''), 5000)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const handleUpdatePrompt = async () => {
    if (!updateDescription.trim() || !systemPrompt.trim()) return
    setGeneratingPrompt(true)
    setGeneratedPrompt('')
    setGeneratedFirstMessage('')
    try {
      const { data } = await promptGeneratorAPI.update({
        currentPrompt: systemPrompt,
        changeDescription: updateDescription,
        language: updateLanguage
      })
      setGeneratedPrompt(data.prompt)
    } catch (err) {
      setError(ta('failedUpdatePrompt'))
      setTimeout(() => setError(''), 3000)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const handleUseGeneratedPrompt = () => {
    setSystemPrompt(generatedPrompt)
    if (generatedFirstMessage) {
      setFirstMessage(generatedFirstMessage)
    }
    if (promptMode === 'generate') {
      setAgentType(wizDirection)
    }
    setShowPromptGenerator(false)
    setGeneratedPrompt('')
    setGeneratedFirstMessage('')
    setPromptMode('generate')
    resetWizard()
  }

  const resetWizard = () => {
    setWizardStep(1)
    setWizBotType('')
    setWizDirection('outbound')
    setWizLanguage(uiLanguage)
    setWizCompanyName('')
    setWizIndustry('')
    setWizTone('professional')
    setWizGoals('')
    setWizTypeConfig({})
    setWizAdditionalNotes('')
    setUpdateDescription('')
    setUpdateLanguage(uiLanguage)
  }

  // Tool management functions
  const resetToolForm = () => {
    setToolForm({
      type: 'apiRequest',
      functionName: '',
      functionDescription: '',
      httpMethod: 'POST',
      webhookUrl: '',
      httpHeaders: [],
      httpBodyFields: [],
      async: false,
      endCallMessage: ''
    })
    setTestRequestState({ loading: false, expanded: false, testFields: [], result: null, error: null })
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

    if (tool.type === 'apiRequest') {
      // Parse headers into array of { key, value }
      const headersArr = []
      if (tool.headers?.properties) {
        Object.entries(tool.headers.properties).forEach(([k, v]) => {
          headersArr.push({ key: k, value: v.value || v.description || '' })
        })
      }
      // Parse body properties into array of { key, type, description }
      const bodyFields = []
      if (tool.body?.properties) {
        Object.entries(tool.body.properties).forEach(([k, v]) => {
          bodyFields.push({ key: k, type: v.type || 'string', description: v.description || '' })
        })
      }
      setToolForm({
        type: 'apiRequest',
        functionName: tool.name || '',
        functionDescription: tool.description || '',
        httpMethod: tool.method || 'POST',
        webhookUrl: tool.url || '',
        httpHeaders: headersArr,
        httpBodyFields: bodyFields,
        async: tool.async || false,
        endCallMessage: ''
      })
    } else if (tool.type === 'function') {
      // Backward compat: load old function tools as apiRequest for editing
      const bodyFields = []
      const params = tool.function?.parameters
      if (params?.properties) {
        Object.entries(params.properties).forEach(([k, v]) => {
          bodyFields.push({ key: k, type: v.type || 'string', description: v.description || '' })
        })
      }
      setToolForm({
        type: 'apiRequest',
        functionName: tool.function?.name || '',
        functionDescription: tool.function?.description || '',
        httpMethod: 'POST',
        webhookUrl: tool.server?.url || '',
        httpHeaders: [],
        httpBodyFields: bodyFields,
        async: tool.async || false,
        endCallMessage: ''
      })
    } else if (tool.type === 'endCall') {
      setToolForm({
        type: 'endCall',
        functionName: '',
        functionDescription: '',
        httpMethod: 'POST',
        webhookUrl: '',
        httpHeaders: [],
        httpBodyFields: [],
        async: false,
        endCallMessage: tool.messages?.[0]?.content || ''
      })
    }

    setShowAdvancedModal(false)
    setShowToolModal(true)
  }

  const handleSaveTool = () => {
    let newTool = {}

    if (toolForm.type === 'apiRequest') {
      if (!toolForm.functionName || !toolForm.functionDescription || !toolForm.webhookUrl) {
        setError(ta('toolRequiredFields'))
        return
      }

      // Build body JSON Schema from httpBodyFields array
      let body = { type: 'object', properties: {} }
      const validBodyFields = (toolForm.httpBodyFields || []).filter(f => f.key.trim())
      if (validBodyFields.length > 0) {
        const props = {}
        validBodyFields.forEach(f => {
          props[f.key.trim()] = { type: f.type || 'string', ...(f.description ? { description: f.description } : {}) }
        })
        body = { type: 'object', properties: props }
      }

      // Build headers schema from httpHeaders array
      let headers
      const validHeaders = (toolForm.httpHeaders || []).filter(h => h.key.trim())
      if (validHeaders.length > 0) {
        const properties = {}
        validHeaders.forEach(h => {
          properties[h.key.trim()] = { type: 'string', value: String(h.value) }
        })
        headers = { type: 'object', properties }
      }

      newTool = {
        type: 'apiRequest',
        name: toolForm.functionName,
        description: toolForm.functionDescription,
        method: toolForm.httpMethod || 'POST',
        url: toolForm.webhookUrl,
        headers: headers || { type: 'object', properties: {} },
        body,
        async: toolForm.async,
        timeoutSeconds: 20
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

    // Auto-inject end call instructions into system prompt when adding endCall tool
    if (toolForm.type === 'endCall' && editingToolIndex === null) {
      const endCallSection = uiLanguage === 'es'
        ? `\n\nInstrucciones para Finalizar Llamada:\nTienes la capacidad de colgar la llamada usando la funcion endCall. Debes usar esta funcion para finalizar la llamada en las siguientes situaciones:\n- El lead dice adios, hasta luego, o cualquier frase de despedida\n- El lead pide explicitamente que termines la llamada\n- El lead dice que no esta interesado y ya intentaste re-engancharlo (maximo 2 veces)\n- El lead se pone hostil, grosero o usa lenguaje inapropiado\n- El lead no responde despues de 3 intentos de re-enganche\n- La conversacion ha concluido naturalmente y se han confirmado los proximos pasos\nCuando uses la funcion endCall, siempre despidete de forma educada antes de activarla.`
        : `\n\nEnd Call Instructions:\nYou have the ability to hang up the call using the endCall function. You must use this function to end the call in the following situations:\n- The lead says goodbye, bye, or any farewell phrase\n- The lead explicitly asks you to end the call\n- The lead says they are not interested and you have already tried to re-engage them (maximum 2 times)\n- The lead becomes hostile, rude, or uses inappropriate language\n- The lead is unresponsive after 3 attempts to re-engage\n- The conversation has naturally concluded and next steps have been confirmed\nWhen using the endCall function, always say a polite goodbye before triggering it.`;

      if (!systemPrompt.includes('End Call Instructions:') && !systemPrompt.includes('Instrucciones para Finalizar Llamada:')) {
        setSystemPrompt(prev => prev.trimEnd() + endCallSection)
      }
    }

    setShowToolModal(false)
    setAdvancedSubPanel(null)
    setShowAdvancedModal(true)
    resetToolForm()
    setError('')
  }

  const handleDeleteTool = (index) => {
    const deletedTool = tools[index]
    setTools(tools.filter((_, i) => i !== index))
    // Remove end call instructions from prompt when endCall tool is deleted
    if (deletedTool?.type === 'endCall') {
      setSystemPrompt(prev => prev
        .replace(/\n\nEnd Call Instructions:\nYou have the ability to hang up the call using the endCall function\.[\s\S]*?When using the endCall function, always say a polite goodbye before triggering it\./, '')
        .replace(/\n\nInstrucciones para Finalizar Llamada:\nTienes la capacidad de colgar la llamada usando la funcion endCall\.[\s\S]*?Cuando uses la funcion endCall, siempre despidete de forma educada antes de activarla\./, '')
      )
    }
  }

  const handleTestRequest = async () => {
    if (!toolForm.webhookUrl) {
      setTestRequestState(prev => ({ ...prev, error: 'URL is required', result: null }))
      return
    }
    setTestRequestState(prev => ({ ...prev, loading: true, error: null, result: null }))
    try {
      // Build headers object from array
      let headers = {}
      if (Array.isArray(toolForm.httpHeaders)) {
        toolForm.httpHeaders.forEach(h => {
          if (h.key.trim()) headers[h.key.trim()] = h.value
        })
      }
      // Build test body from field rows
      let body = undefined
      const validTestFields = (testRequestState.testFields || []).filter(f => f.key.trim())
      if (validTestFields.length > 0) {
        body = {}
        validTestFields.forEach(f => { body[f.key.trim()] = f.value })
      }
      const { data } = await toolsAPI.testRequest({
        method: toolForm.httpMethod || 'POST',
        url: toolForm.webhookUrl,
        headers,
        body
      })
      setTestRequestState(prev => ({ ...prev, loading: false, result: data }))
    } catch (err) {
      setTestRequestState(prev => ({
        ...prev,
        loading: false,
        error: err.response?.data?.error || err.message || 'Request failed'
      }))
    }
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
              {agentType === 'inbound' ? ta('inbound') : assignedPhoneId ? ta('typeInboundOutbound') : ta('outbound')}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded-full ${agent.vapiId ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {agent.vapiId ? ta('connected') : ta('local')}
            </span>
            {(() => {
              const mRate = modelRates[`${modelProvider}::${modelName}`]
              const tRate = transcriberRates[transcriberProvider]
              if (mRate == null && tRate == null) return null
              const total = (mRate || 0) + (tRate || 0)
              return (
                <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" title={`Model: $${(mRate || 0).toFixed(2)}/min + Transcriber: $${(tRate || 0).toFixed(2)}/min`}>
                  ${total.toFixed(2)}/min
                </span>
              )
            })()}
          </div>
          <button
            onClick={() => setShowAgentInfoModal(true)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg"
            title={ta('editAgentInfoTitle')}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Floating toast notifications */}
          {error && (
            <div
              className="fixed top-6 right-6 z-[60] max-w-md animate-slide-in-right"
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-200 px-4 py-3 rounded-lg shadow-lg">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" transform="rotate(45 10 10)" />
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div className="flex-1 text-sm">{error}</div>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="flex-shrink-0 text-red-600 hover:text-red-800 dark:text-red-300 dark:hover:text-red-100"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {success && (
            <div
              className="fixed top-6 right-6 z-[60] max-w-md animate-slide-in-right"
              role="status"
              aria-live="polite"
            >
              <div className="flex items-start gap-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-200 px-4 py-3 rounded-lg shadow-lg">
                <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <div className="flex-1 text-sm">{success}</div>
                <button
                  type="button"
                  onClick={() => setSuccess('')}
                  className="flex-shrink-0 text-green-600 hover:text-green-800 dark:text-green-300 dark:hover:text-green-100"
                  aria-label="Dismiss"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* AI Provider & Model Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                {ta('aiProvider')}
                <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{ta('tipAiProvider')}</title>
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
                <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{ta('tipLlmModel')}</title>
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
                    const mRate = modelRates[`${modelProvider}::${m.model}`]
                    const speed = getSpeedTag(m.llmLatency)
                    return (
                      <option key={m.model} value={m.model}>
                        {m.label} · {speed}{lat ? ` · ~${lat.total}ms` : ''}{mRate != null ? ` · $${mRate.toFixed(2)}/min` : ''}
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
              {ta('firstMessage')} <span className="text-red-500">*</span>
              <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <title>{ta('tipFirstMessage')}</title>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </label>
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">{ta('firstMessage')} *</label>
              <input
                type="text"
                required
                value={firstMessage}
                onChange={(e) => setFirstMessage(e.target.value)}
                placeholder={ta('greetingPlaceholder')}
                className={`w-full px-4 py-3 rounded-lg border ${!firstMessage.trim() && error ? 'border-red-500' : 'border-gray-300 dark:border-dark-border'} bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Outbound First Message Override */}
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-2">
              {ta('firstMessageOutbound')}
            </label>
            <div className="relative">
              <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">{ta('firstMessageOutbound')}</label>
              <input
                type="text"
                value={firstMessageOutbound}
                onChange={(e) => setFirstMessageOutbound(e.target.value)}
                placeholder={ta('firstMessageOutboundPlaceholder')}
                className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{ta('firstMessageOutboundHint')}</p>
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
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                {ta('transcriberProvider')}
                <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{ta('tipTranscriberProvider')}</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
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
                  {TRANSCRIBER_PROVIDERS.map(provider => {
                    const tRate = transcriberRates[provider.id]
                    return (
                      <option key={provider.id} value={provider.id}>
                        {provider.label} · {STT_LATENCY[provider.id] || 800}ms{tRate != null ? ` · $${tRate.toFixed(2)}/min` : ''}
                      </option>
                    )
                  })}
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
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                {ta('transcriberLanguage')}
                <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{ta('tipTranscriberLanguage')}</title>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {/* Calendar Options */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                {ta('calendarOptions')}
                <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{ta('tipCalendarOptions')}</title>
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
                <svg className="w-4 h-4 text-gray-400 cursor-help" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <title>{ta('tipCallTransfer')}</title>
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
                    ? `${transferConfig.transfers.length} ${ta('transfersConfiguredCount')}`
                    : transferConfig.destinationValue
                      ? `${transferConfig.destinationType === 'sip' ? ta('destSipShort') : transferConfig.destinationType === 'assistant' ? ta('destAssistant') : ta('destPhoneShort')}: ${transferConfig.destinationValue}`
                      : ta('enabledLabel')
                  }
                </p>
              )}
            </div>

            {/* Actions in Call */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                {ta('actionsInCall')}
              </label>
              <button
                onClick={() => { setAdvancedSubPanel(null); setShowAdvancedModal(true) }}
                className="p-4 rounded-xl border-2 border-gray-200 dark:border-dark-border hover:border-gray-300 transition-all"
              >
                <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </button>
            </div>

            {/* Actions After Call */}
            <div className="text-center">
              <label className="flex items-center justify-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                {ta('actionsAfterCall')}
              </label>
              <button
                onClick={() => { setAdvancedSubPanel(null); setShowAfterCallModal(true) }}
                className="p-4 rounded-xl border-2 border-gray-200 dark:border-dark-border hover:border-gray-300 transition-all"
              >
                <svg className="w-8 h-8 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
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
                onClick={() => { setWizDirection(agentType); setWizLanguage(uiLanguage); setUpdateLanguage(uiLanguage); setShowPromptGenerator(true) }}
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

          {/* API Trigger */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden divide-y divide-gray-200 dark:divide-dark-border">

            {/* cURL Example Section */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('triggerCurl')}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
              >
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedSection === 'triggerCurl' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{ta('curlExample')}</span>
              </button>
              {expandedSection === 'triggerCurl' && (() => {
                const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
                const triggerUrl = `${apiBaseUrl}/call/trigger`
                const assignedPhone = phoneNumbers.find(p => p.id.toString() === assignedPhoneId)
                const fromNumber = assignedPhone ? assignedPhone.phoneNumber : '+1XXXXXXXXXX'
                const hasGhlCalendar = calendarConfig.enabled && getActiveCalendars().some(c => c.provider === 'ghl')
                const hasGhlFunc = hasGhlCalendar || ghlCrmConfig.enabled || tools.some(t => t.type && t.type.startsWith('ghl.'))
                const contactIdLine = hasGhlFunc ? `,\n    "contactId": "GHL_CONTACT_ID"` : ''
                const variablesJson = variables.length > 0 ? `,\n${variables.map(v => `    "${v.name}": "${v.defaultValue || ''}"`).join(',\n')}` : ''
                const curlExample = `curl -X POST ${triggerUrl} \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: ${triggerApiKey || 'YOUR_TRIGGER_API_KEY'}" \\
  -d '{
    "agentId": "${id}",
    "clientId": ${user?.id || 'YOUR_CLIENT_ID'},
    "from": "${fromNumber}",
    "to": "+1XXXXXXXXXX"${contactIdLine}${variablesJson}
  }'`
                return (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="relative">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{ta('curlCopyDesc')}</span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(curlExample)
                            setSuccess(ta('curlCopied'))
                            setTimeout(() => setSuccess(''), 2000)
                          }}
                          className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                        >
                          {ta('copy')}
                        </button>
                      </div>
                      <pre className="px-3 py-3 rounded-lg bg-gray-900 text-green-400 text-xs font-mono overflow-x-auto whitespace-pre">{curlExample}</pre>
                    </div>
                    <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
                      <p><strong className="text-gray-500 dark:text-gray-400">x-api-key</strong> — {ta('paramApiKey')}</p>
                      <p><strong className="text-gray-500 dark:text-gray-400">agentId</strong> — {ta('paramAgentId')}</p>
                      <p><strong className="text-gray-500 dark:text-gray-400">clientId</strong> — {ta('paramClientId')}</p>
                      <p><strong className="text-gray-500 dark:text-gray-400">from</strong> — {ta('paramFrom')}</p>
                      <p><strong className="text-gray-500 dark:text-gray-400">to</strong> — {ta('paramTo')}</p>
                      {hasGhlFunc && (
                        <p><strong className="text-gray-500 dark:text-gray-400">contactId</strong> — ID del contacto en GoHighLevel (requerido cuando hay funciones GHL activas)</p>
                      )}
                      <p className="pt-1 text-gray-400 dark:text-gray-500 italic">{ta('paramOverrides')}</p>
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Variables Section */}
            <div>
              <button
                type="button"
                onClick={() => toggleSection('variables')}
                className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
              >
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedSection === 'variables' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9l.879 2.121z" />
                </svg>
                <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{ta('variablesLabel')}</span>
                {variables.length > 0 && (
                  <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-green-500 text-white">{variables.length}</span>
                )}
              </button>
              {expandedSection === 'variables' && (
                <div className="px-5 pb-4 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('variablesDesc')}</p>
                  {variables.length > 0 && (
                    <div className="space-y-2">
                      {variables.map((v, i) => (
                        <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-dark-bg rounded-lg">
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">{v.name}</span>
                            {v.defaultValue && (
                              <span className="text-xs text-gray-400 ml-2">{ta('defaultPrefix')}{v.defaultValue}</span>
                            )}
                          </div>
                          <button
                            onClick={() => setVariables(variables.filter((_, idx) => idx !== i))}
                            className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex items-end gap-2">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{ta('varName')}</label>
                      <input
                        type="text"
                        value={newVarName}
                        onChange={(e) => setNewVarName(e.target.value)}
                        placeholder={ta('varNamePlaceholder')}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{ta('varDefaultValue')}</label>
                      <input
                        type="text"
                        value={newVarDefault}
                        onChange={(e) => setNewVarDefault(e.target.value)}
                        placeholder={ta('optionalLabel')}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <button
                      onClick={() => {
                        if (newVarName.trim()) {
                          setVariables([...variables, { name: newVarName.trim(), defaultValue: newVarDefault.trim() }])
                          setNewVarName('')
                          setNewVarDefault('')
                        }
                      }}
                      disabled={!newVarName.trim()}
                      className="px-3 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50 text-sm font-medium flex-shrink-0"
                    >
                      {ta('addVar')}
                    </button>
                  </div>
                </div>
              )}
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
                    <option value="">{ta('noPhoneAssigned')}</option>
                    {phoneNumbers.map((phone) => {
                      const assignedToOther = phone.agentId && phone.agentId !== id
                      return (
                        <option key={phone.id} value={phone.id.toString()} disabled={assignedToOther}>
                          {phone.phoneNumber}{assignedToOther ? ` (${phone.agent?.name || ta('otherAgent')})` : ''}
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
                  <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">{ta('inboundLabel')}</span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-400">{ta('noPhoneNumbersAvail')}</span>
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
              onClick={() => setShowTrainingModal(true)}
              disabled={!agent.vapiId}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              {t('trainingMode.title')}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 dark:bg-green-900/20 rounded-xl">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('launchCall')}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('launchCallSubtitle')}</p>
                </div>
              </div>
              <button onClick={() => setShowCallModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              {userCredits !== null && (
                <div className={`text-sm ${userCredits > 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {ta('availableCredits')}{userCredits.toFixed(2)}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{ta('fromPhone')}</label>
                <select
                  value={selectedPhone}
                  onChange={(e) => setSelectedPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                >
                  {phoneNumbers.map((phone) => (
                    <option key={phone.id} value={phone.id}>
                      {phone.phoneNumber} {phone.vapiPhoneNumberId ? '✓' : '⚠'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{ta('customerPhone')}</label>
                <input
                  type="tel"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{ta('customerName')}</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder={ta('customerNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                />
              </div>
              {callStatus && (
                <div className={`text-sm p-3 rounded-lg ${callStatus.includes('initiated') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {callStatus}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={() => setShowCallModal(false)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              >
                {ta('cancel')}
              </button>
              <button
                onClick={handleCall}
                disabled={calling || !customerNumber}
                className="px-5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50 shadow-sm hover:shadow transition-all duration-200"
              >
                {calling ? ta('calling') : ta('startCall')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Test Call Modal */}
      {showTestCallModal && (
        <TestCallModal agent={agent} onClose={() => setShowTestCallModal(false)} />
      )}

      {/* Training Call Modal */}
      {showTrainingModal && (
        <TrainingCallModal agent={agent} onClose={() => setShowTrainingModal(false)} onAccepted={fetchAgent} />
      )}

      {/* Tool Modal */}
      {showToolModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                  <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {editingTool ? ta('editTool') : ta('addTool')}
                  </h3>
                </div>
              </div>
              <button onClick={() => { setShowToolModal(false); resetToolForm(); setAdvancedSubPanel(null); setShowAdvancedModal(true); }} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('toolType')}</label>
                <select
                  value={toolForm.type}
                  onChange={(e) => setToolForm({ ...toolForm, type: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                >
                  {TOOL_TYPES.map(tt => (
                    <option key={tt.id} value={tt.id}>{ta(`toolType_${tt.id}`) || tt.label}</option>
                  ))}
                </select>
              </div>

              {toolForm.type === 'apiRequest' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('functionName')} *</label>
                    <input
                      type="text"
                      value={toolForm.functionName}
                      onChange={(e) => setToolForm({ ...toolForm, functionName: e.target.value })}
                      placeholder={ta('toolFuncNamePlaceholder')}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('description')} *</label>
                    <input
                      type="text"
                      value={toolForm.functionDescription}
                      onChange={(e) => setToolForm({ ...toolForm, functionDescription: e.target.value })}
                      placeholder={ta('toolDescPlaceholder')}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('toolMethod')} *</label>
                      <select
                        value={toolForm.httpMethod}
                        onChange={(e) => setToolForm({ ...toolForm, httpMethod: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                      >
                        {HTTP_METHODS.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                    <div className="col-span-4">
                      <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('toolUrl')} *</label>
                      <input
                        type="url"
                        value={toolForm.webhookUrl}
                        onChange={(e) => setToolForm({ ...toolForm, webhookUrl: e.target.value })}
                        placeholder={ta('toolApiUrlPlaceholder')}
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                      />
                    </div>
                  </div>
                  {/* Headers — dynamic key/value rows */}
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('headers')}</label>
                    <div className="space-y-2">
                      {(toolForm.httpHeaders || []).map((header, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={header.key}
                            onChange={(e) => {
                              const updated = [...toolForm.httpHeaders]
                              updated[idx] = { ...updated[idx], key: e.target.value }
                              setToolForm({ ...toolForm, httpHeaders: updated })
                            }}
                            placeholder={ta('headerKey')}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                          />
                          <input
                            type="text"
                            value={header.value}
                            onChange={(e) => {
                              const updated = [...toolForm.httpHeaders]
                              updated[idx] = { ...updated[idx], value: e.target.value }
                              setToolForm({ ...toolForm, httpHeaders: updated })
                            }}
                            placeholder={ta('headerValue')}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = toolForm.httpHeaders.filter((_, i) => i !== idx)
                              setToolForm({ ...toolForm, httpHeaders: updated })
                            }}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setToolForm({ ...toolForm, httpHeaders: [...(toolForm.httpHeaders || []), { key: '', value: '' }] })}
                        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        {ta('addHeader')}
                      </button>
                    </div>
                  </div>

                  {/* Request Body Parameters — dynamic rows */}
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('requestBodyParams')}</label>
                    <div className="space-y-2">
                      {(toolForm.httpBodyFields || []).map((field, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={field.key}
                            onChange={(e) => {
                              const updated = [...toolForm.httpBodyFields]
                              updated[idx] = { ...updated[idx], key: e.target.value }
                              setToolForm({ ...toolForm, httpBodyFields: updated })
                            }}
                            placeholder={ta('paramName')}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                          />
                          <select
                            value={field.type}
                            onChange={(e) => {
                              const updated = [...toolForm.httpBodyFields]
                              updated[idx] = { ...updated[idx], type: e.target.value }
                              setToolForm({ ...toolForm, httpBodyFields: updated })
                            }}
                            className="w-28 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                          >
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="integer">integer</option>
                            <option value="boolean">boolean</option>
                          </select>
                          <input
                            type="text"
                            value={field.description}
                            onChange={(e) => {
                              const updated = [...toolForm.httpBodyFields]
                              updated[idx] = { ...updated[idx], description: e.target.value }
                              setToolForm({ ...toolForm, httpBodyFields: updated })
                            }}
                            placeholder={ta('paramDescription')}
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const updated = toolForm.httpBodyFields.filter((_, i) => i !== idx)
                              setToolForm({ ...toolForm, httpBodyFields: updated })
                            }}
                            className="p-2 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setToolForm({ ...toolForm, httpBodyFields: [...(toolForm.httpBodyFields || []), { key: '', type: 'string', description: '' }] })}
                        className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        {ta('addParameter')}
                      </button>
                    </div>
                  </div>

                  {/* Wait for Response Toggle */}
                  <div className={`flex items-center justify-between p-3 rounded-lg transition-colors ${!toolForm.async ? 'bg-green-50 dark:bg-green-900/10' : 'bg-orange-50 dark:bg-orange-900/10'}`}>
                    <div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ta('waitForResponse')}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ta('waitForResponseDesc')}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setToolForm({ ...toolForm, async: !toolForm.async })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${!toolForm.async ? 'bg-green-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${!toolForm.async ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {/* Test Request Section */}
                  <div className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setTestRequestState(prev => ({ ...prev, expanded: !prev.expanded }))}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg hover:bg-gray-100 dark:hover:bg-dark-border/50 transition-colors"
                    >
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ta('testRequest')}</span>
                      <svg className={`w-4 h-4 text-gray-500 transition-transform ${testRequestState.expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {testRequestState.expanded && (
                      <div className="p-3 space-y-3 border-t border-gray-200 dark:border-dark-border">
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('testRequestBody')}</label>
                          <div className="space-y-2">
                            {(() => {
                              // Auto-sync test fields from body params when expanding
                              const bodyKeys = (toolForm.httpBodyFields || []).filter(f => f.key.trim()).map(f => f.key.trim())
                              const currentKeys = (testRequestState.testFields || []).map(f => f.key)
                              if (bodyKeys.length > 0 && (currentKeys.length === 0 || bodyKeys.join(',') !== currentKeys.join(','))) {
                                const newFields = bodyKeys.map(k => {
                                  const existing = (testRequestState.testFields || []).find(f => f.key === k)
                                  return { key: k, value: existing?.value || '' }
                                })
                                setTimeout(() => setTestRequestState(prev => ({ ...prev, testFields: newFields })), 0)
                              }
                              return null
                            })()}
                            {(testRequestState.testFields || []).map((field, idx) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-sm text-gray-600 dark:text-gray-400 font-medium min-w-[100px] truncate">{field.key}</span>
                                <input
                                  type="text"
                                  value={field.value}
                                  onChange={(e) => {
                                    const updated = [...testRequestState.testFields]
                                    updated[idx] = { ...updated[idx], value: e.target.value }
                                    setTestRequestState(prev => ({ ...prev, testFields: updated }))
                                  }}
                                  placeholder={`${ta('toolValueFor')} ${field.key}`}
                                  className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                />
                              </div>
                            ))}
                            {(testRequestState.testFields || []).length === 0 && (
                              <p className="text-xs text-gray-400 dark:text-gray-500 italic">{ta('toolTestEmpty')}</p>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={handleTestRequest}
                          disabled={testRequestState.loading || !toolForm.webhookUrl}
                          className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium"
                        >
                          {testRequestState.loading ? (
                            <>
                              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                              {ta('sending')}
                            </>
                          ) : ta('sendTestRequest')}
                        </button>

                        {testRequestState.error && (
                          <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                            <p className="text-sm text-red-700 dark:text-red-400">{testRequestState.error}</p>
                          </div>
                        )}

                        {testRequestState.result && (
                          <div className="space-y-3">
                            {/* Request Sent */}
                            <details className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                              <summary className="px-3 py-2 bg-gray-50 dark:bg-dark-bg cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{testRequestState.result.request.method}</span>
                                {ta('requestSent')}
                              </summary>
                              <div className="p-3 space-y-2">
                                <p className="text-xs text-gray-500 dark:text-gray-400 break-all">{testRequestState.result.request.url}</p>
                                {testRequestState.result.request.headers && Object.keys(testRequestState.result.request.headers).length > 0 && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-gray-500 dark:text-gray-400">{ta('toolHeaders')}</summary>
                                    <pre className="mt-1 p-2 bg-gray-100 dark:bg-dark-bg rounded text-gray-700 dark:text-gray-300 overflow-x-auto">{JSON.stringify(testRequestState.result.request.headers, null, 2)}</pre>
                                  </details>
                                )}
                                {testRequestState.result.request.body && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-gray-500 dark:text-gray-400">{ta('toolBody')}</summary>
                                    <pre className="mt-1 p-2 bg-gray-100 dark:bg-dark-bg rounded text-gray-700 dark:text-gray-300 overflow-x-auto">{typeof testRequestState.result.request.body === 'string' ? testRequestState.result.request.body : JSON.stringify(testRequestState.result.request.body, null, 2)}</pre>
                                  </details>
                                )}
                              </div>
                            </details>

                            {/* Response Received */}
                            <details open className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
                              <summary className="px-3 py-2 bg-gray-50 dark:bg-dark-bg cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold ${
                                  testRequestState.result.response.status < 300 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                  testRequestState.result.response.status < 400 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                                  'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                }`}>{testRequestState.result.response.status} {testRequestState.result.response.statusText}</span>
                                {ta('responseReceived')}
                                <span className="ml-auto text-xs text-gray-400">{testRequestState.result.duration}ms</span>
                              </summary>
                              <div className="p-3 space-y-2">
                                {testRequestState.result.response.headers && (
                                  <details className="text-xs">
                                    <summary className="cursor-pointer text-gray-500 dark:text-gray-400">{ta('toolHeaders')}</summary>
                                    <pre className="mt-1 p-2 bg-gray-100 dark:bg-dark-bg rounded text-gray-700 dark:text-gray-300 overflow-x-auto">{JSON.stringify(testRequestState.result.response.headers, null, 2)}</pre>
                                  </details>
                                )}
                                <div>
                                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{ta('toolBody')}</p>
                                  <pre className="p-2 bg-gray-100 dark:bg-dark-bg rounded text-xs text-gray-700 dark:text-gray-300 overflow-x-auto max-h-60 overflow-y-auto">{typeof testRequestState.result.response.body === 'string' ? testRequestState.result.response.body : JSON.stringify(testRequestState.result.response.body, null, 2)}</pre>
                                </div>
                              </div>
                            </details>
                          </div>
                        )}
                      </div>
                    )}
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
                    placeholder={ta('endCallMessagePlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={() => { setShowToolModal(false); resetToolForm(); setAdvancedSubPanel(null); setShowAdvancedModal(true); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
              >
                {ta('cancel')}
              </button>
              <button
                onClick={handleSaveTool}
                className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 shadow-sm hover:shadow transition-all duration-200"
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
          ghl: ta('providerGHL'),
          google: ta('providerGoogle'),
          calendly: ta('providerCalendly'),
          hubspot: ta('providerHubSpot'),
          calcom: ta('providerCalcom')
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
                    <span className="text-xs text-red-400 ml-auto">{ta('notConnected')}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400">{ta('selectProvider')}</span>
                )}
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-auto transition-transform ${showProviderDropdown === dropdownId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className={`${showProviderDropdown === dropdownId ? '' : 'hidden'} mt-1 w-full bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg max-h-64 overflow-y-auto`}>
                {connectedAccounts.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">{ta('connected')}</div>
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
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide border-t border-gray-100 dark:border-dark-border mt-1">{ta('notConnectedSection')}</div>
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
                        <span className="text-xs text-gray-400 ml-auto">{ta('setupRequired')}</span>
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
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{ta('calendarLabel')}</label>
              {error && (
                <div className="p-2 mb-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              {loading ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                  <span className="text-sm text-gray-500">{ta('loadingCalendars')}</span>
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
                  <option value="">{ta('selectCalendarOption')}</option>
                  {calendars.map(cal => (
                    <option key={cal.id} value={cal.id}>{cal.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 py-2">
                  {ta('noCalendarsFound')}
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
                <p className="text-sm text-yellow-700 dark:text-yellow-300">{ta('providerNotConnected')}</p>
              </div>
              <button
                onClick={() => {
                  setShowCalendarModal(false)
                  navigate('/dashboard/settings?tab=calendars')
                }}
                className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-xs font-medium whitespace-nowrap"
              >
                {ta('goToSettings')}
              </button>
            </div>
          )
        }

        // Shared helper: render required contact data toggles
        const renderRequiredFields = (rf, onToggle) => (
          <div className="bg-gray-50 dark:bg-dark-hover rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ta('requiredContactData')}</span>
            </div>
            <p className="text-xs text-gray-400 mb-3">{ta('requiredContactDataDesc')}</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'contactName', label: ta('fieldNameLabel'), icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
                { key: 'contactEmail', label: ta('fieldEmail'), icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
                { key: 'contactPhone', label: ta('fieldPhone'), icon: 'M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z' }
              ].map(field => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => onToggle(field.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                    rf[field.key]
                      ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 ring-1 ring-primary-300 dark:ring-primary-700'
                      : 'bg-white dark:bg-dark-card text-gray-400 ring-1 ring-gray-200 dark:ring-dark-border hover:ring-gray-300'
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={field.icon} />
                  </svg>
                  {field.label}
                  {rf[field.key] && (
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        )

        return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-dark-card rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 p-5 border-b border-gray-100 dark:border-dark-border">
              <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('calendarOptions')}</h3>
                <p className="text-xs text-gray-400">{ta('calendarSubtitle')}</p>
              </div>
              <button onClick={() => setShowCalendarModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Enable Calendar Integration toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-hover rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg transition-colors duration-200 ${calendarConfig.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-200 dark:bg-gray-700'}`}>
                    <svg className={`w-4 h-4 transition-colors duration-200 ${calendarConfig.enabled ? 'text-green-600' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('enableCalendar')}</span>
                    <p className="text-xs text-gray-400">{calendarConfig.enabled ? ta('calendarEnabled') : ta('calendarDisabled')}</p>
                  </div>
                </div>
                <button
                  onClick={() => setCalendarConfig({ ...calendarConfig, enabled: !calendarConfig.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
                    calendarConfig.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    calendarConfig.enabled ? 'translate-x-6' : 'translate-x-1'
                  }`} />
                </button>
              </div>

              {calendarConfig.enabled && (
                <div className="space-y-4">
                  {/* ===== SINGLE CALENDAR MODE ===== */}
                  {!isMultiCalendarMode && (
                    <div className="space-y-4">
                      {/* Provider */}
                      <div>
                        <label className="block text-sm font-medium mb-1.5 text-gray-700 dark:text-gray-300">{ta('calendarProvider')} *</label>
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

                      {/* Calendar */}
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
                          {/* Timezone & Duration side by side */}
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('timezone')}</label>
                              <select
                                value={calendarConfig.timezone}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, timezone: e.target.value })}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                              >
                                {TIMEZONES.map(tz => (
                                  <option key={tz} value={tz}>{tz}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('duration')}</label>
                              <select
                                value={calendarConfig.appointmentDuration || 30}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, appointmentDuration: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                              >
                                <option value={10}>{ta('dur10')}</option>
                                <option value={15}>{ta('dur15')}</option>
                                <option value={30}>{ta('dur30')}</option>
                                <option value={45}>{ta('dur45')}</option>
                                <option value={60}>{ta('dur60')}</option>
                                <option value={90}>{ta('dur90')}</option>
                              </select>
                            </div>
                          </div>

                          {/* Required Contact Fields - for non-GHL providers */}
                          {calendarConfig.provider !== 'ghl' && (() => {
                            const rf = calendarConfig.requiredFields || { contactName: true, contactEmail: true, contactPhone: false }
                            return renderRequiredFields(rf, (key) => setCalendarConfig({
                              ...calendarConfig,
                              requiredFields: { ...rf, [key]: !rf[key] }
                            }))
                          })()}

                          {/* GHL Contact ID (Test) */}
                          {calendarConfig.provider === 'ghl' && (
                            <div className="bg-gray-50 dark:bg-dark-hover rounded-xl p-4">
                              <div className="flex items-center gap-2 mb-2">
                                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
                                </svg>
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ta('contactId')}</span>
                                <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded font-medium">{ta('testBadge')}</span>
                              </div>
                              <input
                                type="text"
                                value={calendarConfig.contactId || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, contactId: e.target.value.trim() })}
                                placeholder={ta('contactIdPlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                              />
                              <p className="text-xs text-gray-400 mt-1.5">{ta('contactIdHelp')}</p>
                            </div>
                          )}

                          {/* Appointment / Meeting invite title */}
                          {calendarConfig.provider && (
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.appointmentTitle')}</label>
                              <input
                                type="text"
                                value={calendarConfig.appointmentTitle || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, appointmentTitle: e.target.value })}
                                placeholder={t('chatbotEdit.appointmentTitlePlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                              />
                            </div>
                          )}
                        </>
                      )}

                      {/* Add another calendar */}
                      {calendarConfig.provider && calendarConfig.calendarId && (
                        <button
                          type="button"
                          onClick={addCalendarEntry}
                          className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-sm text-gray-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200"
                        >
                          {ta('addAnotherCalendar')}
                        </button>
                      )}
                    </div>
                  )}

                  {/* ===== MULTI CALENDAR MODE ===== */}
                  {isMultiCalendarMode && (
                    <div className="space-y-3">
                      {calendarConfig.calendars.map((entry, idx) => {
                        const isExpanded = expandedCalendarEntry === entry.id
                        const providerLabel = PROVIDER_NAMES[entry.provider] || ''
                        const subtitle = entry.name || `${ta('calendarLabel')} ${idx + 1}`

                        return (
                        <div key={entry.id} className={`border rounded-xl overflow-hidden transition-all duration-200 ${isExpanded ? 'border-primary-200 dark:border-primary-800 shadow-sm' : 'border-gray-200 dark:border-dark-border'}`}>
                          {/* Collapsible header */}
                          <button
                            type="button"
                            onClick={() => setExpandedCalendarEntry(isExpanded ? null : entry.id)}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors duration-200 ${isExpanded ? 'bg-primary-50/50 dark:bg-primary-900/10' : 'bg-gray-50 dark:bg-dark-hover hover:bg-gray-100 dark:hover:bg-dark-border'}`}
                          >
                            <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            {entry.provider && PROVIDER_ICONS[entry.provider] && (
                              <span className="flex-shrink-0">{PROVIDER_ICONS[entry.provider]}</span>
                            )}
                            <div className="flex-1 min-w-0">
                              <span className="text-sm font-medium text-gray-900 dark:text-white">{subtitle}</span>
                              {providerLabel && (
                                <span className="text-xs text-gray-400 ml-2">{providerLabel}</span>
                              )}
                            </div>
                            {entry.calendarId ? (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                                {ta('statusReady')}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">{ta('notConfigured')}</span>
                            )}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); removeCalendarEntry(entry.id) }}
                              className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200 flex-shrink-0"
                              title={ta('removeCalendar')}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </button>

                          {/* Expandable content */}
                          {isExpanded && (
                            <div className="p-4 space-y-4 border-t border-gray-100 dark:border-dark-border bg-white dark:bg-dark-card">
                              {/* Name & Scenario */}
                              <div className="grid grid-cols-1 gap-3">
                                <div>
                                  <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('nameRequired')}</label>
                                  <input
                                    type="text"
                                    value={entry.name}
                                    onChange={(e) => updateCalendarEntry(entry.id, { name: e.target.value })}
                                    placeholder={ta('calendarNamePlaceholder')}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('scenarioRequired')}</label>
                                  <textarea
                                    value={entry.scenario}
                                    onChange={(e) => updateCalendarEntry(entry.id, { scenario: e.target.value })}
                                    placeholder={ta('calendarScenarioPlaceholder')}
                                    rows={2}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                  />
                                </div>
                              </div>

                              {/* Provider */}
                              <div>
                                <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('providerRequired')}</label>
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
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('timezone')}</label>
                                      <select
                                        value={entry.timezone}
                                        onChange={(e) => updateCalendarEntry(entry.id, { timezone: e.target.value })}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                      >
                                        {TIMEZONES.map(tz => (
                                          <option key={tz} value={tz}>{tz}</option>
                                        ))}
                                      </select>
                                    </div>
                                    <div>
                                      <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{ta('duration')}</label>
                                      <select
                                        value={entry.appointmentDuration || 30}
                                        onChange={(e) => updateCalendarEntry(entry.id, { appointmentDuration: parseInt(e.target.value) })}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                      >
                                        <option value={10}>10 min</option>
                                        <option value={15}>15 min</option>
                                        <option value={30}>30 min</option>
                                        <option value={45}>45 min</option>
                                        <option value={60}>60 min</option>
                                        <option value={90}>90 min</option>
                                      </select>
                                    </div>
                                  </div>

                                  {/* Required Contact Fields - non-GHL */}
                                  {entry.provider !== 'ghl' && (() => {
                                    const rf = entry.requiredFields || { contactName: true, contactEmail: true, contactPhone: false }
                                    return renderRequiredFields(rf, (key) => updateCalendarEntry(entry.id, {
                                      requiredFields: { ...rf, [key]: !rf[key] }
                                    }))
                                  })()}

                                  {/* GHL Contact ID (Test) */}
                                  {entry.provider === 'ghl' && (
                                    <div className="bg-gray-50 dark:bg-dark-hover rounded-xl p-4">
                                      <div className="flex items-center gap-2 mb-2">
                                        <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0" />
                                        </svg>
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ta('contactId')}</span>
                                        <span className="text-xs px-1.5 py-0.5 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded font-medium">{ta('testBadge')}</span>
                                      </div>
                                      <input
                                        type="text"
                                        value={entry.contactId || ''}
                                        onChange={(e) => updateCalendarEntry(entry.id, { contactId: e.target.value.trim() })}
                                        placeholder={ta('contactIdPlaceholder')}
                                        className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                      />
                                      <p className="text-xs text-gray-400 mt-1.5">{ta('contactIdHelp')}</p>
                                    </div>
                                  )}

                                  {/* Appointment / Meeting invite title */}
                                  <div>
                                    <label className="block text-xs font-medium mb-1.5 text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t('chatbotEdit.appointmentTitle')}</label>
                                    <input
                                      type="text"
                                      value={entry.appointmentTitle || ''}
                                      onChange={(e) => updateCalendarEntry(entry.id, { appointmentTitle: e.target.value })}
                                      placeholder={t('chatbotEdit.appointmentTitlePlaceholder')}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                    />
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
                        className="w-full py-3 border-2 border-dashed border-gray-200 dark:border-dark-border rounded-xl text-sm text-gray-400 hover:border-primary-300 hover:text-primary-500 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200"
                      >
                        {ta('addCalendar')}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            {(() => {
              const isValid = !calendarConfig.enabled || (() => {
                if (isMultiCalendarMode) {
                  return calendarConfig.calendars.every(c => c.name && c.scenario && c.provider && c.calendarId)
                }
                return !calendarConfig.provider || calendarConfig.calendarId
              })()

              return (
                <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
                  <button
                    onClick={() => setShowCalendarModal(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                  >
                    {ta('cancel')}
                  </button>
                  <button
                    onClick={() => setShowCalendarModal(false)}
                    disabled={!isValid}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                      isValid
                        ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow'
                        : 'bg-gray-100 dark:bg-dark-hover text-gray-400 cursor-not-allowed'
                    }`}
                  >
                    {ta('done')}
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
                  <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 3h5m0 0v5m0-5l-6 6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('transferOptions')}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ta('transferSubtitle')}</p>
                </div>
              </div>
              <button onClick={() => setShowTransferModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Enable Toggle */}
              <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-dark-hover rounded-xl">
                <div className="flex items-center gap-3">
                  <div className={`p-1.5 rounded-lg ${transferConfig.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-gray-200 dark:bg-dark-border'}`}>
                    <svg className={`w-4 h-4 ${transferConfig.enabled ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('enableTransfer')}</span>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{transferConfig.enabled ? ta('transferActive') : ta('transferDisabled')}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setTransferConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${transferConfig.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${transferConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {transferConfig.enabled && (
                <>
                  {!isMultiTransferMode ? (
                    /* Single Transfer Mode */
                    <div className="space-y-4">
                      {/* Description / When to transfer */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{ta('whenToTransfer')}</label>
                        <input
                          type="text"
                          value={transferConfig.description}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, description: e.target.value }))}
                          placeholder={ta('transferScenarioPlaceholder')}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                        />
                      </div>

                      {/* Destination Type */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{ta('destinationType')}</label>
                        <select
                          value={transferConfig.destinationType}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, destinationType: e.target.value, destinationValue: '' }))}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow appearance-none cursor-pointer"
                        >
                          <option value="number">{ta('destPhone')}</option>
                          <option value="sip">{ta('destSip')}</option>
                          <option value="assistant">{ta('destAssistant')}</option>
                        </select>
                      </div>

                      {/* Destination Value */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
                          {transferConfig.destinationType === 'number' ? ta('destPhoneLabel') : transferConfig.destinationType === 'sip' ? ta('destSip') : ta('destAssistantLabel')}
                        </label>
                        <input
                          type="text"
                          value={transferConfig.destinationValue}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, destinationValue: e.target.value }))}
                          placeholder={transferConfig.destinationType === 'number' ? '+1234567890' : transferConfig.destinationType === 'sip' ? 'sip:user@domain.com' : 'Assistant name'}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                        />
                      </div>

                      {/* Transfer Message */}
                      <div>
                        <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">{ta('transferMessage')}</label>
                        <input
                          type="text"
                          value={transferConfig.message}
                          onChange={(e) => setTransferConfig(prev => ({ ...prev, message: e.target.value }))}
                          placeholder={ta('transferMsgPlaceholder')}
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                        />
                      </div>

                      {/* Add Another Transfer Button */}
                      <button
                        type="button"
                        onClick={addTransferEntry}
                        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200"
                      >
                        {ta('addTransferDest')}
                      </button>
                    </div>
                  ) : (
                    /* Multi Transfer Mode */
                    <div className="space-y-3">
                      {transferConfig.transfers.map((entry) => {
                        const isExpanded = expandedTransferEntry === entry.id
                        return (
                          <div key={entry.id} className={`border rounded-lg overflow-hidden transition-all duration-200 ${isExpanded ? 'border-primary-200 dark:border-primary-800 shadow-sm' : 'border-gray-200 dark:border-dark-border'}`}>
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
                                  {entry.name || ta('untitledTransfer')}
                                </span>
                                {entry.destinationValue && (
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                    ({entry.destinationType === 'sip' ? ta('destSipShort') : entry.destinationType === 'assistant' ? ta('destAsstShort') : ta('destPhoneShort')}: {entry.destinationValue})
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
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{ta('transferName')}</label>
                                  <input
                                    type="text"
                                    value={entry.name}
                                    onChange={(e) => updateTransferEntry(entry.id, { name: e.target.value })}
                                    placeholder={ta('transferEntryNamePlaceholder')}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                  />
                                </div>

                                {/* Scenario */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{ta('transferScenario')}</label>
                                  <input
                                    type="text"
                                    value={entry.scenario}
                                    onChange={(e) => updateTransferEntry(entry.id, { scenario: e.target.value })}
                                    placeholder={ta('transferEntryScenarioPlaceholder')}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                  />
                                </div>

                                {/* Destination Type */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{ta('destinationType')}</label>
                                  <select
                                    value={entry.destinationType}
                                    onChange={(e) => updateTransferEntry(entry.id, { destinationType: e.target.value, destinationValue: '' })}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow appearance-none cursor-pointer"
                                  >
                                    <option value="number">{ta('destPhone')}</option>
                                    <option value="sip">{ta('destSip')}</option>
                                    <option value="assistant">{ta('destAssistant')}</option>
                                  </select>
                                </div>

                                {/* Destination Value */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                    {entry.destinationType === 'number' ? ta('destPhoneLabel') : entry.destinationType === 'sip' ? ta('destSip') : ta('destAssistantLabel')}
                                  </label>
                                  <input
                                    type="text"
                                    value={entry.destinationValue}
                                    onChange={(e) => updateTransferEntry(entry.id, { destinationValue: e.target.value })}
                                    placeholder={entry.destinationType === 'number' ? '+1234567890' : entry.destinationType === 'sip' ? 'sip:user@domain.com' : 'Assistant name'}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                                  />
                                </div>

                                {/* Transfer Message */}
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{ta('transferMessage')}</label>
                                  <input
                                    type="text"
                                    value={entry.message}
                                    onChange={(e) => updateTransferEntry(entry.id, { message: e.target.value })}
                                    placeholder={ta('transferEntryMsgPlaceholder')}
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
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
                        className="w-full py-2.5 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200"
                      >
                        {ta('addTransfer')}
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
                <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
                  <button
                    onClick={() => setShowTransferModal(false)}
                    className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
                  >
                    {ta('cancel')}
                  </button>
                  <button
                    onClick={() => setShowTransferModal(false)}
                    disabled={!isValid}
                    className={`px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${isValid ? 'bg-primary-600 text-white hover:bg-primary-700 shadow-sm hover:shadow' : 'bg-gray-100 dark:bg-dark-hover text-gray-400 cursor-not-allowed'}`}
                  >
                    {ta('done')}
                  </button>
                </div>
              )
            })()}
          </div>
        </div>
        )
      })()}

      {/* Actions in Call Modal */}
      {showAdvancedModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Grid View (default) */}
            {!advancedSubPanel && (
              <>
                <div className="p-6 pb-4">
                  <div className="flex items-center justify-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6.253v11.494M8.464 8.464a5 5 0 000 7.072M17.95 6.05a8 8 0 010 11.9M6.05 6.05a8 8 0 000 11.9" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white">{ta('actionsInCall')}</h3>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">{ta('inCallSubtitle')}</p>
                </div>
                <div className="px-5 pb-2 space-y-2">
                    {/* Voice Model */}
                    <button
                      onClick={() => setAdvancedSubPanel('voiceModel')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('voiceModel')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('voiceModelCardDesc')}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Voice Tuning */}
                    <button
                      onClick={() => setAdvancedSubPanel('voiceTuning')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('voiceTuning')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('voiceTuningCardDesc')}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Background Sound */}
                    <button
                      onClick={() => setAdvancedSubPanel('bgSound')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('backgroundSound')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('bgSoundCardDesc')}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Agent Tools */}
                    <button
                      onClick={() => setAdvancedSubPanel('tools')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('agentTools')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('agentToolsCardDesc')}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Stop Speaking */}
                    <button
                      onClick={() => setAdvancedSubPanel('stopSpeaking')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${callBehaviorSettings.stopSpeakingEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${callBehaviorSettings.stopSpeakingEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('stopSpeaking')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('stopSpeakingCardDesc')}</p>
                      </div>
                      {callBehaviorSettings.stopSpeakingEnabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Start Speaking */}
                    <button
                      onClick={() => setAdvancedSubPanel('startSpeaking')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${callBehaviorSettings.startSpeakingEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${callBehaviorSettings.startSpeakingEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('startSpeaking')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('startSpeakingCardDesc')}</p>
                      </div>
                      {callBehaviorSettings.startSpeakingEnabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Voicemail Detection */}
                    <button
                      onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, voicemailDetectionEnabled: !callBehaviorSettings.voicemailDetectionEnabled })}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${callBehaviorSettings.voicemailDetectionEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${callBehaviorSettings.voicemailDetectionEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <title>{ta('tipVoicemail')}</title>
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('voicemail')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('voicemailCardDesc')}</p>
                      </div>
                      {callBehaviorSettings.voicemailDetectionEnabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                    </button>

                    {/* Call Timeouts */}
                    <button
                      onClick={() => setAdvancedSubPanel('callTimeouts')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('callTimeouts')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('callTimeoutsCardDesc')}</p>
                      </div>
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Callbacks */}
                    <button
                      onClick={() => setAdvancedSubPanel('callbacks')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${callbackConfig.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${callbackConfig.enabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 3h5m0 0v5m0-5l-6 6" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('callbacks')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('callbacksCardDesc')}</p>
                      </div>
                      {callbackConfig.enabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                </div>
                <div className="p-5 pt-3">
                  <button
                    onClick={() => { setAdvancedSubPanel(null); setShowAdvancedModal(false) }}
                    className="w-full py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-sm hover:shadow transition-all duration-200 font-medium"
                  >
                    {ta('close')}
                  </button>
                </div>
              </>
            )}

            {/* Sub-panel: Voice Model */}
            {advancedSubPanel === 'voiceModel' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('voiceModel')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('voiceModelSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'voiceModel' ? null : 'voiceModel')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'voiceModel' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('tipVoiceModel')}</div>
                )}
                <div className="px-5 pb-5 space-y-3">
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
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 text-left ${voiceSettings.model === model.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
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
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('voiceTuning')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('voiceTuningSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'voiceTuning' ? null : 'voiceTuning')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'voiceTuning' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('tipVoiceTuning')}</div>
                )}
                <div className="px-5 pb-5 space-y-3">
                  {[
                    { key: 'stability', label: ta('stability'), min: 0, max: 1, step: 0.05, left: ta('variable'), right: ta('stable'), fmt: v => v.toFixed(2) },
                    { key: 'similarityBoost', label: ta('similarityBoost'), min: 0, max: 1, step: 0.05, left: ta('low'), right: ta('high'), fmt: v => v.toFixed(2) },
                    { key: 'speed', label: ta('speed'), min: 0.5, max: 1.2, step: 0.1, left: ta('slower'), right: ta('faster'), fmt: v => v.toFixed(1) },
                    { key: 'style', label: ta('styleExaggeration'), min: 0, max: 1, step: 0.05, left: ta('none'), right: ta('exaggerated'), fmt: v => v.toFixed(2) }
                  ].map(s => (
                    <div key={s.key} className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border flex items-center justify-between">
                    <div>
                      <span className="text-sm text-gray-700 dark:text-gray-300">{ta('useSpeakerBoost')}</span>
                      <p className="text-xs text-gray-400">{ta('similarityBoost')}</p>
                    </div>
                    <button
                      onClick={() => setVoiceSettings({ ...voiceSettings, useSpeakerBoost: !voiceSettings.useSpeakerBoost })}
                      className={`w-11 h-6 rounded-full transition-colors duration-200 ${voiceSettings.useSpeakerBoost ? 'bg-primary-600' : 'bg-gray-300'}`}
                    >
                      <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${voiceSettings.useSpeakerBoost ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Sub-panel: Background Sound */}
            {advancedSubPanel === 'bgSound' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500 to-teal-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('backgroundSound')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('bgSoundSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'bgSound' ? null : 'bgSound')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'bgSound' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('tipBgSound')}</div>
                )}
                <div className="px-5 pb-5 space-y-3">
                  {[
                    { value: 'off', label: ta('bgSoundOff'), desc: ta('bgSoundOffDesc') },
                    { value: 'office', label: ta('bgSoundOffice'), desc: ta('bgSoundOfficeDesc') }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setVoiceSettings({ ...voiceSettings, backgroundSound: opt.value })}
                      className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all duration-200 text-left ${voiceSettings.backgroundSound === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
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
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('agentTools')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('agentToolsSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'tools' ? null : 'tools')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                  <button onClick={openAddToolModal} className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-xl hover:bg-primary-700">+ {ta('add')}</button>
                </div>
                {advancedInfoPopup === 'tools' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('tipAgentTools')}</div>
                )}
                <div className="px-5 pb-5">
                  {tools.length === 0 ? (
                    <div className="text-center py-8 bg-gray-50 dark:bg-dark-hover rounded-xl border border-dashed border-gray-300 dark:border-dark-border">
                      <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                      <p className="text-sm text-gray-500">{ta('noToolsConfigured')}</p>
                      <p className="text-xs text-gray-400 mt-1">{ta('addToolsDesc')}</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {tools.map((tool, index) => {
                        const getToolLabel = (tl) => {
                          if (tl.type === 'apiRequest') return tl.name || ta('toolType_apiRequest')
                          if (tl.type === 'function') return tl.function?.name || ta('function')
                          if (tl.type === 'ghl.contact.get') return ta('getContact')
                          if (tl.type === 'ghl.contact.create') return ta('createContact')
                          if (tl.type === 'ghl.calendar.availability.check') return ta('checkAvailability')
                          if (tl.type === 'ghl.calendar.event.create') return ta('bookAppointment')
                          return tl.type
                        }
                        const getToolBadge = (tb) => {
                          if (tb.type === 'apiRequest') return `${tb.method || 'POST'}`
                          if (tb.type.startsWith('ghl.')) return 'GHL'
                          return tb.type
                        }
                        return (
                          <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-xl border border-gray-200 dark:border-dark-border">
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

            {/* Sub-panel: Stop Speaking */}
            {advancedSubPanel === 'stopSpeaking' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('stopSpeakingPlan')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('stopSpeakingSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'stopSpeaking' ? null : 'stopSpeaking')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'stopSpeaking' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('stopSpeakingDesc')}</div>
                )}
                <div className="px-5 pb-5 space-y-4 overflow-y-auto max-h-[60vh]">
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ta('enableStopSpeaking')}</span>
                    <button
                      onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, stopSpeakingEnabled: !callBehaviorSettings.stopSpeakingEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${callBehaviorSettings.stopSpeakingEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${callBehaviorSettings.stopSpeakingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {callBehaviorSettings.stopSpeakingEnabled && (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <div className="flex justify-between mb-1">
                          <label className="text-xs text-gray-600 dark:text-gray-400">{ta('voiceSeconds')}</label>
                          <span className="text-xs text-gray-500">{callBehaviorSettings.stopSpeakingVoiceSeconds}s</span>
                        </div>
                        <input
                          type="range"
                          min={0.1}
                          max={0.5}
                          step={0.1}
                          value={callBehaviorSettings.stopSpeakingVoiceSeconds}
                          onChange={(e) => setCallBehaviorSettings({ ...callBehaviorSettings, stopSpeakingVoiceSeconds: parseFloat(e.target.value) })}
                          className="w-full accent-primary-600"
                        />
                        <p className="text-xs text-gray-400 mt-0.5">{ta('voiceActivityDuration')}</p>
                      </div>

                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('startSpeakingPlan')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('startSpeakingSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'startSpeaking' ? null : 'startSpeaking')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'startSpeaking' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('startSpeakingDesc')}</div>
                )}
                <div className="px-5 pb-5 space-y-4 overflow-y-auto max-h-[60vh]">

                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border flex items-center justify-between">
                    <span className="text-sm text-gray-700 dark:text-gray-300">{ta('enableStartSpeaking')}</span>
                    <button
                      onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingEnabled: !callBehaviorSettings.startSpeakingEnabled })}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${callBehaviorSettings.startSpeakingEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${callBehaviorSettings.startSpeakingEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>

                  {callBehaviorSettings.startSpeakingEnabled && (
                    <div className="space-y-3">
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm text-gray-700 dark:text-gray-300">{ta('smartEndpointing')}</span>
                          <button
                            onClick={() => setCallBehaviorSettings({ ...callBehaviorSettings, startSpeakingSmartEndpointing: !callBehaviorSettings.startSpeakingSmartEndpointing })}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${callBehaviorSettings.startSpeakingSmartEndpointing ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                          >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${callBehaviorSettings.startSpeakingSmartEndpointing ? 'translate-x-6' : 'translate-x-1'}`} />
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
                        <div className="space-y-3">
                          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">{ta('transcriptionEndpointing')}</p>

                          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

                          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

                          <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

            {/* Sub-panel: Callbacks */}
            {advancedSubPanel === 'callbacks' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('callbacks')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('callbacksSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'callbacks' ? null : 'callbacks')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'callbacks' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('callbacksInfo')}</div>
                )}
                <div className="px-5 pb-5 space-y-4">
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{ta('callbacksEnable')}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ta('callbacksDesc')}</p>
                    </div>
                    <button
                      onClick={() => setCallbackConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${callbackConfig.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${callbackConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                    </button>
                  </div>
                  {callbackConfig.enabled && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                      <p className="text-xs text-amber-700 dark:text-amber-300">{ta('callbacksPhoneNote')}</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Call Timeouts */}
            {advancedSubPanel === 'callTimeouts' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('callTimeouts')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('callTimeoutsSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'callTimeouts' ? null : 'callTimeouts')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'callTimeouts' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('callTimeoutsDesc')}</div>
                )}
                <div className="px-5 pb-5 space-y-3 overflow-y-auto max-h-[60vh]">

                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
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

      {/* Actions After Call Modal */}
      {showAfterCallModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">

            {/* Grid View (default) */}
            {!advancedSubPanel && (
              <>
                <div className="p-6 pb-4">
                  <div className="flex items-center justify-center gap-3 mb-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-sm">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                      </svg>
                    </div>
                  </div>
                  <h3 className="text-lg font-bold text-center text-gray-900 dark:text-white">{ta('actionsAfterCall')}</h3>
                  <p className="text-xs text-center text-gray-500 dark:text-gray-400 mt-1">{ta('afterCallSubtitle')}</p>
                </div>
                <div className="px-5 pb-2 space-y-2">
                    {/* Webhook */}
                    <button
                      onClick={() => setAdvancedSubPanel('webhook')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center flex-shrink-0 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30 transition-colors">
                        <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('postCallWebhook')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('webhookCardDesc')}</p>
                      </div>
                      {serverConfig.serverUrl && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusActive')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Structured Data */}
                    <button
                      onClick={() => { setAdvancedSubPanel('structuredData'); fetchGhlCrmData() }}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${serverConfig.structuredDataEnabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${serverConfig.structuredDataEnabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('structuredData')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('structuredDataCardDesc')}</p>
                      </div>
                      {serverConfig.structuredDataEnabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* GHL CRM */}
                    <button
                      onClick={() => { setAdvancedSubPanel('ghlCrm'); fetchGhlCrmData() }}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${ghlCrmConfig.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${ghlCrmConfig.enabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('ghlCrm')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('ghlCrmCardDesc')}</p>
                      </div>
                      {ghlCrmConfig.enabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Follow-ups */}
                    <button
                      onClick={() => setAdvancedSubPanel('followUps')}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${followUpConfig.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${followUpConfig.enabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('followUps')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('followUpsCardDesc')}</p>
                      </div>
                      {followUpConfig.enabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>

                    {/* Chatbot Trigger */}
                    <button
                      onClick={() => { setAdvancedSubPanel('chatbotTrigger'); if (chatbotsList.length === 0) { setChatbotsLoading(true); chatbotsAPI.list().then(r => setChatbotsList(r.data.chatbots || [])).catch(() => {}).finally(() => setChatbotsLoading(false)) } }}
                      className="w-full flex items-center gap-3.5 p-3.5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 hover:bg-primary-50/50 dark:hover:bg-primary-900/10 transition-all duration-200 group"
                    >
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 transition-colors ${chatbotTriggerConfig.enabled ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary-50 dark:bg-primary-900/20 group-hover:bg-primary-100 dark:group-hover:bg-primary-900/30'}`}>
                        <svg className={`w-5 h-5 ${chatbotTriggerConfig.enabled ? 'text-green-600' : 'text-primary-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                        </svg>
                      </div>
                      <div className="flex-1 text-left">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('chatbotTrigger')}</span>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{ta('chatbotTriggerCardDesc')}</p>
                      </div>
                      {chatbotTriggerConfig.enabled && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">{ta('statusOn')}</span>}
                      <svg className="w-4 h-4 text-gray-400 group-hover:text-primary-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                </div>
                <div className="p-5 pt-4">
                  <button
                    onClick={() => { setAdvancedSubPanel(null); setShowAfterCallModal(false) }}
                    className="w-full py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-sm hover:shadow transition-all duration-200 font-medium"
                  >
                    {ta('close')}
                  </button>
                </div>
              </>
            )}

            {/* Sub-panel: Webhook */}
            {advancedSubPanel === 'webhook' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('postCallWebhook')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('webhookSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'webhook' ? null : 'webhook')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'webhook' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('tipWebhook')}</div>
                )}
                <div className="px-5 pb-5 space-y-4">
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      {ta('webhookUrlLabel')}
                    </label>
                    <input
                      type="url"
                      value={serverConfig.serverUrl}
                      onChange={(e) => setServerConfig({ ...serverConfig, serverUrl: e.target.value })}
                      placeholder={ta('webhookUrlPlaceholder')}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    />
                    <p className="text-xs text-gray-400 mt-1.5">{ta('receivesCallData')}</p>
                  </div>
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                    <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      {ta('webhookSecret')}
                    </label>
                    <input
                      type="password"
                      value={serverConfig.serverUrlSecret}
                      onChange={(e) => setServerConfig({ ...serverConfig, serverUrlSecret: e.target.value })}
                      placeholder={ta('webhookSecretPlaceholder')}
                      className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                    />
                  </div>
                </div>
              </>
            )}

            {/* Sub-panel: Structured Data */}
            {advancedSubPanel === 'structuredData' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('structuredData')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('structuredDataSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'structuredData' ? null : 'structuredData')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'structuredData' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('tipStructuredData')}</div>
                )}
                <div className="px-5 pb-5 space-y-4 overflow-y-auto max-h-[60vh]">

                  {/* Enable toggle */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-700 dark:text-gray-300">{ta('enableStructuredDataToggle')}</span>
                      <button
                        onClick={() => setServerConfig({ ...serverConfig, structuredDataEnabled: !serverConfig.structuredDataEnabled })}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${serverConfig.structuredDataEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-hover'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${serverConfig.structuredDataEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {serverConfig.structuredDataEnabled && (
                    <>
                      {/* Data Fields */}
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">{ta('structuredDataFields')}</label>
                        <div className="space-y-2">
                          {(serverConfig.structuredDataFields || []).map((field, idx) => (
                            <div key={idx} className="group relative bg-gray-50 dark:bg-dark-hover rounded-xl p-3 border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
                              <div className="flex items-center gap-2 mb-2">
                                <input
                                  type="text"
                                  value={field.key}
                                  onChange={(e) => {
                                    const updated = [...serverConfig.structuredDataFields]
                                    updated[idx] = { ...updated[idx], key: e.target.value }
                                    setServerConfig({ ...serverConfig, structuredDataFields: updated })
                                  }}
                                  placeholder={ta('fieldName')}
                                  className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm font-medium focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                                />
                                <div className="relative">
                                  <select
                                    value={field.type}
                                    onChange={(e) => {
                                      const updated = [...serverConfig.structuredDataFields]
                                      updated[idx] = { ...updated[idx], type: e.target.value }
                                      setServerConfig({ ...serverConfig, structuredDataFields: updated })
                                    }}
                                    className="appearance-none w-24 pl-3 pr-7 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-700 dark:text-gray-300 text-xs font-mono cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                                  >
                                    <option value="string">string</option>
                                    <option value="number">number</option>
                                    <option value="integer">integer</option>
                                    <option value="boolean">boolean</option>
                                  </select>
                                  <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = serverConfig.structuredDataFields.filter((_, i) => i !== idx)
                                    setServerConfig({ ...serverConfig, structuredDataFields: updated })
                                  }}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                              </div>
                              <input
                                type="text"
                                value={field.description}
                                onChange={(e) => {
                                  const updated = [...serverConfig.structuredDataFields]
                                  updated[idx] = { ...updated[idx], description: e.target.value }
                                  setServerConfig({ ...serverConfig, structuredDataFields: updated })
                                }}
                                placeholder={ta('fieldDescription')}
                                className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-600 dark:text-gray-400 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                              />
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => setServerConfig({ ...serverConfig, structuredDataFields: [...(serverConfig.structuredDataFields || []), { key: '', type: 'string', description: '' }] })}
                            className="w-full py-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 dark:border-dark-border hover:border-primary-400 dark:hover:border-primary-600 rounded-xl transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            {ta('addField')}
                          </button>
                        </div>
                      </div>

                      {/* Extraction Prompt */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">{ta('extractionInstructions')}</label>
                        <textarea
                          value={serverConfig.structuredDataPrompt}
                          onChange={(e) => setServerConfig({ ...serverConfig, structuredDataPrompt: e.target.value })}
                          rows={3}
                          placeholder={ta('structuredDataPromptPlaceholder')}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all duration-200"
                        />
                        <p className="text-xs text-gray-400 mt-1.5">{ta('extractionInstructionsDesc')}</p>
                      </div>

                      {/* GHL Custom Fields */}
                      <div className="border-t border-gray-200 dark:border-dark-border pt-5 mt-5">
                        <div className="flex items-center gap-2 mb-1">
                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">{ta('ghlCrmCustomFields')}</label>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{ta('ghlCrmCustomFieldsDesc')}</p>
                        {ghlCrmLoading ? (
                          <div className="flex items-center gap-2 text-xs text-gray-500 py-3">
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            {ta('ghlCrmLoadingData')}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {(serverConfig.ghlCustomFields || []).map((field, idx) => (
                              <div key={idx} className="group relative bg-gray-50 dark:bg-dark-hover rounded-xl p-3 border border-gray-200 dark:border-dark-border hover:border-primary-300 dark:hover:border-primary-700 transition-colors">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="relative flex-1">
                                    <select
                                      value={field.fieldKey || ''}
                                      onChange={(e) => {
                                        const selected = ghlCustomFields.find(f => f.fieldKey === e.target.value)
                                        const updated = [...(serverConfig.ghlCustomFields || [])]
                                        updated[idx] = {
                                          ...updated[idx],
                                          fieldKey: e.target.value,
                                          name: selected?.name || e.target.value,
                                          dataType: selected?.dataType || field.dataType || 'string'
                                        }
                                        setServerConfig({ ...serverConfig, ghlCustomFields: updated })
                                      }}
                                      className="appearance-none w-full pl-3 pr-8 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm font-medium cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                                    >
                                      <option value="" className="text-gray-400">{ta('ghlCrmSelectCustomField')}</option>
                                      {ghlCustomFields.map(f => (
                                        <option key={f.id} value={f.fieldKey}>{f.name}</option>
                                      ))}
                                    </select>
                                    <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                  </div>
                                  {field.dataType && (
                                    <span className="px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 text-[10px] font-mono whitespace-nowrap">{field.dataType}</span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const updated = (serverConfig.ghlCustomFields || []).filter((_, i) => i !== idx)
                                      setServerConfig({ ...serverConfig, ghlCustomFields: updated })
                                    }}
                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                                  >
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                  </button>
                                </div>
                                <input
                                  type="text"
                                  value={field.description || ''}
                                  onChange={(e) => {
                                    const updated = [...(serverConfig.ghlCustomFields || [])]
                                    updated[idx] = { ...updated[idx], description: e.target.value }
                                    setServerConfig({ ...serverConfig, ghlCustomFields: updated })
                                  }}
                                  placeholder={ta('fieldDescription')}
                                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-600 dark:text-gray-400 text-xs focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                                />
                                {field.fieldKey && (
                                  <div className="mt-1.5 flex items-center gap-1">
                                    <code className="text-[10px] text-gray-400 font-mono">{field.fieldKey}</code>
                                    <button onClick={() => navigator.clipboard.writeText(field.fieldKey)} className="text-gray-300 hover:text-primary-500 transition-colors">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                            <button
                              type="button"
                              onClick={() => setServerConfig({ ...serverConfig, ghlCustomFields: [...(serverConfig.ghlCustomFields || []), { fieldKey: '', name: '', dataType: 'string', description: '' }] })}
                              className="w-full py-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 font-medium flex items-center justify-center gap-1.5 border-2 border-dashed border-gray-300 dark:border-dark-border hover:border-primary-400 dark:hover:border-primary-600 rounded-xl transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                              {ta('ghlCrmAddCustomField')}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: GHL CRM */}
            {advancedSubPanel === 'ghlCrm' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('ghlCrm')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('ghlCrmSubtitle')}</p>
                  </div>
                </div>
                <div className="px-5 pb-5 space-y-4 overflow-y-auto max-h-[60vh]">

                  {/* Enable toggle */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                    <label className="flex items-center justify-between cursor-pointer">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{ta('ghlCrmEnable')}</span>
                      <button
                        onClick={() => setGhlCrmConfig(c => ({ ...c, enabled: !c.enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${ghlCrmConfig.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${ghlCrmConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </label>
                  </div>

                  {ghlCrmLoading && (
                    <div className="flex items-center gap-2 text-sm text-gray-500">
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      {ta('ghlCrmLoadingData')}
                    </div>
                  )}

                  {ghlCrmError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-300">{ghlCrmError}</div>
                  )}

                  {ghlCrmConfig.enabled && !ghlCrmLoading && (
                    <>
                      {/* --- Tag Mapping --- */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{ta('ghlCrmTagMapping')}</h4>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{ta('ghlCrmTagMappingDesc')}</p>

                        {['booked', 'answered', 'not_interested', 'no_answer', 'failed', 'transferred'].map(outcome => (
                          <div key={outcome} className="mb-3">
                            <label className="text-xs font-medium text-gray-600 dark:text-gray-400 capitalize mb-1 block">{outcome.replace('_', ' ')}</label>
                            <div className="flex flex-wrap gap-1.5 p-2 border border-gray-200 dark:border-dark-border rounded-lg min-h-[36px] bg-white dark:bg-dark-hover">
                              {(ghlCrmConfig.tagMapping[outcome] || []).map(tag => (
                                <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 text-xs">
                                  {tag}
                                  <button onClick={() => setGhlCrmConfig(c => ({
                                    ...c,
                                    tagMapping: { ...c.tagMapping, [outcome]: c.tagMapping[outcome].filter(t => t !== tag) }
                                  }))} className="hover:text-red-500">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                  </button>
                                </span>
                              ))}
                              <input
                                type="text"
                                list={`ghl-tags-${outcome}`}
                                placeholder={`+ ${ta('ghlCrmAddTag')}`}
                                className="text-xs bg-transparent border-none outline-none text-gray-700 dark:text-gray-300 placeholder-gray-400 min-w-[80px] flex-1"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ',') {
                                    e.preventDefault()
                                    const tag = e.target.value.trim().replace(/,$/, '')
                                    if (!tag) return
                                    setGhlCrmConfig(c => ({
                                      ...c,
                                      tagMapping: {
                                        ...c.tagMapping,
                                        [outcome]: (c.tagMapping[outcome] || []).includes(tag)
                                          ? c.tagMapping[outcome]
                                          : [...(c.tagMapping[outcome] || []), tag]
                                      }
                                    }))
                                    e.target.value = ''
                                  }
                                }}
                                onChange={(e) => {
                                  // Auto-add when selecting from datalist
                                  const tag = e.target.value.trim()
                                  const isFromList = ghlTags.some(t => t.name === tag)
                                  if (isFromList) {
                                    setGhlCrmConfig(c => ({
                                      ...c,
                                      tagMapping: {
                                        ...c.tagMapping,
                                        [outcome]: (c.tagMapping[outcome] || []).includes(tag)
                                          ? c.tagMapping[outcome]
                                          : [...(c.tagMapping[outcome] || []), tag]
                                      }
                                    }))
                                    e.target.value = ''
                                  }
                                }}
                              />
                              <datalist id={`ghl-tags-${outcome}`}>
                                {ghlTags.filter(t => !(ghlCrmConfig.tagMapping[outcome] || []).includes(t.name)).map(t => (
                                  <option key={t.id} value={t.name} />
                                ))}
                              </datalist>
                            </div>
                          </div>
                        ))}

                        {/* Delete old tags checkbox */}
                        <label className="flex items-center gap-2 mt-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={ghlCrmConfig.deleteOldTags}
                            onChange={(e) => setGhlCrmConfig(c => ({ ...c, deleteOldTags: e.target.checked }))}
                            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                          />
                          <span className="text-xs text-gray-600 dark:text-gray-400">{ta('ghlCrmDeleteOldTags')}</span>
                        </label>
                      </div>

                      {/* --- Pipeline Mapping --- */}
                      <div className="border-t border-gray-200 dark:border-dark-border pt-5 mt-1">
                        <div className="flex items-center gap-2 mb-2">
                          <svg className="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" /></svg>
                          <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{ta('ghlCrmPipelineMapping')}</h4>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{ta('ghlCrmPipelineMappingDesc')}</p>

                        {/* Pipeline selector */}
                        <div className="mb-4">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5 block">{ta('ghlCrmPipeline')}</label>
                          <div className="relative">
                            <select
                              value={ghlCrmConfig.pipelineId}
                              onChange={(e) => {
                                const pl = ghlPipelines.find(p => p.id === e.target.value)
                                setGhlCrmConfig(c => ({
                                  ...c,
                                  pipelineId: e.target.value,
                                  pipelineName: pl?.name || '',
                                  pipelineMapping: { booked: '', answered: '', not_interested: '', failed: '', transferred: '', voicemail: '' }
                                }))
                              }}
                              className="appearance-none w-full text-sm pl-3 pr-8 py-2.5 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-hover text-gray-900 dark:text-white cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                            >
                              <option value="">{ta('ghlCrmSelectPipeline')}</option>
                              {ghlPipelines.map(p => (
                                <option key={p.id} value={p.id}>{p.name}</option>
                              ))}
                            </select>
                            <svg className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                          </div>
                        </div>

                        {/* Stage mapping per outcome (expanded cards) */}
                        {ghlCrmConfig.pipelineId && (() => {
                          const selectedPipeline = ghlPipelines.find(p => p.id === ghlCrmConfig.pipelineId)
                          const stages = selectedPipeline?.stages || []
                          return (
                            <div className="space-y-3">
                              {['booked', 'answered', 'not_interested', 'no_answer', 'failed', 'transferred'].map(outcome => (
                                <div key={outcome} className="bg-gray-50 dark:bg-dark-hover rounded-xl px-3.5 py-3 border border-gray-200 dark:border-dark-border space-y-2.5">
                                  {/* Outcome label + Stage dropdown */}
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 capitalize w-28 shrink-0">{outcome.replace('_', ' ')}</span>
                                    <div className="relative flex-1">
                                      <select
                                        value={ghlCrmConfig.pipelineMapping[outcome] || ''}
                                        onChange={(e) => setGhlCrmConfig(c => ({
                                          ...c,
                                          pipelineMapping: { ...c.pipelineMapping, [outcome]: e.target.value }
                                        }))}
                                        className="appearance-none w-full text-sm pl-3 pr-8 py-1.5 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                                      >
                                        <option value="" className="text-gray-400">{ta('ghlCrmNoStage')}</option>
                                        {stages.map(s => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                      </select>
                                      <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                  </div>

                                  {/* Extra config: only shown when a stage is selected */}
                                  {ghlCrmConfig.pipelineMapping[outcome] && (
                                    <div className="pl-[7.75rem] space-y-2.5">
                                      {/* Assign User */}
                                      <div>
                                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">{ta('ghlCrmAssignUser')}</label>
                                        <div className="relative">
                                          <select
                                            value={(ghlCrmConfig.userMapping || {})[outcome] || ''}
                                            onChange={(e) => setGhlCrmConfig(c => ({
                                              ...c,
                                              userMapping: { ...(c.userMapping || {}), [outcome]: e.target.value }
                                            }))}
                                            className="appearance-none w-full text-sm pl-3 pr-8 py-1.5 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white cursor-pointer focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-shadow"
                                          >
                                            <option value="">{ta('ghlCrmSelectUser')}</option>
                                            {ghlUsers.map(u => (
                                              <option key={u.id} value={u.id}>{u.name || u.email}</option>
                                            ))}
                                          </select>
                                          <svg className="w-3.5 h-3.5 text-gray-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                        </div>
                                      </div>

                                      {/* Contact Note */}
                                      <div>
                                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1 block">{ta('ghlCrmNote')}</label>
                                        <div className="flex gap-1.5 mb-1.5">
                                          {[
                                            { value: 'none', label: ta('ghlCrmNoteNone') },
                                            { value: 'manual', label: ta('ghlCrmNoteManual') },
                                            { value: 'ai', label: ta('ghlCrmNoteAI') }
                                          ].map(opt => {
                                            const current = (ghlCrmConfig.noteMapping || {})[outcome]?.type || 'none'
                                            return (
                                              <button
                                                key={opt.value}
                                                onClick={() => setGhlCrmConfig(c => ({
                                                  ...c,
                                                  noteMapping: {
                                                    ...(c.noteMapping || {}),
                                                    [outcome]: { ...((c.noteMapping || {})[outcome] || {}), type: opt.value }
                                                  }
                                                }))}
                                                className={`text-[11px] px-2.5 py-1 rounded-lg border transition-colors ${current === opt.value
                                                  ? 'bg-primary-50 dark:bg-primary-900/20 border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 font-medium'
                                                  : 'bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border text-gray-600 dark:text-gray-400 hover:border-gray-300'
                                                }`}
                                              >
                                                {opt.label}
                                              </button>
                                            )
                                          })}
                                        </div>
                                        {(ghlCrmConfig.noteMapping || {})[outcome]?.type === 'manual' && (
                                          <textarea
                                            value={(ghlCrmConfig.noteMapping || {})[outcome]?.text || ''}
                                            onChange={(e) => setGhlCrmConfig(c => ({
                                              ...c,
                                              noteMapping: {
                                                ...(c.noteMapping || {}),
                                                [outcome]: { ...((c.noteMapping || {})[outcome] || {}), text: e.target.value }
                                              }
                                            }))}
                                            placeholder={ta('ghlCrmNotePlaceholder')}
                                            rows={2}
                                            className="w-full text-sm px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none resize-none"
                                          />
                                        )}
                                        {(ghlCrmConfig.noteMapping || {})[outcome]?.type === 'ai' && (
                                          <p className="text-[11px] text-gray-400 dark:text-gray-500 italic">{ta('ghlCrmNoteAI')}</p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )
                        })()}
                      </div>

                    </>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Follow-ups */}
            {advancedSubPanel === 'followUps' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('followUps')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('followUpsSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'followUps' ? null : 'followUps')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'followUps' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('followUpsInfo')}</div>
                )}
                <div className="px-5 pb-5 space-y-4 overflow-y-auto max-h-[60vh]">
                  {/* Enable toggle */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{ta('followUpsEnable')}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ta('followUpsDesc')}</p>
                      </div>
                      <button
                        onClick={() => setFollowUpConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${followUpConfig.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${followUpConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {followUpConfig.enabled && (
                    <>
                      {/* Max attempts */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{ta('followUpsMaxAttempts')}</label>
                        <input
                          type="number"
                          min={1}
                          max={10}
                          value={followUpConfig.maxAttempts}
                          onChange={(e) => {
                            const newMax = Math.min(10, Math.max(1, parseInt(e.target.value) || 1))
                            setFollowUpConfig(prev => {
                              const currentIntervals = prev.intervals || [120]
                              const newIntervals = Array.from({ length: newMax }, (_, i) => currentIntervals[i] ?? currentIntervals[currentIntervals.length - 1] ?? 120)
                              return { ...prev, maxAttempts: newMax, intervals: newIntervals }
                            })
                          }}
                          className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                        />
                      </div>

                      {/* Per-attempt intervals */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{ta('followUpsIntervals')}</label>
                        <div className="space-y-2">
                          {Array.from({ length: followUpConfig.maxAttempts }, (_, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 dark:text-gray-400 w-20 shrink-0">{ta('followUpsAttempt')} {i + 1}:</span>
                              <select
                                value={(followUpConfig.intervals || [])[i] === -1 ? -1 : ((followUpConfig.intervals || [])[i] || 120)}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value)
                                  setFollowUpConfig(prev => {
                                    const newIntervals = [...(prev.intervals || [])]
                                    newIntervals[i] = val === -1 ? -1 : val
                                    return { ...prev, intervals: newIntervals }
                                  })
                                }}
                                className="flex-1 px-2 py-1.5 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                              >
                                <option value={15}>15 min</option>
                                <option value={30}>30 min</option>
                                <option value={60}>1 hour</option>
                                <option value={120}>2 hours</option>
                                <option value={240}>4 hours</option>
                                <option value={480}>8 hours</option>
                                <option value={1440}>1 day</option>
                                <option value={2880}>2 days</option>
                                <option value={4320}>3 days</option>
                                <option value={-1}>{ta('followUpsCustom')}</option>
                              </select>
                              {(followUpConfig.intervals || [])[i] === -1 && (
                                <input
                                  type="number"
                                  min={1}
                                  placeholder={ta('minLabel')}
                                  value={(followUpConfig.customIntervals || {})[i] || ''}
                                  onChange={(e) => {
                                    const mins = Math.max(1, parseInt(e.target.value) || 1)
                                    setFollowUpConfig(prev => ({
                                      ...prev,
                                      customIntervals: { ...(prev.customIntervals || {}), [i]: mins }
                                    }))
                                  }}
                                  className="w-20 px-2 py-1.5 border border-gray-200 dark:border-dark-border rounded-xl bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                                />
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Outcomes checkboxes */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{ta('followUpsOutcomes')}</label>
                        <div className="space-y-2">
                          {[
                            { value: 'no_answer', label: ta('followUpsOutcomesNoAnswer') || 'No Answer' },
                            { value: 'failed', label: ta('followUpsOutcomesFailed') },
                            { value: 'answered', label: ta('followUpsOutcomesAnswered') },
                            { value: 'not_interested', label: ta('followUpsOutcomesNotInterested') },
                            { value: 'unknown', label: ta('followUpsOutcomesUnknown') }
                          ].map(({ value, label }) => (
                            <label key={value} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={followUpConfig.outcomes.includes(value)}
                                onChange={(e) => {
                                  setFollowUpConfig(prev => ({
                                    ...prev,
                                    outcomes: e.target.checked
                                      ? [...prev.outcomes, value]
                                      : prev.outcomes.filter(o => o !== value)
                                  }))
                                }}
                                className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              />
                              <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Context note */}
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
                        <p className="text-xs text-blue-700 dark:text-blue-300">{ta('followUpsContextNote')}</p>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

            {/* Sub-panel: Chatbot Trigger */}
            {advancedSubPanel === 'chatbotTrigger' && (
              <>
                <div className="flex items-center gap-3 p-5 pb-4">
                  <button onClick={() => { setAdvancedSubPanel(null); setAdvancedInfoPopup(null) }} className="p-1.5 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-all duration-200 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                  </button>
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center flex-shrink-0">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('chatbotTrigger')}</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{ta('chatbotTriggerSubtitle')}</p>
                  </div>
                  <button onClick={() => setAdvancedInfoPopup(advancedInfoPopup === 'chatbotTrigger' ? null : 'chatbotTrigger')} className="text-gray-400 hover:text-primary-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  </button>
                </div>
                {advancedInfoPopup === 'chatbotTrigger' && (
                  <div className="mx-5 mt-1 mb-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">{ta('chatbotTriggerInfo')}</div>
                )}
                <div className="px-5 pb-5 space-y-4 overflow-y-auto max-h-[60vh]">
                  {/* Enable toggle */}
                  <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{ta('chatbotTriggerEnable')}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ta('chatbotTriggerDesc')}</p>
                      </div>
                      <button
                        onClick={() => setChatbotTriggerConfig(prev => ({ ...prev, enabled: !prev.enabled }))}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${chatbotTriggerConfig.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ${chatbotTriggerConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  </div>

                  {chatbotTriggerConfig.enabled && (
                    <>
                      {/* Chatbot selector */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{ta('chatbotTriggerSelect')}</label>
                        {(() => {
                          const availableChatbots = chatbotsList
                          return chatbotsLoading ? (
                            <p className="text-xs text-gray-500">{ta('common.loading') || 'Loading...'}</p>
                          ) : availableChatbots.length === 0 ? (
                            <p className="text-xs text-amber-600">{ta('chatbotTriggerNoChatbots')}</p>
                          ) : (
                            <select
                              value={chatbotTriggerConfig.chatbotId}
                              onChange={(e) => {
                                const selected = availableChatbots.find(c => c.id === e.target.value)
                                setChatbotTriggerConfig(prev => ({
                                  ...prev,
                                  chatbotId: e.target.value,
                                  chatbotName: selected?.name || ''
                                }))
                              }}
                              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                            >
                              <option value="">{ta('chatbotTriggerSelectPlaceholder')}</option>
                              {availableChatbots.map(c => (
                                <option key={c.id} value={c.id}>{c.name} ({c.chatbotType === 'ghl_sms' ? 'SMS' : c.chatbotType === 'ghl_whatsapp' ? 'WhatsApp' : c.chatbotType === 'ghl_facebook' ? 'Facebook' : c.chatbotType === 'ghl_instagram' ? 'Instagram' : 'Webhook'})</option>
                              ))}
                            </select>
                          )
                        })()}
                      </div>

                      {/* Chatbot type info banner */}
                      {(() => {
                        if (!chatbotTriggerConfig.chatbotId) return null
                        const selectedChatbot = chatbotsList.find(c => c.id === chatbotTriggerConfig.chatbotId)
                        if (!selectedChatbot) return null
                        const isGHL = selectedChatbot.chatbotType?.startsWith('ghl_')
                        const ghlChannelLabel = selectedChatbot.chatbotType === 'ghl_sms' ? 'SMS'
                          : selectedChatbot.chatbotType === 'ghl_whatsapp' ? 'WhatsApp'
                          : selectedChatbot.chatbotType === 'ghl_facebook' ? 'Facebook'
                          : selectedChatbot.chatbotType === 'ghl_instagram' ? 'Instagram'
                          : ''
                        return isGHL ? (
                          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 border-l-4 border-amber-400 dark:border-amber-500">
                            <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-sm text-amber-800 dark:text-amber-200">
                              This chatbot uses <span className="font-semibold">GoHighLevel</span>. The contact ID from the call will be used to send the follow-up message via GHL {ghlChannelLabel}.
                            </p>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 dark:border-blue-500">
                            <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                              This chatbot will be triggered via <span className="font-semibold">webhook forwarding</span>. The call data will be sent to the chatbot's webhook and the response will be routed through the chatbot's configured output.
                            </p>
                          </div>
                        )
                      })()}

                      {/* Trigger condition */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{ta('chatbotTriggerCondition')}</label>
                        <div className="space-y-1">
                          {[
                            { value: 'always', label: ta('chatbotTriggerAlways'), desc: ta('chatbotTriggerAlwaysDesc') },
                            { value: 'outcomes', label: ta('chatbotTriggerByOutcome'), desc: ta('chatbotTriggerByOutcomeDesc') },
                            { value: 'structuredData', label: ta('chatbotTriggerByStructuredData'), desc: ta('chatbotTriggerByStructuredDataDesc') }
                          ].map(({ value, label, desc }) => (
                            <label key={value} className="flex items-start gap-2 cursor-pointer p-2 rounded-lg hover:bg-white dark:hover:bg-dark-card transition-colors duration-150">
                              <input
                                type="radio"
                                name="chatbotTriggerOn"
                                checked={chatbotTriggerConfig.triggerOn === value}
                                onChange={() => setChatbotTriggerConfig(prev => ({ ...prev, triggerOn: value }))}
                                className="mt-0.5 w-4 h-4 text-primary-600 focus:ring-primary-500"
                              />
                              <div>
                                <span className="text-sm text-gray-900 dark:text-white font-medium">{label}</span>
                                <p className="text-xs text-gray-500 dark:text-gray-400">{desc}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Outcomes multiselect (when triggerOn=outcomes) */}
                      {chatbotTriggerConfig.triggerOn === 'outcomes' && (
                        <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{ta('chatbotTriggerOutcomes')}</label>
                          <div className="space-y-2">
                            {[
                              { value: 'booked', label: ta('chatbotTriggerOutcomeBooked') },
                              { value: 'answered', label: ta('chatbotTriggerOutcomeAnswered') },
                              { value: 'not_interested', label: ta('chatbotTriggerOutcomeNotInterested') },
                              { value: 'no_answer', label: ta('chatbotTriggerOutcomeNoAnswer') || 'No Answer' },
                              { value: 'failed', label: ta('chatbotTriggerOutcomeFailed') },
                              { value: 'transferred', label: ta('chatbotTriggerOutcomeTransferred') }
                            ].map(({ value, label }) => (
                              <label key={value} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={(chatbotTriggerConfig.outcomes || []).includes(value)}
                                  onChange={(e) => {
                                    setChatbotTriggerConfig(prev => ({
                                      ...prev,
                                      outcomes: e.target.checked
                                        ? [...(prev.outcomes || []), value]
                                        : (prev.outcomes || []).filter(o => o !== value)
                                    }))
                                  }}
                                  className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                />
                                <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Structured data field/value (when triggerOn=structuredData) */}
                      {chatbotTriggerConfig.triggerOn === 'structuredData' && (
                        <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ta('chatbotTriggerFieldName')}</label>
                            <input
                              type="text"
                              value={chatbotTriggerConfig.structuredDataField}
                              onChange={(e) => setChatbotTriggerConfig(prev => ({ ...prev, structuredDataField: e.target.value }))}
                              placeholder={ta('customFieldKeyPlaceholder')}
                              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{ta('chatbotTriggerFieldValue')}</label>
                            <input
                              type="text"
                              value={chatbotTriggerConfig.structuredDataValue}
                              onChange={(e) => setChatbotTriggerConfig(prev => ({ ...prev, structuredDataValue: e.target.value }))}
                              placeholder={ta('customFieldValuePlaceholder')}
                              className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                            />
                          </div>
                        </div>
                      )}

                      {/* Delay */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{ta('chatbotTriggerDelay')}</label>
                        <input
                          type="number"
                          min={0}
                          max={1440}
                          value={chatbotTriggerConfig.delayMinutes}
                          onChange={(e) => setChatbotTriggerConfig(prev => ({ ...prev, delayMinutes: Math.max(0, parseInt(e.target.value) || 0) }))}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{ta('chatbotTriggerDelayDesc')}</p>
                      </div>

                      {/* Custom message template */}
                      <div className="p-3.5 rounded-xl bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">{ta('chatbotTriggerMessage')}</label>
                        <textarea
                          value={chatbotTriggerConfig.messageTemplate}
                          onChange={(e) => setChatbotTriggerConfig(prev => ({ ...prev, messageTemplate: e.target.value }))}
                          placeholder={ta('chatbotTriggerMessagePlaceholder')}
                          rows={3}
                          className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all duration-200"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1.5">{ta('chatbotTriggerMessageDesc')}</p>
                      </div>
                    </>
                  )}
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {/* AI Prompt Generator Modal - 3-Step Wizard */}
      {showPromptGenerator && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('promptGeneratorTitle')}</h3>
              <button
                onClick={() => { setShowPromptGenerator(false); setGeneratedPrompt(''); setPromptMode('generate'); resetWizard() }}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mode toggle - only show if there's an existing prompt */}
            {systemPrompt.trim() && !generatedPrompt && (
              <div className="px-6 pt-4">
                <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden">
                  <button
                    type="button"
                    onClick={() => { setPromptMode('generate'); setGeneratedPrompt(''); resetWizard() }}
                    className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${promptMode === 'generate' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}
                  >
                    {ta('promptModeGenerate')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPromptMode('update'); setGeneratedPrompt(''); resetWizard() }}
                    className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${promptMode === 'update' ? 'bg-orange-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}
                  >
                    {ta('promptModeUpdate')}
                  </button>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {/* ── UPDATE MODE (kept as-is) ── */}
              {promptMode === 'update' && !generatedPrompt && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('promptLanguage')}</label>
                    <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden w-48">
                      <button type="button" onClick={() => setUpdateLanguage('en')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${updateLanguage === 'en' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{ta('english')}</button>
                      <button type="button" onClick={() => setUpdateLanguage('es')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${updateLanguage === 'es' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{ta('spanish')}</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('promptDescribeChanges')}</label>
                    <textarea
                      value={updateDescription}
                      onChange={(e) => setUpdateDescription(e.target.value)}
                      rows={4}
                      placeholder={updateLanguage === 'es' ? ta('promptPlaceholderUpdateEs') : ta('promptPlaceholderUpdate')}
                      className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm"
                    />
                  </div>
                  <button
                    onClick={handleUpdatePrompt}
                    disabled={generatingPrompt || !updateDescription.trim()}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-orange-600 hover:bg-orange-700"
                  >
                    {generatingPrompt ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        {ta('promptUpdating')}
                      </>
                    ) : ta('promptUpdate')}
                  </button>
                </>
              )}

              {/* ── GENERATE MODE: 3-Step Wizard ── */}
              {promptMode === 'generate' && !generatedPrompt && (
                <>
                  {/* Stepper */}
                  <div className="flex items-center justify-center gap-0 mb-2">
                    {[1, 2, 3].map((step, i) => (
                      <div key={step} className="flex items-center">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                          wizardStep > step ? 'bg-purple-600 text-white' :
                          wizardStep === step ? 'bg-purple-600 text-white' :
                          'bg-gray-200 dark:bg-dark-border text-gray-500 dark:text-gray-400'
                        }`}>
                          {wizardStep > step ? (
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                          ) : step}
                        </div>
                        {i < 2 && <div className={`w-12 h-0.5 ${wizardStep > step ? 'bg-purple-600' : 'bg-gray-200 dark:bg-dark-border'}`} />}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-center gap-8 text-xs text-gray-500 dark:text-gray-400 mb-2">
                    <span className={wizardStep >= 1 ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>{ta('wizStepBotType')}</span>
                    <span className={wizardStep >= 2 ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>{ta('wizStepDetails')}</span>
                    <span className={wizardStep >= 3 ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>{ta('wizStepConfig')}</span>
                  </div>

                  {/* Step 1: Bot Type + Direction + Language */}
                  {wizardStep === 1 && (
                    <div className="space-y-4">
                      {/* Bot Type Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'sales', icon: '💰', label: ta('wizBotSales'), desc: ta('wizBotSalesDesc') },
                          { id: 'support', icon: '🎧', label: ta('wizBotSupport'), desc: ta('wizBotSupportDesc') },
                          { id: 'booking', icon: '📅', label: ta('wizBotBooking'), desc: ta('wizBotBookingDesc') },
                          { id: 'survey', icon: '📋', label: ta('wizBotSurvey'), desc: ta('wizBotSurveyDesc') }
                        ].map(bt => (
                          <button
                            key={bt.id}
                            type="button"
                            onClick={() => setWizBotType(bt.id)}
                            className={`p-4 rounded-lg border-2 text-left transition-all ${
                              wizBotType === bt.id
                                ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                            }`}
                          >
                            <div className="text-2xl mb-1">{bt.icon}</div>
                            <div className="text-sm font-medium text-gray-900 dark:text-white">{bt.label}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">{bt.desc}</div>
                          </button>
                        ))}
                      </div>

                      {/* Direction Toggle */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('promptDirection')}</label>
                        <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden">
                          <button type="button" onClick={() => setWizDirection('inbound')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${wizDirection === 'inbound' ? 'bg-blue-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{ta('wizDirectionInbound')}</button>
                          <button type="button" onClick={() => setWizDirection('outbound')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${wizDirection === 'outbound' ? 'bg-green-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{ta('wizDirectionOutbound')}</button>
                        </div>
                      </div>

                      {/* Language Toggle */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizLanguage')}</label>
                        <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden w-48">
                          <button type="button" onClick={() => setWizLanguage('en')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${wizLanguage === 'en' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{ta('english')}</button>
                          <button type="button" onClick={() => setWizLanguage('es')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${wizLanguage === 'es' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{ta('spanish')}</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Business Details */}
                  {wizardStep === 2 && (
                    <div className="space-y-4">
                      {/* Company Name */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizCompanyName')} *</label>
                        <input
                          type="text"
                          value={wizCompanyName}
                          onChange={(e) => setWizCompanyName(e.target.value)}
                          placeholder={ta('wizCompanyNamePlaceholder')}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                      </div>

                      {/* Industry Dropdown */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizIndustry')}</label>
                        <select
                          value={wizIndustry}
                          onChange={(e) => setWizIndustry(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">{ta('wizSelectIndustry')}</option>
                          {['Healthcare', 'RealEstate', 'Legal', 'Finance', 'Education', 'Automotive', 'Restaurant', 'Ecommerce', 'Saas', 'Insurance', 'HomeServices', 'Other'].map(ind => (
                            <option key={ind} value={ind.toLowerCase()}>{ta(`wizIndustry${ind}`)}</option>
                          ))}
                        </select>
                      </div>

                      {/* Tone Pills */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizTone')}</label>
                        <div className="flex flex-wrap gap-2">
                          {['professional', 'friendly', 'casual', 'formal', 'energetic'].map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => setWizTone(t)}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                wizTone === t
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                              }`}
                            >
                              {ta(`wizTone${t.charAt(0).toUpperCase() + t.slice(1)}`)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Goals */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizGoals')} *</label>
                        <textarea
                          value={wizGoals}
                          onChange={(e) => setWizGoals(e.target.value)}
                          rows={3}
                          placeholder={wizLanguage === 'es' ? ta('wizGoalsPlaceholderEs') : ta('wizGoalsPlaceholder')}
                          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                      </div>
                    </div>
                  )}

                  {/* Step 3: Type-Specific Config + Generate */}
                  {wizardStep === 3 && (
                    <div className="space-y-4">
                      {/* Sales-specific fields */}
                      {wizBotType === 'sales' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizQualifyingQuestions')}</label>
                            <textarea
                              value={wizTypeConfig.qualifyingQuestions || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, qualifyingQuestions: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizQualifyingQuestionsPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizCommonObjections')}</label>
                            <textarea
                              value={wizTypeConfig.commonObjections || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, commonObjections: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizCommonObjectionsPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Support-specific fields */}
                      {wizBotType === 'support' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizCommonIssues')}</label>
                            <textarea
                              value={wizTypeConfig.commonIssues || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, commonIssues: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizCommonIssuesPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizEscalationRules')}</label>
                            <textarea
                              value={wizTypeConfig.escalationRules || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, escalationRules: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizEscalationRulesPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Booking-specific fields */}
                      {wizBotType === 'booking' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizServicesOffered')}</label>
                            <textarea
                              value={wizTypeConfig.servicesOffered || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, servicesOffered: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizServicesOfferedPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizAvailabilityNotes')}</label>
                            <textarea
                              value={wizTypeConfig.availabilityNotes || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, availabilityNotes: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizAvailabilityNotesPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Survey-specific fields */}
                      {wizBotType === 'survey' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizSurveyQuestions')}</label>
                            <textarea
                              value={wizTypeConfig.surveyQuestions || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, surveyQuestions: e.target.value }))}
                              rows={3}
                              placeholder={ta('wizSurveyQuestionsPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizRatingScale')}</label>
                            <div className="flex gap-2">
                              {['1-5', '1-10', 'yes/no'].map(scale => (
                                <button
                                  key={scale}
                                  type="button"
                                  onClick={() => setWizTypeConfig(prev => ({ ...prev, ratingScale: scale }))}
                                  className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                    (wizTypeConfig.ratingScale || '1-5') === scale
                                      ? 'bg-purple-600 text-white'
                                      : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                                  }`}
                                >
                                  {scale === '1-5' ? ta('wizRatingScale1to5') : scale === '1-10' ? ta('wizRatingScale1to10') : ta('wizRatingScaleYesNo')}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Additional Notes (always shown) */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{ta('wizAdditionalNotes')}</label>
                        <textarea
                          value={wizAdditionalNotes}
                          onChange={(e) => setWizAdditionalNotes(e.target.value)}
                          rows={2}
                          placeholder={ta('wizAdditionalNotesPlaceholder')}
                          className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                      </div>

                      {/* Generate Button */}
                      <button
                        onClick={handleGeneratePrompt}
                        disabled={generatingPrompt}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors bg-purple-600 hover:bg-purple-700"
                      >
                        {generatingPrompt ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            {ta('wizGenerating')}
                          </>
                        ) : ta('wizGenerate')}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── Generated Result (both modes) ── */}
              {generatedPrompt && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
                    {promptMode === 'update' ? ta('promptUpdated') : ta('promptGenerated')}
                  </label>
                  <div className="p-4 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border max-h-[50vh] overflow-y-auto">
                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">{generatedPrompt}</p>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            {/* Wizard navigation for generate mode (no result yet) */}
            {promptMode === 'generate' && !generatedPrompt && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => setWizardStep(prev => Math.max(1, prev - 1))}
                  disabled={wizardStep === 1}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('common.back')}
                </button>
                {wizardStep < 3 && (
                  <button
                    onClick={() => setWizardStep(prev => Math.min(3, prev + 1))}
                    disabled={(wizardStep === 1 && !wizBotType) || (wizardStep === 2 && (!wizCompanyName.trim() || !wizGoals.trim()))}
                    className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('common.next')}
                  </button>
                )}
              </div>
            )}

            {/* Result footer (regenerate + use) */}
            {generatedPrompt && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => { setGeneratedPrompt(''); if (promptMode === 'generate') { setWizardStep(3) } }}
                  disabled={generatingPrompt}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
                >
                  {promptMode === 'update' ? ta('promptUpdateAgain') : ta('promptRegenerate')}
                </button>
                <button
                  onClick={handleUseGeneratedPrompt}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {ta('promptUse')}
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
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('chooseVoice')}</h2>
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
                <option value="all">{ta('allVoicesOption')}</option>
                <option value="11labs">{ta('elevenLabsOption')}</option>
                <option value="custom">{ta('customOption')}</option>
              </select>
              <select
                value={voiceGenderFilter}
                onChange={(e) => setVoiceGenderFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">{ta('allGendersOption')}</option>
                <option value="male">{ta('maleOption')}</option>
                <option value="female">{ta('femaleOption')}</option>
              </select>
              <select
                value={voiceAccentFilter}
                onChange={(e) => setVoiceAccentFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">{ta('allAccentsOption')}</option>
                <option value="american">{ta('accentAmerican')}</option>
                <option value="british">{ta('accentBritish')}</option>
                <option value="australian">{ta('accentAustralian')}</option>
                <option value="swedish">{ta('accentSwedish')}</option>
                <option value="transatlantic">{ta('accentTransatlantic')}</option>
                <option value="mexican">{ta('accentMexican')}</option>
                <option value="colombian">{ta('accentColombian')}</option>
                <option value="argentinian">{ta('accentArgentinian')}</option>
                <option value="chilean">{ta('accentChilean')}</option>
                <option value="peruvian">{ta('accentPeruvian')}</option>
                <option value="venezuelan">{ta('accentVenezuelan')}</option>
                <option value="cuban">{ta('accentCuban')}</option>
                <option value="dominican">{ta('accentDominican')}</option>
                <option value="puerto rican">{ta('accentPuertoRican')}</option>
                <option value="ecuadorian">{ta('accentEcuadorian')}</option>
                <option value="uruguayan">{ta('accentUruguayan')}</option>
                <option value="paraguayan">{ta('accentParaguayan')}</option>
                <option value="bolivian">{ta('accentBolivian')}</option>
                <option value="costarrican">{ta('accentCostaRican')}</option>
                <option value="panamanian">{ta('accentPanamanian')}</option>
                <option value="guatemalan">{ta('accentGuatemalan')}</option>
                <option value="honduran">{ta('accentHonduran')}</option>
                <option value="salvadoran">{ta('accentSalvadoran')}</option>
                <option value="nicaraguan">{ta('accentNicaraguan')}</option>
                <option value="spanish">{ta('accentSpanishSpain')}</option>
              </select>
              <select
                value={voiceLanguageFilter}
                onChange={(e) => setVoiceLanguageFilter(e.target.value)}
                className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
              >
                <option value="all">{ta('allLanguagesOption')}</option>
                <option value="en">{ta('langEnglish')}</option>
                <option value="es">{ta('langSpanish')}</option>
                <option value="fr">{ta('langFrench')}</option>
                <option value="de">{ta('langGerman')}</option>
                <option value="it">{ta('langItalian')}</option>
                <option value="pt">{ta('langPortuguese')}</option>
                <option value="pl">{ta('langPolish')}</option>
                <option value="nl">{ta('langDutch')}</option>
                <option value="ru">{ta('langRussian')}</option>
                <option value="ja">{ta('langJapanese')}</option>
                <option value="zh">{ta('langChinese')}</option>
                <option value="ko">{ta('langKorean')}</option>
                <option value="hi">{ta('langHindi')}</option>
                <option value="ar">{ta('langArabic')}</option>
                <option value="sv">{ta('langSwedish')}</option>
                <option value="da">{ta('langDanish')}</option>
                <option value="fi">{ta('langFinnish')}</option>
                <option value="no">{ta('langNorwegian')}</option>
                <option value="tr">{ta('langTurkish')}</option>
                <option value="el">{ta('langGreek')}</option>
                <option value="cs">{ta('langCzech')}</option>
                <option value="ro">{ta('langRomanian')}</option>
                <option value="hu">{ta('langHungarian')}</option>
                <option value="sk">{ta('langSlovak')}</option>
                <option value="uk">{ta('langUkrainian')}</option>
                <option value="vi">{ta('langVietnamese')}</option>
                <option value="id">{ta('langIndonesian')}</option>
                <option value="ms">{ta('langMalay')}</option>
                <option value="he">{ta('langHebrew')}</option>
              </select>
              <div className="relative flex-1 min-w-[150px]">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={voiceSearch}
                  onChange={(e) => setVoiceSearch(e.target.value)}
                  placeholder={ta('searchVoices')}
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
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('addVoiceManually')}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ta('pasteVoiceIdDesc')}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        value={customVoiceId}
                        onChange={(e) => setCustomVoiceId(e.target.value)}
                        placeholder={ta('voiceIdPlaceholder')}
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
                        {ta('useVoice')}
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
                              {voice.isCustom ? ta('customOption') : ta('elevenLabsOption')}
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
                                {voice.languages.length} {ta('langsCount')}
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
                <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">{ta('noVoicesMatch')}</p>
              )}
            </div>
          </div>
        </div>
      )}
      {/* Agent Info Modal */}
      {showAgentInfoModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowAgentInfoModal(false)}>
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary-50 dark:bg-primary-900/20 rounded-xl">
                  <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('agentInfo')}</h3>
              </div>
              <button onClick={() => setShowAgentInfoModal(false)} className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{ta('agentInfoName')}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow"
                  placeholder={ta('agentNamePlaceholder')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{ta('agentInfoDescription')}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-shadow resize-none"
                  placeholder={ta('agentDescPlaceholder')}
                />
              </div>
              {assignedPhoneId && (
                <div>
                  <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">{ta('agentInfoType')}</label>
                  <div className="flex gap-2">
                    {[
                      { value: 'outbound', label: ta('typeOutbound'), desc: ta('typeOutboundDesc') },
                      { value: 'inbound', label: ta('typeInboundOutbound'), desc: ta('typeInboundOutboundDesc') }
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
            <div className="p-5 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={() => setShowAgentInfoModal(false)}
                className="w-full py-2.5 bg-primary-600 text-white rounded-xl hover:bg-primary-700 shadow-sm hover:shadow transition-all duration-200 font-medium text-sm"
              >
                {ta('done')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
