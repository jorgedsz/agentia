import { useState, useEffect } from 'react'
import { credentialsAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const TYPE_LABELS = {
  postgres_connection: 'PostgreSQL Connection',
  supabase_vector: 'Supabase Vector Store',
}

const EMPTY_FORM = {
  postgres_connection: { connectionString: '' },
  supabase_vector: {
    url: '',
    serviceRoleKey: '',
    matchFunction: 'match_documents',
    matchTable: 'documents',
    matchCount: 5,
    matchThreshold: 0.7,
  },
}

function FormFields({ type, form, setForm, existing }) {
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  if (type === 'postgres_connection') {
    return (
      <div>
        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Connection string</label>
        <input
          type="password"
          autoComplete="off"
          value={form.connectionString || ''}
          onChange={(e) => set('connectionString', e.target.value)}
          placeholder={existing?.data?.hasConnectionString ? `Saved: ${existing.data.connectionStringPreview || '••••••••'} (leave blank to keep)` : 'postgresql://user:password@host:5432/dbname'}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
        />
      </div>
    )
  }

  if (type === 'supabase_vector') {
    return (
      <div className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Supabase URL</label>
            <input
              type="text"
              value={form.url || ''}
              onChange={(e) => set('url', e.target.value)}
              placeholder="https://xxxx.supabase.co"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Service-role key</label>
            <input
              type="password"
              autoComplete="off"
              value={form.serviceRoleKey || ''}
              onChange={(e) => set('serviceRoleKey', e.target.value)}
              placeholder={existing?.data?.hasServiceRoleKey ? `Saved: ${existing.data.serviceRoleKeyPreview || '••••••••'} (leave blank to keep)` : 'eyJhbGciOiJIUzI1NiIsInR…'}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">RPC function</label>
            <input
              type="text"
              value={form.matchFunction || ''}
              onChange={(e) => set('matchFunction', e.target.value)}
              placeholder="match_documents"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Table</label>
            <input
              type="text"
              value={form.matchTable || ''}
              onChange={(e) => set('matchTable', e.target.value)}
              placeholder="documents"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Match count</label>
            <input
              type="number"
              min={1}
              max={50}
              step={1}
              value={form.matchCount ?? 5}
              onChange={(e) => set('matchCount', parseInt(e.target.value || '0') || 0)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Threshold</label>
            <input
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={form.matchThreshold ?? 0.7}
              onChange={(e) => set('matchThreshold', parseFloat(e.target.value))}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>
      </div>
    )
  }

  return null
}

export default function Credentials() {
  const { t } = useLanguage()
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // create / edit modal state
  const [editing, setEditing] = useState(null) // null | { mode: 'create' | 'edit', credential? }
  const [modalName, setModalName] = useState('')
  const [modalType, setModalType] = useState('supabase_vector')
  const [modalForm, setModalForm] = useState(EMPTY_FORM.supabase_vector)
  const [saving, setSaving] = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => { fetchCredentials() }, [])

  useEffect(() => {
    if (success) { const t = setTimeout(() => setSuccess(''), 3000); return () => clearTimeout(t) }
  }, [success])

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const { data } = await credentialsAPI.list()
      setCredentials(data.credentials || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load credentials')
    } finally {
      setLoading(false)
    }
  }

  const openCreate = () => {
    setEditing({ mode: 'create' })
    setModalName('')
    setModalType('supabase_vector')
    setModalForm(EMPTY_FORM.supabase_vector)
  }

  const openEdit = (c) => {
    setEditing({ mode: 'edit', credential: c })
    setModalName(c.name)
    setModalType(c.type)
    // hydrate form from masked data — secrets stay empty (the "leave blank to keep" UX)
    if (c.type === 'postgres_connection') {
      setModalForm({ connectionString: '' })
    } else if (c.type === 'supabase_vector') {
      setModalForm({
        url: c.data.url || '',
        serviceRoleKey: '',
        matchFunction: c.data.matchFunction || 'match_documents',
        matchTable: c.data.matchTable || 'documents',
        matchCount: Number.isFinite(c.data.matchCount) ? c.data.matchCount : 5,
        matchThreshold: Number.isFinite(c.data.matchThreshold) ? c.data.matchThreshold : 0.7,
      })
    } else {
      setModalForm({})
    }
  }

  const handleTypeChange = (type) => {
    setModalType(type)
    setModalForm(EMPTY_FORM[type] || {})
  }

  const handleSave = async () => {
    if (!modalName.trim()) { setError('Name is required'); return }
    setSaving(true)
    setError('')
    try {
      if (editing?.mode === 'create') {
        await credentialsAPI.create({ name: modalName.trim(), type: modalType, data: modalForm })
        setSuccess('Credential created.')
      } else if (editing?.mode === 'edit' && editing.credential) {
        await credentialsAPI.update(editing.credential.id, { name: modalName.trim(), data: modalForm })
        setSuccess('Credential updated.')
      }
      setEditing(null)
      fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save credential')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (c) => {
    if (!window.confirm(`Delete credential "${c.name}"? Chatbots that reference it will stop working until reconfigured.`)) return
    setDeletingId(c.id)
    setError('')
    try {
      await credentialsAPI.delete(c.id)
      setSuccess('Credential deleted.')
      fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete credential')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('credentials.title') || 'Credenciales'}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('credentials.subtitle') || 'Almacena las credenciales que usan tus herramientas de chatbot. Las claves se guardan cifradas.'}
          </p>
        </div>
        <button
          onClick={openCreate}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
        >
          {t('credentials.create') || 'Nueva credencial'}
        </button>
      </div>

      {success && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
          {success}
        </div>
      )}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">{t('common.dismiss') || 'cerrar'}</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : credentials.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
          <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('credentials.empty') || 'Aún no tienes credenciales guardadas.'}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-white/[0.02] border-b border-gray-200 dark:border-dark-border">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credentials.name') || 'Nombre'}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credentials.type') || 'Tipo'}</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credentials.updatedAt') || 'Actualizada'}</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {credentials.map(c => (
                <tr key={c.id} className="border-b border-gray-100 dark:border-dark-border last:border-b-0">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{TYPE_LABELS[c.type] || c.type}</td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{new Date(c.updatedAt).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(c)} className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 mr-3">{t('common.edit') || 'Editar'}</button>
                    <button
                      onClick={() => handleDelete(c)}
                      disabled={deletingId === c.id}
                      className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 disabled:opacity-50"
                    >
                      {deletingId === c.id ? '…' : (t('common.delete') || 'Eliminar')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) setEditing(null) }}>
          <div className="bg-white dark:bg-dark-card rounded-xl w-full max-w-2xl border border-gray-200 dark:border-dark-border">
            <div className="p-5 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editing.mode === 'create' ? (t('credentials.create') || 'Nueva credencial') : (t('credentials.edit') || 'Editar credencial')}
              </h3>
              <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('credentials.name') || 'Nombre'}</label>
                <input
                  type="text"
                  value={modalName}
                  onChange={(e) => setModalName(e.target.value)}
                  placeholder="Ej: Supabase Producción"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('credentials.type') || 'Tipo'}</label>
                <select
                  value={modalType}
                  onChange={(e) => handleTypeChange(e.target.value)}
                  disabled={editing.mode === 'edit'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-60"
                >
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <FormFields type={modalType} form={modalForm} setForm={setModalForm} existing={editing.credential} />
            </div>
            <div className="p-5 border-t border-gray-200 dark:border-dark-border flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                disabled={saving}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 rounded-lg disabled:opacity-50"
              >
                {t('common.cancel') || 'Cancelar'}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !modalName.trim()}
                className="px-4 py-2 text-sm bg-primary-600 hover:bg-primary-700 text-white rounded-lg disabled:opacity-50"
              >
                {saving ? '…' : (t('common.save') || 'Guardar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
