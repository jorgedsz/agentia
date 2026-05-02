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
