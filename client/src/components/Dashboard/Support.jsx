import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { ticketsAPI } from '../../services/api'

const STATUS_COLORS = {
  open: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  in_progress: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  closed: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
}

const PRIORITY_COLORS = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

const TUTORIALS = [
  {
    id: 1,
    title: 'Getting Started with Agentia',
    description: 'Learn how to create your first AI voice agent, configure it, and make your first test call.',
    category: 'getting-started',
    duration: '5 min',
    icon: '🚀',
  },
  {
    id: 2,
    title: 'Creating an Outbound Agent',
    description: 'Step-by-step guide to set up an outbound calling agent with custom prompts and voice settings.',
    category: 'agents',
    duration: '8 min',
    icon: '📞',
  },
  {
    id: 3,
    title: 'Creating an Inbound Agent',
    description: 'Configure an inbound agent to handle incoming calls, assign phone numbers, and set up routing.',
    category: 'agents',
    duration: '7 min',
    icon: '📥',
  },
  {
    id: 4,
    title: 'Connecting Phone Numbers',
    description: 'Import and manage Twilio phone numbers, assign them to agents for inbound and outbound calls.',
    category: 'phone',
    duration: '4 min',
    icon: '📱',
  },
  {
    id: 5,
    title: 'Calendar Integration Setup',
    description: 'Connect Google Calendar, Calendly, HubSpot, or Cal.com to let your agents book appointments.',
    category: 'integrations',
    duration: '6 min',
    icon: '📅',
  },
  {
    id: 6,
    title: 'Custom Voice Configuration',
    description: 'Choose and customize AI voices from ElevenLabs, configure speed, stability, and language settings.',
    category: 'agents',
    duration: '5 min',
    icon: '🎙️',
  },
  {
    id: 7,
    title: 'Managing Credits & Billing',
    description: 'Understand the credit system, add funds, monitor usage, and manage billing for your account.',
    category: 'billing',
    duration: '3 min',
    icon: '💳',
  },
  {
    id: 8,
    title: 'API & Webhook Integration',
    description: 'Use the trigger API to initiate calls programmatically and configure webhooks for call events.',
    category: 'integrations',
    duration: '10 min',
    icon: '🔗',
  },
]

const TUTORIAL_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'getting-started', label: 'Getting Started' },
  { id: 'agents', label: 'Agents' },
  { id: 'phone', label: 'Phone Numbers' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'billing', label: 'Billing' },
]

