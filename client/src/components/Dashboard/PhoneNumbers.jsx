import { useState, useEffect } from 'react'
import { phoneNumbersAPI, agentsAPI, telephonyAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const PROVIDER_COLORS = {
  twilio: { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/30', hex: '#F22F46' },
  vonage: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30', hex: '#7B61FF' },
  telnyx: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/30', hex: '#00C08B' },
}

export default function PhoneNumbers() {
  const { t } = useLanguage()
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [credentials, setCredentials] = useState([])
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [showImportModal, setShowImportModal] = useState(false)
  const [importCredId, setImportCredId] = useState(null)
  const [availableNumbers, setAvailableNumbers] = useState([])
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(null)
  const [importing, setImporting] = useState(null)
  const [retrying, setRetrying] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchData() }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [numbersRes, credRes, agentsRes] = await Promise.all([
        phoneNumbersAPI.list(),
        telephonyAPI.getCredentials(),
        agentsAPI.list()
      ])
      setPhoneNumbers(numbersRes.data.phoneNumbers)
      setCredentials(credRes.data.credentials)
      setAgents(agentsRes.data.agents || agentsRes.data)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const verifiedCreds = credentials.filter(c => c.isVerified)

  const fetchAvailableNumbers = async (credId) => {
    setLoadingAvailable(true)
    setError('')
    try {
      const response = await phoneNumbersAPI.listAvailable(credId)
      setAvailableNumbers(response.data.phoneNumbers)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch available numbers')
    } finally {
      setLoadingAvailable(false)
    }
  }

  const handleOpenImport = () => {
    setShowImportModal(true)
    setImportCredId(null)
    setAvailableNumbers([])
  }

  const handleSelectProvider = (credId) => {
    setImportCredId(credId)
    fetchAvailableNumbers(credId)
  }

  const handleImport = async (number) => {
    setImporting(number.sid || number.phoneNumber)
    setError('')
    try {
      await phoneNumbersAPI.import({
        credentialId: importCredId,
        providerPhoneId: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName
      })
      setSuccess(`Imported ${number.phoneNumber}`)
      await fetchAvailableNumbers(importCredId)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import phone number')
    } finally {
      setImporting(null)
    }
  }

  const handleAssign = async (phoneNumberId, agentId) => {
    setError('')
    try {
      await phoneNumbersAPI.assignToAgent(phoneNumberId, agentId)
      setSuccess('Phone number assigned to agent')
      setShowAssignModal(null)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign phone number')
    }
  }

  const handleUnassign = async (phoneNumberId) => {
    setError('')
    try {
      await phoneNumbersAPI.unassign(phoneNumberId)
      setSuccess('Phone number unassigned')
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to unassign phone number')
    }
  }

  const handleRetryVapi = async (phoneNumber) => {
    setRetrying(phoneNumber.id)
    setError('')
    try {
      await phoneNumbersAPI.retryVapi(phoneNumber.id)
      setSuccess(`VAPI import successful for ${phoneNumber.phoneNumber}`)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import to VAPI')
    } finally {
      setRetrying(null)
    }
  }

  const handleRemove = async (phoneNumber) => {
    if (!confirm(`Are you sure you want to remove ${phoneNumber.phoneNumber}? This will also remove it from VAPI.`)) return
    setError('')
    try {
      await phoneNumbersAPI.remove(phoneNumber.id)
      setSuccess('Phone number removed')
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove phone number')
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30'
    }
    return styles[status] || styles.pending
  }

  const getProviderBadge = (provider) => {
    const colors = PROVIDER_COLORS[provider] || PROVIDER_COLORS.twilio
    return `${colors.bg} ${colors.text} ${colors.border}`
  }

  const filtered = filter === 'all' ? phoneNumbers : phoneNumbers.filter(n => n.provider === filter)
  const activeProviders = [...new Set(phoneNumbers.map(n => n.provider))]

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // No credentials setup
  if (credentials.length === 0) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('phoneNumbers.setupFirst')}</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">{t('phoneNumbers.setupFirstDesc')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          {error}
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-300 ml-2">&times;</button>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm flex justify-between items-center">
          {success}
          <button onClick={() => setSuccess('')} className="text-green-400 hover:text-green-300 ml-2">&times;</button>
        </div>
      )}

      {/* Filter tabs */}
      {activeProviders.length > 1 && (
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              filter === 'all' ? 'bg-primary-500/10 text-primary-500 border-primary-500/30' : 'text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            All
          </button>
          {activeProviders.map(p => (
            <button
              key={p}
              onClick={() => setFilter(p)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                filter === p ? `${getProviderBadge(p)}` : 'text-gray-400 border-transparent hover:bg-gray-100 dark:hover:bg-dark-hover'
              }`}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      )}

      {/* Phone Numbers List */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('phoneNumbers.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('phoneNumbers.subtitle')}</p>
          </div>
          {verifiedCreds.length > 0 && (
            <button
              onClick={handleOpenImport}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              {t('phoneNumbers.importNumber')}
            </button>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('phoneNumbers.noPhoneNumbers')}</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">{t('phoneNumbers.importDescription')}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('callLogs.phoneNumber')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Provider</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.status')}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('phoneNumbers.assignedAgent')}</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {filtered.map((number) => (
                <tr key={number.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900 dark:text-white">{number.phoneNumber}</div>
                    {number.friendlyName && number.friendlyName !== number.phoneNumber && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">{number.friendlyName}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getProviderBadge(number.provider)}`}>
                      {number.provider}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadge(number.status)}`}>
                      {number.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {number.agent ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        {number.agent.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">{t('phoneNumbers.notAssigned')}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {number.status !== 'active' && (
                      <button
                        onClick={() => handleRetryVapi(number)}
                        disabled={retrying === number.id}
                        className="text-orange-500 hover:text-orange-600 text-sm disabled:opacity-50"
                      >
                        {retrying === number.id ? 'Importing...' : 'Import to VAPI'}
                      </button>
                    )}
                    {number.agent ? (
                      <button onClick={() => handleUnassign(number.id)} className="text-yellow-500 hover:text-yellow-600 text-sm">
                        {t('common.unassign')}
                      </button>
                    ) : (
                      <button onClick={() => setShowAssignModal(number)} className="text-primary-500 hover:text-primary-600 text-sm">
                        {t('common.assign')}
                      </button>
                    )}
                    <button onClick={() => handleRemove(number)} className="text-red-500 hover:text-red-600 text-sm ml-3">
                      {t('common.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-dark-border">
            <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('phoneNumbers.importPhoneNumber')}</h2>
              <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Provider selector */}
            {verifiedCreds.length > 1 && (
              <div className="px-6 pt-4 flex gap-2">
                {verifiedCreds.map(cred => {
                  const colors = PROVIDER_COLORS[cred.provider] || PROVIDER_COLORS.twilio
                  return (
                    <button
                      key={cred.id}
                      onClick={() => handleSelectProvider(cred.id)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        importCredId === cred.id
                          ? `${colors.bg} ${colors.text} ${colors.border}`
                          : 'text-gray-400 border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'
                      }`}
                    >
                      {cred.provider.charAt(0).toUpperCase() + cred.provider.slice(1)}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {!importCredId && verifiedCreds.length === 1 && (() => { handleSelectProvider(verifiedCreds[0].id); return null })()}
              {!importCredId && verifiedCreds.length > 1 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">Select a provider above to see available numbers.</p>
                </div>
              )}
              {loadingAvailable && (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              )}
              {importCredId && !loadingAvailable && availableNumbers.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">{t('phoneNumbers.noNumbersFound')}</p>
                </div>
              )}
              {!loadingAvailable && availableNumbers.length > 0 && (
                <div className="space-y-3">
                  {availableNumbers.map((number) => (
                    <div
                      key={number.sid || number.phoneNumber}
                      className={`p-4 rounded-lg border ${
                        number.isImported
                          ? 'bg-gray-50 dark:bg-dark-hover border-gray-200 dark:border-dark-border opacity-60'
                          : 'bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border hover:border-primary-500'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{number.phoneNumber}</div>
                          {number.friendlyName && number.friendlyName !== number.phoneNumber && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">{number.friendlyName}</div>
                          )}
                          {number.capabilities && (
                            <div className="flex gap-2 mt-1">
                              {number.capabilities?.voice && <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">Voice</span>}
                              {number.capabilities?.sms && <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded">SMS</span>}
                            </div>
                          )}
                        </div>
                        {number.isImported ? (
                          <span className="text-sm text-gray-400">{t('phoneNumbers.alreadyImported')}</span>
                        ) : (
                          <button
                            onClick={() => handleImport(number)}
                            disabled={importing === (number.sid || number.phoneNumber)}
                            className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                          >
                            {importing === (number.sid || number.phoneNumber) ? t('phoneNumbers.importing') : t('common.import')}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full border border-gray-200 dark:border-dark-border">
            <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('phoneNumbers.assignToAgent')}</h2>
              <button onClick={() => setShowAssignModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                {t('phoneNumbers.selectAgent', { number: showAssignModal.phoneNumber })}
              </p>
              {agents.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 dark:text-gray-400">{t('phoneNumbers.noAgentsAvailable')}</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleAssign(showAssignModal.id, agent.id)}
                      className="w-full p-3 rounded-lg border border-gray-200 dark:border-dark-border hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{agent.name}</div>
                          {agent.vapiId && <div className="text-xs text-green-500">{t('phoneNumbers.vapiConnected')}</div>}
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowAssignModal(null)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
