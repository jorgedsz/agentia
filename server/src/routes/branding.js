const express = require('express');
const router = express.Router();
const brandingController = require('../controllers/brandingController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/branding - Get current branding
router.get('/', brandingController.getBranding);

// PUT /api/branding - Update branding (OWNER and AGENCY only)
router.put('/', brandingController.updateBranding);

module.exports = router;
