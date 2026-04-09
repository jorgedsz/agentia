const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const chatbotFollowUpController = require('../controllers/chatbotFollowUpController');

router.get('/logs', authMiddleware, chatbotFollowUpController.getFollowUpLogs);

module.exports = router;
