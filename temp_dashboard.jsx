import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { agentsAPI, usersAPI } from '../../services/api'
import Sidebar from './Sidebar'

import Settings from "./Settings"
const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { darkMode } = useTheme()
  const [activeTab, setActiveTab] = useState('overview')
  const [stats, setStats] = useState({})
  const [agents, setAgents] = useState([])
  const [clients, setClients] = useState([])
  const [agencies, setAgencies] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      const statsRes = await usersAPI.getStats()
      setStats(statsRes.data.stats)

      if (activeTab === 'overview' || activeTab === 'agents') {
        const agentsRes = await agentsAPI.list()
        setAgents(agentsRes.data.agents)
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

      {/* Main Content */}
      <div className="flex-1 bg-gray-50 dark:bg-dark-bg overflow-auto">
        {/* Header */}
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
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
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
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

        {/* Content */}
        <main className="p-6">
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Stats Cards */}
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

                  {/* Recent Agents */}
                  <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Recent Agents</h2>
                    {agents.length === 0 ? (
                      <EmptyState type="agents" onCreate={() => { setShowModal('agent'); setFormData({}); }} />
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {agents.slice(0, 6).map((agent) => (
                          <AgentCard key={agent.id} agent={agent} onDelete={() => handleDelete('agent', agent.id)} />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Agents Tab */}
              {activeTab === 'agents' && (
                <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
                  {agents.length === 0 ? (
                    <EmptyState type="agents" onCreate={() => { setShowModal('agent'); setFormData({}); }} />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {agents.map((agent) => (
                        <AgentCard key={agent.id} agent={agent} onDelete={() => handleDelete('agent', agent.id)} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Clients Tab */}
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

              {/* Agencies Tab */}
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
                          <span className="font-medium text-indigo-500">{agency._count?.clients || 0}</span> clients
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* All Users Tab */}
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

}
