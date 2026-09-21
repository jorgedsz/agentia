const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/billingPeriodController');

// Admin-side: the OWNER, or the partner above the account (checked per request).
router.use(authMiddleware);

router.get('/:userId', controller.list);
// Literal paths first, so "report" and "cycle" are never read as a period id.
router.get('/:userId/report', controller.rangeReport);
router.get('/:userId/cycle', controller.cyclePlan);
router.put('/:userId/cycle', controller.updateCycle);
router.post('/:userId/cycle/run', controller.runCycle);
router.get('/:userId/:periodId', controller.detail);
router.post('/:userId/:periodId/charge', controller.charge);
router.post('/:userId/:periodId/mark-paid', controller.markPaid);

module.exports = router;
