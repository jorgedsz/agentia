const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const portalController = require('../controllers/portalController');

// Auth required — generate portal token
router.post('/generate/:id', authMiddleware, portalController.generateToken);

// Public — get client portal by token
router.get('/:token', portalController.getByToken);

// Public — get session detail by token
router.get('/:token/sessions/:sessionId', portalController.getSessionByToken);

module.exports = router;
