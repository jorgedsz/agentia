/**
 * Get credits for a user
 * GET /api/credits/:userId?
 */
const getCredits = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    const targetUserId = req.params.userId ? parseInt(req.params.userId) : requesterId;

    // Get requester info
    const requester = await req.prisma.user.findUnique({
      where: { id: requesterId }
    });

    // Get target user
    const targetUser = await req.prisma.user.findUnique({
      where: { id: targetUserId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        vapiCredits: true,
        agencyId: true
      }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions
    const canAccess =
      targetUserId === requesterId || // Own credits
      requesterRole === 'OWNER' || // Owner can see all
      (requesterRole === 'AGENCY' && targetUser.agencyId === requesterId); // Agency can see their clients

    if (!canAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json({
      userId: targetUser.id,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.role,
      credits: targetUser.vapiCredits
    });
  } catch (error) {
    console.error('Error getting credits:', error);
    res.status(500).json({ error: 'Failed to get credits' });
  }
};

/**
 * Update credits for a user (add or subtract)
 * POST /api/credits/:userId
 * Body: { amount: number, operation: 'add' | 'subtract' | 'set' }
 */
const updateCredits = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterRole = req.user.role;
    const targetUserId = parseInt(req.params.userId);
    const { amount, operation = 'add' } = req.body;

    if (typeof amount !== 'number' || amount < 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' });
    }

    if (!['add', 'subtract', 'set'].includes(operation)) {
      return res.status(400).json({ error: 'Operation must be add, subtract, or set' });
    }

    // Get target user
    const targetUser = await req.prisma.user.findUnique({
      where: { id: targetUserId }
    });

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check permissions - only OWNER and AGENCY can modify credits
    let canModify = false;

    if (requesterRole === 'OWNER') {
      // Owner can modify anyone's credits
      canModify = true;
    } else if (requesterRole === 'AGENCY') {
      // Agency can only modify their clients' credits
      canModify = targetUser.agencyId === requesterId;
    }

    if (!canModify) {
      return res.status(403).json({ error: 'Access denied. Only OWNER and AGENCY can modify credits.' });
    }

    // Calculate new balance
    let newBalance;
    if (operation === 'add') {
      newBalance = targetUser.vapiCredits + amount;
    } else if (operation === 'subtract') {
      newBalance = targetUser.vapiCredits - amount;
      if (newBalance < 0) {
        return res.status(400).json({ error: 'Insufficient credits. Cannot go below 0.' });
      }
    } else {
      newBalance = amount;
    }

    // Update credits
    const updatedUser = await req.prisma.user.update({
      where: { id: targetUserId },
      data: { vapiCredits: newBalance },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        vapiCredits: true
      }
    });

    res.json({
      message: `Credits ${operation === 'set' ? 'set to' : operation === 'add' ? 'added' : 'subtracted'} successfully`,
      previousBalance: targetUser.vapiCredits,
      newBalance: updatedUser.vapiCredits,
      user: updatedUser
    });
  } catch (error) {
    console.error('Error updating credits:', error);
    res.status(500).json({ error: 'Failed to update credits' });
  }
};

/**
 * Get credits for all users (for OWNER) or clients (for AGENCY)
 * GET /api/credits
 */
const listCredits = async (req, res) => {
  try {
    const requesterId = req.user.id;
    const requesterRole = req.user.role;

    let users;

    if (requesterRole === 'OWNER') {
      // Owner sees all users
      users = await req.prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          vapiCredits: true,
          agencyId: true,
          agency: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });
    } else if (requesterRole === 'AGENCY') {
      // Agency sees themselves and their clients
      users = await req.prisma.user.findMany({
        where: {
          OR: [
            { id: requesterId },
            { agencyId: requesterId }
          ]
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          vapiCredits: true,
          agencyId: true
        },
        orderBy: { createdAt: 'desc' }
      });
    } else {
      // Client only sees themselves
      users = await req.prisma.user.findMany({
        where: { id: requesterId },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          vapiCredits: true
        }
      });
    }

    res.json({ users });
  } catch (error) {
    console.error('Error listing credits:', error);
    res.status(500).json({ error: 'Failed to list credits' });
  }
};

/**
 * Purchase credits via Whop checkout (variable amount).
 * POST /api/credits/purchase
 * Body: { amount: number } — any value within [MIN, MAX]; $1 = 1 credit.
 *
 * Creates a one-time Whop plan inline for the requested amount, then a
 * checkout configuration for that plan. Auto-bootstraps the credits
 * Product + Whop product on first purchase so no manual sync is required.
 */
const CREDITS_MIN_AMOUNT = 1;
const CREDITS_MAX_AMOUNT = 10000;

