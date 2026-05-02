import { useState, useEffect } from 'react'
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
      const a = data.agent || data.chatbot
      const cfg = typeof a?.config === 'string' ? JSON.parse(a.config) : (a?.config || {})
      const w = cfg.wizardAnswers || {}
      setValues((v) => ({
        ...v,
        name: a?.name || w.name || '',
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
      return (
        <StepDone
          {...props}
          isRegenerate={isRegenerate}
          agentId={id}
          onError={setError}
          submitting={submitting}
          setSubmitting={setSubmitting}
          onCreated={(newId) => {
            try { localStorage.removeItem(DRAFT_KEY(type)) } catch {}
            navigate(`/dashboard/agent-builder/${type}/${newId}`)
          }}
        />
      )
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
