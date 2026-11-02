# Several issuer companies + per-client invoice history — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an issuer keep several complete issuer profiles ("companies"), assign one to each client, pick one per manual invoice, and see every invoice a client has, automatic and manual.

**Architecture:** `BillingProfile` stops being one-per-owner (`ownerId` loses `@unique`, gains `label` + `isDefault`), `User` gains `issuerProfileId`. One helper, `utils/issuerProfile.js → pickIssuerProfile(prisma, ownerId, clientId)`, replaces every `findUnique({ where: { ownerId } })`. The billing-profile API grows company CRUD; the invoices API grows a history list and a client→company assignment; the Facturas screen gets a company selector, an assignment selector and a history table.

**Tech Stack:** Express + Prisma 5 (Postgres, schema applied with `prisma db push` at container start), `node:test` with hand-written fake `prisma` objects, React + Vite client (no client tests; verify with `npm run build`).

**Spec:** `docs/superpowers/specs/2026-11-02-facturas-varias-empresas-design.md`

**Working directory:** `C:\Users\Jorge\agentia-empresas` (worktree, branch `feat/facturas-empresas`). Run server tests from `server/`: `node --test tests/*.test.js` (Windows Git Bash does not expand `**`; the glob in `npm test` is fine on Linux CI).

**Commit messages:** English, imperative, matching `git log` style; end each with
`Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## File map

| File | Change |
|---|---|
| `server/prisma/schema.prisma` | `BillingProfile`: drop `@unique` on `ownerId`, add `@@index([ownerId])`, `label`, `isDefault`, `assignedClients`. `User`: `billingProfiles BillingProfile[]`, `issuerProfileId`, `issuerProfile`. |
| `server/src/utils/issuerProfile.js` | **New.** `pickIssuerProfile`, `findOwnedProfile`, `listIssuerProfiles`. |
| `server/tests/issuerProfile.test.js` | **New.** |
| `server/src/utils/taxes.js` | `resolveTaxConfig` uses `pickIssuerProfile(prisma, partnerId, userId)`. |
| `server/tests/taxes.test.js` | Mocks `findUnique` → `findFirst`; new assigned-client test. |
| `server/src/services/invoiceService.js` | `resolveManualIssuerProfile` uses `pickIssuerProfile`. |
| `server/tests/invoiceService.test.js` | Mocks `findUnique` → `findFirst`; per-company numbering test. |
| `server/src/controllers/invoiceController.js` | `createManual` accepts `profileId`; new `listHistory`, `setAccountCompany`. |
| `server/src/routes/invoices.js` | `GET /history`, `PUT /accounts/:userId/company` (before `/:id`). |
| `server/tests/invoiceController.test.js` | Mocks `findUnique({ownerId})` → `findFirst`; tests for override, history, assignment. |
| `server/src/controllers/billingProfileController.js` | `label` in sanitizer; `get` lists companies; `set` updates the default; new `createCompany`, `updateCompany`, `makeDefault`, `removeCompany`. |
| `server/src/routes/billingProfile.js` | 4 new routes. |
| `server/tests/billingProfileController.test.js` | Fake prisma reworked; tests for the new handlers. |
| `client/src/services/api.js` | New calls. |
| `client/src/components/Dashboard/Invoices.jsx` | Company selector, assignment, history table, company in manual form. |

---

### Task 1: Schema

**Files:** Modify `server/prisma/schema.prisma` (model `User` ~line 138, model `BillingProfile` ~line 820)

- [ ] **Step 1: Edit `User`.** Replace

```prisma
  billingProfile              BillingProfile?       @relation("BillingProfileOwner")
```
with
```prisma
  // The issuer companies this account owns (one per legal entity it invoices
  // from). Was a single optional profile until an issuer could hold several.
  billingProfiles             BillingProfile[]      @relation("BillingProfileOwner")
  // The company that issues THIS account's invoices, chosen by its issuer.
  // Null = that issuer's default company. SetNull: deleting a company sends its
  // clients back to the default instead of failing.
  issuerProfileId             Int?
  issuerProfile               BillingProfile?       @relation("ClientIssuerProfile", fields: [issuerProfileId], references: [id], onDelete: SetNull)
```

- [ ] **Step 2: Edit `BillingProfile`.** Change `ownerId           Int       @unique` to `ownerId           Int`, and directly after the `owner` relation line add:

```prisma
  // The name the issuer knows this company by in the panel ("Nebo AI",
  // "Sword"). Never printed on a document - issuerName/brandName are.
  label             String    @default("Principal")
  // Exactly one per owner, kept so in code (billingProfileController). The
  // column default is TRUE on purpose: `prisma db push` then turns every profile
  // that existed before this column - at most one per owner - into its owner's
  // default, with no backfill. Every company created after the first is written
  // with isDefault: false explicitly.
  isDefault         Boolean   @default(true)
  // Clients whose invoices this company issues (User.issuerProfileId).
  assignedClients   User[]    @relation("ClientIssuerProfile")
```
and before the closing `}` of the model add `  @@index([ownerId])`.

- [ ] **Step 3: Validate and generate.**

Run (from `server/`): `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` and `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "Let an issuer own several billing profiles and assign one per client"
```

Note: from here until Task 5 is done the server would fail at runtime on `findUnique({ where: { ownerId } })` / `upsert({ where: { ownerId } })` (no longer unique). Do not deploy the branch before Task 5.

---

### Task 2: `pickIssuerProfile` and friends

**Files:** Create `server/src/utils/issuerProfile.js`, `server/tests/issuerProfile.test.js`

- [ ] **Step 1: Write the failing test** — `server/tests/issuerProfile.test.js`:

```js
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
```

- [ ] **Step 2: Run it** — `node --test tests/issuerProfile.test.js` → FAIL, `Cannot find module '../src/utils/issuerProfile'`.

- [ ] **Step 3: Implement** — `server/src/utils/issuerProfile.js`:

```js
// WHICH OF AN ISSUER'S COMPANIES ISSUES FOR A CLIENT.
//
// An issuer (the account resolved by getEffectiveBilling) may own several
// BillingProfiles, one per legal entity it invoices from. This is the only place
// that turns "issuer + client" into one of them, so automatic issuance, the tax
// added at checkout and hand-made invoices cannot disagree about which company
// a client belongs to:
//
//   1. the client's own assignment (User.issuerProfileId), but ONLY if that
//      company belongs to this issuer - an assignment left over from before the
//      client moved to another partner is ignored, never honoured;
//   2. otherwise the issuer's default (isDefault), falling back to its oldest
//      company if none is flagged;
//   3. null when the issuer has no company at all.
//
// Who the issuer IS stays the caller's question (resolveTaxConfig keeps its
// own_stripe gate; resolveManualIssuerProfile does not) - this only picks
// among that issuer's companies.

