import { useState, useEffect } from 'react'
import { voicesAPI } from '../../../../services/api'
import VoicePicker from '../../VoicePicker'

export default function StepVoice({ values, onChange, t }) {
  const [open, setOpen] = useState(false)
  const [voiceName, setVoiceName] = useState('')

  // Resolve voice name for display
  useEffect(() => {
    let cancelled = false
    voicesAPI.list().then((res) => {
      if (cancelled) return
      const list = res.data || []
      const found = list.find((v) => v.voiceId === values.voiceId)
      setVoiceName(found ? found.name : (values.voiceId || ''))
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
