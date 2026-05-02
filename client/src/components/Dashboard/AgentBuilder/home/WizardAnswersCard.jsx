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
