const express = require('express');
const router = express.Router();
const stripeController = require('../controllers/stripeController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

// Webhook — public, needs the raw body (express.raw is applied in index.js before
// express.json). Each partner with its own Stripe posts to /webhook/:token and is
// verified with that partner's signing secret; there is no platform-wide endpoint.
router.post('/webhook/:token', stripeController.handleWebhook);

// Everything below requires authentication
router.use(authMiddleware);

// OWNER: manage a partner's own Stripe credentials (money routing).
router.get('/partner/:userId/config', requireRole(ROLES.OWNER), stripeController.getPartnerStripeConfig);
router.put('/partner/:userId/config', requireRole(ROLES.OWNER), stripeController.setPartnerStripeConfig);

// OWNER: credit a Stripe payment whose webhook never landed.
router.post('/reconcile', requireRole(ROLES.OWNER), stripeController.reconcilePayment);

module.exports = router;
