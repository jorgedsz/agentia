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
