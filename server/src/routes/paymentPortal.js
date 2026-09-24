const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { authLimiter } = require('../middleware/rateLimiter');
const controller = require('../controllers/paymentPortalController');

// Admin — issue or rotate an account's payment link, and set the key that lets
// someone approve budget requests from that page. Declared before the public
// ':token' routes so "admin" is never read as a token.
router.get('/admin/:userId/link', authMiddleware, controller.getLink);
router.post('/admin/:userId/link', authMiddleware, controller.createLink);
router.put('/admin/:userId/approval-key', authMiddleware, controller.setApprovalKey);

// Public — the client's payment page, addressed by its own token.
router.get('/:token', controller.getBilling);
router.post('/:token/checkout', controller.startCheckout);
router.post('/:token/save-card', controller.startCardSetup);
router.post('/:token/confirm', controller.confirmPayment);

// The same token, showing everything at once: what is owed, the balance, a
// top-up, the budgets and the money asked for them.
router.get('/:token/wallet', controller.getWallet);
router.post('/:token/top-up', controller.startTopUp);
router.post('/:token/requests', controller.createWalletRequest);
// Approving here is guarded by a key, so it is rate limited like a login.
router.post('/:token/requests/:id/approve', authLimiter, controller.approveWalletRequest);

module.exports = router;
