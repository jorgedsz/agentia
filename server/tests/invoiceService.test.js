const test = require('node:test');
const assert = require('node:assert');
const {
  issueInvoiceForPurchase,
  buildInvoiceData,
  buildRegeneratedInvoiceData,
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

// ---------------------------------------------------------------------------
// buildRegeneratedInvoiceData — rebuilding a document that already exists
//
// The document keeps its number and its date; everything else is taken again
// from the configuration as it stands now. The two things these tests exist to
// pin down are that the identity is never touched, and that the money comes out
// of buildInvoiceData and not out of a second arithmetic that could disagree
// with the one issuance uses.
// ---------------------------------------------------------------------------

// The row as it was issued in March, under an issuer whose RNC was wrong.
const ISSUED = {
  id: 9,
  number: 'FAC-000124',
  profileId: 5,
  userId: 42,
  creditPurchaseId: 77,
  currency: 'USD',
  subtotal: 100,
  taxLabel: 'ITBIS',
  taxRate: 27,
  taxAmount: 27,
  retention: 0,
  total: 127,
  amountPaid: 127,
  totalInWords: 'CIENTO VEINTISIETE DÓLARES CON 00/100',
  conceptLines: JSON.stringify([{ description: 'Recarga de saldo — créditos de consumo', total: 100 }]),
  issuerSnapshot: JSON.stringify({ issuerName: 'LM Consulting Group SRL', issuerRnc: 'EL RNC EQUIVOCADO' }),
  clientSnapshot: JSON.stringify({ company: 'Cliente Prueba Fiscal SRL' }),
  issuedAt: new Date('2026-03-15T12:00:00.000Z'),
  dueAt: new Date('2026-03-15T12:00:00.000Z'),
  regeneratedAt: null,
};

test('buildRegeneratedInvoiceData never returns the fields that identify the document', () => {
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: PROFILE, client: CLIENT, purchase: PURCHASE });
  // It is the same document: its number, its parties, its payment and above all
  // its DATE are the caller's. Recomputing issuedAt would misdate the sequence.
  for (const key of ['number', 'profileId', 'userId', 'creditPurchaseId', 'issuedAt']) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(data, key), false, `must not write ${key}`);
  }
});

test('buildRegeneratedInvoiceData refreshes the issuer snapshot from the profile as it is now', () => {
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: PROFILE, client: CLIENT, purchase: PURCHASE });
  const issuer = JSON.parse(data.issuerSnapshot);
  assert.strictEqual(issuer.issuerRnc, '1-01-00000-1');
  assert.strictEqual(issuer.logoUrl, 'https://example.com/logo.png');
  assert.strictEqual(issuer.bankAccount, '1234567890');
  // And the client half, from the account as it is now.
  assert.strictEqual(JSON.parse(data.clientSnapshot).rnc, '1-02-00000-2');
});

test('buildRegeneratedInvoiceData recomputes the money off the CURRENT profile, not the frozen row', () => {
  // The issuer's rate was corrected from 27% to 18% after this was issued.
  const corrected = { ...PROFILE, taxRate: 18, taxLabel: 'IVA' };
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: corrected, client: CLIENT, purchase: PURCHASE });
  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxLabel, 'IVA');
  assert.strictEqual(data.taxRate, 18);
  assert.strictEqual(data.taxAmount, 18);
  assert.strictEqual(data.total, 118);
  assert.strictEqual(data.retention, 0);
  assert.strictEqual(data.amountPaid, 127); // what the card really paid, unchanged
  assert.match(data.totalInWords, /^CIENTO DIECIOCHO/);
});

