const express = require('express');
const router = express.Router();
const promptGeneratorController = require('../controllers/promptGeneratorController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// POST /api/prompt-generator/generate
router.post('/generate', promptGeneratorController.generatePrompt);

module.exports = router;
