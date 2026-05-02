# GHL calendar metadata as source of truth

**Date:** 2026-05-02
**Status:** Design approved, pending implementation plan
**Scope:** Voice agents and chatbots, GoHighLevel provider only

## Problem

The Calendar Options modal in `AgentEdit.jsx` and `ChatbotEdit.jsx` lets users set timezone, appointment duration, and appointment title per calendar entry. For GoHighLevel-backed calendars, those values **already exist in the GHL calendar's own configuration** (`slotDuration`, `calendarTimezone`, `eventTitle`). Letting users override them in the agent config invites drift: the agent says "30 min" when GHL says "45 min," and the user has to remember to update both places.

The user wants GHL to be the source of truth. The agent should pull title/timezone/duration from the GHL calendar instead of letting them be set on the voice/chatbot side.

## Goals

1. For GHL-backed calendars: hide the title/timezone/duration fields in the modal and use the GHL calendar's own settings at booking time.
2. Cache the values in the agent's config so booking calls remain fast (no extra API hop per booking).
3. Keep cached values fresh via a periodic background refresh (every 4 hours) so user changes in GHL propagate without manual action.
4. Apply the change consistently to voice agents and chatbots.
5. Leave non-GHL providers untouched (Google Calendar, Cal.com, Calendly, HubSpot keep their existing editable fields).

## Non-goals (v1)

- Implementing `getCalendarDetails()` for non-GHL providers — defer until a concrete need.
- Webhook-driven invalidation when GHL settings change — GHL doesn't expose reliable calendar-update webhooks; the 4-hour tick is the practical mechanism.
- Per-agent override of GHL values ("use GHL's title but my own duration") — explicit non-goal; GHL is the single source of truth.
- DB schema migration — the new `meta` field rides inside the existing `config` JSON column.

## Architecture overview

Three pieces:

1. **Provider abstraction:** new `getCalendarDetails(calendarId)` method on `CalendarProvider`, implemented for GHL, throwing `not implemented` for everyone else (graceful in callers).
2. **Synchronous fetch:** new `GET /api/calendar/details` endpoint called by the frontend at calendar-pick time and on a manual "Refresh now" button. Stashes a `meta` snapshot into the agent's per-calendar entry config.
3. **Background refresh job:** new `setInterval` started in `index.js` (mirroring `chatbotFollowUpController` and `callbackController` patterns) that ticks every 4 hours, walks all agents+chatbots whose config references GHL calendars, and re-fetches their metadata.

At booking time, the booking tool prefers `meta.{slotDuration, eventTitle, timezone}` when `provider === 'ghl'` and `meta.status === 'ok'`. Falls back to the legacy fields otherwise. Non-GHL booking paths are unchanged.

## Data model

The agent's `config` JSON already stores per-calendar entries with `{ id, provider, integrationId, calendarId, name, scenario, timezone, appointmentDuration, appointmentTitle, contactId, requiredFields, ... }` (single mode) or under `calendars: [...]` (multi mode). Same shape on chatbots.

Add an optional `meta` sub-object on each calendar entry:

```jsonc
{
  "id": "entry-uuid",
  "provider": "ghl",
  "integrationId": "abc123",
  "calendarId": "ghl-cal-id",
  "name": "Cached display name",
  "scenario": "...",
  "contactId": "...",
  "requiredFields": { ... },

  // Existing fields — kept for backward compat and for non-GHL providers
  "timezone": "America/New_York",
  "appointmentDuration": 30,
  "appointmentTitle": "...",

  // NEW — populated for GHL only
  "meta": {
    "source": "ghl",
    "name": "edmond es marico",
    "timezone": "America/Chicago",
    "slotDuration": 45,
    "eventTitle": "{{contact.name}} - Consultation",
    "updatedAt": "2026-05-02T14:30:00Z",
    "status": "ok"   // ok | not_found | error | unsupported
  }
}
```

Legacy fields stay in the schema but become read-only and unused for GHL entries (kept as last-known-good fallback if `meta` is missing or `status !== 'ok'`).

No Prisma migration required.

## Backend

### `CalendarProvider.getCalendarDetails(calendarId)`

Add abstract method to `server/src/services/calendar/CalendarProvider.js`:

```js
async getCalendarDetails(calendarId) {
  throw new Error('getCalendarDetails() not implemented for this provider')
}
```

### `GHLCalendarProvider.getCalendarDetails(calendarId)`

Implement in `server/src/services/calendar/GHLCalendarProvider.js`:

