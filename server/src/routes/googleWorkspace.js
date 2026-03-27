const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const ctrl = require('../controllers/googleWorkspaceController');

// ─── Public routes (for VAPI / n8n tool calls) ─────────────
router.post('/sheets/list', ctrl.sheetsListPublic);
router.post('/sheets/get', ctrl.sheetsGetPublic);
router.post('/sheets/read', ctrl.sheetsReadPublic);
router.post('/sheets/write', ctrl.sheetsWritePublic);
router.post('/sheets/append', ctrl.sheetsAppendPublic);
router.post('/sheets/create', ctrl.sheetsCreatePublic);
router.post('/docs/list', ctrl.docsListPublic);
router.post('/docs/read', ctrl.docsReadPublic);
router.post('/docs/create', ctrl.docsCreatePublic);
router.post('/docs/append', ctrl.docsAppendPublic);

// ─── Protected routes (for UI file pickers) ────────────────
router.use(authMiddleware);
router.get('/integrations/:integrationId/spreadsheets', ctrl.listSpreadsheetsPicker);
router.get('/integrations/:integrationId/documents', ctrl.listDocumentsPicker);

module.exports = router;
