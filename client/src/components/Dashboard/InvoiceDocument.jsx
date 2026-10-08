import { useState } from 'react'

// The invoice, in the format the partner's accountant already works with.
//
// EVERYTHING ON THIS PAGE COMES OFF THE INVOICE ROW. `invoice.issuer` and
// `invoice.client` are snapshots frozen at issue time, and that is the whole
// point of them: an invoice issued in March must keep saying what it said in
// March after the issuer changes its RNC and after the client's account is
// deleted. So this component looks NOTHING up — no account context, no branding
// hook, no live profile — and anything added to it later must do the same.
//
// THE DOCUMENT IS STYLED INLINE, on purpose. The PDF is the rendered node
// printed by html2pdf.js, and inline styles survive that regardless of how
// Tailwind's build happens to be purged or themed — the client receives exactly
// what the screen showed. Only the chrome around the document (the modal, the
// buttons) uses the app's classes.

const INK = '#111827'
const MUTED = '#4b5563'

// The document's accent: the rule beside the issuer, the invoice number, the
// two bands and the footer line. Black, matching the ink the rest of the page
// is set in, so a printed invoice needs no colour to read correctly.
const ACCENT = INK

// The printed format is a spreadsheet, so a one-line invoice still has the
// height of a full page of rows. Blank ruled rows make up the difference.
const TABLE_ROWS = 8

// `USD 0.00`. The currency comes off the invoice, not from a setting.
const money = (n, currency) => `${currency || 'USD'} ${(Number(n) || 0).toFixed(2)}`

// DD/MM/AAAA, assembled by hand rather than through toLocaleDateString: the
// document's format must not change with the reader's browser locale.
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// 27 prints as "27", never "27.00".
const rateOf = (n) => String(Number(n) || 0)

// To the cent, so 127 - 100 is 27.00 and never 26.999999999999996. Only ever
// used on two numbers that are already frozen cent values on the invoice row.
const toCent = (n) => Math.round((Number(n) || 0) * 100) / 100

// Under a cent is nothing to chase on a fiscal document.
const CENT = 0.01

// The rate that produced `amount` off `subtotal`, as the issuer typed it — for
// the RETENCIÓN row, whose rate the invoice does not store (only its amount).
//
// Dividing the amount back out lands NEAR the rate and not on it, because the
// amount was rounded to the cent when it was stored: 591.78 / 2191.78 is
// 26.99998%, and 4.62 / 17.12 is 26.9859%. Printing either of those would put a
// rate nobody configured on a fiscal document. So the fewest decimals that
// REPRODUCE the stored amount to the cent wins — 27 before 27.0 before 27.04 —
// which is exact for any whole or one-decimal rate on a subtotal of $10 or
// more (swept, 0 mismatches). A two-decimal rate under about $100 can come out
// rounded to the tenth; `rounded` is deliberately the same half-up-at-15-digits
// rounding the server stored the amount with, so the comparison is the server's
// own and not an approximation of it.
//
// Returns 0 when the subtotal is too small for the amount to pin the rate down
// at all, and the caller then prints no rate rather than a wrong one.
const rateFromAmount = (amount, subtotal) => {
  const net = Number(subtotal) || 0
  const amt = Number(amount) || 0
  if (net < 10 || amt <= 0) return 0
  const rounded = (n) => Math.round(Number((n * 100).toPrecision(15))) / 100
  const raw = (amt / net) * 100
  for (const step of [1, 10, 100]) {
    const candidate = Math.round(raw * step) / step
    if (rounded((net * candidate) / 100) === amt) return candidate
  }
  return Math.round(raw * 100) / 100
}

