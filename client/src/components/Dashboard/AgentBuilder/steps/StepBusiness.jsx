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
