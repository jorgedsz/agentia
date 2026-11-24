// AZUL outcomes that are not definitive: none of them may charge twice or lose a credit.
const test = require('node:test');
const assert = require('node:assert');
const { performOffSessionCharge } = require('../src/controllers/creditsController');
const { confirmAzulOrder, applyAzulOrder } = require('../src/services/creditCheckout');
const { crearHandler } = require('../src/controllers/azulController');

const USER = { id: 6, role: 'CLIENT', agencyId: null, whitelabelId: null, billingMode: 'platform', azulTarjetaId: 'tj1', email: 'd@rpm.do' };

function prismaFake(compras = []) {
  return {
    compras,
    user: { findUnique: async () => ({ ...USER }), findFirst: async () => null, updateMany: async () => ({ count: 0 }) },
    creditPurchase: {
      create: async ({ data }) => { const r = { id: compras.length + 1, ...data }; compras.push(r); return r; },
      update: async ({ where, data }) => Object.assign(compras.find((c) => c.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const c = compras.find((x) => x.id === where.id && (!where.status || x.status === where.status)
          && (!where.processor || x.processor === where.processor));
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      },
      findUnique: async ({ where }) => compras.find((c) => c.id === where.id),
      findFirst: async ({ where }) => compras.find((c) => (where.azulOrdenId ? c.azulOrdenId === where.azulOrdenId : c.id === where.id && c.processor === where.processor)) || null,
    },
    billingProfile: { findFirst: async () => null },
  };
}

test('a lost answer (timeout) keeps the purchase pending and does not throw, so no backup card is tried', async () => {
  const prisma = prismaFake();
  const azul = { habilitado: true, cobrarTarjeta: async () => { throw new Error('The operation was aborted due to timeout'); } };
  const r = await performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => true });
  assert.strictEqual(r.status, 'processing');
  assert.strictEqual(prisma.compras[0].status, 'pending');
  assert.strictEqual(prisma.compras[0].processor, 'azul');
});

test('a 5xx without an order is unknown too; 501 (AZUL not set up in pagos-azul) is a plain failure', async () => {
  let prisma = prismaFake();
  let azul = { habilitado: true, cobrarTarjeta: async () => { throw Object.assign(new Error('Bad gateway'), { status: 504 }); } };
  assert.strictEqual((await performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => true })).status, 'processing');
  prisma = prismaFake();
  azul = { habilitado: true, cobrarTarjeta: async () => { throw Object.assign(new Error('no configurada'), { status: 501 }); } };
  await assert.rejects(performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => true }));
  assert.strictEqual(prisma.compras[0].status, 'failed');
});

test('an order still processing in pagos-azul is not read as a decline', async () => {
  const prisma = prismaFake();
  const azul = { habilitado: true, cobrarTarjeta: async () => ({ id: 'o5', estado: 'procesando' }) };
  const r = await performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => true });
  assert.strictEqual(r.status, 'processing');
  assert.strictEqual(prisma.compras[0].status, 'pending');
});

test('reconciling a saved-card charge repeats the same idempotency key and settles it', async () => {
  const prisma = prismaFake([{ id: 9, userId: 6, status: 'pending', processor: 'azul', kind: 'auto_recharge', paymentMethodId: 'tj1', amount: 10, azulOrdenId: null }]);
  const pedidos = [];
  let settled = 0;
  const azul = { cobrarTarjeta: async (a) => { pedidos.push(a); return { id: 'o9', estado: 'aprobada', referencia: 'NEBO-9' }; } };
  const r = await confirmAzulOrder(prisma, prisma.compras[0], { azul, settle: async () => { settled += 1; return true; } });
  assert.deepStrictEqual(r, { paid: true, credited: true });
  assert.deepStrictEqual(pedidos[0], { tarjetaId: 'tj1', monto: 10, referencia: 'NEBO-9', idempotencia: 'nebo-cp-9' });
  assert.strictEqual(settled, 1);
  assert.strictEqual(prisma.compras[0].azulOrdenId, 'o9');
});

