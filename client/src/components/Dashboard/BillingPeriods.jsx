import { useState, useEffect } from 'react'
import { usersAPI, billingPeriodsAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

// Roles that manage other accounts. Everyone else sees only their own.
const MANAGER_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

// Monthly statements for one account: what each month cost, which are still
// owed, the day-by-day detail behind any of them, and collecting one.
export default function BillingPeriods() {
  const { user } = useAuth()
  const canManage = MANAGER_ROLES.includes(user?.role)
  const [accounts, setAccounts] = useState([])
  const [accountId, setAccountId] = useState(canManage ? '' : 'me')
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [range, setRange] = useState({ from: '', to: '' })
  const [cycle, setCycle] = useState(null)

  useEffect(() => {
    // A client goes straight to its own statements; managers pick an account.
    if (!canManage) { loadPeriods('me'); return }
    usersAPI.getAll()
      .then(({ data }) => setAccounts(data.users || data.clients || []))
      .catch(() => setError('No se pudieron cargar las cuentas'))
  }, [canManage])

  const loadPeriods = async (id) => {
    if (!id) { setData(null); return }
    setLoading(true); setError(''); setDetail(null); setCycle(null)
    try {
      const { data } = await billingPeriodsAPI.list(id)
      setData(data)
      // Cut settings are the provider's business, not the account's own.
      if (!data.readOnly) billingPeriodsAPI.cyclePlan(id).then(({ data }) => setCycle(data)).catch(() => {})
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

  const saveCycle = async (changes) => {
    setBusy('cycle'); setError(''); setSuccess('')
    try {
      const { data } = await billingPeriodsAPI.updateCycle(accountId, changes)
      setCycle((c) => ({ ...c, plan: data.plan }))
      setSuccess('Configuración del corte guardada.')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el corte')
    } finally {
      setBusy('')
    }
  }

  const runCycle = async () => {
    const amount = cycle?.plan?.chargeAmount || 0
    if (!confirm(`¿Cobrar $${amount.toFixed(2)} ahora para dejar la cuenta con fondo de ${cycle.plan.targetDays} días?`)) return
    setBusy('cycle-run'); setError(''); setSuccess('')
    try {
      const { data } = await billingPeriodsAPI.runCycle(accountId)
      setSuccess(data.message)
      setCycle((c) => ({ ...c, plan: data.plan }))
      loadPeriods(accountId)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cobrar el corte')
    } finally {
      setBusy('')
    }
  }

  // A report over any dates: the week a client asks about, or a cut that does
  // not line up with a calendar month. It is only a view — nothing is stored
  // and nothing can be charged from it.
  const buildRangeReport = async () => {
    if (!range.from || !range.to) { setError('Elige las dos fechas.'); return }
    setBusy('range'); setError('')
    try {
      const { data } = await billingPeriodsAPI.rangeReport(accountId, range.from, range.to)
      setDetail(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo generar el reporte')
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

  // The second PDF: every call, message and other charge in the window, with
  // all their fields. Built as real tables (not a screenshot of the page) so a
  // month with thousands of entries still paginates and stays searchable.
  const downloadLogsPdf = async () => {
    setBusy('logs'); setError('')
    try {
      const { data: logs } = await billingPeriodsAPI.logs(accountId, detail.report.period.start, detail.report.period.end)
      const { jsPDF } = await import('jspdf')
      const { default: autoTable } = await import('jspdf-autotable')

      const tz = logs.period.timezone
      const when = (iso) => new Date(iso).toLocaleString('es-CO', { timeZone: tz, dateStyle: 'short', timeStyle: 'medium' })
      const usd = (n, digits = 2) => `$${Number(n || 0).toFixed(digits)}`
      const duration = (s) => `${Math.floor((s || 0) / 60)}:${String(Math.floor((s || 0) % 60)).padStart(2, '0')}`
      // Long chat replies would stretch a single row across pages.
      const clip = (text) => {
        const t = (text || '').replace(/\s+/g, ' ').trim()
        return t.length > 3000 ? `${t.slice(0, 3000)}…` : t
      }

      const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
      const margin = 36
      let y = 40

      doc.setFontSize(14)
      doc.text(`Logs · ${logs.account.name}`, margin, y)
      doc.setFontSize(9)
      doc.text(`${detail.period.label} · ${when(logs.period.start)} – ${when(logs.period.end)} (${tz})`, margin, y + 16)
      y += 34

      const section = (title, head, body) => {
        if (y > doc.internal.pageSize.getHeight() - 80) { doc.addPage(); y = 40 }
        doc.setFontSize(11)
        doc.text(title, margin, y)
        autoTable(doc, {
          startY: y + 6,
          head: [head],
          body: body.length ? body : [[{ content: 'Sin registros', colSpan: head.length }]],
          margin: { left: margin, right: margin },
          styles: { fontSize: 7, cellPadding: 3, overflow: 'linebreak', valign: 'top' },
          headStyles: { fillColor: [243, 244, 246], textColor: 20, fontStyle: 'bold' },
        })
        y = doc.lastAutoTable.finalY + 22
      }

      section(
        `Llamadas (${logs.calls.length})${logs.truncated.calls ? ' — recortado' : ''}`,
        ['Fecha y hora', 'Agente', 'Cliente', 'Tipo', 'Duración', 'Resultado', 'Motivo de fin', 'Costo'],
        logs.calls.map((c) => [when(c.at), c.agent || '—', c.customer || '—', c.type || '—', duration(c.durationSeconds), c.outcome || '—', c.endedReason || '—', usd(c.cost, 4)]),
      )
      section(
        `Mensajes (${logs.messages.length})${logs.truncated.messages ? ' — recortado' : ''}`,
        ['Fecha y hora', 'Chatbot', 'Contacto', 'Mensaje', 'Respuesta', 'Estado', 'Costo'],
        logs.messages.map((m) => [when(m.at), m.chatbot || '—', m.contact || '—', clip(m.input), clip(m.output), m.status || '—', usd(m.cost, 4)]),
      )
      section(
        `Otros cobros y abonos (${logs.otherCharges.length})`,
        ['Fecha y hora', 'Concepto', 'Nota', 'Monto'],
        logs.otherCharges.map((c) => [when(c.at), c.concept, c.note || '—', `${c.amount < 0 ? '−' : ''}${usd(Math.abs(c.amount))}`]),
      )

      doc.save(`${(logs.account.name || 'cuenta').replace(/[^\w\s-]/g, '')} - ${detail.period.label} - logs.pdf`)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo generar el PDF de logs')
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
          {canManage
            ? 'El consumo de cada mes, con su detalle día por día. Puedes cobrar un mes pendiente con la tarjeta guardada del cliente.'
            : 'Tu consumo de cada mes, con el detalle día por día. Descarga el reporte de cualquier mes o de las fechas que elijas.'}
        </p>
      </div>

      {canManage && (
        <div className="mb-6 max-w-md">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cuenta</label>
          <select
            value={accountId}
            onChange={(e) => { setAccountId(e.target.value); loadPeriods(e.target.value) }}
            className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
          >
            <option value="">Selecciona una cuenta…</option>
            <option value="me">Mi cuenta</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.companyName || a.name || a.email} · {a.role}
              </option>
            ))}
          </select>
        </div>
      )}

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
                          {p.payable && !data.readOnly && (
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

      {/* Cut billing: fund the account in days of its own consumption */}
      {data && !loading && cycle && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 mb-6">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h2 className="text-sm font-medium text-gray-900 dark:text-white">Cobro por cortes</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Mantiene la cuenta con fondo para {cycle.plan.targetDays} días: {cycle.plan.cycleDays} de consumo más {cycle.plan.guaranteeDays} de garantía.
                Cuando el saldo baja a la garantía, se cobra la tarjeta hasta volver a {cycle.plan.targetDays} días.
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cycle.plan.enabled}
                onChange={(e) => saveCycle({ enabled: e.target.checked })}
                disabled={busy === 'cycle'}
                className="text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{cycle.plan.enabled ? 'Activo' : 'Inactivo'}</span>
            </label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Consumo diario</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{money(cycle.plan.dailyAverage)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">promedio de {cycle.plan.windowDays} días</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Fondo objetivo</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{money(cycle.plan.targetAmount)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{cycle.plan.targetDays} días</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Se cobra al bajar de</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{money(cycle.plan.guaranteeAmount)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{cycle.plan.guaranteeDays} días de garantía</p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Fondo actual</p>
              <p className={`text-lg font-semibold ${cycle.plan.due ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                {cycle.plan.daysLeft === null ? '—' : `${cycle.plan.daysLeft} días`}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">{money(cycle.plan.balance)}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            {[
              { key: 'targetDays', label: 'Fondo objetivo (días)', value: cycle.plan.targetDays },
              { key: 'guaranteeDays', label: 'Días de garantía', value: cycle.plan.guaranteeDays },
              { key: 'usageWindowDays', label: 'Ventana de promedio', value: cycle.plan.windowDays },
            ].map((field) => (
              <div key={field.key}>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{field.label}</label>
                <input
                  type="number"
                  defaultValue={field.value}
                  onBlur={(e) => {
                    const n = parseInt(e.target.value)
                    if (Number.isFinite(n) && n !== field.value) saveCycle({ [field.key]: n })
                  }}
                  className="w-28 px-3 py-2 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                />
              </div>
            ))}

            <button
              onClick={runCycle}
              disabled={busy === 'cycle-run' || !cycle.hasCard || cycle.plan.chargeAmount < 0.5}
              title={cycle.hasCard ? '' : 'La cuenta no tiene tarjeta guardada'}
              className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {busy === 'cycle-run' ? 'Cobrando…' : `Cobrar ahora ${money(cycle.plan.chargeAmount)}`}
            </button>
          </div>

          {!cycle.hasCard && (
            <p className="text-xs text-amber-600 dark:text-amber-400 mt-3">
              La cuenta no tiene tarjeta guardada, así que el corte no puede cobrarse solo. El cliente debe agregarla desde su panel o su enlace de pago.
            </p>
          )}
          {cycle.plan.dailyAverage === 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
              Todavía no hay consumo para estimar el corte. En cuanto la cuenta empiece a consumir, el cálculo aparece solo.
            </p>
          )}
          {cycle.lastError && (
            <p className="text-xs text-red-600 dark:text-red-400 mt-3">Último intento: {cycle.lastError}</p>
          )}
        </div>
      )}

      {/* A report over freely chosen dates */}
      {data && !loading && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 mb-8">
          <h2 className="text-sm font-medium text-gray-900 dark:text-white mb-1">Reporte por fechas</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Para revisar un rango que no coincide con un mes. Solo se consulta: no crea ni cobra un período.
          </p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Desde</label>
              <input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
                className="px-3 py-2 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Hasta</label>
              <input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
                className="px-3 py-2 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white" />
            </div>
            <button onClick={buildRangeReport} disabled={busy === 'range'}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50">
              {busy === 'range' ? 'Generando…' : 'Generar reporte'}
            </button>
          </div>
        </div>
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
                {busy === 'pdf' ? 'Generando…' : 'PDF resumen'}
              </button>
              <button
                onClick={downloadLogsPdf}
                disabled={busy === 'logs'}
                className="px-4 py-2 text-sm border border-primary-600 text-primary-700 dark:text-primary-400 rounded-lg hover:bg-primary-50 dark:hover:bg-primary-900/20 disabled:opacity-50"
              >
                {busy === 'logs' ? 'Generando…' : 'PDF de logs'}
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
                <tr><td className="py-1 border-b border-gray-200">Consumo del período</td>
                    <td className="py-1 border-b border-gray-200 text-right">{money(detail.report.totals.usage)}</td></tr>
                {detail.report.totals.otherCharges > 0 && (
                  <tr><td className="py-1 border-b border-gray-200">Otros cobros</td>
                      <td className="py-1 border-b border-gray-200 text-right">{money(detail.report.totals.otherCharges)}</td></tr>
                )}
                {detail.report.totals.credits > 0 && (
                  <tr><td className="py-1 border-b border-gray-200">Abonos</td>
                      <td className="py-1 border-b border-gray-200 text-right">−{money(detail.report.totals.credits)}</td></tr>
                )}
                <tr><td className="py-2 font-bold">Total del período</td>
                    <td className="py-2 font-bold text-right">{money(detail.report.totals.total)}</td></tr>
                {detail.period.status !== 'range' && (
                  <>
                    <tr><td className="py-1">Pagado</td>
                        <td className="py-1 text-right">{money(detail.period.settledAmount)}</td></tr>
                    <tr><td className="py-1 font-semibold">Pendiente</td>
                        <td className="py-1 font-semibold text-right">{money(detail.period.outstanding)}</td></tr>
                  </>
                )}
              </tbody>
            </table>

            {detail.report.otherCharges?.length > 0 && (
              <div className="mb-6">
                <h4 className="font-semibold mb-2">Otros cobros y abonos</h4>
                <table className="w-full text-xs">
                  <tbody>
                    {detail.report.otherCharges.map((c, i) => (
                      <tr key={i} className="border-b border-gray-100">
                        <td className="py-1 pr-2 text-gray-500 whitespace-nowrap">
                          {new Date(c.at).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                        </td>
                        <td className="py-1 pr-2 capitalize">
                          {c.concept}{c.note && <span className="normal-case text-gray-500"> · {c.note}</span>}
                        </td>
                        <td className="py-1 text-right">{c.amount < 0 ? '−' : ''}{money(Math.abs(c.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

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
