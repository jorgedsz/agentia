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
  const [selectedUserId, setSelectedUserId] = useState(null)

  // Rate data
  const [globalRates, setGlobalRates] = useState([])
  const [globalTranscribers, setGlobalTranscribers] = useState([])
  const [accountRates, setAccountRates] = useState([])
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
        // Per-account mode with a user selected
        setGlobalRates(mData.globalRates || [])
        setAccountRates(mData.accountRates || [])
        setGlobalTranscribers(tData.globalRates || [])
        setAccountTranscribers(tData.accountRates || [])

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
        // Global, agency (no selection), or client mode
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
  const canEdit = isEditingBase || isPerAccount
  const isReadOnly = !canEdit

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const forUserId = isPerAccount ? selectedUserId : null
      const isAgencyEditing = role === 'AGENCY'

      const modelPayload = []
      const modelViolations = []
      for (const r of globalRates) {
        const key = `${r.provider}::${r.model}`
        const val = editModels[key]
        if (val !== '' && val !== undefined) {
          const numVal = parseFloat(val)
          if (!isNaN(numVal) && numVal >= 0) {
            if (isAgencyEditing && numVal < r.rate) {
              modelViolations.push(`${r.provider}/${r.model}: $${numVal.toFixed(2)} is below min $${r.rate.toFixed(2)}`)
              continue
            }
            if (isPerAccount) {
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

  const selectedUser = users.find(u => u.id === selectedUserId)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Accordion state for providers
  const [openProviders, setOpenProviders] = useState({})
  const [pricingOpen, setPricingOpen] = useState(true)

  const toggleProvider = (provider) => {
    setOpenProviders(prev => ({ ...prev, [provider]: !prev[provider] }))
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

      {/* OWNER: View mode toggle + account selector */}
      {role === 'OWNER' && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="inline-flex rounded-lg border border-gray-700/50 overflow-hidden">
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

          {viewMode === 'account' && (
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700/50 bg-white dark:bg-dark-card text-gray-900 dark:text-gray-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-w-[250px]"
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

      {/* AGENCY: info + client selector */}
      {role === 'AGENCY' && (
        <div className="flex items-center gap-4 flex-wrap">
          <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
            <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-blue-700 dark:text-blue-300">Base prices set by platform. Select a client to customize.</span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-400">Client:</label>
            <select
              value={selectedUserId || ''}
              onChange={e => setSelectedUserId(e.target.value ? parseInt(e.target.value) : null)}
              className="px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700/50 bg-white dark:bg-dark-card text-gray-900 dark:text-gray-300 focus:ring-1 focus:ring-primary-500 focus:border-primary-500 min-w-[250px]"
            >
              <option value="">All clients (base rates)</option>
              {users.map(u => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} — ID #{u.id}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Selected account header */}
      {isPerAccount && selectedUser && (
        <div className="bg-primary-50 dark:bg-primary-900/10 border border-primary-200 dark:border-primary-800 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 text-white flex items-center justify-center text-sm font-bold">
              {(selectedUser.name || selectedUser.email || '?')[0].toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-200">
                Editing rates for: {selectedUser.name || selectedUser.email}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                {selectedUser.email} &middot; {selectedUser.role} &middot; ID #{selectedUser.id}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Model Rates Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-1">
          {t('pricing.modelRates')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
          {isPerAccount
            ? 'Set custom rates for this account. Leave empty to keep the base rate.'
            : isEditingBase
              ? t('pricing.modelRatesDesc')
              : 'Default rates set by the platform owner. All accounts use these unless overridden.'}
        </p>

        {/* Pricing per minute accordion */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
          {/* Main header */}
          <button
            onClick={() => setPricingOpen(!pricingOpen)}
            className="w-full flex items-center justify-between px-5 py-3.5 bg-white dark:bg-[#1e2024] hover:bg-gray-50 dark:hover:bg-[#252830] transition-colors"
          >
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pricing per minute</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${pricingOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {pricingOpen && (
            <div className="border-t border-gray-200 dark:border-gray-700/50">
              {Object.entries(grouped).map(([provider, models], providerIdx) => (
                <div key={provider}>
                  {/* Provider accordion header */}
                  <button
                    onClick={() => toggleProvider(provider)}
                    className="w-full flex items-center justify-between px-5 py-3 bg-white dark:bg-[#1a1c20] hover:bg-gray-50 dark:hover:bg-[#22242a] transition-colors border-t border-gray-100 dark:border-gray-700/30"
                  >
                    <div className="flex items-center gap-2">
                      <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${openProviders[provider] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                        {MODEL_PROVIDER_LABELS[provider] || provider}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        ({models.length} {models.length === 1 ? 'model' : 'models'})
                      </span>
                    </div>
                    <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-200 ${openProviders[provider] ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>

                  {/* Provider models list */}
                  {openProviders[provider] && (
                    <div>
                      {models.map((r, modelIdx) => {
                        const key = `${r.provider}::${r.model}`
                        const currentVal = editModels[key]
                        const hasOverride = isPerAccount && accountRates.some(o => o.provider === r.provider && o.model === r.model)
                        const isBelowMin = isPerAccount && role === 'AGENCY' && currentVal !== '' && currentVal !== undefined && parseFloat(currentVal) < r.rate
                        return (
                          <div
                            key={key}
                            className={`flex items-center justify-between px-5 py-3 border-t transition-colors ${
                              isBelowMin
                                ? 'border-red-500/30 bg-red-500/5'
                                : hasOverride
                                ? 'border-primary-500/20 bg-primary-500/5'
                                : 'border-gray-100 dark:border-gray-700/30 bg-white dark:bg-[#16181c] hover:bg-gray-50 dark:hover:bg-[#1a1c22]'
                            }`}
                          >
                            <span className="text-sm text-gray-600 dark:text-gray-400 pl-6">
                              {r.model}
                            </span>
                            <div className="flex items-center gap-1">
                              {canEdit ? (
                                <div className={`flex items-center rounded-lg border px-2.5 py-1 ${
                                  isBelowMin ? 'border-red-500/50 bg-red-500/10' : 'border-gray-200 dark:border-gray-600/40 bg-gray-50 dark:bg-[#1e2024]'
                                }`}>
                                  <span className="text-xs text-gray-400 mr-1">$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min={isPerAccount && role === 'AGENCY' ? r.rate : 0}
                                    value={currentVal ?? ''}
                                    onChange={e => setEditModels(prev => ({ ...prev, [key]: e.target.value }))}
                                    placeholder={isPerAccount ? r.rate.toFixed(2) : '0.00'}
                                    className="w-16 text-sm text-right bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  />
                                  <span className="text-xs text-gray-400 ml-1">/min</span>
                                </div>
                              ) : (
                                <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600/40 bg-gray-50 dark:bg-[#1e2024] px-2.5 py-1">
                                  <span className="text-xs text-gray-400 mr-1">$</span>
                                  <span className="text-sm text-gray-700 dark:text-gray-300 w-16 text-right">{r.rate.toFixed(2)}</span>
                                  <span className="text-xs text-gray-400 ml-1">/min</span>
                                </div>
                              )}
                              {isPerAccount && isBelowMin && (
                                <span className="text-[10px] text-red-400 ml-1">min ${r.rate.toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Transcriber Rates Section */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-200 mb-1">
          {t('pricing.transcriberRates')}
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
          {isPerAccount
            ? 'Set custom transcriber rates for this account. Leave empty to keep the base rate.'
            : isEditingBase
              ? t('pricing.transcriberRatesDesc')
              : 'Default transcriber rates set by the platform owner.'}
        </p>

        <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden">
          {globalTranscribers.map((r, idx) => {
            const label = TRANSCRIBER_PROVIDERS.find(tp => tp.id === r.provider)?.label || r.provider
            const currentVal = editTranscribers[r.provider]
            const hasOverride = isPerAccount && accountTranscribers.some(o => o.provider === r.provider)
            const isBelowMin = isPerAccount && role === 'AGENCY' && currentVal !== '' && currentVal !== undefined && parseFloat(currentVal) < r.rate
            return (
              <div
                key={r.provider}
                className={`flex items-center justify-between px-5 py-3 transition-colors ${
                  idx > 0 ? 'border-t' : ''
                } ${
                  isBelowMin
                    ? 'border-red-500/30 bg-red-500/5'
                    : hasOverride
                    ? 'border-primary-500/20 bg-primary-500/5'
                    : 'border-gray-100 dark:border-gray-700/30 bg-white dark:bg-[#16181c] hover:bg-gray-50 dark:hover:bg-[#1a1c22]'
                }`}
              >
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {label}
                </span>
                <div className="flex items-center gap-1">
                  {canEdit ? (
                    <div className={`flex items-center rounded-lg border px-2.5 py-1 ${
                      isBelowMin ? 'border-red-500/50 bg-red-500/10' : 'border-gray-200 dark:border-gray-600/40 bg-gray-50 dark:bg-[#1e2024]'
                    }`}>
                      <span className="text-xs text-gray-400 mr-1">$</span>
                      <input
                        type="number"
                        step="0.001"
                        min={isPerAccount && role === 'AGENCY' ? r.rate : 0}
                        value={currentVal ?? ''}
                        onChange={e => setEditTranscribers(prev => ({ ...prev, [r.provider]: e.target.value }))}
                        placeholder={isPerAccount ? r.rate.toFixed(3) : '0.000'}
                        className="w-16 text-sm text-right bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <span className="text-xs text-gray-400 ml-1">/min</span>
                    </div>
                  ) : (
                    <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-600/40 bg-gray-50 dark:bg-[#1e2024] px-2.5 py-1">
                      <span className="text-xs text-gray-400 mr-1">$</span>
                      <span className="text-sm text-gray-700 dark:text-gray-300 w-16 text-right">{r.rate.toFixed(3)}</span>
                      <span className="text-xs text-gray-400 ml-1">/min</span>
                    </div>
                  )}
                  {isPerAccount && isBelowMin && (
                    <span className="text-[10px] text-red-400 ml-1">min ${r.rate.toFixed(3)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-gray-50 dark:bg-[#16181c] border border-gray-200 dark:border-gray-700/50 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <svg className="w-5 h-5 text-gray-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{t('pricing.howItWorks')}</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-1">
              {isPerAccount
                ? 'Per-account rates override the base pricing for this specific user. Leave a field empty to use the base rate. Agencies cannot set rates below the platform base price.'
                : role === 'AGENCY'
                  ? 'These are the base rates set by the platform owner. Select a client above to set custom pricing for them. You cannot set rates below the base price.'
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
    </div>
  )
}
