with open('client/src/components/Dashboard/Dashboard.jsx', 'w') as f:
    f.write('''import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useTheme } from '../../context/ThemeContext'
import { agentsAPI, usersAPI } from '../../services/api'
import Sidebar from './Sidebar'

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
              {/* Other tabs placeholder */}
              {['voice-agent', 'analytics', 'call-logs', 'settings'].includes(activeTab) && (
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

      {/* Modals */}
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
    </div>
  )
}

// Components
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
  
