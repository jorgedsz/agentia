const test = require('node:test');
const assert = require('node:assert');
const { sanitizeProfileInput, shape, DEFAULTS } = require('../src/controllers/billingProfileController');

// ---------------------------------------------------------------------------
// BillingProfile.invoiceCopyTo — the issuer's own address for a copy of every
// invoice it issues (its bookkeeper's).
//
// It is the one field in this profile that has to be a real ADDRESS: it is
// handed to the delivery webhook as `cc`, and a typo there is discovered only
// when somebody notices the bookkeeper never received a document. So it is
// validated exactly the way userController.updateUserBilling validates
// `receiptEmail` — same pattern, same lower-casing — and a blank one means NO
// COPY rather than an error.
// ---------------------------------------------------------------------------

test('a valid address is stored, trimmed and lower-cased', () => {
  const { data, error } = sanitizeProfileInput({ invoiceCopyTo: '  Contabilidad@Emisor.DO  ' });
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(data, { invoiceCopyTo: 'contabilidad@emisor.do' });
});

test('empty means NO COPY, which is a null and not an error', () => {
  for (const raw of ['', '   ', null]) {
    const { data, error } = sanitizeProfileInput({ invoiceCopyTo: raw });
    assert.strictEqual(error, undefined, `${JSON.stringify(raw)} must be accepted`);
    assert.deepStrictEqual(data, { invoiceCopyTo: null });
  }
});

test('something that is not an address is refused, in Spanish, before anything is written', () => {
  for (const raw of ['contabilidad', 'contabilidad@emisor', 'a b@emisor.do', '@emisor.do', 'contabilidad@.do']) {
    const { data, error } = sanitizeProfileInput({ invoiceCopyTo: raw });
    assert.strictEqual(data, undefined, `${raw} must not reach the row`);
    assert.match(error, /no parece un correo electrónico/);
  }
});

test('the same pattern receiptEmail uses: both accept what the other accepts', () => {
  // The literal pattern from userController.updateUserBilling. If one of the
  // two is ever loosened, this is where the two stop agreeing.
  const RECEIPT_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  for (const raw of ['a@b.co', 'facturacion+copia@sub.dominio.com.do', 'x@y.z']) {
    assert.ok(RECEIPT_PATTERN.test(raw), `${raw} is accepted by receiptEmail`);
    assert.strictEqual(sanitizeProfileInput({ invoiceCopyTo: raw }).error, undefined);
  }
  for (const raw of ['a@b', 'a b@c.do', 'a@@b.co']) {
    assert.ok(!RECEIPT_PATTERN.test(raw), `${raw} is refused by receiptEmail`);
    assert.ok(sanitizeProfileInput({ invoiceCopyTo: raw }).error);
  }
});

test('an absent key is not written, so saving another section never clears the copy address', () => {
  const { data } = sanitizeProfileInput({ contactEmail: 'facturacion@emisor.do' });
  assert.ok(!('invoiceCopyTo' in data));
});

test('the panel is shown no copy address until one is configured', () => {
  assert.strictEqual(DEFAULTS.invoiceCopyTo, null);
  assert.strictEqual(shape(null).invoiceCopyTo, null);
  assert.strictEqual(shape({ invoiceCopyTo: 'contable@emisor.do' }).invoiceCopyTo, 'contable@emisor.do');
});
