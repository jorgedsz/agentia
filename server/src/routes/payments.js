const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');

router.use(authMiddleware);

// Plan Tiers
router.get('/tiers', paymentController.listPlanTiers);
router.get('/tiers/:id', paymentController.getPlanTier);
router.post('/tiers', requireRole(ROLES.OWNER), paymentController.createPlanTier);
router.put('/tiers/:id', requireRole(ROLES.OWNER), paymentController.updatePlanTier);
router.delete('/tiers/:id', requireRole(ROLES.OWNER), paymentController.deletePlanTier);

// User Plans
router.get('/plans', paymentController.listUserPlans);
router.get('/plans/:userId', paymentController.getUserPlan);
router.post('/plans/:userId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.assignUserPlan);
router.put('/plans/:userId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.updateUserPlan);
router.delete('/plans/:userId', requireRole(ROLES.OWNER, ROLES.AGENCY), paymentController.removeUserPlan);

module.exports = router;