const BY_DEFAULT_THEN_AGE = [{ isDefault: 'desc' }, { id: 'asc' }];

async function pickIssuerProfile(prisma, ownerId, clientId = null) {
  if (!ownerId) return null;
  if (clientId) {
    const assigned = await prisma.billingProfile.findFirst({
      where: { ownerId, assignedClients: { some: { id: clientId } } },
    });
    if (assigned) return assigned;
  }
  return prisma.billingProfile.findFirst({ where: { ownerId }, orderBy: BY_DEFAULT_THEN_AGE });
}

/** One company, only if it belongs to `ownerId`; null otherwise (or for a non-numeric id). */
async function findOwnedProfile(prisma, ownerId, profileId) {
  const id = Number(profileId);
  if (!ownerId || !Number.isInteger(id)) return null;
  return prisma.billingProfile.findFirst({ where: { id, ownerId } });
}

/** All of an issuer's companies, default first, then oldest first. */
async function listIssuerProfiles(prisma, ownerId) {
  if (!ownerId) return [];
  return prisma.billingProfile.findMany({ where: { ownerId }, orderBy: BY_DEFAULT_THEN_AGE });
}

module.exports = { pickIssuerProfile, findOwnedProfile, listIssuerProfiles };
```

- [ ] **Step 4: Run it** — `node --test tests/issuerProfile.test.js` → `pass 8`, `fail 0`.

- [ ] **Step 5: Commit** — `git add server/src/utils/issuerProfile.js server/tests/issuerProfile.test.js && git commit -m "Pick which of an issuer's companies issues for a client"`

---

### Task 3: Automatic issuance and the checkout tax follow the client's company

**Files:** Modify `server/src/utils/taxes.js` (`resolveTaxConfig`), `server/tests/taxes.test.js`

- [ ] **Step 1: Update the existing mocks.** In `server/tests/taxes.test.js`, every mock of `billingProfile.findUnique` (lines ~110, 124, 146, 161, 171, 193, 256, 289, 326) becomes `billingProfile.findFirst` with the same body. The bodies that read `where.ownerId` keep working: `pickIssuerProfile` always passes `ownerId` in `where`.

Run: `grep -n "findUnique" tests/taxes.test.js` → only `user.findUnique` lines (if any) remain.

- [ ] **Step 2: Add the failing test** at the end of `server/tests/taxes.test.js`:

```js
test('resolveTaxConfig uses the company the client is assigned to, not the default', async () => {
  const A = { id: 5, ownerId: 9, isDefault: true, taxEnabled: true, chargeTaxToClient: false, taxRate: 27, taxLabel: 'ITBIS' };
  const B = { id: 6, ownerId: 9, isDefault: false, taxEnabled: true, chargeTaxToClient: true, taxRate: 18, taxLabel: 'ITBIS' };
  const prisma = {
    billingProfile: {
      findFirst: async ({ where }) => {
        if (where.assignedClients) return where.assignedClients.some.id === 1 ? B : null;
        return where.ownerId === 9 ? A : null;
      },
    },
  };
  const assigned = await resolveTaxConfig(prisma, 1, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(assigned.profile.id, 6);
  assert.strictEqual(assigned.taxRate, 18);
  assert.strictEqual(assigned.chargeTaxToClient, true);

  const other = await resolveTaxConfig(prisma, 2, { partnerId: 9, mode: 'own_stripe' });
  assert.strictEqual(other.profile.id, 5);
  assert.strictEqual(other.taxRate, 27);
});
```

- [ ] **Step 3: Run** — `node --test tests/taxes.test.js` → the new test FAILS (profile id 5 for client 1); the renamed mocks fail too until Step 4 (`findUnique is not a function`).

- [ ] **Step 4: Implement.** In `server/src/utils/taxes.js` add near the other requires:

```js
const { pickIssuerProfile } = require('./issuerProfile');
```
and in `resolveTaxConfig` replace
```js
    const profile = await prisma.billingProfile.findUnique({ where: { ownerId: partnerId } });
```
with
```js
    // The company that issues for THIS client: its assignment if it has one
    // under this partner, otherwise the partner's default (utils/issuerProfile).
    const profile = await pickIssuerProfile(prisma, partnerId, userId);
```

- [ ] **Step 5: Run** — `node --test tests/taxes.test.js` → all pass.

- [ ] **Step 6: Commit** — `git commit -am "Tax and issue a client's payments with the company it is assigned to"`

---

### Task 4: Manual invoices resolve the client's company; numbering stays per company

**Files:** Modify `server/src/services/invoiceService.js` (`resolveManualIssuerProfile`, ~line 408), `server/tests/invoiceService.test.js`

- [ ] **Step 1: Update mocks.** In `server/tests/invoiceService.test.js` rename the three `billingProfile.findUnique` mocks keyed on `ownerId` (lines ~355, ~1205, ~1257) to `findFirst`, bodies unchanged.

- [ ] **Step 2: Add the failing tests** at the end of `server/tests/invoiceService.test.js`:

```js
test('resolveManualIssuerProfile picks the client\'s assigned company', async () => {
  const A = { id: 1, ownerId: 10, isDefault: true };
  const B = { id: 2, ownerId: 10, isDefault: false };
  const users = {
    10: { id: 10, role: 'WHITELABEL', agencyId: null, whitelabelId: null, billingMode: 'own_stripe' },
    30: { id: 30, role: 'CLIENT', agencyId: 10, whitelabelId: null, billingMode: null },
  };
  const prisma = {
    user: { findUnique: async ({ where }) => users[where.id] || null },
    billingProfile: {
      findFirst: async ({ where }) => {
        if (where.assignedClients) return where.assignedClients.some.id === 30 ? B : null;
        return where.ownerId === 10 ? A : null;
      },
    },
  };
  assert.strictEqual((await resolveManualIssuerProfile(prisma, 30)).id, 2);
});

test('each company spends its own correlative: A, B, A gives A-1, B-1, A-2', async () => {
  const profiles = {
    1: { ...BASE_MANUAL_PROFILE_FOR_NUMBERING, id: 1, invoicePrefix: 'A-', invoicePadding: 1, invoiceNextNumber: 1 },
    2: { ...BASE_MANUAL_PROFILE_FOR_NUMBERING, id: 2, invoicePrefix: 'B-', invoicePadding: 1, invoiceNextNumber: 1 },
  };
  const numbers = [];
  const prisma = {
    $transaction: async (fn) => fn({
      billingProfile: {
        update: async ({ where, data }) => {
          profiles[where.id].invoiceNextNumber += data.invoiceNextNumber.increment;
          return { ...profiles[where.id] };
        },
      },
      invoice: { create: async ({ data }) => { numbers.push(data.number); return { id: numbers.length, ...data }; } },
    }),
  };
  const client = { id: 30, name: 'Cliente 30', email: 'c30@biz.com' };
  for (const id of [1, 2, 1]) {
    await issueManualInvoice(prisma, { profile: profiles[id], client, amount: 100, applyTaxes: false });
  }
  assert.deepStrictEqual(numbers, ['A-1', 'B-1', 'A-2']);
});
```

and, next to the other test constants at the top of that block, the profile those two companies are built from (a complete profile so `buildInvoiceData` has every field it reads):

```js
const BASE_MANUAL_PROFILE_FOR_NUMBERING = {
  ownerId: 10, taxEnabled: false, taxRate: 0, taxLabel: 'ITBIS', retentionRate: 0,
  retentionLabel: 'RETENCIÓN', dueDays: 0, issuerName: 'Empresa', issuerRnc: '1-01-00000-1',
};
```

Make sure `issueManualInvoice` and `resolveManualIssuerProfile` are in the file's `require('../src/services/invoiceService')` destructuring (add them if missing).

- [ ] **Step 3: Run** — `node --test tests/invoiceService.test.js` → the assigned-company test FAILS (gets 1). The numbering test should already PASS (it pins existing behaviour across two profiles); if it fails, stop and read the error before changing anything.

- [ ] **Step 4: Implement.** In `server/src/services/invoiceService.js` add `const { pickIssuerProfile } = require('../utils/issuerProfile');` with the other requires, and change the body of `resolveManualIssuerProfile` to:

```js
async function resolveManualIssuerProfile(prisma, userId) {
  const { partner } = await getEffectiveBilling(prisma, userId);
  if (!partner) return null;
  // Which of that partner's companies: the client's own, else the default.
  return pickIssuerProfile(prisma, partner.id, userId);
}
```
Append to its doc comment: ` * The COMPANY among the issuer's profiles is picked by utils/issuerProfile.js - the client's assignment, else the default - the same rule resolveTaxConfig uses.`

- [ ] **Step 5: Run** — `node --test tests/invoiceService.test.js` → all pass.

- [ ] **Step 6: Commit** — `git commit -am "Raise a manual invoice with the client's company by default"`

---

### Task 5: Billing-profile API — companies

**Files:** Modify `server/src/controllers/billingProfileController.js`, `server/src/routes/billingProfile.js`, `server/tests/billingProfileController.test.js`

- [ ] **Step 1: `label` in the sanitizer.** In `sanitizeProfileInput`, before `return { data };`, add:

```js
  // The company's name in the panel. Free text, short, never printed on a
  // document. Blank is refused rather than defaulted: two companies both called
  // "Principal" in one selector is how somebody invoices from the wrong one.
  if (body.label !== undefined) {
    const label = String(body.label ?? '').trim();
    if (!label) return { error: 'Ponle un nombre a la empresa.' };
    if (label.length > 60) return { error: 'El nombre de la empresa es demasiado largo (máximo 60 caracteres).' };
    data.label = label;
  }
```

- [ ] **Step 2: Rework the fake prisma in `server/tests/billingProfileController.test.js`** (the `fakePrisma` used by the handler tests, ~line 276) to an in-memory store, and update the existing assertions that name the old calls:

```js
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
```

In the existing tests: `calls.includes('profile.upsert')` → `calls.includes('profile.create') || calls.includes('profile.update')`; `!calls.includes('profile.upsert')` → `!calls.includes('profile.create') && !calls.includes('profile.update')`; `calls.includes('profile.findUnique')` → `calls.includes('profile.findMany')`.

- [ ] **Step 3: Add the failing tests** (same file, after the existing handler tests):

```js
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
```

(`LM`, `OTHER_PARTNER`, `fakeRes`, `get`, `set` are already defined higher in the file.)

- [ ] **Step 4: Run** — `node --test tests/billingProfileController.test.js` → new tests FAIL (`createCompany is not a function`), old handler tests fail on `findUnique`/`upsert`.

- [ ] **Step 5: Implement.** In `server/src/controllers/billingProfileController.js`:

Add `const { listIssuerProfiles, findOwnedProfile } = require('../utils/issuerProfile');` under the existing requires, and after `shape`:

```js
/** A company for the panel: its identity in the selector plus every profile field. */
function shapeCompany(profile) {
  return { id: profile.id, label: profile.label, isDefault: !!profile.isDefault, ...shape(profile) };
}

// The guard + account check every handler starts with. Returns the ownerId, or
// null after answering. Kept as one function so no new handler can forget the
// order: permission BEFORE any lookup, so a refused id says nothing about
// whether that account exists.
async function ownerFrom(req, res) {
  const ownerId = parseInt(req.params.userId);
  if (!Number.isFinite(ownerId)) { res.status(400).json({ error: 'Cuenta no válida.' }); return null; }
  if (!canConfigureBillingProfile(req.user, ownerId)) { res.status(403).json({ error: FORBIDDEN }); return null; }
  const owner = await req.prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
  if (!owner) { res.status(404).json({ error: 'Cuenta no encontrada.' }); return null; }
  return ownerId;
}

// Write `data` onto one company (existing) or create the owner's FIRST one.
// The numbering guard is the one `set` always had, now per company.
async function writeCompany(req, ownerId, existing, data) {
  if (existing && data.invoiceNextNumber !== undefined && data.invoiceNextNumber < existing.invoiceNextNumber) {
    const issued = await req.prisma.invoice.count({ where: { profileId: existing.id } });
    if (issued > 0) {
      return {
        error: `El próximo número de factura no puede retroceder por debajo de ${existing.invoiceNextNumber}: `
          + `ya hay ${issued} factura(s) emitidas con esa secuencia y los números se repetirían.`,
      };
    }
  }
  const profile = existing
    ? await req.prisma.billingProfile.update({ where: { id: existing.id }, data })
    : await req.prisma.billingProfile.create({
      data: { ownerId, isDefault: true, label: data.label || data.issuerName || 'Principal', ...data },
    });
  return { profile };
}

function audit(req, ownerId, action, profile, fields) {
  logAudit(req.prisma, {
    userId: ownerId,
    actorId: req.user.id,
    actorType: 'user',
    action,
    resourceType: 'billing_profile',
    resourceId: String(profile.id),
    // Field NAMES, never values: these rows hold bank details.
    details: {
      fields,
      label: profile.label,
      taxEnabled: profile.taxEnabled,
      chargeTaxToClient: profile.chargeTaxToClient,
      taxRate: profile.taxRate,
      retentionRate: profile.retentionRate,
    },
    req,
  });
}
```

Replace the body of `get` after the permission/owner checks (keep its doc comment) with the shared helper:

```js
const get = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const profiles = await listIssuerProfiles(req.prisma, ownerId);
    const def = profiles[0] || null;
    res.json({
      exists: !!def,
      ownerId,
      // The default company, in the shape every existing caller reads
      // (AccountManagement, and Facturas before it knew about companies).
      profile: shape(def),
      defaultId: def ? def.id : null,
      profiles: profiles.map(shapeCompany),
    });
  } catch (error) {
    console.error('Error reading the billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el perfil de facturación' });
  }
};
```

Replace `set` with (keep its long comments about permission-before-write; the upsert comment no longer applies):

```js
// PUT /api/billing-profile/:userId — the DEFAULT company (created if the owner
// has none yet). Kept so every caller written before companies existed still
// edits the profile it always edited.
const set = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No hay campos válidos para guardar.' });

    const [existing] = await listIssuerProfiles(req.prisma, ownerId);
    const out = await writeCompany(req, ownerId, existing || null, data);
    if (out.error) return res.status(400).json({ error: out.error });
    audit(req, ownerId, existing ? 'billing_profile.update' : 'billing_profile.create', out.profile, Object.keys(data));
    res.json({ exists: true, ownerId, profile: shape(out.profile), company: shapeCompany(out.profile) });
  } catch (error) {
    console.error('Error saving the billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el perfil de facturación' });
  }
};

