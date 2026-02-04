import { useState, useEffect } from 'react'
import { phoneNumbersAPI, agentsAPI, twilioAPI } from '../../services/api'

export default function PhoneNumbers() {
  const [phoneNumbers, setPhoneNumbers] = useState([])
  const [availableNumbers, setAvailableNumbers] = useState([])
  const [agents, setAgents] = useState([])
  const [credentials, setCredentials] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loadingAvailable, setLoadingAvailable] = useState(false)
  const [showImportModal, setShowImportModal] = useState(false)
  const [showAssignModal, setShowAssignModal] = useState(null)
  const [importing, setImporting] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Check for credentials first
      try {
        const credRes = await twilioAPI.getCredentials()
        setCredentials(credRes.data.credentials)
      } catch (err) {
        if (err.response?.status === 404) {
          setCredentials(null)
          setLoading(false)
          return
        }
        throw err
      }

      // Fetch phone numbers and agents in parallel
      const [numbersRes, agentsRes] = await Promise.all([
        phoneNumbersAPI.list(),
        agentsAPI.list()
      ])

      setPhoneNumbers(numbersRes.data.phoneNumbers)
      setAgents(agentsRes.data.agents)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load phone numbers')
    } finally {
      setLoading(false)
    }
  }

  const fetchAvailableNumbers = async () => {
    setLoadingAvailable(true)
    setError('')
    try {
      const response = await phoneNumbersAPI.listAvailable()
      setAvailableNumbers(response.data.phoneNumbers)
      setShowImportModal(true)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to fetch available numbers')
    } finally {
      setLoadingAvailable(false)
    }
  }

  const handleImport = async (number) => {
    setImporting(number.sid)
    setError('')
    try {
      await phoneNumbersAPI.import({
        twilioSid: number.sid,
        phoneNumber: number.phoneNumber,
        friendlyName: number.friendlyName
      })
      setSuccess(`Imported ${number.phoneNumber}`)
      setShowImportModal(false)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to import phone number')
    } finally {
      setImporting(null)
    }
  }

  const handleAssign = async (phoneNumberId, agentId) => {
    setError('')
    try {
      await phoneNumbersAPI.assignToAgent(phoneNumberId, agentId)
      setSuccess('Phone number assigned to agent')
      setShowAssignModal(null)
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign phone number')
    }
  }

  const handleUnassign = async (phoneNumberId) => {
    setError('')
    try {
      await phoneNumbersAPI.unassign(phoneNumberId)
      setSuccess('Phone number unassigned')
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to unassign phone number')
    }
  }

  const handleRemove = async (phoneNumber) => {
    if (!confirm(`Are you sure you want to remove ${phoneNumber.phoneNumber}? This will also remove it from VAPI.`)) {
      return
    }

    setError('')
    try {
      await phoneNumbersAPI.remove(phoneNumber.id)
      setSuccess('Phone number removed')
      await fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove phone number')
    }
  }

  const getStatusBadge = (status) => {
    const styles = {
      active: 'bg-green-500/20 text-green-400 border-green-500/30',
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      error: 'bg-red-500/20 text-red-400 border-red-500/30'
    }
    return styles[status] || styles.pending
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // No credentials setup
  if (!credentials) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
        <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Set Up Twilio First</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          You need to configure your Twilio credentials before you can manage phone numbers.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Go to Twilio Setup in the sidebar to add your credentials.
        </p>
      </div>
    )
  }

  // Credentials not verified
  if (!credentials.isVerified) {
    return (
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
        <div className="w-16 h-16 bg-yellow-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">Verify Your Credentials</h3>
        <p className="text-gray-500 dark:text-gray-400 mb-4">
          Please verify your Twilio credentials before managing phone numbers.
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Go to Twilio Setup and click "Verify Credentials".
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Status Messages */}
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

      {/* Phone Numbers List */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Your Phone Numbers</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Manage phone numbers imported from your Twilio account
            </p>
          </div>
          <button
            onClick={fetchAvailableNumbers}
            disabled={loadingAvailable}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {loadingAvailable ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Loading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Import Number
              </>
            )}
          </button>
        </div>

        {phoneNumbers.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Phone Numbers Yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">
              Import phone numbers from your Twilio account to use with your AI agents.
            </p>
            <button
              onClick={fetchAvailableNumbers}
              disabled={loadingAvailable}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              Import Your First Number
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Phone Number</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Friendly Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Assigned Agent</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {phoneNumbers.map((number) => (
                <tr key={number.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                    {number.phoneNumber}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {number.friendlyName || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusBadge(number.status)}`}>
                      {number.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    {number.agent ? (
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                        {number.agent.name}
                      </span>
                    ) : (
                      <span className="text-gray-400">Not assigned</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {number.agent ? (
                      <button
                        onClick={() => handleUnassign(number.id)}
                        className="text-yellow-500 hover:text-yellow-600 text-sm"
                      >
                        Unassign
                      </button>
                    ) : (
                      <button
                        onClick={() => setShowAssignModal(number)}
                        className="text-primary-500 hover:text-primary-600 text-sm"
                      >
                        Assign
                      </button>
                    )}
                    <button
                      onClick={() => handleRemove(number)}
                      className="text-red-500 hover:text-red-600 text-sm ml-3"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden border border-gray-200 dark:border-dark-border">
            <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Import Phone Number</h2>
              <button
                onClick={() => setShowImportModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {availableNumbers.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 dark:text-gray-400">No phone numbers found in your Twilio account.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {availableNumbers.map((number) => (
                    <div
                      key={number.sid}
                      className={`p-4 rounded-lg border ${
                        number.isImported
                          ? 'bg-gray-50 dark:bg-dark-hover border-gray-200 dark:border-dark-border opacity-60'
                          : 'bg-white dark:bg-dark-card border-gray-200 dark:border-dark-border hover:border-primary-500'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{number.phoneNumber}</div>
                          {number.friendlyName && (
                            <div className="text-sm text-gray-500 dark:text-gray-400">{number.friendlyName}</div>
                          )}
                          <div className="flex gap-2 mt-1">
                            {number.capabilities?.voice && (
                              <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 rounded">Voice</span>
                            )}
                            {number.capabilities?.sms && (
                              <span className="text-xs px-2 py-0.5 bg-green-500/10 text-green-400 rounded">SMS</span>
                            )}
                          </div>
                        </div>
                        {number.isImported ? (
                          <span className="text-sm text-gray-400">Already imported</span>
                        ) : (
                          <button
                            onClick={() => handleImport(number)}
                            disabled={importing === number.sid}
                            className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50"
                          >
                            {importing === number.sid ? 'Importing...' : 'Import'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full border border-gray-200 dark:border-dark-border">
            <div className="p-6 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Assign to Agent</h2>
              <button
                onClick={() => setShowAssignModal(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                Select an agent to handle calls for <span className="font-medium text-gray-900 dark:text-white">{showAssignModal.phoneNumber}</span>
              </p>

              {agents.length === 0 ? (
                <div className="text-center py-4">
                  <p className="text-gray-500 dark:text-gray-400">No agents available. Create an agent first.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {agents.map((agent) => (
                    <button
                      key={agent.id}
                      onClick={() => handleAssign(showAssignModal.id, agent.id)}
                      className="w-full p-3 rounded-lg border border-gray-200 dark:border-dark-border hover:border-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 transition-colors text-left"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium text-gray-900 dark:text-white">{agent.name}</div>
                          {agent.vapiId && (
                            <div className="text-xs text-green-500">VAPI Connected</div>
                          )}
                        </div>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="p-6 border-t border-gray-200 dark:border-dark-border">
              <button
                onClick={() => setShowAssignModal(null)}
                className="w-full px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
