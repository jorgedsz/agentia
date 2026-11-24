// Building a credit checkout for one account, independent of who asked for it.
//
// The same two flows are needed from three places: the credits panel inside the
// app, the public payment page a client opens from a link or an embed, and any
// future surface. They must route the money identically — through the Stripe of
// the partner that governs the account, or through AZUL (pagos-azul, Nebo AI's own
// merchant) for platform accounts — so the logic lives here and each caller only
// supplies its own return URLs. Manual accounts have no self-service card
// payment: whoever manages them tops the balance up by hand.

const { getAncestorPartners, getEffectiveBilling, cardProviderFor } = require('../utils/billingMode');
const { savedCardId } = require('../utils/savedCard');
const azulPagos = require('./azulPagos');
const { getStripeConfigForUser } = require('../utils/stripeConfig');
const { resolveCharge } = require('../utils/taxes');

const MANUAL_BILLING_MSG = 'Tu proveedor gestiona el saldo de tu cuenta. Contáctalo para recargar créditos.';

// Charges the platform makes on its own, as opposed to ones a person started.
const AUTOMATIC_KINDS = new Set(['auto_recharge', 'cycle_topup']);

/**
 * What a credit charge is called on the card statement, in the Stripe dashboard
 * and on the receipt — so a client can tell a top-up they asked for from one the
 * platform made for them.
 */
function creditsLabel(kind) {
  return AUTOMATIC_KINDS.has(kind) ? 'Auto-Recharge Credits' : 'Manual Purchase Credits';
}

/**
 * Why a person may not load credit right now, or null. Loading by hand while
 * the automation is about to charge (or already charging) the same card is how
 * one balance got two simultaneous charges: so it is refused while auto-recharge
 * is due or a top-up is still settling.
 */
async function manualTopUpBlocker(prisma, userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const money = (n) => `$${(Math.round((n || 0) * 100) / 100).toFixed(2)}`;

  const inFlight = await Promise.resolve()
    .then(() => prisma.creditPurchase.findFirst({
      where: {
        userId,
        kind: { in: [...AUTOMATIC_KINDS] },
        status: 'pending',
        createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
      },
      orderBy: { createdAt: 'desc' },
    }))
    .catch(() => null);
  if (inFlight) {
    return `Hay una recarga automática de ${money(inFlight.amount)} en curso. Espera a que se confirme antes de cargar saldo.`;
  }

  const { mode } = await getEffectiveBilling(prisma, userId).catch(() => ({ mode: 'platform' }));
  const hasCard = !!savedCardId(user, cardProviderFor(mode));
  if (user.autoRechargeEnabled && !user.cycleBillingEnabled && hasCard
      && user.autoRechargeThreshold > 0 && user.vapiCredits < user.autoRechargeThreshold) {
    // autoRechargeAmount is the pre-tax subtotal: it is what reaches the
    // balance, not what the card pays. Quoting it alone told a client "se va a
    // cargar sola por $100" when the card was about to take $127 - the single
    // number they would then look for on their statement and not find. So both
    // figures are named when there is a tax. resolveCharge throws on a
    // non-finite subtotal (an account with no amount configured), and this is
    // only a warning message: a failure here falls back to the plain wording
    // rather than blocking the screen.
    const charge = await resolveCharge(prisma, userId, user.autoRechargeAmount).catch(() => null);
    const willCharge = charge && charge.taxAmount > 0
      ? `${money(charge.total)} (${money(charge.subtotal)} de saldo + ${money(charge.taxAmount)} de ${charge.taxLabel})`
      : money(user.autoRechargeAmount);
    return `La auto-recarga está activa y tu saldo (${money(user.vapiCredits)}) está por debajo de ${money(user.autoRechargeThreshold)}: `
      + `se va a cargar sola por ${willCharge} en unos minutos. No hace falta cargar a mano.`;
  }

  if (user.cycleBillingEnabled && hasCard) {
    const plan = await require('./cycleBilling').planFor(prisma, user).catch(() => null);
    if (plan?.due) {
      return `El cobro por cortes está por cargar ${money(plan.chargeAmount)} automáticamente. No hace falta cargar a mano.`;
    }
  }

  return null;
}

/**
 * Where Stripe should send the receipt for this account's payments: the address
 * configured on the account, else the one configured on the nearest partner above
 * it, else the account's own email. Configured in the panel under Manage Billing.
 */
