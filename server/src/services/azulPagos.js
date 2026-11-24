// Client for the pagos-azul service (nebocore), the only piece of NEBO that talks to it.
// NEBO never sees a card number: pagos-azul holds AZUL's DataVault token and NEBO keeps
// the tarjetaId it hands back. Configured by PAGOS_AZUL_URL / _CLAVE / _SECRETO; while any
// is missing, platform accounts have no card payment.
const crypto = require('crypto');

class PagosAzulError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

function crearCliente({ env = process.env, fetch = globalThis.fetch } = {}) {
  const base = (env.PAGOS_AZUL_URL || '').replace(/\/$/, '');
  const clave = env.PAGOS_AZUL_CLAVE || '';
  const secreto = env.PAGOS_AZUL_SECRETO || '';
  const habilitado = !!(base && clave && secreto);

  async function llamar(metodo, ruta, cuerpo, { aceptar502 = false } = {}) {
    if (!habilitado) throw new PagosAzulError('AZUL is not configured', 503);
    const r = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': clave },
      body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      signal: AbortSignal.timeout(90000),
    });
    const datos = await r.json().catch(() => ({}));
    // cobrar-tarjeta answers 502 with the order when AZUL errored or could not confirm.
    if (r.ok || (aceptar502 && r.status === 502 && datos.id)) return datos;
    throw new PagosAzulError(datos.error || `pagos-azul answered ${r.status}`, r.status);
  }

  return {
    habilitado,
    secreto,
    crearOrden: ({ monto, cliente, referencia, descripcion, guardarTarjeta, retorno }) =>
      llamar('POST', '/api/pagos/ordenes', { moneda: 'USD', monto, cliente, referencia, descripcion, guardarTarjeta, retorno }),
    obtenerOrden: (id) => llamar('GET', `/api/pagos/ordenes/${encodeURIComponent(id)}`),
    cobrarTarjeta: ({ tarjetaId, monto, referencia, descripcion, idempotencia }) =>
      llamar('POST', '/api/pagos/cobrar-tarjeta', { tarjetaId, moneda: 'USD', monto, referencia, descripcion, idempotencia }, { aceptar502: true }),
    obtenerTarjeta: (id) => llamar('GET', `/api/pagos/tarjetas/${encodeURIComponent(id)}`),
    retirarTarjeta: (id) => llamar('DELETE', `/api/pagos/tarjetas/${encodeURIComponent(id)}`),
  };
}

// pagos-azul signs each webhook with HMAC-SHA256 of the raw body (X-Pagos-Firma, hex).
function firmaValida(cuerpoCrudo, firma, secreto) {
  if (!firma || !secreto) return false;
  const esperada = crypto.createHmac('sha256', secreto).update(cuerpoCrudo).digest('hex');
  const recibida = String(firma);
  return esperada.length === recibida.length && crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(recibida));
}

// One shared client for the app; tests build their own with crearCliente.
let compartido = null;
function cliente() {
  if (!compartido) compartido = crearCliente();
  return compartido;
}

module.exports = { crearCliente, firmaValida, cliente, PagosAzulError };
