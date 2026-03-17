const express = require('express');
const router = express.Router();
const chatbotCallController = require('../controllers/chatbotCallController');

// Public — chatbot tools call these endpoints (no auth required)
router.post('/trigger', chatbotCallController.triggerCall);
router.post('/schedule', chatbotCallController.scheduleCall);

module.exports = router;