async function resolveReceiptEmail(prisma, user) {
  if (user.receiptEmail) return user.receiptEmail;
  const ancestors = await getAncestorPartners(prisma, user).catch(() => []);
  for (const a of ancestors) {
    const partner = await prisma.user.findUnique({ where: { id: a.id }, select: { receiptEmail: true } });
    if (partner?.receiptEmail) return partner.receiptEmail;
  }
  return user.email || null;
}

/** An error the caller should surface to the user, with an HTTP status. */
class CheckoutError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * The usage window a new payment will cover: from the end of the last settled
 * period (or that payment's date) up to now. Frozen on the purchase so the
 * report emailed afterwards accounts for exactly the amount charged, even if the
 * account keeps consuming while the client is on the checkout page.
 */
async function nextPeriodFor(prisma, userId) {
  let previous = null;
  try {
    previous = await prisma.creditPurchase.findFirst({
      where: { userId, status: 'completed' },
      orderBy: { id: 'desc' },
      select: { periodEnd: true, createdAt: true },
    });
  } catch (error) {
    // Never let working out the window block a payment; the report falls back to
    // the last 30 days.
    console.error('[Credits] Could not resolve the previous billing period:', error.message);
  }

  const end = new Date();
  const start = previous
    ? new Date(previous.periodEnd || previous.createdAt)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { periodStart: start, periodEnd: end };
}

/**
 * Start a credit purchase for `userId`.
 * Returns { provider: 'stripe', checkoutUrl, purchaseId, amount, breakdown }:
 * `amount` = what the card will be charged and `breakdown` = how that splits
 * into credits and tax. Accounts without a Stripe partner are refused (403).
 *
 * `amount` IN is the balance the client asked for, and is what reaches the
 * balance. A partner that collects a tax charges it on top, so the card may pay
 * more than `amount` - see utils/taxes.js.
 */
async function createCreditCheckout(prisma, userId, amount, { successUrl, cancelUrl, azul = azulPagos.cliente() }) {
  const blocked = await manualTopUpBlocker(prisma, userId);
  if (blocked) throw new CheckoutError(blocked, 409);

  // Resolved once, before either provider branch, so the row we record and the
  // charge we ask for can never disagree about the numbers. `amount` here has
  // already been validated as a finite number inside its range by every caller
  // (the credits panel, the payment page, the wallet top-up) - resolveCharge
  // throws on a non-finite subtotal rather than quietly charging $0.
  const charge = await resolveCharge(prisma, userId, amount);
  // What the client sees and what the balance gets; the tax is the partner's.
  //
  // Hand-built on purpose, field by field, rather than spread from `charge`:
  // `charge.profile` is the issuer's whole BillingProfile row — bank account,
  // SWIFT, routing number, RNC, and the live invoice numbering sequence — and
  // this object is returned straight to the browser by a token-authenticated
  // PUBLIC endpoint (the payment page and the wallet top-up in
  // controllers/paymentPortalController.js). Do not turn this into
  // `...charge`: nothing a client UI needs is in `profile`, and spreading it
  // would publish the issuer's banking details to every payer.
  const breakdown = {
    subtotal: charge.subtotal,
    taxRate: charge.taxRate,
    taxLabel: charge.taxLabel,
    taxAmount: charge.taxAmount,
    total: charge.total,
  };

  // Platform accounts pay on AZUL's payment page (through pagos-azul).
  const { mode } = await getEffectiveBilling(prisma, userId).catch(() => ({ mode: 'platform' }));
  const provider = cardProviderFor(mode, azul);
  if (provider === null) throw new CheckoutError(MANUAL_BILLING_MSG, 403);
  if (provider === 'azul') return createAzulCheckout(prisma, userId, charge, breakdown, { successUrl, azul });

  // Accounts under a partner billing through Stripe check out in that partner's
  // Stripe account.
  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode !== 'own_stripe') throw new CheckoutError(MANUAL_BILLING_MSG, 403);
  if (!stripe.isConfigured) throw new CheckoutError('Payment processing is not configured');

  const stripeService = require('./stripeService');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const customerId = await stripeService.ensureCustomer(prisma, user, stripe.secretKey);

  // The pending row is created BEFORE the checkout so its id can ride along in
  // the session metadata - that id is how the webhook finds the buyer.
  const period = await nextPeriodFor(prisma, userId);
  // `credits` is the pre-tax subtotal and is what the balance gets; `amount`
  // is what the card is charged. They differ by exactly `taxAmount`.
  const purchase = await prisma.creditPurchase.create({
    data: {
      userId,
      amount: charge.total,
      credits: charge.subtotal,
      taxRate: charge.taxRate,
      taxAmount: charge.taxAmount,
      status: 'pending',
      kind: 'manual',
      ...period,
    },
  });

  const session = await stripeService.createPaymentCheckout({
    customerId,
    amount: charge.total,
    // Two lines rather than one taxed line: the split then shows on Stripe's
    // own receipt and in the dashboard the partner reconciles against, not
    // only on the invoice we issue ourselves. An untaxed account's zero tax
    // line is dropped, leaving exactly the single line it always had.
    lines: [
      { name: `${creditsLabel('manual')} ($${charge.subtotal})`, amount: charge.subtotal },
      { name: `${charge.taxLabel} (${charge.taxRate}%)`, amount: charge.taxAmount },
    ],
    description: `${creditsLabel('manual')} $${charge.subtotal} · ${user.companyName || user.name || user.email}`,
    receiptEmail: await resolveReceiptEmail(prisma, user),
    metadata: {
      userId: String(userId),
      type: 'credits',
      purchaseId: String(purchase.id),
      credits: String(charge.subtotal),
      subtotal: String(charge.subtotal),
      taxRate: String(charge.taxRate),
      taxAmount: String(charge.taxAmount),
    },
    successUrl,
    cancelUrl,
    saveCard: true,
  }, stripe.secretKey);

  if (session.payment_intent) {
    await prisma.creditPurchase.update({
      where: { id: purchase.id },
      data: { stripePaymentIntentId: session.payment_intent },
    }).catch(() => {});
  }

  return { provider: 'stripe', checkoutUrl: session.url, purchaseId: purchase.id, amount: charge.total, breakdown };
}

