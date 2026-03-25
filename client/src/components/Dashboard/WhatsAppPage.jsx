import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import useWhatsApp from '../../hooks/useWhatsApp'
import ChatView from './ChatView'
import { whatsappAPI, usersAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

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

  const { user } = useAuth()
  const [newSessionName, setNewSessionName] = useState('')
  const [creating, setCreating] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const qrRef = useRef(null)

  // DWY groups state
  const [dwyGroups, setDwyGroups] = useState([])
  const [loadingDwy, setLoadingDwy] = useState(false)
  const [clients, setClients] = useState([])
  const [linkingGroup, setLinkingGroup] = useState(null)

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  // When session becomes ready, fetch groups + DWY groups
  useEffect(() => {
    if (sessionStatus === 'ready' && activeSessionId) {
      fetchGroups()
      fetchDwyGroups()
    }
  }, [sessionStatus, activeSessionId, fetchGroups])

  // Fetch clients list for dropdown (OWNER/AGENCY)
  useEffect(() => {
    if (user?.role === 'OWNER' || user?.role === 'AGENCY') {
      usersAPI.getClients().then(res => {
        setClients(res.data.clients || [])
      }).catch(() => {})
    }
  }, [user?.role])

  // Generate QR code data URL locally when qr string changes
  useEffect(() => {
    if (qr) {
      QRCode.toDataURL(qr, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
        .then(url => setQrDataUrl(url))
        .catch(() => setQrDataUrl(null))
    } else {
      setQrDataUrl(null)
    }
  }, [qr])

  const fetchDwyGroups = async () => {
    if (!activeSessionId) return
    setLoadingDwy(true)
    try {
      const { data } = await whatsappAPI.getDwyGroups(activeSessionId)
      setDwyGroups(data.groups || [])
    } catch (err) {
      console.error('Failed to fetch DWY groups:', err)
    } finally {
      setLoadingDwy(false)
    }
  }

  const handleLinkGroup = async (group, clientId) => {
    setLinkingGroup(group.id)
    try {
      const { data } = await whatsappAPI.linkGroup({
        whatsappChatId: group.id,
        groupName: group.name,
        clientId: clientId ? parseInt(clientId) : null
      })
      // Update the local DWY groups list
      setDwyGroups(prev => prev.map(g =>
        g.id === group.id
          ? {
              ...g,
              projectId: data.project.id,
              clientId: data.project.clientId,
              clientName: data.project.client?.name || data.project.client?.email || null
            }
          : g
      ))
    } catch (err) {
      console.error('Failed to link group:', err)
    } finally {
      setLinkingGroup(null)
    }
  }

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
      {activeSessionId && sessionStatus === 'qr' && qrDataUrl && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 text-center">
          <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">Scan QR Code</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            Open WhatsApp on your phone &gt; Linked Devices &gt; Link a Device
          </p>
          <div className="inline-block bg-white p-4 rounded-lg shadow-sm">
            <img
              ref={qrRef}
              src={qrDataUrl}
              alt="WhatsApp QR Code"
              className="w-[280px] h-[280px]"
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
          <svg className="w-10 h-10 text-green-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm text-gray-500 dark:text-gray-400">Authenticated, waiting for ready...</p>
        </div>
      )}

      {/* Auth failure */}
      {activeSessionId && sessionStatus === 'auth_failure' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-red-200 dark:border-red-800 p-6 text-center">
          <svg className="w-10 h-10 text-red-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm font-medium text-red-600 dark:text-red-400 mb-1">Authentication Failed</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">The QR code expired or was rejected. Please try again.</p>
          <button
            onClick={() => { deleteSession(activeSessionId) }}
            className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium transition-colors"
          >
            Remove &amp; Retry
          </button>
        </div>
      )}

      {/* Disconnected */}
      {activeSessionId && sessionStatus === 'disconnected' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-yellow-200 dark:border-yellow-800 p-6 text-center">
          <svg className="w-10 h-10 text-yellow-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4" />
          </svg>
          <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400 mb-1">Session Disconnected</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">This session has been disconnected.</p>
          <button
            onClick={handleCreateSession}
            disabled={creating}
            className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 text-sm font-medium transition-colors"
          >
            {creating ? 'Reconnecting...' : 'Reconnect'}
          </button>
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

      {/* DWY Groups - auto-fetched when session is ready */}
      {activeSessionId && sessionStatus === 'ready' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">DWY Groups</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Groups containing "DWY" in their name. Link each to a client.
              </p>
            </div>
            <button
              onClick={fetchDwyGroups}
              disabled={loadingDwy}
              className="text-xs text-green-500 hover:text-green-600 disabled:opacity-50"
            >
              {loadingDwy ? 'Loading...' : 'Refresh'}
            </button>
          </div>
          {loadingDwy ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
          ) : dwyGroups.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-6">No DWY groups found</p>
          ) : (
            <div className="space-y-2">
              {dwyGroups.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-dark-border"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
                    {(g.name || 'D')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{g.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{g.participantCount} participants</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {g.clientId ? (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        {g.clientName}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                        Unlinked
                      </span>
                    )}
                    <select
                      value={g.clientId || ''}
                      onChange={(e) => handleLinkGroup(g, e.target.value)}
                      disabled={linkingGroup === g.id}
                      className="px-2 py-1 text-xs bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white disabled:opacity-50"
                    >
                      <option value="">-- Select Client --</option>
                      {clients.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name || c.email}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* All Groups list */}
      {activeSessionId && sessionStatus === 'ready' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-white">All Groups</h2>
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
