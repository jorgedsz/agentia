import { useState, useEffect, useRef } from 'react'
import { invoicesAPI, billingProfileAPI, authAPI } from '../../services/api'
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

// Who may look at ANOTHER account's payments from this page.
//
// The same three roles as ISSUER_ROLES, and deliberately a SECOND constant:
// they answer two different questions that must never be collapsed into one.
// ISSUER_ROLES is "may configure MY OWN issuer data" (the server checks it with
// canConfigureBillingProfile, against the viewer's own id and no other).
// MANAGER_ROLES is "may read the payments of the accounts below me" (the server
// checks it with canReadAccount, against the selected id). A partner that gains
// one of these must not silently gain the other, and the day the roles diverge
// this file must not have to be untangled first.
const MANAGER_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

// Who is OFFERED the «Regenerar factura» button on an open document.
//
// A THIRD constant, for the same reason there are two above: a third question.
// This one is "may rewrite a document already issued", which the server answers
// with canRegenerateInvoice — the OWNER, or the account that owns the invoice's
// BillingProfile, and nobody else. A CLIENT is not here and the server refuses
// it whatever this renders: it may download its own invoice and must not be able
// to rewrite a fiscal document its provider issued.
//
// Note this is a ROLE filter and not the full rule. The exact identity check
// ("is this invoice's issuer YOU?") needs the invoice's profile owner, which the
// document payload deliberately does not carry — present() leaks neither
// `profileId` nor `userId`, precisely so the rendered document depends on
// nothing but its own frozen snapshots. So a partner that opens an invoice
// issued by the partner ABOVE it is shown the button and gets the server's 403,
// which the modal reports as the refusal it is. Hiding it instead would mean
// putting the issuer's account id into every document response to decide the
// colour of one button.
const REGENERATE_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

// Who may RAISE one by hand, for an amount typed with no payment behind it.
//
// A FOURTH constant, for the same reason there are three above: a fourth
// question. Creating an invoice spends a number from the issuer's correlative
// sequence and prints the issuer's RNC, so it is the issuer's act — which the
// server answers with canConfigureBillingProfile against the resolved profile's
// owner, exactly the rule it applies to regenerating. A CLIENT is not here and
// is refused by role there even on its own account: a client issues nothing.
//
// Like REGENERATE_ROLES this is a ROLE filter and not the full rule: a partner
// that is not the issuer of the client it picks is shown the form and gets the
// server's 403, which the form reports as the refusal it is. Deciding it here
// would mean telling the page which partner owns which client's profile.
const MANUAL_ROLES = ['OWNER', 'WHITELABEL', 'AGENCY']

// Today, as a <input type="date"> value, in the READER's own calendar day.
// toISOString would hand back the UTC day, which west of Greenwich is tomorrow
// for the last hours of every evening.
const todayInput = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// A date-input value as the instant to store.
//
// NOON UTC, AND THAT IS THE WHOLE POINT. The document prints this column with
// the reader's local calendar day (InvoiceDocument's fmtDate uses getDate), so
// a bare '2026-10-20' — which parses as UTC midnight — prints as 19/10/2026 for
// every reader west of Greenwich, Santo Domingo included. Noon UTC is the same
// calendar day for every reader from UTC-11 to UTC+11, so the day the issuer
// picked is the day the invoice shows.
const dateToInstant = (value) => (value ? `${value}T12:00:00.000Z` : '')

// The amount, to the cent, or null when the field is not a usable figure yet.
const amountOrNull = (raw) => {
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : null
}

// THE PREVIEW ONLY, and deliberately marked as such wherever it is shown.
//
// The figures ON THE DOCUMENT are computed once, server-side, by
// buildInvoiceData — this page stores nothing and decides nothing. These two
// lines exist so the checkbox can say what it does with the issuer's real rate
// instead of a sentence about percentages in the abstract, and they mirror the
// service's formulas (gross the net up by 1 - rate/100, take the tax on that
// net, subtract the retention) rather than inventing a second rule. The real
// document is opened the instant the invoice is created, so a disagreement
// between these numbers and it would be visible immediately rather than
// silently shipped.
const roundCent = (n) => Math.round(n * 100) / 100
const previewOf = (amount, taxRate, retentionRate) => {
  const subtotal = retentionRate > 0 ? roundCent(amount / (1 - retentionRate / 100)) : amount
  const taxAmount = roundCent((subtotal * taxRate) / 100)
  const retention = roundCent((subtotal * retentionRate) / 100)
  return { subtotal, taxAmount, retention, total: roundCent(subtotal + taxAmount - retention) }
}

