import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { chatbotsAPI } from '../../services/api'

export default function ChatbotList() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { darkMode } = useTheme()
  const { t } = useLanguage()
  const [chatbots, setChatbots] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [clearingMemoryId, setClearingMemoryId] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchChatbots()
  }, [])

  const fetchChatbots = async () => {
    try {
      setLoading(true)
      const { data } = await chatbotsAPI.list()
      setChatbots(data.chatbots || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch chatbots')
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (agentKind) => {
    setCreating(true)
    try {
      const baseConfig = {
        agentKind,
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        systemPrompt: agentKind === 'sql_agent'
          ? 'You are a SQL analyst. Translate the user question into a read-only SQL query, run it against the connected database, then answer in plain language.'
          : 'You are a helpful assistant.'
      }
      if (agentKind === 'sql_agent') {
        baseConfig.database = { type: 'postgres', connectionString: '' }
      }
      const { data } = await chatbotsAPI.create({
        name: agentKind === 'sql_agent' ? 'New SQL Agent' : 'New Chatbot',
        chatbotType: 'standard',
        outputType: 'respond_to_webhook',
        config: baseConfig
      })
      navigate(`/dashboard/chatbot/${data.chatbot.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create chatbot')
    } finally {
      setCreating(false)
      setShowCreateModal(false)
    }
  }

  const handleToggle = async (id) => {
    try {
      const { data } = await chatbotsAPI.toggle(id)
      setChatbots(chatbots.map(c => c.id === id ? { ...c, isActive: data.chatbot.isActive } : c))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to toggle chatbot')
    }
  }

  const handleClearMemory = async (id, name) => {
    if (!window.confirm(`Clear the conversation memory for every session of "${name}"? This cannot be undone.`)) return
    setClearingMemoryId(id)
    try {
      await chatbotsAPI.clearMemory(id)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to clear memory')
    } finally {
      setClearingMemoryId(null)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to archive "${name}"? The chatbot will be deactivated and its n8n workflow preserved.`)) return
    try {
      await chatbotsAPI.delete(id)
      setChatbots(chatbots.filter(c => c.id !== id))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete chatbot')
    }
  }

  const outputTypeLabels = {
    'respond_to_webhook': 'Respond to Webhook',
    'external_webhook': 'External Webhook',
    'http_request': 'HTTP Request'
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Chatbots</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Manage your chatbots
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Chatbot
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-medium hover:text-red-300">x</button>
        </div>
      )}

      {/* Chatbot Grid */}
      {chatbots.length === 0 ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <div className="w-16 h-16 bg-primary-100 dark:bg-primary-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No chatbots yet</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">Create your first chatbot to get started.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            Create Chatbot
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chatbots.map((chatbot) => (
            <div
              key={chatbot.id}
              className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 hover:shadow-md transition-shadow"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                    {chatbot.name}
                  </h3>
                </div>
                <button
                  onClick={() => handleToggle(chatbot.id)}
                  className={`ml-3 flex-shrink-0 px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                    chatbot.isActive
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400'
                  }`}
                >
                  {chatbot.isActive ? 'Active' : 'Inactive'}
                </button>
              </div>

              {/* Badges */}
              <div className="flex flex-wrap gap-2 mb-4">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-md bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                  {outputTypeLabels[chatbot.outputType] || chatbot.outputType}
                </span>
                {chatbot.config?.modelProvider && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-md bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400">
                    {chatbot.config.modelName || chatbot.config.modelProvider}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-100 dark:border-dark-border">
                <button
                  onClick={() => navigate(`/dashboard/chatbot/${chatbot.id}`)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={() => handleClearMemory(chatbot.id, chatbot.name)}
                  disabled={clearingMemoryId === chatbot.id}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
                  title="Clear memory"
                >
                  {clearingMemoryId === chatbot.id ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(chatbot.id, chatbot.name)}
                  className="flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => !creating && setShowCreateModal(false)}>
          <div className="bg-white dark:bg-dark-card rounded-xl max-w-2xl w-full p-6 border border-gray-200 dark:border-dark-border" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-1">Choose chatbot type</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">Pick how this chatbot should work. You can change its configuration later.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                type="button"
                disabled={creating}
                onClick={() => handleCreate('conversational')}
                className="text-left p-5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-sm transition-all disabled:opacity-50"
              >
                <div className="w-10 h-10 bg-primary-100 dark:bg-primary-900/30 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-primary-600 dark:text-primary-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">Conversational</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Standard chatbot that follows a system prompt, can call tools, and integrates with CRM, calendars, and follow-ups.</p>
              </button>
              <button
                type="button"
                disabled={creating}
                onClick={() => handleCreate('sql_agent')}
                className="text-left p-5 rounded-xl border border-gray-200 dark:border-dark-border hover:border-primary-500 dark:hover:border-primary-500 hover:shadow-sm transition-all disabled:opacity-50"
              >
                <div className="w-10 h-10 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7c0 1.657 3.582 3 8 3s8-1.343 8-3-3.582-3-8-3-8 1.343-8 3z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v5c0 1.657 3.582 3 8 3s8-1.343 8-3V7M4 12v5c0 1.657 3.582 3 8 3s8-1.343 8-3v-5" />
                  </svg>
                </div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">SQL Agent</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">Answers questions by querying a connected database. You'll configure the connection on the next screen.</p>
              </button>
            </div>
            <div className="flex justify-end mt-6">
              <button
                type="button"
                disabled={creating}
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
