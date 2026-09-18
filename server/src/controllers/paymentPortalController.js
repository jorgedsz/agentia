// The public payment page: a per-client link (and embeddable iframe) where the
// client sees what they owe, pays it, saves a card and reviews their usage —
// without an account or a login.
//
// It is addressed by `paymentToken`, which is deliberately NOT the read-only
// portal token: a payment page can be pasted into someone else's website, and
// that must never expose the call and message history the portal token unlocks.

const crypto = require('crypto');
const { createCreditCheckout, createCardSetupCheckout, confirmStripeCheckout, CheckoutError } = require('../services/creditCheckout');
const { getEffectiveBilling } = require('../utils/whopConfig');
const { getAncestorPartners } = require('../utils/whopConfig');

const MIN_PAYMENT = 0.5;   // Stripe rejects anything smaller
const MAX_PAYMENT = 10000;

function clientUrl() {
  return (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, '');
}

/**
 * The provider a client deals with, as they know it: the nearest partner above
 * the account that has a brand or its own domain. Everything public about the
 * payment page — the name and logo on it, the domain in the link and the embed,
 * and where Stripe sends the client back — comes from here, so a client of a
 * whitelabel never sees the platform's own brand or domain.
 * Returns { companyName, companyLogo, creditsLabel, baseUrl }.
 */
async function partnerBrandFor(prisma, user) {
  const ancestors = await getAncestorPartners(prisma, user).catch(() => []);
  let brand = null;
  let domain = null;
  for (const a of ancestors) {
    const partner = await prisma.user.findUnique({
      where: { id: a.id },
      select: { companyName: true, companyLogo: true, creditsLabel: true, loginDomain: true },
    });
    if (!brand && (partner?.companyName || partner?.companyLogo)) brand = partner;
    if (!domain && partner?.loginDomain) domain = partner.loginDomain;
    if (brand && domain) break;
  }
  return {
    companyName: brand?.companyName || null,
    companyLogo: brand?.companyLogo || null,
    creditsLabel: brand?.creditsLabel || null,
    baseUrl: domain ? `https://${domain}` : clientUrl(),
  };
}

async function findByToken(prisma, token) {
  if (!token) return null;
  return prisma.user.findFirst({ where: { paymentToken: token } });
}

/**
 * Everything the page renders: who it belongs to, what is owed, whether a card
 * is saved, and the recent usage behind the balance. No email, no history.
 * GET /api/pay/:token
 */
const getBilling = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });

    const { mode } = await getEffectiveBilling(req.prisma, user.id).catch(() => ({ mode: 'platform' }));
    const isStripe = mode === 'own_stripe';

    // Branding comes from the partner above the account, so the page looks like
    // the provider the client actually deals with.
    const brand = await partnerBrandFor(req.prisma, user);

    // Usage behind the balance: the last 30 days of calls and messages.
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [calls, messages] = await Promise.all([
      req.prisma.callLog.aggregate({
        where: { userId: user.id, createdAt: { gte: since } },
        _count: true,
        _sum: { costCharged: true, durationSeconds: true },
      }).catch(() => null),
      req.prisma.chatbotMessage.aggregate({
        where: { userId: user.id, createdAt: { gte: since }, isTest: false },
        _count: true,
        _sum: { costCharged: true },
      }).catch(() => null),
    ]);

    res.json({
      account: {
        name: user.companyName || user.name || 'Tu cuenta',
        creditsLabel: brand?.creditsLabel || user.creditsLabel || 'Créditos',
      },
      brand: { companyName: brand?.companyName || null, companyLogo: brand?.companyLogo || null },
      balance: Math.round(user.vapiCredits * 100) / 100,
      outstanding: user.vapiCredits < 0 ? Math.round(-user.vapiCredits * 100) / 100 : 0,
      hasCard: !!(isStripe ? user.stripePaymentMethodId : user.whopPaymentMethodId),
      // Only the full outstanding balance can be paid, so the emailed usage
      // report always accounts for exactly the amount charged. Nothing owed (or
      // less than Stripe's floor) means there is nothing to pay right now.
      canPay: mode !== 'manual' && user.vapiCredits < 0 && -user.vapiCredits >= MIN_PAYMENT,
      usage: {
        days: 30,
        calls: { count: calls?._count || 0, cost: Math.round((calls?._sum?.costCharged || 0) * 100) / 100, minutes: Math.round((calls?._sum?.durationSeconds || 0) / 60) },
        messages: { count: messages?._count || 0, cost: Math.round((messages?._sum?.costCharged || 0) * 100) / 100 },
      },
      min: MIN_PAYMENT,
      max: MAX_PAYMENT,
    });
  } catch (error) {
    console.error('Payment portal read error:', error.message);
    res.status(500).json({ error: 'Failed to load the payment page' });
  }
};

/**
 * Start a payment for the amount the client chose.
 * POST /api/pay/:token/checkout  Body: { amount }
 */