const purchaseCredits = async (req, res) => {
  try {
    const raw = req.body?.amount ?? req.body?.tier; // accept legacy `tier` key
    const amount = Math.round(parseFloat(raw) * 100) / 100;
    if (!Number.isFinite(amount) || amount < CREDITS_MIN_AMOUNT || amount > CREDITS_MAX_AMOUNT) {
      return res.status(400).json({ error: `Amount must be between $${CREDITS_MIN_AMOUNT} and $${CREDITS_MAX_AMOUNT}.` });
    }

    if (!process.env.WHOP_API_KEY) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }

    const whopService = require('../services/whopService');

    // Ensure the credits Product row + linked Whop product exist.
    let creditsProduct = await req.prisma.product.findUnique({ where: { slug: 'credits' } });
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
    if (!creditsProduct.whopProductId) {
      const whopProduct = await whopService.createProduct('Credits', 'VAPI call credits');
      creditsProduct = await req.prisma.product.update({
        where: { id: creditsProduct.id },
        data: { whopProductId: whopProduct.id },
      });
    }

    // Create a one-time Whop plan for this exact amount, then the checkout.
    const plan = await whopService.createPlan(creditsProduct.whopProductId, {
      price: amount,
      billingCycle: 'lifetime',
      name: `Credits ($${amount})`,
    });

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await whopService.createCheckoutSession({
      planId: plan.id,
      metadata: {
        userId: String(req.user.id),
        type: 'credits',
        credits: String(amount),
      },
      redirectUrl: `${clientUrl}/credits?checkout=success`,
    });

    // Record a PENDING purchase keyed by the unique one-time plan id. This is the
    // reliable link back to the buyer: Whop doesn't propagate checkout metadata to
    // webhooks and the payer's email may differ from their app account, but the
    // plan id we just created always appears in the payment webhook as data.plan.id.
    await req.prisma.creditPurchase.create({
      data: {
        userId: req.user.id,
        amount,
        credits: amount,
        status: 'pending',
        whopPlanId: plan.id,
      },
    }).catch((err) => console.error('[Credits] Failed to create pending purchase:', err.message));

    res.json({
      checkoutId: session.id,
      planId: plan.id,
      purchaseUrl: session.purchase_url,
      amount,
    });
  } catch (error) {
    console.error('Error purchasing credits:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

// ──────────────────────────────────────────────────────────────────────────
// Auto-recharge (Whop off-session charges)
// ──────────────────────────────────────────────────────────────────────────

const AUTO_RECHARGE_COOLDOWN_MS = 5 * 60 * 1000; // min gap between auto charges
const AUTO_RECHARGE_DAILY_CAP = 5;               // max auto charges per 24h (safety)

/**
 * Charge a user's saved Whop card off-session and record a PENDING CreditPurchase
 * keyed by the inline one-time plan id. The existing payment.succeeded webhook
 * credits the balance via that plan id (no reliance on Whop metadata).
 * Returns the Whop payment object. Throws if the user has no saved card.
 */
async function performOffSessionCharge(prisma, user, amount, kind) {
  if (!user.whopMemberId || !user.whopPaymentMethodId) {
    const err = new Error('No saved payment method');
    err.code = 'NO_CARD';
    throw err;
  }

  const whopService = require('../services/whopService');
  const payment = await whopService.chargeOffSession({
    memberId: user.whopMemberId,
    paymentMethodId: user.whopPaymentMethodId,
    amount,
    metadata: { userId: String(user.id), type: 'credits', kind, credits: String(amount) },
  });

  const planId = payment.plan?.id || payment.plan_id || null;
  await prisma.creditPurchase.create({
    data: {
      userId: user.id,
      amount,
      credits: amount,
      status: 'pending',
      kind,
      whopPlanId: planId,
    },
  }).catch((e) => console.error('[Credits] Failed to record pending off-session purchase:', e.message));

  return payment;
}

/**
 * Evaluate and fire auto-recharge for a user. Safe to call fire-and-forget after
 * billing a call. Applies all guardrails (enabled, threshold, cooldown, daily
 * cap, pending lock) and silently no-ops when any fails. Never throws.
 */
async function triggerAutoRecharge(prisma, userId) {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    if (!user.autoRechargeEnabled) return;
    if (!user.whopMemberId || !user.whopPaymentMethodId) return;
    const threshold = user.autoRechargeThreshold;
    const amount = user.autoRechargeAmount;
    if (!(threshold > 0) || !(amount > 0)) return;
    if (user.vapiCredits >= threshold) return;

    // Cooldown — avoid rapid repeat charges while a charge settles.
    if (user.autoRechargeLastAt && (Date.now() - new Date(user.autoRechargeLastAt).getTime()) < AUTO_RECHARGE_COOLDOWN_MS) {
      return;
    }

    // Lock — don't fire if a previous auto charge is still pending.
    const pending = await prisma.creditPurchase.findFirst({
      where: { userId, kind: 'auto_recharge', status: 'pending' },
    });
    if (pending) return;

    // Daily cap — bound the number of auto charges in any 24h window.
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.creditPurchase.count({
      where: { userId, kind: 'auto_recharge', createdAt: { gte: since } },
    });
    if (recentCount >= AUTO_RECHARGE_DAILY_CAP) {
      console.warn(`[Auto-Recharge] Daily cap reached for user ${userId}, skipping`);
      return;
    }

    // Stamp the attempt time first so the cooldown/lock holds even if the call is slow.
    await prisma.user.update({ where: { id: userId }, data: { autoRechargeLastAt: new Date() } });

    await performOffSessionCharge(prisma, user, amount, 'auto_recharge');
    console.log(`[Auto-Recharge] Charged user ${userId} $${amount} (balance was $${user.vapiCredits.toFixed(2)} < $${threshold})`);
  } catch (err) {
    console.error(`[Auto-Recharge] Failed for user ${userId}:`, err.response?.data || err.message);
  }
}

/**
 * Create a setup-mode Whop checkout so the customer can vault a card without
 * being charged. Returns { sessionId } for the WhopCheckoutEmbed.
 * POST /api/credits/setup-card
 */
const setupCard = async (req, res) => {
  try {
    if (!process.env.WHOP_API_KEY) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }
    const whopService = require('../services/whopService');
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await whopService.createSetupCheckout({
      metadata: { userId: String(req.user.id), type: 'setup' },
      redirectUrl: `${clientUrl}/credits?setup=success`,
    });
    res.json({ sessionId: session.id, purchaseUrl: session.purchase_url });
  } catch (error) {
    console.error('Error creating setup checkout:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to start card setup' });
  }
};

