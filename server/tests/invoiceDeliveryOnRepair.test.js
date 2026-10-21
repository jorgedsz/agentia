const test = require('node:test');
const assert = require('node:assert');
const invoiceDelivery = require('../src/services/invoiceDelivery');
const { getByPurchase } = require('../src/controllers/invoiceController');

// ---------------------------------------------------------------------------
// GET /api/invoices/by-purchase/:purchaseId — the on-demand repair — now
// delivers the document it issues.
//
// WHY THIS PATH MATTERS MOST: settlement issues the invoice fire-and-forget, so
// a payment can settle correctly and leave no document. This route is how that
// repairs itself, which makes it exactly the case where something already went
// wrong once and the client would otherwise silently never receive an invoice.
//
// WHAT IT MUST NOT DO: mail anything when the invoice was already on file. A
// client clicking «Ver factura» twice takes the early return, and `issued` is
// what decides — Invoice.deliveredAt is the backstop behind that, not the
// mechanism. These tests check the decision is made on `issued`, by handing the
// route an existing invoice whose `deliveredAt` is null: if the guard were the
// column, that invoice WOULD be mailed.
// ---------------------------------------------------------------------------

const PURCHASE = {
  id: 99,
  userId: 42,
  status: 'completed',
  credits: 100,
  amount: 100,
  kind: 'manual',
  createdAt: new Date('2026-03-15T11:58:00.000Z'),
  settledAt: new Date('2026-03-15T12:00:00.000Z'),
};

const PROFILE = {
  id: 3,
  ownerId: 9,
  taxEnabled: true,
  chargeTaxToClient: false,
  taxRate: 0,
  taxLabel: 'ITBIS',
  retentionRate: 27,
  retentionLabel: 'Ret. IR-17',
  invoicePrefix: 'FAC-',
  invoicePadding: 6,
  invoiceNextNumber: 124,
  dueDays: 0,
  issuerName: 'LM CONSULTING GROUP SRL',
  brandName: 'LM Consulting',
};

/**
 * A prisma that can carry the whole repair: resolveTaxConfig walks the client
 * up to its own_stripe partner, the profile is taxEnabled, and the issuance
 * transaction bumps the correlative and inserts the row.
 *
 * @param existing the invoice already on file, or null for "never issued"
 */
function makeFakePrisma({ existing = null } = {}) {
  const created = [];
  return {
    _created: created,
    creditPurchase: { findUnique: async () => PURCHASE },
    invoice: {
      findUnique: async () => existing,
      update: async () => ({}),
    },
    user: {
      findUnique: async ({ where }) => ({
        42: { id: 42, role: 'CLIENT', email: 'cuenta@cliente.do', agencyId: 9, companyName: 'Cliente SRL' },
        9: { id: 9, role: 'WHITELABEL', email: 'socio@partner.do', billingMode: 'own_stripe' },
      }[where.id] || null),
    },
    billingProfile: { findUnique: async () => PROFILE },
    $transaction: async (fn) => fn({
      billingProfile: { update: async () => ({ ...PROFILE, invoiceNextNumber: PROFILE.invoiceNextNumber + 1 }) },
      invoice: {
        create: async ({ data }) => {
          const row = { id: 7, deliveredAt: null, ...data };
          created.push(row);
          return row;
        },
      },
    }),
  };
}

function fakeRes() {
  return {
    code: 200,
    body: null,
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

/** Call the route with deliverInvoice stubbed, and hand back what it saw. */
async function callRoute(prisma, { deliver } = {}) {
  const real = invoiceDelivery.deliverInvoice;
  const delivered = [];
  invoiceDelivery.deliverInvoice = async (_prisma, invoice) => {
    delivered.push(invoice);
    return deliver ? deliver(invoice) : { sent: true };
  };
  const res = fakeRes();
  try {
    await getByPurchase(
      { prisma, user: { id: 99, role: 'OWNER' }, params: { purchaseId: '99' } },
      res,
    );
    // Delivery is started fire-and-forget, so let the microtasks run.
    await new Promise(setImmediate);
  } finally {
    invoiceDelivery.deliverInvoice = real;
  }
  return { res, delivered };
}

test('the repair route delivers the invoice it just issued', async () => {
  const prisma = makeFakePrisma();
  const { res, delivered } = await callRoute(prisma);

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.issued, true);
  assert.strictEqual(res.body.invoice.number, 'FAC-000124');

  assert.strictEqual(delivered.length, 1);
  // The ROW issuance returned, not a re-read of it.
  assert.strictEqual(delivered[0], prisma._created[0]);
  assert.strictEqual(delivered[0].number, 'FAC-000124');
});

test('an invoice that already existed is NOT delivered, and `issued` is what decides', async () => {
  // deliveredAt deliberately null: if the guard were the column instead of
  // `issued`, this invoice would be mailed a second time.
  const existing = {
    id: 7,
    number: 'FAC-000124',
    profileId: 3,
    userId: 42,
    creditPurchaseId: 99,
    currency: 'USD',
    subtotal: 100,
    taxLabel: 'ITBIS',
    taxRate: 0,
    taxAmount: 0,
    retention: 0,
    total: 100,
    totalInWords: 'CIEN DÓLARES CON 00/100',
    conceptLines: '[]',
    issuerSnapshot: '{}',
    clientSnapshot: '{}',
    issuedAt: new Date('2026-03-15T12:00:00.000Z'),
    deliveredAt: null,
  };
  const prisma = makeFakePrisma({ existing });
  const { res, delivered } = await callRoute(prisma);

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.issued, false);
  assert.strictEqual(delivered.length, 0, 'clicking «Ver factura» twice must not send two emails');
  assert.strictEqual(prisma._created.length, 0, 'and nothing was issued either');
});

test('a webhook failure does not change the route answer', async () => {
  const prisma = makeFakePrisma();
  const { res, delivered } = await callRoute(prisma, {
    deliver: () => ({ sent: false, reason: 'webhook failed: 500' }),
  });

  assert.strictEqual(delivered.length, 1, 'it did try');
  // The document is already written and its number already taken; the person
  // waiting on the screen gets it regardless.
  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.issued, true);
  assert.strictEqual(res.body.invoice.number, 'FAC-000124');
});

test('a delivery that REJECTS does not take the response with it', async () => {
  const prisma = makeFakePrisma();
  const { res } = await callRoute(prisma, {
    deliver: () => { throw new Error('webhook exploded'); },
  });

  assert.strictEqual(res.code, 200);
  assert.strictEqual(res.body.issued, true);
});

test('a payment that generates no invoice at all delivers nothing', async () => {
  // No tax-enabled issuer governs the account, so issueInvoiceForPurchase
  // returns null and the route answers 404.
  const prisma = makeFakePrisma();
  prisma.billingProfile.findUnique = async () => ({ ...PROFILE, taxEnabled: false });
  const { res, delivered } = await callRoute(prisma);

  assert.strictEqual(res.code, 404);
  assert.strictEqual(delivered.length, 0);
});

test('a payment that is not settled yet is neither issued nor delivered', async () => {
  const prisma = makeFakePrisma();
  prisma.creditPurchase.findUnique = async () => ({ ...PURCHASE, status: 'pending' });
  const { res, delivered } = await callRoute(prisma);

  assert.strictEqual(res.code, 409);
  assert.strictEqual(delivered.length, 0);
});
