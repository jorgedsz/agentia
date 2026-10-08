// THE INVOICE AS A PLAIN HTML STRING — A SECOND COPY OF A DOCUMENT THAT
// ALREADY EXISTS, AND THE ONE THING THAT MUST NOT HAPPEN TO IT IS DRIFT.
//
// The first copy is client/src/components/Dashboard/InvoiceDocument.jsx. That
// one is what the client sees on screen and what html2pdf.js prints into the
// PDF; this one is what gets emailed. They are the same document for the same
// payer, so a change to either without the other produces two invoices bearing
// one number that do not say the same thing — which on a fiscal document is
// worse than no email at all.
//
// WHY THERE ARE TWO AT ALL: the first is React with inline styles and cannot be
// required from Node (JSX, ESM, and a `useState`/`window.confirm` modal wrapped
// around it). Rendering it server-side would mean a JSX toolchain in the API
// process for one email. So it is hand-mirrored here instead, and the mirroring
// is made CHECKABLE rather than promised:
//
//   · tests/invoiceHtml.test.js compares the set of invoice / issuer / client
//     FIELDS each file reads. Add `invoice.foo` to the React document and the
//     test fails until this file reads it too (or the field is listed there as
//     chrome that is deliberately not printed). That catches the drift that
//     actually happens — a field added to one page and forgotten on the other.
//   · it cannot catch restyling. A colour or a padding changed on one side
//     stays a human responsibility, which is why this notice is at the top of
//     the file somebody editing it has to scroll past.
//
// EVERYTHING HERE COMES OFF THE INVOICE ROW, exactly as in the React copy:
// `issuer` and `client` are the snapshots frozen at issue time and nothing is
// looked up. An invoice issued in March must keep saying what it said in March
// after the issuer changes its RNC and after the client's account is deleted.
//
// INLINE STYLES ONLY, and this time not for html2canvas but because email
// clients drop <style> blocks and every external stylesheet. Same reason, same
// result: no class attribute appears anywhere below.
//
// Input is the PRESENTED shape — what controllers/invoiceController.js
// `present()` returns and what the React component receives as its `invoice`
// prop. Taking the same shape as the other copy is deliberate: it is what lets
// the two be compared field for field, and it keeps the snapshot-parsing in one
// place (present) instead of two.

// ---------------------------------------------------------------------------
// The values the React copy keeps in module constants, re-made here. Each one
// is a VISUAL DECISION and is listed in the file header's drift note: INK and
// MUTED are the two greys the document is set in, ACCENT is the black used for
// the rule beside the issuer, the invoice number, the two bands and the footer
// line, and TABLE_ROWS is why a one-line invoice still has the height of a
// printed page of rows.
// ---------------------------------------------------------------------------
const INK = '#111827';
const MUTED = '#4b5563';
const ACCENT = INK;
const TABLE_ROWS = 8;

// `USD 0.00`. The currency comes off the invoice, not from a setting.
const money = (n, currency) => `${currency || 'USD'} ${(Number(n) || 0).toFixed(2)}`;

// DD/MM/AAAA, assembled by hand rather than through toLocaleDateString — in the
// React copy so the format does not follow the reader's browser locale, here so
// it does not follow the SERVER's locale or timezone default. Both must print
// the same string for the same invoice, which is the only reason this is not
// an Intl.DateTimeFormat call.
//
// NOTE the one unavoidable difference: `new Date(...).getDate()` is local time
// on both sides, so the browser renders the date in the READER's zone and this
// renders it in the server's. For a `paidAt` near midnight UTC the two can name
// adjacent days. That is a property of the existing component, not something
// introduced here; pinning a zone on this side alone would make the emailed
// copy and the downloaded PDF disagree for everybody instead of for the few
// minutes around midnight, so it is left matching the original.
const fmtDate = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// 27 prints as "27", never "27.00".
const rateOf = (n) => String(Number(n) || 0);

// To the cent, so 127 - 100 is 27.00 and never 26.999999999999996.
const toCent = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Under a cent is nothing to chase on a fiscal document.
const CENT = 0.01;

// Everything printed below goes through this. The React copy needs no escaping
// (React escapes its own text nodes); a string-built document does, and an
// issuer's slogan or a client's company name is free text somebody typed.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
}[c]));

