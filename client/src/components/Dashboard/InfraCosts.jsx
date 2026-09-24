import { useState, useEffect } from 'react'
import { infraCostAPI } from '../../services/api'

// What each account costs to run. The price is charged to that account's
// balance on the 30th of every month (the last day, in a shorter month), and
// only the owner or the partner above an account may set it — which is why
// every account listed here is one the viewer may price.

const money = (n) => `$${Number(n || 0).toFixed(2)}`
const day = (d) => (d ? new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

export default function InfraCosts() {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [edits, setEdits] = useState({}) // { [id]: { amount, note } }

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const { data } = await infraCostAPI.list()
      setAccounts(data.accounts || [])
      setEdits({})
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los costes')
    } finally {
      setLoading(false)
    }
  }

  const valueFor = (account, field) => {
    const edit = edits[account.id]
    if (edit && edit[field] !== undefined) return edit[field]
    return field === 'amount' ? (account.monthlyCost || '') : (account.note || '')
  }

  const change = (account, field, value) =>
    setEdits({ ...edits, [account.id]: { ...edits[account.id], [field]: value } })

  const save = async (account) => {
    setError(''); setSuccess(''); setBusy(account.id)
    try {
      await infraCostAPI.set(account.id, {
        amount: valueFor(account, 'amount'),
        note: valueFor(account, 'note'),
      })
      setSuccess(`Coste guardado para ${account.name}.`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el coste')
    } finally {
      setBusy(0)
    }
  }

  const chargeNow = async (account) => {
    if (!window.confirm(`¿Cobrar ahora ${money(account.monthlyCost)} a ${account.name}? Se descuenta de su saldo y cuenta como el cobro de este mes.`)) return
    setError(''); setSuccess(''); setBusy(account.id)
    try {
      const { data } = await infraCostAPI.chargeNow(account.id)
      setSuccess(`Se cobraron ${money(data.amount)} a ${account.name}. Saldo: ${money(data.account.balance)}.`)
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cobrar')
    } finally {
      setBusy(0)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const total = accounts.reduce((sum, a) => sum + (a.monthlyCost || 0), 0)

  return (
    <div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
        Lo que cuesta mantener cada cuenta: servidores, números, licencias. Se descuenta de su saldo el día 30 de cada mes
        (el último día en los meses más cortos) y queda registrado como un cobro más. En blanco no se cobra nada.
      </p>

      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">{success}</div>}

      {accounts.length === 0 ? (
        <div className="px-4 py-3 rounded-lg bg-gray-50 dark:bg-dark-hover text-gray-600 dark:text-gray-300 text-sm">
          No administras ninguna cuenta.
        </div>
      ) : (
        <>
          <div className="mb-4 text-sm text-gray-700 dark:text-gray-300">
            Total mensual configurado: <span className="font-semibold">{money(total)}</span>
          </div>

          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-hover text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Cuenta</th>
                  <th className="text-left px-4 py-2 font-medium">Coste mensual</th>
                  <th className="text-left px-4 py-2 font-medium">Qué cubre</th>
                  <th className="text-right px-4 py-2 font-medium">Saldo</th>
                  <th className="text-left px-4 py-2 font-medium">Último cobro</th>
                  <th className="text-left px-4 py-2 font-medium">Próximo</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-t border-gray-100 dark:border-dark-border">
                    <td className="px-4 py-2 text-gray-900 dark:text-white whitespace-nowrap">
                      {a.name}
                      <span className="block text-xs text-gray-400">{a.role}</span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="relative w-28">
                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-xs">$</span>
                        <input
                          type="number" step="0.01" min="0"
                          value={valueFor(a, 'amount')}
                          onChange={(e) => change(a, 'amount', e.target.value)}
                          placeholder="0.00"
                          className="w-full pl-5 pr-2 py-1.5 bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <input
                        value={valueFor(a, 'note')}
                        onChange={(e) => change(a, 'note', e.target.value)}
                        maxLength={200}
                        placeholder="Servidor, números…"
                        className="w-48 px-2 py-1.5 bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white text-sm"
                      />
                    </td>
                    <td className={`px-4 py-2 text-right whitespace-nowrap ${a.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
                      {money(a.balance)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{day(a.lastChargedAt)}</td>
                    <td className="px-4 py-2 text-gray-500 dark:text-gray-400 whitespace-nowrap">{day(a.nextChargeAt)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <button
                        onClick={() => save(a)}
                        disabled={busy === a.id}
                        className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                      >
                        Guardar
                      </button>
                      {a.monthlyCost > 0 && (
                        <button
                          onClick={() => chargeNow(a)}
                          disabled={busy === a.id}
                          className="ml-2 px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
                        >
                          Cobrar ahora
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
