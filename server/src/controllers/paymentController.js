// ── Helpers ──

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

// ── Products CRUD ──

const listProducts = async (req, res) => {
  try {
    const where = req.user.role === 'OWNER' ? {} : { isActive: true };
    const products = await req.prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    res.json(products);
  } catch (err) {
    console.error('listProducts error:', err);
    res.status(500).json({ error: 'Failed to list products' });
  }
};

const getProduct = async (req, res) => {
  try {
    const product = await req.prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    res.json(product);
  } catch (err) {
    console.error('getProduct error:', err);
    res.status(500).json({ error: 'Failed to get product' });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, slug, description, monthlyPrice, quarterlyPrice, annualPrice, lifetimePrice, sortOrder, isActive } = req.body;
    if (!name || !slug) {
      return res.status(400).json({ error: 'Name and slug are required' });
    }
    const product = await req.prisma.product.create({
      data: {
        name,
        slug,
        description: description || null,
        monthlyPrice: monthlyPrice != null ? parseFloat(monthlyPrice) : 0,
        quarterlyPrice: quarterlyPrice != null ? parseFloat(quarterlyPrice) : 0,
        annualPrice: annualPrice != null ? parseFloat(annualPrice) : 0,
        lifetimePrice: lifetimePrice != null ? parseFloat(lifetimePrice) : 0,
        sortOrder: sortOrder != null ? parseInt(sortOrder) : 0,
        isActive: isActive !== false,
      },
    });
    res.status(201).json(product);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'A product with this slug already exists' });
    }
    console.error('createProduct error:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { name, slug, description, monthlyPrice, quarterlyPrice, annualPrice, lifetimePrice, isActive, sortOrder } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (slug !== undefined) data.slug = slug;
    if (description !== undefined) data.description = description;
    if (monthlyPrice !== undefined) data.monthlyPrice = parseFloat(monthlyPrice);
    if (quarterlyPrice !== undefined) data.quarterlyPrice = parseFloat(quarterlyPrice);
    if (annualPrice !== undefined) data.annualPrice = parseFloat(annualPrice);
    if (lifetimePrice !== undefined) data.lifetimePrice = parseFloat(lifetimePrice);
    if (isActive !== undefined) data.isActive = isActive;
    if (sortOrder !== undefined) data.sortOrder = parseInt(sortOrder);

    const product = await req.prisma.product.update({
      where: { id: parseInt(req.params.id) },
      data,
    });
    res.json(product);
  } catch (err) {
    if (err.code === 'P2002') {
      return res.status(400).json({ error: 'A product with this slug already exists' });
    }
    console.error('updateProduct error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const usageCount = await req.prisma.userProduct.count({ where: { productId: id } });

    if (usageCount > 0) {
      await req.prisma.product.update({ where: { id }, data: { isActive: false } });
      return res.json({ message: 'Product deactivated (in use by users)', softDeleted: true });
    }

    await req.prisma.product.delete({ where: { id } });
    res.json({ message: 'Product deleted' });
  } catch (err) {
    console.error('deleteProduct error:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
};

// ── User Products ──

const listUserProducts = async (req, res) => {
  try {
    let where = {};
    if (req.user.role === 'CLIENT') {
      where = { userId: req.user.id };
    } else if (req.user.role === 'AGENCY') {
      const clients = await req.prisma.user.findMany({
        where: { agencyId: req.user.id },
        select: { id: true },
      });
      const clientIds = clients.map((c) => c.id);
      where = { userId: { in: [req.user.id, ...clientIds] } };
    }

    const userProducts = await req.prisma.userProduct.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        product: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(userProducts);
  } catch (err) {
    console.error('listUserProducts error:', err);
    res.status(500).json({ error: 'Failed to list user products' });
  }
};

const getUserProducts = async (req, res) => {
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

    const userProducts = await req.prisma.userProduct.findMany({
      where: { userId },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json(userProducts);
  } catch (err) {
    console.error('getUserProducts error:', err);
    res.status(500).json({ error: 'Failed to get user products' });
  }
};

const assignUserProducts = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const { products: productsInput } = req.body;
    // productsInput: [{ productId, billingCycle, notes? }]

    if (!productsInput || !Array.isArray(productsInput) || productsInput.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    // Permission check for AGENCY
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || client.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    // Count how many products user will have total (existing active + new)
    const existingProducts = await req.prisma.userProduct.findMany({
      where: { userId, status: 'active' },
      select: { productId: true },
    });
    const existingIds = new Set(existingProducts.map((p) => p.productId));
    const newIds = productsInput.map((p) => p.productId);
    const allProductIds = new Set([...existingIds, ...newIds]);
    const totalCount = allProductIds.size;
    const discountPercent = calculateDiscount(totalCount);

    // Fetch product details
    const productRecords = await req.prisma.product.findMany({
      where: { id: { in: newIds } },
    });
    const productMap = {};
    productRecords.forEach((p) => { productMap[p.id] = p; });

    const results = [];
    for (const item of productsInput) {
      const product = productMap[item.productId];
      if (!product) continue;

      const cycle = item.billingCycle || 'monthly';
      const basePrice = getPriceForCycle(product, cycle);
      const discountAmount = (basePrice * discountPercent) / 100;
      const finalAmount = basePrice - discountAmount;

      const userProduct = await req.prisma.userProduct.upsert({
        where: { userId_productId: { userId, productId: product.id } },
        create: {
          userId,
          productId: product.id,
          billingCycle: cycle,
          amount: finalAmount,
          discountApplied: discountPercent,
          notes: item.notes || null,
          assignedBy: req.user.id,
        },
        update: {
          billingCycle: cycle,
          amount: finalAmount,
          discountApplied: discountPercent,
          status: 'active',
          notes: item.notes !== undefined ? item.notes : undefined,
          assignedBy: req.user.id,
        },
        include: { product: true },
      });
      results.push(userProduct);
    }

    // Sync user feature flags
    await syncUserFlags(req.prisma, userId);

    res.json(results);
  } catch (err) {
    console.error('assignUserProducts error:', err);
    res.status(500).json({ error: 'Failed to assign products' });
  }
};

const updateUserProduct = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const productId = parseInt(req.params.productId);
    const { billingCycle, status, nextPaymentDate, notes } = req.body;

    // Permission check
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || client.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const existing = await req.prisma.userProduct.findUnique({
      where: { userId_productId: { userId, productId } },
      include: { product: true },
    });
    if (!existing) return res.status(404).json({ error: 'User product not found' });

    const data = {};
    if (billingCycle !== undefined) {
      data.billingCycle = billingCycle;
      // Recalculate amount
      const activeCount = await req.prisma.userProduct.count({ where: { userId, status: 'active' } });
      const discountPercent = calculateDiscount(activeCount);
      const basePrice = getPriceForCycle(existing.product, billingCycle);
      data.amount = basePrice - (basePrice * discountPercent) / 100;
      data.discountApplied = discountPercent;
    }
    if (status !== undefined) data.status = status;
    if (nextPaymentDate !== undefined) data.nextPaymentDate = nextPaymentDate ? new Date(nextPaymentDate) : null;
    if (notes !== undefined) data.notes = notes;

    const userProduct = await req.prisma.userProduct.update({
      where: { userId_productId: { userId, productId } },
      data,
      include: { product: true, user: { select: { id: true, name: true, email: true } } },
    });

    await syncUserFlags(req.prisma, userId);

    res.json(userProduct);
  } catch (err) {
    console.error('updateUserProduct error:', err);
    res.status(500).json({ error: 'Failed to update user product' });
  }
};

