const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const {
  getModelRates,
  getTranscriberRates,
  updateModelRates,
  updateTranscriberRates
} = require('../controllers/pricingController');

router.use(authMiddleware);

// GET /api/pricing/models
router.get('/models', getModelRates);

// GET /api/pricing/transcribers
router.get('/transcribers', getTranscriberRates);

// PUT /api/pricing/models (OWNER or AGENCY)
router.put('/models', updateModelRates);

// PUT /api/pricing/transcribers (OWNER or AGENCY)
router.put('/transcribers', updateTranscriberRates);

module.exports = router;