// What the person is agreeing to before an invoice is rebuilt.
//
// Spelled out rather than summarised as "¿Seguro?": the number stays, the data
// is taken again from the configuration as it is NOW, and somebody may already
// be holding the previous copy of that same number. That last point is the one
// that cannot be discovered afterwards, so it is the one that has to be said.
const confirmRegenerate = (number) => [
  `Se va a volver a generar la factura ${number || ''} con los datos de la configuración actual.`,
  '',
  '· Conserva el mismo número y la misma fecha de expedición.',
  '· Los datos del emisor, los del cliente y los importes se toman de nuevo, tal como están configurados hoy.',
  '· Quien ya tenga la copia anterior verá un documento distinto con el mismo número. La factura quedará marcada como regenerada con la fecha de hoy, para poder distinguir las dos copias.',
  '',
  '¿Continuar?',
].join('\n')

const S = {
  page: {
    background: '#ffffff',
    color: INK,
    padding: '28px 30px',
    fontFamily: 'Arial, Helvetica, sans-serif',
    fontSize: '12px',
    lineHeight: 1.4,
    width: '100%',
    boxSizing: 'border-box',
  },
  label: { color: MUTED, fontSize: '11px' },
  cell: { padding: '7px 8px', fontSize: '12px' },
}

// Put the logo into the page as a data URI before printing.
//
// html2canvas draws the document onto a canvas, and a canvas refuses to export
// an image loaded from another origin unless that origin allowed it — which is
// why a pasted logo shows on screen and then vanishes from the PDF. Fetching the
// bytes ourselves and inlining them sidesteps the rule entirely: a data URI has
// no origin to object. The fetch still needs the host's permission, so when even
// that is refused we report it rather than handing over a logo-less invoice and
// letting the client wonder.
//
// Returns { failed, restore } — restore always puts the original src back, so a
// second download does not inherit a half-swapped node.
async function embedLogo(node) {
  const img = node.querySelector('img[data-invoice-logo]')
  const src = img?.getAttribute('src') || ''
  if (!img || !src || src.startsWith('data:')) return { failed: false, restore: () => {} }

  try {
    const res = await fetch(src, { mode: 'cors', credentials: 'omit' })
    if (!res.ok) throw new Error(String(res.status))
    const blob = await res.blob()
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
    // Wait for the swapped image to actually decode, or html2canvas photographs
    // the gap between the two sources.
    await new Promise((resolve) => {
      img.onload = resolve
      img.onerror = resolve
      img.src = dataUrl
    })
    return { failed: false, restore: () => { img.src = src } }
  } catch {
    return { failed: true, restore: () => { img.src = src } }
  }
}

// A `Label: value` line, as every block of this document is built from.
function Field({ label, value }) {
  return (
    <div style={{ marginBottom: '3px' }}>
      <span style={{ ...S.label, fontWeight: 'bold' }}>{label}</span>{' '}
      <span>{value || ''}</span>
    </div>
  )
}

function Site({ site }) {
  if (!site) return null
  return (
    <div>
      {site.name ? <div style={{ fontWeight: 'bold', marginBottom: '2px' }}>{site.name}</div> : null}
      {site.phone ? <div><span style={S.label}>Teléfono:</span> {site.phone}</div> : null}
      {site.city ? <div>{site.city}</div> : null}
      {site.address ? <div>{site.address}</div> : null}
    </div>
  )
}

/**
 * `onRegenerate` is optional and is what puts the «Regenerar factura» button in
 * the chrome: absent, there is no button at all. It is a prop and not a role
 * check or an API call made here, because this component still looks NOTHING
 * up — the caller is the one that knows who is looking and owns the `invoice`
 * it passes, so it is also the one that can hand back the rebuilt document and
 * have the open modal show it immediately.
 *
 * Contract: it resolves to undefined, or to a note worth showing next to the
 * button, and it THROWS an Error whose message is already in Spanish when the
 * rebuild failed. No HTTP shape reaches this file.
 */
