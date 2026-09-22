import { useState, useEffect } from 'react'
import { usersAPI, budgetsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

// Roles that manage other accounts. Everyone else manages only their own.
const MANAGER_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

const KIND_LABEL = {
  transfer_in: 'Entrada desde el saldo principal',
  transfer_out: 'Devuelto al saldo principal',
  debit: 'Gasto',
}

// Budgets ("bolsillos"): money set aside from the main balance for one purpose,
// which outside tools read and spend through the API.
export default function Budgets() {
  const { user } = useAuth()
  const canManage = MANAGER_ROLES.includes(user?.role)

  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState(canManage ? '' : 'me')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [newName, setNewName] = useState('')
  const [transferring, setTransferring] = useState(null) // { budget, direction }
  const [transferAmount, setTransferAmount] = useState('')
  const [selected, setSelected] = useState(null) // budget whose history is shown

  const load = async (id) => {
    if (!id) { setData(null); return }
    setLoading(true); setError('')
    try {
      const { data } = await budgetsAPI.get(id)
      setData(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los presupuestos')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!canManage) { load('me'); return }
    usersAPI.getAll()
      .then(({ data }) => setAccounts(data.users || data.clients || []))
      .catch(() => setError('No se pudieron cargar las cuentas'))
  }, [canManage])

  const run = async (label, action, successMessage) => {
    setBusy(label); setError(''); setSuccess('')
    try {
      const { data } = await action()
      setData(data)
      if (successMessage) setSuccess(successMessage)
      return true
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la operación')
      return false
    } finally {
      setBusy('')
    }
  }

  const create = async (e) => {
    e.preventDefault()
    if (!newName.trim()) return
    const ok = await run('create', () => budgetsAPI.create(accountId, newName.trim()), `Presupuesto "${newName.trim()}" creado.`)
    if (ok) setNewName('')
  }

  const submitTransfer = async (e) => {
    e.preventDefault()
    const amount = parseFloat(transferAmount)
    if (!Number.isFinite(amount) || amount <= 0) { setError('Ingresa un monto mayor a cero.'); return }
    const { budget, direction } = transferring
    const ok = await run(
      'transfer',
      () => budgetsAPI.transfer(accountId, budget.id, { amount, direction }),
      direction === 'in'
        ? `Se pasaron $${amount.toFixed(2)} al presupuesto ${budget.name}.`
        : `Se devolvieron $${amount.toFixed(2)} de ${budget.name} al saldo principal.`,
    )
    if (ok) { setTransferring(null); setTransferAmount('') }
  }

  const archive = (budget) => {
    if (!confirm(`¿Archivar el presupuesto ${budget.name}? Deja de estar disponible para el API.`)) return
    run(`archive-${budget.id}`, () => budgetsAPI.archive(accountId, budget.id), `${budget.name} archivado.`)
  }

  const money = (n) => `$${Math.abs(n || 0).toFixed(2)}`
  const input = 'w-full px-3 py-2 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500'
  const movements = (data?.movements || []).filter((m) => !selected || m.budgetId === selected.id)
  const nameOf = (id) => data?.budgets?.find((b) => b.id === id)?.name || '—'

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Presupuestos</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Aparta dinero de tu saldo principal para un uso concreto, como marketing. Las herramientas externas lo consultan y lo gastan por API, sin tocar el resto de tu saldo.
        </p>
      </div>

      {canManage && (
        <div className="mb-6 max-w-md">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cuenta</label>
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); setSelected(null); setSuccess(''); load(e.target.value) }}
            className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
          >
            <option value="">Selecciona una cuenta…</option>
            <option value="me">Mi cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.companyName || a.name || a.email} · {a.role}</option>
            ))}
          </select>
        </div>
      )}

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">{success}</div>}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {data && !loading && !data.enabled && (
        <div className="px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
          Los presupuestos no están activos para {data.account.name}. Se activan desde "Gestionar" en la cuenta o en el socio del que depende.
        </div>
      )}

      {data && !loading && data.enabled && (
        <>
          {/* Main balance and the budgets carved from it */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Saldo principal</p>
              <p className={`text-3xl font-bold ${data.mainBalance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {data.mainBalance < 0 ? '-' : ''}{money(data.mainBalance)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                En presupuestos: {money(data.budgets.reduce((s, b) => s + b.balance, 0))}
              </p>
            </div>

            <form onSubmit={create} className="md:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
              <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Nuevo presupuesto</p>
              <div className="flex gap-2">
                <input value={newName} onChange={(e) => setNewName(e.target.value)} maxLength={60}
                  placeholder="Marketing, Publicidad Meta, Contenidos…" className={input} />
                <button type="submit" disabled={busy === 'create' || !newName.trim()}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 whitespace-nowrap">
                  {busy === 'create' ? 'Creando…' : 'Crear'}
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
                Cada presupuesto recibe un identificador para el API (por ejemplo <code>marketing</code>), que es el que usan las herramientas externas.
              </p>
            </form>
          </div>

          {data.budgets.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {data.budgets.map((b) => (
                <div key={b.id}
                  className={`bg-white dark:bg-dark-card rounded-xl border p-5 ${selected?.id === b.id ? 'border-primary-500' : 'border-gray-200 dark:border-dark-border'}`}>
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-white">{b.name}</p>
                      <code className="text-xs text-gray-500 dark:text-gray-400">{b.slug}</code>
                    </div>
                    <button onClick={() => setSelected(selected?.id === b.id ? null : b)}
                      className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
                      {selected?.id === b.id ? 'Ver todo' : 'Historial'}
                    </button>
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mb-4">{money(b.balance)}</p>
                  <div className="flex gap-2">
                    <button onClick={() => { setTransferring({ budget: b, direction: 'in' }); setTransferAmount('') }}
                      className="flex-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700">
                      Agregar saldo
                    </button>
                    <button onClick={() => { setTransferring({ budget: b, direction: 'out' }); setTransferAmount('') }}
                      disabled={b.balance <= 0}
                      className="flex-1 px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40">
                      Devolver
                    </button>
                    {b.balance <= 0 && (
                      <button onClick={() => archive(b)} disabled={busy === `archive-${b.id}`}
                        className="px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                        Archivar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Todavía no hay presupuestos. Crea el primero arriba.</p>
          )}

          {/* History */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">
                Movimientos{selected ? ` · ${selected.name}` : ''}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-hover">
                  <tr>
                    {['Fecha', 'Presupuesto', 'Movimiento', 'Detalle', 'Monto', 'Saldo después'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                        {new Date(m.at).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{nameOf(m.budgetId)}</td>
                      <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                        {KIND_LABEL[m.kind] || m.kind}
                        <span className="text-xs text-gray-400"> · {m.source === 'api' ? 'API' : 'panel'}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{m.description || '—'}</td>
                      <td className={`px-4 py-3 text-sm font-medium whitespace-nowrap ${m.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {m.amount < 0 ? '−' : '+'}{money(m.amount)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{money(m.balanceAfter)}</td>
                    </tr>
                  ))}
                  {movements.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">Sin movimientos todavía.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Transfer dialog */}
      {transferring && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setTransferring(null)}>
          <form onSubmit={submitTransfer} onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 w-full max-w-sm space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {transferring.direction === 'in' ? `Agregar a ${transferring.budget.name}` : `Devolver de ${transferring.budget.name}`}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {transferring.direction === 'in'
                ? `Sale del saldo principal (${data.mainBalance < 0 ? '-' : ''}${money(data.mainBalance)} disponibles)${data.onCredit ? '. Puede quedar en negativo.' : '.'}`
                : `Vuelve al saldo principal (${money(transferring.budget.balance)} en el presupuesto).`}
            </p>
            <input type="number" step="0.01" min="0.01" autoFocus value={transferAmount}
              onChange={(e) => setTransferAmount(e.target.value)} placeholder="0.00" className={input} />
            <div className="flex gap-2 justify-end">
              <button type="button" onClick={() => setTransferring(null)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300">
                Cancelar
              </button>
              <button type="submit" disabled={busy === 'transfer'}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
                {busy === 'transfer' ? 'Transfiriendo…' : 'Transferir'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
