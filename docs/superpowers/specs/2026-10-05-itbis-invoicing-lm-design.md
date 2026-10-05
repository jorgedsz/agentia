# Dominican tax on top of every charge, with an invoice for each one

**Date:** 2026-10-05
**Status:** Design approved, pending implementation plan
**Scope:** Accounts billed through LM Consulting Group (`billingMode = "own_stripe"`). Delivered as configuration, so no other account changes behaviour.
**Branch:** `feature/itbis-facturas-lm`, off `main`.

## Problem

LM Consulting Group bills its clients from the Dominican Republic and has to collect a 27% tax on what it charges them, and hand each client an invoice in the format its accountant uses. Today the platform charges the client exactly the amount asked for, adds the same figure to the balance, and issues nothing but Stripe's own receipt.

Two things are missing: the tax is never added, and no invoice document exists anywhere in the product.

## Goals

1. Every charge made to an account under LM Consulting carries 27% on top: manual top-up, one-click top-up, auto-recharge, cycle billing and billing-period settlement.
2. The tax is added, never carved out: a client who asks for $100 of balance is charged $127 and receives 100 credits.
3. The client sees the breakdown before paying, on every surface that takes money.
4. Each settled payment produces an invoice in the agreed format, downloadable as a PDF.
5. The rate, the issuer details and the numbering are configuration, not code, so another partner can be switched on later without a release.

## Non-goals (v1)

- NCF fiscal sequences from the DGII. v1 numbers invoices with a configurable correlative (`FAC-000124`). Moving to NCF ranges later only changes how a number is allocated, which is why that step is isolated in one function.
- Retroactive invoices for payments already settled.
- Emailing the invoice. It is downloadable from the app; the existing payment-report email is left alone beyond the correction noted below.
- Tax on subscriptions and products (`recurringPaymentController`, `UserProduct`). Only credit charges are in scope.
- Multi-currency invoices. Everything is charged in USD and invoiced in USD, even where Stripe shows the payer a DOP figure through adaptive pricing.

## Architecture overview

The refactor already on `main` concentrated all money movement into three functions, and all three are provider-agnostic. That is where this feature plugs in:

| Function | File | Role here |
|---|---|---|
| `createCreditCheckout` | `server/src/services/creditCheckout.js` | Hosted checkouts — credits panel and public payment page |
| `performOffSessionCharge` | `server/src/controllers/creditsController.js` | Saved-card charges — one-click, auto-recharge, cycle top-up, period settlement |
| `settleCreditPurchase` | `server/src/utils/creditSettlement.js` | The single place a payment becomes balance; the only place an invoice is issued |

Three new units sit behind them:

- `server/src/utils/taxes.js` — resolves the tax that governs an account and computes the breakdown. Pure arithmetic plus one lookup; no provider knowledge.
- `server/src/services/invoiceService.js` — allocates a number and writes an `Invoice` with a snapshot of both parties.
- `server/src/utils/numberToWords.js` — the amount in Spanish words for the "TOTAL A PAGAR EN LETRAS" row.

Tax resolution walks up to the governing partner with `getEffectiveBilling`. An account with no tax-enabled partner above it gets rate 0, and every code path below behaves exactly as it does today.

It is additionally gated to `own_stripe`: no other billing mode resolves to a tax, whatever its profile says. This is a safety gate, not a policy choice. The Whop path settles payments in `whopController` without ever calling `settleCreditPurchase`, so a taxed Whop payment would be collected but never invoiced, and a separate Whop fallback credits `usd_total` — the taxed total — as balance. The gate makes both unreachable, and should be lifted only together with unifying the two settlement paths.

## Data model

### `BillingProfile` (new)

One row per issuer, owned by a partner. A separate model rather than twenty more columns on `User`, which is already very large, and because these fields are one cohesive thing that is read together.

