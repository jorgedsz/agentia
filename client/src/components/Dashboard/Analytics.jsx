import { useState, useEffect, useMemo } from 'react'
import { callsAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'

const OUTCOME_COLORS = {
  booked: '#22c55e',
  answered: '#3b82f6',
  transferred: '#8b5cf6',
  not_interested: '#f59e0b',
  failed: '#ef4444',
  voicemail: '#6b7280',
  unknown: '#9ca3af'
}

const OUTCOME_LABELS = {
  booked: 'Booked',
  answered: 'Answered',
  transferred: 'Transferred',
  not_interested: 'Not Interested',
  failed: 'Failed',
  voicemail: 'Voicemail',
  unknown: 'Unknown'
}

const DATE_RANGE_KEYS = [
  { key: 'analytics.days7', value: '7d' },
  { key: 'analytics.days30', value: '30d' },
  { key: 'analytics.days90', value: '90d' },
  { key: 'analytics.allTime', value: 'all' }
]

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

export default function Analytics() {
  const { t } = useLanguage()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState('30d')
  const [agentId, setAgentId] = useState('')

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = {}
      if (agentId) params.agentId = agentId

      if (dateRange !== 'all') {
        const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
        const start = new Date()
        start.setDate(start.getDate() - days)
        params.startDate = start.toISOString()
      }

      const response = await callsAPI.getAnalytics(params)
      setData(response.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [dateRange, agentId])

  const pieData = useMemo(() => {
    if (!data?.outcomeCounts) return []
    return Object.entries(data.outcomeCounts)
      .filter(([, count]) => count > 0)
      .map(([key, value]) => ({
        name: OUTCOME_LABELS[key] || key,
        value,
        color: OUTCOME_COLORS[key] || '#9ca3af'
      }))
  }, [data])

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('analytics.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('analytics.subtitle')}</p>
        </div>
        <button
          onClick={fetchAnalytics}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden">
          {DATE_RANGE_KEYS.map((range) => (
            <button
              key={range.value}
              onClick={() => setDateRange(range.value)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                dateRange === range.value
                  ? 'bg-primary-600 text-white'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {t(range.key)}
            </button>
          ))}
        </div>
        {data?.agents?.length > 0 && (
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="px-4 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-sm text-gray-700 dark:text-gray-300"
          >
            <option value="">{t('analytics.allAgents')}</option>
            {data.agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard
          title={t('analytics.totalCalls')}
          value={data?.summary?.totalCalls || 0}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
          }
          color="blue"
        />
        <StatCard
          title={t('analytics.answerRate')}
          value={`${(data?.summary?.answerRate || 0).toFixed(1)}%`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="green"
        />
        <StatCard
          title={t('analytics.bookingRate')}
          value={`${(data?.summary?.bookingRate || 0).toFixed(1)}%`}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          }
          color="emerald"
        />
        <StatCard
          title={t('analytics.avgDuration')}
          value={formatDuration(data?.summary?.avgDuration || 0)}
          icon={
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
          color="violet"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Donut Chart */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">{t('analytics.outcomeDistribution')}</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    border: '1px solid var(--tooltip-border, #e5e7eb)',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">
              {t('analytics.noCallData')}
            </div>
          )}
        </div>

        {/* Stacked Bar Chart */}
        <div className="lg:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">{t('analytics.dailyCallOutcomes')}</h3>
          {data?.dailyCounts?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.dailyCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(val) => {
                    const d = new Date(val)
                    return `${d.getMonth() + 1}/${d.getDate()}`
                  }}
                />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'var(--tooltip-bg, #fff)',
                    border: '1px solid var(--tooltip-border, #e5e7eb)',
                    borderRadius: '8px',
                    fontSize: '13px'
                  }}
                />
                <Legend
                  formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{OUTCOME_LABELS[value] || value}</span>}
                />
                <Bar dataKey="booked" stackId="a" fill={OUTCOME_COLORS.booked} />
                <Bar dataKey="answered" stackId="a" fill={OUTCOME_COLORS.answered} />
                <Bar dataKey="transferred" stackId="a" fill={OUTCOME_COLORS.transferred} />
                <Bar dataKey="not_interested" stackId="a" fill={OUTCOME_COLORS.not_interested} />
                <Bar dataKey="failed" stackId="a" fill={OUTCOME_COLORS.failed} />
                <Bar dataKey="voicemail" stackId="a" fill={OUTCOME_COLORS.voicemail} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">
              {t('analytics.noCallData')}
            </div>
          )}
        </div>
      </div>

      {/* Outcome Breakdown Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('analytics.outcomeBreakdown')}</h3>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-dark-border">
          {Object.entries(OUTCOME_LABELS).map(([key, label]) => {
            const count = data?.outcomeCounts?.[key] || 0
            const total = data?.summary?.totalCalls || 0
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
            return (
              <div key={key} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: OUTCOME_COLORS[key] }}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{label}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{count}</span>
                  <span className="text-xs text-gray-400 w-12 text-right">{pct}%</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ title, value, icon, color }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400'
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400">{title}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}
