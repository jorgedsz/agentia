import { useState, useEffect, useMemo } from 'react'
import { useParams, Link } from 'react-router-dom'
import { portalAPI } from '../../services/api'

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric'
  })
}

function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString()
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function truncate(str, len = 60) {
  if (!str) return '-'
  return str.length > len ? str.substring(0, len) + '...' : str
}

const STATUS_CONFIG = {
  success: { label: 'Success', bg: 'bg-green-500/10 text-green-400 border border-green-500/30' },
  error: { label: 'Error', bg: 'bg-red-500/10 text-red-400 border border-red-500/30' },
}

export default function ClientPortalPage() {
  const { token } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('calls')
  const [filter, setFilter] = useState('all')
  const [selectedMessage, setSelectedMessage] = useState(null)

  useEffect(() => {
    const fetchPortal = async () => {
      try {
        const res = await portalAPI.getClient(token)
        setData(res.data)
      } catch (err) {
        setError(err.response?.status === 404 ? 'Portal not found' : 'Failed to load portal')
      } finally {
        setLoading(false)
      }
    }
    fetchPortal()
  }, [token])

  const filteredSessions = useMemo(() => {
    if (!data?.sessions) return []
    if (filter === 'all') return data.sessions
    return data.sessions.filter(s => s.type === filter)
  }, [data?.sessions, filter])

  const stats = useMemo(() => {
    if (!data) return { total: 0, inbound: 0, outbound: 0, withSummary: 0, totalMessages: 0, conversations: 0 }
    const sessions = data.sessions || []
    const msgSessions = data.messageSessions || []
    return {
      total: sessions.length,
      inbound: sessions.filter(s => s.type === 'inbound').length,
      outbound: sessions.filter(s => s.type === 'outbound').length,
      withSummary: sessions.filter(s => s.summary).length,
      totalMessages: msgSessions.reduce((sum, s) => sum + s.messageCount, 0),
      conversations: msgSessions.length,
    }
  }, [data])

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
          <h2 className="text-xl font-semibold text-white mb-2">Portal Unavailable</h2>
          <p className="text-gray-400">{error}</p>
        </div>
      </div>
    )
  }

  const { client, messageSessions = [] } = data

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
            <p className="text-sm text-gray-400">Logged in as</p>
            <p className="text-white font-medium">{client.name || client.email}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Client Profile Card */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full bg-accent-mauve flex items-center justify-center text-white text-xl font-bold">
              {(client.name || client.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-white">{client.name || 'Client'}</h2>
              {client.companyName && (
                <p className="text-gray-400">{client.companyName}</p>
              )}
              <p className="text-gray-500 text-sm">{client.email}</p>
              <p className="text-gray-500 text-xs mt-1">Member since {formatDate(client.createdAt)}</p>
            </div>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          {[
            { label: 'Total Calls', value: stats.total, color: 'text-white' },
            { label: 'AI Reports', value: stats.withSummary, color: 'text-purple-400' },
            { label: 'Messages', value: stats.totalMessages, color: 'text-blue-400' },
            { label: 'Conversations', value: stats.conversations, color: 'text-green-400' },
          ].map((stat) => (
            <div key={stat.label} className="bg-dark-card border border-dark-border rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-gray-400 text-sm">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs: Calls / Messages */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('calls')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'calls'
                ? 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                : 'bg-dark-card text-gray-400 border border-dark-border hover:text-white'
            }`}
          >
            Call Logs
          </button>
          <button
            onClick={() => setActiveTab('messages')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'messages'
                ? 'bg-accent-red/20 text-accent-red border border-accent-red/30'
                : 'bg-dark-card text-gray-400 border border-dark-border hover:text-white'
            }`}
          >
            Message Logs
            {messageSessions.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 text-xs bg-accent-red/20 text-accent-red rounded-full">
                {messageSessions.length}
              </span>
            )}
          </button>
        </div>

        {/* ===== CALLS TAB ===== */}
        {activeTab === 'calls' && (
          <>
            {/* Filter Tabs */}
            <div className="flex gap-2 mb-6">
              {[
                { key: 'all', label: 'All' },
                { key: 'inbound', label: 'Inbound' },
                { key: 'outbound', label: 'Outbound' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    filter === tab.key
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'bg-dark-card text-gray-500 border border-dark-border hover:text-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Session List */}
            {filteredSessions.length === 0 ? (
              <div className="bg-dark-card border border-dark-border rounded-xl p-12 text-center">
                <p className="text-gray-400">No call logs found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSessions.map((session) => (
                  <Link
                    key={session.id}
                    to={`/portal/${token}/sessions/${session.id}`}
                    className="block bg-dark-card border border-dark-border rounded-xl p-4 hover:bg-dark-hover transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${
                          session.type === 'inbound' ? 'bg-blue-400' : 'bg-green-400'
                        }`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {session.type === 'inbound' ? 'Inbound' : 'Outbound'} Call
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full border ${
                              session.type === 'inbound'
                                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                                : 'bg-green-500/10 text-green-400 border-green-500/30'
                            }`}>
                              {session.type}
                            </span>
                            {session.summary && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                AI Summary
                              </span>
                            )}
                          </div>
                          <p className="text-gray-400 text-sm mt-1">
                            {formatDate(session.createdAt)} · {formatDuration(session.durationSeconds)}
                            {session.outcome && session.outcome !== 'unknown' && (
                              <span className="ml-2 capitalize">· {session.outcome}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}

        {/* ===== MESSAGES TAB ===== */}
        {activeTab === 'messages' && (
          <>
            {messageSessions.length === 0 ? (
              <div className="bg-dark-card border border-dark-border rounded-xl p-12 text-center">
                <svg className="w-12 h-12 mx-auto text-gray-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                <p className="text-gray-400">No message logs yet</p>
              </div>
            ) : (
              <div className="space-y-3">
                {messageSessions.map((ms) => (
                  <Link
                    key={ms.sessionId}
                    to={`/portal/${token}/messages/${encodeURIComponent(ms.sessionId)}`}
                    className="block bg-dark-card border border-dark-border rounded-xl p-4 hover:bg-dark-hover transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-2 rounded-full bg-blue-400" />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-white font-medium">
                              {ms.chatbotName || 'Chatbot'}
                            </span>
                            {ms.contactName && (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/30">
                                {ms.contactName}
                              </span>
                            )}
                            <span className="text-xs px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                              {ms.messageCount} messages
                            </span>
                          </div>
                          <p className="text-gray-400 text-sm mt-1">
                            {formatDate(ms.firstMessageAt)} — {formatDate(ms.lastMessageAt)}
                          </p>
                        </div>
                      </div>
                      <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </>
        )}
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
