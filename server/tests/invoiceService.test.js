const test = require('node:test');
const assert = require('node:assert');
const {
  issueInvoiceForPurchase,
  buildInvoiceData,
  formatNumber,
  conceptFor,
} = require('../src/services/invoiceService');
const { computeCharge, round2 } = require('../src/utils/taxes');

// ---------------------------------------------------------------------------
// formatNumber
// ---------------------------------------------------------------------------

test('formatNumber pads the correlative and prepends the prefix', () => {
  assert.strictEqual(formatNumber({ invoicePrefix: 'FAC-', invoicePadding: 6 }, 124), 'FAC-000124');
});

test('formatNumber works with a different prefix/padding/correlative shape', () => {
  assert.strictEqual(formatNumber({ invoicePrefix: 'B02', invoicePadding: 8 }, 7), 'B0200000007');
});

// ---------------------------------------------------------------------------
// conceptFor
// ---------------------------------------------------------------------------

test('conceptFor: a purchase carrying billingPeriodId always wins, regardless of kind', () => {
  assert.strictEqual(
    conceptFor({ billingPeriodId: 3, kind: 'manual' }),
    'Liquidación del periodo facturado',
  );
});

test('conceptFor: auto_recharge', () => {
  assert.strictEqual(conceptFor({ kind: 'auto_recharge' }), 'Recarga automática de saldo');
});

test('conceptFor: cycle_topup with both dates formats the period in es-DO / Santo Domingo', () => {
  const purchase = {
    kind: 'cycle_topup',
    periodStart: '2026-03-01T12:00:00.000Z',
    periodEnd: '2026-03-15T12:00:00.000Z',
  };
  assert.strictEqual(conceptFor(purchase), 'Consumo del periodo 01/03/2026 – 15/03/2026');
});

test('conceptFor: cycle_topup missing either date falls back to the bare label', () => {
  assert.strictEqual(conceptFor({ kind: 'cycle_topup', periodStart: null, periodEnd: null }), 'Consumo del periodo');
  assert.strictEqual(
    conceptFor({ kind: 'cycle_topup', periodStart: '2026-03-01T00:00:00.000Z', periodEnd: null }),
    'Consumo del periodo',
  );
});

test('conceptFor: manual and manual_card both fall to the generic recharge label', () => {
  assert.strictEqual(conceptFor({ kind: 'manual' }), 'Recarga de saldo — créditos de consumo');
  assert.strictEqual(conceptFor({ kind: 'manual_card' }), 'Recarga de saldo — créditos de consumo');
});

// ---------------------------------------------------------------------------
// buildInvoiceData
// ---------------------------------------------------------------------------

const PROFILE = {
  id: 5,
  // The invoice's tax comes off THESE two, at issue time - never off the
  // purchase, which only records what the card actually paid.
  taxEnabled: true,
  taxRate: 27,
  taxLabel: 'ITBIS',
  dueDays: 0,
  issuerName: 'LM Consulting Group SRL',
  issuerRnc: '1-01-00000-1',
  brandName: 'LM Consulting',
  slogan: 'Tu aliado en IA',
  logoUrl: 'https://example.com/logo.png',
  bankName: 'Banreservas',
  bankAccount: '1234567890',
  swift: 'BRESDOSD',
  routingNumber: '',
  paymentMethod: 'Transferencia',
  paymentTerms: 'Neto 15',
  site1Name: 'Oficina Central',
  site1Phone: '809-000-0000',
  site1City: 'Santo Domingo',
  site1Address: 'Av. Principal 1',
  site2Name: null,
  site2Phone: null,
  site2City: null,
  site2Address: null,
  contactEmail: 'facturacion@lm.com',
  contactWeb: 'https://lm.com',
};