```
model BillingProfile {
  id                Int      @id @default(autoincrement())
  ownerId           Int      @unique          // the partner that issues
  owner             User     @relation(...)

  // Tax
  taxEnabled        Boolean  @default(false)
  taxRate           Float    @default(0)      // percent, e.g. 27
  taxLabel          String   @default("ITBIS")
  retentionRate     Float    @default(0)      // the RETENCIÓN row; 0 renders it empty

  // Numbering
  invoicePrefix     String   @default("FAC-")
  invoiceNextNumber Int      @default(1)
  invoicePadding    Int      @default(6)

  // Issuer block
  issuerName        String?                   // "RAZÓN SOCIAL DEL EMISOR"
  issuerRnc         String?
  logoUrl           String?
  brandName         String?                   // the large name in the header
  slogan            String?

  // Payment instructions
  bankName          String?
  bankAccount       String?
  swift             String?
  routingNumber     String?
  paymentMethod     String?                   // "El pago debe realizarse mediante la modalidad ___"
  paymentTerms      String?                   // "Condiciones de Pago"
  dueDays           Int      @default(0)      // "Fecha de vencimiento" = issue date + this

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
}
```

### `Invoice` (new)

```
model Invoice {
  id                Int      @id @default(autoincrement())
  number            String                     // "FAC-000124"
  profileId         Int                        // onDelete: Restrict — an issuer with invoices cannot be deleted
  userId            Int?                       // the client; onDelete: SetNull
  creditPurchaseId  Int?     @unique           // one invoice per payment, enforced by the DB; onDelete: SetNull
  currency          String   @default("USD")
  subtotal          Float
  taxLabel          String
  taxRate           Float
  taxAmount         Float
  retention         Float    @default(0)
  total             Float
  totalInWords      String
  conceptLines      String                     // JSON: the DESCRIPCIÓN rows
  issuerSnapshot    String                     // JSON
  clientSnapshot    String                     // JSON
  issuedAt          DateTime @default(now())
  dueAt             DateTime?

  @@unique([profileId, number])
  @@index([userId, issuedAt])
}
```

The two snapshots are the point of the model: when LM changes its RNC or a client moves office, invoices already issued must keep saying what they said. Nothing in rendering reads live `User` or `BillingProfile` rows.

That is also why the deletes are shaped the way they are. `DELETE /api/users/:id` exists and is open to AGENCY, OWNER and WHITELABEL, so cascading from `User` would let an agency destroy a client's fiscal records — and deleting LM's own account would erase every invoice they ever issued. Instead the client and purchase links are nullable and `SetNull`, so the document survives its parents, while the issuer link is `Restrict`, so an account that has issued invoices cannot be deleted at all.

### `CreditPurchase` (extended)

Two columns: `taxRate` and `taxAmount`, both defaulting to 0.

There is deliberately no `subtotal` column. The existing two columns get a definition that holds everywhere from now on:

- **`credits`** — what reaches the balance. This IS the pre-tax subtotal.
- **`amount`** — what the card is charged. Equals `credits + taxAmount`.

A third column holding the subtotal would be the same fact under two names, with no database invariant tying them together and a `subtotal ?? credits` fallback quietly papering over any call site that set one and forgot the other. Every existing row already satisfies the new definition, so the migration adds two defaulted columns and backfills nothing.

### `User` (extended)

`billingCompany`, `billingRnc`, `billingAddress`, `billingCity`, `billingPhone` — the "Empresa / RNC / Dirección / Ciudad / Teléfono" block on the invoice. All optional; when empty the invoice falls back to `companyName`/`name` and `email`.

## Tax resolution and computation

```js
// utils/taxes.js
resolveTaxConfig(prisma, userId)
  → { profile, taxEnabled, taxRate, taxLabel }   // rate 0 when no profile applies

computeCharge(subtotal, taxConfig)
  → { subtotal, taxRate, taxLabel, taxAmount, total }
```

`subtotal` is always what the caller already treats as the amount: the credits requested, the outstanding balance of a cycle, the amount owed on a period. `taxAmount = round2(subtotal * rate / 100)`, `total = round2(subtotal + taxAmount)`. Rounding to cents happens once, here, so no two surfaces can disagree by a cent.

`resolveTaxConfig` caches nothing. It is one indexed lookup per charge, on a path that already makes several network calls.

## Charge paths

### Hosted checkout — `createCreditCheckout`

The pending `CreditPurchase` is written with the full breakdown (`credits` and `subtotal` = requested amount, `amount` = total).

For Stripe, `createPaymentCheckout` grows a `lines` input and builds two `line_items` instead of one:

