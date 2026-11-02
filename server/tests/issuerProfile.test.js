const test = require('node:test');
const assert = require('node:assert');
const { pickIssuerProfile, findOwnedProfile, listIssuerProfiles } = require('../src/utils/issuerProfile');

// Issuer 10 owns A (default) and B; issuer 60 owns C. Client 30 is assigned B,
// client 31 nothing, client 32 is assigned C (a stale assignment: 32 is under 10).
const ROWS = [
  { id: 1, ownerId: 10, label: 'A', isDefault: true },
  { id: 2, ownerId: 10, label: 'B', isDefault: false },
  { id: 3, ownerId: 60, label: 'C', isDefault: true },
];
const ASSIGNED = { 30: 2, 32: 3 };

function fakePrisma(rows = ROWS) {
  const matches = (r, where = {}) => {
    if (where.ownerId !== undefined && r.ownerId !== where.ownerId) return false;
    if (where.id !== undefined && r.id !== where.id) return false;
    const some = where.assignedClients?.some;
    if (some && ASSIGNED[some.id] !== r.id) return false;
    return true;
  };
  const ordered = (list, orderBy) => (orderBy
    ? [...list].sort((a, b) => (Number(b.isDefault) - Number(a.isDefault)) || (a.id - b.id))
    : list);
  return {
    billingProfile: {
      findFirst: async ({ where, orderBy }) => ordered(rows.filter((r) => matches(r, where)), orderBy)[0] || null,
      findMany: async ({ where, orderBy }) => ordered(rows.filter((r) => matches(r, where)), orderBy),
    },
  };
}

test('an assigned client gets its company', async () => {
  assert.strictEqual((await pickIssuerProfile(fakePrisma(), 10, 30)).label, 'B');
});

test('an unassigned client gets the default', async () => {
  assert.strictEqual((await pickIssuerProfile(fakePrisma(), 10, 31)).label, 'A');
});

test('a stale assignment to another issuer is ignored', async () => {
  assert.strictEqual((await pickIssuerProfile(fakePrisma(), 10, 32)).label, 'A');
});

test('no client given: the default', async () => {
  assert.strictEqual((await pickIssuerProfile(fakePrisma(), 10)).label, 'A');
});

test('with no default flagged, the oldest company answers', async () => {
  const rows = [{ id: 7, ownerId: 10, label: 'X', isDefault: false }, { id: 5, ownerId: 10, label: 'Y', isDefault: false }];
  assert.strictEqual((await pickIssuerProfile(fakePrisma(rows), 10, 31)).label, 'Y');
});

test('no owner or no profiles: null', async () => {
  assert.strictEqual(await pickIssuerProfile(fakePrisma(), null, 30), null);
  assert.strictEqual(await pickIssuerProfile(fakePrisma(), 99, 30), null);
});

test('findOwnedProfile only answers for the owner', async () => {
  assert.strictEqual((await findOwnedProfile(fakePrisma(), 10, 2)).label, 'B');
  assert.strictEqual(await findOwnedProfile(fakePrisma(), 10, 3), null);
  assert.strictEqual(await findOwnedProfile(fakePrisma(), 10, 'x'), null);
});

test('listIssuerProfiles puts the default first', async () => {
  assert.deepStrictEqual((await listIssuerProfiles(fakePrisma(), 10)).map((p) => p.label), ['A', 'B']);
});
