const test = require('node:test');
const assert = require('node:assert');
const { sanitizeProfileInput, shape, DEFAULTS } = require('../src/controllers/billingProfileController');

// ---------------------------------------------------------------------------
// The allow-list: what may be written, and what may not
// ---------------------------------------------------------------------------

test('only listed fields survive: nothing else in the body reaches the row', () => {
  const { data, error } = sanitizeProfileInput({
    taxRate: 27,
    id: 999,
    ownerId: 1,
    createdAt: '2020-01-01',
    updatedAt: '2020-01-01',
    invoices: [],
    somethingInvented: 'x',
  });
  assert.strictEqual(error, undefined);
  assert.deepStrictEqual(Object.keys(data), ['taxRate']);
});

test('absent keys are not written, so saving one section never blanks the rest', () => {
  const { data } = sanitizeProfileInput({ issuerName: 'LM Consulting Group' });
  assert.deepStrictEqual(data, { issuerName: 'LM Consulting Group' });
});

// ---------------------------------------------------------------------------
// Coercion
// ---------------------------------------------------------------------------

test('rates and integers arrive coerced from the strings a form posts', () => {
  const { data } = sanitizeProfileInput({
    taxRate: '27',
    retentionRate: '0',
    invoiceNextNumber: '124',
    invoicePadding: '8',
    dueDays: '30',
    taxEnabled: 'yes',
  });
  assert.strictEqual(data.taxRate, 27);
  assert.strictEqual(data.retentionRate, 0);
  assert.strictEqual(data.invoiceNextNumber, 124);
  assert.strictEqual(data.invoicePadding, 8);
  assert.strictEqual(data.dueDays, 30);
  assert.strictEqual(data.taxEnabled, true);
});

test('an empty numeric field means zero (or the column default), never NaN', () => {
  const { data } = sanitizeProfileInput({ taxRate: '', dueDays: '', invoicePadding: '', invoiceNextNumber: '' });
  assert.strictEqual(data.taxRate, 0);
  assert.strictEqual(data.dueDays, 0);
  assert.strictEqual(data.invoicePadding, DEFAULTS.invoicePadding);
  assert.strictEqual(data.invoiceNextNumber, DEFAULTS.invoiceNextNumber);
});

test('empty optional text becomes null, and text is trimmed', () => {
  const { data } = sanitizeProfileInput({
    issuerRnc: '  131-00000-1  ',
    bankAccount: '',
    swift: '   ',
    site2Name: null,
  });
  assert.strictEqual(data.issuerRnc, '131-00000-1');
  assert.strictEqual(data.bankAccount, null);
  assert.strictEqual(data.swift, null);
  assert.strictEqual(data.site2Name, null);
});

test('a blank tax label falls back to the default instead of printing a nameless row', () => {
  assert.strictEqual(sanitizeProfileInput({ taxLabel: '   ' }).data.taxLabel, 'ITBIS');
  assert.strictEqual(sanitizeProfileInput({ taxLabel: ' ITBIS ' }).data.taxLabel, 'ITBIS');
});

test('an empty invoice prefix is kept: numbering with nothing but digits is legitimate', () => {
  assert.strictEqual(sanitizeProfileInput({ invoicePrefix: '' }).data.invoicePrefix, '');
  assert.strictEqual(sanitizeProfileInput({ invoicePrefix: ' B02 ' }).data.invoicePrefix, 'B02');
});

// ---------------------------------------------------------------------------
// Refusals — a bad rate here multiplies every client's bill
// ---------------------------------------------------------------------------

test('a rate above 100 is refused, not stored', () => {
  const { data, error } = sanitizeProfileInput({ taxRate: 270 });
  assert.strictEqual(data, undefined);
  assert.match(error, /entre 0 y 100/);
});

test('a negative or unparseable rate is refused', () => {
  assert.ok(sanitizeProfileInput({ taxRate: -1 }).error);
  assert.ok(sanitizeProfileInput({ taxRate: 'veintisiete' }).error);
  assert.ok(sanitizeProfileInput({ retentionRate: 101 }).error);
});

test('exactly 0 and exactly 100 are allowed', () => {
  assert.strictEqual(sanitizeProfileInput({ taxRate: 0 }).data.taxRate, 0);
  assert.strictEqual(sanitizeProfileInput({ taxRate: 100 }).data.taxRate, 100);
});

test('an out-of-range integer is refused with the field named', () => {
  assert.match(sanitizeProfileInput({ invoiceNextNumber: 0 }).error, /próximo número/);
  assert.match(sanitizeProfileInput({ invoicePadding: 21 }).error, /dígitos/);
  assert.match(sanitizeProfileInput({ dueDays: -1 }).error, /vencimiento/);
});

// ---------------------------------------------------------------------------
// shape() — what the panel reads
// ---------------------------------------------------------------------------

test('shape falls back to the schema defaults when there is no profile yet', () => {
  const out = shape(null);
  assert.strictEqual(out.taxEnabled, false);
  assert.strictEqual(out.taxRate, 0);
  assert.strictEqual(out.taxLabel, 'ITBIS');
  assert.strictEqual(out.invoicePrefix, 'FAC-');
  assert.strictEqual(out.invoiceNextNumber, 1);
  assert.strictEqual(out.invoicePadding, 6);
  assert.strictEqual(out.dueDays, 0);
  assert.strictEqual(out.issuerName, null);
});

test('shape returns only profile fields, never the row id or the owner id', () => {
  const out = shape({ id: 3, ownerId: 9, taxEnabled: true, taxRate: 27, createdAt: new Date() });
  assert.strictEqual(out.id, undefined);
  assert.strictEqual(out.ownerId, undefined);
  assert.strictEqual(out.createdAt, undefined);
  assert.strictEqual(out.taxRate, 27);
  assert.strictEqual(out.taxEnabled, true);
});
