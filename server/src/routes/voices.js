const express = require('express');
const router = express.Router();
const voiceController = require('../controllers/voiceController');
const authMiddleware = require('../middleware/authMiddleware');

// Public route - no auth needed (domain-whitelisted proxy)
router.get('/audio-proxy', voiceController.proxyAudio);

router.use(authMiddleware);

// GET /api/voices - List all available voices
router.get('/', voiceController.listVoices);

// GET /api/voices/custom - List custom voices (OWNER only)
router.get('/custom', voiceController.listCustomVoices);

// POST /api/voices/custom - Add custom voice (OWNER only)
router.post('/custom', voiceController.addCustomVoice);

// PATCH /api/voices/custom/:id/refresh - Refresh metadata from ElevenLabs (OWNER only)
router.patch('/custom/:id/refresh', voiceController.refreshCustomVoice);

// DELETE /api/voices/custom/:id - Delete custom voice (OWNER only)
router.delete('/custom/:id', voiceController.deleteCustomVoice);

module.exports = router;
