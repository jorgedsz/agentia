import { useState, useEffect, useRef } from 'react'
import { trainingAPI, accountSettingsAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

// Serialize anything to a readable string (objects → JSON, handling circular
// refs and Error instances). Returns '' for empty/unhelpful values.
function safeStringify(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v.trim()
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (v instanceof Error) return v.message || v.toString()
  try {
    const seen = new WeakSet()
    const s = JSON.stringify(v, (_k, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]'
        seen.add(val)
      }
      return val
    })
    return s && s !== '{}' && s !== '[]' ? s.slice(0, 400) : ''
  } catch {
    return ''
  }
}

// The Vapi web SDK fires `error` with inconsistent shapes (plain Error, nested
// { error: { message } }, validation arrays, daily.co ejection events). Dig out
// a useful message instead of falling back to a generic "Call failed".
function extractVapiError(err) {
  if (!err) return 'Call failed'
  if (typeof err === 'string') return err
  const candidates = [
    err.message,
    err.errorMsg,
    err.error?.message,
    err.error?.msg,
    err.error?.error?.message,
    err.error?.type,
    err.error,
    err,
  ]
  for (const c of candidates) {
    const s = safeStringify(c)
    if (s) return s
  }
  return 'Call failed'
}

// Visual identity per proposed-change type — color, accent bar and icon.
const TYPE_META = {
  field:     { badge: 'bg-primary-500/15 text-primary-300 border-primary-500/30', bar: 'bg-primary-500', glow: 'shadow-primary-500/10' },
  faq:       { badge: 'bg-sky-500/15 text-sky-300 border-sky-500/30',           bar: 'bg-sky-400',     glow: 'shadow-sky-500/10' },
  objection: { badge: 'bg-amber-500/15 text-amber-300 border-amber-500/30',     bar: 'bg-amber-400',   glow: 'shadow-amber-500/10' },
  rule:      { badge: 'bg-violet-500/15 text-violet-300 border-violet-500/30',  bar: 'bg-violet-400',  glow: 'shadow-violet-500/10' },
  example:   { badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', bar: 'bg-emerald-400', glow: 'shadow-emerald-500/10' },
}

function TypeIcon({ type, className = 'w-3.5 h-3.5' }) {
  const paths = {
    field: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
    faq: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    objection: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
    rule: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    example: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z',
  }
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={paths[type] || paths.field} />
    </svg>
  )
}

// Volume-reactive equalizer shown while the agent/user is speaking.
function Waveform({ volume, active }) {
  const bars = [0.45, 0.7, 1, 0.8, 0.5, 0.9, 0.6]
  return (
    <div className="flex items-end justify-center gap-1 h-7">
      {bars.map((m, i) => {
        const h = active ? Math.max(0.14, Math.min(1, volume * 2.6 * m + 0.12)) : 0.12
        return (
          <span
            key={i}
            className="w-1 rounded-full bg-primary-400 transition-all duration-150 ease-out"
            style={{ height: `${h * 100}%`, opacity: active ? 0.45 + h * 0.55 : 0.25 }}
          />
        )
      })}
    </div>
  )
}

