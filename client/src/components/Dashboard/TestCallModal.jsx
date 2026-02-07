import { useState, useEffect, useRef } from 'react'
import { platformSettingsAPI } from '../../services/api'

export default function TestCallModal({ agent, onClose }) {
  const [status, setStatus] = useState('idle') // idle, connecting, active, ended
  const [transcript, setTranscript] = useState([])
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const vapiRef = useRef(null)
  const timerRef = useRef(null)
  const transcriptEndRef = useRef(null)

  const startCall = async () => {
    try {
      setStatus('connecting')
      setTranscript([])
      setElapsed(0)
      setMuted(false)
      setVolume(0)

      const { data } = await platformSettingsAPI.getVapiPublicKey()
      const publicKey = data.vapiPublicKey

      const { default: Vapi } = await import('@vapi-ai/web')
      const vapi = new Vapi(publicKey)
      vapiRef.current = vapi

      vapi.on('call-start', () => {
        setStatus('active')
        timerRef.current = setInterval(() => {
          setElapsed(prev => prev + 1)
        }, 1000)
      })

      vapi.on('call-end', () => {
        setStatus('ended')
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      })

      vapi.on('message', (msg) => {
        if (msg.type === 'transcript') {
          if (msg.transcriptType === 'final') {
            setTranscript(prev => [...prev, {
              role: msg.role === 'assistant' ? 'Agent' : 'You',
              text: msg.transcript
            }])
          }
        } else if (msg.type === 'conversation-update' && msg.conversation) {
          const messages = msg.conversation
          setTranscript(
            messages
              .filter(m => m.role === 'assistant' || m.role === 'user')
              .map(m => ({
                role: m.role === 'assistant' ? 'Agent' : 'You',
                text: m.content
              }))
          )
        }
      })

      vapi.on('volume-level', (level) => {
        setVolume(level)
      })

      vapi.on('error', (err) => {
        console.error('VAPI test call error:', err)
        setStatus('ended')
        setTranscript(prev => [...prev, {
          role: 'System',
          text: `Error: ${err.message || 'Call failed'}`
        }])
        if (timerRef.current) {
          clearInterval(timerRef.current)
          timerRef.current = null
        }
      })

      await vapi.start(agent.vapiId)
    } catch (err) {
      console.error('Failed to start test call:', err)
      setStatus('ended')
      const errorMsg = err.response?.data?.error || err.message || 'Failed to start call'
      setTranscript(prev => [...prev, {
        role: 'System',
        text: `Error: ${errorMsg}`
      }])
    }
  }

  const stopCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop()
      vapiRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    setStatus('ended')
  }

  const toggleMute = () => {
    if (vapiRef.current) {
      const newMuted = !muted
      vapiRef.current.setMuted(newMuted)
      setMuted(newMuted)
    }
  }

  const handleClose = () => {
    if (vapiRef.current) {
      vapiRef.current.stop()
      vapiRef.current = null
    }
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    onClose()
  }

  useEffect(() => {
    if (transcriptEndRef.current) {
      transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [transcript])

  useEffect(() => {
    return () => {
      if (vapiRef.current) {
        vapiRef.current.stop()
        vapiRef.current = null
      }
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [])

  const formatElapsed = (seconds) => {
    const mins = Math.floor(seconds / 60).toString().padStart(2, '0')
    const secs = (seconds % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-md">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Test Agent — {agent.name}</h3>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Call Status & Volume Indicator */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all ${
                status === 'active'
                  ? 'bg-green-100 dark:bg-green-900/30'
                  : status === 'connecting'
                  ? 'bg-yellow-100 dark:bg-yellow-900/30'
                  : 'bg-gray-100 dark:bg-gray-800'
              }`}>
                {status === 'active' && (
                  <div
                    className="absolute inset-0 rounded-full border-2 border-green-400 animate-ping"
                    style={{ opacity: Math.min(volume * 2, 0.6) }}
                  />
                )}
                <svg className={`w-8 h-8 ${
                  status === 'active' ? 'text-green-600 dark:text-green-400'
                    : status === 'connecting' ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-gray-400'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>
            <span className={`text-sm font-medium ${
              status === 'active' ? 'text-green-600 dark:text-green-400'
                : status === 'connecting' ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-gray-500 dark:text-gray-400'
            }`}>
              {status === 'idle' && 'Ready to call'}
              {status === 'connecting' && 'Connecting...'}
              {status === 'active' && 'Call Active'}
              {status === 'ended' && 'Call Ended'}
            </span>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {status === 'active' && (
              <button
                onClick={toggleMute}
                className={`p-3 rounded-full transition-colors ${
                  muted
                    ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
                }`}
                title={muted ? 'Unmute' : 'Mute'}
              >
                {muted ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                  </svg>
                )}
              </button>
            )}

            {(status === 'idle' || status === 'ended') ? (
              <button
                onClick={startCall}
                className="p-4 rounded-full bg-green-600 text-white hover:bg-green-700 transition-colors shadow-lg"
                title="Start Call"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            ) : status === 'connecting' ? (
              <button
                disabled
                className="p-4 rounded-full bg-yellow-500 text-white cursor-not-allowed shadow-lg"
              >
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              </button>
            ) : (
              <button
                onClick={stopCall}
                className="p-4 rounded-full bg-red-600 text-white hover:bg-red-700 transition-colors shadow-lg"
                title="End Call"
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.91 3.1c.46.36.66.96.5 1.52-.5 1.58-1.33 3.04-2.43 4.28-.37.42-.92.63-1.48.55-1.98-.29-3.86-.97-5.53-1.96a18.8 18.8 0 01-5.53 1.96c-.56.08-1.11-.13-1.48-.55-1.1-1.24-1.93-2.7-2.43-4.28a1.47 1.47 0 01.5-1.52h.25z" />
                </svg>
              </button>
            )}
          </div>

          {/* Transcript */}
          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg border border-gray-200 dark:border-dark-border">
            <div className="px-3 py-2 border-b border-gray-200 dark:border-dark-border">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Transcript</span>
            </div>
            <div className="h-48 overflow-y-auto p-3 space-y-2">
              {transcript.length === 0 ? (
                <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-8">
                  {status === 'idle' || status === 'ended'
                    ? 'Start a call to see the transcript'
                    : 'Waiting for conversation...'}
                </p>
              ) : (
                transcript.map((entry, i) => (
                  <div key={i} className={`text-sm ${
                    entry.role === 'Agent'
                      ? 'text-blue-700 dark:text-blue-400'
                      : entry.role === 'System'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    <span className="font-medium">{entry.role}:</span> {entry.text}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>

          {/* Timer */}
          {(status === 'active' || status === 'ended') && elapsed > 0 && (
            <div className="text-center">
              <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
                {formatElapsed(elapsed)} elapsed
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
