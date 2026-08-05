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
} = require('../controllers/creditsController');

// Public, API-key-authenticated (clientId + apiKey) reads for external systems.
// Declared before authMiddleware and before the '/:userId' param route.
router.get('/balance', getBalanceExternal);
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

// Get credits for a specific user
router.get('/:userId', getCredits);

// Update credits for a user
router.post('/:userId', updateCredits);

module.exports = router;
