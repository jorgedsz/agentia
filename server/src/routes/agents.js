const express = require('express');
const router = express.Router();
const agentController = require('../controllers/agentController');
const authMiddleware = require('../middleware/authMiddleware');

// Public share-link endpoints (token-gated, quota-limited) — no auth
router.get('/:id/public-share/:token/info', agentController.getPublicAgentInfo);
router.post('/:id/public-share/:token/call-start', agentController.postPublicAgentCallStart);

// All other agent routes are protected
router.use(authMiddleware);

// GET /api/agents - List user's agents
router.get('/', agentController.getAgents);

// GET /api/agents/:id - Get single agent
router.get('/:id', agentController.getAgent);

// POST /api/agents - Create new agent
router.post('/', agentController.createAgent);

// PUT /api/agents/:id - Update agent
router.put('/:id', agentController.updateAgent);

// POST /api/agents/:id/duplicate - Duplicate agent
router.post('/:id/duplicate', agentController.duplicateAgent);

// POST /api/agents/import - Import agent from another account by id
router.post('/import', agentController.importAgent);

// Share-link management (auth'd, owner only)
router.post('/:id/share/enable', agentController.enableAgentShare);
router.post('/:id/share/regenerate', agentController.regenerateAgentShareToken);
router.post('/:id/share/disable', agentController.disableAgentShare);
router.put('/:id/share/limits', agentController.updateAgentShareLimits);

// DELETE /api/agents/:id - Delete agent
router.delete('/:id', agentController.deleteAgent);

// GET /api/agents/:id/vapi-sync - Debug: check VAPI sync status
router.get('/:id/vapi-sync', agentController.checkVapiSync);

module.exports = router;
