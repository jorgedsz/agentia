const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { renderInvoiceHtml, READS, rateFromAmount } = require('../src/services/invoiceHtml');
const { present } = require('../src/controllers/invoiceController');

// ---------------------------------------------------------------------------
// The server-side invoice, which is a SECOND COPY of
// client/src/components/Dashboard/InvoiceDocument.jsx.
//
// Two groups of tests, and the second is the important one:
//
//   · the figures land on the page, for a taxed, a retained and a plain
//     invoice — the three shapes the totals block has;
//   · DRIFT. The two copies must read the same fields off the same invoice, and
//     the test below compares the field sets rather than trusting a comment.
// ---------------------------------------------------------------------------

// A row as the database hands it back, so these tests go through present() —
// the same parse the panel and the React document get their `invoice` from.
function row(overrides = {}) {
  return {
    id: 7,
    number: 'FAC-000124',
    profileId: 1,
    userId: 42,
    creditPurchaseId: 99,
    currency: 'USD',
    subtotal: 100,
    taxLabel: 'ITBIS',
    taxRate: 0,
    taxAmount: 0,
    retention: 0,
    retentionLabel: null,
    total: 100,
    amountPaid: 100,
    totalInWords: 'CIEN DÓLARES CON 00/100',
    conceptLines: JSON.stringify([
      { description: 'Recarga de Saldo - Créditos de Consumos para Ecosistema de AI', total: 100 },
    ]),
    issuerSnapshot: JSON.stringify({
      issuerName: 'LM CONSULTING GROUP SRL',
      issuerRnc: '1-31-12345-6',
      brandName: 'LM Consulting',
      slogan: 'Inteligencia artificial aplicada',
      logoUrl: 'https://cdn.example.com/logo.png',
      bankName: 'Banco Popular',
      bankAccount: '000000000',
      swift: 'BPDODOSX',
      routingNumber: '021000021',
      paymentMethod: 'Transferencia bancaria',
      site1: { name: 'Oficina principal', phone: '809-000-0000', city: 'Santo Domingo', address: 'Av. Winston Churchill 1' },
      site2: { name: 'Sucursal', phone: '809-111-1111', city: 'Santiago', address: 'Calle 2' },
      contactEmail: 'facturacion@lmconsulting.do',
      contactWeb: 'www.lmconsulting.do',
    }),
    clientSnapshot: JSON.stringify({
      company: 'Cliente SRL',
      rnc: '130-11111-2',
      address: 'Calle Primera 10',
      city: 'Santo Domingo Este',
      phone: '809-222-2222',
      email: 'cliente@ejemplo.com',
    }),
    issuedAt: new Date('2026-03-15T12:00:00.000Z'),
    dueAt: null,
    paidAt: new Date('2026-03-15T12:00:00.000Z'),
    ...overrides,
  };
}

const render = (overrides) => renderInvoiceHtml(present(row(overrides)));

// ---------------------------------------------------------------------------
// A PLAIN invoice: no tax, no retention. The document the owner's own
// configuration produces most often.
// ---------------------------------------------------------------------------

test('a plain invoice prints the header, the number, the client, the one date and the totals', () => {
  const html = render();

  // Header: logo, brand, slogan, and the legal issuer with its RNC.
  assert.match(html, /src="https:\/\/cdn\.example\.com\/logo\.png"/);
  assert.match(html, /LM Consulting</);
  assert.match(html, /Inteligencia artificial aplicada/);
  assert.match(html, /LM CONSULTING GROUP SRL/);
  assert.match(html, /RNC \/ ID: 1-31-12345-6/);
  // The number.
  assert.match(html, /NO\. FAC-000124/);
  // The client block.
  assert.match(html, /Empresa:/);
  assert.match(html, /Cliente SRL/);
  assert.match(html, /130-11111-2/);
  assert.match(html, /Calle Primera 10/);
  assert.match(html, /Santo Domingo Este/);
  assert.match(html, /809-222-2222/);
  // THE SINGLE DATE, labelled plainly "Fecha", taken off paidAt.
  assert.match(html, /Fecha:/);
  assert.match(html, /15\/03\/2026/);
  // The DESCRIPCIÓN / TOTAL table and its one line.
  assert.match(html, /DESCRIPCIÓN/);
  assert.match(html, /Recarga de Saldo - Créditos de Consumos para Ecosistema de AI/);
  // The totals: net and total to pay, with nothing between them.
  assert.match(html, /TOTAL NETO/);
  assert.match(html, /TOTAL A PAGAR/);
  assert.match(html, /USD 100\.00/);
  // The amount in words, the bank line and both footer sites.
  assert.match(html, /TOTAL A PAGAR EN LETRAS: CIEN DÓLARES CON 00\/100/);
  assert.match(html, /Consignar en la cuenta 000000000 SWIFT BPDODOSX número de ruta 021000021 - Banco Banco Popular/);
  assert.match(html, /El pago debe realizarse mediante la modalidad Transferencia bancaria/);
  assert.match(html, /Oficina principal/);
  assert.match(html, /Sucursal/);
  assert.match(html, /facturacion@lmconsulting\.do/);
  assert.match(html, /www\.lmconsulting\.do/);
});

