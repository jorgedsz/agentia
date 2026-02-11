import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { pricingAPI } from '../../services/api'
import { MODEL_PROVIDER_LABELS, TRANSCRIBER_PROVIDERS } from '../../constants/models'

export default function PricingSettings() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const role = user?.role

  const [modelRates, setModelRates] = useState([])
  const [modelOverrides, setModelOverrides] = useState([])
  const [transcriberRates, setTranscriberRates] = useState([])
  const [transcriberOverrides, setTranscriberOverrides] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [scope, setScope] = useState('global')

  // Editable state (local copy for editing)
  const [editModels, setEditModels] = useState({})
  const [editTranscribers, setEditTranscribers] = useState({})

  useEffect(() => {
    fetchRates()
  }, [])

  const fetchRates = async () => {
    setLoading(true)
    setError('')
    try {
      const [modelsRes, transcribersRes] = await Promise.all([
        pricingAPI.getModelRates(),
        pricingAPI.getTranscriberRates()
      ])

      const mData = modelsRes.data
      const tData = transcribersRes.data
      setScope(mData.scope)

      if (mData.scope === 'agency') {
        setModelRates(mData.globalRates || [])
        setModelOverrides(mData.overrides || [])
        // Initialize edit state with overrides or global values
        const edits = {}
        for (const r of mData.globalRates) {
          const override = (mData.overrides || []).find(o => o.provider === r.provider && o.model === r.model)
          edits[`${r.provider}::${r.model}`] = override ? override.rate : ''
        }
        setEditModels(edits)

        setTranscriberRates(tData.globalRates || [])
        setTranscriberOverrides(tData.overrides || [])
        const tEdits = {}
        for (const r of tData.globalRates) {
          const override = (tData.overrides || []).find(o => o.provider === r.provider)
          tEdits[r.provider] = override ? override.rate : ''
        }
        setEditTranscribers(tEdits)
      } else {
        // OWNER or CLIENT
        setModelRates(mData.rates || [])
        setTranscriberRates(tData.rates || [])
        const edits = {}
        for (const r of (mData.rates || [])) {
          edits[`${r.provider}::${r.model}`] = r.rate
        }
        setEditModels(edits)

        const tEdits = {}
        for (const r of (tData.rates || [])) {
          tEdits[r.provider] = r.rate
        }
        setEditTranscribers(tEdits)
      }
    } catch (err) {
      setError(err.response?.data?.error || t('pricing.fetchError'))
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      // Build model rates payload (only changed values for agency, all for owner)
      const modelPayload = []
      for (const r of modelRates) {
        const key = `${r.provider}::${r.model}`
        const val = editModels[key]
        if (val !== '' && val !== undefined) {
          const numVal = parseFloat(val)
          if (!isNaN(numVal) && numVal >= 0) {
            if (scope === 'agency') {
              // Only include if value differs from global
              if (numVal !== r.rate) {
                modelPayload.push({ provider: r.provider, model: r.model, rate: numVal })
              }
            } else {
              modelPayload.push({ provider: r.provider, model: r.model, rate: numVal })
            }
          }
        }
      }

      const transcriberPayload = []
      for (const r of transcriberRates) {
        const val = editTranscribers[r.provider]
        if (val !== '' && val !== undefined) {
          const numVal = parseFloat(val)
          if (!isNaN(numVal) && numVal >= 0) {
            if (scope === 'agency') {
              if (numVal !== r.rate) {
                transcriberPayload.push({ provider: r.provider, rate: numVal })
              }
            } else {
              transcriberPayload.push({ provider: r.provider, rate: numVal })
            }
          }
        }
      }

      await Promise.all([
        modelPayload.length > 0 ? pricingAPI.updateModelRates(modelPayload) : Promise.resolve(),
        transcriberPayload.length > 0 ? pricingAPI.updateTranscriberRates(transcriberPayload) : Promise.resolve()
      ])

      setSuccess(t('pricing.saveSuccess'))
      setTimeout(() => setSuccess(''), 3000)
      fetchRates()
    } catch (err) {
      setError(err.response?.data?.error || t('pricing.saveError'))
    } finally {
      setSaving(false)
    }
  }

  const isReadOnly = role === 'CLIENT'
  const canEdit = role === 'OWNER' || role === 'AGENCY'

  // Group models by provider
  const grouped = {}
  for (const r of modelRates) {
    if (!grouped[r.provider]) grouped[r.provider] = []
    grouped[r.provider].push(r)
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Info banner for agencies */}
      {scope === 'agency' && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {t('pricing.agencyInfo')}
            </p>
          </div>
        </div>
      )}

      {/* Model Rates */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('pricing.modelRates')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('pricing.modelRatesDesc')}</p>

        <div className="space-y-6">
          {Object.entries(grouped).map(([provider, models]) => (
            <div key={provider}>
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                {MODEL_PROVIDER_LABELS[provider] || provider}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {models.map(r => {
                  const key = `${r.provider}::${r.model}`
                  const hasOverride = scope === 'agency' && modelOverrides.some(o => o.provider === r.provider && o.model === r.model)
                  return (
                    <div key={key} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${hasOverride ? 'border-primary-300 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover'}`}>
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={r.model}>
                        {r.model}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={editModels[key] ?? ''}
                          onChange={e => setEditModels(prev => ({ ...prev, [key]: e.target.value }))}
                          disabled={isReadOnly}
                          placeholder={scope === 'agency' ? r.rate.toFixed(2) : '0.00'}
                          className="w-20 px-2 py-1 text-sm text-right rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                        />
                        <span className="text-xs text-gray-400">/min</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Transcriber Rates */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">{t('pricing.transcriberRates')}</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{t('pricing.transcriberRatesDesc')}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {transcriberRates.map(r => {
            const label = TRANSCRIBER_PROVIDERS.find(tp => tp.id === r.provider)?.label || r.provider
            const hasOverride = scope === 'agency' && transcriberOverrides.some(o => o.provider === r.provider)
            return (
              <div key={r.provider} className={`flex items-center justify-between gap-3 p-3 rounded-lg border ${hasOverride ? 'border-primary-300 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover'}`}>
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {label}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-gray-400">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={editTranscribers[r.provider] ?? ''}
                    onChange={e => setEditTranscribers(prev => ({ ...prev, [r.provider]: e.target.value }))}
                    disabled={isReadOnly}
                    placeholder={scope === 'agency' ? r.rate.toFixed(2) : '0.00'}
                    className="w-20 px-2 py-1 text-sm text-right rounded border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                  />
                  <span className="text-xs text-gray-400">/min</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('pricing.howItWorks')}</p>
            <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
              {t('pricing.howItWorksDesc')}
            </p>
          </div>
        </div>
      </div>

      {/* Save button */}
      {canEdit && (
        <div className="flex justify-end">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
            )}
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      )}
    </div>
  )
}
