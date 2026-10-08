const test = require('node:test');
const assert = require('node:assert');

// A key for the encrypted webhook column. Set before anything requires the
// encryption helper, which reads the variable at call time.
process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY
  || '0'.repeat(64);

const axios = require('axios');
const { encrypt } = require('../src/utils/encryption');
const { deliverInvoice } = require('../src/services/invoiceDelivery');

// ---------------------------------------------------------------------------
// Handing a freshly issued invoice to n8n.
//
// What these pin down, in the order the owner's rules were given:
//
//   · nothing at all happens while no webhook is configured — the feature is
//     dark until somebody switches it on;
//   · the payload's shape, and BOTH recipients: the client and the issuer's
//     bookkeeper;
//   · `cc` is absent, not empty, when the issuer configured no copy address;
//   · an invoice already handed over is never handed over twice;
//   · a webhook that fails does not throw, and leaves the invoice eligible.
// ---------------------------------------------------------------------------

const WEBHOOK = 'https://n8n.example.com/webhook/factura';

const INVOICE = {
  id: 7,
  number: 'FAC-000124',
  profileId: 3,
  userId: 42,
  creditPurchaseId: 99,
  currency: 'USD',
  subtotal: 136.99,
  taxLabel: 'ITBIS',
  taxRate: 0,
  taxAmount: 0,
  retention: 36.99,
  retentionLabel: 'Ret. IR-17',
  total: 100,
  amountPaid: 100,
  totalInWords: 'CIEN DÓLARES CON 00/100',
  conceptLines: JSON.stringify([{ description: 'Recarga de Saldo', total: 136.99 }]),
  issuerSnapshot: JSON.stringify({ issuerName: 'LM CONSULTING GROUP SRL', brandName: 'LM Consulting', issuerRnc: '1-31-12345-6' }),
  clientSnapshot: JSON.stringify({ company: 'Cliente SRL', rnc: '130-11111-2', email: 'cliente@ejemplo.com' }),
  issuedAt: new Date('2026-03-15T12:00:00.000Z'),
  dueAt: null,
  paidAt: new Date('2026-03-15T12:00:00.000Z'),
  regeneratedAt: null,
  deliveredAt: null,
};

/**
 * @param webhook   the plaintext URL the settings row carries, or null for none
 * @param copyTo    BillingProfile.invoiceCopyTo
 * @param users     the accounts prisma.user.findUnique can answer with
 */
function makeFakePrisma({ webhook = WEBHOOK, copyTo = 'contabilidad@lmconsulting.do', users } = {}) {
  const accounts = users || {
    42: { id: 42, email: 'cuenta@cliente.do', name: 'Cliente', companyName: 'Cliente SRL', receiptEmail: 'pagos@cliente.do' },
  };
  const updates = [];
  return {
    _updates: updates,
    platformSettings: {
      findFirst: async () => ({ invoiceWebhookUrl: webhook ? encrypt(webhook) : null }),
    },
    billingProfile: {
      findUnique: async () => ({ invoiceCopyTo: copyTo }),
    },
    user: {
      findUnique: async ({ where }) => accounts[where.id] || null,
    },
    invoice: {
      update: async (args) => { updates.push(args); return {}; },
    },
  };
}

/** Collect the posts a delivery makes, with axios stubbed out. */
function withAxios(impl, run) {
  const original = axios.post;
  const posts = [];
  axios.post = async (url, payload, config) => {
    posts.push({ url, payload, config });
    return impl ? impl(url, payload) : { status: 200 };
  };
  return run(posts).finally(() => { axios.post = original; });
}

// ---------------------------------------------------------------------------
// Nothing configured, nothing happens.
// ---------------------------------------------------------------------------

test('no webhook configured: nothing is delivered and nothing is stamped', async () => {
  const prisma = makeFakePrisma({ webhook: null });
  await withAxios(null, async (posts) => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.deepStrictEqual(result, { sent: false, reason: 'no invoice webhook configured' });
    assert.strictEqual(posts.length, 0, 'no HTTP call at all');
    assert.strictEqual(prisma._updates.length, 0, 'deliveredAt must stay null');
  });
});

// ---------------------------------------------------------------------------
// The payload, and both recipients.
// ---------------------------------------------------------------------------