// The DESCRIPCIÓN text a blank concept falls back to. A HINT ONLY: the value
// actually written is the server's, from conceptFor, and the field is sent
// empty when it is left alone precisely so there is one source for it. If the
// two ever drift, a stale placeholder is the whole cost.
const DEFAULT_CONCEPT_HINT = 'Recarga de Saldo - Créditos de Consumos para Ecosistema de AI'

export default function Invoices() {
  const { user } = useAuth()
  // The account whose profile this edits is always the one looking at the page
  // — never an id typed in from somewhere — which is also the only id the
  // server will accept from a partner.
  const canConfigureIssuer = ISSUER_ROLES.includes(user?.role)
  // Whether the account picker renders at all. A CLIENT never sees it and this
  // page stays exactly what it was for them: their own payments, their own
  // invoices, no way to name another account.
  const canManage = MANAGER_ROLES.includes(user?.role)
  // Whether an open document offers to rebuild itself. See REGENERATE_ROLES.
  const canRegenerate = REGENERATE_ROLES.includes(user?.role)
  // Whether the «Crear factura a mano» button renders at all. See MANUAL_ROLES.
  const canCreateManual = MANUAL_ROLES.includes(user?.role)
  // The account whose PAYMENTS are on screen. 'me' is the viewer's own and is
  // where everyone starts, manager included: the page opens on the one account
  // nobody can mistake, and another account is only ever shown after somebody
  // deliberately picks it. Never confused with `user.id` above - that one is the
  // issuer panel's subject and is not this.
  const [accountId, setAccountId] = useState('me')
  const [accounts, setAccounts] = useState([])
  // `billsWithTax` starts false and the page says nothing until the first
  // answer lands, so an account with no invoicing never flashes a table.
  //
  // `subject` IS WHOSE PAYMENTS THESE ARE, stored with them and set in the same
  // breath, so the rows cannot be separated from the account they belong to.
  // The table is rendered only while it matches the picker (`describesSelection`
  // below): that is what makes "rows under the wrong account's name"
  // structurally impossible rather than merely unlikely.
  const [data, setData] = useState({ subject: 'me', billsWithTax: false, payments: [] })
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
  const [accountsError, setAccountsError] = useState('')

  // The hand-made invoice form. Collapsed until asked for, because the page is
  // read far more often than it is written to.
  const [manualOpen, setManualOpen] = useState(false)
  const [manualForm, setManualForm] = useState({
    userId: '', amount: '', applyTaxes: true, concept: '', paidAt: todayInput(),
  })
  const [manualSaving, setManualSaving] = useState(false)
  const [manualError, setManualError] = useState('')
  // The invoices raised in THIS session, newest first.
  //
  // They are kept here because the table below cannot show them: it lists
  // PAYMENTS, and a hand-made invoice has none — that is the whole point of it.
  // Without this strip, closing the document would be the last time anybody
  // could reach the number that was just spent, short of knowing its id. It is
  // session-only on purpose and says so: it is a receipt for what was just
  // done, not a second list of invoices.
  const [manualCreated, setManualCreated] = useState([])
  // Which payments request is the current one. A ref and not state: it is read
  // and written inside one async call and must never trigger a render.
  const loadSeq = useRef(0)

  useEffect(() => {
    // `load()` with no argument reads whichever account is selected, which at
    // mount is always the viewer's own.
    load()
    // The accounts a manager may act on, from the endpoint that already answers
    // that for all three manager roles - the same list the account switcher and
    // SubAccounts read. A failure here only costs the picker its options; the
    // viewer's own payments below are already loading.
    if (canManage) {
      authAPI.getAccessibleAccounts()
        .then(({ data }) => setAccounts(Array.isArray(data.accounts) ? data.accounts : []))
        .catch(() => setAccountsError('No se pudieron cargar las cuentas'))
    }
  }, [canManage])

  // The payments of ONE account: the viewer's own ('me', which sends no id and
  // behaves exactly as this page always did) or the selected one.
  //
  // `billsWithTax` is re-read from every answer because it describes THAT
  // account: a partner whose own account bills with no tax gets false for
  // itself and true for the client it just selected, and the page has to follow
  // the account rather than remember the viewer.
  //
  // TWO SWITCHES IN A ROW LEAVE TWO REQUESTS IN FLIGHT, and the first can land
  // second. Nothing server-side stops it: a manager may legitimately read both
  // accounts, so both answers are 200s. Rendered, that is one account's
  // payments under the other account's name with an «Emitir factura» button on
  // every row — the exact human failure this page is built against, and it
  // needs no bad write to happen. Two guards, and the stale answer is simply
  // dropped rather than shown:
  //   · the sequence token, which only the newest request holds. It covers the
  //     FAILURE path too, which the echo cannot: a 403 from the account just
  //     left would otherwise blank the rows of the account now on screen and
  //     post a refusal about neither of them.
  //   · the echoed `accountId`, which makes the answer self-describing: it is
  //     checked against what was asked, so a payload that is about the wrong
  //     account is refused even if it arrives in perfect order.
  // A dropped answer leaves `loading` alone on purpose: the newer request is
  // still in flight and owns the spinner, so the page shows nothing rather than
  // the previous account's rows.
  const load = async (id = accountId) => {
    const seq = ++loadSeq.current
    setLoading(true)
    try {
      const { data: res } = await invoicesAPI.list(undefined, id === 'me' ? undefined : id)
      if (loadSeq.current !== seq) return
      // 'me' sends no id, so the server answers with the viewer's own. An older
      // server that echoes nothing is not treated as a mismatch.
      const expected = id === 'me' ? user?.id : id
      if (res.accountId !== undefined && Number(res.accountId) !== Number(expected)) {
        setData({ subject: String(id), billsWithTax: false, payments: [] })
        setError('La respuesta no corresponde a la cuenta seleccionada. Vuelve a elegirla.')
        return
      }
      setData({
        subject: String(id),
        billsWithTax: !!res.billsWithTax,
        payments: Array.isArray(res.payments) ? res.payments : [],
      })
      setError('')
    } catch (err) {
      if (loadSeq.current !== seq) return
      // Includes the server's 403 for an account this viewer may not read,
      // which is shown as the refusal it is and never as an empty list.
      setError(err.response?.data?.error || 'No se pudieron cargar los pagos')
      setData({ subject: String(id), billsWithTax: false, payments: [] })
    } finally {
      // Only the newest request may end the loading state, for the same reason
      // it is the only one allowed to set the rows.
      if (loadSeq.current === seq) {
        setLoaded(true)
        setLoading(false)
      }
    }
  }

  // Switching account: the table, the totals and `billsWithTax` all belong to
  // the account chosen, so they are all re-read. The issuer panel is NOT
  // touched - see loadIssuer.
  const selectAccount = (value) => {
    setAccountId(value)
    setNotice('')
    load(value)
  }

  const toggleIssuer = () => {
    const opening = !issuerOpen
    setIssuerOpen(opening)
    if (opening && !issuerLoaded) loadIssuer()
  }

  // ALWAYS `user.id`, THE VIEWER - never `accountId`.
  //
  // This panel is the viewer's own issuer: its tax, its invoice numbering and
  // the emisor details printed on the documents IT issues. The picker above
  // chooses whose PAYMENTS are listed, which is a different question with a
  // different permission (canReadAccount on the server, against the selected
  // id; canConfigureBillingProfile against this one). Pointing this at the
  // selected account would put another account's fiscal identity in an editable
  // form and have a manager overwrite somebody else's RNC and numbering - the
  // server refuses a partner on any id but its own, so it would only ever be a
  // blank form and a 403 on save, but the form must not ask in the first place.
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

  // Open the hand-made invoice form.
  //
  // It seeds the client from the picker above when another account is already
  // selected — that is almost always the account somebody came here to invoice
  // — and it pulls the issuer profile if the panel above has not already, since
  // the checkbox's own wording needs the REAL rates to say anything useful.
  const toggleManual = () => {
    const opening = !manualOpen
    setManualOpen(opening)
    setManualError('')
    if (!opening) return
    if (!issuerLoaded) loadIssuer()
    setManualForm((f) => ({
      ...f,
      userId: f.userId || (accountId !== 'me' ? String(accountId) : ''),
      paidAt: f.paidAt || todayInput(),
    }))
  }

  // Raise one.
  //
  // The amount is sent as typed — it is the TOTAL A PAGAR, and the arithmetic
  // that turns it into a net, a tax and a retention is the server's and only
  // the server's. The concept is sent as typed too, including empty, so the
  // default comes from the one helper that defines it.
  //
  // THE DOCUMENT IS OPENED THE MOMENT IT EXISTS. Somebody who just signed a
  // fiscal document in a client's name wants to see it, not a success message
  // about it — and seeing it is also how a wrong figure or a wrong client is
  // caught while it is still the newest number in the sequence. The payments
  // list is reloaded as well: it cannot show this invoice, but the issuer's
  // numbering moved, and a stale page is a page that disagrees with itself.
  const createManual = async () => {
    const amount = amountOrNull(manualForm.amount)
    if (!manualForm.userId) return setManualError('Elige el cliente de la factura.')
    if (amount === null) return setManualError('El monto debe ser un número mayor que cero.')
    if (!manualForm.paidAt) return setManualError('Elige la fecha de la factura.')

    setManualSaving(true)
    setManualError('')
    setNotice('')
    try {
      const { data: res } = await invoicesAPI.createManual({
        userId: Number(manualForm.userId),
        amount,
        applyTaxes: manualForm.applyTaxes,
        concept: manualForm.concept,
        paidAt: dateToInstant(manualForm.paidAt),
      })
      const client = accounts.find((a) => String(a.id) === String(manualForm.userId))
      setManualCreated((prev) => [
        { invoice: res.invoice, clientName: client?.name || client?.email || `Cuenta #${manualForm.userId}` },
        ...prev,
      ])
      setInvoice(res.invoice)
      setManualOpen(false)
      // The client, the box and the date are kept: raising several in a row for
      // the same client is the normal case. Only the figure and the concept are
      // cleared, because reusing either by accident is how the same document
      // gets issued twice under two numbers.
      setManualForm((f) => ({ ...f, amount: '', concept: '' }))
      load()
    } catch (err) {
      // The server's own Spanish, word for word: a 403 for a client this viewer
      // does not issue for, a 409 for one with no issuer configured at all.
      // Swallowing either would leave somebody believing a number was spent.
      setManualError(err.response?.data?.error || 'No se pudo crear la factura')
    } finally {
      setManualSaving(false)
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

  // Rebuild the OPEN document from the configuration as it stands now, keeping
  // its number.
  //
  // Handed to InvoiceDocument as a function rather than letting that component
  // call the API itself: the document looks nothing up, and the open modal reads
  // its invoice off THIS state, so replacing it here is what makes the screen
  // show the rebuilt version the instant the call lands instead of a stale
  // document next to a success message.
  //
  // The list is reloaded too. A rebuild recomputes the amounts from the current
  // profile, so a row's invoice total can legitimately change — and a table
  // still showing the old total next to a document showing the new one is the
  // same "two answers to one question" problem the rest of this page is built
  // against.
  //
  // Resolves to a note when there is something to say, and throws an Error
  // carrying the server's own Spanish message when it fails — which is the
  // contract InvoiceDocument expects, and keeps every HTTP detail out of it.
  const regenerateOpenInvoice = async () => {
    if (!invoice) return undefined
    try {
      const { data: res } = await invoicesAPI.regenerate(invoice.id)
      setInvoice(res.invoice)
      load()
      // `amountsRebuilt` false is not a failure: the payment behind this
      // invoice is gone, so the figures on it are the only surviving record of
      // what was charged and were left untouched rather than recomputed to 0.
      // Said plainly, because somebody who just asked for a rebuild would
      // otherwise assume the totals were rebuilt too.
      if (res.amountsRebuilt === false) {
        return 'Se actualizaron los datos del emisor y del cliente. Los importes se dejaron como estaban: el pago de esta factura ya no existe, así que no hay de dónde volver a calcularlos.'
      }
      return undefined
    } catch (err) {
      throw new Error(err.response?.data?.error || 'No se pudo regenerar la factura')
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

  // WHOSE INVOICES ARE ON SCREEN. Issuing one is signing a fiscal document in
  // somebody's name, so the answer is spelled out on the page and never left to
  // be read off a dropdown.
  const viewingOwn = accountId === 'me'
  const selected = accounts.find((a) => String(a.id) === String(accountId))
  // A selected account that is not in the list (a stale picker, a list that
  // failed to load) still has to be named, so the id is the last resort - never
  // a blank where a client's name belongs.
  const subjectName = viewingOwn
    ? (user?.name || user?.email || 'Mi cuenta')
    : (selected?.name || selected?.email || `Cuenta #${accountId}`)
  const subjectEmail = viewingOwn ? (user?.name ? user?.email : '') : (selected?.name ? selected?.email : '')
  // How the account is named inside a sentence. A CLIENT keeps the wording it
  // has today, word for word, because nothing about its page changed.
  const subjectPhrase = !canManage ? 'Esta cuenta' : viewingOwn ? 'Tu cuenta' : subjectName
  // Do the rows on hand belong to the account named above them? Everything that
  // describes an account — the table, the totals, both empty states — is gated
  // on this, so the answer to "whose invoices are these" is the same in every
  // place on the page or the page shows none of them.
  const describesSelection = String(data.subject) === String(accountId)

  // THE ISSUER'S REAL RATES, off the profile the panel above loaded — never a
  // hardcoded 27. The tax follows `taxEnabled` exactly as buildInvoiceData does:
  // a profile with a rate stored but the tax switched off shows no tax row, so
  // the wording must not promise one.
  const manualRetentionRate = Number(issuerForm.retentionRate) || 0
  const manualTaxRate = issuerForm.taxEnabled ? (Number(issuerForm.taxRate) || 0) : 0
  const manualAmount = amountOrNull(manualForm.amount)
  const manualPreview = manualAmount === null
    ? null
    : previewOf(manualAmount, manualTaxRate, manualRetentionRate)
  // Does ticking the box change anything at all? With neither rate configured
  // the two states produce the same document, and saying so is more honest than
  // an example in which both columns read the same figure.
  const manualRatesExist = manualRetentionRate > 0 || manualTaxRate > 0
  // "18% de ITBIS y 27% de RETENCIÓN", or either half alone. Built here rather
  // than as a chain of ternaries inside the JSX: a sentence assembled in three
  // conditional fragments is a sentence nobody can check by reading it.
  const manualRatePhrase = [
    manualTaxRate > 0 ? `${manualTaxRate}% de ${issuerForm.taxLabel || 'impuesto'}` : null,
    manualRetentionRate > 0 ? `${manualRetentionRate}% de ${issuerForm.retentionLabel || 'retención'}` : null,
  ].filter(Boolean).join(' y ')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Facturas{canManage && <span className="text-gray-400 dark:text-gray-500 font-normal"> · {subjectName}</span>}
        </h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          {canManage && !viewingOwn
            ? 'Cada pago confirmado de esta cuenta lleva su factura. Ábrela para verla o descargarla en PDF.'
            : 'Cada pago confirmado lleva su factura. Ábrela para verla o descargarla en PDF.'}
        </p>
      </div>

      {/* Whose payments to list. Only a manager sees this: the OWNER has no
          payments of his own and a partner's clients are the ones who paid, so
          for both of them their own list is empty and there is nothing to
          invoice from. */}
      {canManage && (
        <div className="mb-6">
          <div className="max-w-md">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cuenta</label>
            <select
              value={accountId}
              onChange={(e) => selectAccount(e.target.value)}
              className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
            >
              <option value="me">Mi cuenta ({user?.name || user?.email})</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email} · {a.role}
                </option>
              ))}
            </select>
            {accountsError && (
              <p className="mt-2 text-xs text-red-600 dark:text-red-400">{accountsError}</p>
            )}
          </div>

          {/* The one line that has to be impossible to miss: every «Emitir
              factura» button below signs a document in this account's name. Not
              a subtle dropdown value - a banner, with the name and the email,
              in the same amber the page uses for "act on this". */}
          {!viewingOwn ? (
            <div className="mt-3 px-4 py-3 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                Estás viendo y emitiendo las facturas de <strong>{subjectName}</strong>
                {subjectEmail ? <span className="font-normal"> ({subjectEmail})</span> : null}, no las tuyas.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
              Estás viendo <strong className="font-semibold text-gray-700 dark:text-gray-300">tu propia cuenta</strong>.
              Elige otra arriba para ver y emitir sus facturas.
            </p>
          )}
        </div>
      )}

      {/* RAISE ONE BY HAND. Above the payments table and above the issuer
          panel, because it is the one thing on this page somebody arrives
          wanting to DO rather than read — and because when the table is empty
          (a client that has never paid) this is the only way to invoice it at
          all. */}
      {canCreateManual && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={toggleManual}
              className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              {manualOpen ? 'Cancelar' : 'Crear factura a mano'}
            </button>
            {!manualOpen && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Para cobrar algo que no se pagó por la plataforma: eliges el cliente y escribes el monto.
              </span>
            )}
          </div>

          {manualOpen && (
            <div className="mt-3 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-4">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Esta factura no lleva ningún pago detrás: toma el siguiente número de <strong>tu</strong> numeración
                y se emite con <strong>tus</strong> datos de emisor. No registra nada como cobrado.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Cliente</label>
                  <select
                    value={manualForm.userId}
                    onChange={(e) => setManualForm(f => ({ ...f, userId: e.target.value }))}
                    className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="">Elige el cliente…</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.name || a.email} · {a.role}</option>
                    ))}
                  </select>
                  {/* Without a list there is nothing to pick, and the reason is
                      worth stating: the form is not broken. */}
                  {accounts.length === 0 && (
                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                      {accountsError || 'No hay cuentas que puedas facturar.'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Monto (total a pagar)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={manualForm.amount}
                    onChange={(e) => setManualForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="1600.00"
                    className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Lo que el cliente tiene que pagar. Es el <strong>TOTAL A PAGAR</strong> de la factura, no el neto.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fecha</label>
                  <input
                    type="date"
                    value={manualForm.paidAt}
                    onChange={(e) => setManualForm(f => ({ ...f, paidAt: e.target.value }))}
                    className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    La que se imprime como «Fecha:» en el documento.
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Concepto</label>
                  <input
                    type="text"
                    maxLength={300}
                    value={manualForm.concept}
                    onChange={(e) => setManualForm(f => ({ ...f, concept: e.target.value }))}
                    placeholder={DEFAULT_CONCEPT_HINT}
                    className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                  />
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    La línea de DESCRIPCIÓN. Si lo dejas vacío se usa el concepto de recarga de saldo.
                  </p>
                </div>
              </div>

              {/* THE BOX, SAYING WHAT IT DOES WITH THE ISSUER'S OWN RATES —
                  never a percentage invented here. Both outcomes are spelled
                  out, with the typed figure worked through when there is one,
                  because "con o sin impuestos" is the one decision on this form
                  that changes what the client receives. */}
              <div className="rounded-lg border border-gray-200 dark:border-dark-border p-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={manualForm.applyTaxes}
                    onChange={(e) => setManualForm(f => ({ ...f, applyTaxes: e.target.checked }))}
                    className="mt-1"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Aplicar mis impuestos y retención a esta factura
                  </span>
                </label>

                <div className="mt-3 text-xs space-y-2 text-gray-600 dark:text-gray-400">
                  {!issuerLoaded ? (
                    <p>Cargando tus tasas…</p>
                  ) : !manualRatesExist ? (
                    <p>
                      No tienes impuesto ni retención configurados, así que marcarla o no <strong>da el mismo
                      documento</strong>: la factura dirá {manualAmount === null ? 'el monto que escribas' : money(manualAmount)} y
                      nada más. Puedes cambiar tus tasas en «Datos de facturación», abajo.
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>Marcada:</strong> se aplican tus tasas ({manualRatePhrase}).
                        {manualPreview ? (
                          <> La factura dirá <strong>NETO {money(manualPreview.subtotal)}</strong>
                            {manualPreview.taxAmount > 0 ? <> · {issuerForm.taxLabel || 'impuesto'} {money(manualPreview.taxAmount)}</> : null}
                            {manualPreview.retention > 0 ? <> · {issuerForm.retentionLabel || 'RETENCIÓN'} −{money(manualPreview.retention)}</> : null}
                            {' '}· <strong>TOTAL A PAGAR {money(manualPreview.total)}</strong>.
                          </>
                        ) : ' Escribe el monto para ver las cifras exactas.'}
                      </p>
                      <p>
                        <strong>Sin marcar:</strong> no se aplica ningún impuesto ni retención. La factura dirá
                        {manualAmount === null ? ' el monto que escribas' : <> <strong>NETO {money(manualAmount)}</strong> y <strong>TOTAL A PAGAR {money(manualAmount)}</strong></>},
                        y las líneas de impuesto y retención van sin cifra.
                      </p>
                      <p className="text-gray-500 dark:text-gray-500">
                        En los dos casos el cliente paga los {manualAmount === null ? 'que escribas' : money(manualAmount)}:
                        lo que cambia es cómo se desglosa en el documento. Las cifras de arriba son una vista previa;
                        las definitivas son las del documento, que se abre en cuanto se cree.
                      </p>
                    </>
                  )}
                </div>
              </div>

              {manualError && (
                <p className="text-sm text-red-600 dark:text-red-400">{manualError}</p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setManualOpen(false); setManualError('') }}
                  className="px-4 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  Cancelar
                </button>
                <button
                  onClick={createManual}
                  disabled={manualSaving}
                  className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {manualSaving ? 'Creando…' : 'Crear y ver la factura'}
                </button>
              </div>
            </div>
          )}

          {/* What was just raised, so the number stays reachable after the
              document is closed — the table below lists payments and cannot
              show any of these. */}
          {manualCreated.length > 0 && (
            <div className="mt-3 rounded-lg border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card p-3">
              <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                Facturas creadas a mano en esta sesión
              </p>
              <ul className="mt-2 space-y-1">
                {manualCreated.map(({ invoice: created, clientName }) => (
                  <li key={created.id} className="flex flex-wrap items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                    <button
                      onClick={() => setInvoice(created)}
                      className="px-2 py-1 font-medium rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 hover:underline"
                    >
                      {created.number}
                    </button>
                    <span>{clientName} · {money(created.total)} · {fmtDate(created.paidAt)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-gray-400 dark:text-gray-500">
                Esta lista es solo de esta sesión; las facturas quedan guardadas igual.
              </p>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm">{error}</div>
      )}
      {notice && (
        <div className="mb-4 px-4 py-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 text-sm">{notice}</div>
      )}

      {/* The issuer side of invoicing, for the partner that issues. Above the
          payments table on purpose: when the tax is off there is no table, and
          this panel is the thing to act on. Independent of `loading`, so it is
          reachable even if the payments list failed.

          IT IS THE VIEWER'S OWN PROFILE AND NOTHING ELSE. It does not move when
          the picker does, and it says so on screen whenever another account is
          selected, because a form that looked like the selected client's would
          invite a manager to rewrite that client's RNC and numbering. */}
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
              {canManage && !viewingOwn && (
                <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Son <strong>tus</strong> datos de emisor, no los de {subjectName}: la cuenta elegida arriba solo
                  cambia qué pagos se listan.
                </span>
              )}
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

      {/* Also while an answer on hand belongs to the account just left: there
          is nothing honest to show until the current one lands. */}
      {(loading || !describesSelection) && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      )}

      {/* The account does not bill with tax, so it has no invoices and never
          will. The menu hides this entry for exactly these accounts; landing
          here by URL has to say so plainly instead of showing an empty table
          that reads as "nothing yet". */}
      {loaded && !loading && describesSelection && !data.billsWithTax && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center">
          <p className="text-sm text-gray-700 dark:text-gray-300">{subjectPhrase} no emite facturas.</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            {!canManage || !viewingOwn ? 'Sus pagos' : 'Tus pagos'} no se facturan con impuesto, así que no hay
            documentos que mostrar aquí.
            {viewingOwn && ' Tu consumo y tus períodos siguen estando en «Períodos y reportes».'}
          </p>
          {/* For a partner this is not a dead end: the switch that changes it
              is the panel right above, on this same page — and it is the
              partner's OWN switch that decides this for the subtree under it,
              which is why the wording points at «tu impuesto» even when
              somebody else's account is on screen. */}
          {canConfigureIssuer && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
              Si eres tú quien {viewingOwn ? 'factura a tus clientes' : `factura a ${subjectName}`}, enciende el
              impuesto en <strong>«Datos de facturación»</strong> arriba.
            </p>
          )}
        </div>
      )}

      {loaded && !loading && describesSelection && data.billsWithTax && (
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
                        {viewingOwn ? 'Todavía no hay pagos.' : `${subjectName} todavía no tiene pagos.`} Cuando se
                        haga el primero, su factura aparecerá aquí.
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

      {/* The document itself, with its PDF download — and, for the roles that
          may, the «Regenerar factura» action beside it. Passing nothing is what
          hides that button for a CLIENT. */}
      {invoice && (
        <InvoiceDocument
          invoice={invoice}
          onClose={() => setInvoice(null)}
          onRegenerate={canRegenerate ? regenerateOpenInvoice : undefined}
        />
      )}
    </div>
  )
}
