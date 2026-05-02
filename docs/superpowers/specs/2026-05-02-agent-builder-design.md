# Agent Builder — Guided creation + training-via-call

**Date:** 2026-05-02
**Status:** Design approved, pending implementation plan

## Problem

The existing agent creation flow drops new clients straight into `AgentEdit.jsx` — a ~1400-line dense editor with dozens of advanced settings. Power users like it; new clients don't. There's no guided "set up + first test" experience that walks a client from "I want an agent" to "I have a working agent I just talked to."

A separate `TrainingCallModal` already exists that lets a user call their voice agent, talk to it, and have an LLM propose prompt diffs that the user can accept or reject. It's powerful but hidden inside `AgentEdit`. Clients never find it.

This spec defines a new **Agent Builder** — a separate page that handles guided creation (questionnaire + voice pick + first prompt generation) and serves as the ongoing "training home" for that agent (where edits happen via call, not by re-editing form fields). Two type variants: voice agents and text agents (chatbots).

## Goals

1. A calm, guided onboarding for new clients to create their first voice or text agent.
2. A persistent "home page" per agent where the only ongoing edit surface is a voice call (for voice agents) or chat (for text agents) — not raw form fields.
3. Reuse the existing `TrainingCallModal`, `promptGeneratorAPI`, voice picker, and `agentsAPI`/`chatbotsAPI` — no new backend endpoints, no schema changes.
4. Roll out per-user via the existing `agentGeneratorEnabled` feature flag. Existing create paths (`quickCreateAgent`, "Create Agent" / "Create Chatbot" floating actions, `AgentEdit`) keep working. The only edits to existing files are: a small "Open builder" link added to the agents/chatbots list rows when an agent has `wizardAnswers`, the new sidebar entries, and extracting `VoicePicker` out of `AgentEdit.jsx` so the wizard can reuse it.

## Non-goals (v1)

- A chat-based training session (`TrainingChatModal` with chat-transcript → propose-prompt-diffs). Deferred. Text agents in v1 use the existing `TestChatbotModal` for testing; structural prompt edits go through `AgentEdit` or the wizard's regenerate mode.
- Model / transcriber / advanced behavior knobs inside the wizard. Those stay in `AgentEdit`.
- Server-side drafts of in-progress wizards. localStorage backup only.
- Backfilling `wizardAnswers` on agents that pre-date this feature. They get a graceful fallback card.

## Architecture overview

Two page components sharing a small shell, gated behind `agentGeneratorEnabled`. Wizard creates an agent and navigates to home; home is the recurring page with the training-call CTA.

### Routes

| Path | Component | Mode |
|---|---|---|
| `/dashboard/agent-builder/voice/new` | `AgentBuilderWizard` | Voice wizard |
| `/dashboard/agent-builder/voice/:id` | `AgentBuilderHome` | Voice training home |
| `/dashboard/agent-builder/voice/:id?mode=regenerate` | `AgentBuilderWizard` | Voice regenerate (pre-filled) |
| `/dashboard/agent-builder/chat/new` | `AgentBuilderWizard` | Chat wizard |
| `/dashboard/agent-builder/chat/:id` | `AgentBuilderHome` | Chat training home |
| `/dashboard/agent-builder/chat/:id?mode=regenerate` | `AgentBuilderWizard` | Chat regenerate (pre-filled) |

If a user without `agentGeneratorEnabled` hits any of these URLs, redirect to `/dashboard/agents` (or `/dashboard/chatbots`) silently.

### Sidebar entries

Add to `DashboardLayout.jsx` `menuSections`:

- Under Agents section (visible when `voiceAgentsEnabled !== false && agentGeneratorEnabled === true`):
  `{ id: 'agent-builder-voice', path: '/dashboard/agent-builder/voice/new', label: t('sidebar.agentBuilderVoice'), icon: Icons.CreateAgent, roles: [OWNER, WHITELABEL, AGENCY, CLIENT] }`
- Under Chatbots section (visible when `chatbotsEnabled !== false && agentGeneratorEnabled === true`):
  `{ id: 'agent-builder-chat', path: '/dashboard/agent-builder/chat/new', label: t('sidebar.agentBuilderChat'), icon: Icons.CreateAgent, roles: [OWNER, WHITELABEL, AGENCY, CLIENT] }`

Existing "Create Agent" / "Create Chatbot" floating-action items stay as-is. Both flows coexist.

### "Resume training" entry from agent list

When an agent has `config.wizardAnswers` populated, the row in the agents (or chatbots) list shows an extra "Open builder" link that goes to `/dashboard/agent-builder/{type}/:id`. This is how clients find their training home without memorizing URLs.

## Component file map

