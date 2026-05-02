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
