import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chatbotsAPI, promptGeneratorAPI, voicesAPI, pricingAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { TRANSCRIBER_PROVIDERS, MODELS_BY_PROVIDER } from '../../constants/models'

const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'it', label: 'Italian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'nl', label: 'Dutch' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'zh', label: 'Chinese' },
]

const OUTPUT_TYPES = [
  { id: 'respond_to_webhook', label: 'Respond to Webhook', description: 'n8n responds directly to the incoming webhook request' },
  { id: 'external_webhook', label: 'External Webhook', description: 'Send the response to an external webhook URL' },
  { id: 'http_request', label: 'HTTP Request', description: 'Send the response via HTTP request to a custom URL' },
]

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
  const [description, setDescription] = useState('')
  const [chatbotType, setChatbotType] = useState('standard')
  const [language, setLanguage] = useState('en')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [firstMessage, setFirstMessage] = useState('')
  const [modelProvider, setModelProvider] = useState('openai')
  const [modelName, setModelName] = useState('gpt-4o')

  // Output configuration
  const [outputType, setOutputType] = useState('respond_to_webhook')
  const [outputUrl, setOutputUrl] = useState('')
  const [n8nWebhookUrl, setN8nWebhookUrl] = useState('')
  const [n8nWorkflowId, setN8nWorkflowId] = useState('')
  const [isActive, setIsActive] = useState(true)

  // Voice settings (same as Agent)
  const [voiceProvider, setVoiceProvider] = useState('11labs')
  const [voiceId, setVoiceId] = useState('')
  const [showVoicePicker, setShowVoicePicker] = useState(false)
  const [voicesList, setVoicesList] = useState([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [voiceSearch, setVoiceSearch] = useState('')
  const [previewPlayingId, setPreviewPlayingId] = useState(null)
  const voiceAudioRef = useRef(null)

  // Transcriber
  const [transcriberProvider, setTranscriberProvider] = useState('deepgram')
  const [transcriberLanguage, setTranscriberLanguage] = useState('multi')

  // Voice tuning
  const [voiceSettings, setVoiceSettings] = useState({
    model: 'eleven_multilingual_v2',
    stability: 0.5,
    similarityBoost: 0.75,
    speed: 1,
  })

  // Tools
  const [tools, setTools] = useState([])
  const [showToolModal, setShowToolModal] = useState(false)
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
  const [generatedFirstMessage, setGeneratedFirstMessage] = useState('')

  // Advanced settings
  const [showAdvancedModal, setShowAdvancedModal] = useState(false)
  const [serverUrl, setServerUrl] = useState('')
  const [maxDurationSeconds, setMaxDurationSeconds] = useState(1800)
  const [silenceTimeoutSeconds, setSilenceTimeoutSeconds] = useState(30)

  // Load chatbot data
  useEffect(() => {
    fetchChatbot()
  }, [id])

  const fetchChatbot = async () => {
    try {
      setLoading(true)
      const { data } = await chatbotsAPI.get(id)
      const cb = data.chatbot
      setChatbot(cb)

      setName(cb.name || '')
      setDescription(cb.description || '')
      setChatbotType(cb.chatbotType || 'standard')
      setOutputType(cb.outputType || 'respond_to_webhook')
      setOutputUrl(cb.outputUrl || '')
      setN8nWebhookUrl(cb.n8nWebhookUrl || '')
      setN8nWorkflowId(cb.n8nWorkflowId || '')
      setIsActive(cb.isActive !== false)

      const config = cb.config || {}
      setLanguage(config.language || 'en')
      setSystemPrompt(config.systemPromptBase || config.systemPrompt || '')
      setFirstMessage(config.firstMessage || '')
      setModelProvider(config.modelProvider || 'openai')
      setModelName(config.modelName || 'gpt-4o')
      setVoiceProvider(config.voiceProvider || '11labs')
      setVoiceId(config.voiceId || '')
      setTranscriberProvider(config.transcriberProvider || 'deepgram')
      setTranscriberLanguage(config.transcriberLanguage || 'multi')
      setTools(config.tools || [])
      setServerUrl(config.serverUrl || '')
      setMaxDurationSeconds(config.maxDurationSeconds || 1800)
      setSilenceTimeoutSeconds(config.silenceTimeoutSeconds || 30)

      if (config.stability !== undefined) {
        setVoiceSettings(prev => ({
          ...prev,
          model: config.elevenLabsModel || 'eleven_multilingual_v2',
          stability: config.stability ?? 0.5,
          similarityBoost: config.similarityBoost ?? 0.75,
          speed: config.speed ?? 1,
        }))
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load chatbot')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const response = await chatbotsAPI.update(id, {
        name,
        description,
        chatbotType,
        outputType,
        outputUrl: outputType !== 'respond_to_webhook' ? outputUrl : '',
        config: {
          systemPrompt,
          systemPromptBase: systemPrompt,
          firstMessage,
          language,
          modelProvider,
          modelName,
          voiceProvider,
          voiceId,
          transcriberProvider,
          transcriberLanguage,
          elevenLabsModel: voiceSettings.model,
          stability: voiceSettings.stability,
          similarityBoost: voiceSettings.similarityBoost,
          speed: voiceSettings.speed,
          tools,
          serverUrl,
          maxDurationSeconds,
          silenceTimeoutSeconds,
          outputType,
          outputUrl: outputType !== 'respond_to_webhook' ? outputUrl : '',
        }
      })

      if (response.data?.n8nWarning) {
        setError(response.data.n8nWarning)
        setTimeout(() => setError(''), 10000)
      } else {
        setSuccess('Chatbot saved successfully')
        setTimeout(() => setSuccess(''), 3000)
      }

      // Update local state with response
      if (response.data?.chatbot) {
        const updated = response.data.chatbot
        setN8nWorkflowId(updated.n8nWorkflowId || n8nWorkflowId)
        setN8nWebhookUrl(updated.n8nWebhookUrl || n8nWebhookUrl)
      }
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

  // Voice picker
  const fetchVoices = async () => {
    setVoicesLoading(true)
    try {
      const { data } = await voicesAPI.list()
      setVoicesList(data.voices || [])
    } catch (err) {
      console.error('Failed to fetch voices:', err)
    } finally {
      setVoicesLoading(false)
    }
  }

  const playVoicePreview = (voice) => {
    if (previewPlayingId === voice.voice_id) {
      voiceAudioRef.current?.pause()
      setPreviewPlayingId(null)
      return
    }
    if (!voice.preview_url) return
    if (voiceAudioRef.current) voiceAudioRef.current.pause()
    const audio = new Audio(voice.preview_url)
    voiceAudioRef.current = audio
    setPreviewPlayingId(voice.voice_id)
    audio.play()
    audio.onended = () => setPreviewPlayingId(null)
  }

  // Prompt generator
  const handleGeneratePrompt = async () => {
    if (!promptDescription.trim()) return
    setGeneratingPrompt(true)
    try {
      const { data } = await promptGeneratorAPI.generate({
        description: promptDescription,
        language: language,
        direction: 'chatbot'
      })
      setGeneratedPrompt(data.systemPrompt || '')
      setGeneratedFirstMessage(data.firstMessage || '')
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
    setShowToolModal(false)
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
    setShowToolModal(true)
  }

  const handleDeleteTool = (index) => {
    setTools(tools.filter((_, i) => i !== index))
  }

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text)
    setSuccess('Copied to clipboard')
    setTimeout(() => setSuccess(''), 2000)
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

  const availableModels = MODELS_BY_PROVIDER[modelProvider] || []

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
              {n8nWorkflowId && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  n8n #{n8nWorkflowId}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
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
        {/* Output Configuration */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Output Configuration</h3>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {OUTPUT_TYPES.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setOutputType(type.id)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    outputType === type.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 dark:border-dark-border hover:border-gray-300'
                  }`}
                >
                  <div className={`text-sm font-medium ${outputType === type.id ? 'text-primary-700 dark:text-primary-400' : 'text-gray-900 dark:text-white'}`}>
                    {type.label}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">{type.description}</div>
                </button>
              ))}
            </div>

            {outputType !== 'respond_to_webhook' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Destination URL
                </label>
                <input
                  type="url"
                  value={outputUrl}
                  onChange={(e) => setOutputUrl(e.target.value)}
                  placeholder="https://your-endpoint.com/webhook"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            )}

            {n8nWebhookUrl && (
              <div className="bg-gray-50 dark:bg-dark-bg rounded-lg p-3">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">n8n Webhook URL</label>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-gray-700 dark:text-gray-300 flex-1 truncate">{n8nWebhookUrl}</code>
                  <button
                    onClick={() => copyToClipboard(n8nWebhookUrl)}
                    className="flex-shrink-0 p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 rounded"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Description</h3>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What does this chatbot do?"
            rows={2}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
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
            rows={8}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">{systemPrompt.length} characters</p>
        </div>

        {/* First Message */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">First Message</h3>
          <textarea
            value={firstMessage}
            onChange={(e) => setFirstMessage(e.target.value)}
            placeholder="Hello! How can I help you today?"
            rows={3}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
          />
        </div>

        {/* Model & Voice */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Model Selection */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Model</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={modelProvider}
                  onChange={(e) => {
                    setModelProvider(e.target.value)
                    const models = MODELS_BY_PROVIDER[e.target.value] || []
                    if (models.length > 0) setModelName(models[0].model)
                  }}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {Object.keys(MODELS_BY_PROVIDER).map(p => (
                    <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  {availableModels.map(m => (
                    <option key={m.model} value={m.model}>{m.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Voice Selection */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Voice</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Provider</label>
                <select
                  value={voiceProvider}
                  onChange={(e) => setVoiceProvider(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="11labs">ElevenLabs</option>
                  <option value="vapi">VAPI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Voice ID</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={voiceId}
                    onChange={(e) => setVoiceId(e.target.value)}
                    placeholder="Voice ID"
                    className="flex-1 px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    onClick={() => { fetchVoices(); setShowVoicePicker(true) }}
                    className="px-3 py-2 text-sm text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100"
                  >
                    Browse
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Language & Transcriber */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Language</h3>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {LANGUAGES.map(l => (
                <option key={l.id} value={l.id}>{l.label}</option>
              ))}
            </select>
          </div>

          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Transcriber</h3>
            <select
              value={transcriberProvider}
              onChange={(e) => setTranscriberProvider(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {TRANSCRIBER_PROVIDERS.map(p => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Tools */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Tools</h3>
            <button
              onClick={() => {
                setToolForm({ type: 'apiRequest', name: '', description: '', method: 'POST', url: '', headers: '', body: '', timeoutSeconds: 20 })
                setEditingToolIndex(null)
                setShowToolModal(true)
              }}
              className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium"
            >
              + Add Tool
            </button>
          </div>

          {tools.length === 0 ? (
            <p className="text-sm text-gray-400">No tools configured. Add API request tools for your chatbot to call.</p>
          ) : (
            <div className="space-y-2">
              {tools.map((tool, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-bg rounded-lg">
                  <div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{tool.name || tool.type}</span>
                    <span className="text-xs text-gray-400 ml-2">{tool.method} {tool.url?.substring(0, 40)}{tool.url?.length > 40 ? '...' : ''}</span>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleEditTool(i)} className="p-1.5 text-gray-400 hover:text-primary-600 rounded">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button onClick={() => handleDeleteTool(i)} className="p-1.5 text-gray-400 hover:text-red-600 rounded">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Advanced Settings */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <button
            onClick={() => setShowAdvancedModal(!showAdvancedModal)}
            className="flex items-center justify-between w-full"
          >
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">Advanced Settings</h3>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${showAdvancedModal ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showAdvancedModal && (
            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Webhook Server URL</label>
                <input
                  type="url"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  placeholder="https://your-server.com/webhook"
                  className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max Duration (seconds)</label>
                  <input
                    type="number"
                    value={maxDurationSeconds}
                    onChange={(e) => setMaxDurationSeconds(parseInt(e.target.value) || 1800)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Silence Timeout (seconds)</label>
                  <input
                    type="number"
                    value={silenceTimeoutSeconds}
                    onChange={(e) => setSilenceTimeoutSeconds(parseInt(e.target.value) || 30)}
                    className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Voice Picker Modal */}
      {showVoicePicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Select Voice</h3>
              <button onClick={() => setShowVoicePicker(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <input
                type="text"
                value={voiceSearch}
                onChange={(e) => setVoiceSearch(e.target.value)}
                placeholder="Search voices..."
                className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {voicesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : (
                <div className="space-y-2">
                  {voicesList
                    .filter(v => !voiceSearch || v.name?.toLowerCase().includes(voiceSearch.toLowerCase()))
                    .map(voice => (
                      <div
                        key={voice.voice_id}
                        className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                          voiceId === voice.voice_id
                            ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-300 dark:border-primary-700'
                            : 'hover:bg-gray-50 dark:hover:bg-dark-hover border border-transparent'
                        }`}
                        onClick={() => { setVoiceId(voice.voice_id); setShowVoicePicker(false) }}
                      >
                        <div>
                          <span className="text-sm font-medium text-gray-900 dark:text-white">{voice.name}</span>
                          <span className="text-xs text-gray-400 ml-2">{voice.labels?.gender} {voice.labels?.accent}</span>
                        </div>
                        {voice.preview_url && (
                          <button
                            onClick={(e) => { e.stopPropagation(); playVoicePreview(voice) }}
                            className="p-1.5 text-gray-400 hover:text-primary-600 rounded"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              {previewPlayingId === voice.voice_id ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                              ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                              )}
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tool Modal */}
      {showToolModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingToolIndex !== null ? 'Edit Tool' : 'Add Tool'}
              </h3>
              <button onClick={() => setShowToolModal(false)} className="p-1 text-gray-400 hover:text-gray-600 rounded">
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
                  onClick={() => setShowToolModal(false)}
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

      {/* Prompt Generator Modal */}
      {showPromptGenerator && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-lg p-6">
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
                rows={4}
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
                      rows={6}
                      className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                    />
                  </div>
                  {generatedFirstMessage && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Generated First Message</label>
                      <textarea
                        value={generatedFirstMessage}
                        onChange={(e) => setGeneratedFirstMessage(e.target.value)}
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-gray-50 dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                      />
                    </div>
                  )}
                  <button
                    onClick={() => {
                      setSystemPrompt(generatedPrompt)
                      if (generatedFirstMessage) setFirstMessage(generatedFirstMessage)
                      setShowPromptGenerator(false)
                      setGeneratedPrompt('')
                      setGeneratedFirstMessage('')
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
