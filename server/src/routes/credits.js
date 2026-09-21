const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getCredits,
  updateCredits,
  listCredits,
  purchaseCredits,
  setupCard,
  removeCard,
  getAutoRecharge,
  updateAutoRecharge,
  rechargeNow,
  getBalanceExternal,
  getUsageByAgentExternal,
  getCallsExternal,
  getMessagesExternal,
  getCardStatus,
  chargeCardForUser,
} = require('../controllers/creditsController');
const { adjustBalance, listAdjustments } = require('../controllers/creditAdjustmentController');

// Public, API-key-authenticated (clientId + apiKey) reads for external systems.
// Declared before authMiddleware and before the '/:userId' param route.
router.get('/balance', getBalanceExternal);
// Moving a balance by hand (marketing credit, correction). Authenticated with
// the CALLER's API key — an account may never top itself up.
router.post('/adjust', adjustBalance);
router.get('/adjustments', listAdjustments);
router.get('/usage-by-agent', getUsageByAgentExternal);
router.get('/calls', getCallsExternal);
router.get('/messages', getMessagesExternal);

// All routes below require authentication
router.use(authMiddleware);

// List all users with credits (filtered by role)
router.get('/', listCredits);

// Purchase credits via Whop checkout
router.post('/purchase', purchaseCredits);

// ── Auto-recharge / saved card (self-service) ──
// NOTE: declared before the '/:userId' routes so these literal paths match first.
router.post('/setup-card', setupCard);
router.delete('/card', removeCard);
router.get('/auto-recharge', getAutoRecharge);
router.put('/auto-recharge', updateAutoRecharge);
router.post('/recharge-now', rechargeNow);

// Collect from an account's saved card (OWNER, or the partner above it)
router.get('/:userId/card', getCardStatus);
router.post('/:userId/charge-card', chargeCardForUser);

// Get credits for a specific user
router.get('/:userId', getCredits);

// Update credits for a user
router.post('/:userId', updateCredits);

module.exports = router;