```
client/src/components/Dashboard/AgentBuilder/
├── AgentBuilderShell.jsx           // Header bar (type badge, name, advanced-editor link)
├── AgentBuilderWizard.jsx          // Steps 1-7, type-aware, supports regenerate mode
├── AgentBuilderHome.jsx            // Training home, type-aware
├── steps/
│   ├── StepBasics.jsx
│   ├── StepBusiness.jsx
│   ├── StepGoalTone.jsx
│   ├── StepTypeConfig.jsx
│   ├── StepVoice.jsx               // Voice-only
│   ├── StepReviewGenerate.jsx
│   └── StepDone.jsx
└── home/
    ├── BehaviorPreviewCard.jsx
    ├── WizardAnswersCard.jsx
    └── TrainingHistoryCard.jsx     // Voice-only

client/src/components/Dashboard/
└── VoicePicker.jsx                 // NEW — extracted from AgentEdit.jsx
                                    // Used by both AgentEdit and StepVoice
```

`VoicePicker` extraction is a targeted improvement that directly serves this work (the wizard needs the same picker). It is not a sweeping refactor of `AgentEdit`.

## Wizard page (`AgentBuilderWizard.jsx`)

Multi-step form ending with a created (or updated) agent. Same component for voice and chat; the type prop drives type-specific steps and copy.

### Steps

1. **Basics** — agent name, language. (Both types)
2. **Business context** — company name, industry, brief description. (Both)
3. **Goal & tone** — what the agent should accomplish (free text), tone preset (friendly / professional / casual / energetic). (Both)
4. **Type config** — voice agents: outbound vs inbound + first-call situation; chatbots: where it'll live (web widget / WhatsApp / SMS) + handoff rules. (Type-specific, one step)
5. **Voice** *(voice agents only)* — `<VoicePicker />` reusing the existing `voicesAPI` list with provider/gender/accent/language filters. Pre-selects a sensible default for the chosen language.
6. **Review & generate** — summary card of all answers, "Generate prompt" button → `promptGeneratorAPI.generate(payload)`, shows generated `systemPrompt` + `firstMessage` in editable previews, "Regenerate" available.
7. **Done** — "Create agent" button → `agentsAPI.create` (or `chatbotsAPI.create`) with the generated prompt + voice + `config.wizardAnswers`. On success, navigate to `/agent-builder/{type}/:id`.

