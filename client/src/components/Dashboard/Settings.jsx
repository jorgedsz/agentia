import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ghlAPI, calendarAPI, teamMembersAPI, platformSettingsAPI, accountSettingsAPI, brandingAPI, vapiKeyPoolAPI, complianceAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

const TEAM_ROLES = {
  ADMIN: 'admin',
  USER: 'user'
}

// Settings menu items
const SETTINGS_ITEMS = [
  {
    id: 'team',
    label: 'settings.teamAccess',
    description: 'settings.teamAccessDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'calendars',
    label: 'settings.calendars',
    description: 'settings.calendarsDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'api-keys',
    label: 'settings.apiKeys',
    description: 'settings.apiKeysDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'billing',
    label: 'settings.billing',
    description: 'settings.billingDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'branding',
    label: 'settings.branding',
    description: 'settings.brandingDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'vapi-pool',
    label: 'settings.vapiPool',
    description: 'settings.vapiPoolDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
      </svg>
    ),
    roles: [ROLES.OWNER]
  },
  {
    id: 'slack',
    label: 'settings.slack',
    description: 'settings.slackDesc',
    icon: (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"/>
      </svg>
    ),
    roles: [ROLES.OWNER]
  },
  {
    id: 'compliance',
    label: 'settings.compliance',
    description: 'settings.complianceDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY]
  },
  {
    id: 'account',
    label: 'settings.account',
    description: 'settings.accountDesc',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  }
]