const removeUserProduct = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    const productId = parseInt(req.params.productId);

    // Permission check
    if (req.user.role === 'AGENCY') {
      const client = await req.prisma.user.findUnique({ where: { id: userId } });
      if (!client || client.agencyId !== req.user.id) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }

    const existing = await req.prisma.userProduct.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!existing) return res.status(404).json({ error: 'User product not found' });

    await req.prisma.userProduct.delete({
      where: { userId_productId: { userId, productId } },
    });

    // Recalculate discounts for remaining products
    const remaining = await req.prisma.userProduct.findMany({
      where: { userId, status: 'active' },
      include: { product: true },
    });
    const newDiscount = calculateDiscount(remaining.length);
    for (const up of remaining) {
      const basePrice = getPriceForCycle(up.product, up.billingCycle);
      const finalAmount = basePrice - (basePrice * newDiscount) / 100;
      await req.prisma.userProduct.update({
        where: { id: up.id },
        data: { amount: finalAmount, discountApplied: newDiscount },
      });
    }

    await syncUserFlags(req.prisma, userId);

    res.json({ message: 'Product removed from user' });
  } catch (err) {
    console.error('removeUserProduct error:', err);
    res.status(500).json({ error: 'Failed to remove user product' });
  }
};

// ── Self-service Update & Cancel ──

