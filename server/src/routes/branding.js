const express = require('express');
const router = express.Router();
const brandingController = require('../controllers/brandingController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/branding - Get current branding
router.get('/', brandingController.getBranding);

// PUT /api/branding - Update branding (OWNER and AGENCY only)
router.put('/', brandingController.updateBranding);

// PUT /api/branding/:userId - Set branding for a specific user (OWNER only)
router.put('/:userId', brandingController.setBrandingForUser);

module.exports = router;
