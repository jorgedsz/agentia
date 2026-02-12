import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { agentsAPI, usersAPI, pricingAPI } from '../../services/api'
import TestCallModal from './TestCallModal'
import Sidebar from './Sidebar'
import TwilioSetup from './TwilioSetup'
import PhoneNumbers from './PhoneNumbers'
import SubAccounts from './SubAccounts'
import Settings from './Settings'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

export default function Dashboard() {
  const { user, isImpersonating, originalUser, switchBack } = useAuth()
  const { darkMode } = useTheme()
  const navigate = useNavigate()
  const [switchingBack, setSwitchingBack] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState({})
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState([])
  const [agencies, setAgencies] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [testCallAgent, setTestCallAgent] = useState(null)
  const [pricingRates, setPricingRates] = useState({ models: {}, transcribers: {} })

  const handleSwitchBack = async () => {
    setSwitchingBack(true)
    try {
      await switchBack()
      setActiveTab('overview')
    } catch (err) {
      console.error('Failed to switch back:', err)
    } finally {
      setSwitchingBack(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const statsRes = await usersAPI.getStats()
      setStats(statsRes.data.stats)

      if (activeTab === 'overview' || activeTab === 'agents') {
        const [agentsRes, modelsRes, transcribersRes] = await Promise.all([
          agentsAPI.list(),
          pricingAPI.getModelRates(),
          pricingAPI.getTranscriberRates()
        ])
        setAgents(agentsRes.data.agents)
        const mRates = {}
        const mList = modelsRes.data.rates || modelsRes.data.globalRates || []
        mList.forEach(r => { mRates[`${r.provider}::${r.model}`] = r.rate })
        const tRates = {}
        const tList = transcribersRes.data.rates || transcribersRes.data.globalRates || []
        tList.forEach(r => { tRates[r.provider] = r.rate })
        setPricingRates({ models: mRates, transcribers: tRates })
      }
      if (activeTab === 'clients' && (user.role === ROLES.OWNER || user.role === ROLES.AGENCY)) {
        const clientsRes = await usersAPI.getClients()
        setClients(clientsRes.data.clients)
      }
      if (activeTab === 'agencies' && user.role === ROLES.OWNER) {
        const agenciesRes = await usersAPI.getAgencies()
        setAgencies(agenciesRes.data.agencies)
      }
      if (activeTab === 'all-users' && user.role === ROLES.OWNER) {
        const usersRes = await usersAPI.getAll()
        setAllUsers(usersRes.data.users)
      }
    } catch (err) {
      console.error('Failed to fetch data:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async (type) => {
    setCreating(true)
    setError('')
    try {
      if (type === 'agent') {
        const response = await agentsAPI.create({
          name: formData.name,
          config: { systemPrompt: formData.systemPrompt || undefined }
        })
        setAgents([response.data.agent, ...agents])
      } else if (type === 'client') {
        const response = await usersAPI.createClient(formData)
        setClients([response.data.client, ...clients])
      } else if (type === 'agency') {
        const response = await usersAPI.createAgency(formData)
        setAgencies([response.data.agency, ...agencies])
      }
      setShowModal(null)
      setFormData({})
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (type, id) => {
    if (!confirm(`Are you sure you want to delete this ${type}?`)) return
    try {
      if (type === 'agent') {
        await agentsAPI.delete(id)
        setAgents(agents.filter(a => a.id !== id))
      } else {
        await usersAPI.delete(id)
        setClients(clients.filter(c => c.id !== id))
      }
    } catch (err) {
      alert(`Failed to delete ${type}`)
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case ROLES.OWNER: return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case ROLES.AGENCY: return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  return (
    <div className={`flex h-screen ${darkMode ? 'dark' : ''}`}>
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

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

        <header className="bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border px-6 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white capitalize">
                {activeTab.replace('-', ' ')}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Manage your AI agents and clients
              </p>
            </div>
            <div className="flex items-center gap-3">
              {(activeTab === 'agents' || activeTab === 'overview') && (
                <button
                  onClick={() => { setShowModal('agent'); setFormData({}); setError(''); }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  New Agent
                </button>
              )}
              {activeTab === 'clients' && (
                <button
                  onClick={() => { setShowModal('client'); setFormData({}); setError(''); }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Client
                </button>
              )}
              {activeTab === 'agencies' && (
                <button
                  onClick={() => { setShowModal('agency'); setFormData({}); setError(''); }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Add Agency
                </button>
              )}
            </div>
          </div>
        </header>

        <main className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
            </div>
          ) : (
            <>
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard title="Total Agents" value={stats.totalAgents || 0} icon="agents" />
                    {(user?.role === ROLES.OWNER || user?.role === ROLES.AGENCY) && (
                      <StatCard title="Total Clients" value={stats.totalClients || 0} icon="users" />
                    )}
                    {user?.role === ROLES.OWNER && (
                      <StatCard title="Total Agencies" value={stats.totalAgencies || 0} icon="agency" />
                    )}
                    <StatCard title="Active Calls" value="0" icon="phone" />
                  </div>

                  <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Agents</h2>
                    {agents.length === 0 ? (
                      <EmptyState type="agents" onCreate={() => { setShowModal('agent'); setFormData({}); }} />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {agents.slice(0, 6).map((agent) => (
                          <AgentCard key={agent.id} agent={agent} pricingRates={pricingRates} onDelete={() => handleDelete('agent', agent.id)} onEdit={() => navigate(`/dashboard/agent/${agent.id}`)} onTest={() => agent.vapiId && setTestCallAgent(agent)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'agents' && (
                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                  {agents.length === 0 ? (
                    <EmptyState type="agents" onCreate={() => { setShowModal('agent'); setFormData({}); }} />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {agents.map((agent) => (
                        <AgentCard key={agent.id} agent={agent} pricingRates={pricingRates} onDelete={() => handleDelete('agent', agent.id)} onEdit={() => navigate(`/dashboard/agent/${agent.id}`)} onTest={() => agent.vapiId && setTestCallAgent(agent)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'clients' && (
                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
                  {clients.length === 0 ? (
                    <div className="p-6">
                      <EmptyState type="clients" onCreate={() => { setShowModal('client'); setFormData({}); }} />
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-dark-hover">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agents</th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                        {clients.map((client) => (
                          <tr key={client.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                            <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{client.name || '-'}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{client.email}</td>
                            <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{client._count?.agents || 0}</td>
                            <td className="px-6 py-4 text-right">
                              <button onClick={() => handleDelete('client', client.id)} className="text-red-500 hover:text-red-700 text-sm">Delete</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {activeTab === 'agencies' && user?.role === ROLES.OWNER && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {agencies.length === 0 ? (
                    <div className="col-span-full bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                      <EmptyState type="agencies" onCreate={() => { setShowModal('agency'); setFormData({}); }} />
                    </div>
                  ) : (
                    agencies.map((agency) => (
                      <div key={agency.id} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">{agency.name || 'Unnamed Agency'}</h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{agency.email}</p>
                        <div className="text-sm text-gray-600 dark:text-gray-300">
                          <span className="font-medium text-primary-500">{agency._count?.clients || 0}</span> clients
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {activeTab === 'all-users' && user?.role === ROLES.OWNER && (
                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-dark-hover">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Name</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Email</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Role</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agency</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Agents</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                      {allUsers.map((u) => (
                        <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                          <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">{u.name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{u.email}</td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(u.role)}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{u.agency?.name || '-'}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{u._count?.agents || 0}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {activeTab === 'twilio-setup' && <TwilioSetup />}

              {activeTab === 'phone-numbers' && <PhoneNumbers />}

              {activeTab === 'sub-accounts' && <SubAccounts />}

              {activeTab === 'settings' && <Settings />}

              {['voice-agent', 'analytics', 'call-logs'].includes(activeTab) && (
                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
                  <div className="text-gray-400 text-6xl mb-4">🚧</div>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Coming Soon</h3>
                  <p className="text-gray-500 dark:text-gray-400">This feature is under development.</p>
                </div>
              )}
            </>
          )}
        </main>
      </div>

      {showModal === 'agent' && (
        <Modal title="Create New Agent" onClose={() => setShowModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate('agent'); }}>
            {error && <ErrorAlert message={error} />}
            <Input label="Agent Name *" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} required />
            <TextArea label="System Prompt" value={formData.systemPrompt || ''} onChange={(v) => setFormData({...formData, systemPrompt: v})} />
            <ModalActions onCancel={() => setShowModal(null)} loading={creating} submitText="Create Agent" />
          </form>
        </Modal>
      )}

      {showModal === 'client' && (
        <Modal title="Add New Client" onClose={() => setShowModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate('client'); }}>
            {error && <ErrorAlert message={error} />}
            <Input label="Name" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} />
            <Input label="Email *" type="email" value={formData.email || ''} onChange={(v) => setFormData({...formData, email: v})} required />
            <Input label="Password *" type="password" value={formData.password || ''} onChange={(v) => setFormData({...formData, password: v})} required />
            <ModalActions onCancel={() => setShowModal(null)} loading={creating} submitText="Add Client" />
          </form>
        </Modal>
      )}

      {showModal === 'agency' && (
        <Modal title="Add New Agency" onClose={() => setShowModal(null)}>
          <form onSubmit={(e) => { e.preventDefault(); handleCreate('agency'); }}>
            {error && <ErrorAlert message={error} />}
            <Input label="Agency Name" value={formData.name || ''} onChange={(v) => setFormData({...formData, name: v})} />
            <Input label="Email *" type="email" value={formData.email || ''} onChange={(v) => setFormData({...formData, email: v})} required />
            <Input label="Password *" type="password" value={formData.password || ''} onChange={(v) => setFormData({...formData, password: v})} required />
            <ModalActions onCancel={() => setShowModal(null)} loading={creating} submitText="Add Agency" />
          </form>
        </Modal>
      )}

      {testCallAgent && (
        <TestCallModal agent={testCallAgent} onClose={() => setTestCallAgent(null)} />
      )}
    </div>
  )
}

function StatCard({ title, value, icon }) {
  const icons = {
    agents: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />,
    users: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />,
    agency: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />,
    phone: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />,
  }
  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
          <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
        </div>
        <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center">
          <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {icons[icon]}
          </svg>
        </div>
      </div>
    </div>
  )
}

function AgentCard({ agent, pricingRates, onDelete, onEdit, onTest }) {
  const type = agent.agentType || agent.config?.agentType || 'outbound'
  const hasPhone = agent.phoneNumbers && agent.phoneNumbers.length > 0
  const directionLabel = type === 'inbound' ? 'Inbound' : hasPhone ? 'Inbound & Outbound' : 'Outbound'
  const directionColor = type === 'inbound' ? 'bg-blue-500/20 text-blue-400' : hasPhone ? 'bg-purple-500/20 text-purple-400' : 'bg-green-500/20 text-green-400'

  // Calculate agent price from config
  const modelProvider = agent.config?.modelProvider
  const modelName = agent.config?.modelName
  const transcriberProvider = agent.config?.transcriberProvider || 'deepgram'
  const modelRate = pricingRates?.models?.[`${modelProvider}::${modelName}`]
  const transcriberRate = pricingRates?.transcribers?.[transcriberProvider]
  const totalRate = modelRate != null || transcriberRate != null ? (modelRate || 0) + (transcriberRate || 0) : null

  return (
    <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-5 border border-gray-200 dark:border-dark-border">
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white">{agent.name}</h3>
          <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-500/20 text-gray-400">ID: {agent.id}</span>
        </div>
        <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${agent.vapiId ? 'bg-green-500/20 text-green-400' : 'bg-gray-500/20 text-gray-400'}`}>
          {agent.vapiId ? 'Connected' : 'Local'}
        </span>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${directionColor}`}>
          {directionLabel}
        </span>
        {totalRate != null && (
          <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-500/20 text-amber-400" title={`Model: $${(modelRate || 0).toFixed(2)}/min + Transcriber: $${(transcriberRate || 0).toFixed(2)}/min`}>
            ${totalRate.toFixed(2)}/min
          </span>
        )}
      </div>
      {agent.description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">{agent.description}</p>
      )}
      {agent.config?.systemPrompt && (
        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-2 mb-4">{agent.config.systemPrompt}</p>
      )}
      <div className="flex gap-2">
        <button onClick={onEdit} className="flex-1 px-3 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 font-medium">Edit</button>
        <button onClick={onTest} disabled={!agent.vapiId} className="px-3 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50" title={agent.vapiId ? 'Test Agent' : 'Agent not connected to VAPI'}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>
        <button onClick={onDelete} className="px-3 py-2 text-red-500 text-sm rounded-lg hover:bg-red-500/10">Delete</button>
      </div>
    </div>
  )
}

function EmptyState({ type, onCreate }) {
  const content = {
    agents: { icon: '🤖', title: 'No agents yet', desc: 'Create your first AI agent to get started.' },
    clients: { icon: '👤', title: 'No clients yet', desc: 'Add your first client to get started.' },
    agencies: { icon: '🏢', title: 'No agencies yet', desc: 'Add your first agency partner.' },
  }
  const c = content[type]
  return (
    <div className="text-center py-8">
      <div className="text-5xl mb-4">{c.icon}</div>
      <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{c.title}</h3>
      <p className="text-gray-500 dark:text-gray-400 mb-4">{c.desc}</p>
      <button onClick={onCreate} className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700">
        Create {type.slice(0, -1)}
      </button>
    </div>
  )
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Input({ label, type = 'text', value, onChange, required = false }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        required={required}
      />
    </div>
  )
}

function TextArea({ label, value, onChange }) {
  return (
    <div className="mb-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
        rows={4}
      />
    </div>
  )
}

function ErrorAlert({ message }) {
  return (
    <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
      {message}
    </div>
  )
}

function ModalActions({ onCancel, loading, submitText }) {
  return (
    <div className="flex gap-3 mt-6">
      <button
        type="button"
        onClick={onCancel}
        className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={loading}
        className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
      >
        {loading ? 'Creating...' : submitText}
      </button>
    </div>
  )
}
