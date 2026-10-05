const test = require('node:test');
const assert = require('node:assert');
const {
  issueInvoiceForPurchase,
  buildInvoiceData,
  formatNumber,
  conceptFor,
} = require('../src/services/invoiceService');

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

const PURCHASE = {
  id: 77,
  userId: 42,
  credits: 100,
  taxRate: 27,
  taxAmount: 27,
  amount: 127,
  kind: 'manual',
};

test('buildInvoiceData produces the right subtotal/tax/total breakdown', () => {
  const issuedAt = new Date('2026-04-01T12:00:00.000Z');
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000001', issuedAt });

  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxAmount, 27);
  assert.strictEqual(data.retention, 0);
  assert.strictEqual(data.total, 127);
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

test('buildInvoiceData totals correctly for an untaxed purchase (taxAmount 0)', () => {
  const untaxed = { id: 88, userId: 42, credits: 50, taxRate: 0, taxAmount: 0, amount: 50, kind: 'manual' };
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: untaxed, number: 'FAC-000003' });
  assert.strictEqual(data.subtotal, 50);
  assert.strictEqual(data.taxAmount, 0);
  assert.strictEqual(data.total, 50);
  assert.strictEqual(data.totalInWords, 'CINCUENTA DÓLARES CON 00/100');
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
