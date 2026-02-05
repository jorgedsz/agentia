const express = require('express');
const router = express.Router();
const platformSettingsController = require('../controllers/platformSettingsController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/platform-settings - Get current settings (masked)
router.get('/', platformSettingsController.getSettings);

// PUT /api/platform-settings - Update settings
router.put('/', platformSettingsController.updateSettings);

module.exports = router;
