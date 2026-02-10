import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { authAPI } from '../../services/api'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

export default function SubAccounts() {
  const { user, switchAccount, isImpersonating } = useAuth()
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(null)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    fetchAccounts()
  }, [])

  const fetchAccounts = async () => {
    setLoading(true)
    try {
      const response = await authAPI.getAccessibleAccounts()
      setAccounts(response.data.accounts)
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
      // Page will update automatically due to context change
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

  // Filter and search accounts
  const filteredAccounts = accounts.filter(account => {
    const matchesFilter = filter === 'all' || account.role === filter
    const matchesSearch = !search ||
      account.email.toLowerCase().includes(search.toLowerCase()) ||
      (account.name && account.name.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesSearch
  })

  // Group accounts by role for better organization
  const agencies = filteredAccounts.filter(a => a.role === ROLES.AGENCY)
  const clients = filteredAccounts.filter(a => a.role === ROLES.CLIENT)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (user?.role === ROLES.CLIENT) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('subAccounts.accessRestricted')}</h3>
        <p className="text-gray-500 dark:text-gray-400">
          {t('subAccounts.onlyOwnersAgencies')}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      {isImpersonating && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-yellow-400">
            {t('subAccounts.impersonatingWarning')}
          </p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
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
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('subAccounts.title')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {user?.role === ROLES.OWNER
                ? t('subAccounts.ownerDesc')
                : t('subAccounts.agencyDesc')}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{accounts.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">{t('subAccounts.accessibleAccounts')}</div>
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
        {user?.role === ROLES.OWNER && (
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === 'all'
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {t('common.all')}
            </button>
            <button
              onClick={() => setFilter(ROLES.AGENCY)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === ROLES.AGENCY
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {t('sidebar.agencies')}
            </button>
            <button
              onClick={() => setFilter(ROLES.CLIENT)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === ROLES.CLIENT
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {t('sidebar.clients')}
            </button>
          </div>
        )}
      </div>

      {/* Accounts List */}
      {filteredAccounts.length === 0 ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {search ? t('subAccounts.noMatchingAccounts') : t('subAccounts.noAccountsAvailable')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400">
            {search
              ? t('subAccounts.adjustSearch')
              : user?.role === ROLES.AGENCY
                ? t('subAccounts.createClients')
                : t('subAccounts.noCreatedYet')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Agencies Section (Owner only) */}
          {user?.role === ROLES.OWNER && agencies.length > 0 && (filter === 'all' || filter === ROLES.AGENCY) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('sidebar.agencies')} ({agencies.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {agencies.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onSwitch={handleSwitch}
                    switching={switching}
                    getRoleBadgeColor={getRoleBadgeColor}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Clients Section */}
          {clients.length > 0 && (filter === 'all' || filter === ROLES.CLIENT) && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                {t('sidebar.clients')} ({clients.length})
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {clients.map((account) => (
                  <AccountCard
                    key={account.id}
                    account={account}
                    onSwitch={handleSwitch}
                    switching={switching}
                    getRoleBadgeColor={getRoleBadgeColor}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AccountCard({ account, onSwitch, switching, getRoleBadgeColor }) {
  const { t } = useLanguage()
  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 hover:border-primary-500/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
            {(account.name || account.email)[0].toUpperCase()}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-gray-900 dark:text-white">
                {account.name || 'Unnamed'}
              </h4>
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">ID: {account.id}</span>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{account.email}</p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(account.role)}`}>
          {account.role}
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-4 mb-4 text-sm">
        <div>
          <span className="text-gray-500 dark:text-gray-400">{t('subAccounts.agents')}</span>
          <span className="font-medium text-gray-900 dark:text-white">{account._count?.agents || 0}</span>
        </div>
        {account._count?.clients !== undefined && (
          <div>
            <span className="text-gray-500 dark:text-gray-400">{t('subAccounts.clientsLabel')}</span>
            <span className="font-medium text-gray-900 dark:text-white">{account._count.clients}</span>
          </div>
        )}
      </div>

      {/* Agency info for clients */}
      {account.agency && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          Agency: <span className="text-gray-700 dark:text-gray-300">{account.agency.name || account.agency.email}</span>
        </div>
      )}

      <button
        onClick={() => onSwitch(account)}
        disabled={switching === account.id}
        className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
      >
        {switching === account.id ? (
          <>
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            {t('common.switching')}
          </>
        ) : (
          <>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
            </svg>
            {t('common.accessAccount')}
          </>
        )}
      </button>
    </div>
  )
}
