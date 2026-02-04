const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const accountSwitchController = require('../controllers/accountSwitchController');
const authMiddleware = require('../middleware/authMiddleware');

// POST /api/auth/register - Register new user
router.post('/register', authController.register);

// POST /api/auth/login - Login user
router.post('/login', authController.login);

// GET /api/auth/me - Get current user (protected)
router.get('/me', authMiddleware, authController.getMe);

// Account switching (impersonation) routes
router.get('/accessible-accounts', authMiddleware, accountSwitchController.getAccessibleAccounts);
router.post('/switch-account', authMiddleware, accountSwitchController.switchAccount);
router.post('/switch-back', authMiddleware, accountSwitchController.switchBack);

module.exports = router;
