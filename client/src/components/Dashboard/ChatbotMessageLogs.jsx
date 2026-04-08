import { useState, useEffect, useRef } from 'react'
import { chatbotMessagesAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

const STATUS_CONFIG = {
  success: { label: 'Success', bg: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  error: { label: 'Error', bg: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
}

const PAGE_SIZE = 25

let _messagesCache = null

export default function ChatbotMessageLogs() {
  const { t } = useLanguage()
  const [messages, setMessages] = useState(_messagesCache?.messages || [])
  const [chatbots, setChatbots] = useState(_messagesCache?.chatbots || [])
  const [pagination, setPagination] = useState(_messagesCache?.pagination || { hasMore: false })
  const [analytics, setAnalytics] = useState(null)
  const [loading, setLoading] = useState(!_messagesCache)
  const [error, setError] = useState(null)
  const [selectedMessage, setSelectedMessage] = useState(null)
  const [cursorStack, setCursorStack] = useState([])
  const [currentCursor, setCurrentCursor] = useState(null)

  const [filters, setFilters] = useState({
    chatbotId: '',
    dateFrom: '',
    dateTo: '',
    search: '',
  })
  const [showFilters, setShowFilters] = useState(false)
  const isInitialMount = useRef(true)

  useEffect(() => {
    fetchMessages()
    fetchAnalytics()
  }, [])

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      return
    }
    setCursorStack([])
    setCurrentCursor(null)
    fetchMessages()
    fetchAnalytics()
  }, [filters.chatbotId, filters.dateFrom, filters.dateTo])

  const fetchMessages = async (createdAtLt) => {
    try {
      setLoading(true)
      const params = { limit: PAGE_SIZE }
      if (createdAtLt) {
        params.createdAtLt = createdAtLt
      } else if (filters.dateTo) {
        params.createdAtLt = new Date(filters.dateTo + 'T23:59:59.999Z').toISOString()
      }
      if (filters.dateFrom) params.createdAtGt = new Date(filters.dateFrom + 'T00:00:00.000Z').toISOString()
      if (filters.chatbotId) params.chatbotId = filters.chatbotId
      if (filters.search) params.search = filters.search

      const response = await chatbotMessagesAPI.list(params)
      const data = response.data.messages || []
      const pag = response.data.pagination || { hasMore: false }
      const chatbotsList = response.data.chatbots || []
      setMessages(data)
      setPagination(pag)
      if (chatbotsList.length > 0) setChatbots(chatbotsList)
      _messagesCache = { messages: data, pagination: pag, chatbots: chatbotsList.length > 0 ? chatbotsList : (_messagesCache?.chatbots || []) }
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
    } catch (err) {
      setError(err.response?.data?.error || t('messageLogs.fetchError'))
    } finally {
      setLoading(false)
    }
  }

  const fetchAnalytics = async () => {
    try {
      const params = {}
      if (filters.chatbotId) params.chatbotId = filters.chatbotId
      if (filters.dateFrom) params.startDate = filters.dateFrom
      if (filters.dateTo) params.endDate = filters.dateTo
      const response = await chatbotMessagesAPI.getAnalytics(params)
      setAnalytics(response.data)
    } catch {
      // non-critical
    }
  }

  const handleNextPage = () => {
    if (!pagination.nextCursor) return
    setCursorStack(prev => [...prev, currentCursor])
    setCurrentCursor(pagination.nextCursor)
    fetchMessages(pagination.nextCursor)
  }

  const handlePrevPage = () => {
    const prev = [...cursorStack]
    const cursor = prev.pop()
    setCursorStack(prev)
    setCurrentCursor(cursor)
    fetchMessages(cursor || undefined)
  }

  const handleSearchSubmit = (e) => {
    e.preventDefault()
    setCursorStack([])
    setCurrentCursor(null)
    fetchMessages()
  }

  const clearFilters = () => {
    setFilters({ chatbotId: '', dateFrom: '', dateTo: '', search: '' })
    setCursorStack([])
    setCurrentCursor(null)
  }

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length

  const formatDate = (dateString) => {
    if (!dateString) return '-'
    return new Date(dateString).toLocaleString()
  }

  const truncate = (str, len = 60) => {
    if (!str) return '-'
    return str.length > len ? str.substring(0, len) + '...' : str
  }

  if (loading && messages.length === 0) {
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('messageLogs.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">{t('messageLogs.subtitle')}</p>
        </div>
        <button
          onClick={() => { fetchMessages(); fetchAnalytics(); }}
          disabled={loading}
          className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 flex items-center gap-2 disabled:opacity-50"
        >
          <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {t('common.refresh')}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('common.dismiss')}</button>
        </div>
      )}

      {/* Summary Cards */}
      {analytics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('messageLogs.totalMessages')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{analytics.summary.totalMessages.toLocaleString()}</p>
          </div>
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">{t('messageLogs.totalCost')}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">${analytics.summary.totalCost.toFixed(2)}</p>
          </div>
          {analytics.chatbotBreakdown.length > 0 && analytics.chatbotBreakdown.slice(0, 2).map(b => (
            <div key={b.chatbotId} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase truncate">{b.chatbotName}</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">{b.count.toLocaleString()}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500">${b.cost.toFixed(2)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {t('messageLogs.filters')}
          {activeFilterCount > 0 && (
            <span className="px-1.5 py-0.5 text-xs bg-primary-100 text-primary-600 dark:bg-primary-900/30 dark:text-primary-400 rounded-full">
              {activeFilterCount}
            </span>
          )}
        </button>

        {showFilters && (
          <div className="mt-3 p-4 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
            <form onSubmit={handleSearchSubmit} className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {/* Chatbot */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('messageLogs.chatbot')}
                </label>
                <select
                  value={filters.chatbotId}
                  onChange={(e) => setFilters(prev => ({ ...prev, chatbotId: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300"
                >
                  <option value="">{t('messageLogs.allChatbots')}</option>
                  {chatbots.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              {/* Date From */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('messageLogs.dateFrom')}
                </label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300"
                />
              </div>

              {/* Date To */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('messageLogs.dateTo')}
                </label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300"
                />
              </div>

              {/* Search */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  {t('messageLogs.search')}
                </label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={filters.search}
                    onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                    placeholder={t('messageLogs.searchPlaceholder')}
                    className="flex-1 px-3 py-1.5 text-sm bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 placeholder-gray-400"
                  />
                  <button
                    type="submit"
                    className="px-3 py-1.5 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </button>
                </div>
              </div>
            </form>

            {activeFilterCount > 0 && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  {t('messageLogs.clearFilters')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selectedMessage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto border border-gray-200 dark:border-dark-border">
            <div className="sticky top-0 bg-white dark:bg-dark-card border-b border-gray-200 dark:border-dark-border px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{t('messageLogs.messageDetails')}</h3>
              <button
                onClick={() => setSelectedMessage(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('messageLogs.chatbot')}</label>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{selectedMessage.chatbotName}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('common.status')}</label>
                  <p>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${(STATUS_CONFIG[selectedMessage.status] || STATUS_CONFIG.success).bg}`}>
                      {(STATUS_CONFIG[selectedMessage.status] || STATUS_CONFIG.success).label}
                    </span>
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('messageLogs.date')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">{formatDate(selectedMessage.createdAt)}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('messageLogs.session')}</label>
                  <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{selectedMessage.sessionId}</p>
                </div>
                {selectedMessage.contactName && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{t('messageLogs.contact')}</label>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedMessage.contactName}</p>
                  </div>
                )}
                {selectedMessage.contactId && (
                  <div>
                    <label className="text-xs text-gray-500 dark:text-gray-400">{t('messageLogs.contactId')}</label>
                    <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{selectedMessage.contactId}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs text-gray-500 dark:text-gray-400">{t('messageLogs.cost')}</label>
                  <p className="text-sm text-gray-900 dark:text-white">${selectedMessage.costCharged?.toFixed(4)}</p>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('messageLogs.inputMessage')}</label>
                <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4 max-h-40 overflow-y-auto">
                  <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">{selectedMessage.inputMessage}</pre>
                </div>
              </div>

              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 mb-2 block">{t('messageLogs.outputMessage')}</label>
                <div className="bg-gray-50 dark:bg-dark-hover rounded-lg p-4 max-h-64 overflow-y-auto">
                  <pre className="text-sm text-gray-900 dark:text-white whitespace-pre-wrap font-sans">{selectedMessage.outputMessage || '-'}</pre>
                </div>
              </div>

              {selectedMessage.errorMessage && (
                <div>
                  <label className="text-xs text-red-500 dark:text-red-400 mb-2 block">{t('messageLogs.errorMessage')}</label>
                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                    <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap font-sans">{selectedMessage.errorMessage}</pre>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Messages Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('messageLogs.noMessagesYet')}</h3>
            <p className="text-gray-500 dark:text-gray-400">{t('messageLogs.noMessagesDesc')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.date')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.chatbot')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.session')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.contact')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.message')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.response')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('messageLogs.cost')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.status')}
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {formatDate(msg.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {msg.chatbotName || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {truncate(msg.sessionId, 16)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      {msg.contactName || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 dark:text-white max-w-[200px]">
                      <span className="block truncate">{truncate(msg.inputMessage, 50)}</span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-[200px]">
                      <span className="block truncate">{truncate(msg.outputMessage, 50)}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                      ${msg.costCharged?.toFixed(2) || '0.00'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${(STATUS_CONFIG[msg.status] || STATUS_CONFIG.success).bg}`}>
                        {(STATUS_CONFIG[msg.status] || STATUS_CONFIG.success).label}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedMessage(msg)}
                        className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium"
                      >
                        {t('common.viewDetails')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {messages.length > 0 && (
        <div className="flex items-center justify-between mt-4">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t('messageLogs.showing')} {messages.length} {t('messageLogs.messages')}
          </p>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={cursorStack.length === 0 || loading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.previous')}
            </button>
            <button
              onClick={handleNextPage}
              disabled={!pagination.hasMore || loading}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
