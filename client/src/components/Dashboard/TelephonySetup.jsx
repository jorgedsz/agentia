import { useState, useEffect } from 'react'
import { telephonyAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const PROVIDERS = [
  {
    key: 'twilio',
    name: 'Twilio',
    color: 'red',
    colorHex: '#F22F46',
    fields: [
      { name: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', helpKey: 'telephony.twilioSidHelp' },
      { name: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Your Twilio Auth Token', helpKey: 'telephony.twilioTokenHelp' },
    ],
  },
  {
    key: 'vonage',
    name: 'Vonage',
    color: 'purple',
    colorHex: '#7B61FF',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Your Vonage API Key' },
      { name: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Your Vonage API Secret' },
    ],
  },
  {
    key: 'telnyx',
    name: 'Telnyx',
    color: 'green',
    colorHex: '#00C08B',
    fields: [
      { name: 'telnyxApiKey', label: 'API Key', type: 'password', placeholder: 'KEYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx' },
    ],
  },
]

export default function TelephonySetup() {
  const { t } = useLanguage()
  const [credentials, setCredentials] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [formData, setFormData] = useState({})
  const [saving, setSaving] = useState(null)
  const [verifying, setVerifying] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => { fetchCredentials() }, [])

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const response = await telephonyAPI.getCredentials()
      setCredentials(response.data.credentials)
    } catch (err) {
      console.error('Error fetching credentials:', err)
      setCredentials([])
    } finally {
      setLoading(false)
    }
  }

  const getCredForProvider = (provider) => credentials.find(c => c.provider === provider)

  const handleSave = async (providerKey) => {
    const fields = formData[providerKey]
    if (!fields) return
    setSaving(providerKey)
    setError('')
    setSuccess('')
    try {
      const cred = getCredForProvider(providerKey)
      if (cred) {
        await telephonyAPI.updateCredentials(cred.id, fields)
        setSuccess(t('telephony.credentialsUpdated'))
      } else {
        await telephonyAPI.saveCredentials({ provider: providerKey, ...fields })
        setSuccess(t('telephony.credentialsSaved'))
      }
      setFormData(prev => ({ ...prev, [providerKey]: {} }))
      setExpanded(null)
      await fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save credentials')
    } finally {
      setSaving(null)
    }
  }

  const handleVerify = async (credId, providerKey) => {
    setVerifying(providerKey)
    setError('')
    setSuccess('')
    try {
      const response = await telephonyAPI.verifyCredentials(credId)
      const { account, phoneNumbers } = response.data
      let message = t('telephony.verified')
      if (account?.name) message += ` — ${account.name}`
      if (phoneNumbers?.imported > 0) message += ` | ${phoneNumbers.imported} numbers imported`
      if (phoneNumbers?.failed > 0) message += `, ${phoneNumbers.failed} failed`
      setSuccess(message)
      await fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed')
    } finally {
      setVerifying(null)
    }
  }

  const handleDelete = async (credId, providerName) => {
    if (!confirm(`Are you sure you want to disconnect ${providerName}? This will also remove all imported phone numbers.`)) return
    setDeleting(credId)
    setError('')
    setSuccess('')
    try {
      await telephonyAPI.deleteCredentials(credId)
      setSuccess(t('telephony.credentialsDeleted'))
      await fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect')
    } finally {
      setDeleting(null)
    }
  }

  const updateField = (providerKey, fieldName, value) => {
    setFormData(prev => ({
      ...prev,
      [providerKey]: { ...(prev[providerKey] || {}), [fieldName]: value }
    }))
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
      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('telephony.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('telephony.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">{error}</div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">{success}</div>
      )}

      {/* Provider Cards */}
      {PROVIDERS.map(provider => {
        const cred = getCredForProvider(provider.key)
        const isExpanded = expanded === provider.key
        const isConnected = !!cred

        return (
          <div key={provider.key} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
            {/* Provider header */}
            <div
              className="flex items-center justify-between p-6 cursor-pointer"
              onClick={() => setExpanded(isExpanded ? null : provider.key)}
            >
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center`} style={{ background: `${provider.colorHex}15` }}>
                  <svg className="w-5 h-5" style={{ color: provider.colorHex }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white">{provider.name}</h3>
                  <div className="flex items-center gap-2 mt-0.5">
                    {isConnected ? (
                      <>
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          cred.isVerified
                            ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                            : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                        }`}>
                          {cred.isVerified ? t('common.verified') : t('telephony.connected')}
                        </span>
                        {cred.phoneNumberCount > 0 && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {cred.phoneNumberCount} number{cred.phoneNumberCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        {(cred.accountSid || cred.apiKey || cred.telnyxApiKey) && (
                          <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                            {cred.accountSid || cred.apiKey || cred.telnyxApiKey}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 dark:text-gray-500">{t('telephony.notConnected')}</span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isConnected && (
                  <>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleVerify(cred.id, provider.key) }}
                      disabled={verifying === provider.key}
                      className="px-3 py-1.5 text-xs font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                    >
                      {verifying === provider.key ? (
                        <><div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div> {t('telephony.verifying')}</>
                      ) : (
                        <>{t('telephony.verify')}</>
                      )}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(cred.id, provider.name) }}
                      disabled={deleting === cred.id}
                      className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-500/10 rounded-lg"
                    >
                      {t('common.delete')}
                    </button>
                  </>
                )}
                <svg className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            {/* Expanded form */}
            {isExpanded && (
              <div className="px-6 pb-6 border-t border-gray-200 dark:border-dark-border">
                <form onSubmit={(e) => { e.preventDefault(); handleSave(provider.key) }} className="space-y-4 pt-4">
                  {isConnected && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {t('telephony.updateHint')}
                    </p>
                  )}
                  {provider.fields.map(field => (
                    <div key={field.name}>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {field.label} {!isConnected && '*'}
                      </label>
                      <input
                        type={field.type}
                        value={formData[provider.key]?.[field.name] || ''}
                        onChange={(e) => updateField(provider.key, field.name, e.target.value)}
                        placeholder={isConnected ? 'Leave blank to keep current' : field.placeholder}
                        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                        required={!isConnected}
                      />
                    </div>
                  ))}
                  <div className="flex gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => { setExpanded(null); setFormData(prev => ({ ...prev, [provider.key]: {} })) }}
                      className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      disabled={saving === provider.key}
                      className="flex-1 px-4 py-2 text-white rounded-lg transition-colors disabled:opacity-50"
                      style={{ background: provider.colorHex }}
                    >
                      {saving === provider.key
                        ? t('common.saving')
                        : isConnected ? t('common.update') : `Connect ${provider.name}`}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        )
      })}

      {/* Help Section */}
      <div className="bg-gray-50 dark:bg-dark-hover rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('telephony.howToConnect')}</h3>
        <div className="text-sm text-gray-600 dark:text-gray-400 space-y-3">
          <div>
            <strong>Twilio:</strong> {t('telephony.twilioHelp')}
          </div>
          <div>
            <strong>Vonage:</strong> {t('telephony.vonageHelp')}
          </div>
          <div>
            <strong>Telnyx:</strong> {t('telephony.telnyxHelp')}
          </div>
        </div>
      </div>
    </div>
  )
}