// POST /api/billing-profile/:userId — a new company. Its own numbering starts
// wherever the body says (default FAC-000001 style). The first company an owner
// creates is its default; every later one is not.
const createCompany = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (!data.label) return res.status(400).json({ error: 'Ponle un nombre a la empresa.' });
    const count = await req.prisma.billingProfile.count({ where: { ownerId } });
    const profile = await req.prisma.billingProfile.create({ data: { ...data, ownerId, isDefault: count === 0 } });
    audit(req, ownerId, 'billing_profile.create', profile, Object.keys(data));
    res.status(201).json({ company: shapeCompany(profile) });
  } catch (error) {
    console.error('Error creating a company:', error.message);
    res.status(500).json({ error: 'No se pudo crear la empresa' });
  }
};

// PUT /api/billing-profile/:userId/:profileId — one company.
const updateCompany = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const existing = await findOwnedProfile(req.prisma, ownerId, req.params.profileId);
    if (!existing) return res.status(404).json({ error: 'Empresa no encontrada.' });
    const { data, error } = sanitizeProfileInput(req.body);
    if (error) return res.status(400).json({ error });
    if (Object.keys(data).length === 0) return res.status(400).json({ error: 'No hay campos válidos para guardar.' });
    const out = await writeCompany(req, ownerId, existing, data);
    if (out.error) return res.status(400).json({ error: out.error });
    audit(req, ownerId, 'billing_profile.update', out.profile, Object.keys(data));
    res.json({ company: shapeCompany(out.profile) });
  } catch (error) {
    console.error('Error saving a company:', error.message);
    res.status(500).json({ error: 'No se pudo guardar la empresa' });
  }
};

