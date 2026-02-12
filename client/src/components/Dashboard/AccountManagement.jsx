import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { authAPI, usersAPI } from '../../services/api'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

export default function AccountManagement() {
  const { user, switchAccount, isImpersonating } = useAuth()
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [switching, setSwitching] = useState(null)

  // Billing modal state
  const [editingUser, setEditingUser] = useState(null)
  const [billingForm, setBillingForm] = useState({
    credits: '',
    creditOperation: 'add',
    outboundRate: '',
    inboundRate: ''
  })
  const [saving, setSaving] = useState(false)

  // Create modals state
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchAccounts()
  }, [user?.id, user?.role])

  const fetchAccounts = async () => {
    setLoading(true)
    setError('')
    try {
      if (user?.role === ROLES.OWNER) {
        const response = await usersAPI.getAll()
        setAccounts(response.data.users)
      } else if (user?.role === ROLES.AGENCY) {
        const response = await authAPI.getAccessibleAccounts()
        setAccounts(response.data.accounts)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitch = async (account) => {
    setSwitching(account.id)
    setError('')
    try {
      await switchAccount(account.id)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to switch account')
      setSwitching(null)
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case ROLES.OWNER: return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case ROLES.AGENCY: return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const getCreditColor = (credits) => {
    if (credits <= 0) return 'text-red-500'
    if (credits < 5) return 'text-yellow-500'
    return 'text-green-500'
  }

  // Filter and search
  const filteredAccounts = accounts.filter(account => {
    const matchesFilter = filter === 'all' || account.role === filter
    const matchesSearch = !search ||
      account.email.toLowerCase().includes(search.toLowerCase()) ||
      (account.name && account.name.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesSearch
  })

  // Billing modal handlers
  const openBillingModal = (targetUser) => {
    setEditingUser(targetUser)
    setBillingForm({
      credits: '',
      creditOperation: 'add',
      outboundRate: targetUser.outboundRate?.toString() || '0.10',
      inboundRate: targetUser.inboundRate?.toString() || '0.05'
    })
    setError('')
    setSuccess('')
  }

  const closeBillingModal = () => {
    setEditingUser(null)
    setBillingForm({ credits: '', creditOperation: 'add', outboundRate: '', inboundRate: '' })
  }

  const handleBillingSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const data = {}
      if (billingForm.credits && billingForm.credits !== '') {
        data.credits = parseFloat(billingForm.credits)
        data.creditOperation = billingForm.creditOperation
      }
      if (billingForm.outboundRate !== '') {
        data.outboundRate = parseFloat(billingForm.outboundRate)
      }
      if (billingForm.inboundRate !== '') {
        data.inboundRate = parseFloat(billingForm.inboundRate)
      }

      if (Object.keys(data).length === 0) {
        setError('Please enter at least one field to update')
        setSaving(false)
        return
      }

      await usersAPI.updateBilling(editingUser.id, data)
      setSuccess('Billing updated successfully')
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
      await fetchAccounts()
      setTimeout(() => closeBillingModal(), 1000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update billing')
    } finally {
      setSaving(false)
    }
  }

  // Delete user handler
  const handleDeleteUser = async (account) => {
    if (!confirm(`Are you sure you want to delete "${account.name || account.email}"? This action cannot be undone.`)) return
    try {
      await usersAPI.delete(account.id)
      setSuccess(`User "${account.name || account.email}" deleted successfully`)
      setTimeout(() => setSuccess(''), 3000)
      await fetchAccounts()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user')
    }
  }

  // Create client/agency handlers
  const handleCreate = async (type) => {
    setCreating(true)
    setError('')
    try {
      if (type === 'client') {
        await usersAPI.createClient(formData)
      } else if (type === 'agency') {
        await usersAPI.createAgency(formData)
      }
      setShowModal(null)
      setFormData({})
      await fetchAccounts()
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed')
    } finally {
      setCreating(false)
    }
  }

  // Access restricted for CLIENT role
  if (user?.role === ROLES.CLIENT) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('subAccounts.accessRestricted')}</h3>
          <p className="text-gray-500 dark:text-gray-400">{t('subAccounts.onlyOwnersAgencies')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Impersonation Warning */}
      {isImpersonating && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-yellow-400">{t('subAccounts.impersonatingWarning')}</p>
        </div>
      )}

      {/* Error */}
      {error && !editingUser && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && !editingUser && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sidebar.accounts')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {user?.role === ROLES.OWNER
                ? t('allUsers.subtitle')
                : t('subAccounts.agencyDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(user?.role === ROLES.OWNER || user?.role === ROLES.AGENCY) && (
              <button
                onClick={() => { setShowModal('client'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboardContent.addClient')}
              </button>
            )}
            {user?.role === ROLES.OWNER && (
              <button
                onClick={() => { setShowModal('agency'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboardContent.addAgency')}
              </button>
            )}
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{accounts.length}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('allUsers.totalUsers')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder={t('allUsers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-2">
          {['all', ROLES.AGENCY, ROLES.CLIENT].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {f === 'all' ? t('common.all') : f === ROLES.AGENCY ? t('sidebar.agencies') : t('sidebar.clients')}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credits.user')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common.role')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credits.title')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('allUsers.outboundRate')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('allUsers.inboundRate')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credits.agency')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
                          {(account.name || account.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{account.name || 'Unnamed'}</span>
                            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">ID: {account.id}</span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{account.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(account.role)}`}>
                        {account.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`font-medium ${getCreditColor(account.vapiCredits || 0)}`}>
                        ${(account.vapiCredits || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-gray-600 dark:text-gray-300">
                        ${(account.outboundRate || 0.10).toFixed(2)}/min
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-gray-600 dark:text-gray-300">
                        ${(account.inboundRate || 0.05).toFixed(2)}/min
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {account.agency ? (
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {account.agency.name || account.agency.email}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {account.id !== user?.id && (
                          <button
                            onClick={() => handleSwitch(account)}
                            disabled={switching === account.id}
                            className="px-3 py-1.5 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {switching === account.id ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 dark:border-gray-300"></div>
                                {t('common.switching')}
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                </svg>
                                {t('common.accessAccount')}
                              </>
                            )}
                          </button>
                        )}
                        {(user?.role === ROLES.OWNER || (user?.role === ROLES.AGENCY && account.agencyId === user?.id)) && (
                          <button
                            onClick={() => openBillingModal(account)}
                            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                          >
                            {t('common.manageBilling')}
                          </button>
                        )}
                        {account.id !== user?.id && (user?.role === ROLES.OWNER || (user?.role === ROLES.AGENCY && account.agencyId === user?.id)) && (
                          <button
                            onClick={() => handleDeleteUser(account)}
                            className="px-3 py-1.5 text-red-500 text-sm rounded-lg hover:bg-red-500/10 transition-colors"
                            title="Delete user"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredAccounts.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {search ? t('subAccounts.noMatchingAccounts') : t('credits.noUsersFound')}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search ? t('subAccounts.adjustSearch') : t('subAccounts.noCreatedYet')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Billing Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('common.manageBilling')}
              </h3>
              <button
                onClick={closeBillingModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User info */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                  {(editingUser.name || editingUser.email)[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{editingUser.name || 'Unnamed'}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{editingUser.email}</div>
                </div>
              </div>
              <div className="mt-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('allUsers.currentCredits')} </span>
                <span className="font-medium text-gray-900 dark:text-white">${(editingUser.vapiCredits || 0).toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            <form onSubmit={handleBillingSubmit} className="space-y-4">
              {/* Credits Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('allUsers.creditsAdjustment')}
                </label>
                <div className="flex gap-2">
                  <select
                    value={billingForm.creditOperation}
                    onChange={(e) => setBillingForm({ ...billingForm, creditOperation: e.target.value })}
                    className="px-3 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="add">{t('allUsers.add')}</option>
                    <option value="subtract">{t('allUsers.subtract')}</option>
                    <option value="set">{t('allUsers.setTo')}</option>
                  </select>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billingForm.credits}
                      onChange={(e) => setBillingForm({ ...billingForm, credits: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Rates Section */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('allUsers.outboundRateLabel')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billingForm.outboundRate}
                      onChange={(e) => setBillingForm({ ...billingForm, outboundRate: e.target.value })}
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('allUsers.inboundRateLabel')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billingForm.inboundRate}
                      onChange={(e) => setBillingForm({ ...billingForm, inboundRate: e.target.value })}
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeBillingModal}
                  className="flex-1 px-4 py-2 border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('common.saving')}
                    </>
                  ) : (
                    t('common.saveChanges')
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Client Modal */}
      {showModal === 'client' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboardContent.addNewClient')}</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate('client'); }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')} *</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.password')} *</label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {creating ? t('common.creating') : t('dashboardContent.addClient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Agency Modal */}
      {showModal === 'agency' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboardContent.addNewAgency')}</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate('agency'); }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')} *</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.password')} *</label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {creating ? t('common.creating') : t('dashboardContent.addAgency')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