In **regenerate mode** (`?mode=regenerate`), the wizard pre-fills from `agent.config.wizardAnswers`, jumps directly to Step 6, and on save calls `agentsAPI.update`. **Precondition:** `wizardAnswers` must exist on the agent. The home-page "Edit answers & regenerate" link only renders when it does. If a user manually crafts a `?mode=regenerate` URL on a legacy agent without `wizardAnswers`, the wizard falls back to fresh-create mode (Step 1) but still updates instead of creating on save (preserving voice, integrations, phone numbers, prior accepted training-call diffs that aren't being regenerated). Step 6 in this mode shows a prominent warning: *"Regenerating will overwrite the current system prompt. Changes accepted from training calls will be lost. Voice and other settings are preserved."* Two-step confirm.

### Validation

- Per-step required fields (name, company, goal). "Next" disabled until valid.
- `companyName` and `goals` are the two fields the existing prompt generator hard-requires (see `AgentEdit.jsx:2091`). Surface this contract in the UI.

### Persistence

- All wizard state lives in component state until step 7 succeeds.
- localStorage backup keyed by `agentBuilder.draft.{type}` for accidental-refresh recovery. Cleared on successful create or explicit Discard.
- No server-side drafts.

### Data persisted on the agent

```jsonc
// agent.config (existing free-form JSON column — no Prisma migration)
{
  "agentType": "outbound",
  "modelProvider": "openai",
  "modelName": "gpt-4o",
  "voiceProvider": "11labs",
  "voiceId": "...",
  "language": "en",
  "systemPrompt": "...",
  "firstMessage": "...",
  "wizardAnswers": {            // NEW — only addition
    "name": "Acme Booking Bot",
    "companyName": "Acme",
    "industry": "Dental clinic",
    "description": "...",
    "tone": "friendly",
    "goals": "...",
    "typeConfig": { /* voice: { direction, situation } | chat: { channel, handoff } */ },
    "additionalNotes": "...",
    "createdAt": "2026-05-02T...",
    "regeneratedAt": "..."       // updated on regenerate
  }
}
```

`wizardAnswers` is the contract `AgentBuilderHome` reads to render the read-only "Created from…" summary.

### Error states

- `promptGeneratorAPI.generate` failure (no OpenAI key, rate limit) → inline error on Review step + "Try again" + "Skip generation, write prompt manually" escape hatch (sends user to `AgentEdit`).
- `agentsAPI.create` failure → stay on step 7 with error toast; user keeps the generated prompt and can retry.

## Training home page (`AgentBuilderHome.jsx`)

Single-column layout, sectioned vertically.

### Sections

1. **Header** — Agent name (editable inline), type badge (Voice / Chat), "Open advanced editor" link to `/dashboard/agent/:id` (or `/chatbot/:id`).
2. **Primary action card** —
   - Voice: large "Edit via Call" button → opens existing `TrainingCallModal` (no changes).
   - Chat: large "Test Chat" button → opens existing `TestChatbotModal` (no changes) + small note: *"Chat-based training coming soon — for now, edit prompt in advanced editor."*
3. **Current behavior preview** (read-only) —
   - Voice: voice name + "Play sample", first message, system prompt (collapsed; "Show full prompt" toggle).
   - Chat: first message, system prompt (same UI).
4. **Created from** card — read-only render of `config.wizardAnswers`. "Edit answers & regenerate" link → wizard in `regenerate` mode.
5. **Training history** *(voice agents only, v1)* — list from `trainingAPI.listSessions(agentId)`. Each row: date, duration, # accepted changes, status. Expanding a row shows the diffs that were applied.

### Data load on mount

- `agentsAPI.get(:id)` → header + behavior preview + wizardAnswers summary.
- `voicesAPI.list()` → resolves `voiceId` to a name for the preview. Falls back to raw `voiceId` if not found (same defensive pattern as `AgentEdit.jsx:2078`).
- `trainingAPI.listSessions(agentId)` → training history (voice only).

### Empty states

- Agent has no `wizardAnswers` (legacy agent opened in builder URL): "Created from" card shows fallback CTA — "This agent wasn't created with the builder. Run the wizard to fill in context, or open advanced editor."
- No training history: friendly empty state — "No training calls yet. Click 'Edit via Call' above to start your first one."

### Refresh after a training call

`TrainingCallModal` already calls `trainingAPI.acceptSession(id)` on accept and exposes an `onAccepted` callback. Home page subscribes and refetches `agentsAPI.get` + `trainingAPI.listSessions`. No changes to the modal.

## Shared shell (`AgentBuilderShell.jsx`)

Tiny wrapper used by both wizard and home. Page chrome only — no business logic.

- Top bar: back-to-list link, type badge, agent name (or "New agent" in wizard mode), "Open advanced editor" link (only when an agent exists), language toggle reuses the existing `useLanguage` context.
- Tailwind styling consistent with the rest of the dashboard.

## i18n

- Namespace `agentBuilder.*` for all wizard + home strings.
- Sidebar keys: `sidebar.agentBuilderVoice`, `sidebar.agentBuilderChat`.
- Reuse existing `trainingMode.*` keys for the call modal — no changes.
- ~40 new strings × 2 languages (en, es) added to `client/src/i18n/{en,es}.json`.

## Backend changes

**None.** Reuses:
- `agentsAPI.create / get / update / list` (existing)
- `chatbotsAPI.create / get / update / list` (existing)
- `promptGeneratorAPI.generate / update` (existing)
- `voicesAPI.list` (existing)
- `trainingAPI.createSession / listSessions / getSession / completeSession / acceptSession / rejectSession` (existing, voice only)

No Prisma migrations. `wizardAnswers` rides inside the existing `config` JSON column.

## Testing strategy

### Integration tests (real backend, follows project's no-mock-DB pattern)

- Voice wizard happy path: fill all fields → generate → create → assert agent created with `wizardAnswers` and navigation to home.
- Chat wizard happy path: same flow with chatbot endpoints.
- Regenerate mode: open existing agent in `?mode=regenerate`, change tone, confirm, assert `systemPrompt` updated and other `config` keys (voice, phone numbers if any) preserved.
- Feature flag gate: user with `agentGeneratorEnabled = false` navigating to a builder URL → redirected.

### Component-level checks

- Per-step validation: required-field absent → "Next" disabled.
- Home page renders correctly with and without `wizardAnswers`.
- Sidebar items hidden when flag off; visible when on.

### Manual E2E checklist

- Voice: full wizard → home → "Edit via Call" → speak → accept diffs → home refreshes with new history row + updated prompt preview.
- Chat: full wizard → home → "Test Chat" opens existing modal.
- Regenerate: edit goal text → confirm overwrite warning → save → home shows new prompt.

## Edge cases & known limitations

- **Concurrent training call + regenerate** in different tabs: last-write-wins on the system prompt. The regenerate confirm dialog warns about losing call diffs. Documented as a known limitation; not blocking for v1.
- **OpenAI key missing** during prompt generation: existing `promptGeneratorAPI` returns a clear error. Wizard surfaces it inline with the manual-prompt escape hatch.
- **Long generated prompts**: existing collapse/expand UI from `AgentEdit` is reused.
- **Voice no longer exists** (custom voice deleted): home preview shows raw `voiceId` (matches existing defensive handling at `AgentEdit.jsx:2078`).

## Rollout plan

1. Ship feature gated by `agentGeneratorEnabled = false` for everyone (no visible change).
2. Enable for one or two pilot clients (toggle the flag on their user record).
3. Iterate based on feedback.
4. Once validated, enable globally and consider promoting it to the default create flow (replacing `quickCreateAgent` — separate spec).

## Open follow-ups (post-v1, not in scope here)

- `TrainingChatModal` — chat-based training session for chatbots. Backend gets a `mode` discriminator on training sessions; frontend gets a chat UI mirroring `TrainingCallModal`'s propose-diffs/accept-reject loop.
- Migrate legacy agents to populate `wizardAnswers` from inferable fields (best-effort, optional).
- "Promote builder to default create flow" — replaces existing quick-create floating actions once the new flow is proven.
