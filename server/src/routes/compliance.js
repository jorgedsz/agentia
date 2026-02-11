const express = require('express');
const router = express.Router();
const complianceController = require('../controllers/complianceController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/compliance/settings - Get compliance settings for current account
router.get('/settings', complianceController.getSettings);

// PUT /api/compliance/settings - Update compliance settings
router.put('/settings', complianceController.updateSettings);

// GET /api/compliance/audit-logs - Get paginated audit logs
router.get('/audit-logs', complianceController.getAuditLogs);

module.exports = router;
