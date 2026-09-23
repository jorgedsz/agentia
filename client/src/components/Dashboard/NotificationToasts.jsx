import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { notificationsAPI } from '../../services/api'

// Floating notices, bottom right. Whatever leaves a notice for this account —
// a budget request waiting on a decision, a decision on one, or any other app
// of yours posting to /api/notifications — shows up here within half a minute.
// Clicking one takes you where it points and marks it read.

const POLL_MS = 30000
const HIDE_AFTER_MS = 12000

export default function NotificationToasts() {
  const navigate = useNavigate()
  const [toasts, setToasts] = useState([])
  const seen = useRef(new Set())
  const started = useRef(false)

  useEffect(() => {
    let alive = true

    const poll = async () => {
      try {
        const { data } = await notificationsAPI.list(true)
        if (!alive) return
        const unread = data.notifications || []

        // The first poll only records what is already waiting: arriving at the
        // panel should not throw a week of notices on the screen at once.
        if (!started.current) {
          unread.forEach((n) => seen.current.add(n.id))
          started.current = true
          return
        }

        const fresh = unread.filter((n) => !seen.current.has(n.id))
        fresh.forEach((n) => seen.current.add(n.id))
        if (fresh.length) setToasts((current) => [...fresh.reverse(), ...current].slice(0, 4))
      } catch { /* a failed poll is not worth bothering anyone about */ }
    }

    poll()
    const timer = setInterval(poll, POLL_MS)
    return () => { alive = false; clearInterval(timer) }
  }, [])

  // Each notice fades on its own, so an older one does not outstay a newer.
  useEffect(() => {
    if (!toasts.length) return undefined
    const timer = setTimeout(() => setToasts((current) => current.slice(0, -1)), HIDE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [toasts])

  const dismiss = (id) => setToasts((current) => current.filter((t) => t.id !== id))

  const open = async (notice) => {
    dismiss(notice.id)
    try { await notificationsAPI.markRead(notice.id) } catch { /* it stays unread; no harm */ }
    if (notice.link) navigate(notice.link.replace(/^https?:\/\/[^/]+/, ''))
  }

  if (!toasts.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80 max-w-[calc(100vw-2rem)]">
      {toasts.map((notice) => (
        <div
          key={notice.id}
          className="bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-lg p-4 animate-[fadeIn_0.2s_ease-out]"
        >
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <button onClick={() => open(notice)} className="text-left w-full">
                <p className="text-sm font-medium text-gray-900 dark:text-white break-words">{notice.title}</p>
                {notice.body && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 break-words">{notice.body}</p>
                )}
              </button>
            </div>
            <button
              onClick={() => dismiss(notice.id)}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg leading-none"
              aria-label="Cerrar"
            >
              ×
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
