// ── Plan Tiers ──

const listPlanTiers = async (req, res) => {
  try {
    const where = req.user.role === 'OWNER' ? {} : { isActive: true };
    const tiers = await req.prisma.planTier.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(tiers);
  } catch (err) {
    console.error('listPlanTiers error:', err);
    res.status(500).json({ error: 'Failed to list plan tiers' });
  }
};

const getPlanTier = async (req, res) => {
  try {
    const tier = await req.prisma.planTier.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!tier) return res.status(404).json({ error: 'Plan tier not found' });
    res.json(tier);
  } catch (err) {
    console.error('getPlanTier error:', err);
    res.status(500).json({ error: 'Failed to get plan tier' });
  }
};

const createPlanTier = async (req, res) => {
  try {
    const { name, description, price, billingCycle, sortOrder, isActive } = req.body;
    if (!name || price == null || !billingCycle) {
      return res.status(400).json({ error: 'Name, price, and billingCycle are required' });
    }
    const tier = await req.prisma.planTier.create({
      data: {
        name,
        description: description || null,
        price: parseFloat(price),
        billingCycle,
        sortOrder: sortOrder != null ? parseInt(sortOrder) : 0,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(tier);
  } catch (err) {
    console.error('createPlanTier error:', err);
    res.status(500).json({ error: 'Failed to create plan tier' });
  }
};

const updatePlanTier = async (req, res) => {
  try {
    const { name, description, price, billingCycle, isActive, sortOrder } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (description !== undefined) data.description = description;
    if (price !== undefined) data.price = parseFloat(price);
    if (billingCycle !== undefined) data.billingCycle = billingCycle;
    if (isActive !== undefined) data.isActive = isActive;
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);

    const tier = await req.prisma.planTier.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(tier);
  } catch (err) {
    console.error('updatePlanTier error:', err);
    res.status(500).json({ error: 'Failed to update plan tier' });
  }
};

const deletePlanTier = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const usageCount = await req.prisma.userPlan.count({ where: { planTierId: id } });

    if (usageCount > 0) {
      // Soft delete – mark inactive
      await req.prisma.planTier.update({ where: { id }, data: { isActive: false } });
      return res.json({ message: 'Plan tier deactivated (in use by users)', softDeleted: true });
    }

    await req.prisma.planTier.delete({ where: { id } });
    res.json({ message: 'Plan tier deleted' });
  } catch (err) {
    console.error('deletePlanTier error:', err);
    res.status(500).json({ error: 'Failed to delete plan tier' });
  }
};

// ── User Plans ──

const listUserPlans = async (req, res) => {
  try {
    let where = {};
    if (req.user.role === 'CLIENT') {
      where = { userId: req.user.id };
    } else if (req.user.role === 'AGENCY') {
      const clients = await req.prisma.user.findMany({
        where: { agencyId: req.user.id },
        select: { id: true },
      });
      const clientIds = clients.map(c => c.id);
      where = { userId: { in: [req.user.id, ...clientIds] } };
    }
    // OWNER: no filter – gets all

    const plans = await req.prisma.userPlan.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        planTier: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(plans);
  } catch (err) {
    console.error('listUserPlans error:', err);
    res.status(500).json({ error: 'Failed to list user plans' });
  }
};

const getUserPlan = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Permission check
    if (req.user.role === 'CLIENT' && req.user.id !== userId) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || (client.id !== req.user.id && client.agencyId !== req.user.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const plan = await req.prisma.userPlan.findUnique({
      where: { userId },
      include: { planTier: true, user: { select: { id: true, name: true, email: true } } },
    });
    if (!plan) return res.status(404).json({ error: 'No plan assigned' });
    res.json(plan);
  } catch (err) {
    console.error('getUserPlan error:', err);
    res.status(500).json({ error: 'Failed to get user plan' });
  }
};

const assignUserPlan = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { planTierId, amount, billingCycle, nextPaymentDate, notes } = req.body;

    if (!planTierId) return res.status(400).json({ error: 'planTierId is required' });

    // Permission check
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || client.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const tier = await req.prisma.planTier.findUnique({ where: { id: parseInt(planTierId) } });
    if (!tier) return res.status(404).json({ error: 'Plan tier not found' });

    const plan = await req.prisma.userPlan.upsert({
      where: { userId },
      create: {
        userId,
        planTierId: tier.id,
        amount: amount != null ? parseFloat(amount) : tier.price,
        billingCycle: billingCycle || tier.billingCycle,
        nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
        notes: notes || null,
      },
      update: {
        planTierId: tier.id,
        amount: amount != null ? parseFloat(amount) : tier.price,
        billingCycle: billingCycle || tier.billingCycle,
        nextPaymentDate: nextPaymentDate ? new Date(nextPaymentDate) : null,
        notes: notes !== undefined ? notes : undefined,
      },
      include: { planTier: true, user: { select: { id: true, name: true, email: true } } },
    });
    res.json(plan);
  } catch (err) {
    console.error('assignUserPlan error:', err);
    res.status(500).json({ error: 'Failed to assign user plan' });
  }
};

const updateUserPlan = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { planTierId, amount, billingCycle, status, nextPaymentDate, notes } = req.body;

    // Permission check
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || client.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const existing = await req.prisma.userPlan.findUnique({ where: { userId } });
    if (!existing) return res.status(404).json({ error: 'No plan assigned to this user' });

    const data = {};
    if (planTierId !== undefined) data.planTierId = parseInt(planTierId);
    if (amount !== undefined) data.amount = parseFloat(amount);
    if (billingCycle !== undefined) data.billingCycle = billingCycle;
    if (status !== undefined) data.status = status;
    if (nextPaymentDate !== undefined) data.nextPaymentDate = nextPaymentDate ? new Date(nextPaymentDate) : null;
    if (notes !== undefined) data.notes = notes;

    const plan = await req.prisma.userPlan.update({
      where: { userId },
      data,
      include: { planTier: true, user: { select: { id: true, name: true, email: true } } },
    });
    res.json(plan);
  } catch (err) {
    console.error('updateUserPlan error:', err);
    res.status(500).json({ error: 'Failed to update user plan' });
  }
};

const removeUserPlan = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);

    // Permission check
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || client.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const existing = await req.prisma.userPlan.findUnique({ where: { userId } });
    if (!existing) return res.status(404).json({ error: 'No plan assigned to this user' });

    await req.prisma.userPlan.delete({ where: { userId } });
    res.json({ message: 'User plan removed' });
  } catch (err) {
    console.error('removeUserPlan error:', err);
    res.status(500).json({ error: 'Failed to remove user plan' });
  }
};

module.exports = {
  listPlanTiers,
  getPlanTier,
  createPlanTier,
  updatePlanTier,
  deletePlanTier,
  listUserPlans,
  getUserPlan,
  assignUserPlan,
  updateUserPlan,
  removeUserPlan,
};
