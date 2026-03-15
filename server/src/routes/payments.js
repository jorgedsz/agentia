const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// Products
router.get('/products', paymentController.listProducts);
router.get('/products/:id', paymentController.getProduct);
router.post('/products', requireRole(ROLES.OWNER), paymentController.createProduct);
router.put('/products/:id', requireRole(ROLES.OWNER), paymentController.updateProduct);
router.delete('/products/:id', requireRole(ROLES.OWNER), paymentController.deleteProduct);

// User Products
router.get('/user-products', paymentController.listUserProducts);
router.get('/user-products/:userId', paymentController.getUserProducts);
router.post('/user-products/:userId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.assignUserProducts);
router.put('/user-products/:userId/:productId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.updateUserProduct);
router.delete('/user-products/:userId/:productId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.removeUserProduct);

// Catalog & Purchase (any authenticated user)
router.get('/catalog', paymentController.getCatalog);
router.post('/purchase', paymentController.purchase);
router.post('/preview', paymentController.previewPurchase);

module.exports = router;
