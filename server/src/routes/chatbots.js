const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const authMiddleware = require('../middleware/authMiddleware');

// Public endpoints — no auth required
router.post('/:id/webhook', chatbotController.webhookProxy);
router.post('/:id/ghl-respond', chatbotController.ghlRespond);

// All other chatbot routes are protected
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

// DELETE /api/chatbots/:id - Delete chatbot
router.delete('/:id', chatbotController.deleteChatbot);

// POST /api/chatbots/:id/test - Test chatbot with streaming chat
router.post('/:id/test', chatbotController.testChatbot);

// POST /api/chatbots/:id/sync-workflow - Regenerate n8n workflow from current config
router.post('/:id/sync-workflow', chatbotController.syncWorkflow);

// POST /api/chatbots/:id/clear-memory - Flush the n8n memory buffer for every session
router.post('/:id/clear-memory', chatbotController.clearMemory);

module.exports = router;
