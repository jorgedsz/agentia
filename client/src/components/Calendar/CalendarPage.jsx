import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { googleCalendarAPI } from '../../services/api'

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function getMonthDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const daysInPrevMonth = new Date(year, month, 0).getDate()

  const days = []

  // Previous month padding
  for (let i = firstDay - 1; i >= 0; i--) {
    days.push({ day: daysInPrevMonth - i, currentMonth: false })
  }

  // Current month
  for (let i = 1; i <= daysInMonth; i++) {
    days.push({ day: i, currentMonth: true })
  }

  // Next month padding
  const remaining = 42 - days.length
  for (let i = 1; i <= remaining; i++) {
    days.push({ day: i, currentMonth: false })
  }

  return days
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function getEventDay(event) {
  const dateStr = event.start
  if (!dateStr) return null
  const d = new Date(dateStr)
  return d.getDate()
}

function getEventMonth(event) {
  const dateStr = event.start
  if (!dateStr) return null
  return new Date(dateStr).getMonth()
}

function getEventYear(event) {
  const dateStr = event.start
  if (!dateStr) return null
  return new Date(dateStr).getFullYear()
}

export default function CalendarPage() {
  const [searchParams] = useSearchParams()
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDay, setSelectedDay] = useState(null)
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState({ connected: false, email: null })
  const [statusLoading, setStatusLoading] = useState(true)
  const [connectingUrl, setConnectingUrl] = useState(null)
  const [toast, setToast] = useState(null)

  // Check for OAuth callback params
  useEffect(() => {
    const connected = searchParams.get('connected')
    const email = searchParams.get('email')
    const error = searchParams.get('error')

    if (connected === 'true') {
      setToast({ type: 'success', message: `Connected as ${email || 'Google Account'}` })
      setStatus({ connected: true, email })
      setStatusLoading(false)
    } else if (error) {
      setToast({ type: 'error', message: `Connection failed: ${error}` })
    }
  }, [searchParams])

  // Auto-dismiss toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [toast])

  const fetchStatus = useCallback(async () => {
    try {
      setStatusLoading(true)
      const { data } = await googleCalendarAPI.getStatus()
      setStatus(data)
    } catch (err) {
      console.error('Failed to fetch calendar status:', err)
    } finally {
      setStatusLoading(false)
    }
  }, [])

  const fetchEvents = useCallback(async () => {
    if (!status.connected) return
    setLoading(true)
    try {
      const timeMin = new Date(year, month, 1).toISOString()
      const timeMax = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
      const { data } = await googleCalendarAPI.getEvents({ timeMin, timeMax })
      setEvents(data.events || [])
    } catch (err) {
      console.error('Failed to fetch events:', err)
      setEvents([])
    } finally {
      setLoading(false)
    }
  }, [status.connected, year, month])

  useEffect(() => {
    if (!searchParams.get('connected')) {
      fetchStatus()
    }
  }, [fetchStatus, searchParams])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const handleConnect = async () => {
    try {
      const { data } = await googleCalendarAPI.connect()
      if (data.url) {
        window.location.href = data.url
      }
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to start connection' })
    }
  }

  const handleDisconnect = async () => {
    try {
      await googleCalendarAPI.disconnect()
      setStatus({ connected: false, email: null })
      setEvents([])
      setToast({ type: 'success', message: 'Google Calendar disconnected' })
    } catch (err) {
      setToast({ type: 'error', message: 'Failed to disconnect' })
    }
  }

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(y => y - 1) }
    else setMonth(m => m - 1)
    setSelectedDay(null)
  }

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(y => y + 1) }
    else setMonth(m => m + 1)
    setSelectedDay(null)
  }

  const goToday = () => {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDay(today.getDate())
  }

  const days = getMonthDays(year, month)

  // Map events to days
  const eventsByDay = {}
  events.forEach(e => {
    const d = getEventDay(e)
    const m = getEventMonth(e)
    const y = getEventYear(e)
    if (d && m === month && y === year) {
      if (!eventsByDay[d]) eventsByDay[d] = []
      eventsByDay[d].push(e)
    }
  })

  const selectedEvents = selectedDay ? (eventsByDay[selectedDay] || []) : events

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className={`mb-4 p-3 rounded-lg text-sm flex items-center gap-2 ${
          toast.type === 'success'
            ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400'
            : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400'
        }`}>
          {toast.type === 'success' ? (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Calendar</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">DWY events from Google Calendar</p>
        </div>

        {statusLoading ? (
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        ) : status.connected ? (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <div className="w-2 h-2 bg-green-500 rounded-full"></div>
              <span className="text-sm text-green-700 dark:text-green-400">Connected as {status.email}</span>
            </div>
            <button
              onClick={handleDisconnect}
              className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect Google Calendar
          </button>
        )}
      </div>

      {!status.connected && !statusLoading && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-dark-hover flex items-center justify-center">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No Calendar Connected</h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md mx-auto">
            Connect your Google Calendar to see all DWY events. This is a workspace-wide connection — once connected, all team members will see the same calendar.
          </p>
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Connect Google Calendar
          </button>
        </div>
      )}

      {status.connected && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Calendar Grid */}
          <div className="lg:col-span-2 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
            {/* Month navigation */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <button onClick={prevMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {MONTHS[month]} {year}
                </h2>
                <button onClick={goToday} className="px-2 py-1 text-xs font-medium text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 rounded transition-colors">
                  Today
                </button>
              </div>
              <button onClick={nextMonth} className="p-2 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 border-b border-gray-200 dark:border-dark-border">
              {DAYS.map(d => (
                <div key={d} className="py-2 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar cells */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              </div>
            ) : (
              <div className="grid grid-cols-7">
                {days.map((d, idx) => {
                  const isToday = d.currentMonth && d.day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                  const isSelected = d.currentMonth && d.day === selectedDay
                  const dayEvents = d.currentMonth ? (eventsByDay[d.day] || []) : []
                  const hasEvents = dayEvents.length > 0

                  return (
                    <button
                      key={idx}
                      onClick={() => d.currentMonth && setSelectedDay(d.day === selectedDay ? null : d.day)}
                      className={`relative min-h-[80px] p-2 border-b border-r border-gray-100 dark:border-dark-border text-left transition-colors ${
                        !d.currentMonth ? 'bg-gray-50 dark:bg-dark-bg/50' : ''
                      } ${isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-dark-hover'}`}
                    >
                      <span className={`inline-flex items-center justify-center w-7 h-7 text-sm rounded-full ${
                        isToday ? 'bg-primary-600 text-white font-bold' :
                        !d.currentMonth ? 'text-gray-300 dark:text-gray-600' :
                        'text-gray-700 dark:text-gray-300'
                      }`}>
                        {d.day}
                      </span>
                      {hasEvents && (
                        <div className="mt-1 space-y-0.5">
                          {dayEvents.slice(0, 2).map((e, i) => (
                            <div key={i} className="text-xs truncate px-1 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              {formatTime(e.start)} {e.summary}
                            </div>
                          ))}
                          {dayEvents.length > 2 && (
                            <div className="text-xs text-gray-400 dark:text-gray-500 px-1">
                              +{dayEvents.length - 2} more
                            </div>
                          )}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {/* Event list */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {selectedDay ? `Events on ${MONTHS[month]} ${selectedDay}` : `All Events in ${MONTHS[month]}`}
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {selectedEvents.length} DWY event{selectedEvents.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="overflow-y-auto max-h-[600px]">
              {selectedEvents.length === 0 ? (
                <div className="p-8 text-center">
                  <svg className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-sm text-gray-400 dark:text-gray-500">No DWY events found</p>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-dark-border">
                  {selectedEvents.map((event) => (
                    <div key={event.id} className="p-4 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="w-1 h-full min-h-[40px] bg-blue-500 rounded-full flex-shrink-0 mt-1"></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {event.summary}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            {formatDate(event.start)} {formatTime(event.start)} - {formatTime(event.end)}
                          </p>
                          {event.location && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 truncate">
                              {event.location}
                            </p>
                          )}
                          {event.description && (
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                        {event.htmlLink && (
                          <a
                            href={event.htmlLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 flex-shrink-0"
                            title="Open in Google Calendar"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </a>
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
    </div>
  )
}
