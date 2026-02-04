import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agentsAPI, phoneNumbersAPI, callsAPI, creditsAPI, ghlAPI } from '../../services/api'
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

const LLM_MODELS = [
  { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B (Recommended)', icon: '🟣' },
  { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Fast', icon: '🟣' },
  { provider: 'groq', model: 'llama3-70b-8192', label: 'Llama 3 70B', icon: '🟣' },
  { provider: 'groq', model: 'llama3-8b-8192', label: 'Llama 3 8B', icon: '🟣' },
  { provider: 'groq', model: 'gemma2-9b-it', label: 'Gemma 2 9B', icon: '🔵' },
  { provider: 'groq', model: 'deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B', icon: '🟢' },
  { provider: 'groq', model: 'mistral-saba-24b', label: 'Mistral Saba 24B', icon: '🟠' },
  { provider: 'groq', model: 'compound-beta', label: 'Compound Beta', icon: '⚫' },
]

const VOICE_PROVIDERS = [
  { id: '11labs', label: '11labs', icon: '||' },
  { id: 'openai', label: 'OpenAI', icon: '◯' },
  { id: 'playht', label: 'PlayHT', icon: '▶' },
]

const VOICES_BY_PROVIDER = {
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
  'openai': [
    { voiceId: 'alloy', name: 'Alloy' },
    { voiceId: 'echo', name: 'Echo' },
    { voiceId: 'fable', name: 'Fable' },
    { voiceId: 'onyx', name: 'Onyx' },
    { voiceId: 'nova', name: 'Nova' },
    { voiceId: 'shimmer', name: 'Shimmer' },
  ],
  'playht': [
    { voiceId: 'jennifer', name: 'Jennifer' },
    { voiceId: 'melissa', name: 'Melissa' },
    { voiceId: 'will', name: 'Will' },
    { voiceId: 'chris', name: 'Chris' },
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
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [name, setName] = useState('')
  const [language, setLanguage] = useState('en')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [modelProvider, setModelProvider] = useState('groq')
  const [modelName, setModelName] = useState('llama-3.3-70b-versatile')
  const [voiceProvider, setVoiceProvider] = useState('11labs')
  const [voiceId, setVoiceId] = useState('pFZP5JQG7iQjIQuC4Bku')
  const [addVoiceManually, setAddVoiceManually] = useState(false)
  const [customVoiceId, setCustomVoiceId] = useState('')

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
        config: {
          systemPrompt: finalSystemPrompt,
          systemPromptBase: systemPrompt, // Store original prompt without calendar instructions
          firstMessage,
          language,
          modelProvider,
          modelName,
          voiceProvider,
          voiceId: finalVoiceId,
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

          {/* Language & AI Model Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div>
              <label className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-400 mb-2">
                AI Model
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </label>
              <div className="relative">
                <label className="absolute -top-2 left-3 px-1 bg-white dark:bg-dark-card text-xs text-gray-500">Select AI Model</label>
                <select
                  value={`${modelProvider}:${modelName}`}
                  onChange={(e) => {
                    const [provider, model] = e.target.value.split(':')
                    setModelProvider(provider)
                    setModelName(model)
                  }}
                  className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  {LLM_MODELS.map(m => (
                    <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
                      {m.icon} {m.label}
                    </option>
                  ))}
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
                      {provider.icon} {provider.label}
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
            <label className="text-sm text-gray-600 dark:text-gray-400 mb-2 block">Prompt</label>
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
              <button onClick={() => { setShowToolModal(false); resetToolForm(); }} className="text-gray-500 hover:text-gray-700">
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
                onClick={() => { setShowToolModal(false); resetToolForm(); }}
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
    </div>
  )
}
