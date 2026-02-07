const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');

// All agent routes are protected
router.use(authMiddleware);

// GET /api/agents - List user's agents
router.get('/', agentController.getAgents);

// GET /api/agents/:id - Get single agent
router.get('/:id', agentController.getAgent);

// POST /api/agents - Create new agent
router.post('/', agentController.createAgent);

// PUT /api/agents/:id - Update agent
router.put('/:id', agentController.updateAgent);

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', agentController.deleteAgent);

// GET /api/agents/:id/vapi-sync - Debug: check VAPI sync status
router.get('/:id/vapi-sync', agentController.checkVapiSync);

module.exports = router;
