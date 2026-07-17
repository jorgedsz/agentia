const { AUTO_RECHARGE_MAX_FAILS } = require('../utils/autoRecharge');
const { getWhopConfigForUser, getEffectiveBilling } = require('../utils/whopConfig');

const MANUAL_BILLING_MSG = 'Tu proveedor gestiona el saldo de tu cuenta. Contáctalo para recargar créditos.';

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

    // Route to the user's partner Whop (LM Consulting, etc.) when configured, so
    // the money lands in the partner's account; otherwise the platform's global Whop.
    const whop = await getWhopConfigForUser(req.prisma, req.user.id);
    if (whop.mode === 'manual') {
      return res.status(403).json({ error: MANUAL_BILLING_MSG });
    }
    if (!whop.isConfigured) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }

    const whopService = require('../services/whopService');

    // Resolve the "Credits" product for this billing account. Partners keep their
    // own credits product in their own Whop company (cached on the partner user);
    // the platform uses the shared Product row.
    let creditsProductId;
    if (whop.source === 'partner') {
      creditsProductId = whop.partner.whopCreditsProductId;
      if (!creditsProductId) {
        const whopProduct = await whopService.createProduct('Credits', 'VAPI call credits', whop.config);
        creditsProductId = whopProduct.id;
        await req.prisma.user.update({
          where: { id: whop.partner.id },
          data: { whopCreditsProductId: creditsProductId },
        });
      }
    } else {
      let creditsProduct = await req.prisma.product.findUnique({ where: { slug: 'credits' } });
      if (!creditsProduct) {
        creditsProduct = await req.prisma.product.create({
          data: { name: 'Credits', slug: 'credits', description: 'VAPI call credits', isActive: true, sortOrder: 999 },
        });
      }
      if (!creditsProduct.whopProductId) {
        const whopProduct = await whopService.createProduct('Credits', 'VAPI call credits', whop.config);
        creditsProduct = await req.prisma.product.update({
          where: { id: creditsProduct.id },
          data: { whopProductId: whopProduct.id },
        });
      }
      creditsProductId = creditsProduct.whopProductId;
    }

    // Create a one-time Whop plan for this exact amount, then the checkout.
    const plan = await whopService.createPlan(creditsProductId, {
      price: amount,
      billingCycle: 'lifetime',
      name: `Credits ($${amount})`,
    }, whop.config);

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await whopService.createCheckoutSession({
      planId: plan.id,
      metadata: {
        userId: String(req.user.id),
        type: 'credits',
        credits: String(amount),
      },
      redirectUrl: `${clientUrl}/credits?checkout=success`,
    }, whop.config);

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
async function performOffSessionCharge(prisma, user, amount, kind, card) {
  // Charge a specific saved card. `card` = { paymentMethodId, memberId }; defaults
  // to the user's primary card. whopMemberId is optional — a setup-mode checkout
  // vaults a card without creating a member.
  const paymentMethodId = card?.paymentMethodId || user.whopPaymentMethodId;
  const memberId = (card ? card.memberId : user.whopMemberId) || null;
  if (!paymentMethodId) {
    const err = new Error('No saved payment method');
    err.code = 'NO_CARD';
    throw err;
  }

  const whopService = require('../services/whopService');
  // Route the charge through the user's partner Whop (if any) so the money lands
  // in the partner's account; the saved card was vaulted in that same company.
  const whop = await getWhopConfigForUser(prisma, user.id);
  const payment = await whopService.chargeOffSession({
    memberId,
    userId: user.whopCustomerId || null,
    paymentMethodId,
    amount,
    metadata: { userId: String(user.id), type: 'credits', kind, credits: String(amount) },
  }, whop.config);

  const planId = payment.plan?.id || payment.plan_id || null;
  await prisma.creditPurchase.create({
    data: {
      userId: user.id,
      amount,
      credits: amount,
      status: 'pending',
      kind,
      whopPlanId: planId,
      paymentMethodId, // so the webhook can fall back to the next card on decline
    },
  }).catch((e) => console.error('[Credits] Failed to record pending off-session purchase:', e.message));

  return payment;
}

/**
 * After a card declines, charge the NEXT saved card (backup fallback). Called from
 * the payment.failed webhook. `failedPaymentMethodId` is the card that just failed;
 * we charge the next one in priority order. Returns true if a next card was
 * charged, false if there's no further card to try. Throws only if the Whop call
 * itself is rejected synchronously.
 */