/**
 * The AZUL branch of createCreditCheckout: a USD order in pagos-azul (which charges
 * the RD$ equivalent at the Central Bank's selling rate) paid on AZUL's payment
 * page. The card is always kept: AZUL has no card-only checkout, so the first
 * purchase is how an account gets a saved card. The webhook settles it.
 */
async function createAzulCheckout(prisma, userId, charge, breakdown, { successUrl, azul }) {
  const period = await nextPeriodFor(prisma, userId);
  const purchase = await prisma.creditPurchase.create({
    data: {
      userId,
      amount: charge.total,
      credits: charge.subtotal,
      taxRate: charge.taxRate,
      taxAmount: charge.taxAmount,
      status: 'pending',
      kind: 'manual',
      processor: 'azul',
      ...period,
    },
  });
  // pagos-azul sends the buyer back with ?pago=<its order>&estado=…; `compra`
  // tells the page which NEBO purchase to confirm on return.
  const retorno = new URL(successUrl);
  retorno.searchParams.set('compra', String(purchase.id));
  let orden;
  try {
    orden = await azul.crearOrden({
      monto: charge.total,
      cliente: `u${userId}`,
      referencia: `NEBO-${purchase.id}`,
      descripcion: `${creditsLabel('manual')} ($${charge.subtotal})`,
      guardarTarjeta: true,
      retorno: retorno.toString(),
    });
  } catch (err) {
    await prisma.creditPurchase.update({
      where: { id: purchase.id },
      data: { status: 'failed', errorMessage: String(err.message).slice(0, 500) },
    }).catch(() => {});
    console.error(`[AZUL] order for purchase ${purchase.id} failed: ${err.message}`);
    throw new CheckoutError('No se pudo iniciar el pago con AZUL. Intenta de nuevo en unos minutos.', 502);
  }
  await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { azulOrdenId: orden.id } });
  return { provider: 'azul', checkoutUrl: orden.urlPago, purchaseId: purchase.id, amount: charge.total, breakdown };
}

/** Keep `tarjetaId` as the account's primary AZUL card, unless it already has one. */
async function saveAzulCardIfNone(prisma, userId, tarjetaId) {
  if (!tarjetaId) return;
  await prisma.user.updateMany({ where: { id: userId, azulTarjetaId: null }, data: { azulTarjetaId: tarjetaId } });
}

