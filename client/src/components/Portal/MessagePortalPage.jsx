import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { portalAPI } from '../../services/api'

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

export default function MessagePortalPage() {
  const { token, sessionId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const res = await portalAPI.getMessages(token, sessionId)
        setData(res.data)
      } catch (err) {
        setError(err.response?.status === 404 ? 'Conversation not found' : 'Failed to load messages')
      } finally {
        setLoading(false)
      }
    }
    fetchMessages()
  }, [token, sessionId])

  if (loading) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-accent-red"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-dark-bg flex items-center justify-center">
        <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center max-w-md">
          <div className="text-4xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-white mb-2">Conversation Unavailable</h2>
          <p className="text-gray-400">{error}</p>
          <Link to={`/portal/${token}`} className="text-accent-red hover:underline text-sm mt-4 inline-block">
            Back to Portal
          </Link>
        </div>
      </div>
    )
  }

  const { client, messages, chatbotName, contactName } = data

  return (
    <div className="min-h-screen bg-dark-bg">
      {/* Header */}
      <header className="border-b border-dark-border bg-dark-sidebar">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Done With You</h1>
            <p className="text-sm text-gray-400">Client Portal</p>
          </div>
          <div className="text-right">
            <p className="text-white font-medium">{client.name || client.email}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Back Link */}
        <Link
          to={`/portal/${token}`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Portal
        </Link>

        {/* Session Info Header */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold text-white">
              {chatbotName || 'Chatbot'} Conversation
            </h2>
            {contactName && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                {contactName}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm">
            {messages.length} messages · {formatDate(messages[0]?.createdAt)} — {formatDate(messages[messages.length - 1]?.createdAt)}
          </p>
        </div>

        {/* Chat Thread */}
        <div className="space-y-4">
          {messages.map((msg) => (
            <div key={msg.id} className="space-y-3">
              {/* User input */}
              {msg.inputMessage && (
                <div className="flex justify-start">
                  <div className="max-w-[75%]">
                    <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                      <p className="text-gray-300 text-sm whitespace-pre-wrap">{msg.inputMessage}</p>
                    </div>
                    <p className="text-gray-600 text-xs mt-1 ml-2">
                      {contactName || 'Contact'} · {formatDateTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              )}

              {/* Bot response */}
              {msg.outputMessage && (
                <div className="flex justify-end">
                  <div className="max-w-[75%]">
                    <div className="bg-accent-red/10 border border-accent-red/20 rounded-xl p-4">
                      <p className="text-gray-200 text-sm whitespace-pre-wrap">{msg.outputMessage}</p>
                    </div>
                    <p className="text-gray-600 text-xs mt-1 mr-2 text-right">
                      {chatbotName || 'Bot'} · {formatDateTime(msg.createdAt)}
                      {msg.status === 'error' && (
                        <span className="ml-2 text-red-400">Error</span>
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-dark-border mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <p className="text-center text-gray-500 text-sm">
            Done With You · Client Portal
          </p>
        </div>
      </footer>
    </div>
  )
}
