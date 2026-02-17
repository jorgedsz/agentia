import { useState, useEffect, useRef } from 'react'
import { accountSettingsAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

export default function TestCallModal({ agent, onClose }) {
  const { t } = useLanguage()
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

      let publicKeyData
      try {
        const { data } = await accountSettingsAPI.getVapiPublicKey()
        publicKeyData = data
      } catch (err) {
        if (err.response?.data?.code === 'INSUFFICIENT_CREDITS') {
          setStatus('ended')
          setTranscript([{ role: 'System', text: err.response.data.error }])
          return
        }
        throw err
      }
      const publicKey = publicKeyData.vapiPublicKey

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

  // Generate waveform bars for visualization
  const waveformBars = Array.from({ length: 48 }, (_, i) => {
    if (status === 'active') {
      // Animate based on volume when call is active
      const baseHeight = Math.sin(i * 0.3 + Date.now() * 0.003) * 0.5 + 0.5
      return Math.max(0.1, baseHeight * volume * 3)
    }
    // Static waveform pattern when idle
    const center = 24
    const dist = Math.abs(i - center) / center
    const base = Math.sin(i * 0.5) * 0.3 + 0.4
    return Math.max(0.05, base * (1 - dist * 0.6))
  })

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e2024] rounded-xl w-full max-w-md shadow-2xl border border-gray-700/50">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
          <h3 className="text-base font-semibold text-gray-200">{t('testCall.title')}</h3>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Microphone Icon & Status */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {/* Glow ring */}
              <div className={`absolute -inset-1 rounded-full transition-all duration-500 ${
                status === 'active'
                  ? 'bg-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.3)]'
                  : status === 'connecting'
                  ? 'bg-yellow-500/20 shadow-[0_0_20px_rgba(234,179,8,0.3)]'
                  : 'bg-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
              }`} />
              {/* Volume pulse ring */}
              {status === 'active' && (
                <div
                  className="absolute -inset-3 rounded-full border border-green-400/40 animate-ping"
                  style={{ opacity: Math.min(volume * 2, 0.5), animationDuration: '1.5s' }}
                />
              )}
              {/* Mic circle */}
              <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 ${
                status === 'active'
                  ? 'bg-[#1a2e1a] border-2 border-green-500/40'
                  : status === 'connecting'
                  ? 'bg-[#2e2a1a] border-2 border-yellow-500/40'
                  : 'bg-[#1a1d22] border-2 border-gray-600/50'
              }`}>
                <svg className={`w-8 h-8 transition-colors duration-300 ${
                  status === 'active' ? 'text-green-400'
                    : status === 'connecting' ? 'text-yellow-400'
                    : 'text-gray-500'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>
            {/* Status text */}
            <span className="text-sm text-gray-400">
              {status === 'idle' && t('testCall.readyToCall')}
              {status === 'connecting' && t('testCall.connecting')}
              {status === 'active' && t('testCall.callActive')}
              {status === 'ended' && t('testCall.callEnded')}
            </span>
            {/* Timer */}
            {(status === 'active' || status === 'ended') && elapsed > 0 && (
              <span className="text-xs font-mono text-gray-500">
                {formatElapsed(elapsed)} {t('testCall.elapsed')}
              </span>
            )}
          </div>

          {/* Call Controls */}
          <div className="flex items-center justify-center gap-4">
            {status === 'active' && (
              <button
                onClick={toggleMute}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  muted
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                    : 'bg-[#2a2d33] text-gray-400 border border-gray-600/30 hover:bg-[#33363d] hover:text-gray-300'
                }`}
                title={muted ? t('testCall.unmute') : t('testCall.mute')}
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
                className="p-4 rounded-2xl bg-green-600 text-white hover:bg-green-500 transition-all duration-200 shadow-lg shadow-green-600/20 hover:shadow-green-500/30"
                title={t('testCall.startCall')}
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
              </button>
            ) : status === 'connecting' ? (
              <button
                disabled
                className="p-4 rounded-2xl bg-yellow-600/80 text-white cursor-not-allowed shadow-lg"
              >
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
              </button>
            ) : (
              <button
                onClick={stopCall}
                className="p-4 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all duration-200 shadow-lg shadow-red-600/20"
                title={t('testCall.endCall')}
              >
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.91 3.1c.46.36.66.96.5 1.52-.5 1.58-1.33 3.04-2.43 4.28-.37.42-.92.63-1.48.55-1.98-.29-3.86-.97-5.53-1.96a18.8 18.8 0 01-5.53 1.96c-.56.08-1.11-.13-1.48-.55-1.1-1.24-1.93-2.7-2.43-4.28a1.47 1.47 0 01.5-1.52h.25z" />
                </svg>
              </button>
            )}
          </div>

          {/* Transcript Section */}
          <div className="rounded-xl border border-cyan-500/30 bg-[#16181d] overflow-hidden shadow-[0_0_15px_rgba(6,182,212,0.08)]">
            <div className="px-4 py-2.5 border-b border-cyan-500/20 bg-[#13151a]">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('testCall.transcript')}</span>
            </div>
            <div className="h-48 overflow-y-auto p-4 space-y-2.5">
              {transcript.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4">
                  <p className="text-sm text-gray-500 text-center">
                    {status === 'idle' || status === 'ended'
                      ? t('testCall.startCallPrompt')
                      : t('testCall.waitingForConversation')}
                  </p>
                  {/* Waveform visualization */}
                  <div className="flex items-center justify-center gap-[2px] h-12 w-full max-w-[280px]">
                    {waveformBars.map((height, i) => (
                      <div
                        key={i}
                        className={`w-[3px] rounded-full transition-all duration-150 ${
                          status === 'active'
                            ? 'bg-cyan-400'
                            : 'bg-cyan-500/40'
                        }`}
                        style={{ height: `${Math.max(2, height * 48)}px` }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                transcript.map((entry, i) => (
                  <div key={i} className={`text-sm ${
                    entry.role === 'Agent'
                      ? 'text-cyan-400'
                      : entry.role === 'System'
                      ? 'text-red-400'
                      : 'text-gray-400'
                  }`}>
                    <span className="font-medium">{entry.role}:</span> {entry.text}
                  </div>
                ))
              )}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
