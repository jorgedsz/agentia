import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsAPI } from '../../services/api'

const STATUS_STYLES = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400',
  running: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  done: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

const DATASET_LABELS = {
  calls: 'Calls',
  chatbots: 'Chatbots',
  both: 'Calls + Chatbots'
}

export default function ReportsList() {
  const navigate = useNavigate()
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchReports()
  }, [])

  const fetchReports = async () => {
    setLoading(true)
    try {
      const { data } = await reportsAPI.list()
      setReports(data.reports || [])
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load reports')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete report "${name}"?`)) return
    try {
      await reportsAPI.delete(id)
      setReports((prev) => prev.filter((r) => r.id !== id))
    } catch (err) {
      window.alert(err.response?.data?.error || 'Failed to delete report')
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600" />
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Generate analyses of your calls and chatbot conversations using Claude.
          </p>
        </div>
        <button
          onClick={() => navigate('/dashboard/reports/new')}
          className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Report
        </button>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      {reports.length === 0 ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No reports yet</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            Create your first report to summarize and analyze your data.
          </p>
          <button
            onClick={() => navigate('/dashboard/reports/new')}
            className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
          >
            Create Report
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-dark-hover text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Dataset</th>
                <th className="px-4 py-3">Model</th>
                <th className="px-4 py-3">Rows</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dark-border">
              {reports.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover/50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.name}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{DATASET_LABELS[r.dataset] || r.dataset}</td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400 font-mono text-xs">{r.model}</td>
                  <td className="px-4 py-3 text-gray-600 dark:text-gray-300">{r.rowsUsed ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[r.status] || STATUS_STYLES.pending}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                    {new Date(r.createdAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button
                      onClick={() => navigate(`/dashboard/reports/${r.id}`)}
                      className="text-primary-600 dark:text-primary-400 hover:underline text-xs font-medium"
                    >
                      View
                    </button>
                    <button
                      onClick={() => handleDelete(r.id, r.name)}
                      className="text-red-500 hover:underline text-xs font-medium"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
