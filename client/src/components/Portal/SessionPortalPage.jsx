import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { portalAPI } from '../../services/api'

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function SessionPortalPage() {
  const { token, sessionId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await portalAPI.getSession(token, sessionId)
        setData(res.data)
      } catch (err) {
        setError(err.response?.status === 404 ? 'Session not found' : 'Failed to load session')
      } finally {
        setLoading(false)
      }
    }
    fetchSession()
  }, [token, sessionId])

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
          <h2 className="text-xl font-semibold text-white mb-2">Session Unavailable</h2>
          <p className="text-gray-400">{error}</p>
          <Link to={`/portal/${token}`} className="text-accent-red hover:underline text-sm mt-4 inline-block">
            Back to Portal
          </Link>
        </div>
      </div>
    )
  }

  const { client, session } = data

  let structuredData = null
  if (session.structuredData) {
    try {
      structuredData = typeof session.structuredData === 'string'
        ? JSON.parse(session.structuredData)
        : session.structuredData
    } catch { /* ignore */ }
  }

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
            <p className="text-white font-medium">{client.name || client.email}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Back Link */}
        <Link
          to={`/portal/${token}`}
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Portal
        </Link>

        {/* Session Header */}
        <div className="bg-dark-card border border-dark-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-xl font-semibold text-white">
              {session.type === 'inbound' ? 'Inbound' : 'Outbound'} Call
            </h2>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${
              session.type === 'inbound'
                ? 'bg-blue-500/10 text-blue-400 border-blue-500/30'
                : 'bg-green-500/10 text-green-400 border-green-500/30'
            }`}>
              {session.type}
            </span>
            {session.outcome && session.outcome !== 'unknown' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30 capitalize">
                {session.outcome}
              </span>
            )}
          </div>
          <p className="text-gray-400 text-sm">
            {formatDate(session.createdAt)} · Duration: {formatDuration(session.durationSeconds)}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Recording + Transcript */}
          <div className="space-y-6">
            {/* Recording */}
            {session.recordingUrl && (
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-accent-red" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Recording
                </h3>
                <audio controls className="w-full" src={session.recordingUrl}>
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Transcript */}
            {session.transcript && (
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Transcription
                </h3>
                <div className="bg-dark-bg rounded-lg p-4 max-h-96 overflow-y-auto">
                  <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {session.transcript}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Right Column: AI Summary + Structured Data */}
          <div className="space-y-6">
            {/* AI Summary */}
            {session.summary && (
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                  AI Summary
                </h3>
                <div className="bg-dark-bg rounded-lg p-4">
                  <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {session.summary}
                  </p>
                </div>
              </div>
            )}

            {/* Structured Data / Extracted Info */}
            {structuredData && (
              <div className="bg-dark-card border border-dark-border rounded-xl p-6">
                <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  Extracted Data
                </h3>
                <div className="bg-dark-bg rounded-lg p-4 space-y-2">
                  {Object.entries(structuredData).map(([key, value]) => (
                    <div key={key} className="flex justify-between items-start gap-4">
                      <span className="text-gray-400 text-sm capitalize whitespace-nowrap">
                        {key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ')}
                      </span>
                      <span className="text-gray-200 text-sm text-right">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No content message */}
            {!session.summary && !structuredData && !session.transcript && !session.recordingUrl && (
              <div className="bg-dark-card border border-dark-border rounded-xl p-8 text-center">
                <p className="text-gray-400">No additional data available for this session</p>
              </div>
            )}
          </div>
        </div>
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
