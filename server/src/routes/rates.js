const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { getRates, updateRates, syncBilling } = require('../controllers/ratesController');

// All routes require authentication
router.use(authMiddleware);

// GET /api/rates - Get current rates
router.get('/', getRates);

// PUT /api/rates - Update rates (OWNER only)
router.put('/', updateRates);

// POST /api/rates/sync-billing - Sync and bill calls
router.post('/sync-billing', syncBilling);

module.exports = router;
