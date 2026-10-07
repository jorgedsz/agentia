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
// that still touched the row would pass a status-code-only assertion.
function fakePrisma(calls) {
  const record = (name) => (...args) => { calls.push(name); return args; };
  return {
    user: { findUnique: async () => { calls.push('user.findUnique'); return { id: 10 }; } },
    billingProfile: {
      findUnique: async () => { calls.push('profile.findUnique'); return null; },
      upsert: async ({ create }) => { calls.push('profile.upsert'); return { id: 5, ...create }; },
    },
    invoice: { count: async () => { calls.push('invoice.count'); return 0; } },
    auditLog: { create: async () => { calls.push('audit'); return {}; } },
    $record: record,
  };
}

function reqFor(user, userId, body = {}) {
  const calls = [];
  return [{ user, params: { userId: String(userId) }, body, prisma: fakePrisma(calls), headers: {}, socket: {} }, calls];
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
  assert.ok(calls.includes('profile.upsert'));
  assert.strictEqual(res.body.profile.taxRate, 27);
  assert.strictEqual(res.body.profile.issuerName, 'LM Consulting Group');
});

test('PUT: the OWNER still saves any account’s profile', async () => {
  const [req, calls] = reqFor(OWNER, LM.id, { taxRate: 27 });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(calls.includes('profile.upsert'));
});

test('PUT: the validations are untouched — an impossible rate is still refused, and before the upsert', async () => {
  const [req, calls] = reqFor(LM, LM.id, { taxRate: 270 });
  const res = fakeRes();
  await set(req, res);
  assert.strictEqual(res.statusCode, 400);
  assert.match(res.body.error, /entre 0 y 100/);
  assert.ok(!calls.includes('profile.upsert'));
});

test('GET: a partner reading its own profile is allowed', async () => {
  const [req, calls] = reqFor(LM, LM.id);
  const res = fakeRes();
  await get(req, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.exists, false);
  assert.strictEqual(res.body.ownerId, LM.id);
  assert.ok(calls.includes('profile.findUnique'));
});