export default function TrainingCallModal({ agent, onClose, onAccepted }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState('idle') // idle, connecting, active, ended, review
  const [transcript, setTranscript] = useState([])
  const [muted, setMuted] = useState(false)
  const [volume, setVolume] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [session, setSession] = useState(null)
  const [proposedChanges, setProposedChanges] = useState([])
  const [excluded, setExcluded] = useState(() => new Set())
  const [error, setError] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [mounted, setMounted] = useState(false)
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
        setTranscript(prev => [...prev, { role: 'System', text: `Error: ${extractVapiError(err)}` }])
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
    setPhase('analyzing')
    try {
      const transcriptText = transcript.map(t => `${t.role}: ${t.text}`).join('\n')
      const { data } = await trainingAPI.completeSession(sessionId || session?.id, transcriptText)
      setSession(data)
      setProposedChanges(data.proposedChanges || [])
      setExcluded(new Set())
      if (data.proposedChanges?.length > 0) setPhase('review')
      else setPhase('ended')
    } catch (err) {
      console.error('Failed to complete session:', err)
      setError(err.response?.data?.error || err.message || 'Failed to analyze session')
      setPhase('ended')
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

  const toggleExcluded = (i) => setExcluded(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i); else next.add(i)
    return next
  })

  const handleAccept = async () => {
    if (!session) return
    const selected = proposedChanges.filter((_, i) => !excluded.has(i))
    if (selected.length === 0) return
    setAccepting(true)
    try {
      await trainingAPI.acceptSession(session.id, selected)
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
    const r = requestAnimationFrame(() => setMounted(true))
    return () => {
      cancelAnimationFrame(r)
      if (vapiRef.current) { vapiRef.current.stop(); vapiRef.current = null }
      clearTimer()
    }
  }, [])

  const fieldLabel = (field) => ({
    firstMessage: t('trainingMode.fieldFirstMessage'),
    systemPrompt: t('trainingMode.fieldSystemPrompt'),
    name: t('trainingMode.fieldName')
  }[field] || field)

  const categoryLabel = (c) => ({
    faq: t('trainingMode.catFaq'),
    objection: t('trainingMode.catObjection'),
    rule: t('trainingMode.catRule'),
    example: t('trainingMode.catExample')
  }[c] || c)

  const updateChange = (i, patch) => setProposedChanges(prev => prev.map((c, idx) => idx === i ? { ...c, ...patch } : c))

  const agentInitial = (agent?.name || '?').trim().charAt(0).toUpperCase()
  const fieldCount = proposedChanges.filter(c => (c.type || 'field') === 'field').length
  const playbookCount = proposedChanges.filter(c => c.type === 'playbook').length
  const selectedCount = proposedChanges.length - excluded.size

  // Shared modal frame. Defined as plain render functions (called, not used as
  // JSX components) so React doesn't remount the subtree each render — that would
  // steal focus from the textareas while editing.
  const renderFrame = (children, maxW = 'max-w-md') => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`bg-[#1b1d21] rounded-2xl w-full ${maxW} shadow-2xl ring-1 ring-white/10 border border-primary-500/20 overflow-hidden transition-all duration-200 ${mounted ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}>
        {children}
      </div>
    </div>
  )

  // Agent header (shared)
  const renderHeader = (subtitle) => (
    <div className="relative px-5 py-4 border-b border-white/5 bg-gradient-to-r from-primary-600/15 via-primary-500/5 to-transparent">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center text-white font-bold text-base shadow-lg shadow-primary-600/30">
              {agentInitial}
            </div>
            {phase === 'active' && (
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-400 border-2 border-[#1b1d21] animate-pulse" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-white truncate">{agent?.name || t('trainingMode.title')}</h3>
            <p className="text-xs text-gray-400 truncate">{subtitle}</p>
          </div>
        </div>
        <button onClick={handleClose} className="text-gray-500 hover:text-gray-200 transition-colors p-1 rounded-lg hover:bg-white/5 flex-shrink-0">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )

  // ── Review Phase ──
  if (phase === 'review') {
    return renderFrame(
      <>
        {renderHeader(t('trainingMode.reviewSubtitle'))}

        {/* Summary counts */}
        <div className="flex items-center gap-2 px-5 pt-4 flex-wrap">
          {fieldCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-primary-500/10 text-primary-300 border border-primary-500/20">
              <TypeIcon type="field" className="w-3 h-3" /> {fieldCount} {t('trainingMode.fieldEdits')}
            </span>
          )}
          {playbookCount > 0 && (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
              <TypeIcon type="faq" className="w-3 h-3" /> {playbookCount} {t('trainingMode.knowledgeEntries')}
            </span>
          )}
        </div>

        <div className="p-5 space-y-3 max-h-[55vh] overflow-y-auto">
          {proposedChanges.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t('trainingMode.noChanges')}</p>
          )}
          {proposedChanges.map((change, i) => {
            const type = change.type === 'playbook' ? change.category : 'field'
            const meta = TYPE_META[type] || TYPE_META.field
            const isExcluded = excluded.has(i)
            return (
              <div
                key={i}
                className={`relative rounded-xl bg-[#16181d] border overflow-hidden transition-all ${isExcluded ? 'border-white/5 opacity-50' : `border-white/10 shadow-lg ${meta.glow}`}`}
              >
                <span className={`absolute left-0 top-0 bottom-0 w-1 ${meta.bar} ${isExcluded ? 'opacity-30' : ''}`} />
                <div className="p-4 pl-5">
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${meta.badge}`}>
                      <TypeIcon type={type} />
                      {change.type === 'playbook' ? categoryLabel(change.category) : fieldLabel(change.field)}
                    </span>
                    {/* Include / exclude toggle */}
                    <button
                      onClick={() => toggleExcluded(i)}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border transition-colors ${
                        isExcluded
                          ? 'border-white/10 text-gray-500 hover:text-gray-300'
                          : 'border-green-500/30 text-green-400 bg-green-500/5'
                      }`}
                      title={isExcluded ? t('playbook.enable') : t('playbook.disable')}
                    >
                      <span className={`w-3.5 h-3.5 rounded flex items-center justify-center ${isExcluded ? 'border border-gray-600' : 'bg-green-500'}`}>
                        {!isExcluded && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                        )}
                      </span>
                    </button>
                  </div>

                  {change.description && <p className="text-xs text-gray-500 mb-3 italic">{change.description}</p>}

                  {change.type === 'playbook' ? (
                    <div className="space-y-2.5">
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider">{t('trainingMode.playbookTitle')}</span>
                        <textarea
                          value={change.title}
                          onChange={(e) => updateChange(i, { title: e.target.value })}
                          rows={2}
                          disabled={isExcluded}
                          className="mt-1 w-full text-sm rounded-lg p-2.5 break-words bg-[#0f1115] text-gray-200 border border-white/10 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-y disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-gray-500 tracking-wider">{t('trainingMode.playbookContent')}</span>
                        <textarea
                          value={change.content}
                          onChange={(e) => updateChange(i, { content: e.target.value })}
                          rows={Math.min(10, Math.max(2, (change.content || '').split('\n').length + 1))}
                          disabled={isExcluded}
                          className="mt-1 w-full text-sm rounded-lg p-2.5 break-words bg-[#0f1115] text-gray-200 border border-white/10 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 resize-y disabled:opacity-50"
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-red-400/70 tracking-wider">{t('trainingMode.before')}</span>
                        <div className="mt-1 text-sm rounded-lg p-2.5 font-mono break-words bg-red-500/[0.06] text-red-300/90 border border-red-500/15 whitespace-pre-wrap max-h-32 overflow-y-auto">
                          {change.oldValue || '(empty)'}
                        </div>
                      </div>
                      <div>
                        <span className="text-[10px] font-semibold uppercase text-green-400/70 tracking-wider">{t('trainingMode.after')}</span>
                        <textarea
                          value={change.newValue}
                          onChange={(e) => updateChange(i, { newValue: e.target.value })}
                          rows={Math.min(12, Math.max(2, (change.newValue || '').split('\n').length + 1))}
                          disabled={isExcluded}
                          className="mt-1 w-full text-sm rounded-lg p-2.5 font-mono break-words bg-green-500/[0.06] text-green-300 border border-green-500/20 focus:outline-none focus:border-green-500/50 focus:ring-1 focus:ring-green-500/20 resize-y disabled:opacity-50"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
          {error && <div className="text-sm text-red-400 text-center">{error}</div>}
        </div>

        {proposedChanges.length > 0 && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-white/5 bg-[#16181d]">
            <span className="text-xs text-gray-500">
              {selectedCount}/{proposedChanges.length} {t('trainingMode.selected')}
            </span>
            <div className="flex items-center gap-3">
              <button onClick={handleReject} className="px-4 py-2 text-sm text-gray-400 border border-white/10 rounded-lg hover:bg-white/5 hover:text-gray-200 transition-colors">
                {t('trainingMode.reject')}
              </button>
              <button
                onClick={handleAccept}
                disabled={accepting || selectedCount === 0}
                className="px-4 py-2 text-sm font-semibold text-white bg-primary-600 rounded-lg hover:bg-primary-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-lg shadow-primary-600/20"
              >
                {accepting ? t('trainingMode.applying') : `${t('trainingMode.accept')} (${selectedCount})`}
              </button>
            </div>
          </div>
        )}
      </>,
      'max-w-lg'
    )
  }

  // ── Call Phase ──
  const statusText = {
    idle: t('trainingMode.ready'),
    connecting: t('testCall.connecting'),
    active: t('trainingMode.active'),
    analyzing: t('trainingMode.analyzing'),
    ended: t('trainingMode.processing'),
  }[phase]

  const statusHint = {
    idle: t('trainingMode.idleHint'),
    connecting: t('trainingMode.connectingHint'),
    active: t('trainingMode.liveHint'),
    analyzing: t('trainingMode.analyzingHint'),
    ended: '',
  }[phase]

  const orbState = phase === 'active'
    ? 'border-primary-500/50 bg-primary-500/10'
    : phase === 'connecting'
      ? 'border-yellow-500/40 bg-yellow-500/10'
      : phase === 'analyzing'
        ? 'border-primary-500/40 bg-primary-500/10'
        : 'border-white/10 bg-[#16181d]'

  return renderFrame(
    <>
      {renderHeader(muted && phase === 'active' ? t('trainingMode.mute') : t('trainingMode.subtitle'))}

      <div className="p-6 space-y-5">
        {/* Orb */}
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="relative w-28 h-28 flex items-center justify-center">
            {/* reactive rings */}
            {phase === 'active' && (
              <>
                <span className="absolute inset-0 rounded-full border border-primary-400/30 animate-ping" style={{ animationDuration: '2s' }} />
                <span
                  className="absolute rounded-full border-2 border-primary-400/40 transition-all duration-150"
                  style={{ inset: `${Math.max(0, 14 - volume * 22)}px`, opacity: 0.3 + Math.min(volume * 1.6, 0.6) }}
                />
              </>
            )}
            <div className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all duration-300 border-2 ${orbState}`}>
              {phase === 'analyzing' ? (
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-400" />
              ) : phase === 'active' ? (
                <Waveform volume={volume} active={!muted} />
              ) : (
                <svg className={`w-8 h-8 transition-colors duration-300 ${
                  phase === 'connecting' ? 'text-yellow-400' : 'text-gray-500'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              )}
            </div>
          </div>

          <div className="text-center">
            <p className={`text-sm font-semibold ${phase === 'analyzing' || phase === 'active' ? 'text-primary-300' : 'text-gray-300'}`}>
              {statusText}
            </p>
            {statusHint && <p className="text-xs text-gray-500 mt-1 max-w-xs">{statusHint}</p>}
          </div>

          {(phase === 'active' || phase === 'ended' || phase === 'analyzing') && elapsed > 0 && (
            <span className="text-xs font-mono text-gray-500 bg-white/5 px-2.5 py-1 rounded-full border border-white/5">
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-400 text-center px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/20">{error}</div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-4">
          {phase === 'active' && (
            <button onClick={toggleMute}
              className={`flex flex-col items-center gap-1 group`}>
              <span className={`p-3.5 rounded-2xl transition-all duration-200 ${
                muted ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-white/5 text-gray-300 border border-white/10 group-hover:bg-white/10'
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
              </span>
              <span className="text-[10px] text-gray-500">{muted ? t('trainingMode.unmute') : t('trainingMode.mute')}</span>
            </button>
          )}

          {(phase === 'idle' || phase === 'ended') ? (
            <button onClick={startCall}
              className="flex flex-col items-center gap-1.5 group">
              <span className="p-5 rounded-full bg-primary-600 text-white group-hover:bg-primary-500 transition-all duration-200 shadow-xl shadow-primary-600/30 group-hover:scale-105">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
              </span>
              <span className="text-xs font-medium text-gray-300">{t('trainingMode.startCall')}</span>
            </button>
          ) : phase === 'connecting' || phase === 'analyzing' ? (
            <span className={`p-5 rounded-full ${phase === 'analyzing' ? 'bg-primary-600/80' : 'bg-yellow-600/80'} text-white shadow-lg`}>
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white" />
            </span>
          ) : phase === 'active' ? (
            <button onClick={stopCall}
              className="flex flex-col items-center gap-1.5 group">
              <span className="p-5 rounded-full bg-red-600 text-white group-hover:bg-red-500 transition-all duration-200 shadow-xl shadow-red-600/30 group-hover:scale-105">
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M3.68 16.07l3.92-3.11V9.59c2.85-.93 5.94-.93 8.8 0v3.38l3.91 3.1c.46.36.66.96.5 1.52-.5 1.58-1.33 3.04-2.43 4.28-.37.42-.92.63-1.48.55-1.98-.29-3.86-.97-5.53-1.96a18.8 18.8 0 01-5.53 1.96c-.56.08-1.11-.13-1.48-.55-1.1-1.24-1.93-2.7-2.43-4.28a1.47 1.47 0 01.5-1.52h.25z" />
                </svg>
              </span>
              <span className="text-xs font-medium text-gray-300">{t('trainingMode.endCall')}</span>
            </button>
          ) : null}
        </div>

        {/* Transcript / Tips */}
        <div className="rounded-xl border border-white/10 bg-[#16181d] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5 bg-white/[0.02]">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('testCall.transcript')}</span>
            {phase === 'active' && (
              <span className="flex items-center gap-1.5 text-[10px] text-green-400">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" /> Live
              </span>
            )}
          </div>
          <div className="h-52 overflow-y-auto p-4 space-y-3">
            {transcript.length === 0 ? (
              (phase === 'idle' || phase === 'ended') ? (
                <div className="space-y-3 py-2">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{t('trainingMode.tipsTitle')}</p>
                  {[t('trainingMode.tip1'), t('trainingMode.tip2'), t('trainingMode.tip3')].map((tip, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary-500/15 text-primary-400 flex items-center justify-center text-[11px] font-bold">{i + 1}</span>
                      <span className="text-sm text-gray-400 leading-snug">{tip}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-10">{t('testCall.waitingForConversation')}</p>
              )
            ) : (
              transcript.map((entry, i) => {
                if (entry.role === 'System') {
                  return (
                    <div key={i} className="text-xs text-red-400 text-center bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 break-words">
                      {entry.text}
                    </div>
                  )
                }
                const isAgent = entry.role === 'Agent'
                return (
                  <div key={i} className={`flex items-start gap-2 ${isAgent ? '' : 'flex-row-reverse'}`}>
                    <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      isAgent ? 'bg-primary-500/20 text-primary-300' : 'bg-white/10 text-gray-300'
                    }`}>
                      {isAgent ? agentInitial : t('trainingMode.you').charAt(0)}
                    </span>
                    <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm break-words ${
                      isAgent
                        ? 'bg-primary-500/10 text-gray-200 rounded-tl-sm'
                        : 'bg-white/5 text-gray-300 rounded-tr-sm'
                    }`}>
                      {entry.text}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>
    </>
  )
}
