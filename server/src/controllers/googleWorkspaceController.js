const gws = require('../services/googleWorkspaceService');

// ─── Public endpoints (for VAPI / n8n tool calls) ──────────
// All use req.query for userId/integrationId, req.body for AI params

/** POST /api/google-workspace/sheets/list */
async function sheetsListPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { query } = req.body;
    const files = await gws.listSpreadsheets(req.prisma, userId, integrationId, query);
    res.json({ results: files });
  } catch (err) {
    console.error('[GWS] sheetsListPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/sheets/get */
async function sheetsGetPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { spreadsheetId } = req.body;
    if (!spreadsheetId) return res.status(400).json({ error: 'spreadsheetId is required' });
    const info = await gws.getSpreadsheet(req.prisma, userId, integrationId, spreadsheetId);
    res.json({ results: info });
  } catch (err) {
    console.error('[GWS] sheetsGetPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/sheets/read */
async function sheetsReadPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { spreadsheetId, range } = req.body;
    if (!spreadsheetId || !range) return res.status(400).json({ error: 'spreadsheetId and range are required' });
    const data = await gws.readSheet(req.prisma, userId, integrationId, spreadsheetId, range);
    res.json({ results: data });
  } catch (err) {
    console.error('[GWS] sheetsReadPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/sheets/write */
async function sheetsWritePublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { spreadsheetId, range, values } = req.body;
    if (!spreadsheetId || !range || !values) return res.status(400).json({ error: 'spreadsheetId, range, and values are required' });
    const result = await gws.writeSheet(req.prisma, userId, integrationId, spreadsheetId, range, values);
    res.json({ results: result });
  } catch (err) {
    console.error('[GWS] sheetsWritePublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/sheets/append */
async function sheetsAppendPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { spreadsheetId, range, values } = req.body;
    if (!spreadsheetId || !range || !values) return res.status(400).json({ error: 'spreadsheetId, range, and values are required' });
    const result = await gws.appendSheet(req.prisma, userId, integrationId, spreadsheetId, range, values);
    res.json({ results: result });
  } catch (err) {
    console.error('[GWS] sheetsAppendPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/sheets/create */
async function sheetsCreatePublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const result = await gws.createSpreadsheet(req.prisma, userId, integrationId, title);
    res.json({ results: result });
  } catch (err) {
    console.error('[GWS] sheetsCreatePublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/docs/list */
async function docsListPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { query } = req.body;
    const files = await gws.listDocuments(req.prisma, userId, integrationId, query);
    res.json({ results: files });
  } catch (err) {
    console.error('[GWS] docsListPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/docs/read */
async function docsReadPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { documentId } = req.body;
    if (!documentId) return res.status(400).json({ error: 'documentId is required' });
    const doc = await gws.getDocument(req.prisma, userId, integrationId, documentId);
    res.json({ results: doc });
  } catch (err) {
    console.error('[GWS] docsReadPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/docs/create */
async function docsCreatePublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { title } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const doc = await gws.createDocument(req.prisma, userId, integrationId, title);
    res.json({ results: doc });
  } catch (err) {
    console.error('[GWS] docsCreatePublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** POST /api/google-workspace/docs/append */
async function docsAppendPublic(req, res) {
  try {
    const { userId, integrationId } = req.query;
    const { documentId, text } = req.body;
    if (!documentId || !text) return res.status(400).json({ error: 'documentId and text are required' });
    const result = await gws.appendToDocument(req.prisma, userId, integrationId, documentId, text);
    res.json({ results: result });
  } catch (err) {
    console.error('[GWS] docsAppendPublic error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

// ─── Protected endpoints (for ChatbotEdit file pickers) ─────

/** GET /api/google-workspace/integrations/:integrationId/spreadsheets */
async function listSpreadsheetsPicker(req, res) {
  try {
    const { integrationId } = req.params;
    const query = req.query.q || '';
    const files = await gws.listSpreadsheets(req.prisma, req.user.id, integrationId, query);
    res.json({ files });
  } catch (err) {
    console.error('[GWS] listSpreadsheetsPicker error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

/** GET /api/google-workspace/integrations/:integrationId/documents */
async function listDocumentsPicker(req, res) {
  try {
    const { integrationId } = req.params;
    const query = req.query.q || '';
    const files = await gws.listDocuments(req.prisma, req.user.id, integrationId, query);
    res.json({ files });
  } catch (err) {
    console.error('[GWS] listDocumentsPicker error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

module.exports = {
  sheetsListPublic,
  sheetsGetPublic,
  sheetsReadPublic,
  sheetsWritePublic,
  sheetsAppendPublic,
  sheetsCreatePublic,
  docsListPublic,
  docsReadPublic,
  docsCreatePublic,
  docsAppendPublic,
  listSpreadsheetsPicker,
  listDocumentsPicker,
};