async function chargeNextCard(prisma, userId, amount, kind, failedPaymentMethodId) {
  const { getSavedCards } = require('../utils/autoRecharge');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return false;
  const cards = getSavedCards(user);
  const idx = cards.findIndex((c) => c.paymentMethodId === failedPaymentMethodId);
  const next = idx >= 0 ? cards[idx + 1] : null;
  if (!next) return false; // no backup card left to try
  await performOffSessionCharge(prisma, user, amount, kind, next);
  console.log(`[Auto-Recharge] Retried $${amount} for user ${userId} on backup card after ${failedPaymentMethodId} declined`);
  return true;
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
    if (!user.whopPaymentMethodId) return; // no saved card (member id is optional)
    // Manual-billing accounts never self-charge — their provider loads credit.
    const billing = await getEffectiveBilling(prisma, userId).catch(() => ({ mode: 'platform' }));
    if (billing.mode === 'manual') return;
    const threshold = user.autoRechargeThreshold;
    const amount = user.autoRechargeAmount;
    if (!(threshold > 0) || !(amount > 0)) return;
    if (user.vapiCredits >= threshold) return;

    // Cooldown — avoid rapid repeat charges while a charge settles.
    if (user.autoRechargeLastAt && (Date.now() - new Date(user.autoRechargeLastAt).getTime()) < AUTO_RECHARGE_COOLDOWN_MS) {
      return;
    }

    // Lock — don't fire while a recent auto charge is still settling. Whop settles
    // off-session charges in seconds, so anything still "pending" after 30 minutes
    // is a lost webhook, not an in-flight charge; it must not block forever (that
    // silently freezes auto-recharge). Mark stale pendings failed so they release
    // the lock, and surface why.
    const PENDING_STALE_MS = 30 * 60 * 1000;
    const pending = await prisma.creditPurchase.findFirst({
      where: { userId, kind: 'auto_recharge', status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      const ageMs = Date.now() - new Date(pending.createdAt).getTime();
      if (ageMs < PENDING_STALE_MS) return; // genuinely in flight — wait for its webhook
      await prisma.creditPurchase.update({
        where: { id: pending.id },
        data: { status: 'failed', errorMessage: 'Whop nunca confirmó este cobro (webhook no recibido). Revisa la configuración del webhook.' },
      }).catch(() => {});
      console.warn(`[Auto-Recharge] Released stale pending charge #${pending.id} for user ${userId} (age ${Math.round(ageMs / 60000)}m)`);
    }

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

    // Try each saved card in priority order. A card that Whop ACCEPTS (returns
    // "processing") settles async — its real success/failure arrives via webhook,
    // and the payment.failed handler falls back to the next card there. Here we
    // only walk to the next card when Whop rejects the API call synchronously.
    const { getSavedCards, recordAutoRechargeFailure } = require('../utils/autoRecharge');
    const cards = getSavedCards(user);
    let lastErr = null;
    for (const card of cards) {
      try {
        await performOffSessionCharge(prisma, user, amount, 'auto_recharge', card);
        console.log(`[Auto-Recharge] Charged user ${userId} $${amount} on ${card.slot} card (balance was $${user.vapiCredits.toFixed(2)} < $${threshold})`);
        return; // accepted for processing — stop; webhook decides the rest
      } catch (err) {
        lastErr = err;
        console.error(`[Auto-Recharge] ${card.slot} card rejected for user ${userId}:`, err.response?.data || err.message);
      }
    }
    // Every card was rejected synchronously — record the failure.
    await recordAutoRechargeFailure(prisma, userId, lastErr);
  } catch (err) {
    console.error(`[Auto-Recharge] Failed for user ${userId}:`, err.response?.data || err.message);
    const { recordAutoRechargeFailure } = require('../utils/autoRecharge');
    await recordAutoRechargeFailure(prisma, userId, err);
  }
}

// ── Auto-recharge background scheduler ──
// triggerAutoRecharge only runs right after a voice call is billed. That misses
// balances that drop via chatbot messages, manual adjustments, or that simply sit
// below the threshold with no new calls. This scheduler periodically scans every
// enabled account and tops up any whose balance is under its threshold. All the
// guardrails (cooldown, pending lock, daily cap, card, amount) live inside
// triggerAutoRecharge, so this just finds candidates and calls it.
const AUTO_RECHARGE_SCAN_INTERVAL_MS = 2 * 60 * 1000; // every 2 minutes
let autoRechargeScannerInterval = null;

async function processAutoRecharges(prisma) {
  try {
    const candidates = await prisma.user.findMany({
      where: {
        autoRechargeEnabled: true,
        whopPaymentMethodId: { not: null },
        autoRechargeThreshold: { not: null },
        autoRechargeAmount: { not: null },
      },
      select: { id: true, vapiCredits: true, autoRechargeThreshold: true },
    });
    const due = candidates.filter(u => u.vapiCredits < u.autoRechargeThreshold);
    if (due.length) {
      console.log(`[Auto-Recharge] Scanner: ${due.length} account(s) below threshold`);
    }
    for (const u of due) {
      await triggerAutoRecharge(prisma, u.id); // guardrails inside; never throws
    }
  } catch (err) {
    console.error('[Auto-Recharge] Scanner error:', err.message);
  }
}

function startAutoRechargeScheduler(prisma) {
  if (autoRechargeScannerInterval) return;
  console.log('[Auto-Recharge] Scheduler started (every 2 min)');
  processAutoRecharges(prisma);
  autoRechargeScannerInterval = setInterval(() => processAutoRecharges(prisma), AUTO_RECHARGE_SCAN_INTERVAL_MS);
}

/**
 * Create a setup-mode Whop checkout so the customer can vault a card without
 * being charged. Returns { sessionId } for the WhopCheckoutEmbed.
 * POST /api/credits/setup-card
 */
const setupCard = async (req, res) => {
  try {
    const whop = await getWhopConfigForUser(req.prisma, req.user.id);
    if (whop.mode === 'manual') {
      return res.status(403).json({ error: MANUAL_BILLING_MSG });
    }
    if (!whop.isConfigured) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }
    // Which slot this card fills: 'primary' (default) or 'backup'. The
    // setup_intent webhook reads this to store the card in the right slot.
    const slot = req.body?.slot === 'backup' ? 'backup' : 'primary';
    const whopService = require('../services/whopService');
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await whopService.createSetupCheckout({
      metadata: { userId: String(req.user.id), type: 'setup', slot },
      redirectUrl: `${clientUrl}/credits?setup=success`,
    }, whop.config);
    res.json({ sessionId: session.id, purchaseUrl: session.purchase_url });
  } catch (error) {
    console.error('Error creating setup checkout:', error.response?.data || error.message);
    res.status(500).json({ error: 'Failed to start card setup' });
  }
};

