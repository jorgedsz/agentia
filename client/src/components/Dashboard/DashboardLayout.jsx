import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation, Outlet } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { useLanguage } from '../../context/LanguageContext'
import { twilioAPI, creditsAPI, agentsAPI } from '../../services/api'
import ChatAssistant from './ChatAssistant'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

const Icons = {
  Overview: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
    </svg>
  ),
  Agents: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
    </svg>
  ),
  Voice: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
    </svg>
  ),
  Users: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Agency: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  Analytics: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  Settings: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
  Moon: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
    </svg>
  ),
  Sun: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
  Phone: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
    </svg>
  ),
  Twilio: () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.381 0 0 5.381 0 12s5.381 12 12 12 12-5.381 12-12S18.619 0 12 0zm0 20.4c-4.636 0-8.4-3.764-8.4-8.4S7.364 3.6 12 3.6s8.4 3.764 8.4 8.4-3.764 8.4-8.4 8.4zm3.6-11.4c0 .993-.807 1.8-1.8 1.8s-1.8-.807-1.8-1.8.807-1.8 1.8-1.8 1.8.807 1.8 1.8zm-5.4 0c0 .993-.807 1.8-1.8 1.8S6.6 9.993 6.6 9s.807-1.8 1.8-1.8 1.8.807 1.8 1.8zm5.4 5.4c0 .993-.807 1.8-1.8 1.8s-1.8-.807-1.8-1.8.807-1.8 1.8-1.8 1.8.807 1.8 1.8zm-5.4 0c0 .993-.807 1.8-1.8 1.8s-1.8-.807-1.8-1.8.807-1.8 1.8-1.8 1.8.807 1.8 1.8z"/>
    </svg>
  ),
  SubAccounts: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
    </svg>
  ),
  Logs: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
  Wallet: () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  ),
  Credits: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  Rates: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
    </svg>
  ),
  CreateAgent: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  ),
  Support: () => (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
    </svg>
  ),
}

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout, isImpersonating, switchBack, branding } = useAuth()
  const { darkMode, toggleDarkMode } = useTheme()
  const { t, language, toggleLanguage } = useLanguage()
  const [switchingBack, setSwitchingBack] = useState(false)
  const [balances, setBalances] = useState({ twilio: null, vapi: null })
  const [userCredits, setUserCredits] = useState(null)
  useEffect(() => {
    fetchBalances()
    fetchCredits()
  }, [location.pathname])

  // Poll credits every 30s so sidebar stays up to date after calls
  useEffect(() => {
    const interval = setInterval(fetchCredits, 30000)
    return () => clearInterval(interval)
  }, [])

  // Listen for credits update event
  useEffect(() => {
    const handleCreditsUpdate = () => {
      console.log('creditsUpdated event received, fetching credits...')
      fetchCredits()
    }
    window.addEventListener('creditsUpdated', handleCreditsUpdate)
    return () => window.removeEventListener('creditsUpdated', handleCreditsUpdate)
  }, [])

  const fetchBalances = async () => {
    try {
      const response = await twilioAPI.getBalances()
      setBalances(response.data)
    } catch (err) {
      // Silently fail - balances are optional
    }
  }

  const fetchCredits = async () => {
    try {
      const response = await creditsAPI.list()
      const users = response.data.users || []
      console.log('Sidebar fetchCredits - users:', users)
      console.log('Sidebar fetchCredits - looking for user id:', user?.id)
      // Find current user's credits
      const currentUser = users.find(u => u.id === user?.id)
      console.log('Sidebar fetchCredits - found user:', currentUser)
      if (currentUser) {
        console.log('Sidebar setting credits to:', currentUser.vapiCredits)
        setUserCredits(currentUser.vapiCredits)
      } else if (users.length > 0) {
        console.log('Sidebar setting credits to first user:', users[0].vapiCredits)
        setUserCredits(users[0].vapiCredits)
      }
    } catch (err) {
      console.error('Sidebar fetchCredits error:', err)
    }
  }

  const handleSwitchBack = async () => {
    setSwitchingBack(true)
    try {
      await switchBack()
      navigate('/dashboard')
    } catch (err) {
      console.error('Failed to switch back:', err)
    } finally {
      setSwitchingBack(false)
    }
  }

  const getActiveTab = () => {
    const path = location.pathname
    if (path === '/dashboard') return 'overview'
    if (path.startsWith('/dashboard/agent/')) return 'agents'
    const tab = path.replace('/dashboard/', '')
    return tab || 'overview'
  }

  const activeTab = getActiveTab()

  const menuSections = [
    {
      title: t('sidebar.sectionDashboard'),
      items: [
        { id: 'overview', path: '/dashboard', label: t('sidebar.overview'), icon: Icons.Overview, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
        { id: 'analytics', path: '/dashboard/analytics', label: t('sidebar.analytics'), icon: Icons.Analytics, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
      ]
    },
    {
      title: t('sidebar.sectionAgents'),
      items: [
        { id: 'agents', path: '/dashboard/agents', label: t('sidebar.myAgents'), icon: Icons.Agents, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
        { id: 'voice-library', path: '/dashboard/voice-library', label: t('sidebar.voiceLibrary'), icon: Icons.Voice, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
        { id: 'create-agent', label: t('sidebar.createAgent'), icon: Icons.CreateAgent, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT], isAction: true },
      ]
    },
    {
      title: t('sidebar.sectionManagement'),
      items: [
        { id: 'accounts', path: '/dashboard/accounts', label: t('sidebar.accounts'), icon: Icons.SubAccounts, roles: [ROLES.OWNER, ROLES.AGENCY] },
      ]
    },
    {
      title: t('sidebar.sectionPhone'),
      items: [
        { id: 'twilio-setup', path: '/dashboard/twilio-setup', label: t('sidebar.twilioSetup'), icon: Icons.Twilio, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
        { id: 'phone-numbers', path: '/dashboard/phone-numbers', label: t('sidebar.phoneNumbers'), icon: Icons.Phone, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
      ]
    },
    {
      title: t('sidebar.sectionSystem'),
      items: [
        { id: 'call-logs', path: '/dashboard/call-logs', label: t('sidebar.callLogs'), icon: Icons.Logs, roles: [ROLES.OWNER, ROLES.AGENCY] },
        { id: 'settings', path: '/dashboard/settings', label: t('sidebar.settings'), icon: Icons.Settings, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
        { id: 'support', path: '/dashboard/support', label: t('sidebar.support'), icon: Icons.Support, roles: [ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT] },
      ]
    }
  ]

  return (
    <div className={`flex h-screen ${darkMode ? 'dark' : ''}`}>
      {/* Sidebar */}
      <div className="w-64 h-screen bg-white dark:bg-dark-sidebar border-r border-gray-200 dark:border-dark-border flex flex-col flex-shrink-0">
        {/* Logo */}
        <div className="p-4 border-b border-gray-200 dark:border-dark-border">
          <div className="flex items-center gap-3">
            {branding?.companyLogo ? (
              <img
                src={branding.companyLogo}
                alt="Company logo"
                className="w-8 h-8 rounded-lg object-contain bg-white dark:bg-dark-hover"
                onError={(e) => { e.target.style.display = 'none' }}
              />
            ) : null}
            <div>
              <h1 className="text-xl font-bold text-primary-600 dark:text-primary-400">
                {branding?.companyName || 'Appex Innovations AI'}
              </h1>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {branding?.companyTagline || 'AI Voice Platform'}
              </p>
            </div>
          </div>
        </div>

        {/* Account Balances */}
        {(balances.twilio !== null || balances.vapi !== null || userCredits !== null) && (
          <div className="px-4 py-3 border-b border-gray-200 dark:border-dark-border">
            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
              <Icons.Wallet />
              <span className="font-medium">Account Balances</span>
            </div>
            <div className="space-y-1">
              {userCredits !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Credits</span>
                  <span className={`font-medium ${userCredits <= 0 ? 'text-red-500' : 'text-green-500'}`}>
                    ${userCredits?.toFixed(2) || '0.00'}
                  </span>
                </div>
              )}
              {balances.twilio !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Twilio</span>
                  <span className={`font-medium ${balances.twilio < 10 ? 'text-red-500' : 'text-green-500'}`}>
                    ${balances.twilio?.toFixed(2) || '0.00'}
                  </span>
                </div>
              )}
              {balances.vapi !== null && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">VAPI</span>
                  <span className={`font-medium ${balances.vapi < 10 ? 'text-red-500' : 'text-green-500'}`}>
                    ${balances.vapi?.toFixed(2) || '0.00'}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          {menuSections.map((section) => {
            const visibleItems = section.items.filter(item => item.roles.includes(user?.role))
            if (visibleItems.length === 0) return null

            return (
              <div key={section.title} className="mb-6">
                <h2 className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-2">
                  {section.title}
                </h2>
                <ul className="space-y-1">
                  {visibleItems.map((item) => {
                    const Icon = item.icon
                    const isActive = activeTab === item.id

                    if (item.isAction) {
                      return (
                        <li key={item.id}>
                          <button
                            onClick={async () => {
                              try {
                                const response = await agentsAPI.create({
                                  name: 'New Agent',
                                  agentType: 'outbound',
                                  config: {
                                    agentType: 'outbound',
                                    modelProvider: 'openai',
                                    modelName: 'gpt-4o',
                                    voiceProvider: '11labs',
                                    voiceId: 'pFZP5JQG7iQjIQuC4Bku',
                                  }
                                })
                                navigate(`/dashboard/agent/${response.data.agent.id}`)
                              } catch (err) {
                                console.error('Failed to create agent:', err)
                              }
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover"
                          >
                            <Icon />
                            {item.label}
                          </button>
                        </li>
                      )
                    }

                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => navigate(item.path)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                            isActive
                              ? 'bg-primary-600 text-white'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover'
                          }`}
                        >
                          <Icon />
                          {item.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </nav>

        {/* Bottom section */}
        <div className="p-4 border-t border-gray-200 dark:border-dark-border">
          {/* Language toggle */}
          <button
            onClick={toggleLanguage}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover mb-2"
          >
            <span className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
              </svg>
              {language === 'en' ? 'English' : 'Español'}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-gray-200 dark:bg-dark-hover">
              {language.toUpperCase()}
            </span>
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={toggleDarkMode}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover mb-3"
          >
            <span className="flex items-center gap-3">
              {darkMode ? <Icons.Moon /> : <Icons.Sun />}
              {darkMode ? 'Dark Mode' : 'Light Mode'}
            </span>
            <div className={`w-10 h-5 rounded-full p-0.5 transition-colors ${darkMode ? 'bg-primary-600' : 'bg-gray-300'}`}>
              <div className={`w-4 h-4 rounded-full bg-white transition-transform ${darkMode ? 'translate-x-5' : 'translate-x-0'}`} />
            </div>
          </button>

          {/* User info */}
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
              {(user?.name || user?.email || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.name || user?.email}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="text-gray-400 hover:text-red-500 transition-colors"
              title="Logout"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-gray-50 dark:bg-dark-bg overflow-auto">
        {/* Impersonation Banner */}
        {isImpersonating && (
          <div className="bg-yellow-500 text-yellow-900 px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <span className="font-medium">
                Viewing as: <strong>{user?.name || user?.email}</strong> ({user?.role})
              </span>
            </div>
            <button
              onClick={handleSwitchBack}
              disabled={switchingBack}
              className="px-4 py-1.5 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {switchingBack ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Switching...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 15l-3-3m0 0l3-3m-3 3h8M3 12a9 9 0 1118 0 9 9 0 01-18 0z" />
                  </svg>
                  Switch Back
                </>
              )}
            </button>
          </div>
        )}

        {/* Page Content */}
        <Outlet />
      </div>

      {/* Floating Chat Assistant */}
      <ChatAssistant />
    </div>
  )
}
