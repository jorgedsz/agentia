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
