const test = require('node:test');
const assert = require('node:assert');
const { present } = require('../src/controllers/invoiceController');

// A row as the database hands it back: the three snapshot columns are JSON
// strings, and present() is what turns them into what a renderer reads.
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
    taxRate: 27,
    taxAmount: 27,
    retention: 0,
    total: 127,
    totalInWords: 'CIENTO VEINTISIETE DÓLARES CON 00/100',
    conceptLines: JSON.stringify([{ description: 'Recarga de saldo', total: 100 }]),
    issuerSnapshot: JSON.stringify({ issuerName: 'LM Consulting Group', issuerRnc: '131-00000-1' }),
    clientSnapshot: JSON.stringify({ company: 'Cliente SRL', rnc: '130-11111-2' }),
    issuedAt: new Date('2026-03-15T12:00:00.000Z'),
    dueAt: null,
    ...overrides,
  };
}

test('present parses the three JSON columns into lines / issuer / client', () => {
  const out = present(row());
  assert.deepStrictEqual(out.lines, [{ description: 'Recarga de saldo', total: 100 }]);
  assert.strictEqual(out.issuer.issuerName, 'LM Consulting Group');
  assert.strictEqual(out.client.rnc, '130-11111-2');
});

test('present carries every number and date the document prints', () => {
  const out = present(row());
  assert.strictEqual(out.number, 'FAC-000124');
  assert.strictEqual(out.subtotal, 100);
  assert.strictEqual(out.taxLabel, 'ITBIS');
  assert.strictEqual(out.taxRate, 27);
  assert.strictEqual(out.taxAmount, 27);
  assert.strictEqual(out.retention, 0);
  assert.strictEqual(out.total, 127);
  assert.strictEqual(out.totalInWords, 'CIENTO VEINTISIETE DÓLARES CON 00/100');
  assert.strictEqual(out.currency, 'USD');
  assert.strictEqual(out.dueAt, null);
});

test('present never leaks the owning account id or the issuer profile id', () => {
  // The document is rendered from the frozen snapshots alone; the foreign keys
  // used to decide access are not part of what it shows.
  const out = present(row());
  assert.strictEqual(out.userId, undefined);
  assert.strictEqual(out.profileId, undefined);
  assert.strictEqual(out.conceptLines, undefined);
  assert.strictEqual(out.issuerSnapshot, undefined);
  assert.strictEqual(out.clientSnapshot, undefined);
});

test('present survives an unreadable snapshot instead of throwing the whole document away', () => {
  const out = present(row({ clientSnapshot: 'not json at all', conceptLines: '{' }));
  assert.deepStrictEqual(out.client, {});
  assert.deepStrictEqual(out.lines, []);
  // The readable half is still there.
  assert.strictEqual(out.total, 127);
  assert.strictEqual(out.issuer.issuerRnc, '131-00000-1');
});

test('present treats a null or empty snapshot as the empty shape', () => {
  const out = present(row({ clientSnapshot: null, issuerSnapshot: '', conceptLines: 'null' }));
  assert.deepStrictEqual(out.client, {});
  assert.deepStrictEqual(out.issuer, {});
  assert.deepStrictEqual(out.lines, []);
});

test('present reports a creditPurchaseId of null on an invoice whose payment was deleted', () => {
  assert.strictEqual(present(row({ creditPurchaseId: null })).creditPurchaseId, null);
});