test('the payload carries type, both recipients, a subject, the html and every figure', async () => {
  const prisma = makeFakePrisma();
  await withAxios(null, async (posts) => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(result.sent, true);
    assert.strictEqual(posts.length, 1);

    const { url, payload, config } = posts[0];
    assert.strictEqual(url, WEBHOOK);
    // Same timeout the usage report posts with.
    assert.strictEqual(config.timeout, 15000);

    assert.strictEqual(payload.type, 'invoice');
    // THE CLIENT: resolveReceiptEmail, which prefers the account's receiptEmail.
    assert.strictEqual(payload.to, 'pagos@cliente.do');
    // THE ISSUER'S COPY: its bookkeeper.
    assert.strictEqual(payload.cc, 'contabilidad@lmconsulting.do');
    assert.strictEqual(payload.subject, 'Factura FAC-000124 · USD 100.00 · Cliente SRL');
    assert.ok(payload.html.includes('NO. FAC-000124'), 'the ready-made document travels with it');
    assert.ok(payload.html.includes('Ret. IR-17'));
    assert.strictEqual(payload.brand, 'LM Consulting');
    assert.deepStrictEqual(payload.client, { id: 42, name: 'Cliente SRL', email: 'cuenta@cliente.do' });

    // The structured data, so n8n can render its own version: the number, the
    // dates, every amount, both snapshots and the concept lines.
    const inv = payload.invoice;
    assert.strictEqual(inv.number, 'FAC-000124');
    assert.strictEqual(inv.currency, 'USD');
    assert.strictEqual(inv.subtotal, 136.99);
    assert.strictEqual(inv.taxLabel, 'ITBIS');
    assert.strictEqual(inv.taxRate, 0);
    assert.strictEqual(inv.taxAmount, 0);
    assert.strictEqual(inv.retention, 36.99);
    assert.strictEqual(inv.retentionLabel, 'Ret. IR-17');
    assert.strictEqual(inv.total, 100);
    assert.strictEqual(inv.amountPaid, 100);
    assert.strictEqual(inv.totalInWords, 'CIEN DÓLARES CON 00/100');
    assert.strictEqual(inv.purchaseId, 99);
    assert.deepStrictEqual(inv.issuedAt, INVOICE.issuedAt);
    assert.deepStrictEqual(inv.paidAt, INVOICE.paidAt);
    assert.strictEqual(inv.dueAt, null);
    assert.strictEqual(inv.regeneratedAt, null);
    assert.deepStrictEqual(inv.lines, [{ description: 'Recarga de Saldo', total: 136.99 }]);
    assert.strictEqual(inv.issuer.issuerRnc, '1-31-12345-6');
    assert.strictEqual(inv.client.company, 'Cliente SRL');
  });
});

test('a successful delivery stamps deliveredAt on that invoice and nothing else', async () => {
  const prisma = makeFakePrisma();
  const before = Date.now();
  await withAxios(null, async () => {
    await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(prisma._updates.length, 1);
    const { where, data } = prisma._updates[0];
    assert.deepStrictEqual(where, { id: 7 });
    assert.deepStrictEqual(Object.keys(data), ['deliveredAt']);
    assert.ok(data.deliveredAt instanceof Date);
    assert.ok(data.deliveredAt.getTime() >= before && data.deliveredAt.getTime() <= Date.now());
  });
});

test("the client's address falls back up to the partner and then to the account's own email", async () => {
  // No receiptEmail on the client; its partner has one.
  const users = {
    42: { id: 42, email: 'cuenta@cliente.do', agencyId: 9, receiptEmail: null, companyName: 'Cliente SRL' },
    9: { id: 9, email: 'socio@partner.do', receiptEmail: 'facturas@partner.do' },
  };
  const prisma = makeFakePrisma({ users });
  await withAxios(null, async (posts) => {
    await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(posts[0].payload.to, 'facturas@partner.do');
  });

  // Nobody has one: the account's own email.
  const alone = makeFakePrisma({ users: { 42: { id: 42, email: 'cuenta@cliente.do', receiptEmail: null } } });
  await withAxios(null, async (posts) => {
    await deliverInvoice(alone, { ...INVOICE });
    assert.strictEqual(posts[0].payload.to, 'cuenta@cliente.do');
  });
});

// ---------------------------------------------------------------------------
// No copy address.
// ---------------------------------------------------------------------------

