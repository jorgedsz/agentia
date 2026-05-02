# Agent Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a guided "Agent Builder" page that lets clients create voice or text agents through a wizard, then serves as the agent's training-home where ongoing edits happen via call (voice) or chat (text), gated behind the existing `agentGeneratorEnabled` feature flag.

**Architecture:** Two new React pages (`AgentBuilderWizard`, `AgentBuilderHome`) sharing a small shell. Wizard creates an agent and navigates to home. Home reuses the existing `TrainingCallModal` (voice) and `TestChatbotModal` (chat). Wizard answers persist inside the existing `config` JSON column on the agent — no Prisma migrations, no new backend endpoints. Voice picker is extracted from `AgentEdit.jsx` into a shared `VoicePicker.jsx`.

**Tech Stack:** React 18, react-router-dom v6, Tailwind, axios via existing `services/api.js`. No test framework exists in this repo — every task ends in **manual verification** (start the dev server, click through, observe). The commit step closes each task.

**Spec:** [docs/superpowers/specs/2026-05-02-agent-builder-design.md](../specs/2026-05-02-agent-builder-design.md)

---

## Working notes for the implementer

- **No test runner.** Neither client nor server has one installed. Do not invent one. Every task uses manual verification: run `npm run dev` from `client/`, log in, navigate, and check.
- **Windows / PowerShell.** The repo's primary dev environment. Quote paths with spaces.
- **i18n is mandatory.** Every user-visible string goes into both `client/src/i18n/en.json` and `client/src/i18n/es.json`. The `useLanguage()` hook + `t('key')` is the standard pattern (see `Training.jsx` for usage).
- **Commits go on `main` directly** (this is the project's pattern — see recent log). Use the same style as `8e1a1f5`, `b9de4f9` etc.: short imperative subject, no `feat:`/`fix:` prefix.
- **Don't break `AgentEdit.jsx`.** It's the most-used page. Task 5's voice picker extraction is the only edit. Verify the picker still works in `AgentEdit` after the swap.
- **Feature flag default.** `user.agentGeneratorEnabled` is `false` for everyone right now. The whole feature ships invisible. To verify visually, you'll need to flip it on for your test user.

---

## File map

### New files

```
client/src/components/Dashboard/VoicePicker.jsx                    (extracted from AgentEdit)
client/src/components/Dashboard/AgentBuilder/
├── AgentBuilderShell.jsx                                          (header chrome)
├── AgentBuilderWizard.jsx                                         (multi-step form)
├── AgentBuilderHome.jsx                                           (training home)
├── steps/
│   ├── StepBasics.jsx
│   ├── StepBusiness.jsx
│   ├── StepGoalTone.jsx
│   ├── StepTypeConfig.jsx
│   ├── StepVoice.jsx
│   ├── StepReviewGenerate.jsx
│   └── StepDone.jsx
└── home/
    ├── BehaviorPreviewCard.jsx
    ├── WizardAnswersCard.jsx
    └── TrainingHistoryCard.jsx
```

### Modified files

```
client/src/App.jsx                                       (4 new routes)
client/src/components/Dashboard/DashboardLayout.jsx      (2 sidebar entries)
client/src/components/Dashboard/AgentEdit.jsx            (use new VoicePicker)
client/src/components/Dashboard/DashboardContent.jsx     ("Open builder" button on agent rows)
client/src/components/Dashboard/ChatbotList.jsx          ("Open builder" button on chatbot rows)
client/src/i18n/en.json                                  (~45 new strings)
client/src/i18n/es.json                                  (same keys, Spanish)
```

---

# Phase 1 — Foundations

These tasks add the scaffolding (i18n keys, sidebar entries, routes pointing to placeholders, shell). Nothing ships visible to users yet.

## Task 1: Add all i18n strings up front

**Files:**
- Modify: `client/src/i18n/en.json`
- Modify: `client/src/i18n/es.json`

We add every string the wizard + home will need now, even though the screens don't exist. This means later tasks just call `t('agentBuilder.someKey')` without bouncing back here.

- [ ] **Step 1: Open `client/src/i18n/en.json` and add a new top-level `agentBuilder` block.** Place it alphabetically near other top-level blocks (e.g., right after `agentEdit`). Add this content verbatim:

```json
"agentBuilder": {
  "voiceTitle": "Voice Agent Builder",
  "chatTitle": "Chatbot Builder",
  "newAgent": "New agent",
  "openAdvancedEditor": "Open advanced editor",
  "back": "Back",
  "next": "Next",
  "step": "Step",
  "of": "of",
  "discardDraft": "Discard draft",
  "draftRestored": "Draft restored",

  "stepBasicsTitle": "Basics",
  "stepBasicsDesc": "Give your agent a name and pick the language it will speak.",
  "fieldName": "Agent name",
  "fieldNamePlaceholder": "e.g., Acme Booking Bot",
  "fieldLanguage": "Language",

  "stepBusinessTitle": "Business context",
  "stepBusinessDesc": "Tell us about the business this agent represents.",
  "fieldCompanyName": "Company name",
  "fieldIndustry": "Industry",
  "fieldIndustryPlaceholder": "e.g., Dental clinic, real estate, e-commerce",
  "fieldDescription": "Brief description (optional)",

  "stepGoalToneTitle": "Goal & tone",
  "stepGoalToneDesc": "What should the agent accomplish, and how should it sound?",
  "fieldGoals": "Goal",
  "fieldGoalsPlaceholder": "e.g., Book appointments and answer common questions about services.",
  "fieldTone": "Tone",
  "toneFriendly": "Friendly",
  "toneProfessional": "Professional",
  "toneCasual": "Casual",
  "toneEnergetic": "Energetic",

  "stepTypeConfigTitle": "Configuration",
  "voiceDirection": "Direction",
  "directionOutbound": "Outbound (we call them)",
  "directionInbound": "Inbound (they call us)",
  "fieldSituation": "First-call situation",
  "fieldSituationPlaceholder": "e.g., Following up after a website form submission",
  "chatChannel": "Where will this chatbot live?",
  "channelWeb": "Website widget",
  "channelWhatsapp": "WhatsApp",
  "channelSms": "SMS",
  "fieldHandoff": "When should it hand off to a human?",
  "fieldHandoffPlaceholder": "e.g., If the user asks for a refund or sounds upset",

  "stepVoiceTitle": "Voice",
  "stepVoiceDesc": "Pick the voice your agent will use.",
  "openVoicePicker": "Choose a voice",

  "stepReviewTitle": "Review & generate",
  "stepReviewDesc": "We'll generate a system prompt and a first message from your answers.",
  "summaryName": "Name",
  "summaryCompany": "Company",
  "summaryIndustry": "Industry",
  "summaryGoals": "Goal",
  "summaryTone": "Tone",
  "summaryLanguage": "Language",
  "summaryVoice": "Voice",
  "generateBtn": "Generate prompt",
  "regenerateBtn": "Regenerate",
  "generating": "Generating…",
  "generatedPrompt": "System prompt",
  "generatedFirstMessage": "First message",
  "skipManual": "Skip generation, write prompt manually",
  "regenerateWarningTitle": "Overwrite current prompt?",
  "regenerateWarning": "Regenerating will replace the current system prompt and first message. Changes accepted from past training calls will be lost. Voice and other settings are preserved.",
  "regenerateConfirm": "Yes, regenerate",

  "stepDoneTitle": "Create your agent",
  "stepDoneDesc": "We'll save the agent and take you to its training home.",
  "createBtn": "Create agent",
  "creating": "Creating…",

  "homeCreatedFromTitle": "Created from",
  "homeCreatedFromEmpty": "This agent wasn't created with the builder.",
  "homeCreatedFromEmptyCta": "Run the wizard to fill in context",
  "homeEditAnswers": "Edit answers & regenerate",
  "homeBehaviorTitle": "Current behavior",
  "homeShowFullPrompt": "Show full prompt",
  "homeHideFullPrompt": "Hide full prompt",
  "homePlaySample": "Play sample",
  "homeFirstMessageLabel": "First message",
  "homeSystemPromptLabel": "System prompt",
  "homeVoiceLabel": "Voice",
  "homeEditViaCall": "Edit via Call",
  "homeTestChat": "Test Chat",
  "homeChatTrainingComingSoon": "Chat-based training coming soon — for now, edit prompt in advanced editor.",
  "homeHistoryTitle": "Training history",
  "homeHistoryEmpty": "No training calls yet. Click \"Edit via Call\" above to start your first one.",
  "homeHistoryDuration": "Duration",
  "homeHistoryChanges": "changes accepted",
  "homeHistoryStatusAccepted": "Accepted",
  "homeHistoryStatusRejected": "Rejected",
  "homeHistoryStatusActive": "In progress",

  "errorGenerateFailed": "Could not generate prompt. Try again or write it manually.",
  "errorCreateFailed": "Could not create the agent. Please try again.",
  "errorUpdateFailed": "Could not save changes. Please try again."
},
```

Also add into the existing `sidebar` block (find it in the file) two new keys:

```json
"agentBuilderVoice": "Voice Agent Builder",
"agentBuilderChat": "Chatbot Builder",
```

- [ ] **Step 2: Mirror everything in `client/src/i18n/es.json`.** Same keys, Spanish translations. Use existing translation style from neighbors. Quick reference for tricky ones:
  - `voiceTitle`: "Constructor de Agente de Voz"
  - `chatTitle`: "Constructor de Chatbot"
  - `homeEditViaCall`: "Editar por llamada"
  - `homeTestChat`: "Probar chat"
  - `regenerateWarning`: "Regenerar reemplazará el prompt actual y el primer mensaje. Se perderán los cambios aceptados en llamadas de entrenamiento anteriores. La voz y otros ajustes se conservan."

- [ ] **Step 3: Manual verification.** Run `npm run dev` from `client/`. App should load with no JSON parse errors in the browser console. Switch language toggle — no missing-key warnings (existing screens unaffected).

- [ ] **Step 4: Commit**

```powershell
git add client/src/i18n/en.json client/src/i18n/es.json
git commit -m "$(cat <<'EOF'
Add Agent Builder i18n strings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Add routes to `App.jsx` pointing at a temporary placeholder

We add the routes now so subsequent tasks can navigate to them. Both wizard and home routes initially point at the same placeholder; later tasks swap in the real components.

**Files:**
- Modify: `client/src/App.jsx`

- [ ] **Step 1: Add four routes inside the `/dashboard` nested block.** Place them right after the `agent/:id` route (line ~137) and before `accounts`:

```jsx
<Route path="agent-builder/voice/new" element={<ComingSoon title="Agent Builder (Voice)" />} />
<Route path="agent-builder/voice/:id" element={<ComingSoon title="Agent Builder (Voice)" />} />
<Route path="agent-builder/chat/new" element={<ComingSoon title="Agent Builder (Chat)" />} />
<Route path="agent-builder/chat/:id" element={<ComingSoon title="Agent Builder (Chat)" />} />
```

`ComingSoon` is already defined in `App.jsx` (line 76). No new imports needed.

- [ ] **Step 2: Manual verification.** Dev server running, log in, manually visit `/dashboard/agent-builder/voice/new` in the URL bar. Should render the existing "Coming Soon" card. Same for the other three URLs.

- [ ] **Step 3: Commit**

```powershell
git add client/src/App.jsx
git commit -m "$(cat <<'EOF'
Add Agent Builder routes (placeholder targets)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add gated sidebar entries

`agentGeneratorEnabled` is already wired into `DashboardLayout.jsx`'s feature filter. We just need a section that uses it.

**Files:**
- Modify: `client/src/components/Dashboard/DashboardLayout.jsx`

- [ ] **Step 1: In `allMenuSections`, add the voice builder entry.** Find the existing Agents section (`title: t('sidebar.sectionAgents')`, around line 234). Add this item to its `items` array, after `create-agent`:

```jsx
{ id: 'agent-builder-voice', path: '/dashboard/agent-builder/voice/new', label: t('sidebar.agentBuilderVoice'), icon: Icons.CreateAgent, roles: [ROLES.OWNER, ROLES.WHITELABEL, ROLES.AGENCY, ROLES.CLIENT], featureKey: 'agentGenerator' },
```

Do the same in the Chatbots section, after `create-chatbot`:

```jsx
{ id: 'agent-builder-chat', path: '/dashboard/agent-builder/chat/new', label: t('sidebar.agentBuilderChat'), icon: Icons.CreateAgent, roles: [ROLES.OWNER, ROLES.WHITELABEL, ROLES.AGENCY, ROLES.CLIENT], featureKey: 'agentGenerator' },
```

- [ ] **Step 2: Per-item feature filter.** The existing `menuSections` filter (line ~293) only filters whole sections. We need it on individual items too. Update the filter so that, after the section-level filter, each section's `items` array is also filtered by `featureKey`. Replace the existing `menuSections` definition with:

```jsx
const passesFeatureKey = (key) => {
  if (!key) return true
  if (key === 'voiceAgents') return user?.voiceAgentsEnabled !== false
  if (key === 'chatbots') return user?.chatbotsEnabled !== false
  if (key === 'crm') return user?.crmEnabled === true
  if (key === 'agentGenerator') return user?.agentGeneratorEnabled === true
  return true
}

const menuSections = allMenuSections
  .filter(section => passesFeatureKey(section.featureKey))
  .map(section => ({
    ...section,
    items: section.items.filter(item => passesFeatureKey(item.featureKey))
  }))
  .filter(section => section.items.length > 0)
```

- [ ] **Step 3: Manual verification.**
  - With your test user's `agentGeneratorEnabled = false` (default): sidebar should be unchanged. The two new entries are hidden.
  - Flip your test user's `agentGeneratorEnabled = true` directly in the database (Prisma Studio or psql). Reload. The two new entries appear under Agents and Chatbots respectively. Clicking each navigates to the placeholder.
  - Flip back to `false`. Verify the entries disappear again.

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/Dashboard/DashboardLayout.jsx
git commit -m "$(cat <<'EOF'
Gate Agent Builder sidebar entries behind agentGeneratorEnabled

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Create `AgentBuilderShell.jsx`

A small wrapper providing the header chrome (back link, type badge, agent name, "Open advanced editor" link). No business logic.

**Files:**
- Create: `client/src/components/Dashboard/AgentBuilder/AgentBuilderShell.jsx`

- [ ] **Step 1: Create the directory and file.**

```powershell
New-Item -ItemType Directory -Force -Path "client/src/components/Dashboard/AgentBuilder/steps", "client/src/components/Dashboard/AgentBuilder/home"
```

- [ ] **Step 2: Write `AgentBuilderShell.jsx`.**

```jsx
import { Link } from 'react-router-dom'
import { useLanguage } from '../../../context/LanguageContext'

export default function AgentBuilderShell({ type, agentId, agentName, children }) {
  const { t } = useLanguage()
  const title = type === 'voice' ? t('agentBuilder.voiceTitle') : t('agentBuilder.chatTitle')
  const advancedHref = agentId
    ? (type === 'voice' ? `/dashboard/agent/${agentId}` : `/dashboard/chatbot/${agentId}`)
    : null
  const listHref = type === 'voice' ? '/dashboard/agents' : '/dashboard/chatbots'

  return (
    <div className="min-h-full">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to={listHref}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
              ← {t('agentBuilder.back')}
            </Link>
            <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded border border-primary-300 text-primary-600 dark:border-primary-600/40 dark:text-primary-400 tracking-wider">
              {type === 'voice' ? 'Voice' : 'Chat'}
            </span>
            <h1 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
              {agentName || t('agentBuilder.newAgent')}
            </h1>
            <span className="text-sm text-gray-400">/ {title}</span>
          </div>
          {advancedHref && (
            <Link
              to={advancedHref}
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline whitespace-nowrap"
            >
              {t('agentBuilder.openAdvancedEditor')} →
            </Link>
          )}
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification.** Shell isn't wired in yet — nothing to render. Just make sure the file saves and the dev server doesn't error on file change (Vite HMR will rebuild).

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/AgentBuilderShell.jsx
git commit -m "$(cat <<'EOF'
Add AgentBuilderShell header component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 2 — Voice Picker extraction

The voice picker logic + JSX in `AgentEdit.jsx` runs ~250 lines. We extract it into `VoicePicker.jsx` so both `AgentEdit` and the wizard's `StepVoice` use the same component. Done before the wizard so we don't have to write a throwaway picker.

## Task 5: Extract `VoicePicker` from `AgentEdit.jsx`

**Files:**
- Create: `client/src/components/Dashboard/VoicePicker.jsx`
- Modify: `client/src/components/Dashboard/AgentEdit.jsx`

The new component owns its own filter state, voices fetch, search, and audio preview ref. The parent passes a current `voiceId` for highlighting and an `onSelect({ provider, voiceId, isCustom })` callback.

- [ ] **Step 1: Create `client/src/components/Dashboard/VoicePicker.jsx`.** Move the entire picker modal JSX (currently `AgentEdit.jsx` lines ~6981-end-of-modal) into the new component. The new component owns:
  - State: `voicesList`, `voicesLoading`, `voiceSearch`, `voiceProviderFilter`, `voiceGenderFilter`, `voiceAccentFilter`, `voiceLanguageFilter`, `previewPlayingId`, `customVoiceId`
  - Refs: `voiceAudioRef`
  - Effects: when `open` becomes true, reset filters and fetch voices via `voicesAPI.list()` (combined with `voicesAPI.listCustom()` if `AgentEdit.jsx` does that — check the existing `fetchVoicesList` function and copy the logic)
  - Handlers: `handleVoicePreview` (copy from `AgentEdit.jsx:2020-2054`), `selectVoiceFromPicker` (changed: now calls `props.onSelect` instead of mutating parent state directly), `getFilteredPickerVoices`

  Component signature:

  ```jsx
  export default function VoicePicker({
    open,
    onClose,
    onSelect,                  // ({ provider, voiceId, isCustom }) => void
    selectedVoiceId,           // string — for highlighting current selection
  }) { ... }
  ```

  Internally use `useLanguage()` and call `t('agentEdit.someKey')` for the picker's i18n keys (they already exist — see how `AgentEdit.jsx` uses `ta('chooseVoice')`, `ta('allVoicesOption')`, etc. — those keys live under `agentEdit.*` in en.json). Just keep the same keys.

  Render nothing when `open` is false.

- [ ] **Step 2: In `AgentEdit.jsx`, delete the inline picker code.** Remove:
  - The state declarations for `voiceProviderFilter`, `voiceGenderFilter`, `voiceAccentFilter`, `voiceLanguageFilter`, `voiceSearch`, `previewPlayingId`, `voicesList`, `voicesLoading`, `customVoiceId`, `addVoiceManually` (NB: `voiceProvider` and `voiceId` are still owned by `AgentEdit` — we do NOT remove those)
  - The handlers `openVoicePicker`, `closeVoicePicker`, `handleVoicePreview`, `selectVoiceFromPicker`, `getFilteredPickerVoices`, `fetchVoicesList`
  - The picker modal JSX block (`AgentEdit.jsx:6981` to its closing `)}`)

  Keep `showVoicePicker` state and the button at line ~2637 (`onClick={openVoicePicker}` — see below).

- [ ] **Step 3: Wire `<VoicePicker />` into `AgentEdit.jsx`.** Add the import at the top, near other component imports:

```jsx
import VoicePicker from './VoicePicker'
```

Replace the now-deleted picker modal with:

```jsx
<VoicePicker
  open={showVoicePicker}
  onClose={() => setShowVoicePicker(false)}
  selectedVoiceId={voiceId}
  onSelect={({ provider, voiceId: newId, isCustom }) => {
    setVoiceProvider(provider)
    setVoiceId(newId)
    setAddVoiceManually(!!isCustom)
    if (!isCustom) setCustomVoiceId('')
    setShowVoicePicker(false)
  }}
