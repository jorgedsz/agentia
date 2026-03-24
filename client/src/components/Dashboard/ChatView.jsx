import { useState, useEffect, useRef } from 'react'

export default function ChatView({ messages, loadingMessages, onSend }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!text.trim() || sending) return
    setSending(true)
    try {
      await onSend(text.trim())
      setText('')
    } catch (err) {
      console.error('Send failed:', err)
    } finally {
      setSending(false)
    }
  }

  const formatTime = (ts) => {
    if (!ts) return ''
    const date = new Date(ts * 1000)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatAuthor = (author) => {
    if (!author) return null
    // author is like "5491155551234@c.us" — show just the number
    return author.replace('@c.us', '')
  }

  if (loadingMessages) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#e5ddd5] dark:bg-[#0b141a]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-500"></div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-3 bg-[#e5ddd5] dark:bg-[#0b141a]" style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%23000000\' fill-opacity=\'0.03\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")' }}>
        <div className="max-w-3xl mx-auto space-y-1">
          {messages.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400 text-sm">
              No messages yet
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`relative max-w-[65%] px-3 py-1.5 rounded-lg shadow-sm text-sm ${
                  msg.fromMe
                    ? 'bg-[#d9fdd3] dark:bg-[#005c4b] text-gray-900 dark:text-gray-100 rounded-tr-none'
                    : 'bg-white dark:bg-[#202c33] text-gray-900 dark:text-gray-100 rounded-tl-none'
                }`}
              >
                {/* Sender name for received group messages */}
                {!msg.fromMe && msg.author && (
                  <p className="text-xs font-semibold text-green-600 dark:text-green-400 mb-0.5">
                    {formatAuthor(msg.author)}
                  </p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                <span className="block text-right text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 -mb-0.5">
                  {formatTime(msg.timestamp)}
                </span>
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <form
        onSubmit={handleSend}
        className="flex items-center gap-2 px-4 py-3 bg-[#f0f2f5] dark:bg-[#202c33] border-t border-gray-200 dark:border-gray-700"
      >
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message"
          className="flex-1 px-4 py-2.5 rounded-lg bg-white dark:bg-[#2a3942] text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 border-none outline-none text-sm"
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-full bg-green-500 hover:bg-green-600 disabled:opacity-40 text-white flex items-center justify-center transition-colors"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
          </svg>
        </button>
      </form>
    </div>
  )
}
