const express = require('express');
const router = express.Router();
const demoController = require('../controllers/demoController');
const { demoLimiter, demoChatLimiter } = require('../middleware/rateLimiter');

router.post('/generate', demoLimiter, demoController.generateDemo);
router.post('/chat', demoChatLimiter, demoController.chatDemo);
router.get('/vapi-key', demoLimiter, demoController.getDemoVapiKey);

module.exports = router;
