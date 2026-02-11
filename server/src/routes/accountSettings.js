const express = require('express');
const router = express.Router();
const accountSettingsController = require('../controllers/accountSettingsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/account-settings/vapi-keys - Get masked VAPI keys for current account
router.get('/vapi-keys', accountSettingsController.getVapiKeys);

// PUT /api/account-settings/vapi-keys - Update VAPI keys for current account
router.put('/vapi-keys', accountSettingsController.updateVapiKeys);

// GET /api/account-settings/vapi-public-key - Get decrypted VAPI public key (with fallback)
router.get('/vapi-public-key', accountSettingsController.getAccountVapiPublicKey);

// GET /api/account-settings/trigger-key - Check if trigger key exists (masked)
router.get('/trigger-key', accountSettingsController.getTriggerKey);

// POST /api/account-settings/generate-trigger-key - Generate a new trigger API key
router.post('/generate-trigger-key', accountSettingsController.generateTriggerKey);

module.exports = router;
