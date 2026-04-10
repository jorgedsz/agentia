const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const telephonyController = require('../controllers/telephonyController');

// All routes require authentication
router.use(authMiddleware);

// Credentials CRUD
router.post('/credentials', telephonyController.saveCredentials);
router.get('/credentials', telephonyController.getCredentials);
router.put('/credentials/:id', telephonyController.updateCredentials);
router.delete('/credentials/:id', telephonyController.deleteCredentials);

// Verify credentials with provider API
router.post('/credentials/:id/verify', telephonyController.verifyCredentials);

// Get account balances (Twilio + VAPI)
router.get('/balances', telephonyController.getBalances);

module.exports = router;