// POST /api/billing-profile/:userId/:profileId/default — one transaction, so
// there is never a moment with zero or two defaults.
const makeDefault = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const target = await findOwnedProfile(req.prisma, ownerId, req.params.profileId);
    if (!target) return res.status(404).json({ error: 'Empresa no encontrada.' });
    await req.prisma.$transaction([
      req.prisma.billingProfile.updateMany({ where: { ownerId }, data: { isDefault: false } }),
      req.prisma.billingProfile.update({ where: { id: target.id }, data: { isDefault: true } }),
    ]);
    audit(req, ownerId, 'billing_profile.default', target, ['isDefault']);
    res.json({ defaultId: target.id });
  } catch (error) {
    console.error('Error choosing the default company:', error.message);
    res.status(500).json({ error: 'No se pudo cambiar la empresa predeterminada' });
  }
};

// DELETE /api/billing-profile/:userId/:profileId — only a company that never
// issued (its invoices are fiscal records and Invoice.profile is Restrict) and
// that is not the default. Its assigned clients fall back to the default
// (User.issuerProfileId is SetNull).
const removeCompany = async (req, res) => {
  try {
    const ownerId = await ownerFrom(req, res);
    if (ownerId === null) return;
    const target = await findOwnedProfile(req.prisma, ownerId, req.params.profileId);
    if (!target) return res.status(404).json({ error: 'Empresa no encontrada.' });
    if (target.isDefault) return res.status(400).json({ error: 'No se puede eliminar la empresa predeterminada: elige otra como predeterminada primero.' });
    const issued = await req.prisma.invoice.count({ where: { profileId: target.id } });
    if (issued > 0) {
      return res.status(409).json({ error: `No se puede eliminar: ya emitió ${issued} factura(s), y esas facturas tienen que seguir existiendo.` });
    }
    await req.prisma.billingProfile.delete({ where: { id: target.id } });
    audit(req, ownerId, 'billing_profile.delete', target, []);
    res.json({ ok: true });
  } catch (error) {
    console.error('Error deleting a company:', error.message);
    res.status(500).json({ error: 'No se pudo eliminar la empresa' });
  }
};
```

and export them: `module.exports = { get, set, createCompany, updateCompany, makeDefault, removeCompany, shape, shapeCompany, sanitizeProfileInput, DEFAULTS };`

- [ ] **Step 6: Routes.** In `server/src/routes/billingProfile.js`, under the two existing routes:

```js
router.post('/:userId', requireRole(...ROLES_WITH_AN_ISSUER), controller.createCompany);
router.put('/:userId/:profileId', requireRole(...ROLES_WITH_AN_ISSUER), controller.updateCompany);
router.post('/:userId/:profileId/default', requireRole(...ROLES_WITH_AN_ISSUER), controller.makeDefault);
router.delete('/:userId/:profileId', requireRole(...ROLES_WITH_AN_ISSUER), controller.removeCompany);
```

- [ ] **Step 7: Run** — `node --test tests/billingProfileController.test.js` → all pass. Then the whole suite: `node --test tests/*.test.js` → only `invoiceController.test.js` failures may remain (fixed in Task 6).

- [ ] **Step 8: Commit** — `git commit -am "Manage an issuer's companies: list, create, edit, choose the default, delete unused ones"`

---

### Task 6: Invoices API — company override, history, assignment

**Files:** Modify `server/src/controllers/invoiceController.js`, `server/src/routes/invoices.js`, `server/tests/invoiceController.test.js`

- [ ] **Step 1: Update mocks.** In `server/tests/invoiceController.test.js`, the two `billingProfile.findUnique` mocks keyed on `where.ownerId` (~line 346 and ~828, inside `manualCtrlPrisma`) become `findFirst` with this body so they also answer `findOwnedProfile`:

```js
      findFirst: async ({ where }) => (where.ownerId === profile.ownerId && (where.id === undefined || where.id === profile.id) ? profile : null),
```
(at ~346 keep that block's own condition — `where.ownerId === 10 ...` — and add the same `where.id` clause). Leave the `profiles[where.id]` mocks at ~142 and ~574 as `findUnique`: getOne/regenerate still read by id.

- [ ] **Step 2: Add failing tests** (end of `server/tests/invoiceController.test.js`):

```js
const { listHistory, setAccountCompany } = require('../src/controllers/invoiceController');

test('createManual with profileId of the same issuer uses that company', async () => {
  const prisma = manualCtrlPrisma();
  const res = await callManual(prisma, ISSUER, { userId: 30, amount: 100, applyTaxes: false, profileId: 1 });
  assert.strictEqual(res.statusCode, 201);
});

test('createManual with a profileId of another issuer is refused before anything is written', async () => {
  const prisma = manualCtrlPrisma();
  const res = await callManual(prisma, ISSUER, { userId: 30, amount: 100, applyTaxes: false, profileId: 999 });
  assert.strictEqual(res.statusCode, 403);
  assert.strictEqual(prisma.created.length, 0);
});

function historyPrisma(invoices, user = { id: 30, issuerProfileId: 2 }) {
  return {
    user: { findUnique: async ({ where }) => (where.id === user.id ? user : MANUAL_TREE[where.id] || null) },
    billingProfile: { findFirst: async () => ({ id: 1, ownerId: 10, label: 'A', isDefault: true }) },
    invoice: {
      findMany: async ({ where, take }) => invoices.filter((i) => i.userId === where.userId).slice(0, take),
    },
  };
}

test('history lists manual and automatic invoices of the account, with company and kind', async () => {
  const invoices = [
    { id: 2, userId: 30, number: 'B-1', issuedAt: new Date('2026-11-02'), paidAt: null, total: 50, currency: 'USD', creditPurchaseId: null, conceptLines: JSON.stringify([{ description: 'Servicio', total: 50 }]), issuerSnapshot: '{}', profile: { label: 'B' } },
    { id: 1, userId: 30, number: 'A-7', issuedAt: new Date('2026-10-01'), paidAt: null, total: 127, currency: 'USD', creditPurchaseId: 9, conceptLines: '[]', issuerSnapshot: JSON.stringify({ name: 'Empresa A' }), profile: null },
  ];
  const res = fakeRes();
  await listHistory({ prisma: historyPrisma(invoices), user: { id: 1, role: 'OWNER' }, query: { forUserId: '30' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.deepStrictEqual(res.body.invoices.map((i) => [i.number, i.kind, i.companyLabel, i.concept]), [
    ['B-1', 'manual', 'B', 'Servicio'],
    ['A-7', 'automatic', 'Empresa A', ''],
  ]);
  assert.strictEqual(res.body.company.assignedProfileId, 2);
});

test('history refuses an account the requester cannot read', async () => {
  const res = fakeRes();
  await listHistory({ prisma: historyPrisma([]), user: { id: 60, role: 'AGENCY' }, query: { forUserId: '30' } }, res);
  assert.strictEqual(res.statusCode, 403);
});

test('assigning a company: the issuer may, to its own company only', async () => {
  const updates = [];
  const prisma = {
    ...manualCtrlPrisma(),
    user: {
      findUnique: async ({ where }) => MANUAL_TREE[where.id] || null,
      update: async ({ where, data }) => { updates.push([where.id, data.issuerProfileId]); return {}; },
    },
    auditLog: { create: async () => ({}) },
  };
  const ok = fakeRes();
  await setAccountCompany({ prisma, user: ISSUER, params: { userId: '30' }, body: { profileId: 1 }, headers: {}, socket: {} }, ok);
  assert.strictEqual(ok.statusCode, 200);
  assert.deepStrictEqual(updates, [[30, 1]]);

  const foreign = fakeRes();
  await setAccountCompany({ prisma, user: ISSUER, params: { userId: '30' }, body: { profileId: 999 }, headers: {}, socket: {} }, foreign);
  assert.strictEqual(foreign.statusCode, 403);

  const back = fakeRes();
  await setAccountCompany({ prisma, user: ISSUER, params: { userId: '30' }, body: { profileId: null }, headers: {}, socket: {} }, back);
  assert.strictEqual(back.statusCode, 200);
  assert.deepStrictEqual(updates.at(-1), [30, null]);

  const outsider = fakeRes();
  await setAccountCompany({ prisma, user: { id: 60, role: 'AGENCY' }, params: { userId: '30' }, body: { profileId: 1 }, headers: {}, socket: {} }, outsider);
  assert.strictEqual(outsider.statusCode, 403);
});
```

- [ ] **Step 3: Run** — `node --test tests/invoiceController.test.js` → new tests FAIL (`listHistory is not a function`, override accepted).

- [ ] **Step 4: Implement in `server/src/controllers/invoiceController.js`.**

Requires (top): add `const { findOwnedProfile } = require('../utils/issuerProfile');` and `const { logAudit } = require('../utils/auditLog');`.

In `createManual`, right after the `if (!profile) { ... 409 ... }` block and BEFORE the two permission checks, add:

```js
    // ONE INVOICE FROM ANOTHER OF THE SAME ISSUER'S COMPANIES. Only a company
    // of the issuer that governs this client: a profileId of anyone else is a
    // refusal, not a fallback, because printing another issuer's RNC on this
    // client's document is exactly what must be impossible.
    let issuerProfile = profile;
    if (req.body?.profileId !== undefined && req.body?.profileId !== null && req.body?.profileId !== '') {
      issuerProfile = await findOwnedProfile(req.prisma, profile.ownerId, req.body.profileId);
      if (!issuerProfile) return res.status(403).json({ error: 'Esa empresa no emite las facturas de este cliente.' });
    }
```
and use `issuerProfile` instead of `profile` in `canConfigureBillingProfile(req.user, issuerProfile.ownerId)` and in `issueManualInvoice(req.prisma, { profile: issuerProfile, ... })`.

Add the two handlers above `module.exports`:

```js
/**
 * EVERY INVOICE OF ONE ACCOUNT, automatic and manual, newest first.
 * GET /api/invoices/history?forUserId=&limit=
 *
 * Built from Invoice rows, not from payments - that is what lets a hand-made
 * invoice, which has no payment, be found again. Unlike listMine it does not
 * hang on taxEnabled: a manual invoice can exist for a client whose issuer shows
 * no tax. Same reader rule as listMine (canReadAccount).
 *
 * `kind` is 'automatic' while the payment behind the invoice still exists and
 * 'manual' otherwise; an automatic invoice whose payment was deleted reads as
 * manual, which is the only information left about it.
 */
