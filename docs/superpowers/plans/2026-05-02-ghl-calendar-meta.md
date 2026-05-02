# GHL Calendar Metadata — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Source GHL calendar's title/timezone/duration from GHL's own configuration instead of letting users set them on the voice/chatbot side. Cache as `meta` snapshot in agent config; refresh every 4 hours via background job.

**Architecture:** Three pieces — (1) `getCalendarDetails()` provider method + GHL implementation + new endpoint; (2) `setInterval` refresh job started in `index.js`; (3) modal UI in AgentEdit/ChatbotEdit hides editable fields and shows read-only "From GoHighLevel" panel for GHL entries; booking-time prefers `meta.*` over legacy fields.

**Tech Stack:** Node/Express + Prisma server, React/Vite client, existing `CalendarProvider` abstraction. No test runner — manual verification.

**Spec:** [docs/superpowers/specs/2026-05-02-ghl-calendar-meta-design.md](../specs/2026-05-02-ghl-calendar-meta-design.md)

---

## Working notes

- **Factory already exists** at `server/src/services/calendar/calendarFactory.js` exporting `createCalendarProvider(integration, prisma)`. The spec mentioned extracting one — that work is already done. Use the existing factory directly.
- **Scheduler pattern** to mirror: `server/src/index.js` line 439-443 — `server.listen(PORT, () => { callbackController.startScheduler(prisma); chatbotFollowUpController.startScheduler(prisma); })`. Add `startCalendarMetaRefresher(prisma)` there.
- **Controller exports** at `server/src/controllers/calendarController.js:858` — a flat object. Add `getCalendarDetails` to it.
- **Routes** at `server/src/routes/calendar.js` — add `router.get('/details', calendarController.getCalendarDetails)`.
- **GHL `_ghlRequest`** is already implemented on `GHLCalendarProvider` (used by `listCalendars`). Reuse it.
- **Two modal locations to change:** single-calendar mode and multi-calendar mode in BOTH `AgentEdit.jsx` and `ChatbotEdit.jsx`. Same UI, four call sites.
- **Commits go on `main` directly.** Project pattern. Short imperative subjects, no `feat:` prefix.

---

## File map

### New files
- `server/src/services/calendarMetaRefresher.js` — background refresh job
- `client/src/components/Dashboard/CalendarMetaPanel.jsx` — read-only "From GoHighLevel" panel component used by both AgentEdit and ChatbotEdit modals

### Modified files
- `server/src/services/calendar/CalendarProvider.js` — add abstract `getCalendarDetails`
- `server/src/services/calendar/GHLCalendarProvider.js` — implement `getCalendarDetails`
- `server/src/controllers/calendarController.js` — new `getCalendarDetails` handler + add to exports
- `server/src/routes/calendar.js` — wire new route
- `server/src/index.js` — start the refresh job
- `client/src/services/api.js` — add `calendarAPI.getDetails`
- `client/src/components/Dashboard/AgentEdit.jsx` — modal UI changes (single + multi mode), booking-time fallback
- `client/src/components/Dashboard/ChatbotEdit.jsx` — same
- `client/src/i18n/en.json`, `client/src/i18n/es.json` — ~10 new keys

---

## Task A: Backend — provider method + endpoint

**Files:**
- Modify: `server/src/services/calendar/CalendarProvider.js` — add abstract method
- Modify: `server/src/services/calendar/GHLCalendarProvider.js` — implement
- Modify: `server/src/controllers/calendarController.js` — handler + export
- Modify: `server/src/routes/calendar.js` — route

- [ ] **Step 1:** Add abstract method to `server/src/services/calendar/CalendarProvider.js` after the existing `bookAppointment` definition (after line 96):

```js
/**
 * Get full calendar details, including provider-specific config like
 * timezone, slot duration, and default event title.
 * @param {string} calendarId
 * @returns {Object} - { source, name, timezone, slotDuration, eventTitle, status, updatedAt, [error] }
 */
async getCalendarDetails(calendarId) {
  throw new Error('getCalendarDetails() not implemented');
}
```

