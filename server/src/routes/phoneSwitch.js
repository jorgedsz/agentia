const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole, ROLES } = require('../middleware/roleMiddleware');
const {
  listSwitchableAgents,
  switchPhoneAgent,
  adminListAccountAgents,
  adminSetSwitchableAgents,
} = require('../controllers/phoneSwitchController');

// Public, API-key-authenticated (clientId + apiKey) so an external system can move
// a phone number between the account's own switch-enabled agents.
router.get('/agents', listSwitchableAgents);
router.post('/', switchPhoneAgent);

// OWNER: curate which of an account's agents the phone-switch API may use.
router.get('/admin/:userId/agents', authMiddleware, requireRole(ROLES.OWNER), adminListAccountAgents);
router.put('/admin/:userId/agents', authMiddleware, requireRole(ROLES.OWNER), adminSetSwitchableAgents);

module.exports = router;