test('a plain invoice prints NO tax row and prints the retención row blank, exactly as the React copy does', () => {
  const html = render();
  // No tax was charged, so the row is absent entirely — never an empty ITBIS.
  assert.ok(!html.includes('ITBIS'), 'an untaxed invoice must not print a tax row');
  // The printed format KEEPS the retención row whether or not there is one, so
  // the header is there and the amount cell is empty. The React copy does the
  // same; the two documents have to have the same rows.
  assert.match(html, /RETENCIÓN/);
  assert.ok(!html.includes('&minus;'), 'with no retention nothing is subtracted');
});

test('the blank ruled rows keep a one-line invoice at the height of a printed page', () => {
  const html = render();
  // 8 rows in the format, 1 real line, so 7 blanks.
  assert.strictEqual((html.match(/&nbsp;/g) || []).length, 14);
});

test('nothing is printed for the shortfall when the total was fully collected', () => {
  const html = render();
  assert.ok(!html.includes('RECIBIDO'));
  assert.ok(!html.includes('PENDIENTE'));
});

// ---------------------------------------------------------------------------
// A TAXED invoice.
// ---------------------------------------------------------------------------

test('a taxed invoice prints the tax row with its label, rate and amount', () => {
  const html = render({
    taxRate: 27, taxAmount: 27, total: 127, amountPaid: 127,
    totalInWords: 'CIENTO VEINTISIETE DÓLARES CON 00/100',
  });

  assert.match(html, /ITBIS \(27%\)/);
  assert.match(html, /USD 27\.00/);
  assert.match(html, /USD 127\.00/);
  // 27 prints as "27", never "27.00", in the label.
  assert.ok(!html.includes('ITBIS (27.00%)'));
});

test('the tax shown but never charged prints the shortfall band under the total', () => {
  // TOTAL A PAGAR 127 against 100 collected: the document has to say so.
  const html = render({ taxRate: 27, taxAmount: 27, total: 127, amountPaid: 100 });

  assert.match(html, /RECIBIDO: USD 100\.00/);
  assert.match(html, /PENDIENTE: USD 27\.00/);
  assert.match(html, /Quedan USD 27\.00 por cobrar/);
});

test('an invoice issued before amountPaid existed prints no shortfall at all', () => {
  // Null means UNKNOWN, not zero. Claiming the whole total is outstanding would
  // be a lie on a fiscal document.
  const html = render({ taxRate: 27, taxAmount: 27, total: 127, amountPaid: null });
  assert.ok(!html.includes('RECIBIDO'));
});

// ---------------------------------------------------------------------------
// A RETAINED invoice — the owner's accountant's own format.
// ---------------------------------------------------------------------------

test('a retained invoice prints the grossed-up net, the signed retención with its rate, and the total received', () => {
  // 27% on $100 received: 100 / (1 - 0.27) = 136.99, retención 36.99, total 100.
  const html = render({
    subtotal: 136.99, retention: 36.99, retentionLabel: 'Ret. IR-17', total: 100, amountPaid: 100,
  });

  assert.match(html, /TOTAL NETO/);
  assert.match(html, /USD 136\.99/);
  // The name comes off the INVOICE, and the rate is recovered from the amount.
  assert.match(html, /Ret\. IR-17 \(27%\)/);
  // SIGNED, because it sits where a tax row would ADD.
  assert.match(html, /&minus; USD 36\.99/);
  assert.match(html, /USD 100\.00/);
  // Every dollar is accounted for: 100 asked, 100 collected, no band.
  assert.ok(!html.includes('RECIBIDO'));
});

