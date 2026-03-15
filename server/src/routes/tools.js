const express = require('express');
const router = express.Router();
const toolTestController = require('../controllers/toolTestController');
const authMiddleware = require('../middleware/authMiddleware');

router.use(authMiddleware);

// POST /api/tools/test-request - Send a test HTTP request via proxy
router.post('/test-request', toolTestController.testRequest);

module.exports = router;
