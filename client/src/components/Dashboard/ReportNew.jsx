import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportsAPI, agentsAPI, chatbotsAPI } from '../../services/api'

const MODELS = [
  { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (recommended)' },
  { value: 'claude-opus-4-7', label: 'Claude Opus 4.7 (best quality)' },
  { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (fastest, cheapest)' }
]

const DATASETS = [
  { value: 'calls', label: 'Call logs' },
  { value: 'chatbots', label: 'Chatbot messages' },
  { value: 'both', label: 'Calls + chatbot messages' }
]

const OUTCOMES = ['answered', 'booked', 'not_interested', 'failed', 'transferred', 'voicemail', 'unknown']

const todayInput = () => new Date().toISOString().slice(0, 10)
const daysAgoInput = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

export default function ReportNew() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [prompt, setPrompt] = useState('')
  const [dataset, setDataset] = useState('calls')
  const [model, setModel] = useState('claude-sonnet-4-6')
  const [dateFrom, setDateFrom] = useState(daysAgoInput(7))
  const [dateTo, setDateTo] = useState(todayInput())
  const [agentIds, setAgentIds] = useState([])
  const [chatbotIds, setChatbotIds] = useState([])
  const [outcomes, setOutcomes] = useState([])
  const [limit, setLimit] = useState(200)
  const [agents, setAgents] = useState([])
  const [chatbots, setChatbots] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      agentsAPI.list().then((r) => setAgents(r.data.agents || [])).catch(() => {}),
      chatbotsAPI.list().then((r) => setChatbots(r.data.chatbots || [])).catch(() => {})
    ])
  }, [])

  const toggleArray = (arr, value, setter) => {
    setter(arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value])
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim() || !prompt.trim()) {
      setError('Name and prompt are required')
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const filters = {
        dateFrom,
        dateTo,
        limit: Number(limit) || 200
      }
      if (dataset !== 'chatbots' && agentIds.length) filters.agentIds = agentIds
      if (dataset !== 'calls' && chatbotIds.length) filters.chatbotIds = chatbotIds
      if (dataset !== 'chatbots' && outcomes.length) filters.outcomes = outcomes

      const { data } = await reportsAPI.create({ name, prompt, dataset, model, filters })
      navigate(`/dashboard/reports/${data.report.id}`)
    } catch (err) {
      const failedReport = err.response?.data?.report
      if (failedReport?.id) {
        navigate(`/dashboard/reports/${failedReport.id}`)
        return
      }
      setError(err.response?.data?.error || 'Failed to create report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 max-w-3xl">
      <button
        onClick={() => navigate('/dashboard/reports')}
        className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4"
      >
        ← Back to reports
      </button>

      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">New Report</h1>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Pick a dataset, set filters, write your prompt, and Claude will generate the report.
      </p>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Report name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g. Weekly outbound call summary"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Dataset</label>
            <select
              value={dataset}
              onChange={(e) => setDataset(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {DATASETS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MODELS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date from</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date to</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Max rows</label>
            <input
              type="number"
              min={1}
              max={500}
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {dataset !== 'chatbots' && agents.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Agents (optional)</label>
            <div className="flex flex-wrap gap-2">
              {agents.map((a) => (
                <button
                  type="button"
                  key={a.id}
                  onClick={() => toggleArray(agentIds, a.id, setAgentIds)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    agentIds.includes(a.id)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-dark-bg text-gray-700 dark:text-gray-300 border-gray-300 dark:border-dark-border'
                  }`}
                >
                  {a.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {dataset !== 'calls' && chatbots.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Chatbots (optional)</label>
            <div className="flex flex-wrap gap-2">
              {chatbots.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => toggleArray(chatbotIds, c.id, setChatbotIds)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    chatbotIds.includes(c.id)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-dark-bg text-gray-700 dark:text-gray-300 border-gray-300 dark:border-dark-border'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {dataset !== 'chatbots' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Call outcomes (optional)</label>
            <div className="flex flex-wrap gap-2">
              {OUTCOMES.map((o) => (
                <button
                  type="button"
                  key={o}
                  onClick={() => toggleArray(outcomes, o, setOutcomes)}
                  className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                    outcomes.includes(o)
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white dark:bg-dark-bg text-gray-700 dark:text-gray-300 border-gray-300 dark:border-dark-border'
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prompt *</label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            required
            rows={6}
            placeholder="Describe what you want from the report. e.g. 'Summarize the most common reasons customers declined the offer, with quoted examples and a count for each reason.'"
            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none font-mono text-sm"
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={() => navigate('/dashboard/reports')}
            disabled={submitting}
            className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="px-5 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            {submitting && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />}
            {submitting ? 'Generating…' : 'Run Report'}
          </button>
        </div>
      </form>
    </div>
  )
}
