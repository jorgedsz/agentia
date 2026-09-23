// Notices for an account: a floating message in the panel, and a list any
// other app the account runs can read over the API. Nothing here sends mail —
// a notice is a row, and whoever is interested reads it.

const MAX_TITLE = 140;
const MAX_BODY = 600;

class NotificationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const clean = (value, max) => {
  const text = (value === null || value === undefined ? '' : String(value)).trim();
  return text ? text.slice(0, max) : null;
};

/**
 * Leave a notice for an account. `data` is whatever the sending app wants to
 * carry along; it is stored as sent and handed back untouched.
 */
async function notify(prisma, { userId, kind, title, body, data, link }) {
  const cleanTitle = clean(title, MAX_TITLE);
  if (!userId) throw new NotificationError('Falta la cuenta destinataria.');
  if (!cleanTitle) throw new NotificationError('La notificación necesita un título.');

  return prisma.notification.create({
    data: {
      userId,
      kind: clean(kind, 40) || 'custom',
      title: cleanTitle,
      body: clean(body, MAX_BODY),
      data: data === undefined || data === null ? null : JSON.stringify(data).slice(0, 4000),
      link: clean(link, 500),
    },
  });
}

/**
 * The same notice for several people — whoever may act on it. Failing to reach
 * one recipient never costs the others theirs.
 */
async function notifyAll(prisma, userIds, notice) {
  const unique = [...new Set((userIds || []).filter(Boolean))];
  const sent = [];
  for (const userId of unique) {
    try {
      sent.push(await notify(prisma, { ...notice, userId }));
    } catch (error) {
      console.error(`[Notifications] Could not notify user ${userId}: ${error.message}`);
    }
  }
  return sent;
}

function shape(row) {
  let data = null;
  if (row.data) {
    try { data = JSON.parse(row.data); } catch { data = row.data; }
  }
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    body: row.body || null,
    link: row.link || null,
    data,
    read: !!row.readAt,
    createdAt: row.createdAt,
  };
}

async function listFor(prisma, userId, { unreadOnly = false, limit = 50 } = {}) {
  const rows = await prisma.notification.findMany({
    where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
    orderBy: { createdAt: 'desc' },
    take: Math.min(Math.max(parseInt(limit) || 50, 1), 200),
  });
  const unread = await prisma.notification.count({ where: { userId, readAt: null } });
  return { notifications: rows.map(shape), unread };
}

// Marks one notice read, or every one of the account's when no id is given.
// Only rows belonging to this account are touched.
async function markRead(prisma, userId, id) {
  const where = { userId, readAt: null, ...(id ? { id: parseInt(id) } : {}) };
  const { count } = await prisma.notification.updateMany({ where, data: { readAt: new Date() } });
  return count;
}

module.exports = { NotificationError, notify, notifyAll, listFor, markRead, shape };
