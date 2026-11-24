// Webhook from pagos-azul: an order of the NEBO app was approved or declined.
// The body is verified with X-Pagos-Firma (HMAC-SHA256 of the raw body) before
// anything else is read, so the order it carries can be trusted as is.
const azulPagos = require('../services/azulPagos');

async function confirmarDesdeAviso(prisma, purchase, { orden }) {
  const { settleCreditPurchase } = require('../utils/creditSettlement');
  const { saveAzulCardIfNone } = require('../services/creditCheckout');
  if (orden.estado === 'aprobada') {
    const credited = await settleCreditPurchase(prisma, purchase, { payload: orden });
    await saveAzulCardIfNone(prisma, purchase.userId, orden.tarjetaId);
    return { paid: true, credited };
  }
  await prisma.creditPurchase.updateMany({
    where: { id: purchase.id, status: 'pending' },
    data: { status: 'failed', errorMessage: String(orden.error || 'Declinada').slice(0, 500) },
  });
  return { paid: false, credited: false };
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
      const purchase = orden.id ? await req.prisma.creditPurchase.findFirst({ where: { azulOrdenId: orden.id } }) : null;
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