export default function InvoiceDocument({ invoice, onClose, onRegenerate }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [notice, setNotice] = useState('')

  if (!invoice) return null

  const issuer = invoice.issuer || {}
  const client = invoice.client || {}
  const lines = Array.isArray(invoice.lines) ? invoice.lines : []
  const currency = invoice.currency
  const blanks = Math.max(0, TABLE_ROWS - lines.length)
  const hasTax = invoice.taxAmount > 0
  const hasRetention = invoice.retention > 0
  // THE RETENCIÓN'S RATE IS DERIVED FROM ITS AMOUNT, because there is no column
  // for it: Invoice freezes the retention AMOUNT, and the issuer's
  // `retentionRate` lives on the profile, which this component must never read
  // (see the file header — everything on this page comes off the invoice row,
  // so a document issued at 27% keeps saying 27% after the issuer moves to
  // 30%). rateFromAmount recovers the figure that was typed; below a $10
  // subtotal a single cent of rounding is more than a tenth of a percentage
  // point, so the amount no longer pins the rate down and the rate is LEFT OFF
  // rather than guessed — the row then prints its amount alone, which is what
  // the format did before this.
  const retentionRate = hasRetention ? rateFromAmount(invoice.retention, invoice.subtotal) : 0
  const showRetentionRate = retentionRate > 0

  // WHAT WAS ACTUALLY COLLECTED, when the row records it.
  //
  // An issuer can show the tax on its invoices without charging it to the
  // client (BillingProfile.chargeTaxToClient), and then this document asks for
  // $127 while $100 came in. A page claiming $127 is payable with no hint that
  // $100 already arrived is the thing to avoid, so the shortfall is printed
  // below, in the document itself — not in a tooltip, not in the modal chrome —
  // and therefore in the PDF too, since the PDF is this node.
  //
  // `amountPaid` null means UNKNOWN (an invoice issued before the column
  // existed), not zero: nothing is printed for it rather than claiming the
  // whole total is outstanding.
  const paid = invoice.amountPaid === null || invoice.amountPaid === undefined
    ? null
    : toCent(invoice.amountPaid)
  const outstanding = paid === null ? 0 : toCent(invoice.total - paid)
  // Only when money is genuinely missing. A fully-paid invoice prints exactly
  // what it always printed.
  //
  // WITH A RETENCIÓN THIS GOES QUIET, AND IT DOES SO BY ARITHMETIC NOW, NOT BY
  // luck. The money the client paid IS the TOTAL A PAGAR — the net above it is
  // grossed up from it, see services/invoiceService.js — so a $100 purchase
  // retained at 27% prints TOTAL NETO 136.99 / RETENCIÓN −36.99 / TOTAL A PAGAR
  // 100.00 against 100 collected: `outstanding` is exactly 0 and no band is
  // printed. Nothing is printed in its place either, and there is nothing to
  // print: every dollar on the page is accounted for, and the 36.99 is withheld
  // out of the net rather than owed by or to anybody.
  const showShortfall = paid !== null && outstanding >= CENT

  // The PDF is this very node printed, so what the client receives and what the
  // screen shows can never drift apart. Same pattern as the period report.
  const downloadPdf = async () => {
    const node = document.getElementById('invoice-document')
    if (!node) return
    setBusy(true)
    setError('')
    const logo = await embedLogo(node)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf().set({
        margin: 8,
        filename: `${String(invoice.number || 'factura').replace(/[^\w\s-]/g, '')}.pdf`,
        // useCORS is the second chance: it lets html2canvas draw a cross-origin
        // image when the host sends the headers. embedLogo above is the first
        // and better one, because a data URI needs no permission at all.
        html2canvas: { scale: 2, backgroundColor: '#ffffff', useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(node).save()
      // Said only after the file is saved, so it reads as a note about the PDF
      // the client just got rather than as a failure to produce one.
      if (logo.failed) {
        setError('El PDF se descargó sin el logo: el servidor donde está alojado no permite incrustarlo. Súbelo a un sitio que lo permita, o déjalo vacío para que la factura salga solo con el nombre.')
      }
    } catch {
      setError('No se pudo generar el PDF')
    } finally {
      logo.restore()
      setBusy(false)
    }
  }

  // Rebuild this document from the configuration as it stands now, keeping its
  // number. Confirmed first, and in words: it overwrites a document somebody
  // may already be holding, which is the one consequence that cannot be
  // undone afterwards.
  const regenerate = async () => {
    if (!onRegenerate || regenerating) return
    if (!window.confirm(confirmRegenerate(invoice.number))) return
    setRegenerating(true)
    setError('')
    setNotice('')
    try {
      // The caller replaces the `invoice` prop with the rebuilt one, so what is
      // on screen is the new document the moment this resolves — never the
      // stale copy next to a "listo" message.
      const note = await onRegenerate()
      if (note) setNotice(note)
    } catch (err) {
      setError(err?.message || 'No se pudo regenerar la factura')
    } finally {
      setRegenerating(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 overflow-y-auto" onClick={onClose}>
      <div
        className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-3xl my-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Chrome — the app's own styling, unlike the document itself */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-dark-border">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">
              Factura {invoice.number}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">{fmtDate(invoice.issuedAt)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* In the chrome, beside «Descargar PDF» — where somebody looking
                at a wrong invoice reaches for it — and deliberately NOT inside
                the printed node below, which has to stay exactly what it
                prints. */}
            {onRegenerate && (
              <button
                onClick={regenerate}
                disabled={regenerating || busy}
                title="Vuelve a generar esta factura con los datos actuales, conservando su número"
                className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
              >
                {regenerating ? 'Regenerando…' : 'Regenerar factura'}
              </button>
            )}
            <button
              onClick={downloadPdf}
              disabled={busy}
              className="px-3 py-1.5 text-xs bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {busy ? 'Generando…' : 'Descargar PDF'}
            </button>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
            >
              Cerrar
            </button>
          </div>
        </div>

        {error && (
          <p className="px-5 pt-3 text-xs text-red-600 dark:text-red-400">{error}</p>
        )}

        {/* Not a failure: the rebuild went through and there is something about
            it worth knowing (its amounts could not be recomputed, for one). */}
        {notice && (
          <p className="px-5 pt-3 text-xs text-amber-700 dark:text-amber-400">{notice}</p>
        )}

        {/* The document. White and inline-styled in both themes — it is a
            printed page, not a panel screen. */}
        <div className="p-3 sm:p-5 overflow-x-auto">
          <div id="invoice-document" style={S.page}>
            {/* Header: the brand on the left, the legal issuer on the right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ flex: '1 1 0', display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                {issuer.logoUrl ? (
                  // data-invoice-logo is how embedLogo finds this image to
                  // inline it before printing; no crossOrigin here on purpose,
                  // since that would stop it displaying on screen for exactly
                  // the hosts that need the inlining.
                  <img data-invoice-logo src={issuer.logoUrl} alt="" style={{ height: '58px', width: 'auto', maxWidth: '150px', objectFit: 'contain' }} />
                ) : null}
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '26px', fontWeight: 'bold', lineHeight: 1.1, color: INK }}>
                    {issuer.brandName || ''}
                  </div>
                  {issuer.slogan ? (
                    <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>{issuer.slogan}</div>
                  ) : null}
                </div>
              </div>
              <div style={{ borderLeft: `3px solid ${ACCENT}`, paddingLeft: '14px', textAlign: 'right', minWidth: '190px' }}>
                <div style={{ fontWeight: 'bold', fontSize: '13px' }}>{issuer.issuerName || ''}</div>
                <div style={{ fontSize: '11px', color: MUTED, marginTop: '3px' }}>
                  RNC / ID: {issuer.issuerRnc || ''}
                </div>
              </div>
            </div>

            {/* The invoice's own number */}
            <div style={{ marginTop: '18px', fontSize: '22px', fontWeight: 'bold', color: ACCENT }}>
              NO. {invoice.number || ''}
            </div>

            {/* Who it is for, and when it is due */}
            <div style={{ display: 'flex', gap: '24px', marginTop: '14px' }}>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                <Field label="Empresa:" value={client.company} />
                <Field label="RNC:" value={client.rnc} />
                <Field label="Dirección:" value={client.address} />
                <Field label="Ciudad:" value={client.city} />
                <Field label="Teléfono:" value={client.phone} />
              </div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                {/* THE ONLY DATE ON THE DOCUMENT, by the issuer's decision.
                    Expedición, condiciones de pago and vencimiento were dropped:
                    every invoice here is raised for a payment that has already
                    been collected, so a due date and payment terms describe an
                    obligation that never existed. One date that is true beats
                    three that invite the question of why the money arrived
                    before it was owed.

                    `issuedAt` and `dueAt` are still stored and still drive the
                    numbering sequence and the profile's dueDays - they simply
                    are not printed.

                    Omitted entirely when there is nothing to show - an invoice
                    issued before the column existed, or one whose payment was
                    since deleted - rather than printing a label with a blank
                    after it. */}
                {invoice.paidAt ? (
                  <Field label="Fecha de pago:" value={fmtDate(invoice.paidAt)} />
                ) : null}
                {/* Printed next to the issue date, and therefore in the PDF:
                    this document was rebuilt after it was first issued, so a
                    copy of the same number may be in somebody's hands saying
                    something else. Absent on an invoice never regenerated,
                    which is almost all of them. */}
                {invoice.regeneratedAt ? (
                  <Field label="Regenerada el:" value={fmtDate(invoice.regeneratedAt)} />
                ) : null}
              </div>
            </div>

            {/* What is being charged */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '16px' }}>
              <thead>
                <tr>
                  <th style={{
                    ...S.cell,
                    textAlign: 'left',
                    fontWeight: 'bold',
                    borderTop: `2px solid ${INK}`,
                    borderBottom: `2px solid ${INK}`,
                  }}>
                    DESCRIPCIÓN
                  </th>
                  <th style={{
                    ...S.cell,
                    textAlign: 'right',
                    fontWeight: 'bold',
                    width: '140px',
                    borderTop: `2px solid ${INK}`,
                    borderBottom: `2px solid ${INK}`,
                  }}>
                    TOTAL
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => (
                  <tr key={`line-${i}`}>
                    <td style={{ ...S.cell, borderBottom: '1px solid #d1d5db' }}>{line.description || ''}</td>
                    <td style={{ ...S.cell, borderBottom: '1px solid #d1d5db', textAlign: 'right' }}>
                      {money(line.total, currency)}
                    </td>
                  </tr>
                ))}
                {/* Blank ruled rows, so one line keeps the printed format's height */}
                {Array.from({ length: blanks }).map((_, i) => (
                  <tr key={`blank-${i}`}>
                    <td style={{ ...S.cell, borderBottom: '1px solid #d1d5db' }}>&nbsp;</td>
                    <td style={{ ...S.cell, borderBottom: '1px solid #d1d5db' }}>&nbsp;</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* The totals, right-aligned under the TOTAL column */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
              <table style={{ borderCollapse: 'collapse', minWidth: '300px' }}>
                <tbody>
                  <tr>
                    <td style={{ ...S.cell, fontWeight: 'bold' }}>TOTAL NETO</td>
                    <td style={{ ...S.cell, textAlign: 'right', width: '140px' }}>{money(invoice.subtotal, currency)}</td>
                  </tr>
                  {/* Only when a tax was actually charged — an untaxed invoice
                      must not print an empty tax row. */}
                  {hasTax && (
                    <tr>
                      <td style={{ ...S.cell, fontWeight: 'bold' }}>
                        {(invoice.taxLabel || 'ITBIS')} ({rateOf(invoice.taxRate)}%)
                      </td>
                      <td style={{ ...S.cell, textAlign: 'right' }}>{money(invoice.taxAmount, currency)}</td>
                    </tr>
                  )}
                  {/* THE RETENCIÓN IS SUBTRACTED, and the row has to say so.
                      The printed format keeps this row whether or not there is
                      a retention, so it stays here and goes blank — but when
                      there IS one it is signed, because it sits directly under
                      a tax row that ADDS and an unsigned figure in the same
                      column would read as a second charge. The label carries
                      the rate the same way the tax row does.

                      THE NAME COMES OFF THE INVOICE, not off the issuer's
                      profile: the withholding is remitted on a numbered form
                      and the issuer may change forms, so the document keeps
                      the name it was issued under. Absent — every invoice
                      issued before the column existed — is the old literal. */}
                  <tr>
                    <td style={{ ...S.cell, fontWeight: 'bold' }}>
                      {(invoice.retentionLabel || 'RETENCIÓN')}{showRetentionRate ? ` (${rateOf(retentionRate)}%)` : ''}
                    </td>
                    <td style={{ ...S.cell, textAlign: 'right' }}>
                      {hasRetention ? `− ${money(invoice.retention, currency)}` : ''}
                    </td>
                  </tr>
                  <tr>
                    <td style={{ ...S.cell, fontWeight: 'bold', background: ACCENT, color: '#ffffff' }}>TOTAL A PAGAR</td>
                    <td style={{ ...S.cell, textAlign: 'right', fontWeight: 'bold', background: ACCENT, color: '#ffffff' }}>
                      {money(invoice.total, currency)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Some of the TOTAL A PAGAR above was never collected. Said here,
                immediately under the figure it contradicts, because that is the
                one place a reader cannot skip on the way to the total. Bordered
                rather than filled so it prints legibly in black and white and
                does not read as a third orange band. */}
            {showShortfall && (
              <div style={{
                marginTop: '10px',
                border: `2px solid ${ACCENT}`,
                padding: '8px 10px',
                fontSize: '11px',
                color: INK,
              }}>
                <div style={{ fontWeight: 'bold' }}>
                  RECIBIDO: {money(paid, currency)} · PENDIENTE: {money(outstanding, currency)}
                </div>
                <div style={{ marginTop: '3px' }}>
                  De los {money(invoice.total, currency)} de esta factura ya se recibieron{' '}
                  {money(paid, currency)}. Quedan {money(outstanding, currency)} por cobrar.
                </div>
              </div>
            )}

            {/* The amount spelled out, as the format requires */}
            <div style={{
              marginTop: '14px',
              background: ACCENT,
              color: '#ffffff',
              padding: '8px 10px',
              fontWeight: 'bold',
              fontSize: '11px',
            }}>
              TOTAL A PAGAR EN LETRAS: {invoice.totalInWords || ''}
            </div>

            {/* Where to send the money */}
            <div style={{ marginTop: '14px', textAlign: 'center', fontSize: '11px' }}>
              <div>
                Consignar en la cuenta {issuer.bankAccount || ''} SWIFT {issuer.swift || ''} número de ruta{' '}
                {issuer.routingNumber || ''} - Banco {issuer.bankName || ''}
              </div>
              {issuer.paymentMethod ? (
                <div style={{ marginTop: '3px' }}>
                  El pago debe realizarse mediante la modalidad {issuer.paymentMethod}
                </div>
              ) : null}
            </div>

            {/* Where the issuer can be found */}
            <div style={{
              display: 'flex',
              gap: '18px',
              marginTop: '18px',
              paddingTop: '10px',
              borderTop: `2px solid ${ACCENT}`,
              fontSize: '11px',
            }}>
              <div style={{ flex: '1 1 0', minWidth: 0 }}><Site site={issuer.site1} /></div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}><Site site={issuer.site2} /></div>
              <div style={{ flex: '1 1 0', minWidth: 0 }}>
                {issuer.contactEmail ? <div><span style={S.label}>Email:</span> {issuer.contactEmail}</div> : null}
                {issuer.contactWeb ? <div>{issuer.contactWeb}</div> : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