```
Manual Purchase Credits ($100)   $100.00
ITBIS (27%)                       $27.00
```

Two lines rather than one taxed line so the breakdown also reaches Stripe's own receipt and the Stripe dashboard, where LM reconciles. `payment_intent_data.metadata` carries `subtotal`, `taxAmount` and `taxRate` alongside the existing keys.

For Whop the plan is created at the total; Whop takes a single price and ignores the plan name we pass, so the breakdown lives only in our invoice. No LM account uses this path — it is kept correct rather than optimised.

### Saved card — `performOffSessionCharge`

Signature is unchanged: callers keep passing the subtotal they already compute. The function resolves the tax, charges the total, and records the pending row with the breakdown. This single change covers four callers: one-click top-up, auto-recharge, `cycleBilling.js`, and `billingPeriodController.js`.

The idempotency key for automatic kinds is unchanged — it keys on user, card and time window, not on amount, so adding tax cannot open a double-charge window.

### Settlement — `settleCreditPurchase`

Unchanged in how it credits: it already increments by `purchase.credits`, which is the subtotal. Two things are added or corrected:

1. **Invoice emission**, after the balance is updated and only on the call that actually claimed the row (`claimed.count === 1`), so a payment can never produce two invoices. Fire-and-forget with logging, like `sendPaymentReport`: a failure to issue must never turn a good payment into an error. Recovery is covered below.

2. **Billing-period correction.** The call is `applyPayment(prisma, purchase.billingPeriodId, purchase.amount)`. With tax, `amount` is the taxed total, which would settle more of the month than the client actually paid down. It must become `purchase.credits`. This is a real bug introduced by the change if missed, and it is the one line in settlement that must be edited.

## Invoice emission

```js
// services/invoiceService.js
issueInvoiceForPurchase(prisma, purchase) → Invoice | null
```

Returns `null` when no tax profile governs the account — accounts outside LM settle exactly as today, with no invoice row.

Number allocation is a single atomic increment inside a transaction:

```js
const profile = await tx.billingProfile.update({
  where: { id },
  data: { invoiceNextNumber: { increment: 1 } },
})
const number = prefix + String(profile.invoiceNextNumber - 1).padStart(padding, '0')
```

Postgres serialises the increment, so two simultaneous payments cannot take the same number without an explicit lock. The `@@unique([profileId, number])` constraint is the backstop.

The concept line comes from the purchase `kind`, in Spanish, matching what the client recognises:

| kind | DESCRIPCIÓN |
|---|---|
| `manual`, `manual_card` | Recarga de saldo — créditos de consumo |
| `auto_recharge` | Recarga automática de saldo |
| `cycle_topup` | Consumo del periodo DD/MM/AAAA – DD/MM/AAAA |
| with `billingPeriodId` | Liquidación del periodo «etiqueta» |

**Recovery.** Because emission is fire-and-forget, a settled purchase can end up without an invoice. `GET /api/invoices/by-purchase/:purchaseId` returns the invoice for a payment and issues it on demand when it is missing and the purchase is completed — the same function, idempotent through the unique constraint on `creditPurchaseId`. The download button in the credits history goes through this endpoint, so a missed emission repairs itself the first time anyone asks for the document. No separate repair job is needed.

## API

| Endpoint | Who | Purpose |
|---|---|---|
| `GET /api/credits/quote?amount=[&forUserId=]` | authenticated | Breakdown before paying. `forUserId` quotes another account — OWNER or a partner above it only — because the billing-periods charge button renders only for a manager viewing someone else's account |
| `GET /api/pay/:token/quote?amount=` | public page | Same, for the embeddable payment page |
| `GET /api/invoices` | self | The client's own invoices, as `{ invoices: [...] }` |
| `GET /api/invoices/:id` | self / partner above | `{ invoice }` — everything needed to render, from the snapshots |
| `GET /api/invoices/by-purchase/:purchaseId` | self / partner above | `{ invoice, issued }` for one payment, issuing it when missing; `issued` tells a repair from a plain read |
| `GET /api/billing-profile/:userId` | OWNER | Read a partner's issuer profile |
| `PUT /api/billing-profile/:userId` | OWNER | Write it |
| the existing account-billing update | self / partner above | The five fiscal fields ride with `receiptEmail` on `updateUserBilling`; they are also read back by `getAllUsers` and `getAccessibleAccounts` (the latter lives in `accountSwitchController.js`) |

