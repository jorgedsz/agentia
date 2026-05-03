import { useState } from 'react'
import { calendarAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

/**
 * Tiny GHL sync button. Only renders when entry.provider === 'ghl' and a calendar
 * is selected. The not_found state shows a critical red banner so the user knows
 * to pick another calendar.
 *
 * Props:
 *   entry: the calendar config entry ({ provider, integrationId, calendarId, meta? })
 *   onMetaChange(newMeta): called after a refresh succeeds (or fails).
 *   iconOnly: when true, renders just the icon button (no wrapper) so it can be
 *             placed inline with another label. Suppresses the not_found banner.
 */
export default function CalendarMetaPanel({ entry, onMetaChange, iconOnly = false }) {
  const { t } = useLanguage()
  const [refreshing, setRefreshing] = useState(false)

  if (!entry || entry.provider !== 'ghl') return null
  if (!entry.integrationId || !entry.calendarId) return null

  const status = entry.meta?.status

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

  const button = (
    <button
      type="button"
      onClick={refresh}
      disabled={refreshing}
      title={t('agentEdit.calendarMeta.refreshNow')}
      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50 p-1"
    >
      <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    </button>
  )

  if (iconOnly) return button

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

  // Default position is now inline with the label — nothing else to render here.
  return null
}
