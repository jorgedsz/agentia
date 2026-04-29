const express = require('express');
const router = express.Router();
const chatbotController = require('../controllers/chatbotController');
const authMiddleware = require('../middleware/authMiddleware');

// Public endpoints — no auth required
router.post('/:id/webhook', chatbotController.webhookProxy);
router.post('/:id/ghl-respond', chatbotController.ghlRespond);
// Public share-link endpoints (token-gated, quota-limited)
router.get('/:id/public-share/:token/info', chatbotController.getPublicChatbotInfo);
router.post('/:id/public-share/:token/message', chatbotController.postPublicChatbotMessage);

// All other chatbot routes are protected
router.use(authMiddleware);

// GET /api/chatbots - List user's chatbots
router.get('/', chatbotController.getChatbots);

// GET /api/chatbots/:id - Get single chatbot
router.get('/:id', chatbotController.getChatbot);

// POST /api/chatbots/test-db-connection - Probe a Postgres connection for SQL agents
router.post('/test-db-connection', chatbotController.testDbConnection);

// POST /api/chatbots - Create new chatbot
router.post('/', chatbotController.createChatbot);

// POST /api/chatbots/import - Import chatbot from another account by id
router.post('/import', chatbotController.importChatbot);

// Share-link management (auth'd, owner only)
router.post('/:id/share/enable', chatbotController.enableChatbotShare);
router.post('/:id/share/regenerate', chatbotController.regenerateChatbotShareToken);
router.post('/:id/share/disable', chatbotController.disableChatbotShare);
router.put('/:id/share/limits', chatbotController.updateChatbotShareLimits);

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

// GET /api/chatbots/:id/executions - List recent n8n executions for this chatbot
router.get('/:id/executions', chatbotController.listExecutions);

// GET /api/chatbots/:id/executions/:executionId - Execution detail with ordered node runs
router.get('/:id/executions/:executionId', chatbotController.getExecutionDetail);

module.exports = router;