```js
async getCalendarDetails(calendarId) {
  const token = await this.getValidToken()
  const data = await this._ghlRequest(`/calendars/${calendarId}`, token)
  const cal = data.calendar || data
  return {
    source: 'ghl',
    name: cal.name || '',
    timezone: cal.calendarTimezone || cal.timezone || null,
    slotDuration: typeof cal.slotDuration === 'number' ? cal.slotDuration : null,
    eventTitle: cal.eventTitle || cal.name || '',
    status: 'ok',
    updatedAt: new Date().toISOString(),
  }
}
```

Defensive about field naming: GHL sometimes wraps in `{calendar: {...}}` and sometimes returns the calendar object at the top level. The `cal.calendarTimezone || cal.timezone` chain handles either.

### Endpoint: `GET /api/calendar/details`

New route in `server/src/controllers/calendarController.js`. Auth-protected via existing middleware.

Query params:
- `provider` (`ghl` | `google` | etc.)
- `integrationId`
- `calendarId`

Response (always 200, never 5xx — frontend handles status field):

```jsonc
{
  "meta": {
    "source": "ghl",
    "name": "...",
    "timezone": "...",
    "slotDuration": 45,
    "eventTitle": "...",
    "status": "ok",
    "updatedAt": "..."
  }
}
```

Status values:
- `ok` — fetch succeeded
- `not_found` — provider returned 404 (calendar deleted in GHL)
- `error` — network/auth failure (response includes `error: 'message'`)
- `unsupported` — provider's `getCalendarDetails` threw `not implemented` (returned for non-GHL providers if frontend ever calls this)

The endpoint resolves the user's provider instance using a shared factory extracted from existing `calendarController.js` code (the same factory `listCalendars` uses today). Extracting this factory into a small helper module is a small targeted refactor that serves both the controller and the refresh job.

### Frontend API wrapper

`client/src/services/api.js`:

```js
export const calendarAPI = {
  // existing methods preserved
  getDetails: (provider, integrationId, calendarId) =>
    api.get('/calendar/details', { params: { provider, integrationId, calendarId } }),
}
```

## Background refresh job

New file: `server/src/services/calendarMetaRefresher.js`

```js
const REFRESH_INTERVAL_MS = 4 * 60 * 60 * 1000   // 4 hours
const STAGGER_MS = 500                            // 500ms between calendar API hits
let intervalId = null
let running = false

async function runOnce(prisma) {
  if (running) {
    console.log('[calendarMetaRefresher] previous tick still running — skipping')
    return
  }
  running = true
  const startedAt = Date.now()
  try {
    const agents = await prisma.agent.findMany({ select: { id: true, userId: true, config: true } })
    const chatbots = await prisma.chatbot.findMany({ select: { id: true, userId: true, config: true } })
    const targets = [
      ...agents.map(a => ({ kind: 'agent', ...a })),
      ...chatbots.map(c => ({ kind: 'chatbot', ...c })),
    ]

    let refreshed = 0, skipped = 0, failed = 0

    for (const t of targets) {
      let cfg
      try { cfg = typeof t.config === 'string' ? JSON.parse(t.config) : (t.config || {}) }
      catch { skipped++; continue }

      const entries = collectGhlEntries(cfg)
      if (entries.length === 0) { skipped++; continue }

      let mutated = false
      for (const entry of entries) {
        try {
          const meta = await fetchMetaForEntry(prisma, t.userId, entry)
          if (meta) { entry.meta = meta; mutated = true; refreshed++ }
        } catch (err) {
          entry.meta = { ...(entry.meta || {}), status: 'error', error: err.message, updatedAt: new Date().toISOString() }
          mutated = true
          failed++
        }
        await new Promise(r => setTimeout(r, STAGGER_MS))
      }

      if (mutated) {
        const updateData = { config: JSON.stringify(cfg) }
        if (t.kind === 'agent') {
          await prisma.agent.update({ where: { id: t.id }, data: updateData })
        } else {
          await prisma.chatbot.update({ where: { id: t.id }, data: updateData })
        }
      }
    }
    console.log(`[calendarMetaRefresher] done in ${Date.now() - startedAt}ms — refreshed=${refreshed} skipped=${skipped} failed=${failed}`)
  } finally {
    running = false
  }
}

function collectGhlEntries(cfg) {
  const out = []
  if (cfg.provider === 'ghl' && cfg.calendarId) out.push(cfg)
  for (const c of (cfg.calendars || [])) {
    if (c.provider === 'ghl' && c.calendarId) out.push(c)
  }
  return out
}

async function fetchMetaForEntry(prisma, userId, entry) {
  const provider = await getProviderInstance(prisma, userId, entry.provider, entry.integrationId)
  if (!provider) return null
  return await provider.getCalendarDetails(entry.calendarId)
}

function startCalendarMetaRefresher(prisma) {
  if (intervalId) return
  console.log(`[calendarMetaRefresher] starting (interval: ${REFRESH_INTERVAL_MS / 1000 / 60} min)`)
  setTimeout(() => runOnce(prisma).catch(err => console.error('[calendarMetaRefresher] tick error:', err)), 30 * 1000)
  intervalId = setInterval(() => runOnce(prisma).catch(err => console.error('[calendarMetaRefresher] tick error:', err)), REFRESH_INTERVAL_MS)
}

module.exports = { startCalendarMetaRefresher, runOnce }
```

