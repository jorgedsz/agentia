// The public payment page: a per-client link (and embeddable iframe) where the
// client sees what they owe, pays it, saves a card and reviews their usage —
// without an account or a login.
//
// It is addressed by `paymentToken`, which is deliberately NOT the read-only
// portal token: a payment page can be pasted into someone else's website, and
// that must never expose the call and message history the portal token unlocks.

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { createCreditCheckout, createCardSetupCheckout, confirmStripeCheckout, CheckoutError } = require('../services/creditCheckout');
const { getEffectiveBilling } = require('../utils/whopConfig');
const { getAncestorPartners } = require('../utils/whopConfig');
const budgets = require('../services/budgets');
const budgetRequests = require('../services/budgetRequests');
const { notifyAll } = require('../services/notifications');

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
  // The wallet is the same page plus the account's budgets and the money asked
  // for them, for a site that wants all of it in one place.
  const walletUrl = `${brand.baseUrl}/wallet/${token}`;
  const walletTitle = brand.companyName ? `Saldo · ${brand.companyName}` : 'Saldo';
  return {
    token,
    url,
    // Ready to paste into any site. The height fits the page without scrolling.
    embed: `<iframe src="${url}?embed=1" width="100%" height="620" style="border:0;max-width:520px" title="${title.replace(/"/g, '&quot;')}"></iframe>`,
    walletUrl,
    walletEmbed: `<iframe src="${walletUrl}?embed=1" width="100%" height="820" style="border:0;max-width:640px" title="${walletTitle.replace(/"/g, '&quot;')}"></iframe>`,
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

// ──────────────────────────────────────────────────────────────────────────
// Wallet — the same link, showing everything at once: what is owed, the
// balance, a top-up, the budgets and the money asked for them.
// ──────────────────────────────────────────────────────────────────────────

const round = (n) => Math.round((n || 0) * 100) / 100;

async function walletState(prisma, user) {
  const enabled = await budgets.budgetsEnabledFor(prisma, user).catch(() => false);
  if (!enabled) return { budgetsEnabled: false, budgets: [], requests: [] };
  return {
    budgetsEnabled: true,
    budgets: (await budgets.listBudgets(prisma, user.id)).map(({ name, slug, balance }) => ({ name, slug, balance: round(balance) })),
    requests: await budgetRequests.listFor(prisma, user.id, { limit: 20 }),
  };
}

/**
 * GET /api/pay/:token/wallet — everything the page shows. The same token as
 * the payment page: whoever holds the link already sees the balance and what
 * is owed, and now the budgets carved out of it too.
 */
const getWallet = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });

    const { mode } = await getEffectiveBilling(req.prisma, user.id).catch(() => ({ mode: 'platform' }));
    const brand = await partnerBrandFor(req.prisma, user);
    const owed = user.vapiCredits < 0 ? round(-user.vapiCredits) : 0;

    res.json({
      account: {
        name: user.companyName || user.name || 'Tu cuenta',
        creditsLabel: brand?.creditsLabel || user.creditsLabel || 'Créditos',
      },
      brand: { companyName: brand?.companyName || null, companyLogo: brand?.companyLogo || null },
      balance: round(user.vapiCredits),
      outstanding: owed,
      canPay: mode !== 'manual' && owed >= MIN_PAYMENT,
      // Loading credit by choice, as opposed to paying off what is owed.
      canTopUp: mode !== 'manual',
      hasCard: !!(mode === 'own_stripe' ? user.stripePaymentMethodId : user.whopPaymentMethodId),
      // Approving from here is off unless the partner set a key for it.
      canApprove: !!user.budgetApprovalKey,
      min: MIN_PAYMENT,
      max: MAX_PAYMENT,
      ...(await walletState(req.prisma, user)),
    });
  } catch (error) {
    console.error('Wallet read error:', error.message);
    res.status(500).json({ error: 'Failed to load the page' });
  }
};

/**
 * POST /api/pay/:token/top-up  Body: { amount }
 * Load credit for an amount the client chooses, as opposed to paying off the
 * whole outstanding balance.
 */
const startTopUp = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });

    const amount = round(parseFloat(req.body?.amount));
    if (!Number.isFinite(amount) || amount < MIN_PAYMENT || amount > MAX_PAYMENT) {
      return res.status(400).json({ error: `Indica un monto entre $${MIN_PAYMENT} y $${MAX_PAYMENT}.` });
    }

    const { baseUrl } = await partnerBrandFor(req.prisma, user);
    const back = `${baseUrl}/wallet/${req.params.token}`;
    const result = await createCreditCheckout(req.prisma, user.id, amount, {
      successUrl: `${back}?pago=ok`,
      cancelUrl: `${back}?pago=cancelado`,
    });
    res.json({ url: result.url, sessionId: result.id || null });
  } catch (error) {
    if (error instanceof CheckoutError) return res.status(error.status || 400).json({ error: error.message });
    console.error('Wallet top-up error:', error.message);
    res.status(500).json({ error: 'No se pudo iniciar la carga de saldo' });
  }
};

