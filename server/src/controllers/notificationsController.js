// Notices for an account. Two doors into the same list: the panel reads them
// with a session, and any other app the account runs reads and writes them with
// the account's own API key — the same pair the budget API uses.

const notifications = require('../services/notifications');
const { authenticateAccountKey } = require('../utils/apiKeyAuth');

function fail(res, error) {
  if (error instanceof notifications.NotificationError) {
    return res.status(error.status).json({ success: false, error: error.message });
  }
  console.error('Notification error:', error.message);
  return res.status(500).json({ success: false, error: 'Notification operation failed' });
}

async function apiAccount(req, res) {
  const clientId = req.query?.clientId ?? req.body?.clientId;
  const apiKey = req.query?.apiKey ?? req.body?.apiKey;
  const auth = await authenticateAccountKey(req.prisma, clientId, apiKey);
  if (auth.error) {
    res.status(auth.status).json({ success: false, error: auth.error });
    return null;
  }
  return auth.user;
}

// GET /api/notifications?clientId=..&apiKey=..&unread=1&limit=50
const apiList = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;
    const unreadOnly = ['1', 'true', 'yes'].includes(String(req.query?.unread || '').toLowerCase());
    res.json({ success: true, ...(await notifications.listFor(req.prisma, user.id, { unreadOnly, limit: req.query?.limit })) });
  } catch (error) { fail(res, error); }
};

// POST /api/notifications  Body: { clientId, apiKey, title, body?, kind?, link?, data? }
// The notice lands on the calling account itself: an app can tell its own
// panel something, and cannot post into anybody else's.
const apiCreate = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;
    const row = await notifications.notify(req.prisma, {
      userId: user.id,
      kind: req.body?.kind || 'custom',
      title: req.body?.title,
      body: req.body?.body,
      link: req.body?.link,
      data: req.body?.data,
    });
    res.status(201).json({ success: true, notification: notifications.shape(row) });
  } catch (error) { fail(res, error); }
};

// POST /api/notifications/:id/read  (id "all" marks every unread one)
const apiRead = async (req, res) => {
  try {
    const user = await apiAccount(req, res);
    if (!user) return;
    const id = req.params.id === 'all' ? null : req.params.id;
    const count = await notifications.markRead(req.prisma, user.id, id);
    res.json({ success: true, marked: count });
  } catch (error) { fail(res, error); }
};

// GET /api/notifications/panel?unread=1 — the logged-in user's own notices
const panelList = async (req, res) => {
  try {
    const unreadOnly = ['1', 'true', 'yes'].includes(String(req.query?.unread || '').toLowerCase());
    res.json(await notifications.listFor(req.prisma, req.user.id, { unreadOnly, limit: req.query?.limit }));
  } catch (error) { fail(res, error); }
};

// POST /api/notifications/panel/:id/read
const panelRead = async (req, res) => {
  try {
    const id = req.params.id === 'all' ? null : req.params.id;
    const count = await notifications.markRead(req.prisma, req.user.id, id);
    res.json({ marked: count });
  } catch (error) { fail(res, error); }
};

module.exports = { apiList, apiCreate, apiRead, panelList, panelRead };
