import { useState, useEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import axios from 'axios'

// Public, unauthenticated voice page reachable at /voice/:id/:token.
// Owner enables sharing in AgentEdit, sends the URL to a client, who can
// open the link in any modern browser and have a live web call with the agent.
const API_URL = import.meta.env.VITE_API_URL || '/api'

const fmt = (s) => {
  const m = Math.floor(s / 60).toString().padStart(2, '0')
  const r = Math.floor(s % 60).toString().padStart(2, '0')
  return `${m}:${r}`
}

export default function PublicVoicePage() {
  const { id, token } = useParams()
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('idle') // idle | starting | active | ended
  const [statusMessage, setStatusMessage] = useState('')
  const [muted, setMuted] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [volume, setVolume] = useState(0)

  const vapiRef = useRef(null)
  const timerRef = useRef(null)
  const hardStopRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const { data } = await axios.get(`${API_URL}/agents/${id}/public-share/${token}/info`)
        if (cancelled) return
        setInfo(data)
      } catch (err) {
        if (cancelled) return
        if (err.response?.status === 404) {
          setError('This share link is not valid or has been disabled.')
        } else {
          setError(err.response?.data?.error || 'Could not load voice agent.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, token])

  const cleanup = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null }
    if (vapiRef.current) {
      try { vapiRef.current.stop() } catch { /* ignore */ }
      vapiRef.current = null
    }
  }

  const startCall = async () => {
    if (status === 'starting' || status === 'active') return
    setStatus('starting')
    setStatusMessage('')
    setElapsed(0)
    setMuted(false)
    setVolume(0)

    try {
      // 1. Hit the backend to validate quotas. We ignore metadata for now — the
      //    Vapi Web SDK rejects unknown fields on assistantOverrides, so we can't
      //    pass metadata through `vapi.start`. Quota is still enforced server-side
      //    (counter is incremented here regardless), and we cap duration in the
      //    browser via a hard-stop timer below.
      const startResp = await axios.post(
        `${API_URL}/agents/${id}/public-share/${token}/call-start`
      )
      const { maxDurationSeconds } = startResp.data
      const cap = Math.max(30, Math.min(maxDurationSeconds || 180, 1800))

      // 2. Spin up the Vapi Web SDK and wire events.
      const { default: Vapi } = await import('@vapi-ai/web')
      const vapi = new Vapi(info.vapiPublicKey)
      vapiRef.current = vapi

      vapi.on('call-start', () => {
        setStatus('active')
        timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000)
        hardStopRef.current = setTimeout(() => {
          try { vapi.stop() } catch { /* ignore */ }
        }, (cap + 2) * 1000)
      })
      vapi.on('call-end', () => {
        setStatus('ended')
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null }
      })
      vapi.on('volume-level', (level) => setVolume(level))
      vapi.on('error', (err) => {
        console.error('Vapi error:', err)
        const detail = err?.error?.message || err?.message || err?.errorMsg ||
          (typeof err === 'string' ? err : null)
        setStatus('ended')
        setStatusMessage(detail || 'Call failed (see browser console for details).')
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        if (hardStopRef.current) { clearTimeout(hardStopRef.current); hardStopRef.current = null }
      })

      // 3. Start the call — assistantId only, no overrides. Vapi's Web SDK
      //    `assistantOverrides` parameter only accepts a narrow set of fields
      //    (not metadata or maxDurationSeconds); passing extras causes Vapi to
      //    reject the call.
      await vapi.start(info.vapiAssistantId)
    } catch (err) {
      console.error('Public voice start failed:', err)
      const code = err.response?.status
      const msg = err.response?.data?.error || err?.message || 'Could not start call.'
      setStatus('ended')
      if (code === 429) setStatusMessage(msg)
      else if (code === 402) setStatusMessage('This shared agent is temporarily unavailable.')
      else setStatusMessage(msg)
    }
  }

  const endCall = () => {
    if (vapiRef.current) {
      try { vapiRef.current.stop() } catch { /* ignore */ }
    }
  }

  const toggleMute = () => {
    if (!vapiRef.current) return
    const next = !muted
    try {
      vapiRef.current.setMuted(next)
      setMuted(next)
    } catch { /* ignore */ }
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
          <h1 className="text-lg font-semibold text-gray-900 mb-1">Link unavailable</h1>
          <p className="text-sm text-gray-500">{error || 'Voice agent not found.'}</p>
        </div>
      </div>
    )
  }

  const cap = info.maxDurationSeconds || 180
  const remaining = Math.max(0, cap - elapsed)

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <h1 className="text-lg font-semibold text-gray-900">{info.name}</h1>
          {info.description && (
            <p className="text-sm text-gray-500 mt-0.5">{info.description}</p>
          )}
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-md bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center">
          {/* Avatar / volume ring */}
          <div className="relative w-32 h-32 mx-auto mb-6">
            <div
              className="absolute inset-0 rounded-full bg-primary-100"
              style={{ transform: `scale(${1 + volume * 0.4})`, transition: 'transform 80ms linear' }}
            />
            <div className="absolute inset-3 rounded-full bg-primary-600 flex items-center justify-center text-white">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
          </div>

          {status === 'idle' && (
            <>
              <p className="text-sm text-gray-500 mb-6">
                Tap to start a {Math.round(cap / 60)}-minute test call with this agent in your browser.
                You'll be asked to allow microphone access.
              </p>
              <button
                onClick={startCall}
                className="w-full px-5 py-3 rounded-full bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors"
              >
                Start call
              </button>
            </>
          )}

          {status === 'starting' && (
            <p className="text-sm text-gray-500">Connecting…</p>
          )}

          {status === 'active' && (
            <>
              <div className="mb-1 text-3xl font-mono text-gray-900">{fmt(elapsed)}</div>
              <p className="text-xs text-gray-400 mb-6">Time remaining: {fmt(remaining)}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={toggleMute}
                  className={`px-4 py-2.5 rounded-full text-sm font-medium border transition-colors ${
                    muted
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {muted ? 'Unmute' : 'Mute'}
                </button>
                <button
                  onClick={endCall}
                  className="px-5 py-2.5 rounded-full bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
                >
                  End call
                </button>
              </div>
            </>
          )}

          {status === 'ended' && (
            <>
              <p className="text-base font-medium text-gray-900 mb-1">Call ended</p>
              {statusMessage && <p className="text-sm text-red-500 mb-4">{statusMessage}</p>}
              {!statusMessage && elapsed > 0 && (
                <p className="text-sm text-gray-500 mb-4">Duration: {fmt(elapsed)}</p>
              )}
              <button
                onClick={startCall}
                className="w-full px-5 py-3 rounded-full bg-primary-600 text-white font-semibold hover:bg-primary-700 transition-colors"
              >
                Start another call
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
