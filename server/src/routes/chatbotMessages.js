const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { listMessages, getMessageAnalytics, getMessageDetail } = require('../controllers/chatbotMessageController');

router.get('/analytics', authMiddleware, getMessageAnalytics);
router.get('/', authMiddleware, listMessages);
router.get('/:id', authMiddleware, getMessageDetail);

module.exports = router;
