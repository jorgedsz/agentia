import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import './index.css'

// Self-heal stale Vite chunks. After a fresh deploy, asset filenames change
// (e.g. /assets/vapi-CzKfEsUr.js → vapi-NEW.js). Tabs that loaded the old
// index.html still try to fetch the old filename when a route or feature
// triggers a dynamic import, which 404s and surfaces as
// "Failed to fetch dynamically imported module".
//
// Force a single reload per session so the user picks up the new index.html
// and asset graph instead of seeing a hard error.
const PRELOAD_RELOAD_FLAG = '__preload_error_reload'
const handleStaleChunk = (reason) => {
  if (sessionStorage.getItem(PRELOAD_RELOAD_FLAG)) return
  sessionStorage.setItem(PRELOAD_RELOAD_FLAG, '1')
  console.warn('[stale-chunk] reloading because of:', reason)
  window.location.reload()
}
window.addEventListener('vite:preloadError', (e) => {
  e.preventDefault()
  handleStaleChunk(e?.payload?.message || 'vite:preloadError')
})
window.addEventListener('error', (e) => {
  const msg = e?.error?.message || e?.message || ''
  if (typeof msg === 'string' && /Failed to fetch dynamically imported module/i.test(msg)) {
    handleStaleChunk(msg)
  }
})
window.addEventListener('unhandledrejection', (e) => {
  const msg = e?.reason?.message || ''
  if (typeof msg === 'string' && /Failed to fetch dynamically imported module/i.test(msg)) {
    handleStaleChunk(msg)
  }
})
// If the app boots cleanly after a self-heal reload, clear the flag so a
// second stale-chunk event later in the session can also recover.
setTimeout(() => sessionStorage.removeItem(PRELOAD_RELOAD_FLAG), 10000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <LanguageProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
