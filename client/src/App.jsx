import { useEffect, useState } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { brandingAPI } from './services/api'
import { applyHostBranding } from './utils/hostBranding'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import DashboardLayout from './components/Dashboard/DashboardLayout'
import DashboardContent from './components/Dashboard/DashboardContent'
import AgentEdit from './components/Dashboard/AgentEdit'
import TelephonySetup from './components/Dashboard/TelephonySetup'
import PhoneNumbers from './components/Dashboard/PhoneNumbers'
import SubAccounts from './components/Dashboard/SubAccounts'
import Settings from './components/Dashboard/Settings'
import Credits from './components/Dashboard/Credits'
import Credentials from './components/Dashboard/Credentials'
import CallLogs from './components/Dashboard/CallLogs'
import ChatbotMessageLogs from './components/Dashboard/ChatbotMessageLogs'
import RatesSettings from './components/Dashboard/RatesSettings'
import AllUsers from './components/Dashboard/AllUsers'
import PaymentPortalPage from './components/Public/PaymentPortalPage'
import BillingPeriods from './components/Dashboard/BillingPeriods'
import OtherCharges from './components/Dashboard/OtherCharges'
import Budgets from './components/Dashboard/Budgets'
import AccountManagement from './components/Dashboard/AccountManagement'
import VoiceLibrary from './components/Dashboard/VoiceLibrary'
import Analytics from './components/Dashboard/Analytics'
import Support from './components/Dashboard/Support'
import Training from './components/Dashboard/Training'
import Payments from './components/Dashboard/Payments'
import ChatbotList from './components/Dashboard/ChatbotList'
import ChatbotCostReport from './components/Dashboard/ChatbotCostReport'
import ChatbotEdit from './components/Dashboard/ChatbotEdit'
import ReportsList from './components/Dashboard/ReportsList'
import ReportNew from './components/Dashboard/ReportNew'
import ReportDetail from './components/Dashboard/ReportDetail'
import ScheduledCalls from './components/Dashboard/ScheduledCalls'
import WhatsAppPage from './components/Dashboard/WhatsAppPage'
import PrivacyPolicy from './components/Legal/PrivacyPolicy'
import TermsOfService from './components/Legal/TermsOfService'
import DemoPage from './components/Demo/DemoPage'
import ClientPortalPage from './components/Portal/ClientPortalPage'
import SessionPortalPage from './components/Portal/SessionPortalPage'
import MessagePortalPage from './components/Portal/MessagePortalPage'
import PublicChatPage from './components/PublicChat/PublicChatPage'
import PublicVoicePage from './components/PublicChat/PublicVoicePage'
import AgentBuilderWizard from './components/Dashboard/AgentBuilder/AgentBuilderWizard'
import AgentBuilderHome from './components/Dashboard/AgentBuilder/AgentBuilderHome'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (user) {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

// The marketing landing belongs to the platform's own address. Every other
// domain the portal answers on (a partner's domain, a panel domain such as
// panel.neboaiconsulting.com) is an entrance for people who come to sign in,
// so the landing is never what they should meet there.
const PLATFORM_HOSTS = (() => {
  const hosts = ['localhost', '127.0.0.1', 'swordaisolutions.com']
  try {
    // Where this build talks to: the address the platform itself is served on.
    hosts.push(new URL(import.meta.env.VITE_API_URL || 'https://app.swordaisolutions.com/api').hostname)
  } catch { /* a relative /api — the hosts above are enough */ }
  return hosts.map((h) => h.replace(/^www\./, ''))
})()

const isPlatformHost = () =>
  PLATFORM_HOSTS.includes(window.location.hostname.replace(/^www\./, '').toLowerCase())

// On any domain that is not the platform's own, go straight to the login. The
// decision is made from the hostname alone, without waiting for the branding
// lookup, so the login still appears if that call is slow or fails. On the
// platform's own domain the lookup still runs, because a brand may own it.
function WhitelabelAwareLanding({ fallback }) {
  const onPlatform = isPlatformHost()
  const [resolved, setResolved] = useState(onPlatform ? null : true) // null=loading, true=redirect, false=show fallback

  useEffect(() => {
    if (!onPlatform) return
    brandingAPI.getByHost(window.location.host)
      .then((r) => setResolved(!!r.data?.branding))
      .catch(() => setResolved(false))
  }, [onPlatform])

  if (resolved === null) return <div className="min-h-screen bg-gray-900" />
  if (resolved) return <Navigate to="/login" replace />
  return fallback
}

function ComingSoon({ title }) {
  return (
    <div className="p-6">
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
        <div className="text-gray-400 text-6xl mb-4">🚧</div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{title || 'Coming Soon'}</h3>
        <p className="text-gray-500 dark:text-gray-400">This feature is under development.</p>
      </div>
    </div>
  )
}

function App() {
  // The tab title, the icon and the link preview follow whoever owns this
  // domain, so a partner's domain never shows the platform's name.
  useEffect(() => { applyHostBranding() }, [])

  return (
    <div className="min-h-screen bg-gray-100">
      <Routes>
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />

        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/pay/:token" element={<PaymentPortalPage />} />
        <Route path="/portal/:token" element={<ClientPortalPage />} />
        <Route path="/portal/:token/sessions/:sessionId" element={<SessionPortalPage />} />
        <Route path="/portal/:token/messages/:sessionId" element={<MessagePortalPage />} />
        <Route path="/chat/:id/:token" element={<PublicChatPage />} />
        <Route path="/voice/:id/:token" element={<PublicVoicePage />} />
        <Route
          path="/"
          element={
            <PublicRoute>
              <WhitelabelAwareLanding fallback={<DemoPage />} />
            </PublicRoute>
          }
        />

        {/* Dashboard with nested routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<DashboardContent tab="overview" />} />
          <Route path="agents" element={<DashboardContent tab="agents" />} />
          <Route path="agent/:id" element={<AgentEdit />} />
          <Route path="agent-builder/voice/new" element={<AgentBuilderWizard type="voice" />} />
          <Route path="agent-builder/voice/:id" element={<AgentBuilderHome type="voice" />} />
          <Route path="agent-builder/chat/new" element={<AgentBuilderWizard type="chat" />} />
          <Route path="agent-builder/chat/:id" element={<AgentBuilderHome type="chat" />} />
          <Route path="accounts" element={<AccountManagement />} />
          <Route path="billing-periods" element={<BillingPeriods />} />
          <Route path="other-charges" element={<OtherCharges />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="clients" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="agencies" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="all-users" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="sub-accounts" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="credits" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="twilio-setup" element={<TelephonySetup />} />
          <Route path="phone-numbers" element={<PhoneNumbers />} />
          <Route path="settings" element={<Settings />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="call-logs" element={<CallLogs />} />
          <Route path="message-logs" element={<ChatbotMessageLogs />} />
          <Route path="scheduled-calls" element={<ScheduledCalls />} />
          <Route path="rates" element={<RatesSettings />} />
          <Route path="voice-library" element={<VoiceLibrary />} />
          <Route path="chatbots" element={<ChatbotList />} />
          <Route path="chatbot/:id" element={<ChatbotEdit />} />
          <Route path="chatbot-costs" element={<ChatbotCostReport />} />
          <Route path="reports" element={<ReportsList />} />
          <Route path="reports/new" element={<ReportNew />} />
          <Route path="reports/:id" element={<ReportDetail />} />
          <Route path="payments" element={<Payments />} />
          <Route path="tutorials/:lang" element={<Training />} />
          <Route path="training" element={<Navigate to="/dashboard/tutorials/en" replace />} />
          <Route path="whatsapp" element={<WhatsAppPage />} />
          <Route path="support" element={<Support />} />
        </Route>

        {/* Fallback: redirect unknown routes to landing */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  )
}

export default App
