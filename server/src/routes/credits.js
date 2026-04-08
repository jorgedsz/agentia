const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getCredits, updateCredits, listCredits, purchaseCredits } = require('../controllers/creditsController');

// All routes require authentication
router.use(authMiddleware);

// List all users with credits (filtered by role)
router.get('/', listCredits);

// Purchase credits via Whop checkout
router.post('/purchase', purchaseCredits);

// Get credits for a specific user
router.get('/:userId', getCredits);

// Update credits for a user
router.post('/:userId', updateCredits);

module.exports = router;
