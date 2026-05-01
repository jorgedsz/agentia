const express = require('express');
const router = express.Router();
const chatbotSqlController = require('../controllers/chatbotSqlController');

// Public — chatbot tools call these endpoints (no auth required)
router.post('/search-knowledge-base', chatbotSqlController.searchKnowledgeBase);

module.exports = router;