const listHistory = async (req, res) => {
  try {
    const requested = parseInt(req.query.limit);
    const limit = Math.min(Number.isFinite(requested) && requested > 0 ? requested : DEFAULT_LIMIT, MAX_LIMIT);
    let subjectId = req.user.id;
    if (req.query.forUserId !== undefined) {
      subjectId = parseInt(req.query.forUserId);
      if (!Number.isFinite(subjectId)) return res.status(400).json({ error: 'Cuenta no válida.' });
    }
    if (!(await canReadAccount(req.prisma, req.user, subjectId))) {
      return res.status(403).json({ error: 'No puedes ver las facturas de esta cuenta.' });
    }

    const rows = await req.prisma.invoice.findMany({
      where: { userId: subjectId },
      orderBy: [{ issuedAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: { profile: { select: { id: true, label: true } } },
    });
    const invoices = rows.map((inv) => {
      const lines = parseSnapshot(inv.conceptLines, [], 'conceptLines', inv.id);
      const issuer = parseSnapshot(inv.issuerSnapshot, {}, 'issuerSnapshot', inv.id);
      return {
        id: inv.id,
        number: inv.number,
        issuedAt: inv.issuedAt,
        paidAt: inv.paidAt ?? null,
        total: inv.total,
        currency: inv.currency,
        concept: (Array.isArray(lines) && lines[0] && lines[0].description) || '',
        profileId: inv.profile ? inv.profile.id : inv.profileId ?? null,
        companyLabel: (inv.profile && inv.profile.label) || issuer.name || '',
        kind: inv.creditPurchaseId ? 'automatic' : 'manual',
      };
    });

    const account = await req.prisma.user.findUnique({ where: { id: subjectId } });
    const effective = await resolveManualIssuerProfile(req.prisma, subjectId).catch(() => null);
    res.json({
      accountId: subjectId,
      invoices,
      company: {
        assignedProfileId: account?.issuerProfileId ?? null,
        effectiveProfileId: effective ? effective.id : null,
        ownerId: effective ? effective.ownerId : null,
      },
    });
  } catch (error) {
    console.error('Error listing the invoice history:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el historial de facturas' });
  }
};

/**
 * WHICH COMPANY ISSUES THIS CLIENT'S INVOICES.
 * PUT /api/invoices/accounts/:userId/company   { profileId | null }
 *
 * null = the issuer's default. Only whoever issues for this client may change
 * it (the createManual rule: canConfigureBillingProfile on the governing issuer,
 * plus canReadAccount), and only to one of that issuer's own companies. Affects
 * FUTURE invoices only: issued ones keep their profileId and snapshot.
 */
const setAccountCompany = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ error: 'Cuenta no válida.' });
    if (!(await canReadAccount(req.prisma, req.user, userId))) {
      return res.status(403).json({ error: 'No puedes ver las facturas de esta cuenta.' });
    }
    const current = await resolveManualIssuerProfile(req.prisma, userId);
    if (!current) return res.status(409).json({ error: 'Este cliente no tiene un emisor de facturas configurado.' });
    if (!canConfigureBillingProfile(req.user, current.ownerId)) {
      return res.status(403).json({ error: 'Solo quien emite las facturas de este cliente puede cambiarle la empresa.' });
    }

    let profileId = null;
    if (req.body?.profileId !== undefined && req.body?.profileId !== null && req.body?.profileId !== '') {
      const target = await findOwnedProfile(req.prisma, current.ownerId, req.body.profileId);
      if (!target) return res.status(403).json({ error: 'Esa empresa no emite las facturas de este cliente.' });
      profileId = target.id;
    }
    await req.prisma.user.update({ where: { id: userId }, data: { issuerProfileId: profileId } });
    logAudit(req.prisma, {
      userId,
      actorId: req.user.id,
      actorType: 'user',
      action: 'billing_profile.assign',
      resourceType: 'user',
      resourceId: String(userId),
      details: { issuerProfileId: profileId },
      req,
    });
    res.json({ accountId: userId, assignedProfileId: profileId });
  } catch (error) {
    console.error('Error assigning the issuing company:', error.message);
    res.status(500).json({ error: 'No se pudo cambiar la empresa emisora' });
  }
};
```

Add both to `module.exports`. (`DEFAULT_LIMIT`, `MAX_LIMIT`, `parseSnapshot`, `canReadAccount`, `resolveManualIssuerProfile` already exist in this file.)

- [ ] **Step 5: Routes.** In `server/src/routes/invoices.js`, next to `router.post('/manual', ...)` and before `router.get('/:id', ...)`:

```js
router.get('/history', controller.listHistory);
router.put('/accounts/:userId/company', controller.setAccountCompany);
```

- [ ] **Step 6: Run** — `node --test tests/*.test.js` → all pass (previous 258 + new).

- [ ] **Step 7: Commit** — `git commit -am "List every invoice of an account and let its issuer choose the issuing company"`

---

### Task 7: Client API

**Files:** Modify `client/src/services/api.js`

- [ ] **Step 1:** In `invoicesAPI`, change `createManual` and add two calls:

```js
  createManual: ({ userId, amount, applyTaxes, concept, paidAt, profileId }) =>
    api.post('/invoices/manual', { userId, amount, applyTaxes, concept, paidAt, ...(profileId ? { profileId } : {}) }),
  // Every invoice of one account, automatic and manual, newest first, plus
  // which company issues for it: `{ accountId, invoices, company:
  // { assignedProfileId, effectiveProfileId, ownerId } }`.
  history: (forUserId, limit) => api.get('/invoices/history', {
    params: { ...(forUserId ? { forUserId } : {}), ...(limit ? { limit } : {}) },
  }),
  // Which of the issuer's companies issues this client's FUTURE invoices; null = the default.
  setCompany: (userId, profileId) => api.put(`/invoices/accounts/${userId}/company`, { profileId }),
```

In `billingProfileAPI` add:

```js
  // An issuer's companies. `get` answers `{ profiles, defaultId, profile }`
  // (`profile` = the default, as before); `save` keeps editing the default.
  createCompany: (userId, data) => api.post(`/billing-profile/${userId}`, data),
  updateCompany: (userId, profileId, data) => api.put(`/billing-profile/${userId}/${profileId}`, data),
  makeDefault: (userId, profileId) => api.post(`/billing-profile/${userId}/${profileId}/default`),
  removeCompany: (userId, profileId) => api.delete(`/billing-profile/${userId}/${profileId}`),
```

- [ ] **Step 2: Commit** — `git commit -am "Client calls for companies, invoice history and company assignment"`

---

### Task 8: Facturas screen — companies in the issuer panel

**Files:** Modify `client/src/components/Dashboard/Invoices.jsx`

- [ ] **Step 1: State.** Next to the issuer state (~line 201) add:

```jsx
  // The issuer's companies and the one the panel is editing. `companies` comes
  // from the same GET as the form; `companyId` null = "no company yet".
  const [companies, setCompanies] = useState([])
  const [companyId, setCompanyId] = useState(null)
  const [companyLabel, setCompanyLabel] = useState('')
```

- [ ] **Step 2: Load.** Replace the `try` body of `loadIssuer` with:

```jsx
      const { data } = await billingProfileAPI.get(user.id)
      const list = Array.isArray(data.profiles) ? data.profiles : []
      setCompanies(list)
      setIssuerExists(!!data.exists)
      // Keep the company that was on screen if it still exists, else the default.
      const keep = list.find((c) => c.id === companyId) || list.find((c) => c.isDefault) || null
      setCompanyId(keep ? keep.id : null)
      setCompanyLabel(keep ? keep.label : '')
      setIssuerForm(invoiceFormFrom(keep || data.profile))
      setIssuerError('')
```

- [ ] **Step 3: Select, create, default, delete, save.** Add below `loadIssuer`:

```jsx
  const selectCompany = (id) => {
    const c = companies.find((x) => String(x.id) === String(id))
    if (!c) return
    setCompanyId(c.id)
    setCompanyLabel(c.label)
    setIssuerForm(invoiceFormFrom(c))
    setIssuerMsg('')
    setIssuerError('')
  }

  // A new company starts from the empty form with its own numbering; the
  // issuer fills it in and saves.
  const createCompany = async () => {
    const label = window.prompt('Nombre de la nueva empresa (solo para ti, no se imprime):')
    if (!label || !label.trim()) return
    setIssuerError('')
    try {
      const { data } = await billingProfileAPI.createCompany(user.id, { label: label.trim(), ...invoicePayloadFrom(EMPTY_INVOICE_PROFILE) })
      setCompanyId(data.company.id)
      await loadIssuer()
      selectCompanyFrom(data.company)
      setIssuerMsg('Empresa creada. Completa sus datos y guarda.')
    } catch (err) {
      setIssuerError(err.response?.data?.error || 'No se pudo crear la empresa')
    }
  }
  const selectCompanyFrom = (c) => { setCompanyId(c.id); setCompanyLabel(c.label); setIssuerForm(invoiceFormFrom(c)) }

  const makeCompanyDefault = async () => {
    try {
      await billingProfileAPI.makeDefault(user.id, companyId)
      await loadIssuer()
      setIssuerMsg('Ahora es la empresa predeterminada.')
    } catch (err) {
      setIssuerError(err.response?.data?.error || 'No se pudo cambiar la predeterminada')
    }
  }

  const removeCompany = async () => {
    if (!window.confirm(`¿Eliminar la empresa «${companyLabel}»? Sus clientes pasan a la predeterminada.`)) return
    try {
      await billingProfileAPI.removeCompany(user.id, companyId)
      setCompanyId(null)
      await loadIssuer()
      setIssuerMsg('Empresa eliminada.')
    } catch (err) {
      setIssuerError(err.response?.data?.error || 'No se pudo eliminar la empresa')
    }
  }
```

In `saveIssuer`, replace the `billingProfileAPI.save(...)` call and the line after it with:

```jsx
      const payload = { ...invoicePayloadFrom(issuerForm), ...(companyId ? { label: companyLabel } : {}) }
      const { data } = companyId
        ? await billingProfileAPI.updateCompany(user.id, companyId, payload)
        : await billingProfileAPI.save(user.id, payload)
      const saved = data.company || data.profile
      setIssuerExists(true)
      setIssuerForm(invoiceFormFrom(saved))
      await loadIssuer()
```

- [ ] **Step 4: Render.** Inside the issuer panel, directly above `<BillingProfileFields`, add:

```jsx
                  <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] items-end">
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Empresa</label>
                      <select
                        value={companyId ?? ''}
                        onChange={(e) => selectCompany(e.target.value)}
                        disabled={companies.length === 0}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                      >
                        {companies.length === 0 && <option value="">Sin empresas todavía</option>}
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' (predeterminada)' : ''}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Nombre interno</label>
                      <input
                        value={companyLabel}
                        onChange={(e) => setCompanyLabel(e.target.value)}
                        disabled={!companyId}
                        maxLength={60}
                        className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={createCompany} className="px-3 py-2 text-sm border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover">＋ Nueva empresa</button>
                    </div>
                  </div>
                  {companyId && companies.length > 1 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {!companies.find((c) => c.id === companyId)?.isDefault && (
                        <>
                          <button onClick={makeCompanyDefault} className="px-3 py-1 rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300">Hacer predeterminada</button>
                          <button onClick={removeCompany} className="px-3 py-1 rounded-lg border border-red-300 text-red-600 dark:text-red-400">Eliminar</button>
                        </>
                      )}
                      <span className="text-gray-500 dark:text-gray-400 self-center">
                        La predeterminada emite para los clientes que no tienen empresa asignada. Una empresa con facturas no se puede eliminar.
                      </span>
                    </div>
                  )}
```

Change the panel subtitle text `Tu impuesto, la numeración de tus facturas y los datos del emisor que se imprimen en ellas.` to `Tus empresas emisoras: su impuesto, su numeración y los datos que se imprimen en sus facturas.` and the save button label to `Guardar empresa`.

- [ ] **Step 5: Build** — from `client/`: `npm run build` → `✓ built`.

- [ ] **Step 6: Commit** — `git commit -am "Choose, create and manage issuer companies from the Facturas panel"`

---

### Task 9: Facturas screen — client's company, history, company in the manual form

**Files:** Modify `client/src/components/Dashboard/Invoices.jsx`

- [ ] **Step 1: State.** Next to `manualCreated` add (and delete the `manualCreated` state, its comment block, its `setManualCreated` call in `createManual`, and the "Facturas creadas a mano en esta sesión" block in the JSX — the history replaces it):

```jsx
  // Every invoice of the selected account, and which company issues for it.
  // Same `subject` guard as the payments: rows are shown only while they are
  // about the account in the picker.
  const [history, setHistory] = useState({ subject: null, invoices: [], company: null })
  const [historyError, setHistoryError] = useState('')
  const [companySaving, setCompanySaving] = useState(false)
```

and add `profileId: ''` to the initial `manualForm` object.

- [ ] **Step 2: Load the history.** Add below `load`:

```jsx
  const historySeq = useRef(0)
  const loadHistory = async (id = accountId) => {
    if (!canManage || id === 'me') { setHistory({ subject: String(id), invoices: [], company: null }); return }
    const seq = ++historySeq.current
    try {
      const { data: res } = await invoicesAPI.history(id)
      if (historySeq.current !== seq) return
      setHistory({ subject: String(id), invoices: Array.isArray(res.invoices) ? res.invoices : [], company: res.company || null })
      setHistoryError('')
    } catch (err) {
      if (historySeq.current !== seq) return
      setHistory({ subject: String(id), invoices: [], company: null })
      setHistoryError(err.response?.data?.error || 'No se pudo cargar el historial de facturas')
    }
  }

  const assignCompany = async (value) => {
    setCompanySaving(true)
    try {
      await invoicesAPI.setCompany(Number(accountId), value === '' ? null : Number(value))
      await loadHistory()
      setNotice('Empresa emisora actualizada. Aplica a las próximas facturas de esta cuenta.')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar la empresa emisora')
    } finally {
      setCompanySaving(false)
    }
  }
```

Call it: in `selectAccount` after `load(value)` add `loadHistory(value)`; in the mount `useEffect`, after `load()`, add `loadHistory()`; in `createManual` after `load()` add `loadHistory()`; in `regenerateOpenInvoice` after `load()` add `loadHistory()`. Also make sure the issuer companies are loaded for managers: in the mount effect, inside `if (canManage) { ... }`, add `if (canConfigureIssuer) loadIssuer()`.

- [ ] **Step 3: Manual form defaults to the client's company.** In `toggleManual`, inside the `setManualForm` updater, add `profileId: f.profileId || (history.subject === String(accountId) && history.company?.effectiveProfileId ? String(history.company.effectiveProfileId) : ''),`. When the client select changes, fetch its company:

```jsx
                    onChange={async (e) => {
                      const userId = e.target.value
                      setManualForm(f => ({ ...f, userId, profileId: '' }))
                      if (!userId) return
                      try {
                        const { data: res } = await invoicesAPI.history(userId, 1)
                        const eff = res.company?.effectiveProfileId
                        setManualForm(f => (f.userId === userId ? { ...f, profileId: eff ? String(eff) : '' } : f))
                      } catch { /* the select stays on "la de este cliente" and the server decides */ }
                    }}