test('cc is OMITTED, not empty, when the issuer configured no copy address', async () => {
  for (const copyTo of [null, '', '   ']) {
    const prisma = makeFakePrisma({ copyTo });
    // eslint-disable-next-line no-await-in-loop
    await withAxios(null, async (posts) => {
      const result = await deliverInvoice(prisma, { ...INVOICE });
      assert.strictEqual(result.sent, true, 'the client still gets the invoice');
      const { payload } = posts[0];
      assert.ok(!('cc' in payload), `cc must be absent for copyTo ${JSON.stringify(copyTo)}`);
      assert.strictEqual(payload.to, 'pagos@cliente.do');
    });
  }
});

test('a copy address is trimmed before it is sent', async () => {
  const prisma = makeFakePrisma({ copyTo: '  contable@emisor.do  ' });
  await withAxios(null, async (posts) => {
    await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(posts[0].payload.cc, 'contable@emisor.do');
  });
});

test('a profile that cannot be read costs the copy, not the delivery', async () => {
  const prisma = makeFakePrisma();
  prisma.billingProfile.findUnique = async () => { throw new Error('column does not exist'); };
  await withAxios(null, async (posts) => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(result.sent, true);
    assert.ok(!('cc' in posts[0].payload));
  });
});

// ---------------------------------------------------------------------------
// Exactly once.
// ---------------------------------------------------------------------------

test('an invoice already delivered is not delivered again', async () => {
  const prisma = makeFakePrisma();
  await withAxios(null, async (posts) => {
    const result = await deliverInvoice(prisma, {
      ...INVOICE,
      deliveredAt: new Date('2026-03-15T12:05:00.000Z'),
    });
    assert.deepStrictEqual(result, { sent: false, reason: 'already delivered' });
    assert.strictEqual(posts.length, 0, 'the client must not receive a second copy');
    assert.strictEqual(prisma._updates.length, 0, 'and the first delivery date must not move');
  });
});

test('the already-delivered guard is checked before the webhook is even read', async () => {
  // Cheap repeat: no settings read, no account read, no network.
  const prisma = makeFakePrisma();
  let settingsReads = 0;
  prisma.platformSettings.findFirst = async () => { settingsReads += 1; return {}; };
  await withAxios(null, async () => {
    await deliverInvoice(prisma, { ...INVOICE, deliveredAt: new Date() });
    assert.strictEqual(settingsReads, 0);
  });
});

// ---------------------------------------------------------------------------
// Nothing here may ever throw: this runs behind a card charge that went
// through, and a mail problem must never turn a good payment into an error.
// ---------------------------------------------------------------------------

test('a webhook that fails does not throw, and leaves the invoice eligible', async () => {
  const prisma = makeFakePrisma();
  const failing = () => { const e = new Error('boom'); e.response = { status: 500 }; throw e; };
  await withAxios(failing, async (posts) => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(result.sent, false);
    assert.match(result.reason, /webhook failed: 500/);
    assert.strictEqual(posts.length, 1, 'it did try');
    // THE POINT: deliveredAt is NOT stamped, so a later attempt can still send.
    assert.strictEqual(prisma._updates.length, 0);
  });
});

test('a network error with no HTTP status is reported by message, still without throwing', async () => {
  const prisma = makeFakePrisma();
  await withAxios(() => { throw new Error('ECONNREFUSED'); }, async () => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.deepStrictEqual(result, { sent: false, reason: 'webhook failed: ECONNREFUSED' });
  });
});

test('a prisma that blows up entirely is reported, not thrown', async () => {
  const prisma = makeFakePrisma();
  prisma.user.findUnique = async () => { throw new Error('connection terminated'); };
  await withAxios(null, async () => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.strictEqual(result.sent, false);
    assert.match(result.reason, /connection terminated/);
  });
});

test('no invoice, or an orphaned one whose account was deleted, is a reason and not a throw', async () => {
  const prisma = makeFakePrisma();
  await withAxios(null, async (posts) => {
    assert.deepStrictEqual(await deliverInvoice(prisma, null), { sent: false, reason: 'no invoice' });
    assert.deepStrictEqual(
      await deliverInvoice(prisma, { ...INVOICE, userId: null }),
      { sent: false, reason: 'account not found' },
    );
    assert.strictEqual(posts.length, 0);
  });
});

test('an unreadable settings row costs the delivery, not the process', async () => {
  const prisma = makeFakePrisma();
  prisma.platformSettings.findFirst = async () => { throw new Error('no such table'); };
  await withAxios(null, async (posts) => {
    const result = await deliverInvoice(prisma, { ...INVOICE });
    assert.deepStrictEqual(result, { sent: false, reason: 'no invoice webhook configured' });
    assert.strictEqual(posts.length, 0);
  });
});
