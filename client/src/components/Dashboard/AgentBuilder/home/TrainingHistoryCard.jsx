const formatDate = (s) => {
  if (!s) return ''
  try { return new Date(s).toLocaleString() } catch { return s }
}

export default function TrainingHistoryCard({ sessions, t }) {
  if (!sessions || sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          {t('agentBuilder.homeHistoryTitle')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('agentBuilder.homeHistoryEmpty')}</p>
      </div>
    )
  }

  const statusLabel = (s) => {
    if (s === 'accepted') return t('agentBuilder.homeHistoryStatusAccepted')
    if (s === 'rejected') return t('agentBuilder.homeHistoryStatusRejected')
    return t('agentBuilder.homeHistoryStatusActive')
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        {t('agentBuilder.homeHistoryTitle')}
      </h3>
      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-lg border border-gray-200 dark:border-dark-border px-3 py-2 text-sm flex items-center justify-between">
            <span>
              <span className="text-gray-700 dark:text-gray-300">{formatDate(s.createdAt)}</span>
              <span className="ml-2 text-gray-500">— {s.changesCount || 0} {t('agentBuilder.homeHistoryChanges')}</span>
            </span>
            <span className="text-xs text-gray-500">{statusLabel(s.status)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
