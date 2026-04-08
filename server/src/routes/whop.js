const express = require('express');
const router = express.Router();
const whopController = require('../controllers/whopController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

// Webhook — public, needs raw body (express.raw applied in index.js before JSON middleware)
router.post('/webhook', express.raw({ type: 'application/json' }), whopController.handleWebhook);

// All other routes require authentication
router.use(authMiddleware);

router.post('/create-checkout', whopController.createCheckout);
router.get('/membership-status', whopController.getMembershipStatus);
router.get('/credit-tiers', whopController.getCreditTiers);
router.post('/sync-products', requireRole(ROLES.OWNER), whopController.syncProducts);

module.exports = router;
