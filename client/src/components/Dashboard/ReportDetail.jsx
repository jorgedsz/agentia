import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { reportsAPI } from '../../services/api'

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400',
  running: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer
    const load = async () => {
      try {
        const { data } = await reportsAPI.get(id)
        if (cancelled) return
        setReport(data.report)
        setLoading(false)
        // Poll while running so the UI reflects progress without manual refresh.
        if (data.report?.status === 'running' || data.report?.status === 'pending') {
          timer = setTimeout(load, 2000)
        }
      } catch (err) {
        if (cancelled) return
        setError(err.response?.data?.error || 'Failed to load report')
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id])

  const handleCopy = async () => {
    if (!report?.result) return
    try {
      await navigator.clipboard.writeText(report.result)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      window.prompt('Copy report:', report.result)
    }
  }

  const handleDelete = async () => {
    if (!window.confirm(`Delete report "${report.name}"?`)) return
    try {
      await reportsAPI.delete(report.id)
      navigate('/dashboard/reports')
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to delete')
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (error || !report) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error || 'Report not found'}
        </div>
      </div>
    )
  }

  const filters = report.filters || {}

  return (
    <div className="p-6 max-w-4xl">
      <button
        onClick={() => navigate('/dashboard/reports')}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
      >
        ← Back to reports
      </button>

      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{report.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[report.status] || STATUS_STYLES.pending}`}>
              {report.status}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{report.model}</span>
            {report.rowsUsed != null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{report.rowsUsed} rows</span>
            )}
            {report.tokensIn != null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {report.tokensIn} → {report.tokensOut} tokens
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(report.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        <button
          onClick={handleDelete}
          className="text-sm text-red-500 hover:underline"
        >
          Delete
        </button>
      </div>

      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 mb-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Prompt</h3>
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono">{report.prompt}</pre>
        {(filters.dateFrom || filters.dateTo || filters.agentIds?.length || filters.chatbotIds?.length || filters.outcomes?.length) && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <div><strong>Dataset:</strong> {report.dataset}</div>
            {(filters.dateFrom || filters.dateTo) && (
              <div><strong>Date range:</strong> {filters.dateFrom || '—'} to {filters.dateTo || '—'}</div>
            )}
            {filters.agentIds?.length > 0 && <div><strong>Agents:</strong> {filters.agentIds.length} selected</div>}
            {filters.chatbotIds?.length > 0 && <div><strong>Chatbots:</strong> {filters.chatbotIds.length} selected</div>}
            {filters.outcomes?.length > 0 && <div><strong>Outcomes:</strong> {filters.outcomes.join(', ')}</div>}
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Result</h3>
          {report.result && (
            <button
              onClick={handleCopy}
              className="text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>
        {report.status === 'running' || report.status === 'pending' ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
            Generating report…
          </div>
        ) : report.status === 'failed' ? (
          <div className="text-sm text-red-500">
            <div className="font-medium mb-1">Generation failed</div>
            <div className="text-xs font-mono">{report.error || 'Unknown error'}</div>
          </div>
        ) : (
          <pre className="whitespace-pre-wrap text-sm text-gray-800 dark:text-gray-200 leading-relaxed">{report.result}</pre>
        )}
      </div>
    </div>
  )
}
