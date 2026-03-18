import { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { demoAPI } from '../../services/api'

const INDUSTRIES = [
  'Healthcare', 'Real Estate', 'Legal', 'Insurance', 'Home Services',
  'Restaurant', 'Automotive', 'Education', 'Finance', 'E-commerce', 'Other'
]

const LANGUAGES = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese']

const TONES = ['Professional', 'Friendly', 'Casual', 'Formal', 'Empathetic']

export default function DemoPage() {
  const { darkMode } = useTheme()
  const { t } = useLanguage()

  const [phase, setPhase] = useState('form') // form | loading | results
  const [error, setError] = useState('')

  // Form state
  const [form, setForm] = useState({
    businessName: '',
    industry: '',
    agentObjective: '',
    agentType: 'inbound',
    language: 'English',
    tone: 'Professional',
    faq: '',
    objections: ''
  })

  // Results state
  const [demoId, setDemoId] = useState(null)
  const [chatbotPrompt, setChatbotPrompt] = useState('')
  const [voicebotPrompt, setVoicebotPrompt] = useState('')
  const [activeTab, setActiveTab] = useState('chat')
  const [messages, setMessages] = useState([])
  const [chatInput, setChatInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const messagesEndRef = useRef(null)
  const chatInputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  const validateForm = () => {
    if (!form.businessName.trim()) return 'Business Name is required'
    if (!form.industry) return 'Industry is required'
    if (!form.agentObjective.trim()) return 'Agent Objective is required'
    return null
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validationError = validateForm()
    if (validationError) {
      setError(validationError)
      return
    }

    setError('')
    setPhase('loading')

    try {
      const res = await demoAPI.generate(form)
      const data = res.data

      setDemoId(data.demoId)
      setChatbotPrompt(data.chatbotPrompt)
      setVoicebotPrompt(data.voicebotPrompt)
      setMessages([{ role: 'assistant', content: data.firstMessage }])
      setPhase('results')
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to generate demo. Please try again.'
      setError(msg)
      setPhase('form')
    }
  }

  const sendMessage = async () => {
    const text = chatInput.trim()
    if (!text || isSending) return

    setChatInput('')
    setMessages(prev => [...prev, { role: 'user', content: text }])
    setIsSending(true)

    // Add a placeholder for assistant response
    const assistantIdx = messages.length + 1
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${baseURL}/demo/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ demoId, message: text })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { role: 'assistant', content: err.error || 'Something went wrong.' }
          return updated
        })
        setIsSending(false)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') break
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: parsed.error }
                return updated
              })
              setIsSending(false)
              return
            }
            if (parsed.content) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  role: 'assistant',
                  content: updated[updated.length - 1].content + parsed.content
                }
                return updated
              })
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Network error. Please try again.' }
        return updated
      })
    }

    setIsSending(false)
    chatInputRef.current?.focus()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(voicebotPrompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
      const textarea = document.createElement('textarea')
      textarea.value = voicebotPrompt
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleStartOver = () => {
    setPhase('form')
    setDemoId(null)
    setChatbotPrompt('')
    setVoicebotPrompt('')
    setMessages([])
    setChatInput('')
    setActiveTab('chat')
    setError('')
  }

  // ─── FORM PHASE ───
  const renderForm = () => (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Try Your AI Agent
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          Fill out the form below and we'll generate a live chatbot demo and a voice agent prompt for your business.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 space-y-5">
        {/* Business Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Business Name *
          </label>
          <input
            type="text"
            value={form.businessName}
            onChange={(e) => updateForm('businessName', e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="e.g. Acme Dental Care"
          />
        </div>

        {/* Industry */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Industry *
          </label>
          <select
            value={form.industry}
            onChange={(e) => updateForm('industry', e.target.value)}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            <option value="">Select an industry</option>
            {INDUSTRIES.map(ind => (
              <option key={ind} value={ind}>{ind}</option>
            ))}
          </select>
        </div>

        {/* Agent Objective */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Agent Objective *
          </label>
          <textarea
            value={form.agentObjective}
            onChange={(e) => updateForm('agentObjective', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Describe what you want your AI agent to do..."
          />
        </div>

        {/* Agent Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Agent Type *
          </label>
          <div className="flex gap-4">
            {['inbound', 'outbound'].map(type => (
              <label
                key={type}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  form.agentType === type
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-gray-50 dark:bg-dark-hover border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-border'
                }`}
              >
                <input
                  type="radio"
                  name="agentType"
                  value={type}
                  checked={form.agentType === type}
                  onChange={(e) => updateForm('agentType', e.target.value)}
                  className="sr-only"
                />
                <span className="text-sm font-medium capitalize">{type}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Language & Tone row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Language *
            </label>
            <select
              value={form.language}
              onChange={(e) => updateForm('language', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
            >
              {LANGUAGES.map(lang => (
                <option key={lang} value={lang}>{lang}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tone / Style
            </label>
            <select
              value={form.tone}
              onChange={(e) => updateForm('tone', e.target.value)}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
            >
              {TONES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        {/* FAQ (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            FAQ (optional)
          </label>
          <textarea
            value={form.faq}
            onChange={(e) => updateForm('faq', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Add common questions and answers your agent should know..."
          />
        </div>

        {/* Common Objections (optional) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Common Objections (optional)
          </label>
          <textarea
            value={form.objections}
            onChange={(e) => updateForm('objections', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
            placeholder="Add objections your agent should handle..."
          />
        </div>

        <button
          type="submit"
          className="w-full py-2.5 px-4 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 transition-colors"
        >
          Generate Demo
        </button>
      </form>
    </div>
  )

  // ─── LOADING PHASE ───
  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-primary-600 mb-6"></div>
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Generating your AI agent...
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        This may take a moment. We're crafting the perfect prompt for your business.
      </p>
    </div>
  )

  // ─── RESULTS PHASE ───
  const renderResults = () => (
    <div className="w-full max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Your AI Agent Demo
        </h1>
        <button
          onClick={handleStartOver}
          className="px-4 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover rounded-lg text-sm transition-colors"
        >
          Start Over
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-gray-100 dark:bg-dark-hover rounded-lg p-1">
        <button
          onClick={() => setActiveTab('chat')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Chat Demo
        </button>
        <button
          onClick={() => setActiveTab('voice')}
          className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'voice'
              ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
          }`}
        >
          Voice Prompt
        </button>
      </div>

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border flex flex-col" style={{ height: '500px' }}>
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary-600 text-white rounded-br-md'
                      : 'bg-gray-100 dark:bg-dark-hover text-gray-900 dark:text-white rounded-bl-md'
                  }`}
                >
                  {msg.content || (
                    <span className="inline-flex gap-1">
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="border-t border-gray-200 dark:border-dark-border p-3">
            <div className="flex gap-2">
              <input
                ref={chatInputRef}
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSending}
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm disabled:opacity-50"
                placeholder="Type a message..."
              />
              <button
                onClick={sendMessage}
                disabled={isSending || !chatInput.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Voice Prompt Tab */}
      {activeTab === 'voice' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Generated Voice Agent Prompt
            </h3>
            <button
              onClick={handleCopy}
              className="px-3 py-1.5 bg-gray-100 dark:bg-dark-hover border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border rounded-lg text-sm transition-colors flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4 max-h-96 overflow-y-auto">
            <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
              {voicebotPrompt}
            </pre>
          </div>

          <div className="mt-6 bg-primary-500/10 border border-primary-500/30 rounded-lg p-4 text-center">
            <p className="text-sm text-primary-600 dark:text-primary-400 mb-3">
              Want to try this as a live voice agent? Sign up to make real calls with AI.
            </p>
            <a
              href="/register"
              className="inline-block px-6 py-2.5 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 transition-colors text-sm"
            >
              Sign Up Free
            </a>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <div className={`min-h-screen ${darkMode ? 'dark bg-dark-bg' : 'bg-gray-100'}`}>
      <div className="p-6 sm:p-10">
        {phase === 'form' && renderForm()}
        {phase === 'loading' && renderLoading()}
        {phase === 'results' && renderResults()}
      </div>
    </div>
  )
}
