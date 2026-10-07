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
    amountPaid: 127,
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
  assert.strictEqual(out.amountPaid, 127);
  assert.strictEqual(out.totalInWords, 'CIENTO VEINTISIETE DÓLARES CON 00/100');
  assert.strictEqual(out.currency, 'USD');
  assert.strictEqual(out.dueAt, null);
});

// The document asks for 127 and 100 came in: present() has to carry both
// numbers, or the renderer has no way to say so.
test('present carries an amountPaid below the total, for an invoice whose tax was never collected', () => {
  const out = present(row({ amountPaid: 100 }));
  assert.strictEqual(out.total, 127);
  assert.strictEqual(out.amountPaid, 100);
});

// An invoice issued before the column existed. Null means UNKNOWN, not zero:
// reporting 0 would make the renderer claim nothing was ever paid.
test('present reports amountPaid null on an invoice that never recorded one', () => {
  assert.strictEqual(present(row({ amountPaid: null })).amountPaid, null);
  assert.strictEqual(present(row({ amountPaid: undefined })).amountPaid, null);
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

test('present spells the payment id `purchaseId`, the same name the payments list and the route use', () => {
  const out = present(row());
  assert.strictEqual(out.purchaseId, 99);
  // The column name is not the API name; only one spelling reaches the client.
  assert.strictEqual(out.creditPurchaseId, undefined);
});

test('present reports a purchaseId of null on an invoice whose payment was deleted', () => {
  assert.strictEqual(present(row({ creditPurchaseId: null })).purchaseId, null);
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

// ---------------------------------------------------------------------------
// presentPayment — the row the payments list returns
// ---------------------------------------------------------------------------

const { presentPayment } = require('../src/controllers/invoiceController');

function purchase(overrides = {}) {
  return {
    id: 412,
    amount: 127,
    credits: 100,
    taxRate: 27,
    taxAmount: 27,
    createdAt: new Date('2026-03-15T12:00:00.000Z'),
    kind: 'manual',
    billingPeriodId: null,
    periodStart: null,
    periodEnd: null,
    invoice: null,
    ...overrides,
  };
}

test('presentPayment keeps the charged total and the pre-tax subtotal apart', () => {
  const out = presentPayment(purchase());
  assert.strictEqual(out.amount, 127);   // what the card paid
  assert.strictEqual(out.credits, 100);  // what reached the balance
  assert.strictEqual(out.taxAmount, 27);
  assert.strictEqual(out.taxRate, 27);
});

// THE DEFAULT MODE. The payment carries no tax at all, because none was
// charged, and its invoice still totals 127. Both numbers have to come back:
// what the card paid and what the document asks for.
test('presentPayment reports a payment of 100 against an invoice of 127', () => {
  const out = presentPayment(purchase({
    amount: 100,
    taxRate: 27,
    taxAmount: 0,
    invoice: { id: 9, number: 'FAC-000124', total: 127, issuedAt: new Date('2026-03-15T12:00:05.000Z') },
  }), true);
  assert.strictEqual(out.amount, 100);
  assert.strictEqual(out.credits, 100);
  assert.strictEqual(out.taxAmount, 0);
  assert.strictEqual(out.invoice.total, 127);
  // The gap the document leaves open, visible from the row alone.
  assert.strictEqual(out.invoice.total - out.amount, 27);
});

test('presentPayment uses the same id spelling as present() and the by-purchase route', () => {
  assert.strictEqual(presentPayment(purchase()).purchaseId, 412);
  assert.strictEqual(presentPayment(purchase()).id, undefined);
});

test('presentPayment attaches the invoice when there is one, trimmed to what a list row shows', () => {
  const out = presentPayment(purchase({
    invoice: { id: 9, number: 'FAC-000124', total: 127, issuedAt: new Date('2026-03-15T12:00:05.000Z'), clientSnapshot: '{}' },
  }), true);
  assert.deepStrictEqual(Object.keys(out.invoice), ['id', 'number', 'total', 'issuedAt']);
  assert.strictEqual(out.invoice.number, 'FAC-000124');
});

test('a payment with no invoice on an invoicing account is a failed emission: invoiceExpected true', () => {
  const out = presentPayment(purchase({ invoice: null }), true);
  assert.strictEqual(out.invoice, null);
  assert.strictEqual(out.invoiceExpected, true);
});

// The regression the split would otherwise have caused. The account invoices
// with tax, but the tax is only SHOWN, so the payment carries taxAmount 0.
// Keyed on the payment's own tax this read "predates the tax" and the missing
// document was offered quietly instead of flagged; keyed on the account it is
// correctly a failed emission.
test('a payment that was never charged tax is still expected to have an invoice', () => {
  const out = presentPayment(purchase({ amount: 100, taxRate: 27, taxAmount: 0, invoice: null }), true);
  assert.strictEqual(out.taxAmount, 0);
  assert.strictEqual(out.invoiceExpected, true);
});

test('an account that does not bill with tax expects no invoice', () => {
  const out = presentPayment(purchase({ amount: 100, taxRate: 0, taxAmount: 0, invoice: null }), false);
  assert.strictEqual(out.invoice, null);
  assert.strictEqual(out.invoiceExpected, false);
});

// The flag has to be passed in, and absent it must not claim a document was
// due: the quiet state is the safe default.
test('presentPayment defaults to expecting no invoice when nobody says the account bills with tax', () => {
  assert.strictEqual(presentPayment(purchase()).invoiceExpected, false);
});

test('presentPayment describes the payment with the same helper the invoice line uses', () => {
  assert.strictEqual(presentPayment(purchase()).concept, 'Recarga de saldo — créditos de consumo');
  assert.strictEqual(presentPayment(purchase({ kind: 'auto_recharge' })).concept, 'Recarga automática de saldo');
  assert.strictEqual(presentPayment(purchase({ billingPeriodId: 3 })).concept, 'Liquidación del periodo facturado');
});

test('presentPayment tolerates the default-zero tax columns being absent on an old row', () => {
  const out = presentPayment({ id: 1, amount: 50, credits: 50, createdAt: new Date(), kind: 'manual', invoice: null });
  assert.strictEqual(out.taxAmount, 0);
  assert.strictEqual(out.taxRate, 0);
  assert.strictEqual(out.invoiceExpected, false);
});

// map() hands its callback (element, index, array). presentPayment's second
// parameter is the account-level flag, so listMine must wrap the call rather
// than pass the function straight to map - an index of 0 would silently turn
// the flag off for the first row and on for every other.
test('presentPayment is not safe to hand straight to map, and the index proves it', () => {
  const rows = [purchase({ invoice: null }), purchase({ invoice: null })];
  const wrong = rows.map(presentPayment);
  assert.strictEqual(wrong[0].invoiceExpected, false);
  assert.strictEqual(wrong[1].invoiceExpected, true);
  // What listMine actually does.
  const right = rows.map((r) => presentPayment(r, true));
  assert.deepStrictEqual(right.map((r) => r.invoiceExpected), [true, true]);
});

// ---------------------------------------------------------------------------
// GET /api/invoices?forUserId=.. — listing ANOTHER account's payments
//
// DB-free: resolveTaxConfig and canReadAccount both reach the database only
// through prisma.user / prisma.billingProfile, so a plain object answers for
// both and the whole endpoint runs here.
// ---------------------------------------------------------------------------

const { listMine } = require('../src/controllers/invoiceController');

// whitelabel 10 collects through its own Stripe and has the tax switched on,
// so its WHOLE subtree bills with tax — agency 20 and clients 30 and 31 — while
// account 10 itself, being a partner, buys from the platform and bills with no
// tax at all. That asymmetry is the point: it is the shape LM Consulting has.
const BILLING_TREE = {
  10: { id: 10, role: 'WHITELABEL', agencyId: null, whitelabelId: null, billingMode: 'own_stripe' },
  20: { id: 20, role: 'AGENCY', agencyId: null, whitelabelId: 10, billingMode: null },
  30: { id: 30, role: 'CLIENT', agencyId: 20, whitelabelId: null, billingMode: null },
  31: { id: 31, role: 'CLIENT', agencyId: 20, whitelabelId: null, billingMode: null },
  // Hangs off nobody: nothing above it, so nothing taxes it.
  50: { id: 50, role: 'CLIENT', agencyId: null, whitelabelId: null, billingMode: null },
};

function listPrisma(purchases = []) {
  const calls = [];
  return {
    calls,
    user: { findUnique: async ({ where }) => BILLING_TREE[where.id] || null },
    billingProfile: {
      findUnique: async ({ where }) => (where.ownerId === 10
        ? { id: 1, ownerId: 10, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' }
        : null),
    },
    creditPurchase: {
      findMany: async (args) => { calls.push(args); return purchases; },
    },
  };
}

function fakeRes() {
  return {
    code: 200,
    body: null,
    status(code) { this.code = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function paid(id) {
  return {
    id,
    amount: 100,
    credits: 100,
    taxRate: 27,
    taxAmount: 0,
    createdAt: new Date('2026-03-15T12:00:00.000Z'),
    kind: 'manual',
    billingPeriodId: null,
    periodStart: null,
    periodEnd: null,
    invoice: null,
  };
}

async function callList(prisma, user, query = {}) {
  const res = fakeRes();
  await listMine({ prisma, user, query }, res);
  return res;
}

test('no forUserId: unchanged — the payments of the caller, under the tax of the caller', async () => {
  const prisma = listPrisma([paid(1)]);
  const res = await callList(prisma, { id: 30, role: 'CLIENT' });
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.billsWithTax, true);
  assert.strictEqual(prisma.calls[0].where.userId, 30);
  assert.strictEqual(res.body.payments.length, 1);
});

test('forUserId: a partner above the account gets the payments of that account, not its own', async () => {
  const prisma = listPrisma([paid(1), paid(2)]);
  const res = await callList(prisma, { id: 10, role: 'WHITELABEL' }, { forUserId: '30' });
  assert.strictEqual(res.code, 200);
  assert.strictEqual(prisma.calls[0].where.userId, 30);
  assert.strictEqual(res.body.payments.length, 2);
});

// The whole reason the tax is resolved for the subject. Account 10 bills with
// NO tax of its own; read off the caller, this answers false and the manager is
// told its client's payments cannot be invoiced while issuance invoices them
// perfectly well.
test('forUserId: billsWithTax describes the account being viewed, not the manager viewing it', async () => {
  const viewed = await callList(listPrisma([paid(1)]), { id: 10, role: 'WHITELABEL' }, { forUserId: '30' });
  assert.strictEqual(viewed.body.billsWithTax, true);
  // Same caller, same page, its own account selected: no tax, as before.
  const own = await callList(listPrisma([paid(1)]), { id: 10, role: 'WHITELABEL' });
  assert.strictEqual(own.body.billsWithTax, false);
  assert.deepStrictEqual(own.body.payments, []);
});

test('forUserId: the OWNER may list any account', async () => {
  const prisma = listPrisma([paid(1)]);
  const res = await callList(prisma, { id: 99, role: 'OWNER' }, { forUserId: '30' });
  assert.strictEqual(res.code, 200);
  assert.strictEqual(prisma.calls[0].where.userId, 30);
});

test('forUserId: an account under no tax-collecting partner still answers billsWithTax false, not 403', async () => {
  const res = await callList(listPrisma([paid(1)]), { id: 99, role: 'OWNER' }, { forUserId: '50' });
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.billsWithTax, false);
  assert.deepStrictEqual(res.body.payments, []);
});

// 403 AND NOT AN EMPTY LIST. An empty list reads as "this client never paid",
// which would send a manager looking for payments that are simply not his.
test('forUserId: a sibling is refused with 403, and no payment is read', async () => {
  const prisma = listPrisma([paid(1)]);
  const res = await callList(prisma, { id: 31, role: 'CLIENT' }, { forUserId: '30' });
  assert.strictEqual(res.code, 403);
  assert.match(res.body.error, /No puedes ver las facturas/);
  assert.strictEqual(res.body.payments, undefined);
  assert.strictEqual(prisma.calls.length, 0);
});

test('forUserId: upward is refused too — a client may not list the partner above it', async () => {
  const res = await callList(listPrisma([paid(1)]), { id: 30, role: 'CLIENT' }, { forUserId: '20' });
  assert.strictEqual(res.code, 403);
});

test('forUserId: a partner may not list an account outside its own tree', async () => {
  const res = await callList(listPrisma([paid(1)]), { id: 10, role: 'WHITELABEL' }, { forUserId: '50' });
  assert.strictEqual(res.code, 403);
});

test('forUserId: an account that does not exist is refused rather than answered empty', async () => {
  const res = await callList(listPrisma(), { id: 10, role: 'WHITELABEL' }, { forUserId: '777' });
  assert.strictEqual(res.code, 403);
});

test('forUserId: a non-numeric id is a 400, never silently the list of the caller', async () => {
  const prisma = listPrisma([paid(1)]);
  const res = await callList(prisma, { id: 10, role: 'WHITELABEL' }, { forUserId: 'abc' });
  assert.strictEqual(res.code, 400);
  assert.strictEqual(prisma.calls.length, 0);
});

test('forUserId: the cap still applies to the request of a manager', async () => {
  const prisma = listPrisma([paid(1)]);
  await callList(prisma, { id: 99, role: 'OWNER' }, { forUserId: '30', limit: '5000' });
  assert.strictEqual(prisma.calls[0].take, 200);
});

// Every answer says which account it is about, so a page with two requests in
// flight can refuse to show one account's rows under another's name.
test('the answer echoes the account it is about, so a slow answer can be told apart', async () => {
  const mine = await callList(listPrisma([paid(1)]), { id: 30, role: 'CLIENT' });
  assert.strictEqual(mine.body.accountId, 30);

  const theirs = await callList(listPrisma([paid(1)]), { id: 10, role: 'WHITELABEL' }, { forUserId: '30' });
  assert.strictEqual(theirs.body.accountId, 30);

  // A different pick by the same viewer is a different echo - which is the
  // whole point: these two answers are no longer interchangeable.
  const other = await callList(listPrisma([paid(1)]), { id: 10, role: 'WHITELABEL' }, { forUserId: '31' });
  assert.strictEqual(other.body.accountId, 31);
});

// The echo has to be on the empty answer too, or the one case that renders a
// sentence about a named account ("X no emite facturas") is the one case that
// cannot be checked against the pick.
test('the account with no tax echoes its id as well, not just the populated answer', async () => {
  const res = await callList(listPrisma([paid(1)]), { id: 99, role: 'OWNER' }, { forUserId: '50' });
  assert.strictEqual(res.body.billsWithTax, false);
  assert.strictEqual(res.body.accountId, 50);
});

// A string id from the query string must come back as the number the client
// compares against, never '30' where 30 is expected.
test('the echoed id is the resolved number, whatever the query string carried', async () => {
  const res = await callList(listPrisma([paid(1)]), { id: 99, role: 'OWNER' }, { forUserId: '30' });
  assert.strictEqual(res.body.accountId, 30);
  assert.strictEqual(typeof res.body.accountId, 'number');
});

// ---------------------------------------------------------------------------
// POST /api/invoices/:id/regenerate — rebuilding a document, keeping its number
//
// DB-free: the handler reaches the database only through prisma.invoice,
// prisma.billingProfile, prisma.user and prisma.creditPurchase, so a plain
// object answers for all four and the whole endpoint runs here.
//
// The rule is NOT the read rule, and that is the point of most of these: the
// client the invoice is addressed to may download it and must not be able to
// rewrite a fiscal document its provider issued, and a partner ABOVE the issuer
// may read it without being allowed to rewrite it either.
// ---------------------------------------------------------------------------

const { regenerate, canRegenerateInvoice } = require('../src/controllers/invoiceController');

// Profile 7 belongs to whitelabel 1, profile 8 to agency 2 — so one tree gives
// both "the issuer is above the reader" and "the reader is above the issuer".
const REG_PROFILES = {
  7: { id: 7, ownerId: 1, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS', dueDays: 0, issuerName: 'LM Consulting Group SRL', issuerRnc: '1-01-00000-1' },
  8: { id: 8, ownerId: 2, taxEnabled: true, taxRate: 18, taxLabel: 'ITBIS', dueDays: 15, issuerName: 'Agencia SRL', issuerRnc: '1-03-00000-3' },
};

const REG_INVOICE = {
  id: 55,
  number: 'FAC-000124',
  profileId: 7,
  userId: 3,
  creditPurchaseId: 77,
  currency: 'USD',
  subtotal: 100,
  taxLabel: 'ITBIS',
  taxRate: 27,
  taxAmount: 27,
  retention: 0,
  total: 127,
  amountPaid: 127,
  totalInWords: 'CIENTO VEINTISIETE DÓLARES CON 00/100',
  conceptLines: JSON.stringify([{ description: 'Recarga de saldo — créditos de consumo', total: 100 }]),
  issuerSnapshot: JSON.stringify({ issuerName: 'LM', issuerRnc: 'EL RNC EQUIVOCADO' }),
  clientSnapshot: JSON.stringify({ company: 'Cliente SRL' }),
  issuedAt: new Date('2026-03-15T12:00:00.000Z'),
  dueAt: new Date('2026-03-15T12:00:00.000Z'),
  regeneratedAt: null,
};

const REG_PURCHASE = { id: 77, userId: 3, credits: 100, taxRate: 27, taxAmount: 27, amount: 127, kind: 'manual' };

// Carries its place in the TREE above (client 3 under agency 2 under whitelabel
// 1) as well as its billing fields, because the tests below compare what the
// READ rule allows against what regeneration allows, and the read rule walks
// that chain.
const REG_CLIENT = {
  id: 3,
  role: 'CLIENT',
  agencyId: 2,
  whitelabelId: null,
  email: 'cliente@biz.com',
  name: 'Cliente',
  billingCompany: 'Cliente Fiscal SRL',
  billingRnc: '1-02-00000-2',
};

// `writes` records every invoice.update, so a refused request can be checked to
// have written NOTHING rather than merely to have answered 403.
function regPrisma({ invoice = REG_INVOICE, purchase = REG_PURCHASE, client = REG_CLIENT, profiles = REG_PROFILES } = {}) {
  const writes = [];
  return {
    writes,
    invoice: {
      findUnique: async ({ where }) => (where.id === invoice.id ? invoice : null),
      update: async ({ where, data }) => { writes.push({ where, data }); return { ...invoice, ...data }; },
    },
    billingProfile: { findUnique: async ({ where }) => profiles[where.id] || null },
    user: { findUnique: async ({ where }) => (client && where.id === client.id ? client : TREE[where.id] || null) },
    creditPurchase: { findUnique: async ({ where }) => (purchase && where.id === purchase.id ? purchase : null) },
  };
}

async function callRegenerate(prisma, user, id = '55') {
  const res = fakeRes();
  await regenerate({ prisma, user, params: { id } }, res);
  return res;
}

// --- the permission matrix, on the helper itself -------------------------

test('canRegenerateInvoice: the OWNER may rebuild any invoice', async () => {
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 99, role: 'OWNER' }, REG_INVOICE), true);
});

test('canRegenerateInvoice: the partner that ISSUES it may', async () => {
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 1, role: 'WHITELABEL' }, REG_INVOICE), true);
});

// The reason canReadAccount is NOT reused. Whitelabel 1 sits above agency 2 and
// may READ everything in its subtree; the document below was issued by the
// agency, under the agency's RNC and out of the agency's numbering sequence, and
// is not the whitelabel's to rewrite.
test('canRegenerateInvoice: a partner ABOVE the issuer may read the invoice but not rebuild it', async () => {
  const issuedByAgency = { ...REG_INVOICE, profileId: 8 };
  const prisma = regPrisma();
  assert.strictEqual(await canReadInvoice(prisma, { id: 1, role: 'WHITELABEL' }, issuedByAgency), true);
  assert.strictEqual(await canRegenerateInvoice(prisma, { id: 1, role: 'WHITELABEL' }, issuedByAgency), false);
});

test('canRegenerateInvoice: a partner BELOW the issuer may not either', async () => {
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 2, role: 'AGENCY' }, REG_INVOICE), false);
});

