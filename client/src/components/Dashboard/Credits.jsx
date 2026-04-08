import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { creditsAPI, whopAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'
import WhopCheckoutModal from './WhopCheckoutModal'

export default function Credits() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [amount, setAmount] = useState('')
  const [operation, setOperation] = useState('add')
  const [updating, setUpdating] = useState(false)

  const canManageCredits = user?.role === 'OWNER' || user?.role === 'AGENCY'

  // Buy credits state
  const [creditTiers, setCreditTiers] = useState([])
  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [checkoutModal, setCheckoutModal] = useState(null) // { planId }
  const [buyLoading, setBuyLoading] = useState(null) // tier amount being purchased
  const [success, setSuccess] = useState('')
  const [searchParams] = useSearchParams()

  useEffect(() => {
    fetchCredits()
    fetchTiers()
  }, [])

  // Detect checkout success from redirect
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setSuccess(t('credits.purchaseSuccess') || 'Credits purchased successfully! They will appear shortly.')
      fetchCredits()
    }
  }, [searchParams])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const fetchCredits = async () => {
    try {
      setLoading(true)
      const response = await creditsAPI.list()
      setUsers(response.data.users)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load credits')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateCredits = async (e) => {
    e.preventDefault()
    if (!editingUser || !amount) return

    try {
      setUpdating(true)
      await creditsAPI.update(editingUser.id, {
        amount: parseFloat(amount),
        operation
      })
      await fetchCredits()
      setEditingUser(null)
      setAmount('')
      setOperation('add')
      // Dispatch event to refresh sidebar
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update credits')
    } finally {
      setUpdating(false)
    }
  }

  const fetchTiers = async () => {
    try {
      const { data } = await whopAPI.getCreditTiers()
      setCreditTiers(data.tiers || [])
    } catch {
      // Tiers not available (Whop not configured) — hide buy button
      setCreditTiers([])
    }
  }

  const handleBuyCredits = async (tier) => {
    setBuyLoading(tier)
    try {
      const { data } = await creditsAPI.purchase(tier)
      if (data.planId) {
        setBuyModalOpen(false)
        setCheckoutModal({ planId: data.planId })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create checkout')
    } finally {
      setBuyLoading(null)
    }
  }

  const handleCheckoutComplete = () => {
    setCheckoutModal(null)
    setSuccess(t('credits.purchaseSuccess') || 'Credits purchased! They will appear shortly.')
    setTimeout(() => fetchCredits(), 2000)
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      case 'AGENCY':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
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
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('credits.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('credits.subtitle')}
          </p>
        </div>
        {creditTiers.some(t => t.available) && (
          <button
            onClick={() => setBuyModalOpen(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
          >
            {t('credits.buyCredits') || 'Buy Credits'}
          </button>
        )}
      </div>

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('common.dismiss')}</button>
        </div>
      )}

      {/* Buy Credits Modal — Predefined Tiers */}
      {buyModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-dark-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('credits.buyCredits') || 'Buy Credits'}
              </h3>
              <button
                onClick={() => setBuyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-5">
              {t('credits.buyCreditsDesc') || 'Select a credit package. $1 = 1 credit.'}
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {creditTiers.filter(tier => tier.available).map((tier) => (
                <button
                  key={tier.amount}
                  onClick={() => handleBuyCredits(tier.amount)}
                  disabled={buyLoading !== null}
                  className={`relative p-4 rounded-xl border-2 transition-colors text-center disabled:opacity-50 ${
                    tier.testOnly
                      ? 'border-yellow-300 dark:border-yellow-600 hover:border-yellow-500'
                      : 'border-gray-200 dark:border-dark-border hover:border-primary-500 dark:hover:border-primary-500'
                  }`}
                >
                  {tier.testOnly && (
                    <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 text-[10px] font-bold bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400 rounded">
                      TEST
                    </span>
                  )}
                  <div className="text-2xl font-bold text-gray-900 dark:text-white">
                    ${tier.amount}
                  </div>
                  <div className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {tier.credits} {t('credits.creditsLabel') || 'credits'}
                  </div>
                  {buyLoading === tier.amount && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-dark-card/80 rounded-xl">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Whop Checkout Modal */}
      {checkoutModal && (
        <WhopCheckoutModal
          planId={checkoutModal.planId}
          onComplete={handleCheckoutComplete}
          onClose={() => setCheckoutModal(null)}
        />
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-dark-border">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('credits.updateCreditsFor', { name: editingUser.name || editingUser.email })}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('credits.currentBalance')} <span className="font-semibold text-primary-600 dark:text-primary-400">${editingUser.vapiCredits?.toFixed(2) || '0.00'}</span>
            </p>

            <form onSubmit={handleUpdateCredits}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('credits.operation')}
                </label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  <option value="add">{t('credits.addCredits')}</option>
                  <option value="subtract">{t('credits.subtractCredits')}</option>
                  <option value="set">{t('credits.setBalance')}</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('credits.amount')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null)
                    setAmount('')
                    setOperation('add')
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {updating ? t('common.updating') : t('common.update')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('credits.user')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('common.role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('credits.agency')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('credits.title')}
                </th>
                {canManageCredits && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {u.name || 'No name'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {u.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {u.agency?.name || u.agency?.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`font-semibold ${u.vapiCredits > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      ${u.vapiCredits?.toFixed(2) || '0.00'}
                    </span>
                  </td>
                  {canManageCredits && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {(user.role === 'OWNER' || (user.role === 'AGENCY' && u.agencyId === user.id)) && (
                        <button
                          onClick={() => setEditingUser(u)}
                          className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium"
                        >
                          {t('common.manageCredits')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={canManageCredits ? 5 : 4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {t('credits.noUsersFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
