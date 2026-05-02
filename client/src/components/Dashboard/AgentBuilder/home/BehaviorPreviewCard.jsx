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
