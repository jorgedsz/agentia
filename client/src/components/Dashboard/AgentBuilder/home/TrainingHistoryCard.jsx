const formatDate = (s) => {
  if (!s) return ''
  try { return new Date(s).toLocaleString() } catch { return s }
}

export default function TrainingHistoryCard({ sessions, t, onRevert, revertingId }) {
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
    if (s === 'reverted') return t('agentBuilder.homeHistoryStatusReverted')
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
            <span className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{statusLabel(s.status)}</span>
              {s.status === 'accepted' && onRevert && (
                <button
                  onClick={() => onRevert(s)}
                  disabled={revertingId === s.id}
                  className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover disabled:opacity-50"
                >
                  {revertingId === s.id ? '…' : t('agentBuilder.homeHistoryRevert')}
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
