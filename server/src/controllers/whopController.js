const whopService = require('../services/whopService');

// Credit tiers available for purchase ($1 = 1 credit)
const CREDIT_TIERS = [1, 10, 25, 50, 100];
const OWNER_ONLY_TIERS = [1]; // Testing tiers, hidden from non-OWNER users

// ── Helpers (same as paymentController) ──

const SLUG_TO_FLAG = {
  chatbots: 'chatbotsEnabled',
  voicebots: 'voiceAgentsEnabled',
  crm: 'crmEnabled',
  'agent-generator': 'agentGeneratorEnabled',
};

async function syncUserFlags(prisma, userId) {
  const activeProducts = await prisma.userProduct.findMany({
    where: { userId, status: 'active' },
    include: { product: { select: { slug: true } } },
  });
  const activeSlugs = activeProducts.map((up) => up.product.slug);

  const flags = {};
  for (const [slug, flag] of Object.entries(SLUG_TO_FLAG)) {
    flags[flag] = activeSlugs.includes(slug);
  }

  await prisma.user.update({ where: { id: userId }, data: flags });
}

function getPriceForCycle(product, cycle) {
  switch (cycle) {
    case 'monthly': return product.monthlyPrice;
    case 'quarterly': return product.quarterlyPrice;
    case 'annual': return product.annualPrice;
    case 'lifetime': return product.lifetimePrice;
    default: return product.monthlyPrice;
  }
}

function calculateDiscount(count) {
  return count >= 3 ? 5 : 0;
}

// ── POST /api/whop/create-checkout ──