// The whole reason regeneration delegates to buildInvoiceData: one arithmetic,
// so a rebuilt document and a freshly issued one cannot disagree about the same
// payment.
test('buildRegeneratedInvoiceData agrees with buildInvoiceData field by field', () => {
  const fresh = buildInvoiceData({
    profile: PROFILE,
    client: CLIENT,
    purchase: PURCHASE,
    number: ISSUED.number,
    issuedAt: ISSUED.issuedAt,
  });
  const again = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: PROFILE, client: CLIENT, purchase: PURCHASE });
  for (const key of ['subtotal', 'taxLabel', 'taxRate', 'taxAmount', 'retention', 'total',
    'amountPaid', 'totalInWords', 'conceptLines', 'issuerSnapshot', 'clientSnapshot']) {
    assert.deepStrictEqual(again[key], fresh[key], `${key} must match what issuance would write`);
  }
  assert.strictEqual(again.dueAt.getTime(), fresh.dueAt.getTime());
});

test('buildRegeneratedInvoiceData recomputes dueAt from the UNCHANGED issuedAt and the current dueDays', () => {
  const fifteen = { ...PROFILE, dueDays: 15 };
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: fifteen, client: CLIENT, purchase: PURCHASE });
  // 15 March + 15 days, and not 15 days from today.
  assert.strictEqual(data.dueAt.toISOString(), '2026-03-30T12:00:00.000Z');
});

test('buildRegeneratedInvoiceData stamps regeneratedAt, which is what tells two copies of one number apart', () => {
  const at = new Date('2026-10-07T10:00:00.000Z');
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: PROFILE, client: CLIENT, purchase: PURCHASE, regeneratedAt: at });
  assert.strictEqual(data.regeneratedAt, at);
  // And by default it is simply now, never left unset.
  assert.ok(buildRegeneratedInvoiceData({ invoice: ISSUED, profile: PROFILE, client: CLIENT, purchase: PURCHASE }).regeneratedAt instanceof Date);
});

test('buildRegeneratedInvoiceData describes the payment with the same concept helper', () => {
  const data = buildRegeneratedInvoiceData({
    invoice: ISSUED,
    profile: PROFILE,
    client: CLIENT,
    purchase: { ...PURCHASE, kind: 'auto_recharge' },
  });
  assert.deepStrictEqual(JSON.parse(data.conceptLines), [{ description: 'Recarga automática de saldo', total: 100 }]);
});

// THE MISSING-PAYMENT CASE. creditPurchaseId is SetNull, so an invoice outlives
// the payment and the account that made it. There is then nothing to recompute
// the amounts FROM, and the figures on the row are the only surviving record of
// them: a document that suddenly totalled 0.00 because its payment was deleted
// would be a destroyed fiscal record, not a corrected one.
test('with no purchase, buildRegeneratedInvoiceData touches no money field at all', () => {
  const orphan = { ...ISSUED, creditPurchaseId: null };
  const data = buildRegeneratedInvoiceData({ invoice: orphan, profile: PROFILE, client: CLIENT, purchase: null });

  for (const key of ['subtotal', 'taxLabel', 'taxRate', 'taxAmount', 'retention',
    'total', 'amountPaid', 'totalInWords', 'conceptLines']) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(data, key), false, `must not rewrite ${key}`);
  }
  // Not a zero, not a null: the column is simply not in the update.
  assert.strictEqual(data.total, undefined);
  assert.strictEqual(data.amountPaid, undefined);
});

test('with no purchase, the two party snapshots are still refreshed — that is the point of the action', () => {
  const orphan = { ...ISSUED, creditPurchaseId: null };
  const data = buildRegeneratedInvoiceData({ invoice: orphan, profile: PROFILE, client: CLIENT, purchase: null });
  assert.strictEqual(JSON.parse(data.issuerSnapshot).issuerRnc, '1-01-00000-1');
  assert.strictEqual(JSON.parse(data.clientSnapshot).company, 'Cliente Prueba Fiscal SRL');
  assert.ok(data.regeneratedAt instanceof Date);
  // dueAt needs only the unchanged issuedAt and the profile's current dueDays,
  // so it is recomputed here too: it asks nothing of the purchase.
  assert.strictEqual(data.dueAt.toISOString(), ISSUED.issuedAt.toISOString());
});

