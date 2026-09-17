const stripeService = require('../services/stripeService');
const { encrypt } = require('../utils/encryption');
const { generateWebhookToken } = require('../utils/whopConfig');
const { getPartnerByStripeWebhookToken } = require('../utils/stripeConfig');
const { recordAutoRechargeFailure, extractDeclineReason } = require('../utils/autoRecharge');
const { settleCreditPurchase } = require('../utils/creditSettlement');
const { reconcileStripePayment, CheckoutError } = require('../services/creditCheckout');
const { logAudit } = require('../utils/auditLog');

function partnerWebhookUrl(token) {
  if (!token) return null;
  const base = (process.env.APP_URL || process.env.SERVER_URL || '').replace(/\/+$/, '');
  return `${base}/api/stripe/webhook/${token}`;
}

// The events the partner must enable on their Stripe webhook endpoint. Shown in
// the admin UI next to the URL so nothing is missed during setup.
const REQUIRED_EVENTS = [
  'checkout.session.completed',
  'payment_intent.succeeded',
  'payment_intent.payment_failed',
  'invoice.paid',
  'customer.subscription.deleted',
];

// ──────────────────────────────────────────────────────────────────────────
// OWNER: manage a partner's own Stripe credentials
// ──────────────────────────────────────────────────────────────────────────

// GET /api/stripe/partner/:userId/config
const getPartnerStripeConfig = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const partner = await req.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true, role: true, name: true, email: true, billingMode: true,
        stripeSecretKey: true, stripePublishableKey: true,
        stripeWebhookSecret: true, stripeWebhookToken: true,
      },
    });
    if (!partner) return res.status(404).json({ error: 'User not found' });

    res.json({
      userId: partner.id,
      role: partner.role,
      isPartner: partner.role === 'WHITELABEL' || partner.role === 'AGENCY',
      billingMode: partner.billingMode || 'platform',
      publishableKey: partner.stripePublishableKey || '',
      hasSecretKey: !!partner.stripeSecretKey,
      hasWebhookSecret: !!partner.stripeWebhookSecret,
      webhookUrl: partnerWebhookUrl(partner.stripeWebhookToken),
      requiredEvents: REQUIRED_EVENTS,
      configured: !!(partner.stripeSecretKey && partner.stripeWebhookSecret),
    });
  } catch (err) {
    console.error('getPartnerStripeConfig error:', err.message);
    res.status(500).json({ error: 'Failed to load partner Stripe config' });
  }
};

