import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Login from './components/Auth/Login'
import Register from './components/Auth/Register'
import DashboardLayout from './components/Dashboard/DashboardLayout'
import DashboardContent from './components/Dashboard/DashboardContent'
import AgentEdit from './components/Dashboard/AgentEdit'
import TwilioSetup from './components/Dashboard/TwilioSetup'
import PhoneNumbers from './components/Dashboard/PhoneNumbers'
import SubAccounts from './components/Dashboard/SubAccounts'
import Settings from './components/Dashboard/Settings'
import Credits from './components/Dashboard/Credits'
import CallLogs from './components/Dashboard/CallLogs'
import RatesSettings from './components/Dashboard/RatesSettings'
import AllUsers from './components/Dashboard/AllUsers'
import AccountManagement from './components/Dashboard/AccountManagement'
import VoiceLibrary from './components/Dashboard/VoiceLibrary'
import Analytics from './components/Dashboard/Analytics'
import Support from './components/Dashboard/Support'

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
          <Route path="accounts" element={<AccountManagement />} />
          <Route path="clients" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="agencies" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="all-users" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="sub-accounts" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="credits" element={<Navigate to="/dashboard/accounts" replace />} />
          <Route path="twilio-setup" element={<TwilioSetup />} />
          <Route path="phone-numbers" element={<PhoneNumbers />} />
          <Route path="settings" element={<Settings />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="call-logs" element={<CallLogs />} />
          <Route path="rates" element={<RatesSettings />} />
          <Route path="voice-library" element={<VoiceLibrary />} />
          <Route path="support" element={<Support />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </div>
  )
}

export default App
