const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { createCall, getCall, listCalls } = require('../controllers/callController');

// All routes require authentication
router.use(authMiddleware);

// POST /api/calls - Create a new outbound call
router.post('/', createCall);

// GET /api/calls - List all calls
router.get('/', listCalls);

// GET /api/calls/:id - Get call details
router.get('/:id', getCall);

module.exports = router;