// A client may download its own invoice and must never be able to rewrite a
// fiscal document its provider issued — which the read rule would have allowed.
test('canRegenerateInvoice: the client the invoice is addressed to may not rebuild it', async () => {
  const prisma = regPrisma();
  assert.strictEqual(await canReadInvoice(prisma, { id: 3, role: 'CLIENT' }, REG_INVOICE), true);
  assert.strictEqual(await canRegenerateInvoice(prisma, { id: 3, role: 'CLIENT' }, REG_INVOICE), false);
});

test('canRegenerateInvoice: an unrelated account, and no account at all, are refused', async () => {
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 9, role: 'WHITELABEL' }, REG_INVOICE), false);
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), null, REG_INVOICE), false);
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 1, role: 'WHITELABEL' }, null), false);
});

// A CLIENT issues nothing, so even a profile hanging off a client row does not
// turn its account into somebody who may rewrite documents.
test('canRegenerateInvoice: a CLIENT that somehow owns the profile is still refused, by role', async () => {
  const prisma = regPrisma({ profiles: { 7: { id: 7, ownerId: 3 } } });
  assert.strictEqual(await canRegenerateInvoice(prisma, { id: 3, role: 'CLIENT' }, REG_INVOICE), false);
});

test('canRegenerateInvoice: an orphaned invoice stays rebuildable by its issuer, not by the deleted account tree', async () => {
  const orphan = { ...REG_INVOICE, userId: null };
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 1, role: 'WHITELABEL' }, orphan), true);
  assert.strictEqual(await canRegenerateInvoice(regPrisma(), { id: 2, role: 'AGENCY' }, orphan), false);
});