test('with no client left either, the client snapshot is the last record of who it was for and is kept', () => {
  const orphan = { ...ISSUED, userId: null, creditPurchaseId: null };
  const data = buildRegeneratedInvoiceData({ invoice: orphan, profile: PROFILE, client: null, purchase: null });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, 'clientSnapshot'), false);
  // The issuer half still is refreshable, and is.
  assert.strictEqual(JSON.parse(data.issuerSnapshot).issuerRnc, '1-01-00000-1');
});

// A deleted ACCOUNT takes its payments with it, so a surviving purchase with no
// client is not a shape the database produces — but if it ever reached here,
// rebuilding the money off a client that no longer exists would write an empty
// client block onto the document. Snapshots-only is the safe answer.
test('a purchase with no client falls back to snapshots only rather than emptying the client block', () => {
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: PROFILE, client: null, purchase: PURCHASE });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, 'total'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(data, 'clientSnapshot'), false);
});

test('buildRegeneratedInvoiceData zeroes the tax when the issuer has switched it off since', () => {
  const noTax = { ...PROFILE, taxEnabled: false };
  const data = buildRegeneratedInvoiceData({ invoice: ISSUED, profile: noTax, client: CLIENT, purchase: PURCHASE });
  assert.strictEqual(data.taxRate, 0);
  assert.strictEqual(data.taxAmount, 0);
  assert.strictEqual(data.total, 100);
});

// ---------------------------------------------------------------------------
// The RETENCIÓN, which is SUBTRACTED
//
// The document the owner's accountant actually works with reads
//
//   TOTAL NETO      USD 2,191.82
//   RETENCIÓN       USD   591.79
//   TOTAL A PAGAR   USD 1,600.00
//
// with no tax row at all: the 27% is withheld off the net, not charged on top
// of it. These tests pin the direction of that arithmetic, because getting the
// sign wrong is the one mistake that produces a plausible-looking document
// (127 instead of 73) that nobody notices until an accountant does.
// ---------------------------------------------------------------------------

// The owner's configuration: the retention on, the tax off. taxEnabled stays
// TRUE because that is the flag that lets invoices be issued at all (see
// issueInvoiceForPurchase); it is the RATE that is 0, so no tax row prints.
const RETAINED = { ...PROFILE, taxEnabled: true, taxRate: 0, retentionRate: 27 };

const retainedData = (credits, profile = RETAINED) => buildInvoiceData({
  profile,
  client: CLIENT,
  purchase: { ...PURCHASE, credits, taxAmount: 0, amount: credits },
  number: 'FAC-000100',
});

test('the retención is subtracted: the real document, 2191.82 retained at 27%', () => {
  const data = retainedData(2191.82);
  assert.strictEqual(data.subtotal, 2191.82);
  assert.strictEqual(data.taxAmount, 0);
  // 2191.82 * 27% is 591.7914 -> 591.79, the figure printed on his invoice.
  assert.strictEqual(data.retention, 591.79);
  assert.strictEqual(data.total, 1600.03);
  assert.strictEqual(data.totalInWords, 'MIL SEISCIENTOS DÓLARES CON 03/100');
});

test('the retención is subtracted: a client pays 100, the document asks 73', () => {
  const data = retainedData(100);
  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxAmount, 0);
  assert.strictEqual(data.retention, 27);
  // 73, NOT 127. This is the assertion the whole change exists for.
  assert.strictEqual(data.total, 73);
  assert.strictEqual(data.totalInWords, 'SETENTA Y TRES DÓLARES CON 00/100');
  // The money that really came in is now ABOVE what the document asks for -
  // the opposite of the tax-shown-not-charged case - because the retention is
  // withheld rather than owed. Nothing is outstanding, so the renderer's
  // shortfall band must stay quiet (see InvoiceDocument.jsx).
  assert.strictEqual(data.amountPaid, 100);
  assert.ok(data.amountPaid > data.total);
});

test('a retención rate of 0 leaves the total exactly where it was', () => {
  const data = retainedData(100, { ...PROFILE, retentionRate: 0 });
  assert.strictEqual(data.retention, 0);
  // PROFILE still carries the 27% tax, so this is the untouched 127.
  assert.strictEqual(data.taxAmount, 27);
  assert.strictEqual(data.total, 127);
});

