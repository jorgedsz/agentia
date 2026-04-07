const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const tc = require('../controllers/trainingController');

router.post('/sessions', authMiddleware, tc.createSession);
router.get('/sessions', authMiddleware, tc.listSessions);
router.get('/sessions/:id', authMiddleware, tc.getSession);
router.post('/sessions/:id/complete', authMiddleware, tc.completeSession);
router.post('/sessions/:id/accept', authMiddleware, tc.acceptSession);
router.post('/sessions/:id/reject', authMiddleware, tc.rejectSession);

// Public — VAPI calls this during the training call
router.post('/propose-change', tc.proposeChange);

module.exports = router;
