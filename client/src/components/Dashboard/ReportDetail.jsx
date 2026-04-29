import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useLanguage } from '../../context/LanguageContext'
import { reportsAPI } from '../../services/api'
import ReportRenderer from './ReportRenderer'

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-600',
  running: 'bg-amber-100 text-amber-700',
  done: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700'
}

const slugify = (s) => (s || 'report').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

export default function ReportDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const documentRef = useRef(null)
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer
    const load = async () => {
      try {
        const { data } = await reportsAPI.get(id)
        if (cancelled) return
        setReport(data.report)
        setLoading(false)
        if (data.report?.status === 'running' || data.report?.status === 'pending') {
          timer = setTimeout(load, 2000)
        }
      } catch (err) {
        if (cancelled) return
        setError(err.response?.data?.error || t('reports.loadOneFailed'))
        setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [id, t])

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
    if (!window.confirm(t('reports.deleteConfirm', { name: report.name }))) return
    try {
      await reportsAPI.delete(report.id)
      navigate('/dashboard/reports')
    } catch (err) {
      window.alert(err.response?.data?.error || t('reports.deleteFailed'))
    }
  }

  const handleDownloadPdf = async () => {
    if (!documentRef.current) return
    setDownloading(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      // Wait a tick so any chart re-render finishes before snapshotting.
      await new Promise((r) => setTimeout(r, 100))
      await html2pdf()
        .set({
          margin: [15, 15, 15, 15],
          filename: `${slugify(report.name)}.pdf`,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'] }
        })
        .from(documentRef.current)
        .save()
    } catch (err) {
      console.error('PDF download failed', err)
      window.alert('PDF download failed')
    } finally {
      setDownloading(false)
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
          {error || t('reports.notFound')}
        </div>
      </div>
    )
  }

  const filters = report.filters || {}
  const status = report.status
  const isWorking = status === 'running' || status === 'pending'
  const statusLabel = t(`reports.status${status.charAt(0).toUpperCase() + status.slice(1)}`)

  return (
    <div className="p-6 max-w-4xl">
      <button
        onClick={() => navigate('/dashboard/reports')}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
      >
        {t('reports.back')}
      </button>

      <div className="flex items-start justify-between mb-4 gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{report.name}</h1>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || STATUS_STYLES.pending}`}>
              {statusLabel}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{report.model}</span>
            {report.rowsUsed != null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('reports.rowsCount', { count: report.rowsUsed })}
              </span>
            )}
            {report.tokensIn != null && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {t('reports.tokensSummary', { in: report.tokensIn, out: report.tokensOut })}
              </span>
            )}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {new Date(report.createdAt).toLocaleString()}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {report.result && (
            <>
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover"
              >
                {copied ? t('reports.copied') : t('reports.copy')}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading}
                className="px-3 py-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-lg disabled:opacity-50 flex items-center gap-1.5"
              >
                {downloading && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />}
                {t('reports.downloadPdf')}
              </button>
            </>
          )}
          <button onClick={handleDelete} className="text-sm text-red-500 hover:underline">
            {t('reports.delete')}
          </button>
        </div>
      </div>

      <details className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 mb-4">
        <summary className="text-sm font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
          {t('reports.promptHeading')}
        </summary>
        <pre className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300 font-mono mt-3">{report.prompt}</pre>
        {(filters.dateFrom || filters.dateTo || filters.agentIds?.length || filters.chatbotIds?.length || filters.outcomes?.length) && (
          <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border text-xs text-gray-500 dark:text-gray-400 space-y-1">
            <div><strong>{t('reports.filtersDataset')}:</strong> {report.dataset}</div>
            {(filters.dateFrom || filters.dateTo) && (
              <div><strong>{t('reports.filtersDateRange')}:</strong> {filters.dateFrom || '—'} → {filters.dateTo || '—'}</div>
            )}
            {filters.agentIds?.length > 0 && (
              <div><strong>{t('reports.filtersAgents')}:</strong> {t('reports.filtersSelected', { count: filters.agentIds.length })}</div>
            )}
            {filters.chatbotIds?.length > 0 && (
              <div><strong>{t('reports.filtersChatbots')}:</strong> {t('reports.filtersSelected', { count: filters.chatbotIds.length })}</div>
            )}
            {filters.outcomes?.length > 0 && (
              <div><strong>{t('reports.filtersOutcomes')}:</strong> {filters.outcomes.join(', ')}</div>
            )}
          </div>
        )}
      </details>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {isWorking ? (
          <div className="p-10 flex items-center gap-3 text-sm text-gray-500">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600" />
            {t('reports.generatingResult')}
          </div>
        ) : status === 'failed' ? (
          <div className="p-6 text-sm text-red-600">
            <div className="font-medium mb-1">{t('reports.generationFailed')}</div>
            <div className="text-xs font-mono">{report.error || 'Unknown error'}</div>
          </div>
        ) : (
          <div ref={documentRef} className="px-10 py-8 bg-white text-gray-900 max-w-none">
            <ReportRenderer markdown={report.result} />
            <div className="mt-10 pt-4 border-t border-gray-200 text-xs text-gray-400 flex justify-between">
              <span>{report.name}</span>
              <span>{new Date(report.createdAt).toLocaleString()}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
