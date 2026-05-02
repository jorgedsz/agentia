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
