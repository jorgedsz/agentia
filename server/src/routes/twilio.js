const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const twilioController = require('../controllers/twilioController');

// All routes require authentication
router.use(authMiddleware);

// Credentials CRUD
router.post('/credentials', twilioController.saveCredentials);
router.get('/credentials', twilioController.getCredentials);
router.put('/credentials', twilioController.updateCredentials);
router.delete('/credentials', twilioController.deleteCredentials);

// Verify credentials with Twilio API
router.post('/credentials/verify', twilioController.verifyCredentials);

// Get account balances (Twilio + VAPI)
router.get('/balances', twilioController.getBalances);

module.exports = router;