export default function Settings() {
  const [searchParams] = useSearchParams()
  const { user } = useAuth()
  const { t } = useLanguage()
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabParam === 'ghl' ? 'calendars' : (tabParam || 'team'))
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const isOwner = user?.role === ROLES.OWNER

  // Filter menu items based on user role
  const visibleItems = SETTINGS_ITEMS.filter(item =>
    item.roles.includes(user?.role)
  )

  const activeItem = visibleItems.find(item => item.id === activeTab)

  return (
    <div className="flex flex-col lg:flex-row gap-6 min-h-[calc(100vh-200px)]">
      {/* Mobile: Dropdown selector */}
      <div className="lg:hidden">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('settings.title')}
          </label>
          <div className="relative">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
            >
              {visibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(item.label)}
                </option>
              ))}
            </select>
            <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
          {activeItem && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{t(activeItem.description)}</p>
          )}
        </div>
      </div>

      {/* Desktop: Settings Sidebar */}
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-72'}`}>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden sticky top-6">
          <div className={`flex items-center justify-between border-b border-gray-200 dark:border-dark-border ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
            {!sidebarCollapsed && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.title')}</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('settings.manageAccount')}</p>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}
              title={sidebarCollapsed ? t('settings.expandSidebar') : t('settings.collapseSidebar')}
            >
              <svg className={`w-5 h-5 transition-transform duration-300 ${sidebarCollapsed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <nav className="p-2">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={sidebarCollapsed ? t(item.label) : undefined}
                className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-colors ${
                  activeTab === item.id
                    ? 'bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400'
                    : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
                } ${sidebarCollapsed ? 'justify-center' : ''}`}
              >
                <div className={`${sidebarCollapsed ? '' : 'mt-0.5'} ${activeTab === item.id ? 'text-primary-500' : 'text-gray-400'}`}>
                  {item.icon}
                </div>
                {!sidebarCollapsed && (
                  <div>
                    <div className={`font-medium text-sm ${activeTab === item.id ? 'text-primary-600 dark:text-primary-400' : ''}`}>
                      {t(item.label)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {t(item.description)}
                    </div>
                  </div>
                )}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 min-w-0">
        {activeTab === 'team' && <TeamAccessTab />}
        {activeTab === 'calendars' && <CalendarsTab />}
        {activeTab === 'ghl' && <CalendarsTab />}
        {activeTab === 'api-keys' && <APIKeysTab />}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'branding' && <BrandingTab />}
        {activeTab === 'vapi-pool' && isOwner && <VapiKeyPoolTab />}
        {activeTab === 'slack' && isOwner && <SlackTab />}
        {activeTab === 'compliance' && <ComplianceTab />}
        {activeTab === 'account' && <AccountTab />}
      </div>
    </div>
  )
}

// Billing Tab
function BillingTab() {
  const { user } = useAuth()
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('settings.billingTitle')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('settings.billingSubtitle')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('settings.outboundRate')}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              ${(user?.outboundRate ?? 0.10).toFixed(2)}<span className="text-sm font-normal text-gray-500">{t('settings.perMin')}</span>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">{t('settings.inboundRate')}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              ${(user?.inboundRate ?? 0.05).toFixed(2)}<span className="text-sm font-normal text-gray-500">{t('settings.perMin')}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">{t('settings.billingInfoTitle')}</p>
              <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                {t('settings.billingInfoDesc')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Account Tab
function AccountTab() {
  const { user } = useAuth()
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('settings.accountInfo')}</h2>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl font-medium">
            {(user?.name || user?.email)?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name || t('settings.unnamedUser')}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">{user?.email}</div>
            <span className={`inline-block mt-1 px-2 py-0.5 text-xs font-medium rounded-full ${
              user?.role === ROLES.OWNER
                ? 'bg-purple-500/20 text-purple-400'
                : user?.role === ROLES.AGENCY
                  ? 'bg-blue-500/20 text-blue-400'
                  : 'bg-green-500/20 text-green-400'
            }`}>
              {user?.role}
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex justify-between py-3 border-b border-gray-200 dark:border-dark-border">
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('settings.accountId')}</span>
            <span className="text-sm font-mono text-gray-900 dark:text-white">{user?.id}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-gray-200 dark:border-dark-border">
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('settings.memberSince')}</span>
            <span className="text-sm text-gray-900 dark:text-white">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">{t('settings.creditsBalance')}</span>
            <span className="text-sm font-medium text-green-500">${(user?.vapiCredits ?? 0).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// Branding Tab
function BrandingTab() {
  const { user, refreshUser } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [branding, setBranding] = useState({
    companyName: '',
    companyLogo: '',
    companyTagline: ''
  })
  const [canEdit, setCanEdit] = useState(false)
  const [inheritedFrom, setInheritedFrom] = useState(null)

  useEffect(() => {
    fetchBranding()
  }, [])

  const fetchBranding = async () => {
    setLoading(true)
    try {
      const { data } = await brandingAPI.get()
      setBranding({
        companyName: data.companyName || '',
        companyLogo: data.companyLogo || '',
        companyTagline: data.companyTagline || ''
      })
      setCanEdit(data.canEdit)
      setInheritedFrom(data.inheritedFrom || null)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load branding')
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
      const { data } = await brandingAPI.update(branding)
      setBranding({
        companyName: data.companyName || '',
        companyLogo: data.companyLogo || '',
        companyTagline: data.companyTagline || ''
      })
      setSuccess('Branding updated successfully')
      if (refreshUser) refreshUser()
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update branding')
    } finally {
      setSaving(false)
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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Branding</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Customize your platform appearance with your company logo and name.
        </p>
      </div>

      {!canEdit && (
        <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">View Only</p>
              <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
                {inheritedFrom === 'agency'
                  ? 'This branding is set by your agency. Contact them to make changes.'
                  : 'Only account owners and agencies can customize branding.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Preview */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Preview</h3>
        <div className="bg-gray-100 dark:bg-dark-hover rounded-lg p-4 max-w-xs">
          <div className="flex items-center gap-3">
            {branding.companyLogo ? (
              <img
                src={branding.companyLogo}
                alt="Company logo"
                className="w-10 h-10 rounded-lg object-contain bg-white"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-primary-600 flex items-center justify-center text-white font-bold text-lg">
                {(branding.companyName || 'A')[0].toUpperCase()}
              </div>
            )}
            <div>
              <h1 className="text-lg font-bold text-primary-600 dark:text-primary-400">
                {branding.companyName || 'Appex Innovations AI'}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {branding.companyTagline || 'AI Voice Platform'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSave} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Settings</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Company Name
            </label>
            <input
              type="text"
              value={branding.companyName}
              onChange={(e) => setBranding({ ...branding, companyName: e.target.value })}
              disabled={!canEdit}
              placeholder="Appex Innovations AI"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tagline
            </label>
            <input
              type="text"
              value={branding.companyTagline}
              onChange={(e) => setBranding({ ...branding, companyTagline: e.target.value })}
              disabled={!canEdit}
              placeholder="AI Voice Platform"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Logo URL
            </label>
            <input
              type="url"
              value={branding.companyLogo}
              onChange={(e) => setBranding({ ...branding, companyLogo: e.target.value })}
              disabled={!canEdit}
              placeholder="https://example.com/logo.png"
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Enter a URL to your company logo. Recommended size: 40x40px or larger square image.
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="mt-6">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        )}
      </form>
    </div>
  )
}

// Team Access Tab
function TeamAccessTab() {
  const { isTeamMember, teamMember } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingMember, setEditingMember] = useState(null)
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    teamRole: TEAM_ROLES.USER
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchMembers()
  }, [])

  const fetchMembers = async () => {
    setLoading(true)
    try {
      const response = await teamMembersAPI.list()
      setMembers(response.data.teamMembers)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load team members')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      if (editingMember) {
        const updateData = { name: formData.name, teamRole: formData.teamRole }
        if (formData.password) {
          updateData.password = formData.password
        }
        await teamMembersAPI.update(editingMember.id, updateData)
        setSuccess('Team member updated successfully')
      } else {
        await teamMembersAPI.create(formData)
        setSuccess('Team member created successfully')
      }
      setShowModal(false)
      setEditingMember(null)
      setFormData({ email: '', password: '', name: '', teamRole: TEAM_ROLES.USER })
      await fetchMembers()
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = (member) => {
    setEditingMember(member)
    setFormData({
      email: member.email,
      password: '',
      name: member.name || '',
      teamRole: member.teamRole
    })
    setError('')
    setShowModal(true)
  }

  const handleToggleActive = async (member) => {
    try {
      await teamMembersAPI.update(member.id, { isActive: !member.isActive })
      setSuccess(`Team member ${member.isActive ? 'deactivated' : 'activated'}`)
      await fetchMembers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update status')
    }
  }

  const handleDelete = async (member) => {
    if (!confirm(`Are you sure you want to delete ${member.name || member.email}? This cannot be undone.`)) {
      return
    }

    try {
      await teamMembersAPI.delete(member.id)
      setSuccess('Team member deleted')
      await fetchMembers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete team member')
    }
  }

  const getRoleBadgeColor = (role) => {
    return role === TEAM_ROLES.ADMIN
      ? 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
  }

  if (isTeamMember) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 text-yellow-500">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm">
            You are logged in as a team member ({teamMember?.teamRole}).
            Only account owners can manage team access.
          </p>
        </div>
      </div>
    )
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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Team Access</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Create team members who can access your account with different permission levels.
            </p>
          </div>
          <button
            onClick={() => {
              setEditingMember(null)
              setFormData({ email: '', password: '', name: '', teamRole: TEAM_ROLES.USER })
              setError('')
              setShowModal(true)
            }}
            className="w-full sm:w-auto px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Member
          </button>
        </div>
      </div>

      {/* Team Members List */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        {members.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Team Members Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Add team members to give others access to your account.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {members.map((member) => (
              <div key={member.id} className="p-4 hover:bg-gray-50 dark:hover:bg-dark-hover">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  {/* Member Info */}
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium flex-shrink-0">
                      {(member.name || member.email)[0].toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-gray-900 dark:text-white truncate">{member.name || 'Unnamed'}</div>
                      <div className="text-sm text-gray-500 dark:text-gray-400 truncate">{member.email}</div>
                    </div>
                  </div>

                  {/* Badges and Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ml-13 sm:ml-0">
                    {/* Badges */}
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(member.teamRole)}`}>
                        {member.teamRole}
                      </span>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        member.isActive ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'
                      }`}>
                        {member.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 sm:gap-2">
                      <button onClick={() => handleEdit(member)} className="text-primary-500 hover:text-primary-600 text-sm">
                        Edit
                      </button>
                      <button
                        onClick={() => handleToggleActive(member)}
                        className={`text-sm ${member.isActive ? 'text-yellow-500 hover:text-yellow-600' : 'text-green-500 hover:text-green-600'}`}
                      >
                        {member.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => handleDelete(member)} className="text-red-500 hover:text-red-600 text-sm">
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full border border-gray-200 dark:border-dark-border">
            <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {editingMember ? 'Edit Team Member' : 'Add Team Member'}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email *</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  disabled={!!editingMember}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                  required={!editingMember}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {editingMember ? 'New Password (leave blank to keep current)' : 'Password *'}
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required={!editingMember}
                  minLength={6}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Role *</label>
                <select
                  value={formData.teamRole}
                  onChange={(e) => setFormData({ ...formData, teamRole: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value={TEAM_ROLES.USER}>User - Limited access</option>
                  <option value={TEAM_ROLES.ADMIN}>Admin - Full access</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {saving ? 'Saving...' : editingMember ? 'Update' : 'Create'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// Calendars Tab (Multi-Provider)
function CalendarsTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [integrations, setIntegrations] = useState([])
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [calcomApiKey, setCalcomApiKey] = useState('')
  const [savingCalcom, setSavingCalcom] = useState(false)

  // GHL state
  const [ghlStatus, setGhlStatus] = useState(null)
  const [ghlConnectMode, setGhlConnectMode] = useState('oauth') // 'oauth' or 'bearer'
  const [ghlBearerToken, setGhlBearerToken] = useState('')
  const [ghlLocationId, setGhlLocationId] = useState('')
  const [showLocationId, setShowLocationId] = useState(false)
  const [savingGhlBearer, setSavingGhlBearer] = useState(false)

  const PROVIDERS = [
    { id: 'google', name: 'Google Calendar', type: 'oauth', multiAccount: true, color: 'blue',
      description: 'Connect your Google Calendar to check availability and book appointments.' },
    { id: 'ghl', name: 'GoHighLevel', type: 'legacy', multiAccount: true, color: 'green',
      description: 'Connect your GoHighLevel account for calendar booking features.' },
    { id: 'calendly', name: 'Calendly', type: 'oauth', multiAccount: false, color: 'blue',
      description: 'Connect Calendly to use your event types for scheduling.' },
    { id: 'hubspot', name: 'HubSpot', type: 'oauth', multiAccount: false, color: 'orange',
      description: 'Connect HubSpot meetings for scheduling and booking.' },
    { id: 'calcom', name: 'Cal.com', type: 'apikey', multiAccount: false, color: 'purple',
      description: 'Connect Cal.com with your API key for scheduling.' }
  ]

  useEffect(() => {
    const calendarConnected = searchParams.get('calendar_connected')
    const calendarError = searchParams.get('calendar_error')
    const ghlConnected = searchParams.get('ghl_connected')
    const ghlError = searchParams.get('ghl_error')

    if (calendarConnected) setSuccess(`${calendarConnected} connected successfully!`)
    if (calendarError) setError(decodeURIComponent(calendarError))
    if (ghlConnected === 'true') setSuccess('GoHighLevel connected successfully!')
    if (ghlError) setError(decodeURIComponent(ghlError))

    if (calendarConnected || calendarError || ghlConnected || ghlError) {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('calendar_connected')
      newParams.delete('calendar_error')
      newParams.delete('ghl_connected')
      newParams.delete('ghl_error')
      setSearchParams(newParams, { replace: true })
    }

    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [integrationsRes, ghlRes] = await Promise.all([
        calendarAPI.listIntegrations().catch(() => ({ data: { integrations: [] } })),
        ghlAPI.getStatus().catch(() => ({ data: null }))
      ])
      setIntegrations(integrationsRes.data.integrations || [])
      setGhlStatus(ghlRes.data)
    } catch (err) {
      setError('Failed to load integrations')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthConnect = async (providerId) => {
    setError('')
    setConnecting(providerId)
    try {
      const response = await calendarAPI.getOAuthUrl(providerId)
      window.location.href = response.data.authorizationUrl
    } catch (err) {
      setError(err.response?.data?.error || `Failed to start ${providerId} OAuth flow`)
      setConnecting('')
    }
  }

  const handleGHLOAuthConnect = async () => {
    setError('')
    setConnecting('ghl')
    try {
      // Try unified calendar OAuth first, fall back to legacy
      try {
        const response = await calendarAPI.getOAuthUrl('ghl')
        window.location.href = response.data.authorizationUrl
      } catch {
        const response = await ghlAPI.getAuthUrl()
        window.location.href = response.data.authorizationUrl
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start GHL OAuth flow')
      setConnecting('')
    }
  }

  const handleGHLBearerConnect = async () => {
    if (!ghlBearerToken.trim()) return
    setError('')
    setSavingGhlBearer(true)
    try {
      const payload = { privateToken: ghlBearerToken.trim() }
      if (showLocationId && ghlLocationId.trim()) {
        payload.locationId = ghlLocationId.trim()
      }
      await calendarAPI.connectProvider('ghl', payload)
      setSuccess('GoHighLevel connected successfully!')
      setGhlBearerToken('')
      setGhlLocationId('')
      setShowLocationId(false)
      await fetchData()
    } catch (err) {
      const errData = err.response?.data
      if (errData?.needsLocationId) {
        setShowLocationId(true)
        setError(errData.error)
      } else {
        setError(errData?.error || 'Failed to connect GoHighLevel')
      }
    } finally {
      setSavingGhlBearer(false)
    }
  }

  const handleCalcomConnect = async () => {
    if (!calcomApiKey.trim()) return
    setError('')
    setSavingCalcom(true)
    try {
      await calendarAPI.connectProvider('calcom', { apiKey: calcomApiKey.trim() })
      setSuccess('Cal.com connected successfully!')
      setCalcomApiKey('')
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to connect Cal.com')
    } finally {
      setSavingCalcom(false)
    }
  }

  const handleDisconnect = async (integration) => {
    if (!confirm(`Are you sure you want to disconnect ${integration.accountLabel || integration.provider}?`)) return
    setError('')
    try {
      await calendarAPI.disconnectIntegration(integration.id)
      setSuccess(`${integration.accountLabel || integration.provider} disconnected`)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect')
    }
  }

  const handleGHLDisconnect = async () => {
    if (!confirm('Disconnect GoHighLevel? Calendar features will stop working for agents using GHL.')) return
    try {
      await ghlAPI.disconnect()
      setSuccess('GoHighLevel disconnected')
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect GHL')
    }
  }

  const getProviderIntegrations = (providerId) => {
    return integrations.filter(i => i.provider === providerId && i.isConnected)
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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Calendar Integrations</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Connect your calendar providers to enable booking features in your AI agents.
        </p>
      </div>

      {/* GoHighLevel */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">GoHighLevel</h3>
              {(ghlStatus?.isConnected || getProviderIntegrations('ghl').length > 0) && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
                  {(ghlStatus?.isConnected ? 1 : 0) + getProviderIntegrations('ghl').length} Connected
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connect your GoHighLevel accounts for calendar booking features.
            </p>
          </div>
        </div>

        {/* Connected accounts list */}
        {(ghlStatus?.isConnected || getProviderIntegrations('ghl').length > 0) && (
          <div className="space-y-2 mb-4">
            {/* Legacy GHLIntegration account */}
            {ghlStatus?.isConnected && (
              <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-700 dark:text-green-300">
                    {ghlStatus.locationName || 'GoHighLevel'}
                    {ghlStatus.connectionType === 'legacy' && <span className="text-yellow-600 ml-1">(PIT)</span>}
                    {ghlStatus.connectionType === 'oauth' && <span className="text-blue-500 ml-1">(OAuth)</span>}
                  </span>
                </div>
                <button onClick={handleGHLDisconnect} className="text-xs text-red-500 hover:text-red-600">Disconnect</button>
              </div>
            )}
            {/* CalendarIntegration GHL accounts */}
            {getProviderIntegrations('ghl').map(integration => {
              const meta = integration.metadata ? JSON.parse(integration.metadata) : {}
              return (
                <div key={integration.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm text-green-700 dark:text-green-300">
                      {integration.accountLabel || integration.externalAccountId}
                      {meta.connectionType === 'bearer' && <span className="text-yellow-600 ml-1">(PIT)</span>}
                      {meta.connectionType === 'oauth' && <span className="text-blue-500 ml-1">(OAuth)</span>}
                    </span>
                  </div>
                  <button onClick={() => handleDisconnect(integration)} className="text-xs text-red-500 hover:text-red-600">Disconnect</button>
                </div>
              )
            })}
          </div>
        )}

        {/* Add account controls */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setGhlConnectMode('oauth')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${ghlConnectMode === 'oauth' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-border'}`}
            >
              OAuth
            </button>
            <button
              onClick={() => setGhlConnectMode('bearer')}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${ghlConnectMode === 'bearer' ? 'bg-primary-600 text-white' : 'bg-gray-100 dark:bg-dark-hover text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-dark-border'}`}
            >
              Bearer Token (PIT)
            </button>
          </div>

          {ghlConnectMode === 'oauth' ? (
            <button
              onClick={handleGHLOAuthConnect}
              disabled={connecting === 'ghl'}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
            >
              {connecting === 'ghl' ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Redirecting...
                </>
              ) : (
                (ghlStatus?.isConnected || getProviderIntegrations('ghl').length > 0) ? 'Add Another GHL Account' : 'Connect with GoHighLevel'
              )}
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Paste your Private Integration Token from GHL Settings &gt; Integrations &gt; Private Integrations.
              </p>
              <input
                type="password"
                value={ghlBearerToken}
                onChange={(e) => setGhlBearerToken(e.target.value)}
                placeholder="pit-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 bg-white dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400"
              />
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="ghl-location-id"
                  checked={showLocationId}
                  onChange={(e) => setShowLocationId(e.target.checked)}
                  className="rounded border-gray-300 dark:border-dark-border text-primary-600 focus:ring-primary-500"
                />
                <label htmlFor="ghl-location-id" className="text-xs text-gray-500 dark:text-gray-400">
                  Provide Location ID manually
                </label>
              </div>
              {showLocationId && (
                <input
                  type="text"
                  value={ghlLocationId}
                  onChange={(e) => setGhlLocationId(e.target.value)}
                  placeholder="Location ID"
                  className="w-full px-3 py-2 bg-white dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-900 dark:text-white placeholder-gray-400"
                />
              )}
              <button
                onClick={handleGHLBearerConnect}
                disabled={savingGhlBearer || !ghlBearerToken.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
              >
                {savingGhlBearer ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Connecting...
                  </>
                ) : (
                  (ghlStatus?.isConnected || getProviderIntegrations('ghl').length > 0) ? 'Add Another GHL Account' : 'Connect with Bearer Token'
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Google Calendar */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">Google Calendar</h3>
              {getProviderIntegrations('google').length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
                  {getProviderIntegrations('google').length} Connected
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 ml-9">
              Connect your Google Calendar to check availability and book appointments.
            </p>
          </div>
        </div>

        {/* Connected accounts */}
        {getProviderIntegrations('google').length > 0 && (
          <div className="space-y-2 mb-4">
            {getProviderIntegrations('google').map(integration => (
              <div key={integration.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="text-sm text-green-700 dark:text-green-300">{integration.accountLabel || integration.externalAccountId}</span>
                </div>
                <button onClick={() => handleDisconnect(integration)} className="text-xs text-red-500 hover:text-red-600">Disconnect</button>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => handleOAuthConnect('google')}
          disabled={connecting === 'google'}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
        >
          {connecting === 'google' ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Redirecting...
            </>
          ) : (
            getProviderIntegrations('google').length > 0 ? 'Add Another Google Account' : 'Connect Google Calendar'
          )}
        </button>
      </div>

      {/* Calendly */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="11" fill="#006BFF"/>
                <path d="M15.9 9.2c-.4-.7-1-1.2-1.7-1.5-.7-.3-1.5-.4-2.3-.2-.8.1-1.5.5-2 1.1-.6.6-.9 1.3-1 2.1-.1.8.1 1.6.4 2.3.4.7 1 1.2 1.7 1.5.7.3 1.5.4 2.3.2.5-.1 1-.3 1.4-.6l1.3 1.3c-.7.5-1.4.9-2.3 1.1-1.1.2-2.2.1-3.2-.4s-1.8-1.2-2.3-2.2c-.5-1-.7-2.1-.5-3.2.2-1.1.7-2 1.5-2.8.8-.8 1.7-1.3 2.8-1.5 1.1-.2 2.2 0 3.2.5s1.7 1.3 2.2 2.3l-1.5.7z" fill="white"/>
              </svg>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">Calendly</h3>
              {getProviderIntegrations('calendly').length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">Connected</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connect Calendly to use your event types for scheduling.
            </p>
          </div>
        </div>

        {getProviderIntegrations('calendly').length > 0 ? (
          <div className="space-y-3">
            {getProviderIntegrations('calendly').map(integration => (
              <div key={integration.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-700 dark:text-green-300">{integration.accountLabel}</span>
                </div>
                <button onClick={() => handleDisconnect(integration)} className="text-xs text-red-500 hover:text-red-600">Disconnect</button>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => handleOAuthConnect('calendly')}
            disabled={connecting === 'calendly'}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            {connecting === 'calendly' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Redirecting...
              </>
            ) : (
              'Connect Calendly'
            )}
          </button>
        )}
      </div>

      {/* HubSpot */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <path d="M17.5 8.2V5.8c.6-.3 1-.9 1-1.6 0-1-.8-1.8-1.8-1.8s-1.8.8-1.8 1.8c0 .7.4 1.3 1 1.6v2.4c-.9.2-1.7.6-2.3 1.2L7.5 5.3c0-.1.1-.3.1-.4 0-1.1-.9-2-2-2s-2 .9-2 2 .9 2 2 2c.4 0 .7-.1 1-.3l5.9 4c-.4.7-.6 1.5-.6 2.4 0 1.1.4 2.2 1.1 3l-1.3 1.3c-.2-.1-.4-.1-.6-.1-.8 0-1.5.7-1.5 1.5s.7 1.5 1.5 1.5 1.5-.7 1.5-1.5c0-.2 0-.4-.1-.6l1.3-1.3c.8.7 1.9 1.1 3 1.1 2.6 0 4.7-2.1 4.7-4.7 0-2.3-1.7-4.2-3.9-4.6zm-.7 7.5c-1.6 0-2.9-1.3-2.9-2.9s1.3-2.9 2.9-2.9 2.9 1.3 2.9 2.9-1.3 2.9-2.9 2.9z" fill="#FF7A59"/>
              </svg>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">HubSpot</h3>
              {getProviderIntegrations('hubspot').length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">Connected</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connect HubSpot meetings for scheduling and booking.
            </p>
          </div>
        </div>

        {getProviderIntegrations('hubspot').length > 0 ? (
          <div className="space-y-3">
            {getProviderIntegrations('hubspot').map(integration => (
              <div key={integration.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-700 dark:text-green-300">{integration.accountLabel}</span>
                </div>
                <button onClick={() => handleDisconnect(integration)} className="text-xs text-red-500 hover:text-red-600">Disconnect</button>
              </div>
            ))}
          </div>
        ) : (
          <button
            onClick={() => handleOAuthConnect('hubspot')}
            disabled={connecting === 'hubspot'}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm flex items-center gap-2"
          >
            {connecting === 'hubspot' ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Redirecting...
              </>
            ) : (
              'Connect HubSpot'
            )}
          </button>
        )}
      </div>

      {/* Cal.com */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                <rect width="24" height="24" rx="4" fill="#111827"/>
                <path d="M6 9.5C6 7.01 8.01 5 10.5 5h3C15.99 5 18 7.01 18 9.5v5c0 2.49-2.01 4.5-4.5 4.5h-3C8.01 19 6 16.99 6 14.5v-5z" stroke="white" strokeWidth="2"/>
              </svg>
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">Cal.com</h3>
              {getProviderIntegrations('calcom').length > 0 && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">Connected</span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connect Cal.com with your API key for scheduling.
            </p>
          </div>
        </div>

        {getProviderIntegrations('calcom').length > 0 ? (
          <div className="space-y-3">
            {getProviderIntegrations('calcom').map(integration => (
              <div key={integration.id} className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-green-700 dark:text-green-300">{integration.accountLabel}</span>
                </div>
                <button onClick={() => handleDisconnect(integration)} className="text-xs text-red-500 hover:text-red-600">Disconnect</button>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              <input
                type="password"
                value={calcomApiKey}
                onChange={(e) => setCalcomApiKey(e.target.value)}
                placeholder="Enter your Cal.com API key..."
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <button
                onClick={handleCalcomConnect}
                disabled={savingCalcom || !calcomApiKey.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm"
              >
                {savingCalcom ? 'Connecting...' : 'Connect'}
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Find your API key at cal.com/settings/developer/api-keys
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// GHL Integration Tab (kept for backward compatibility)
function GHLIntegrationTab() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    const ghlConnected = searchParams.get('ghl_connected')
    const ghlError = searchParams.get('ghl_error')

    if (ghlConnected === 'true') {
      setSuccess('GoHighLevel connected successfully via OAuth!')
    }
    if (ghlError) {
      setError(decodeURIComponent(ghlError))
    }

    if (ghlConnected || ghlError) {
      const newParams = new URLSearchParams(searchParams)
      newParams.delete('ghl_connected')
      newParams.delete('ghl_error')
      setSearchParams(newParams, { replace: true })
    }

    fetchStatus()
  }, [])

  const fetchStatus = async () => {
    setLoading(true)
    try {
      const response = await ghlAPI.getStatus()
      setStatus(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch integration status')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuthConnect = async () => {
    setError('')
    setConnecting(true)

    try {
      const response = await ghlAPI.getAuthUrl()
      window.location.href = response.data.authorizationUrl
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start OAuth flow')
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect GoHighLevel? Calendar features will stop working for your agents.')) {
      return
    }

    try {
      await ghlAPI.disconnect()
      setSuccess('GoHighLevel disconnected successfully')
      setStatus({ isConnected: false, connectionType: null, locationId: null, locationName: null })
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to disconnect')
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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">GoHighLevel Integration</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Connect your GoHighLevel account to enable calendar booking features in your AI agents.
            </p>
          </div>
          {status?.isConnected && (
            <span className="px-3 py-1 bg-green-500/20 text-green-400 text-sm font-medium rounded-full">
              Connected
            </span>
          )}
        </div>
      </div>

      {status?.isConnected ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Connection Details</h3>

          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-200 dark:border-dark-border">
              <div>
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Location</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{status.locationName || 'Unknown'}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Location ID</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{status.locationId}</p>
              </div>
            </div>

            {status.connectionType === 'legacy' && (
              <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-yellow-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-700 dark:text-yellow-400">Legacy Connection</p>
                    <p className="text-sm text-yellow-600 dark:text-yellow-300 mt-1">
                      You're using a Private Integration Token. We recommend upgrading to OAuth for better security.
                    </p>
                    <button
                      onClick={handleOAuthConnect}
                      disabled={connecting}
                      className="mt-2 px-3 py-1.5 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 disabled:opacity-50"
                    >
                      {connecting ? 'Redirecting...' : 'Upgrade to OAuth'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            <button
              onClick={handleDisconnect}
              className="w-full px-4 py-2 border border-red-300 dark:border-red-500/30 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              Disconnect GoHighLevel
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white mb-4">Connect Your Account</h3>

          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4 mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Click the button below to securely connect your GoHighLevel account via OAuth.
            </p>
          </div>

          <button
            onClick={handleOAuthConnect}
            disabled={connecting}
            className="w-full px-4 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {connecting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                Redirecting...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                Connect with GoHighLevel
              </>
            )}
          </button>
        </div>
      )}
    </div>
  )
}

// API Keys Tab - Account VAPI Keys + Platform Keys (OWNER only)
function APIKeysTab() {
  const { user, isTeamMember, teamMember } = useAuth()
  const { t } = useLanguage()
  const isOwner = user?.role === ROLES.OWNER
  const canEditVapiKeys = !isTeamMember || teamMember?.teamRole === 'admin'

  // Account VAPI keys state
  const [acctLoading, setAcctLoading] = useState(true)
  const [acctSaving, setAcctSaving] = useState(false)
  const [acctError, setAcctError] = useState('')
  const [acctSuccess, setAcctSuccess] = useState('')
  const [acctVapiApiKey, setAcctVapiApiKey] = useState('')
  const [acctVapiPublicKey, setAcctVapiPublicKey] = useState('')
  const [acctHasVapi, setAcctHasVapi] = useState(false)
  const [acctHasVapiPublic, setAcctHasVapiPublic] = useState(false)
  const [acctMaskedVapi, setAcctMaskedVapi] = useState('')
  const [acctMaskedVapiPublic, setAcctMaskedVapiPublic] = useState('')

  // Trigger API key state
  const [triggerLoading, setTriggerLoading] = useState(true)
  const [triggerGenerating, setTriggerGenerating] = useState(false)
  const [hasTriggerKey, setHasTriggerKey] = useState(false)
  const [maskedTriggerKey, setMaskedTriggerKey] = useState('')
  const [newTriggerKey, setNewTriggerKey] = useState('')

  // Platform keys state (OWNER only)
  const [platLoading, setPlatLoading] = useState(true)
  const [platSaving, setPlatSaving] = useState(false)
  const [platError, setPlatError] = useState('')
  const [platSuccess, setPlatSuccess] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [elevenLabsApiKey, setElevenLabsApiKey] = useState('')
  const [hasOpenai, setHasOpenai] = useState(false)
  const [hasElevenLabs, setHasElevenLabs] = useState(false)
  const [maskedOpenai, setMaskedOpenai] = useState('')
  const [maskedElevenLabs, setMaskedElevenLabs] = useState('')

  useEffect(() => {
    if (isOwner && canEditVapiKeys) {
      fetchAccountKeys()
    }
    if (canEditVapiKeys) {
      fetchTriggerKey()
    }
    if (isOwner) fetchPlatformSettings()
  }, [])

  const fetchAccountKeys = async () => {
    setAcctLoading(true)
    try {
      const { data } = await accountSettingsAPI.getVapiKeys()
      setAcctHasVapi(data.hasVapi)
      setAcctHasVapiPublic(data.hasVapiPublicKey)
      setAcctMaskedVapi(data.vapiApiKey || '')
      setAcctMaskedVapiPublic(data.vapiPublicKey || '')
    } catch (err) {
      setAcctError(err.response?.data?.error || 'Failed to load VAPI keys')
    } finally {
      setAcctLoading(false)
    }
  }

  const fetchTriggerKey = async () => {
    setTriggerLoading(true)
    try {
      const { data } = await accountSettingsAPI.getTriggerKey()
      setHasTriggerKey(data.hasTriggerKey)
      setMaskedTriggerKey(data.triggerApiKey || '')
    } catch (err) {
      // silently fail — not critical
    } finally {
      setTriggerLoading(false)
    }
  }

  const handleGenerateTriggerKey = async () => {
    if (hasTriggerKey && !confirm(t('settings.triggerKeyReplaceConfirm'))) return
    setTriggerGenerating(true)
    setNewTriggerKey('')
    setAcctError('')
    setAcctSuccess('')
    try {
      const { data } = await accountSettingsAPI.generateTriggerKey()
      setNewTriggerKey(data.triggerApiKey)
      setHasTriggerKey(true)
      setMaskedTriggerKey('')  // will show new key instead
      setAcctSuccess(t('settings.triggerKeyGenerated'))
      setTimeout(() => setAcctSuccess(''), 5000)
    } catch (err) {
      setAcctError(err.response?.data?.error || 'Failed to generate trigger key')
    } finally {
      setTriggerGenerating(false)
    }
  }

  const fetchPlatformSettings = async () => {
    setPlatLoading(true)
    try {
      const { data } = await platformSettingsAPI.get()
      setHasOpenai(data.hasOpenai)
      setHasElevenLabs(data.hasElevenLabs)
      setMaskedOpenai(data.openaiApiKey || '')
      setMaskedElevenLabs(data.elevenLabsApiKey || '')
    } catch (err) {
      setPlatError(err.response?.data?.error || 'Failed to load platform settings')
    } finally {
      setPlatLoading(false)
    }
  }

  const handleAcctSave = async (field) => {
    setAcctError('')
    setAcctSuccess('')
    setAcctSaving(true)
    try {
      const payload = {}
      if (field === 'vapi') payload.vapiApiKey = acctVapiApiKey
      if (field === 'vapiPublic') payload.vapiPublicKey = acctVapiPublicKey
      const { data } = await accountSettingsAPI.updateVapiKeys(payload)
      setAcctHasVapi(data.hasVapi)
      setAcctHasVapiPublic(data.hasVapiPublicKey)
      setAcctMaskedVapi(data.vapiApiKey || '')
      setAcctMaskedVapiPublic(data.vapiPublicKey || '')
      setAcctVapiApiKey('')
      setAcctVapiPublicKey('')
      const fieldLabel = field === 'vapi' ? 'VAPI API' : 'VAPI Public'
      setAcctSuccess(`${fieldLabel} key updated successfully`)
      setTimeout(() => setAcctSuccess(''), 3000)
    } catch (err) {
      setAcctError(err.response?.data?.error || 'Failed to update VAPI key')
    } finally {
      setAcctSaving(false)
    }
  }

  const handleAcctRemove = async (field) => {
    const fieldLabel = field === 'vapi' ? 'VAPI API' : 'VAPI Public'
    if (!confirm(`Are you sure you want to remove the ${fieldLabel} key?`)) return
    setAcctError('')
    setAcctSuccess('')
    setAcctSaving(true)
    try {
      const payload = {}
      if (field === 'vapi') payload.vapiApiKey = ''
      if (field === 'vapiPublic') payload.vapiPublicKey = ''
      const { data } = await accountSettingsAPI.updateVapiKeys(payload)
      setAcctHasVapi(data.hasVapi)
      setAcctHasVapiPublic(data.hasVapiPublicKey)
      setAcctMaskedVapi(data.vapiApiKey || '')
      setAcctMaskedVapiPublic(data.vapiPublicKey || '')
      setAcctSuccess(`${fieldLabel} key removed`)
      setTimeout(() => setAcctSuccess(''), 3000)
    } catch (err) {
      setAcctError(err.response?.data?.error || 'Failed to remove key')
    } finally {
      setAcctSaving(false)
    }
  }

  const handlePlatSave = async (field) => {
    setPlatError('')
    setPlatSuccess('')
    setPlatSaving(true)
    try {
      const payload = {}
      if (field === 'openai') payload.openaiApiKey = openaiApiKey
      if (field === 'elevenLabs') payload.elevenLabsApiKey = elevenLabsApiKey
      const { data } = await platformSettingsAPI.update(payload)
      setHasOpenai(data.hasOpenai)
      setHasElevenLabs(data.hasElevenLabs)
      setMaskedOpenai(data.openaiApiKey || '')
      setMaskedElevenLabs(data.elevenLabsApiKey || '')
      setOpenaiApiKey('')
      setElevenLabsApiKey('')
      const fieldLabel = field === 'elevenLabs' ? 'ElevenLabs' : 'OpenAI'
      setPlatSuccess(`${fieldLabel} key updated successfully`)
      setTimeout(() => setPlatSuccess(''), 3000)
    } catch (err) {
      setPlatError(err.response?.data?.error || 'Failed to update settings')
    } finally {
      setPlatSaving(false)
    }
  }

  const handlePlatRemove = async (field) => {
    const fieldLabel = field === 'elevenLabs' ? 'ElevenLabs' : 'OpenAI'
    if (!confirm(`Are you sure you want to remove the ${fieldLabel} key?`)) return
    setPlatError('')
    setPlatSuccess('')
    setPlatSaving(true)
    try {
      const payload = {}
      if (field === 'openai') payload.openaiApiKey = ''
      if (field === 'elevenLabs') payload.elevenLabsApiKey = ''
      const { data } = await platformSettingsAPI.update(payload)
      setHasOpenai(data.hasOpenai)
      setHasElevenLabs(data.hasElevenLabs)
      setMaskedOpenai(data.openaiApiKey || '')
      setMaskedElevenLabs(data.elevenLabsApiKey || '')
      setPlatSuccess(`${fieldLabel} key removed`)
      setTimeout(() => setPlatSuccess(''), 3000)
    } catch (err) {
      setPlatError(err.response?.data?.error || 'Failed to remove key')
    } finally {
      setPlatSaving(false)
    }
  }

  const showLoading = (canEditVapiKeys && acctLoading) || (isOwner && platLoading)

  if (showLoading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Regular team members without admin access
  if (!canEditVapiKeys) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">{t('settings.apiKeysAdminOnly')}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ===== Account VAPI Keys Section (OWNER only) ===== */}
      {isOwner && (<>
      {acctError && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {acctError}
        </div>
      )}
      {acctSuccess && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
          {acctSuccess}
        </div>
      )}

      {/* Account VAPI Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.accountVapiKeys')}</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('settings.accountVapiKeysDesc')}
        </p>
      </div>

      {/* Account VAPI API Key */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white">{t('settings.vapiApiKey')}</h3>
          {acctHasVapi && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
              Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('settings.vapiApiKeyDesc')}
        </p>
        {acctHasVapi && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{acctMaskedVapi}</span>
            <button onClick={() => handleAcctRemove('vapi')} disabled={acctSaving} className="ml-auto text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
              {t('common.remove')}
            </button>
          </div>
        )}
        <div className="flex gap-3">
          <input
            type="password"
            value={acctVapiApiKey}
            onChange={(e) => setAcctVapiApiKey(e.target.value)}
            placeholder={acctHasVapi ? t('settings.enterNewKey') : t('settings.enterVapiKey')}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
          />
          <button
            onClick={() => handleAcctSave('vapi')}
            disabled={acctSaving || !acctVapiApiKey.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {acctSaving ? t('common.saving') : acctHasVapi ? t('common.update') : t('common.save')}
          </button>
        </div>
      </div>

      {/* Account VAPI Public Key */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white">{t('settings.vapiPublicKey')}</h3>
          {acctHasVapiPublic && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
              Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('settings.vapiPublicKeyDesc')}
        </p>
        {acctHasVapiPublic && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{acctMaskedVapiPublic}</span>
            <button onClick={() => handleAcctRemove('vapiPublic')} disabled={acctSaving} className="ml-auto text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
              {t('common.remove')}
            </button>
          </div>
        )}
        <div className="flex gap-3">
          <input
            type="password"
            value={acctVapiPublicKey}
            onChange={(e) => setAcctVapiPublicKey(e.target.value)}
            placeholder={acctHasVapiPublic ? t('settings.enterNewKey') : t('settings.enterVapiPublicKey')}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
          />
          <button
            onClick={() => handleAcctSave('vapiPublic')}
            disabled={acctSaving || !acctVapiPublicKey.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {acctSaving ? t('common.saving') : acctHasVapiPublic ? t('common.update') : t('common.save')}
          </button>
        </div>
      </div>
      </>)}

      {/* ===== Trigger API Key Section ===== */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white">{t('settings.triggerApiKey')}</h3>
          {hasTriggerKey && !newTriggerKey && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
              Active
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('settings.triggerApiKeyDesc')}
        </p>

        {triggerLoading ? (
          <div className="flex justify-center py-4">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            {hasTriggerKey && !newTriggerKey && maskedTriggerKey && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{maskedTriggerKey}</span>
              </div>
            )}

            {newTriggerKey && (
              <div className="mb-4 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <p className="text-sm font-medium text-amber-400 mb-2">{t('settings.triggerKeyCopyWarning')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 text-sm font-mono text-gray-900 dark:text-white bg-gray-100 dark:bg-dark-bg px-3 py-2 rounded break-all select-all">
                    {newTriggerKey}
                  </code>
                  <button
                    onClick={() => { navigator.clipboard.writeText(newTriggerKey) }}
                    className="px-3 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium flex-shrink-0"
                  >
                    {t('common.copy')}
                  </button>
                </div>
              </div>
            )}

            <button
              onClick={handleGenerateTriggerKey}
              disabled={triggerGenerating}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
            >
              {triggerGenerating ? t('common.generating') : hasTriggerKey ? t('settings.regenerateTriggerKey') : t('settings.generateTriggerKey')}
            </button>
          </>
        )}
      </div>

      {/* ===== Platform API Keys Section (OWNER only) ===== */}
      {isOwner && (
        <>
          {platError && (
            <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
              {platError}
            </div>
          )}
          {platSuccess && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
              {platSuccess}
            </div>
          )}

          {/* Platform Keys Header */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mt-4">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.platformApiKeys')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('settings.platformApiKeysDesc')}
            </p>
          </div>

          {/* OpenAI API Key */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">{t('settings.openaiApiKey')}</h3>
              {hasOpenai && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
                  Connected
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.openaiApiKeyDesc')}
            </p>
            {hasOpenai && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{maskedOpenai}</span>
                <button onClick={() => handlePlatRemove('openai')} disabled={platSaving} className="ml-auto text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
                  {t('common.remove')}
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="password"
                value={openaiApiKey}
                onChange={(e) => setOpenaiApiKey(e.target.value)}
                placeholder={hasOpenai ? t('settings.enterNewKey') : t('settings.enterOpenaiKey')}
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <button
                onClick={() => handlePlatSave('openai')}
                disabled={platSaving || !openaiApiKey.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
              >
                {platSaving ? t('common.saving') : hasOpenai ? t('common.update') : t('common.save')}
              </button>
            </div>
          </div>

          {/* ElevenLabs API Key */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <div className="flex items-center gap-3 mb-4">
              <h3 className="text-md font-semibold text-gray-900 dark:text-white">{t('settings.elevenLabsApiKey')}</h3>
              {hasElevenLabs && (
                <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
                  Connected
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('settings.elevenLabsApiKeyDesc')}
            </p>
            {hasElevenLabs && (
              <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{maskedElevenLabs}</span>
                <button onClick={() => handlePlatRemove('elevenLabs')} disabled={platSaving} className="ml-auto text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
                  {t('common.remove')}
                </button>
              </div>
            )}
            <div className="flex gap-3">
              <input
                type="password"
                value={elevenLabsApiKey}
                onChange={(e) => setElevenLabsApiKey(e.target.value)}
                placeholder={hasElevenLabs ? t('settings.enterNewKey') : t('settings.enterElevenLabsKey')}
                className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
              />
              <button
                onClick={() => handlePlatSave('elevenLabs')}
                disabled={platSaving || !elevenLabsApiKey.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
              >
                {platSaving ? t('common.saving') : hasElevenLabs ? t('common.update') : t('common.save')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function VapiKeyPoolTab() {
  const [loading, setLoading] = useState(true)
  const [keys, setKeys] = useState([])
  const [total, setTotal] = useState(0)
  const [available, setAvailable] = useState(0)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', vapiApiKey: '', vapiPublicKey: '' })
  const { t } = useLanguage()

  useEffect(() => {
    fetchKeys()
  }, [])

  const fetchKeys = async () => {
    setLoading(true)
    try {
      const { data } = await vapiKeyPoolAPI.list()
      setKeys(data.keys)
      setTotal(data.total)
      setAvailable(data.available)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load key pool')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (e) => {
    e.preventDefault()
    if (!form.vapiApiKey || !form.vapiPublicKey) return
    setAdding(true)
    setError('')
    try {
      await vapiKeyPoolAPI.add(form)
      setForm({ label: '', vapiApiKey: '', vapiPublicKey: '' })
      setShowForm(false)
      setSuccess(t('settings.vapiPoolAdded'))
      setTimeout(() => setSuccess(''), 3000)
      fetchKeys()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to add key pair')
    } finally {
      setAdding(false)
    }
  }

  const handleRemove = async (id) => {
    if (!confirm(t('settings.vapiPoolRemoveConfirm'))) return
    setError('')
    try {
      await vapiKeyPoolAPI.remove(id)
      setSuccess(t('settings.vapiPoolRemoved'))
      setTimeout(() => setSuccess(''), 3000)
      fetchKeys()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove key pair')
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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('settings.vapiPoolTitle')}</h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">{t('settings.vapiPoolSubtitle')}</p>
          </div>
          {total > 0 && (
            <span className="px-3 py-1.5 bg-primary-50 dark:bg-primary-500/10 text-primary-600 dark:text-primary-400 text-sm font-medium rounded-full">
              {t('settings.vapiPoolAvailable', { available, total })}
            </span>
          )}
        </div>
      </div>

      {/* Keys Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">
            {t('settings.vapiPoolTitle')} ({total})
          </h3>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 text-sm font-medium"
          >
            {showForm ? '−' : '+'} {t('settings.vapiPoolAddKey')}
          </button>
        </div>

        {/* Add Form */}
        {showForm && (
          <form onSubmit={handleAdd} className="p-4 border-b border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-hover">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.vapiPoolLabel')}</label>
                <input
                  type="text"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder={t('settings.vapiPoolLabelPlaceholder')}
                  className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.vapiPoolPrivateKey')} *</label>
                <input
                  type="password"
                  value={form.vapiApiKey}
                  onChange={(e) => setForm({ ...form, vapiApiKey: e.target.value })}
                  placeholder={t('settings.vapiPoolPrivateKeyPlaceholder')}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t('settings.vapiPoolPublicKey')} *</label>
                <input
                  type="password"
                  value={form.vapiPublicKey}
                  onChange={(e) => setForm({ ...form, vapiPublicKey: e.target.value })}
                  placeholder={t('settings.vapiPoolPublicKeyPlaceholder')}
                  required
                  className="w-full px-3 py-2 bg-white dark:bg-dark-card border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end mt-3">
              <button
                type="submit"
                disabled={adding || !form.vapiApiKey || !form.vapiPublicKey}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
              >
                {adding ? '...' : t('settings.vapiPoolAddKey')}
              </button>
            </div>
          </form>
        )}

        {/* Keys List */}
        {keys.length === 0 ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">{t('settings.vapiPoolEmpty')}</h3>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{t('settings.vapiPoolEmptyDesc')}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-dark-border">
            {keys.map((key) => (
              <div key={key.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {key.label || `Key #${key.id}`}
                    </span>
                    {key.assignedUser ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
                        {t('settings.vapiPoolAssigned')}: {key.assignedUser.email}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400">
                        {t('settings.vapiPoolAvailableStatus')}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex gap-4 text-xs text-gray-500 dark:text-gray-400 font-mono">
                    <span>API: {key.maskedApiKey}</span>
                    <span>Public: {key.maskedPublicKey}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemove(key.id)}
                  disabled={!!key.assignedUserId}
                  title={key.assignedUserId ? t('settings.vapiPoolCannotRemoveAssigned') : t('settings.vapiPoolRemove')}
                  className="ml-4 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed bg-red-500/10 text-red-500 hover:bg-red-500/20"
                >
                  {t('settings.vapiPoolRemove')}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function SlackTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [hasSlackWebhook, setHasSlackWebhook] = useState(false)
  const [maskedUrl, setMaskedUrl] = useState('')
  const { t } = useLanguage()

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data } = await platformSettingsAPI.get()
      setHasSlackWebhook(data.hasSlackWebhook)
      setMaskedUrl(data.slackWebhookUrl || '')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const { data } = await platformSettingsAPI.update({ slackWebhookUrl: webhookUrl })
      setHasSlackWebhook(data.hasSlackWebhook)
      setMaskedUrl(data.slackWebhookUrl || '')
      setWebhookUrl('')
      setSuccess(t('settings.slackSaved'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save webhook')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async () => {
    if (!confirm(t('settings.slackRemoveConfirm'))) return
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      const { data } = await platformSettingsAPI.update({ slackWebhookUrl: '' })
      setHasSlackWebhook(data.hasSlackWebhook)
      setMaskedUrl(data.slackWebhookUrl || '')
      setSuccess(t('settings.slackRemoved'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove webhook')
    } finally {
      setSaving(false)
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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <svg className="w-6 h-6 text-primary-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.163 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.163 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.163 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zm0-1.27a2.527 2.527 0 0 1-2.52-2.523 2.527 2.527 0 0 1 2.52-2.52h6.315A2.528 2.528 0 0 1 24 15.163a2.528 2.528 0 0 1-2.522 2.523h-6.315z"/>
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('settings.slackTitle')}</h2>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.slackSubtitle')}</p>
      </div>

      {/* Webhook URL */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('settings.slackWebhookUrl')}</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('settings.slackWebhookHint')}</p>
          </div>
          {hasSlackWebhook && (
            <span className="px-2 py-1 bg-green-500/10 text-green-500 text-xs font-medium rounded-full">Active</span>
          )}
        </div>

        {hasSlackWebhook && (
          <div className="mb-4 flex items-center justify-between bg-gray-50 dark:bg-dark-hover p-3 rounded-lg">
            <code className="text-sm text-gray-600 dark:text-gray-300 font-mono">{maskedUrl}</code>
            <button
              onClick={handleRemove}
              disabled={saving}
              className="ml-3 px-3 py-1.5 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500/20 text-xs font-medium disabled:opacity-50"
            >
              {t('settings.slackRemove')}
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="password"
            value={webhookUrl}
            onChange={(e) => setWebhookUrl(e.target.value)}
            placeholder={hasSlackWebhook ? 'Enter new URL to replace...' : t('settings.slackWebhookPlaceholder')}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
          />
          <button
            onClick={handleSave}
            disabled={saving || !webhookUrl.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : hasSlackWebhook ? 'Update' : t('settings.slackSave')}
          </button>
        </div>
      </div>
    </div>
  )
}

function ComplianceTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeSection, setActiveSection] = useState('overview')
  const [settings, setSettings] = useState({
    hipaaEnabled: false,
    baaSignedDate: '',
    baaCounterparty: '',
    baaDocumentUrl: '',
    complianceOfficer: '',
    dataRetentionDays: 365,
    lastReviewDate: '',
    nextReviewDate: '',
    notes: ''
  })
  const [auditLogs, setAuditLogs] = useState([])
  const [auditPagination, setAuditPagination] = useState({ page: 1, totalPages: 1, total: 0 })
  const [auditFilter, setAuditFilter] = useState('')
  const [baaExpanded, setBaaExpanded] = useState(false)
  const [baaCopied, setBaaCopied] = useState(false)
  const { t } = useLanguage()

  useEffect(() => {
    fetchSettings()
  }, [])

  useEffect(() => {
    if (activeSection === 'audit') {
      fetchAuditLogs()
    }
  }, [activeSection, auditPagination.page, auditFilter])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data } = await complianceAPI.getSettings()
      setSettings({
        hipaaEnabled: data.hipaaEnabled || false,
        baaSignedDate: data.baaSignedDate ? data.baaSignedDate.split('T')[0] : '',
        baaCounterparty: data.baaCounterparty || '',
        baaDocumentUrl: data.baaDocumentUrl || '',
        complianceOfficer: data.complianceOfficer || '',
        dataRetentionDays: data.dataRetentionDays || 365,
        lastReviewDate: data.lastReviewDate ? data.lastReviewDate.split('T')[0] : '',
        nextReviewDate: data.nextReviewDate ? data.nextReviewDate.split('T')[0] : '',
        notes: data.notes || ''
      })
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load compliance settings')
    } finally {
      setLoading(false)
    }
  }

  const fetchAuditLogs = async () => {
    try {
      const params = { page: auditPagination.page, limit: 20 }
      if (auditFilter) params.action = auditFilter
      const { data } = await complianceAPI.getAuditLogs(params)
      setAuditLogs(data.logs || [])
      setAuditPagination(data.pagination || { page: 1, totalPages: 1, total: 0 })
    } catch (err) {
      console.error('Failed to load audit logs:', err)
    }
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    setSaving(true)
    try {
      await complianceAPI.updateSettings(settings)
      setSuccess(t('settings.complianceSaved'))
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save compliance settings')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const sections = [
    { id: 'overview', label: t('settings.complianceOverview') },
    { id: 'settings', label: t('settings.complianceSettings') },
    { id: 'audit', label: t('settings.complianceAuditLog') }
  ]

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

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-2">
          <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{t('settings.complianceTitle')}</h2>
        </div>
        <p className="text-gray-500 dark:text-gray-400 text-sm">{t('settings.complianceSubtitle')}</p>
      </div>

      {/* Section Tabs */}
      <div className="flex gap-1 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-1">
        {sections.map((section) => (
          <button
            key={section.id}
            onClick={() => setActiveSection(section.id)}
            className={`flex-1 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeSection === section.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-dark-hover'
            }`}
          >
            {section.label}
          </button>
        ))}
      </div>

      {/* Overview Section */}
      {activeSection === 'overview' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.hipaaStatus')}</div>
              <div className={`text-sm font-semibold ${settings.hipaaEnabled ? 'text-green-500' : 'text-gray-400'}`}>
                {settings.hipaaEnabled ? t('settings.hipaaEnabled') : t('settings.hipaaDisabled')}
              </div>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.baaStatus')}</div>
              <div className={`text-sm font-semibold ${settings.baaSignedDate ? 'text-green-500' : 'text-yellow-500'}`}>
                {settings.baaSignedDate ? t('settings.baaSigned') : t('settings.baaNotSigned')}
              </div>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.complianceOfficer')}</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {settings.complianceOfficer || t('settings.notSet')}
              </div>
            </div>
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{t('settings.dataRetention')}</div>
              <div className="text-sm font-semibold text-gray-900 dark:text-white">
                {settings.dataRetentionDays} {t('settings.days')}
              </div>
            </div>
          </div>

          {/* HIPAA Policy Summary */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{t('settings.hipaaPolicySummary')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border-l-4 border-blue-500 bg-blue-50/50 dark:bg-blue-500/5 rounded-r-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('settings.hipaaPrivacyRule')}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('settings.hipaaPrivacyRuleDesc')}</p>
              </div>
              <div className="border-l-4 border-green-500 bg-green-50/50 dark:bg-green-500/5 rounded-r-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('settings.hipaaSecurityRule')}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('settings.hipaaSecurityRuleDesc')}</p>
              </div>
              <div className="border-l-4 border-yellow-500 bg-yellow-50/50 dark:bg-yellow-500/5 rounded-r-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('settings.hipaaBreachNotification')}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('settings.hipaaBreachNotificationDesc')}</p>
              </div>
              <div className="border-l-4 border-red-500 bg-red-50/50 dark:bg-red-500/5 rounded-r-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t('settings.hipaaEnforcement')}</h4>
                <p className="text-xs text-gray-600 dark:text-gray-400">{t('settings.hipaaEnforcementDesc')}</p>
              </div>
            </div>
          </div>

          {/* BAA Document Template */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
            <button
              onClick={() => setBaaExpanded(!baaExpanded)}
              className="w-full flex items-center justify-between p-6 text-left"
            >
              <div className="flex items-center gap-3">
                <svg className="w-5 h-5 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('settings.baaTemplateTitle')}</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.baaTemplateDesc')}</p>
                </div>
              </div>
              <svg className={`w-5 h-5 text-gray-400 transition-transform ${baaExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {baaExpanded && (
              <div className="px-6 pb-6 space-y-4">
                <div className="bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg p-4 max-h-96 overflow-y-auto">
                  <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono leading-relaxed">
                    {t('settings.baaTemplate')}
                  </pre>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(t('settings.baaTemplate'))
                      setBaaCopied(true)
                      setTimeout(() => setBaaCopied(false), 2000)
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                      baaCopied
                        ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/30'
                        : 'bg-primary-600 text-white hover:bg-primary-700'
                    }`}
                  >
                    {baaCopied ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        {t('settings.copiedToClipboard')}
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        {t('settings.copyToClipboard')}
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Settings Section */}
      {activeSection === 'settings' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 space-y-6">
          {/* HIPAA Toggle */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">{t('settings.enableHipaa')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('settings.hipaaStatus')}</p>
            </div>
            <button
              onClick={() => setSettings({ ...settings, hipaaEnabled: !settings.hipaaEnabled })}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                settings.hipaaEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-dark-border'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                settings.hipaaEnabled ? 'translate-x-6' : 'translate-x-1'
              }`} />
            </button>
          </div>

          <hr className="border-gray-200 dark:border-dark-border" />

          {/* BAA Info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.baaSignedDate')}</label>
              <input
                type="date"
                value={settings.baaSignedDate}
                onChange={(e) => setSettings({ ...settings, baaSignedDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.baaCounterparty')}</label>
              <input
                type="text"
                value={settings.baaCounterparty}
                onChange={(e) => setSettings({ ...settings, baaCounterparty: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.baaDocumentUrl')}</label>
              <input
                type="url"
                value={settings.baaDocumentUrl}
                onChange={(e) => setSettings({ ...settings, baaDocumentUrl: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.complianceOfficer')}</label>
              <input
                type="text"
                value={settings.complianceOfficer}
                onChange={(e) => setSettings({ ...settings, complianceOfficer: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* Retention & Review Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.dataRetentionDays')}</label>
              <input
                type="number"
                min="1"
                value={settings.dataRetentionDays}
                onChange={(e) => setSettings({ ...settings, dataRetentionDays: parseInt(e.target.value, 10) || 365 })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.lastReview')}</label>
              <input
                type="date"
                value={settings.lastReviewDate}
                onChange={(e) => setSettings({ ...settings, lastReviewDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.nextReview')}</label>
              <input
                type="date"
                value={settings.nextReviewDate}
                onChange={(e) => setSettings({ ...settings, nextReviewDate: e.target.value })}
                className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('settings.complianceNotes')}</label>
            <textarea
              rows={3}
              value={settings.notes}
              onChange={(e) => setSettings({ ...settings, notes: e.target.value })}
              placeholder={t('settings.complianceNotesPlaceholder')}
              className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm resize-none"
            />
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
            >
              {saving ? t('common.saving') : t('common.saveChanges')}
            </button>
          </div>
        </div>
      )}

      {/* Audit Log Section */}
      {activeSection === 'audit' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          {/* Filter */}
          <div className="flex items-center gap-3 mb-4">
            <input
              type="text"
              value={auditFilter}
              onChange={(e) => {
                setAuditFilter(e.target.value)
                setAuditPagination((p) => ({ ...p, page: 1 }))
              }}
              placeholder={t('settings.auditLogFilterAction')}
              className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-dark-border">
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('settings.auditLogDate')}</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('settings.auditLogActor')}</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('settings.auditLogAction')}</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('settings.auditLogResource')}</th>
                  <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('settings.auditLogIp')}</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-gray-400 dark:text-gray-500">
                      {t('settings.auditLogEmpty')}
                    </td>
                  </tr>
                ) : (
                  auditLogs.map((log) => (
                    <tr key={log.id} className="border-b border-gray-100 dark:border-dark-border/50 hover:bg-gray-50 dark:hover:bg-dark-hover">
                      <td className="py-2.5 px-2 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </td>
                      <td className="py-2.5 px-2 text-gray-900 dark:text-white">
                        {log.actorEmail || '-'}
                      </td>
                      <td className="py-2.5 px-2">
                        <span className="px-2 py-0.5 bg-primary-500/10 text-primary-600 dark:text-primary-400 rounded text-xs font-medium">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-gray-600 dark:text-gray-300">
                        {log.resourceType ? `${log.resourceType}${log.resourceId ? ` #${log.resourceId}` : ''}` : '-'}
                      </td>
                      <td className="py-2.5 px-2 text-gray-500 dark:text-gray-400 font-mono text-xs">
                        {log.ipAddress || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {auditPagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setAuditPagination((p) => ({ ...p, page: Math.max(1, p.page - 1) }))}
                disabled={auditPagination.page <= 1}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-dark-hover rounded-lg disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-dark-border"
              >
                {t('settings.auditLogPrevious')}
              </button>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {t('settings.auditLogPage', { page: auditPagination.page, totalPages: auditPagination.totalPages })}
              </span>
              <button
                onClick={() => setAuditPagination((p) => ({ ...p, page: Math.min(p.totalPages, p.page + 1) }))}
                disabled={auditPagination.page >= auditPagination.totalPages}
                className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-dark-hover rounded-lg disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-dark-border"
              >
                {t('settings.auditLogNext')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
