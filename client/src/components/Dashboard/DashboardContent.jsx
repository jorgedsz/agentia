import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { agentsAPI, usersAPI, callsAPI, phoneNumbersAPI, pricingAPI } from '../../services/api'
import TestCallModal from './TestCallModal'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

const ELEVENLABS_MODELS = [
  { id: 'eleven_multilingual_v2', label: 'Multilingual v2 (Best quality)' },
  { id: 'eleven_flash_v2_5', label: 'Flash v2.5 (Low latency)' },
  { id: 'eleven_flash_v2', label: 'Flash v2 (Low latency)' },
  { id: 'eleven_turbo_v2_5', label: 'Turbo v2.5 (Fast)' },
  { id: 'eleven_turbo_v2', label: 'Turbo v2 (Fast)' },
  { id: 'eleven_multilingual_v1', label: 'Multilingual v1' },
  { id: 'eleven_monolingual_v1', label: 'Monolingual v1 (English only)' },
]

const BACKGROUND_SOUNDS = [
  { id: 'off', label: 'Off' },
  { id: 'office', label: 'Office' },
]

const PUNCTUATION_BOUNDARIES = [
  { id: 'none', label: 'No Punctuation Boundaries Added' },
  { id: 'all', label: 'All Punctuation' },
  { id: 'sentence', label: 'Sentence Endings Only' },
]