/**
 * The rate that produced `amount` off `subtotal`, as the issuer typed it — for
 * the RETENCIÓN row, whose rate the invoice does not store (only its amount).
 *
 * A LINE-FOR-LINE COPY of rateFromAmount in InvoiceDocument.jsx, including the
 * `toPrecision(15)` rounding, which is deliberately the same half-up rounding
 * the server stored the amount with. Read that function's comment for why the
 * fewest decimals that REPRODUCE the stored amount win, and why a subtotal
 * below $10 returns 0 so the caller prints no rate rather than a wrong one.
 */
const rateFromAmount = (amount, subtotal) => {
  const net = Number(subtotal) || 0;
  const amt = Number(amount) || 0;
  if (net < 10 || amt <= 0) return 0;
  const rounded = (n) => Math.round(Number((n * 100).toPrecision(15))) / 100;
  const raw = (amt / net) * 100;
  for (const step of [1, 10, 100]) {
    const candidate = Math.round(raw * step) / step;
    if (rounded((net * candidate) / 100) === amt) return candidate;
  }
  return Math.round(raw * 100) / 100;
};

// The React copy's `S.page` and `S.cell`, as style attributes.
const PAGE = `background:#ffffff;color:${INK};padding:28px 30px;`
  + 'font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.4;width:100%;box-sizing:border-box';
const CELL = 'padding:7px 8px;font-size:12px';
const LABEL = `color:${MUTED};font-size:11px`;

/** A `Label: value` line, as every block of this document is built from. */
const field = (label, value) => `<div style="margin-bottom:3px">`
  + `<span style="${LABEL};font-weight:bold">${esc(label)}</span> `
  + `<span>${esc(value || '')}</span></div>`;

/** One of the two footer sites. Nothing at all when the site is unset. */
const site = (s) => {
  if (!s) return '';
  return [
    s.name ? `<div style="font-weight:bold;margin-bottom:2px">${esc(s.name)}</div>` : '',
    s.phone ? `<div><span style="${LABEL}">Teléfono:</span> ${esc(s.phone)}</div>` : '',
    s.city ? `<div>${esc(s.city)}</div>` : '',
    s.address ? `<div>${esc(s.address)}</div>` : '',
  ].join('');
};

// THE FIELDS THIS DOCUMENT READS, declared rather than inferred.
//
// The drift test regexes the React copy for the fields IT reads and compares
// the two lists. Declaring this side (instead of regexing it too) is what makes
// the comparison meaningful: a field can be listed here only by somebody who
// also wrote the markup that prints it.
const READS = {
  invoice: [
    'number', 'currency', 'subtotal', 'taxLabel', 'taxRate', 'taxAmount',
    'retention', 'retentionLabel', 'total', 'amountPaid', 'totalInWords',
    'paidAt', 'lines', 'issuer', 'client',
  ],
  issuer: [
    'logoUrl', 'brandName', 'slogan', 'issuerName', 'issuerRnc',
    'bankAccount', 'swift', 'routingNumber', 'bankName', 'paymentMethod',
    'site1', 'site2', 'contactEmail', 'contactWeb',
  ],
  client: ['company', 'rnc', 'address', 'city', 'phone'],
  site: ['name', 'phone', 'city', 'address'],
  line: ['description', 'total'],
};

/**
 * The invoice, as one HTML string. Takes the PRESENTED invoice (see the file
 * header) and looks nothing up — pure and synchronous, like the React copy.
 */
