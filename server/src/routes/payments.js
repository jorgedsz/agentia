const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

// ── PayPal Webhook (NO auth — PayPal calls this directly) ──
router.post('/webhooks/paypal', paymentController.handlePayPalWebhook);

// ── All other routes require authentication ──
router.use(authMiddleware);

// Products
router.get('/products', paymentController.listProducts);
router.get('/products/:id', paymentController.getProduct);
router.post('/products', requireRole(ROLES.OWNER), paymentController.createProduct);
router.put('/products/:id', requireRole(ROLES.OWNER), paymentController.updateProduct);
router.delete('/products/:id', requireRole(ROLES.OWNER), paymentController.deleteProduct);

// PayPal Product Sync (OWNER only)
router.post('/products/:id/sync-paypal', requireRole(ROLES.OWNER), paymentController.syncProductToPayPal);

// User Products
router.get('/user-products', paymentController.listUserProducts);
router.get('/user-products/:userId', paymentController.getUserProducts);
router.post('/user-products/:userId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.assignUserProducts);
router.put('/user-products/:userId/:productId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.updateUserProduct);
router.delete('/user-products/:userId/:productId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.removeUserProduct);

// Self-service (any authenticated user — operates on own account)
router.put('/my-products/:productId', paymentController.selfUpdateProduct);
router.delete('/my-products/:productId', paymentController.selfCancelProduct);

// Catalog & Purchase (any authenticated user)
router.get('/catalog', paymentController.getCatalog);
router.post('/purchase', paymentController.purchase);
router.post('/preview', paymentController.previewPurchase);

// PayPal checkout flows
router.post('/paypal/create-subscription', paymentController.createPayPalSubscription);
router.post('/paypal/create-order', paymentController.createPayPalOrder);
router.post('/paypal/capture-order', paymentController.capturePayPalOrder);

// Credit loading via PayPal
router.post('/paypal/create-credit-order', paymentController.createCreditOrder);
router.post('/paypal/capture-credit-order', paymentController.captureCreditOrder);

// Transactions
router.get('/transactions', paymentController.getTransactionHistory);

module.exports = router;
