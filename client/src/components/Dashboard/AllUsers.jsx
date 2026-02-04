import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { usersAPI } from '../../services/api'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

export default function AllUsers() {
  const { user } = useAuth()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [editingUser, setEditingUser] = useState(null)
  const [billingForm, setBillingForm] = useState({
    credits: '',
    creditOperation: 'add',
    outboundRate: '',
    inboundRate: ''
  })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    setLoading(true)
    try {
      const response = await usersAPI.getAll()
      setUsers(response.data.users)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case ROLES.OWNER: return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case ROLES.AGENCY: return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const filteredUsers = users.filter(u => {
    const matchesFilter = filter === 'all' || u.role === filter
    const matchesSearch = !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.name && u.name.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesSearch
  })

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
    setBillingForm({
      credits: '',
      creditOperation: 'add',
      outboundRate: '',
      inboundRate: ''
    })
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

      // Dispatch event to refresh sidebar credits
      window.dispatchEvent(new CustomEvent('creditsUpdated'))

      // Refresh user list
      await fetchUsers()

      // Close modal after short delay
      setTimeout(() => {
        closeBillingModal()
      }, 1000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update billing')
    } finally {
      setSaving(false)
    }
  }

  if (user?.role !== ROLES.OWNER) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Access Restricted</h3>
        <p className="text-gray-500 dark:text-gray-400">
          Only Owners can access user management.
        </p>
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
      {/* Header Card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">All Users</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage user credits and billing rates for all accounts.
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{users.length}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400">Total Users</div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-2">
          {['all', ROLES.OWNER, ROLES.AGENCY, ROLES.CLIENT].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">User</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Role</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Credits</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Outbound Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Inbound Rate</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Agency</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
                        {(u.name || u.email)[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">{u.name || 'Unnamed'}</div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getRoleBadgeColor(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="font-medium text-gray-900 dark:text-white">
                      ${(u.vapiCredits || 0).toFixed(2)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-gray-600 dark:text-gray-300">
                      ${(u.outboundRate || 0.10).toFixed(2)}/min
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-gray-600 dark:text-gray-300">
                      ${(u.inboundRate || 0.05).toFixed(2)}/min
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {u.agency ? (
                      <span className="text-sm text-gray-600 dark:text-gray-300">
                        {u.agency.name || u.agency.email}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <button
                      onClick={() => openBillingModal(u)}
                      className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Manage Billing
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filteredUsers.length === 0 && (
          <div className="p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">No users found</p>
          </div>
        )}
      </div>

      {/* Billing Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Manage Billing
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
                <span className="text-gray-500 dark:text-gray-400">Current Credits: </span>
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
                  Credits Adjustment
                </label>
                <div className="flex gap-2">
                  <select
                    value={billingForm.creditOperation}
                    onChange={(e) => setBillingForm({ ...billingForm, creditOperation: e.target.value })}
                    className="px-3 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="add">Add</option>
                    <option value="subtract">Subtract</option>
                    <option value="set">Set to</option>
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
                    Outbound Rate ($/min)
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
                    Inbound Rate ($/min)
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
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
