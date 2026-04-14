import { useState, useEffect, useMemo, useRef } from 'react'
import { callsAPI, chatbotMessagesAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'
import { useAuth } from '../../context/AuthContext'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'

const OUTCOME_COLORS = {
  booked: '#22c55e',
  answered: '#3b82f6',
  transferred: '#8b5cf6',
  not_interested: '#f59e0b',
  no_answer: '#f97316',
  failed: '#ef4444',
  voicemail: '#f97316',
  unknown: '#9ca3af'
}

const OUTCOME_LABELS = {
  booked: 'Booked',
  answered: 'Answered',
  transferred: 'Transferred',
  not_interested: 'Not Interested',
  no_answer: 'No Answer',
  failed: 'Failed',
  voicemail: 'No Answer',
  unknown: 'Unknown'
}

const DATE_RANGE_KEYS = [
  { key: 'analytics.days7', value: '7d' },
  { key: 'analytics.days30', value: '30d' },
  { key: 'analytics.days90', value: '90d' },
  { key: 'analytics.allTime', value: 'all' }
]

const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316']

const TOOLTIP_STYLE = {
  backgroundColor: 'var(--tooltip-bg, #fff)',
  border: '1px solid var(--tooltip-border, #e5e7eb)',
  borderRadius: '8px',
  fontSize: '13px'
}

function formatDuration(seconds) {
  if (!seconds) return '0s'
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  if (mins === 0) return `${secs}s`
  return `${mins}m ${secs}s`
}

function formatCurrency(amount) {
  return `$${(amount || 0).toFixed(2)}`
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function InfoTip({ text }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <span className="relative inline-flex ml-1" ref={ref}>
      <svg
        className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help shrink-0"
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={() => setOpen(!open)}
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {open && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 px-3 py-2 text-xs text-gray-700 dark:text-gray-200 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg shadow-lg pointer-events-none">
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-white dark:bg-dark-card border-r border-b border-gray-200 dark:border-dark-border rotate-45 -translate-y-1" />
          </div>
        </div>
      )}
    </span>
  )
}

function SectionTitle({ children, tip }) {
  return (
    <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 flex items-center">
      {children}
      {tip && <InfoTip text={tip} />}
    </h3>
  )
}

