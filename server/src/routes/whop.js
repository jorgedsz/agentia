const express = require('express');
const router = express.Router();
const whopController = require('../controllers/whopController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

// Webhooks — public, need raw body (express.raw applied in index.js before JSON).
// The global company posts to /webhook; each partner (WHITELABEL with its own
// Whop) posts to /webhook/:token and is verified with that partner's secret.
router.post('/webhook', whopController.handleWebhook);
router.post('/webhook/:token', whopController.handleWebhook);

// All other routes require authentication
router.use(authMiddleware);

router.post('/create-checkout', whopController.createCheckout);
router.get('/membership-status', whopController.getMembershipStatus);
router.get('/credit-tiers', whopController.getCreditTiers);
router.post('/sync-products', requireRole(ROLES.OWNER), whopController.syncProducts);

// OWNER: manage a WHITELABEL partner's own Whop credentials (money routing).
router.get('/partner/:userId/config', requireRole(ROLES.OWNER), whopController.getPartnerWhopConfig);
router.put('/partner/:userId/config', requireRole(ROLES.OWNER), whopController.setPartnerWhopConfig);

module.exports = router;