Existing responses from `rechargeNow`, `chargeCard` and the checkout creators grow a `breakdown` object. They keep `amount` meaning what is charged, so nothing that reads them today starts lying.

## Frontend

**Breakdown before paying**, on all four surfaces that take money: `Credits.jsx`, `PaymentPortalPage.jsx`, `WalletPage.jsx`, `BillingPeriods.jsx`. One shared `<ChargeBreakdown>` so the four cannot drift:

```
Subtotal                $100.00
ITBIS (27%)              $27.00
Total a pagar           $127.00
```

Shown only when the quote comes back with a rate above zero, so accounts outside LM see the panel exactly as it is today.

**`InvoiceDocument.jsx`** reproduces the agreed format: header with logo, brand name, slogan and the issuer block with RNC; the invoice number in orange; the client block on the left and expedition date, payment terms and due date on the right; the DESCRIPCIÓN / TOTAL table; TOTAL NETO and RETENCIÓN; the orange TOTAL A PAGAR band; the orange TOTAL A PAGAR EN LETRAS band; the bank line; and the two-site footer with email and web. Rendered from the invoice's snapshots only.

Download follows the pattern already in `BillingPeriods.jsx:136`: render the view as plain HTML and print that node with `html2pdf.js`, so what the client receives is what the screen shows. No new dependency.

**Where it is reached:** the credits history list gains a "Descargar factura" action per settled payment.

**New screens:** the issuer profile under OWNER account management, next to the existing billing-mode configuration; and the client's fiscal fields in account settings.

## Messages that must change

`manualTopUpBlocker` and the auto-recharge copy quote amounts to the user:

> "La auto-recarga está activa… se va a cargar sola por $100 en unos minutos."

With tax the card is charged $127. Every user-facing amount that refers to what will be *charged* has to show the total; amounts that refer to *balance* keep showing the subtotal. The wording distinguishes them: "se cargarán $127 a tu tarjeta para acreditarte $100 de saldo."

The payment-report email states the amount the payment covers. It covers the subtotal, so the email gains the breakdown and the total, or report and charge stop reconciling.

## Migration and compatibility

- One migration: the new models, the two defaulted `CreditPurchase` columns, the five `User` columns. Nothing needs backfilling — every existing row already satisfies `credits` = subtotal and `amount` = credits + 0.
- `BillingProfile` for LM is created by the OWNER through the new screen. Until `taxEnabled` is set, LM behaves exactly as today — the feature ships dark and is switched on deliberately.
- No account outside LM's subtree is touched by any code path: every new branch is gated on a resolved rate above zero.
- The DB lives on AWS; `server/.env` still points at the retired Railway host and will not connect. The current `DATABASE_URL` is needed before running the migration.

## Testing

- `computeCharge`: rounding at the half-cent (e.g. $12.50 at 27% is exactly $3.375, which must become $3.38 and a $15.88 total), rate 0, `taxEnabled` false, and that `credits + taxAmount === amount` for a spread of values.
- `resolveTaxConfig`: a client under LM inherits; an agency under LM inherits; an account outside gets rate 0; a partner with a profile but `taxEnabled` false gets rate 0.
- `numberToWords`: integers, cents, and the exact wording of the band.
- Number allocation: concurrent `issueInvoiceForPurchase` calls never collide.
- `settleCreditPurchase`: a double settle issues one invoice; a billing-period payment applies the subtotal, not the total.
- `performOffSessionCharge`: the Stripe PaymentIntent is created for the total while the pending row credits the subtotal.

Tests run against the real database (tokaido). They create and delete only their own rows, and never drop tables.

## Open points

- The 27% is treated as one line labelled ITBIS. If LM's accountant needs it split (18% ITBIS + a 9% component), `taxLabel`/`taxRate` become an array of components — the data model change is contained to `BillingProfile` and `Invoice`, and worth confirming before building.
- `dueDays` defaults to 0, meaning the invoice falls due the day it is issued. Correct for charges already paid; confirm LM wants nothing else.