const selfUpdateProduct = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = parseInt(req.params.productId);
    const { billingCycle } = req.body;

    if (!billingCycle) return res.status(400).json({ error: 'billingCycle is required' });

    const existing = await req.prisma.userProduct.findUnique({
      where: { userId_productId: { userId, productId } },
      include: { product: true },
    });
    if (!existing) return res.status(404).json({ error: 'Product not found in your subscriptions' });

    const activeCount = await req.prisma.userProduct.count({ where: { userId, status: 'active' } });
    const discountPercent = calculateDiscount(activeCount);
    const basePrice = getPriceForCycle(existing.product, billingCycle);
    const amount = basePrice - (basePrice * discountPercent) / 100;

    const userProduct = await req.prisma.userProduct.update({
      where: { userId_productId: { userId, productId } },
      data: { billingCycle, amount, discountApplied: discountPercent },
      include: { product: true },
    });

    res.json(userProduct);
  } catch (err) {
    console.error('selfUpdateProduct error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
};

const selfCancelProduct = async (req, res) => {
  try {
    const userId = req.user.id;
    const productId = parseInt(req.params.productId);

    const existing = await req.prisma.userProduct.findUnique({
      where: { userId_productId: { userId, productId } },
    });
    if (!existing) return res.status(404).json({ error: 'Product not found in your subscriptions' });

    await req.prisma.userProduct.delete({
      where: { userId_productId: { userId, productId } },
    });

    // Recalculate discounts for remaining products
    const remaining = await req.prisma.userProduct.findMany({
      where: { userId, status: 'active' },
      include: { product: true },
    });
    const newDiscount = calculateDiscount(remaining.length);
    for (const up of remaining) {
      const basePrice = getPriceForCycle(up.product, up.billingCycle);
      const finalAmount = basePrice - (basePrice * newDiscount) / 100;
      await req.prisma.userProduct.update({
        where: { id: up.id },
        data: { amount: finalAmount, discountApplied: newDiscount },
      });
    }

    await syncUserFlags(req.prisma, userId);

    res.json({ message: 'Product cancelled successfully' });
  } catch (err) {
    console.error('selfCancelProduct error:', err);
    res.status(500).json({ error: 'Failed to cancel product' });
  }
};

// ── Catalog & Purchase (CLIENT self-service) ──

const getCatalog = async (req, res) => {
  try {
    const products = await req.prisma.product.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    const userProducts = await req.prisma.userProduct.findMany({
      where: { userId: req.user.id, status: 'active' },
      include: { product: true },
    });

    res.json({ products, userProducts });
  } catch (err) {
    console.error('getCatalog error:', err);
    res.status(500).json({ error: 'Failed to get catalog' });
  }
};

const purchase = async (req, res) => {
  try {
    const { products: productsInput } = req.body;
    // productsInput: [{ productId, billingCycle }]
    if (!productsInput || !Array.isArray(productsInput) || productsInput.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    const userId = req.user.id;

    // Get existing active products
    const existingProducts = await req.prisma.userProduct.findMany({
      where: { userId, status: 'active' },
      select: { productId: true },
    });
    const existingIds = new Set(existingProducts.map((p) => p.productId));
    const newIds = productsInput.map((p) => p.productId);
    const allProductIds = new Set([...existingIds, ...newIds]);
    const totalCount = allProductIds.size;
    const discountPercent = calculateDiscount(totalCount);

    // Fetch product details
    const productRecords = await req.prisma.product.findMany({
      where: { id: { in: newIds }, isActive: true },
    });
    const productMap = {};
    productRecords.forEach((p) => { productMap[p.id] = p; });

    const results = [];
    for (const item of productsInput) {
      const product = productMap[item.productId];
      if (!product) continue;

      // Skip if already owned
      if (existingIds.has(product.id)) continue;

      const cycle = item.billingCycle || 'monthly';
      const basePrice = getPriceForCycle(product, cycle);
      const discountAmount = (basePrice * discountPercent) / 100;
      const finalAmount = basePrice - discountAmount;

      const userProduct = await req.prisma.userProduct.create({
        data: {
          userId,
          productId: product.id,
          billingCycle: cycle,
          amount: finalAmount,
          discountApplied: discountPercent,
          assignedBy: null, // self-purchased
        },
        include: { product: true },
      });
      results.push(userProduct);
    }

    // Update discount on existing products if it changed
    if (discountPercent > 0) {
      const allActive = await req.prisma.userProduct.findMany({
        where: { userId, status: 'active' },
        include: { product: true },
      });
      for (const up of allActive) {
        const basePrice = getPriceForCycle(up.product, up.billingCycle);
        const finalAmount = basePrice - (basePrice * discountPercent) / 100;
        if (up.discountApplied !== discountPercent) {
          await req.prisma.userProduct.update({
            where: { id: up.id },
            data: { amount: finalAmount, discountApplied: discountPercent },
          });
        }
      }
    }

    await syncUserFlags(req.prisma, userId);

    res.json({ purchased: results, discountApplied: discountPercent });
  } catch (err) {
    console.error('purchase error:', err);
    res.status(500).json({ error: 'Failed to purchase products' });
  }
};

const previewPurchase = async (req, res) => {
  try {
    const { products: productsInput } = req.body;
    // productsInput: [{ productId, billingCycle }]
    if (!productsInput || !Array.isArray(productsInput) || productsInput.length === 0) {
      return res.status(400).json({ error: 'products array is required' });
    }

    const userId = req.user.id;

    const existingProducts = await req.prisma.userProduct.findMany({
      where: { userId, status: 'active' },
      select: { productId: true },
    });
    const existingCount = existingProducts.length;
    const newCount = productsInput.filter((p) => !existingProducts.some((ep) => ep.productId === p.productId)).length;
    const totalCount = existingCount + newCount;
    const discountPercent = calculateDiscount(totalCount);

    // Fetch product details
    const newIds = productsInput.map((p) => p.productId);
    const productRecords = await req.prisma.product.findMany({
      where: { id: { in: newIds }, isActive: true },
    });
    const productMap = {};
    productRecords.forEach((p) => { productMap[p.id] = p; });

    let subtotal = 0;
    const lineItems = [];
    for (const item of productsInput) {
      const product = productMap[item.productId];
      if (!product) continue;
      const cycle = item.billingCycle || 'monthly';
      const basePrice = getPriceForCycle(product, cycle);
      subtotal += basePrice;
      lineItems.push({
        productId: product.id,
        name: product.name,
        billingCycle: cycle,
        basePrice,
      });
    }

    const discountAmount = (subtotal * discountPercent) / 100;
    const total = subtotal - discountAmount;

    res.json({
      lineItems,
      subtotal,
      discountPercent,
      discountAmount,
      total,
      totalProductCount: totalCount,
    });
  } catch (err) {
    console.error('previewPurchase error:', err);
    res.status(500).json({ error: 'Failed to preview purchase' });
  }
};

module.exports = {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deleteProduct,
  listUserProducts,
  getUserProducts,
  assignUserProducts,
  updateUserProduct,
  removeUserProduct,
  selfUpdateProduct,
  selfCancelProduct,
  getCatalog,
  purchase,
  previewPurchase,
};
