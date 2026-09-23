import { useState, useEffect } from 'react'
import { budgetsAPI } from '../../services/api'

// Requests for budget money, waiting on a decision. Marketing asks through the
// API; nothing moves until someone here approves. Approving is what funds the
// budget, out of that account's main balance.

const money = (n) => `$${Number(n || 0).toFixed(2)}`
const when = (d) => new Date(d).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const STATUS = {
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  approved: { label: 'Aprobada', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  rejected: { label: 'Rechazada', className: 'bg-gray-200 text-gray-700 dark:bg-dark-hover dark:text-gray-300' },
}

export default function BudgetRequests({ onDecided }) {
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // Approving for less than was asked: the edited amount, per request.
  const [amounts, setAmounts] = useState({})
  const [notes, setNotes] = useState({})

  useEffect(() => { load() }, [])

  const load = async () => {
    try {
      const { data } = await budgetsAPI.requests()
      setRequests(data.requests || [])
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar las solicitudes')
    } finally {
      setLoading(false)
    }
  }

  const decide = async (request, action) => {
    setError(''); setSuccess(''); setBusy(request.id)
    try {
      if (action === 'approve') {
        const typed = amounts[request.id]
        const { data } = await budgetsAPI.approve(request.id, {
          ...(typed !== undefined && typed !== '' ? { amount: typed } : {}),
          note: notes[request.id] || undefined,
        })
        const sent = data.request.approvedAmount
        setSuccess(`Se enviaron ${money(sent)} a ${data.request.budget?.name}. Saldo del presupuesto: ${money(data.budgetBalance)}.`)
      } else {
        await budgetsAPI.reject(request.id, notes[request.id] || undefined)
        setSuccess('Solicitud rechazada.')
      }
      await load()
      if (onDecided) onDecided()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo completar la acción')
    } finally {
      setBusy(0)
    }
  }

  const pending = requests.filter((r) => r.status === 'pending')
  const decided = requests.filter((r) => r.status !== 'pending')

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div>
      {error && <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>}
      {success && <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">{success}</div>}

      {pending.length === 0 && (
        <div className="px-4 py-3 rounded-lg bg-gray-50 dark:bg-dark-hover text-gray-600 dark:text-gray-300 text-sm mb-8">
          No hay solicitudes pendientes.
        </div>
      )}

      <div className="space-y-4 mb-8">
        {pending.map((r) => (
          <div key={r.id} className="bg-white dark:bg-dark-card rounded-xl border border-amber-300 dark:border-amber-500/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                  {money(r.amount)} para {r.budget?.name}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {r.account?.name} · pedido el {when(r.createdAt)}
                  {r.budget ? ` · el presupuesto tiene ${money(r.budget.balance)}` : ''}
                </p>
                {r.description && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">{r.description}</p>
                )}
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${STATUS.pending.className}`}>{STATUS.pending.label}</span>
            </div>

            <div className="flex flex-wrap items-end gap-2 mt-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Enviar</label>
                <input
                  type="number" step="0.01" min="0.01" max={r.amount}
                  value={amounts[r.id] ?? ''}
                  onChange={(e) => setAmounts({ ...amounts, [r.id]: e.target.value })}
                  placeholder={String(r.amount)}
                  className="w-32 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Nota (opcional)</label>
                <input
                  value={notes[r.id] ?? ''}
                  onChange={(e) => setNotes({ ...notes, [r.id]: e.target.value })}
                  maxLength={300}
                  placeholder="Por qué apruebas o rechazas"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <button
                onClick={() => decide(r, 'approve')}
                disabled={busy === r.id}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {busy === r.id ? 'Enviando…' : 'Aprobar'}
              </button>
              <button
                onClick={() => decide(r, 'reject')}
                disabled={busy === r.id}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
              >
                Rechazar
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-2">
              Vacío envía lo pedido. Puedes enviar menos, nunca más. El dinero sale del saldo principal de {r.account?.name}.
            </p>
          </div>
        ))}
      </div>

      {decided.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          <p className="px-5 py-3 text-sm font-medium text-gray-900 dark:text-white border-b border-gray-200 dark:border-dark-border">
            Resueltas
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-dark-hover text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="text-left px-5 py-2 font-medium">Cuenta</th>
                  <th className="text-left px-5 py-2 font-medium">Presupuesto</th>
                  <th className="text-right px-5 py-2 font-medium">Pedido</th>
                  <th className="text-right px-5 py-2 font-medium">Enviado</th>
                  <th className="text-left px-5 py-2 font-medium">Estado</th>
                  <th className="text-left px-5 py-2 font-medium">Cuándo</th>
                </tr>
              </thead>
              <tbody>
                {decided.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100 dark:border-dark-border">
                    <td className="px-5 py-2 text-gray-900 dark:text-white">{r.account?.name}</td>
                    <td className="px-5 py-2 text-gray-700 dark:text-gray-300">{r.budget?.name}</td>
                    <td className="px-5 py-2 text-right text-gray-700 dark:text-gray-300">{money(r.amount)}</td>
                    <td className="px-5 py-2 text-right text-gray-900 dark:text-white">
                      {r.approvedAmount === null ? '—' : money(r.approvedAmount)}
                    </td>
                    <td className="px-5 py-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${STATUS[r.status].className}`}>{STATUS[r.status].label}</span>
                      {r.decisionNote && <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">{r.decisionNote}</span>}
                    </td>
                    <td className="px-5 py-2 text-gray-500 dark:text-gray-400">{when(r.decidedAt || r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
