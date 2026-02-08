const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const chatController = require('../controllers/chatController');

router.use(authMiddleware);

router.post('/', chatController.sendMessage);

module.exports = router;
