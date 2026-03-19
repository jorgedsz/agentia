import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { PayPalScriptProvider } from '@paypal/react-paypal-js'
import App from './App.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { LanguageProvider } from './context/LanguageContext.jsx'
import './index.css'

const paypalOptions = {
  clientId: import.meta.env.VITE_PAYPAL_CLIENT_ID || 'test',
  currency: 'USD',
  intent: 'subscription',
  vault: true,
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <PayPalScriptProvider options={paypalOptions}>
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <App />
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </PayPalScriptProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
