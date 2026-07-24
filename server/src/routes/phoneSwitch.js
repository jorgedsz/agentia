const express = require('express');
const router = express.Router();
const { listSwitchableAgents, switchPhoneAgent } = require('../controllers/phoneSwitchController');

// Public, API-key-authenticated (clientId + apiKey) so an external system can move
// a phone number between the account's own switch-enabled agents.
router.get('/agents', listSwitchableAgents);
router.post('/', switchPhoneAgent);

module.exports = router;