test('a profile with no retentionRate column value at all behaves as 0', () => {
  const data = buildInvoiceData({ profile: PROFILE, client: CLIENT, purchase: PURCHASE, number: 'FAC-000101' });
  assert.strictEqual(data.retention, 0);
  assert.strictEqual(data.total, 127);
});

test('both at once: the tax adds and the retención subtracts, off the same net', () => {
  const both = { ...PROFILE, taxEnabled: true, taxRate: 18, retentionRate: 10 };
  const data = retainedData(100, both);
  assert.strictEqual(data.subtotal, 100);
  assert.strictEqual(data.taxAmount, 18);
  assert.strictEqual(data.retention, 10);
  // 100 + 18 - 10. Neither rate is applied to the other's result.
  assert.strictEqual(data.total, 108);
});

test('the retención is rounded to the cent, half up, like the tax', () => {
  // 12.50 * 27% is exactly 3.375 -> 3.38, and 15.50 * 27% is 4.185 -> 4.19:
  // the same two values the tax rounding test pins, in the other direction.
  assert.strictEqual(retainedData(12.5).retention, 3.38);
  assert.strictEqual(retainedData(12.5).total, 9.12);
  assert.strictEqual(retainedData(15.5).retention, 4.19);
  assert.strictEqual(retainedData(15.5).total, 11.31);
});

// total = subtotal + taxAmount - retention, to the cent, at every amount and
// with both rates live - not just at the round figures above.
test('total is subtotal + tax - retención to the cent across a sweep', () => {
  const both = { ...PROFILE, taxEnabled: true, taxRate: 27, retentionRate: 27 };
  let checked = 0;
  for (let cents = 1; cents <= 50000; cents++) {
    const credits = cents / 100;
    for (const profile of [RETAINED, both]) {
      const data = retainedData(credits, profile);
      assert.strictEqual(
        data.total,
        round2(data.subtotal + data.taxAmount - data.retention),
        `total differs at ${credits}`,
      );
      // And never negative: the controller caps either rate at 100, so the
      // most a retention can do is take the net down to the tax.
      assert.ok(data.total >= 0, `negative total at ${credits}`);
      checked++;
    }
  }
  assert.strictEqual(checked, 100000);
});

test('a 100% retención takes the total down to the tax and no further', () => {
  const all = { ...PROFILE, taxEnabled: true, taxRate: 0, retentionRate: 100 };
  const data = retainedData(100, all);
  assert.strictEqual(data.retention, 100);
  assert.strictEqual(data.total, 0);
  assert.strictEqual(data.totalInWords, 'CERO DÓLARES CON 00/100');
});

// Regeneration must pick the retention up from the profile as it stands NOW -
// it delegates to buildInvoiceData, and these pin that it keeps doing so.
test('buildRegeneratedInvoiceData recomputes the retención off the CURRENT rate', () => {
  const data = buildRegeneratedInvoiceData({
    invoice: ISSUED, profile: RETAINED, client: CLIENT, purchase: PURCHASE,
  });
  // The row was issued at 0 retention and totalled 127; today's configuration
  // retains 27% and charges no tax.
  assert.strictEqual(data.retention, 27);
  assert.strictEqual(data.taxAmount, 0);
  assert.strictEqual(data.total, 73);
  assert.strictEqual(data.totalInWords, 'SETENTA Y TRES DÓLARES CON 00/100');
});

test('buildRegeneratedInvoiceData drops the retención back to 0 when the issuer clears the rate', () => {
  const data = buildRegeneratedInvoiceData({
    invoice: { ...ISSUED, retention: 27, total: 73 },
    profile: { ...PROFILE, retentionRate: 0 },
    client: CLIENT,
    purchase: PURCHASE,
  });
  assert.strictEqual(data.retention, 0);
  assert.strictEqual(data.total, 127);
});
