import { useState, useEffect } from 'react'
import { usersAPI, billingPeriodsAPI } from '../../services/api'

// Monthly statements for one account: what each month cost, which are still
// owed, the day-by-day detail behind any of them, and collecting one.
export default function BillingPeriods() {
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState('')
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    usersAPI.getAll()
      .then(({ data }) => setAccounts(data.users || data.clients || []))
      .catch(() => setError('No se pudieron cargar las cuentas'))
  }, [])

  const loadPeriods = async (id) => {
    if (!id) { setData(null); return }
    setLoading(true); setError(''); setDetail(null)
    try {
      const { data } = await billingPeriodsAPI.list(id)
      setData(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los períodos')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  const openDetail = async (period) => {
    setBusy(`detail-${period.id}`); setError('')
    try {
      const { data } = await billingPeriodsAPI.detail(accountId, period.id)
      setDetail(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar el detalle')
    } finally {
      setBusy('')
    }
  }

  const chargePeriod = async (period) => {
    if (!confirm(`¿Cobrar $${period.outstanding.toFixed(2)} de ${period.label} a la tarjeta guardada?`)) return
    setBusy(`charge-${period.id}`); setError(''); setSuccess('')
    try {
      const { data: res } = await billingPeriodsAPI.charge(accountId, period.id)
      setSuccess(res.message)
      setData((d) => ({ ...d, periods: res.periods }))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cobrar el período')
    } finally {
      setBusy('')
    }
  }

  const markPaid = async (period) => {
    const note = prompt(`¿Cómo se pagó ${period.label}? (transferencia, efectivo, etc.)`)
    if (note === null) return
    setBusy(`mark-${period.id}`); setError(''); setSuccess('')
    try {
      const { data: res } = await billingPeriodsAPI.markPaid(accountId, period.id, note)
      setSuccess(res.message)
      setData((d) => ({ ...d, periods: res.periods }))
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo marcar como pagado')
    } finally {
      setBusy('')
    }
  }

  // The detail view is plain HTML, so the PDF is just that view printed. Keeps
  // what the client receives identical to what the screen shows.
  const downloadPdf = async () => {
    const node = document.getElementById('billing-period-report')
    if (!node) return
    setBusy('pdf')
    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf().set({
        margin: 10,
        filename: `${(detail.account.name || 'cuenta').replace(/[^\w\s-]/g, '')} - ${detail.period.label}.pdf`,
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(node).save()
    } catch {
      setError('No se pudo generar el PDF')
    } finally {
      setBusy('')
    }
  }

  const money = (n) => `$${(n || 0).toFixed(2)}`
  const fmtTime = (iso) => new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  const STATUS = {
    open: { label: 'En curso', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    paid: { label: 'Pagado', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Períodos y reportes</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          El consumo de cada mes, con su detalle día por día. Puedes cobrar un mes pendiente con la tarjeta guardada del cliente.
        </p>
      </div>

      <div className="mb-6 max-w-md">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cuenta</label>
        <select
          value={accountId}
          onChange={(e) => { setAccountId(e.target.value); loadPeriods(e.target.value) }}
          className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
        >
          <option value="">Selecciona una cuenta…</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.companyName || a.name || a.email} · {a.role}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 text-sm">{success}</div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Saldo actual</p>
              <p className={`text-2xl font-bold ${data.account.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'}`}>
                {money(data.account.balance)}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Meses pendientes</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {data.periods.filter((p) => p.status === 'pending' && p.outstanding > 0).length}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Total pendiente</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">
                {money(data.periods.reduce((sum, p) => sum + (p.status === 'pending' ? p.outstanding : 0), 0))}
              </p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Tarjeta guardada</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white mt-2">
                {data.hasCard ? `Sí · ${data.provider === 'stripe' ? 'Stripe' : 'Whop'}` : 'No'}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-hover">
                  <tr>
                    {['Período', 'Llamadas', 'Mensajes', 'Consumo', 'Pendiente', 'Estado', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {data.periods.map((p) => (
                    <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white capitalize">{p.label}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.callsCount} · {money(p.callsAmount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">{p.messagesCount} · {money(p.messagesAmount)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{money(p.usageAmount)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{money(p.outstanding)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${STATUS[p.status]?.cls || ''}`}>
                          {STATUS[p.status]?.label || p.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => openDetail(p)}
                            disabled={busy === `detail-${p.id}`}
                            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
                          >
                            {busy === `detail-${p.id}` ? 'Abriendo…' : 'Ver reporte'}
                          </button>
                          {p.payable && (
                            <>
                              <button
                                onClick={() => chargePeriod(p)}
                                disabled={!data.hasCard || busy === `charge-${p.id}`}
                                title={data.hasCard ? '' : 'La cuenta no tiene tarjeta guardada'}
                                className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                              >
                                {busy === `charge-${p.id}` ? 'Cobrando…' : 'Cobrar'}
                              </button>
                              <button
                                onClick={() => markPaid(p)}
                                disabled={busy === `mark-${p.id}`}
                                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
                              >
                                Marcar pagado
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {data.periods.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        Esta cuenta todavía no tiene consumo registrado.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Detail of one month — this block is what the PDF prints */}
      {detail && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white capitalize">
              {detail.period.label} · {detail.account.name}
            </h2>
            <div className="flex gap-2">
              <button
                onClick={downloadPdf}
                disabled={busy === 'pdf'}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {busy === 'pdf' ? 'Generando…' : 'Descargar PDF'}
              </button>
              <button
                onClick={() => setDetail(null)}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* White background and dark text on purpose: this is printed */}
          <div id="billing-period-report" className="bg-white text-gray-900 p-6 rounded-lg">
            <h3 className="text-xl font-bold mb-1">Reporte de consumo</h3>
            <p className="text-sm text-gray-600 mb-4">
              {detail.account.name} · <span className="capitalize">{detail.period.label}</span>
            </p>

            <table className="w-full text-sm mb-6">
              <tbody>
                <tr><td className="py-1 border-b border-gray-200">Llamadas ({detail.report.totals.calls})</td>
                    <td className="py-1 border-b border-gray-200 text-right">{money(detail.report.totals.callsCost)}</td></tr>
                <tr><td className="py-1 border-b border-gray-200">Mensajes ({detail.report.totals.messages})</td>
                    <td className="py-1 border-b border-gray-200 text-right">{money(detail.report.totals.messagesCost)}</td></tr>
                <tr><td className="py-2 font-bold">Consumo del período</td>
                    <td className="py-2 font-bold text-right">{money(detail.report.totals.usage)}</td></tr>
                <tr><td className="py-1">Pagado</td>
                    <td className="py-1 text-right">{money(detail.period.settledAmount)}</td></tr>
                <tr><td className="py-1 font-semibold">Pendiente</td>
                    <td className="py-1 font-semibold text-right">{money(detail.period.outstanding)}</td></tr>
              </tbody>
            </table>

            <h4 className="font-semibold mb-2">Detalle por día</h4>
            <p className="text-xs text-gray-500 mb-3">Horas en zona {detail.report.timezone}.</p>

            {detail.report.days.length === 0 && (
              <p className="text-sm text-gray-500">No hubo consumo en este período.</p>
            )}

            {detail.report.days.map((day) => (
              <div key={day.date} className="mb-4">
                <div className="flex justify-between bg-gray-100 px-3 py-2 rounded">
                  <span className="font-medium capitalize">{day.label}</span>
                  <span className="font-medium">{money(day.total)}</span>
                </div>
                {/* A month with thousands of entries renders as day totals only:
                    the same rule the emailed report follows. */}
                <table className="w-full text-xs mt-1">
                  <tbody>
                    {(detail.report.detailed ? day.items : []).map((item, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">{fmtTime(item.at)}</td>
                        <td className="py-1 pr-2">{item.kind}</td>
                        <td className="py-1 pr-2 text-gray-600">{item.detail}</td>
                        <td className="py-1 text-right">{money(item.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!detail.report.detailed && (
                  <p className="text-xs text-gray-500 px-3 py-1">{day.calls} llamada(s) · {day.messages} mensaje(s)</p>
                )}
              </div>
            ))}

            {!detail.report.detailed && (
              <p className="text-xs text-gray-500">
                El período tiene demasiadas líneas para listarlas una por una; se muestran los totales por día.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
