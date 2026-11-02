# One issuer, several companies: saved issuer profiles and a per-client invoice history

**Date:** 2026-11-02
**Status:** Design approved, pending implementation plan
**Scope:** The Facturas screen and the invoicing services. Every account keeps behaving exactly as today until its issuer creates a second company.
**Branch:** `feat/facturas-empresas`, off `main`.

## Problem

The owner invoices from two companies. Today an issuer (OWNER, WHITELABEL or AGENCY) has exactly one `BillingProfile` (`ownerId @unique`): one legal name, RNC, logo, bank details, tax and retention configuration and one numbering sequence. To raise an invoice as the other company he rewrites that profile field by field, and the next automatic invoice then goes out with whichever company was typed last.

Separately, invoices made by hand never show up again after the session that created them: the Facturas list is built from settled `CreditPurchase` rows (`listMine`), and a manual invoice has no purchase behind it. There is no place to see everything a client has been invoiced.

## Goals

1. An issuer can keep several complete issuer profiles ("companies"), each with its own data, logo, bank details, tax/retention configuration and **its own numbering sequence** (own prefix, own counter).
2. One of them is the issuer's **default**.
3. Each client account can be **assigned** a company. Its automatic invoices, and the tax charged on its top-ups, follow that company; an unassigned client uses the default.
4. The manual-invoice form preselects the client's company and lets the issuer pick another one for that single invoice.
5. Choosing a company in the Emisor form loads all its data; nothing has to be retyped.
6. For a chosen client, the Facturas screen lists **every** invoice issued to it, automatic and manual, newest first, with number, date, company, concept, total and Ver/Descargar.
7. The profile that exists today becomes the default company with all its values and its counter untouched; issued invoices are not modified.

## Non-goals

- Saved client presets. Client data still comes from the client account (`billingCompany`, `billingRnc`, …).
- Moving an already-issued invoice to another company. Regenerating keeps the invoice's own `profileId`, as it does today.
- Shared numbering between companies.
- Filtering or exporting the history (a company column is shown; filters can come later).

## Data model

`BillingProfile`
- Drop `@unique` on `ownerId` (keep an index). An owner may have N profiles.
- Add `label String @default("Principal")` — the internal name shown in selectors ("Nebo AI", "Sword").
- Add `isDefault Boolean @default(true)`. Exactly one default per owner, enforced in code: every company created after the first is written with `isDefault: false`, and "make default" unsets the others in the same transaction. The column default is `true` so that `prisma db push` (how this project applies schema changes, at container start) turns every existing profile — at most one per owner today — into its owner's default with no backfill script.

`User`
- Add `issuerProfileId Int?` → `BillingProfile` (relation `"ClientIssuerProfile"`, `onDelete: SetNull`). The company that issues this client's invoices. Null means "the default of whoever issues for me". (`User.billingProfile`, the owner side of `"BillingProfileOwner"`, becomes `billingProfiles BillingProfile[]`; nothing in `src` reads it.)

`Invoice` is unchanged: it already stores `profileId` plus `issuerSnapshot`, so old documents keep saying what they said.

Migration: none beyond `prisma db push`. Dropping a unique constraint and adding columns with defaults loses no data.

## Resolving the company — one function

`resolveIssuerProfile(prisma, clientId, { partnerId, profileId })` in `services/invoiceService.js` (or a small module next to it) is the only place that turns a client into a `BillingProfile`:

