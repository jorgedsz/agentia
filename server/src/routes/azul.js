const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/azulController');

// Public: verified by the pagos-azul signature, not by a session.
router.post('/webhook', handleWebhook);

module.exports = router;
