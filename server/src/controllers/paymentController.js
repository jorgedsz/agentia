const paypalService = require('../services/paypalService');

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

    // Cancel PayPal subscription if exists
    if (existing.paypalSubscriptionId) {
      try {
        await paypalService.cancelSubscription(existing.paypalSubscriptionId, 'Cancelled by user');
      } catch (err) {
        console.error('PayPal cancel failed:', err.message);
        // Continue with local cancel even if PayPal fails
      }
    }

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

// ── PayPal: Sync Product ──

const syncProductToPayPal = async (req, res) => {
  try {
    const product = await req.prisma.product.findUnique({
      where: { id: parseInt(req.params.id) },
    });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Create or reuse PayPal Catalog Product
    let paypalProductId = product.paypalProductId;
    if (!paypalProductId) {
      const ppProduct = await paypalService.createCatalogProduct(
        product.name,
        product.description || product.name
      );
      paypalProductId = ppProduct.id;
    }

    // Create billing plans for each cycle that has a price > 0
    const updates = { paypalProductId };

    if (product.monthlyPrice > 0 && !product.paypalMonthlyPlanId) {
      const plan = await paypalService.createBillingPlan(
        paypalProductId, `${product.name} — Monthly`, 'monthly', product.monthlyPrice
      );
      updates.paypalMonthlyPlanId = plan.id;
    }

    if (product.quarterlyPrice > 0 && !product.paypalQuarterlyPlanId) {
      const plan = await paypalService.createBillingPlan(
        paypalProductId, `${product.name} — Quarterly`, 'quarterly', product.quarterlyPrice
      );
      updates.paypalQuarterlyPlanId = plan.id;
    }

    if (product.annualPrice > 0 && !product.paypalAnnualPlanId) {
      const plan = await paypalService.createBillingPlan(
        paypalProductId, `${product.name} — Annual`, 'annual', product.annualPrice
      );
      updates.paypalAnnualPlanId = plan.id;
    }

    const updated = await req.prisma.product.update({
      where: { id: product.id },
      data: updates,
    });

    res.json(updated);
  } catch (err) {
    console.error('syncProductToPayPal error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync product to PayPal' });
  }
};

// ── PayPal: Create Subscription (recurring) ──