/>
```

Replace the `onClick={openVoicePicker}` button handler with `onClick={() => setShowVoicePicker(true)}`.

The `addVoiceManually` and `customVoiceId` state stay in `AgentEdit` (they're used elsewhere in the file for displaying the current voice — check usage). If they're only used inside the picker, you can remove them from `AgentEdit`. Verify with a quick search.

- [ ] **Step 4: Manual verification — DON'T BREAK AGENTEDIT.**
  - Open an existing voice agent at `/dashboard/agent/:id`.
  - Click the "Choose voice" button. Picker opens.
  - All four filters work (provider/gender/accent/language).
  - Search filters voices.
  - Click play on a voice — audio plays. Click again — pauses.
  - Click a voice card — modal closes, voice selection updates in the parent form.
  - "Add voice manually" card — type a voice ID, click "Use Voice" — modal closes, manual voice is set.
  - Click outside modal — closes without selecting.
  - Save the agent. Reload. Voice persists.
  - This is the highest-risk task in the plan. Spend time here.

- [ ] **Step 5: Commit**

```powershell
git add client/src/components/Dashboard/VoicePicker.jsx client/src/components/Dashboard/AgentEdit.jsx
git commit -m "$(cat <<'EOF'
Extract VoicePicker out of AgentEdit for reuse

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 3 — Wizard

