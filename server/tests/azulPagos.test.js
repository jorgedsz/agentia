const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { crearCliente, firmaValida } = require('../src/services/azulPagos');

const ENV = { PAGOS_AZUL_URL: 'http://pagos:3100', PAGOS_AZUL_CLAVE: 'k', PAGOS_AZUL_SECRETO: 's' };

function fetchFalso(respuestas) {
  const llamadas = [];
  const f = async (url, init = {}) => {
    llamadas.push({ url, init });
    const r = respuestas.shift();
    return { ok: r.status < 400, status: r.status, json: async () => r.body };
  };
  f.llamadas = llamadas;
  return f;
}

test('without configuration AZUL is not enabled', () => {
  assert.strictEqual(crearCliente({ env: {} }).habilitado, false);
  assert.strictEqual(crearCliente({ env: { ...ENV, PAGOS_AZUL_SECRETO: '' } }).habilitado, false);
});

test('creates a USD order with the app key', async () => {
  const fetch = fetchFalso([{ status: 201, body: { id: 'a1b2c3d4e5f60718', urlPago: 'https://x/api/pagos/ir/a1b2c3d4e5f60718' } }]);
  const c = crearCliente({ env: ENV, fetch });
  const o = await c.crearOrden({ monto: 25, cliente: 'u6', referencia: 'NEBO-9', descripcion: 'Créditos', guardarTarjeta: true, retorno: 'https://app.swordaisolutions.com/dashboard?checkout=success' });
  assert.strictEqual(o.id, 'a1b2c3d4e5f60718');
  const { url, init } = fetch.llamadas[0];
  assert.strictEqual(url, 'http://pagos:3100/api/pagos/ordenes');
  assert.strictEqual(init.method, 'POST');
  assert.strictEqual(init.headers['X-Api-Key'], 'k');
  assert.deepStrictEqual(JSON.parse(init.body), { moneda: 'USD', monto: 25, cliente: 'u6', referencia: 'NEBO-9', descripcion: 'Créditos', guardarTarjeta: true, retorno: 'https://app.swordaisolutions.com/dashboard?checkout=success' });
});

test('a card charge returns the order even when pagos-azul answers 502', async () => {
  const fetch = fetchFalso([{ status: 502, body: { id: 'f'.repeat(16), estado: 'por-verificar', error: 'x' } }]);
  const c = crearCliente({ env: ENV, fetch });
  const o = await c.cobrarTarjeta({ tarjetaId: 't1', monto: 10, referencia: 'NEBO-1', idempotencia: 'nebo-cp-1' });
  assert.strictEqual(o.estado, 'por-verificar');
  assert.deepStrictEqual(JSON.parse(fetch.llamadas[0].init.body).moneda, 'USD');
});

test('a 4xx from pagos-azul is an error carrying its message', async () => {
  const fetch = fetchFalso([{ status: 404, body: { error: 'tarjeta no encontrada' } }]);
  const c = crearCliente({ env: ENV, fetch });
  await assert.rejects(c.cobrarTarjeta({ tarjetaId: 't1', monto: 10, idempotencia: 'x' }), /tarjeta no encontrada/);
});

test('calls fail clearly when AZUL is not configured', async () => {
  await assert.rejects(crearCliente({ env: {} }).obtenerOrden('x'), /not configured/);
});

test('the webhook signature is checked on the raw body', () => {
  const cuerpo = Buffer.from('{"evento":"pago.aprobado"}');
  const firma = crypto.createHmac('sha256', 's').update(cuerpo).digest('hex');
  assert.strictEqual(firmaValida(cuerpo, firma, 's'), true);
  assert.strictEqual(firmaValida(cuerpo, firma, 'otro'), false);
  assert.strictEqual(firmaValida(cuerpo, '', 's'), false);
  assert.strictEqual(firmaValida(cuerpo, firma, ''), false);
});
