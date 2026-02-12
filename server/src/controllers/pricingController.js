const { getEffectiveRates, seedDefaultRates } = require('../utils/pricingUtils');

/**
 * GET /api/pricing/models?forUserId=X
 * Returns model rates. Role-aware:
 * - No forUserId: OWNER sees global defaults, AGENCY/CLIENT sees own effective rates
 * - With forUserId: returns global + per-account overrides (OWNER for any user, AGENCY for their clients)
 */
const getModelRates = async (req, res) => {
  try {
    await seedDefaultRates(req.prisma);

    const role = req.user.role;
    const userId = req.user.id;
    const forUserId = req.query.forUserId ? parseInt(req.query.forUserId) : null;

    // Global defaults (always needed)
    const globalRates = await req.prisma.modelRate.findMany({
      where: { setById: 0 },
      orderBy: [{ provider: 'asc' }, { model: 'asc' }]
    });

    // Per-account mode: return global + account overrides
    if (forUserId) {
      // Permission check
      if (role === 'AGENCY') {
        const targetUser = await req.prisma.user.findUnique({ where: { id: forUserId }, select: { id: true, agencyId: true } });
        if (!targetUser || targetUser.agencyId !== userId) {
          return res.status(403).json({ error: 'You can only view rates for your own clients' });
        }
      } else if (role !== 'OWNER') {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const accountRates = await req.prisma.modelRate.findMany({
        where: { setById: forUserId },
        orderBy: [{ provider: 'asc' }, { model: 'asc' }]
      });

      const forUser = await req.prisma.user.findUnique({
        where: { id: forUserId },
        select: { id: true, name: true, email: true, role: true }
      });

      return res.json({ globalRates, accountRates, forUser, scope: 'account' });
    }

    // No forUserId — standard role-based response
    if (role === 'OWNER') {
      return res.json({ rates: globalRates, scope: 'global' });
    }

    if (role === 'AGENCY') {
      // Agency sees global rates (their own rates = global since per-account replaces agency-wide)
      return res.json({ rates: globalRates, scope: 'agency' });
    }

    // CLIENT: return resolved effective rates
    const { modelRates } = await getEffectiveRates(req.prisma, userId);
    const effective = globalRates.map(r => ({
      ...r,
      rate: modelRates[`${r.provider}::${r.model}`] ?? r.rate
    }));
    return res.json({ rates: effective, scope: 'client' });
  } catch (error) {
    console.error('Error getting model rates:', error);
    res.status(500).json({ error: 'Failed to get model rates' });
  }
};

/**
 * GET /api/pricing/transcribers?forUserId=X
 * Returns transcriber rates. Same pattern as models.
 */
const getTranscriberRates = async (req, res) => {
  try {
    await seedDefaultRates(req.prisma);

    const role = req.user.role;
    const userId = req.user.id;
    const forUserId = req.query.forUserId ? parseInt(req.query.forUserId) : null;

    const globalRates = await req.prisma.transcriberRate.findMany({
      where: { setById: 0 },
      orderBy: { provider: 'asc' }
    });

    // Per-account mode
    if (forUserId) {
      if (role === 'AGENCY') {
        const targetUser = await req.prisma.user.findUnique({ where: { id: forUserId }, select: { id: true, agencyId: true } });
        if (!targetUser || targetUser.agencyId !== userId) {
          return res.status(403).json({ error: 'You can only view rates for your own clients' });
        }
      } else if (role !== 'OWNER') {
        return res.status(403).json({ error: 'Not authorized' });
      }

      const accountRates = await req.prisma.transcriberRate.findMany({
        where: { setById: forUserId },
        orderBy: { provider: 'asc' }
      });

      const forUser = await req.prisma.user.findUnique({
        where: { id: forUserId },
        select: { id: true, name: true, email: true, role: true }
      });

      return res.json({ globalRates, accountRates, forUser, scope: 'account' });
    }

    // Standard role-based
    if (role === 'OWNER') {
      return res.json({ rates: globalRates, scope: 'global' });
    }

    if (role === 'AGENCY') {
      return res.json({ rates: globalRates, scope: 'agency' });
    }

    // CLIENT
    const { transcriberRates } = await getEffectiveRates(req.prisma, userId);
    const effective = globalRates.map(r => ({
      ...r,
      rate: transcriberRates[r.provider] ?? r.rate
    }));
    return res.json({ rates: effective, scope: 'client' });
  } catch (error) {
    console.error('Error getting transcriber rates:', error);
    res.status(500).json({ error: 'Failed to get transcriber rates' });
  }
};

/**
 * PUT /api/pricing/models
 * Upsert model rates.
 * Body: { rates: [{ provider, model, rate }], forUserId?: number }
 * - No forUserId: OWNER updates global (setById=0)
 * - With forUserId: OWNER or AGENCY updates per-account rates (setById=forUserId)
 * AGENCY rates cannot go below OWNER base price.
 */
const updateModelRates = async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'OWNER' && role !== 'AGENCY') {
      return res.status(403).json({ error: 'Only OWNER or AGENCY can update rates' });
    }

    const { rates, forUserId } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: 'rates must be an array' });
    }

    let setById;

    if (forUserId) {
      const targetId = parseInt(forUserId);

      // Permission check
      if (role === 'AGENCY') {
        const targetUser = await req.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, agencyId: true } });
        if (!targetUser || targetUser.agencyId !== req.user.id) {
          return res.status(403).json({ error: 'You can only set rates for your own clients' });
        }
      } else if (role !== 'OWNER') {
        return res.status(403).json({ error: 'Not authorized' });
      }

      setById = targetId;
    } else {
      // No forUserId: only OWNER can update global base rates
      if (role !== 'OWNER') {
        return res.status(403).json({ error: 'Only OWNER can update base rates' });
      }
      setById = 0;
    }

    // AGENCY: enforce minimum pricing — cannot go below OWNER's base rates
    if (role === 'AGENCY' && forUserId) {
      const globalRates = await req.prisma.modelRate.findMany({ where: { setById: 0 } });
      const globalMap = {};
      for (const g of globalRates) {
        globalMap[`${g.provider}::${g.model}`] = g.rate;
      }

      const violations = [];
      for (const { provider, model, rate } of rates) {
        const baseRate = globalMap[`${provider}::${model}`];
        if (baseRate !== undefined && rate < baseRate) {
          violations.push(`${provider}/${model}: $${rate}/min is below minimum $${baseRate}/min`);
        }
      }
      if (violations.length > 0) {
        return res.status(400).json({
          error: 'Rates cannot be lower than the platform base price',
          violations
        });
      }
    }

    for (const { provider, model, rate } of rates) {
      if (!provider || !model || typeof rate !== 'number' || rate < 0) {
        return res.status(400).json({ error: `Invalid rate entry: provider=${provider}, model=${model}, rate=${rate}` });
      }

      await req.prisma.modelRate.upsert({
        where: {
          provider_model_setById: { provider, model, setById }
        },
        update: { rate },
        create: { provider, model, rate, setById }
      });
    }

    res.json({ message: 'Model rates updated', count: rates.length });
  } catch (error) {
    console.error('Error updating model rates:', error);
    res.status(500).json({ error: 'Failed to update model rates' });
  }
};

