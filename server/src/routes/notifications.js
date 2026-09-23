const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/notificationsController');

// Panel (session). Declared first so "panel" is never read as a notice id.
router.get('/panel', authMiddleware, controller.panelList);
router.post('/panel/:id/read', authMiddleware, controller.panelRead);

// Any other app the account runs — clientId + the account's own apiKey.
router.get('/', controller.apiList);
router.post('/', controller.apiCreate);
router.post('/:id/read', controller.apiRead);

module.exports = router;
