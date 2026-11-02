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
    chargeTaxToClient: '',
  });
  assert.strictEqual(data.taxRate, 27);
  assert.strictEqual(data.retentionRate, 0);
  assert.strictEqual(data.invoiceNextNumber, 124);
  assert.strictEqual(data.invoicePadding, 8);
  assert.strictEqual(data.dueDays, 30);
  assert.strictEqual(data.taxEnabled, true);
  assert.strictEqual(data.chargeTaxToClient, false);
});

// The two switches are independent all the way through the allow-list: the one
// that shows the tax on the invoices, and the one that also charges it to the
// client. Either can be posted without the other.
test('both tax switches reach the row, and each one on its own', () => {
  const both = sanitizeProfileInput({ taxEnabled: true, chargeTaxToClient: true }).data;
  assert.deepStrictEqual(both, { taxEnabled: true, chargeTaxToClient: true });

  const shownOnly = sanitizeProfileInput({ taxEnabled: true, chargeTaxToClient: false }).data;
  assert.deepStrictEqual(shownOnly, { taxEnabled: true, chargeTaxToClient: false });

  // A form section that posts only one of them must not blank the other.
  assert.deepStrictEqual(sanitizeProfileInput({ taxEnabled: true }).data, { taxEnabled: true });
  assert.deepStrictEqual(sanitizeProfileInput({ chargeTaxToClient: true }).data, { chargeTaxToClient: true });
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

// Free text, because an issuer writes its own form's name into it — but the
// column is NOT NULL and the row prints an amount, so a blank header is the one
// thing it may not become.
test('a blank retention label falls back to the default instead of printing a nameless row', () => {
  assert.strictEqual(sanitizeProfileInput({ retentionLabel: '   ' }).data.retentionLabel, 'RETENCIÓN');
  assert.strictEqual(sanitizeProfileInput({ retentionLabel: '' }).data.retentionLabel, 'RETENCIÓN');
  assert.strictEqual(sanitizeProfileInput({ retentionLabel: null }).data.retentionLabel, 'RETENCIÓN');
  assert.strictEqual(sanitizeProfileInput({ retentionLabel: ' Ret. IR-17 ' }).data.retentionLabel, 'Ret. IR-17');
});

test('a body that never mentions the retention label does not rewrite it', () => {
  assert.strictEqual('retentionLabel' in sanitizeProfileInput({ taxRate: 27 }).data, false);
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

test('exactly 0 and exactly 100 are allowed for the TAX', () => {
  assert.strictEqual(sanitizeProfileInput({ taxRate: 0 }).data.taxRate, 0);
  // A 100% tax merely doubles the bill. Odd, not undefined, so it stays legal.
  assert.strictEqual(sanitizeProfileInput({ taxRate: 100 }).data.taxRate, 100);
});

// THE RETENTION IS THE ONE THAT CANNOT REACH 100. The invoice's net is grossed
// up from what the client paid by dividing it by (1 - rate/100), so exactly 100
// divides by zero - see services/invoiceService.js, which throws rather than
// filing a document totalling Infinity. This is where it is stopped instead.
test('a retención of exactly 100 is refused, with the reason said out loud', () => {
  const { data, error } = sanitizeProfileInput({ retentionRate: 100 });
  assert.strictEqual(data, undefined);
  assert.match(error, /menor que 100/);
  assert.match(error, /no dejaría nada que pagar/);
});

test('a retención just under 100 is still allowed', () => {
  assert.strictEqual(sanitizeProfileInput({ retentionRate: 99.99 }).data.retentionRate, 99.99);
});

test('a retención above 100 is refused by the 0-100 range, before the division ever matters', () => {
  assert.match(sanitizeProfileInput({ retentionRate: 120 }).error, /entre 0 y 100/);
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
  // Nobody is charged anything extra until this is deliberately turned on.
  assert.strictEqual(out.chargeTaxToClient, false);
  assert.strictEqual(DEFAULTS.chargeTaxToClient, false);
  assert.strictEqual(out.taxRate, 0);
  assert.strictEqual(out.taxLabel, 'ITBIS');
  // The literal the document printed before the label was configurable, so an
  // issuer that never touches this keeps printing exactly what it printed.
  assert.strictEqual(out.retentionRate, 0);
  assert.strictEqual(out.retentionLabel, 'RETENCIÓN');
  assert.strictEqual(DEFAULTS.retentionLabel, 'RETENCIÓN');
  assert.strictEqual(out.invoicePrefix, 'FAC-');
  assert.strictEqual(out.invoiceNextNumber, 1);
  assert.strictEqual(out.invoicePadding, 6);
  assert.strictEqual(out.dueDays, 0);
  assert.strictEqual(out.issuerName, null);
});

test('shape returns only profile fields, never the row id or the owner id', () => {
  const out = shape({ id: 3, ownerId: 9, taxEnabled: true, chargeTaxToClient: true, taxRate: 27, createdAt: new Date() });
  assert.strictEqual(out.chargeTaxToClient, true);
  assert.strictEqual(out.id, undefined);
  assert.strictEqual(out.ownerId, undefined);
  assert.strictEqual(out.createdAt, undefined);
  assert.strictEqual(out.taxRate, 27);
  assert.strictEqual(out.taxEnabled, true);
});

// ---------------------------------------------------------------------------
// The permission matrix — who may configure whose invoicing
//
// The OWNER on any account; a WHITELABEL or an AGENCY on ITS OWN and nowhere
// else; a CLIENT nowhere, not even on itself. No database: the rule is decided
// from the requester and the id alone, which is exactly what lets the handlers
// apply it before they look anything up or write anything.
// ---------------------------------------------------------------------------

const { canConfigureBillingProfile } = require('../src/utils/accountAccess');

const OWNER = { id: 1, role: 'OWNER' };
const LM = { id: 10, role: 'WHITELABEL' };       // the reseller partner
const OTHER_PARTNER = { id: 20, role: 'WHITELABEL' };
const AGENCY = { id: 30, role: 'AGENCY' };        // an agency under LM
const CLIENT = { id: 40, role: 'CLIENT' };        // a client under that agency

test('the OWNER may configure somebody else’s profile', () => {
  assert.strictEqual(canConfigureBillingProfile(OWNER, LM.id), true);
  assert.strictEqual(canConfigureBillingProfile(OWNER, CLIENT.id), true);
  // Including its own, so the platform keeps the route it already had.
  assert.strictEqual(canConfigureBillingProfile(OWNER, OWNER.id), true);
});

test('a partner may configure its own profile — the whole point of this change', () => {
  assert.strictEqual(canConfigureBillingProfile(LM, LM.id), true);
});

test('a partner may NOT configure another account’s profile', () => {
  // A sibling whitelabel: reading it would leak its bank details, writing it
  // would mint an issuer under it.
  assert.strictEqual(canConfigureBillingProfile(LM, OTHER_PARTNER.id), false);
  // And not downward either: an agency inside its own subtree is still not it.
  assert.strictEqual(canConfigureBillingProfile(LM, AGENCY.id), false);
  assert.strictEqual(canConfigureBillingProfile(LM, CLIENT.id), false);
});

test('an agency may configure its own profile, and nothing above it', () => {
  assert.strictEqual(canConfigureBillingProfile(AGENCY, AGENCY.id), true);
  assert.strictEqual(canConfigureBillingProfile(AGENCY, LM.id), false);
  assert.strictEqual(canConfigureBillingProfile(AGENCY, CLIENT.id), false);
});

test('a CLIENT may not configure a profile, not even its own', () => {
  // Refused by ROLE, not by id: a client has no subtree and issues nothing, so
  // a profile on its row would be a dead issuer resolveTaxConfig never reads.
  assert.strictEqual(canConfigureBillingProfile(CLIENT, CLIENT.id), false);
  assert.strictEqual(canConfigureBillingProfile(CLIENT, LM.id), false);
});

test('no requester, or a role nobody recognises, is refused', () => {
  assert.strictEqual(canConfigureBillingProfile(null, LM.id), false);
  assert.strictEqual(canConfigureBillingProfile(undefined, LM.id), false);
  assert.strictEqual(canConfigureBillingProfile({ id: 10 }, 10), false);
  assert.strictEqual(canConfigureBillingProfile({ id: 10, role: 'SUPPORT' }, 10), false);
  assert.strictEqual(canConfigureBillingProfile({ id: 10, role: 'owner' }, 99), false);
});

test('a target that is not an id is refused rather than matched loosely', () => {
  assert.strictEqual(canConfigureBillingProfile(LM, undefined), false);
  assert.strictEqual(canConfigureBillingProfile(LM, null), false);
  assert.strictEqual(canConfigureBillingProfile(LM, 'abc'), false);
  assert.strictEqual(canConfigureBillingProfile(LM, 10.5), false);
  // A path parameter arrives as a string; the same account is still the same.
  assert.strictEqual(canConfigureBillingProfile(LM, '10'), true);
});

// ---------------------------------------------------------------------------
// The handlers apply it, and `set` applies it BEFORE the upsert
// ---------------------------------------------------------------------------

const { get, set } = require('../src/controllers/billingProfileController');

function fakeRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

// Every write path is a spy that FAILS the test if it is reached: a refusal
// that still touched the row would pass a status-code-only assertion. The
// profiles live in an in-memory store so the company handlers can be run end
// to end (`req.prisma.store` is what a test inspects afterwards).
function fakePrisma(calls, rows = []) {
  const store = rows.map((r) => ({ ...r }));
  let nextId = 100;
  const match = (r, where = {}) => (where.ownerId === undefined || r.ownerId === where.ownerId)
    && (where.id === undefined || r.id === where.id);
  const sorted = (list) => [...list].sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || (a.id - b.id));
  return {
    store,
    user: { findUnique: async () => { calls.push('user.findUnique'); return { id: 10 }; } },
    billingProfile: {
      findFirst: async ({ where }) => { calls.push('profile.findFirst'); return sorted(store.filter((r) => match(r, where)))[0] || null; },
      findMany: async ({ where }) => { calls.push('profile.findMany'); return sorted(store.filter((r) => match(r, where))); },
      count: async ({ where }) => store.filter((r) => match(r, where)).length,
      create: async ({ data }) => { calls.push('profile.create'); const row = { id: nextId++, isDefault: true, label: 'Principal', ...data }; store.push(row); return row; },
      update: async ({ where, data }) => { calls.push('profile.update'); const row = store.find((r) => r.id === where.id); Object.assign(row, data); return row; },
      updateMany: async ({ where, data }) => { calls.push('profile.updateMany'); store.filter((r) => match(r, where)).forEach((r) => Object.assign(r, data)); return { count: 1 }; },
      delete: async ({ where }) => { calls.push('profile.delete'); const i = store.findIndex((r) => r.id === where.id); return store.splice(i, 1)[0]; },
    },
    invoice: { count: async () => { calls.push('invoice.count'); return 0; } },
    auditLog: { create: async () => { calls.push('audit'); return {}; } },
    // makeDefault passes an array of already-started operations.
    $transaction: async (ops) => Promise.all(ops),
  };
}

function reqFor(user, userId, body = {}, { profileId, rows } = {}) {
  const calls = [];
  const params = { userId: String(userId), ...(profileId !== undefined ? { profileId: String(profileId) } : {}) };
  return [{ user, params, body, prisma: fakePrisma(calls, rows), headers: {}, socket: {} }, calls];
}

test('GET: a partner reading another account is refused before anything is read', async () => {
  const [req, calls] = reqFor(LM, OTHER_PARTNER.id);
  const res = fakeRes();
  await get(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(calls, []);
});

test('PUT: a partner writing another account is refused BEFORE the upsert', async () => {
  const [req, calls] = reqFor(LM, OTHER_PARTNER.id, { taxEnabled: true, taxRate: 27, issuerName: 'No soy yo' });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 403);
  // Nothing was created: the upsert keyed on that ownerId never ran, so no
  // issuer was minted under an account this partner does not own.
  assert.deepStrictEqual(calls, []);
});

test('PUT: a CLIENT is refused on its own id, with nothing written', async () => {
  const [req, calls] = reqFor(CLIENT, CLIENT.id, { taxEnabled: true, taxRate: 18 });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(calls, []);
});

test('PUT: no authenticated user is refused, with nothing written', async () => {
  const [req, calls] = reqFor(null, LM.id, { taxRate: 27 });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 403);
  assert.deepStrictEqual(calls, []);
});

test('PUT: a partner saving its OWN profile goes through to the upsert', async () => {
  const [req, calls] = reqFor(LM, LM.id, { taxEnabled: true, taxRate: 27, issuerName: 'LM Consulting Group' });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(calls.includes('profile.create') || calls.includes('profile.update'));
  assert.strictEqual(res.body.profile.taxRate, 27);
  assert.strictEqual(res.body.profile.issuerName, 'LM Consulting Group');
});

test('PUT: the OWNER still saves any account’s profile', async () => {
  const [req, calls] = reqFor(OWNER, LM.id, { taxRate: 27 });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(calls.includes('profile.create') || calls.includes('profile.update'));
});

test('PUT: the validations are untouched — an impossible rate is still refused, and before the upsert', async () => {
  const [req, calls] = reqFor(LM, LM.id, { taxRate: 270 });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /entre 0 y 100/);
  assert.ok(!calls.includes('profile.create') && !calls.includes('profile.update'));
});

test('GET: a partner reading its own profile is allowed', async () => {
  const [req, calls] = reqFor(LM, LM.id);
  const res = fakeRes();
  await get(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.exists, false);
  assert.strictEqual(res.body.ownerId, LM.id);
  assert.ok(calls.includes('profile.findMany'));
});


// ---------------------------------------------------------------------------
// Several companies per issuer
// ---------------------------------------------------------------------------

const { createCompany, updateCompany, makeDefault, removeCompany } = require('../src/controllers/billingProfileController');

const LM_A = { id: 1, ownerId: LM.id, label: 'A', isDefault: true, invoiceNextNumber: 5 };
const LM_B = { id: 2, ownerId: LM.id, label: 'B', isDefault: false, invoiceNextNumber: 1 };

test('GET lists every company, default first, and keeps `profile` = the default', async () => {
  const [req] = reqFor(LM, LM.id, {}, { rows: [LM_B, LM_A] });
  const res = fakeRes();
  await get(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.profiles.map((p) => p.label), ['A', 'B']);
  assert.strictEqual(res.body.defaultId, 1);
  assert.strictEqual(res.body.profile.invoiceNextNumber, 5);
});

test('PUT without an id updates the default company, not another one', async () => {
  const [req] = reqFor(LM, LM.id, { issuerName: 'Nuevo' }, { rows: [LM_A, LM_B] });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(req.prisma.store.find((r) => r.id === 1).issuerName, 'Nuevo');
  assert.strictEqual(req.prisma.store.find((r) => r.id === 2).issuerName, undefined);
});

test('POST creates a company; the first is the default, the next ones are not', async () => {
  const [req1] = reqFor(LM, LM.id, { label: 'Primera' });
  const res1 = fakeRes();
  await createCompany(req1, res1);
  assert.strictEqual(res1.statusCode, 201);
  assert.strictEqual(res1.body.company.isDefault, true);

  const [req2] = reqFor(LM, LM.id, { label: 'Segunda', invoicePrefix: 'S-' }, { rows: [LM_A] });
  const res2 = fakeRes();
  await createCompany(req2, res2);
  assert.strictEqual(res2.statusCode, 201);
  assert.strictEqual(res2.body.company.isDefault, false);
  assert.strictEqual(res2.body.company.invoicePrefix, 'S-');
});

test('POST without a name is refused, with nothing written', async () => {
  const [req, calls] = reqFor(LM, LM.id, { issuerName: 'X' });
  const res = fakeRes();
  await createCompany(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.ok(!calls.includes('profile.create'));
});

test('company writes are refused for another partner, before anything is read', async () => {
  for (const [fn, body, profileId] of [[createCompany, { label: 'X' }], [updateCompany, { label: 'X' }, 1], [makeDefault, {}, 1], [removeCompany, {}, 1]]) {
    const [req, calls] = reqFor(LM, OTHER_PARTNER.id, body, { profileId, rows: [LM_A] });
    const res = fakeRes();
    await fn(req, res);
    assert.strictEqual(res.statusCode, 403);
    assert.deepStrictEqual(calls, []);
  }
});

test('PUT /:profileId updates that company only, and 404s for a company of another owner', async () => {
  const [req] = reqFor(LM, LM.id, { label: 'B2' }, { profileId: 2, rows: [LM_A, LM_B] });
  const res = fakeRes();
  await updateCompany(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(req.prisma.store.find((r) => r.id === 2).label, 'B2');

  const [req2] = reqFor(LM, LM.id, { label: 'Z' }, { profileId: 2, rows: [{ ...LM_B, ownerId: 999 }] });
  const res2 = fakeRes();
  await updateCompany(req2, res2);
  assert.strictEqual(res2.statusCode, 404);
});

test('make default leaves exactly one default', async () => {
  const [req] = reqFor(LM, LM.id, {}, { profileId: 2, rows: [LM_A, LM_B] });
  const res = fakeRes();
  await makeDefault(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(req.prisma.store.filter((r) => r.isDefault).map((r) => r.id), [2]);
});

test('delete refuses the default and a company with invoices, and removes an unused one', async () => {
  const [reqDef] = reqFor(LM, LM.id, {}, { profileId: 1, rows: [LM_A, LM_B] });
  const resDef = fakeRes();
  await removeCompany(reqDef, resDef);
  assert.strictEqual(resDef.statusCode, 400);

  const [reqUsed] = reqFor(LM, LM.id, {}, { profileId: 2, rows: [LM_A, LM_B] });
  reqUsed.prisma.invoice.count = async () => 3;
  const resUsed = fakeRes();
  await removeCompany(reqUsed, resUsed);
  assert.strictEqual(resUsed.statusCode, 409);
  assert.match(resUsed.body.error, /3 factura/);

  const [reqOk, callsOk] = reqFor(LM, LM.id, {}, { profileId: 2, rows: [LM_A, LM_B] });
  const resOk = fakeRes();
  await removeCompany(reqOk, resOk);
  assert.strictEqual(resOk.statusCode, 200);
  assert.ok(callsOk.includes('profile.delete'));
});

test('the counter still may not move backwards once a company has issued', async () => {
  const [req] = reqFor(LM, LM.id, { invoiceNextNumber: 2 }, { profileId: 1, rows: [LM_A] });
  req.prisma.invoice.count = async () => 4;
  const res = fakeRes();
  await updateCompany(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /no puede retroceder/);
});