1. Find the client's issuer (`partnerId`), exactly as today via `getEffectiveBilling`.
2. If `profileId` was passed (manual override), use it — only if it belongs to that issuer; otherwise refuse.
3. Else, if the client has `issuerProfileId` **and** that profile belongs to that issuer, use it. (A stale assignment — client moved to another partner — is ignored, not honoured.)
4. Else the issuer's default profile.
5. None → null (same as today's "no issuer configured").

Its three callers, which today each do `findUnique({ where: { ownerId } })`:
- `utils/taxes.js → resolveTaxConfig` (automatic issuance and the tax added at checkout). The `own_stripe` mode gate stays where it is.
- `invoiceService.resolveManualIssuerProfile` (manual invoices), now forwarding the optional override.
- `invoiceController.listMine`'s `billsWithTax` check, through `resolveTaxConfig`.

Numbering keeps working unchanged: issuance already increments `invoiceNextNumber` on the profile it was given, inside the transaction, and `Invoice` is `@@unique([profileId, number])`.

## API

Billing profiles (same router, same role gate, same `canConfigureBillingProfile(req.user, ownerId)` check before anything is read or written):
- `GET /api/billing-profile/:userId` → `{ profiles: [...], defaultId }` (all companies of that issuer). The existing single-profile shape is kept under `profile` (= the default) for any caller that still reads it.
- `POST /api/billing-profile/:userId` → create a company (`label` required). The first one created is the default.
- `PUT /api/billing-profile/:userId/:profileId` → update a company. The existing "counter may not move backwards once it has issued" rule applies per profile.
- `PUT /api/billing-profile/:userId` (no id) keeps updating the default, so nothing that calls it today breaks.
- `POST /api/billing-profile/:userId/:profileId/default` → make it the default.
- `DELETE /api/billing-profile/:userId/:profileId` → only if it has issued no invoice (`409` otherwise) and is not the default. Clients assigned to it fall back to the default (`SetNull`).
- Every write is audited with `logAudit`, field names only, as today.

Client assignment:
- `PUT /api/invoices/accounts/:userId/company` with `{ profileId | null }`. Allowed when the requester may issue for that client (`canConfigureBillingProfile` on the resolved issuer) and may read the account (`canReadAccount`); the profile must belong to that issuer. Audited.
- The client's current assignment comes back with the history (below).

Manual invoice:
- `POST /api/invoices/manual` accepts an optional `profileId`. Without it, the client's company is used. The two existing permission checks run against the resolved profile, unchanged.

History:
- `GET /api/invoices/history?forUserId=` → every `Invoice` with that `userId`, newest first, paginated (same limit/default as `listMine`): `{ id, number, issuedAt, paidAt, total, currency, concept (first line), companyLabel, kind: 'automatic' | 'manual' }`, plus `{ company: { assignedProfileId, effectiveProfileId } }` for the account. Same `canReadAccount` gate as the list. Unlike `listMine`, it does not depend on `taxEnabled`: a manual invoice can exist for a client whose issuer shows no tax.
- `companyLabel` is read from the invoice's own profile (`label`), falling back to the `issuerSnapshot` name if the profile is gone.

## Facturas screen

- **Emisor** block: a company selector + "＋ Nueva empresa". Selecting a company loads its data into the existing form (`BillingProfileFields`); Save writes that company. Actions: "Hacer predeterminada", "Eliminar" (hidden/disabled for the default and for a company with invoices, with the reason shown).
- **Client selected** (the existing account selector):
  - "Empresa emisora" selector (Predeterminada + each company) that saves the assignment and states that it affects future invoices only.
  - **Historial de facturas**: table with Nº, fecha, empresa, concepto, total and Ver/Descargar, using the existing `InvoiceDocument` renderer through `GET /api/invoices/:id`. Manual invoices appear here; the in-session `manualCreated` list is replaced by it.
- **Manual invoice form**: a "Empresa" selector preselected with the client's effective company. Tax preview, if shown, uses the selected company's rates.
- With a single company, the screen looks as it does today apart from the history table and a one-option selector.

## Error handling

- Override `profileId` of another issuer, or assignment to one → `403`.
- Unknown profile → `404`. Deleting a company with invoices → `409` with the count. Deleting the default → `400`.
- Two concurrent "make default" writes: the transaction unsets the others and sets one, so the last one wins and there is still exactly one.
- An issuer with no profile at all behaves as today ("no issuer configured").

## Testing

Unit (node:test, as in `server/tests`):
- `resolveIssuerProfile`: assigned client, unassigned client → default, override honoured, override of another issuer refused, stale assignment (other issuer) ignored, no profiles → null.
- Each company numbers independently: issuing from A then B then A gives A-1, B-1, A-2.
- Exactly one default after create / make-default / delete.
- Delete refused with invoices; refused for the default.
- Counter-backwards rule still enforced per profile.
- History includes manual and automatic invoices, newest first, only for readable accounts, and does not depend on `taxEnabled`.
- Manual invoice with override prints the override company's issuer snapshot and spends its counter.
- Backfill: an existing profile becomes the default with its counter and values unchanged.
- The whole existing invoicing suite keeps passing.
