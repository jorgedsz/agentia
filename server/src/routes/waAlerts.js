const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const alertController = require('../controllers/alertController');

router.use(authMiddleware);

router.get('/', alertController.listAlerts);
router.patch('/:id/resolve', alertController.resolveAlert);
router.patch('/project/:projectId/resolve-all', alertController.resolveAllForProject);

module.exports = router;
