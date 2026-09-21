import { useState, useEffect } from 'react'
import { usersAPI, creditsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

// Roles that manage other accounts. Everyone else only sees their own.
const MANAGER_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

// The charges and credits made to the viewer's own account. Read-only: moving
// a balance is the provider's call.
function MyCharges() {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    creditsAPI.myAdjustments()
      .then(({ data }) => setData(data))
      .catch((err) => setError(err.response?.data?.error || 'No se pudieron cargar tus cobros'))
  }, [])

  const money = (n) => `$${Math.abs(n || 0).toFixed(2)}`

  if (error) return <div className="px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
        <h2 className="text-sm font-medium text-gray-900 dark:text-white">Cobros y abonos de tu cuenta</h2>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Saldo actual: <strong className={data.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}>{data.balance < 0 ? '-' : ''}{money(data.balance)}</strong>
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-hover">
            <tr>
              {['Fecha', 'Concepto', 'Monto', 'Saldo después'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {data.adjustments.map((a) => (
              <tr key={a.id}>
                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                  {new Date(a.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                  <span className="capitalize">{a.concept}</span>
                  {a.note && <p className="text-xs text-gray-500 dark:text-gray-400">{a.note}</p>}
                </td>
                <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${a.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                  {a.amount < 0 ? '−' : '+'}{money(a.amount)}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{a.balanceAfter < 0 ? '-' : ''}{money(a.balanceAfter)}</td>
              </tr>
            ))}
            {data.adjustments.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                  No hay otros cobros en tu cuenta.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Charges and credits that are not consumption: a marketing fee, a courtesy
// credit, a correction. Each one moves the account's balance and stays on
// record with its concept, who made it and the balance it left.
const CONCEPTS = ['marketing', 'cortesía', 'corrección', 'setup', 'otro']

export default function OtherCharges() {
  const { user } = useAuth()
  const canManage = MANAGER_ROLES.includes(user?.role)
  const [tab, setTab] = useState(canManage ? 'manage' : 'mine')
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ operation: 'subtract', amount: '', concept: 'marketing', customConcept: '', note: '' })

  useEffect(() => {
    if (!canManage) return
    usersAPI.getAll()
      .then(({ data }) => setAccounts(data.users || data.clients || []))
      .catch(() => setError('No se pudieron cargar las cuentas'))
  }, [canManage])

  const load = async (id) => {
    if (!id) { setData(null); return }
    setLoading(true); setError('')
    try {
      const { data } = await creditsAPI.listAdjustments(id)
      setData(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el historial')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    const amount = parseFloat(form.amount)
    const concept = form.concept === 'otro' ? form.customConcept.trim() : form.concept
    if (!Number.isFinite(amount) || amount <= 0) { setError('Ingresa un monto mayor a cero.'); return }
    if (!concept) { setError('Escribe el concepto.'); return }

    const verb = form.operation === 'subtract' ? 'Descontar' : 'Abonar'
    if (!confirm(`${verb} $${amount.toFixed(2)} por "${concept}" a ${data.account.name}?`)) return

    setSaving(true); setError(''); setSuccess('')
    try {
      const { data: res } = await creditsAPI.createAdjustment(accountId, {
        operation: form.operation, amount, concept, note: form.note,
      })
      setSuccess(res.message)
      setData((d) => ({ ...d, account: { ...d.account, balance: res.balance }, adjustments: res.adjustments }))
      setForm((f) => ({ ...f, amount: '', note: '' }))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo registrar el cobro')
    } finally {
      setSaving(false)
    }
  }

  const money = (n) => `$${Math.abs(n || 0).toFixed(2)}`
  const input = 'w-full px-3 py-2 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Otros cobros</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Cobros y abonos que no son consumo: marketing, cortesías, correcciones. Mueven el saldo de la cuenta y quedan registrados.
        </p>
      </div>

      {/* Managers can switch between their own account and the ones they run */}
      {canManage && (
        <div className="flex gap-2 mb-6">
          {[
            { value: 'manage', label: 'Gestionar cuentas' },
            { value: 'mine', label: 'Mi cuenta' },
          ].map((t) => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={`px-4 py-2 text-sm rounded-lg border transition-colors ${tab === t.value
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {tab === 'mine' && <MyCharges />}

      {tab === 'manage' && (
      <>
      <div className="mb-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cuenta</label>
        <select
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value); setSuccess(''); load(e.target.value) }}
          className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
        >
          <option value="">Selecciona una cuenta…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.companyName || a.name || a.email} · {a.role}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">{success}</div>}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {data && !loading && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* New charge */}
          <form onSubmit={submit} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 space-y-4 h-fit">
            <div>
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Saldo actual</p>
              <p className={`text-2xl font-bold ${data.account.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {data.account.balance < 0 ? '-' : ''}{money(data.account.balance)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'subtract', label: 'Cobrar (descontar)' },
                { value: 'add', label: 'Abonar' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, operation: opt.value }))}
                  className={`px-3 py-2 text-sm rounded-lg border transition-colors ${form.operation === opt.value
                    ? (opt.value === 'subtract' ? 'bg-red-600 border-red-600 text-white' : 'bg-green-600 border-green-600 text-white')
                    : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Monto (USD)</label>
              <input type="number" step="0.01" min="0.01" value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00" className={input} />
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Concepto</label>
              <select value={form.concept} onChange={(e) => setForm((f) => ({ ...f, concept: e.target.value }))} className={input}>
                {CONCEPTS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {form.concept === 'otro' && (
                <input type="text" value={form.customConcept} maxLength={80}
                  onChange={(e) => setForm((f) => ({ ...f, customConcept: e.target.value }))}
                  placeholder="Escribe el concepto" className={`${input} mt-2`} />
              )}
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nota (opcional)</label>
              <textarea value={form.note} rows={2} maxLength={500}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Campaña de septiembre, acuerdo con el cliente…" className={input} />
            </div>

            <button type="submit" disabled={saving}
              className="w-full px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {saving ? 'Registrando…' : form.operation === 'subtract' ? 'Registrar cobro' : 'Registrar abono'}
            </button>

            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Mueve el saldo de la cuenta; no cobra la tarjeta. Si la cuenta tiene cobro por cortes, un cobro aquí adelanta el próximo corte.
            </p>
          </form>

          {/* History */}
          <div className="lg:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">Historial</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-hover">
                  <tr>
                    {['Fecha', 'Concepto', 'Monto', 'Saldo después', 'Hecho por'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {data.adjustments.map((a) => (
                    <tr key={a.id}>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {new Date(a.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        <span className="capitalize">{a.concept}</span>
                        {a.note && <p className="text-xs text-gray-500 dark:text-gray-400">{a.note}</p>}
                      </td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${a.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {a.amount < 0 ? '−' : '+'}{money(a.amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                        {a.balanceAfter < 0 ? '-' : ''}{money(a.balanceAfter)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                        {a.by || '—'} <span className="text-xs text-gray-400">· {a.source === 'api' ? 'API' : 'panel'}</span>
                      </td>
                    </tr>
                  ))}
                  {data.adjustments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        Todavía no hay otros cobros en esta cuenta.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  )
}
