import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { chatbotsAPI } from '../../services/api'

const RANGES = [
  { id: '7', label: '7 days' },
  { id: '30', label: '30 days' },
  { id: '90', label: '90 days' },
  { id: '365', label: '12 months' },
]

const fmt = (n) => `$${(Number(n) || 0).toFixed(4)}`
const fmtInt = (n) => Number(n || 0).toLocaleString()

export default function ChatbotCostReport() {
  const { user } = useAuth()
  const [range, setRange] = useState('30')
  const [rows, setRows] = useState([])
  const [since, setSince] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const isOwner = user?.role === 'OWNER'

  useEffect(() => {
    if (!isOwner) return
    fetchReport()
  }, [range])

  const fetchReport = async () => {
    setLoading(true)
    setError('')
    try {
      const sinceDate = new Date(Date.now() - parseInt(range, 10) * 24 * 60 * 60 * 1000).toISOString()
      const { data } = await chatbotsAPI.getCostReport(sinceDate)
      setRows(data.rows || [])
      setSince(data.since)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load report')
    } finally {
      setLoading(false)
    }
  }

  if (!isOwner) {
    return (
      <div className="p-8 text-gray-600 dark:text-gray-400">
        This report is only available to the platform owner.
      </div>
    )
  }

  const totals = rows.reduce(
    (acc, r) => ({
      messages: acc.messages + r.messages,
      charged: acc.charged + r.charged,
      realCost: acc.realCost + r.realCost,
      margin: acc.margin + r.margin,
    }),
    { messages: 0, charged: 0, realCost: 0, margin: 0 }
  )

  return (
    <div className="p-6 space-y-4 text-gray-800 dark:text-gray-200">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Chatbot Cost Report</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Compares what each chatbot's owner was charged against the real OpenAI cost we incurred.
          </p>
        </div>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={`px-3 py-1.5 rounded-md text-sm border transition ${
                range === r.id
                  ? 'bg-primary-600 border-primary-600 text-white'
                  : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-[#252830]'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {since && (
        <div className="text-xs text-gray-500 dark:text-gray-500">Since {new Date(since).toLocaleString()}</div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Messages" value={fmtInt(totals.messages)} />
        <SummaryCard label="Total Charged" value={fmt(totals.charged)} tone="pos" />
        <SummaryCard label="Real OpenAI Cost" value={fmt(totals.realCost)} tone="neg" />
        <SummaryCard label="Net Margin" value={fmt(totals.margin)} tone={totals.margin >= 0 ? 'pos' : 'neg'} />
      </div>

      {error && <div className="px-4 py-3 rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-sm">{error}</div>}

      <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 overflow-hidden bg-white dark:bg-[#1e2024]">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500 border-b border-gray-200 dark:border-gray-700/50">
                <th className="px-4 py-3 font-medium">Chatbot</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium text-right">Balance</th>
                <th className="px-4 py-3 font-medium text-right">Msgs</th>
                <th className="px-4 py-3 font-medium text-right">Tokens in</th>
                <th className="px-4 py-3 font-medium text-right">Tokens out</th>
                <th className="px-4 py-3 font-medium text-right">Charged</th>
                <th className="px-4 py-3 font-medium text-right">Real Cost</th>
                <th className="px-4 py-3 font-medium text-right">Margin</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-500">No chatbot activity in this window.</td></tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.chatbotId} className="border-b border-gray-200 dark:border-gray-700/50 last:border-b-0">
                    <td className="px-4 py-3 font-medium">{r.name}</td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{r.owner}</td>
                    <td className={`px-4 py-3 text-right font-mono ${(r.ownerBalance ?? 0) <= 0 ? 'text-red-500' : (r.ownerBalance ?? 0) < 10 ? 'text-yellow-500' : 'text-gray-600 dark:text-gray-400'}`}>{fmt(r.ownerBalance)}</td>
                    <td className="px-4 py-3 text-right font-mono">{fmtInt(r.messages)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{fmtInt(r.promptTokens)}</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-500">{fmtInt(r.completionTokens)}</td>
                    <td className="px-4 py-3 text-right font-mono text-green-500">{fmt(r.charged)}</td>
                    <td className="px-4 py-3 text-right font-mono text-red-400">{fmt(r.realCost)}</td>
                    <td className={`px-4 py-3 text-right font-mono ${r.margin >= 0 ? 'text-green-500' : 'text-red-400'}`}>{fmt(r.margin)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-500">
        Real cost reflects only chatbots whose n8n workflow has been re-synced after this feature was deployed.
        Run <code className="font-mono">npm run resync-workflows</code> on the server to backfill existing chatbots.
      </p>
    </div>
  )
}

function SummaryCard({ label, value, tone }) {
  const valueClass = tone === 'pos' ? 'text-green-500' : tone === 'neg' ? 'text-red-400' : 'text-gray-800 dark:text-gray-200'
  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700/50 bg-white dark:bg-[#1e2024] p-4">
      <div className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-mono ${valueClass}`}>{value}</div>
    </div>
  )
}
