const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const controller = require('../controllers/budgetController');

// Panel (session). Declared first so "panel" is never read as a budget slug.
router.get('/panel/requests', authMiddleware, controller.panelRequests);
router.post('/panel/requests/:id/approve', authMiddleware, controller.panelApprove);
router.post('/panel/requests/:id/reject', authMiddleware, controller.panelReject);
router.get('/panel/:userId', authMiddleware, controller.panelGet);
router.post('/panel/:userId', authMiddleware, controller.panelCreate);
router.post('/panel/:userId/:budgetId/transfer', authMiddleware, controller.panelTransfer);
router.post('/panel/:userId/:budgetId/archive', authMiddleware, controller.panelArchive);

// API for outside tools — clientId + the account's own apiKey.
// "requests" before "/:slug" so it is never read as a budget name.
router.get('/requests', controller.apiRequestList);
router.get('/requests/:id', controller.apiRequestGet);
router.get('/', controller.apiList);
router.get('/:slug', controller.apiGet);
router.get('/:slug/movements', controller.apiMovements);
router.post('/:slug/debit', controller.apiDebit);
router.post('/:slug/requests', controller.apiRequestCreate);

module.exports = router;
