const test = require('node:test');
const assert = require('node:assert');
const { settleCreditPurchase } = require('../src/utils/creditSettlement');

// ---------------------------------------------------------------------------
// settleCreditPurchase — the one place a payment becomes balance, and now the
// one place the payment DATE is stamped.
//
// The same Stripe payment can reach us twice (the off-session charge returns
// "succeeded" synchronously AND the webhook arrives moments later), so what
// these tests pin down is that `settledAt` is written by the call that CLAIMS
// the row and by no other: a second attempt must not move the date a fiscal
// document was built from.
// ---------------------------------------------------------------------------

// `reportSentAt` is set so sendPaymentReport returns early, and the fake's
// invoice.findUnique answers with an already-issued invoice so
// issueInvoiceForPurchase does too. Both are fire-and-forget inside the
// function under test; short-circuiting them keeps these tests about the
// settlement write itself instead of about e-mail and numbering.
const PURCHASE = {
  id: 77,
  userId: 42,
  credits: 100,
  amount: 127,
  status: 'pending',
  kind: 'manual',
  reportSentAt: new Date('2026-04-01T12:00:00.000Z'),
  createdAt: new Date('2026-04-01T11:58:00.000Z'),
};

function makeFakePrisma({ status = 'pending' } = {}) {
  const row = { ...PURCHASE, status };
  const calls = { updateMany: [], userUpdate: [] };
  return {
    _row: () => row,
    _calls: calls,
    creditPurchase: {
      updateMany: async ({ where, data }) => {
        calls.updateMany.push({ where, data });
        // The conditional claim: only a row still matching `where` is taken.
        if (where.status && row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
    },
    user: {
      update: async (args) => {
        calls.userUpdate.push(args);
        return {};
      },
    },
    // Already issued, so the fire-and-forget invoice path exits immediately.
    invoice: { findUnique: async () => ({ id: 1, number: 'FAC-000124' }) },
  };
}

test('settleCreditPurchase stamps settledAt in the SAME write that claims the row', async () => {
  const prisma = makeFakePrisma();
  const before = Date.now();

  const credited = await settleCreditPurchase(prisma, PURCHASE);

  assert.strictEqual(credited, true);
  // One update, not two: the timestamp rides along with status: 'completed' and
  // inherits its exactly-once guarantee.
  assert.strictEqual(prisma._calls.updateMany.length, 1);
  const { where, data } = prisma._calls.updateMany[0];
  assert.deepStrictEqual(where, { id: 77, status: 'pending' });
  assert.strictEqual(data.status, 'completed');
  assert.ok(data.settledAt instanceof Date, 'settledAt must be written as a Date');
  const stamped = data.settledAt.getTime();
  assert.ok(stamped >= before && stamped <= Date.now(), 'settledAt must be the moment of settlement');
  assert.strictEqual(prisma._row().settledAt, data.settledAt);
  // And the balance was credited by this same call.
  assert.strictEqual(prisma._calls.userUpdate.length, 1);
});

test('a second settle attempt neither credits again nor moves settledAt', async () => {
  // The row is already completed — the webhook arriving after the synchronous
  // charge, which is the case this whole function exists for.
  const prisma = makeFakePrisma({ status: 'completed' });
  const firstStamp = new Date('2026-04-01T11:58:30.000Z');
  prisma._row().settledAt = firstStamp;

  const credited = await settleCreditPurchase(prisma, PURCHASE);

  assert.strictEqual(credited, false);
  // It did attempt the conditional claim, and the claim matched nothing.
  assert.strictEqual(prisma._calls.updateMany.length, 1);
  assert.ok(prisma._calls.updateMany[0].data.settledAt instanceof Date);
  // What matters: the row kept the date the CLAIMING call wrote.
  assert.strictEqual(prisma._row().settledAt, firstStamp);
  // No second credit either.
  assert.strictEqual(prisma._calls.userUpdate.length, 0);
});

test('settleCreditPurchase still carries the Stripe fields in that same write', async () => {
  const prisma = makeFakePrisma();

  await settleCreditPurchase(prisma, PURCHASE, { paymentIntentId: 'pi_123', payload: { ok: true } });

  const { data } = prisma._calls.updateMany[0];
  assert.strictEqual(data.stripePaymentIntentId, 'pi_123');
  assert.strictEqual(data.rawPayload, JSON.stringify({ ok: true }));
  assert.ok(data.settledAt instanceof Date);
});

test('settleCreditPurchase does not mutate the purchase object it was handed', async () => {
  const prisma = makeFakePrisma();
  const purchase = { ...PURCHASE };

  await settleCreditPurchase(prisma, purchase);

  // The settled view handed downstream is a COPY: the caller's object is left
  // as it was found.
  assert.strictEqual(purchase.settledAt, undefined);
  assert.strictEqual(purchase.status, 'pending');
});

// THE REASON THE SETTLED VIEW EXISTS. updateMany answers with a count and not
// the row, so the `purchase` object this was called with still has no
// settledAt — and the invoice issued moments later snapshots the payment date
// off that object. Handing it the stale one would make every brand-new invoice
// fall back to `createdAt`, which is the exact thing settledAt was added to
// stop doing.
test('the purchase handed to invoice issuance carries the settledAt just written', async () => {
  const prisma = makeFakePrisma();
  const invoiceService = require('../src/services/invoiceService');
  const real = invoiceService.issueInvoiceForPurchase;
  let seen = null;
  invoiceService.issueInvoiceForPurchase = async (_prisma, purchase) => {
    seen = purchase;
    return null;
  };

  try {
    await settleCreditPurchase(prisma, PURCHASE);
    // Issuance is started fire-and-forget, so let the microtasks run.
    await new Promise(setImmediate);
  } finally {
    invoiceService.issueInvoiceForPurchase = real;
  }

  assert.ok(seen, 'issuance must have been started');
  assert.strictEqual(seen.settledAt, prisma._calls.updateMany[0].data.settledAt);
  assert.strictEqual(seen.status, 'completed');
  // Everything else about the purchase is passed through unchanged.
  assert.strictEqual(seen.id, PURCHASE.id);
  assert.strictEqual(seen.credits, PURCHASE.credits);
});
