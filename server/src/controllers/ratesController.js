const { getAgentRate } = require('../utils/pricingUtils');

/**
 * Get current call rates
 * GET /api/rates
 */
const getRates = async (req, res) => {
  try {
    let rates = await req.prisma.callRate.findFirst();

    // Create default rates if none exist
    if (!rates) {
      rates = await req.prisma.callRate.create({
        data: {
          outboundRate: 0.10,
          inboundRate: 0.05
        }
      });
    }

    res.json({
      outboundRate: rates.outboundRate,
      inboundRate: rates.inboundRate
    });
  } catch (error) {
    console.error('Error getting rates:', error);
    res.status(500).json({ error: 'Failed to get rates' });
  }
};

/**
 * Update call rates (OWNER only)
 * PUT /api/rates
 */
const updateRates = async (req, res) => {
  try {
    // Check if user is OWNER
    if (req.user.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only OWNER can update rates' });
    }

    const { outboundRate, inboundRate } = req.body;

    if (outboundRate !== undefined && (typeof outboundRate !== 'number' || outboundRate < 0)) {
      return res.status(400).json({ error: 'outboundRate must be a positive number' });
    }

    if (inboundRate !== undefined && (typeof inboundRate !== 'number' || inboundRate < 0)) {
      return res.status(400).json({ error: 'inboundRate must be a positive number' });
    }

    // Get or create rates
    let rates = await req.prisma.callRate.findFirst();

    if (!rates) {
      rates = await req.prisma.callRate.create({
        data: {
          outboundRate: outboundRate ?? 0.10,
          inboundRate: inboundRate ?? 0.05
        }
      });
    } else {
      const updateData = {};
      if (outboundRate !== undefined) updateData.outboundRate = outboundRate;
      if (inboundRate !== undefined) updateData.inboundRate = inboundRate;

      rates = await req.prisma.callRate.update({
        where: { id: rates.id },
        data: updateData
      });
    }

    res.json({
      message: 'Rates updated successfully',
      outboundRate: rates.outboundRate,
      inboundRate: rates.inboundRate
    });
  } catch (error) {
    console.error('Error updating rates:', error);
    res.status(500).json({ error: 'Failed to update rates' });
  }
};

/**
 * Sync calls and bill unbilled ones
 * POST /api/rates/sync-billing
 */
const syncBilling = async (req, res) => {
  try {
    const vapiService = require('../services/vapiService');

    if (!vapiService.isConfigured()) {
      return res.status(400).json({ error: 'VAPI not configured' });
    }

    // Get rates
    let rates = await req.prisma.callRate.findFirst();
    if (!rates) {
      rates = { outboundRate: 0.10, inboundRate: 0.05 };
    }

    // Get recent calls from VAPI
    const vapiCalls = await vapiService.listCalls(100);

    let billedCount = 0;
    let totalCharged = 0;

    for (const call of vapiCalls) {
      // Skip if not ended
      if (call.status !== 'ended') continue;

      // Check if already billed
      const existingLog = await req.prisma.callLog.findUnique({
        where: { vapiCallId: call.id }
      });

      if (existingLog && existingLog.billed) continue;

      // Determine call type and user
      const isOutbound = call.type === 'outboundPhoneCall';
      const durationSeconds = call.duration || 0;
      const durationMinutes = durationSeconds / 60;

      // Find the user who owns this call (via assistant)
      let userId = null;
      let agent = null;

      if (call.assistantId) {
        agent = await req.prisma.agent.findFirst({
          where: { vapiId: call.assistantId }
        });
        if (agent) {
          userId = agent.userId;
        }
      }

      if (!userId) continue; // Skip if we can't determine the user

      // Try dynamic pricing first, fallback to legacy rates
      let rate;
      const dynamicRate = agent ? await getAgentRate(req.prisma, agent, userId) : null;

      if (dynamicRate) {
        rate = dynamicRate.totalRate;
      } else {
        rate = isOutbound ? rates.outboundRate : rates.inboundRate;
      }

      const cost = durationMinutes * rate;

      // Create or update call log
      if (existingLog) {
        await req.prisma.callLog.update({
          where: { id: existingLog.id },
          data: {
            durationSeconds,
            costCharged: cost,
            billed: true
          }
        });
      } else {
        await req.prisma.callLog.create({
          data: {
            vapiCallId: call.id,
            userId,
            type: isOutbound ? 'outbound' : 'inbound',
            durationSeconds,
            costCharged: cost,
            billed: true
          }
        });
      }

      // Deduct from user's credits
      if (cost > 0) {
        await req.prisma.user.update({
          where: { id: userId },
          data: {
            vapiCredits: {
              decrement: cost
            }
          }
        });
        totalCharged += cost;
        billedCount++;
      }
    }

    // Dispatch event to refresh frontend
    res.json({
      message: 'Billing sync complete',
      billedCalls: billedCount,
      totalCharged: totalCharged.toFixed(4)
    });
  } catch (error) {
    console.error('Error syncing billing:', error);
    res.status(500).json({ error: 'Failed to sync billing' });
  }
};

module.exports = {
  getRates,
  updateRates,
  syncBilling
};
