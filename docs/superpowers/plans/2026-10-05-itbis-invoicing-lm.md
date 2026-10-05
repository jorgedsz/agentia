# ITBIS and Invoicing for LM Consulting — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Charge 27% Dominican tax on top of every charge made to an account under LM Consulting Group, and issue an invoice for each settled payment in the format their accountant uses.

**Architecture:** All money already flows through three functions — `createCreditCheckout` (hosted checkouts), `performOffSessionCharge` (saved-card charges) and `settleCreditPurchase` (the one place a payment becomes balance). Tax is resolved and added at the first two; the invoice is issued at the third. Everything is driven by a `BillingProfile` row hanging off the partner, so an account with no tax-enabled partner above it resolves to rate 0 and behaves exactly as it does today.

**Tech Stack:** Node 24 (built-in `node --test` runner — no new test dependency), Express, Prisma/PostgreSQL, React + Vite, `html2pdf.js` (already in the client).

**Spec:** `docs/superpowers/specs/2026-10-05-itbis-invoicing-lm-design.md`

**Branch:** `feature/itbis-facturas-lm` (already created from `main`).

---

## File Structure

**New — server:**

| File | Responsibility |
|---|---|
| `server/src/utils/taxes.js` | Resolve the tax governing an account; compute a breakdown. Pure arithmetic + one lookup. |
| `server/src/utils/numberToWords.js` | An amount as Spanish words, for the "EN LETRAS" band. Pure. |
| `server/src/services/invoiceService.js` | Allocate a number, write an `Invoice` with both snapshots. |
| `server/src/controllers/invoiceController.js` | Read invoices; issue on demand when one is missing. |
| `server/src/routes/invoices.js` | Routes for the above. |
| `server/src/controllers/billingProfileController.js` | OWNER reads/writes a partner's issuer profile. |
| `server/src/routes/billingProfile.js` | Routes for the above. |
| `server/tests/taxes.test.js` | Unit tests, no DB. |
| `server/tests/numberToWords.test.js` | Unit tests, no DB. |
| `server/tests/invoiceService.test.js` | Unit tests against a fake prisma, no DB. |

**New — client:**

| File | Responsibility |
|---|---|
| `client/src/components/Dashboard/ChargeBreakdown.jsx` | The Subtotal / ITBIS / Total block, shared by all four paying surfaces. |
| `client/src/components/Dashboard/InvoiceDocument.jsx` | The invoice itself, rendered from snapshots, plus its PDF download. |

**Modified — server:**

| File | Change |
|---|---|
| `server/prisma/schema.prisma` | `BillingProfile`, `Invoice`, 3 columns on `CreditPurchase`, 5 on `User`. |
| `server/src/services/creditCheckout.js` | Tax in `createCreditCheckout`; two Stripe line items. |
| `server/src/services/stripeService.js` | `createPaymentCheckout` takes `lines` instead of one amount. |
| `server/src/controllers/creditsController.js` | Tax in `performOffSessionCharge`; quote endpoint; corrected user-facing amounts. |
| `server/src/utils/creditSettlement.js` | Issue the invoice; settle billing periods by subtotal, not total. |
| `server/src/controllers/paymentPortalController.js` | Quote for the public page. |
| `server/src/services/paymentReport.js` | Breakdown in the emailed report. |
| `server/src/index.js` | Mount the two new routers. |

**Modified — client:**

| File | Change |
|---|---|
| `client/src/services/api.js` | `invoicesAPI`, `billingProfileAPI`, `creditsAPI.quote`. |
| `client/src/components/Dashboard/Credits.jsx` | Breakdown before paying; invoice download in history. |
| `client/src/components/Dashboard/AccountManagement.jsx` | The issuer-profile form; the client's fiscal fields. |
| `client/src/components/Dashboard/BillingPeriods.jsx` | Breakdown before charging. |
| `client/src/components/Public/PaymentPortalPage.jsx` | Breakdown before paying. |
| `client/src/components/Public/WalletPage.jsx` | Breakdown before paying. |

---

## Task 1: Tax computation

**Files:**
- Create: `server/src/utils/taxes.js`
- Create: `server/tests/taxes.test.js`
- Modify: `server/package.json` (add a `test` script)

- [ ] **Step 1: Add the test script**

This repo has no test runner. Node 24 has one built in, so nothing is installed. In `server/package.json`, add to `"scripts"`:

```json
"test": "node --test tests/"
```

- [ ] **Step 2: Write the failing test**

Create `server/tests/taxes.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { round2, computeCharge, resolveTaxConfig } = require('../src/utils/taxes');

const ITBIS = { taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' };
const NONE = { taxEnabled: false, taxRate: 0, taxLabel: 'ITBIS' };

test('round2 rounds half a cent up', () => {
  assert.strictEqual(round2(3.375), 3.38);
  assert.strictEqual(round2(0.005), 0.01);
  assert.strictEqual(round2(10), 10);
});

test('27% on a round amount', () => {
  const c = computeCharge(100, ITBIS);
  assert.deepStrictEqual(c, { subtotal: 100, taxRate: 27, taxLabel: 'ITBIS', taxAmount: 27, total: 127 });
});

test('27% landing on half a cent rounds up', () => {
  // 12.50 * 0.27 is exactly 3.375
  const c = computeCharge(12.5, ITBIS);
  assert.strictEqual(c.taxAmount, 3.38);
  assert.strictEqual(c.total, 15.88);
});

test('tax disabled leaves the amount alone', () => {
  const c = computeCharge(100, NONE);
  assert.strictEqual(c.taxAmount, 0);
  assert.strictEqual(c.total, 100);
  assert.strictEqual(c.taxRate, 0);
});

test('subtotal plus tax always equals total, to the cent', () => {
  for (const s of [1, 7.77, 12.5, 33.33, 99.99, 250, 1000.01]) {
    const c = computeCharge(s, ITBIS);
    assert.strictEqual(round2(c.subtotal + c.taxAmount), c.total, `failed at ${s}`);
  }
});

test('a client under a tax-enabled partner inherits the rate', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: { findUnique: async ({ where }) => (where.ownerId === 9 ? { id: 5, ownerId: 9, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS' } : null) },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9 });
  assert.strictEqual(cfg.taxEnabled, true);
  assert.strictEqual(cfg.taxRate, 27);
  assert.strictEqual(cfg.profile.id, 5);
});

test('a profile with the tax switched off resolves to rate 0', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: 9, billingMode: 'platform' }) },
    billingProfile: { findUnique: async () => ({ id: 5, ownerId: 9, taxEnabled: false, taxRate: 27, taxLabel: 'ITBIS' }) },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: 9 });
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
});

test('an account with no partner above it resolves to rate 0', async () => {
  const prisma = {
    user: { findUnique: async () => ({ id: 1, role: 'CLIENT', agencyId: null, billingMode: 'platform' }) },
    billingProfile: { findUnique: async () => null },
  };
  const cfg = await resolveTaxConfig(prisma, 1, { partnerId: null });
  assert.strictEqual(cfg.taxEnabled, false);
  assert.strictEqual(cfg.taxRate, 0);
  assert.strictEqual(cfg.profile, null);
});
```

The `{ partnerId }` third argument is an injection point so these tests need no `getEffectiveBilling` and no database. Production callers omit it and the function resolves the partner itself.

- [ ] **Step 3: Run the tests and watch them fail**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module '../src/utils/taxes'`

- [ ] **Step 4: Write the implementation**

Create `server/src/utils/taxes.js`:

```js
// The tax a partner adds on top of everything it charges its clients.
//
// LM Consulting Group bills from the Dominican Republic and collects 27% on
// every charge. The rule hangs off the partner (BillingProfile), and the whole
// subtree under it inherits — the same inheritance resolveReceiptEmail uses. An
// account with no tax-enabled partner above it resolves to rate 0, and every
// caller then behaves exactly as it did before this existed.

const { getEffectiveBilling } = require('./whopConfig');

/** Money is kept to the cent everywhere, rounded in exactly one place: here. */
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The breakdown for a charge. `subtotal` is always what the caller already
 * treats as the amount — credits requested, a cycle's outstanding, a period's
 * balance — and the tax goes ON TOP of it. What reaches the balance is the
 * subtotal; what the card pays is the total.
 */
function computeCharge(subtotal, taxConfig) {
  const rate = taxConfig?.taxEnabled ? (taxConfig.taxRate || 0) : 0;
  const base = round2(subtotal);
  const taxAmount = round2((base * rate) / 100);
  return {
    subtotal: base,
    taxRate: rate,
    taxLabel: taxConfig?.taxLabel || 'ITBIS',
    taxAmount,
    total: round2(base + taxAmount),
  };
}

/**
 * The tax governing `userId`. `options.partnerId` short-circuits the lookup of
 * who governs the account — used by tests, and by callers that already resolved
 * it. Never throws: a tax that cannot be resolved must not block a payment, so
 * anything unexpected reads as "no tax".
 */
async function resolveTaxConfig(prisma, userId, options = {}) {
  const NO_TAX = { profile: null, taxEnabled: false, taxRate: 0, taxLabel: 'ITBIS' };
  try {
    let partnerId = options.partnerId;
    if (partnerId === undefined) {
      const { partner } = await getEffectiveBilling(prisma, userId);
      partnerId = partner?.id ?? null;
    }
    if (!partnerId) return NO_TAX;

    const profile = await prisma.billingProfile.findUnique({ where: { ownerId: partnerId } });
    if (!profile) return NO_TAX;

    return {
      profile,
      taxEnabled: !!profile.taxEnabled,
      taxRate: profile.taxEnabled ? (profile.taxRate || 0) : 0,
      taxLabel: profile.taxLabel || 'ITBIS',
    };
  } catch (error) {
    console.error('[Taxes] Could not resolve the tax for user', userId, error.message);
    return NO_TAX;
  }
}

/** Resolve and compute in one call — what every charge path uses. */
async function resolveCharge(prisma, userId, subtotal) {
  const taxConfig = await resolveTaxConfig(prisma, userId);
  return { ...computeCharge(subtotal, taxConfig), profile: taxConfig.profile };
}

