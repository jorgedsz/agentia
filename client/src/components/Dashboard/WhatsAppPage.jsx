import { useState, useEffect } from 'react'
import useWhatsApp from '../../hooks/useWhatsApp'
import ChatView from './ChatView'

export default function WhatsAppPage() {
  const {
    sessions,
    activeSessionId,
    sessionStatus,
    qr,
    groups,
    activeGroupId,
    messages,
    loadingGroups,
    loadingMessages,
    fetchSessions,
    createSession,
    deleteSession,
    selectSession,
    fetchGroups,
    fetchMessages,
    sendMessage,
    clearActiveGroup,
  } = useWhatsApp()

  const [newSessionName, setNewSessionName] = useState('')
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // When session becomes ready, fetch groups
  useEffect(() => {
    if (sessionStatus === 'ready' && activeSessionId) {
      fetchGroups()
    }
  }, [sessionStatus, activeSessionId, fetchGroups])

  const handleCreateSession = async () => {
    if (creating) return
    setCreating(true)
    try {
      await createSession(newSessionName.trim() || undefined)
      setNewSessionName('')
    } catch (err) {
      console.error('Failed to create session:', err)
    } finally {
      setCreating(false)
    }
  }

  const activeGroup = groups.find(g => g.id === activeGroupId)

  // If a group is selected, show the group detail view
  if (activeGroupId && activeGroup) {
    return (
      <div className="h-full flex flex-col">
        {/* Group header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-[#202c33] border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={clearActiveGroup}
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-medium">
            {(activeGroup.name || 'G')[0].toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{activeGroup.name}</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {activeGroup.participantCount} participants
            </p>
          </div>
          {/* Tab buttons */}
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('chat')}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                activeTab === 'chat'
                  ? 'bg-green-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Chat
            </button>
            <button
              onClick={() => setActiveTab('info')}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                activeTab === 'info'
                  ? 'bg-green-500 text-white'
                  : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Info
            </button>
          </div>
        </div>

        {/* Tab content */}
        {activeTab === 'chat' ? (
          <ChatView
            messages={messages}
            loadingMessages={loadingMessages}
            onSend={sendMessage}
          />
        ) : (
          <div className="flex-1 p-6 bg-gray-50 dark:bg-dark-bg overflow-auto">
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Group Info</h3>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Name:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{activeGroup.name}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">ID:</span>
                  <span className="ml-2 text-gray-900 dark:text-white font-mono text-xs">{activeGroup.id}</span>
                </div>
                <div>
                  <span className="text-gray-500 dark:text-gray-400">Participants:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">{activeGroup.participantCount}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">WhatsApp</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Manage WhatsApp sessions and chat in groups
        </p>
      </div>

      {/* Create session */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">New Session</h2>
        <div className="flex gap-3">
          <input
            type="text"
            value={newSessionName}
            onChange={(e) => setNewSessionName(e.target.value)}
            placeholder="Session name (optional)"
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400"
          />
          <button
            onClick={handleCreateSession}
            disabled={creating}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {creating ? 'Creating...' : 'Connect'}
          </button>
        </div>
      </div>

      {/* QR Code display */}
      {activeSessionId && sessionStatus === 'qr' && qr && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 text-center">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Scan QR Code</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device
          </p>
          <div className="inline-block bg-white p-4 rounded-lg">
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qr)}`}
              alt="WhatsApp QR Code"
              className="w-64 h-64"
            />
          </div>
          <p className="text-xs text-gray-400 mt-3">Session: {activeSessionId}</p>
        </div>
      )}

      {activeSessionId && sessionStatus === 'initializing' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mx-auto mb-3"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Initializing session...</p>
        </div>
      )}

      {activeSessionId && sessionStatus === 'authenticated' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500 mx-auto mb-3"></div>
          <p className="text-sm text-gray-500 dark:text-gray-400">Authenticated, loading chats...</p>
        </div>
      )}

      {/* Sessions list */}
      {sessions.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-3">Sessions</h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.sessionId}
                className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors ${
                  activeSessionId === s.sessionId
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/10'
                    : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'
                }`}
                onClick={() => selectSession(s.sessionId)}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    s.status === 'ready' ? 'bg-green-500' :
                    s.status === 'qr' ? 'bg-yellow-500' :
                    'bg-gray-400'
                  }`} />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{s.sessionId}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">{s.status}</p>
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteSession(s.sessionId); }}
                  className="text-red-400 hover:text-red-600 text-xs"
                >
                  Disconnect
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Groups list */}
      {activeSessionId && sessionStatus === 'ready' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">Groups</h2>
            <button
              onClick={fetchGroups}
              disabled={loadingGroups}
              className="text-xs text-green-500 hover:text-green-600 disabled:opacity-50"
            >
              {loadingGroups ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {loadingGroups ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
          ) : groups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No groups found</p>
          ) : (
            <div className="space-y-1">
              {groups.map((g) => (
                <button
                  key={g.id}
                  onClick={() => {
                    fetchMessages(g.id)
                    setActiveTab('chat')
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors text-left"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {(g.name || 'G')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{g.participantCount} participants</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
