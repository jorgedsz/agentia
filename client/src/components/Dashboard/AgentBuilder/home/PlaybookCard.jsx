import { useState, useEffect, useCallback } from 'react'
import { playbookAPI } from '../../../../services/api'

const CATEGORY_ORDER = ['faq', 'objection', 'rule', 'example']

export default function PlaybookCard({ agentId, t }) {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ title: '', content: '' })
  const [busyId, setBusyId] = useState(null)

  const categoryLabel = (c) => ({
    faq: t('trainingMode.catFaq'),
    objection: t('trainingMode.catObjection'),
    rule: t('trainingMode.catRule'),
    example: t('trainingMode.catExample'),
  }[c] || c)

  const fetchEntries = useCallback(async () => {
    setLoading(true)
    try {
      const { data } = await playbookAPI.list(agentId)
      setEntries(data.entries || [])
    } catch {
      setEntries([])
    } finally {
      setLoading(false)
    }
  }, [agentId])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const startEdit = (e) => { setEditingId(e.id); setDraft({ title: e.title, content: e.content }) }
  const cancelEdit = () => { setEditingId(null); setDraft({ title: '', content: '' }) }

  const saveEdit = async (id) => {
    setBusyId(id)
    try {
      await playbookAPI.update(id, { title: draft.title, content: draft.content })
      cancelEdit()
      await fetchEntries()
    } finally { setBusyId(null) }
  }

  const toggle = async (e) => {
    setBusyId(e.id)
    try { await playbookAPI.update(e.id, { enabled: !e.enabled }); await fetchEntries() }
    finally { setBusyId(null) }
  }

  const remove = async (e) => {
    if (!confirm(t('playbook.deleteConfirm'))) return
    setBusyId(e.id)
    try { await playbookAPI.remove(e.id); await fetchEntries() }
    finally { setBusyId(null) }
  }

  const grouped = CATEGORY_ORDER
    .map(cat => ({ cat, items: entries.filter(e => e.category === cat) }))
    .filter(g => g.items.length > 0)

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('playbook.title')}</h3>
        <span className="text-xs text-gray-400">{entries.length}</span>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t('playbook.subtitle')}</p>

      {loading ? (
        <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" /></div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 py-2">{t('playbook.empty')}</p>
      ) : (
        <div className="space-y-4">
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mb-1.5">{categoryLabel(cat)}</div>
              <div className="space-y-2">
                {items.map(e => (
                  <div key={e.id} className={`rounded-lg border px-3 py-2 ${e.enabled ? 'border-gray-200 dark:border-dark-border' : 'border-gray-200/60 dark:border-dark-border/50 opacity-60'}`}>
                    {editingId === e.id ? (
                      <div className="space-y-2">
                        <textarea value={draft.title} onChange={ev => setDraft(d => ({ ...d, title: ev.target.value }))} rows={2}
                          className="w-full text-sm rounded p-2 bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white resize-y" />
                        <textarea value={draft.content} onChange={ev => setDraft(d => ({ ...d, content: ev.target.value }))} rows={3}
                          className="w-full text-sm rounded p-2 bg-gray-50 dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white resize-y" />
                        <div className="flex justify-end gap-2">
                          <button onClick={cancelEdit} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">{t('common.cancel')}</button>
                          <button onClick={() => saveEdit(e.id)} disabled={busyId === e.id} className="text-xs px-3 py-1 bg-primary-600 text-white rounded hover:bg-primary-700 disabled:opacity-50">{t('common.save')}</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 dark:text-white break-words">{e.title}</div>
                          {e.content && <div className="text-xs text-gray-500 dark:text-gray-400 break-words mt-0.5">{e.content}</div>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button onClick={() => toggle(e)} disabled={busyId === e.id} title={e.enabled ? t('playbook.disable') : t('playbook.enable')}
                            className={`text-xs px-2 py-1 rounded border ${e.enabled ? 'border-green-300 dark:border-green-800 text-green-600 dark:text-green-400' : 'border-gray-300 dark:border-dark-border text-gray-400'}`}>
                            {e.enabled ? t('playbook.on') : t('playbook.off')}
                          </button>
                          <button onClick={() => startEdit(e)} className="text-xs px-2 py-1 rounded border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover">{t('common.edit')}</button>
                          <button onClick={() => remove(e)} disabled={busyId === e.id} className="text-xs px-2 py-1 rounded border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">{t('common.delete')}</button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