- [ ] **Step 2:** Implement in `server/src/services/calendar/GHLCalendarProvider.js`. Add this method right after `listCalendars` (after line 145):

```js
async getCalendarDetails(calendarId) {
  const token = await this.getValidToken();
  const data = await this._ghlRequest(`/calendars/${calendarId}`, token);
  const cal = data.calendar || data;
  return {
    source: 'ghl',
    name: cal.name || '',
    timezone: cal.calendarTimezone || cal.timezone || null,
    slotDuration: typeof cal.slotDuration === 'number' ? cal.slotDuration : null,
    eventTitle: cal.eventTitle || cal.name || '',
    status: 'ok',
    updatedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 3:** Add handler to `server/src/controllers/calendarController.js` (insert above the `module.exports = {` block):

```js
/**
 * Get GHL-style metadata for a specific calendar.
 * GET /api/calendar/details?provider=ghl&integrationId=123&calendarId=...
 * Always returns 200 with a meta object; status field encodes any failure.
 */
const getCalendarDetails = async (req, res) => {
  try {
    const { provider, integrationId, calendarId } = req.query;
    if (!provider || !integrationId || !calendarId) {
      return res.status(400).json({ error: 'provider, integrationId, calendarId required' });
    }

    const integration = await req.prisma.calendarIntegration.findFirst({
      where: { id: parseInt(integrationId), userId: req.user.id, provider }
    });
    if (!integration) {
      return res.json({ meta: { source: provider, status: 'not_found', error: 'Integration not found', updatedAt: new Date().toISOString() } });
    }
    if (!integration.isConnected) {
      return res.json({ meta: { source: provider, status: 'error', error: 'Integration disconnected', updatedAt: new Date().toISOString() } });
    }

    const providerInstance = createCalendarProvider(integration, req.prisma);
    let meta;
    try {
      meta = await providerInstance.getCalendarDetails(calendarId);
    } catch (err) {
      const msg = (err && err.message) || 'unknown';
      if (/not implemented/i.test(msg)) {
        meta = { source: provider, status: 'unsupported', error: msg, updatedAt: new Date().toISOString() };
      } else if (/404|not.?found/i.test(msg)) {
        meta = { source: provider, status: 'not_found', error: msg, updatedAt: new Date().toISOString() };
      } else {
        meta = { source: provider, status: 'error', error: msg, updatedAt: new Date().toISOString() };
      }
    }
    res.json({ meta });
  } catch (error) {
    console.error('Error fetching calendar details:', error);
    res.json({ meta: { source: req.query.provider || 'unknown', status: 'error', error: error.message || 'Failed', updatedAt: new Date().toISOString() } });
  }
};
```

Add `getCalendarDetails` to the `module.exports` object (line 858).

- [ ] **Step 4:** Wire the route in `server/src/routes/calendar.js`. Add this line near the other `router.get` declarations (around line 23, near `getCalendars`):

```js
router.get('/details', calendarController.getCalendarDetails);
```

- [ ] **Step 5:** Verify backend syntax loads:

```bash
node -e "require('./server/src/controllers/calendarController.js'); require('./server/src/routes/calendar.js'); require('./server/src/services/calendar/CalendarProvider.js'); require('./server/src/services/calendar/GHLCalendarProvider.js'); console.log('OK')"
```

- [ ] **Step 6:** Commit

```bash
git add server/src/services/calendar/CalendarProvider.js server/src/services/calendar/GHLCalendarProvider.js server/src/controllers/calendarController.js server/src/routes/calendar.js
git commit -m "$(cat <<'EOF'
Add getCalendarDetails endpoint for GHL meta sync

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task B: Background refresh job

**Files:**
- Create: `server/src/services/calendarMetaRefresher.js`
- Modify: `server/src/index.js` — start it in `server.listen` callback

- [ ] **Step 1:** Create `server/src/services/calendarMetaRefresher.js` with this exact content:

```js
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
```

- [ ] **Step 2:** Start it in `server/src/index.js`. Add the `require` near the other controller requires (around line 47-51):

```js
const { startCalendarMetaRefresher } = require('./services/calendarMetaRefresher');
```

Then inside the `server.listen(PORT, () => { ... })` callback at line 439, alongside `callbackController.startScheduler(prisma)` (line 441) and `chatbotFollowUpController.startScheduler(prisma)` (line 443):

```js
startCalendarMetaRefresher(prisma);
```

- [ ] **Step 3:** Verify both files load:

```bash
node -e "require('./server/src/services/calendarMetaRefresher.js'); require('./server/src/index.js')" 2>&1 | head -20
```

(The `index.js` load may try to start the actual server — if so, just check `calendarMetaRefresher.js` alone and trust that the modification to `index.js` is small.)

- [ ] **Step 4:** Commit

```bash
git add server/src/services/calendarMetaRefresher.js server/src/index.js
git commit -m "$(cat <<'EOF'
Add background refresher for GHL calendar meta (4h interval)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task C: Client API wrapper + i18n

**Files:**
- Modify: `client/src/services/api.js`
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/es.json`

- [ ] **Step 1:** In `client/src/services/api.js`, find the existing `calendarAPI` block (or wherever calendar endpoints live — search for `'/calendar/'`). Add a new method:

```js
getDetails: (provider, integrationId, calendarId) =>
  api.get('/calendar/details', { params: { provider, integrationId, calendarId } }),
```

If there is no existing `calendarAPI` export, the method belongs in whichever object groups other `/calendar/*` endpoints. If you can't find one, create:

```js
export const calendarAPI = {
  getDetails: (provider, integrationId, calendarId) =>
    api.get('/calendar/details', { params: { provider, integrationId, calendarId } }),
};
```

(Search `client/src/services/api.js` first; the existing export name takes precedence.)

- [ ] **Step 2:** Add the i18n keys. In `client/src/i18n/en.json`, find the `agentEdit` block and add a new sub-block. Place alphabetically near other sub-blocks:

```json
"calendarMeta": {
  "fromGhl": "From GoHighLevel",
  "syncedAgo": "Synced {{when}}",
  "refreshing": "Refreshing…",
  "refreshNow": "Refresh now",
  "tzLabel": "Timezone",
  "durationLabel": "Duration",
  "titleLabel": "Title",
  "minutes": "min",
  "notFound": "This calendar no longer exists in GoHighLevel.",
  "errorBanner": "Couldn't refresh from GoHighLevel — using last known values.",
  "retry": "Retry",
  "pickAnother": "Pick another calendar",
  "neverSynced": "Not synced yet"
}
```

(Make sure to add a comma after the closing brace of `calendarMeta` if it's not the last sub-block in `agentEdit`.)

- [ ] **Step 3:** Mirror in `client/src/i18n/es.json`:

```json
"calendarMeta": {
  "fromGhl": "Desde GoHighLevel",
  "syncedAgo": "Sincronizado {{when}}",
  "refreshing": "Actualizando…",
  "refreshNow": "Actualizar ahora",
  "tzLabel": "Zona horaria",
  "durationLabel": "Duración",
  "titleLabel": "Título",
  "minutes": "min",
  "notFound": "Este calendario ya no existe en GoHighLevel.",
  "errorBanner": "No se pudo sincronizar desde GoHighLevel — usando los últimos valores conocidos.",
  "retry": "Reintentar",
  "pickAnother": "Elegir otro calendario",
  "neverSynced": "Aún no sincronizado"
}
```

- [ ] **Step 4:** Verify JSON parses:

```bash
node -e "JSON.parse(require('fs').readFileSync('client/src/i18n/en.json','utf8')); JSON.parse(require('fs').readFileSync('client/src/i18n/es.json','utf8')); console.log('OK')"
```

- [ ] **Step 5:** Commit

```bash
git add client/src/services/api.js client/src/i18n/en.json client/src/i18n/es.json
git commit -m "$(cat <<'EOF'
Add calendarAPI.getDetails wrapper and calendarMeta i18n keys

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task D: Shared `CalendarMetaPanel` component

This is the read-only "From GoHighLevel" panel rendered in both AgentEdit and ChatbotEdit modals.

**File:**
- Create: `client/src/components/Dashboard/CalendarMetaPanel.jsx`

- [ ] **Step 1:** Create the file with this content:

```jsx
import { useState } from 'react'
import { calendarAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

function timeAgo(iso, t) {
  if (!iso) return t('agentEdit.calendarMeta.neverSynced')
  const diffMs = Date.now() - new Date(iso).getTime()
  if (isNaN(diffMs)) return ''
  const m = Math.floor(diffMs / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

/**
 * Read-only panel showing GHL-cached calendar metadata.
 * Only renders when `entry.provider === 'ghl'` and entry has integration+calendar selected.
 *
 * Props:
 *   entry: the calendar config entry ({ provider, integrationId, calendarId, meta? })
 *   onMetaChange(newMeta): called when user clicks Refresh and a new meta is fetched
 */
export default function CalendarMetaPanel({ entry, onMetaChange }) {
  const { t } = useLanguage()
  const [refreshing, setRefreshing] = useState(false)

  if (!entry || entry.provider !== 'ghl') return null
  if (!entry.integrationId || !entry.calendarId) return null

  const meta = entry.meta
  const status = meta?.status

  const refresh = async () => {
    setRefreshing(true)
    try {
      const { data } = await calendarAPI.getDetails('ghl', entry.integrationId, entry.calendarId)
      if (data?.meta) onMetaChange(data.meta)
    } catch (err) {
      onMetaChange({ source: 'ghl', status: 'error', error: err.message || 'Failed', updatedAt: new Date().toISOString() })
    } finally {
      setRefreshing(false)
    }
  }

  // Banner variants
  if (status === 'not_found') {
    return (
      <div className="rounded-lg p-3 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800/40">
        <div className="text-sm text-red-700 dark:text-red-300 font-medium">{t('agentEdit.calendarMeta.notFound')}</div>
        <div className="text-xs text-red-600 dark:text-red-400 mt-1">{t('agentEdit.calendarMeta.pickAnother')}</div>
      </div>
    )
  }

  return (
    <div className="rounded-lg p-3 bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-700 dark:text-gray-300">
          <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          {t('agentEdit.calendarMeta.fromGhl')}
          <span className="text-[10px] text-gray-400 ml-1">
            {meta?.updatedAt
              ? t('agentEdit.calendarMeta.syncedAgo').replace('{{when}}', timeAgo(meta.updatedAt, t))
              : t('agentEdit.calendarMeta.neverSynced')}
          </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          title={t('agentEdit.calendarMeta.refreshNow')}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {status === 'error' && (
        <div className="mb-2 text-xs text-yellow-600 dark:text-yellow-400">
          {t('agentEdit.calendarMeta.errorBanner')}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-gray-500 dark:text-gray-400">{t('agentEdit.calendarMeta.tzLabel')}: </span>
          <span className="text-gray-900 dark:text-white">{meta?.timezone || '—'}</span>
        </div>
        <div>
          <span className="text-gray-500 dark:text-gray-400">{t('agentEdit.calendarMeta.durationLabel')}: </span>
          <span className="text-gray-900 dark:text-white">
            {meta?.slotDuration != null ? `${meta.slotDuration} ${t('agentEdit.calendarMeta.minutes')}` : '—'}
          </span>
        </div>
        <div className="col-span-2">
          <span className="text-gray-500 dark:text-gray-400">{t('agentEdit.calendarMeta.titleLabel')}: </span>
          <span className="text-gray-900 dark:text-white break-all">{meta?.eventTitle || '—'}</span>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2:** Verify it parses:

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('client/src/components/Dashboard/CalendarMetaPanel.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('OK')"
```

- [ ] **Step 3:** Commit

```bash
git add client/src/components/Dashboard/CalendarMetaPanel.jsx
git commit -m "$(cat <<'EOF'
Add CalendarMetaPanel for read-only GHL meta display

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task E: AgentEdit.jsx — modal + booking-time fallback

**File:**
- Modify: `client/src/components/Dashboard/AgentEdit.jsx`

The AgentEdit calendar config UI has TWO call sites that render the timezone/duration/title fields: single-calendar mode (around lines 4087-4159) and multi-calendar mode (later in the same file). Both need the same change.

- [ ] **Step 1:** Add the import near the top of the file (after the existing imports):

```jsx
import CalendarMetaPanel from './CalendarMetaPanel'
```

- [ ] **Step 2:** Define a helper near the other helpers in the component body (e.g., near where `getCurrentVoiceName` lives). Place it after the imports and at the top of the component function:

Actually, simpler: define it as a module-scoped const at the top of the file after imports:

```jsx
const isGhlMetaOk = (entry) => entry?.provider === 'ghl' && entry?.meta?.status === 'ok'
```

- [ ] **Step 3:** Update the SINGLE-calendar mode UI. Find the block at lines 4084-4161 (`{calendarConfig.provider && ( <> ... </> )}`). Wrap the timezone+duration grid AND the appointmentTitle input with a conditional that hides them when `provider === 'ghl'`. For GHL provider, render `<CalendarMetaPanel />` instead.

The structure should become:

```jsx
{calendarConfig.provider && (
  <>
    {calendarConfig.provider === 'ghl' ? (
      <CalendarMetaPanel
        entry={calendarConfig}
        onMetaChange={(meta) => setCalendarConfig({ ...calendarConfig, meta })}
      />
    ) : (
      <>
        {/* Existing timezone+duration grid block (lines 4087-4115) — keep as-is */}
        {/* Existing appointmentTitle input block (lines 4147-4159) — keep as-is */}
      </>
    )}

    {/* Required Contact Fields - for non-GHL providers — KEEP AS-IS */}
    {calendarConfig.provider !== 'ghl' && (() => { ... })()}

    {/* GHL Contact ID (Test) — KEEP AS-IS */}
    {calendarConfig.provider === 'ghl' && ( ... )}
  </>
)}
```

The contact ID block and required-fields block stay where they are — they're orthogonal to this change. Only the timezone+duration grid and the appointmentTitle input get gated.

Important: when the user picks a calendar for the first time, we want to fetch meta immediately so the panel populates. Find the `onChange` callback at line 4080 (`(calendarId, timezone) => setCalendarConfig({ ...calendarConfig, calendarId, timezone })`) and wrap it to also kick off a fetch when GHL:

```jsx
async (calendarId, timezone) => {
  const next = { ...calendarConfig, calendarId, timezone }
  setCalendarConfig(next)
  if (next.provider === 'ghl' && next.integrationId && calendarId) {
    try {
      const { data } = await calendarAPI.getDetails('ghl', next.integrationId, calendarId)
      if (data?.meta) setCalendarConfig({ ...next, meta: data.meta })
    } catch {}
  }
}
```

(Make sure `calendarAPI` is imported — it's already used elsewhere via the existing import at the top of AgentEdit.jsx; if not, add it: search the imports for `calendarAPI` first.)

- [ ] **Step 4:** Apply the SAME change to multi-calendar mode. The multi-calendar entries render their own copy of timezone/duration/title fields (search the file for `entry.appointmentDuration` and `entry.appointmentTitle` — those are the multi-mode renders). For each entry where `entry.provider === 'ghl'`, replace those fields with `<CalendarMetaPanel entry={entry} onMetaChange={(meta) => updateCalendarEntry(entry.id, { meta })} />` (use the existing entry-update helper visible at line 753-756).

Same first-time-fetch hook: when calendarId changes on a multi-mode entry with `provider === 'ghl'`, fire `calendarAPI.getDetails(...)` and store the result in the entry's `meta`.

- [ ] **Step 5:** Update the booking-time runtime fallback. Find the place that builds the booking tool's parameters from each calendar entry — search for `cal.appointmentDuration` (lines 1237 and 1255 area). Apply this transformation:

```jsx
// Where this currently exists:
//   duration: (cal.appointmentDuration || 30).toString()
// becomes:
const isGhlOk = cal.provider === 'ghl' && cal.meta?.status === 'ok'
const effDuration = isGhlOk ? (cal.meta.slotDuration ?? cal.appointmentDuration ?? 30) : (cal.appointmentDuration ?? 30)
const effTitle    = isGhlOk ? (cal.meta.eventTitle ?? cal.appointmentTitle ?? '') : (cal.appointmentTitle ?? '')
const effTimezone = isGhlOk ? (cal.meta.timezone ?? cal.timezone ?? 'America/New_York') : (cal.timezone ?? 'America/New_York')
// Then use effDuration / effTitle / effTimezone where the original code used cal.appointmentDuration / cal.appointmentTitle / cal.timezone.
```

Apply at every booking-tool-building site in this file. There may be multiple — search for `appointmentDuration` and `appointmentTitle` usages and apply consistently.

- [ ] **Step 6:** Verify it parses:

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('client/src/components/Dashboard/AgentEdit.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('OK')"
```

- [ ] **Step 7:** Commit

```bash
git add client/src/components/Dashboard/AgentEdit.jsx
git commit -m "$(cat <<'EOF'
Use GHL calendar meta in AgentEdit modal and booking calls

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task F: ChatbotEdit.jsx — same modal + booking-time fallback

**File:**
- Modify: `client/src/components/Dashboard/ChatbotEdit.jsx`

Mirror Task E exactly: import `CalendarMetaPanel`, hide timezone/duration/title for GHL provider in both single and multi mode, render `<CalendarMetaPanel />` instead, kick off `calendarAPI.getDetails` on calendar pick, apply the booking-time fallback chain.

The structure of `ChatbotEdit.jsx`'s calendar config is similar but not identical to `AgentEdit.jsx`. Search for these strings to find the equivalent locations:
- `appointmentDuration` and `appointmentTitle` for the editable fields
- The calendar dropdown's `onChange` for the meta-fetch hook
- Wherever the chatbot's calendar tool params are built (search for `duration:` near `cal.`) for the booking-time fallback

Apply the same transformations as Task E, Steps 1-5, in the equivalent locations in ChatbotEdit.jsx.

- [ ] **Step 1:** Apply Task E Steps 1-5 to ChatbotEdit.jsx.

- [ ] **Step 2:** Verify:

```bash
node -e "require('@babel/parser').parse(require('fs').readFileSync('client/src/components/Dashboard/ChatbotEdit.jsx','utf8'),{sourceType:'module',plugins:['jsx']}); console.log('OK')"
```

- [ ] **Step 3:** Commit

```bash
git add client/src/components/Dashboard/ChatbotEdit.jsx
git commit -m "$(cat <<'EOF'
Use GHL calendar meta in ChatbotEdit modal and booking calls

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Final verification (manual, user-driven)

After all tasks committed:

1. Restart the server (so `startCalendarMetaRefresher` boots).
2. Open an existing voice agent that has a GHL calendar configured.
3. Open the Calendar Options modal:
   - Single-calendar mode: timezone/duration/title fields should be replaced by the "From GoHighLevel" panel
   - The panel shows the GHL values (timezone/slotDuration/eventTitle)
4. Click the refresh icon — values update from GHL.
5. Save the agent. Reopen — values still cached.
6. Trigger a real or test booking — the booking call should use the GHL slotDuration and eventTitle (check VAPI logs / network tab).
7. Verify same behavior in a chatbot.
8. Verify Google Calendar / Cal.com / etc. entries STILL show editable fields (unchanged).
9. After 30 seconds + 4 hours of server uptime, the refresh job should auto-update meta.

If any step fails — capture exact error and surface it; don't silently proceed.