/**
 * POST /api/pay/:token/requests  Body: { slug, amount, description?, reference? }
 * Ask for money for one of the account's budgets. Nothing moves until someone
 * approves — here with the approval key, or in the panel with a session.
 */
const createWalletRequest = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });
    if (!(await budgets.budgetsEnabledFor(req.prisma, user))) {
      return res.status(403).json({ error: 'Los presupuestos no están activos para esta cuenta.' });
    }

    const { request, duplicate } = await budgetRequests.create(req.prisma, {
      userId: user.id,
      slug: req.body?.slug,
      amount: req.body?.amount,
      description: req.body?.description,
      reference: req.body?.reference,
      requestedBy: 'panel',
    });

    if (!duplicate) {
      const partners = await getAncestorPartners(req.prisma, user).catch(() => []);
      await notifyAll(req.prisma, [user.id, ...partners.map((p) => p.id)], {
        kind: 'budget_request',
        title: `Solicitud de $${request.amount.toFixed(2)} para ${request.budget?.name || req.body?.slug}`,
        body: `${user.companyName || user.name || user.email} pide saldo para su presupuesto${request.description ? `: ${request.description}` : '.'}`,
        link: '/dashboard/budgets?tab=requests',
        data: { requestId: request.id, accountId: user.id, amount: request.amount },
      });
    }

    res.status(duplicate ? 200 : 201).json({ success: true, duplicate, request });
  } catch (error) {
    if (error instanceof budgetRequests.RequestError) return res.status(error.status).json({ error: error.message });
    console.error('Wallet request error:', error.message);
    res.status(500).json({ error: 'No se pudo crear la solicitud' });
  }
};

/**
 * POST /api/pay/:token/requests/:id/approve  Body: { key, amount?, note? }
 * Approving without a login, proving it with the approval key the partner set.
 * The key stands for the account itself, which may approve its own requests,
 * so the money still only moves from that account's own balance.
 */
const approveWalletRequest = async (req, res) => {
  try {
    const user = await findByToken(req.prisma, req.params.token);
    if (!user) return res.status(404).json({ error: 'Payment page not found' });
    if (!user.budgetApprovalKey) {
      return res.status(403).json({ error: 'Aprobar desde aquí no está activo. Tu proveedor debe configurar una clave de aprobación.' });
    }

    const key = (req.body?.key || '').toString();
    if (!key || !(await bcrypt.compare(key, user.budgetApprovalKey))) {
      return res.status(401).json({ error: 'Clave de aprobación incorrecta.' });
    }

    const result = await budgetRequests.approve(
      req.prisma,
      { id: user.id, role: user.role },
      req.params.id,
      { amount: req.body?.amount, note: req.body?.note },
    );

    const partners = await getAncestorPartners(req.prisma, user).catch(() => []);
    await notifyAll(req.prisma, [user.id, ...partners.map((p) => p.id)], {
      kind: 'budget_request_approved',
      title: `Aprobada: $${(result.request.approvedAmount ?? result.request.amount).toFixed(2)} para ${result.request.budget?.name}`,
      body: 'Aprobada desde la página de saldo con la clave de aprobación.',
      link: '/dashboard/budgets',
      data: { requestId: result.request.id, amount: result.request.approvedAmount },
    });

    res.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof budgetRequests.RequestError) return res.status(error.status).json({ error: error.message });
    console.error('Wallet approve error:', error.message);
    res.status(500).json({ error: 'No se pudo aprobar la solicitud' });
  }
};

/**
 * PUT /api/pay/admin/:userId/approval-key  Body: { key }
 * Set or clear the key that allows approving from the page. Only whoever may
 * issue the link may set it — the OWNER or a partner above the account.
 */
const setApprovalKey = async (req, res) => {
  try {
    const target = await req.prisma.user.findUnique({ where: { id: parseInt(req.params.userId) } });
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (!(await canIssueFor(req.prisma, req.user, target))) {
      return res.status(403).json({ error: 'You cannot set the approval key for this account.' });
    }

    const key = (req.body?.key || '').toString().trim();
    if (key && key.length < 6) {
      return res.status(400).json({ error: 'La clave debe tener al menos 6 caracteres.' });
    }

    await req.prisma.user.update({
      where: { id: target.id },
      data: { budgetApprovalKey: key ? await bcrypt.hash(key, 10) : null },
    });
    res.json({ approvalKeySet: !!key });
  } catch (error) {
    console.error('Approval key error:', error.message);
    res.status(500).json({ error: 'Failed to set the approval key' });
  }
};

module.exports = {
  getBilling,
  startCheckout,
  startCardSetup,
  confirmPayment,
  getLink,
  createLink,
  getWallet,
  startTopUp,
  createWalletRequest,
  approveWalletRequest,
  setApprovalKey,
};