```

(replacing the existing `onChange` of the "Cliente" select). Add a fifth field to the form grid, after "Concepto":

```jsx
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa que emite</label>
                  <select
                    value={manualForm.profileId}
                    onChange={(e) => setManualForm(f => ({ ...f, profileId: e.target.value }))}
                    className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="">La de este cliente</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}{c.isDefault ? ' (predeterminada)' : ''}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Toma el siguiente número de esa empresa y se emite con sus datos. Cambiarla aquí vale solo para esta factura.
                  </p>
                </div>
```

Send it: in `createManual`'s `invoicesAPI.createManual({...})` add `profileId: manualForm.profileId ? Number(manualForm.profileId) : undefined,`.

Preview rates follow the chosen company: replace the line `const manualRetentionRate = Number(issuerForm.retentionRate) || 0` and the next one with:

```jsx
  const manualCompany = companies.find((c) => String(c.id) === String(manualForm.profileId))
    || companies.find((c) => c.isDefault) || issuerForm
  const manualRetentionRate = Number(manualCompany.retentionRate) || 0
  const manualTaxRate = manualCompany.taxEnabled ? (Number(manualCompany.taxRate) || 0) : 0
```
and in `manualRatePhrase` and the preview JSX replace `issuerForm.taxLabel` / `issuerForm.retentionLabel` with `manualCompany.taxLabel` / `manualCompany.retentionLabel`. Change the sentence `toma el siguiente número de <strong>tu</strong> numeración y se emite con <strong>tus</strong> datos de emisor` to `toma el siguiente número de la <strong>empresa que emite</strong> y se imprime con sus datos`.

- [ ] **Step 4: Render the client's company and history.** Directly below the account-picker block (after the amber "Estás viendo y emitiendo..." banner, still inside `{canManage && (...)}`), add:

```jsx
          {!viewingOwn && history.subject === String(accountId) && (
            <div className="mt-4 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 space-y-4">
              {canConfigureIssuer && companies.length > 0 && history.company?.effectiveProfileId != null && (
                <div className="max-w-md">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Empresa emisora de {subjectName}</label>
                  <select
                    value={history.company.assignedProfileId ?? ''}
                    disabled={companySaving}
                    onChange={(e) => assignCompany(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white"
                  >
                    <option value="">Predeterminada ({companies.find((c) => c.isDefault)?.label || '—'})</option>
                    {companies.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    Sus próximas facturas, automáticas y a mano, salen con esta empresa. Las ya emitidas no cambian.
                  </p>
                </div>
              )}

              <div>
                <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Historial de facturas</h2>
                {historyError && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{historyError}</p>}
                {!historyError && history.invoices.length === 0 && (
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">Todavía no hay facturas emitidas a esta cuenta.</p>
                )}
                {history.invoices.length > 0 && (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs uppercase text-gray-500 dark:text-gray-400">
                          <th className="py-2 pr-3">Nº</th><th className="py-2 pr-3">Fecha</th><th className="py-2 pr-3">Empresa</th>
                          <th className="py-2 pr-3">Concepto</th><th className="py-2 pr-3 text-right">Total</th><th className="py-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {history.invoices.map((inv) => (
                          <tr key={inv.id} className="border-t border-gray-100 dark:border-dark-border text-gray-700 dark:text-gray-300">
                            <td className="py-2 pr-3 font-medium">{inv.number}</td>
                            <td className="py-2 pr-3">{fmtDate(inv.paidAt || inv.issuedAt)}</td>
                            <td className="py-2 pr-3">{inv.companyLabel || '—'}</td>
                            <td className="py-2 pr-3">{inv.concept || (inv.kind === 'manual' ? 'Factura a mano' : 'Pago')}</td>
                            <td className="py-2 pr-3 text-right">{money(inv.total)}</td>
                            <td className="py-2 text-right">
                              <button onClick={() => openInvoiceById(inv.id)} className="text-primary-600 dark:text-primary-400 hover:underline">Ver</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
```

And add, next to `openInvoice`:

```jsx
  // From the history: an invoice that already exists, read by its id (the
  // document view offers Descargar itself).
  const openInvoiceById = async (id) => {
    try {
      const { data: res } = await invoicesAPI.get(id)
      setInvoice(res.invoice)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cargar la factura')
    }
  }
```

(`GET /api/invoices/:id` answers `{ invoice }` through `getOne`.)

- [ ] **Step 5: Build** — `npm run build` in `client/` → `✓ built`.

- [ ] **Step 6: Commit** — `git commit -am "Show a client's issuing company and every invoice it has on the Facturas screen"`

---

### Task 10: Full verification

- [ ] **Step 1:** `cd server && node --test tests/*.test.js` → `fail 0`.
- [ ] **Step 2:** `npx prisma validate` → valid.
- [ ] **Step 3:** `cd ../client && npm run build` → `✓ built`.
- [ ] **Step 4:** `grep -rn "billingProfile.findUnique({ where: { ownerId\|where: { ownerId }, create\|upsert" server/src` → no results (every owner-keyed lookup now goes through `utils/issuerProfile.js` or the controller's `listIssuerProfiles`).
- [ ] **Step 5:** Push the branch and open the PR against `main` (body ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`). Do not merge: deploying runs `prisma db push`, which drops the `ownerId` unique constraint and adds the columns on the production database — the owner merges.
