import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chatbotsAPI, promptGeneratorAPI, calendarAPI, agentsAPI, phoneNumbersAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { MODELS_BY_PROVIDER } from '../../constants/models'
import TestChatbotModal from './TestChatbotModal'

const CHATBOT_MODELS = MODELS_BY_PROVIDER['openai'].filter(m => m.model.startsWith('gpt-'))

const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'America/Anchorage', 'Pacific/Honolulu', 'America/Phoenix',
  'America/Toronto', 'America/Vancouver', 'America/Mexico_City',
  'America/Bogota', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Rome',
  'Asia/Dubai', 'Asia/Kolkata', 'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'Australia/Sydney', 'Pacific/Auckland'
]

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

export default function ChatbotEdit() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [chatbot, setChatbot] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Form fields
  const [name, setName] = useState('')
  const [chatbotType, setChatbotType] = useState('standard')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [modelName, setModelName] = useState('gpt-4o')

  // Output configuration
  const [outputUrl, setOutputUrl] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Tools
  const [tools, setTools] = useState([])
  const [showToolsModal, setShowToolsModal] = useState(false)
  const [showToolEditModal, setShowToolEditModal] = useState(false)
  const [editingToolIndex, setEditingToolIndex] = useState(null)
  const [toolForm, setToolForm] = useState({
    type: 'apiRequest',
    name: '',
    description: '',
    method: 'POST',
    url: '',
    headers: '',
    body: '',
    timeoutSeconds: 20
  })

  // Prompt generator
  const [showPromptGenerator, setShowPromptGenerator] = useState(false)
  const [promptDescription, setPromptDescription] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')

  // Model modal
  const [showModelModal, setShowModelModal] = useState(false)

  // Test chatbot modal
  const [showTestModal, setShowTestModal] = useState(false)

  // Collapsible sections
  const [expandedSection, setExpandedSection] = useState(null)

  const toggleSection = (section) => {
    setExpandedSection(prev => prev === section ? null : section)
  }

  // Webhook variables
  const [variables, setVariables] = useState([])
  const [newVarName, setNewVarName] = useState('')
  const [newVarDefault, setNewVarDefault] = useState('')

  // Call tool settings
  const [showCallModal, setShowCallModal] = useState(false)
  const [callConfig, setCallConfig] = useState({ enabled: false, agentId: '', phoneNumberId: '' })
  const [agentsList, setAgentsList] = useState([])
  const [phoneNumbersList, setPhoneNumbersList] = useState([])

  // Calendar settings
  const [showCalendarModal, setShowCalendarModal] = useState(false)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [calendarConfig, setCalendarConfig] = useState({
    enabled: false,
    provider: '',
    integrationId: '',
    calendarId: '',
    timezone: 'America/New_York',
    appointmentDuration: 30,
    calendars: []
  })
  const [calendarIntegrations, setCalendarIntegrations] = useState([])
  const [providerCalendars, setProviderCalendars] = useState([])
  const [providerCalendarsLoading, setProviderCalendarsLoading] = useState(false)
  const [providerError, setProviderError] = useState('')
  const [providerCalendarsMap, setProviderCalendarsMap] = useState({})
  const [expandedCalendarEntry, setExpandedCalendarEntry] = useState(null)

  // Load chatbot data
  useEffect(() => {
    fetchChatbot()
    fetchCalendarIntegrations()
    fetchAgents()
    fetchPhoneNumbers()
  }, [id])

  const fetchAgents = async () => {
    try {
      const { data } = await agentsAPI.list()
      setAgentsList(data.agents || [])
    } catch (err) {
      console.error('Failed to fetch agents:', err)
    }
  }

  const fetchPhoneNumbers = async () => {
    try {
      const { data } = await phoneNumbersAPI.list()
      setPhoneNumbersList(data.phoneNumbers || [])
    } catch (err) {
      console.error('Failed to fetch phone numbers:', err)
    }
  }

  const fetchChatbot = async () => {
    try {
      setLoading(true)
      const { data } = await chatbotsAPI.get(id)
      const cb = data.chatbot
      setChatbot(cb)

      setName(cb.name || '')
      setChatbotType(cb.chatbotType || 'standard')
      setOutputUrl(cb.outputUrl || '')
      setIsActive(cb.isActive !== false)

      const config = cb.config || {}
      setSystemPrompt(config.systemPromptBase || config.systemPrompt || '')
      setModelName(config.modelName || 'gpt-4o')
      setTools(config.tools || [])

      setVariables(config.variables || [])

      if (config.calendarConfig) {
        setCalendarConfig(config.calendarConfig)
      }
      if (config.callConfig) {
        setCallConfig(config.callConfig)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load chatbot')
    } finally {
      setLoading(false)
    }
  }

  // Calendar functions
  const fetchCalendarIntegrations = async () => {
    try {
      const response = await calendarAPI.listIntegrations()
      setCalendarIntegrations(response.data.integrations || [])
    } catch (err) {
      console.error('Failed to fetch calendar integrations:', err)
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

  const handleOpenCalendarModal = () => {
    setShowCalendarModal(true)
    if (calendarConfig.calendars && calendarConfig.calendars.length >= 2) {
      calendarConfig.calendars.forEach(entry => {
        if (entry.integrationId) {
          fetchCalendarsForEntry(entry.id, entry.integrationId)
        }
      })
    } else if (calendarConfig.integrationId) {
      fetchProviderCalendars(calendarConfig.integrationId)
    }
  }

  const getActiveCalendars = () => {
    if (calendarConfig.calendars && calendarConfig.calendars.length >= 2) {
      return calendarConfig.calendars
    }
    return [{
      id: 'single',
      name: '',
      scenario: '',
      provider: calendarConfig.provider,
      integrationId: calendarConfig.integrationId,
      calendarId: calendarConfig.calendarId,
      timezone: calendarConfig.timezone,
      appointmentDuration: calendarConfig.appointmentDuration,
      appointmentTitle: calendarConfig.appointmentTitle
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

  const addCalendarEntry = () => {
    const newId = `cal_${Date.now()}`
    if (!calendarConfig.calendars || calendarConfig.calendars.length < 2) {
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
      if (providerCalendars.length > 0) {
        setProviderCalendarsMap(prev => ({
          ...prev,
          [firstEntry.id]: { calendars: providerCalendars, loading: false, error: '' }
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

  // Build calendar tools for saving
  const buildCalendarTools = () => {
    const calendarTools = []
    const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    const safeName = name.replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')

    if (calendarConfig.enabled) {
      const activeCalendars = getActiveCalendars().filter(c => c.calendarId)
      const isMultiCalendar = activeCalendars.length >= 2

      activeCalendars.forEach((cal, idx) => {
        const queryParamsObj = {
          calendarId: cal.calendarId,
          timezone: cal.timezone || 'America/New_York',
          userId: user?.id?.toString() || '',
          duration: (cal.appointmentDuration || 30).toString(),
          provider: cal.provider
        }
        if (cal.integrationId) {
          queryParamsObj.integrationId = cal.integrationId
        }
        if (cal.appointmentTitle) {
          queryParamsObj.title = cal.appointmentTitle
        }

        const queryParams = new URLSearchParams(queryParamsObj).toString()
        const checkUrl = `${apiBaseUrl}/calendar/check-availability?${queryParams}`
        const bookUrl = `${apiBaseUrl}/calendar/book-appointment?${queryParams}`

        const toolSuffix = isMultiCalendar ? `${safeName}_${idx + 1}` : safeName
        const descPrefix = isMultiCalendar && cal.name ? `[${cal.name}] ` : ''

        calendarTools.push({
          type: 'apiRequest',
          method: 'POST',
          url: checkUrl,
          name: `check_calendar_availability_${toolSuffix}`,
          description: `${descPrefix}Check available appointment slots on a specific date. You MUST call this BEFORE booking to see what times are open.`,
          body: {
            type: 'object',
            properties: {
              date: { type: 'string', description: 'The date to check availability for in YYYY-MM-DD format' }
            },
            required: ['date']
          },
          timeoutSeconds: 30
        })

        calendarTools.push({
          type: 'apiRequest',
          method: 'POST',
          url: bookUrl,
          name: `book_appointment_${toolSuffix}`,
          description: `${descPrefix}Book an appointment for the customer. Use this after confirming the date, time, and collecting customer contact information.`,
          body: {
            type: 'object',
            properties: {
              startTime: { type: 'string', description: 'The appointment start time in ISO 8601 format (e.g., 2026-02-08T10:00:00)' },
              endTime: { type: 'string', description: 'The appointment end time in ISO 8601 format. Defaults to duration after startTime if not provided.' },
              contactName: { type: 'string', description: "The customer's full name" },
              contactEmail: { type: 'string', description: "The customer's email address" },
              contactPhone: { type: 'string', description: "The customer's phone number (optional)" },
              notes: { type: 'string', description: 'Any additional notes for the appointment (optional)' }
            },
            required: ['startTime', 'contactName', 'contactEmail']
          },
          timeoutSeconds: 30
        })
      })
    }
    return calendarTools
  }

  // Build call tools for saving
  const buildCallTools = () => {
    const callTools = []
    if (!callConfig.enabled || !callConfig.agentId) return callTools

    const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    const qp = {
      userId: user?.id?.toString() || '',
      agentId: callConfig.agentId
    }
    if (callConfig.phoneNumberId) {
      qp.phoneNumberId = callConfig.phoneNumberId
    }
    const queryParams = new URLSearchParams(qp).toString()

    callTools.push({
      type: 'apiRequest',
      method: 'POST',
      url: `${apiBaseUrl}/chatbot-call/trigger?${queryParams}`,
      name: 'make_call_now',
      description: 'Make an outbound phone call to the customer right now using an AI voice agent. Use this when the customer wants to speak with someone immediately.',
      body: {
        type: 'object',
        properties: {
          customerNumber: { type: 'string', description: "The customer's phone number in E.164 format (e.g., +1234567890)" }
        },
        required: ['customerNumber']
      },
      timeoutSeconds: 30
    })

    callTools.push({
      type: 'apiRequest',
      method: 'POST',
      url: `${apiBaseUrl}/chatbot-call/schedule?${queryParams}`,
      name: 'schedule_call_later',
      description: 'Schedule a phone call for a future date/time. Use this when the customer wants to be called back later.',
      body: {
        type: 'object',
        properties: {
          customerNumber: { type: 'string', description: "The customer's phone number in E.164 format (e.g., +1234567890)" },
          callbackTime: { type: 'string', description: 'When to make the call in ISO 8601 format (e.g., 2026-03-18T14:00:00)' },
          reason: { type: 'string', description: 'Always set this to "Requested by user"' }
        },
        required: ['customerNumber', 'callbackTime', 'reason']
      },
      timeoutSeconds: 30
    })

    return callTools
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Merge manual tools with auto-generated calendar + call tools
      const calendarTools = buildCalendarTools()
      const callTools = buildCallTools()
      // Filter out old auto-generated tools from manual tools list
      const manualTools = tools.filter(t =>
        !t.name?.startsWith('check_calendar_availability_') &&
        !t.name?.startsWith('book_appointment_') &&
        t.name !== 'make_call_now' &&
        t.name !== 'schedule_call_later'
      )
      const allTools = [...manualTools, ...calendarTools, ...callTools]

      await chatbotsAPI.update(id, {
        name,
        chatbotType,
        outputType: 'respond_to_webhook',
        outputUrl: outputUrl || '',
        config: {
          systemPrompt,
          systemPromptBase: systemPrompt,
          modelProvider: 'openai',
          modelName,
          tools: allTools,
          variables,
          calendarConfig,
          callConfig,
          outputType: 'respond_to_webhook',
          outputUrl: outputUrl || '',
        }
      })

      setSuccess('Chatbot saved successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save chatbot')
    } finally {
      setSaving(false)
    }
  }

  const handleToggle = async () => {
    try {
      const { data } = await chatbotsAPI.toggle(id)
      setIsActive(data.chatbot.isActive)
      setSuccess(`Chatbot ${data.chatbot.isActive ? 'activated' : 'deactivated'}`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to toggle chatbot')
    }
  }

  // Prompt generator
  const handleGeneratePrompt = async () => {
    if (!promptDescription.trim()) return
    setGeneratingPrompt(true)
    try {
      const { data } = await promptGeneratorAPI.generate({
        description: promptDescription,
        direction: 'chatbot'
      })
      setGeneratedPrompt(data.systemPrompt || '')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate prompt')
    } finally {
      setGeneratingPrompt(false)
    }
  }

  // Tool management
  const handleSaveTool = () => {
    const newTool = {
      type: toolForm.type,
      name: toolForm.name,
      description: toolForm.description,
      method: toolForm.method,
      url: toolForm.url,
      timeoutSeconds: toolForm.timeoutSeconds
    }
    if (toolForm.headers) {
      try { newTool.headers = JSON.parse(toolForm.headers) } catch {}
    }
    if (toolForm.body) {
      try { newTool.body = JSON.parse(toolForm.body) } catch {}
    }

    if (editingToolIndex !== null) {
      const updated = [...tools]
      updated[editingToolIndex] = newTool
      setTools(updated)
    } else {
      setTools([...tools, newTool])
    }
    setShowToolEditModal(false)
    setEditingToolIndex(null)
    setToolForm({ type: 'apiRequest', name: '', description: '', method: 'POST', url: '', headers: '', body: '', timeoutSeconds: 20 })
  }

  const handleEditTool = (index) => {
    const tool = tools[index]
    setToolForm({
      type: tool.type || 'apiRequest',
      name: tool.name || '',
      description: tool.description || '',
      method: tool.method || 'POST',
      url: tool.url || '',
      headers: tool.headers ? JSON.stringify(tool.headers, null, 2) : '',
      body: tool.body ? JSON.stringify(tool.body, null, 2) : '',
      timeoutSeconds: tool.timeoutSeconds || 20
    })
    setEditingToolIndex(index)
    setShowToolEditModal(true)
  }

  const handleDeleteTool = (index) => {
    setTools(tools.filter((_, i) => i !== index))
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!chatbot) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Chatbot not found</p>
        <button onClick={() => navigate('/dashboard/chatbots')} className="mt-4 text-primary-600 hover:text-primary-700">
          Back to Chatbots
        </button>
      </div>
    )
  }

  // Count configured calendars
  const configuredCalendars = calendarConfig.enabled
    ? getActiveCalendars().filter(c => c.calendarId).length
    : 0

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/dashboard/chatbots')}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-2xl font-bold text-gray-900 dark:text-white bg-transparent border-none outline-none focus:ring-0 p-0"
              placeholder="Chatbot name"
            />
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400'}`}>
                {isActive ? 'Active' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowTestModal(true)}
            className="px-3 py-2 text-sm font-medium rounded-lg transition-colors text-cyan-600 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 flex items-center gap-1.5"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
            Test
          </button>
          <button
            onClick={handleToggle}
            className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isActive ? 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 hover:bg-orange-100' : 'text-green-600 bg-green-50 dark:bg-green-900/20 hover:bg-green-100'}`}
          >
            {isActive ? 'Deactivate' : 'Activate'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm mb-4">
          {success}
        </div>
      )}

      <div className="space-y-6">
        {/* Icon Button Grid */}
        <div className="grid grid-cols-4 gap-4">
          {/* Model Button */}
          <button
            onClick={() => setShowModelModal(true)}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Model
            </span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-full">{CHATBOT_MODELS.find(m => m.model === modelName)?.label || modelName}</span>
          </button>

          {/* Calendar Button */}
          <button
            onClick={handleOpenCalendarModal}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
              calendarConfig.enabled && configuredCalendars > 0
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Calendar {calendarConfig.enabled && configuredCalendars > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold rounded-full bg-green-500 text-white">{configuredCalendars}</span>
              )}
            </span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Call Button */}
          <button
            onClick={() => setShowCallModal(true)}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
              callConfig.enabled && callConfig.agentId
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Call {callConfig.enabled && callConfig.agentId && (
                <span className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold rounded-full bg-green-500 text-white">2</span>
              )}
            </span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </button>

          {/* Tools Button */}
          <button
            onClick={() => setShowToolsModal(true)}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
              tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later').length > 0
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Tools {tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later').length > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold rounded-full bg-green-500 text-white">{tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later').length}</span>
              )}
            </span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Collapsible Sections */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden divide-y divide-gray-200 dark:divide-dark-border">

          {/* Webhook URL Section */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('webhook')}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
            >
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedSection === 'webhook' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">Webhook URL</span>
              <span className="text-xs text-green-600 dark:text-green-400 font-medium">Ready</span>
            </button>
            {expandedSection === 'webhook' && (() => {
              const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
              const webhookUrl = `${apiBaseUrl}/chatbots/${id}/webhook`
              const curlExample = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": "Hello!",
    "sessionId": "user-123"${variables.length > 0 ? `,
    "variables": {
${variables.map(v => `      "${v.name}": "${v.defaultValue || ''}"`).join(',\n')}
    }` : ''}
  }'`

              return (
                <div className="px-5 pb-4 space-y-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Send a POST request to this endpoint to interact with your chatbot.</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={webhookUrl}
                      readOnly
                      className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-700 dark:text-gray-300 text-sm font-mono"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(webhookUrl)
                        setSuccess('Webhook URL copied!')
                        setTimeout(() => setSuccess(''), 2000)
                      }}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-600 dark:text-gray-300 text-sm flex-shrink-0"
                      title="Copy URL"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">cURL Example</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(curlExample)
                          setSuccess('cURL copied!')
                          setTimeout(() => setSuccess(''), 2000)
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="px-3 py-3 rounded-lg bg-gray-900 text-green-400 text-xs font-mono overflow-x-auto whitespace-pre">{curlExample}</pre>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
                    <p><strong className="text-gray-500 dark:text-gray-400">message</strong> (required) — The user's message</p>
                    <p><strong className="text-gray-500 dark:text-gray-400">sessionId</strong> (optional) — Unique session ID for conversation memory</p>
                    {variables.length > 0 && (
                      <p><strong className="text-gray-500 dark:text-gray-400">variables</strong> (optional) — Dynamic variables to inject into the prompt</p>
                    )}
                  </div>
                </div>
              )
            })()}
            )}
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
              <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">Variables</span>
              {variables.length > 0 && (
                <span className="inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-green-500 text-white">{variables.length}</span>
              )}
            </button>
            {expandedSection === 'variables' && (
              <div className="px-5 pb-4 space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Define variables that can be passed via the webhook and used as placeholders in the system prompt with <code className="px-1 py-0.5 bg-gray-100 dark:bg-dark-bg rounded text-[11px]">{'{{variableName}}'}</code> syntax.</p>
                {variables.length > 0 && (
                  <div className="space-y-2">
                    {variables.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 p-2.5 bg-gray-50 dark:bg-dark-bg rounded-lg">
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-900 dark:text-white font-mono">{`{{${v.name}}}`}</span>
                          {v.defaultValue && (
                            <span className="text-xs text-gray-400 ml-2">default: {v.defaultValue}</span>
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
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Name</label>
                    <input
                      type="text"
                      value={newVarName}
                      onChange={(e) => setNewVarName(e.target.value)}
                      placeholder="e.g. customerName"
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Default value</label>
                    <input
                      type="text"
                      value={newVarDefault}
                      onChange={(e) => setNewVarDefault(e.target.value)}
                      placeholder="optional"
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
                    Add
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Webhook Forwarding Section */}
          <div>
            <button
              type="button"
              onClick={() => toggleSection('forwarding')}
              className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
            >
              <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedSection === 'forwarding' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <svg className="w-5 h-5 text-gray-500 dark:text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">Webhook Forwarding</span>
              {outputUrl ? (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">Active</span>
              ) : (
                <span className="text-xs text-gray-400">Not set</span>
              )}
            </button>
            {expandedSection === 'forwarding' && (
              <div className="px-5 pb-4 space-y-3">
                <p className="text-xs text-gray-500 dark:text-gray-400">Forward the chatbot's response to an external webhook URL. The response will be sent as a POST request to this URL.</p>
                <input
                  type="url"
                  value={outputUrl}
                  onChange={(e) => setOutputUrl(e.target.value)}
                  placeholder="https://your-webhook-url.com/endpoint"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
                {outputUrl && (
                  <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Responses will be forwarded to this URL
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

        {/* System Prompt */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">System Prompt</h3>
            <button
              onClick={() => setShowPromptGenerator(true)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
            >
              Generate with AI
            </button>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder="You are a helpful customer support chatbot..."
            rows={20}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">{systemPrompt.length} characters</p>
          {variables.length > 0 && (
            <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                Available placeholders: {variables.map(v => (
                  <code key={v.name} className="mx-0.5 px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-[11px] font-mono">{`{{${v.name}}}`}</code>
                ))}
              </p>
            </div>
          )}
        </div>

      </div>

      {/* ===== MODEL MODAL ===== */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-sm">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Model</h3>
              <button onClick={() => setShowModelModal(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-1">
              {CHATBOT_MODELS.map(m => (
                <button
                  key={m.model}
                  onClick={() => { setModelName(m.model); setShowModelModal(false) }}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-lg text-left transition-colors ${
                    modelName === m.model
                      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-500'
                      : 'hover:bg-gray-50 dark:hover:bg-dark-hover border border-transparent'
                  }`}
                >
                  <span className={`text-sm font-medium ${modelName === m.model ? 'text-primary-700 dark:text-primary-400' : 'text-gray-900 dark:text-white'}`}>
                    {m.label}
                  </span>
                  {modelName === m.model && (
                    <svg className="w-4 h-4 text-primary-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ===== CALENDAR MODAL ===== */}
      {showCalendarModal && (() => {
        const connectedAccounts = []
        calendarIntegrations.filter(i => i.isConnected).forEach(i => {
          connectedAccounts.push({
            key: `${i.provider}:${i.id}`,
            provider: i.provider,
            integrationId: String(i.id),
            icon: PROVIDER_ICONS[i.provider],
            label: PROVIDER_NAMES[i.provider] || i.provider,
            sublabel: i.accountLabel || '',
            connected: true
          })
        })
        const connectedProviderSet = new Set(connectedAccounts.map(a => a.provider))
        const allProviders = ['ghl', 'google', 'calendly', 'hubspot', 'calcom']
        const notConnectedProviders = allProviders.filter(p => !connectedProviderSet.has(p))
        const isMultiCalendarMode = calendarConfig.calendars && calendarConfig.calendars.length >= 2

        const renderProviderDropdown = (currentProvider, currentIntegrationId, onSelect, dropdownId) => {
          const currentKey = currentIntegrationId ? `${currentProvider}:${currentIntegrationId}` : ''
          const currentAccount = connectedAccounts.find(a => a.key === currentKey)
          const currentNotConnected = !currentAccount && currentProvider ? (notConnectedProviders.includes(currentProvider) ? currentProvider : null) : null

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

        const renderCalendarDropdown = (entryProvider, entryIntegrationId, entryCalendarId, entryTimezone, onCalendarSelect, entryId) => {
          if (!entryProvider || !entryIntegrationId) return null
          const isConnected = connectedProviderSet.has(entryProvider)
          if (!isConnected) return null

          let calendars, ldg, err
          if (isMultiCalendarMode && entryId !== 'single') {
            const mapData = providerCalendarsMap[entryId]
            calendars = mapData?.calendars || []; ldg = mapData?.loading || false; err = mapData?.error || ''
          } else {
            calendars = providerCalendars; ldg = providerCalendarsLoading; err = providerError
          }

          return (
            <div>
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Calendar *</label>
              {err && (
                <div className="p-2 mb-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">{err}</p>
                </div>
              )}
              {ldg ? (
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
                <div className="text-sm text-gray-500 py-2">No calendars found for this account.</div>
              )}
            </div>
          )
        }

        const renderNotConnectedWarning = (entryProvider, entryIntegrationId) => {
          if (!entryProvider) return null
          const isConnected = entryIntegrationId || connectedProviderSet.has(entryProvider)
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
                onClick={() => { setShowCalendarModal(false); navigate('/dashboard/settings?tab=calendars') }}
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
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Calendar Integration</label>
                  <button
                    onClick={() => setCalendarConfig({ ...calendarConfig, enabled: !calendarConfig.enabled })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${calendarConfig.enabled ? 'bg-green-600' : 'bg-gray-300'}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${calendarConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                  </button>
                </div>

                {calendarConfig.enabled && (
                  <>
                    {/* Single calendar mode */}
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
                              if (integrationId) {
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
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Appointment Title</label>
                              <input
                                type="text"
                                value={calendarConfig.appointmentTitle || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, appointmentTitle: e.target.value })}
                                placeholder="e.g., {{contactName}} - Consultation"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Variables: {'{{contactName}}'}, {'{{contactEmail}}'}, {'{{contactPhone}}'}</p>
                            </div>
                          </>
                        )}

                        {calendarConfig.provider === 'ghl' && calendarConfig.calendarId && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">GHL Test Contact ID</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactId || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactId: e.target.value })}
                                placeholder="e.g., abc123DEFxyz..."
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">GHL Contact ID used when testing. In production, the session ID is used as the contact ID.</p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">GHL Test Contact Name</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactName || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactName: e.target.value })}
                                placeholder="e.g., John Doe"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Contact name used when testing the chatbot.</p>
                            </div>
                          </>
                        )}

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

                    {/* Multi calendar mode */}
                    {isMultiCalendarMode && (
                      <div className="border-t border-gray-200 dark:border-dark-border pt-4 space-y-4">
                        {calendarConfig.calendars.map((entry, idx) => {
                          const isExpanded = expandedCalendarEntry === entry.id
                          const providerLabel = PROVIDER_NAMES[entry.provider] || ''
                          const subtitle = entry.name || `Calendar ${idx + 1}`

                          return (
                            <div key={entry.id} className="border border-gray-200 dark:border-dark-border rounded-lg overflow-hidden">
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
                                  {providerLabel && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{providerLabel}</span>}
                                </div>
                                {entry.calendarId && <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />}
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); removeCalendarEntry(entry.id) }}
                                  className="p-1 text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </button>

                              {isExpanded && (
                                <div className="p-4 space-y-3 border-t border-gray-200 dark:border-dark-border">
                                  <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Name *</label>
                                    <input
                                      type="text"
                                      value={entry.name}
                                      onChange={(e) => updateCalendarEntry(entry.id, { name: e.target.value })}
                                      placeholder="e.g., {{contactName}} - Consultation"
                                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                    />
                                  </div>
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
                                  <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Provider *</label>
                                    {renderProviderDropdown(
                                      entry.provider,
                                      entry.integrationId,
                                      (provider, integrationId) => {
                                        updateCalendarEntry(entry.id, { provider, integrationId, calendarId: '' })
                                        if (integrationId) {
                                          fetchCalendarsForEntry(entry.id, integrationId)
                                        }
                                      },
                                      `multi-${entry.id}`
                                    )}
                                  </div>

                                  {renderNotConnectedWarning(entry.provider, entry.integrationId)}

                                  {renderCalendarDropdown(
                                    entry.provider,
                                    entry.integrationId,
                                    entry.calendarId,
                                    entry.timezone,
                                    (calendarId, timezone) => updateCalendarEntry(entry.id, { calendarId, timezone }),
                                    entry.id
                                  )}

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
                                      <div>
                                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Appointment Title</label>
                                        <input
                                          type="text"
                                          value={entry.appointmentTitle || ''}
                                          onChange={(e) => updateCalendarEntry(entry.id, { appointmentTitle: e.target.value })}
                                          placeholder="e.g., {{contactName}} - Consultation"
                                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Variables: {'{{contactName}}'}, {'{{contactEmail}}'}, {'{{contactPhone}}'}</p>
                                      </div>
                                    </>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}

                        <button
                          type="button"
                          onClick={addCalendarEntry}
                          className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                        >
                          + Add Calendar
                        </button>

                        {calendarConfig.calendars.some(c => c.provider === 'ghl' && c.calendarId) && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">GHL Test Contact ID</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactId || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactId: e.target.value })}
                                placeholder="e.g., abc123DEFxyz..."
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">GHL Contact ID used when testing. In production, the session ID is used as the contact ID.</p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">GHL Test Contact Name</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactName || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactName: e.target.value })}
                                placeholder="e.g., John Doe"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Contact name used when testing the chatbot.</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ===== CALL TOOL MODAL ===== */}
      {showCallModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg">
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Call Tool</h3>
              <button onClick={() => setShowCallModal(false)} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 space-y-4">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable Call Tool</label>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Allow the chatbot to trigger outbound voice calls using an AI agent.</p>
                </div>
                <button
                  onClick={() => setCallConfig({ ...callConfig, enabled: !callConfig.enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${callConfig.enabled ? 'bg-green-600' : 'bg-gray-300'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${callConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              {callConfig.enabled && (
                <>
                  {/* Info note */}
                  <div className="flex items-start gap-2.5 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <svg className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      When enabled, two tools are auto-generated: <strong>make_call_now</strong> (immediate call) and <strong>schedule_call_later</strong> (scheduled callback). The AI decides which to use based on the conversation.
                    </p>
                  </div>

                  {/* Agent dropdown */}
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Voice Agent *</label>
                    <select
                      value={callConfig.agentId}
                      onChange={(e) => setCallConfig({ ...callConfig, agentId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    >
                      <option value="">Select an agent...</option>
                      {agentsList.map(agent => (
                        <option key={agent.id} value={agent.id}>{agent.name}{agent.vapiId ? '' : ' (not synced)'}</option>
                      ))}
                    </select>
                  </div>

                  {/* Phone number dropdown */}
                  <div>
                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">Phone Number *</label>
                    <select
                      value={callConfig.phoneNumberId}
                      onChange={(e) => setCallConfig({ ...callConfig, phoneNumberId: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                    >
                      <option value="">Select a phone number...</option>
                      {phoneNumbersList.map(pn => (
                        <option key={pn.id} value={pn.id}>{pn.phoneNumber}{pn.label ? ` (${pn.label})` : ''}</option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">This phone number will be used as the caller ID for outbound calls.</p>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowCallModal(false)}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOOLS MODAL ===== */}
      {showToolsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-dark-card flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border z-10">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Tools</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setToolForm({ type: 'apiRequest', name: '', description: '', method: 'POST', url: '', headers: '', body: '', timeoutSeconds: 20 })
                    setEditingToolIndex(null)
                    setShowToolEditModal(true)
                  }}
                  className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                >
                  + Add Tool
                </button>
                <button onClick={() => setShowToolsModal(false)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <div className="p-4">
              {(() => {
                const visibleTools = tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later')
                return visibleTools.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No tools configured. Add API request tools for your chatbot to call.</p>
                ) : (
                  <div className="space-y-2">
                    {visibleTools.map((tool) => {
                      const realIndex = tools.indexOf(tool)
                      return (
                        <div key={realIndex} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg rounded-lg">
                          <div className="min-w-0 flex-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-white">{tool.name || tool.type}</span>
                            <span className="text-xs text-gray-400 ml-2">{tool.method} {tool.url?.substring(0, 30)}{tool.url?.length > 30 ? '...' : ''}</span>
                          </div>
                          <div className="flex gap-1 flex-shrink-0">
                            <button onClick={() => handleEditTool(realIndex)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                              </svg>
                            </button>
                            <button onClick={() => handleDeleteTool(realIndex)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
            <div className="flex justify-end p-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowToolsModal(false)}
                className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Add/Edit Modal */}
      {showToolEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingToolIndex !== null ? 'Edit Tool' : 'Add Tool'}
              </h3>
              <button onClick={() => setShowToolEditModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={toolForm.name}
                  onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })}
                  placeholder="get_weather"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description</label>
                <input
                  type="text"
                  value={toolForm.description}
                  onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })}
                  placeholder="What this tool does"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Method</label>
                  <select
                    value={toolForm.method}
                    onChange={(e) => setToolForm({ ...toolForm, method: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  >
                    <option value="GET">GET</option>
                    <option value="POST">POST</option>
                    <option value="PUT">PUT</option>
                    <option value="DELETE">DELETE</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">URL</label>
                  <input
                    type="url"
                    value={toolForm.url}
                    onChange={(e) => setToolForm({ ...toolForm, url: e.target.value })}
                    placeholder="https://api.example.com/endpoint"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Body (JSON Schema)</label>
                <textarea
                  value={toolForm.body}
                  onChange={(e) => setToolForm({ ...toolForm, body: e.target.value })}
                  placeholder='{"type":"object","properties":{"query":{"type":"string"}}}'
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono resize-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowToolEditModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveTool}
                  disabled={!toolForm.name || !toolForm.url}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {editingToolIndex !== null ? 'Update' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Test Chatbot Modal */}
      {showTestModal && (
        <TestChatbotModal
          chatbot={{ id, name, config: { modelName, systemPrompt } }}
          onClose={() => setShowTestModal(false)}
        />
      )}

      {/* Prompt Generator Modal */}
      {showPromptGenerator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-3xl max-h-[90vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Generate Prompt with AI</h3>
              <button onClick={() => setShowPromptGenerator(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4">
              <textarea
                value={promptDescription}
                onChange={(e) => setPromptDescription(e.target.value)}
                placeholder="Describe what your chatbot should do. Example: A customer support chatbot for a SaaS company that helps with billing questions and password resets."
                rows={5}
                className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none text-sm"
              />
              <button
                onClick={handleGeneratePrompt}
                disabled={generatingPrompt || !promptDescription.trim()}
                className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
              >
                {generatingPrompt ? 'Generating...' : 'Generate'}
              </button>
              {generatedPrompt && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Generated System Prompt</label>
                    <textarea
                      value={generatedPrompt}
                      onChange={(e) => setGeneratedPrompt(e.target.value)}
                      rows={12}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                    />
                  </div>
                  <button
                    onClick={() => {
                      setSystemPrompt(generatedPrompt)
                      setShowPromptGenerator(false)
                      setGeneratedPrompt('')
                    }}
                    className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium"
                  >
                    Apply to Chatbot
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
