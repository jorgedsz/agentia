import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
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
import AccountManagement from './components/Dashboard/AccountManagement'
import VoiceLibrary from './components/Dashboard/VoiceLibrary'
import Analytics from './components/Dashboard/Analytics'
import Support from './components/Dashboard/Support'
import Training from './components/Dashboard/Training'
import Payments from './components/Dashboard/Payments'
import ChatbotList from './components/Dashboard/ChatbotList'
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
        <Route path="/portal/:token" element={<ClientPortalPage />} />
        <Route path="/portal/:token/sessions/:sessionId" element={<SessionPortalPage />} />
        <Route path="/portal/:token/messages/:sessionId" element={<MessagePortalPage />} />
        <Route path="/chat/:id/:token" element={<PublicChatPage />} />
        <Route path="/voice/:id/:token" element={<PublicVoicePage />} />
        <Route
          path="/"
          element={
            <PublicRoute>
              <DemoPage />
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
          <Route path="agent-builder/voice/new" element={<ComingSoon title="Agent Builder (Voice)" />} />
          <Route path="agent-builder/voice/:id" element={<ComingSoon title="Agent Builder (Voice)" />} />
          <Route path="agent-builder/chat/new" element={<ComingSoon title="Agent Builder (Chat)" />} />
          <Route path="agent-builder/chat/:id" element={<ComingSoon title="Agent Builder (Chat)" />} />
          <Route path="accounts" element={<AccountManagement />} />
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