## Task 6: Wizard skeleton + step container

We build the shell of `AgentBuilderWizard.jsx` with empty step components first. Each step component is added in subsequent tasks.

**Files:**
- Create: `client/src/components/Dashboard/AgentBuilder/AgentBuilderWizard.jsx`
- Create: `client/src/components/Dashboard/AgentBuilder/steps/StepBasics.jsx` (stub)
- Create: same stubs for `StepBusiness.jsx`, `StepGoalTone.jsx`, `StepTypeConfig.jsx`, `StepVoice.jsx`, `StepReviewGenerate.jsx`, `StepDone.jsx`
- Modify: `client/src/App.jsx` (swap placeholder for `AgentBuilderWizard`)

- [ ] **Step 1: Create stub step components.** Each is a one-liner that displays "Step N — title" so we can see navigation work. Example for `StepBasics.jsx`:

```jsx
export default function StepBasics({ values, onChange }) {
  return <div className="p-4 text-sm text-gray-500">[StepBasics placeholder]</div>
}
```

Repeat for the other six. Same signature `{ values, onChange }`. (`StepReviewGenerate.jsx` and `StepDone.jsx` will get extra props later — fine for now.)

- [ ] **Step 2: Create `AgentBuilderWizard.jsx` with state and step navigation.**

```jsx
import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLanguage } from '../../../context/LanguageContext'
import { useAuth } from '../../../context/AuthContext'
import { agentsAPI, chatbotsAPI } from '../../../services/api'
import AgentBuilderShell from './AgentBuilderShell'
import StepBasics from './steps/StepBasics'
import StepBusiness from './steps/StepBusiness'
import StepGoalTone from './steps/StepGoalTone'
import StepTypeConfig from './steps/StepTypeConfig'
import StepVoice from './steps/StepVoice'
import StepReviewGenerate from './steps/StepReviewGenerate'
import StepDone from './steps/StepDone'

const DRAFT_KEY = (type) => `agentBuilder.draft.${type}`

const DEFAULT_VALUES = {
  name: '',
  language: 'en',
  companyName: '',
  industry: '',
  description: '',
  goals: '',
  tone: 'friendly',
  typeConfig: {},
  additionalNotes: '',
  voiceProvider: '11labs',
  voiceId: 'pFZP5JQG7iQjIQuC4Bku',
  generatedPrompt: '',
  generatedFirstMessage: '',
}

export default function AgentBuilderWizard({ type }) {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLanguage()
  const isRegenerate = !!id && searchParams.get('mode') === 'regenerate'

  const allSteps = type === 'voice'
    ? ['basics', 'business', 'goalTone', 'typeConfig', 'voice', 'review', 'done']
    : ['basics', 'business', 'goalTone', 'typeConfig', 'review', 'done']

  const [stepIdx, setStepIdx] = useState(isRegenerate ? allSteps.indexOf('review') : 0)
  const [values, setValues] = useState(DEFAULT_VALUES)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Feature flag guard
  useEffect(() => {
    if (user && !user.agentGeneratorEnabled) {
      navigate(type === 'voice' ? '/dashboard/agents' : '/dashboard/chatbots', { replace: true })
    }
  }, [user, type, navigate])

  // Restore draft (only in fresh-create mode)
  useEffect(() => {
    if (isRegenerate || id) return
    try {
      const raw = localStorage.getItem(DRAFT_KEY(type))
      if (raw) {
        const draft = JSON.parse(raw)
        setValues((v) => ({ ...v, ...draft }))
      }
    } catch {}
  }, [type, id, isRegenerate])

  // Persist draft
  useEffect(() => {
    if (id) return
    try { localStorage.setItem(DRAFT_KEY(type), JSON.stringify(values)) } catch {}
  }, [values, type, id])

  // Pre-fill from existing agent in regenerate mode
  useEffect(() => {
    if (!isRegenerate || !id) return
    const api = type === 'voice' ? agentsAPI : chatbotsAPI
    api.get(id).then(({ data }) => {
      const cfg = typeof data.agent?.config === 'string' ? JSON.parse(data.agent.config) : (data.agent?.config || {})
      const w = cfg.wizardAnswers || {}
      setValues((v) => ({
        ...v,
        name: data.agent?.name || w.name || '',
        language: cfg.language || w.language || 'en',
        companyName: w.companyName || '',
        industry: w.industry || '',
        description: w.description || '',
        goals: w.goals || '',
        tone: w.tone || 'friendly',
        typeConfig: w.typeConfig || {},
        additionalNotes: w.additionalNotes || '',
        voiceProvider: cfg.voiceProvider || '11labs',
        voiceId: cfg.voiceId || DEFAULT_VALUES.voiceId,
        generatedPrompt: cfg.systemPrompt || '',
        generatedFirstMessage: cfg.firstMessage || '',
      }))
    }).catch(() => setError(t('agentBuilder.errorUpdateFailed')))
  }, [isRegenerate, id, type, t])

  const handleChange = (patch) => setValues((v) => ({ ...v, ...patch }))

  const stepName = allSteps[stepIdx]
  const isLast = stepIdx === allSteps.length - 1

  const validate = () => {
    if (stepName === 'basics') return !!values.name.trim()
    if (stepName === 'business') return !!values.companyName.trim()
    if (stepName === 'goalTone') return !!values.goals.trim()
    if (stepName === 'voice') return !!values.voiceId
    return true
  }

  const next = () => { if (validate() && stepIdx < allSteps.length - 1) setStepIdx(stepIdx + 1) }
  const back = () => { if (stepIdx > 0) setStepIdx(stepIdx - 1) }

  const renderStep = () => {
    const props = { values, onChange: handleChange, type, t }
    if (stepName === 'basics') return <StepBasics {...props} />
    if (stepName === 'business') return <StepBusiness {...props} />
    if (stepName === 'goalTone') return <StepGoalTone {...props} />
    if (stepName === 'typeConfig') return <StepTypeConfig {...props} />
    if (stepName === 'voice') return <StepVoice {...props} />
    if (stepName === 'review') {
      return <StepReviewGenerate {...props} isRegenerate={isRegenerate} onError={setError} />
    }
    if (stepName === 'done') {
      return <StepDone {...props} isRegenerate={isRegenerate} agentId={id} onError={setError} submitting={submitting} setSubmitting={setSubmitting} onCreated={(newId) => {
        try { localStorage.removeItem(DRAFT_KEY(type)) } catch {}
        navigate(`/dashboard/agent-builder/${type}/${newId}`)
      }} />
    }
    return null
  }

  return (
    <AgentBuilderShell type={type} agentId={id} agentName={values.name}>
      <div className="max-w-3xl mx-auto">
        <div className="mb-4 text-sm text-gray-500 dark:text-gray-400">
          {t('agentBuilder.step')} {stepIdx + 1} {t('agentBuilder.of')} {allSteps.length}
        </div>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          {renderStep()}
        </div>
        {error && <div className="mt-3 text-sm text-red-500">{error}</div>}
        <div className="flex items-center justify-between mt-4">
          <button
            type="button"
            onClick={back}
            disabled={stepIdx === 0 || isRegenerate}
            className="px-4 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 disabled:opacity-30"
          >
            {t('agentBuilder.back')}
          </button>
          {!isLast && (
            <button
              type="button"
              onClick={next}
              disabled={!validate()}
              className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white disabled:opacity-50"
            >
              {t('agentBuilder.next')}
            </button>
          )}
        </div>
      </div>
    </AgentBuilderShell>
  )
}
```

