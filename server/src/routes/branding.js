const express = require('express');
const router = express.Router();
const brandingController = require('../controllers/brandingController');
const authMiddleware = require('../middleware/authMiddleware');

// Public — used by the login page to show whitelabel branding for custom
// domains. No auth: the response is intentionally just public branding
// (name, logo, tagline) and contains no PII.
router.get('/by-host', brandingController.getBrandingByHost);

router.use(authMiddleware);

// GET /api/branding - Get current branding
router.get('/', brandingController.getBranding);

// Domains this account is branded on. Declared before the "/:userId" routes
// below so "domains" is never read as an account id.
router.get('/domains', brandingController.getLoginDomains);
router.post('/domains', brandingController.addLoginDomain);
router.delete('/domains/:host', brandingController.removeLoginDomain);
// Same, for another account (OWNER)
router.get('/domains/of/:userId', brandingController.getLoginDomains);
router.post('/domains/of/:userId', brandingController.addLoginDomain);
router.delete('/domains/of/:userId/:host', brandingController.removeLoginDomain);

// PUT /api/branding - Update branding (OWNER and AGENCY only)
router.put('/', brandingController.updateBranding);

// PUT /api/branding/:userId - Set branding for a specific user (OWNER only)
router.put('/:userId', brandingController.setBrandingForUser);

module.exports = router;