/**
 * Apply a pagos-azul order to its NEBO purchase. Shared by the webhook, the
 * portal's return and the scheduler's reconciliation, so they can never disagree.
 *
 * - aprobada: settle it. An AZUL purchase marked failed earlier is revived first:
 *   a hosted order stays payable for 24 h after a decline or a cancel, and the
 *   buyer may pay it with another card — the money arrived, so the credits must too.
 * - declinada / cancelada / error: fail the pending purchase (not final for hosted
 *   orders, see above).
 * - anything else (pendiente, procesando, por-verificar): leave it pending.
 * An order whose reference is not this purchase is ignored. Returns { paid, credited }.
 */
async function applyAzulOrder(prisma, purchase, orden, { settle } = {}) {
  const settleFn = settle || require('../utils/creditSettlement').settleCreditPurchase;
  if (orden.referencia && orden.referencia !== `NEBO-${purchase.id}`) {
    console.error(`[AZUL] order ${orden.id} belongs to ${orden.referencia}, not purchase ${purchase.id}: ignored`);
    return { paid: false, credited: false };
  }
  if (orden.estado === 'aprobada') {
    let row = purchase;
    if (purchase.status === 'failed') {
      const revived = await prisma.creditPurchase.updateMany({
        where: { id: purchase.id, status: 'failed', processor: 'azul' },
        data: { status: 'pending', errorMessage: null },
      });
      if (revived.count === 1) {
        console.warn(`[AZUL] purchase ${purchase.id} was failed but AZUL approved order ${orden.id}: crediting it`);
        row = { ...purchase, status: 'pending' };
      }
    }
    if (!purchase.azulOrdenId && orden.id) {
      await prisma.creditPurchase.update({ where: { id: purchase.id }, data: { azulOrdenId: orden.id } }).catch(() => {});
    }
    const credited = await settleFn(prisma, row, { payload: orden });
    await saveAzulCardIfNone(prisma, purchase.userId, orden.tarjetaId);
    return { paid: true, credited };
  }
  if (['declinada', 'cancelada', 'error'].includes(orden.estado)) {
    await prisma.creditPurchase.updateMany({
      where: { id: purchase.id, status: 'pending' },
      data: { status: 'failed', errorMessage: String(orden.error || orden.estado).slice(0, 500) },
    });
  }
  return { paid: false, credited: false };
}

/**
 * Settle an AZUL purchase by asking pagos-azul about it.
 * - A hosted checkout (has an order id): read the order.
 * - A saved-card charge: repeat cobrar-tarjeta with the SAME idempotency key.
 *   pagos-azul answers the earlier order (asking AZUL again if its result was
 *   unknown), so this never charges twice; if the first request never reached
 *   pagos-azul, this is that charge, made once.
 * Returns { paid, credited }.
 */
async function confirmAzulOrder(prisma, purchase, { azul = azulPagos.cliente(), settle } = {}) {
  if (!purchase) return { paid: false, credited: false };
  let orden;
  if (purchase.kind !== 'manual' && purchase.paymentMethodId) {
    orden = await azul.cobrarTarjeta({
      tarjetaId: purchase.paymentMethodId,
      monto: purchase.amount,
      referencia: `NEBO-${purchase.id}`,
      idempotencia: `nebo-cp-${purchase.id}`,
    });
  } else if (purchase.azulOrdenId) {
    orden = await azul.obtenerOrden(purchase.azulOrdenId);
  } else {
    return { paid: false, credited: false };
  }
  return applyAzulOrder(prisma, purchase, orden, { settle });
}

/**
 * Start a card-vaulting checkout for `userId` (no charge).
 * Returns { provider: 'stripe', checkoutUrl }. Accounts without a Stripe partner
 * are refused (403): there is no card to save for them.
 */
async function createCardSetupCheckout(prisma, userId, slot, { successUrl, cancelUrl, azul = azulPagos.cliente() }) {
  const requestedSlot = slot === 'backup' ? 'backup' : 'primary';

  const { mode } = await getEffectiveBilling(prisma, userId).catch(() => ({ mode: 'platform' }));
  const provider = cardProviderFor(mode, azul);
  if (provider === null) throw new CheckoutError(MANUAL_BILLING_MSG, 403);
  if (provider === 'azul') {
    throw new CheckoutError('Con AZUL la tarjeta se guarda al hacer tu primera compra de créditos.', 409);
  }

  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode !== 'own_stripe') throw new CheckoutError(MANUAL_BILLING_MSG, 403);
  if (!stripe.isConfigured) throw new CheckoutError('Payment processing is not configured');
  const stripeService = require('./stripeService');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const customerId = await stripeService.ensureCustomer(prisma, user, stripe.secretKey);
  const session = await stripeService.createSetupCheckout({
    customerId,
    metadata: { userId: String(userId), type: 'setup', slot: requestedSlot },
    successUrl,
    cancelUrl,
  }, stripe.secretKey);
  return { provider: 'stripe', checkoutUrl: session.url };
}

