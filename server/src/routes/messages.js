const express = require('express');
const router = express.Router();
const { logExternalMessage } = require('../controllers/messageLogController');

// Public, API-key-authenticated endpoint for external agents to log messages
// into Messages Logs and charge the account's credits.
// POST /api/messages/log
router.post('/log', logExternalMessage);

module.exports = router;