`getProviderInstance` is the same factory the calendar controller uses today — extracted into a shared helper so both consume it.

Wired in `server/src/index.js` after `app.listen(...)`:

```js
const { startCalendarMetaRefresher } = require('./services/calendarMetaRefresher')
startCalendarMetaRefresher(prisma)
```

### Behavior characteristics

- **Boot delay:** runs once 30 seconds after server start (gives DB pool time to warm). Then every 4 hours.
- **Stagger:** 500ms between calendar API hits keeps GHL well under their 1000 req/min/location limit even with thousands of calendars.
- **Per-entry isolation:** one calendar's failure doesn't poison the rest of the agent's entries or block the next agent.
- **Failure mode:** failed entries get `meta.status = 'error'` written so the UI can show a warning. Booking still falls back to legacy fields.
- **No overlap:** `running` flag prevents the next tick from starting while the previous is still in progress.
- **Visibility:** one console.log per tick with `refreshed/skipped/failed` counts.

## Frontend

`AgentEdit.jsx` and `ChatbotEdit.jsx` have nearly-identical calendar config UI (single + multi mode). The same changes apply to both.

### When `provider === 'ghl'`

1. **Hide** the Timezone `<select>` (around `AgentEdit.jsx:4087-4099`), Duration `<select>` (`:4100-4114`), and Appointment Title `<input>` (`:4147-4159`).

2. **Render** a read-only "From GoHighLevel" panel showing the cached values:

```
┌─────────────────────────────────────────────────────────┐
│  📅 From GoHighLevel              Synced 2h ago     ↻  │
│  Timezone:  America/Chicago                             │
│  Duration:  45 min                                      │
│  Title:     {{contact.name}} - Consultation             │
└─────────────────────────────────────────────────────────┘
```

The `↻` icon is a "Refresh now" button. Clicking it calls `calendarAPI.getDetails(...)`, updates the local entry's `meta`, and writes back when the user clicks "Listo." The icon spins while in-flight.

3. **At calendar-select time:** when the user picks a calendar in the dropdown, the modal immediately calls `calendarAPI.getDetails(...)` and stashes the result into the entry's `meta`. By the time the user clicks "Listo," the snapshot is populated. If the fetch fails (`status: error/not_found`), the panel shows the warning state but the modal still saves — booking falls back to legacy fields.

### Status display variants

- `status: 'ok'` — values + "Synced X ago" + small refresh icon
- `status: 'not_found'` — red banner: "This calendar no longer exists in GoHighLevel" + "Pick another calendar" prompt that opens the calendar dropdown
- `status: 'error'` — yellow banner: "Couldn't refresh from GoHighLevel — using last known values" + retry button + visible cached values
- `status: 'unsupported'` — shouldn't happen for GHL; if it does, log + fall back to editable fields

### When `provider !== 'ghl'`

UI unchanged. Timezone/Duration/Title stay editable as today. No `meta` panel rendered.

### Booking-time runtime change

In each place that currently sends `duration`/`title` to the booking tool (e.g. `AgentEdit.jsx:1207-1255` for voice, equivalent in ChatbotEdit for chat):

```js
const isGhlOk = cal.provider === 'ghl' && cal.meta?.status === 'ok'
const effectiveDuration = isGhlOk ? (cal.meta.slotDuration ?? cal.appointmentDuration ?? 30)
                                   : (cal.appointmentDuration ?? 30)
const effectiveTitle    = isGhlOk ? (cal.meta.eventTitle ?? cal.appointmentTitle ?? '')
                                   : (cal.appointmentTitle ?? '')
const effectiveTimezone = isGhlOk ? (cal.meta.timezone ?? cal.timezone ?? 'America/New_York')
                                   : (cal.timezone ?? 'America/New_York')
```

Three-step fallback prevents `undefined` from reaching the booking provider, which has historically caused 400s from GHL.

### i18n

New keys under `agentEdit.calendarMeta.*` in both `client/src/i18n/en.json` and `client/src/i18n/es.json`:

- `fromGhl`, `synced`, `refreshing`, `refreshNow`
- `notFound`, `errorBanner`, `openAdvanced`, `retry`
- `tzLabel`, `durationLabel`, `titleLabel`

~10 keys × 2 languages.

## Edge cases

- **Migration of existing agents:** No DB migration. `meta` populates on first save (via the modal's calendar-pick fetch) or first refresh tick. Booking continues to work off legacy fields until then. No agent breaks.

- **Calendar deleted in GHL:** Refresh tick gets 404 → `meta.status = 'not_found'`. Modal shows red banner. Booking detects `status !== 'ok'` and falls back to legacy fields.

- **Token expired during refresh:** `getValidToken` attempts internal refresh (existing behavior). If refresh fails, `getCalendarDetails` throws, refresh job writes `meta.status = 'error'` and continues. Next tick retries.

- **Concurrent save + refresh race:** User saves while refresh tick is mid-flight on the same agent. Refresh job only mutates `meta` (never user-controlled fields like `name`, `scenario`, `contactId`). User-edited values survive. Acceptable trade-off — alternative locking is complex and the window is tiny.

- **Booking tool fallback chain:** Three-step `meta → legacy → default` chain prevents undefined values from reaching the booking provider.

- **Last-known-good preservation:** Legacy `appointmentDuration`/`appointmentTitle`/`timezone` are not wiped during migration — they stay as fallback if `meta` ever fails. Users can't drift them because the UI no longer shows them as editable for GHL entries.

## Testing strategy

No test runner in repo — manual verification.

- **Voice E2E:** Open existing GHL voice agent → modal shows fields editable → save → reopen → modal now shows read-only `meta` panel with synced values. Run a test booking call → verify GHL's `slotDuration`/`eventTitle`/`timezone` are used.
- **Refresh job:** Change a calendar's title in GHL → trigger `runOnce(prisma)` manually via `node -e "require('./server/src/services/calendarMetaRefresher').runOnce(require('@prisma/client').prisma)"` (or wait 4h) → verify the agent's `config.calendars[0].meta.eventTitle` updated.
- **404 path:** Delete a calendar in GHL → trigger one refresh tick → verify `meta.status === 'not_found'` and modal renders red banner.
- **Non-GHL:** Open a Google Calendar entry → modal still shows editable timezone/duration/title (unchanged behavior).
- **Chatbot parity:** Same checks on a chatbot.
- **Legacy agent:** Open an agent with no `meta` field → booking still works via fallback to legacy fields.
- **Manual refresh button:** Click `↻` in the modal → spinner appears → values update.
- **Race resilience:** Save a calendar entry while a refresh tick is running → verify user-edited fields survive.

## Rollout plan

1. Ship the feature. The change is invisible until a user opens an existing GHL calendar entry in the modal (which migrates it via the calendar-pick fetch) or until the 4-hour refresh tick reaches each agent.
2. After the first refresh tick, all GHL-backed agents have `meta` populated and the modal renders the read-only panel.
3. No feature flag — the change is non-destructive (legacy fields preserved as fallback) and per-provider (only GHL affected).

## Files touched

### New files

- `server/src/services/calendarMetaRefresher.js` — refresh job
- `server/src/services/calendar/providerFactory.js` — extracted shared factory that returns a provider instance given `(prisma, userId, providerKey, integrationId)`. Used by both the calendar controller and the refresh job.

### Modified files

- `server/src/services/calendar/CalendarProvider.js` — add abstract `getCalendarDetails`
- `server/src/services/calendar/GHLCalendarProvider.js` — implement `getCalendarDetails`
- `server/src/controllers/calendarController.js` — add `GET /api/calendar/details` route + extract provider factory
- `server/src/routes/calendar.js` (or wherever calendar routes live) — wire the new endpoint
- `server/src/index.js` — start the refresh job after `app.listen`
- `client/src/services/api.js` — add `calendarAPI.getDetails`
- `client/src/components/Dashboard/AgentEdit.jsx` — modal UI changes (single + multi mode), booking-time fallback chain
- `client/src/components/Dashboard/ChatbotEdit.jsx` — same modal changes, same booking-time fallback chain
- `client/src/i18n/en.json` and `client/src/i18n/es.json` — ~10 new keys × 2 languages

## Open follow-ups (post-v1)

- Implement `getCalendarDetails()` on Google Calendar / Cal.com / Calendly / HubSpot providers for parity.
- Add a "force refresh" admin action visible to OWNER role for support cases where a user reports stale data.
- Add `meta.status === 'not_found'` notifications surfaced in the agents list (badge on rows whose calendars are broken).