module.exports = { round2, computeCharge, resolveTaxConfig, resolveCharge };
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `cd server && npm test`
Expected: PASS — 8 passing

- [ ] **Step 6: Commit**

```bash
git add server/src/utils/taxes.js server/tests/taxes.test.js server/package.json
git commit -m "Work out the tax a partner adds on top of what it charges"
```

---

## Task 2: The amount in Spanish words

**Files:**
- Create: `server/src/utils/numberToWords.js`
- Create: `server/tests/numberToWords.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/tests/numberToWords.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { amountToSpanishWords } = require('../src/utils/numberToWords');

test('a round amount', () => {
  assert.strictEqual(amountToSpanishWords(127), 'CIENTO VEINTISIETE DÓLARES CON 00/100');
});

test('cents are shown as a fraction, not words', () => {
  assert.strictEqual(amountToSpanishWords(15.88), 'QUINCE DÓLARES CON 88/100');
});

test('one is singular', () => {
  assert.strictEqual(amountToSpanishWords(1), 'UN DÓLAR CON 00/100');
});

test('exactly one hundred is CIEN, not CIENTO', () => {
  assert.strictEqual(amountToSpanishWords(100), 'CIEN DÓLARES CON 00/100');
});

test('the twenties contract', () => {
  assert.strictEqual(amountToSpanishWords(21), 'VEINTIUN DÓLARES CON 00/100');
  assert.strictEqual(amountToSpanishWords(16), 'DIECISEIS DÓLARES CON 00/100');
});

test('thousands', () => {
  assert.strictEqual(amountToSpanishWords(1000), 'MIL DÓLARES CON 00/100');
  assert.strictEqual(amountToSpanishWords(2500.5), 'DOS MIL QUINIENTOS DÓLARES CON 50/100');
});

test('zero', () => {
  assert.strictEqual(amountToSpanishWords(0), 'CERO DÓLARES CON 00/100');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module '../src/utils/numberToWords'`

- [ ] **Step 3: Write the implementation**

Create `server/src/utils/numberToWords.js`:

```js
// The "TOTAL A PAGAR EN LETRAS" band on the invoice.
//
// Dominican invoices spell the whole units and leave the cents as a fraction:
// "CIENTO VEINTISIETE DÓLARES CON 00/100". Amounts here are invoice totals, so
// anything above a million is out of scope and reads as a plain number.

const UNITS = ['CERO', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE',
  'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISEIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE',
  'VEINTE', 'VEINTIUN', 'VEINTIDOS', 'VEINTITRES', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISEIS', 'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];
const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS',
  'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

/** 0–999 in words. */
function underThousand(n) {
  if (n === 100) return 'CIEN';
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts = [];
  if (h > 0) parts.push(HUNDREDS[h]);
  if (rest > 0) {
    if (rest < 30) parts.push(UNITS[rest]);
    else {
      const t = Math.floor(rest / 10);
      const u = rest % 10;
      parts.push(u > 0 ? `${TENS[t]} Y ${UNITS[u]}` : TENS[t]);
    }
  }
  if (parts.length === 0) return UNITS[0];
  return parts.join(' ');
}

/** 0–999,999 in words. */
function wholeInWords(n) {
  if (n < 1000) return underThousand(n);
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const head = thousands === 1 ? 'MIL' : `${underThousand(thousands)} MIL`;
  return rest > 0 ? `${head} ${underThousand(rest)}` : head;
}

/**
 * "CIENTO VEINTISIETE DÓLARES CON 00/100".
 * `currency` lets another invoice currency pass its own pair of words.
 */
function amountToSpanishWords(amount, currency = { one: 'DÓLAR', many: 'DÓLARES' }) {
  const cents = Math.round((amount + Number.EPSILON) * 100);
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, '0');
  const noun = whole === 1 ? currency.one : currency.many;
  return `${wholeInWords(whole)} ${noun} CON ${fraction}/100`;
}

module.exports = { amountToSpanishWords, wholeInWords };
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd server && npm test`
Expected: PASS — all tests in both files

- [ ] **Step 5: Commit**

```bash
git add server/src/utils/numberToWords.js server/tests/numberToWords.test.js
git commit -m "Spell an invoice total in Spanish for the EN LETRAS band"
```

---

## Task 3: Database schema

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add the two new models**

Append to `server/prisma/schema.prisma`, after the `CreditPurchase` model:

```prisma
// Who issues invoices, and on what terms. One row per partner that bills its
// own clients (LM Consulting Group). The whole subtree under that partner
// inherits the tax; see utils/taxes.js.
model BillingProfile {
  id                Int      @id @default(autoincrement())
  ownerId           Int      @unique
  owner             User     @relation("BillingProfileOwner", fields: [ownerId], references: [id], onDelete: Cascade)

  // Tax
  taxEnabled        Boolean  @default(false)
  taxRate           Float    @default(0) // percent, e.g. 27
  taxLabel          String   @default("ITBIS")
  retentionRate     Float    @default(0) // the RETENCIÓN row; 0 leaves it empty

  // Numbering
  invoicePrefix     String   @default("FAC-")
  invoiceNextNumber Int      @default(1)
  invoicePadding    Int      @default(6)

  // Issuer
  issuerName        String? // "RAZÓN SOCIAL DEL EMISOR"
  issuerRnc         String?
  logoUrl           String?
  brandName         String? // the large name in the header
  slogan            String?

  // Payment instructions
  bankName          String?
  bankAccount       String?
  swift             String?
  routingNumber     String?
  paymentMethod     String?
  paymentTerms      String?
  dueDays           Int      @default(0)

  // Footer — the two sites at the bottom of the format
  site1Name         String?
  site1Phone        String?
  site1City         String?
  site1Address      String?
  site2Name         String?
  site2Phone        String?
  site2City         String?
  site2Address      String?
  contactEmail      String?
  contactWeb        String?

  invoices          Invoice[]
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

// One invoice per settled payment. Both parties are snapshotted at issue time:
// when the issuer changes its RNC or a client moves office, invoices already
// issued must keep saying what they said.
model Invoice {
  id               Int            @id @default(autoincrement())
  number           String // "FAC-000124"
  profileId        Int
  profile          BillingProfile @relation(fields: [profileId], references: [id], onDelete: Cascade)
  userId           Int
  user             User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  creditPurchaseId Int            @unique
  creditPurchase   CreditPurchase @relation(fields: [creditPurchaseId], references: [id], onDelete: Cascade)

  currency         String         @default("USD")
  subtotal         Float
  taxLabel         String
  taxRate          Float
  taxAmount        Float
  retention        Float          @default(0)
  total            Float
  totalInWords     String
  conceptLines     String // JSON: the DESCRIPCIÓN rows
  issuerSnapshot   String // JSON
  clientSnapshot   String // JSON

  issuedAt         DateTime       @default(now())
  dueAt            DateTime?
  createdAt        DateTime       @default(now())

  @@unique([profileId, number])
  @@index([userId, issuedAt])
}
```

- [ ] **Step 2: Extend `CreditPurchase`**

In the `CreditPurchase` model, after the `credits` line, add:

```prisma
  subtotal              Float? // What reaches the balance, before tax. Equals `credits`.
  taxRate               Float    @default(0) // percent applied on top
  taxAmount             Float    @default(0) // what the tax added to `amount`
  invoice               Invoice?
```

And correct the two comments that are now load-bearing:

```prisma
  amount                Float // USD actually charged to the card — subtotal + taxAmount
  credits               Float // Credits added to the balance — the subtotal, never the taxed total
```

- [ ] **Step 3: Extend `User`**

In the `User` model, right after the `stripePaymentMethodIdBackup` line, add:

```prisma
  // ── Fiscal details printed on this account's invoices ──
  billingCompany              String?
  billingRnc                  String?
  billingAddress              String?
  billingCity                 String?
  billingPhone                String?
  billingProfile              BillingProfile?       @relation("BillingProfileOwner")
  invoices                    Invoice[]
```

- [ ] **Step 4: Check the schema parses**

Run: `cd server && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 5: Regenerate the client**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client`

This works without a database. **The migration itself needs one:** `server/.env` still points at the retired Railway host (`tramway.proxy.rlwy.net`), so `npx prisma migrate dev --name itbis_invoicing` must be run with the current AWS `DATABASE_URL` in hand. Ask for it before this step; do not invent one, and do not point it at anything but the real database.

`subtotal` is nullable so existing rows migrate without a default; Task 7 reads it as `purchase.subtotal ?? purchase.credits`, which is correct for every row written before this feature.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "Model an issuer's invoicing terms and the invoices it issues"
```

---

## Task 4: Issuing an invoice

**Files:**
- Create: `server/src/services/invoiceService.js`
- Create: `server/tests/invoiceService.test.js`

- [ ] **Step 1: Write the failing test**

Create `server/tests/invoiceService.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { formatNumber, conceptFor, buildInvoiceData } = require('../src/services/invoiceService');

const PROFILE = {
  id: 5, ownerId: 9, taxEnabled: true, taxRate: 27, taxLabel: 'ITBIS', retentionRate: 0,
  invoicePrefix: 'FAC-', invoiceNextNumber: 124, invoicePadding: 6, dueDays: 0,
  issuerName: 'LM CONSULTING GROUP USA LLC', issuerRnc: '1-31-12345-6',
  bankName: 'Banco Popular', bankAccount: '799-12345-6',
};

const CLIENT = {
  id: 1, email: 'cliente@ejemplo.com', name: 'Juan Pérez', companyName: 'Electroalambres SRL',
  billingCompany: 'Electroalambres SRL', billingRnc: '1-01-99999-9',
  billingAddress: 'Av. Principal 10', billingCity: 'Santo Domingo', billingPhone: '809-555-0100',
};

test('a number is the prefix plus a padded correlative', () => {
  assert.strictEqual(formatNumber(PROFILE, 124), 'FAC-000124');
  assert.strictEqual(formatNumber({ ...PROFILE, invoicePrefix: 'B02', invoicePadding: 8 }, 7), 'B0200000007');
});