export default function Analytics() {
  const { t } = useLanguage()
  const { user } = useAuth()
  const [data, setData] = useState(null)
  const [advancedData, setAdvancedData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [dateRange, setDateRange] = useState('30d')
  const [agentId, setAgentId] = useState('')
  const [activeTab, setActiveTab] = useState('calls')

  const role = user?.role || 'CLIENT'

  const tabs = useMemo(() => {
    const allTabs = [
      { id: 'calls', label: t('analytics.tabCalls'), roles: ['OWNER', 'AGENCY', 'CLIENT'] },
      { id: 'chatbots', label: t('analytics.tabChatbots') || 'Chatbots', roles: ['OWNER', 'AGENCY', 'CLIENT'] },
      { id: 'revenue', label: t('analytics.tabRevenue'), roles: ['OWNER'] },
      { id: 'agents', label: t('analytics.tabAgents'), roles: ['OWNER', 'AGENCY', 'CLIENT'] },
      { id: 'clients', label: t('analytics.tabClients'), roles: ['OWNER', 'AGENCY'] },
      { id: 'growth', label: t('analytics.tabGrowth'), roles: ['OWNER', 'AGENCY'] }
    ]
    return allTabs.filter(tab => tab.roles.includes(role))
  }, [role, t])

  const dateParams = useMemo(() => {
    const params = {}
    if (dateRange !== 'all') {
      const days = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90
      const start = new Date()
      start.setDate(start.getDate() - days)
      params.startDate = start.toISOString()
    }
    return params
  }, [dateRange])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      setError(null)
      const params = { ...dateParams }
      if (agentId) params.agentId = agentId

      const [basicRes, advancedRes] = await Promise.all([
        callsAPI.getAnalytics(params),
        callsAPI.getAdvancedAnalytics(dateParams)
      ])
      setData(basicRes.data)
      setAdvancedData(advancedRes.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalytics()
  }, [dateRange, agentId])

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

      {/* Tab Bar */}
      <div className="flex bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border overflow-hidden mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-primary-600 text-white'
                : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-dark-hover'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter Bar (shared) */}
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
        {activeTab === 'calls' && data?.agents?.length > 0 && (
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

      {/* Tab Content */}
      {activeTab === 'calls' && <CallsTab data={data} advancedCalls={advancedData?.calls} t={t} />}
      {activeTab === 'chatbots' && <ChatbotsTab data={advancedData?.chatbots} t={t} />}
      {activeTab === 'revenue' && <RevenueTab data={advancedData?.revenue} t={t} />}
      {activeTab === 'agents' && <AgentsTab data={advancedData?.agents} t={t} />}
      {activeTab === 'clients' && <ClientsTab data={advancedData?.clients} t={t} />}
      {activeTab === 'growth' && <GrowthTab data={advancedData?.growth} t={t} />}
    </div>
  )
}

// ─── CALLS TAB (existing content) ───
function CallsTab({ data, advancedCalls, t }) {
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

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('analytics.totalCalls')} value={data?.summary?.totalCalls || 0}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>}
          color="blue" />
        <StatCard title={t('analytics.answerRate')} value={`${(data?.summary?.answerRate || 0).toFixed(1)}%`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="green" />
        <StatCard title={t('analytics.bookingRate')} value={`${(data?.summary?.bookingRate || 0).toFixed(1)}%`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
          color="emerald" />
        <StatCard title={t('analytics.avgDuration')} value={formatDuration(data?.summary?.avgDuration || 0)}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle tip={t('analytics.tipOutcomeDistribution')}>{t('analytics.outcomeDistribution')}</SectionTitle>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {pieData.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend verticalAlign="bottom" height={36}
                  formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">{t('analytics.noCallData')}</div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle tip={t('analytics.tipDailyOutcomes')}>{t('analytics.dailyCallOutcomes')}</SectionTitle>
          {data?.dailyCounts?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.dailyCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(val) => { const d = new Date(val); return `${d.getMonth() + 1}/${d.getDate()}` }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{OUTCOME_LABELS[value] || value}</span>} />
                <Bar dataKey="booked" stackId="a" fill={OUTCOME_COLORS.booked} />
                <Bar dataKey="answered" stackId="a" fill={OUTCOME_COLORS.answered} />
                <Bar dataKey="transferred" stackId="a" fill={OUTCOME_COLORS.transferred} />
                <Bar dataKey="not_interested" stackId="a" fill={OUTCOME_COLORS.not_interested} />
                <Bar dataKey="no_answer" stackId="a" fill={OUTCOME_COLORS.no_answer} />
                <Bar dataKey="failed" stackId="a" fill={OUTCOME_COLORS.failed} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">{t('analytics.noCallData')}</div>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <SectionTitle tip={t('analytics.tipOutcomeBreakdown')}>{t('analytics.outcomeBreakdown')}</SectionTitle>
        </div>
        <div className="divide-y divide-gray-200 dark:divide-dark-border">
          {Object.entries(OUTCOME_LABELS).map(([key, label]) => {
            const count = data?.outcomeCounts?.[key] || 0
            const total = data?.summary?.totalCalls || 0
            const pct = total > 0 ? ((count / total) * 100).toFixed(1) : '0.0'
            return (
              <div key={key} className="px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-full" style={{ backgroundColor: OUTCOME_COLORS[key] }} />
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

      {/* Advanced Call Quality: Inbound vs Outbound + End Reasons + Heatmap */}
      {advancedCalls && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6 mb-6">
            {/* Inbound vs Outbound */}
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
              <SectionTitle tip={t('analytics.tipInboundVsOutbound')}>{t('analytics.inboundVsOutbound')}</SectionTitle>
              {(advancedCalls.inboundVsOutbound?.inbound > 0 || advancedCalls.inboundVsOutbound?.outbound > 0) ? (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: t('analytics.inbound'), value: advancedCalls.inboundVsOutbound.inbound, color: '#3b82f6' },
                        { name: t('analytics.outbound'), value: advancedCalls.inboundVsOutbound.outbound, color: '#8b5cf6' }
                      ].filter(d => d.value > 0)}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value"
                    >
                      <Cell fill="#3b82f6" />
                      <Cell fill="#8b5cf6" />
                    </Pie>
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend verticalAlign="bottom" height={36}
                      formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              ) : <EmptyState message={t('analytics.noCallData')} />}
            </div>

            {/* End Reasons */}
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
              <SectionTitle tip={t('analytics.tipEndReasons')}>{t('analytics.endReasonsBreakdown')}</SectionTitle>
              {Object.keys(advancedCalls.endReasons || {}).length > 0 ? (
                <div className="space-y-2 max-h-[240px] overflow-y-auto">
                  {Object.entries(advancedCalls.endReasons)
                    .sort(([,a], [,b]) => b - a)
                    .map(([reason, count]) => {
                      const total = Object.values(advancedCalls.endReasons).reduce((s, v) => s + v, 0)
                      const pct = total > 0 ? ((count / total) * 100).toFixed(1) : 0
                      return (
                        <div key={reason} className="flex items-center justify-between text-sm">
                          <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{reason}</span>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                            <span className="text-xs text-gray-400 w-12 text-right">{pct}%</span>
                          </div>
                        </div>
                      )
                    })}
                </div>
              ) : <EmptyState message={t('analytics.noCallData')} />}
            </div>
          </div>

          {/* Heatmap */}
          {advancedCalls.hourlyHeatmap?.length > 0 && (
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
              <SectionTitle tip={t('analytics.tipHeatmap')}>{t('analytics.heatmapTitle')}</SectionTitle>
              <HeatmapChart data={advancedCalls.hourlyHeatmap} t={t} />
            </div>
          )}
        </>
      )}
    </>
  )
}

// ─── CHATBOTS TAB ───
function ChatbotsTab({ data, t }) {
  if (!data) return <EmptyState message={t('analytics.noChatbotData') || 'No chatbot data available'} />

  const STATUS_COLORS = {
    success: '#22c55e',
    error: '#ef4444'
  }

  const statusPieData = useMemo(() => {
    if (!data?.statusTotals) return []
    return Object.entries(data.statusTotals)
      .filter(([, count]) => count > 0)
      .map(([key, value]) => ({
        name: key === 'success' ? (t('analytics.success') || 'Success') : (t('analytics.error') || 'Error'),
        value,
        color: STATUS_COLORS[key] || '#9ca3af'
      }))
  }, [data, t])

  const bestSuccessRate = data.perChatbot?.length > 0 ? Math.max(...data.perChatbot.map(c => c.successRate)) : 0
  const avgCostPerMessage = data.totalMessages > 0 ? data.totalCost / data.totalMessages : 0

  // Utilization chart: pivot by date with chatbot names as keys
  const utilizationChartData = useMemo(() => {
    const dateMap = {}
    for (const row of data.utilizationByDay || []) {
      if (!dateMap[row.date]) dateMap[row.date] = { date: row.date }
      dateMap[row.date][row.chatbotName] = row.messages
    }
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  }, [data])

  const chatbotNames = useMemo(() => {
    const names = new Set()
    for (const row of data.utilizationByDay || []) names.add(row.chatbotName)
    return [...names]
  }, [data])

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('analytics.totalMessages') || 'Total Messages'} value={data.totalMessages || 0}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>}
          color="blue" />
        <StatCard title={t('analytics.totalChatbotCost') || 'Total Cost'} value={formatCurrency(data.totalCost)}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="green" />
        <StatCard title={t('analytics.bestSuccessRate') || 'Best Success Rate'} value={`${bestSuccessRate.toFixed(1)}%`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
          color="emerald" />
        <StatCard title={t('analytics.avgCostPerMessage') || 'Avg Cost/Message'} value={formatCurrency(avgCostPerMessage)}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
          color="violet" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Status Distribution */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle>{t('analytics.statusDistribution') || 'Status Distribution'}</SectionTitle>
          {statusPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {statusPieData.map((entry, index) => (<Cell key={index} fill={entry.color} />))}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend verticalAlign="bottom" height={36}
                  formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">{t('analytics.noChatbotData') || 'No data'}</div>
          )}
        </div>

        {/* Daily Message Volume */}
        <div className="lg:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle>{t('analytics.dailyMessageVolume') || 'Daily Message Volume'}</SectionTitle>
          {data.dailyCounts?.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.dailyCounts}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}
                  tickFormatter={(val) => { const d = new Date(val); return `${d.getMonth() + 1}/${d.getDate()}` }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend formatter={(value) => <span className="text-xs text-gray-600 dark:text-gray-400">{value === 'success' ? (t('analytics.success') || 'Success') : (t('analytics.error') || 'Error')}</span>} />
                <Bar dataKey="success" stackId="a" fill="#22c55e" />
                <Bar dataKey="error" stackId="a" fill="#ef4444" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[260px] text-gray-400 text-sm">{t('analytics.noChatbotData') || 'No data'}</div>
          )}
        </div>
      </div>

      {/* Per-Chatbot Performance Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <SectionTitle>{t('analytics.chatbotPerformance') || 'Chatbot Performance'}</SectionTitle>
        </div>
        {data.perChatbot?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">{t('analytics.chatbotName') || 'Chatbot'}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.totalMessages') || 'Messages'}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.success') || 'Success'}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.errors') || 'Errors'}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.successRateCol') || 'Success Rate'}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.costCol')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {data.perChatbot.map((c) => (
                  <tr key={c.chatbotId}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{c.totalMessages}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">{c.successCount}</td>
                    <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">{c.errorCount}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{c.successRate}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(c.totalCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-6 text-center text-gray-400 text-sm">{t('analytics.noChatbotData') || 'No chatbot data'}</div>}
      </div>

      {/* Chatbot Utilization Chart */}
      {utilizationChartData.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle>{t('analytics.chatbotUtilization') || 'Chatbot Utilization'}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={utilizationChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={(val) => { const d = new Date(val); return `${d.getMonth() + 1}/${d.getDate()}` }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v}</span>} />
              {chatbotNames.map((name, i) => (
                <Area key={name} type="monotone" dataKey={name} stackId="1"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.3} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

// ─── REVENUE TAB ───
function RevenueTab({ data, t }) {
  if (!data) return <EmptyState message={t('analytics.noCallData')} />

  const productPieData = (data.revenueByProduct || []).map((p, i) => ({
    name: p.productName, value: p.revenue, color: CHART_COLORS[i % CHART_COLORS.length]
  }))

  const billingData = Object.entries(data.revenueByBillingCycle || {}).map(([key, value]) => ({
    name: key.charAt(0).toUpperCase() + key.slice(1), value
  }))

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('analytics.mrr')} value={formatCurrency(data.mrr)} color="blue" tip={t('analytics.tipMrr')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title={t('analytics.arr')} value={formatCurrency(data.arr)} color="green" tip={t('analytics.tipArr')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>} />
        <StatCard title={t('analytics.activeSubscriptions')} value={data.totalActiveSubscriptions} color="emerald" tip={t('analytics.tipActiveSubscriptions')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>} />
        <StatCard title={t('analytics.creditsConsumed')} value={formatCurrency(data.creditsConsumed)} color="violet" tip={t('analytics.tipCreditsConsumed')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle tip={t('analytics.tipRevenueByProduct')}>{t('analytics.revenueByProduct')}</SectionTitle>
          {productPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={productPieData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                  {productPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                <Legend verticalAlign="bottom" height={36}
                  formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState message={t('analytics.noCallData')} />}
        </div>

        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle tip={t('analytics.tipRevenueByBillingCycle')}>{t('analytics.revenueByBillingCycle')}</SectionTitle>
          {billingData.some(d => d.value > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={billingData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState message={t('analytics.noCallData')} />}
        </div>
      </div>

      {/* Top Spenders Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <SectionTitle tip={t('analytics.tipTopSpenders')}>{t('analytics.topSpenders')}</SectionTitle>
        </div>
        {data.topSpenders?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-6 py-3">{t('common.name')}</th>
                  <th className="px-6 py-3">{t('common.email')}</th>
                  <th className="px-6 py-3 text-right">{t('analytics.costCol')}</th>
                  <th className="px-6 py-3 text-right">{t('analytics.creditsRemaining')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {data.topSpenders.map((s) => (
                  <tr key={s.userId}>
                    <td className="px-6 py-3 text-sm text-gray-900 dark:text-white">{s.name}</td>
                    <td className="px-6 py-3 text-sm text-gray-500 dark:text-gray-400">{s.email}</td>
                    <td className="px-6 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(s.totalCost)}</td>
                    <td className="px-6 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(s.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-6 text-center text-gray-400 text-sm">{t('analytics.noCallData')}</div>}
      </div>
    </>
  )
}

// ─── AGENTS TAB ───
function AgentsTab({ data, t }) {
  if (!data) return <EmptyState message={t('analytics.noCallData')} />

  const { perAgent, utilizationByDay } = data
  const bestBookingRate = perAgent.length > 0 ? Math.max(...perAgent.map(a => a.bookingRate)) : 0
  const totalAgents = perAgent.length
  const avgCostPerBooking = (() => {
    const withBookings = perAgent.filter(a => a.costPerBooking > 0)
    if (withBookings.length === 0) return 0
    return withBookings.reduce((s, a) => s + a.costPerBooking, 0) / withBookings.length
  })()
  const avgDurationAll = (() => {
    if (perAgent.length === 0) return 0
    return perAgent.reduce((s, a) => s + a.avgDuration, 0) / perAgent.length
  })()

  // Top 10 by booking rate (horizontal bar)
  const top10 = [...perAgent].sort((a, b) => b.bookingRate - a.bookingRate).slice(0, 10)

  // Utilization chart: pivot by date with agent names as keys
  const utilizationChartData = useMemo(() => {
    const dateMap = {}
    for (const row of utilizationByDay || []) {
      if (!dateMap[row.date]) dateMap[row.date] = { date: row.date }
      dateMap[row.date][row.agentName] = row.calls
    }
    return Object.values(dateMap).sort((a, b) => a.date.localeCompare(b.date))
  }, [utilizationByDay])

  const agentNames = useMemo(() => {
    const names = new Set()
    for (const row of utilizationByDay || []) names.add(row.agentName)
    return [...names]
  }, [utilizationByDay])

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('analytics.totalAgentsMetric')} value={totalAgents} color="blue"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard title={t('analytics.bestBookingRate')} value={`${bestBookingRate.toFixed(1)}%`} color="green" tip={t('analytics.tipBestBookingRate')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>} />
        <StatCard title={t('analytics.avgCostPerBooking')} value={formatCurrency(avgCostPerBooking)} color="emerald" tip={t('analytics.tipAvgCostPerBooking')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title={t('analytics.avgDuration')} value={formatDuration(avgDurationAll)} color="violet"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
      </div>

      {/* Top 10 Agents by Booking Rate */}
      {top10.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-6">
          <SectionTitle tip={t('analytics.tipBookingRateChart')}>{t('analytics.bookingRateCol')} — Top 10</SectionTitle>
          <ResponsiveContainer width="100%" height={Math.max(200, top10.length * 36)}>
            <BarChart data={top10} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#9ca3af' }} domain={[0, 100]} unit="%" />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: '#9ca3af' }} width={120} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
              <Bar dataKey="bookingRate" fill="#22c55e" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Agent Performance Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <SectionTitle tip={t('analytics.tipAgentPerformance')}>{t('analytics.agentPerformance')}</SectionTitle>
        </div>
        {perAgent.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">{t('analytics.agentName')}</th>
                  <th className="px-4 py-3">{t('analytics.agentType')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.calls')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.booked')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.bookingRateCol')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.avgDurationCol')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.costCol')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.costPerBooking')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {perAgent.map((a) => (
                  <tr key={a.agentId}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{a.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 capitalize">{a.agentType}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{a.totalCalls}</td>
                    <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">{a.booked}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{a.bookingRate}%</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{formatDuration(a.avgDuration)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(a.totalCost)}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{a.costPerBooking > 0 ? formatCurrency(a.costPerBooking) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-6 text-center text-gray-400 text-sm">{t('analytics.noCallData')}</div>}
      </div>

      {/* Agent Utilization Chart */}
      {utilizationChartData.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle tip={t('analytics.tipAgentUtilization')}>{t('analytics.agentUtilization')}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={utilizationChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }}
                tickFormatter={(val) => { const d = new Date(val); return `${d.getMonth() + 1}/${d.getDate()}` }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend formatter={(v) => <span className="text-xs text-gray-600 dark:text-gray-400">{v}</span>} />
              {agentNames.map((name, i) => (
                <Area key={name} type="monotone" dataKey={name} stackId="1"
                  stroke={CHART_COLORS[i % CHART_COLORS.length]} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.3} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

// ─── CLIENTS TAB ───
function ClientsTab({ data, t }) {
  if (!data) return <EmptyState message={t('analytics.noClientsData')} />

  const newClientsChartData = (data.newClientsOverTime || []).map(d => ({
    month: d.month, count: d.count
  }))

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title={t('analytics.totalClientsMetric')} value={data.totalClients || 0} color="blue" tip={t('analytics.tipTotalClients')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
        <StatCard title={t('analytics.activeClientsMetric')} value={data.activeClients || 0} color="green" tip={t('analytics.tipActiveClients')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>} />
        <StatCard title={t('analytics.atRiskClients')} value={data.atRiskClients?.length || 0} color="amber" tip={t('analytics.tipAtRisk')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>} />
        <StatCard title={t('analytics.newThisMonth')} value={data.newThisMonth || 0} color="violet" tip={t('analytics.tipNewThisMonth')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>} />
      </div>

      {/* New Clients Over Time */}
      {newClientsChartData.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-6">
          <SectionTitle tip={t('analytics.tipNewClientsOverTime')}>{t('analytics.newClientsOverTime')}</SectionTitle>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={newClientsChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Active Clients Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden mb-6">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dark-border">
          <SectionTitle tip={t('analytics.tipClientActivity')}>{t('analytics.clientActivity')}</SectionTitle>
        </div>
        {data.clientActivity?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">{t('common.name')}</th>
                  <th className="px-4 py-3">{t('common.email')}</th>
                  <th className="px-4 py-3">{t('analytics.lastCall')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.callsThisMonth')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.totalCalls')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.creditsRemaining')}</th>
                  <th className="px-4 py-3">{t('analytics.clientStatus')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {data.clientActivity.map((c) => (
                  <tr key={c.userId}>
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.lastCallDate || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{c.callsThisMonth}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{c.totalCalls}</td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(c.credits)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                        c.status === 'active'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                      }`}>{c.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="p-6 text-center text-gray-400 text-sm">{t('analytics.noClientsData')}</div>}
      </div>

      {/* At Risk Clients Table */}
      {data.atRiskClients?.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-red-200 dark:border-red-800/50 overflow-hidden">
          <div className="px-6 py-4 border-b border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-900/10">
            <h3 className="text-sm font-medium text-red-600 dark:text-red-400 flex items-center">{t('analytics.atRiskClients')}<InfoTip text={t('analytics.tipAtRiskTable')} /></h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <th className="px-4 py-3">{t('common.name')}</th>
                  <th className="px-4 py-3">{t('common.email')}</th>
                  <th className="px-4 py-3">{t('analytics.lastCall')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.daysSinceLastCall')}</th>
                  <th className="px-4 py-3 text-right">{t('analytics.creditsRemaining')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {data.atRiskClients.map((c) => (
                  <tr key={c.userId} className="bg-red-50/50 dark:bg-red-900/5">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">{c.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.email}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{c.lastCallDate || '—'}</td>
                    <td className="px-4 py-3 text-sm text-right">
                      <span className={`font-medium ${c.daysSinceLastCall > 60 ? 'text-red-600 dark:text-red-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {c.daysSinceLastCall}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900 dark:text-white">{formatCurrency(c.credits)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  )
}

// ─── GROWTH TAB ───
function GrowthTab({ data, t }) {
  if (!data) return <EmptyState message={t('analytics.noGrowthData')} />

  // Cumulative agents over time
  const cumulativeAgents = useMemo(() => {
    let cumulative = 0
    return (data.agentsOverTime || []).map(d => {
      cumulative += d.count
      return { month: d.month, count: cumulative }
    })
  }, [data])

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <StatCard title={t('analytics.totalAgentsMetric')} value={data.totalAgents || 0} color="blue"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
        <StatCard title={t('analytics.calendarIntegrations')} value={data.totalCalendarIntegrations || 0} color="green" tip={t('analytics.tipCalendarIntegrations')}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>} />
        <StatCard title={t('analytics.productsActive')} value={data.productAdoption?.length || 0} color="violet"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>} />
      </div>

      {/* Agents over time (cumulative) */}
      {cumulativeAgents.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-6">
          <SectionTitle tip={t('analytics.tipAgentsOverTime')}>{t('analytics.agentsOverTime')}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={cumulativeAgents}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} allowDecimals={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Product Adoption */}
      {data.productAdoption?.length > 0 && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <SectionTitle tip={t('analytics.tipProductAdoption')}>{t('analytics.productAdoption')}</SectionTitle>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.productAdoption}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="productName" tick={{ fontSize: 11, fill: '#9ca3af' }} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} domain={[0, 100]} unit="%" />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => `${v}%`} />
              <Bar dataKey="adoptionRate" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
                {data.productAdoption.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  )
}

// ─── HEATMAP COMPONENT ───
function HeatmapChart({ data, t }) {
  if (!data || data.length === 0) return <EmptyState message={t('analytics.noCallData')} />

  const maxCount = Math.max(...data.map(d => d.count), 1)

  // Build grid: 7 rows x 24 cols
  const grid = Array.from({ length: 7 }, () => Array(24).fill(0))
  for (const d of data) {
    grid[d.dayOfWeek][d.hour] = d.count
  }

  const getColor = (count) => {
    if (count === 0) return 'bg-gray-100 dark:bg-gray-800'
    const intensity = count / maxCount
    if (intensity < 0.25) return 'bg-blue-100 dark:bg-blue-900/30'
    if (intensity < 0.5) return 'bg-blue-300 dark:bg-blue-700/50'
    if (intensity < 0.75) return 'bg-blue-500 dark:bg-blue-600'
    return 'bg-blue-700 dark:bg-blue-500'
  }

  return (
    <div>
      <div className="flex">
        <div className="flex flex-col mr-2 justify-between py-1">
          {DAY_LABELS.map(d => (
            <div key={d} className="text-[10px] text-gray-400 h-5 flex items-center">{d}</div>
          ))}
        </div>
        <div className="flex-1">
          <div className="flex mb-1">
            {Array.from({ length: 24 }, (_, i) => (
              <div key={i} className="flex-1 text-center text-[9px] text-gray-400">{i}</div>
            ))}
          </div>
          {grid.map((row, dayIdx) => (
            <div key={dayIdx} className="flex gap-[1px] mb-[1px]">
              {row.map((count, hourIdx) => (
                <div
                  key={hourIdx}
                  className={`flex-1 h-5 rounded-sm ${getColor(count)} cursor-default`}
                  title={`${DAY_LABELS[dayIdx]} ${hourIdx}:00 — ${count} calls`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── SHARED COMPONENTS ───
function StatCard({ title, value, icon, color, tip }) {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400',
    green: 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-900/20 dark:text-violet-400',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
  }

  return (
    <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 rounded-lg ${colorMap[color] || colorMap.blue}`}>
          {icon}
        </div>
        <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">{title}{tip && <InfoTip text={tip} />}</span>
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  )
}

function EmptyState({ message }) {
  return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
      {message}
    </div>
  )
}
