import { useState, useEffect } from 'react'
import { twilioAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

export default function TwilioSetup() {
  const { t } = useLanguage()
  const [credentials, setCredentials] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [formData, setFormData] = useState({
    accountSid: '',
    authToken: ''
  })
  const [isEditing, setIsEditing] = useState(false)

  useEffect(() => {
    fetchCredentials()
  }, [])

  const fetchCredentials = async () => {
    setLoading(true)
    try {
      const response = await twilioAPI.getCredentials()
      setCredentials(response.data.credentials)
    } catch (err) {
      if (err.response?.status !== 404) {
        console.error('Error fetching credentials:', err)
      }
      setCredentials(null)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      if (credentials) {
        await twilioAPI.updateCredentials(formData)
        setSuccess('Credentials updated successfully')
      } else {
        await twilioAPI.saveCredentials(formData)
        setSuccess('Credentials saved successfully')
      }
      setFormData({ accountSid: '', authToken: '' })
      setIsEditing(false)
      await fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save credentials')
    } finally {
      setSaving(false)
    }
  }

  const handleVerify = async () => {
    setError('')
    setSuccess('')
    setVerifying(true)

    try {
      const response = await twilioAPI.verifyCredentials()
      const { account, phoneNumbers } = response.data

      let message = `Verified! Account: ${account.name}`
      if (phoneNumbers && (phoneNumbers.imported > 0 || phoneNumbers.failed > 0)) {
        message += ` | Phone numbers: ${phoneNumbers.imported} imported`
        if (phoneNumbers.failed > 0) {
          message += `, ${phoneNumbers.failed} failed`
        }
      }
      setSuccess(message)
      await fetchCredentials()
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed')
    } finally {
      setVerifying(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete your Twilio credentials? This will also remove all imported phone numbers.')) {
      return
    }

    setError('')
    setSuccess('')

    try {
      await twilioAPI.deleteCredentials()
      setCredentials(null)
      setSuccess('Credentials deleted successfully')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete credentials')
    }
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
      {/* Header Card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-red-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('twilio.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('twilio.subtitle')}
            </p>
          </div>
        </div>
      </div>

      {/* Status Messages */}
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

      {/* Credentials Card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        {credentials && !isEditing ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('twilio.yourCredentials')}</h3>
              <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                credentials.isVerified
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                  : 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
              }`}>
                {credentials.isVerified ? t('common.verified') : t('common.notVerified')}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('twilio.accountSid')}
                </label>
                <div className="px-3 py-2 bg-gray-50 dark:bg-dark-hover rounded-lg text-gray-900 dark:text-white font-mono text-sm">
                  {credentials.accountSid}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('twilio.authToken')}
                </label>
                <div className="px-3 py-2 bg-gray-50 dark:bg-dark-hover rounded-lg text-gray-900 dark:text-white font-mono text-sm">
                  {credentials.authToken}
                </div>
              </div>
            </div>

            <div className="text-sm text-gray-500 dark:text-gray-400">
              {t('twilio.phoneNumbersImported', { count: credentials.phoneNumberCount })}
            </div>

            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-dark-border">
              {!credentials.isVerified && (
                <button
                  onClick={handleVerify}
                  disabled={verifying}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {verifying ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('twilio.verifying')}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('twilio.verifyCredentials')}
                    </>
                  )}
                </button>
              )}
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
              >
                {t('twilio.updateCredentials')}
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
              >
                {t('common.delete')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSave} className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {credentials ? t('twilio.updateCredentials') : t('twilio.addCredentials')}
            </h3>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('twilio.accountSid')} *
              </label>
              <input
                type="text"
                value={formData.accountSid}
                onChange={(e) => setFormData({ ...formData, accountSid: e.target.value })}
                placeholder={credentials ? 'Enter new Account SID' : 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                required={!credentials}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('twilio.accountSidHelp')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('twilio.authToken')} *
              </label>
              <input
                type="password"
                value={formData.authToken}
                onChange={(e) => setFormData({ ...formData, authToken: e.target.value })}
                placeholder={credentials ? 'Enter new Auth Token' : 'Your Twilio Auth Token'}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                required={!credentials}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                {t('twilio.authTokenHelp')}
              </p>
            </div>

            <div className="flex gap-3 pt-4">
              {credentials && (
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false)
                    setFormData({ accountSid: '', authToken: '' })
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                >
                  {t('common.cancel')}
                </button>
              )}
              <button
                type="submit"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
              >
                {saving ? t('common.saving') : credentials ? t('common.update') : t('twilio.saveCredentials')}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Help Section */}
      <div className="bg-gray-50 dark:bg-dark-hover rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">{t('twilio.howToGetCredentials')}</h3>
        <ol className="text-sm text-gray-600 dark:text-gray-400 space-y-2 list-decimal list-inside">
          <li>{t('twilio.step1')}</li>
          <li>{t('twilio.step2')}</li>
          <li>{t('twilio.step3')}</li>
          <li>{t('twilio.step4')}</li>
        </ol>
      </div>
    </div>
  )
}
