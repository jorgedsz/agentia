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
} = require('../controllers/creditsController');

// All routes require authentication
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