const createPayPalSubscription = async (req, res) => {
  try {
    const { productId, billingCycle } = req.body;
    if (!productId || !billingCycle) {
      return res.status(400).json({ error: 'productId and billingCycle are required' });
    }
    if (billingCycle === 'lifetime') {
      return res.status(400).json({ error: 'Use createPayPalOrder for lifetime purchases' });
    }

    const product = await req.prisma.product.findUnique({ where: { id: parseInt(productId) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Get correct plan ID
    const planIdMap = {
      monthly: product.paypalMonthlyPlanId,
      quarterly: product.paypalQuarterlyPlanId,
      annual: product.paypalAnnualPlanId,
    };
    const planId = planIdMap[billingCycle];
    if (!planId) {
      return res.status(400).json({ error: `No PayPal plan configured for ${billingCycle} billing` });
    }

    const userId = req.user.id;
    const appUrl = process.env.APP_URL || process.env.CLIENT_URL || 'http://localhost:5173';
    const returnUrl = `${appUrl}/settings?paypal=success&productId=${productId}&cycle=${billingCycle}`;
    const cancelUrl = `${appUrl}/settings?paypal=cancelled`;
    const customId = JSON.stringify({ userId, productId: parseInt(productId), billingCycle });

    // Calculate discount for price override
    const activeCount = await req.prisma.userProduct.count({ where: { userId, status: 'active' } });
    const totalAfter = activeCount + 1;
    const discountPercent = calculateDiscount(totalAfter);
    let priceOverride = null;

    if (discountPercent > 0) {
      const basePrice = getPriceForCycle(product, billingCycle);
      priceOverride = basePrice - (basePrice * discountPercent) / 100;
    }

    const subscription = await paypalService.createSubscription(
      planId, returnUrl, cancelUrl, customId, priceOverride
    );

    res.json({
      subscriptionId: subscription.id,
      approvalUrl: subscription.links?.find(l => l.rel === 'approve')?.href,
    });
  } catch (err) {
    console.error('createPayPalSubscription error:', err);
    res.status(500).json({ error: err.message || 'Failed to create PayPal subscription' });
  }
};

// ── PayPal: Create Order (one-time / lifetime) ──

const createPayPalOrder = async (req, res) => {
  try {
    const { productId } = req.body;
    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const product = await req.prisma.product.findUnique({ where: { id: parseInt(productId) } });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.lifetimePrice <= 0) {
      return res.status(400).json({ error: 'This product has no lifetime price' });
    }

    const userId = req.user.id;

    // Calculate discount
    const activeCount = await req.prisma.userProduct.count({ where: { userId, status: 'active' } });
    const totalAfter = activeCount + 1;
    const discountPercent = calculateDiscount(totalAfter);
    const basePrice = product.lifetimePrice;
    const finalAmount = basePrice - (basePrice * discountPercent) / 100;

    const customId = JSON.stringify({ userId, productId: parseInt(productId), billingCycle: 'lifetime' });

    const order = await paypalService.createOrder(
      finalAmount,
      `${product.name} — Lifetime`,
      customId
    );

    res.json({ orderId: order.id });
  } catch (err) {
    console.error('createPayPalOrder error:', err);
    res.status(500).json({ error: err.message || 'Failed to create PayPal order' });
  }
};

// ── PayPal: Capture Order (frontend calls after user approves) ──

const capturePayPalOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const capture = await paypalService.captureOrder(orderId);

    const captureUnit = capture.purchase_units?.[0];
    const captureDetail = captureUnit?.payments?.captures?.[0];
    const customId = captureDetail?.custom_id || captureUnit?.custom_id;

    if (!customId) {
      return res.status(400).json({ error: 'Missing custom_id in order' });
    }

    const { userId, productId, billingCycle } = JSON.parse(customId);

    // Verify the user making the request matches the order
    if (userId !== req.user.id) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    const product = await req.prisma.product.findUnique({ where: { id: productId } });
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const amount = parseFloat(captureDetail?.amount?.value || product.lifetimePrice);

    // Create/update UserProduct
    const userProduct = await req.prisma.userProduct.upsert({
      where: { userId_productId: { userId, productId } },
      create: {
        userId,
        productId,
        billingCycle: 'lifetime',
        amount,
        discountApplied: calculateDiscount(
          (await req.prisma.userProduct.count({ where: { userId, status: 'active' } })) + 1
        ),
        status: 'active',
        paypalOrderId: orderId,
        paymentMethod: 'paypal',
      },
      update: {
        billingCycle: 'lifetime',
        amount,
        status: 'active',
        paypalOrderId: orderId,
        paymentMethod: 'paypal',
      },
      include: { product: true },
    });

    // Record transaction
    await req.prisma.transaction.create({
      data: {
        userId,
        userProductId: userProduct.id,
        paypalTransactionId: captureDetail?.id || null,
        paypalOrderId: orderId,
        type: 'one_time',
        amount,
        currency: captureDetail?.amount?.currency_code || 'USD',
        status: 'completed',
        paypalPayerEmail: capture.payer?.email_address || null,
        rawPayload: JSON.stringify(capture),
      },
    });

    await syncUserFlags(req.prisma, userId);

    res.json({ userProduct, captureStatus: capture.status });
  } catch (err) {
    console.error('capturePayPalOrder error:', err);
    res.status(500).json({ error: err.message || 'Failed to capture PayPal order' });
  }
};

// ── PayPal: Webhook Handler ──