/**
 * Confirm a Stripe checkout from the return redirect, without waiting for the
 * webhook. The session id in the URL is only a pointer: the session is fetched
 * from Stripe with the partner's own key, and must belong to this account and be
 * paid. Settling is idempotent, so the webhook arriving before or after this
 * never credits twice.
 * Returns { paid, credited, alreadySettled }.
 */
async function confirmStripeCheckout(prisma, userId, sessionId) {
  if (!/^cs_(test|live)_/.test(sessionId || '')) throw new CheckoutError('Invalid checkout session');

  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode !== 'own_stripe' || !stripe.isConfigured) {
    throw new CheckoutError('Stripe is not configured for this account');
  }

  const stripeService = require('./stripeService');
  const session = await stripeService.getCheckoutSession(sessionId, stripe.secretKey);
  const meta = session.metadata || {};
  if (meta.userId !== String(userId) || meta.type !== 'credits') {
    throw new CheckoutError('This payment does not belong to this account', 403);
  }
  if (session.payment_status !== 'paid') return { paid: false, credited: false, alreadySettled: false };

  const purchase = await prisma.creditPurchase.findUnique({ where: { id: parseInt(meta.purchaseId) } });
  if (!purchase || purchase.userId !== userId) throw new CheckoutError('Purchase not found', 404);

  const { settleCreditPurchase } = require('../utils/creditSettlement');
  const credited = await settleCreditPurchase(prisma, purchase, {
    paymentIntentId: session.payment_intent || undefined,
    payload: session,
  });
  return { paid: true, credited, alreadySettled: !credited };
}

/**
 * Credit a payment Stripe collected but the app never recorded — typically one
 * whose webhook failed to deliver. The PaymentIntent is read from the account's
 * Stripe, must have succeeded and belong to the account, and must carry the
 * purchase it paid for. Idempotent: an already-credited payment is left alone.
 * Returns { credited, alreadySettled, amount }.
 */
async function reconcileStripePayment(prisma, userId, paymentIntentId) {
  if (!/^pi_/.test(paymentIntentId || '')) throw new CheckoutError('That is not a Stripe payment id (pi_...)');

  const stripe = await getStripeConfigForUser(prisma, userId);
  if (stripe.mode !== 'own_stripe' || !stripe.isConfigured) {
    throw new CheckoutError('Stripe is not configured for this account');
  }

  const stripeService = require('./stripeService');
  const intent = await stripeService.getPaymentIntent(paymentIntentId, stripe.secretKey);
  const meta = intent.metadata || {};
  if (meta.userId !== String(userId)) {
    throw new CheckoutError('This payment does not belong to this account', 403);
  }
  if (intent.status !== 'succeeded') {
    throw new CheckoutError(`The payment has not completed (status: ${intent.status})`);
  }
  if (!meta.purchaseId) {
    throw new CheckoutError('This payment was not a credit purchase made through the app, so there is nothing to credit');
  }

  const purchase = await prisma.creditPurchase.findUnique({ where: { id: parseInt(meta.purchaseId) } });
  if (!purchase || purchase.userId !== userId) throw new CheckoutError('Purchase not found', 404);

  const { settleCreditPurchase } = require('../utils/creditSettlement');
  const credited = await settleCreditPurchase(prisma, purchase, { paymentIntentId: intent.id, payload: intent });
  return { credited, alreadySettled: !credited, amount: purchase.credits };
}

module.exports = {
  CheckoutError,
  MANUAL_BILLING_MSG,
  creditsLabel,
  manualTopUpBlocker,
  resolveReceiptEmail,
  nextPeriodFor,
  createCreditCheckout,
  createCardSetupCheckout,
  confirmAzulOrder,
  applyAzulOrder,
  saveAzulCardIfNone,
  confirmStripeCheckout,
  reconcileStripePayment,
};
