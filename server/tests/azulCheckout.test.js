const test = require('node:test');
const assert = require('node:assert');
const checkout = require('../src/services/creditCheckout');

// A platform client (no partner above it) pays on AZUL's payment page.
function prismaFor(user) {
  const compras = [];
  const usuarios = { [user.id]: { ...user } };
  return {
    compras,
    usuarios,
    user: {
      findUnique: async ({ where }) => usuarios[where.id] || null,
      findFirst: async () => null,
      updateMany: async ({ where, data }) => {
        const u = usuarios[where.id];
        if (!u || (where.azulTarjetaId === null && u.azulTarjetaId)) return { count: 0 };
        Object.assign(u, data);
        return { count: 1 };
      },
    },
    creditPurchase: {
      findFirst: async () => null,
      findMany: async () => [],
      create: async ({ data }) => { const row = { id: compras.length + 1, ...data }; compras.push(row); return row; },
      update: async ({ where, data }) => Object.assign(compras.find((c) => c.id === where.id), data),
      updateMany: async ({ where, data }) => {
        const c = compras.find((x) => x.id === where.id && (!where.status || x.status === where.status));
        if (!c) return { count: 0 };
        Object.assign(c, data);
        return { count: 1 };
      },
    },
    billingProfile: { findFirst: async () => null },
  };
}

const RPM = { id: 6, role: 'CLIENT', agencyId: null, whitelabelId: null, billingMode: 'platform', email: 'd@rpm.do', name: 'RPM', vapiCredits: 1 };
const URLS = { successUrl: 'https://app.swordaisolutions.com/dashboard?checkout=success', cancelUrl: 'https://app.swordaisolutions.com/dashboard?checkout=cancelled' };

function azulFalso(respuesta = {}) {
  const azul = {
    habilitado: true,
    pedidos: [],
    crearOrden: async (args) => {
      azul.pedidos.push(args);
      return { id: 'ab12cd34ef56ab78', urlPago: 'https://www.neboaiconsulting.com/api/pagos/ir/ab12cd34ef56ab78', ...respuesta };
    },
  };
  return azul;
}

test('a platform account buys credits on AZUL and keeps the card', async () => {
  const prisma = prismaFor(RPM);
  const azul = azulFalso();
  const r = await checkout.createCreditCheckout(prisma, 6, 25, { ...URLS, azul });
  assert.strictEqual(r.provider, 'azul');
  assert.strictEqual(r.checkoutUrl, 'https://www.neboaiconsulting.com/api/pagos/ir/ab12cd34ef56ab78');
  assert.strictEqual(r.amount, 25);
  assert.deepStrictEqual(Object.keys(r.breakdown).sort(), ['subtotal', 'taxAmount', 'taxLabel', 'taxRate', 'total']);
  const compra = prisma.compras[0];
  assert.strictEqual(compra.status, 'pending');
  assert.strictEqual(compra.azulOrdenId, 'ab12cd34ef56ab78');
  assert.strictEqual(compra.credits, 25);
  const [pedido] = azul.pedidos;
  assert.strictEqual(pedido.monto, 25);
  assert.strictEqual(pedido.guardarTarjeta, true);
  assert.strictEqual(pedido.cliente, 'u6');
  assert.strictEqual(pedido.referencia, `NEBO-${compra.id}`);
  assert.strictEqual(pedido.retorno, `${URLS.successUrl}&compra=${compra.id}`);
});

test('if pagos-azul fails, the purchase is failed and the buyer gets a clear 502', async () => {
  const prisma = prismaFor(RPM);
  const azul = { habilitado: true, crearOrden: async () => { throw new Error('ECONNREFUSED'); } };
  await assert.rejects(checkout.createCreditCheckout(prisma, 6, 25, { ...URLS, azul }), (e) => e.status === 502);
  assert.strictEqual(prisma.compras[0].status, 'failed');
});

test('AZUL cannot save a card without a purchase', async () => {
  const prisma = prismaFor(RPM);
  await assert.rejects(checkout.createCardSetupCheckout(prisma, 6, 'primary', { ...URLS, azul: azulFalso() }), (e) => e.status === 409);
});

test('without pagos-azul configured, platform still cannot pay by card', async () => {
  const prisma = prismaFor(RPM);
  await assert.rejects(checkout.createCreditCheckout(prisma, 6, 25, { ...URLS, azul: { habilitado: false } }), (e) => e.status === 403);
});

test('confirming an approved AZUL order settles it and keeps the card when there was none', async () => {
  const prisma = prismaFor(RPM);
  let settled = 0;
  const purchase = { id: 3, userId: 6, status: 'pending', azulOrdenId: 'ab12cd34ef56ab78', credits: 25 };
  const r = await checkout.confirmAzulOrder(prisma, purchase, {
    azul: { obtenerOrden: async () => ({ id: 'ab12cd34ef56ab78', estado: 'aprobada', tarjetaId: 'tj9' }) },
    settle: async () => { settled += 1; return true; },
  });
  assert.deepStrictEqual(r, { paid: true, credited: true });
  assert.strictEqual(settled, 1);
  assert.strictEqual(prisma.usuarios[6].azulTarjetaId, 'tj9');
});

test('an existing AZUL card is not replaced by a later purchase', async () => {
  const prisma = prismaFor({ ...RPM, azulTarjetaId: 'tj-vieja' });
  await checkout.confirmAzulOrder(prisma, { id: 4, userId: 6, status: 'pending', azulOrdenId: 'x' }, {
    azul: { obtenerOrden: async () => ({ id: 'x', estado: 'aprobada', tarjetaId: 'tj-nueva' }) },
    settle: async () => true,
  });
  assert.strictEqual(prisma.usuarios[6].azulTarjetaId, 'tj-vieja');
});

test('a declined AZUL order fails the purchase; a pending one is left alone', async () => {
  const prisma = prismaFor(RPM);
  prisma.compras.push({ id: 1, userId: 6, status: 'pending', azulOrdenId: 'd1' }, { id: 2, userId: 6, status: 'pending', azulOrdenId: 'p1' });
  const azul = { obtenerOrden: async (id) => (id === 'd1' ? { id, estado: 'declinada', error: 'DENEGADA' } : { id, estado: 'pendiente' }) };
  assert.deepStrictEqual(await checkout.confirmAzulOrder(prisma, prisma.compras[0], { azul, settle: async () => true }), { paid: false, credited: false });
  assert.strictEqual(prisma.compras[0].status, 'failed');
  assert.strictEqual(prisma.compras[0].errorMessage, 'DENEGADA');
  await checkout.confirmAzulOrder(prisma, prisma.compras[1], { azul, settle: async () => true });
  assert.strictEqual(prisma.compras[1].status, 'pending');
});
