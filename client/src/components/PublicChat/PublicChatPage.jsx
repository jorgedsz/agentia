import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

// Public, unauthenticated chat page reachable at /chat/:chatbotId/:token.
// Used by chatbot owners to share a testing link with clients without
// requiring them to log into the dashboard.
const API_URL = import.meta.env.VITE_API_URL || '/api'

const generateSessionId = () => {
  const existing = sessionStorage.getItem('publicChatSessionId')
  if (existing) return existing
  const fresh = `pub-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
  sessionStorage.setItem('publicChatSessionId', fresh)
  return fresh
}

export default function PublicChatPage() {
  const { id, token } = useParams()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const sessionIdRef = useRef(generateSessionId())
  const scrollRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/chatbots/${id}/public-share/${token}/info`)
        if (cancelled) return
        setInfo(data)
      } catch (err) {
        if (cancelled) return
        if (err.response?.status === 404) {
          setError('This share link is not valid or has been disabled.')
        } else {
          setError(err.response?.data?.error || 'Could not load chatbot.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [id, token])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, sending])

  const send = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text || sending) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', text }])
    setSending(true)
    try {
      const { data } = await axios.post(
        `${API_URL}/chatbots/${id}/public-share/${token}/message`,
        { message: text, sessionId: sessionIdRef.current }
      )
      setMessages((prev) => [...prev, { role: 'bot', text: data.response || '(no response)' }])
    } catch (err) {
      const msg = err.response?.data?.error || 'Could not send message.'
      setMessages((prev) => [...prev, { role: 'error', text: msg }])
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400" />
      </div>
    )
  }

  if (error || !info) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 max-w-md text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Link unavailable</h1>
          <p className="text-sm text-gray-500">{error || 'Chatbot not found.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">{info.name}</h1>
          {info.description && (
            <p className="text-sm text-gray-500 mt-0.5">{info.description}</p>
          )}
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto px-6 py-6 flex flex-col">
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-3 pr-2">
          {messages.length === 0 && (
            <div className="text-center text-sm text-gray-400 py-12">
              Send a message to start chatting.
            </div>
          )}
          {messages.map((m, i) => {
            if (m.role === 'error') {
              return (
                <div key={i} className="mx-auto max-w-md px-4 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs text-center">
                  {m.text}
                </div>
              )
            }
            const isUser = m.role === 'user'
            return (
              <div key={i} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                  isUser
                    ? 'bg-primary-600 text-white rounded-br-md'
                    : 'bg-white text-gray-800 border border-gray-200 rounded-bl-md'
                }`}>
                  {m.text}
                </div>
              </div>
            )
          })}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-md px-4 py-2.5 text-sm text-gray-400">
                <span className="inline-flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '120ms' }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-pulse" style={{ animationDelay: '240ms' }} />
                </span>
              </div>
            </div>
          )}
        </div>

        <form onSubmit={send} className="mt-4 flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={sending}
            placeholder="Type a message…"
            className="flex-1 px-4 py-2.5 rounded-full border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            className="px-5 py-2.5 rounded-full bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            Send
          </button>
        </form>
        <p className="text-[10px] text-gray-400 mt-2 text-center">
          Powered by your chatbot — testing link
        </p>
      </main>
    </div>
  )
}
