const express = require('express');
const router = express.Router();
const vapiWebhookController = require('../controllers/vapiWebhookController');

// POST /api/vapi/events — receives VAPI server messages (no auth)
router.post('/events', vapiWebhookController.handleEvent);

module.exports = router;
