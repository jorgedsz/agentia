import { useState, useEffect } from 'react'
import { callsAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const OUTCOME_CONFIG = {
  booked: { label: 'Booked', bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  answered: { label: 'Answered', bg: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  transferred: { label: 'Transferred', bg: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400' },
  not_interested: { label: 'Not Interested', bg: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' },
  failed: { label: 'Failed', bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  voicemail: { label: 'Voicemail', bg: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' },
  unknown: { label: 'Unknown', bg: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' }
}

function OutcomeBadge({ outcome }) {
  const config = OUTCOME_CONFIG[outcome] || OUTCOME_CONFIG.unknown
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bg}`}>
      {config.label}
    </span>
  )
}

export default function CallLogs() {
  const { t } = useLanguage()
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [selectedCall, setSelectedCall] = useState(null)
  const [updatingOutcome, setUpdatingOutcome] = useState(false)

  useEffect(() => {
    fetchCalls()
  }, [])

  const fetchCalls = async () => {
    try {
      setLoading(true)
      const response = await callsAPI.list()
      setCalls(response.data.calls || [])
      console.log('Call logs response:', response.data)
      console.log('User credits from server:', response.data.userCredits)
      console.log('Billing result:', response.data.billingResult)
      // Dispatch event to refresh sidebar credits (billing syncs on list)
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load call logs')
    } finally {
      setLoading(false)
    }
  }

  const handleOutcomeChange = async (callLogId, newOutcome) => {
    if (!callLogId) return
    try {
      setUpdatingOutcome(true)
      await callsAPI.updateOutcome(callLogId, newOutcome)
      // Update local state
      setCalls(prev => prev.map(c =>
        c.callLogId === callLogId ? { ...c, outcome: newOutcome } : c
      ))
      if (selectedCall?.callLogId === callLogId) {
        setSelectedCall(prev => ({ ...prev, outcome: newOutcome }))
      }
    } catch (err) {
      console.error('Failed to update outcome:', err)
    } finally {
      setUpdatingOutcome(false)
    }
  }

  const formatDuration = (seconds) => {
    if (!seconds) return '-'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleString()
  }

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'ended':
      case 'completed':
        return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
      case 'in-progress':
      case 'ringing':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      case 'failed':
      case 'busy':
      case 'no-answer':
        return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      case 'queued':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getEndReasonLabel = (reason) => {
    switch (reason) {
      case 'assistant-error': return 'Assistant Error'
      case 'assistant-not-found': return 'Assistant Not Found'
      case 'db-error': return 'Database Error'
      case 'no-server-available': return 'No Server Available'
      case 'pipeline-error-extra-function-failed': return 'Pipeline Error'
      case 'pipeline-error-first-message-failed': return 'First Message Failed'
      case 'pipeline-error-function-filler-failed': return 'Function Filler Failed'
      case 'pipeline-error-function-failed': return 'Function Failed'
      case 'pipeline-error-openai-llm-failed': return 'LLM Failed'
      case 'pipeline-error-azure-openai-llm-failed': return 'Azure LLM Failed'
      case 'pipeline-error-openai-voice-failed': return 'Voice Failed'
      case 'pipeline-error-cartesia-voice-failed': return 'Cartesia Voice Failed'
      case 'pipeline-error-eleven-labs-voice-failed': return 'ElevenLabs Voice Failed'
      case 'pipeline-error-deepgram-transcriber-failed': return 'Transcriber Failed'
      case 'pipeline-no-available-model': return 'No Model Available'
      case 'server-shutdown': return 'Server Shutdown'
      case 'twilio-failed-to-connect-call': return 'Twilio Connection Failed'
      case 'assistant-ended-call': return 'Assistant Ended'
      case 'assistant-said-end-call-phrase': return 'End Call Phrase'
      case 'assistant-forwarded-call': return 'Call Forwarded'
      case 'assistant-join-timed-out': return 'Join Timeout'
      case 'customer-busy': return 'Customer Busy'
      case 'customer-ended-call': return 'Customer Ended'
      case 'customer-did-not-answer': return 'No Answer'
      case 'customer-did-not-give-microphone-permission': return 'No Mic Permission'
      case 'exceeded-max-duration': return 'Max Duration Exceeded'
      case 'manually-canceled': return 'Manually Canceled'
      case 'phone-call-provider-closed-websocket': return 'Provider Closed'
      case 'silence-timed-out': return 'Silence Timeout'
      case 'voicemail': return 'Voicemail'
      default: return reason || '-'
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('callLogs.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('callLogs.subtitle')}
          </p>
        </div>
        <button
          onClick={fetchCalls}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('common.dismiss')}</button>
        </div>
      )}

      {/* Call Detail Modal */}
      {selectedCall && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-dark-border">
            <div className="sticky top-0 bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('callLogs.callDetails')}</h3>
              <button
                onClick={() => setSelectedCall(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.callId')}</label>
                  <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{selectedCall.id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">Status</label>
                  <p><span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(selectedCall.status)}`}>{selectedCall.status}</span></p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.startedAt')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{formatDate(selectedCall.startedAt || selectedCall.createdAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.endedAt')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{formatDate(selectedCall.endedAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.duration')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{formatDuration(selectedCall.duration)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.endReason')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{getEndReasonLabel(selectedCall.endedReason)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.customerNumber')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedCall.customer?.number || '-'}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.phoneNumber')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedCall.phoneNumber?.number || '-'}</p>
                </div>
                {(selectedCall.costCharged || selectedCall.cost) && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.cost')}</label>
                    <p className="text-sm text-gray-900 dark:text-white">${(selectedCall.costCharged || selectedCall.cost).toFixed(4)}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('callLogs.agent')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{selectedCall.agentName || selectedCall.assistant?.name || '-'}</p>
                </div>
                {/* Outcome with manual override */}
                <div className="col-span-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">{t('callLogs.outcome')}</label>
                  {selectedCall.callLogId ? (
                    <select
                      value={selectedCall.outcome || 'unknown'}
                      onChange={(e) => handleOutcomeChange(selectedCall.callLogId, e.target.value)}
                      disabled={updatingOutcome}
                      className="px-3 py-1.5 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-sm text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    >
                      {Object.entries(OUTCOME_CONFIG).map(([key, config]) => (
                        <option key={key} value={key}>{config.label}</option>
                      ))}
                    </select>
                  ) : (
                    <OutcomeBadge outcome={selectedCall.outcome || 'unknown'} />
                  )}
                </div>
              </div>

              {selectedCall.transcript && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('callLogs.transcript')}</label>
                  <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4 max-h-64 overflow-y-auto">
                    <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">{selectedCall.transcript}</pre>
                  </div>
                </div>
              )}

              {selectedCall.messages && selectedCall.messages.length > 0 && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('callLogs.messages')}</label>
                  <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4 max-h-64 overflow-y-auto space-y-2">
                    {selectedCall.messages.map((msg, i) => (
                      <div key={i} className={`text-sm ${msg.role === 'assistant' ? 'text-primary-600 dark:text-primary-400' : 'text-gray-900 dark:text-white'}`}>
                        <span className="font-medium">{msg.role}:</span> {msg.content || msg.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCall.recordingUrl && (
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('callLogs.recording')}</label>
                  <audio controls className="w-full">
                    <source src={selectedCall.recordingUrl} type="audio/mpeg" />
                    Your browser does not support the audio element.
                  </audio>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Calls Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        {calls.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('callLogs.noCallsYet')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('callLogs.makeFirstCall')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.date')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.agent')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.customer')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.outcome')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.duration')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.endReason')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('callLogs.cost')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {calls.map((call) => (
                  <tr key={call.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {formatDate(call.startedAt || call.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {call.agentName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {call.type === 'webCall' ? t('callLogs.testCall') : (call.customer?.number || '-')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(call.status)}`}>
                        {call.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <OutcomeBadge outcome={call.outcome || 'unknown'} />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {formatDuration(call.duration)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {getEndReasonLabel(call.endedReason)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {call.costCharged ? `$${call.costCharged.toFixed(4)}` : (call.cost ? `$${call.cost.toFixed(4)}` : '-')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium"
                      >
                        {t('common.viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
