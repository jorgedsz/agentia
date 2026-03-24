import { useState, useEffect, useRef, useCallback } from 'react'
import { io } from 'socket.io-client'
import api from '../services/api'

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? new URL(import.meta.env.VITE_API_URL).origin
  : window.location.origin

export default function useWhatsApp() {
  const [sessions, setSessions] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [qr, setQr] = useState(null)
  const [groups, setGroups] = useState([])
  const [activeGroupId, setActiveGroupId] = useState(null)
  const [messages, setMessages] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sessionStatus, setSessionStatus] = useState(null)
  const socketRef = useRef(null)

  // Connect socket once
  useEffect(() => {
    const socket = io(SOCKET_URL, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('whatsapp:qr', ({ sessionId, qr: qrCode }) => {
      if (sessionId === activeSessionId) {
        setQr(qrCode)
        setSessionStatus('qr')
      }
    })

    socket.on('whatsapp:ready', ({ sessionId }) => {
      if (sessionId === activeSessionId) {
        setQr(null)
        setSessionStatus('ready')
      }
      setSessions(prev =>
        prev.map(s => s.sessionId === sessionId ? { ...s, status: 'ready' } : s)
      )
    })

    socket.on('whatsapp:authenticated', ({ sessionId }) => {
      if (sessionId === activeSessionId) {
        setSessionStatus('authenticated')
      }
    })

    socket.on('whatsapp:auth_failure', ({ sessionId }) => {
      if (sessionId === activeSessionId) {
        setSessionStatus('auth_failure')
      }
    })

    socket.on('whatsapp:disconnected', ({ sessionId }) => {
      setSessions(prev => prev.filter(s => s.sessionId !== sessionId))
      if (sessionId === activeSessionId) {
        setSessionStatus('disconnected')
        setActiveSessionId(null)
      }
    })

    socket.on('whatsapp:message', ({ sessionId, groupId, message }) => {
      // Only append if it matches the active session + group
      if (sessionId === activeSessionId && groupId === activeGroupId) {
        setMessages(prev => {
          if (prev.some(m => m.id === message.id)) return prev
          return [...prev, message]
        })
      }
    })

    return () => { socket.disconnect() }
  }, [activeSessionId, activeGroupId])

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    try {
      const { data } = await api.get('/whatsapp/sessions')
      setSessions(data.sessions)
    } catch (err) {
      console.error('Failed to fetch WA sessions:', err)
    }
  }, [])

  // Create session
  const createSession = useCallback(async (sessionId) => {
    const { data } = await api.post('/whatsapp/sessions', { sessionId })
    setActiveSessionId(data.sessionId)
    setSessionStatus(data.status)
    setQr(null)
    await fetchSessions()
    return data
  }, [fetchSessions])

  // Delete session
  const deleteSession = useCallback(async (sessionId) => {
    await api.delete(`/whatsapp/sessions/${sessionId}`)
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
      setSessionStatus(null)
      setQr(null)
      setGroups([])
      setActiveGroupId(null)
      setMessages([])
    }
    await fetchSessions()
  }, [activeSessionId, fetchSessions])

  // Select session & fetch groups
  const selectSession = useCallback(async (sessionId) => {
    setActiveSessionId(sessionId)
    setActiveGroupId(null)
    setMessages([])
    setGroups([])
    const entry = sessions.find(s => s.sessionId === sessionId)
    setSessionStatus(entry?.status || null)

    if (entry?.status === 'ready') {
      setLoadingGroups(true)
      try {
        const { data } = await api.get(`/whatsapp/sessions/${sessionId}/groups`)
        setGroups(data.groups)
      } catch (err) {
        console.error('Failed to fetch groups:', err)
      } finally {
        setLoadingGroups(false)
      }
    } else {
      // Poll for QR
      try {
        const { data } = await api.get(`/whatsapp/sessions/${sessionId}/qr`)
        setQr(data.qr)
        setSessionStatus(data.status)
      } catch (_) { /* not found */ }
    }
  }, [sessions])

  // Fetch groups for active session
  const fetchGroups = useCallback(async () => {
    if (!activeSessionId) return
    setLoadingGroups(true)
    try {
      const { data } = await api.get(`/whatsapp/sessions/${activeSessionId}/groups`)
      setGroups(data.groups)
    } catch (err) {
      console.error('Failed to fetch groups:', err)
    } finally {
      setLoadingGroups(false)
    }
  }, [activeSessionId])

  // Fetch messages for a group
  const fetchMessages = useCallback(async (groupId) => {
    if (!activeSessionId) return
    setActiveGroupId(groupId)
    setMessages([])
    setLoadingMessages(true)
    try {
      const { data } = await api.get(
        `/whatsapp/sessions/${activeSessionId}/groups/${encodeURIComponent(groupId)}/messages`,
        { params: { limit: 50 } }
      )
      setMessages(data.messages)
    } catch (err) {
      console.error('Failed to fetch messages:', err)
    } finally {
      setLoadingMessages(false)
    }
  }, [activeSessionId])

  // Send a message
  const sendMessage = useCallback(async (body) => {
    if (!activeSessionId || !activeGroupId) return
    const { data } = await api.post(
      `/whatsapp/sessions/${activeSessionId}/groups/${encodeURIComponent(activeGroupId)}/messages`,
      { body }
    )
    // Append optimistically (dedup in socket handler)
    setMessages(prev => {
      if (prev.some(m => m.id === data.message.id)) return prev
      return [...prev, data.message]
    })
    return data.message
  }, [activeSessionId, activeGroupId])

  // Clear active group
  const clearActiveGroup = useCallback(() => {
    setActiveGroupId(null)
    setMessages([])
  }, [])

  return {
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
  }
}
