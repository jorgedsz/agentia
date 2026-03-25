const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const botConfigController = require('../controllers/botConfigController');

router.use(authMiddleware);

router.get('/', botConfigController.getConfig);
router.put('/', botConfigController.updateConfig);

module.exports = router;