test('canRegenerateInvoice: with the issuing profile gone, nobody but the OWNER may', async () => {
  const prisma = regPrisma({ profiles: {} });
  assert.strictEqual(await canRegenerateInvoice(prisma, { id: 1, role: 'WHITELABEL' }, REG_INVOICE), false);
  assert.strictEqual(await canRegenerateInvoice(prisma, { id: 99, role: 'OWNER' }, REG_INVOICE), true);
});

// --- the endpoint -------------------------------------------------------

test('regenerate: the issuer gets the rebuilt document, with its number and its issue date untouched', async () => {
  const prisma = regPrisma();
  const res = await callRegenerate(prisma, { id: 1, role: 'WHITELABEL' });

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.invoice.number, 'FAC-000124');
  assert.strictEqual(res.body.invoice.issuedAt.toISOString(), '2026-03-15T12:00:00.000Z');
  // The corrected RNC is on the document now; the frozen wrong one is gone.
  assert.strictEqual(res.body.invoice.issuer.issuerRnc, '1-01-00000-1');
  assert.strictEqual(res.body.invoice.client.rnc, '1-02-00000-2');
  assert.ok(res.body.invoice.regeneratedAt instanceof Date);
  assert.strictEqual(res.body.amountsRebuilt, true);
});

test('regenerate: the write never carries the fields that identify the document', async () => {
  const prisma = regPrisma();
  await callRegenerate(prisma, { id: 99, role: 'OWNER' });

  assert.strictEqual(prisma.writes.length, 1);
  assert.strictEqual(prisma.writes[0].where.id, 55);
  for (const key of ['number', 'profileId', 'userId', 'creditPurchaseId', 'issuedAt']) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(prisma.writes[0].data, key), false, `must not write ${key}`);
  }
});

