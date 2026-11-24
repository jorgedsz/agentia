const test = require('node:test');
const assert = require('node:assert');
const { performOffSessionCharge } = require('../src/controllers/creditsController');

const USER = { id: 6, role: 'CLIENT', agencyId: null, whitelabelId: null, billingMode: 'platform', azulTarjetaId: 'tj1', email: 'd@rpm.do' };

function prismaPlatform() {
  const compras = [];
  return {
    compras,
    user: { findUnique: async () => ({ ...USER }), findFirst: async () => null },
    creditPurchase: {
      create: async ({ data }) => { const r = { id: compras.length + 1, ...data }; compras.push(r); return r; },
      update: async ({ where, data }) => Object.assign(compras.find((c) => c.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const c = compras.find((x) => x.id === where.id && (!where.status || x.status === where.status));
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      },
      findUnique: async ({ where }) => compras.find((c) => c.id === where.id),
      findFirst: async () => null,
    },
    billingProfile: { findFirst: async () => null },
  };
}

function azulQue(respuesta) {
  const azul = { habilitado: true, pedidos: [], cobrarTarjeta: async (a) => { azul.pedidos.push(a); return typeof respuesta === 'function' ? respuesta(a) : respuesta; } };
  return azul;
}

test('an approved AZUL charge settles at once and reads as succeeded', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue({ id: 'o1', estado: 'aprobada' });
  let settled = 0;
  const r = await performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => { settled += 1; return true; } });
  assert.deepStrictEqual(r, { id: 'o1', status: 'succeeded' });
  assert.strictEqual(settled, 1);
  const [pedido] = azul.pedidos;
  assert.strictEqual(pedido.tarjetaId, 'tj1');
  assert.strictEqual(pedido.monto, 10);
  assert.strictEqual(pedido.idempotencia, `nebo-cp-${prisma.compras[0].id}`);
  assert.strictEqual(prisma.compras[0].azulOrdenId, 'o1');
  assert.strictEqual(prisma.compras[0].kind, 'auto_recharge');
});

test('the card passed in (a backup) is the one charged', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue({ id: 'o9', estado: 'aprobada' });
  await performOffSessionCharge(prisma, USER, 10, 'auto_recharge', { paymentMethodId: 'tj-backup', slot: 'backup' }, {}, { azul, settle: async () => true });
  assert.strictEqual(azul.pedidos[0].tarjetaId, 'tj-backup');
});

test('a declined AZUL charge fails the purchase and throws the reason', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue({ id: 'o2', estado: 'declinada', error: 'DENEGADA' });
  await assert.rejects(
    performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => true }),
    (e) => e.message === 'DENEGADA' && e.declineReason === 'DENEGADA',
  );
  assert.strictEqual(prisma.compras[0].status, 'failed');
});

test('an unconfirmed AZUL charge stays pending for reconciliation', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue({ id: 'o3', estado: 'por-verificar', error: 'x' });
  const r = await performOffSessionCharge(prisma, USER, 10, 'auto_recharge', null, {}, { azul, settle: async () => true });
  assert.strictEqual(r.status, 'processing');
  assert.strictEqual(prisma.compras[0].status, 'pending');
  assert.strictEqual(prisma.compras[0].azulOrdenId, 'o3');
});

test('pagos-azul refusing the charge fails the purchase and rethrows', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue(() => { throw Object.assign(new Error('tarjeta no encontrada'), { status: 404 }); });
  await assert.rejects(performOffSessionCharge(prisma, USER, 10, 'manual_card', null, {}, { azul, settle: async () => true }), /tarjeta no encontrada/);
  assert.strictEqual(prisma.compras[0].status, 'failed');
});

test('no saved AZUL card is NO_CARD and nothing is recorded', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue({ id: 'x', estado: 'aprobada' });
  await assert.rejects(
    performOffSessionCharge(prisma, { ...USER, azulTarjetaId: null }, 10, 'auto_recharge', null, {}, { azul, settle: async () => true }),
    (e) => e.code === 'NO_CARD',
  );
  assert.strictEqual(prisma.compras.length, 0);
  assert.strictEqual(azul.pedidos.length, 0);
});

test('a period charge carries the period on its purchase', async () => {
  const prisma = prismaPlatform();
  const azul = azulQue({ id: 'o4', estado: 'aprobada' });
  const periodStart = new Date('2026-11-01T00:00:00Z');
  await performOffSessionCharge(prisma, USER, 30, 'manual_card', null, { billingPeriodId: 12, periodStart }, { azul, settle: async () => true });
  assert.strictEqual(prisma.compras[0].billingPeriodId, 12);
  assert.strictEqual(prisma.compras[0].periodStart, periodStart);
});

test('a recurring AZUL charge uses one idempotency key per cycle and card', async () => {
  const { chargeSavedCard } = require('../src/controllers/recurringPaymentController');
  const pedidos = [];
  const azul = { habilitado: true, cobrarTarjeta: async (a) => { pedidos.push(a); return a.tarjetaId === 'tj1' ? { id: 'r0', estado: 'declinada', error: 'DENEGADA' } : { id: 'r1', estado: 'aprobada' }; } };
  const prisma = {
    user: { findUnique: async () => ({ id: 6, azulTarjetaId: 'tj1', azulTarjetaIdBackup: 'tj2' }) },
    recurringPayment: { update: async () => ({}) },
  };
  const entry = { id: 2, userId: 6, amount: 40, provider: 'azul_card', description: 'Plan', nextPaymentDate: new Date('2026-12-01T00:00:00Z') };
  const r = await chargeSavedCard(prisma, entry, { azul });
  assert.deepStrictEqual(r, { charged: true, paymentIntentId: 'r1' });
  const hoy = new Date().toISOString().slice(0, 10);
  assert.deepStrictEqual(pedidos.map((p) => p.idempotencia), [`nebo-rp-2-2026-12-01-tj1-${hoy}`, `nebo-rp-2-2026-12-01-tj2-${hoy}`]);
  assert.strictEqual(pedidos[0].monto, 40);
});

test('an unconfirmed recurring AZUL charge does not try the backup card', async () => {
  const { chargeSavedCard } = require('../src/controllers/recurringPaymentController');
  const pedidos = [];
  const azul = { habilitado: true, cobrarTarjeta: async (a) => { pedidos.push(a); return { id: 'r2', estado: 'por-verificar' }; } };
  const prisma = {
    user: { findUnique: async () => ({ id: 6, azulTarjetaId: 'tj1', azulTarjetaIdBackup: 'tj2' }) },
    recurringPayment: { update: async () => ({}) },
  };
  const r = await chargeSavedCard(prisma, { id: 3, userId: 6, amount: 40, provider: 'azul_card', nextPaymentDate: new Date('2026-12-01T00:00:00Z') }, { azul });
  assert.strictEqual(r.charged, false);
  assert.strictEqual(pedidos.length, 1);
  assert.match(r.declineReason, /no confirmó/);
});
