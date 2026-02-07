const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { createCall, getCall, listCalls, getAnalytics, updateOutcome } = require('../controllers/callController');

// All routes require authentication
router.use(authMiddleware);

// POST /api/calls - Create a new outbound call
router.post('/', createCall);

// GET /api/calls/analytics - Analytics data (BEFORE /:id to avoid conflict)
router.get('/analytics', getAnalytics);

// GET /api/calls - List all calls
router.get('/', listCalls);

// PATCH /api/calls/:id/outcome - Manual outcome override
router.patch('/:id/outcome', updateOutcome);

// GET /api/calls/:id - Get call details
router.get('/:id', getCall);

module.exports = router;