test('regenerate: the amounts come back from the profile as it is now', async () => {
  // Same invoice, now issued under profile 8: 18% and 15 days to pay.
  const prisma = regPrisma({ invoice: { ...REG_INVOICE, profileId: 8 } });
  const res = await callRegenerate(prisma, { id: 2, role: 'AGENCY' });

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.invoice.taxRate, 18);
  assert.strictEqual(res.body.invoice.taxAmount, 18);
  assert.strictEqual(res.body.invoice.total, 118);
  // Recomputed from the UNCHANGED issue date plus the profile's current dueDays.
  assert.strictEqual(res.body.invoice.dueAt.toISOString(), '2026-03-30T12:00:00.000Z');
  // What the card paid is a fact about the payment and does not move.
  assert.strictEqual(res.body.invoice.amountPaid, 127);
});

// THE MISSING-PAYMENT CASE, end to end. The stored figures are the only
// surviving record of what was charged, so they are left exactly as they are and
// the answer says the amounts were not rebuilt.
test('regenerate: with the payment gone, the snapshots are refreshed and no money field is written', async () => {
  const prisma = regPrisma({ invoice: { ...REG_INVOICE, creditPurchaseId: null }, purchase: null });
  const res = await callRegenerate(prisma, { id: 1, role: 'WHITELABEL' });

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.amountsRebuilt, false);
  const written = prisma.writes[0].data;
  for (const key of ['subtotal', 'taxLabel', 'taxRate', 'taxAmount', 'retention',
    'total', 'amountPaid', 'totalInWords', 'conceptLines']) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(written, key), false, `must not rewrite ${key}`);
  }
  // Not invented as a zero: the document still says what it was issued saying.
  assert.strictEqual(res.body.invoice.total, 127);
  assert.strictEqual(res.body.invoice.amountPaid, 127);
  // And the point of the action still happened.
  assert.strictEqual(res.body.invoice.issuer.issuerRnc, '1-01-00000-1');
  assert.ok(res.body.invoice.regeneratedAt instanceof Date);
});

