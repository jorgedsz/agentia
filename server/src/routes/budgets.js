const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/budgetController');

// Panel (session). Declared first so "panel" is never read as a budget slug.
router.get('/panel/:userId', authMiddleware, controller.panelGet);
router.post('/panel/:userId', authMiddleware, controller.panelCreate);
router.post('/panel/:userId/:budgetId/transfer', authMiddleware, controller.panelTransfer);
router.post('/panel/:userId/:budgetId/archive', authMiddleware, controller.panelArchive);

// API for outside tools — clientId + the account's own apiKey.
router.get('/', controller.apiList);
router.get('/:slug', controller.apiGet);
router.get('/:slug/movements', controller.apiMovements);
router.post('/:slug/debit', controller.apiDebit);

module.exports = router;
