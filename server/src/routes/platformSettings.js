const express = require('express');
const router = express.Router();
const platformSettingsController = require('../controllers/platformSettingsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/platform-settings - Get current settings (masked)
router.get('/', platformSettingsController.getSettings);

// GET /api/platform-settings/vapi-public-key - Get decrypted VAPI public key (any authenticated user)
router.get('/vapi-public-key', platformSettingsController.getVapiPublicKey);

// PUT /api/platform-settings - Update settings
router.put('/', platformSettingsController.updateSettings);

module.exports = router;
