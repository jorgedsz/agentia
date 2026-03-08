import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { chatbotsAPI, promptGeneratorAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { MODELS_BY_PROVIDER } from '../../constants/models'

const CHATBOT_MODELS = MODELS_BY_PROVIDER['openai'].filter(m => m.model.startsWith('gpt-'))

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
  { id: 'respond_to_webhook', label: 'Respond to Webhook', description: 'Responds directly to the incoming webhook request' },
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
  const [chatbotType, setChatbotType] = useState('standard')
  const [language, setLanguage] = useState('en')
  const [systemPrompt, setSystemPrompt] = useState('')
  const [modelName, setModelName] = useState('gpt-4o')

  // Output configuration
  const [outputType, setOutputType] = useState('respond_to_webhook')
  const [outputUrl, setOutputUrl] = useState('')
  const [isActive, setIsActive] = useState(true)

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
      setChatbotType(cb.chatbotType || 'standard')
      setOutputType(cb.outputType || 'respond_to_webhook')
      setOutputUrl(cb.outputUrl || '')
      setIsActive(cb.isActive !== false)

      const config = cb.config || {}
      setLanguage(config.language || 'en')
      setSystemPrompt(config.systemPromptBase || config.systemPrompt || '')
      setModelName(config.modelName || 'gpt-4o')
      setTools(config.tools || [])
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
      await chatbotsAPI.update(id, {
        name,
        chatbotType,
        outputType,
        outputUrl: outputType !== 'respond_to_webhook' ? outputUrl : '',
        config: {
          systemPrompt,
          systemPromptBase: systemPrompt,
          language,
          modelProvider: 'openai',
          modelName,
          tools,
          outputType,
          outputUrl: outputType !== 'respond_to_webhook' ? outputUrl : '',
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
        language: language,
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
            rows={8}
            className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-y font-mono text-sm"
          />
          <p className="text-xs text-gray-400 mt-2">{systemPrompt.length} characters</p>
        </div>

        {/* Model & Language */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Model Selection */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Model</h3>
            <select
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {CHATBOT_MODELS.map(m => (
                <option key={m.model} value={m.model}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Language */}
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

      </div>

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
