const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const projectController = require('../controllers/projectController');

router.use(authMiddleware);

router.get('/', projectController.listProjects);
router.get('/stats', projectController.getProjectStats);
router.get('/:id', projectController.getProject);
router.put('/:id', projectController.updateProject);
router.get('/:id/messages', projectController.getProjectMessages);
router.get('/:id/alerts', projectController.getProjectAlerts);
router.post('/:id/chat', projectController.chatWithPMAgent);

module.exports = router;