/**
 * Remove a saved card. Body/query: { slot: 'primary' | 'backup' }.
 * DELETE /api/credits/card
 */
const removeCard = async (req, res) => {
  try {
    const slot = (req.body?.slot || req.query?.slot) === 'backup' ? 'backup' : 'primary';
    const data = slot === 'backup'
      ? { whopPaymentMethodIdBackup: null, whopMemberIdBackup: null }
      : { whopPaymentMethodId: null, whopMemberId: null };
    await req.prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ success: true, slot });
  } catch (error) {
    console.error('Error removing card:', error.message);
    res.status(500).json({ error: 'Failed to remove card' });
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
        whopPaymentMethodIdBackup: true,
        autoRechargeFailCount: true,
        autoRechargeLastError: true,
        autoRechargeLastErrorAt: true,
      },
    });
    const failCount = user?.autoRechargeFailCount || 0;
    // Effective billing mode governs whether this account can self-purchase credits.
    const billing = await getEffectiveBilling(req.prisma, req.user.id).catch(() => ({ mode: 'platform' }));

    // Diagnostics: a pending off-session charge that never settled (webhook lost)
    // would block every future auto-recharge via the pending lock. Surface it, plus
    // the last few attempts, so a stuck/declined state is visible instead of silent.
    const recent = await req.prisma.creditPurchase.findMany({
      where: { userId: req.user.id, kind: { in: ['auto_recharge', 'manual_card'] } },
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { amount: true, status: true, kind: true, errorMessage: true, createdAt: true },
    });
    const pending = recent.find(p => p.status === 'pending') || null;
    const pendingAgeMin = pending ? Math.round((Date.now() - new Date(pending.createdAt).getTime()) / 60000) : null;

    res.json({
      enabled: !!user?.autoRechargeEnabled,
      threshold: user?.autoRechargeThreshold ?? null,
      amount: user?.autoRechargeAmount ?? null,
      hasCard: !!user?.whopPaymentMethodId,
      hasBackupCard: !!user?.whopPaymentMethodIdBackup,
      // Surface the last decline so the customer knows why the card failed
      // instead of auto-recharge going quiet after 3 silent failures.
      lastError: user?.autoRechargeLastError || null,
      lastErrorAt: user?.autoRechargeLastErrorAt || null,
      failCount,
      maxFails: AUTO_RECHARGE_MAX_FAILS,
      disabledByFailures: failCount >= AUTO_RECHARGE_MAX_FAILS && !user?.autoRechargeEnabled,
      pending: pending ? { amount: pending.amount, ageMinutes: pendingAgeMin } : null,
      recentAttempts: recent.map(p => ({ amount: p.amount, status: p.status, kind: p.kind, error: p.errorMessage || null, at: p.createdAt })),
      // When manual, the client can't self-purchase — their provider loads credit.
      billingMode: billing.mode,
      selfServiceDisabled: billing.mode === 'manual',
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
    const whop = await getWhopConfigForUser(req.prisma, req.user.id);
    if (whop.mode === 'manual') {
      return res.status(403).json({ error: MANUAL_BILLING_MSG });
    }
    if (!whop.isConfigured) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }
    const amount = Math.round(parseFloat(req.body?.amount) * 100) / 100;
    if (!Number.isFinite(amount) || amount < CREDITS_MIN_AMOUNT || amount > CREDITS_MAX_AMOUNT) {
      return res.status(400).json({ error: `Amount must be between $${CREDITS_MIN_AMOUNT} and $${CREDITS_MAX_AMOUNT}.` });
    }

    const user = await req.prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user?.whopPaymentMethodId) { // member id is optional (setup-mode checkout)
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
  removeCard,
  triggerAutoRecharge,
  performOffSessionCharge,
  chargeNextCard,
  startAutoRechargeScheduler,
  processAutoRecharges,
};
