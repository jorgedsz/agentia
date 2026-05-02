import { useState } from 'react'
import { calendarAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

function timeAgo(iso, t) {
  if (!iso) return t('agentEdit.calendarMeta.neverSynced')
  const diffMs = Date.now() - new Date(iso).getTime()
  if (isNaN(diffMs)) return ''
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

/**
 * Read-only panel showing GHL-cached calendar metadata.
 * Only renders when entry.provider === 'ghl' and entry has integration+calendar selected.
 *
 * Props:
 *   entry: the calendar config entry ({ provider, integrationId, calendarId, meta? })
 *   onMetaChange(newMeta): called when user clicks Refresh and a new meta is fetched
 */
export default function CalendarMetaPanel({ entry, onMetaChange }) {
  const { t } = useLanguage()
  const [refreshing, setRefreshing] = useState(false)

  if (!entry || entry.provider !== 'ghl') return null
  if (!entry.integrationId || !entry.calendarId) return null

  const meta = entry.meta
  const status = meta?.status

  const refresh = async () => {
    setRefreshing(true)
    try {
      const { data } = await calendarAPI.getDetails('ghl', entry.integrationId, entry.calendarId)
      if (data?.meta) onMetaChange(data.meta)
    } catch (err) {
      onMetaChange({
        source: 'ghl',
        status: 'error',
        error: err.message || 'Failed',
        updatedAt: new Date().toISOString()
      })
    } finally {
      setRefreshing(false)
    }
  }

  // Banner for not_found
  if (status === 'not_found') {
    return (
      <div className="rounded-lg p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40">
        <div className="text-sm text-red-700 dark:text-red-300 font-medium">
          {t('agentEdit.calendarMeta.notFound')}
        </div>
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">
          {t('agentEdit.calendarMeta.pickAnother')}
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-lg p-3 bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {t('agentEdit.calendarMeta.fromGhl')}
          <span className="text-[10px] text-gray-400 ml-1">
            {meta?.updatedAt
              ? t('agentEdit.calendarMeta.syncedAgo').replace('{{when}}', timeAgo(meta.updatedAt, t))
              : t('agentEdit.calendarMeta.neverSynced')}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          title={t('agentEdit.calendarMeta.refreshNow')}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {status === 'error' && (
        <div className="mb-2 text-xs text-yellow-600 dark:text-yellow-400">
          {t('agentEdit.calendarMeta.errorBanner')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500 dark:text-gray-400">{t('agentEdit.calendarMeta.tzLabel')}: </span>
          <span className="text-gray-900 dark:text-white">{meta?.timezone || '—'}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">{t('agentEdit.calendarMeta.durationLabel')}: </span>
          <span className="text-gray-900 dark:text-white">
            {meta?.slotDuration != null ? `${meta.slotDuration} ${t('agentEdit.calendarMeta.minutes')}` : '—'}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500 dark:text-gray-400">{t('agentEdit.calendarMeta.titleLabel')}: </span>
          <span className="text-gray-900 dark:text-white break-all">{meta?.eventTitle || '—'}</span>
        </div>
      </div>
    </div>
  )
}
