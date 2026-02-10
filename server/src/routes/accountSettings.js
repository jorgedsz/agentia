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

module.exports = router;