const CLIENT = {
  id: 42,
  email: 'client@biz.com',
  name: 'Cliente Prueba',
  companyName: 'Cliente Prueba SRL (marca)',
  phoneNumber: '809-111-1111',
  billingCompany: 'Cliente Prueba Fiscal SRL',
  billingRnc: '1-02-00000-2',
  billingAddress: 'Calle Falsa 123',
  billingCity: 'Santiago',
  billingPhone: '809-222-2222',
};

// THE TAX WAS CHARGED: the card paid 127 for 100 credits, so the invoice total
// and the money collected are the same number.
const PURCHASE = {
  id: 77,
  userId: 42,
  credits: 100,
  taxRate: 27,
  taxAmount: 27,
  amount: 127,
  kind: 'manual',
};

// THE TAX WAS ONLY SHOWN (BillingProfile.chargeTaxToClient off, the default):
// the card paid exactly the 100 the client asked for, and the purchase carries
// no tax at all. The invoice must still total 127, with 100 recorded as paid.
const PURCHASE_TAX_NOT_CHARGED = {
  id: 78,
  userId: 42,
  credits: 100,
  taxRate: 27,
  taxAmount: 0,
  amount: 100,
  kind: 'manual',
};

test('buildInvoiceData produces the right subtotal/tax/total breakdown', () => {
  const issuedAt = new Date('2026-04-01T12:00:00.000Z');
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001', issuedAt });

  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxAmount, 27);
  assert.strictEqual(data.retention, 0);
  assert.strictEqual(data.total, 127);
  // The tax WAS charged here, so the document and the card agree to the cent.
  assert.strictEqual(data.amountPaid, 127);
  assert.strictEqual(data.taxRate, 27);
  assert.strictEqual(data.taxLabel, 'ITBIS');
  assert.strictEqual(data.currency, 'USD');
  assert.strictEqual(data.number, 'FAC-000001');
  assert.strictEqual(data.profileId, 5);
  assert.strictEqual(data.userId, 42);
  assert.strictEqual(data.creditPurchaseId, 77);
});

test('buildInvoiceData spells the total in words', () => {
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001' });
  assert.strictEqual(data.totalInWords, 'CIENTO VEINTISIETE DÓLARES CON 00/100');
});

test('buildInvoiceData writes conceptLines as JSON with the concept + subtotal', () => {
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001' });
  const lines = JSON.parse(data.conceptLines);
  assert.deepStrictEqual(lines, [{ description: 'Recarga de saldo — créditos de consumo', total: 100 }]);
});

test('buildInvoiceData freezes the issuer snapshot, defaulting every absent field to empty string', () => {
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001' });
  const issuer = JSON.parse(data.issuerSnapshot);
  assert.strictEqual(issuer.issuerName, 'LM Consulting Group SRL');
  assert.strictEqual(issuer.issuerRnc, '1-01-00000-1');
  assert.strictEqual(issuer.brandName, 'LM Consulting');
  assert.strictEqual(issuer.slogan, 'Tu aliado en IA');
  assert.strictEqual(issuer.logoUrl, 'https://example.com/logo.png');
  assert.strictEqual(issuer.bankName, 'Banreservas');
  assert.strictEqual(issuer.bankAccount, '1234567890');
  assert.strictEqual(issuer.swift, 'BRESDOSD');
  assert.strictEqual(issuer.routingNumber, '');
  assert.strictEqual(issuer.paymentMethod, 'Transferencia');
  assert.strictEqual(issuer.paymentTerms, 'Neto 15');
  assert.deepStrictEqual(issuer.site1, { name: 'Oficina Central', phone: '809-000-0000', city: 'Santo Domingo', address: 'Av. Principal 1' });
  assert.deepStrictEqual(issuer.site2, { name: '', phone: '', city: '', address: '' });
  assert.strictEqual(issuer.contactEmail, 'facturacion@lm.com');
  assert.strictEqual(issuer.contactWeb, 'https://lm.com');
});

