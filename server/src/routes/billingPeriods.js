const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/billingPeriodController');

// Admin-side: the OWNER, or the partner above the account (checked per request).
router.use(authMiddleware);

router.get('/:userId', controller.list);
router.get('/:userId/:periodId', controller.detail);
router.post('/:userId/:periodId/charge', controller.charge);
router.post('/:userId/:periodId/mark-paid', controller.markPaid);

module.exports = router;
