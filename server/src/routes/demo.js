const express = require('express');
const router = express.Router();
const demoController = require('../controllers/demoController');
router.post('/generate', demoController.generateDemo);
router.post('/chat', demoController.chatDemo);
router.get('/vapi-key', demoController.getDemoVapiKey);

module.exports = router;