test('buildInvoiceData writes the client snapshot from the billing* fields', () => {
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001' });
  const client = JSON.parse(data.clientSnapshot);
  assert.deepStrictEqual(client, {
    company: 'Cliente Prueba Fiscal SRL',
    rnc: '1-02-00000-2',
    address: 'Calle Falsa 123',
    city: 'Santiago',
    phone: '809-222-2222',
    email: 'client@biz.com',
  });
});

test('buildInvoiceData falls back company through companyName then name, and phone through phoneNumber, when billing* fields are absent', () => {
  const clientWithCompanyName = { id: 1, email: 'a@b.com', name: 'Full Name', companyName: 'Branded Co', phoneNumber: '809-333-3333' };
  const dataA = buildInvoiceData({ profile: PROFILE, client: clientWithCompanyName, purchase: PURCHASE, number: 'FAC-000001' });
  const snapshotA = JSON.parse(dataA.clientSnapshot);
  assert.strictEqual(snapshotA.company, 'Branded Co');
  assert.strictEqual(snapshotA.phone, '809-333-3333');
  assert.strictEqual(snapshotA.rnc, '');
  assert.strictEqual(snapshotA.address, '');
  assert.strictEqual(snapshotA.city, '');
  assert.strictEqual(snapshotA.email, 'a@b.com');

  const clientWithOnlyName = { id: 2, email: 'c@d.com', name: 'Only Name', companyName: null, phoneNumber: null };
  const dataB = buildInvoiceData({ profile: PROFILE, client: clientWithOnlyName, purchase: PURCHASE, number: 'FAC-000002' });
  const snapshotB = JSON.parse(dataB.clientSnapshot);
  assert.strictEqual(snapshotB.company, 'Only Name');
  assert.strictEqual(snapshotB.phone, '');
});

test('buildInvoiceData totals correctly for an issuer with no tax at all', () => {
  const noTax = { ...PROFILE, taxEnabled: false, taxRate: 0 };
  const untaxed = { id: 88, userId: 42, credits: 50, taxRate: 0, taxAmount: 0, amount: 50, kind: 'manual' };
  const data = buildInvoiceData({ profile: noTax, client: CLIENT, purchase: untaxed, number: 'FAC-000003' });
  assert.strictEqual(data.subtotal, 50);
  assert.strictEqual(data.taxAmount, 0);
  assert.strictEqual(data.total, 50);
  assert.strictEqual(data.amountPaid, 50);
  assert.strictEqual(data.totalInWords, 'CINCUENTA DÓLARES CON 00/100');
});

// The headline case of the whole split: the client paid 100 and got 100
// credits, and the document still asks for 127. The gap is not a bug to round
// away - it is what the owner asked for - but `amountPaid` has to record the
// 100 so the document can be reconciled against the payment.
test('buildInvoiceData shows the tax on a payment that was never charged it', () => {
  const data = buildInvoiceData({
    profile: PROFILE, client: CLIENT, purchase: PURCHASE_TAX_NOT_CHARGED, number: 'FAC-000004',
  });
  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxRate, 27);
  assert.strictEqual(data.taxLabel, 'ITBIS');
  assert.strictEqual(data.taxAmount, 27);
  assert.strictEqual(data.total, 127);
  // 27 of the 127 was never collected.
  assert.strictEqual(data.amountPaid, 100);
  assert.strictEqual(data.totalInWords, 'CIENTO VEINTISIETE DÓLARES CON 00/100');
  // The DESCRIPCIÓN row still prices what the client actually bought.
  assert.deepStrictEqual(JSON.parse(data.conceptLines), [
    { description: 'Recarga de saldo — créditos de consumo', total: 100 },
  ]);
});

// The purchase's own tax columns must not reach the document in either
// direction: a row that recorded no tax still gets the issuer's 27%, and a row
// that recorded a stale rate is ignored in favour of the profile's.
test('buildInvoiceData ignores the purchase tax columns entirely', () => {
  const stale = { ...PURCHASE, taxRate: 99, taxAmount: 99 };
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: stale, number: 'FAC-000005' });
  assert.strictEqual(data.taxRate, 27);
  assert.strictEqual(data.taxAmount, 27);
  assert.strictEqual(data.total, 127);
});

