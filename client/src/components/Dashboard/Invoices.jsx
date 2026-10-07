import { useState, useEffect } from 'react'
import { invoicesAPI, billingProfileAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'
import InvoiceDocument from './InvoiceDocument'
import BillingProfileFields, { EMPTY_INVOICE_PROFILE, invoiceFormFrom, invoicePayloadFrom } from './BillingProfileFields'

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
//   · null + invoiceExpected     → this account bills with tax, so the
//                                  document was due and failed to issue:
//                                  something still TO DO, not an error to
//                                  apologise for
//   · null + !invoiceExpected    → the account does not bill with tax at all.
//                                  An invoice can still be issued, but nothing
//                                  went wrong, so it is offered quietly.
//
// AND THE TWO MONEY COLUMNS CAN DISAGREE. An issuer can show the tax on its
// invoices without charging it to the client
// (BillingProfile.chargeTaxToClient), and then a $100 payment carries a $127
// invoice. Both figures are on the row, and the uncollected difference is
// spelled out next to the invoice number rather than left for the reader to
// subtract.

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`

// To the cent, so 127 - 100 is 27 and never 26.999999999999996.
const cent = (n) => Math.round((Number(n) || 0) * 100) / 100

// Under a cent is not a difference worth naming.
const CENT = 0.01

// What an invoice asks for beyond what its payment collected, or 0.
const gapOf = (p) => (p.invoice ? Math.max(0, cent((Number(p.invoice.total) || 0) - (Number(p.amount) || 0))) : 0)

// The payment's own date, not a settlement timestamp — so it is shown to the
// day and never to the minute as if it were one.
const fmtDate = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-DO')
}

// Who gets the "Datos de facturación" panel on this page.
//
// A WHITELABEL or an AGENCY because this is the ONLY screen where a partner can
// see its own account: AccountManagement, where the OWNER edits this, lists the
// accounts BELOW the viewer and never the viewer, so until now a partner had to
// ask the platform owner to switch on its own tax or fix its own RNC.
//
// The OWNER is included too, even though it already has the other route. It
// loses nothing by having it here, the server lets it through on any id, and
// leaving it out would mean the OWNER looking at this page sees a page that is
// missing a panel its partners have — a difference nobody could explain. A
// CLIENT is not here, and the server refuses it by role whatever this renders.
const ISSUER_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

export default function Invoices() {
  const { user } = useAuth()
  // The account whose profile this edits is always the one looking at the page
  // — never an id typed in from somewhere — which is also the only id the
  // server will accept from a partner.
  const canConfigureIssuer = ISSUER_ROLES.includes(user?.role)
  // `billsWithTax` starts false and the page says nothing until the first
  // answer lands, so an account with no invoicing never flashes a table.
  const [data, setData] = useState({ billsWithTax: false, payments: [] })
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [invoice, setInvoice] = useState(null)
  const [busy, setBusy] = useState(null)

  // The issuer panel. Collapsed by default — this page is read first and
  // configured once — and its profile is fetched the first time it is opened,
  // so an account that never touches it costs no request.
  const [issuerOpen, setIssuerOpen] = useState(false)
  const [issuerForm, setIssuerForm] = useState(EMPTY_INVOICE_PROFILE)
  const [issuerExists, setIssuerExists] = useState(false)
  const [issuerLoaded, setIssuerLoaded] = useState(false)
  const [issuerSaving, setIssuerSaving] = useState(false)
  const [issuerMsg, setIssuerMsg] = useState('')
  const [issuerError, setIssuerError] = useState('')

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

  const toggleIssuer = () => {
    const opening = !issuerOpen
    setIssuerOpen(opening)
    if (opening && !issuerLoaded) loadIssuer()
  }

  const loadIssuer = async () => {
    try {
      const { data } = await billingProfileAPI.get(user.id)
      setIssuerExists(!!data.exists)
      setIssuerForm(invoiceFormFrom(data.profile))
      setIssuerError('')
    } catch (err) {
      // A refusal here is worth showing: it is either a role that may not
      // configure this or a session that expired, and both read as a blank
      // form otherwise.
      setIssuerError(err.response?.data?.error || 'No se pudieron cargar los datos de facturación')
    } finally {
      setIssuerLoaded(true)
    }
  }

  const saveIssuer = async () => {
    setIssuerSaving(true)
    setIssuerMsg('')
    setIssuerError('')
    try {
      const { data } = await billingProfileAPI.save(user.id, invoicePayloadFrom(issuerForm))
      setIssuerExists(!!data.exists)
      // Re-seeded from what the server actually stored, not from what was
      // typed: coerced rates and the default tax label come back here.
      setIssuerForm(invoiceFormFrom(data.profile))
      setIssuerMsg('Datos de facturación guardados.')
      // Switching the tax on is what makes this account bill with tax, which is
      // the same flag the payments list below is gated on — so the list has to
      // be re-read rather than keep saying there is nothing to show.
      load()
    } catch (err) {
      // The server's own refusals, word for word: a rate over 100, a numbering
      // sequence moved backwards under invoices that already exist. They must
      // never be swallowed — the partner would believe it saved.
      setIssuerError(err.response?.data?.error || 'No se pudieron guardar los datos de facturación')
    } finally {
      setIssuerSaving(false)
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
  //
  // THESE ARE THE TOTALS OF THE ROWS ON SCREEN, NOT OF THE ACCOUNT'S HISTORY.
  // The server caps the list (50 by default) with no cursor, so an account past
  // that cap has payments these figures do not count — which is why the cards
  // say so instead of presenting a number that looks like a lifetime total.
  //
  // `charged` is what the cards actually paid and `invoiced` is what the
  // documents ask for. They are the same number only when the tax is charged on
  // top; with the tax merely shown, `invoiced` is the higher of the two and the
  // difference is what the issuer has not collected.
  const totals = data.payments.reduce(
    (acc, p) => ({
      charged: acc.charged + (Number(p.amount) || 0),
      tax: acc.tax + (Number(p.taxAmount) || 0),
      invoiced: acc.invoiced + (p.invoice ? (Number(p.invoice.total) || 0) : 0),
      // Only over the rows that HAVE an invoice, so the gap is never inflated
      // by a payment whose document was simply never issued.
      invoicedCharged: acc.invoicedCharged + (p.invoice ? (Number(p.amount) || 0) : 0),
      issued: acc.issued + (p.invoice ? 1 : 0),
      pending: acc.pending + (!p.invoice && p.invoiceExpected ? 1 : 0),
    }),
    { charged: 0, tax: 0, invoiced: 0, invoicedCharged: 0, issued: 0, pending: 0 },
  )
  const uncollected = cent(totals.invoiced - totals.invoicedCharged)

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

      {/* The issuer side of invoicing, for the partner that issues. Above the
          payments table on purpose: when the tax is off there is no table, and
          this panel is the thing to act on. Independent of `loading`, so it is
          reachable even if the payments list failed. */}
      {canConfigureIssuer && (
        <div className="mb-6 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          <button
            onClick={toggleIssuer}
            className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-dark-hover"
          >
            <span>
              <span className="block text-sm font-semibold text-gray-900 dark:text-white">Datos de facturación</span>
              <span className="block text-xs text-gray-500 dark:text-gray-400">
                Tu impuesto, la numeración de tus facturas y los datos del emisor que se imprimen en ellas.
              </span>
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">{issuerOpen ? 'Ocultar' : 'Configurar'}</span>
          </button>

          {issuerOpen && (
            <div className="px-4 pb-4 pt-2 space-y-4 border-t border-gray-100 dark:border-dark-border">
              {!issuerLoaded && (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>
              )}

              {issuerLoaded && (
                <>
                  <BillingProfileFields
                    form={issuerForm}
                    onChange={(patch) => setIssuerForm(f => ({ ...f, ...patch }))}
                    profileExists={issuerExists}
                    taxHelp={<>
                      Apagado no cambia nada: no se emite ninguna factura. Encendido, cada pago confirmado de
                      <strong> todas las cuentas que dependen de ti</strong> genera una factura con tu numeración, y esa
                      factura muestra el impuesto como línea aparte. <strong>Por sí solo no le cobra nada extra a
                      nadie</strong>: eso es la casilla siguiente. No hay forma de activarlo para unos clientes y no para otros.
                    </>}
                    chargeHelp={<>
                      Encendido, el impuesto se suma por encima de cada cargo a <strong>todas las cuentas que dependen
                      de ti</strong>: quien pida $100 de saldo paga $127 al 27% y recibe 100 créditos de saldo.
                      Apagado, cada cuenta paga exactamente el monto que pide.
                    </>}
                    notConfiguredNote="Todavía no tienes perfil de facturación: lo que ves son los valores por defecto y se crean al guardar."
                  />

                  {/* The server's refusals, in the panel that caused them. */}
                  {issuerError && (
                    <p className="text-sm text-red-600 dark:text-red-400">{issuerError}</p>
                  )}
                  {issuerMsg && !issuerError && (
                    <p className="text-sm text-gray-600 dark:text-gray-400">{issuerMsg}</p>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={saveIssuer}
                      disabled={issuerSaving}
                      className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                    >
                      {issuerSaving ? 'Guardando…' : 'Guardar datos de facturación'}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
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
          {/* For a partner this is not a dead end: the switch that changes it
              is the panel right above, on this same page. */}
          {canConfigureIssuer && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Si eres tú quien factura a tus clientes, enciende el impuesto en <strong>«Datos de facturación»</strong> arriba.
            </p>
          )}
        </div>
      )}

      {loaded && !loading && data.billsWithTax && (
        <>
          {data.payments.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Totales de los pagos mostrados abajo (los más recientes), no de todo el historial de la cuenta.
            </p>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Cobrado</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{money(totals.charged)}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">en los pagos mostrados</p>
            </div>
            {/* What the DOCUMENTS ask for, which is not what was collected
                whenever the tax is shown without being charged. Counted over
                the invoiced rows only, so the gap underneath means "not
                collected", never "not invoiced yet". */}
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Facturado</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{money(totals.invoiced)}</p>
              {uncollected >= CENT ? (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                  {money(uncollected)} más de lo cobrado: impuesto facturado y no cobrado
                </p>
              ) : totals.tax >= CENT ? (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  incluye {money(totals.tax)} de impuesto, ya cobrado
                </p>
              ) : (
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">en las facturas emitidas</p>
              )}
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Facturas emitidas</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{totals.issued}</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">de los pagos mostrados</p>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs uppercase text-gray-500 dark:text-gray-400">Por emitir</p>
              <p className={`text-2xl font-bold ${totals.pending > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-white'}`}>
                {totals.pending}
              </p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                {totals.pending > 0 ? 'puedes emitirlas desde la tabla' : 'de los pagos mostrados'}
              </p>
            </div>
          </div>

          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden mb-8">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 dark:bg-dark-hover">
                  <tr>
                    {['Fecha', 'Concepto', 'Cobrado', 'Impuesto cobrado', 'Factura', ''].map((h) => (
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
                      {/* The tax THE CARD PAID. A dash here next to an invoice
                          that carries a tax line is not a contradiction: the
                          issuer showed the tax without charging it, which the
                          Factura column spells out. */}
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
                              {fmtDate(p.invoice.issuedAt)} · total {money(p.invoice.total)}
                            </span>
                            {/* The document asks for more than the payment
                                brought in. Stated on the row, not left to be
                                worked out from two columns. */}
                            {gapOf(p) >= CENT && (
                              <span className="block mt-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                                faltan {money(gapOf(p))} por cobrar
                              </span>
                            )}
                          </>
                        ) : p.invoiceExpected ? (
                          // This account bills with tax, so the document was
                          // due and failed to issue. Something still to do, in
                          // the same amber the panel uses for "pendiente"
                          // elsewhere — not red, nothing is broken for the
                          // client.
                          <span className="px-2 py-1 text-xs font-medium rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Por emitir
                          </span>
                        ) : (
                          // The account does not bill with tax, so no document
                          // was ever due: stated flatly and in grey.
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
                              title="Esta cuenta no factura con impuesto. Puedes emitir la factura de este pago si la necesitas."
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
