import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { ghlAPI, teamMembersAPI, platformSettingsAPI, brandingAPI } from '../../services/api'

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
    label: 'Team Access',
    description: 'Manage team members and permissions',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'ghl',
    label: 'GoHighLevel',
    description: 'Calendar integration settings',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'api-keys',
    label: 'API Keys',
    description: 'Platform API configuration',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
    roles: [ROLES.OWNER]
  },
  {
    id: 'billing',
    label: 'Billing & Rates',
    description: 'View your billing rates',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'branding',
    label: 'Branding',
    description: 'Logo and company name',
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
      </svg>
    ),
    roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT]
  },
  {
    id: 'account',
    label: 'Account',
    description: 'Profile and security settings',
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
  const tabParam = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(tabParam || 'team')
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
            Settings
          </label>
          <div className="relative">
            <select
              value={activeTab}
              onChange={(e) => setActiveTab(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
            >
              {visibleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
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
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">{activeItem.description}</p>
          )}
        </div>
      </div>

      {/* Desktop: Settings Sidebar */}
      <div className={`hidden lg:block flex-shrink-0 transition-all duration-300 ${sidebarCollapsed ? 'w-16' : 'w-72'}`}>
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden sticky top-6">
          <div className={`flex items-center justify-between border-b border-gray-200 dark:border-dark-border ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
            {!sidebarCollapsed && (
              <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Settings</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage your account</p>
              </div>
            )}
            <button
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={`p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-dark-hover transition-colors ${sidebarCollapsed ? 'mx-auto' : ''}`}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
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
                title={sidebarCollapsed ? item.label : undefined}
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
                      {item.label}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {item.description}
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
        {activeTab === 'ghl' && <GHLIntegrationTab />}
        {activeTab === 'api-keys' && isOwner && <APIKeysTab />}
        {activeTab === 'billing' && <BillingTab />}
        {activeTab === 'branding' && <BrandingTab />}
        {activeTab === 'account' && <AccountTab />}
      </div>
    </div>
  )
}

// Billing Tab
function BillingTab() {
  const { user } = useAuth()

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Billing & Rates</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Your current call rates and billing information.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Outbound Rate</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              ${(user?.outboundRate ?? 0.10).toFixed(2)}<span className="text-sm font-normal text-gray-500">/min</span>
            </div>
          </div>
          <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4">
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">Inbound Rate</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              ${(user?.inboundRate ?? 0.05).toFixed(2)}<span className="text-sm font-normal text-gray-500">/min</span>
            </div>
          </div>
        </div>

        <div className="mt-6 p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-blue-700 dark:text-blue-400">Billing Information</p>
              <p className="text-sm text-blue-600 dark:text-blue-300 mt-1">
                Calls are billed per minute based on your account rates. Contact your administrator to adjust rates.
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

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Account Information</h2>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-16 h-16 rounded-full bg-primary-600 flex items-center justify-center text-white text-2xl font-medium">
            {(user?.name || user?.email)?.[0]?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">{user?.name || 'Unnamed User'}</div>
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
            <span className="text-sm text-gray-500 dark:text-gray-400">Account ID</span>
            <span className="text-sm font-mono text-gray-900 dark:text-white">{user?.id}</span>
          </div>
          <div className="flex justify-between py-3 border-b border-gray-200 dark:border-dark-border">
            <span className="text-sm text-gray-500 dark:text-gray-400">Member Since</span>
            <span className="text-sm text-gray-900 dark:text-white">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
            </span>
          </div>
          <div className="flex justify-between py-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">Credits Balance</span>
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
                {branding.companyName || 'AgentBuilder'}
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
              placeholder="AgentBuilder"
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

// GHL Integration Tab
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

// API Keys Tab
function APIKeysTab() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [vapiApiKey, setVapiApiKey] = useState('')
  const [openaiApiKey, setOpenaiApiKey] = useState('')
  const [hasVapi, setHasVapi] = useState(false)
  const [hasOpenai, setHasOpenai] = useState(false)
  const [maskedVapi, setMaskedVapi] = useState('')
  const [maskedOpenai, setMaskedOpenai] = useState('')

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    setLoading(true)
    try {
      const { data } = await platformSettingsAPI.get()
      setHasVapi(data.hasVapi)
      setHasOpenai(data.hasOpenai)
      setMaskedVapi(data.vapiApiKey || '')
      setMaskedOpenai(data.openaiApiKey || '')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async (field) => {
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const payload = {}
      if (field === 'vapi') payload.vapiApiKey = vapiApiKey
      if (field === 'openai') payload.openaiApiKey = openaiApiKey

      const { data } = await platformSettingsAPI.update(payload)
      setHasVapi(data.hasVapi)
      setHasOpenai(data.hasOpenai)
      setMaskedVapi(data.vapiApiKey || '')
      setMaskedOpenai(data.openaiApiKey || '')
      setVapiApiKey('')
      setOpenaiApiKey('')
      setSuccess(`${field === 'vapi' ? 'VAPI' : 'OpenAI'} API key updated successfully`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update settings')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (field) => {
    if (!confirm(`Are you sure you want to remove the ${field === 'vapi' ? 'VAPI' : 'OpenAI'} API key?`)) return
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const payload = {}
      if (field === 'vapi') payload.vapiApiKey = ''
      if (field === 'openai') payload.openaiApiKey = ''

      const { data } = await platformSettingsAPI.update(payload)
      setHasVapi(data.hasVapi)
      setHasOpenai(data.hasOpenai)
      setMaskedVapi(data.vapiApiKey || '')
      setMaskedOpenai(data.openaiApiKey || '')
      setSuccess(`${field === 'vapi' ? 'VAPI' : 'OpenAI'} API key removed`)
      setTimeout(() => setSuccess(''), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove key')
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
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">API Keys</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Configure your platform API keys for VAPI and OpenAI. These keys are encrypted and stored securely.
        </p>
      </div>

      {/* VAPI API Key */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white">VAPI API Key</h3>
          {hasVapi && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
              Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Used for creating and managing voice AI agents.
        </p>

        {hasVapi && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{maskedVapi}</span>
            <button onClick={() => handleRemove('vapi')} disabled={saving} className="ml-auto text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
              Remove
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="password"
            value={vapiApiKey}
            onChange={(e) => setVapiApiKey(e.target.value)}
            placeholder={hasVapi ? 'Enter new key to replace...' : 'Enter your VAPI API key...'}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
          />
          <button
            onClick={() => handleSave('vapi')}
            disabled={saving || !vapiApiKey.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : hasVapi ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      {/* OpenAI API Key */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-center gap-3 mb-4">
          <h3 className="text-md font-semibold text-gray-900 dark:text-white">OpenAI API Key</h3>
          {hasOpenai && (
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-500/20 text-green-400">
              Connected
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          Used for the AI prompt generator feature.
        </p>

        {hasOpenai && (
          <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
            <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{maskedOpenai}</span>
            <button onClick={() => handleRemove('openai')} disabled={saving} className="ml-auto text-xs text-red-500 hover:text-red-600 disabled:opacity-50">
              Remove
            </button>
          </div>
        )}

        <div className="flex gap-3">
          <input
            type="password"
            value={openaiApiKey}
            onChange={(e) => setOpenaiApiKey(e.target.value)}
            placeholder={hasOpenai ? 'Enter new key to replace...' : 'Enter your OpenAI API key...'}
            className="flex-1 px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono text-sm"
          />
          <button
            onClick={() => handleSave('openai')}
            disabled={saving || !openaiApiKey.trim()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
          >
            {saving ? 'Saving...' : hasOpenai ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