test('the concept names what the client actually bought', () => {
  assert.strictEqual(conceptFor({ kind: 'manual' }), 'Recarga de saldo — créditos de consumo');
  assert.strictEqual(conceptFor({ kind: 'manual_card' }), 'Recarga de saldo — créditos de consumo');
  assert.strictEqual(conceptFor({ kind: 'auto_recharge' }), 'Recarga automática de saldo');
  assert.match(conceptFor({ kind: 'cycle_topup', periodStart: new Date('2026-09-01'), periodEnd: new Date('2026-09-30') }), /^Consumo del periodo /);
});

test('the invoice carries the breakdown and both snapshots', () => {
  const purchase = { id: 77, userId: 1, kind: 'manual', credits: 100, subtotal: 100, taxAmount: 27, taxRate: 27, amount: 127 };
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase, number: 'FAC-000124' });

  assert.strictEqual(data.number, 'FAC-000124');
  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxAmount, 27);
  assert.strictEqual(data.total, 127);
  assert.strictEqual(data.totalInWords, 'CIENTO VEINTISIETE DÓLARES CON 00/100');

  const issuer = JSON.parse(data.issuerSnapshot);
  assert.strictEqual(issuer.issuerName, 'LM CONSULTING GROUP USA LLC');
  assert.strictEqual(issuer.issuerRnc, '1-31-12345-6');

  const client = JSON.parse(data.clientSnapshot);
  assert.strictEqual(client.company, 'Electroalambres SRL');
  assert.strictEqual(client.rnc, '1-01-99999-9');
  assert.strictEqual(client.city, 'Santo Domingo');
});

test('a client with no fiscal fields falls back to what the account already has', () => {
  const bare = { id: 2, email: 'otro@ejemplo.com', name: 'Ana', companyName: 'Ana SRL' };
  const purchase = { id: 78, userId: 2, kind: 'manual', credits: 50, subtotal: 50, taxAmount: 13.5, taxRate: 27, amount: 63.5 };
  const client = JSON.parse(buildInvoiceData({ profile: PROFILE, client: bare, purchase, number: 'FAC-000125' }).clientSnapshot);
  assert.strictEqual(client.company, 'Ana SRL');
  assert.strictEqual(client.rnc, '');
  assert.strictEqual(client.email, 'otro@ejemplo.com');
});

test('an untaxed purchase still totals correctly', () => {
  const purchase = { id: 79, userId: 1, kind: 'manual', credits: 40, subtotal: 40, taxAmount: 0, taxRate: 0, amount: 40 };
  const data = buildInvoiceData({ profile: { ...PROFILE, taxEnabled: false, taxRate: 0 }, client: CLIENT, purchase, number: 'FAC-000126' });
  assert.strictEqual(data.taxAmount, 0);
  assert.strictEqual(data.total, 40);
});

test('due date follows the profile', () => {
  const purchase = { id: 80, userId: 1, kind: 'manual', credits: 10, subtotal: 10, taxAmount: 2.7, taxRate: 27, amount: 12.7 };
  const issuedAt = new Date('2026-10-05T12:00:00Z');
  const sameDay = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase, number: 'FAC-1', issuedAt });
  assert.strictEqual(sameDay.dueAt.getTime(), issuedAt.getTime());

  const in30 = buildInvoiceData({ profile: { ...PROFILE, dueDays: 30 }, client: CLIENT, purchase, number: 'FAC-2', issuedAt });
  assert.strictEqual(in30.dueAt.toISOString().slice(0, 10), '2026-11-04');
});
```

- [ ] **Step 2: Run the tests and watch them fail**

Run: `cd server && npm test`
Expected: FAIL — `Cannot find module '../src/services/invoiceService'`

- [ ] **Step 3: Write the implementation**

Create `server/src/services/invoiceService.js`:

```js
// Turning a settled payment into an invoice document.
//
// Called from creditSettlement, on the one path that actually credited the
// payment, so a payment can never produce two invoices. The unique constraint
// on creditPurchaseId is the backstop if that ever changes.

const { amountToSpanishWords } = require('../utils/numberToWords');
const { resolveTaxConfig } = require('../utils/taxes');

