import { useState, useEffect, useCallback } from 'react'
import { playbookAPI } from '../../../../services/api'

const CATEGORY_ORDER = ['faq', 'objection', 'rule', 'example']

// Per-category visual identity (matches the training review modal).
const CAT_META = {
  faq:       { badge: 'bg-sky-500/15 text-sky-600 dark:text-sky-300 border-sky-500/30',         dot: 'bg-sky-400',     icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
  objection: { badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30',  dot: 'bg-amber-400',   icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  rule:      { badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/30', dot: 'bg-violet-400', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  example:   { badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/30', dot: 'bg-emerald-400', icon: 'M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z' },
}

function CatIcon({ cat, className = 'w-3.5 h-3.5' }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={(CAT_META[cat] || CAT_META.faq).icon} />
    </svg>
  )
}

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

  const enabledCount = entries.filter(e => e.enabled).length

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 dark:border-dark-border/60 bg-gradient-to-r from-emerald-500/[0.06] to-transparent">
        <div className="flex items-center justify-between mb-0.5">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
            </span>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{t('playbook.title')}</h3>
          </div>
          {entries.length > 0 && (
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-white/5 px-2 py-0.5 rounded-full">{enabledCount}/{entries.length}</span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 pl-9">{t('playbook.subtitle')}</p>
      </div>

      <div className="p-5">
        {loading ? (
          <div className="flex justify-center py-6"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-6">
            <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-gray-100 dark:bg-white/5 flex items-center justify-center">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253" /></svg>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('playbook.empty')}</p>
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map(({ cat, items }) => {
              const meta = CAT_META[cat] || CAT_META.faq
              return (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${meta.badge}`}>
                      <CatIcon cat={cat} className="w-3 h-3" />
                      {categoryLabel(cat)}
                    </span>
                    <span className="text-[11px] text-gray-400">{items.length}</span>
                  </div>
                  <div className="space-y-2">
                    {items.map(e => (
                      <div key={e.id} className={`rounded-lg border bg-gray-50/50 dark:bg-white/[0.02] px-3 py-2.5 transition-all ${e.enabled ? 'border-gray-200 dark:border-dark-border' : 'border-gray-200/60 dark:border-dark-border/50 opacity-55'}`}>
                        {editingId === e.id ? (
                          <div className="space-y-2">
                            <textarea value={draft.title} onChange={ev => setDraft(d => ({ ...d, title: ev.target.value }))} rows={2}
                              className="w-full text-sm rounded-lg p-2 bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white resize-y focus:outline-none focus:border-primary-500/50" />
                            <textarea value={draft.content} onChange={ev => setDraft(d => ({ ...d, content: ev.target.value }))} rows={3}
                              className="w-full text-sm rounded-lg p-2 bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white resize-y focus:outline-none focus:border-primary-500/50" />
                            <div className="flex justify-end gap-2">
                              <button onClick={cancelEdit} className="text-xs px-2 py-1 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">{t('common.cancel')}</button>
                              <button onClick={() => saveEdit(e.id)} disabled={busyId === e.id} className="text-xs px-3 py-1 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">{t('common.save')}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-2.5">
                            <span className={`flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full ${meta.dot} ${e.enabled ? '' : 'opacity-40'}`} />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 dark:text-white break-words">{e.title}</div>
                              {e.content && <div className="text-xs text-gray-500 dark:text-gray-400 break-words mt-0.5 leading-snug">{e.content}</div>}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button onClick={() => toggle(e)} disabled={busyId === e.id} title={e.enabled ? t('playbook.disable') : t('playbook.enable')}
                                className={`text-[11px] px-2 py-1 rounded-md border font-medium ${e.enabled ? 'border-green-300 dark:border-green-800 text-green-600 dark:text-green-400 bg-green-500/5' : 'border-gray-300 dark:border-dark-border text-gray-400'}`}>
                                {e.enabled ? t('playbook.on') : t('playbook.off')}
                              </button>
                              <button onClick={() => startEdit(e)} title={t('common.edit')} className="p-1.5 rounded-md border border-gray-300 dark:border-dark-border text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                              </button>
                              <button onClick={() => remove(e)} disabled={busyId === e.id} title={t('common.delete')} className="p-1.5 rounded-md border border-red-300 dark:border-red-800 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20">
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
