const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { crearHandler, confirmarDesdeAviso } = require('../src/controllers/azulController');

function firmar(obj, s = 'sec') {
  const cuerpo = Buffer.from(JSON.stringify(obj));
  return { cuerpo, firma: crypto.createHmac('sha256', s).update(cuerpo).digest('hex') };
}
function res() {
  const r = { code: 0, body: null, status(c) { r.code = c; return r; }, json(b) { r.body = b; return r; } };
  return r;
}
const compraPendiente = { id: 7, userId: 6, status: 'pending', azulOrdenId: 'ab12cd34ef56ab78', credits: 25 };
const prismaCon = (purchase) => ({ creditPurchase: { findFirst: async ({ where }) => (purchase && where.azulOrdenId === purchase.azulOrdenId ? purchase : null) } });

test('an approved order settles its purchase', async () => {
  const llamadas = [];
  const handler = crearHandler({ secreto: 'sec', confirmar: async (_p, purchase, { orden }) => { llamadas.push([purchase.id, orden.tarjetaId]); } });
  const { cuerpo, firma } = firmar({ evento: 'pago.aprobado', orden: { id: 'ab12cd34ef56ab78', estado: 'aprobada', tarjetaId: 'tj9' } });
  const r = res();
  await handler({ prisma: prismaCon(compraPendiente), body: cuerpo, headers: { 'x-pagos-firma': firma } }, r);
  assert.strictEqual(r.code, 200);
  assert.deepStrictEqual(llamadas, [[7, 'tj9']]);
});

test('a bad or missing signature is refused and nothing is settled', async () => {
  let llamado = false;
  const handler = crearHandler({ secreto: 'sec', confirmar: async () => { llamado = true; } });
  const { cuerpo, firma } = firmar({ evento: 'pago.aprobado', orden: { id: 'ab12cd34ef56ab78' } }, 'otra-clave');
  for (const f of [firma, undefined]) {
    const r = res();
    await handler({ prisma: prismaCon(compraPendiente), body: cuerpo, headers: { 'x-pagos-firma': f } }, r);
    assert.strictEqual(r.code, 401);
  }
  assert.strictEqual(llamado, false);
});

test('an order NEBO does not know is acknowledged and ignored', async () => {
  const handler = crearHandler({ secreto: 'sec', confirmar: async () => { throw new Error('should not run'); } });
  const { cuerpo, firma } = firmar({ evento: 'pago.aprobado', orden: { id: 'otra' } });
  const r = res();
  await handler({ prisma: prismaCon(null), body: cuerpo, headers: { 'x-pagos-firma': firma } }, r);
  assert.strictEqual(r.code, 200);
});

test('a processing error answers 500 so pagos-azul retries', async () => {
  const handler = crearHandler({ secreto: 'sec', confirmar: async () => { throw new Error('db down'); } });
  const { cuerpo, firma } = firmar({ evento: 'pago.aprobado', orden: { id: 'ab12cd34ef56ab78', estado: 'aprobada' } });
  const r = res();
  await handler({ prisma: prismaCon(compraPendiente), body: cuerpo, headers: { 'x-pagos-firma': firma } }, r);
  assert.strictEqual(r.code, 500);
});

test('a declined notice fails the pending purchase', async () => {
  const filas = [{ ...compraPendiente }];
  const prisma = { creditPurchase: { updateMany: async ({ where, data }) => {
    const c = filas.find((x) => x.id === where.id && x.status === where.status);
    if (c) Object.assign(c, data);
    return { count: c ? 1 : 0 };
  } } };
  const r = await confirmarDesdeAviso(prisma, filas[0], { orden: { estado: 'declinada', error: 'DENEGADA' } });
  assert.deepStrictEqual(r, { paid: false, credited: false });
  assert.strictEqual(filas[0].status, 'failed');
  assert.strictEqual(filas[0].errorMessage, 'DENEGADA');
});