/**
 * PUT /api/pricing/transcribers
 * Upsert transcriber rates.
 * Body: { rates: [{ provider, rate }], forUserId?: number }
 * Same permission/validation logic as models.
 */
const updateTranscriberRates = async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'OWNER' && role !== 'AGENCY') {
      return res.status(403).json({ error: 'Only OWNER or AGENCY can update rates' });
    }

    const { rates, forUserId } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: 'rates must be an array' });
    }

    let setById;

    if (forUserId) {
      const targetId = parseInt(forUserId);

      if (role === 'AGENCY') {
        const targetUser = await req.prisma.user.findUnique({ where: { id: targetId }, select: { id: true, agencyId: true } });
        if (!targetUser || targetUser.agencyId !== req.user.id) {
          return res.status(403).json({ error: 'You can only set rates for your own clients' });
        }
      } else if (role !== 'OWNER') {
        return res.status(403).json({ error: 'Not authorized' });
      }

      setById = targetId;
    } else {
      if (role !== 'OWNER') {
        return res.status(403).json({ error: 'Only OWNER can update base rates' });
      }
      setById = 0;
    }

    // AGENCY: enforce minimum pricing
    if (role === 'AGENCY' && forUserId) {
      const globalRates = await req.prisma.transcriberRate.findMany({ where: { setById: 0 } });
      const globalMap = {};
      for (const g of globalRates) {
        globalMap[g.provider] = g.rate;
      }

      const violations = [];
      for (const { provider, rate } of rates) {
        const baseRate = globalMap[provider];
        if (baseRate !== undefined && rate < baseRate) {
          violations.push(`${provider}: $${rate}/min is below minimum $${baseRate}/min`);
        }
      }
      if (violations.length > 0) {
        return res.status(400).json({
          error: 'Rates cannot be lower than the platform base price',
          violations
        });
      }
    }

    for (const { provider, rate } of rates) {
      if (!provider || typeof rate !== 'number' || rate < 0) {
        return res.status(400).json({ error: `Invalid rate entry: provider=${provider}, rate=${rate}` });
      }

      await req.prisma.transcriberRate.upsert({
        where: {
          provider_setById: { provider, setById }
        },
        update: { rate },
        create: { provider, rate, setById }
      });
    }

    res.json({ message: 'Transcriber rates updated', count: rates.length });
  } catch (error) {
    console.error('Error updating transcriber rates:', error);
    res.status(500).json({ error: 'Failed to update transcriber rates' });
  }
};

module.exports = {
  getModelRates,
  getTranscriberRates,
  updateModelRates,
  updateTranscriberRates
};
