const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const callbackController = require('../controllers/callbackController');

// Public — VAPI tool calls this endpoint
router.post('/schedule', callbackController.scheduleCallback);

// Protected — requires auth
router.get('/', authMiddleware, callbackController.listCallbacks);
router.patch('/:id', authMiddleware, callbackController.updateCallback);
router.delete('/:id', authMiddleware, callbackController.deleteCallback);

module.exports = router;
