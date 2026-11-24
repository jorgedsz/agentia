// Webhook from pagos-azul: an order of the NEBO app was approved or declined.
// The body is verified with X-Pagos-Firma (HMAC-SHA256 of the raw body) before
// anything else is read, so the order it carries can be trusted as is.
const azulPagos = require('../services/azulPagos');

async function confirmarDesdeAviso(prisma, purchase, { orden }) {
  return require('../services/creditCheckout').applyAzulOrder(prisma, purchase, orden);
}

// The purchase an order belongs to: by its order id, or — when NEBO never got
// the id back (the charge's answer was lost) — by the NEBO-<id> reference.
async function compraDe(prisma, orden) {
  if (!orden.id) return null;
  const porOrden = await prisma.creditPurchase.findFirst({ where: { azulOrdenId: orden.id } });
  if (porOrden) return porOrden;
  const m = /^NEBO-(\d+)$/.exec(orden.referencia || '');
  return m ? prisma.creditPurchase.findFirst({ where: { id: Number(m[1]), processor: 'azul' } }) : null;
}

function crearHandler({ secreto, confirmar = confirmarDesdeAviso } = {}) {
  return async function handleWebhook(req, res) {
    const crudo = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''));
    const clave = secreto ?? azulPagos.cliente().secreto;
    if (!azulPagos.firmaValida(crudo, req.headers['x-pagos-firma'], clave)) {
      return res.status(401).json({ error: 'firma inválida' });
    }
    let aviso;
    try { aviso = JSON.parse(crudo.toString('utf8')); } catch { return res.status(400).json({ error: 'JSON inválido' }); }
    const orden = aviso?.orden || {};
    try {
      const purchase = await compraDe(req.prisma, orden);
      // Card charges also send a notice; settling is idempotent, so a purchase the
      // synchronous charge already settled is simply left as it is.
      if (purchase && (aviso.evento === 'pago.aprobado' || aviso.evento === 'pago.declinado')) {
        await confirmar(req.prisma, purchase, { orden });
      }
    } catch (err) {
      console.error('[AZUL webhook]', err.message);
      return res.status(500).json({ error: 'no procesado' }); // pagos-azul retries
    }
    return res.status(200).json({ received: true });
  };
}

const handleWebhook = crearHandler();

module.exports = { crearHandler, confirmarDesdeAviso, handleWebhook };
