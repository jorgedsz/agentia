import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ratesAPI } from '../../services/api'

export default function RatesSettings() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  const [outboundRate, setOutboundRate] = useState('')
  const [inboundRate, setInboundRate] = useState('')

  const isOwner = user?.role === 'OWNER'

  useEffect(() => {
    fetchRates()
  }, [])

  const fetchRates = async () => {
    try {
      setLoading(true)
      const response = await ratesAPI.get()
      setOutboundRate(response.data.outboundRate.toString())
      setInboundRate(response.data.inboundRate.toString())
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load rates')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    try {
      setSaving(true)
      await ratesAPI.update({
        outboundRate: parseFloat(outboundRate),
        inboundRate: parseFloat(inboundRate)
      })
      setSuccess('Rates updated successfully')
      setTimeout(() => setSuccess(null), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update rates')
    } finally {
      setSaving(false)
    }
  }

  const handleSyncBilling = async () => {
    setError(null)
    setSuccess(null)

    try {
      setSyncing(true)
      const response = await ratesAPI.syncBilling()
      setSuccess(`Billing synced: ${response.data.billedCalls} calls billed, $${response.data.totalCharged} charged`)
      // Dispatch event to refresh sidebar credits
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
      setTimeout(() => setSuccess(null), 5000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to sync billing')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Call Rates</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">
          Configure per-minute billing rates for calls
        </p>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">Dismiss</button>
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Rate Configuration</h2>

        {!isOwner && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-700 dark:text-yellow-400 text-sm">
            Only the OWNER can modify rates. You can view current rates below.
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Outbound Rate ($ per minute)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={outboundRate}
              onChange={(e) => setOutboundRate(e.target.value)}
              disabled={!isOwner}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="0.10"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Rate charged per minute for outbound calls made by agents
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Inbound Rate ($ per minute)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={inboundRate}
              onChange={(e) => setInboundRate(e.target.value)}
              disabled={!isOwner}
              className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="0.05"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Rate charged per minute for inbound calls received by agents
            </p>
          </div>

          {isOwner && (
            <div className="pt-4">
              <button
                type="submit"
                disabled={saving}
                className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Saving...
                  </>
                ) : (
                  'Save Rates'
                )}
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Billing Sync */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Billing Sync</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Manually sync billing for all completed calls. This will calculate charges based on call duration and deduct from user credits.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          <strong>Note:</strong> Billing is also automatically synced when viewing Call Logs.
        </p>
        <button
          onClick={handleSyncBilling}
          disabled={syncing}
          className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
        >
          {syncing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Syncing...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Sync Billing Now
            </>
          )}
        </button>
      </div>
    </div>
  )
}