const day = (d) => new Intl.DateTimeFormat('es-DO', { timeZone: 'America/Santo_Domingo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d));

/** "FAC-" + 124 padded to 6 → "FAC-000124". */
function formatNumber(profile, correlative) {
  return `${profile.invoicePrefix || ''}${String(correlative).padStart(profile.invoicePadding || 6, '0')}`;
}

/** What the DESCRIPCIÓN row says, in the words the client will recognise. */
function conceptFor(purchase) {
  if (purchase.billingPeriodId) return 'Liquidación del periodo facturado';
  switch (purchase.kind) {
    case 'auto_recharge':
      return 'Recarga automática de saldo';
    case 'cycle_topup':
      return purchase.periodStart && purchase.periodEnd
        ? `Consumo del periodo ${day(purchase.periodStart)} – ${day(purchase.periodEnd)}`
        : 'Consumo del periodo';
    default:
      return 'Recarga de saldo — créditos de consumo';
  }
}

/** Everything the Invoice row holds, with both parties frozen as they are now. */
function buildInvoiceData({ profile, client, purchase, number, issuedAt = new Date() }) {
  const subtotal = purchase.subtotal ?? purchase.credits;
  const taxAmount = purchase.taxAmount || 0;
  const retention = 0; // v1 always 0; the row is rendered empty
  const total = Math.round((subtotal + taxAmount - retention + Number.EPSILON) * 100) / 100;

  const dueAt = new Date(issuedAt.getTime() + (profile.dueDays || 0) * 24 * 60 * 60 * 1000);

  return {
    number,
    profileId: profile.id,
    userId: client.id,
    creditPurchaseId: purchase.id,
    currency: 'USD',
    subtotal,
    taxLabel: profile.taxLabel || 'ITBIS',
    taxRate: purchase.taxRate || 0,
    taxAmount,
    retention,
    total,
    totalInWords: amountToSpanishWords(total),
    conceptLines: JSON.stringify([{ description: conceptFor(purchase), total: subtotal }]),
    issuerSnapshot: JSON.stringify({
      issuerName: profile.issuerName || '',
      issuerRnc: profile.issuerRnc || '',
      brandName: profile.brandName || '',
      slogan: profile.slogan || '',
      logoUrl: profile.logoUrl || '',
      bankName: profile.bankName || '',
      bankAccount: profile.bankAccount || '',
      swift: profile.swift || '',
      routingNumber: profile.routingNumber || '',
      paymentMethod: profile.paymentMethod || '',
      paymentTerms: profile.paymentTerms || '',
      site1: { name: profile.site1Name || '', phone: profile.site1Phone || '', city: profile.site1City || '', address: profile.site1Address || '' },
      site2: { name: profile.site2Name || '', phone: profile.site2Phone || '', city: profile.site2City || '', address: profile.site2Address || '' },
      contactEmail: profile.contactEmail || '',
      contactWeb: profile.contactWeb || '',
    }),
    clientSnapshot: JSON.stringify({
      company: client.billingCompany || client.companyName || client.name || '',
      rnc: client.billingRnc || '',
      address: client.billingAddress || '',
      city: client.billingCity || '',
      phone: client.billingPhone || client.phoneNumber || '',
      email: client.email || '',
    }),
    issuedAt,
    dueAt,
  };
}

/**
 * Issue the invoice for a settled purchase. Returns the Invoice, the existing
 * one if it was already issued, or null when no tax-enabled issuer governs the
 * account.
 *
 * The `taxEnabled` check is what makes the whole feature ship dark: a partner
 * whose profile exists but whose tax is still switched off keeps behaving
 * exactly as before — no tax, and no invoices either.
 */
async function issueInvoiceForPurchase(prisma, purchase) {
  const existing = await prisma.invoice.findUnique({ where: { creditPurchaseId: purchase.id } });
  if (existing) return existing;

  const { profile, taxEnabled } = await resolveTaxConfig(prisma, purchase.userId);
  if (!profile || !taxEnabled) return null;

  const client = await prisma.user.findUnique({ where: { id: purchase.userId } });
  if (!client) return null;

  // The correlative is taken with an atomic increment: Postgres serialises it,
  // so two payments settling at the same instant cannot take the same number.
  return prisma.$transaction(async (tx) => {
    const bumped = await tx.billingProfile.update({
      where: { id: profile.id },
      data: { invoiceNextNumber: { increment: 1 } },
    });
    const number = formatNumber(bumped, bumped.invoiceNextNumber - 1);
    return tx.invoice.create({ data: buildInvoiceData({ profile: bumped, client, purchase, number }) });
  });
}

module.exports = { issueInvoiceForPurchase, buildInvoiceData, formatNumber, conceptFor };
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `cd server && npm test`
Expected: PASS — all three test files

- [ ] **Step 5: Commit**

```bash
git add server/src/services/invoiceService.js server/tests/invoiceService.test.js
git commit -m "Issue an invoice for a settled payment, numbered without collisions"
```

---

## Task 5: Tax on hosted checkouts

**Files:**
- Modify: `server/src/services/stripeService.js:47-75`
- Modify: `server/src/services/creditCheckout.js:126-172`

- [ ] **Step 1: Let the Stripe checkout take several lines**

In `server/src/services/stripeService.js`, replace `createPaymentCheckout` with:

```js
async function createPaymentCheckout({ customerId, amount, lines, productName, description, metadata, successUrl, cancelUrl, saveCard, receiptEmail }, secretKey) {
  // `lines` shows the client a breakdown — credits on one line, tax on the next —
  // so the split reaches Stripe's own receipt and the dashboard where it is
  // reconciled. A single `amount` + `productName` still works for callers that
  // charge one undivided thing.
  const items = (lines && lines.length ? lines : [{ name: productName, amount }])
    .filter((l) => l.amount > 0)
    .map((l) => ({
      quantity: 1,
      price_data: { currency: 'usd', unit_amount: toCents(l.amount), product_data: { name: l.name } },
    }));

  return client(secretKey).checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    line_items: items,
    metadata: metadata || {},
    payment_intent_data: {
      ...(saveCard ? { setup_future_usage: 'off_session' } : {}),
      ...(description ? { description } : {}),
      ...(receiptEmail ? { receipt_email: receiptEmail } : {}),
      metadata: metadata || {},
    },
    success_url: withSessionId(successUrl),
    cancel_url: cancelUrl,
  });
}
```

- [ ] **Step 2: Add the tax in `createCreditCheckout`**

In `server/src/services/creditCheckout.js`, add to the imports at the top:

```js
const { resolveCharge } = require('../utils/taxes');
```

Then, inside `createCreditCheckout`, immediately after the `manualTopUpBlocker` check and before the Stripe branch:

```js
  // The amount asked for is the subtotal; the tax goes on top. What reaches the
  // balance is always the subtotal — the client gets the credits they asked for
  // and the card pays the tax as well.
  const charge = await resolveCharge(prisma, userId, amount);
```

Replace the Stripe branch's purchase creation and checkout call:

```js
    const period = await nextPeriodFor(prisma, userId);
    const purchase = await prisma.creditPurchase.create({
      data: {
        userId,
        amount: charge.total,
        credits: charge.subtotal,
        subtotal: charge.subtotal,
        taxRate: charge.taxRate,
        taxAmount: charge.taxAmount,
        status: 'pending',
        kind: 'manual',
        ...period,
      },
    });

    const session = await stripeService.createPaymentCheckout({
      customerId,
      amount: charge.total,
      lines: [
        { name: `${creditsLabel('manual')} ($${charge.subtotal})`, amount: charge.subtotal },
        { name: `${charge.taxLabel} (${charge.taxRate}%)`, amount: charge.taxAmount },
      ],
      description: `${creditsLabel('manual')} $${charge.subtotal} · ${user.companyName || user.name || user.email}`,
      receiptEmail: await resolveReceiptEmail(prisma, user),
      metadata: {
        userId: String(userId),
        type: 'credits',
        purchaseId: String(purchase.id),
        credits: String(charge.subtotal),
        subtotal: String(charge.subtotal),
        taxRate: String(charge.taxRate),
        taxAmount: String(charge.taxAmount),
      },
      successUrl,
      cancelUrl,
      saveCard: true,
    }, stripe.secretKey);
```

and its return:

```js
    return { provider: 'stripe', checkoutUrl: session.url, purchaseId: purchase.id, amount: charge.total, breakdown: charge };
```

- [ ] **Step 3: Do the same on the Whop branch**

Whop takes one price and ignores the plan name we pass, so the breakdown lives only in our invoice. No LM account uses this path; it is kept correct rather than optimised. Replace the plan creation, the pending row and the return:

```js
  const plan = await whopService.createPlan(creditsProductId, {
    price: charge.total,
    billingCycle: 'lifetime',
    name: `${creditsLabel('manual')} ($${charge.subtotal})`,
  }, whop.config);

  const session = await whopService.createCheckoutSession({
    planId: plan.id,
    metadata: { userId: String(userId), type: 'credits', credits: String(charge.subtotal) },
    redirectUrl: successUrl,
  }, whop.config);

  await prisma.creditPurchase.create({
    data: {
      userId,
      amount: charge.total,
      credits: charge.subtotal,
      subtotal: charge.subtotal,
      taxRate: charge.taxRate,
      taxAmount: charge.taxAmount,
      status: 'pending',
      whopPlanId: plan.id,
      ...(await nextPeriodFor(prisma, userId)),
    },
  }).catch((err) => console.error('[Credits] Failed to create pending purchase:', err.message));

  return { checkoutId: session.id, planId: plan.id, purchaseUrl: session.purchase_url, amount: charge.total, breakdown: charge };
```

- [ ] **Step 4: Check nothing broke at load time**

Run: `cd server && node -e "require('./src/services/creditCheckout'); require('./src/services/stripeService'); console.log('ok')"`
Expected: `ok`

Run: `cd server && npm test`
Expected: PASS — the unit tests still pass

- [ ] **Step 5: Commit**

```bash
git add server/src/services/creditCheckout.js server/src/services/stripeService.js
git commit -m "Charge the tax on hosted checkouts, as its own line"
```

---

## Task 6: Tax on saved-card charges

**Files:**
- Modify: `server/src/controllers/creditsController.js:703-800`

This one change covers four callers: one-click top-up, auto-recharge, `cycleBilling.js` and `billingPeriodController.js`. None of them changes: they keep passing the subtotal they already compute.

- [ ] **Step 1: Add the import**

At the top of `server/src/controllers/creditsController.js`:

```js
const { resolveCharge } = require('../utils/taxes');
```

- [ ] **Step 2: Resolve the charge once, at the top of the function**

In `performOffSessionCharge`, right after the `periodData` block:

```js
  // `amount` is the subtotal every caller already computes — credits asked for,
  // a cycle's outstanding, a period's balance. The tax goes on top of it: the
  // card pays `charge.total`, the balance receives `charge.subtotal`.
  const charge = await resolveCharge(prisma, user.id, amount);
```

- [ ] **Step 3: Use it on the Stripe path**

Replace the pending-row creation and the `chargeOffSession` call:

```js
    const purchase = await prisma.creditPurchase.create({
      data: {
        userId: user.id,
        amount: charge.total,
        credits: charge.subtotal,
        subtotal: charge.subtotal,
        taxRate: charge.taxRate,
        taxAmount: charge.taxAmount,
        status: 'pending',
        kind,
        paymentMethodId,
        ...periodData,
      },
    });

    let intent;
    try {
      intent = await stripeService.chargeOffSession({
        customerId,
        paymentMethodId,
        amount: charge.total,
        description: `${creditsLabel(kind)} ($${charge.subtotal})`,
        idempotencyKey: ['auto_recharge', 'cycle_topup'].includes(kind)
          ? `${kind}:${user.id}:${paymentMethodId}:${Math.floor(Date.now() / AUTO_RECHARGE_COOLDOWN_MS)}`
          : undefined,
        receiptEmail: await resolveReceiptEmail(prisma, user),
        metadata: {
          userId: String(user.id), type: 'credits', kind,
          purchaseId: String(purchase.id), credits: String(charge.subtotal),
          subtotal: String(charge.subtotal), taxRate: String(charge.taxRate), taxAmount: String(charge.taxAmount),
        },
      }, stripe.secretKey);
    } catch (err) {
```

The idempotency key is deliberately left alone: it keys on user, card and time window, never on amount, so adding tax cannot open a double-charge window.

- [ ] **Step 4: Use it on the Whop path**

Replace the Whop `chargeOffSession` amount and the pending row it writes:

```js
  const payment = await whopService.chargeOffSession({
    memberId,
    userId: user.whopCustomerId || null,
    paymentMethodId,
    amount: charge.total,
    metadata: { userId: String(user.id), type: 'credits', kind, credits: String(charge.subtotal) },
  }, whop.config);

  const planId = payment.plan?.id || payment.plan_id || null;
  await prisma.creditPurchase.create({
    data: {
      userId: user.id,
      amount: charge.total,
      credits: charge.subtotal,
      subtotal: charge.subtotal,
      taxRate: charge.taxRate,
      taxAmount: charge.taxAmount,
      status: 'pending',
      kind,
      whopPlanId: planId,
      paymentMethodId,
      ...periodData,
    },
  }).catch((e) => console.error('[Credits] Failed to record pending off-session purchase:', e.message));
```

- [ ] **Step 5: Check it loads**

Run: `cd server && node -e "require('./src/controllers/creditsController'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 6: Commit**

```bash
git add server/src/controllers/creditsController.js
git commit -m "Charge the tax on saved-card charges too"
```

---

## Task 7: Settlement — issue the invoice, and settle periods by subtotal

**Files:**
- Modify: `server/src/utils/creditSettlement.js`

This task contains the one line that is a **bug if missed**: `applyPayment` is currently handed `purchase.amount`, which is now the taxed total. A client who pays $127 ($100 of consumption + $27 tax) would have $127 knocked off the month they owe.

- [ ] **Step 1: Correct the billing-period settlement and issue the invoice**

In `server/src/utils/creditSettlement.js`, replace the block after the balance update:

```js
  console.log(`[Credits] Added ${purchase.credits} credits to user ${purchase.userId} (purchase #${purchase.id})`);

  // Paying a specific month settles that statement, not just the running balance.
  // It settles by the SUBTOTAL: the tax on top is the issuer's, not a payment
  // against the month's consumption.
  if (purchase.billingPeriodId) {
    await require('../services/billingPeriods')
      .applyPayment(prisma, purchase.billingPeriodId, purchase.subtotal ?? purchase.credits)
      .catch((err) => console.error('[Credits] Could not settle the billing period:', err.message));
  }

  // The invoice for this payment. Fire-and-forget on purpose, like the report
  // below: the money is in and the balance is updated, so a failure to issue the
  // document must never turn a good payment into an error. A payment left
  // without one is repaired the first time anybody asks for it, through
  // GET /api/invoices/by-purchase/:purchaseId.
  require('../services/invoiceService')
    .issueInvoiceForPurchase(prisma, purchase)
    .catch((err) => console.error('[Credits] Could not issue the invoice:', err.message));

  // Email the client the usage this payment covers. Fire-and-forget on purpose:
  // the money is already in and the balance already updated, so a mail problem
  // must never turn a good payment into an error.
  require('../services/paymentReport')
    .sendPaymentReport(prisma, purchase)
    .catch((err) => console.error('[Credits] Payment report failed:', err.message));

  return true;
```

- [ ] **Step 2: Check it loads**

Run: `cd server && node -e "require('./src/utils/creditSettlement'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 3: Commit**

```bash
git add server/src/utils/creditSettlement.js
git commit -m "Issue the invoice on settlement, and settle periods by the subtotal"
```

---

## Task 8: Quote endpoints

**Files:**
- Modify: `server/src/controllers/creditsController.js`
- Modify: `server/src/routes/credits.js`
- Modify: `server/src/controllers/paymentPortalController.js`

- [ ] **Step 1: Add the quote handler**

In `server/src/controllers/creditsController.js`, before `module.exports`:

```js
/**
 * What an amount will actually cost, before the client commits to paying it.
 * GET /api/credits/quote?amount=100
 */
const getQuote = async (req, res) => {
  try {
    const subtotal = Math.round(parseFloat(req.query.amount) * 100) / 100;
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    const charge = await resolveCharge(req.prisma, req.user.id, subtotal);
    res.json({
      subtotal: charge.subtotal,
      taxRate: charge.taxRate,
      taxLabel: charge.taxLabel,
      taxAmount: charge.taxAmount,
      total: charge.total,
    });
  } catch (error) {
    console.error('Error quoting a charge:', error.message);
    res.status(500).json({ error: 'No se pudo calcular el total' });
  }
};
```

Add `getQuote` to the `module.exports` object.

- [ ] **Step 2: Route it**

In `server/src/routes/credits.js`, after `router.use(authMiddleware);` and before the `/:userId` routes (the literal path must match first):

```js
router.get('/quote', getQuote);
```

and add `getQuote` to the destructured import at the top of the file.

- [ ] **Step 3: Add the public-page quote**

In `server/src/controllers/paymentPortalController.js`, add the import:

```js
const { resolveCharge } = require('../utils/taxes');
```

and a handler beside the existing portal handlers. The file already has `findByToken(prisma, token)` at line 54 and its routes are mounted at `/api/pay/:token`, so this follows them exactly:

```js
/**
 * The same quote for the public payment page, which has no logged-in user and
 * resolves its account from the portal token in the URL.
 * GET /api/pay/:token/quote?amount=100
 */
const getPortalQuote = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Página no encontrada' });

    const subtotal = Math.round(parseFloat(req.query.amount) * 100) / 100;
    if (!Number.isFinite(subtotal) || subtotal <= 0) {
      return res.status(400).json({ error: 'Monto inválido' });
    }
    const charge = await resolveCharge(req.prisma, user.id, subtotal);
    res.json({
      subtotal: charge.subtotal, taxRate: charge.taxRate, taxLabel: charge.taxLabel,
      taxAmount: charge.taxAmount, total: charge.total,
    });
  } catch (error) {
    console.error('Error quoting from the portal:', error.message);
    res.status(500).json({ error: 'No se pudo calcular el total' });
  }
};
```

Add `getPortalQuote` to that file's `module.exports`, and route it in `server/src/routes/portal.js` beside the existing `:token` routes:

```js
router.get('/:token/quote', getPortalQuote);
```

- [ ] **Step 4: Check it loads**

Run: `cd server && node -e "require('./src/routes/credits'); require('./src/controllers/paymentPortalController'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/creditsController.js server/src/routes/credits.js server/src/controllers/paymentPortalController.js
git commit -m "Quote what an amount will really cost before anyone pays it"
```

---

## Task 9: Reading invoices

**Files:**
- Create: `server/src/controllers/invoiceController.js`
- Create: `server/src/routes/invoices.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Write the controller**

Create `server/src/controllers/invoiceController.js`:

```js
// Reading invoices. Everything rendered comes from the snapshots frozen at
// issue time, so an invoice never changes after the fact.

const { issueInvoiceForPurchase } = require('../services/invoiceService');

/** An invoice as the document needs it: snapshots and lines already parsed. */
function present(invoice) {
  return {
    id: invoice.id,
    number: invoice.number,
    currency: invoice.currency,
    subtotal: invoice.subtotal,
    taxLabel: invoice.taxLabel,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    retention: invoice.retention,
    total: invoice.total,
    totalInWords: invoice.totalInWords,
    lines: JSON.parse(invoice.conceptLines || '[]'),
    issuer: JSON.parse(invoice.issuerSnapshot || '{}'),
    client: JSON.parse(invoice.clientSnapshot || '{}'),
    issuedAt: invoice.issuedAt,
    dueAt: invoice.dueAt,
  };
}

/**
 * True when the requester may see this account's invoices: the account itself,
 * the OWNER, or a partner above it.
 */
async function mayRead(prisma, requester, ownerId) {
  if (requester.id === ownerId) return true;
  if (requester.role === 'OWNER') return true;
  const { getAncestorPartners } = require('../utils/whopConfig');
  const target = await prisma.user.findUnique({ where: { id: ownerId } });
  if (!target) return false;
  const ancestors = await getAncestorPartners(prisma, target).catch(() => []);
  return ancestors.some((a) => a.id === requester.id);
}

/** GET /api/invoices — the requester's own invoices, newest first. */
const listInvoices = async (req, res) => {
  try {
    const invoices = await req.prisma.invoice.findMany({
      where: { userId: req.user.id },
      orderBy: { issuedAt: 'desc' },
      take: 200,
    });
    res.json(invoices.map((i) => ({ id: i.id, number: i.number, total: i.total, issuedAt: i.issuedAt })));
  } catch (error) {
    console.error('Error listing invoices:', error.message);
    res.status(500).json({ error: 'No se pudieron cargar las facturas' });
  }
};

/** GET /api/invoices/:id */
const getInvoice = async (req, res) => {
  try {
    const invoice = await req.prisma.invoice.findUnique({ where: { id: parseInt(req.params.id) } });
    if (!invoice) return res.status(404).json({ error: 'Factura no encontrada' });
    if (!(await mayRead(req.prisma, req.user, invoice.userId))) {
      return res.status(403).json({ error: 'No tienes acceso a esta factura' });
    }
    res.json(present(invoice));
  } catch (error) {
    console.error('Error reading an invoice:', error.message);
    res.status(500).json({ error: 'No se pudo cargar la factura' });
  }
};

/**
 * GET /api/invoices/by-purchase/:purchaseId
 * The invoice for one payment, issued on the spot when it is missing — which is
 * how a settlement whose fire-and-forget emission failed repairs itself.
 */
const getInvoiceForPurchase = async (req, res) => {
  try {
    const purchase = await req.prisma.creditPurchase.findUnique({ where: { id: parseInt(req.params.purchaseId) } });
    if (!purchase) return res.status(404).json({ error: 'Pago no encontrado' });
    if (!(await mayRead(req.prisma, req.user, purchase.userId))) {
      return res.status(403).json({ error: 'No tienes acceso a este pago' });
    }
    if (purchase.status !== 'completed') {
      return res.status(409).json({ error: 'Este pago todavía no se ha confirmado' });
    }

    const invoice = await issueInvoiceForPurchase(req.prisma, purchase);
    if (!invoice) return res.status(404).json({ error: 'Esta cuenta no factura con impuesto' });
    res.json(present(invoice));
  } catch (error) {
    console.error('Error issuing an invoice on demand:', error.message);
    res.status(500).json({ error: 'No se pudo emitir la factura' });
  }
};

module.exports = { listInvoices, getInvoice, getInvoiceForPurchase };
```

- [ ] **Step 2: Route it**

Create `server/src/routes/invoices.js`:

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { listInvoices, getInvoice, getInvoiceForPurchase } = require('../controllers/invoiceController');

router.use(authMiddleware);

router.get('/', listInvoices);
// Literal path before '/:id', or "by-purchase" is read as an id.
router.get('/by-purchase/:purchaseId', getInvoiceForPurchase);
router.get('/:id', getInvoice);

module.exports = router;
```

- [ ] **Step 3: Mount it**

In `server/src/index.js`, beside the other `app.use('/api/...')` lines:

```js
app.use('/api/invoices', require('./routes/invoices'));
```

`getAncestorPartners` is exported from `server/src/utils/whopConfig.js` and is the same helper `creditCheckout.resolveReceiptEmail` uses to walk up the partner chain.

- [ ] **Step 4: Check it loads**

Run: `cd server && node -e "require('./src/routes/invoices'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/invoiceController.js server/src/routes/invoices.js server/src/index.js
git commit -m "Read invoices, issuing one on demand when a settlement missed it"
```

---

## Task 10: Configuring the issuer and the client's fiscal details

**Files:**
- Create: `server/src/controllers/billingProfileController.js`
- Create: `server/src/routes/billingProfile.js`
- Modify: `server/src/index.js`
- Modify: `server/src/controllers/userController.js`

- [ ] **Step 1: Write the controller**

Create `server/src/controllers/billingProfileController.js`:

```js
// The OWNER configures a partner's invoicing: the tax it adds, how its invoices
// are numbered, and everything printed on them. Nothing here is in .env on
// purpose — the rate changes from the panel, without a release.

const EDITABLE = [
  'taxEnabled', 'taxRate', 'taxLabel', 'retentionRate',
  'invoicePrefix', 'invoiceNextNumber', 'invoicePadding',
  'issuerName', 'issuerRnc', 'logoUrl', 'brandName', 'slogan',
  'bankName', 'bankAccount', 'swift', 'routingNumber', 'paymentMethod', 'paymentTerms', 'dueDays',
  'site1Name', 'site1Phone', 'site1City', 'site1Address',
  'site2Name', 'site2Phone', 'site2City', 'site2Address',
  'contactEmail', 'contactWeb',
];

const NUMERIC = new Set(['taxRate', 'retentionRate', 'invoiceNextNumber', 'invoicePadding', 'dueDays']);

/** GET /api/billing-profile/:userId */
const getProfile = async (req, res) => {
  try {
    const ownerId = parseInt(req.params.userId);
    const profile = await req.prisma.billingProfile.findUnique({ where: { ownerId } });
    res.json(profile || { ownerId, taxEnabled: false, taxRate: 0, taxLabel: 'ITBIS', invoicePrefix: 'FAC-', invoiceNextNumber: 1, invoicePadding: 6, dueDays: 0 });
  } catch (error) {
    console.error('Error reading a billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo cargar el perfil de facturación' });
  }
};

/** PUT /api/billing-profile/:userId — creates the profile the first time. */
const saveProfile = async (req, res) => {
  try {
    const ownerId = parseInt(req.params.userId);
    const owner = await req.prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner) return res.status(404).json({ error: 'Cuenta no encontrada' });

    const data = {};
    for (const key of EDITABLE) {
      if (req.body[key] === undefined) continue;
      if (key === 'taxEnabled') { data[key] = !!req.body[key]; continue; }
      if (NUMERIC.has(key)) {
        const n = parseFloat(req.body[key]);
        if (Number.isFinite(n) && n >= 0) data[key] = key === 'taxRate' || key === 'retentionRate' ? n : Math.round(n);
        continue;
      }
      data[key] = req.body[key] === '' ? null : String(req.body[key]);
    }

    // A rate above 100 is always a typo, and it would double someone's bill.
    if (data.taxRate !== undefined && data.taxRate > 100) {
      return res.status(400).json({ error: 'El porcentaje de impuesto no puede ser mayor a 100.' });
    }

    const profile = await req.prisma.billingProfile.upsert({
      where: { ownerId },
      create: { ownerId, ...data },
      update: data,
    });
    res.json(profile);
  } catch (error) {
    console.error('Error saving a billing profile:', error.message);
    res.status(500).json({ error: 'No se pudo guardar el perfil de facturación' });
  }
};

module.exports = { getProfile, saveProfile };
```

- [ ] **Step 2: Route it**

Create `server/src/routes/billingProfile.js`:

```js
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const { getProfile, saveProfile } = require('../controllers/billingProfileController');

router.use(authMiddleware);

router.get('/:userId', requireRole(ROLES.OWNER), getProfile);
router.put('/:userId', requireRole(ROLES.OWNER), saveProfile);

module.exports = router;
```

In `server/src/index.js`:

```js
app.use('/api/billing-profile', require('./routes/billingProfile'));
```

- [ ] **Step 3: Let the fiscal details be saved**

The five new `User` columns need a write path. `updateUserBilling` in `server/src/controllers/userController.js:526` already writes `receiptEmail` on an account, with exactly the right permissions (OWNER and the partner above), so they belong there.

Add the five keys to the destructuring at line 529:

```js
    const { credits, creditOperation, outboundRate, inboundRate, chatbotMessagePrice, voiceAgentsEnabled, chatbotsEnabled, crmEnabled, agentGeneratorEnabled, budgetsEnabled, callsPaused, messagesPaused, hiddenSections, planType, planPrice, receiptEmail, billingCompany, billingRnc, billingAddress, billingCity, billingPhone } = req.body;
```

and, immediately after the `receiptEmail` block that ends at line 607, add:

```js
    // Fiscal details printed on this account's invoices. Empty clears a field,
    // and the invoice then falls back to the account's own name and email.
    for (const [key, value] of Object.entries({ billingCompany, billingRnc, billingAddress, billingCity, billingPhone })) {
      if (value === undefined) continue;
      updateData[key] = String(value).trim() || null;
    }
```

- [ ] **Step 4: Check it loads**

Run: `cd server && node -e "require('./src/routes/billingProfile'); require('./src/controllers/userController'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add server/src/controllers/billingProfileController.js server/src/routes/billingProfile.js server/src/index.js server/src/controllers/userController.js
git commit -m "Configure a partner's invoicing and an account's fiscal details"
```

---

## Task 11: Stop the amounts shown to clients from lying

**Files:**
- Modify: `server/src/services/creditCheckout.js` (`manualTopUpBlocker`)
- Modify: `server/src/controllers/creditsController.js` (auto-recharge responses)
- Modify: `server/src/services/paymentReport.js`

These messages quote amounts. With tax, a client told "se va a cargar sola por $100" sees $127 on the card.

- [ ] **Step 1: Correct `manualTopUpBlocker`**

In `server/src/services/creditCheckout.js`, add the import:

```js
const { resolveCharge } = require('../utils/taxes');
```

and replace the auto-recharge branch of `manualTopUpBlocker`:

```js
  if (user.autoRechargeEnabled && !user.cycleBillingEnabled && hasCard
      && user.autoRechargeThreshold > 0 && user.vapiCredits < user.autoRechargeThreshold) {
    const charge = await resolveCharge(prisma, userId, user.autoRechargeAmount);
    const willCharge = charge.taxAmount > 0
      ? `se van a cargar ${money(charge.total)} a tu tarjeta para acreditarte ${money(charge.subtotal)} de saldo`
      : `se va a cargar sola por ${money(charge.total)}`;
    return `La auto-recarga está activa y tu saldo (${money(user.vapiCredits)}) está por debajo de ${money(user.autoRechargeThreshold)}: `
      + `${willCharge} en unos minutos. No hace falta cargar a mano.`;
  }
```

The in-flight message above it already reads `inFlight.amount`, which is the charged total — correct as it stands, since it describes a charge.

- [ ] **Step 2: Return the breakdown from the charge endpoints**

In `server/src/controllers/creditsController.js`, in the `rechargeNow` and `chargeCard` responses, keep `amount` meaning what is charged (so nothing reading them today starts lying) and add the breakdown. In `rechargeNow`, after the charge succeeds:

```js
    const charge = await resolveCharge(req.prisma, req.user.id, amount);
    res.json({
      success: true,
      amount: charge.total,
      breakdown: charge,
      settled,
      balance: fresh?.vapiCredits ?? user.vapiCredits,
      message: charge.taxAmount > 0
        ? `Se cobraron ${'$' + charge.total.toFixed(2)} (incluye ${charge.taxLabel} ${charge.taxRate}%) y se acreditaron ${'$' + charge.subtotal.toFixed(2)} de saldo.`
        : 'Cobro aprobado. El saldo de la cuenta ya quedó actualizado.',
    });
```

Apply the same shape to `chargeCard`, keeping each one's existing wording for the untaxed case.

- [ ] **Step 3: Show the breakdown in the emailed report**

The email's totals table ends with a "Total del período" row at `server/src/services/paymentReport.js:212-214`. That figure is the **usage** the payment covers, which is the subtotal — so without the tax rows beside it, the client compares it to a larger card charge and the two do not reconcile.

Immediately after that `<tr>`, add:

```js
      ${purchase.taxAmount > 0 ? `<tr>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb">${escape(taxLabel)} (${purchase.taxRate}%)</td>
        <td style="padding:8px 10px;border-top:1px solid #e5e7eb;text-align:right">${money(purchase.taxAmount)}</td>
      </tr>
      <tr>
        <td style="padding:8px 10px;font-weight:700">Total cobrado</td>
        <td style="padding:8px 10px;font-weight:700;text-align:right">${money(purchase.amount)}</td>
      </tr>` : ''}
```

`taxLabel` is not a column on `CreditPurchase`, so resolve it where the report's data is assembled, before the HTML is built:

```js
  // The label the issuer uses for its tax ("ITBIS"), taken from the invoice this
  // payment produced; a payment with no invoice has no tax rows to label.
  const invoice = await prisma.invoice.findUnique({ where: { creditPurchaseId: purchase.id } }).catch(() => null);
  const taxLabel = invoice?.taxLabel || 'ITBIS';
```

- [ ] **Step 4: Check it loads**

Run: `cd server && node -e "require('./src/services/creditCheckout'); require('./src/services/paymentReport'); require('./src/controllers/creditsController'); console.log('ok')"`
Expected: `ok`

- [ ] **Step 5: Commit**

```bash
git add server/src/services/creditCheckout.js server/src/controllers/creditsController.js server/src/services/paymentReport.js
git commit -m "Tell clients the amount that will actually hit their card"
```

---

## Task 12: The breakdown, before anyone pays

**Files:**
- Create: `client/src/components/Dashboard/ChargeBreakdown.jsx`
- Modify: `client/src/services/api.js`
- Modify: `client/src/components/Dashboard/Credits.jsx`
- Modify: `client/src/components/Dashboard/BillingPeriods.jsx`
- Modify: `client/src/components/Public/PaymentPortalPage.jsx`
- Modify: `client/src/components/Public/WalletPage.jsx`

- [ ] **Step 1: Add the API calls**

In `client/src/services/api.js`, add to `creditsAPI`:

```js
  quote: (amount) => api.get('/credits/quote', { params: { amount } }),
```

and two new exports beside the others:

```js
export const invoicesAPI = {
  list: () => api.get('/invoices'),
  get: (id) => api.get(`/invoices/${id}`),
  forPurchase: (purchaseId) => api.get(`/invoices/by-purchase/${purchaseId}`),
}

export const billingProfileAPI = {
  get: (userId) => api.get(`/billing-profile/${userId}`),
  save: (userId, data) => api.put(`/billing-profile/${userId}`, data),
}
```

- [ ] **Step 2: Write the shared component**

Create `client/src/components/Dashboard/ChargeBreakdown.jsx`:

```jsx
// What a client will actually be charged, shown before they commit to it.
//
// Four screens take money — the credits panel, the public payment page, the
// wallet and billing periods — and they must all quote the same figure, so the
// block lives here and each screen only supplies the amount.

const money = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`

export default function ChargeBreakdown({ quote, loading }) {
  // No tax applies to this account: the panel stays exactly as it was.
  if (loading) return <div className="h-16 animate-pulse rounded-lg bg-gray-100 dark:bg-dark-hover mb-4" />
  if (!quote || !(quote.taxAmount > 0)) return null

  return (
    <div className="mb-4 rounded-lg border border-gray-200 dark:border-dark-border divide-y divide-gray-200 dark:divide-dark-border text-sm">
      <div className="flex justify-between px-3 py-2">
        <span className="text-gray-500 dark:text-gray-400">Subtotal</span>
        <span className="text-gray-900 dark:text-white">{money(quote.subtotal)}</span>
      </div>
      <div className="flex justify-between px-3 py-2">
        <span className="text-gray-500 dark:text-gray-400">{quote.taxLabel} ({quote.taxRate}%)</span>
        <span className="text-gray-900 dark:text-white">{money(quote.taxAmount)}</span>
      </div>
      <div className="flex justify-between px-3 py-2 font-semibold">
        <span className="text-gray-900 dark:text-white">Total a pagar</span>
        <span className="text-gray-900 dark:text-white">{money(quote.total)}</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Wire it into the buy modal**

In `client/src/components/Dashboard/Credits.jsx`, add state and a debounced quote:

```jsx
  const [quote, setQuote] = useState(null)
  const [quoting, setQuoting] = useState(false)

  // Quote whatever is typed, a beat after typing stops. A failed quote simply
  // shows nothing: it must never block the buy button.
  useEffect(() => {
    const n = parseFloat(buyAmount)
    if (!Number.isFinite(n) || n <= 0) { setQuote(null); return }
    setQuoting(true)
    const id = setTimeout(async () => {
      try {
        const { data } = await creditsAPI.quote(n)
        setQuote(data)
      } catch { setQuote(null) } finally { setQuoting(false) }
    }, 350)
    return () => clearTimeout(id)
  }, [buyAmount])
```

Import the component and render it between the min/max hint and the presets, inside the buy modal:

```jsx
            <ChargeBreakdown quote={quote} loading={quoting} />
```

Do the same for the "recargar ahora" field, quoting `rechargeAmount`, and in the auto-recharge form quote `ar.amount` and show the block under it so the client sees what the automation will charge.

- [ ] **Step 4: Wire it into the other three surfaces**

Each uses the same debounced effect and the same `<ChargeBreakdown>`; only the call differs.

`PaymentPortalPage.jsx` and `WalletPage.jsx` are public and carry no auth token, so they hit the portal quote with the token already in their URL, using the plain `axios`/`fetch` call those files already use for their other portal requests:

```jsx
  const { data } = await api.get(`/pay/${token}/quote`, { params: { amount: n } })
```

`BillingPeriods.jsx` quotes the outstanding balance of the period being charged, so the breakdown appears beside the "cobrar" button rather than under an input:

```jsx
  useEffect(() => {
    if (!(detail?.outstanding > 0)) { setQuote(null); return }
    creditsAPI.quote(detail.outstanding).then(({ data }) => setQuote(data)).catch(() => setQuote(null))
  }, [detail?.outstanding])
```

- [ ] **Step 5: Check the client builds**

Run: `cd client && npm run build`
Expected: build succeeds with no new warnings about missing imports

- [ ] **Step 6: Commit**

```bash
git add client/src/components/Dashboard/ChargeBreakdown.jsx client/src/services/api.js client/src/components/Dashboard/Credits.jsx client/src/components/Dashboard/BillingPeriods.jsx client/src/components/Public/PaymentPortalPage.jsx client/src/components/Public/WalletPage.jsx
git commit -m "Show the client what they will be charged before they pay it"
```

---

## Task 13: The invoice document

**Files:**
- Create: `client/src/components/Dashboard/InvoiceDocument.jsx`
- Modify: `client/src/components/Dashboard/Credits.jsx`

- [ ] **Step 1: Write the document**

Create `client/src/components/Dashboard/InvoiceDocument.jsx`. It reproduces the agreed format and reads only from the invoice's snapshots, never from live account data. The PDF follows the pattern already in `BillingPeriods.jsx:136` — render the view as plain HTML and print that node — so the client receives exactly what the screen shows, with no new dependency.

```jsx
import { useState } from 'react'

const money = (n) => `USD ${(Math.round((n || 0) * 100) / 100).toFixed(2)}`
const day = (d) => d ? new Intl.DateTimeFormat('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(d)) : ''

const ORANGE = '#E8502A'

export default function InvoiceDocument({ invoice, onClose }) {
  const [busy, setBusy] = useState(false)
  if (!invoice) return null
  const { issuer, client, lines } = invoice

  const downloadPdf = async () => {
    const node = document.getElementById('invoice-document')
    if (!node) return
    setBusy(true)
    try {
      const html2pdf = (await import('html2pdf.js')).default
      await html2pdf().set({
        margin: 8,
        filename: `${invoice.number}.pdf`,
        html2canvas: { scale: 2, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      }).from(node).save()
    } finally { setBusy(false) }
  }

  // Blank rows keep the table the height of the printed format even for a
  // one-line invoice, the way the original spreadsheet does.
  const filler = Math.max(0, 8 - lines.length)

  return (
    <div className="fixed inset-0 z-50 bg-black/50 overflow-y-auto p-4">
      <div className="mx-auto max-w-3xl">
        <div className="flex justify-end gap-2 mb-2">
          <button onClick={downloadPdf} disabled={busy}
            className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white text-sm disabled:opacity-50">
            {busy ? 'Generando…' : 'Descargar PDF'}
          </button>
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white text-gray-700 text-sm">Cerrar</button>
        </div>

        <div id="invoice-document" className="bg-white text-black p-8" style={{ fontFamily: 'Arial, Helvetica, sans-serif', fontSize: 12 }}>
          {/* Header: brand on the left, issuer on the right */}
          <div className="flex justify-between items-start mb-6">
            <div>
              {issuer.logoUrl && <img src={issuer.logoUrl} alt="" style={{ maxHeight: 40, marginBottom: 6 }} />}
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1F3864' }}>{issuer.brandName}</div>
              {issuer.slogan && <div style={{ fontSize: 10, color: '#666' }}>{issuer.slogan}</div>}
            </div>
            <div style={{ borderLeft: `3px solid ${ORANGE}`, paddingLeft: 12 }}>
              <div style={{ fontWeight: 700, color: '#1F3864' }}>{issuer.issuerName}</div>
              <div>RNC / ID: {issuer.issuerRnc}</div>
            </div>
          </div>

          <div style={{ color: ORANGE, fontWeight: 700, fontSize: 18, marginBottom: 12 }}>NO. {invoice.number}</div>

          {/* Client on the left, dates on the right */}
          <div className="flex justify-between mb-6">
            <div>
              <div><strong>Empresa:</strong> {client.company}</div>
              <div><strong>RNC:</strong> {client.rnc}</div>
              <div><strong>Dirección:</strong> {client.address}</div>
              <div><strong>Ciudad:</strong> {client.city}</div>
              <div><strong>Teléfono:</strong> {client.phone}</div>
            </div>
            <div>
              <div><strong>Fecha de Expedición:</strong> {day(invoice.issuedAt)}</div>
              <div><strong>Condiciones de Pago:</strong> {issuer.paymentTerms}</div>
              <div><strong>Fecha de vencimiento:</strong> {day(invoice.dueAt)}</div>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderTop: '2px solid #000', borderBottom: '2px solid #000' }}>
                <th style={{ textAlign: 'left', padding: '6px 4px' }}>DESCRIPCIÓN</th>
                <th style={{ textAlign: 'right', padding: '6px 4px', width: 160 }}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #000' }}>
                  <td style={{ padding: '6px 4px' }}>{l.description}</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(l.total)}</td>
                </tr>
              ))}
              {Array.from({ length: filler }).map((_, i) => (
                <tr key={`f${i}`} style={{ borderBottom: '1px solid #000' }}>
                  <td style={{ padding: '6px 4px' }}>&nbsp;</td>
                  <td>&nbsp;</td>
                </tr>
              ))}
            </tbody>
          </table>

          <table style={{ width: '60%', marginLeft: 'auto', borderCollapse: 'collapse', marginTop: 0 }}>
            <tbody>
              <tr style={{ borderBottom: '1px solid #000' }}>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>TOTAL NETO</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(invoice.subtotal)}</td>
              </tr>
              {invoice.taxAmount > 0 && (
                <tr style={{ borderBottom: '1px solid #000' }}>
                  <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>{invoice.taxLabel} ({invoice.taxRate}%)</td>
                  <td style={{ padding: '6px 4px', textAlign: 'right' }}>{money(invoice.taxAmount)}</td>
                </tr>
              )}
              <tr style={{ borderBottom: '1px solid #000' }}>
                <td style={{ padding: '6px 4px', textAlign: 'right', fontWeight: 700 }}>RETENCIÓN</td>
                <td style={{ padding: '6px 4px', textAlign: 'right' }}>{invoice.retention ? money(invoice.retention) : ''}</td>
              </tr>
              <tr style={{ background: ORANGE, color: '#fff' }}>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>TOTAL A PAGAR</td>
                <td style={{ padding: '8px 4px', textAlign: 'right', fontWeight: 700 }}>{money(invoice.total)}</td>
              </tr>
            </tbody>
          </table>

          <div style={{ background: ORANGE, color: '#fff', fontWeight: 700, padding: '6px 8px', marginTop: 16 }}>
            TOTAL A PAGAR EN LETRAS: {invoice.totalInWords}
          </div>

          <div style={{ textAlign: 'center', padding: '10px 0', borderBottom: '1px solid #000' }}>
            Consignar en la cuenta {issuer.bankAccount} SWIFT {issuer.swift} número de ruta {issuer.routingNumber} - Banco {issuer.bankName}
            {issuer.paymentMethod && <div>El pago debe realizarse mediante la modalidad {issuer.paymentMethod}</div>}
          </div>

          <div className="flex justify-between" style={{ marginTop: 16, fontSize: 11 }}>
            <div>
              <div style={{ fontWeight: 700 }}>{issuer.site1?.name}</div>
              <div>Teléfono: {issuer.site1?.phone}</div>
              <div style={{ color: '#4472C4' }}>{issuer.site1?.city}</div>
              <div style={{ color: '#4472C4' }}>{issuer.site1?.address}</div>
            </div>
            <div>
              <div style={{ fontWeight: 700 }}>{issuer.site2?.name}</div>
              <div>Teléfono: {issuer.site2?.phone}</div>
              <div style={{ color: '#4472C4' }}>{issuer.site2?.city}</div>
              <div style={{ color: '#4472C4' }}>{issuer.site2?.address}</div>
            </div>
            <div>
              <div><strong>Email:</strong> {issuer.contactEmail}</div>
              <div style={{ color: '#4472C4' }}>{issuer.contactWeb}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Reach it from the credits history**

In `client/src/components/Dashboard/Credits.jsx`, add a "Factura" action on each settled purchase in the history list:

```jsx
  const [invoice, setInvoice] = useState(null)

  const openInvoice = async (purchaseId) => {
    try {
      const { data } = await invoicesAPI.forPurchase(purchaseId)
      setInvoice(data)
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo abrir la factura')
    }
  }
```

Render `{invoice && <InvoiceDocument invoice={invoice} onClose={() => setInvoice(null)} />}` at the end of the component, and show the button only for purchases with `status === 'completed'`.

- [ ] **Step 3: Check the client builds**

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Dashboard/InvoiceDocument.jsx client/src/components/Dashboard/Credits.jsx
git commit -m "Render the invoice in the agreed format, downloadable as a PDF"
```

---

## Task 14: The issuer-profile form

**Files:**
- Modify: `client/src/components/Dashboard/AccountManagement.jsx`

- [ ] **Step 1: Add the form state**

In `client/src/components/Dashboard/AccountManagement.jsx`, beside `stripeForm` (line 84), add:

```jsx
  // The partner's invoicing: the tax it adds and everything printed on its
  // invoices. Loaded with the Whop/Stripe config, saved with it.
  const [profileForm, setProfileForm] = useState({
    taxEnabled: false, taxRate: '27', taxLabel: 'ITBIS',
    invoicePrefix: 'FAC-', invoiceNextNumber: '1', invoicePadding: '6', dueDays: '0',
    issuerName: '', issuerRnc: '', brandName: '', slogan: '', logoUrl: '',
    bankName: '', bankAccount: '', swift: '', routingNumber: '', paymentMethod: '', paymentTerms: '',
    site1Name: '', site1Phone: '', site1City: '', site1Address: '',
    site2Name: '', site2Phone: '', site2City: '', site2Address: '',
    contactEmail: '', contactWeb: '',
  })
```

- [ ] **Step 2: Load and save it**

Where the modal loads the billing config (around line 97), also:

```jsx
      const { data: profile } = await billingProfileAPI.get(targetUser.id)
      setProfileForm(f => ({ ...f, ...Object.fromEntries(Object.entries(profile).map(([k, v]) => [k, v === null ? '' : v])) }))
```

and in the save handler, after the Stripe credentials are saved:

```jsx
      if (whopForm.billingMode === 'own_stripe') {
        await billingProfileAPI.save(targetUser.id, profileForm)
      }
```

- [ ] **Step 3: Render it under the Stripe credentials**

After the `own_stripe` credentials block that ends around line 1860, add this section. It is shown only for `own_stripe`, and the input styling is copied from the Stripe fields directly above it so the modal stays of a piece.

```jsx
{whopForm.billingMode === 'own_stripe' && (
  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-dark-border space-y-4">
    <div>
      <h4 className="font-semibold text-gray-900 dark:text-white">Impuesto y facturación</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Se aplica a todo lo que se le cobre a las cuentas de este partner: recargas,
        auto-recarga, cobro por cortes y liquidación de periodos. Mientras el impuesto
        esté apagado no cambia nada — se cobra el monto exacto y no se emiten facturas.
      </p>
    </div>

    <label className="flex items-center gap-2">
      <input type="checkbox" checked={!!profileForm.taxEnabled}
        onChange={(e) => setProfileForm(f => ({ ...f, taxEnabled: e.target.checked }))}
        className="text-primary-600 focus:ring-primary-500" />
      <span className="text-sm text-gray-700 dark:text-gray-300">Cobrar impuesto</span>
    </label>

    <div className="grid grid-cols-2 gap-3">
      {[
        ['taxRate', 'Porcentaje (%)', 'number'],
        ['taxLabel', 'Nombre del impuesto', 'text'],
        ['invoicePrefix', 'Prefijo de factura', 'text'],
        ['invoiceNextNumber', 'Próximo número', 'number'],
        ['invoicePadding', 'Dígitos del número', 'number'],
        ['dueDays', 'Días hasta el vencimiento', 'number'],
        ['issuerName', 'Razón social del emisor', 'text'],
        ['issuerRnc', 'RNC / ID', 'text'],
        ['brandName', 'Nombre comercial', 'text'],
        ['slogan', 'Eslogan', 'text'],
        ['logoUrl', 'URL del logo', 'text'],
        ['paymentTerms', 'Condiciones de pago', 'text'],
        ['bankName', 'Banco', 'text'],
        ['bankAccount', 'Cuenta', 'text'],
        ['swift', 'SWIFT', 'text'],
        ['routingNumber', 'Número de ruta', 'text'],
        ['paymentMethod', 'Modalidad de pago', 'text'],
        ['contactEmail', 'Email de contacto', 'text'],
        ['contactWeb', 'Web', 'text'],
        ['site1Name', 'Sede 1 — nombre', 'text'],
        ['site1Phone', 'Sede 1 — teléfono', 'text'],
        ['site1City', 'Sede 1 — ciudad y país', 'text'],
        ['site1Address', 'Sede 1 — dirección', 'text'],
        ['site2Name', 'Sede 2 — nombre', 'text'],
        ['site2Phone', 'Sede 2 — teléfono', 'text'],
        ['site2City', 'Sede 2 — ciudad y país', 'text'],
        ['site2Address', 'Sede 2 — dirección', 'text'],
      ].map(([key, label, type]) => (
        <div key={key}>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
          <input type={type} value={profileForm[key] ?? ''}
            onChange={(e) => setProfileForm(f => ({ ...f, [key]: e.target.value }))}
            className="w-full px-3 py-2 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-sm text-gray-900 dark:text-white focus:outline-none focus:border-primary-500" />
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 4: Check the client builds**

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Dashboard/AccountManagement.jsx
git commit -m "Configure a partner's tax and invoice details from the panel"
```

---

## Task 15: The client's fiscal fields

**Files:**
- Modify: `client/src/components/Dashboard/AccountManagement.jsx`

- [ ] **Step 1: Add the fields to the account's billing tab**

The "Facturación" tab (line 837) already holds `receiptEmail`. Add the five fiscal fields to `billingForm` and render them there, so both the account itself and the partner above it edit them in the same place:

```jsx
      billingCompany: targetUser.billingCompany || '',
      billingRnc: targetUser.billingRnc || '',
      billingAddress: targetUser.billingAddress || '',
      billingCity: targetUser.billingCity || '',
      billingPhone: targetUser.billingPhone || '',
```

Include them in the payload the tab already sends, next to `receiptEmail`, and label the section so its purpose is obvious:

```jsx
  Datos fiscales que aparecen en las facturas de esta cuenta.
```

- [ ] **Step 2: Check the client builds**

Run: `cd client && npm run build`
Expected: build succeeds

- [ ] **Step 3: Commit**

```bash
git add client/src/components/Dashboard/AccountManagement.jsx
git commit -m "Collect the fiscal details printed on an account's invoices"
```

---

## Task 16: Verify end to end, with the tax off and then on

The unit tests cover the arithmetic. This task checks that the wiring is right against the real system, and it is the one that needs the database and Stripe test keys.

- [ ] **Step 1: Run the migration**

Ask for the current AWS `DATABASE_URL` — `server/.env` still points at the retired Railway host. Then:

Run: `cd server && npx prisma migrate dev --name itbis_invoicing`
Expected: the migration applies and the client regenerates

- [ ] **Step 2: Confirm nothing changed for untaxed accounts**

With no `BillingProfile` created yet, buy credits as a normal account.
Expected: one Stripe line, the exact amount asked for, balance up by that amount, no `Invoice` row.

- [ ] **Step 3: Switch the tax on for a test partner**

In the panel, on a **test** partner (not LM in production), set `own_stripe`, tick the tax, rate 27, and fill the issuer fields.

- [ ] **Step 4: Buy credits as a client under it**

Enter $10.
Expected: the panel shows Subtotal $10.00 · ITBIS (27%) $2.70 · Total a pagar $12.70. Stripe shows two lines. After paying, the balance rises by **10**, and `CreditPurchase` holds `amount: 12.70`, `credits: 10`, `subtotal: 10`, `taxAmount: 2.70`.

- [ ] **Step 5: Check the invoice**

Open "Factura" on that payment.
Expected: number `FAC-000001`, TOTAL NETO `USD 10.00`, ITBIS (27%) `USD 2.70`, TOTAL A PAGAR `USD 12.70`, and the letters band reading `DOCE DÓLARES CON 70/100` — the **total**, not the subtotal. Download the PDF and check it against the format.

- [ ] **Step 6: Check auto-recharge**

Set the threshold above the balance and let the automation run.
Expected: the card is charged the taxed total, the balance rises by the subtotal, and a second invoice is issued with the next number.

- [ ] **Step 7: Check a billing period**

Charge an outstanding period from the billing-periods screen.
Expected: the card pays the taxed total, and the period is marked settled by the **subtotal** — not the total. This is the correction from Task 7; if the period shows overpaid, that line is wrong.

- [ ] **Step 8: Clean up**

Delete only the test rows created here — invoices, purchases, the test `BillingProfile`. Never drop a table: these run against the real database.

- [ ] **Step 9: Commit anything the verification fixed**

```bash
git add -A
git commit -m "Fix what end-to-end verification turned up"
```

---

## Notes for whoever implements this

- **The feature ships dark.** Until someone ticks `taxEnabled` on a profile, every path resolves to rate 0 and behaves exactly as it does today. Deploy first, switch on when LM confirms their details are right.
- **`credits` is the balance, `amount` is the card.** Any new code that adds balance reads `credits`; anything that reports what was charged reads `amount`. The two were interchangeable before this feature and are not any more.
- **Do not put the rate in `.env`.** It lives on the profile so it can change from the panel without a release.
- **Two open points** from the spec, worth confirming with LM before Task 14 is considered done: whether the 27% must be split into components (18% + 9%) rather than one ITBIS line, and whether `dueDays` should be anything other than 0.
