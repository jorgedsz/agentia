const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { listMessages, getMessageAnalytics, getMessageDetail, exportMessages } = require('../controllers/chatbotMessageController');

router.get('/analytics', authMiddleware, getMessageAnalytics);
router.get('/export', authMiddleware, exportMessages); // CSV (BEFORE /:id)
router.get('/', authMiddleware, listMessages);
router.get('/:id', authMiddleware, getMessageDetail);

module.exports = router;