const createCheckout = async (req, res) => {
  try {
    const { productId, billingCycle, type, amount } = req.body;
    const userId = req.user.id;

    if (type === 'credits') {
      // Credits purchase — predefined tiers
      const tier = parseInt(amount);
      if (!tier || !CREDIT_TIERS.includes(tier)) {
        return res.status(400).json({ error: `Invalid credit tier. Available: ${CREDIT_TIERS.join(', ')}` });
      }

      // Look up the credits product in DB (slug = "credits")
      const creditsProduct = await req.prisma.product.findUnique({ where: { slug: 'credits' } });
      if (!creditsProduct || !creditsProduct.whopPlanIds) {
        return res.status(400).json({ error: 'Credit plans not synced with Whop. Ask admin to sync products.' });
      }

      let planMap;
      try { planMap = JSON.parse(creditsProduct.whopPlanIds); } catch { planMap = {}; }

      const planId = planMap[String(tier)];
      if (!planId) {
        return res.status(400).json({ error: `No Whop plan for $${tier} credit tier. Sync products first.` });
      }

      const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
      const session = await whopService.createCheckoutSession({
        planId,
        metadata: {
          userId: String(userId),
          type: 'credits',
          credits: String(tier),
        },
        redirectUrl: `${clientUrl}/credits?checkout=success`,
      });

      return res.json({
        checkoutId: session.id,
        planId,
        purchaseUrl: session.purchase_url,
      });
    }

    // Subscription purchase
    if (!productId) {
      return res.status(400).json({ error: 'productId is required' });
    }

    const cycle = billingCycle || 'monthly';
    const product = await req.prisma.product.findUnique({ where: { id: parseInt(productId) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (!product.isActive) return res.status(400).json({ error: 'Product is not active' });

    // Check if already subscribed
    const existing = await req.prisma.userProduct.findUnique({
      where: { userId_productId: { userId, productId: product.id } },
    });
    if (existing && existing.status === 'active') {
      return res.status(400).json({ error: 'You already have an active subscription for this product' });
    }

    // Get the Whop plan ID from the product
    if (!product.whopPlanIds) {
      return res.status(400).json({ error: 'Product not synced with Whop. Ask admin to sync products.' });
    }

    let planMap;
    try {
      planMap = JSON.parse(product.whopPlanIds);
    } catch {
      return res.status(500).json({ error: 'Invalid Whop plan configuration for this product' });
    }

    const planId = planMap[cycle];
    if (!planId) {
      return res.status(400).json({ error: `No Whop plan configured for billing cycle: ${cycle}` });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await whopService.createCheckoutSession({
      planId,
      metadata: {
        userId: String(userId),
        productId: String(product.id),
        billingCycle: cycle,
        type: 'subscription',
      },
      redirectUrl: `${clientUrl}/payments?checkout=success`,
    });

    res.json({
      checkoutId: session.id,
      planId,
      purchaseUrl: session.purchase_url,
    });
  } catch (err) {
    console.error('createCheckout error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

// ── POST /api/whop/webhook ──

const handleWebhook = async (req, res) => {
  try {
    // req.body is raw Buffer because of express.raw() middleware on this route
    const rawBody = req.body.toString('utf8');
    const headers = {
      'webhook-id': req.headers['webhook-id'],
      'webhook-timestamp': req.headers['webhook-timestamp'],
      'webhook-signature': req.headers['webhook-signature'],
    };

    let event;
    try {
      event = whopService.verifyWebhook(rawBody, headers);
    } catch (err) {
      console.error('Webhook verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    // Parse if string
    if (typeof event === 'string') {
      event = JSON.parse(event);
    }

    const eventType = event.type;
    const eventData = event.data;
    const metadata = eventData?.metadata || {};

    console.log(`[Whop Webhook] Event: ${eventType}`, { metadata });

    switch (eventType) {
      case 'payment.succeeded':
        await handlePaymentSucceeded(req.prisma, eventData, metadata);
        break;

      case 'membership.activated':
        await handleMembershipActivated(req.prisma, eventData, metadata);
        break;

      case 'membership.deactivated':
        await handleMembershipDeactivated(req.prisma, eventData);
        break;

      default:
        console.log(`[Whop Webhook] Unhandled event type: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook handler error:', err);
    res.status(200).json({ received: true }); // Always return 200 to prevent retries
  }
};

async function handlePaymentSucceeded(prisma, data, metadata) {
  const userId = metadata.userId ? parseInt(metadata.userId) : null;
  if (!userId) {
    console.error('[Whop Webhook] payment.succeeded missing userId in metadata');
    return;
  }

  const type = metadata.type; // 'subscription' or 'credits'
  const paymentId = data.id;

  // Update whopCustomerId if available
  if (data.user?.id) {
    await prisma.user.update({
      where: { id: userId },
      data: { whopCustomerId: data.user.id },
    }).catch(() => {}); // ignore if user not found
  }

  if (type === 'credits') {
    const credits = parseFloat(metadata.credits) || 0;
    if (credits <= 0) return;

    // Add credits to user balance
    await prisma.user.update({
      where: { id: userId },
      data: { vapiCredits: { increment: credits } },
    });

    // Create credit purchase record
    await prisma.creditPurchase.create({
      data: {
        userId,
        amount: credits, // USD = credits for now
        credits,
        status: 'completed',
        whopPaymentId: paymentId,
        rawPayload: JSON.stringify(data),
      },
    });

    console.log(`[Whop Webhook] Added ${credits} credits to user ${userId}`);
  } else if (type === 'subscription') {
    const productId = metadata.productId ? parseInt(metadata.productId) : null;
    const billingCycle = metadata.billingCycle || 'monthly';

    if (!productId) {
      console.error('[Whop Webhook] payment.succeeded subscription missing productId');
      return;
    }

    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return;

    const membershipId = data.membership_id || null;

    // Calculate pricing with discount
    const existingProducts = await prisma.userProduct.findMany({
      where: { userId, status: 'active' },
      select: { productId: true },
    });
    const existingIds = new Set(existingProducts.map((p) => p.productId));
    existingIds.add(productId);
    const discountPercent = calculateDiscount(existingIds.size);
    const basePrice = getPriceForCycle(product, billingCycle);
    const finalAmount = basePrice - (basePrice * discountPercent) / 100;

    // Upsert user product
    await prisma.userProduct.upsert({
      where: { userId_productId: { userId, productId } },
      create: {
        userId,
        productId,
        billingCycle,
        amount: finalAmount,
        discountApplied: discountPercent,
        status: 'active',
        whopMembershipId: membershipId,
        whopPaymentId: paymentId,
        assignedBy: null,
      },
      update: {
        status: 'active',
        billingCycle,
        amount: finalAmount,
        discountApplied: discountPercent,
        whopMembershipId: membershipId,
        whopPaymentId: paymentId,
      },
    });

    // Create transaction record
    const userProduct = await prisma.userProduct.findUnique({
      where: { userId_productId: { userId, productId } },
    });

    await prisma.transaction.create({
      data: {
        userId,
        userProductId: userProduct?.id || null,
        type: billingCycle === 'lifetime' ? 'one_time' : 'subscription_payment',
        amount: finalAmount,
        status: 'completed',
        rawPayload: JSON.stringify(data),
      },
    });

    // Sync feature flags
    await syncUserFlags(prisma, userId);

    console.log(`[Whop Webhook] Activated product ${productId} for user ${userId}`);
  }
}

async function handleMembershipActivated(prisma, data, metadata) {
  const membershipId = data.id;
  if (!membershipId) return;

  // Try to find the user product by whopMembershipId
  const userProduct = await prisma.userProduct.findFirst({
    where: { whopMembershipId: membershipId },
  });

  if (userProduct) {
    await prisma.userProduct.update({
      where: { id: userProduct.id },
      data: { status: 'active' },
    });
    await syncUserFlags(prisma, userProduct.userId);
    console.log(`[Whop Webhook] Membership ${membershipId} activated`);
  }
}

async function handleMembershipDeactivated(prisma, data) {
  const membershipId = data.id;
  if (!membershipId) return;

  const userProduct = await prisma.userProduct.findFirst({
    where: { whopMembershipId: membershipId },
  });

  if (userProduct) {
    await prisma.userProduct.update({
      where: { id: userProduct.id },
      data: { status: 'cancelled' },
    });
    await syncUserFlags(prisma, userProduct.userId);
    console.log(`[Whop Webhook] Membership ${membershipId} deactivated for user ${userProduct.userId}`);
  }
}

// ── POST /api/whop/sync-products ──

const syncProducts = async (req, res) => {
  try {
    const products = await req.prisma.product.findMany({ where: { isActive: true } });
    const results = [];

    for (const product of products) {
      let whopProductId = product.whopProductId;

      // Create Whop product if not yet linked
      if (!whopProductId) {
        const whopProduct = await whopService.createProduct(product.name, product.description);
        whopProductId = whopProduct.id;
        await req.prisma.product.update({
          where: { id: product.id },
          data: { whopProductId },
        });
      }

      // Create plans for each billing cycle that has a price > 0
      const existingPlanMap = product.whopPlanIds ? JSON.parse(product.whopPlanIds) : {};
      const cycles = [
        { key: 'monthly', price: product.monthlyPrice },
        { key: 'quarterly', price: product.quarterlyPrice },
        { key: 'annual', price: product.annualPrice },
        { key: 'lifetime', price: product.lifetimePrice },
      ];

      for (const { key, price } of cycles) {
        if (price > 0 && !existingPlanMap[key]) {
          const plan = await whopService.createPlan(whopProductId, {
            price,
            billingCycle: key,
            name: `${product.name} - ${key}`,
          });
          existingPlanMap[key] = plan.id;
        }
      }

      // Save updated plan IDs
      await req.prisma.product.update({
        where: { id: product.id },
        data: { whopPlanIds: JSON.stringify(existingPlanMap) },
      });

      results.push({
        productId: product.id,
        name: product.name,
        whopProductId,
        whopPlanIds: existingPlanMap,
      });
    }

    // ── Sync credit tier plans ──
    let creditsProduct = await req.prisma.product.findUnique({ where: { slug: 'credits' } });

    // Auto-create the credits product if it doesn't exist
    if (!creditsProduct) {
      creditsProduct = await req.prisma.product.create({
        data: {
          name: 'Credits',
          slug: 'credits',
          description: 'VAPI call credits',
          isActive: true,
          sortOrder: 999,
        },
      });
    }

    let creditsWhopProductId = creditsProduct.whopProductId;
    if (!creditsWhopProductId) {
      const whopProduct = await whopService.createProduct('Credits', 'VAPI call credits');
      creditsWhopProductId = whopProduct.id;
      await req.prisma.product.update({
        where: { id: creditsProduct.id },
        data: { whopProductId: creditsWhopProductId },
      });
    }

    const creditsPlanMap = creditsProduct.whopPlanIds ? JSON.parse(creditsProduct.whopPlanIds) : {};
    for (const tier of CREDIT_TIERS) {
      if (!creditsPlanMap[String(tier)]) {
        const plan = await whopService.createPlan(creditsWhopProductId, {
          price: tier,
          billingCycle: 'lifetime', // one-time purchase
          name: `${tier} Credits ($${tier})`,
        });
        creditsPlanMap[String(tier)] = plan.id;
      }
    }

    await req.prisma.product.update({
      where: { id: creditsProduct.id },
      data: { whopPlanIds: JSON.stringify(creditsPlanMap) },
    });

    results.push({
      productId: creditsProduct.id,
      name: 'Credits (tiers)',
      whopProductId: creditsWhopProductId,
      whopPlanIds: creditsPlanMap,
    });

    res.json({ synced: results });
  } catch (err) {
    console.error('syncProducts error:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to sync products with Whop' });
  }
};

// ── GET /api/whop/membership-status ──

const getMembershipStatus = async (req, res) => {
  try {
    const userId = req.user.id;
    const userProducts = await req.prisma.userProduct.findMany({
      where: { userId },
      include: { product: true },
    });

    const statuses = [];
    for (const up of userProducts) {
      let whopStatus = null;
      if (up.whopMembershipId) {
        try {
          const membership = await whopService.getMembership(up.whopMembershipId);
          whopStatus = membership.status;
        } catch {
          whopStatus = 'unknown';
        }
      }

      statuses.push({
        productId: up.productId,
        productName: up.product.name,
        status: up.status,
        billingCycle: up.billingCycle,
        whopMembershipId: up.whopMembershipId,
        whopStatus,
      });
    }

    res.json({ memberships: statuses });
  } catch (err) {
    console.error('getMembershipStatus error:', err);
    res.status(500).json({ error: 'Failed to get membership status' });
  }
};

// ── GET /api/whop/credit-tiers ──

const getCreditTiers = async (req, res) => {
  try {
    const creditsProduct = await req.prisma.product.findUnique({ where: { slug: 'credits' } });
    const planMap = creditsProduct?.whopPlanIds ? JSON.parse(creditsProduct.whopPlanIds) : {};
    const isOwner = req.user.role === 'OWNER';

    const tiers = CREDIT_TIERS
      .filter((amount) => isOwner || !OWNER_ONLY_TIERS.includes(amount))
      .map((amount) => ({
        amount,
        credits: amount,
        planId: planMap[String(amount)] || null,
        available: !!planMap[String(amount)],
        testOnly: OWNER_ONLY_TIERS.includes(amount),
      }));

    res.json({ tiers });
  } catch (err) {
    console.error('getCreditTiers error:', err);
    res.status(500).json({ error: 'Failed to get credit tiers' });
  }
};

module.exports = {
  createCheckout,
  handleWebhook,
  syncProducts,
  getMembershipStatus,
  getCreditTiers,
};