test('regenerate: with the account gone too, the client snapshot is kept rather than emptied', async () => {
  const prisma = regPrisma({
    invoice: { ...REG_INVOICE, userId: null, creditPurchaseId: null },
    purchase: null,
    client: null,
  });
  const res = await callRegenerate(prisma, { id: 1, role: 'WHITELABEL' });

  assert.strictEqual(res.code, 200);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(prisma.writes[0].data, 'clientSnapshot'), false);
  assert.strictEqual(res.body.invoice.client.company, 'Cliente SRL');
});

// 403 AND NOTHING WRITTEN. A refusal that still rewrote the row would be the
// whole risk of this feature with none of its control.
test('regenerate: the client it is addressed to is refused with 403 and nothing is written', async () => {
  const prisma = regPrisma();
  const res = await callRegenerate(prisma, { id: 3, role: 'CLIENT' });
  assert.strictEqual(res.code, 403);
  assert.match(res.body.error, /Solo quien emite/);
  assert.strictEqual(prisma.writes.length, 0);
});

test('regenerate: a partner above the issuer is refused with 403 and nothing is written', async () => {
  const prisma = regPrisma({ invoice: { ...REG_INVOICE, profileId: 8 } });
  const res = await callRegenerate(prisma, { id: 1, role: 'WHITELABEL' });
  assert.strictEqual(res.code, 403);
  assert.strictEqual(prisma.writes.length, 0);
});