- [ ] **Step 3: Wire into `App.jsx`.** Add the import:

```jsx
import AgentBuilderWizard from './components/Dashboard/AgentBuilder/AgentBuilderWizard'
```

Replace the two wizard `<Route>` placeholders:

```jsx
<Route path="agent-builder/voice/new" element={<AgentBuilderWizard type="voice" />} />
<Route path="agent-builder/voice/:id" element={<AgentBuilderWizard type="voice" />} />
<Route path="agent-builder/chat/new" element={<AgentBuilderWizard type="chat" />} />
<Route path="agent-builder/chat/:id" element={<AgentBuilderWizard type="chat" />} />
```

(Both `:id` and `new` point at the wizard for now; in Task 13 we swap `/:id` to point at `AgentBuilderHome`.)

- [ ] **Step 4: Manual verification.** With `agentGeneratorEnabled = true` for your user, navigate to `/dashboard/agent-builder/voice/new`. You should see the shell + "Step 1 of 7" + the placeholder StepBasics text + a Next button (disabled since validation fails). Type something into… well, you can't yet — that comes next.
  - Set `agentGeneratorEnabled = false`. Reload. You should be redirected to `/dashboard/agents`.
  - Set it back to `true` to continue.

- [ ] **Step 5: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/ client/src/App.jsx
git commit -m "$(cat <<'EOF'
Add Agent Builder wizard skeleton with step routing

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `StepBasics` — name + language

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepBasics.jsx`

- [ ] **Step 1: Replace stub.** Use the same `LANGUAGES` array shape as `AgentEdit.jsx:10-23` (en, es, fr, de, it, pt, nl, pl, ru, ja, ko, zh).

```jsx
const LANGUAGES = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
  { id: 'fr', label: 'French' },
  { id: 'de', label: 'German' },
  { id: 'it', label: 'Italian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'nl', label: 'Dutch' },
  { id: 'pl', label: 'Polish' },
  { id: 'ru', label: 'Russian' },
  { id: 'ja', label: 'Japanese' },
  { id: 'ko', label: 'Korean' },
  { id: 'zh', label: 'Chinese' },
]

