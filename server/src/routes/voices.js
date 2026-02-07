const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// GET /api/voices - List all available voices
router.get('/', voiceController.listVoices);

// GET /api/voices/custom - List custom voices (OWNER only)
router.get('/custom', voiceController.listCustomVoices);

// POST /api/voices/custom - Add custom voice (OWNER only)
router.post('/custom', voiceController.addCustomVoice);

// DELETE /api/voices/custom/:id - Delete custom voice (OWNER only)
router.delete('/custom/:id', voiceController.deleteCustomVoice);

module.exports = router;