// PUT /api/stripe/partner/:userId/config
// Body: { secretKey?, publishableKey?, webhookSecret?, billingMode?, clear? }
// Omitted/empty secrets keep the stored value; `clear: true` wipes the config and
// sends the partner back to platform billing.
const setPartnerStripeConfig = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const partner = await req.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, stripeWebhookToken: true, stripeSecretKey: true },
    });
    if (!partner) return res.status(404).json({ error: 'User not found' });
    if (partner.role !== 'WHITELABEL' && partner.role !== 'AGENCY') {
      return res.status(400).json({ error: 'Stripe billing can only be set on an AGENCY or WHITELABEL account' });
    }

    if (req.body?.clear) {
      await req.prisma.user.update({
        where: { id: userId },
        data: {
          billingMode: 'platform',
          stripeSecretKey: null, stripePublishableKey: null,
          stripeWebhookSecret: null, stripeWebhookToken: null,
        },
      });
      return res.json({ cleared: true });
    }

    const { secretKey, publishableKey, webhookSecret, billingMode } = req.body || {};
    const data = {};

    if (secretKey && secretKey.trim()) {
      const key = secretKey.trim();
      if (!/^(sk|rk)_(test|live)_/.test(key)) {
        return res.status(400).json({ error: 'That does not look like a Stripe secret key (it should start with sk_test_ or sk_live_).' });
      }
      // Fail fast on a bad key: better a clear error here than a broken checkout
      // for every client under this partner.
      try {
        await stripeService.verifyCredentials(key);
      } catch (err) {
        return res.status(400).json({ error: `Stripe rejected that secret key: ${err.message}` });
      }
      data.stripeSecretKey = encrypt(key);
    }

    if (typeof publishableKey === 'string') data.stripePublishableKey = publishableKey.trim() || null;
    if (webhookSecret && webhookSecret.trim()) data.stripeWebhookSecret = encrypt(webhookSecret.trim());

    if (['platform', 'own_whop', 'own_stripe', 'manual'].includes(billingMode)) {
      // Don't let a partner be switched to Stripe before its keys exist — every
      // payment under it would fail with "not configured".
      if (billingMode === 'own_stripe' && !data.stripeSecretKey && !partner.stripeSecretKey) {
        return res.status(400).json({ error: 'Add the Stripe secret key before switching this partner to Stripe billing.' });
      }
      data.billingMode = billingMode;
    }

    // Mint the webhook token on first configuration so the partner has a URL to
    // paste into their Stripe dashboard.
    if (!partner.stripeWebhookToken) data.stripeWebhookToken = generateWebhookToken();

    const updated = await req.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        billingMode: true, stripeSecretKey: true, stripePublishableKey: true,
        stripeWebhookSecret: true, stripeWebhookToken: true,
      },
    });

    res.json({
      billingMode: updated.billingMode,
      publishableKey: updated.stripePublishableKey || '',
      hasSecretKey: !!updated.stripeSecretKey,
      hasWebhookSecret: !!updated.stripeWebhookSecret,
      webhookUrl: partnerWebhookUrl(updated.stripeWebhookToken),
      requiredEvents: REQUIRED_EVENTS,
      configured: !!(updated.stripeSecretKey && updated.stripeWebhookSecret),
    });
  } catch (err) {
    console.error('setPartnerStripeConfig error:', err.message);
    res.status(500).json({ error: 'Failed to save partner Stripe config' });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Webhook — POST /api/stripe/webhook/:token
// ──────────────────────────────────────────────────────────────────────────

async function findPurchase(prisma, { purchaseId, paymentIntentId }) {
  if (purchaseId) {
    const byId = await prisma.creditPurchase.findUnique({ where: { id: parseInt(purchaseId) } });
    if (byId) return byId;
  }
  if (paymentIntentId) {
    return prisma.creditPurchase.findFirst({
      where: { stripePaymentIntentId: paymentIntentId },
      orderBy: { createdAt: 'desc' },
    });
  }
  return null;
}

/** Store a card in the requested slot ('primary' | 'backup'). */
async function saveCard(prisma, userId, paymentMethodId, slot) {
  if (!paymentMethodId) return;
  const field = slot === 'backup' ? 'stripePaymentMethodIdBackup' : 'stripePaymentMethodId';
  await prisma.user.update({ where: { id: userId }, data: { [field]: paymentMethodId } });
  console.log(`[Stripe Webhook] Saved ${slot || 'primary'} card ${paymentMethodId} for user ${userId}`);
}

async function handleCheckoutCompleted(prisma, session, secretKey) {
  const meta = session.metadata || {};
  const userId = meta.userId ? parseInt(meta.userId) : null;

  if (meta.type === 'setup') {
    // Card vaulted without a charge: read the payment method off the SetupIntent.
    let paymentMethodId = null;
    if (session.setup_intent) {
      const intent = await stripeService.getSetupIntent(session.setup_intent, secretKey);
      paymentMethodId = intent?.payment_method || null;
    }
    if (userId) await saveCard(prisma, userId, paymentMethodId, meta.slot);
    return;
  }

  if (meta.type === 'credits') {
    const purchase = await findPurchase(prisma, {
      purchaseId: meta.purchaseId,
      paymentIntentId: session.payment_intent,
    });
    if (!purchase) {
      console.error(`[Stripe Webhook] No pending purchase for checkout ${session.id} (metadata: ${JSON.stringify(meta)})`);
      return;
    }
    await settleCreditPurchase(prisma, purchase, { paymentIntentId: session.payment_intent, payload: session });

    // The checkout vaulted the card (setup_future_usage) — keep it for
    // auto-recharge when this account has no primary card yet.
    if (userId && session.payment_intent) {
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripePaymentMethodId: true } });
      if (!user?.stripePaymentMethodId) {
        const intent = await stripeService.getPaymentIntent(session.payment_intent, secretKey).catch(() => null);
        if (intent?.payment_method) await saveCard(prisma, userId, intent.payment_method, 'primary');
      }
    }
    return;
  }

  console.log(`[Stripe Webhook] checkout.session.completed with unhandled type: ${meta.type || '(none)'}`);
}

async function handlePaymentIntentSucceeded(prisma, intent) {
  const meta = intent.metadata || {};
  // Only in-app credit purchases carry a purchaseId; anything else (a product
  // subscription, a charge made by hand in the Stripe dashboard) is not ours to credit.
  if (!meta.purchaseId) return;

  const purchase = await findPurchase(prisma, { purchaseId: meta.purchaseId, paymentIntentId: intent.id });
  if (!purchase) return;
  await settleCreditPurchase(prisma, purchase, { paymentIntentId: intent.id, payload: intent });

  // An off-session charge is the moment we learn the card works; persist it as
  // the primary card if this account somehow has none stored.
  if (intent.payment_method && purchase.userId) {
    const user = await prisma.user.findUnique({ where: { id: purchase.userId }, select: { stripePaymentMethodId: true } });
    if (!user?.stripePaymentMethodId) await saveCard(prisma, purchase.userId, intent.payment_method, 'primary');
  }
}