export default function StepBasics({ values, onChange, t }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepBasicsTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('agentBuilder.stepBasicsDesc')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('agentBuilder.fieldName')} *
        </label>
        <input
          type="text"
          value={values.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder={t('agentBuilder.fieldNamePlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('agentBuilder.fieldLanguage')}
        </label>
        <select
          value={values.language}
          onChange={(e) => onChange({ language: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
        >
          {LANGUAGES.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification.** Navigate to `/dashboard/agent-builder/voice/new`. Step 1 renders properly. Empty name disables Next; typing a name enables Next. Language dropdown works.

- [ ] **Step 3: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/steps/StepBasics.jsx
git commit -m "$(cat <<'EOF'
Build StepBasics for Agent Builder wizard

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: `StepBusiness`, `StepGoalTone`

Same shape as Task 7 — three more form steps, batched into one task because they're identical mechanically.

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepBusiness.jsx`
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepGoalTone.jsx`

- [ ] **Step 1: Implement `StepBusiness.jsx`.**

```jsx
export default function StepBusiness({ values, onChange, t }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepBusinessTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('agentBuilder.stepBusinessDesc')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('agentBuilder.fieldCompanyName')} *
        </label>
        <input
          type="text"
          value={values.companyName}
          onChange={(e) => onChange({ companyName: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('agentBuilder.fieldIndustry')}
        </label>
        <input
          type="text"
          value={values.industry}
          onChange={(e) => onChange({ industry: e.target.value })}
          placeholder={t('agentBuilder.fieldIndustryPlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('agentBuilder.fieldDescription')}
        </label>
        <textarea
          rows={3}
          value={values.description}
          onChange={(e) => onChange({ description: e.target.value })}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement `StepGoalTone.jsx`.**

```jsx
const TONES = [
  { id: 'friendly', labelKey: 'agentBuilder.toneFriendly' },
  { id: 'professional', labelKey: 'agentBuilder.toneProfessional' },
  { id: 'casual', labelKey: 'agentBuilder.toneCasual' },
  { id: 'energetic', labelKey: 'agentBuilder.toneEnergetic' },
]

export default function StepGoalTone({ values, onChange, t }) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepGoalToneTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('agentBuilder.stepGoalToneDesc')}</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {t('agentBuilder.fieldGoals')} *
        </label>
        <textarea
          rows={4}
          value={values.goals}
          onChange={(e) => onChange({ goals: e.target.value })}
          placeholder={t('agentBuilder.fieldGoalsPlaceholder')}
          className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          {t('agentBuilder.fieldTone')}
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {TONES.map((tone) => (
            <button
              key={tone.id}
              type="button"
              onClick={() => onChange({ tone: tone.id })}
              className={`px-3 py-2 text-sm rounded-lg border ${
                values.tone === tone.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                  : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300'
              }`}
            >
              {t(tone.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Manual verification.** Walk through Steps 1-3. Tone selector visually toggles. Goals required to advance. Inputs persist when stepping back/forward.

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/steps/StepBusiness.jsx client/src/components/Dashboard/AgentBuilder/steps/StepGoalTone.jsx
git commit -m "$(cat <<'EOF'
Build StepBusiness and StepGoalTone wizard steps

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: `StepTypeConfig` — type-aware

Voice → direction (outbound/inbound) + first-call situation. Chat → channel + handoff rule.

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepTypeConfig.jsx`

- [ ] **Step 1: Implement.**

```jsx
const VOICE_DIRECTIONS = [
  { id: 'outbound', labelKey: 'agentBuilder.directionOutbound' },
  { id: 'inbound', labelKey: 'agentBuilder.directionInbound' },
]

const CHAT_CHANNELS = [
  { id: 'web', labelKey: 'agentBuilder.channelWeb' },
  { id: 'whatsapp', labelKey: 'agentBuilder.channelWhatsapp' },
  { id: 'sms', labelKey: 'agentBuilder.channelSms' },
]

export default function StepTypeConfig({ values, onChange, type, t }) {
  const tc = values.typeConfig || {}
  const update = (patch) => onChange({ typeConfig: { ...tc, ...patch } })

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepTypeConfigTitle')}</h2>
      </div>

      {type === 'voice' ? (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('agentBuilder.voiceDirection')}
            </label>
            <div className="grid grid-cols-2 gap-2">
              {VOICE_DIRECTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => update({ direction: d.id })}
                  className={`px-3 py-2 text-sm rounded-lg border ${
                    tc.direction === d.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {t(d.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('agentBuilder.fieldSituation')}
            </label>
            <textarea
              rows={3}
              value={tc.situation || ''}
              onChange={(e) => update({ situation: e.target.value })}
              placeholder={t('agentBuilder.fieldSituationPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </>
      ) : (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('agentBuilder.chatChannel')}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {CHAT_CHANNELS.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => update({ channel: c.id })}
                  className={`px-3 py-2 text-sm rounded-lg border ${
                    tc.channel === c.id
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
                      : 'border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {t(c.labelKey)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('agentBuilder.fieldHandoff')}
            </label>
            <textarea
              rows={3}
              value={tc.handoff || ''}
              onChange={(e) => update({ handoff: e.target.value })}
              placeholder={t('agentBuilder.fieldHandoffPlaceholder')}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Manual verification.**
  - Voice URL: Step 4 shows direction toggle + situation textarea.
  - Chat URL (`/dashboard/agent-builder/chat/new`): Step 4 shows channel toggle + handoff textarea.

- [ ] **Step 3: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/steps/StepTypeConfig.jsx
git commit -m "$(cat <<'EOF'
Build StepTypeConfig (voice/chat aware)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: `StepVoice` — wraps `<VoicePicker />`

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepVoice.jsx`

- [ ] **Step 1: Implement.**

```jsx
import { useState, useEffect } from 'react'
import { voicesAPI } from '../../../../services/api'
import VoicePicker from '../../VoicePicker'

export default function StepVoice({ values, onChange, t }) {
  const [open, setOpen] = useState(false)
  const [voiceName, setVoiceName] = useState('')

  // Resolve voice name for display
  useEffect(() => {
    let cancelled = false
    voicesAPI.list().then(({ data }) => {
      if (cancelled) return
      const found = (data.voices || []).find((v) => v.voiceId === values.voiceId)
      setVoiceName(found ? found.name : values.voiceId)
    }).catch(() => setVoiceName(values.voiceId || ''))
    return () => { cancelled = true }
  }, [values.voiceId])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepVoiceTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('agentBuilder.stepVoiceDesc')}</p>
      </div>
      <div className="flex items-center justify-between p-3 rounded-lg border border-gray-300 dark:border-dark-border">
        <div className="text-sm text-gray-700 dark:text-gray-300">
          <span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.summaryVoice')}:</span>{' '}
          <strong>{voiceName || t('agentBuilder.openVoicePicker')}</strong>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="px-3 py-1.5 text-sm rounded-lg bg-primary-600 text-white"
        >
          {t('agentBuilder.openVoicePicker')}
        </button>
      </div>
      <VoicePicker
        open={open}
        onClose={() => setOpen(false)}
        selectedVoiceId={values.voiceId}
        onSelect={({ provider, voiceId, isCustom }) => {
          onChange({ voiceProvider: provider, voiceId, voiceIsCustom: !!isCustom })
          setOpen(false)
        }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Manual verification.** Step 5 (voice) shows current voice + button. Click button — picker opens, filters work, selecting closes the modal and updates the displayed name.

- [ ] **Step 3: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/steps/StepVoice.jsx
git commit -m "$(cat <<'EOF'
Build StepVoice wrapping the shared VoicePicker

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: `StepReviewGenerate` — call `promptGeneratorAPI.generate`

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepReviewGenerate.jsx`

- [ ] **Step 1: Implement.**

```jsx
import { useState } from 'react'
import { promptGeneratorAPI } from '../../../../services/api'

export default function StepReviewGenerate({ values, onChange, type, t, isRegenerate, onError }) {
  const [generating, setGenerating] = useState(false)
  const [confirmRegenerate, setConfirmRegenerate] = useState(false)

  const callGenerate = async () => {
    if (isRegenerate && !confirmRegenerate) {
      setConfirmRegenerate(true)
      return
    }
    setGenerating(true)
    try {
      const { data } = await promptGeneratorAPI.generate({
        botType: type === 'voice' ? 'voicebot' : 'chatbot',
        direction: type === 'voice' ? (values.typeConfig?.direction || 'outbound') : undefined,
        language: values.language,
        companyName: values.companyName,
        industry: values.industry,
        tone: values.tone,
        goals: values.goals,
        typeConfig: values.typeConfig,
        additionalNotes: values.description || ''
      })
      onChange({ generatedPrompt: data.prompt, generatedFirstMessage: data.firstMessage || '' })
      setConfirmRegenerate(false)
    } catch (err) {
      onError(err.response?.data?.error || t('agentBuilder.errorGenerateFailed'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepReviewTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('agentBuilder.stepReviewDesc')}</p>
      </div>

      {/* Summary card */}
      <div className="rounded-lg border border-gray-200 dark:border-dark-border p-4 bg-gray-50 dark:bg-dark-bg/50 text-sm space-y-1">
        <div><span className="text-gray-500">{t('agentBuilder.summaryName')}:</span> <strong>{values.name}</strong></div>
        <div><span className="text-gray-500">{t('agentBuilder.summaryCompany')}:</span> {values.companyName}</div>
        {values.industry && <div><span className="text-gray-500">{t('agentBuilder.summaryIndustry')}:</span> {values.industry}</div>}
        <div><span className="text-gray-500">{t('agentBuilder.summaryGoals')}:</span> {values.goals}</div>
        <div><span className="text-gray-500">{t('agentBuilder.summaryTone')}:</span> {values.tone}</div>
        <div><span className="text-gray-500">{t('agentBuilder.summaryLanguage')}:</span> {values.language}</div>
      </div>

      {isRegenerate && confirmRegenerate && (
        <div className="rounded-lg border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-900/10 p-4 text-sm">
          <h4 className="font-semibold text-yellow-800 dark:text-yellow-300 mb-1">
            {t('agentBuilder.regenerateWarningTitle')}
          </h4>
          <p className="text-yellow-700 dark:text-yellow-400">{t('agentBuilder.regenerateWarning')}</p>
        </div>
      )}

      {/* Generate button */}
      <button
        type="button"
        onClick={callGenerate}
        disabled={generating}
        className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white disabled:opacity-50"
      >
        {generating
          ? t('agentBuilder.generating')
          : isRegenerate && confirmRegenerate
            ? t('agentBuilder.regenerateConfirm')
            : (values.generatedPrompt ? t('agentBuilder.regenerateBtn') : t('agentBuilder.generateBtn'))}
      </button>

      {values.generatedPrompt && (
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('agentBuilder.generatedFirstMessage')}
            </label>
            <input
              type="text"
              value={values.generatedFirstMessage}
              onChange={(e) => onChange({ generatedFirstMessage: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('agentBuilder.generatedPrompt')}
            </label>
            <textarea
              rows={10}
              value={values.generatedPrompt}
              onChange={(e) => onChange({ generatedPrompt: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm font-mono"
            />
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Block Next on this step until prompt is generated.** In `AgentBuilderWizard.jsx`'s `validate()` function, add:

```jsx
if (stepName === 'review') return !!values.generatedPrompt
```

- [ ] **Step 3: Manual verification.** Walk to Step 6 (Review) on a voice agent. Summary renders. Click "Generate prompt" — spinner, then prompt + first message appear in editable textareas. Edit them — values stick. Click "Regenerate" — new prompt overwrites. Next button enabled once prompt exists. (Requires OpenAI key configured for the user — see `accountSettingsAPI`. If missing, you should see the error toast.)

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/steps/StepReviewGenerate.jsx client/src/components/Dashboard/AgentBuilder/AgentBuilderWizard.jsx
git commit -m "$(cat <<'EOF'
Build StepReviewGenerate calling promptGeneratorAPI

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: `StepDone` — create the agent

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/steps/StepDone.jsx`

- [ ] **Step 1: Implement.**

```jsx
import { agentsAPI, chatbotsAPI } from '../../../../services/api'

export default function StepDone({
  values,
  type,
  t,
  isRegenerate,
  agentId,
  onError,
  submitting,
  setSubmitting,
  onCreated,
}) {
  const submit = async () => {
    setSubmitting(true)
    try {
      const wizardAnswers = {
        name: values.name,
        companyName: values.companyName,
        industry: values.industry,
        description: values.description,
        tone: values.tone,
        goals: values.goals,
        typeConfig: values.typeConfig,
        additionalNotes: values.additionalNotes || '',
        ...(isRegenerate
          ? { regeneratedAt: new Date().toISOString() }
          : { createdAt: new Date().toISOString() })
      }

      const config = {
        agentType: values.typeConfig?.direction || (type === 'voice' ? 'outbound' : 'chat'),
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        voiceProvider: values.voiceProvider,
        voiceId: values.voiceId,
        language: values.language,
        systemPrompt: values.generatedPrompt,
        firstMessage: values.generatedFirstMessage,
        wizardAnswers,
      }

      const api = type === 'voice' ? agentsAPI : chatbotsAPI
      const payload = {
        name: values.name,
        agentType: config.agentType,
        config,
      }

      let result
      if (isRegenerate && agentId) {
        result = await api.update(agentId, payload)
      } else {
        result = await api.create(payload)
      }

      const newId = result?.data?.agent?.id || result?.data?.chatbot?.id || agentId
      onCreated(newId)
    } catch (err) {
      onError(err.response?.data?.error
        || (isRegenerate ? t('agentBuilder.errorUpdateFailed') : t('agentBuilder.errorCreateFailed')))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('agentBuilder.stepDoneTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('agentBuilder.stepDoneDesc')}</p>
      </div>
      <button
        type="button"
        onClick={submit}
        disabled={submitting}
        className="px-4 py-2 text-sm rounded-lg bg-primary-600 text-white disabled:opacity-50"
      >
        {submitting ? t('agentBuilder.creating') : t('agentBuilder.createBtn')}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Manual verification.** Walk through the whole voice flow: name → company → goal → direction → voice → generate → "Create agent". On success, navigate to `/dashboard/agent-builder/voice/:id` (still routes to wizard since we haven't built home yet — should re-render wizard with the new id pre-loading; that's fine for now). Check the Network tab: `POST /api/agents` returned 200, response has `agent.id`, and the agent's `config` JSON contains `wizardAnswers`. Repeat for chat.
  - Refresh during step 3. Reload the wizard URL. Draft restored from localStorage.
  - Cancel and "Discard" (refresh after clearing localStorage `agentBuilder.draft.voice` manually) — verify draft cleared after successful create.

- [ ] **Step 3: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/steps/StepDone.jsx
git commit -m "$(cat <<'EOF'
Build StepDone creating the agent + persisting wizardAnswers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 4 — Training Home

## Task 13: `AgentBuilderHome` skeleton + data loading

**Files:**
- Create: `client/src/components/Dashboard/AgentBuilder/AgentBuilderHome.jsx`
- Modify: `client/src/App.jsx` (route `:id` swaps target)

- [ ] **Step 1: Create the skeleton.**

```jsx
import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { agentsAPI, chatbotsAPI, voicesAPI, trainingAPI } from '../../../services/api'
import { useAuth } from '../../../context/AuthContext'
import { useLanguage } from '../../../context/LanguageContext'
import AgentBuilderShell from './AgentBuilderShell'
import BehaviorPreviewCard from './home/BehaviorPreviewCard'
import WizardAnswersCard from './home/WizardAnswersCard'
import TrainingHistoryCard from './home/TrainingHistoryCard'
import TrainingCallModal from '../TrainingCallModal'
import TestChatbotModal from '../TestChatbotModal'

const parseConfig = (raw) => {
  if (!raw) return {}
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw } catch { return {} }
}

export default function AgentBuilderHome({ type }) {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { t } = useLanguage()

  const [agent, setAgent] = useState(null)
  const [config, setConfig] = useState({})
  const [voices, setVoices] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCallModal, setShowCallModal] = useState(false)
  const [showChatModal, setShowChatModal] = useState(false)

  // Feature flag guard
  useEffect(() => {
    if (user && !user.agentGeneratorEnabled) {
      navigate(type === 'voice' ? '/dashboard/agents' : '/dashboard/chatbots', { replace: true })
    }
  }, [user, type, navigate])

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const api = type === 'voice' ? agentsAPI : chatbotsAPI
      const [agentRes, voicesRes] = await Promise.all([
        api.get(id),
        voicesAPI.list().catch(() => ({ data: { voices: [] } })),
      ])
      const a = agentRes.data.agent || agentRes.data.chatbot
      setAgent(a)
      setConfig(parseConfig(a?.config))
      setVoices(voicesRes.data.voices || [])
      if (type === 'voice') {
        const s = await trainingAPI.listSessions(id).catch(() => ({ data: { sessions: [] } }))
        setSessions(s.data.sessions || [])
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [id, type])

  useEffect(() => { fetchAll() }, [fetchAll])

  if (loading) {
    return (
      <AgentBuilderShell type={type} agentId={id}>
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      </AgentBuilderShell>
    )
  }

  return (
    <AgentBuilderShell type={type} agentId={id} agentName={agent?.name}>
      <div className="max-w-3xl mx-auto space-y-4">
        {error && <div className="text-sm text-red-500">{error}</div>}

        {/* Primary action */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-primary-300 dark:border-primary-600/40 p-6">
          {type === 'voice' ? (
            <button
              onClick={() => setShowCallModal(true)}
              className="w-full px-4 py-3 text-base font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-500"
            >
              {t('agentBuilder.homeEditViaCall')}
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowChatModal(true)}
                className="w-full px-4 py-3 text-base font-semibold rounded-lg bg-primary-600 text-white hover:bg-primary-500"
              >
                {t('agentBuilder.homeTestChat')}
              </button>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {t('agentBuilder.homeChatTrainingComingSoon')}
              </p>
            </>
          )}
        </div>

        <BehaviorPreviewCard config={config} voices={voices} type={type} t={t} />
        <WizardAnswersCard
          wizardAnswers={config.wizardAnswers}
          type={type}
          agentId={id}
          t={t}
        />
        {type === 'voice' && (
          <TrainingHistoryCard sessions={sessions} t={t} />
        )}
      </div>

      {showCallModal && type === 'voice' && (
        <TrainingCallModal
          agent={agent}
          onClose={() => setShowCallModal(false)}
          onAccepted={() => { setShowCallModal(false); fetchAll() }}
        />
      )}
      {showChatModal && type === 'chat' && (
        <TestChatbotModal
          chatbot={agent}
          onClose={() => setShowChatModal(false)}
        />
      )}
    </AgentBuilderShell>
  )
}
```

- [ ] **Step 2: Wire into `App.jsx`.** Add the import and update the two `:id` routes:

```jsx
import AgentBuilderHome from './components/Dashboard/AgentBuilder/AgentBuilderHome'
```

```jsx
<Route path="agent-builder/voice/:id" element={<AgentBuilderHome type="voice" />} />
<Route path="agent-builder/chat/:id" element={<AgentBuilderHome type="chat" />} />
```

The wizard now only handles `/new`. Regenerate mode (`/:id?mode=regenerate`) will need a separate route handler — keep the `:id` route as `AgentBuilderHome` and add a small piece in Task 14 to redirect to wizard when `?mode=regenerate` is set.

- [ ] **Step 3: Manual verification.** Create a fresh voice agent through the wizard. After "Create agent", you land on `/dashboard/agent-builder/voice/:id`. Page shows: header with agent name, big "Edit via Call" button, [empty cards for now since the home subcomponents are placeholders]. Click "Edit via Call" — TrainingCallModal opens. Close it. Same for chat: create → home → "Test Chat" opens TestChatbotModal.

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/AgentBuilderHome.jsx client/src/App.jsx
git commit -m "$(cat <<'EOF'
Add AgentBuilderHome with primary call/chat action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Home subcomponents — `BehaviorPreviewCard`, `WizardAnswersCard`, `TrainingHistoryCard`

**Files:**
- Create: `client/src/components/Dashboard/AgentBuilder/home/BehaviorPreviewCard.jsx`
- Create: `client/src/components/Dashboard/AgentBuilder/home/WizardAnswersCard.jsx`
- Create: `client/src/components/Dashboard/AgentBuilder/home/TrainingHistoryCard.jsx`

- [ ] **Step 1: `BehaviorPreviewCard.jsx`.**

```jsx
import { useState } from 'react'

export default function BehaviorPreviewCard({ config, voices, type, t }) {
  const [showFull, setShowFull] = useState(false)
  const voice = voices.find((v) => v.voiceId === config.voiceId)

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        {t('agentBuilder.homeBehaviorTitle')}
      </h3>
      <div className="space-y-2 text-sm">
        {type === 'voice' && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.homeVoiceLabel')}:</span>{' '}
            <strong>{voice?.name || config.voiceId || '—'}</strong>
          </div>
        )}
        {config.firstMessage && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.homeFirstMessageLabel')}:</span>{' '}
            <span className="text-gray-700 dark:text-gray-300">"{config.firstMessage}"</span>
          </div>
        )}
        {config.systemPrompt && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.homeSystemPromptLabel')}:</span>
            <button
              onClick={() => setShowFull((s) => !s)}
              className="ml-2 text-xs text-primary-600 dark:text-primary-400 hover:underline"
            >
              {showFull ? t('agentBuilder.homeHideFullPrompt') : t('agentBuilder.homeShowFullPrompt')}
            </button>
            {showFull && (
              <pre className="mt-2 p-3 rounded-lg bg-gray-50 dark:bg-dark-bg text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                {config.systemPrompt}
              </pre>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: `WizardAnswersCard.jsx`.**

```jsx
import { Link } from 'react-router-dom'

export default function WizardAnswersCard({ wizardAnswers, type, agentId, t }) {
  const regenHref = `/dashboard/agent-builder/${type}/${agentId}?mode=regenerate`

  if (!wizardAnswers) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          {t('agentBuilder.homeCreatedFromTitle')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {t('agentBuilder.homeCreatedFromEmpty')}{' '}
          <Link to={regenHref} className="text-primary-600 dark:text-primary-400 hover:underline">
            {t('agentBuilder.homeCreatedFromEmptyCta')}
          </Link>
        </p>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          {t('agentBuilder.homeCreatedFromTitle')}
        </h3>
        <Link to={regenHref} className="text-xs text-primary-600 dark:text-primary-400 hover:underline">
          {t('agentBuilder.homeEditAnswers')}
        </Link>
      </div>
      <div className="space-y-1 text-sm">
        <div><span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.summaryCompany')}:</span> {wizardAnswers.companyName}</div>
        {wizardAnswers.industry && <div><span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.summaryIndustry')}:</span> {wizardAnswers.industry}</div>}
        <div><span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.summaryGoals')}:</span> {wizardAnswers.goals}</div>
        <div><span className="text-gray-500 dark:text-gray-400">{t('agentBuilder.summaryTone')}:</span> {wizardAnswers.tone}</div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: `TrainingHistoryCard.jsx`.**

```jsx
import { useState } from 'react'

const formatDate = (s) => {
  if (!s) return ''
  try { return new Date(s).toLocaleString() } catch { return s }
}

export default function TrainingHistoryCard({ sessions, t }) {
  const [expanded, setExpanded] = useState(null)

  if (!sessions || sessions.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
          {t('agentBuilder.homeHistoryTitle')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('agentBuilder.homeHistoryEmpty')}</p>
      </div>
    )
  }

  const statusLabel = (s) => {
    if (s === 'accepted') return t('agentBuilder.homeHistoryStatusAccepted')
    if (s === 'rejected') return t('agentBuilder.homeHistoryStatusRejected')
    return t('agentBuilder.homeHistoryStatusActive')
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
        {t('agentBuilder.homeHistoryTitle')}
      </h3>
      <div className="space-y-2">
        {sessions.map((s) => (
          <div key={s.id} className="rounded-lg border border-gray-200 dark:border-dark-border">
            <button
              onClick={() => setExpanded(expanded === s.id ? null : s.id)}
              className="w-full text-left px-3 py-2 text-sm flex items-center justify-between"
            >
              <span>
                <span className="text-gray-700 dark:text-gray-300">{formatDate(s.createdAt)}</span>
                <span className="ml-2 text-gray-500">— {(s.proposedChanges || []).length} {t('agentBuilder.homeHistoryChanges')}</span>
              </span>
              <span className="text-xs text-gray-500">{statusLabel(s.status)}</span>
            </button>
            {expanded === s.id && (s.proposedChanges || []).length > 0 && (
              <div className="px-3 pb-3 space-y-2 text-xs">
                {s.proposedChanges.map((c, i) => (
                  <div key={i} className="rounded bg-gray-50 dark:bg-dark-bg p-2">
                    <div className="font-semibold text-gray-700 dark:text-gray-300">{c.field}</div>
                    <div className="text-red-500 line-through">{c.oldValue || '(empty)'}</div>
                    <div className="text-green-600">{c.newValue}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Manual verification.** With an existing builder-created agent, the home page now shows: behavior card with voice/first-message/prompt-toggle, "Created from" card with the wizard answers + edit link, training history (empty until you do a call). Open `TrainingCallModal`, complete a call, accept changes, modal closes — home refetches and shows the new history row.

- [ ] **Step 5: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/home/
git commit -m "$(cat <<'EOF'
Add home subcomponents: behavior preview, wizard summary, training history

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Regenerate-mode routing

When `?mode=regenerate` is on a `/:id` URL, render the wizard (pre-filled to step 6) instead of the home.

**Files:**
- Modify: `client/src/components/Dashboard/AgentBuilder/AgentBuilderHome.jsx`

- [ ] **Step 1: Render the wizard at the top of `AgentBuilderHome` when `?mode=regenerate` is set.** Add the imports and the early-return at the very top of the component, before any data fetching:

```jsx
import { useSearchParams } from 'react-router-dom'
import AgentBuilderWizard from './AgentBuilderWizard'
```

Inside the component body, before `useEffect`s and data fetches:

```jsx
const [searchParams] = useSearchParams()
if (searchParams.get('mode') === 'regenerate') {
  return <AgentBuilderWizard type={type} />
}
```

The wizard reads `useParams().id` and `searchParams.get('mode')` itself (already coded in Task 6) and pre-fills + calls `update` instead of `create` (already coded in Task 12).

- [ ] **Step 2: Manual verification.** From a builder-created agent's home page, click "Edit answers & regenerate". URL becomes `/dashboard/agent-builder/voice/:id?mode=regenerate`. Wizard loads pre-filled, jumps to step 6, fields populated from `wizardAnswers`. Edit a field (e.g., change tone). Click Regenerate → confirm warning → confirm → new prompt generated. Click Next → "Create agent" button now reads "Create" (or you can leave the copy and the action does an update — that's fine for v1; copy polish later). Click submit → navigates back to home. Verify in DB / config: `wizardAnswers.regeneratedAt` is now set, `systemPrompt` is updated, and unrelated config keys (e.g., voice, phone numbers if assigned) are unchanged.

- [ ] **Step 3: Commit**

```powershell
git add client/src/components/Dashboard/AgentBuilder/AgentBuilderHome.jsx
git commit -m "$(cat <<'EOF'
Render wizard for regenerate mode on home route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

# Phase 5 — Integration polish

## Task 16: "Open builder" link in agents list

Adds a small button on each agent row (in `DashboardContent.jsx`'s agents tab) that goes to the builder home **only when** `wizardAnswers` exists on the agent.

**Files:**
- Modify: `client/src/components/Dashboard/DashboardContent.jsx`

- [ ] **Step 1: Locate the agents-list row rendering.** Inside `DashboardContent.jsx`, find the JSX that renders each agent row in the `tab === 'agents'` branch (search for `agents.map(`).

- [ ] **Step 2: Add the link.** For each row, parse the agent's config and check for `wizardAnswers`. If present, render an "Open builder" link/button alongside the existing edit action:

```jsx
import { Link } from 'react-router-dom'  // ensure this import exists; if not, add it

// Inside the row:
{(() => {
  let cfg = {}
  try { cfg = typeof agent.config === 'string' ? JSON.parse(agent.config) : (agent.config || {}) } catch {}
  if (!cfg.wizardAnswers) return null
  return (
    <Link
      to={`/dashboard/agent-builder/voice/${agent.id}`}
      className="text-xs text-primary-600 dark:text-primary-400 hover:underline mr-2"
    >
      {t('agentBuilder.openVoicePicker') /* placeholder — use a dedicated key */}
    </Link>
  )
})()}
```

Replace the placeholder key. Add a new i18n key `agentBuilder.openBuilder: "Open builder"` (and Spanish "Abrir constructor") to both i18n files, then use `t('agentBuilder.openBuilder')`.

- [ ] **Step 3: Manual verification.** On the agents list, agents created via the builder show an "Open builder" link. Agents created via legacy quick-create do NOT show it. Clicking it navigates to the home page.

- [ ] **Step 4: Commit**

```powershell
git add client/src/components/Dashboard/DashboardContent.jsx client/src/i18n/en.json client/src/i18n/es.json
git commit -m "$(cat <<'EOF'
Add Open Builder link to agents list rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 17: Same link in chatbots list

**Files:**
- Modify: `client/src/components/Dashboard/ChatbotList.jsx`

- [ ] **Step 1: Mirror Task 16 inside `ChatbotList.jsx`.** Find the chatbot row rendering, add the same gated link pointing to `/dashboard/agent-builder/chat/:id`. Reuse the `agentBuilder.openBuilder` i18n key from Task 16.

- [ ] **Step 2: Manual verification.** On the chatbots list, chatbots created via the builder show "Open builder". Clicking it navigates to the chat home page.

- [ ] **Step 3: Commit**

```powershell
git add client/src/components/Dashboard/ChatbotList.jsx
git commit -m "$(cat <<'EOF'
Add Open Builder link to chatbots list rows

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 18: Final E2E manual checklist

No code changes. A walkthrough that verifies the whole feature behaves end-to-end.

- [ ] **Step 1: Voice agent E2E.**
  - Set test user `agentGeneratorEnabled = true` in DB.
  - Sidebar: "Voice Agent Builder" entry visible under Agents.
  - Click it → land on `/agent-builder/voice/new` step 1.
  - Walk through: name "Acme Bot" → company "Acme" → goal "Book appointments" → outbound + situation → choose voice from picker → review → Generate → review prompt → Next → Create agent.
  - Land on `/agent-builder/voice/:id`. Header shows "Acme Bot". Behavior preview shows voice, first message, system-prompt toggle. "Created from" shows answers. Training history empty.
  - Click "Edit via Call". Vapi modal connects, you talk to the agent, end call, review proposed changes, accept.
  - Modal closes. Home refetches. New history row appears with the accepted changes diff. Behavior preview shows updated prompt.
  - Click "Edit answers & regenerate". Wizard pre-fills, jumps to review, edit tone to "energetic", confirm warning, regenerate, save → home shows new prompt, `regeneratedAt` set.
  - Click "Open advanced editor" → `AgentEdit` opens. Voice picker still works. Save round-trips.

- [ ] **Step 2: Chat agent E2E.**
  - Click "Chatbot Builder" sidebar entry.
  - Walk through full wizard (no voice step).
  - Land on `/agent-builder/chat/:id`. "Test Chat" opens existing TestChatbotModal. Banner reads "Chat-based training coming soon".
  - "Created from" card present. No training history card (chat type).

- [ ] **Step 3: Feature flag off.**
  - Flip `agentGeneratorEnabled = false` for test user.
  - Reload. Sidebar entries hidden.
  - Manually visit `/dashboard/agent-builder/voice/new` → redirected to `/dashboard/agents`.
  - Visit an existing builder agent's home URL → redirected.

- [ ] **Step 4: Legacy agent fallback.**
  - Open the home URL for an agent that was created via legacy quick-create (no `wizardAnswers` in config). The "Created from" card shows the empty-state CTA.
  - Click that CTA → opens the wizard in regenerate mode pre-filled with whatever defaults exist; on save, the agent gets `wizardAnswers` populated.

- [ ] **Step 5: Manual draft recovery.**
  - Start the wizard, fill 4 steps, refresh the browser. Draft restored.
  - Complete creation. Draft cleared (next visit to `/new` starts blank).

- [ ] **Step 6: AgentEdit regression sanity.**
  - Open any voice agent in the legacy `/dashboard/agent/:id` route. Voice picker opens, filters work, selection saves. No console errors.

- [ ] **Step 7: No commit needed for this task — it's verification only.** If anything failed, file the failure as a follow-up commit and document the deviation.

---

## Self-review

(For the engineer running the plan: skip this section — it's the planning author's notes.)

**Spec coverage:**
- Routes table → Task 2.
- Sidebar entries → Task 3.
- File map → Tasks 4, 6-7, 13-14.
- Wizard steps 1-7 → Tasks 7-12.
- Persistence (`config.wizardAnswers`, localStorage) → Task 12 + Task 6.
- Regenerate mode → Task 15 + the regenerate paths in Tasks 11/12.
- Training home layout → Tasks 13-14.
- "Open builder" links → Tasks 16-17.
- VoicePicker extraction → Task 5.
- i18n strings → Task 1.
- Feature-flag redirect → Tasks 6, 13.
- Manual E2E → Task 18.

**Type consistency check:** `wizardAnswers` shape used in Task 12 (write) matches what Task 13/14 reads. `onSelect({ provider, voiceId, isCustom })` callback signature in Task 5's `VoicePicker` matches the consumers in Tasks 5 (AgentEdit re-wire) and 10 (StepVoice). `agentBuilder.openBuilder` i18n key introduced in Task 16 and consumed in Task 17.

**Open follow-ups (not in this plan):** `TrainingChatModal` (chat-based training session), promoting builder to default create flow, backfilling `wizardAnswers` on legacy agents.
