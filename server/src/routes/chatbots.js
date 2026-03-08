const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const authMiddleware = require('../middleware/authMiddleware');

// All chatbot routes are protected
router.use(authMiddleware);

// GET /api/chatbots - List user's chatbots
router.get('/', chatbotController.getChatbots);

// GET /api/chatbots/:id - Get single chatbot
router.get('/:id', chatbotController.getChatbot);

// POST /api/chatbots - Create new chatbot
router.post('/', chatbotController.createChatbot);

// PUT /api/chatbots/:id - Update chatbot
router.put('/:id', chatbotController.updateChatbot);

// POST /api/chatbots/:id/toggle - Activate/deactivate chatbot
router.post('/:id/toggle', chatbotController.toggleChatbot);

module.exports = router;