async function handlePaymentIntentFailed(prisma, intent) {
  const meta = intent.metadata || {};
  const reason = extractDeclineReason(intent.last_payment_error || intent);
  const purchase = await findPurchase(prisma, { purchaseId: meta.purchaseId, paymentIntentId: intent.id });

  if (purchase && purchase.status === 'pending') {
    await prisma.creditPurchase.updateMany({
      where: { id: purchase.id, status: 'pending' },
      data: { status: 'failed', errorMessage: reason, rawPayload: JSON.stringify(intent).slice(0, 10000) },
    });
  }

  const userId = purchase?.userId || (meta.userId ? parseInt(meta.userId) : null);
  if (!userId) return;

  // Only automatic charges count toward the auto-disable rule; a customer
  // fumbling a card in checkout shouldn't turn their auto-recharge off.
  const kind = purchase?.kind || meta.kind;
  if (kind === 'auto_recharge' || kind === 'manual_card') {
    await recordAutoRechargeFailure(prisma, userId, reason);
    // Fall back to the backup card, if there is one.
    try {
      const { chargeNextCard } = require('./creditsController');
      await chargeNextCard(prisma, userId, purchase.amount, kind, purchase.paymentMethodId);
    } catch (err) {
      console.error('[Stripe Webhook] Backup-card retry failed:', err.message);
    }
  }
}

const handleWebhook = async (req, res) => {
  try {
    const resolved = await getPartnerByStripeWebhookToken(req.prisma, req.params.token).catch(() => null);
    if (!resolved) {
      console.error(`[Stripe Webhook] Unknown partner webhook token: ${req.params.token}`);
      return res.status(404).json({ error: 'Unknown webhook' });
    }

    let event;
    try {
      // req.body is the raw Buffer (express.raw is mounted on this path).
      event = stripeService.constructEvent(req.body, req.headers['stripe-signature'], resolved.webhookSecret);
    } catch (err) {
      console.error('[Stripe Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    console.log(`[Stripe Webhook] Event: ${event.type} (partner ${resolved.partner.id})`);
    const object = event.data?.object || {};

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(req.prisma, object, resolved.secretKey);
        break;
      case 'payment_intent.succeeded':
        await handlePaymentIntentSucceeded(req.prisma, object);
        break;
      case 'payment_intent.payment_failed':
        await handlePaymentIntentFailed(req.prisma, object);
        break;
      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    // Always 200 after a verified event: a 500 makes Stripe retry for days over
    // a bug that the retry will hit again.
    console.error('[Stripe Webhook] Handler error:', err);
    res.status(200).json({ received: true });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// OWNER: credit a payment Stripe collected but the app never recorded
// ──────────────────────────────────────────────────────────────────────────

// POST /api/stripe/reconcile  Body: { userId, paymentIntentId }
// For a payment whose webhook never landed: the money is in Stripe, the balance
// never moved. Safe to run twice — an already-credited payment is left alone.
const reconcilePayment = async (req, res) => {
  try {
    const userId = parseInt(req.body?.userId);
    if (!userId) return res.status(400).json({ error: 'userId is required' });
    const paymentIntentId = String(req.body?.paymentIntentId || '').trim();

    const result = await reconcileStripePayment(req.prisma, userId, paymentIntentId);
    const fresh = await req.prisma.user.findUnique({ where: { id: userId }, select: { vapiCredits: true } });

    if (result.credited) {
      logAudit(req.prisma, {
        userId,
        actorId: req.user.id,
        actorType: 'user',
        action: 'credits.reconcile_stripe_payment',
        resourceType: 'user',
        resourceId: String(userId),
        details: { paymentIntentId, amount: result.amount },
        req,
      });
    }

    res.json({ ...result, balance: fresh?.vapiCredits ?? null });
  } catch (error) {
    if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message });
    // Stripe answers an unknown id (or one from another account) with this type.
    if (error.type === 'StripeInvalidRequestError') {
      return res.status(404).json({ error: `Stripe does not know that payment in this account's Stripe: ${error.message}` });
    }
    console.error('reconcilePayment error:', error.message);
    res.status(500).json({ error: 'Failed to reconcile the payment' });
  }
};

module.exports = {
  getPartnerStripeConfig,
  setPartnerStripeConfig,
  handleWebhook,
  reconcilePayment,
  REQUIRED_EVENTS,
};
