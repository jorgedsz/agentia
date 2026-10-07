import { useState, useEffect } from 'react'
import { invoicesAPI } from '../../services/api'
import InvoiceDocument from './InvoiceDocument'

// The invoices of this account, read through the PAYMENTS that produced them.
//
// PAYMENTS, NOT INVOICES, ARE THE LIST. An invoice is created from a settled
// payment, and emission after a settlement is fire-and-forget — it must never
// undo money that already went through — so a payment can end up settled with
// no document on file. That payment is exactly the one somebody needs to act
// on, and it cannot appear in a list of invoices. Listing payments puts it on
// screen with `invoice: null` and the `purchaseId` that repairs it.
//
// The three row states are deliberately different in tone:
//   · invoice present            → read it, nothing to do
//   · null + invoiceExpected     → charged under the tax, its document failed
//                                  to issue: something still TO DO, not an
//                                  error to apologise for
//   · null + !invoiceExpected    → predates the tax being switched on. An
//                                  invoice can still be issued, but nothing
//                                  went wrong, so it is offered quietly.

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`

// The payment's own date, not a settlement timestamp — so it is shown to the
// day and never to the minute as if it were one.
const fmtDate = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-DO')
}

export default function Invoices() {
  // `billsWithTax` starts false and the page says nothing until the first
  // answer lands, so an account with no invoicing never flashes a table.
  const [data, setData] = useState({ billsWithTax: false, payments: [] })
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invoice, setInvoice] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const { data: res } = await invoicesAPI.list()
      setData({
        billsWithTax: !!res.billsWithTax,
        payments: Array.isArray(res.payments) ? res.payments : [],
      })
      setError('')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudieron cargar los pagos')
      setData({ billsWithTax: false, payments: [] })
    } finally {
      setLoaded(true)
      setLoading(false)
    }
  }

  // Open the invoice for one payment, ISSUING it if a settlement missed it.
  //
  // Always through `forPurchase`, never by invoice id, so reading a document
  // and repairing a missing one are the same action and not two code paths
  // that can drift. It is idempotent server-side and takes its number inside
  // the transaction that bumps the sequence, so double-clicking cannot produce
  // two invoices or burn a number.
  //
  // Its two non-200 answers are NOT failures and must not read like one: 404
  // means this payment does not generate an invoice, 409 that the payment is
  // not confirmed yet. Both are shown as a message instead of an empty modal.
  const openInvoice = async (purchaseId) => {
    setBusy(purchaseId)
    setNotice('')
    setError('')
    try {
      const { data: res } = await invoicesAPI.forPurchase(purchaseId)
      setInvoice(res.invoice)
      // `issued` true means this call created the document rather than reading
      // one already on file — the row has to stop offering to issue it.
      if (res.issued) load()
    } catch (err) {
      const status = err.response?.status
      if (status === 404) {
        setNotice(err.response?.data?.error || 'Este pago no genera factura.')
      } else if (status === 409) {
        setNotice(err.response?.data?.error || 'El pago todavía no se ha confirmado, así que aún no tiene factura.')
      } else {
        setError(err.response?.data?.error || 'No se pudo cargar la factura')
      }
    } finally {
      setBusy(null)
    }
  }

  // Answers "how much has this account paid, and how much of it was tax"
  // without the reader adding up a column.
  const totals = data.payments.reduce(
    (acc, p) => ({
      charged: acc.charged + (Number(p.amount) || 0),
      tax: acc.tax + (Number(p.taxAmount) || 0),
      issued: acc.issued + (p.invoice ? 1 : 0),
      pending: acc.pending + (!p.invoice && p.invoiceExpected ? 1 : 0),
    }),
    { charged: 0, tax: 0, issued: 0, pending: 0 },
  )

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Facturas</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Cada pago confirmado lleva su factura. Ábrela para verla o descargarla en PDF.
        </p>
      </div>

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}
      {notice && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">{notice}</div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {/* The account does not bill with tax, so it has no invoices and never
          will. The menu hides this entry for exactly these accounts; landing
          here by URL has to say so plainly instead of showing an empty table
          that reads as "nothing yet". */}
      {loaded && !loading && !data.billsWithTax && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <p className="text-sm text-gray-700 dark:text-gray-300">Esta cuenta no emite facturas.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Sus pagos no se facturan con impuesto, así que no hay documentos que mostrar aquí. Tu consumo y tus
            períodos siguen estando en «Períodos y reportes».
          </p>
        </div>
      )}

      {loaded && !loading && data.billsWithTax && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Total cobrado</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{money(totals.charged)}</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Impuesto incluido</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{money(totals.tax)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">ya dentro del total cobrado</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Facturas emitidas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totals.issued}</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Por emitir</p>
              <p className={`text-2xl font-bold ${totals.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                {totals.pending}
              </p>
              {totals.pending > 0 && (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">puedes emitirlas desde la tabla</p>
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-hover">
                  <tr>
                    {['Fecha', 'Concepto', 'Cobrado', 'Impuesto', 'Factura', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                  {data.payments.map((p) => (
                    <tr key={p.purchaseId} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                      <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">{fmtDate(p.paidAt)}</td>
                      <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">{p.concept}</td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className="font-medium text-gray-900 dark:text-white">{money(p.amount)}</span>
                        {p.taxAmount > 0 && (
                          <span className="block text-xs text-gray-500 dark:text-gray-400">
                            {money(p.credits)} de saldo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap text-gray-600 dark:text-gray-400">
                        {p.taxAmount > 0 ? (
                          <>
                            {money(p.taxAmount)}
                            <span className="block text-xs text-gray-500 dark:text-gray-400">{Number(p.taxRate) || 0}%</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {p.invoice ? (
                          <>
                            <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              {p.invoice.number}
                            </span>
                            <span className="block mt-1 text-[11px] text-gray-500 dark:text-gray-400">
                              {fmtDate(p.invoice.issuedAt)}
                            </span>
                          </>
                        ) : p.invoiceExpected ? (
                          // Charged under the tax, so its document was due and
                          // failed to issue. Something still to do, in the same
                          // amber the panel uses for "pendiente" elsewhere —
                          // not red, nothing is broken for the client.
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Por emitir
                          </span>
                        ) : (
                          // Predates the tax being switched on: no document was
                          // ever due, so this is stated flatly and in grey.
                          <span className="text-xs text-gray-500 dark:text-gray-400">Sin factura</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end">
                          {p.invoice ? (
                            <button
                              onClick={() => openInvoice(p.purchaseId)}
                              disabled={busy === p.purchaseId}
                              className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
                            >
                              {busy === p.purchaseId ? 'Abriendo…' : 'Ver factura'}
                            </button>
                          ) : p.invoiceExpected ? (
                            <button
                              onClick={() => openInvoice(p.purchaseId)}
                              disabled={busy === p.purchaseId}
                              className="px-3 py-1.5 text-xs border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-900/20 disabled:opacity-50"
                            >
                              {busy === p.purchaseId ? 'Emitiendo…' : 'Emitir factura'}
                            </button>
                          ) : (
                            <button
                              onClick={() => openInvoice(p.purchaseId)}
                              disabled={busy === p.purchaseId}
                              title="Este pago es anterior a la facturación con impuesto. Puedes emitir su factura si la necesitas."
                              className="text-xs text-gray-500 dark:text-gray-400 underline hover:text-gray-700 dark:hover:text-gray-300 disabled:opacity-50"
                            >
                              {busy === p.purchaseId ? 'Emitiendo…' : 'Emitir factura'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {/* Bills with tax but has not paid yet — the invoices are not
                      missing, there is simply nothing to make one from. */}
                  {data.payments.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500 dark:text-gray-400">
                        Todavía no hay pagos. Cuando se haga el primero, su factura aparecerá aquí.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {/* The list is capped and has no paging, so it must never read as
                the complete history. */}
            {data.payments.length > 0 && (
              <p className="px-4 py-3 text-[11px] text-gray-400 dark:text-gray-500 border-t border-gray-200 dark:border-dark-border">
                Se muestran los pagos más recientes.
              </p>
            )}
          </div>
        </>
      )}

      {/* The document itself, with its PDF download */}
      {invoice && <InvoiceDocument invoice={invoice} onClose={() => setInvoice(null)} />}
    </div>
  )
}