test('buildInvoiceData rounds the tax to the cent, half up, like the charge path', () => {
  // 12.50 * 27% is exactly 3.375 -> 3.38, and 15.50 * 27% is 4.185 -> 4.19
  // (the value that used to come out a cent short in plain float arithmetic).
  const at = (credits) => buildInvoiceData({
    profile: PROFILE, client: CLIENT, purchase: { ...PURCHASE, credits, amount: credits }, number: 'FAC-000006',
  });
  assert.strictEqual(at(12.5).taxAmount, 3.38);
  assert.strictEqual(at(12.5).total, 15.88);
  assert.strictEqual(at(15.5).taxAmount, 4.19);
  assert.strictEqual(at(15.5).total, 19.69);
});

// When the tax IS charged, the document must match the card to the cent - so
// the arithmetic here and the arithmetic in the charge path have to agree at
// every amount, not just the round ones. Two different implementations
// (round2 on a float product here, integer cents there), swept against each
// other.
test('the invoice tax agrees with the charge path at every cent, so a charged invoice matches the card', () => {
  const CHARGED = { taxEnabled: true, chargeTaxToClient: true, taxRate: 27, taxLabel: 'ITBIS' };
  let checked = 0;
  for (let cents = 1; cents <= 50000; cents++) {
    const credits = cents / 100;
    const charge = computeCharge(credits, CHARGED);
    const data = buildInvoiceData({
      profile: PROFILE,
      client: CLIENT,
      // Exactly what the charge path would have written on the purchase.
      purchase: { ...PURCHASE, credits: charge.subtotal, taxAmount: charge.taxAmount, amount: charge.total },
      number: 'FAC-000007',
    });
    assert.strictEqual(data.taxAmount, charge.taxAmount, `tax differs at ${credits}`);
    assert.strictEqual(data.total, charge.total, `total differs at ${credits}`);
    assert.strictEqual(data.amountPaid, data.total, `paid must equal total at ${credits}`);
    checked++;
  }
  assert.strictEqual(checked, 50000);
});

// And in the other mode the shortfall is exactly the tax, at every amount.
test('with the tax only shown, the uncollected gap is exactly the tax at every cent', () => {
  for (let cents = 1; cents <= 50000; cents += 7) {
    const credits = cents / 100;
    const data = buildInvoiceData({
      profile: PROFILE,
      client: CLIENT,
      purchase: { ...PURCHASE_TAX_NOT_CHARGED, credits, amount: credits },
      number: 'FAC-000008',
    });
    assert.strictEqual(data.amountPaid, credits, `paid differs at ${credits}`);
    assert.strictEqual(round2(data.total - data.amountPaid), data.taxAmount, `gap differs at ${credits}`);
  }
});

test('buildInvoiceData records amountPaid null when the purchase carries no usable amount', () => {
  const data = buildInvoiceData({
    profile: PROFILE, client: CLIENT, purchase: { ...PURCHASE, amount: undefined }, number: 'FAC-000009',
  });
  assert.strictEqual(data.amountPaid, null);
  assert.strictEqual(data.total, 127);
});