test('regenerate: an invoice that does not exist, or a non-numeric id, is a 404 with no write', async () => {
  const missing = regPrisma();
  assert.strictEqual((await callRegenerate(missing, { id: 99, role: 'OWNER' }, '4242')).code, 404);
  const bad = regPrisma();
  assert.strictEqual((await callRegenerate(bad, { id: 99, role: 'OWNER' }, 'abc')).code, 404);
  assert.strictEqual(missing.writes.length + bad.writes.length, 0);
});

// Impossible today (Invoice.profileId is Restrict), and answered rather than
// crashed: there is simply nothing left to rebuild the document FROM.
test('regenerate: an invoice whose issuing profile is gone answers 409, not 500', async () => {
  const prisma = regPrisma({ profiles: {} });
  const res = await callRegenerate(prisma, { id: 99, role: 'OWNER' });
  assert.strictEqual(res.code, 409);
  assert.match(res.body.error, /no se puede regenerar/);
  assert.strictEqual(prisma.writes.length, 0);
});

test('present carries regeneratedAt, and null on a document never rebuilt', () => {
  const at = new Date('2026-10-07T10:00:00.000Z');
  assert.strictEqual(present(row({ regeneratedAt: at })).regeneratedAt, at);
  assert.strictEqual(present(row()).regeneratedAt, null);
});
