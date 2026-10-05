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

// ---------------------------------------------------------------------------
// The access rule — the same one GET /api/credits/quote?forUserId=.. reuses
// ---------------------------------------------------------------------------

const { canReadAccount, canReadInvoice } = require('../src/controllers/invoiceController');

// whitelabel 1 > agency 2 > clients 3 and 4; account 9 hangs off nobody.
const TREE = {
  1: { id: 1, role: 'WHITELABEL', agencyId: null, whitelabelId: null },
  2: { id: 2, role: 'AGENCY', agencyId: null, whitelabelId: 1 },
  3: { id: 3, role: 'CLIENT', agencyId: 2, whitelabelId: null },
  4: { id: 4, role: 'CLIENT', agencyId: 2, whitelabelId: null },
  9: { id: 9, role: 'CLIENT', agencyId: null, whitelabelId: null },
};

function fakePrisma(profiles = {}) {
  return {
    user: { findUnique: async ({ where }) => TREE[where.id] || null },
    billingProfile: { findUnique: async ({ where }) => profiles[where.id] || null },
  };
}

test('canReadAccount: the OWNER may read any account', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 99, role: 'OWNER' }, 3), true);
});

test('canReadAccount: an account may read itself', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 3, role: 'CLIENT' }, 3), true);
});

test('canReadAccount: a partner above the account may read it, at either level', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 2, role: 'AGENCY' }, 3), true);
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 1, role: 'WHITELABEL' }, 3), true);
});

test('canReadAccount: a sibling is refused, which is what stops this probing other accounts', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 4, role: 'CLIENT' }, 3), false);
});

test('canReadAccount: an unrelated partner is refused', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 9, role: 'AGENCY' }, 3), false);
});

test('canReadAccount: downward only — a client may not read the partner above it', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 3, role: 'CLIENT' }, 2), false);
});

test('canReadAccount: a missing account, or no account at all, is refused', async () => {
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 1, role: 'WHITELABEL' }, 777), false);
  assert.strictEqual(await canReadAccount(fakePrisma(), { id: 1, role: 'WHITELABEL' }, null), false);
  assert.strictEqual(await canReadAccount(fakePrisma(), null, 3), false);
});

test('canReadInvoice: a live invoice follows the account rule', async () => {
  const invoice = { id: 5, userId: 3, profileId: 7 };
  assert.strictEqual(await canReadInvoice(fakePrisma(), { id: 2, role: 'AGENCY' }, invoice), true);
  assert.strictEqual(await canReadInvoice(fakePrisma(), { id: 4, role: 'CLIENT' }, invoice), false);
});

test('canReadInvoice: an orphaned invoice is readable by the OWNER and by the partner that issued it', async () => {
  const orphan = { id: 5, userId: null, profileId: 7 };
  const prisma = fakePrisma({ 7: { id: 7, ownerId: 1 } });
  assert.strictEqual(await canReadInvoice(prisma, { id: 99, role: 'OWNER' }, orphan), true);
  assert.strictEqual(await canReadInvoice(prisma, { id: 1, role: 'WHITELABEL' }, orphan), true);
  // Not the agency below the issuer, and not an unrelated account.
  assert.strictEqual(await canReadInvoice(prisma, { id: 2, role: 'AGENCY' }, orphan), false);
  assert.strictEqual(await canReadInvoice(prisma, { id: 9, role: 'CLIENT' }, orphan), false);
});

test('canReadInvoice: an orphan whose issuing profile is gone is readable by nobody but the OWNER', async () => {
  const orphan = { id: 5, userId: null, profileId: 7 };
  assert.strictEqual(await canReadInvoice(fakePrisma(), { id: 1, role: 'WHITELABEL' }, orphan), false);
  assert.strictEqual(await canReadInvoice(fakePrisma(), { id: 99, role: 'OWNER' }, orphan), true);
});