const handlePayPalWebhook = async (req, res) => {
  try {
    // Verify webhook signature
    const verified = await paypalService.verifyWebhookSignature(req.headers, req.body);
    if (!verified) {
      console.warn('PayPal webhook verification failed');
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }

    const event = req.body;
    const eventType = event.event_type;
    const resource = event.resource;

    console.log(`PayPal webhook: ${eventType}`);

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED': {
        const subscriptionId = resource.id;
        const customId = resource.custom_id;
        if (!customId) break;

        const { userId, productId, billingCycle } = JSON.parse(customId);
        const product = await req.prisma.product.findUnique({ where: { id: productId } });
        if (!product) break;

        const basePrice = getPriceForCycle(product, billingCycle);
        const activeCount = await req.prisma.userProduct.count({ where: { userId, status: 'active' } });
        const discountPercent = calculateDiscount(activeCount + 1);
        const amount = basePrice - (basePrice * discountPercent) / 100;

        await req.prisma.userProduct.upsert({
          where: { userId_productId: { userId, productId } },
          create: {
            userId,
            productId,
            billingCycle,
            amount,
            discountApplied: discountPercent,
            status: 'active',
            paypalSubscriptionId: subscriptionId,
            paymentMethod: 'paypal',
          },
          update: {
            billingCycle,
            amount,
            status: 'active',
            paypalSubscriptionId: subscriptionId,
            paymentMethod: 'paypal',
          },
        });

        await syncUserFlags(req.prisma, userId);
        break;
      }

      case 'PAYMENT.SALE.COMPLETED': {
        const saleId = resource.id;
        const subscriptionId = resource.billing_agreement_id;
        const amount = parseFloat(resource.amount?.total || 0);
        const currency = resource.amount?.currency || 'USD';
        const payerEmail = resource.payer?.email_address || null;

        // Find the UserProduct by subscription ID
        let userProduct = null;
        if (subscriptionId) {
          userProduct = await req.prisma.userProduct.findFirst({
            where: { paypalSubscriptionId: subscriptionId },
          });
        }

        if (userProduct) {
          // Calculate next payment date
          const now = new Date();
          let nextDate = new Date(now);
          switch (userProduct.billingCycle) {
            case 'monthly': nextDate.setMonth(nextDate.getMonth() + 1); break;
            case 'quarterly': nextDate.setMonth(nextDate.getMonth() + 3); break;
            case 'annual': nextDate.setFullYear(nextDate.getFullYear() + 1); break;
          }

          await req.prisma.userProduct.update({
            where: { id: userProduct.id },
            data: { nextPaymentDate: nextDate, status: 'active' },
          });

          await req.prisma.transaction.create({
            data: {
              userId: userProduct.userId,
              userProductId: userProduct.id,
              paypalTransactionId: saleId,
              paypalSubscriptionId: subscriptionId,
              type: 'subscription_payment',
              amount,
              currency,
              status: 'completed',
              paypalPayerEmail: payerEmail,
              rawPayload: JSON.stringify(event),
            },
          });
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.CANCELLED': {
        const subscriptionId = resource.id;
        const userProduct = await req.prisma.userProduct.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
        });
        if (userProduct) {
          await req.prisma.userProduct.update({
            where: { id: userProduct.id },
            data: { status: 'cancelled' },
          });
          await syncUserFlags(req.prisma, userProduct.userId);
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.SUSPENDED': {
        const subscriptionId = resource.id;
        const userProduct = await req.prisma.userProduct.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
        });
        if (userProduct) {
          await req.prisma.userProduct.update({
            where: { id: userProduct.id },
            data: { status: 'past_due' },
          });
          await syncUserFlags(req.prisma, userProduct.userId);
        }
        break;
      }

      case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED': {
        const subscriptionId = resource.id;
        const userProduct = await req.prisma.userProduct.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
        });
        if (userProduct) {
          await req.prisma.userProduct.update({
            where: { id: userProduct.id },
            data: { status: 'past_due' },
          });

          await req.prisma.transaction.create({
            data: {
              userId: userProduct.userId,
              userProductId: userProduct.id,
              paypalSubscriptionId: subscriptionId,
              type: 'subscription_payment',
              amount: 0,
              status: 'failed',
              rawPayload: JSON.stringify(event),
            },
          });
          await syncUserFlags(req.prisma, userProduct.userId);
        }
        break;
      }

      case 'PAYMENT.SALE.REFUNDED': {
        const saleId = resource.sale_id;
        const refundAmount = parseFloat(resource.amount?.total || 0);

        // Find original transaction
        const originalTx = await req.prisma.transaction.findFirst({
          where: { paypalTransactionId: saleId },
        });

        await req.prisma.transaction.create({
          data: {
            userId: originalTx?.userId || 0,
            userProductId: originalTx?.userProductId || null,
            paypalTransactionId: resource.id,
            type: 'refund',
            amount: refundAmount,
            currency: resource.amount?.currency || 'USD',
            status: 'refunded',
            rawPayload: JSON.stringify(event),
          },
        });
        break;
      }

      case 'BILLING.SUBSCRIPTION.EXPIRED': {
        const subscriptionId = resource.id;
        const userProduct = await req.prisma.userProduct.findFirst({
          where: { paypalSubscriptionId: subscriptionId },
        });
        if (userProduct) {
          await req.prisma.userProduct.update({
            where: { id: userProduct.id },
            data: { status: 'cancelled' },
          });
          await syncUserFlags(req.prisma, userProduct.userId);
        }
        break;
      }

      case 'CHECKOUT.ORDER.COMPLETED': {
        // Safety net for credit purchases: if frontend capture call failed but payment went through
        const orderUnit = resource.purchase_units?.[0];
        const orderCustomId = orderUnit?.custom_id;
        if (!orderCustomId) break;

        try {
          const orderParsed = JSON.parse(orderCustomId);
          if (orderParsed.type !== 'credit_purchase') break;

          const orderId = resource.id;
          // Check if already recorded
          const existing = await req.prisma.creditPurchase.findUnique({
            where: { paypalOrderId: orderId },
          });
          if (existing) break; // Already captured via frontend

          const captureDetail = orderUnit?.payments?.captures?.[0];

          await req.prisma.$transaction([
            req.prisma.creditPurchase.create({
              data: {
                userId: orderParsed.userId,
                amount: orderParsed.amount,
                credits: orderParsed.amount,
                paypalOrderId: orderId,
                paypalTransactionId: captureDetail?.id || null,
                paypalPayerEmail: resource.payer?.email_address || null,
                status: 'completed',
                rawPayload: JSON.stringify(event),
              },
            }),
            req.prisma.user.update({
              where: { id: orderParsed.userId },
              data: { vapiCredits: { increment: orderParsed.amount } },
            }),
          ]);

          console.log(`Credit purchase webhook: added $${orderParsed.amount} credits for user ${orderParsed.userId}`);
        } catch (parseErr) {
          console.error('CHECKOUT.ORDER.COMPLETED handling error:', parseErr);
        }
        break;
      }

      default:
        console.log(`Unhandled PayPal webhook event: ${eventType}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('handlePayPalWebhook error:', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// ── Credit Loading: Create Order ──

const createCreditOrder = async (req, res) => {
  try {
    const { amount } = req.body;
    const parsed = parseFloat(amount);

    if (!amount || isNaN(parsed) || parsed < 1 || parsed > 500) {
      return res.status(400).json({ error: 'Amount must be between $1.00 and $500.00' });
    }

    const userId = req.user.id;
    const customId = JSON.stringify({ userId, type: 'credit_purchase', amount: parsed });

    const order = await paypalService.createOrder(
      parsed,
      `Credit Load — $${parsed.toFixed(2)}`,
      customId
    );

    res.json({ orderId: order.id });
  } catch (err) {
    console.error('createCreditOrder error:', err);
    res.status(500).json({ error: err.message || 'Failed to create credit order' });
  }
};

// ── Credit Loading: Capture Order ──

const captureCreditOrder = async (req, res) => {
  try {
    const { orderId } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId is required' });

    const capture = await paypalService.captureOrder(orderId);

    const captureUnit = capture.purchase_units?.[0];
    const captureDetail = captureUnit?.payments?.captures?.[0];
    const customId = captureDetail?.custom_id || captureUnit?.custom_id;

    if (!customId) {
      return res.status(400).json({ error: 'Missing custom_id in order' });
    }

    const parsed = JSON.parse(customId);

    if (parsed.type !== 'credit_purchase') {
      return res.status(400).json({ error: 'This order is not a credit purchase' });
    }

    if (parsed.userId !== req.user.id) {
      return res.status(403).json({ error: 'Order does not belong to this user' });
    }

    const creditAmount = parsed.amount;

    // Create CreditPurchase record and increment user credits atomically
    const [creditPurchase, updatedUser] = await req.prisma.$transaction([
      req.prisma.creditPurchase.create({
        data: {
          userId: parsed.userId,
          amount: creditAmount,
          credits: creditAmount,
          paypalOrderId: orderId,
          paypalTransactionId: captureDetail?.id || null,
          paypalPayerEmail: capture.payer?.email_address || null,
          status: 'completed',
          rawPayload: JSON.stringify(capture),
        },
      }),
      req.prisma.user.update({
        where: { id: parsed.userId },
        data: { vapiCredits: { increment: creditAmount } },
      }),
    ]);

    res.json({
      creditPurchase,
      newBalance: updatedUser.vapiCredits,
    });
  } catch (err) {
    // Handle duplicate paypalOrderId (already captured)
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'This order has already been captured' });
    }
    console.error('captureCreditOrder error:', err);
    res.status(500).json({ error: err.message || 'Failed to capture credit order' });
  }
};

// ── Transaction History ──

const getTransactionHistory = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = req.user.role === 'OWNER' ? {} : { userId: req.user.id };

    const [transactions, total] = await Promise.all([
      req.prisma.transaction.findMany({
        where,
        include: {
          user: { select: { id: true, name: true, email: true } },
          userProduct: { include: { product: { select: { name: true, slug: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      req.prisma.transaction.count({ where }),
    ]);

    res.json({ transactions, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('getTransactionHistory error:', err);
    res.status(500).json({ error: 'Failed to get transactions' });
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
  // PayPal
  createCreditOrder,
  captureCreditOrder,
  syncProductToPayPal,
  createPayPalSubscription,
  createPayPalOrder,
  capturePayPalOrder,
  handlePayPalWebhook,
  getTransactionHistory,
};
