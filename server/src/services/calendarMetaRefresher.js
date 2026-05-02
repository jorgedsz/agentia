const { createCalendarProvider } = require('./calendar/calendarFactory');

const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000;
const STAGGER_MS = 500;
const BOOT_DELAY_MS = 30 * 1000;

let intervalId = null;
let running = false;

function collectGhlEntries(cfg) {
  const out = [];
  if (!cfg) return out;
  if (cfg.provider === 'ghl' && cfg.calendarId) out.push(cfg);
  for (const c of (cfg.calendars || [])) {
    if (c && c.provider === 'ghl' && c.calendarId) out.push(c);
  }
  return out;
}

async function fetchMetaForEntry(prisma, userId, entry) {
  const integration = await prisma.calendarIntegration.findFirst({
    where: { id: parseInt(entry.integrationId), userId, provider: 'ghl' }
  });
  if (!integration || !integration.isConnected) {
    return {
      source: 'ghl',
      status: integration ? 'error' : 'not_found',
      error: integration ? 'Integration disconnected' : 'Integration not found',
      updatedAt: new Date().toISOString()
    };
  }
  const provider = createCalendarProvider(integration, prisma);
  try {
    return await provider.getCalendarDetails(entry.calendarId);
  } catch (err) {
    const msg = (err && err.message) || 'unknown';
    if (/404|not.?found/i.test(msg)) {
      return { source: 'ghl', status: 'not_found', error: msg, updatedAt: new Date().toISOString() };
    }
    return { source: 'ghl', status: 'error', error: msg, updatedAt: new Date().toISOString() };
  }
}

async function processConfig(prisma, kind, row) {
  let cfg;
  try { cfg = typeof row.config === 'string' ? JSON.parse(row.config) : (row.config || {}); }
  catch { return { skipped: true }; }

  const entries = collectGhlEntries(cfg);
  if (entries.length === 0) return { skipped: true };

  let mutated = false;
  let refreshed = 0;
  let failed = 0;
  for (const entry of entries) {
    try {
      const meta = await fetchMetaForEntry(prisma, row.userId, entry);
      entry.meta = meta;
      mutated = true;
      if (meta.status === 'ok') refreshed++; else failed++;
    } catch (err) {
      entry.meta = { source: 'ghl', status: 'error', error: err.message, updatedAt: new Date().toISOString() };
      mutated = true;
      failed++;
    }
    await new Promise(r => setTimeout(r, STAGGER_MS));
  }

  if (mutated) {
    const data = { config: JSON.stringify(cfg) };
    if (kind === 'agent') {
      await prisma.agent.update({ where: { id: row.id }, data });
    } else {
      await prisma.chatbot.update({ where: { id: row.id }, data });
    }
  }

  return { refreshed, failed };
}

async function runOnce(prisma) {
  if (running) {
    console.log('[calendarMetaRefresher] previous tick still running — skipping');
    return;
  }
  running = true;
  const startedAt = Date.now();
  try {
    const agents = await prisma.agent.findMany({ select: { id: true, userId: true, config: true } });
    const chatbots = await prisma.chatbot.findMany({ select: { id: true, userId: true, config: true } });

    let refreshed = 0, failed = 0, skipped = 0;
    for (const a of agents) {
      const r = await processConfig(prisma, 'agent', a);
      if (r.skipped) { skipped++; continue; }
      refreshed += r.refreshed; failed += r.failed;
    }
    for (const c of chatbots) {
      const r = await processConfig(prisma, 'chatbot', c);
      if (r.skipped) { skipped++; continue; }
      refreshed += r.refreshed; failed += r.failed;
    }
    console.log(`[calendarMetaRefresher] done in ${Date.now() - startedAt}ms — refreshed=${refreshed} skipped=${skipped} failed=${failed}`);
  } finally {
    running = false;
  }
}

function startCalendarMetaRefresher(prisma) {
  if (intervalId) return;
  console.log(`[calendarMetaRefresher] starting (interval: ${REFRESH_INTERVAL_MS / 1000 / 60} min)`);
  setTimeout(() => runOnce(prisma).catch(err => console.error('[calendarMetaRefresher] tick error:', err)), BOOT_DELAY_MS);
  intervalId = setInterval(() => runOnce(prisma).catch(err => console.error('[calendarMetaRefresher] tick error:', err)), REFRESH_INTERVAL_MS);
}

module.exports = { startCalendarMetaRefresher, runOnce };