const startCheckout = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });

    // The amount is the account's whole outstanding balance, worked out here —
    // never taken from the request. Partial payments would not line up with the
    // usage report emailed afterwards.
    const amount = Math.round(-user.vapiCredits * 100) / 100;
    if (!(amount >= MIN_PAYMENT)) {
      return res.status(400).json({ error: 'Esta cuenta no tiene saldo pendiente por pagar.' });
    }
    if (amount > MAX_PAYMENT) {
      return res.status(400).json({ error: `El saldo pendiente supera el máximo de $${MAX_PAYMENT} por pago. Contacta a tu proveedor.` });
    }

    // Send the client back to their provider's domain, not the platform's.
    const { baseUrl } = await partnerBrandFor(req.prisma, user);
    const back = `${baseUrl}/pay/${req.params.token}`;
    const result = await createCreditCheckout(req.prisma, user.id, amount, {
      successUrl: `${back}?pago=ok`,
      cancelUrl: `${back}?pago=cancelado`,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message });
    console.error('Payment portal checkout error:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo iniciar el pago' });
  }
};

/**
 * Save a card from the payment page (no charge), so future balances can be
 * collected without chasing the client.
 * POST /api/pay/:token/save-card
 */
const startCardSetup = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });

    const { baseUrl } = await partnerBrandFor(req.prisma, user);
    const back = `${baseUrl}/pay/${req.params.token}`;
    const result = await createCardSetupCheckout(req.prisma, user.id, 'primary', {
      successUrl: `${back}?tarjeta=ok`,
      cancelUrl: `${back}?tarjeta=cancelado`,
    });
    res.json(result);
  } catch (error) {
    if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message });
    console.error('Payment portal card setup error:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo iniciar el guardado de la tarjeta' });
  }
};

/**
 * The client came back from Stripe: confirm the payment straight away instead of
 * waiting for the webhook, so the balance on the page is already right.
 * POST /api/pay/:token/confirm  Body: { sessionId }
 */
const confirmPayment = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });

    const result = await confirmStripeCheckout(req.prisma, user.id, req.body?.sessionId);
    const fresh = await req.prisma.user.findUnique({ where: { id: user.id }, select: { vapiCredits: true } });
    res.json({ ...result, balance: Math.round((fresh?.vapiCredits ?? 0) * 100) / 100 });
  } catch (error) {
    if (error instanceof CheckoutError) return res.status(error.status).json({ error: error.message });
    console.error('Payment portal confirm error:', error.response?.data || error.message);
    res.status(500).json({ error: 'No se pudo confirmar el pago' });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Admin: hand out (or rotate) an account's payment link
// ──────────────────────────────────────────────────────────────────────────

/** The OWNER may issue a link for anyone; a partner only inside its subtree. */
async function canIssueFor(prisma, requester, target) {
  if (!requester || !target) return false;
  if (requester.role === 'OWNER') return true;
  if (requester.role !== 'AGENCY' && requester.role !== 'WHITELABEL') return false;
  const ancestors = await getAncestorPartners(prisma, target);
  return ancestors.some((a) => a.id === requester.id);
}

function linksFor(token, brand) {
  const url = `${brand.baseUrl}/pay/${token}`;
  // The iframe title is read out by screen readers and shows in dev tools, so it
  // names the provider too — never the platform.
  const title = brand.companyName ? `Pagar · ${brand.companyName}` : 'Pagar';
  return {
    token,
    url,
    // Ready to paste into any site. The height fits the page without scrolling.
    embed: `<iframe src="${url}?embed=1" width="100%" height="620" style="border:0;max-width:520px" title="${title.replace(/"/g, '&quot;')}"></iframe>`,
  };
}

/**
 * GET /api/pay/admin/:userId/link — the current link, if any.
 * POST /api/pay/admin/:userId/link — create it, or rotate it with { rotate: true },
 * which immediately kills the old link and any embed still using it.
 */
const getLink = async (req, res) => {
  try {
    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.params.userId) } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!(await canIssueFor(req.prisma, req.user, target))) {
      return res.status(403).json({ error: 'You cannot issue a payment link for this account.' });
    }
    res.json(target.paymentToken
      ? linksFor(target.paymentToken, await partnerBrandFor(req.prisma, target))
      : { token: null, url: null, embed: null });
  } catch (error) {
    console.error('Payment link read error:', error.message);
    res.status(500).json({ error: 'Failed to read the payment link' });
  }
};

const createLink = async (req, res) => {
  try {
    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.params.userId) } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!(await canIssueFor(req.prisma, req.user, target))) {
      return res.status(403).json({ error: 'You cannot issue a payment link for this account.' });
    }

    let token = target.paymentToken;
    if (!token || req.body?.rotate) {
      token = crypto.randomBytes(24).toString('hex');
      await req.prisma.user.update({ where: { id: target.id }, data: { paymentToken: token } });
    }
    res.json(linksFor(token, await partnerBrandFor(req.prisma, target)));
  } catch (error) {
    console.error('Payment link create error:', error.message);
    res.status(500).json({ error: 'Failed to create the payment link' });
  }
};

module.exports = {
  getBilling,
  startCheckout,
  startCardSetup,
  confirmPayment,
  getLink,
  createLink,
};