test('a retención on a subtotal too small to pin the rate down prints the amount alone', () => {
  // Below $10 a single cent of rounding is worth more than a tenth of a point,
  // so the rate is LEFT OFF rather than guessed — same rule as the React copy.
  const html = render({ subtotal: 5, retention: 1.35, total: 3.65, amountPaid: 3.65 });
  assert.match(html, /RETENCIÓN</);
  assert.ok(!/RETENCIÓN \(/.test(html), 'no rate may be printed when the amount cannot pin it down');
  assert.match(html, /&minus; USD 1\.35/);
});

test('an invoice issued before retentionLabel existed keeps printing the old literal', () => {
  const html = render({ subtotal: 136.99, retention: 36.99, retentionLabel: null, total: 100 });
  assert.match(html, /RETENCIÓN \(27%\)/);
});

test('both rows at once: the tax ADDS and the retención SUBTRACTS on one document', () => {
  const html = render({
    subtotal: 136.99, taxRate: 27, taxAmount: 36.99, retention: 36.99, total: 136.99, amountPaid: 100,
  });
  assert.match(html, /ITBIS \(27%\)/);
  assert.match(html, /&minus; USD 36\.99/);
  assert.match(html, /RECIBIDO: USD 100\.00/);
});

// ---------------------------------------------------------------------------
// The edges the React copy handles, which this copy has to handle the same way.
// ---------------------------------------------------------------------------

test('an invoice with no paidAt omits the date line instead of printing an empty label', () => {
  const html = render({ paidAt: null });
  assert.ok(!html.includes('Fecha:'));
});

test('an issuer with no logo prints no img tag', () => {
  const html = render({ issuerSnapshot: JSON.stringify({ issuerName: 'X', brandName: 'X' }) });
  assert.ok(!html.includes('<img'));
});

test('an unreadable snapshot still renders the numbers rather than throwing', () => {
  // present() degrades a broken snapshot to the empty shape; this copy has to
  // survive that, since the figures are still worth sending.
  const html = render({ issuerSnapshot: 'not json', clientSnapshot: 'not json either' });
  assert.match(html, /NO\. FAC-000124/);
  assert.match(html, /USD 100\.00/);
});

test('renderInvoiceHtml returns an empty string for no invoice at all', () => {
  assert.strictEqual(renderInvoiceHtml(null), '');
  assert.strictEqual(renderInvoiceHtml(undefined), '');
});

test('free text is HTML-escaped, which the React copy gets for free and this one does not', () => {
  const html = render({
    clientSnapshot: JSON.stringify({ company: 'Tornillos & Tuercas <SRL>' }),
  });
  assert.match(html, /Tornillos &amp; Tuercas &lt;SRL&gt;/);
  assert.ok(!html.includes('<SRL>'));
});

test('the document carries no class attribute and no stylesheet: email clients drop both', () => {
  const html = render();
  assert.ok(!/\sclass=/.test(html), 'inline styles only');
  assert.ok(!html.includes('<style'), 'no style block');
  assert.ok(!html.includes('<link'), 'no external stylesheet');
});

test('rateFromAmount reproduces the React copy: 591.78 of 2191.78 is 27, not 26.99998', () => {
  assert.strictEqual(rateFromAmount(591.78, 2191.78), 27);
  assert.strictEqual(rateFromAmount(4.62, 17.12), 27);
  // Too small for the amount to pin the rate down: 0, so no rate is printed.
  assert.strictEqual(rateFromAmount(1.35, 5), 0);
  assert.strictEqual(rateFromAmount(0, 100), 0);
});

// ---------------------------------------------------------------------------
// DRIFT.
//
// What this catches: a field added to one copy of the document and forgotten on
// the other — which is the drift that actually happens, and the one nobody sees
// until a client's emailed invoice is missing a line its PDF has.
//
// What it cannot catch: restyling. A colour, a padding or a label changed on one
// side only still has to be caught by a human, which is why the file header of
// invoiceHtml.js says so out loud.
// ---------------------------------------------------------------------------

const JSX_PATH = path.join(__dirname, '..', '..', 'client', 'src', 'components', 'Dashboard', 'InvoiceDocument.jsx');

// Fields the React component reads but that belong to the MODAL CHROME around
// the document rather than to the printed page. Each one needs a reason.
const CHROME_ONLY = {
  // Printed in the modal's own title bar ("Factura FAC-000124" / the date under
  // it), not on the document: the page shows `paidAt` and nothing else, by the
  // issuer's decision.
  issuedAt: 'shown in the modal title bar, never on the document',
};

/** Every `<obj>.<field>` the React copy reads, with comments stripped first. */
function fieldsReadByJsx(source, obj) {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const re = new RegExp(`\\b${obj}\\.([A-Za-z_$][\\w$]*)`, 'g');
  const found = new Set();
  let m;
  while ((m = re.exec(stripped))) found.add(m[1]);
  return found;
}

test('the React document and this copy read the same fields off the same invoice', () => {
  const source = fs.readFileSync(JSX_PATH, 'utf8');
  // The scan has to actually find something, or a rename would make this test
  // pass by reading nothing.
  assert.ok(source.length > 1000, 'the React copy must be where this test looks for it');

  for (const [obj, declared] of Object.entries(READS)) {
    const jsx = fieldsReadByJsx(source, obj);
    assert.ok(jsx.size > 0, `the scan found no ${obj}.* reads in the React copy — has it been renamed?`);

    const mine = new Set(declared);
    const missingHere = [...jsx].filter((f) => !mine.has(f) && !CHROME_ONLY[f]).sort();
    const extraHere = [...mine].filter((f) => !jsx.has(f)).sort();

    assert.deepStrictEqual(
      missingHere, [],
      `InvoiceDocument.jsx reads ${obj}.{${missingHere}} and services/invoiceHtml.js does not. `
      + 'Print it here too, or list it in CHROME_ONLY with the reason it is not on the paper.',
    );
    assert.deepStrictEqual(
      extraHere, [],
      `services/invoiceHtml.js declares ${obj}.{${extraHere}} and InvoiceDocument.jsx does not read it. `
      + 'The emailed copy would show something the PDF does not.',
    );
  }
});

test('every field this copy declares is a field it actually prints', () => {
  // READS is hand-written, so it could claim a field the markup ignores and the
  // drift test above would still pass. This renders an invoice whose every
  // value is a unique marker and checks each one reaches the page.
  const markers = {};
  const mark = (k) => { markers[k] = `MARK-${k}`; return markers[k]; };

  const html = renderInvoiceHtml({
    number: mark('number'),
    currency: 'USD',
    subtotal: 1, taxRate: 7, taxAmount: 2, retention: 3, total: 4, amountPaid: 1,
    taxLabel: mark('taxLabel'),
    retentionLabel: mark('retentionLabel'),
    totalInWords: mark('totalInWords'),
    paidAt: '2026-03-15T12:00:00.000Z',
    lines: [{ description: mark('description'), total: 9 }],
    issuer: {
      logoUrl: mark('logoUrl'),
      brandName: mark('brandName'),
      slogan: mark('slogan'),
      issuerName: mark('issuerName'),
      issuerRnc: mark('issuerRnc'),
      bankAccount: mark('bankAccount'),
      swift: mark('swift'),
      routingNumber: mark('routingNumber'),
      bankName: mark('bankName'),
      paymentMethod: mark('paymentMethod'),
      site1: { name: mark('site1name'), phone: mark('site1phone'), city: mark('site1city'), address: mark('site1address') },
      site2: { name: mark('site2name'), phone: mark('site2phone'), city: mark('site2city'), address: mark('site2address') },
      contactEmail: mark('contactEmail'),
      contactWeb: mark('contactWeb'),
    },
    client: {
      company: mark('company'),
      rnc: mark('rnc'),
      address: mark('address'),
      city: mark('city'),
      phone: mark('phone'),
    },
  });

  for (const [key, value] of Object.entries(markers)) {
    assert.ok(html.includes(value), `${key} is declared in READS but never printed`);
  }
  // And the numeric fields, which cannot carry a marker.
  assert.match(html, /USD 1\.00/); // subtotal
  assert.match(html, /\(7%\)/); // taxRate
  assert.match(html, /USD 2\.00/); // taxAmount
  assert.match(html, /USD 3\.00/); // retention
  assert.match(html, /USD 4\.00/); // total
  assert.match(html, /RECIBIDO: USD 1\.00/); // amountPaid
  assert.match(html, /15\/03\/2026/); // paidAt
});
