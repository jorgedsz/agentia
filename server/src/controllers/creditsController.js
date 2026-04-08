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
 * Purchase credits via Whop checkout (predefined tiers)
 * POST /api/credits/purchase
 * Body: { tier: number } — e.g. 10, 25, 50, 100
 */
const purchaseCredits = async (req, res) => {
  try {
    const { tier } = req.body;
    const CREDIT_TIERS = [1, 10, 25, 50, 100];
    const OWNER_ONLY_TIERS = [1];

    if (!tier || !CREDIT_TIERS.includes(tier)) {
      return res.status(400).json({ error: `Invalid tier. Available: ${CREDIT_TIERS.join(', ')}` });
    }

    // $1 tier is OWNER-only (testing)
    if (OWNER_ONLY_TIERS.includes(tier) && req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'This tier is only available for testing' });
    }

    const whopEnabled = !!process.env.WHOP_API_KEY;
    if (!whopEnabled) {
      return res.status(400).json({ error: 'Payment processing is not configured' });
    }

    // Look up credits product and plan ID for this tier
    const creditsProduct = await req.prisma.product.findUnique({ where: { slug: 'credits' } });
    if (!creditsProduct || !creditsProduct.whopPlanIds) {
      return res.status(400).json({ error: 'Credit plans not synced. Ask admin to sync products.' });
    }

    let planMap;
    try { planMap = JSON.parse(creditsProduct.whopPlanIds); } catch { planMap = {}; }

    const planId = planMap[String(tier)];
    if (!planId) {
      return res.status(400).json({ error: `No plan for $${tier} tier. Sync products first.` });
    }

    const whopService = require('../services/whopService');
    const userId = req.user.id;
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

    res.json({
      checkoutId: session.id,
      planId,
      purchaseUrl: session.purchase_url,
    });
  } catch (error) {
    console.error('Error purchasing credits:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

module.exports = {
  getCredits,
  updateCredits,
  listCredits,
  purchaseCredits
};
