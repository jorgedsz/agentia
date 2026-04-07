import { useState, useEffect, useRef } from 'react'
import { trainingAPI, accountSettingsAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

export default function TrainingCallModal({ agent, onClose, onAccepted }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState('idle') // idle, connecting, active, ended, review
  const [transcript, setTranscript] = useState([])
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [session, setSession] = useState(null)
  const [proposedChanges, setProposedChanges] = useState([])
  const [error, setError] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const vapiRef = useRef(null)
  const timerRef = useRef(null)
  const transcriptEndRef = useRef(null)

  const startCall = async () => {
    try {
      setError(null)
      setPhase('connecting')
      setTranscript([])
      setElapsed(0)
      setMuted(false)
      setVolume(0)

      // Create training session
      const { data } = await trainingAPI.createSession(agent.id)
      setSession(data.session)

      // Get VAPI public key
      let publicKey
      try {
        const { data: pkData } = await accountSettingsAPI.getVapiPublicKey()
        publicKey = pkData.vapiPublicKey
      } catch (err) {
        setError(t('trainingMode.noVapiKey'))
        setPhase('idle')
        return
      }

      const { default: Vapi } = await import('@vapi-ai/web')
      const vapi = new Vapi(publicKey)
      vapiRef.current = vapi

      vapi.on('call-start', () => {
        setPhase('active')
        timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000)
      })

      vapi.on('call-end', () => handleCallEnd(data.session.id))

      vapi.on('message', (msg) => {
        if (msg.type === 'transcript' && msg.transcriptType === 'final') {
          setTranscript(prev => [...prev, {
            role: msg.role === 'assistant' ? 'Agent' : 'You',
            text: msg.transcript
          }])
        } else if (msg.type === 'conversation-update' && msg.conversation) {
          setTranscript(
            msg.conversation
              .filter(m => m.role === 'assistant' || m.role === 'user')
              .map(m => ({ role: m.role === 'assistant' ? 'Agent' : 'You', text: m.content }))
          )
        }
      })

      vapi.on('volume-level', (level) => setVolume(level))

      vapi.on('error', (err) => {
        console.error('VAPI training call error:', err)
        setPhase('ended')
        setTranscript(prev => [...prev, { role: 'System', text: `Error: ${err.message || 'Call failed'}` }])
        clearTimer()
      })

      // Start with inline config (not an assistant ID)
      await vapi.start(data.vapiConfig)
    } catch (err) {
      console.error('Failed to start training call:', err)
      setError(err.response?.data?.error || err.message || 'Failed to start call')
      setPhase('idle')
    }
  }

  const handleCallEnd = async (sessionId) => {
    clearTimer()
    setPhase('ended')
    try {
      const transcriptText = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const { data } = await trainingAPI.completeSession(sessionId || session?.id, transcriptText)
      setSession(data)
      setProposedChanges(data.proposedChanges || [])
      if (data.proposedChanges?.length > 0) setPhase('review')
    } catch (err) {
      console.error('Failed to complete session:', err)
    }
  }

  const stopCall = () => {
    if (vapiRef.current) {
      vapiRef.current.stop()
      vapiRef.current = null
    }
  }

  const toggleMute = () => {
    if (vapiRef.current) {
      const newMuted = !muted
      vapiRef.current.setMuted(newMuted)
      setMuted(newMuted)
    }
  }

  const handleAccept = async () => {
    if (!session) return
    setAccepting(true)
    try {
      await trainingAPI.acceptSession(session.id)
      onAccepted?.()
      onClose()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to apply changes')
    } finally {
      setAccepting(false)
    }
  }

  const handleReject = async () => {
    if (!session) return
    try {
      await trainingAPI.rejectSession(session.id)
      onClose()
    } catch (err) {
      console.error('Failed to reject:', err)
    }
  }

  const handleClose = () => {
    if (vapiRef.current) { vapiRef.current.stop(); vapiRef.current = null }
    clearTimer()
    onClose()
  }

  const clearTimer = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  const formatElapsed = (s) => {
    const mins = Math.floor(s / 60).toString().padStart(2, '0')
    const secs = (s % 60).toString().padStart(2, '0')
    return `${mins}:${secs}`
  }

  useEffect(() => {
    if (transcriptEndRef.current) transcriptEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [transcript])

  useEffect(() => {
    return () => {
      if (vapiRef.current) { vapiRef.current.stop(); vapiRef.current = null }
      clearTimer()
    }
  }, [])

  const fieldLabel = (field) => ({
    firstMessage: t('trainingMode.fieldFirstMessage'),
    systemPrompt: t('trainingMode.fieldSystemPrompt'),
    name: t('trainingMode.fieldName')
  }[field] || field)

  // ── Review Phase ──
  if (phase === 'review') {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-[#1e2024] rounded-xl w-full max-w-lg shadow-2xl border border-primary-500/30">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
            <h3 className="text-base font-semibold text-gray-200">{t('trainingMode.reviewChanges')}</h3>
            <button onClick={handleClose} className="text-gray-500 hover:text-gray-300 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
            {proposedChanges.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">{t('trainingMode.noChanges')}</p>
            )}
            {proposedChanges.map((change, i) => (
              <div key={i} className="rounded-lg p-4 bg-[#16181d] border border-gray-700/50">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-primary-500/15 text-primary-400">
                    {fieldLabel(change.field)}
                  </span>
                  {change.description && <span className="text-xs text-gray-500">{change.description}</span>}
                </div>
                <div className="mb-2">
                  <span className="text-[10px] font-semibold uppercase text-red-400/70 tracking-wider">{t('trainingMode.before')}</span>
                  <div className="mt-1 text-sm rounded p-2 font-mono break-words bg-red-500/8 text-red-300 border border-red-500/15">
                    {change.oldValue || '(empty)'}
                  </div>
                </div>
                <div>
                  <span className="text-[10px] font-semibold uppercase text-green-400/70 tracking-wider">{t('trainingMode.after')}</span>
                  <div className="mt-1 text-sm rounded p-2 font-mono break-words bg-green-500/8 text-green-300 border border-green-500/15">
                    {change.newValue}
                  </div>
                </div>
              </div>
            ))}
            {error && <div className="text-sm text-red-400 text-center">{error}</div>}
          </div>

          {proposedChanges.length > 0 && (
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-700/50">
              <button onClick={handleReject} className="px-4 py-2 text-sm text-gray-400 border border-gray-600/50 rounded-lg hover:bg-gray-800 transition-colors">
                {t('trainingMode.reject')}
              </button>
              <button
                onClick={handleAccept}
                disabled={accepting}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {accepting ? t('trainingMode.applying') : `${t('trainingMode.accept')} (${proposedChanges.length})`}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Call Phase ──
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#1e2024] rounded-xl w-full max-w-md shadow-2xl border border-primary-500/30">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700/50">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary-500" />
            <h3 className="text-base font-semibold text-gray-200">{t('trainingMode.title')}</h3>
          </div>
          <button onClick={handleClose} className="text-gray-500 hover:text-gray-300 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Mic Icon */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              {phase === 'active' && (
                <div className="absolute -inset-3 rounded-full border border-primary-400/40 animate-ping"
                  style={{ opacity: Math.min(volume * 2, 0.5), animationDuration: '1.5s' }} />
              )}
              <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${
                phase === 'active' ? 'border-primary-500/40 bg-primary-500/10'
                  : phase === 'connecting' ? 'border-yellow-500/40 bg-yellow-500/10'
                  : 'border-gray-600/50 bg-[#1a1d22]'
              }`}>
                <svg className={`w-8 h-8 transition-colors duration-300 ${
                  phase === 'active' ? 'text-primary-400' : phase === 'connecting' ? 'text-yellow-400' : 'text-gray-500'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </div>
            </div>
            <span className="text-sm text-gray-400">
              {phase === 'idle' && t('trainingMode.ready')}
              {phase === 'connecting' && t('testCall.connecting')}
              {phase === 'active' && t('trainingMode.active')}
              {phase === 'ended' && t('trainingMode.processing')}
            </span>
            {(phase === 'active' || phase === 'ended') && elapsed > 0 && (
              <span className="text-xs font-mono text-gray-500">{formatElapsed(elapsed)} {t('testCall.elapsed')}</span>
            )}
          </div>

          {error && <div className="text-sm text-red-400 text-center px-4">{error}</div>}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            {phase === 'active' && (
              <button onClick={toggleMute}
                className={`p-3 rounded-xl transition-all duration-200 ${
                  muted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[#2a2d33] text-gray-400 border border-gray-600/30 hover:bg-[#33363d]'
                }`}>
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

            {(phase === 'idle' || phase === 'ended') ? (
              <button onClick={startCall}
                className="p-4 rounded-2xl bg-primary-600 text-white hover:bg-primary-500 transition-all duration-200 shadow-lg shadow-primary-600/20">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </button>
            ) : phase === 'connecting' ? (
              <button disabled className="p-4 rounded-2xl bg-yellow-600/80 text-white cursor-not-allowed shadow-lg">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
              </button>
            ) : phase === 'active' ? (
              <button onClick={stopCall}
                className="p-4 rounded-2xl bg-red-600 text-white hover:bg-red-500 transition-all duration-200 shadow-lg shadow-red-600/20">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.91 3.1c.46.36.66.96.5 1.52-.5 1.58-1.33 3.04-2.43 4.28-.37.42-.92.63-1.48.55-1.98-.29-3.86-.97-5.53-1.96a18.8 18.8 0 01-5.53 1.96c-.56.08-1.11-.13-1.48-.55-1.1-1.24-1.93-2.7-2.43-4.28a1.47 1.47 0 01.5-1.52h.25z" />
                </svg>
              </button>
            ) : null}
          </div>

          {/* Transcript */}
          <div className="rounded-xl border border-primary-500/30 bg-[#16181d] overflow-hidden shadow-[0_0_15px_rgba(var(--color-primary-500),0.08)]">
            <div className="px-4 py-2.5 border-b border-primary-500/20 bg-primary-500/5">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('testCall.transcript')}</span>
            </div>
            <div className="h-48 overflow-y-auto p-4 space-y-2.5">
              {transcript.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  {phase === 'idle' || phase === 'ended' ? t('trainingMode.startPrompt') : t('testCall.waitingForConversation')}
                </p>
              ) : (
                transcript.map((entry, i) => (
                  <div key={i} className={`text-sm ${
                    entry.role === 'Agent' ? 'text-primary-400' : entry.role === 'System' ? 'text-red-400' : 'text-gray-400'
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
