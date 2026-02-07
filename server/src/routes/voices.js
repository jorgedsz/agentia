const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/voices - List all available voices
router.get('/', voiceController.listVoices);

module.exports = router;
