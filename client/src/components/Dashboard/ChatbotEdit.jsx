import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chatbotsAPI, promptGeneratorAPI, calendarAPI, agentsAPI, phoneNumbersAPI, googleWorkspaceAPI, ghlAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
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
  const { t } = useLanguage()

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

  // Prompt generator wizard
  const [showPromptGenerator, setShowPromptGenerator] = useState(false)
  const [generatingPrompt, setGeneratingPrompt] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [promptMode, setPromptMode] = useState('generate')
  const [updateDescription, setUpdateDescription] = useState('')
  const [updateLanguage, setUpdateLanguage] = useState('en')
  const [wizardStep, setWizardStep] = useState(1)
  const [wizBotType, setWizBotType] = useState('')
  const [wizLanguage, setWizLanguage] = useState('en')
  const [wizCompanyName, setWizCompanyName] = useState('')
  const [wizIndustry, setWizIndustry] = useState('')
  const [wizTone, setWizTone] = useState('professional')
  const [wizGoals, setWizGoals] = useState('')
  const [wizTypeConfig, setWizTypeConfig] = useState({})
  const [wizAdditionalNotes, setWizAdditionalNotes] = useState('')

  // Model modal
  const [showModelModal, setShowModelModal] = useState(false)

  // Test chatbot modal
  const [showTestModal, setShowTestModal] = useState(false)
  // Share-link modal state
  const [showShareModal, setShowShareModal] = useState(false)
  const [shareEnabled, setShareEnabled] = useState(false)
  const [shareToken, setShareToken] = useState('')
  const [shareDailyLimit, setShareDailyLimit] = useState(200)
  const [shareIpDailyLimit, setShareIpDailyLimit] = useState(30)
  const [shareSaving, setShareSaving] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [clearingMemory, setClearingMemory] = useState(false)
  const [showClearMemoryModal, setShowClearMemoryModal] = useState(false)
  const [clearMemoryScope, setClearMemoryScope] = useState('all')
  const [clearMemorySessionId, setClearMemorySessionId] = useState('')
  const [clearMemoryContactId, setClearMemoryContactId] = useState('')

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

  // Google Sheets settings
  const [sheetsConfig, setSheetsConfig] = useState({ enabled: false, integrationId: '', spreadsheetId: '', spreadsheetName: '' })
  const [sheetFiles, setSheetFiles] = useState([])
  const [sheetFilesLoading, setSheetFilesLoading] = useState(false)
  const [sheetSearch, setSheetSearch] = useState('')

  // Google Docs settings
  const [docsConfig, setDocsConfig] = useState({ enabled: false, integrationId: '', documentId: '', documentName: '' })
  const [docFiles, setDocFiles] = useState([])
  const [docFilesLoading, setDocFilesLoading] = useState(false)
  const [docSearch, setDocSearch] = useState('')

  // Follow-Up Rules
  const [bufferSeconds, setBufferSeconds] = useState(0)
  const [followUpRulesConfig, setFollowUpRulesConfig] = useState({ enabled: false, rules: [] })
  const [followUpLogs, setFollowUpLogs] = useState([])
  const [showFollowUpLogs, setShowFollowUpLogs] = useState(false)

  // Agent kind (conversational | sql_agent) + optional SQL database connection
  const [agentKind, setAgentKind] = useState('conversational')
  const [databaseConfig, setDatabaseConfig] = useState({
    type: 'postgres',
    connectionString: '',
    connectionStringPreview: '',
    hasConnectionString: false,
  })
  const [dbTestStatus, setDbTestStatus] = useState(null) // { ok: boolean, message: string, latencyMs?: number }
  const [dbTesting, setDbTesting] = useState(false)

  // Execution logs
  const [showExecutionsModal, setShowExecutionsModal] = useState(false)
  const [executionsLoading, setExecutionsLoading] = useState(false)
  const [executionsError, setExecutionsError] = useState('')
  const [executions, setExecutions] = useState([])
  const [selectedExecutionId, setSelectedExecutionId] = useState(null)
  const [selectedExecutionDetail, setSelectedExecutionDetail] = useState(null)
  const [executionDetailLoading, setExecutionDetailLoading] = useState(false)
  const [selectedNodeIdx, setSelectedNodeIdx] = useState(0)
  const [nodeDetailTab, setNodeDetailTab] = useState('output') // input | output | params | error

  // GHL CRM settings
  const [ghlCrmConfig, setGhlCrmConfig] = useState({
    createNote: false,
    updateOpportunity: false,
    opportunities: [],  // [{ pipelineId, pipelineName, stageId, stageName, scenario }]
    tagSets: [],        // [{ tags: [], scenario }]
    workflows: []       // [{ workflowId, workflowName, scenario }]
  })
  const [ghlPipelines, setGhlPipelines] = useState([])
  const [ghlTags, setGhlTags] = useState([])
  const [ghlWorkflows, setGhlWorkflows] = useState([])
  const [ghlContactCfs, setGhlContactCfs] = useState([])
  const [ghlOppCfs, setGhlOppCfs] = useState([])

  const ensureGhlContactCfsLoaded = async () => {
    if (ghlContactCfs.length) return
    try {
      const { data } = await ghlAPI.getCustomFields('contact')
      setGhlContactCfs(data.customFields || [])
    } catch (err) {
      console.error('Failed to load GHL contact custom fields:', err.response?.data?.error || err.message)
    }
  }
  const ensureGhlOppCfsLoaded = async () => {
    if (ghlOppCfs.length) return
    try {
      const { data } = await ghlAPI.getCustomFields('opportunity')
      setGhlOppCfs(data.customFields || [])
    } catch (err) {
      console.error('Failed to load GHL opportunity custom fields:', err.response?.data?.error || err.message)
    }
  }

  // Unified tools modal
  const [showUnifiedToolsModal, setShowUnifiedToolsModal] = useState(false)
  const [toolsSection, setToolsSection] = useState(null)
  const [expandedOppIdx, setExpandedOppIdx] = useState(null)
  const [expandedTagIdx, setExpandedTagIdx] = useState(null)
  const [expandedWorkflowIdx, setExpandedWorkflowIdx] = useState(null)
  const [expandedGhlSub, setExpandedGhlSub] = useState(null) // 'opp' | 'tag' | 'workflow' | null

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
      setShareEnabled(!!cb.publicShareEnabled)
      setShareToken(cb.publicShareToken || '')
      setShareDailyLimit(cb.publicShareDailyLimit || 200)
      setShareIpDailyLimit(cb.publicShareIpDailyLimit || 30)
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
      if (config.sheetsConfig) {
        setSheetsConfig(config.sheetsConfig)
      }
      if (config.docsConfig) {
        setDocsConfig(config.docsConfig)
      }
      if (config.ghlCrmConfig) {
        setGhlCrmConfig(config.ghlCrmConfig)
      }
      if (config.bufferSeconds !== undefined) {
        setBufferSeconds(config.bufferSeconds)
      }
      if (config.followUpRulesConfig) {
        setFollowUpRulesConfig(config.followUpRulesConfig)
      }
      if (config.agentKind) {
        setAgentKind(config.agentKind)
      }
      if (config.database) {
        setDatabaseConfig({
          type: config.database.type || 'postgres',
          connectionString: '',
          connectionStringPreview: config.database.connectionStringPreview || '',
          hasConnectionString: !!config.database.hasConnectionString,
        })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load chatbot')
    } finally {
      setLoading(false)
    }
  }

  const openExecutionsModal = async () => {
    setShowExecutionsModal(true)
    setExecutionsError('')
    setSelectedExecutionId(null)
    setSelectedExecutionDetail(null)
    setExecutionsLoading(true)
    try {
      const { data } = await chatbotsAPI.listExecutions(id, 20)
      setExecutions(data.executions || [])
    } catch (err) {
      setExecutionsError(err.response?.data?.error || 'Failed to load executions')
    } finally {
      setExecutionsLoading(false)
    }
  }

  const loadExecutionDetail = async (executionId) => {
    setSelectedExecutionId(executionId)
    setSelectedExecutionDetail(null)
    setSelectedNodeIdx(0)
    setNodeDetailTab('output')
    setExecutionDetailLoading(true)
    try {
      const { data } = await chatbotsAPI.getExecutionDetail(id, executionId)
      setSelectedExecutionDetail(data)
      if (data.nodes?.length) {
        // Default to the last errored node if any, otherwise the last node in the run
        const errIdx = data.nodes.findIndex(n => n.status === 'error')
        setSelectedNodeIdx(errIdx >= 0 ? errIdx : data.nodes.length - 1)
      }
    } catch (err) {
      setExecutionsError(err.response?.data?.error || 'Failed to load execution detail')
    } finally {
      setExecutionDetailLoading(false)
    }
  }

  const nodeTypeLabel = (fullType) => {
    if (!fullType) return ''
    const short = fullType.replace(/^@?[^/]+\//, '').replace(/^n8n-nodes-base\./, '')
    return short
  }

  const copyToClipboard = async (text) => {
    try { await navigator.clipboard.writeText(text) } catch {}
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

  // Build Google Sheets tools for saving
  const buildSheetsTools = () => {
    const sheetsTools = []
    if (!sheetsConfig.enabled || !sheetsConfig.integrationId) return sheetsTools

    const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    const qp = new URLSearchParams({
      userId: user?.id?.toString() || '',
      integrationId: sheetsConfig.integrationId
    }).toString()
    const base = `${apiBaseUrl}/google-workspace`
    const defaultNote = sheetsConfig.spreadsheetId
      ? ` Default spreadsheet: "${sheetsConfig.spreadsheetName}" (ID: ${sheetsConfig.spreadsheetId})`
      : ''

    sheetsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/sheets/list?${qp}`,
      name: 'list_spreadsheets',
      description: 'Search or browse Google Spreadsheets accessible to the user.',
      body: { type: 'object', properties: {
        query: { type: 'string', description: 'Optional search term to filter spreadsheets by name' }
      }},
      timeoutSeconds: 30
    })

    sheetsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/sheets/get?${qp}`,
      name: 'get_spreadsheet_info',
      description: `Get metadata for a spreadsheet including all sheet/tab names.${defaultNote}`,
      body: { type: 'object', properties: {
        spreadsheetId: { type: 'string', description: `The spreadsheet ID.${sheetsConfig.spreadsheetId ? ` Default: ${sheetsConfig.spreadsheetId}` : ''}` }
      }, required: ['spreadsheetId']},
      timeoutSeconds: 30
    })

    sheetsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/sheets/read?${qp}`,
      name: 'read_sheet_data',
      description: `Read data from a Google Sheet using A1 notation (e.g. "Sheet1!A1:D10").${defaultNote}`,
      body: { type: 'object', properties: {
        spreadsheetId: { type: 'string', description: `The spreadsheet ID.${sheetsConfig.spreadsheetId ? ` Default: ${sheetsConfig.spreadsheetId}` : ''}` },
        range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A1:D10")' }
      }, required: ['spreadsheetId', 'range']},
      timeoutSeconds: 30
    })

    sheetsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/sheets/write?${qp}`,
      name: 'write_sheet_data',
      description: `Write/overwrite data in a Google Sheet range.${defaultNote}`,
      body: { type: 'object', properties: {
        spreadsheetId: { type: 'string', description: `The spreadsheet ID.${sheetsConfig.spreadsheetId ? ` Default: ${sheetsConfig.spreadsheetId}` : ''}` },
        range: { type: 'string', description: 'A1 notation range to write to' },
        values: { type: 'array', description: 'A 2D array of values (rows of cells), e.g. [["Name","Age"],["Alice","30"]]' }
      }, required: ['spreadsheetId', 'range', 'values']},
      timeoutSeconds: 30
    })

    sheetsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/sheets/append?${qp}`,
      name: 'append_sheet_rows',
      description: `Append rows to the end of data in a Google Sheet.${defaultNote}`,
      body: { type: 'object', properties: {
        spreadsheetId: { type: 'string', description: `The spreadsheet ID.${sheetsConfig.spreadsheetId ? ` Default: ${sheetsConfig.spreadsheetId}` : ''}` },
        range: { type: 'string', description: 'A1 notation range (e.g. "Sheet1!A:E") to append under' },
        values: { type: 'array', description: 'A 2D array of rows to append, e.g. [["Alice","30"],["Bob","25"]]' }
      }, required: ['spreadsheetId', 'range', 'values']},
      timeoutSeconds: 30
    })

    sheetsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/sheets/create?${qp}`,
      name: 'create_spreadsheet',
      description: 'Create a new Google Spreadsheet.',
      body: { type: 'object', properties: {
        title: { type: 'string', description: 'Title for the new spreadsheet' }
      }, required: ['title']},
      timeoutSeconds: 30
    })

    return sheetsTools
  }

  // Build Google Docs tools for saving
  const buildDocsTools = () => {
    const docsTools = []
    if (!docsConfig.enabled || !docsConfig.integrationId) return docsTools

    const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    const qp = new URLSearchParams({
      userId: user?.id?.toString() || '',
      integrationId: docsConfig.integrationId
    }).toString()
    const base = `${apiBaseUrl}/google-workspace`
    const defaultNote = docsConfig.documentId
      ? ` Default document: "${docsConfig.documentName}" (ID: ${docsConfig.documentId})`
      : ''

    docsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/docs/list?${qp}`,
      name: 'list_google_docs',
      description: 'Search or browse Google Docs accessible to the user.',
      body: { type: 'object', properties: {
        query: { type: 'string', description: 'Optional search term to filter documents by name' }
      }},
      timeoutSeconds: 30
    })

    docsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/docs/read?${qp}`,
      name: 'read_google_doc',
      description: `Read the full text content of a Google Doc.${defaultNote}`,
      body: { type: 'object', properties: {
        documentId: { type: 'string', description: `The document ID.${docsConfig.documentId ? ` Default: ${docsConfig.documentId}` : ''}` }
      }, required: ['documentId']},
      timeoutSeconds: 30
    })

    docsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/docs/create?${qp}`,
      name: 'create_google_doc',
      description: 'Create a new Google Doc.',
      body: { type: 'object', properties: {
        title: { type: 'string', description: 'Title for the new document' }
      }, required: ['title']},
      timeoutSeconds: 30
    })

    docsTools.push({
      type: 'apiRequest', method: 'POST', url: `${base}/docs/append?${qp}`,
      name: 'append_to_google_doc',
      description: `Append text to the end of a Google Doc.${defaultNote}`,
      body: { type: 'object', properties: {
        documentId: { type: 'string', description: `The document ID.${docsConfig.documentId ? ` Default: ${docsConfig.documentId}` : ''}` },
        text: { type: 'string', description: 'Text content to append' }
      }, required: ['documentId', 'text']},
      timeoutSeconds: 30
    })

    return docsTools
  }

  // Build GHL CRM tools for saving
  const buildGhlCrmTools = () => {
    const ghlTools = []
    const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
    const qp = new URLSearchParams({ userId: user?.id?.toString() || '' }).toString()
    const base = `${apiBaseUrl}/chatbot-ghl`

    if (ghlCrmConfig.createNote) {
      ghlTools.push({
        type: 'apiRequest', method: 'POST', url: `${base}/create-note?${qp}`,
        name: 'ghl_create_note',
        description: 'Create a note on a GHL contact. Use this to log important information about a conversation or interaction.',
        body: { type: 'object', properties: {
          body: { type: 'string', description: 'The note content/text' }
        }, required: ['body'] },
        timeoutSeconds: 30
      })
    }

    // Slugify a field name into a safe AI body key. Strips the GHL "contact." /
    // "opportunity." prefix from fieldKey so we don't end up with names like
    // "contact_contact_conversation_resume". Falls back to a stable id-based slug.
    const slugifyKey = (raw, idx) => {
      const base = (raw || '')
        .toLowerCase()
        .replace(/^(contact|opportunity)\./, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
      return base || `cf_${idx}`
    }

    ;(ghlCrmConfig.opportunities || []).forEach((opp, i) => {
      const suffix = (ghlCrmConfig.opportunities.length > 1) ? `_${i + 1}` : ''
      const pNote = opp.pipelineId ? ` Pipeline: "${opp.pipelineName}" (${opp.pipelineId}).` : ''
      const sNote = opp.stageId ? ` Stage: "${opp.stageName}" (${opp.stageId}).` : ''
      const scenario = opp.scenario ? ` USE THIS WHEN: ${opp.scenario}` : ''
      const noteInstr = opp.noteInstruction ? ` ALSO CREATE A NOTE on the contact following this instruction: ${opp.noteInstruction}` : ''
      const props = {
        pipelineId: { type: 'string', description: `The pipeline ID.${opp.pipelineId ? ` Use: ${opp.pipelineId}` : ''}` },
        stageId: { type: 'string', description: `The stage ID.${opp.stageId ? ` Use: ${opp.stageId}` : ''}` },
        name: { type: 'string', description: 'Name/title for the opportunity' },
        status: { type: 'string', description: 'Status: open, won, lost, or abandoned. Defaults to open.' }
      }
      if (opp.noteInstruction) {
        props.note = { type: 'string', description: `A note to add to the contact. ${opp.noteInstruction}` }
      }

      // Build custom-field spec sent in the URL (server reads this and decides which
      // get static literals vs which read from the AI-filled body keys).
      // Body keys for AI-filled fields must be added to `required` because n8n's
      // toolHttpRequest template builder drops any non-required schema property,
      // so without this the AI would never see (let alone fill) these parameters.
      const aiInstrLines = []
      const aiBodyKeys = []
      const buildCfSpec = (entries, kind) => {
        const usedKeys = new Set()
        const spec = []
        ;(entries || []).forEach((entry, idx) => {
          if (!entry?.fieldId) return
          if (entry.mode === 'static') {
            spec.push({ id: entry.fieldId, mode: 'static', value: entry.value ?? '' })
          } else {
            let key = slugifyKey(entry.fieldKey || entry.fieldName, idx)
            let n = 2
            while (usedKeys.has(key)) { key = `${slugifyKey(entry.fieldKey || entry.fieldName, idx)}_${n++}` }
            usedKeys.add(key)
            spec.push({ id: entry.fieldId, mode: 'ai', bodyKey: key })
            const fieldLabel = entry.fieldName || entry.fieldKey || entry.fieldId
            const instr = entry.instruction ? ` ${entry.instruction}` : ''
            props[key] = {
              type: 'string',
              description: `Value for the GHL ${kind === 'opp' ? 'opportunity' : 'contact'} custom field "${fieldLabel}".${instr}`
            }
            aiBodyKeys.push(key)
            // Hoist into the top-level tool description so the AI is reminded
            // to actually fill this parameter (mirrors how noteInstruction works).
            aiInstrLines.push(
              `ALSO fill the parameter "${key}" with the value for the ${kind === 'opp' ? 'opportunity' : 'contact'} custom field "${fieldLabel}"${entry.instruction ? `: ${entry.instruction}` : '.'}`
            )
          }
        })
        return spec
      }

      const contactCfSpec = buildCfSpec(opp.contactCustomFields, 'contact')
      const oppCfSpec = buildCfSpec(opp.opportunityCustomFields, 'opp')

      const cfDesc = aiInstrLines.length ? ' ' + aiInstrLines.join(' ') : ''

      let url = `${base}/upsert-opportunity?${qp}`
      if (contactCfSpec.length) url += `&contactCf=${encodeURIComponent(JSON.stringify(contactCfSpec))}`
      if (oppCfSpec.length) url += `&oppCf=${encodeURIComponent(JSON.stringify(oppCfSpec))}`

      const required = ['pipelineId', 'stageId', 'name']
      if (opp.noteInstruction) required.push('note')
      required.push(...aiBodyKeys)

      ghlTools.push({
        type: 'apiRequest', method: 'POST', url,
        name: `ghl_manage_opportunity${suffix}`,
        description: `Manage a GHL opportunity — creates it if it doesn't exist, or updates it if it does.${pNote}${sNote}${scenario}${noteInstr}${cfDesc}`,
        body: { type: 'object', properties: props, required },
        timeoutSeconds: 30
      })
    })

    ;(ghlCrmConfig.tagSets || []).forEach((ts, i) => {
      const suffix = (ghlCrmConfig.tagSets.length > 1) ? `_${i + 1}` : ''
      const tagsNote = ts.tags?.length > 0 ? ` Tags: ${ts.tags.join(', ')}.` : ''
      const scenario = ts.scenario ? ` USE THIS WHEN: ${ts.scenario}` : ''
      ghlTools.push({
        type: 'apiRequest', method: 'POST', url: `${base}/add-tags?${qp}`,
        name: `ghl_add_tags${suffix}`,
        description: `Add tags to a GHL contact.${tagsNote}${scenario}`,
        body: { type: 'object', properties: {
          tags: { type: 'array', description: `Array of tag strings to add.${tagsNote || ' e.g. ["hot-lead"]'}` }
        }, required: ['tags'] },
        timeoutSeconds: 30
      })
    })

    ;(ghlCrmConfig.workflows || []).forEach((wf, i) => {
      const suffix = (ghlCrmConfig.workflows.length > 1) ? `_${i + 1}` : ''
      const wfNote = wf.workflowId ? ` Workflow: "${wf.workflowName}" (${wf.workflowId}).` : ''
      const scenario = wf.scenario ? ` USE THIS WHEN: ${wf.scenario}` : ''
      ghlTools.push({
        type: 'apiRequest', method: 'POST', url: `${base}/add-to-workflow?${qp}`,
        name: `ghl_add_to_workflow${suffix}`,
        description: `Add a GHL contact to an automation workflow.${wfNote}${scenario}`,
        body: { type: 'object', properties: {
          workflowId: { type: 'string', description: `The workflow ID.${wf.workflowId ? ` Use: ${wf.workflowId}` : ''}` }
        }, required: ['workflowId'] },
        timeoutSeconds: 30
      })
    })

    return ghlTools
  }

  // Fetch spreadsheets for file picker
  const fetchSpreadsheets = async (integrationId, query) => {
    if (!integrationId) return
    setSheetFilesLoading(true)
    try {
      const { data } = await googleWorkspaceAPI.listSpreadsheets(integrationId, query)
      setSheetFiles(data.files || [])
    } catch (err) {
      console.error('Failed to list spreadsheets:', err)
    } finally {
      setSheetFilesLoading(false)
    }
  }

  // Fetch documents for file picker
  const fetchDocuments = async (integrationId, query) => {
    if (!integrationId) return
    setDocFilesLoading(true)
    try {
      const { data } = await googleWorkspaceAPI.listDocuments(integrationId, query)
      setDocFiles(data.files || [])
    } catch (err) {
      console.error('Failed to list documents:', err)
    } finally {
      setDocFilesLoading(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Merge manual tools with auto-generated calendar + call + sheets + docs + GHL CRM tools
      const calendarTools = buildCalendarTools()
      const callTools = buildCallTools()
      const sheetsTools = buildSheetsTools()
      const docsTools = buildDocsTools()
      const ghlCrmTools = buildGhlCrmTools()
      // Filter out old auto-generated tools from manual tools list
      const autoNames = new Set([
        'make_call_now', 'schedule_call_later',
        'list_spreadsheets', 'get_spreadsheet_info', 'read_sheet_data',
        'write_sheet_data', 'append_sheet_rows', 'create_spreadsheet',
        'list_google_docs', 'read_google_doc', 'create_google_doc', 'append_to_google_doc',
      ])
      // Also add all generated GHL tool names
      ghlCrmTools.forEach(t => autoNames.add(t.name))
      const manualTools = tools.filter(t =>
        !t.name?.startsWith('check_calendar_availability_') &&
        !t.name?.startsWith('book_appointment_') &&
        !t.name?.startsWith('ghl_') &&
        !autoNames.has(t.name)
      )
      const allTools = [...manualTools, ...calendarTools, ...callTools, ...sheetsTools, ...docsTools, ...ghlCrmTools]

      const configPayload = {
        systemPrompt,
        systemPromptBase: systemPrompt,
        modelProvider: 'openai',
        modelName,
        tools: allTools,
        variables,
        calendarConfig,
        callConfig,
        sheetsConfig,
        docsConfig,
        ghlCrmConfig,
        followUpRulesConfig,
        bufferSeconds,
        outputType: 'respond_to_webhook',
        outputUrl: outputUrl || '',
        agentKind,
      }
      if (agentKind === 'sql_agent') {
        configPayload.database = {
          type: databaseConfig.type || 'postgres',
          connectionString: databaseConfig.connectionString || '',
        }
      }

      const { data } = await chatbotsAPI.update(id, {
        name,
        chatbotType,
        outputType: 'respond_to_webhook',
        outputUrl: outputUrl || '',
        config: configPayload
      })

      if (data.n8nWarning) {
        setError(data.n8nWarning)
      } else {
        setSuccess(t('chatbotEdit.chatbotSaved'))
      }
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
      setSuccess(data.chatbot.isActive ? t('chatbotEdit.chatbotActivated') : t('chatbotEdit.chatbotDeactivated'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to toggle chatbot')
    }
  }

  const handleSyncWorkflow = async () => {
    setSyncing(true)
    try {
      await chatbotsAPI.syncWorkflow(id)
      setSuccess('Workflow synced successfully')
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sync workflow')
    } finally {
      setSyncing(false)
    }
  }

  const openClearMemoryModal = () => {
    setClearMemoryScope('all')
    setClearMemorySessionId('')
    setClearMemoryContactId('')
    setShowClearMemoryModal(true)
  }

  const handleClearMemory = async () => {
    let body = {}
    let confirmMsg = 'Clear the conversation memory for every session of this chatbot? This cannot be undone.'
    if (clearMemoryScope === 'session') {
      const sid = clearMemorySessionId.trim()
      if (!sid) { setError('Session ID is required'); return }
      body = { sessionId: sid }
      confirmMsg = `Clear memory for session "${sid}"? This cannot be undone.`
    } else if (clearMemoryScope === 'contact') {
      const cid = clearMemoryContactId.trim()
      if (!cid) { setError('Contact ID is required'); return }
      body = { contactId: cid }
      confirmMsg = `Clear memory for contact "${cid}" (all their sessions)? This cannot be undone.`
    }
    if (!window.confirm(confirmMsg)) return

    setClearingMemory(true)
    try {
      const { data } = await chatbotsAPI.clearMemory(id, body)
      setShowClearMemoryModal(false)
      const cleared = data?.sessionsCleared ?? 0
      setSuccess(`Memory cleared (${cleared} session${cleared === 1 ? '' : 's'})`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clear memory')
    } finally {
      setClearingMemory(false)
    }
  }

  // Prompt generator
  const handleGeneratePrompt = async () => {
    if (!wizCompanyName.trim() || !wizGoals.trim() || !wizBotType) return
    setGeneratingPrompt(true)
    setGeneratedPrompt('')
    try {
      const { data } = await promptGeneratorAPI.generate({
        botType: wizBotType,
        direction: 'chatbot',
        language: wizLanguage,
        companyName: wizCompanyName,
        industry: wizIndustry,
        tone: wizTone,
        goals: wizGoals,
        typeConfig: wizTypeConfig,
        additionalNotes: wizAdditionalNotes,
      })
      setGeneratedPrompt(data.prompt || '')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate prompt')
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const handleUpdatePrompt = async () => {
    if (!updateDescription.trim() || !systemPrompt.trim()) return
    setGeneratingPrompt(true)
    setGeneratedPrompt('')
    try {
      const { data } = await promptGeneratorAPI.update({
        currentPrompt: systemPrompt,
        changeDescription: updateDescription,
        language: updateLanguage
      })
      setGeneratedPrompt(data.prompt || '')
    } catch (err) {
      setError('Failed to update prompt')
      setTimeout(() => setError(''), 3000)
    } finally {
      setGeneratingPrompt(false)
    }
  }

  const handleUseGeneratedPrompt = () => {
    setSystemPrompt(generatedPrompt)
    setShowPromptGenerator(false)
    setGeneratedPrompt('')
    setPromptMode('generate')
    resetWizard()
  }

  const resetWizard = () => {
    setWizardStep(1)
    setWizBotType('')
    setWizLanguage('en')
    setWizCompanyName('')
    setWizIndustry('')
    setWizTone('professional')
    setWizGoals('')
    setWizTypeConfig({})
    setWizAdditionalNotes('')
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
        <p className="text-gray-500 dark:text-gray-400">{t('chatbotEdit.chatbotNotFound')}</p>
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
      <div className="mb-6">
        {/* Title row */}
        <div className="flex items-start gap-3 mb-4">
          <button
            onClick={() => navigate('/dashboard/chatbots')}
            className="mt-1.5 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors"
            title={t('chatbotEdit.back') || 'Back'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-3xl font-bold tracking-tight text-gray-900 dark:text-white bg-transparent border-none outline-none focus:ring-0 p-0"
              placeholder={t('chatbotEdit.chatbotName')}
            />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-full ${isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-green-500' : 'bg-gray-400'}`} />
                {isActive ? t('chatbotEdit.active') : t('chatbotEdit.inactive')}
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${agentKind === 'sql_agent' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}`}>
                {agentKind === 'sql_agent' ? 'SQL Agent' : 'Conversational'}
              </span>
              <span className="hidden sm:inline-block w-px h-4 bg-gray-200 dark:bg-dark-border mx-1" />
              <select
                value={chatbotType}
                onChange={(e) => setChatbotType(e.target.value)}
                className="text-xs font-medium rounded-full px-3 py-1 border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card text-gray-700 dark:text-gray-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 outline-none"
              >
                <option value="standard">{t('chatbotEdit.respondToWebhook')}</option>
                <option value="ghl_sms">{t('chatbotEdit.ghlSms')}</option>
                <option value="ghl_whatsapp">{t('chatbotEdit.ghlWhatsapp')}</option>
                <option value="ghl_facebook">{t('chatbotEdit.ghlFacebook')}</option>
                <option value="ghl_instagram">{t('chatbotEdit.ghlInstagram')}</option>
              </select>
            </div>
          </div>
        </div>

        {/* Action bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white/60 dark:bg-dark-card/60 backdrop-blur-sm border border-gray-200 dark:border-dark-border rounded-2xl p-2">
          <div className="flex items-center gap-1">
            <button
              onClick={handleSyncWorkflow}
              disabled={syncing}
              title="Regenerate n8n workflow from current config"
              className="inline-flex items-center justify-center w-9 h-9 text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 rounded-xl transition-colors disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={openExecutionsModal}
              title="View recent executions and which nodes ran"
              className="inline-flex items-center justify-center w-9 h-9 text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-xl transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
            <button
              onClick={openClearMemoryModal}
              disabled={clearingMemory}
              title="Wipe conversation memory — all sessions, a single session, or all sessions for a contact"
              className="inline-flex items-center justify-center w-9 h-9 text-gray-500 dark:text-gray-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-xl transition-colors disabled:opacity-50"
            >
              <svg className={`w-4 h-4 ${clearingMemory ? 'animate-pulse' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTestModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors whitespace-nowrap"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              {t('chatbotEdit.test')}
            </button>
            <button
              onClick={() => setShowShareModal(true)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap ${shareEnabled ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/30' : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12s-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              {t('chatbotEdit.share')}
            </button>
            <button
              onClick={handleToggle}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl transition-colors whitespace-nowrap ${isActive ? 'text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover' : 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/30'}`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {isActive ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                )}
              </svg>
              {isActive ? t('chatbotEdit.deactivate') : t('chatbotEdit.activate')}
            </button>
            <span className="w-px h-7 bg-gray-200 dark:bg-dark-border mx-1" />
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
              {saving ? t('chatbotEdit.saving') : t('chatbotEdit.save')}
            </button>
          </div>
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
        {/* Icon Button Grid — 3 top-level buttons */}
        <div className="grid gap-4 grid-cols-3">
          {/* Model Button */}
          <button
            onClick={() => setShowModelModal(true)}
            className="flex flex-col items-center gap-2 p-5 rounded-xl border-2 border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600 transition-all"
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('chatbotEdit.model')}</span>
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
              {t('chatbotEdit.calendar')} {calendarConfig.enabled && configuredCalendars > 0 && (
                <span className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold rounded-full bg-green-500 text-white">{configuredCalendars}</span>
              )}
            </span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>

          {/* Tools Button */}
          <button
            onClick={() => setShowUnifiedToolsModal(true)}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${
              callConfig.enabled || sheetsConfig.enabled || docsConfig.enabled || ghlCrmConfig.createNote || (ghlCrmConfig.opportunities || []).length > 0 || (ghlCrmConfig.tagSets || []).length > 0 || (ghlCrmConfig.workflows || []).length > 0 || tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && !t.name?.startsWith('ghl_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later' && !['list_spreadsheets','get_spreadsheet_info','read_sheet_data','write_sheet_data','append_sheet_rows','create_spreadsheet','list_google_docs','read_google_doc','create_google_doc','append_to_google_doc'].includes(t.name)).length > 0
                ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
            }`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('chatbotEdit.toolsLabel')}</span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>

        {/* Card Grid — 4 sections matching top tile style */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">

          {/* Webhook URL Card */}
          <button
            type="button"
            onClick={() => toggleSection('webhook')}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${expandedSection === 'webhook' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'}`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('chatbotEdit.webhookUrl')}</span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
            </svg>
            <span className="text-[10px] text-green-600 dark:text-green-400 font-medium truncate max-w-full">{t('chatbotEdit.ready')}</span>
          </button>

          {/* Variables Card */}
          <button
            type="button"
            onClick={() => toggleSection('variables')}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${expandedSection === 'variables' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'}`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              {t('chatbotEdit.variables')}
              {variables.length > 0 && <span className="inline-flex items-center justify-center w-4 h-4 ml-1 text-[10px] font-bold rounded-full bg-green-500 text-white">{variables.length}</span>}
            </span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9l.879 2.121z" />
            </svg>
            <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-full">{variables.length > 0 ? `${variables.length}` : '—'}</span>
          </button>

          {/* Webhook Forwarding Card */}
          <button
            type="button"
            onClick={() => toggleSection('forwarding')}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${expandedSection === 'forwarding' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : outputUrl ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'}`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('chatbotEdit.webhookForwarding')}</span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
            </svg>
            <span className={`text-[10px] font-medium truncate max-w-full ${outputUrl ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}`}>{outputUrl ? t('chatbotEdit.activeLabel') : t('chatbotEdit.notSet')}</span>
          </button>

          {/* Message Batching Card */}
          <button
            type="button"
            onClick={() => toggleSection('batching')}
            className={`flex flex-col items-center gap-2 p-5 rounded-xl border-2 transition-all ${expandedSection === 'batching' ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : bufferSeconds > 0 ? 'border-green-500 bg-green-50 dark:bg-green-900/20' : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'}`}
          >
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('chatbotEdit.messageBatching')}</span>
            <svg className="w-7 h-7 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <span className={`text-[10px] font-medium truncate max-w-full ${bufferSeconds > 0 ? 'text-primary-600 dark:text-primary-400' : 'text-gray-400'}`}>{bufferSeconds > 0 ? `${bufferSeconds}s` : t('chatbotEdit.off')}</span>
          </button>
        </div>

        {/* Expanded panel for active section */}
        {expandedSection && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          {expandedSection === 'webhook' && (() => {
              const apiBaseUrl = import.meta.env.VITE_API_URL || `${window.location.origin}/api`
              const webhookUrl = `${apiBaseUrl}/chatbots/${id}/webhook`
              const curlExample = `curl -X POST ${webhookUrl} \\
  -H "Content-Type: application/json" \\
  -d '{
    "message": {"type": 1, "body": "Hello!"},
    "sessionId": "user-123",
    "attachments": []${variables.length > 0 ? `,
${variables.map(v => `    "${v.name}": "${v.defaultValue || ''}"`).join(',\n')}` : ''}
  }'`

              return (
                <div className="px-5 py-4 space-y-3">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.webhookUrl')}</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('chatbotEdit.webhookDesc')}</p>
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
                        setSuccess(t('chatbotEdit.webhookUrlCopied'))
                        setTimeout(() => setSuccess(''), 2000)
                      }}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border hover:bg-gray-100 dark:hover:bg-dark-hover text-gray-600 dark:text-gray-300 text-sm flex-shrink-0"
                      title={t('chatbotEdit.copyUrl')}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">{t('chatbotEdit.curlExample')}</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(curlExample)
                          setSuccess(t('chatbotEdit.curlCopied'))
                          setTimeout(() => setSuccess(''), 2000)
                        }}
                        className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
                      >
                        {t('chatbotEdit.copy')}
                      </button>
                    </div>
                    <pre className="px-3 py-3 rounded-lg bg-gray-900 text-green-400 text-xs font-mono overflow-x-auto whitespace-pre">{curlExample}</pre>
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
                    <p><strong className="text-gray-500 dark:text-gray-400">message</strong> (required) — {`{type, body}`} object or plain string. Types: 1=text, 2=image, 3=audio</p>
                    <p><strong className="text-gray-500 dark:text-gray-400">sessionId</strong> (optional) — Unique session ID for conversation memory</p>
                    <p><strong className="text-gray-500 dark:text-gray-400">attachments</strong> (optional) — Array of media URLs (images, voice notes). Auto-transcribed/analyzed</p>
                    {variables.length > 0 && (
                      <p><strong className="text-gray-500 dark:text-gray-400">{variables.map(v => v.name).join(', ')}</strong> (optional) — Dynamic variables to inject into the prompt (flat at top level)</p>
                    )}
                  </div>
                </div>
              )
            })()}
            {expandedSection === 'variables' && (
              <div className="px-5 py-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.variables')}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('chatbotEdit.variablesDesc')}</p>
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
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('chatbotEdit.name')}</label>
                    <input
                      type="text"
                      value={newVarName}
                      onChange={(e) => setNewVarName(e.target.value)}
                      placeholder={t('chatbotEdit.egCustomerName')}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('chatbotEdit.defaultValue')}</label>
                    <input
                      type="text"
                      value={newVarDefault}
                      onChange={(e) => setNewVarDefault(e.target.value)}
                      placeholder={t('chatbotEdit.optional')}
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
                    {t('chatbotEdit.addBtn')}
                  </button>
                </div>
              </div>
            )}
            {expandedSection === 'forwarding' && (
              <div className="px-5 py-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.webhookForwarding')}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('chatbotEdit.webhookForwardingDesc')}</p>
                <input
                  type="url"
                  value={outputUrl}
                  onChange={(e) => setOutputUrl(e.target.value)}
                  placeholder={t('chatbotEdit.webhookForwardingPlaceholder')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
                {outputUrl && (
                  <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    {t('chatbotEdit.responsesForwarded')}
                  </div>
                )}
              </div>
            )}
            {expandedSection === 'batching' && (
              <div className="px-5 py-4 space-y-3">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.messageBatching')}</h4>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('chatbotEdit.messageBatchingDesc')}</p>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('chatbotEdit.bufferDelay')}</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={bufferSeconds}
                      onChange={(e) => setBufferSeconds(Math.max(0, Math.min(30, parseInt(e.target.value) || 0)))}
                      className="w-24 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                    <span className="text-xs text-gray-400">
                      {bufferSeconds === 0 ? t('chatbotEdit.messageBatchingDisabled') : `${bufferSeconds} ${t('chatbotEdit.seconds')}`}
                    </span>
                  </div>
                </div>
                {bufferSeconds > 0 && (
                  <div className="px-3 py-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-300">{t('chatbotEdit.messageBatchingWarning')}</p>
                  </div>
                )}
              </div>
            )}
        </div>
        )}

        {/* SQL Agent — Database Connection */}
        {agentKind === 'sql_agent' && (
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">Database Connection</h3>
              <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                SQL Agent
              </span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              The agent will run read-only SQL against this database to answer questions.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Database type</label>
                <select
                  value={databaseConfig.type}
                  onChange={(e) => setDatabaseConfig(prev => ({ ...prev, type: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="postgres">PostgreSQL</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Connection string</label>
                <input
                  type="password"
                  autoComplete="off"
                  value={databaseConfig.connectionString}
                  onChange={(e) => {
                    setDatabaseConfig(prev => ({ ...prev, connectionString: e.target.value }))
                    setDbTestStatus(null)
                  }}
                  placeholder={databaseConfig.hasConnectionString ? `Saved: ${databaseConfig.connectionStringPreview || '••••••••'} (leave blank to keep)` : 'postgresql://user:password@host:5432/dbname'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                disabled={dbTesting || (!databaseConfig.connectionString && !databaseConfig.hasConnectionString)}
                onClick={async () => {
                  setDbTesting(true)
                  setDbTestStatus(null)
                  try {
                    const payload = { type: databaseConfig.type }
                    if (databaseConfig.connectionString) {
                      payload.connectionString = databaseConfig.connectionString
                    } else {
                      payload.chatbotId = id
                    }
                    const { data } = await chatbotsAPI.testDbConnection(payload)
                    setDbTestStatus({ ok: true, message: `Connected (${data.latencyMs} ms)`, latencyMs: data.latencyMs })
                  } catch (err) {
                    setDbTestStatus({ ok: false, message: err.response?.data?.error || 'Failed to connect' })
                  } finally {
                    setDbTesting(false)
                  }
                }}
                className="px-3 py-2 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
              >
                {dbTesting ? 'Testing...' : 'Test connection'}
              </button>
              {dbTestStatus && (
                <span className={`text-sm ${dbTestStatus.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {dbTestStatus.ok ? '✓ ' : '✗ '}{dbTestStatus.message}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
              Credentials are encrypted at rest. We recommend a read-only database user scoped to the tables the agent should access.
            </p>
          </div>
        )}

        {/* System Prompt */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.systemPrompt')}</h3>
            <button
              onClick={() => setShowPromptGenerator(true)}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
            >
              {t('chatbotEdit.generateWithAi')}
            </button>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            placeholder={t('chatbotEdit.systemPromptPlaceholder')}
            rows={20}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">{systemPrompt.length} characters</p>
          {variables.length > 0 && (
            <div className="mt-2 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                {t('chatbotEdit.availablePlaceholders')} {variables.map(v => (
                  <code key={v.name} className="mx-0.5 px-1 py-0.5 bg-blue-100 dark:bg-blue-900/40 rounded text-[11px] font-mono">{`{{${v.name}}}`}</code>
                ))}
              </p>
            </div>
          )}
        </div>

      </div>

      {/* ===== MODEL MODAL ===== */}
      {showModelModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.selectModel')}</h3>
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
                    <span className="text-xs text-red-400 ml-auto">{t('chatbotEdit.notConnected')}</span>
                  </>
                ) : (
                  <span className="text-sm text-gray-400">{t('chatbotEdit.selectProvider')}</span>
                )}
                <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-auto transition-transform ${showProviderDropdown === dropdownId ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              <div className={`${showProviderDropdown === dropdownId ? '' : 'hidden'} mt-1 w-full bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg max-h-64 overflow-y-auto`}>
                {connectedAccounts.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide">{t('chatbotEdit.connected')}</div>
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
                    <div className="px-3 py-1.5 text-xs font-medium text-gray-400 uppercase tracking-wide border-t border-gray-100 dark:border-dark-border mt-1">{t('chatbotEdit.notConnected')}</div>
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
                        <span className="text-xs text-gray-400 ml-auto">{t('chatbotEdit.setupRequired')}</span>
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
              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.calendarLabel')}</label>
              {err && (
                <div className="p-2 mb-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-xs text-red-600 dark:text-red-400">{err}</p>
                </div>
              )}
              {ldg ? (
                <div className="flex items-center gap-2 py-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                  <span className="text-sm text-gray-500">{t('chatbotEdit.loadingCalendars')}</span>
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
                  <option value="">{t('chatbotEdit.selectCalendar')}</option>
                  {calendars.map(cal => (
                    <option key={cal.id} value={cal.id}>{cal.name}</option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 py-2">{t('chatbotEdit.noCalendarsFound')}</div>
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
                <p className="text-sm text-yellow-700 dark:text-yellow-300">{t('chatbotEdit.providerNotConnected')}</p>
              </div>
              <button
                onClick={() => { setShowCalendarModal(false); navigate('/dashboard/settings?tab=calendars') }}
                className="px-3 py-1.5 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 text-xs font-medium whitespace-nowrap"
              >
                {t('chatbotEdit.goToSettings')}
              </button>
            </div>
          )
        }

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white dark:bg-dark-card flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border z-10">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.calendarOptions')}</h3>
                <button onClick={() => setShowCalendarModal(false)} className="text-gray-500 hover:text-gray-700">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="p-4 space-y-4">
                {/* Enable toggle */}
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('chatbotEdit.enableCalendarIntegration')}</label>
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
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.calendarProvider')}</label>
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
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.timezone')}</label>
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
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.appointmentDuration')}</label>
                              <select
                                value={calendarConfig.appointmentDuration || 30}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, appointmentDuration: parseInt(e.target.value) })}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                              >
                                <option value={10}>{t('chatbotEdit.min10')}</option>
                                <option value={15}>{t('chatbotEdit.min15')}</option>
                                <option value={30}>{t('chatbotEdit.min30')}</option>
                                <option value={45}>{t('chatbotEdit.min45')}</option>
                                <option value={60}>{t('chatbotEdit.min60')}</option>
                                <option value={90}>{t('chatbotEdit.min90')}</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.appointmentTitle')}</label>
                              <input
                                type="text"
                                value={calendarConfig.appointmentTitle || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, appointmentTitle: e.target.value })}
                                placeholder={t('chatbotEdit.appointmentTitlePlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('chatbotEdit.variablesColon')} {'{{contactName}}'}, {'{{contactEmail}}'}, {'{{contactPhone}}'}</p>
                            </div>
                          </>
                        )}

                        {calendarConfig.provider === 'ghl' && calendarConfig.calendarId && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.ghlTestContactId')}</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactId || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactId: e.target.value })}
                                placeholder={t('chatbotEdit.ghlTestContactIdPlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('chatbotEdit.ghlTestContactIdDesc')}</p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.ghlTestContactName')}</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactName || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactName: e.target.value })}
                                placeholder={t('chatbotEdit.ghlTestContactNamePlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('chatbotEdit.ghlTestContactNameDesc')}</p>
                            </div>
                          </>
                        )}

                        {calendarConfig.provider && calendarConfig.calendarId && (
                          <button
                            type="button"
                            onClick={addCalendarEntry}
                            className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600 transition-colors"
                          >
                            {t('chatbotEdit.addAnotherCalendar')}
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
                          const subtitle = entry.name || t('chatbotEdit.calendarNum', { num: idx + 1 })

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
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.nameRequired')}</label>
                                    <input
                                      type="text"
                                      value={entry.name}
                                      onChange={(e) => updateCalendarEntry(entry.id, { name: e.target.value })}
                                      placeholder={t('chatbotEdit.appointmentTitlePlaceholder')}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.scenario')}</label>
                                    <textarea
                                      value={entry.scenario}
                                      onChange={(e) => updateCalendarEntry(entry.id, { scenario: e.target.value })}
                                      placeholder={t('chatbotEdit.scenarioPlaceholder')}
                                      rows={2}
                                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm resize-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.provider')}</label>
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
                                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.timezone')}</label>
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
                                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.duration')}</label>
                                        <select
                                          value={entry.appointmentDuration || 30}
                                          onChange={(e) => updateCalendarEntry(entry.id, { appointmentDuration: parseInt(e.target.value) })}
                                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                        >
                                          <option value={10}>{t('chatbotEdit.min10')}</option>
                                          <option value={15}>{t('chatbotEdit.min15')}</option>
                                          <option value={30}>{t('chatbotEdit.min30')}</option>
                                          <option value={45}>{t('chatbotEdit.min45')}</option>
                                          <option value={60}>{t('chatbotEdit.min60')}</option>
                                          <option value={90}>{t('chatbotEdit.min90')}</option>
                                        </select>
                                      </div>
                                      <div>
                                        <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.appointmentTitle')}</label>
                                        <input
                                          type="text"
                                          value={entry.appointmentTitle || ''}
                                          onChange={(e) => updateCalendarEntry(entry.id, { appointmentTitle: e.target.value })}
                                          placeholder={t('chatbotEdit.appointmentTitlePlaceholder')}
                                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                                        />
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('chatbotEdit.variablesColon')} {'{{contactName}}'}, {'{{contactEmail}}'}, {'{{contactPhone}}'}</p>
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
                          {t('chatbotEdit.addCalendar')}
                        </button>

                        {calendarConfig.calendars.some(c => c.provider === 'ghl' && c.calendarId) && (
                          <>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.ghlTestContactId')}</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactId || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactId: e.target.value })}
                                placeholder={t('chatbotEdit.ghlTestContactIdPlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('chatbotEdit.ghlTestContactIdDesc')}</p>
                            </div>
                            <div>
                              <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.ghlTestContactName')}</label>
                              <input
                                type="text"
                                value={calendarConfig.ghlTestContactName || ''}
                                onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactName: e.target.value })}
                                placeholder={t('chatbotEdit.ghlTestContactNamePlaceholder')}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm"
                              />
                              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('chatbotEdit.ghlTestContactNameDesc')}</p>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
              <div className="flex justify-end gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
                <button
                  onClick={() => setShowCalendarModal(false)}
                  className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700"
                >
                  {t('chatbotEdit.done')}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ===== UNIFIED TOOLS MODAL ===== */}
      {showUnifiedToolsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.toolsModalTitle')}</h3>
              <button onClick={() => { setShowUnifiedToolsModal(false); setToolsSection(null) }} className="text-gray-500 hover:text-gray-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto divide-y divide-gray-100 dark:divide-dark-border">

              {/* ── Call Tool ── */}
              <div>
                <button onClick={() => setToolsSection(s => s === 'call' ? null : 'call')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${toolsSection === 'call' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{t('chatbotEdit.call')}</span>
                  {callConfig.enabled && callConfig.agentId && <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">2 {t('chatbotEdit.tools')}</span>}
                </button>
                {toolsSection === 'call' && (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('chatbotEdit.enableCallTool')}</label>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('chatbotEdit.callToolDesc')}</p>
                      </div>
                      <button onClick={() => setCallConfig({ ...callConfig, enabled: !callConfig.enabled })} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${callConfig.enabled ? 'bg-green-600' : 'bg-gray-300'}`}>
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${callConfig.enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </div>
                    {callConfig.enabled && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.voiceAgent')}</label>
                          <select value={callConfig.agentId} onChange={(e) => setCallConfig({ ...callConfig, agentId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm">
                            <option value="">{t('chatbotEdit.selectAgent')}</option>
                            {agentsList.map(agent => (<option key={agent.id} value={agent.id}>{agent.name}{agent.vapiId ? '' : ` ${t('chatbotEdit.notSynced')}`}</option>))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium mb-1 text-gray-700 dark:text-gray-300">{t('chatbotEdit.phoneNumber')}</label>
                          <select value={callConfig.phoneNumberId} onChange={(e) => setCallConfig({ ...callConfig, phoneNumberId: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm">
                            <option value="">{t('chatbotEdit.selectPhoneNumber')}</option>
                            {phoneNumbersList.map(pn => (<option key={pn.id} value={pn.id}>{pn.phoneNumber}{pn.label ? ` (${pn.label})` : ''}</option>))}
                          </select>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* ── Google Sheets ── (hidden for now) */}
              {false && <div>
                <button onClick={() => { setToolsSection(s => s === 'sheets' ? null : 'sheets'); if (sheetsConfig.integrationId) fetchSpreadsheets(sheetsConfig.integrationId, '') }} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${toolsSection === 'sheets' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M3 14h18M10 3v18M3 6a3 3 0 013-3h12a3 3 0 013 3v12a3 3 0 01-3 3H6a3 3 0 01-3-3V6z" /></svg>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{t('chatbotEdit.googleSheets')}</span>
                  {sheetsConfig.enabled && sheetsConfig.integrationId && <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">6 {t('chatbotEdit.tools')}</span>}
                </button>
                {toolsSection === 'sheets' && (
                  <div className="px-5 pb-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${sheetsConfig.enabled ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} onClick={() => setSheetsConfig(prev => ({ ...prev, enabled: !prev.enabled }))}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${sheetsConfig.enabled ? 'left-[22px]' : 'left-[2px]'}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatbotEdit.enableGoogleSheets')}</span>
                    </label>
                    {sheetsConfig.enabled && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('chatbotEdit.googleAccount')}</label>
                          {calendarIntegrations.filter(i => i.provider === 'google').length === 0 ? (
                            <p className="text-xs text-red-500">{t('chatbotEdit.noGoogleAccounts')}</p>
                          ) : (
                            <select value={sheetsConfig.integrationId} onChange={e => { const newId = e.target.value; setSheetsConfig(prev => ({ ...prev, integrationId: newId, spreadsheetId: '', spreadsheetName: '' })); if (newId) fetchSpreadsheets(newId, '') }} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                              <option value="">{t('chatbotEdit.selectAccount')}</option>
                              {calendarIntegrations.filter(i => i.provider === 'google').map(i => (<option key={i.id} value={i.id}>{i.accountLabel || i.externalAccountId || `Google #${i.id}`}</option>))}
                            </select>
                          )}
                        </div>
                        {sheetsConfig.integrationId && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('chatbotEdit.defaultSpreadsheet')} <span className="text-gray-400">{t('chatbotEdit.noteInstructionOptional')}</span></label>
                            <div className="relative mb-2">
                              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                              <input value={sheetSearch} onChange={e => { setSheetSearch(e.target.value); clearTimeout(window._sheetSearchTimeout); window._sheetSearchTimeout = setTimeout(() => fetchSpreadsheets(sheetsConfig.integrationId, e.target.value), 400) }} placeholder={t('chatbotEdit.searchSpreadsheets')} className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white" />
                            </div>
                            <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 dark:border-dark-border">
                              {sheetFilesLoading ? (<div className="flex items-center justify-center py-4"><svg className="w-5 h-5 animate-spin text-green-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
                              ) : sheetFiles.length === 0 ? (<p className="text-xs text-center py-3 text-gray-400">{t('chatbotEdit.noSpreadsheetsFound')}</p>
                              ) : (sheetFiles.map(f => (
                                <button key={f.id} onClick={() => setSheetsConfig(prev => ({ ...prev, spreadsheetId: f.id, spreadsheetName: f.name }))} className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-dark-hover transition ${f.id === sheetsConfig.spreadsheetId ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                  <span className="truncate flex-1">{f.name}</span>
                                  {f.id === sheetsConfig.spreadsheetId && <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                </button>
                              )))}
                            </div>
                            {sheetsConfig.spreadsheetId && <button onClick={() => setSheetsConfig(prev => ({ ...prev, spreadsheetId: '', spreadsheetName: '' }))} className="mt-1 text-xs text-red-500 hover:underline">{t('chatbotEdit.clearSelection')}</button>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>}

              {/* ── Google Docs ── (hidden for now) */}
              {false && <div>
                <button onClick={() => { setToolsSection(s => s === 'docs' ? null : 'docs'); if (docsConfig.integrationId) fetchDocuments(docsConfig.integrationId, '') }} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${toolsSection === 'docs' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{t('chatbotEdit.googleDocs')}</span>
                  {docsConfig.enabled && docsConfig.integrationId && <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">4 {t('chatbotEdit.tools')}</span>}
                </button>
                {toolsSection === 'docs' && (
                  <div className="px-5 pb-4 space-y-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <div className={`w-10 h-5 rounded-full relative transition-colors ${docsConfig.enabled ? 'bg-blue-500' : 'bg-gray-300 dark:bg-gray-600'}`} onClick={() => setDocsConfig(prev => ({ ...prev, enabled: !prev.enabled }))}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${docsConfig.enabled ? 'left-[22px]' : 'left-[2px]'}`} />
                      </div>
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatbotEdit.enableGoogleDocs')}</span>
                    </label>
                    {docsConfig.enabled && (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('chatbotEdit.googleAccount')}</label>
                          {calendarIntegrations.filter(i => i.provider === 'google').length === 0 ? (
                            <p className="text-xs text-red-500">{t('chatbotEdit.noGoogleAccounts')}</p>
                          ) : (
                            <select value={docsConfig.integrationId} onChange={e => { const newId = e.target.value; setDocsConfig(prev => ({ ...prev, integrationId: newId, documentId: '', documentName: '' })); if (newId) fetchDocuments(newId, '') }} className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                              <option value="">{t('chatbotEdit.selectAccount')}</option>
                              {calendarIntegrations.filter(i => i.provider === 'google').map(i => (<option key={i.id} value={i.id}>{i.accountLabel || i.externalAccountId || `Google #${i.id}`}</option>))}
                            </select>
                          )}
                        </div>
                        {docsConfig.integrationId && (
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">{t('chatbotEdit.defaultDocument')} <span className="text-gray-400">{t('chatbotEdit.noteInstructionOptional')}</span></label>
                            <div className="relative mb-2">
                              <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                              <input value={docSearch} onChange={e => { setDocSearch(e.target.value); clearTimeout(window._docSearchTimeout); window._docSearchTimeout = setTimeout(() => fetchDocuments(docsConfig.integrationId, e.target.value), 400) }} placeholder={t('chatbotEdit.searchDocuments')} className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white" />
                            </div>
                            <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 dark:border-dark-border">
                              {docFilesLoading ? (<div className="flex items-center justify-center py-4"><svg className="w-5 h-5 animate-spin text-blue-500" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg></div>
                              ) : docFiles.length === 0 ? (<p className="text-xs text-center py-3 text-gray-400">{t('chatbotEdit.noDocumentsFound')}</p>
                              ) : (docFiles.map(f => (
                                <button key={f.id} onClick={() => setDocsConfig(prev => ({ ...prev, documentId: f.id, documentName: f.name }))} className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-dark-hover transition ${f.id === docsConfig.documentId ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}`}>
                                  <span className="truncate flex-1">{f.name}</span>
                                  {f.id === docsConfig.documentId && <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                </button>
                              )))}
                            </div>
                            {docsConfig.documentId && <button onClick={() => setDocsConfig(prev => ({ ...prev, documentId: '', documentName: '' }))} className="mt-1 text-xs text-red-500 hover:underline">{t('chatbotEdit.clearSelection')}</button>}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>}

              {/* ── GHL CRM ── */}
              <div>
                <button onClick={() => setToolsSection(s => s === 'ghl' ? null : 'ghl')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${toolsSection === 'ghl' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{t('chatbotEdit.ghlCrm')}</span>
                  {(() => { const c = (ghlCrmConfig.createNote ? 1 : 0) + (ghlCrmConfig.opportunities || []).length + (ghlCrmConfig.tagSets || []).length + (ghlCrmConfig.workflows || []).length; return c > 0 ? <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">{c} {c > 1 ? t('chatbotEdit.tools') : t('chatbotEdit.tool')}</span> : null })()}
                </button>
                {toolsSection === 'ghl' && (
                  <div className="px-5 pb-5 space-y-4">
                    <p className="text-xs text-gray-400 leading-relaxed">{t('chatbotEdit.ghlCrmContactIdNote')}</p>

                    {/* Test Contact ID for GHL CRM tools */}
                    <div className="rounded-xl bg-gray-50 dark:bg-white/[0.03] p-4 space-y-3">
                      <div>
                        <label className="block text-xs font-medium mb-1.5 text-gray-600 dark:text-gray-300">{t('chatbotEdit.ghlTestContactId')}</label>
                        <input
                          type="text"
                          value={calendarConfig.ghlTestContactId || ''}
                          onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactId: e.target.value })}
                          placeholder={t('chatbotEdit.ghlTestContactIdPlaceholder')}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">{t('chatbotEdit.ghlTestContactIdDesc')}</p>
                      </div>
                      <div>
                        <label className="block text-xs font-medium mb-1.5 text-gray-600 dark:text-gray-300">{t('chatbotEdit.ghlTestContactName')}</label>
                        <input
                          type="text"
                          value={calendarConfig.ghlTestContactName || ''}
                          onChange={(e) => setCalendarConfig({ ...calendarConfig, ghlTestContactName: e.target.value })}
                          placeholder={t('chatbotEdit.ghlTestContactNamePlaceholder')}
                          className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition"
                        />
                        <p className="text-[11px] text-gray-400 mt-1">{t('chatbotEdit.ghlTestContactNameDesc')}</p>
                      </div>
                    </div>

                    {/* Create Note toggle */}
                    <label className="flex items-center gap-3 cursor-pointer rounded-xl bg-gray-50 dark:bg-white/[0.03] hover:bg-gray-100/70 dark:hover:bg-white/[0.05] px-4 py-3 transition-colors">
                      <div className={`w-9 h-5 rounded-full relative transition-colors flex-shrink-0 ${ghlCrmConfig.createNote ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`} onClick={(e) => { e.preventDefault(); setGhlCrmConfig(prev => ({ ...prev, createNote: !prev.createNote })) }}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all shadow ${ghlCrmConfig.createNote ? 'left-[18px]' : 'left-[2px]'}`} />
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatbotEdit.createNote')}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{t('chatbotEdit.createNoteDesc')}</div>
                      </div>
                    </label>

                    {/* ── Opportunity (upsert: create or update) ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setExpandedGhlSub(s => s === 'opp' ? null : 'opp')} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expandedGhlSub === 'opp' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatbotEdit.opportunity')}</span>
                          {(ghlCrmConfig.opportunities || []).length > 0 && <span className="text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">{ghlCrmConfig.opportunities.length}</span>}
                        </button>
                        <button type="button" onClick={async () => { if (ghlPipelines.length === 0) { try { const { data } = await ghlAPI.getPipelines(); setGhlPipelines(data.pipelines || []) } catch (_) {} } setGhlCrmConfig(prev => { const next = [...(prev.opportunities || []), { pipelineId: '', pipelineName: '', stageId: '', stageName: '', scenario: '', noteInstruction: '', customName: '' }]; setExpandedOppIdx(next.length - 1); return { ...prev, opportunities: next } }); setExpandedGhlSub('opp') }} className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" /></svg>{t('chatbotEdit.add')}</button>
                      </div>
                      {expandedGhlSub === 'opp' && (<>
                      {(ghlCrmConfig.opportunities || []).length === 0 && <p className="text-xs text-gray-400 text-center py-3 rounded-xl bg-gray-50/60 dark:bg-white/[0.02]">{t('chatbotEdit.noOpportunities')}</p>}
                      {(ghlCrmConfig.opportunities || []).map((opp, i) => {
                        const isOpen = expandedOppIdx === i
                        return (
                        <div key={i} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-3">
                            <button type="button" onClick={() => setExpandedOppIdx(isOpen ? null : i)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                              <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex-shrink-0 truncate">{opp.customName?.trim() || t('chatbotEdit.opportunityNum', { num: i + 1 })}</span>
                              {!opp.customName?.trim() && opp.pipelineName && <span className="text-xs text-gray-600 dark:text-gray-300 truncate">· {opp.pipelineName}{opp.stageName ? ` / ${opp.stageName}` : ''}</span>}
                            </button>
                            <button type="button" onClick={() => { setGhlCrmConfig(prev => ({ ...prev, opportunities: prev.opportunities.filter((_, j) => j !== i) })); setExpandedOppIdx(cur => cur === i ? null : (cur > i ? cur - 1 : cur)) }} className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                          {isOpen && (
                            <div className="px-4 pb-4 space-y-2.5">
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.itemName')}</label>
                                <input type="text" value={opp.customName || ''} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], customName: e.target.value }; return { ...prev, opportunities: arr } })} placeholder={t('chatbotEdit.itemNamePlaceholderOpp')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.pipeline')}</label>
                                <select value={opp.pipelineId} onChange={(e) => { const sel = ghlPipelines.find(p => p.id === e.target.value); setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], pipelineId: e.target.value, pipelineName: sel?.name || '', stageId: '', stageName: '' }; return { ...prev, opportunities: arr } }) }} onFocus={async () => { if (ghlPipelines.length === 0) { try { const { data } = await ghlAPI.getPipelines(); setGhlPipelines(data.pipelines || []) } catch (_) {} } }} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition">
                                  <option value="">{t('chatbotEdit.selectPipeline')}</option>
                                  {ghlPipelines.map(p => (<option key={p.id} value={p.id}>{p.name}</option>))}
                                </select>
                              </div>
                              {opp.pipelineId && (() => { const stages = ghlPipelines.find(p => p.id === opp.pipelineId)?.stages || []; return stages.length > 0 ? (
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.stage')}</label>
                                  <select value={opp.stageId} onChange={(e) => { const sel = stages.find(s => s.id === e.target.value); setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], stageId: e.target.value, stageName: sel?.name || '' }; return { ...prev, opportunities: arr } }) }} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition">
                                    <option value="">{t('chatbotEdit.selectStage')}</option>
                                    {stages.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                  </select>
                                </div>
                              ) : null })()}
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.whenToUse')}</label>
                                <input type="text" value={opp.scenario} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], scenario: e.target.value }; return { ...prev, opportunities: arr } })} placeholder={t('chatbotEdit.whenToUsePlaceholder')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.noteInstruction')} <span className="text-gray-400">{t('chatbotEdit.noteInstructionOptional')}</span></label>
                                <input type="text" value={opp.noteInstruction || ''} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], noteInstruction: e.target.value }; return { ...prev, opportunities: arr } })} placeholder={t('chatbotEdit.noteInstructionPlaceholder')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>

                              <CustomFieldsBlock
                                title={t('chatbotEdit.contactCustomFields')}
                                emptyText={t('chatbotEdit.noCustomFields')}
                                addLabel={t('chatbotEdit.addCustomField')}
                                fields={opp.contactCustomFields || []}
                                fieldOptions={ghlContactCfs}
                                onLoadFields={ensureGhlContactCfsLoaded}
                                onChange={(next) => setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], contactCustomFields: next }; return { ...prev, opportunities: arr } })}
                                t={t}
                              />

                              <CustomFieldsBlock
                                title={t('chatbotEdit.opportunityCustomFields')}
                                emptyText={t('chatbotEdit.noCustomFields')}
                                addLabel={t('chatbotEdit.addCustomField')}
                                fields={opp.opportunityCustomFields || []}
                                fieldOptions={ghlOppCfs}
                                onLoadFields={ensureGhlOppCfsLoaded}
                                onChange={(next) => setGhlCrmConfig(prev => { const arr = [...prev.opportunities]; arr[i] = { ...arr[i], opportunityCustomFields: next }; return { ...prev, opportunities: arr } })}
                                t={t}
                              />
                            </div>
                          )}
                        </div>
                        )
                      })}
                      </>)}
                    </div>

                    {/* ── Add Tags (multi) ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setExpandedGhlSub(s => s === 'tag' ? null : 'tag')} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expandedGhlSub === 'tag' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatbotEdit.addTags')}</span>
                          {(ghlCrmConfig.tagSets || []).length > 0 && <span className="text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">{ghlCrmConfig.tagSets.length}</span>}
                        </button>
                        <button type="button" onClick={async () => { if (ghlTags.length === 0) { try { const { data } = await ghlAPI.getTags(); setGhlTags(data.tags || []) } catch (_) {} } setGhlCrmConfig(prev => { const next = [...(prev.tagSets || []), { tags: [], scenario: '', customName: '' }]; setExpandedTagIdx(next.length - 1); return { ...prev, tagSets: next } }); setExpandedGhlSub('tag') }} className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" /></svg>{t('chatbotEdit.add')}</button>
                      </div>
                      {expandedGhlSub === 'tag' && (<>
                      {(ghlCrmConfig.tagSets || []).length === 0 && <p className="text-xs text-gray-400 text-center py-3 rounded-xl bg-gray-50/60 dark:bg-white/[0.02]">{t('chatbotEdit.noTagRules')}</p>}
                      {(ghlCrmConfig.tagSets || []).map((ts, i) => {
                        const isOpen = expandedTagIdx === i
                        const summary = (ts.tags || []).slice(0, 3).join(', ') + ((ts.tags || []).length > 3 ? '…' : '')
                        return (
                        <div key={i} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-3">
                            <button type="button" onClick={() => setExpandedTagIdx(isOpen ? null : i)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                              <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex-shrink-0 truncate">{ts.customName?.trim() || t('chatbotEdit.tagSetNum', { num: i + 1 })}</span>
                              {!ts.customName?.trim() && summary && <span className="text-xs text-gray-600 dark:text-gray-300 truncate">· {summary}</span>}
                            </button>
                            <button type="button" onClick={() => { setGhlCrmConfig(prev => ({ ...prev, tagSets: prev.tagSets.filter((_, j) => j !== i) })); setExpandedTagIdx(cur => cur === i ? null : (cur > i ? cur - 1 : cur)) }} className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                          {isOpen && (
                            <div className="px-4 pb-4 space-y-2.5">
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.itemName')}</label>
                                <input type="text" value={ts.customName || ''} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.tagSets]; arr[i] = { ...arr[i], customName: e.target.value }; return { ...prev, tagSets: arr } })} placeholder={t('chatbotEdit.itemNamePlaceholderTag')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5">{t('chatbotEdit.tags')}</label>
                                {(ts.tags || []).length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {(ts.tags || []).map((tag, ti) => (
                                      <span key={ti} className="inline-flex items-center gap-1 pl-2.5 pr-1.5 py-0.5 rounded-full text-xs bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300">
                                        {tag}
                                        <button type="button" onClick={() => setGhlCrmConfig(prev => { const arr = [...prev.tagSets]; arr[i] = { ...arr[i], tags: arr[i].tags.filter((_, j) => j !== ti) }; return { ...prev, tagSets: arr } })} className="hover:text-red-500 rounded-full hover:bg-orange-200/50 dark:hover:bg-orange-400/20 p-0.5 transition-colors"><svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <select onChange={(e) => { if (e.target.value && !(ts.tags || []).includes(e.target.value)) { setGhlCrmConfig(prev => { const arr = [...prev.tagSets]; arr[i] = { ...arr[i], tags: [...(arr[i].tags || []), e.target.value] }; return { ...prev, tagSets: arr } }) } e.target.value = '' }} onFocus={async () => { if (ghlTags.length === 0) { try { const { data } = await ghlAPI.getTags(); setGhlTags(data.tags || []) } catch (_) {} } }} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition">
                                  <option value="">{t('chatbotEdit.addATag')}</option>
                                  {ghlTags.filter(gt => !(ts.tags || []).includes(gt.name)).map(gt => (<option key={gt.id} value={gt.name}>{gt.name}</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.whenToUse')}</label>
                                <input type="text" value={ts.scenario} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.tagSets]; arr[i] = { ...arr[i], scenario: e.target.value }; return { ...prev, tagSets: arr } })} placeholder={t('chatbotEdit.whenToUsePlaceholder')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>
                            </div>
                          )}
                        </div>
                        )
                      })}
                      </>)}
                    </div>

                    {/* ── Add to Workflow (multi) ── */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <button type="button" onClick={() => setExpandedGhlSub(s => s === 'workflow' ? null : 'workflow')} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                          <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${expandedGhlSub === 'workflow' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-200">{t('chatbotEdit.addToWorkflow')}</span>
                          {(ghlCrmConfig.workflows || []).length > 0 && <span className="text-[10px] font-bold text-orange-600 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded">{ghlCrmConfig.workflows.length}</span>}
                        </button>
                        <button type="button" onClick={async () => { if (ghlWorkflows.length === 0) { try { const { data } = await ghlAPI.getWorkflows(); setGhlWorkflows(data.workflows || []) } catch (_) {} } setGhlCrmConfig(prev => { const next = [...(prev.workflows || []), { workflowId: '', workflowName: '', scenario: '', customName: '' }]; setExpandedWorkflowIdx(next.length - 1); return { ...prev, workflows: next } }); setExpandedGhlSub('workflow') }} className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" /></svg>{t('chatbotEdit.add')}</button>
                      </div>
                      {expandedGhlSub === 'workflow' && (<>
                      {(ghlCrmConfig.workflows || []).length === 0 && <p className="text-xs text-gray-400 text-center py-3 rounded-xl bg-gray-50/60 dark:bg-white/[0.02]">{t('chatbotEdit.noWorkflows')}</p>}
                      {(ghlCrmConfig.workflows || []).map((wf, i) => {
                        const isOpen = expandedWorkflowIdx === i
                        return (
                        <div key={i} className="rounded-xl bg-gray-50 dark:bg-white/[0.03] overflow-hidden">
                          <div className="flex items-center gap-2 px-4 py-3">
                            <button type="button" onClick={() => setExpandedWorkflowIdx(isOpen ? null : i)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                              <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 flex-shrink-0 truncate">{wf.customName?.trim() || t('chatbotEdit.workflowNum', { num: i + 1 })}</span>
                              {!wf.customName?.trim() && wf.workflowName && <span className="text-xs text-gray-600 dark:text-gray-300 truncate">· {wf.workflowName}</span>}
                            </button>
                            <button type="button" onClick={() => { setGhlCrmConfig(prev => ({ ...prev, workflows: prev.workflows.filter((_, j) => j !== i) })); setExpandedWorkflowIdx(cur => cur === i ? null : (cur > i ? cur - 1 : cur)) }} className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors flex-shrink-0"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                          {isOpen && (
                            <div className="px-4 pb-4 space-y-2.5">
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.itemName')}</label>
                                <input type="text" value={wf.customName || ''} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.workflows]; arr[i] = { ...arr[i], customName: e.target.value }; return { ...prev, workflows: arr } })} placeholder={t('chatbotEdit.itemNamePlaceholderWorkflow')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.workflow')}</label>
                                <select value={wf.workflowId} onChange={(e) => { const sel = ghlWorkflows.find(w => w.id === e.target.value); setGhlCrmConfig(prev => { const arr = [...prev.workflows]; arr[i] = { ...arr[i], workflowId: e.target.value, workflowName: sel?.name || '' }; return { ...prev, workflows: arr } }) }} onFocus={async () => { if (ghlWorkflows.length === 0) { try { const { data } = await ghlAPI.getWorkflows(); setGhlWorkflows(data.workflows || []) } catch (_) {} } }} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition">
                                  <option value="">{t('chatbotEdit.selectWorkflow')}</option>
                                  {ghlWorkflows.map(w => (<option key={w.id} value={w.id}>{w.name}</option>))}
                                </select>
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.whenToUse')}</label>
                                <input type="text" value={wf.scenario} onChange={(e) => setGhlCrmConfig(prev => { const arr = [...prev.workflows]; arr[i] = { ...arr[i], scenario: e.target.value }; return { ...prev, workflows: arr } })} placeholder={t('chatbotEdit.whenToUsePlaceholder')} className="w-full px-3 py-2 text-sm rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400/40 transition" />
                              </div>
                            </div>
                          )}
                        </div>
                        )
                      })}
                      </>)}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Follow-Up Rules ── */}
              <div>
                <button onClick={async () => { if (toolsSection !== 'followup') { if (ghlPipelines.length === 0) { try { const { data } = await ghlAPI.getPipelines(); setGhlPipelines(data.pipelines || []) } catch (_) {} } } setToolsSection(s => s === 'followup' ? null : 'followup') }} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${toolsSection === 'followup' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{t('chatbotEdit.followUpRules')}</span>
                  {(followUpRulesConfig.rules || []).length > 0 && <span className="text-[10px] font-bold text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded">{followUpRulesConfig.rules.length} {followUpRulesConfig.rules.length > 1 ? t('chatbotEdit.rules') : t('chatbotEdit.rule')}</span>}
                </button>
                {toolsSection === 'followup' && (
                  <div className="px-5 pb-4 space-y-3">
                    <p className="text-xs text-gray-400">{t('chatbotEdit.followUpRulesDesc')}</p>

                    {/* Enable toggle */}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={followUpRulesConfig.enabled}
                        onChange={(e) => setFollowUpRulesConfig(prev => ({ ...prev, enabled: e.target.checked }))}
                        className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{t('chatbotEdit.enableFollowUpRules')}</span>
                    </label>

                    {/* Rules list */}
                    {(followUpRulesConfig.rules || []).length === 0 && (
                      <p className="text-sm text-gray-400 text-center py-2">{t('chatbotEdit.noFollowUpRules')}</p>
                    )}

                    {(followUpRulesConfig.rules || []).map((rule, rIdx) => (
                      <div key={rIdx} className="rounded-lg border border-gray-200 dark:border-dark-border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-gray-500">{t('chatbotEdit.ruleNum', { num: rIdx + 1 })}</span>
                          <button onClick={() => setFollowUpRulesConfig(prev => ({ ...prev, rules: prev.rules.filter((_, i) => i !== rIdx) }))} className="text-gray-400 hover:text-red-500 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                          </button>
                        </div>

                        {/* Rule Name */}
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.ruleName')}</label>
                          <input type="text" value={rule.name || ''} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], name: e.target.value }; return { ...prev, rules } })} placeholder={t('chatbotEdit.ruleName')} className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white" />
                        </div>

                        {/* Condition Type */}
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Condition</label>
                          <select value={rule.conditionType || 'inactive_conversation'} onChange={(e) => { const val = e.target.value; setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], conditionType: val }; if (val === 'inactive_conversation') { rules[rIdx].stageId = ''; rules[rIdx].stageName = ''; if (!Array.isArray(rules[rIdx].excludedStageIds)) rules[rIdx].excludedStageIds = []; } else if (val === 'opp_in_stage') { rules[rIdx].excludedStageIds = []; } return { ...prev, rules } }) }} className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                            <option value="inactive_conversation">{t('chatbotEdit.inactiveConversation')}</option>
                            <option value="opp_in_stage">{t('chatbotEdit.oppInStage')}</option>
                          </select>
                        </div>

                        {/* Threshold (value + unit) */}
                        <div>
                          <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.threshold')}</label>
                          <div className="flex items-center gap-2">
                            <input type="number" min={(rule.thresholdUnit || 'days') === 'minutes' ? 30 : 1} step={(rule.thresholdUnit || 'days') === 'minutes' ? 30 : 1} value={rule.thresholdValue ?? rule.daysThreshold ?? 3} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const raw = e.target.value === '' ? '' : (parseInt(e.target.value) || 0); rules[rIdx] = { ...rules[rIdx], thresholdValue: raw }; return { ...prev, rules } })} onBlur={() => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const unit = rules[rIdx].thresholdUnit || 'days'; const curVal = parseInt(rules[rIdx].thresholdValue) || 0; const v = unit === 'minutes' ? Math.max(30, Math.round(curVal / 30) * 30 || 30) : Math.max(1, curVal); rules[rIdx] = { ...rules[rIdx], thresholdValue: v }; return { ...prev, rules } })} className="w-24 px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white" />
                            <select value={rule.thresholdUnit || 'days'} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const newUnit = e.target.value; const curVal = rules[rIdx].thresholdValue ?? rules[rIdx].daysThreshold ?? 3; const v = newUnit === 'minutes' ? Math.max(30, Math.round(curVal / 30) * 30) : curVal; rules[rIdx] = { ...rules[rIdx], thresholdUnit: newUnit, thresholdValue: v }; return { ...prev, rules } })} className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                              <option value="minutes">{t('chatbotEdit.minutes')}</option>
                              <option value="hours">{t('chatbotEdit.hours')}</option>
                              <option value="days">{t('chatbotEdit.days')}</option>
                            </select>
                          </div>
                        </div>

                        {/* Pipeline filter & excluded stages (inactive_conversation only) */}
                        {rule.conditionType === 'inactive_conversation' && (
                          <div className="rounded-lg border border-gray-100 dark:border-dark-border p-2 space-y-2">
                            <div className="flex items-center justify-between">
                              <label className="text-xs font-bold text-gray-500 dark:text-gray-400">{t('chatbotEdit.filterByOpp')}</label>
                              {rule.pipelineId && (
                                <button onClick={() => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], pipelineId: '', pipelineName: '', excludedStageIds: [] }; return { ...prev, rules } })} className="text-[10px] text-gray-400 hover:text-red-500">{t('chatbotEdit.clearFilter')}</button>
                              )}
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.pipelineOptional')}</label>
                              <select value={rule.pipelineId || ''} onChange={(e) => { const p = ghlPipelines.find(pp => pp.id === e.target.value); setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], pipelineId: e.target.value, pipelineName: p?.name || '', excludedStageIds: [] }; return { ...prev, rules } }) }} className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                                <option value="">{t('chatbotEdit.anyPipeline')}</option>
                                {ghlPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>
                            {rule.pipelineId && (() => {
                              const stages = ghlPipelines.find(p => p.id === rule.pipelineId)?.stages || [];
                              const excluded = rule.excludedStageIds || [];
                              return (
                                <div>
                                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.skipIfStage')}</label>
                                  <div className="flex flex-wrap gap-1">
                                    {stages.length === 0 ? (
                                      <span className="text-[10px] text-gray-400">{t('chatbotEdit.noStagesInPipeline')}</span>
                                    ) : stages.map(s => {
                                      const isOn = excluded.includes(s.id);
                                      return (
                                        <button key={s.id} type="button" onClick={() => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const cur = rules[rIdx].excludedStageIds || []; rules[rIdx] = { ...rules[rIdx], excludedStageIds: isOn ? cur.filter(x => x !== s.id) : [...cur, s.id] }; return { ...prev, rules } })} className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors ${isOn ? 'bg-red-50 border-red-300 text-red-700 dark:bg-red-900/20 dark:border-red-700 dark:text-red-300' : 'bg-white border-gray-300 text-gray-600 hover:border-gray-400 dark:bg-dark-bg dark:border-dark-border dark:text-gray-300'}`}>
                                          {isOn ? '✕ ' : ''}{s.name}
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}

                        {/* Pipeline & Stage (opp_in_stage only) */}
                        {rule.conditionType === 'opp_in_stage' && (
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.pipeline')}</label>
                              <select value={rule.pipelineId || ''} onChange={(e) => { const p = ghlPipelines.find(pp => pp.id === e.target.value); setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], pipelineId: e.target.value, pipelineName: p?.name || '', stageId: '', stageName: '' }; return { ...prev, rules } }) }} className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                                <option value="">{t('chatbotEdit.selectPipeline')}</option>
                                {ghlPipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.stage')}</label>
                              <select value={rule.stageId || ''} onChange={(e) => { const p = ghlPipelines.find(pp => pp.id === rule.pipelineId); const s = p?.stages?.find(ss => ss.id === e.target.value); setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], stageId: e.target.value, stageName: s?.name || '' }; return { ...prev, rules } }) }} className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                                <option value="">{t('chatbotEdit.selectStage')}</option>
                                {(ghlPipelines.find(p => p.id === rule.pipelineId)?.stages || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.actions')}</label>
                          {(rule.actions || []).map((action, aIdx) => (
                            <div key={aIdx} className="rounded-lg border border-gray-100 dark:border-dark-border p-2 mb-2 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <select value={action.type} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const actions = [...rules[rIdx].actions]; actions[aIdx] = { ...actions[aIdx], type: e.target.value }; rules[rIdx] = { ...rules[rIdx], actions }; return { ...prev, rules } })} className="flex-1 px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                                  <option value="send_message">{t('chatbotEdit.sendMessage')}</option>
                                  <option value="ai_message">{t('chatbotEdit.aiMessage')}</option>
                                  <option value="move_stage">{t('chatbotEdit.moveStage')}</option>
                                  <option value="add_tag">{t('chatbotEdit.addTagAction')}</option>
                                  <option value="notify_slack">{t('chatbotEdit.notifySlack')}</option>
                                </select>
                                <button onClick={() => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], actions: rules[rIdx].actions.filter((_, i) => i !== aIdx) }; return { ...prev, rules } })} className="text-gray-400 hover:text-red-500"><svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
                              </div>

                              {action.type === 'send_message' && (
                                <textarea value={action.messageTemplate || ''} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const actions = [...rules[rIdx].actions]; actions[aIdx] = { ...actions[aIdx], messageTemplate: e.target.value }; rules[rIdx] = { ...rules[rIdx], actions }; return { ...prev, rules } })} rows={2} placeholder={t('chatbotEdit.messageTemplatePlaceholder')} className="w-full px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white resize-none" />
                              )}

                              {action.type === 'ai_message' && (
                                <div className="space-y-1.5">
                                  <p className="text-[10px] text-blue-500 dark:text-blue-400">{t('chatbotEdit.aiMessageDesc')}</p>
                                  <textarea value={action.aiInstructions || ''} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const actions = [...rules[rIdx].actions]; actions[aIdx] = { ...actions[aIdx], aiInstructions: e.target.value }; rules[rIdx] = { ...rules[rIdx], actions }; return { ...prev, rules } })} rows={3} placeholder={t('chatbotEdit.aiInstructionsPlaceholder')} className="w-full px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white resize-none" />
                                </div>
                              )}

                              {action.type === 'move_stage' && (
                                <div className="grid grid-cols-2 gap-2">
                                  <select value={action.targetStageId || ''} onChange={(e) => { const p = ghlPipelines.find(pp => pp.id === rule.pipelineId); const s = p?.stages?.find(ss => ss.id === e.target.value); setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const actions = [...rules[rIdx].actions]; actions[aIdx] = { ...actions[aIdx], targetStageId: e.target.value, targetStageName: s?.name || '' }; rules[rIdx] = { ...rules[rIdx], actions }; return { ...prev, rules } }) }} className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white">
                                    <option value="">Target stage...</option>
                                    {(ghlPipelines.find(p => p.id === rule.pipelineId)?.stages || ghlPipelines.flatMap(p => p.stages || [])).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                  </select>
                                </div>
                              )}

                              {action.type === 'add_tag' && (
                                <input type="text" value={(action.tags || []).join(', ')} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const actions = [...rules[rIdx].actions]; actions[aIdx] = { ...actions[aIdx], tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }; rules[rIdx] = { ...rules[rIdx], actions }; return { ...prev, rules } })} placeholder="tag1, tag2, tag3" className="w-full px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white" />
                              )}

                              {action.type === 'notify_slack' && (
                                <textarea value={action.slackMessage || ''} onChange={(e) => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; const actions = [...rules[rIdx].actions]; actions[aIdx] = { ...actions[aIdx], slackMessage: e.target.value }; rules[rIdx] = { ...rules[rIdx], actions }; return { ...prev, rules } })} rows={2} placeholder={t('chatbotEdit.slackMessagePlaceholder')} className="w-full px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white resize-none" />
                              )}
                            </div>
                          ))}
                          <button onClick={() => setFollowUpRulesConfig(prev => { const rules = [...prev.rules]; rules[rIdx] = { ...rules[rIdx], actions: [...(rules[rIdx].actions || []), { type: 'send_message', messageTemplate: '', targetStageId: '', targetStageName: '', tags: [], slackMessage: '' }] }; return { ...prev, rules } })} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">+ {t('chatbotEdit.addAction')}</button>
                        </div>
                      </div>
                    ))}

                    {/* Add Rule */}
                    <button onClick={() => setFollowUpRulesConfig(prev => ({ ...prev, rules: [...prev.rules, { name: '', conditionType: 'inactive_conversation', pipelineId: '', pipelineName: '', stageId: '', stageName: '', daysThreshold: 3, actions: [] }] }))} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium">+ {t('chatbotEdit.addRule')}</button>

                    {/* Logs viewer */}
                    <div className="pt-2 border-t border-gray-100 dark:border-dark-border">
                      <button onClick={async () => { if (!showFollowUpLogs) { try { const res = await chatbotsAPI.getFollowUpLogs(id); setFollowUpLogs(res.data) } catch (e) { console.error(e) } } setShowFollowUpLogs(!showFollowUpLogs) }} className="text-[11px] text-gray-400 hover:text-gray-600 font-medium">
                        {showFollowUpLogs ? 'Hide Execution Logs' : 'View Execution Logs'}
                      </button>
                      {showFollowUpLogs && (
                        <div className="mt-2 max-h-48 overflow-y-auto space-y-0.5">
                          {followUpLogs.length === 0 ? (
                            <p className="text-[11px] text-gray-400">No logs yet.</p>
                          ) : followUpLogs.map(log => (
                            <div key={log.id} className="flex items-center gap-2 text-[11px] py-0.5 text-gray-500">
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${log.status === 'completed' ? 'bg-green-400' : 'bg-red-400'}`} />
                              <span className="font-mono">{new Date(log.createdAt).toLocaleString()}</span>
                              <span>Rule #{log.ruleIndex + 1}</span>
                              <span className="text-gray-400">|</span>
                              <span>{log.actionType}</span>
                              <span className="text-gray-400">|</span>
                              <span className="truncate max-w-[100px]">{log.targetId}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Custom Tools ── */}
              <div>
                <button onClick={() => setToolsSection(s => s === 'custom' ? null : 'custom')} className="w-full flex items-center gap-3 px-5 py-3.5 text-left hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${toolsSection === 'custom' ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <svg className="w-4 h-4 text-gray-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" /></svg>
                  <span className="text-sm font-medium text-gray-900 dark:text-white flex-1">{t('chatbotEdit.customTools')}</span>
                  {(() => { const c = tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && !t.name?.startsWith('ghl_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later' && !['list_spreadsheets','get_spreadsheet_info','read_sheet_data','write_sheet_data','append_sheet_rows','create_spreadsheet','list_google_docs','read_google_doc','create_google_doc','append_to_google_doc'].includes(t.name)).length; return c > 0 ? <span className="text-[10px] font-bold text-green-600 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">{c} tool{c > 1 ? 's' : ''}</span> : null })()}
                </button>
                {toolsSection === 'custom' && (
                  <div className="px-5 pb-4">
                    <div className="flex justify-end mb-2">
                      <button onClick={() => { setToolForm({ type: 'apiRequest', name: '', description: '', method: 'POST', url: '', headers: '', body: '', timeoutSeconds: 20 }); setEditingToolIndex(null); setShowToolEditModal(true) }} className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">{t('chatbotEdit.addTool')}</button>
                    </div>
                    {(() => {
                      const visibleTools = tools.filter(t => !t.name?.startsWith('check_calendar_availability_') && !t.name?.startsWith('book_appointment_') && !t.name?.startsWith('ghl_') && t.name !== 'make_call_now' && t.name !== 'schedule_call_later' && !['list_spreadsheets','get_spreadsheet_info','read_sheet_data','write_sheet_data','append_sheet_rows','create_spreadsheet','list_google_docs','read_google_doc','create_google_doc','append_to_google_doc'].includes(t.name))
                      return visibleTools.length === 0 ? (
                        <p className="text-sm text-gray-400 text-center py-4">{t('chatbotEdit.noCustomTools')}</p>
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
                                  <button onClick={() => handleEditTool(realIndex)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg></button>
                                  <button onClick={() => handleDeleteTool(realIndex)} className="p-1.5 text-gray-400 hover:text-red-600 rounded"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

            </div>
            <div className="flex justify-end p-5 border-t border-gray-100 dark:border-dark-border">
              <button onClick={() => { setShowUnifiedToolsModal(false); setToolsSection(null) }} className="px-4 py-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700">{t('chatbotEdit.done')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Tool Add/Edit Modal */}
      {showToolEditModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingToolIndex !== null ? t('chatbotEdit.editTool') : t('chatbotEdit.addToolTitle')}
              </h3>
              <button onClick={() => setShowToolEditModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('chatbotEdit.name')}</label>
                <input
                  type="text"
                  value={toolForm.name}
                  onChange={(e) => setToolForm({ ...toolForm, name: e.target.value })}
                  placeholder="get_weather"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('chatbotEdit.description')}</label>
                <input
                  type="text"
                  value={toolForm.description}
                  onChange={(e) => setToolForm({ ...toolForm, description: e.target.value })}
                  placeholder={t('chatbotEdit.whatThisToolDoes')}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('chatbotEdit.method')}</label>
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
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('chatbotEdit.url')}</label>
                  <input
                    type="url"
                    value={toolForm.url}
                    onChange={(e) => setToolForm({ ...toolForm, url: e.target.value })}
                    placeholder={t('chatbotEdit.urlPlaceholder')}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('chatbotEdit.bodyJsonSchema')}</label>
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
                  {t('chatbotEdit.cancelBtn')}
                </button>
                <button
                  onClick={handleSaveTool}
                  disabled={!toolForm.name || !toolForm.url}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {editingToolIndex !== null ? t('chatbotEdit.updateBtn') : t('chatbotEdit.addBtn')}
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

      {/* Share for Testing Modal */}
      {showShareModal && (() => {
        const shareUrl = shareEnabled && shareToken
          ? `${window.location.origin}/chat/${id}/${shareToken}`
          : ''
        const handleEnable = async () => {
          setShareSaving(true)
          try {
            const { data } = await chatbotsAPI.enableShare(id)
            setShareEnabled(data.enabled)
            setShareToken(data.token)
          } catch (err) {
            alert(err.response?.data?.error || 'Failed to enable sharing')
          } finally {
            setShareSaving(false)
          }
        }
        const handleRegenerate = async () => {
          if (!confirm(t('chatbotEdit.shareRegenerateConfirm'))) return
          setShareSaving(true)
          try {
            const { data } = await chatbotsAPI.regenerateShareToken(id)
            setShareEnabled(data.enabled)
            setShareToken(data.token)
            setShareCopied(false)
          } catch (err) {
            alert(err.response?.data?.error || 'Failed to regenerate token')
          } finally {
            setShareSaving(false)
          }
        }
        const handleDisable = async () => {
          if (!confirm(t('chatbotEdit.shareDisableConfirm'))) return
          setShareSaving(true)
          try {
            await chatbotsAPI.disableShare(id)
            setShareEnabled(false)
          } catch (err) {
            alert(err.response?.data?.error || 'Failed to disable sharing')
          } finally {
            setShareSaving(false)
          }
        }
        const handleCopy = async () => {
          if (!shareUrl) return
          try {
            await navigator.clipboard.writeText(shareUrl)
            setShareCopied(true)
            setTimeout(() => setShareCopied(false), 1500)
          } catch {
            window.prompt('Copy link:', shareUrl)
          }
        }
        const handleSaveLimits = async () => {
          setShareSaving(true)
          try {
            const { data } = await chatbotsAPI.updateShareLimits(id, {
              dailyLimit: Number(shareDailyLimit),
              ipDailyLimit: Number(shareIpDailyLimit)
            })
            setShareDailyLimit(data.dailyLimit)
            setShareIpDailyLimit(data.ipDailyLimit)
          } catch (err) {
            alert(err.response?.data?.error || 'Failed to update limits')
          } finally {
            setShareSaving(false)
          }
        }

        return (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => !shareSaving && setShowShareModal(false)}>
            <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.shareTitle')}</h3>
                <button onClick={() => setShowShareModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="p-5 space-y-5">
                <p className="text-sm text-gray-500 dark:text-gray-400">{t('chatbotEdit.shareDesc')}</p>

                {!shareEnabled ? (
                  <button
                    onClick={handleEnable}
                    disabled={shareSaving}
                    className="w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50"
                  >
                    {shareSaving ? t('chatbotEdit.shareWorking') : t('chatbotEdit.shareEnable')}
                  </button>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.shareLink')}</label>
                      <div className="flex gap-2">
                        <input
                          readOnly
                          value={shareUrl}
                          onFocus={(e) => e.target.select()}
                          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white font-mono text-xs"
                        />
                        <button
                          onClick={handleCopy}
                          className="px-3 py-2 bg-gray-200 dark:bg-dark-bg text-gray-800 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-dark-hover text-xs font-medium border border-gray-300 dark:border-dark-border"
                        >
                          {shareCopied ? t('chatbotEdit.shareCopied') : t('chatbotEdit.shareCopy')}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.shareDailyLimit')}</label>
                        <input
                          type="number"
                          min={1}
                          value={shareDailyLimit}
                          onChange={(e) => setShareDailyLimit(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">{t('chatbotEdit.shareIpDailyLimit')}</label>
                        <input
                          type="number"
                          min={1}
                          value={shareIpDailyLimit}
                          onChange={(e) => setShareIpDailyLimit(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                    <button
                      onClick={handleSaveLimits}
                      disabled={shareSaving}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
                    >
                      {t('chatbotEdit.shareSaveLimits')}
                    </button>

                    <div className="pt-3 border-t border-gray-100 dark:border-dark-border flex gap-2">
                      <button
                        onClick={handleRegenerate}
                        disabled={shareSaving}
                        className="flex-1 px-3 py-2 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/30 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 disabled:opacity-50"
                      >
                        {t('chatbotEdit.shareRegenerate')}
                      </button>
                      <button
                        onClick={handleDisable}
                        disabled={shareSaving}
                        className="flex-1 px-3 py-2 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/30 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
                      >
                        {t('chatbotEdit.shareDisable')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* Clear Memory Modal */}
      {showClearMemoryModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Clear Chatbot Memory</h3>
              <button
                onClick={() => setShowClearMemoryModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Pick what to wipe. This cannot be undone.
              </p>

              <div className="space-y-2">
                <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <input
                    type="radio"
                    name="clearScope"
                    value="all"
                    checked={clearMemoryScope === 'all'}
                    onChange={(e) => setClearMemoryScope(e.target.value)}
                    className="mt-1"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">All sessions</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Wipe memory for every session this chatbot has ever handled.</div>
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <input
                    type="radio"
                    name="clearScope"
                    value="session"
                    checked={clearMemoryScope === 'session'}
                    onChange={(e) => setClearMemoryScope(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">One session</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Wipe memory for a specific sessionId only.</div>
                    {clearMemoryScope === 'session' && (
                      <input
                        type="text"
                        value={clearMemorySessionId}
                        onChange={(e) => setClearMemorySessionId(e.target.value)}
                        placeholder="e.g. default, +5491122334455"
                        className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                      />
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <input
                    type="radio"
                    name="clearScope"
                    value="contact"
                    checked={clearMemoryScope === 'contact'}
                    onChange={(e) => setClearMemoryScope(e.target.value)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">One contact</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Wipe every session linked to a given contactId.</div>
                    {clearMemoryScope === 'contact' && (
                      <input
                        type="text"
                        value={clearMemoryContactId}
                        onChange={(e) => setClearMemoryContactId(e.target.value)}
                        placeholder="GHL contactId or phone number"
                        className="w-full px-3 py-1.5 text-sm rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white"
                      />
                    )}
                  </div>
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 p-4 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={() => setShowClearMemoryModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-dark-hover rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border"
              >
                Cancel
              </button>
              <button
                onClick={handleClearMemory}
                disabled={clearingMemory}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 disabled:opacity-50"
              >
                {clearingMemory ? 'Clearing...' : 'Clear Memory'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Prompt Generator Modal - 3-Step Wizard */}
      {showPromptGenerator && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('chatbotEdit.aiPromptGenerator')}</h3>
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
                    {t('chatbotEdit.generateNew')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPromptMode('update'); setGeneratedPrompt(''); resetWizard() }}
                    className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${promptMode === 'update' ? 'bg-orange-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}
                  >
                    {t('chatbotEdit.updateCurrent')}
                  </button>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

              {/* ── UPDATE MODE ── */}
              {promptMode === 'update' && !generatedPrompt && (
                <>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.language')}</label>
                    <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden w-48">
                      <button type="button" onClick={() => setUpdateLanguage('en')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${updateLanguage === 'en' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{t('chatbotEdit.english')}</button>
                      <button type="button" onClick={() => setUpdateLanguage('es')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${updateLanguage === 'es' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{t('chatbotEdit.spanish')}</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.describeChanges')}</label>
                    <textarea
                      value={updateDescription}
                      onChange={(e) => setUpdateDescription(e.target.value)}
                      rows={4}
                      placeholder={t('chatbotEdit.describeChangesPlaceholder' + (updateLanguage === 'es' ? 'Es' : 'En'))}
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
                        {t('chatbotEdit.updating')}
                      </>
                    ) : t('chatbotEdit.updatePrompt')}
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
                    <span className={wizardStep >= 1 ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>{t('chatbotEdit.botType')}</span>
                    <span className={wizardStep >= 2 ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>{t('chatbotEdit.businessDetails')}</span>
                    <span className={wizardStep >= 3 ? 'text-purple-600 dark:text-purple-400 font-medium' : ''}>{t('chatbotEdit.configuration')}</span>
                  </div>

                  {/* Step 1: Bot Type + Language */}
                  {wizardStep === 1 && (
                    <div className="space-y-4">
                      {/* Bot Type Cards */}
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'sales', icon: '💰', label: t('chatbotEdit.sales'), desc: t('chatbotEdit.salesDesc') },
                          { id: 'support', icon: '🎧', label: t('chatbotEdit.support'), desc: t('chatbotEdit.supportDesc') },
                          { id: 'booking', icon: '📅', label: t('chatbotEdit.booking'), desc: t('chatbotEdit.bookingDesc') },
                          { id: 'survey', icon: '📋', label: t('chatbotEdit.survey'), desc: t('chatbotEdit.surveyDesc') }
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

                      {/* Language Toggle */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.language')}</label>
                        <div className="flex rounded-lg border border-gray-300 dark:border-dark-border overflow-hidden w-48">
                          <button type="button" onClick={() => setWizLanguage('en')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${wizLanguage === 'en' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{t('chatbotEdit.english')}</button>
                          <button type="button" onClick={() => setWizLanguage('es')} className={`flex-1 py-2 px-3 text-sm font-medium transition-colors ${wizLanguage === 'es' ? 'bg-purple-600 text-white' : 'bg-white dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-border'}`}>{t('chatbotEdit.spanish')}</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Business Details */}
                  {wizardStep === 2 && (
                    <div className="space-y-4">
                      {/* Company Name */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.companyName')}</label>
                        <input
                          type="text"
                          value={wizCompanyName}
                          onChange={(e) => setWizCompanyName(e.target.value)}
                          placeholder={t('chatbotEdit.companyNamePlaceholder')}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                        />
                      </div>

                      {/* Industry Dropdown */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.industry')}</label>
                        <select
                          value={wizIndustry}
                          onChange={(e) => setWizIndustry(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                        >
                          <option value="">{t('chatbotEdit.selectIndustry')}</option>
                          <option value="healthcare">{t('chatbotEdit.healthcare')}</option>
                          <option value="realestate">{t('chatbotEdit.realEstate')}</option>
                          <option value="legal">{t('chatbotEdit.legal')}</option>
                          <option value="finance">{t('chatbotEdit.finance')}</option>
                          <option value="education">{t('chatbotEdit.education')}</option>
                          <option value="automotive">{t('chatbotEdit.automotive')}</option>
                          <option value="restaurant">{t('chatbotEdit.restaurant')}</option>
                          <option value="ecommerce">{t('chatbotEdit.ecommerce')}</option>
                          <option value="saas">{t('chatbotEdit.saas')}</option>
                          <option value="insurance">{t('chatbotEdit.insurance')}</option>
                          <option value="homeservices">{t('chatbotEdit.homeServices')}</option>
                          <option value="other">{t('chatbotEdit.other')}</option>
                        </select>
                      </div>

                      {/* Tone Pills */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.tone')}</label>
                        <div className="flex flex-wrap gap-2">
                          {['professional', 'friendly', 'casual', 'formal', 'energetic'].map(tn => (
                            <button
                              key={tn}
                              type="button"
                              onClick={() => setWizTone(tn)}
                              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                                wizTone === tn
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                              }`}
                            >
                              {t(`chatbotEdit.tone_${tn}`)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Goals */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.goalsObjectives')}</label>
                        <textarea
                          value={wizGoals}
                          onChange={(e) => setWizGoals(e.target.value)}
                          rows={3}
                          placeholder={t('chatbotEdit.goalsPlaceholder' + (wizLanguage === 'es' ? 'Es' : 'En'))}
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
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.qualifyingQuestions')}</label>
                            <textarea
                              value={wizTypeConfig.qualifyingQuestions || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, qualifyingQuestions: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.qualifyingQuestionsPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.commonObjections')}</label>
                            <textarea
                              value={wizTypeConfig.commonObjections || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, commonObjections: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.commonObjectionsPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Support-specific fields */}
                      {wizBotType === 'support' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.commonIssues')}</label>
                            <textarea
                              value={wizTypeConfig.commonIssues || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, commonIssues: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.commonIssuesPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.escalationRules')}</label>
                            <textarea
                              value={wizTypeConfig.escalationRules || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, escalationRules: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.escalationRulesPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Booking-specific fields */}
                      {wizBotType === 'booking' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.servicesOffered')}</label>
                            <textarea
                              value={wizTypeConfig.servicesOffered || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, servicesOffered: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.servicesOfferedPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.availabilityNotes')}</label>
                            <textarea
                              value={wizTypeConfig.availabilityNotes || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, availabilityNotes: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.availabilityNotesPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                        </>
                      )}

                      {/* Survey-specific fields */}
                      {wizBotType === 'survey' && (
                        <>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.surveyQuestions')}</label>
                            <textarea
                              value={wizTypeConfig.surveyQuestions || ''}
                              onChange={(e) => setWizTypeConfig(prev => ({ ...prev, surveyQuestions: e.target.value }))}
                              rows={3}
                              placeholder={t('chatbotEdit.surveyQuestionsPlaceholder')}
                              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.ratingScale')}</label>
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
                                  {scale}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}

                      {/* Additional Notes (always shown) */}
                      <div>
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5 block">{t('chatbotEdit.additionalNotes')}</label>
                        <textarea
                          value={wizAdditionalNotes}
                          onChange={(e) => setWizAdditionalNotes(e.target.value)}
                          rows={2}
                          placeholder={t('chatbotEdit.additionalNotesPlaceholder')}
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
                            {t('chatbotEdit.generating')}
                          </>
                        ) : t('chatbotEdit.generatePrompt')}
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* ── Generated Result (both modes) ── */}
              {generatedPrompt && (
                <div className="space-y-3">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300 block">
                    {promptMode === 'update' ? t('chatbotEdit.updatedPrompt') : t('chatbotEdit.generatedPrompt')}
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
              <div className="flex items-center justify-between p-5 border-t border-gray-100 dark:border-dark-border">
                <button
                  onClick={() => setWizardStep(prev => Math.max(1, prev - 1))}
                  disabled={wizardStep === 1}
                  className="flex items-center gap-1 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  {t('chatbotEdit.back')}
                </button>
                {wizardStep < 3 && (
                  <button
                    onClick={() => setWizardStep(prev => Math.min(3, prev + 1))}
                    disabled={(wizardStep === 1 && !wizBotType) || (wizardStep === 2 && (!wizCompanyName.trim() || !wizGoals.trim()))}
                    className="flex items-center gap-1 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {t('chatbotEdit.next')}
                  </button>
                )}
              </div>
            )}

            {/* Result footer (regenerate + use) */}
            {generatedPrompt && (
              <div className="flex items-center justify-between p-5 border-t border-gray-100 dark:border-dark-border">
                <button
                  onClick={() => { setGeneratedPrompt(''); if (promptMode === 'generate') { setWizardStep(3) } }}
                  disabled={generatingPrompt}
                  className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
                >
                  {promptMode === 'update' ? t('chatbotEdit.updateAgain') : t('chatbotEdit.regenerate')}
                </button>
                <button
                  onClick={handleUseGeneratedPrompt}
                  className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                >
                  {t('chatbotEdit.useThisPrompt')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {showExecutionsModal && (() => {
        const detailNodes = selectedExecutionDetail?.nodes || []
        const selectedNode = detailNodes[selectedNodeIdx] || null
        const tabs = [
          { id: 'input', label: 'Input', count: selectedNode?.input ? 1 : 0 },
          { id: 'output', label: 'Output', count: Array.isArray(selectedNode?.output) ? selectedNode.output.reduce((acc, branch) => acc + (Array.isArray(branch) ? branch.length : 0), 0) : (selectedNode?.output ? 1 : 0) },
          { id: 'params', label: 'Parameters' },
          { id: 'error', label: 'Error', hidden: !selectedNode?.error }
        ].filter(t => !t.hidden)
        const currentPayload = selectedNode
          ? (nodeDetailTab === 'input' ? selectedNode.input
            : nodeDetailTab === 'output' ? selectedNode.output
            : nodeDetailTab === 'params' ? selectedNode.parameters
            : nodeDetailTab === 'error' ? selectedNode.error
            : null)
          : null
        const payloadJson = currentPayload !== null && currentPayload !== undefined
          ? JSON.stringify(currentPayload, null, 2)
          : ''
        return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowExecutionsModal(false)}>
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-2xl w-full max-w-[1200px] h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-dark-border">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                  <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">Executions</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">n8n runs for this chatbot's workflow</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={openExecutionsModal}
                  disabled={executionsLoading}
                  title="Refresh"
                  className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover disabled:opacity-50 transition-colors"
                >
                  <svg className={`w-4 h-4 ${executionsLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </button>
                <button onClick={() => setShowExecutionsModal(false)} className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            {executionsError && (
              <div className="mx-5 mt-3 bg-red-500/10 border border-red-500/30 text-red-500 px-4 py-2.5 rounded-lg text-xs">
                {executionsError}
              </div>
            )}
            <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-[260px_300px_1fr] bg-gray-50 dark:bg-dark-bg/50">
              {/* Column 1: executions list */}
              <div className="border-r border-gray-100 dark:border-dark-border overflow-y-auto bg-white dark:bg-dark-card">
                <div className="sticky top-0 bg-white dark:bg-dark-card border-b border-gray-100 dark:border-dark-border px-4 py-2.5">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Runs</div>
                </div>
                {executionsLoading && !executions.length ? (
                  <div className="p-6 text-center text-sm text-gray-500">Loading...</div>
                ) : executions.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500">
                    No executions yet. Send a message to the chatbot to create one.
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-dark-border">
                    {executions.map(exec => {
                      const started = exec.startedAt ? new Date(exec.startedAt) : null
                      const stopped = exec.stoppedAt ? new Date(exec.stoppedAt) : null
                      const durationMs = started && stopped ? (stopped - started) : null
                      const isSel = selectedExecutionId === exec.id
                      return (
                        <li key={exec.id}>
                          <button
                            onClick={() => loadExecutionDetail(exec.id)}
                            className={`w-full text-left px-4 py-3 transition-colors ${isSel ? 'bg-indigo-50 dark:bg-indigo-900/20 border-l-2 border-l-indigo-500' : 'hover:bg-gray-50 dark:hover:bg-dark-hover border-l-2 border-l-transparent'}`}
                          >
                            <div className="flex items-center gap-2 mb-1">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full ${exec.status === 'success' ? 'bg-green-500' : exec.status === 'error' ? 'bg-red-500' : exec.status === 'running' ? 'bg-yellow-500' : 'bg-gray-400'}`} />
                              <span className="text-xs font-medium capitalize text-gray-900 dark:text-white">{exec.status || 'unknown'}</span>
                              <span className="text-[10px] text-gray-400 ml-auto font-mono">#{exec.id}</span>
                            </div>
                            <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                              {started ? started.toLocaleString() : '—'}
                            </div>
                            {durationMs !== null && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{durationMs}ms · {exec.mode || '—'}</div>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Column 2: nodes stepper */}
              <div className="border-r border-gray-100 dark:border-dark-border overflow-y-auto bg-white dark:bg-dark-card">
                <div className="sticky top-0 bg-white dark:bg-dark-card border-b border-gray-100 dark:border-dark-border px-4 py-2.5 flex items-center justify-between">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Nodes</div>
                  {selectedExecutionDetail && (
                    <span className="text-[11px] text-gray-400">{detailNodes.length} ran</span>
                  )}
                </div>
                {!selectedExecutionId ? (
                  <div className="p-6 text-center text-xs text-gray-500">Pick a run on the left.</div>
                ) : executionDetailLoading ? (
                  <div className="p-6 text-center text-xs text-gray-500">Loading nodes...</div>
                ) : detailNodes.length === 0 ? (
                  <div className="p-6 text-center text-xs text-gray-500">No node run data.</div>
                ) : (
                  <ol className="p-3 space-y-0">
                    {detailNodes.map((n, idx) => {
                      const isSel = selectedNodeIdx === idx
                      return (
                        <li key={`${n.nodeName}-${n.runIndex}-${idx}`} className="relative">
                          {idx > 0 && (
                            <div className="absolute left-[22px] -top-2 w-px h-2 bg-gray-200 dark:bg-dark-border" />
                          )}
                          <button
                            onClick={() => { setSelectedNodeIdx(idx); if (n.error) setNodeDetailTab('error'); else setNodeDetailTab('output') }}
                            className={`w-full text-left flex items-start gap-3 px-2.5 py-2.5 rounded-lg transition-colors ${isSel ? 'bg-indigo-50 dark:bg-indigo-900/20 ring-1 ring-inset ring-indigo-200 dark:ring-indigo-800' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                          >
                            <div className={`flex-shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-semibold ${n.status === 'error' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                              {n.status === 'error' ? '!' : idx + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-gray-900 dark:text-white truncate">{n.nodeName}</div>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {n.nodeType && (
                                  <span className="text-[10px] font-mono text-gray-500 dark:text-gray-400 truncate">{nodeTypeLabel(n.nodeType)}</span>
                                )}
                                {typeof n.executionTime === 'number' && (
                                  <>
                                    <span className="text-[10px] text-gray-300 dark:text-gray-600">·</span>
                                    <span className="text-[10px] text-gray-500 dark:text-gray-400">{n.executionTime}ms</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </button>
                          {idx < detailNodes.length - 1 && (
                            <div className="absolute left-[22px] top-[46px] w-px h-2 bg-gray-200 dark:bg-dark-border" />
                          )}
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>

              {/* Column 3: node detail with tabs */}
              <div className="overflow-hidden flex flex-col bg-white dark:bg-dark-card">
                {!selectedNode ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-gray-400 p-8 text-center">
                    {selectedExecutionId ? 'Pick a node to see its data.' : 'Pick a run, then a node, to inspect input, output, and parameters.'}
                  </div>
                ) : (
                  <>
                    <div className="border-b border-gray-100 dark:border-dark-border px-5 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-block w-1.5 h-1.5 rounded-full ${selectedNode.status === 'error' ? 'bg-red-500' : 'bg-green-500'}`} />
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{selectedNode.nodeName}</h4>
                        {typeof selectedNode.executionTime === 'number' && (
                          <span className="ml-auto text-[11px] text-gray-500">{selectedNode.executionTime}ms</span>
                        )}
                      </div>
                      {selectedNode.nodeType && (
                        <div className="text-[11px] font-mono text-gray-500 dark:text-gray-400">{selectedNode.nodeType}</div>
                      )}
                    </div>
                    <div className="border-b border-gray-100 dark:border-dark-border px-4 flex items-center gap-1 overflow-x-auto">
                      {tabs.map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setNodeDetailTab(tab.id)}
                          className={`px-3 py-2.5 text-xs font-medium border-b-2 transition-colors whitespace-nowrap ${nodeDetailTab === tab.id ? (tab.id === 'error' ? 'border-red-500 text-red-600 dark:text-red-400' : 'border-indigo-500 text-indigo-600 dark:text-indigo-400') : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                        >
                          {tab.label}
                          {typeof tab.count === 'number' && tab.count > 0 && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-400">{tab.count}</span>
                          )}
                        </button>
                      ))}
                      <button
                        onClick={() => copyToClipboard(payloadJson)}
                        disabled={!payloadJson}
                        title="Copy JSON"
                        className="ml-auto p-2 text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-hover disabled:opacity-30 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-auto">
                      {nodeDetailTab === 'error' && selectedNode.error ? (
                        <div className="p-5 space-y-3">
                          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                            <div className="text-sm font-semibold text-red-600 dark:text-red-400">{selectedNode.error.name || 'Error'}</div>
                            <div className="text-sm text-red-500 dark:text-red-400 mt-1">{selectedNode.error.message}</div>
                            {selectedNode.error.description && (
                              <div className="text-xs text-red-400 dark:text-red-500 mt-2">{selectedNode.error.description}</div>
                            )}
                          </div>
                          {selectedNode.error.stack && (
                            <pre className="text-[11px] font-mono bg-gray-50 dark:bg-dark-bg border border-gray-100 dark:border-dark-border rounded-lg p-3 overflow-auto text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{selectedNode.error.stack}</pre>
                          )}
                        </div>
                      ) : payloadJson ? (
                        <pre className="text-[11px] font-mono p-5 text-gray-800 dark:text-gray-200 leading-relaxed whitespace-pre-wrap break-words">{payloadJson}</pre>
                      ) : (
                        <div className="p-8 text-center text-xs text-gray-400">
                          {nodeDetailTab === 'input' ? 'No input captured for this node.'
                            : nodeDetailTab === 'output' ? 'No output captured for this node.'
                            : nodeDetailTab === 'params' ? 'No parameters.'
                            : 'Nothing to show.'}
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
        )
      })()}

    </div>
  )
}

// Reusable picker for GHL contact / opportunity custom field writes attached to
// an opportunity-upsert action. Each row binds one custom field to either a
// static value or an AI-defined value driven by an instruction.
function CustomFieldsBlock({ title, emptyText, addLabel, fields, fieldOptions, onLoadFields, onChange, t }) {
  const update = (idx, patch) => {
    const next = fields.map((f, i) => i === idx ? { ...f, ...patch } : f)
    onChange(next)
  }
  const add = async () => {
    await onLoadFields?.()
    onChange([...(fields || []), { fieldId: '', fieldName: '', fieldKey: '', mode: 'ai', value: '', instruction: '' }])
  }
  const remove = (idx) => onChange(fields.filter((_, i) => i !== idx))

  return (
    <div className="rounded-xl bg-white/60 dark:bg-white/[0.02] border border-gray-200 dark:border-dark-border p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">{title}</span>
        <button type="button" onClick={add} className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-medium px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-500/10 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v12m6-6H6" /></svg>
          {addLabel}
        </button>
      </div>
      {(!fields || fields.length === 0) && (
        <p className="text-[11px] text-gray-400 text-center py-2">{emptyText}</p>
      )}
      {fields?.map((f, i) => (
        <div key={i} className="rounded-lg bg-gray-50 dark:bg-white/[0.03] p-2.5 mb-2 last:mb-0 space-y-2">
          <div className="flex gap-2 items-center">
            <select
              value={f.fieldId}
              onFocus={onLoadFields}
              onChange={(e) => {
                const sel = fieldOptions.find((opt) => opt.id === e.target.value)
                update(i, {
                  fieldId: e.target.value,
                  fieldName: sel?.name || '',
                  fieldKey: sel?.fieldKey || ''
                })
              }}
              className="flex-1 px-2.5 py-1.5 text-xs rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            >
              <option value="">{t('chatbotEdit.selectCustomField')}</option>
              {fieldOptions.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.name}{opt.dataType ? ` (${opt.dataType})` : ''}</option>
              ))}
            </select>
            <button type="button" onClick={() => remove(i)} className="text-gray-400 hover:text-red-500 p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11px]">
            <label className={`inline-flex items-center gap-1 cursor-pointer px-2 py-1 rounded-md ${f.mode !== 'static' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' : 'text-gray-500 dark:text-gray-400'}`}>
              <input type="radio" className="sr-only" name={`cf-mode-${title}-${i}`} checked={f.mode !== 'static'} onChange={() => update(i, { mode: 'ai' })} />
              {t('chatbotEdit.cfModeAi')}
            </label>
            <label className={`inline-flex items-center gap-1 cursor-pointer px-2 py-1 rounded-md ${f.mode === 'static' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-300' : 'text-gray-500 dark:text-gray-400'}`}>
              <input type="radio" className="sr-only" name={`cf-mode-${title}-${i}`} checked={f.mode === 'static'} onChange={() => update(i, { mode: 'static' })} />
              {t('chatbotEdit.cfModeStatic')}
            </label>
          </div>
          {f.mode === 'static' ? (
            <input
              type="text"
              value={f.value || ''}
              onChange={(e) => update(i, { value: e.target.value })}
              placeholder={t('chatbotEdit.cfStaticPlaceholder')}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          ) : (
            <input
              type="text"
              value={f.instruction || ''}
              onChange={(e) => update(i, { instruction: e.target.value })}
              placeholder={t('chatbotEdit.cfInstructionPlaceholder')}
              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-transparent bg-white dark:bg-dark-bg/70 text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          )}
        </div>
      ))}
    </div>
  )
}