test('an approval for a purchase already marked failed revives and credits it', async () => {
  const prisma = prismaFake([{ id: 3, userId: 6, status: 'failed', processor: 'azul', kind: 'manual', azulOrdenId: 'h1', errorMessage: 'cancelada' }]);
  let settledWith = null;
  const r = await applyAzulOrder(prisma, prisma.compras[0], { id: 'h1', estado: 'aprobada', referencia: 'NEBO-3' }, { settle: async (_p, row) => { settledWith = row.status; return true; } });
  assert.deepStrictEqual(r, { paid: true, credited: true });
  assert.strictEqual(settledWith, 'pending');
});

test('an order whose reference is another purchase is ignored', async () => {
  const prisma = prismaFake([{ id: 3, userId: 6, status: 'pending', processor: 'azul', kind: 'manual', azulOrdenId: 'h1' }]);
  let settled = 0;
  const r = await applyAzulOrder(prisma, prisma.compras[0], { id: 'h1', estado: 'aprobada', referencia: 'NEBO-4' }, { settle: async () => { settled += 1; return true; } });
  assert.deepStrictEqual(r, { paid: false, credited: false });
  assert.strictEqual(settled, 0);
});

test('the webhook finds a charge by its NEBO reference when the order id never came back', async () => {
  const crypto = require('node:crypto');
  const prisma = prismaFake([{ id: 9, userId: 6, status: 'pending', processor: 'azul', kind: 'auto_recharge', azulOrdenId: null }]);
  const vistos = [];
  const handler = crearHandler({ secreto: 'sec', confirmar: async (_p, purchase) => { vistos.push(purchase.id); } });
  const cuerpo = Buffer.from(JSON.stringify({ evento: 'pago.aprobado', orden: { id: 'o9', estado: 'aprobada', referencia: 'NEBO-9' } }));
  const firma = crypto.createHmac('sha256', 'sec').update(cuerpo).digest('hex');
  const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; } };
  await handler({ prisma, body: cuerpo, headers: { 'x-pagos-firma': firma } }, res);
  assert.strictEqual(res.code, 200);
  assert.deepStrictEqual(vistos, [9]);
});

test('an unconfirmed recurring AZUL charge pauses the entry', async () => {
  const { chargeSavedCard } = require('../src/controllers/recurringPaymentController');
  const updates = [];
  const azul = { habilitado: true, cobrarTarjeta: async () => { throw new Error('socket hang up'); } };
  const prisma = {
    user: { findUnique: async () => ({ id: 6, azulTarjetaId: 'tj1', azulTarjetaIdBackup: 'tj2' }) },
    recurringPayment: { update: async (a) => { updates.push(a.data); return {}; } },
  };
  const r = await chargeSavedCard(prisma, { id: 5, userId: 6, amount: 40, currency: 'USD', provider: 'azul_card', nextPaymentDate: new Date('2026-12-01T00:00:00Z') }, { azul });
  assert.strictEqual(r.reason, 'unconfirmed');
  assert.ok(updates.some((d) => d.status === 'paused'));
});

test('a recurring entry in another currency is never sent to AZUL', async () => {
  const { chargeSavedCard } = require('../src/controllers/recurringPaymentController');
  let llamado = false;
  const azul = { habilitado: true, cobrarTarjeta: async () => { llamado = true; } };
  const prisma = { user: { findUnique: async () => ({ id: 6, azulTarjetaId: 'tj1' }) }, recurringPayment: { update: async () => ({}) } };
  const r = await chargeSavedCard(prisma, { id: 7, userId: 6, amount: 4000, currency: 'DOP', provider: 'azul_card', nextPaymentDate: new Date() }, { azul });
  assert.strictEqual(r.reason, 'currency');
  assert.strictEqual(llamado, false);
});