function renderInvoiceHtml(invoice) {
  if (!invoice) return '';

  const issuer = invoice.issuer || {};
  const client = invoice.client || {};
  const lines = Array.isArray(invoice.lines) ? invoice.lines : [];
  const currency = invoice.currency;
  const blanks = Math.max(0, TABLE_ROWS - lines.length);
  const hasTax = invoice.taxAmount > 0;
  const hasRetention = invoice.retention > 0;
  // Derived from the amount because there is no column for it — see
  // rateFromAmount above and the long comment on it in the React copy.
  const retentionRate = hasRetention ? rateFromAmount(invoice.retention, invoice.subtotal) : 0;
  const showRetentionRate = retentionRate > 0;

  // What was ACTUALLY collected, when the row records it. Null means UNKNOWN
  // (an invoice issued before the column existed), not zero: nothing is printed
  // for it rather than claiming the whole total is outstanding.
  const paid = invoice.amountPaid === null || invoice.amountPaid === undefined
    ? null
    : toCent(invoice.amountPaid);
  const outstanding = paid === null ? 0 : toCent(invoice.total - paid);
  const showShortfall = paid !== null && outstanding >= CENT;

  const lineRows = lines.map((line) => `
          <tr>
            <td style="${CELL};border-bottom:1px solid #d1d5db">${esc(line.description || '')}</td>
            <td style="${CELL};border-bottom:1px solid #d1d5db;text-align:right">${esc(money(line.total, currency))}</td>
          </tr>`).join('');

  // Blank ruled rows, so one line keeps the printed format's height.
  const blankRows = Array.from({ length: blanks }).map(() => `
          <tr>
            <td style="${CELL};border-bottom:1px solid #d1d5db">&nbsp;</td>
            <td style="${CELL};border-bottom:1px solid #d1d5db">&nbsp;</td>
          </tr>`).join('');

  return `<div style="${PAGE}">
  <!-- Header: the brand on the left, the legal issuer on the right. A TABLE
       and not a flex row, which is the one structural difference from the React
       copy: Outlook renders flexbox as a stacked block, and the header is the
       part of the page where that is most obviously wrong. -->
  <table style="width:100%;border-collapse:collapse"><tr>
    <td style="vertical-align:middle;padding:0">
      ${issuer.logoUrl
    ? `<img src="${esc(issuer.logoUrl)}" alt="" style="height:58px;width:auto;max-width:150px;object-fit:contain;vertical-align:middle;margin-right:12px" />`
    : ''}
      <div style="display:inline-block;vertical-align:middle">
        <div style="font-size:26px;font-weight:bold;line-height:1.1;color:${INK}">${esc(issuer.brandName || '')}</div>
        ${issuer.slogan ? `<div style="font-size:11px;color:${MUTED};margin-top:3px">${esc(issuer.slogan)}</div>` : ''}
      </div>
    </td>
    <td style="vertical-align:middle;border-left:3px solid ${ACCENT};padding:0 0 0 14px;text-align:right;width:190px">
      <div style="font-weight:bold;font-size:13px">${esc(issuer.issuerName || '')}</div>
      <div style="font-size:11px;color:${MUTED};margin-top:3px">RNC / ID: ${esc(issuer.issuerRnc || '')}</div>
    </td>
  </tr></table>

  <!-- The invoice's own number -->
  <div style="margin-top:18px;font-size:22px;font-weight:bold;color:${ACCENT}">NO. ${esc(invoice.number || '')}</div>

  <!-- Who it is for, and the one date on the document -->
  <table style="width:100%;border-collapse:collapse;margin-top:14px"><tr>
    <td style="width:50%;vertical-align:top;padding:0 12px 0 0">
      ${field('Empresa:', client.company)}
      ${field('RNC:', client.rnc)}
      ${field('Dirección:', client.address)}
      ${field('Ciudad:', client.city)}
      ${field('Teléfono:', client.phone)}
    </td>
    <td style="width:50%;vertical-align:top;padding:0 0 0 12px">
      <!-- THE ONLY DATE ON THE DOCUMENT, by the issuer's decision, and
           labelled plainly "Fecha" for the same reason. The value is paidAt —
           when the client's money actually arrived — so anyone changing this
           label should know it is not the issue date, whatever the word on the
           page says. Omitted entirely when there is nothing to show, rather
           than printing a label with a blank after it. regeneratedAt is
           deliberately not printed; see the React copy for the trade. -->
      ${invoice.paidAt ? field('Fecha:', fmtDate(invoice.paidAt)) : ''}
    </td>
  </tr></table>

  <!-- What is being charged -->
  <table style="width:100%;border-collapse:collapse;margin-top:16px">
    <thead>
      <tr>
        <th style="${CELL};text-align:left;font-weight:bold;border-top:2px solid ${INK};border-bottom:2px solid ${INK}">DESCRIPCIÓN</th>
        <th style="${CELL};text-align:right;font-weight:bold;width:140px;border-top:2px solid ${INK};border-bottom:2px solid ${INK}">TOTAL</th>
      </tr>
    </thead>
    <tbody>${lineRows}${blankRows}
    </tbody>
  </table>

  <!-- The totals, right-aligned under the TOTAL column -->
  <table style="width:100%;border-collapse:collapse;margin-top:12px"><tr>
    <td style="text-align:right;padding:0">
      <table style="border-collapse:collapse;min-width:300px;display:inline-table;text-align:left">
        <tbody>
          <tr>
            <td style="${CELL};font-weight:bold">TOTAL NETO</td>
            <td style="${CELL};text-align:right;width:140px">${esc(money(invoice.subtotal, currency))}</td>
          </tr>
          ${hasTax ? `<tr>
            <td style="${CELL};font-weight:bold">${esc(invoice.taxLabel || 'ITBIS')} (${esc(rateOf(invoice.taxRate))}%)</td>
            <td style="${CELL};text-align:right">${esc(money(invoice.taxAmount, currency))}</td>
          </tr>` : ''}
          <!-- THE RETENCIÓN IS SUBTRACTED, and the row says so with a sign
               because it sits under a tax row that ADDS. The printed format
               keeps this row whether or not there is a retention, so it stays
               and goes blank — the React copy does exactly the same, and the
               two documents have to have the same rows. The NAME comes off the
               invoice, never off the issuer's current profile. -->
          <tr>
            <td style="${CELL};font-weight:bold">${esc(invoice.retentionLabel || 'RETENCIÓN')}${showRetentionRate ? ` (${esc(rateOf(retentionRate))}%)` : ''}</td>
            <td style="${CELL};text-align:right">${hasRetention ? `&minus; ${esc(money(invoice.retention, currency))}` : ''}</td>
          </tr>
          <tr>
            <td style="${CELL};font-weight:bold;background:${ACCENT};color:#ffffff">TOTAL A PAGAR</td>
            <td style="${CELL};text-align:right;font-weight:bold;background:${ACCENT};color:#ffffff">${esc(money(invoice.total, currency))}</td>
          </tr>
        </tbody>
      </table>
    </td>
  </tr></table>

  <!-- Some of the TOTAL A PAGAR above was never collected. Said immediately
       under the figure it contradicts, bordered rather than filled so it prints
       legibly in black and white. -->
  ${showShortfall ? `<div style="margin-top:10px;border:2px solid ${ACCENT};padding:8px 10px;font-size:11px;color:${INK}">
    <div style="font-weight:bold">RECIBIDO: ${esc(money(paid, currency))} &middot; PENDIENTE: ${esc(money(outstanding, currency))}</div>
    <div style="margin-top:3px">De los ${esc(money(invoice.total, currency))} de esta factura ya se recibieron ${esc(money(paid, currency))}. Quedan ${esc(money(outstanding, currency))} por cobrar.</div>
  </div>` : ''}

  <!-- The amount spelled out, as the format requires -->
  <div style="margin-top:14px;background:${ACCENT};color:#ffffff;padding:8px 10px;font-weight:bold;font-size:11px">
    TOTAL A PAGAR EN LETRAS: ${esc(invoice.totalInWords || '')}
  </div>

  <!-- Where to send the money -->
  <div style="margin-top:14px;text-align:center;font-size:11px">
    <div>Consignar en la cuenta ${esc(issuer.bankAccount || '')} SWIFT ${esc(issuer.swift || '')} número de ruta ${esc(issuer.routingNumber || '')} - Banco ${esc(issuer.bankName || '')}</div>
    ${issuer.paymentMethod ? `<div style="margin-top:3px">El pago debe realizarse mediante la modalidad ${esc(issuer.paymentMethod)}</div>` : ''}
  </div>

  <!-- Where the issuer can be found -->
  <table style="width:100%;border-collapse:collapse;margin-top:18px;border-top:2px solid ${ACCENT};font-size:11px"><tr>
    <td style="width:33.33%;vertical-align:top;padding:10px 9px 0 0">${site(issuer.site1)}</td>
    <td style="width:33.33%;vertical-align:top;padding:10px 9px 0 9px">${site(issuer.site2)}</td>
    <td style="width:33.33%;vertical-align:top;padding:10px 0 0 9px">
      ${issuer.contactEmail ? `<div><span style="${LABEL}">Email:</span> ${esc(issuer.contactEmail)}</div>` : ''}
      ${issuer.contactWeb ? `<div>${esc(issuer.contactWeb)}</div>` : ''}
    </td>
  </tr></table>
</div>`;
}

module.exports = {
  renderInvoiceHtml,
  // For the drift test only.
  READS,
  rateFromAmount,
  fmtDate,
  money,
};
