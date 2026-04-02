import { useState, useEffect, useRef } from 'react'
import { callbackAPI, followUpAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const STATUS_CONFIG = {
  pending: { bg: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' },
  completed: { bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  failed: { bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  cancelled: { bg: 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400' }
}

function StatusBadge({ status, t }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bg}`}>
      {t(`scheduledCalls.status_${status}`) || status}
    </span>
  )
}

const formatDate = (dateString) => {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleString()
}

export default function ScheduledCalls() {
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('callbacks')
  const [callbacks, setCallbacks] = useState([])
  const [followUps, setFollowUps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const loadedTabs = useRef({})

  // Fetch callbacks on mount (default tab)
  useEffect(() => {
    fetchCallbacks()
  }, [])

  // Lazy-load follow-ups when that tab is first visited
  useEffect(() => {
    if (activeTab === 'followups' && !loadedTabs.current['followups']) {
      fetchFollowUps()
    }
  }, [activeTab])

  const fetchCallbacks = async () => {
    try {
      setLoading(true)
      setError(null)
      const cbRes = await callbackAPI.list()
      setCallbacks(cbRes.data.callbacks || [])
      loadedTabs.current['callbacks'] = true
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load callbacks')
    } finally {
      setLoading(false)
    }
  }

  const fetchFollowUps = async () => {
    try {
      setLoading(true)
      setError(null)
      const fuRes = await followUpAPI.list()
      setFollowUps(fuRes.data.followUps || [])
      loadedTabs.current['followups'] = true
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load follow-ups')
    } finally {
      setLoading(false)
    }
  }

  const fetchData = async () => {
    loadedTabs.current = {}
    try {
      setLoading(true)
      setError(null)
      const [cbRes, fuRes] = await Promise.all([
        callbackAPI.list(),
        followUpAPI.list()
      ])
      setCallbacks(cbRes.data.callbacks || [])
      setFollowUps(fuRes.data.followUps || [])
      loadedTabs.current['callbacks'] = true
      loadedTabs.current['followups'] = true
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load scheduled calls')
    } finally {
      setLoading(false)
    }
  }

  const handleCancelCallback = async (id) => {
    if (!window.confirm(t('scheduledCalls.confirmCancel'))) return
    try {
      setCancelling(id)
      await callbackAPI.cancel(id)
      setCallbacks(prev => prev.map(cb =>
        cb.id === id ? { ...cb, status: 'cancelled' } : cb
      ))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel callback')
    } finally {
      setCancelling(null)
    }
  }

  const handleCancelFollowUp = async (id) => {
    if (!window.confirm(t('scheduledCalls.confirmCancel'))) return
    try {
      setCancelling(id)
      await followUpAPI.cancel(id)
      setFollowUps(prev => prev.map(fu =>
        fu.id === id ? { ...fu, status: 'cancelled' } : fu
      ))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to cancel follow-up')
    } finally {
      setCancelling(null)
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

  const tabs = [
    { id: 'callbacks', label: t('scheduledCalls.tabCallbacks'), count: callbacks.length },
    { id: 'followups', label: t('scheduledCalls.tabFollowUps'), count: followUps.length }
  ]

  const renderCallbacksTable = () => {
    if (callbacks.length === 0) {
      return (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('scheduledCalls.noCallbacks')}</h3>
          <p className="text-gray-500 dark:text-gray-400">{t('scheduledCalls.noCallbacksDesc')}</p>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-hover">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.scheduledTime')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.customer')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.agent')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.reason')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('common.status')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {callbacks.map((cb) => (
              <tr key={cb.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatDate(cb.scheduledAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {cb.customerNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {cb.agentName || cb.agentId}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate">
                  {cb.reason || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={cb.status} t={t} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {cb.status === 'pending' && (
                    <button
                      onClick={() => handleCancelCallback(cb.id)}
                      disabled={cancelling === cb.id}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50"
                    >
                      {cancelling === cb.id ? t('common.loading') : t('common.cancel')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const renderFollowUpsTable = () => {
    if (followUps.length === 0) {
      return (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('scheduledCalls.noFollowUps')}</h3>
          <p className="text-gray-500 dark:text-gray-400">{t('scheduledCalls.noFollowUpsDesc')}</p>
        </div>
      )
    }

    return (
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-dark-hover">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.scheduledTime')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.customer')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.agent')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.triggerOutcome')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('scheduledCalls.attempt')}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('common.status')}
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                {t('common.actions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
            {followUps.map((fu) => (
              <tr key={fu.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {formatDate(fu.scheduledAt)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {fu.customerNumber}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {fu.agentName || fu.agentId}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {fu.triggerOutcome || '-'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {fu.attemptNumber}/{fu.maxAttempts}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <StatusBadge status={fu.status} t={t} />
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right">
                  {fu.status === 'pending' && (
                    <button
                      onClick={() => handleCancelFollowUp(fu.id)}
                      disabled={cancelling === fu.id}
                      className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium disabled:opacity-50"
                    >
                      {cancelling === fu.id ? t('common.loading') : t('common.cancel')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('scheduledCalls.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('scheduledCalls.subtitle')}</p>
        </div>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('common.dismiss')}</button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 border-b border-gray-200 dark:border-dark-border">
        <div className="flex gap-4">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600 dark:text-primary-400 dark:border-primary-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${
                activeTab === tab.id
                  ? 'bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400'
                  : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        {activeTab === 'callbacks' ? renderCallbacksTable() : renderFollowUpsTable()}
      </div>
    </div>
  )
}
