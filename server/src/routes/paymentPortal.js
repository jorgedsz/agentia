const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/paymentPortalController');

// Admin — issue or rotate an account's payment link. Declared before the public
// ':token' routes so "admin" is never read as a token.
router.get('/admin/:userId/link', authMiddleware, controller.getLink);
router.post('/admin/:userId/link', authMiddleware, controller.createLink);

// Public — the client's payment page, addressed by its own token.
router.get('/:token', controller.getBilling);
router.post('/:token/checkout', controller.startCheckout);
router.post('/:token/save-card', controller.startCardSetup);
router.post('/:token/confirm', controller.confirmPayment);

module.exports = router;
