import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { pricingAPI, usersAPI } from '../../services/api'
import { MODEL_PROVIDER_LABELS, TRANSCRIBER_PROVIDERS } from '../../constants/models'

export default function PricingSettings() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const role = user?.role

  // Users list for per-account selector
  const [users, setUsers] = useState([])
  const [selectedUserId, setSelectedUserId] = useState(null) // null = base pricing (OWNER), or must select a client (AGENCY)

  // Rate data
  const [globalRates, setGlobalRates] = useState([])          // base rates (setById=0)
  const [globalTranscribers, setGlobalTranscribers] = useState([])
  const [accountRates, setAccountRates] = useState([])         // per-account overrides
  const [accountTranscribers, setAccountTranscribers] = useState([])

  // Edit state
  const [editModels, setEditModels] = useState({})
  const [editTranscribers, setEditTranscribers] = useState({})

  // UI state
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [viewMode, setViewMode] = useState('base') // 'base' or 'account' (OWNER only)

  // Fetch users for the selector (OWNER and AGENCY)
  useEffect(() => {
    if (role === 'OWNER' || role === 'AGENCY') {
      fetchUsers()
    }
  }, [role])

  // Fetch rates when view/selection changes
  useEffect(() => {
    fetchRates()
  }, [selectedUserId, viewMode])

  const fetchUsers = async () => {
    try {
      if (role === 'OWNER') {
        const res = await usersAPI.getAll()
        setUsers((res.data?.users || []).filter(u => u.role !== 'OWNER'))
      } else if (role === 'AGENCY') {
        const res = await usersAPI.getClients()
        setUsers(res.data?.clients || [])
      }
    } catch (err) {
      console.error('Failed to fetch users:', err)
    }
  }

  const fetchRates = async () => {
    setLoading(true)
    setError('')
    try {
      const forUserId = (viewMode === 'account' || role === 'AGENCY') ? selectedUserId : null

      const [modelsRes, transcribersRes] = await Promise.all([
        pricingAPI.getModelRates(forUserId),
        pricingAPI.getTranscriberRates(forUserId)
      ])

      const mData = modelsRes.data
      const tData = transcribersRes.data

      if (mData.scope === 'account') {
        // Per-account mode
        setGlobalRates(mData.globalRates || [])
        setAccountRates(mData.accountRates || [])
        setGlobalTranscribers(tData.globalRates || [])
        setAccountTranscribers(tData.accountRates || [])

        // Init edit state: show account overrides, empty if no override
        const mEdits = {}
        for (const r of (mData.globalRates || [])) {
          const override = (mData.accountRates || []).find(o => o.provider === r.provider && o.model === r.model)
          mEdits[`${r.provider}::${r.model}`] = override ? override.rate : ''
        }
        setEditModels(mEdits)

        const tEdits = {}
        for (const r of (tData.globalRates || [])) {
          const override = (tData.accountRates || []).find(o => o.provider === r.provider)
          tEdits[r.provider] = override ? override.rate : ''
        }
        setEditTranscribers(tEdits)
      } else {
        // Global or client mode
        const rates = mData.rates || []
        const tRates = tData.rates || []
        setGlobalRates(rates)
        setGlobalTranscribers(tRates)
        setAccountRates([])
        setAccountTranscribers([])

        const mEdits = {}
        for (const r of rates) {
          mEdits[`${r.provider}::${r.model}`] = r.rate
        }
        setEditModels(mEdits)

        const tEdits = {}
        for (const r of tRates) {
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

  const isPerAccount = (viewMode === 'account' && selectedUserId) || (role === 'AGENCY' && selectedUserId)
  const isEditingBase = role === 'OWNER' && viewMode === 'base'
  const canEdit = (role === 'OWNER') || (role === 'AGENCY' && selectedUserId)
  const isReadOnly = role === 'CLIENT' || (role === 'AGENCY' && !selectedUserId)

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const forUserId = isPerAccount ? selectedUserId : null
      const isAgencyEditing = role === 'AGENCY'

      // Build model rates payload
      const modelPayload = []
      const modelViolations = []
      for (const r of globalRates) {
        const key = `${r.provider}::${r.model}`
        const val = editModels[key]
        if (val !== '' && val !== undefined) {
          const numVal = parseFloat(val)
          if (!isNaN(numVal) && numVal >= 0) {
            // Agency: cannot set below OWNER base rate
            if (isAgencyEditing && numVal < r.rate) {
              modelViolations.push(`${r.provider}/${r.model}: $${numVal.toFixed(2)} is below min $${r.rate.toFixed(2)}`)
              continue
            }
            if (isPerAccount) {
              // Only include if differs from global
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
      const transcriberViolations = []
      for (const r of globalTranscribers) {
        const val = editTranscribers[r.provider]
        if (val !== '' && val !== undefined) {
          const numVal = parseFloat(val)
          if (!isNaN(numVal) && numVal >= 0) {
            if (isAgencyEditing && numVal < r.rate) {
              transcriberViolations.push(`${r.provider}: $${numVal.toFixed(2)} is below min $${r.rate.toFixed(2)}`)
              continue
            }
            if (isPerAccount) {
              if (numVal !== r.rate) {
                transcriberPayload.push({ provider: r.provider, rate: numVal })
              }
            } else {
              transcriberPayload.push({ provider: r.provider, rate: numVal })
            }
          }
        }
      }

      const allViolations = [...modelViolations, ...transcriberViolations]
      if (allViolations.length > 0) {
        setError(`Rates cannot be lower than the platform base price: ${allViolations.join(', ')}`)
        setSaving(false)
        return
      }

      await Promise.all([
        modelPayload.length > 0 ? pricingAPI.updateModelRates(modelPayload, forUserId) : Promise.resolve(),
        transcriberPayload.length > 0 ? pricingAPI.updateTranscriberRates(transcriberPayload, forUserId) : Promise.resolve()
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

  // Group models by provider
  const grouped = {}
  for (const r of globalRates) {
    if (!grouped[r.provider]) grouped[r.provider] = []
    grouped[r.provider].push(r)
  }

  // Selected user info
  const selectedUser = users.find(u => u.id === selectedUserId)

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

      {/* OWNER: View mode toggle */}
      {role === 'OWNER' && (
        <div className="flex items-center gap-4">
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
            <button
              onClick={() => { setViewMode('base'); setSelectedUserId(null) }}
              className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'base' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
            >
              Base Pricing
            </button>
            <button
              onClick={() => setViewMode('account')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${viewMode === 'account' ? 'bg-primary-600 text-white' : 'bg-white dark:bg-dark-card text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
            >
              Per Account
            </button>
          </div>

          {/* User selector (per-account mode) */}
          {viewMode === 'account' && (
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-w-[250px]"
            >
              <option value="">Select an account...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} ({u.role}) — ID #{u.id}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* AGENCY: Client selector */}
      {role === 'AGENCY' && (
        <>
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <p className="text-sm text-blue-700 dark:text-blue-300">
                Select a client to set their custom pricing. Rates cannot be lower than the platform base price.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Client:</label>
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-w-[250px]"
            >
              <option value="">Select a client...</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} — ID #{u.id}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {/* Selected account header */}
      {isPerAccount && selectedUser && (
        <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold">
              {(selectedUser.name || selectedUser.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {selectedUser.name || selectedUser.email}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedUser.email} &middot; {selectedUser.role} &middot; ID #{selectedUser.id}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* No client selected message for AGENCY */}
      {role === 'AGENCY' && !selectedUserId && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm font-medium">Select a client to configure their pricing</p>
          <p className="text-xs mt-1">Each client can have custom model and transcriber rates</p>
        </div>
      )}

      {/* No account selected message for OWNER in per-account mode */}
      {role === 'OWNER' && viewMode === 'account' && !selectedUserId && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <p className="text-sm font-medium">Select an account to configure their pricing</p>
          <p className="text-xs mt-1">Set custom rates per agency or client account</p>
        </div>
      )}

      {/* Rate editing grid — show when we have something to edit */}
      {(isEditingBase || isPerAccount || role === 'CLIENT') && (
        <>
          {/* Model Rates */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {isPerAccount ? 'Model Rates' : t('pricing.modelRates')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {isPerAccount
                ? `Custom model rates for this account. Leave empty to use base rate.`
                : isEditingBase
                  ? t('pricing.modelRatesDesc')
                  : 'Your effective model rates (read-only).'}
            </p>

            <div className="space-y-6">
              {Object.entries(grouped).map(([provider, models]) => (
                <div key={provider}>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 uppercase tracking-wide">
                    {MODEL_PROVIDER_LABELS[provider] || provider}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {models.map(r => {
                      const key = `${r.provider}::${r.model}`
                      const currentVal = editModels[key]
                      const hasOverride = isPerAccount && accountRates.some(o => o.provider === r.provider && o.model === r.model)
                      const isBelowMin = isPerAccount && role === 'AGENCY' && currentVal !== '' && currentVal !== undefined && parseFloat(currentVal) < r.rate
                      return (
                        <div key={key} className={`p-3 rounded-lg border ${isBelowMin ? 'border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10' : hasOverride ? 'border-primary-300 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover'}`}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-sm text-gray-700 dark:text-gray-300 truncate" title={r.model}>
                              {r.model}
                            </span>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <span className="text-xs text-gray-400">$</span>
                              <input
                                type="number"
                                step="0.01"
                                min={isPerAccount && role === 'AGENCY' ? r.rate : 0}
                                value={currentVal ?? ''}
                                onChange={e => setEditModels(prev => ({ ...prev, [key]: e.target.value }))}
                                disabled={isReadOnly}
                                placeholder={isPerAccount ? r.rate.toFixed(2) : '0.00'}
                                className={`w-20 px-2 py-1 text-sm text-right rounded border ${isBelowMin ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-dark-border'} bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-primary-500 focus:border-primary-500`}
                              />
                              <span className="text-xs text-gray-400">/min</span>
                            </div>
                          </div>
                          {isPerAccount && (
                            <div className="mt-1 flex items-center justify-between">
                              <span className="text-[10px] text-gray-400">base: ${r.rate.toFixed(2)}</span>
                              {isBelowMin && <span className="text-[10px] text-red-500 font-medium">Below minimum</span>}
                            </div>
                          )}
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
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
              {isPerAccount ? 'Transcriber Rates' : t('pricing.transcriberRates')}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {isPerAccount
                ? `Custom transcriber rates for this account. Leave empty to use base rate.`
                : isEditingBase
                  ? t('pricing.transcriberRatesDesc')
                  : 'Your effective transcriber rates (read-only).'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {globalTranscribers.map(r => {
                const label = TRANSCRIBER_PROVIDERS.find(tp => tp.id === r.provider)?.label || r.provider
                const currentVal = editTranscribers[r.provider]
                const hasOverride = isPerAccount && accountTranscribers.some(o => o.provider === r.provider)
                const isBelowMin = isPerAccount && role === 'AGENCY' && currentVal !== '' && currentVal !== undefined && parseFloat(currentVal) < r.rate
                return (
                  <div key={r.provider} className={`p-3 rounded-lg border ${isBelowMin ? 'border-red-400 dark:border-red-500 bg-red-50/50 dark:bg-red-900/10' : hasOverride ? 'border-primary-300 dark:border-primary-600 bg-primary-50/50 dark:bg-primary-900/10' : 'border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {label}
                      </span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <span className="text-xs text-gray-400">$</span>
                        <input
                          type="number"
                          step="0.01"
                          min={isPerAccount && role === 'AGENCY' ? r.rate : 0}
                          value={currentVal ?? ''}
                          onChange={e => setEditTranscribers(prev => ({ ...prev, [r.provider]: e.target.value }))}
                          disabled={isReadOnly}
                          placeholder={isPerAccount ? r.rate.toFixed(2) : '0.00'}
                          className={`w-20 px-2 py-1 text-sm text-right rounded border ${isBelowMin ? 'border-red-400 dark:border-red-500' : 'border-gray-300 dark:border-dark-border'} bg-white dark:bg-dark-bg text-gray-900 dark:text-white disabled:opacity-50 disabled:cursor-not-allowed focus:ring-1 focus:ring-primary-500 focus:border-primary-500`}
                        />
                        <span className="text-xs text-gray-400">/min</span>
                      </div>
                    </div>
                    {isPerAccount && (
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-[10px] text-gray-400">base: ${r.rate.toFixed(2)}</span>
                        {isBelowMin && <span className="text-[10px] text-red-500 font-medium">Below minimum</span>}
                      </div>
                    )}
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
                  {isPerAccount
                    ? 'Per-account rates override the base pricing for this specific user. Leave a field empty to use the base rate. Agencies cannot set rates below the platform base price.'
                    : t('pricing.howItWorksDesc')}
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
        </>
      )}
    </div>
  )
}