const VOICE_OPTIONS = [
  // Eleven Labs - Female Voices
  { provider: '11labs', voiceId: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel - Calm Female (11Labs)' },
  { provider: '11labs', voiceId: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella - Soft Female (11Labs)' },
  { provider: '11labs', voiceId: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli - Emotional Female (11Labs)' },
  { provider: '11labs', voiceId: 'AZnzlk1XvdvUeBnXmlld', label: 'Domi - Strong Female (11Labs)' },
  { provider: '11labs', voiceId: 'XB0fDUnXU5powFXDhCwa', label: 'Charlotte - Swedish Female (11Labs)' },
  { provider: '11labs', voiceId: 'Xb7hH8MSUJpSbSDYk0k2', label: 'Alice - Confident Female (11Labs)' },
  { provider: '11labs', voiceId: 'pFZP5JQG7iQjIQuC4Bku', label: 'Lily - Warm Female (11Labs)' },
  { provider: '11labs', voiceId: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda - Friendly Female (11Labs)' },
  { provider: '11labs', voiceId: 'cgSgspJ2msm6clMCkdW9', label: 'Jessica - Expressive Female (11Labs)' },
  { provider: '11labs', voiceId: 'FGY2WhTYpPnrIDTdsKH5', label: 'Laura - Upbeat Female (11Labs)' },
  { provider: '11labs', voiceId: 'ThT5KcBeYPX3keUQqHPh', label: 'Dorothy - Pleasant Female (11Labs)' },
  { provider: '11labs', voiceId: 'jsCqWAovK2LkecY7zXl4', label: 'Freya - Expressive Female (11Labs)' },
  { provider: '11labs', voiceId: 'oWAxZDx7w5VEj9dCyTzz', label: 'Grace - Southern Female (11Labs)' },
  { provider: '11labs', voiceId: 'z9fAnlkpzviPz146aGWa', label: 'Glinda - Witch Female (11Labs)' },
  { provider: '11labs', voiceId: 'piTKgcLEGmPE4e6mEKli', label: 'Nicole - Whisper Female (11Labs)' },
  // Eleven Labs - Male Voices
  { provider: '11labs', voiceId: 'ErXwobaYiN019PkySvjV', label: 'Antoni - Well-rounded Male (11Labs)' },
  { provider: '11labs', voiceId: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh - Deep Male (11Labs)' },
  { provider: '11labs', voiceId: 'VR6AewLTigWG4xSOukaG', label: 'Arnold - Crisp Male (11Labs)' },
  { provider: '11labs', voiceId: 'pNInz6obpgDQGcFmaJgB', label: 'Adam - Deep Male (11Labs)' },
  { provider: '11labs', voiceId: 'yoZ06aMxZJJ28mfd3POQ', label: 'Sam - Raspy Male (11Labs)' },
  { provider: '11labs', voiceId: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel - Authoritative Male (11Labs)' },
  { provider: '11labs', voiceId: 'iP95p4xoKVk53GoZ742B', label: 'Chris - Casual Male (11Labs)' },
  { provider: '11labs', voiceId: 'nPczCjzI2devNBz1zQrb', label: 'Brian - Deep Male (11Labs)' },
  { provider: '11labs', voiceId: 'cjVigY5qzO86Huf0OWal', label: 'Eric - Friendly Male (11Labs)' },
  { provider: '11labs', voiceId: 'IKne3meq5aSn9XLyUdCD', label: 'Charlie - Australian Male (11Labs)' },
  { provider: '11labs', voiceId: 'JBFqnCBsd6RMkjVDRZzb', label: 'George - British Male (11Labs)' },
  { provider: '11labs', voiceId: 'N2lVS1w4EtoT3dr4eOWO', label: 'Callum - Intense Male (11Labs)' },
  { provider: '11labs', voiceId: 'ODq5zmih8GrVes37Dizd', label: 'Patrick - Shouty Male (11Labs)' },
  { provider: '11labs', voiceId: 'SOYHLrjzK2X1ezoPC6cr', label: 'Harry - Anxious Male (11Labs)' },
  { provider: '11labs', voiceId: 'TX3LPaxmHKxFdv7VOQHJ', label: 'Liam - Articulate Male (11Labs)' },
  { provider: '11labs', voiceId: 'bIHbv24MWmeRgasZH58o', label: 'Will - Friendly Male (11Labs)' },
  { provider: '11labs', voiceId: 'flq6f7yk4E4fJM5XTYuZ', label: 'Michael - Narrator Male (11Labs)' },
  { provider: '11labs', voiceId: 'g5CIjZEefAph4nQFvHAz', label: 'Ethan - Narrator Male (11Labs)' },
  { provider: '11labs', voiceId: 'ZQe5CZNOzWyzPSCn5a3c', label: 'James - Australian Male (11Labs)' },
  { provider: '11labs', voiceId: 'GBv7mTt0atIp3Br8iCZE', label: 'Thomas - Calm Male (11Labs)' },
  // Eleven Labs - Multilingual
  { provider: '11labs', voiceId: 'pMsXgVXv3BLzUgSXRplE', label: 'Serena - Multilingual (11Labs)' },
  { provider: '11labs', voiceId: 'nPczCjzI2devNBz1zQrb', label: 'Brian - Multilingual (11Labs)' },
  // Custom 11Labs option
  { provider: '11labs', voiceId: 'custom', label: 'Custom Voice ID (11Labs)' },
  // OpenAI Voices
  { provider: 'openai', voiceId: 'alloy', label: 'Alloy (OpenAI)' },
  { provider: 'openai', voiceId: 'echo', label: 'Echo (OpenAI)' },
  { provider: 'openai', voiceId: 'fable', label: 'Fable (OpenAI)' },
  { provider: 'openai', voiceId: 'onyx', label: 'Onyx (OpenAI)' },
  { provider: 'openai', voiceId: 'nova', label: 'Nova (OpenAI)' },
  { provider: 'openai', voiceId: 'shimmer', label: 'Shimmer (OpenAI)' },
  // PlayHT Voices
  { provider: 'playht', voiceId: 'jennifer', label: 'Jennifer (PlayHT)' },
  { provider: 'playht', voiceId: 'melissa', label: 'Melissa (PlayHT)' },
  { provider: 'playht', voiceId: 'will', label: 'Will (PlayHT)' },
  { provider: 'playht', voiceId: 'chris', label: 'Chris (PlayHT)' },
]

const LLM_MODELS = [
  // OpenAI
  { provider: 'openai', model: 'gpt-4o', label: 'GPT-4o (OpenAI)' },
  { provider: 'openai', model: 'gpt-4o-mini', label: 'GPT-4o Mini (OpenAI)' },
  { provider: 'openai', model: 'gpt-4o-realtime-preview', label: 'GPT-4o Realtime (OpenAI)' },
  { provider: 'openai', model: 'gpt-4-turbo', label: 'GPT-4 Turbo (OpenAI)' },
  { provider: 'openai', model: 'gpt-4', label: 'GPT-4 (OpenAI)' },
  { provider: 'openai', model: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo (OpenAI)' },
  // Anthropic
  { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Anthropic)' },
  { provider: 'anthropic', model: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku (Anthropic)' },
  { provider: 'anthropic', model: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Anthropic)' },
  { provider: 'anthropic', model: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet (Anthropic)' },
  { provider: 'anthropic', model: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Anthropic)' },
  // Google
  { provider: 'google', model: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash (Google)' },
  { provider: 'google', model: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Google)' },
  { provider: 'google', model: 'gemini-1.5-pro-latest', label: 'Gemini 1.5 Pro Latest (Google)' },
  { provider: 'google', model: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Google)' },
  { provider: 'google', model: 'gemini-1.5-flash-latest', label: 'Gemini 1.5 Flash Latest (Google)' },
  { provider: 'google', model: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro (Google)' },
  // Groq (fast inference)
  { provider: 'groq', model: 'llama-3.3-70b-versatile', label: 'Llama 3.3 70B Versatile (Groq)' },
  { provider: 'groq', model: 'llama-3.1-70b-versatile', label: 'Llama 3.1 70B Versatile (Groq)' },
  { provider: 'groq', model: 'llama-3.1-8b-instant', label: 'Llama 3.1 8B Instant (Groq)' },
  { provider: 'groq', model: 'llama3-70b-8192', label: 'Llama 3 70B (Groq)' },
  { provider: 'groq', model: 'llama3-8b-8192', label: 'Llama 3 8B (Groq)' },
  { provider: 'groq', model: 'mixtral-8x7b-32768', label: 'Mixtral 8x7B (Groq)' },
  { provider: 'groq', model: 'gemma2-9b-it', label: 'Gemma 2 9B (Groq)' },
  // Together AI
  { provider: 'together-ai', model: 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo', label: 'Llama 3.1 405B Turbo (Together)' },
  { provider: 'together-ai', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct-Turbo', label: 'Llama 3.1 70B Turbo (Together)' },
  { provider: 'together-ai', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo', label: 'Llama 3.1 8B Turbo (Together)' },
  { provider: 'together-ai', model: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B (Together)' },
  { provider: 'together-ai', model: 'mistralai/Mistral-7B-Instruct-v0.2', label: 'Mistral 7B (Together)' },
  { provider: 'together-ai', model: 'Qwen/Qwen2-72B-Instruct', label: 'Qwen 2 72B (Together)' },
  // DeepInfra
  { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-405B-Instruct', label: 'Llama 3.1 405B (DeepInfra)' },
  { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-70B-Instruct', label: 'Llama 3.1 70B (DeepInfra)' },
  { provider: 'deepinfra', model: 'meta-llama/Meta-Llama-3.1-8B-Instruct', label: 'Llama 3.1 8B (DeepInfra)' },
  { provider: 'deepinfra', model: 'mistralai/Mixtral-8x22B-Instruct-v0.1', label: 'Mixtral 8x22B (DeepInfra)' },
  // Anyscale
  { provider: 'anyscale', model: 'meta-llama/Meta-Llama-3-70B-Instruct', label: 'Llama 3 70B (Anyscale)' },
  { provider: 'anyscale', model: 'mistralai/Mixtral-8x7B-Instruct-v0.1', label: 'Mixtral 8x7B (Anyscale)' },
  // Perplexity
  { provider: 'perplexity-ai', model: 'llama-3.1-sonar-large-128k-online', label: 'Sonar Large Online (Perplexity)' },
  { provider: 'perplexity-ai', model: 'llama-3.1-sonar-small-128k-online', label: 'Sonar Small Online (Perplexity)' },
  { provider: 'perplexity-ai', model: 'llama-3.1-sonar-huge-128k-online', label: 'Sonar Huge Online (Perplexity)' },
  // xAI
  { provider: 'xai', model: 'grok-beta', label: 'Grok Beta (xAI)' },
  { provider: 'xai', model: 'grok-2', label: 'Grok 2 (xAI)' },
  { provider: 'xai', model: 'grok-2-mini', label: 'Grok 2 Mini (xAI)' },
  // Cerebras (ultra fast)
  { provider: 'cerebras', model: 'llama3.1-70b', label: 'Llama 3.1 70B (Cerebras)' },
  { provider: 'cerebras', model: 'llama3.1-8b', label: 'Llama 3.1 8B (Cerebras)' },
]

export default function DashboardContent({ tab }) {
  const { user } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [stats, setStats] = useState({})
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState([])
  const [agencies, setAgencies] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [testCallAgent, setTestCallAgent] = useState(null)
  const [phoneCallAgent, setPhoneCallAgent] = useState(null)
  const [overviewData, setOverviewData] = useState(null)
  const [modelRates, setModelRates] = useState({})
  const [transcriberRates, setTranscriberRates] = useState({})

  const quickCreateAgent = async (agentType = 'outbound') => {
    try {
      setCreating(true)
      const response = await agentsAPI.create({
        name: 'New Agent',
        agentType,
        config: {
          agentType,
          modelProvider: 'openai',
          modelName: 'gpt-4o',
          voiceProvider: '11labs',
          voiceId: 'pFZP5JQG7iQjIQuC4Bku',
        }
      })
      navigate(`/dashboard/agent/${response.data.agent.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create agent')
    } finally {
      setCreating(false)
    }
  }

  // Auto-create agent from URL params (?create=outbound or ?create=inbound)
  useEffect(() => {
    const createType = searchParams.get('create')
    if (createType && (createType === 'outbound' || createType === 'inbound')) {
      searchParams.delete('create')
      setSearchParams(searchParams, { replace: true })
      quickCreateAgent(createType)
    }
  }, [searchParams])

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [tab, user?.id, user?.role])

  const fetchData = async () => {
    if (!user) return
    setLoading(true)
    try {
      const statsRes = await usersAPI.getStats()
      setStats(statsRes.data.stats)

      if (tab === 'overview') {
        const [agentsRes, overviewRes] = await Promise.all([
          agentsAPI.list(),
          usersAPI.getOverview()
        ])
        setAgents(agentsRes.data.agents)
        setOverviewData(overviewRes.data)
      } else if (tab === 'agents') {
        const [agentsRes, modelsRes, transcribersRes] = await Promise.all([
          agentsAPI.list(),
          pricingAPI.getModelRates(),
          pricingAPI.getTranscriberRates()
        ])
        setAgents(agentsRes.data.agents)
        const mRates = {}
        ;(modelsRes.data.rates || []).forEach(r => { mRates[`${r.provider}::${r.model}`] = r.rate })
        setModelRates(mRates)
        const tRates = {}
        ;(transcribersRes.data.rates || []).forEach(r => { tRates[r.provider] = r.rate })
        setTranscriberRates(tRates)
      }
      if (tab === 'clients' && (user.role === ROLES.OWNER || user.role === ROLES.AGENCY)) {
        const clientsRes = await usersAPI.getClients()
        setClients(clientsRes.data.clients)
      }
      if (tab === 'agencies' && user.role === ROLES.OWNER) {
        const agenciesRes = await usersAPI.getAgencies()
        setAgencies(agenciesRes.data.agencies)
      }
      if (tab === 'all-users' && user.role === ROLES.OWNER) {
        const usersRes = await usersAPI.getAll()
        setAllUsers(usersRes.data.users)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (type) => {
    setCreating(true)
    setError('')
    try {
      if (type === 'agent') {
        const [provider, model] = (formData.llmModel || 'openai:gpt-4').split(':')
        const [voiceProvider, voiceId] = (formData.voice || '11labs:21m00Tcm4TlvDq8ikWAM').split(':')
        const finalVoiceId = voiceId === 'custom' ? formData.customVoiceId : voiceId
        const voiceSettings = formData.voiceSettings || {}
        const response = await agentsAPI.create({
          name: formData.name,
          agentType: formData.agentType || 'outbound',
          config: {
            agentType: formData.agentType || 'outbound',
            systemPrompt: formData.systemPrompt || undefined,
            modelProvider: provider,
            modelName: model,
            voiceProvider: voiceProvider,
            voiceId: finalVoiceId,
            ...(voiceProvider === '11labs' && {
              elevenLabsModel: voiceSettings.model || 'eleven_multilingual_v2',
              stability: voiceSettings.stability,
              similarityBoost: voiceSettings.similarityBoost,
              speed: voiceSettings.speed,
              style: voiceSettings.style,
              useSpeakerBoost: voiceSettings.useSpeakerBoost,
              optimizeLatency: voiceSettings.optimizeLatency,
              inputMinCharacters: voiceSettings.inputMinCharacters,
              backgroundSound: voiceSettings.backgroundSound,
              backgroundSoundUrl: voiceSettings.backgroundSoundUrl,
            })
          }
        })
        setAgents([response.data.agent, ...agents])
      } else if (type === 'client') {
        const response = await usersAPI.createClient(formData)
        setClients([response.data.client, ...clients])
      } else if (type === 'agency') {
        const response = await usersAPI.createAgency(formData)
        setAgencies([response.data.agency, ...agencies])
      }
      setShowModal(null)
      setFormData({})
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (type, id) => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return
    try {
      if (type === 'agent') {
        await agentsAPI.delete(id)
        setAgents(agents.filter(a => a.id !== id))
      } else {
        await usersAPI.delete(id)
        setClients(clients.filter(c => c.id !== id))
      }
    } catch (err) {
      alert(`Failed to delete ${type}`)
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case ROLES.OWNER: return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case ROLES.AGENCY: return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const getPageTitle = () => {
    switch (tab) {
      case 'overview': return t('sidebar.overview')
      case 'agents': return t('sidebar.myAgents')
      case 'clients': return t('sidebar.clients')
      case 'agencies': return t('sidebar.agencies')
      case 'all-users': return t('sidebar.allUsers')
      default: return tab.replace('-', ' ')
    }
  }

  return (
    <>
      <header className="bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border px-6 py-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
              {getPageTitle()}
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
              {t('dashboardContent.manageAgentsAndClients')}
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">Client ID: {user?.id}</span>
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(tab === 'agents' || tab === 'overview') && (
              <button
                onClick={() => quickCreateAgent()}
                disabled={creating}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {creating ? (
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                {t('dashboardContent.newAgent')}
              </button>
            )}
            {tab === 'clients' && (
              <button
                onClick={() => { setShowModal('client'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboardContent.addClient')}
              </button>
            )}
            {tab === 'agencies' && (
              <button
                onClick={() => { setShowModal('agency'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboardContent.addAgency')}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="p-6">
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {tab === 'overview' && (
              <OverviewDashboard
                overviewData={overviewData}
                user={user}
                agents={agents}
                navigate={navigate}
                setTestCallAgent={setTestCallAgent}
                handleDelete={handleDelete}
                setShowModal={setShowModal}
                setFormData={setFormData}
              />
            )}

            {tab === 'agents' && (
              <div>
                {agents.length === 0 ? (
                  <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                    <EmptyState type="agents" onCreate={() => quickCreateAgent()} />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="px-3 py-1 text-sm font-medium text-gray-300 bg-[#1e2024] border border-gray-700/50 rounded-lg">
                        {agents.length} {agents.length === 1 ? 'agent' : 'agents'}
                      </span>
                    </div>
                    {agents.map((agent) => (
                      <AgentCard key={agent.id} agent={agent} modelRates={modelRates} transcriberRates={transcriberRates} onDelete={() => handleDelete('agent', agent.id)} onEdit={() => navigate(`/dashboard/agent/${agent.id}`)} onTest={() => agent.vapiId && setTestCallAgent(agent)} onPhoneCall={() => agent.vapiId && setPhoneCallAgent(agent)} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {tab === 'clients' && (
              <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
                {clients.length === 0 ? (
                  <div className="p-6">
                    <EmptyState type="clients" onCreate={() => { setShowModal('client'); setFormData({}); }} />
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-dark-hover">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.name')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.email')}</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('sidebar.myAgents')}</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.actions')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                      {clients.map((client) => (
                        <tr key={client.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                          <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{client.name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{client.email}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{client._count?.agents || 0}</td>
                          <td className="px-6 py-4 text-right">
                            <button onClick={() => handleDelete('client', client.id)} className="text-red-500 hover:text-red-700 text-sm">{t('common.delete')}</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'agencies' && user?.role === ROLES.OWNER && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agencies.length === 0 ? (
                  <div className="col-span-full bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                    <EmptyState type="agencies" onCreate={() => { setShowModal('agency'); setFormData({}); }} />
                  </div>
                ) : (
                  agencies.map((agency) => (
                    <div key={agency.id} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{agency.name || 'Unnamed Agency'}</h3>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{agency.email}</p>
                      <div className="text-sm text-gray-600 dark:text-gray-300">
                        <span className="font-medium text-primary-500">{agency._count?.clients || 0}</span> clients
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}

            {tab === 'all-users' && user?.role === ROLES.OWNER && (
              <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-dark-hover">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.name')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.email')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.role')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('credits.agency')}</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('sidebar.myAgents')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                    {allUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{u.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{u.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(u.role)}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{u.agency?.name || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{u._count?.agents || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </main>

      {showModal === 'client' && (
        <Modal title={t('dashboardContent.addNewClient')} onClose={() => setShowModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate('client'); }}>
            {error && <ErrorAlert message={error} />}
            <Input label={t('common.name')} value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} />
            <Input label={`${t('common.email')} *`} type="email" value={formData.email || ''} onChange={(v) => setFormData({...formData, email: v})} required />
            <Input label={`${t('common.password')} *`} type="password" value={formData.password || ''} onChange={(v) => setFormData({...formData, password: v})} required />
            <ModalActions onCancel={() => setShowModal(null)} loading={creating} submitText={t('dashboardContent.addClient')} />
          </form>
        </Modal>
      )}

      {showModal === 'agency' && (
        <Modal title={t('dashboardContent.addNewAgency')} onClose={() => setShowModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate('agency'); }}>
            {error && <ErrorAlert message={error} />}
            <Input label={t('dashboardContent.agentName')} value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} />
            <Input label={`${t('common.email')} *`} type="email" value={formData.email || ''} onChange={(v) => setFormData({...formData, email: v})} required />
            <Input label={`${t('common.password')} *`} type="password" value={formData.password || ''} onChange={(v) => setFormData({...formData, password: v})} required />
            <ModalActions onCancel={() => setShowModal(null)} loading={creating} submitText={t('dashboardContent.addAgency')} />
          </form>
        </Modal>
      )}

      {testCallAgent && (
        <TestCallModal agent={testCallAgent} onClose={() => setTestCallAgent(null)} />
      )}

      {phoneCallAgent && (
        <PhoneCallModal agent={phoneCallAgent} onClose={() => setPhoneCallAgent(null)} />
      )}
    </>
  )
}

function OverviewDashboard({ overviewData, user, agents, navigate, setTestCallAgent, handleDelete, setShowModal, setFormData }) {
  const { t } = useLanguage()
  const data = overviewData || {}

  const callsChange = data.callsYesterday > 0
    ? Math.round(((data.callsToday - data.callsYesterday) / data.callsYesterday) * 100)
    : data.callsToday > 0 ? 100 : 0

  const formatDuration = (seconds) => {
    if (!seconds) return '0m'
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    const hrs = Math.floor(mins / 60)
    return `${hrs}h ${mins % 60}m`
  }

  const AVATAR_COLORS = ['bg-teal-500', 'bg-purple-500', 'bg-amber-500', 'bg-blue-500', 'bg-rose-500', 'bg-emerald-500', 'bg-indigo-500']

  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg px-3 py-2 shadow-lg">
          <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{payload[0].value} {t('overview.calls')}</p>
        </div>
      )
    }
    return null
  }

  return (
    <div className="space-y-6">
      {/* Row 1: Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Calls Today */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overview.callsToday')}</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{data.callsToday || 0}</p>
              <p className="text-xs mt-1">
                <span className={callsChange >= 0 ? 'text-green-500' : 'text-red-500'}>
                  {callsChange >= 0 ? '+' : ''}{callsChange}%
                </span>
                <span className="text-gray-400 dark:text-gray-500 ml-1">{t('overview.vsYesterday')}</span>
              </p>
            </div>
            <div className="w-12 h-12 bg-teal-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active Agents */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overview.activeAgents')}</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{data.totalAgents || 0}</p>
              <p className="text-xs mt-1">
                <span className="text-green-500">+{data.newAgentsThisWeek || 0}</span>
                <span className="text-gray-400 dark:text-gray-500 ml-1">{t('overview.thisWeek')}</span>
              </p>
            </div>
            <div className="w-12 h-12 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Total Balance */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overview.totalBalance')}</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">${(data.totalBalance || 0).toFixed(2)}</p>
              <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">{t('settings.creditsBalance')}</p>
            </div>
            <div className="w-12 h-12 bg-amber-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Active Clients (OWNER/AGENCY) or Total Calls (CLIENT) */}
        {(user?.role === ROLES.OWNER || user?.role === ROLES.AGENCY) ? (
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overview.activeClients')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{data.totalClients || 0}</p>
                <p className="text-xs mt-1">
                  <span className="text-green-500">+{data.newClientsThisMonth || 0}</span>
                  <span className="text-gray-400 dark:text-gray-500 ml-1">{t('overview.thisMonth')}</span>
                </p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('overview.totalCalls')}</p>
                <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{data.summary?.totalCalls || 0}</p>
                <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">{t('overview.thisWeek')}</p>
              </div>
              <div className="w-12 h-12 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-6 h-6 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Row 2: Chart + Agents */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Calls Overview Chart */}
        <div className="lg:col-span-3 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('overview.callsOverview')}</h2>
          {data.dailyCalls && data.dailyCalls.length > 0 ? (
            <>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data.dailyCalls} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6b7280" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6b7280" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" className="dark:opacity-20" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 12, fill: '#9ca3af' }}
                      tickFormatter={(v) => {
                        const d = new Date(v + 'T00:00:00')
                        return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                      }}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} allowDecimals={false} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="count" stroke="#6b7280" fill="url(#colorCalls)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('overview.totalCalls')}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.summary?.totalCalls || 0}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('overview.totalDuration')}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{formatDuration(data.summary?.totalDuration)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('overview.totalCost')}</p>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">${(data.summary?.totalCost || 0).toFixed(2)}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400 dark:text-gray-500">
              {t('overview.noDataYet')}
            </div>
          )}
        </div>

        {/* Right: Agents List + Top Clients */}
        <div className="lg:col-span-2 space-y-6">
          {/* Agents */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('overview.agents')}</h2>
              <button onClick={() => navigate('/dashboard/agents')} className="text-sm text-primary-500 hover:text-primary-400">
                {t('overview.viewAll')} &gt;
              </button>
            </div>
            {data.topAgents && data.topAgents.length > 0 ? (
              <div className="space-y-3">
                {data.topAgents.map((agent, idx) => (
                  <div key={agent.id} className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[idx % AVATAR_COLORS.length]} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                      {(agent.name || '?')[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{agent.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {agent.calls} {t('overview.calls')} &middot; ${agent.cost.toFixed(2)} &middot; {Math.round(agent.duration / 60)}{t('overview.min')}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{agent.calls}</p>
                      <p className="text-xs text-gray-400">${agent.cost.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('overview.noDataYet')}</p>
            )}
          </div>

          {/* Top Clients (OWNER/AGENCY only) */}
          {(user?.role === ROLES.OWNER || user?.role === ROLES.AGENCY) && (
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('overview.topClients')}</h2>
                <button onClick={() => navigate('/dashboard/clients')} className="text-sm text-primary-500 hover:text-primary-400">
                  {t('overview.viewAll')} &gt;
                </button>
              </div>
              {data.topClients && data.topClients.length > 0 ? (
                <div className="space-y-3">
                  {data.topClients.map((client, idx) => (
                    <div key={client.id} className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full ${AVATAR_COLORS[(idx + 3) % AVATAR_COLORS.length]} flex items-center justify-center text-white text-sm font-semibold flex-shrink-0`}>
                        {(client.name || '?')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{client.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{client.calls} {t('overview.calls')}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white">{client.calls}</p>
                        <p className="text-xs text-gray-400">{Math.round(client.duration / 60)}{t('overview.min')} &middot; ${client.cost.toFixed(2)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">{t('overview.noDataYet')}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent, modelRates, transcriberRates, onDelete, onEdit, onTest, onPhoneCall }) {
  const { t } = useLanguage()
  const [copied, setCopied] = useState(false)
  const type = agent.agentType || agent.config?.agentType || 'outbound'
  const hasPhone = agent.phoneNumbers && agent.phoneNumbers.length > 0

  const badges = []
  if (type === 'inbound' || hasPhone) badges.push({ label: t('dashboardContent.inbound'), color: 'border-blue-500/30 text-blue-400' })
  if (type === 'outbound' || hasPhone) badges.push({ label: t('dashboardContent.outbound'), color: 'border-green-500/30 text-green-400' })

  // Compute pricing from agent config
  const modelKey = agent.config?.modelProvider && agent.config?.modelName
    ? `${agent.config.modelProvider}::${agent.config.modelName}` : null
  const modelRate = modelKey && modelRates ? modelRates[modelKey] : null
  const transcriberRate = agent.config?.transcriberProvider && transcriberRates
    ? transcriberRates[agent.config.transcriberProvider] : null
  const totalRate = (modelRate || 0) + (transcriberRate || 0)
  const hasRate = modelRate != null || transcriberRate != null

  const displayId = agent.vapiId || agent.id
  const copyId = () => {
    navigator.clipboard.writeText(String(displayId))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-[#1e2024] overflow-hidden">
      <div className="p-5 space-y-3">
        {/* Row 1: Name + Status */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">{agent.name}</h3>
            <span className="w-6 h-6 rounded-md bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center text-[10px] font-medium text-gray-400">
              {(agent.config?.modelProvider || 'o')[0].toLowerCase()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {hasRate && (
              <span
                className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-lg border border-amber-500/30 text-amber-400 bg-amber-500/10"
                title={`Model: $${(modelRate || 0).toFixed(4)}/min${transcriberRate ? ` + Transcriber: $${transcriberRate.toFixed(4)}/min` : ''}`}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                ${totalRate.toFixed(4)}/min
              </span>
            )}
            <span className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg border ${
              agent.vapiId
                ? 'border-green-500/30 text-green-400 bg-green-500/10'
                : 'border-gray-600/30 text-gray-500 bg-gray-500/10'
            }`}>
              {agent.vapiId && <span className="w-2 h-2 rounded-full bg-green-400" />}
              {agent.vapiId ? t('common.connected') : t('common.local')}
            </span>
          </div>
        </div>

        {/* Row 2: ID + Copy + Direction badges */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-gray-500 dark:text-gray-500">
            ID: {displayId}
          </span>
          <button
            onClick={copyId}
            className="p-0.5 text-gray-500 hover:text-gray-300 transition-colors"
            title="Copy ID"
          >
            {copied ? (
              <svg className="w-3.5 h-3.5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )}
          </button>
          {badges.map((b, i) => (
            <span key={i} className={`px-2 py-0.5 text-[10px] font-medium rounded border ${b.color}`}>
              {b.label}
            </span>
          ))}
        </div>

        {/* Row 3: Description */}
        {agent.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-3">
            {agent.description}
          </p>
        )}

        {/* Row 4: Actions */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={onEdit}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600/40 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252830] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              {t('common.edit')}
            </button>
            <button
              onClick={onTest}
              disabled={!agent.vapiId}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600/40 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252830] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={agent.vapiId ? 'Web Call' : 'Agent not connected to VAPI'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
              Web Call
            </button>
            <button
              onClick={onPhoneCall}
              disabled={!agent.vapiId}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg border border-gray-200 dark:border-gray-600/40 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252830] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
              title={agent.vapiId ? 'Phone Call' : 'Agent not connected to VAPI'}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              Phone Call
            </button>
          </div>
          <button
            onClick={onDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

function PhoneCallModal({ agent, onClose }) {
  const { t } = useLanguage()
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [selectedPhoneId, setSelectedPhoneId] = useState('')
  const [customerNumber, setCustomerNumber] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [loading, setLoading] = useState(true)
  const [calling, setCalling] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    phoneNumbersAPI.list().then(({ data }) => {
      const nums = data.phoneNumbers || []
      setPhoneNumbers(nums)
      if (nums.length > 0) setSelectedPhoneId(nums[0].id)
      setLoading(false)
    }).catch(() => {
      setError('Failed to load phone numbers')
      setLoading(false)
    })
  }, [])

  const handleCall = async () => {
    if (!selectedPhoneId || !customerNumber) return
    setCalling(true)
    setError('')
    setResult(null)
    try {
      const { data } = await callsAPI.create({
        agentId: agent.id,
        phoneNumberId: selectedPhoneId,
        customerNumber,
        customerName: customerName || undefined
      })
      setResult(data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to initiate call')
    } finally {
      setCalling(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e2024] rounded-xl w-full max-w-md shadow-2xl border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
          <div>
            <h3 className="text-base font-semibold text-gray-200">Phone Call</h3>
            <p className="text-xs text-gray-500 mt-0.5">{agent.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-400" />
            </div>
          ) : (
            <>
              {/* From number */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">From Number</label>
                {phoneNumbers.length === 0 ? (
                  <p className="text-sm text-red-400">No phone numbers available. Import one first.</p>
                ) : (
                  <select
                    value={selectedPhoneId}
                    onChange={(e) => setSelectedPhoneId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#16181c] border border-gray-700/50 text-sm text-gray-200 focus:outline-none focus:border-gray-500"
                  >
                    {phoneNumbers.map((pn) => (
                      <option key={pn.id} value={pn.id}>{pn.number || pn.phoneNumber}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Customer number */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Customer Phone Number *</label>
                <input
                  type="tel"
                  value={customerNumber}
                  onChange={(e) => setCustomerNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-3 py-2 rounded-lg bg-[#16181c] border border-gray-700/50 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
              </div>

              {/* Customer name (optional) */}
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1.5">Customer Name (optional)</label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 rounded-lg bg-[#16181c] border border-gray-700/50 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-500/10 px-3 py-2 rounded-lg">{error}</p>
              )}

              {result && (
                <div className="text-sm text-green-400 bg-green-500/10 px-3 py-2 rounded-lg">
                  Call initiated successfully! ID: {result.callId || result.id}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={onClose}
                  className="flex-1 px-4 py-2 text-sm font-medium rounded-lg border border-gray-600/40 text-gray-300 hover:bg-[#252830] transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleCall}
                  disabled={calling || !selectedPhoneId || !customerNumber || phoneNumbers.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {calling ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                    </svg>
                  )}
                  {calling ? 'Calling...' : 'Start Call'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function EmptyState({ type, onCreate }) {
  const { t } = useLanguage()
  const content = {
    agents: { icon: '🤖', title: t('dashboardContent.noAgentsYet'), desc: t('dashboardContent.createFirstAgent'), btn: t('dashboardContent.newAgent') },
    clients: { icon: '👤', title: t('dashboardContent.noClientsYet'), desc: t('dashboardContent.addFirstClient'), btn: t('dashboardContent.addClient') },
    agencies: { icon: '🏢', title: t('dashboardContent.noAgenciesYet'), desc: t('dashboardContent.addFirstAgency'), btn: t('dashboardContent.addAgency') },
  }
  const c = content[type]
  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-4">{c.icon}</div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{c.title}</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-4">{c.desc}</p>
      <button onClick={onCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
        {c.btn}
      </button>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Input({ label, type = 'text', value, onChange, required = false }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        required={required}
      />
    </div>
  )
}

function TextArea({ label, value, onChange }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        rows={4}
      />
    </div>
  )
}

function ModelSelect({ value, onChange }) {
  const { t } = useLanguage()
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboardContent.llmModel')}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {LLM_MODELS.map(m => (
          <option key={`${m.provider}:${m.model}`} value={`${m.provider}:${m.model}`}>
            {m.label}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t('dashboardContent.selectAiModel')}</p>
    </div>
  )
}

function VoiceSelect({ value, onChange, customVoiceId, onCustomVoiceIdChange, voiceSettings, onVoiceSettingsChange }) {
  const { t } = useLanguage()
  const isCustom = value === '11labs:custom'
  const is11Labs = value.startsWith('11labs:')
  const [showAdvanced, setShowAdvanced] = useState(false)

  const updateSetting = (key, val) => {
    onVoiceSettingsChange({ ...voiceSettings, [key]: val })
  }

  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('dashboardContent.voice')}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {VOICE_OPTIONS.map(v => (
          <option key={`${v.provider}:${v.voiceId}`} value={`${v.provider}:${v.voiceId}`}>
            {v.label}
          </option>
        ))}
      </select>
      {isCustom && (
        <input
          type="text"
          value={customVoiceId || ''}
          onChange={(e) => onCustomVoiceIdChange(e.target.value)}
          placeholder="Enter Eleven Labs Voice ID"
          className="w-full mt-2 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      )}
      {is11Labs && (
        <div className="mt-2 space-y-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">11Labs Model</label>
            <select
              value={voiceSettings?.model || 'eleven_multilingual_v2'}
              onChange={(e) => updateSetting('model', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {ELEVENLABS_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-sm text-primary-500 hover:text-primary-400 flex items-center gap-1"
          >
            {showAdvanced ? '▼' : '▶'} Advanced Voice Settings
          </button>

          {showAdvanced && (
            <div className="p-3 bg-gray-100 dark:bg-dark-hover/50 rounded-lg space-y-3 border border-gray-200 dark:border-dark-border">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Background Sound</label>
                  <select
                    value={voiceSettings?.backgroundSound || 'off'}
                    onChange={(e) => updateSetting('backgroundSound', e.target.value)}
                    className="w-full px-2 py-1.5 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded text-sm text-gray-900 dark:text-white"
                  >
                    {BACKGROUND_SOUNDS.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Input Min Characters</label>
                  <input
                    type="number"
                    value={voiceSettings?.inputMinCharacters || 30}
                    onChange={(e) => updateSetting('inputMinCharacters', parseInt(e.target.value))}
                    className="w-full px-2 py-1.5 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded text-sm text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Background Sound URL (optional)</label>
                <input
                  type="text"
                  value={voiceSettings?.backgroundSoundUrl || ''}
                  onChange={(e) => updateSetting('backgroundSoundUrl', e.target.value)}
                  placeholder="https://example.com/sound.mp3"
                  className="w-full px-2 py-1.5 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded text-sm text-gray-900 dark:text-white placeholder-gray-400"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Stability: {voiceSettings?.stability ?? 0.5}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={voiceSettings?.stability ?? 0.5}
                  onChange={(e) => updateSetting('stability', parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>More Variable</span><span>More Stable</span></div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Clarity + Similarity: {voiceSettings?.similarityBoost ?? 0.75}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={voiceSettings?.similarityBoost ?? 0.75}
                  onChange={(e) => updateSetting('similarityBoost', parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>Low</span><span>High</span></div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Speed: {voiceSettings?.speed ?? 1}</label>
                <input
                  type="range"
                  min="0.5"
                  max="1.2"
                  step="0.1"
                  value={voiceSettings?.speed ?? 1}
                  onChange={(e) => updateSetting('speed', parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>Slower</span><span>Faster</span></div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Style Exaggeration: {voiceSettings?.style ?? 0}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={voiceSettings?.style ?? 0}
                  onChange={(e) => updateSetting('style', parseFloat(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>None (Fastest)</span><span>Exaggerated</span></div>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Optimize Streaming Latency: {voiceSettings?.optimizeLatency ?? 0}</label>
                <input
                  type="range"
                  min="0"
                  max="4"
                  step="1"
                  value={voiceSettings?.optimizeLatency ?? 0}
                  onChange={(e) => updateSetting('optimizeLatency', parseInt(e.target.value))}
                  className="w-full accent-primary-500"
                />
                <div className="flex justify-between text-xs text-gray-400"><span>More Latency</span><span>Less Latency</span></div>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Use Speaker Boost</label>
                  <p className="text-xs text-gray-400">Boost similarity at cost of speed</p>
                </div>
                <button
                  type="button"
                  onClick={() => updateSetting('useSpeakerBoost', !voiceSettings?.useSpeakerBoost)}
                  className={`w-11 h-6 rounded-full transition-colors ${voiceSettings?.useSpeakerBoost ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform ${voiceSettings?.useSpeakerBoost ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{t('dashboardContent.selectVoice')}</p>
    </div>
  )
}

function ErrorAlert({ message }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
      {message}
    </div>
  )
}

function ModalActions({ onCancel, loading, submitText }) {
  const { t } = useLanguage()
  return (
    <div className="flex gap-3 mt-6">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
      >
        {t('common.cancel')}
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
      >
        {loading ? t('common.creating') : submitText}
      </button>
    </div>
  )
}