/**
 * Get the requester's auto-recharge config and whether a card is on file.
 * GET /api/credits/auto-recharge
 */
const getAutoRecharge = async (req, res) => {
  try {
    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        autoRechargeEnabled: true,
        autoRechargeThreshold: true,
        autoRechargeAmount: true,
        whopPaymentMethodId: true,
      },
    });
    res.json({
      enabled: !!user?.autoRechargeEnabled,
      threshold: user?.autoRechargeThreshold ?? null,
      amount: user?.autoRechargeAmount ?? null,
      hasCard: !!user?.whopPaymentMethodId,
      min: CREDITS_MIN_AMOUNT,
      max: CREDITS_MAX_AMOUNT,
    });
  } catch (error) {
    console.error('Error getting auto-recharge config:', error.message);
    res.status(500).json({ error: 'Failed to load auto-recharge settings' });
  }
};

/**
 * Update the requester's own auto-recharge config (self-service).
 * PUT /api/credits/auto-recharge
 * Body: { enabled: boolean, threshold: number, amount: number }
 */
const updateAutoRecharge = async (req, res) => {
  try {
    const { enabled, threshold, amount } = req.body;

    const user = await req.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { whopPaymentMethodId: true },
    });

    if (enabled) {
      if (!user?.whopPaymentMethodId) {
        return res.status(400).json({ error: 'Add a payment method before enabling auto-recharge.' });
      }
      const t = parseFloat(threshold);
      const a = Math.round(parseFloat(amount) * 100) / 100;
      if (!Number.isFinite(t) || t < 0) {
        return res.status(400).json({ error: 'Threshold must be 0 or greater.' });
      }
      if (!Number.isFinite(a) || a < CREDITS_MIN_AMOUNT || a > CREDITS_MAX_AMOUNT) {
        return res.status(400).json({ error: `Recharge amount must be between $${CREDITS_MIN_AMOUNT} and $${CREDITS_MAX_AMOUNT}.` });
      }
      await req.prisma.user.update({
        where: { id: req.user.id },
        data: {
          autoRechargeEnabled: true,
          autoRechargeThreshold: t,
          autoRechargeAmount: a,
          autoRechargeFailCount: 0, // re-enabling clears prior failures
        },
      });
    } else {
      await req.prisma.user.update({
        where: { id: req.user.id },
        data: { autoRechargeEnabled: false },
      });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error updating auto-recharge config:', error.message);
    res.status(500).json({ error: 'Failed to save auto-recharge settings' });
  }
};

/**
 * One-click manual recharge using the saved card (off-session).
 * POST /api/credits/recharge-now
 * Body: { amount: number }
 */
const rechargeNow = async (req, res) => {
  try {
    if (!process.env.WHOP_API_KEY) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }
    const amount = Math.round(parseFloat(req.body?.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < CREDITS_MIN_AMOUNT || amount > CREDITS_MAX_AMOUNT) {
      return res.status(400).json({ error: `Amount must be between $${CREDITS_MIN_AMOUNT} and $${CREDITS_MAX_AMOUNT}.` });
    }

    const user = await req.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.whopMemberId || !user?.whopPaymentMethodId) {
      return res.status(400).json({ error: 'No saved payment method. Add a card first.' });
    }

    await performOffSessionCharge(req.prisma, user, amount, 'manual_card');
    // Whop settles asynchronously; the webhook adds the credits.
    res.json({ success: true, amount, message: 'Payment processing. Credits will appear shortly.' });
  } catch (error) {
    console.error('Error in manual recharge:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to charge saved card' });
  }
};

module.exports = {
  getCredits,
  updateCredits,
  listCredits,
  purchaseCredits,
  setupCard,
  getAutoRecharge,
  updateAutoRecharge,
  rechargeNow,
  triggerAutoRecharge,
  performOffSessionCharge,
};