test('buildInvoiceData: dueAt equals issuedAt when dueDays is 0', () => {
  const issuedAt = new Date('2026-05-01T00:00:00.000Z');
  const data = buildInvoiceData({ profile: { ...PROFILE, dueDays: 0 }, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001', issuedAt });
  assert.strictEqual(data.dueAt.getTime(), issuedAt.getTime());
});

test('buildInvoiceData: dueAt is 30 days after issuedAt when dueDays is 30', () => {
  const issuedAt = new Date('2026-05-01T00:00:00.000Z');
  const data = buildInvoiceData({ profile: { ...PROFILE, dueDays: 30 }, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001', issuedAt });
  assert.strictEqual(data.dueAt.getTime(), new Date('2026-05-31T00:00:00.000Z').getTime());
});

// ---------------------------------------------------------------------------
// issueInvoiceForPurchase
// ---------------------------------------------------------------------------

// Builds a fake prisma that satisfies resolveTaxConfig's internal call to
// getEffectiveBilling (via a direct agencyId -> partner link with billingMode
// 'manual', which is enough for getEffectiveBilling to return that partner)
// plus the invoice/billingProfile/$transaction surface issueInvoiceForPurchase
// itself uses. No real database involved anywhere.
function makeFakePrisma({ client, partner, profile, existingInvoice = null }) {
  const usersById = new Map([[client.id, client], ...(partner ? [[partner.id, partner]] : [])]);
  const billingProfileRow = profile ? { ...profile } : null;
  const calls = { billingProfileUpdate: 0, invoiceCreate: 0, lastInvoiceData: null };

  return {
    _calls: calls,
    _billingProfileRow: () => billingProfileRow,
    user: {
      findUnique: async ({ where }) => usersById.get(where.id) || null,
    },
    billingProfile: {
      findUnique: async ({ where }) => (billingProfileRow && where.ownerId === billingProfileRow.ownerId ? billingProfileRow : null),
    },
    invoice: {
      findUnique: async ({ where }) => (where.creditPurchaseId != null && existingInvoice && existingInvoice.creditPurchaseId === where.creditPurchaseId ? existingInvoice : null),
    },
    $transaction: async (fn) => {
      const tx = {
        billingProfile: {
          update: async ({ data }) => {
            calls.billingProfileUpdate++;
            billingProfileRow.invoiceNextNumber += data.invoiceNextNumber.increment;
            return { ...billingProfileRow };
          },
        },
        invoice: {
          create: async ({ data }) => {
            calls.invoiceCreate++;
            calls.lastInvoiceData = data;
            return { id: 999, ...data };
          },
        },
      };
      return fn(tx);
    },
  };
}

// own_stripe is the only mode that gets taxed, and therefore the only one that
// can produce an invoice at all - resolveTaxConfig gates every other mode to
// NO_TAX because the Whop settlement path never issues one (see utils/taxes.js).
const PARTNER = { id: 9, role: 'AGENCY', agencyId: null, whitelabelId: null, billingMode: 'own_stripe' };
const CLIENT_UNDER_PARTNER = { ...CLIENT, role: 'CLIENT', agencyId: 9, whitelabelId: null, billingMode: 'platform' };

test('issueInvoiceForPurchase takes the correlative, bumps the profile, and creates the invoice', async () => {
  const profile = { ...PROFILE, ownerId: 9, invoicePrefix: 'FAC-', invoicePadding: 6, invoiceNextNumber: 124, taxEnabled: true, taxRate: 27 };
  const prisma = makeFakePrisma({ client: CLIENT_UNDER_PARTNER, partner: PARTNER, profile });

  const invoice = await issueInvoiceForPurchase(prisma, PURCHASE);

  assert.ok(invoice);
  assert.strictEqual(invoice.number, 'FAC-000124');
  assert.strictEqual(prisma._calls.billingProfileUpdate, 1);
  assert.strictEqual(prisma._calls.invoiceCreate, 1);
  assert.strictEqual(prisma._billingProfileRow().invoiceNextNumber, 125);
});

// End to end through the real resolveTaxConfig: the issuer shows the tax but
// does not charge it, so the invoice it writes totals more than the payment.
test('issueInvoiceForPurchase writes a 127 invoice for a 100 payment when the tax is only shown', async () => {
  const profile = {
    ...PROFILE, ownerId: 9, invoicePrefix: 'FAC-', invoicePadding: 6, invoiceNextNumber: 7,
    taxEnabled: true, chargeTaxToClient: false, taxRate: 27,
  };
  const prisma = makeFakePrisma({ client: CLIENT_UNDER_PARTNER, partner: PARTNER, profile });

  const invoice = await issueInvoiceForPurchase(prisma, PURCHASE_TAX_NOT_CHARGED);

  assert.ok(invoice);
  assert.strictEqual(invoice.number, 'FAC-000007');
  assert.strictEqual(invoice.subtotal, 100);
  assert.strictEqual(invoice.taxAmount, 27);
  assert.strictEqual(invoice.total, 127);
  assert.strictEqual(invoice.amountPaid, 100);
});

// The same issuer with chargeTaxToClient on - the old behaviour, which must
// still produce an invoice whose total is exactly what the card paid.
test('issueInvoiceForPurchase matches the card when the tax was charged on top', async () => {
  const profile = {
    ...PROFILE, ownerId: 9, invoicePrefix: 'FAC-', invoicePadding: 6, invoiceNextNumber: 7,
    taxEnabled: true, chargeTaxToClient: true, taxRate: 27,
  };
  const prisma = makeFakePrisma({ client: CLIENT_UNDER_PARTNER, partner: PARTNER, profile });

  const invoice = await issueInvoiceForPurchase(prisma, PURCHASE);

  assert.strictEqual(invoice.subtotal, 100);
  assert.strictEqual(invoice.taxAmount, 27);
  assert.strictEqual(invoice.total, 127);
  assert.strictEqual(invoice.amountPaid, 127);
  assert.strictEqual(invoice.amountPaid, invoice.total);
});

test('issueInvoiceForPurchase returns the existing invoice without taking a new number', async () => {
  const profile = { ...PROFILE, ownerId: 9, invoicePrefix: 'FAC-', invoicePadding: 6, invoiceNextNumber: 124, taxEnabled: true, taxRate: 27 };
  const existingInvoice = { id: 1, number: 'FAC-000050', creditPurchaseId: PURCHASE.id };
  const prisma = makeFakePrisma({ client: CLIENT_UNDER_PARTNER, partner: PARTNER, profile, existingInvoice });

  const invoice = await issueInvoiceForPurchase(prisma, PURCHASE);

  assert.strictEqual(invoice, existingInvoice);
  assert.strictEqual(prisma._calls.billingProfileUpdate, 0);
  assert.strictEqual(prisma._calls.invoiceCreate, 0);
  assert.strictEqual(prisma._billingProfileRow().invoiceNextNumber, 124);
});

test('issueInvoiceForPurchase returns null when the governing profile has taxEnabled false', async () => {
  const profile = { ...PROFILE, ownerId: 9, invoicePrefix: 'FAC-', invoicePadding: 6, invoiceNextNumber: 124, taxEnabled: false, taxRate: 27 };
  const prisma = makeFakePrisma({ client: CLIENT_UNDER_PARTNER, partner: PARTNER, profile });

  const invoice = await issueInvoiceForPurchase(prisma, PURCHASE);

  assert.strictEqual(invoice, null);
  assert.strictEqual(prisma._calls.billingProfileUpdate, 0);
  assert.strictEqual(prisma._calls.invoiceCreate, 0);
});

test('issueInvoiceForPurchase returns null when there is no profile at all', async () => {
  // No partner above this client at all, so resolveTaxConfig short-circuits
  // to NO_TAX before ever looking at billingProfile.
  const standaloneClient = { ...CLIENT, role: 'CLIENT', agencyId: null, whitelabelId: null, billingMode: 'platform' };
  const prisma = makeFakePrisma({ client: standaloneClient, partner: null, profile: null });

  const invoice = await issueInvoiceForPurchase(prisma, { ...PURCHASE, userId: standaloneClient.id });

  assert.strictEqual(invoice, null);
  assert.strictEqual(prisma._calls.billingProfileUpdate, 0);
  assert.strictEqual(prisma._calls.invoiceCreate, 0);
});
