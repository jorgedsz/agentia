const { getEffectiveRates, seedDefaultRates } = require('../utils/pricingUtils');

/**
 * GET /api/pricing/models
 * Returns model rates. Role-aware:
 * - OWNER sees global defaults
 * - AGENCY sees global + own overrides
 * - CLIENT sees effective resolved rates (read-only)
 */
const getModelRates = async (req, res) => {
  try {
    await seedDefaultRates(req.prisma);

    const role = req.user.role;
    const userId = req.user.id;

    // Global defaults
    const globalRates = await req.prisma.modelRate.findMany({
      where: { setById: 0 },
      orderBy: [{ provider: 'asc' }, { model: 'asc' }]
    });

    if (role === 'OWNER') {
      return res.json({ rates: globalRates, scope: 'global' });
    }

    if (role === 'AGENCY') {
      const overrides = await req.prisma.modelRate.findMany({
        where: { setById: userId },
        orderBy: [{ provider: 'asc' }, { model: 'asc' }]
      });
      return res.json({ globalRates, overrides, scope: 'agency' });
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
 * GET /api/pricing/transcribers
 * Returns transcriber rates. Role-aware (same pattern as models).
 */
const getTranscriberRates = async (req, res) => {
  try {
    await seedDefaultRates(req.prisma);

    const role = req.user.role;
    const userId = req.user.id;

    const globalRates = await req.prisma.transcriberRate.findMany({
      where: { setById: 0 },
      orderBy: { provider: 'asc' }
    });

    if (role === 'OWNER') {
      return res.json({ rates: globalRates, scope: 'global' });
    }

    if (role === 'AGENCY') {
      const overrides = await req.prisma.transcriberRate.findMany({
        where: { setById: userId },
        orderBy: { provider: 'asc' }
      });
      return res.json({ globalRates, overrides, scope: 'agency' });
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
 * OWNER: updates global (setById=0)
 * AGENCY: updates own overrides (setById=agencyUserId)
 * Body: { rates: [{ provider, model, rate }] }
 */
const updateModelRates = async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'OWNER' && role !== 'AGENCY') {
      return res.status(403).json({ error: 'Only OWNER or AGENCY can update rates' });
    }

    const { rates } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: 'rates must be an array' });
    }

    const setById = role === 'OWNER' ? 0 : req.user.id;

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
 * Body: { rates: [{ provider, rate }] }
 */
const updateTranscriberRates = async (req, res) => {
  try {
    const role = req.user.role;
    if (role !== 'OWNER' && role !== 'AGENCY') {
      return res.status(403).json({ error: 'Only OWNER or AGENCY can update rates' });
    }

    const { rates } = req.body;
    if (!Array.isArray(rates)) {
      return res.status(400).json({ error: 'rates must be an array' });
    }

    const setById = role === 'OWNER' ? 0 : req.user.id;

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