export default function Support() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [activeTab, setActiveTab] = useState('tickets')
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [ticketDetail, setTicketDetail] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [showNewModal, setShowNewModal] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replying, setReplying] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newTicket, setNewTicket] = useState({ title: '', description: '', priority: 'medium', category: 'general' })
  const [tutorialFilter, setTutorialFilter] = useState('all')
  const repliesEndRef = useRef(null)

  useEffect(() => {
    fetchTickets()
  }, [filterStatus])

  useEffect(() => {
    if (repliesEndRef.current) {
      repliesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [ticketDetail?.replies?.length])

  const fetchTickets = async () => {
    try {
      setLoading(true)
      const res = await ticketsAPI.list(filterStatus !== 'all' ? filterStatus : undefined)
      setTickets(res.data)
    } catch (err) {
      setError(t('support.loadError'))
    } finally {
      setLoading(false)
    }
  }

  const fetchTicketDetail = async (id) => {
    try {
      setDetailLoading(true)
      const res = await ticketsAPI.get(id)
      setTicketDetail(res.data)
    } catch (err) {
      setError(t('support.loadError'))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleSelectTicket = (ticket) => {
    setSelectedTicket(ticket.id)
    fetchTicketDetail(ticket.id)
  }

  const handleBack = () => {
    setSelectedTicket(null)
    setTicketDetail(null)
    setReplyText('')
    fetchTickets()
  }

  const handleCreateTicket = async (e) => {
    e.preventDefault()
    if (!newTicket.title.trim() || !newTicket.description.trim()) return
    try {
      setCreating(true)
      await ticketsAPI.create(newTicket)
      setShowNewModal(false)
      setNewTicket({ title: '', description: '', priority: 'medium', category: 'general' })
      fetchTickets()
    } catch (err) {
      setError(t('support.createError'))
    } finally {
      setCreating(false)
    }
  }

  const handleReply = async (e) => {
    e.preventDefault()
    if (!replyText.trim()) return
    try {
      setReplying(true)
      await ticketsAPI.addReply(selectedTicket, replyText)
      setReplyText('')
      fetchTicketDetail(selectedTicket)
    } catch (err) {
      setError(t('support.replyError'))
    } finally {
      setReplying(false)
    }
  }

  const handleStatusChange = async (status) => {
    try {
      await ticketsAPI.updateStatus(selectedTicket, status)
      fetchTicketDetail(selectedTicket)
    } catch (err) {
      setError(t('support.statusError'))
    }
  }

  const handleDelete = async (id) => {
    if (!confirm(t('support.confirmDelete'))) return
    try {
      await ticketsAPI.delete(id)
      handleBack()
    } catch (err) {
      setError(t('support.deleteError'))
    }
  }

  const statusTabs = ['all', 'open', 'in_progress', 'resolved', 'closed']

  const formatDate = (dateStr) => {
    const d = new Date(dateStr)
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  // Ticket Detail View
  if (selectedTicket && ticketDetail) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        {/* Back button */}
        <button onClick={handleBack} className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-4 text-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {t('support.backToTickets')}
        </button>

        {/* Ticket header */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-4">
          <div className="flex items-start justify-between mb-3">
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{ticketDetail.title}</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                #{ticketDetail.id} &middot; {ticketDetail.user.name || ticketDetail.user.email} &middot; {formatDate(ticketDetail.createdAt)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${PRIORITY_COLORS[ticketDetail.priority]}`}>
                {t(`support.priority_${ticketDetail.priority}`)}
              </span>
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[ticketDetail.status]}`}>
                {t(`support.status_${ticketDetail.status}`)}
              </span>
            </div>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {t(`support.category_${ticketDetail.category}`)}
          </p>
          <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{ticketDetail.description}</p>

          {/* Status control for OWNER + delete */}
          {user?.role === 'OWNER' && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border flex items-center gap-3">
              <label className="text-sm text-gray-600 dark:text-gray-400">{t('support.changeStatus')}:</label>
              <select
                value={ticketDetail.status}
                onChange={(e) => handleStatusChange(e.target.value)}
                className="text-sm rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white px-3 py-1.5"
              >
                <option value="open">{t('support.status_open')}</option>
                <option value="in_progress">{t('support.status_in_progress')}</option>
                <option value="resolved">{t('support.status_resolved')}</option>
                <option value="closed">{t('support.status_closed')}</option>
              </select>
              <button
                onClick={() => handleDelete(ticketDetail.id)}
                className="ml-auto text-sm text-red-600 hover:text-red-700 dark:text-red-400"
              >
                {t('common.delete')}
              </button>
            </div>
          )}

          {/* Non-owner can close their own ticket */}
          {user?.role !== 'OWNER' && ticketDetail.userId === user?.id && ticketDetail.status !== 'closed' && (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-dark-border">
              <button
                onClick={() => handleStatusChange('closed')}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              >
                {t('support.closeTicket')}
              </button>
            </div>
          )}
        </div>

        {/* Replies thread */}
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-4">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-4">{t('support.replies')} ({ticketDetail.replies.length})</h3>

          {ticketDetail.replies.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">{t('support.noReplies')}</p>
          ) : (
            <div className="space-y-4">
              {ticketDetail.replies.map((reply) => (
                <div
                  key={reply.id}
                  className={`p-4 rounded-lg ${reply.isStaff ? 'border-l-4 border-primary-500 bg-primary-50 dark:bg-primary-900/10' : 'bg-gray-50 dark:bg-dark-bg'}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center text-white text-xs font-medium">
                      {(reply.user.name || reply.user.email || 'U')[0].toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                      {reply.user.name || reply.user.email}
                    </span>
                    {reply.isStaff && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400">
                        {t('support.staff')}
                      </span>
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400 ml-auto">
                      {formatDate(reply.createdAt)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{reply.message}</p>
                </div>
              ))}
              <div ref={repliesEndRef} />
            </div>
          )}
        </div>

        {/* Reply input */}
        {ticketDetail.status !== 'closed' && (
          <form onSubmit={handleReply} className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4">
            <textarea
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder={t('support.replyPlaceholder')}
              rows={3}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
            <div className="flex justify-end mt-2">
              <button
                type="submit"
                disabled={replying || !replyText.trim()}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {replying ? t('support.sending') : t('support.sendReply')}
              </button>
            </div>
          </form>
        )}
      </div>
    )
  }

  // Detail loading state
  if (selectedTicket && detailLoading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  const filteredTutorials = tutorialFilter === 'all'
    ? TUTORIALS
    : TUTORIALS.filter(t => t.category === tutorialFilter)

  // Ticket List View
  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('support.title')}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('support.subtitle')}</p>
        </div>
        {activeTab === 'tickets' && (
          <button
            onClick={() => setShowNewModal(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
            {t('support.newTicket')}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-center justify-between">
          <span className="text-sm text-red-700 dark:text-red-400">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Main Tabs: Tickets / Tutorials */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-dark-bg rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab('tickets')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'tickets'
              ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
          </svg>
          Tickets
        </button>
        <button
          onClick={() => setActiveTab('tutorials')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'tutorials'
              ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
              : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Tutorials
        </button>
      </div>

      {/* Tickets Tab */}
      {activeTab === 'tickets' && (
        <>
          {/* Filter tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-dark-bg rounded-lg p-1 w-fit">
            {statusTabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setFilterStatus(tab)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  filterStatus === tab
                    ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {t(`support.tab_${tab}`)}
              </button>
            ))}
          </div>

          {/* Loading */}
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : tickets.length === 0 ? (
            <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
              <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('support.noTickets')}</h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4">{t('support.noTicketsDesc')}</p>
              <button
                onClick={() => setShowNewModal(true)}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700"
              >
                {t('support.createFirst')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  onClick={() => handleSelectTicket(ticket)}
                  className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{ticket.title}</h3>
                        <span className="text-xs text-gray-400">#{ticket.id}</span>
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-1">{ticket.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>{ticket.user.name || ticket.user.email}</span>
                        <span>&middot;</span>
                        <span>{formatDate(ticket.createdAt)}</span>
                        <span>&middot;</span>
                        <span>{ticket._count.replies} {t('support.repliesCount')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PRIORITY_COLORS[ticket.priority]}`}>
                        {t(`support.priority_${ticket.priority}`)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[ticket.status]}`}>
                        {t(`support.status_${ticket.status}`)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Tutorials Tab */}
      {activeTab === 'tutorials' && (
        <>
          {/* Category filter */}
          <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-dark-bg rounded-lg p-1 w-fit">
            {TUTORIAL_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setTutorialFilter(cat.id)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  tutorialFilter === cat.id
                    ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Tutorials grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredTutorials.map((tutorial) => (
              <div
                key={tutorial.id}
                className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
              >
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700/50 flex items-center justify-center text-lg flex-shrink-0">
                    {tutorial.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{tutorial.title}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{tutorial.description}</p>
                    <div className="flex items-center gap-3 mt-3">
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded border border-gray-200 dark:border-gray-600/40 text-gray-500 dark:text-gray-400">
                        {TUTORIAL_CATEGORIES.find(c => c.id === tutorial.category)?.label}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {tutorial.duration}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* New Ticket Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-lg mx-4 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('support.newTicket')}</h2>
              <button onClick={() => setShowNewModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('support.ticketTitle')}</label>
                <input
                  type="text"
                  value={newTicket.title}
                  onChange={(e) => setNewTicket({ ...newTicket, title: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('support.titlePlaceholder')}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('support.description')}</label>
                <textarea
                  value={newTicket.description}
                  onChange={(e) => setNewTicket({ ...newTicket, description: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder={t('support.descriptionPlaceholder')}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('support.priority')}</label>
                  <select
                    value={newTicket.priority}
                    onChange={(e) => setNewTicket({ ...newTicket, priority: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  >
                    <option value="low">{t('support.priority_low')}</option>
                    <option value="medium">{t('support.priority_medium')}</option>
                    <option value="high">{t('support.priority_high')}</option>
                    <option value="urgent">{t('support.priority_urgent')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('support.category')}</label>
                  <select
                    value={newTicket.category}
                    onChange={(e) => setNewTicket({ ...newTicket, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  >
                    <option value="general">{t('support.category_general')}</option>
                    <option value="billing">{t('support.category_billing')}</option>
                    <option value="technical">{t('support.category_technical')}</option>
                    <option value="feature_request">{t('support.category_feature_request')}</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewModal(false)}
                  className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50"
                >
                  {creating ? t('common.creating') : t('support.createTicket')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
