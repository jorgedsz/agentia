import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || '/api'

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
})

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const isLoginRequest = url.includes('/login')
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  getMe: () => api.get('/auth/me'),
  getAccessibleAccounts: () => api.get('/auth/accessible-accounts'),
  switchAccount: (targetUserId) => api.post('/auth/switch-account', { targetUserId }),
  switchBack: () => api.post('/auth/switch-back')
}

// Agents API
export const agentsAPI = {
  list: () => api.get('/agents'),
  get: (id) => api.get(`/agents/${id}`),
  create: (data) => api.post('/agents', data),
  update: (id, data) => api.put(`/agents/${id}`, data),
  delete: (id) => api.delete(`/agents/${id}`)
}

// Chatbots API
export const chatbotsAPI = {
  list: () => api.get('/chatbots'),
  get: (id) => api.get(`/chatbots/${id}`),
  create: (data) => api.post('/chatbots', data),
  update: (id, data) => api.put(`/chatbots/${id}`, data),
  toggle: (id) => api.post(`/chatbots/${id}/toggle`),
  delete: (id) => api.delete(`/chatbots/${id}`),
  test: (id, message, sessionId) => api.post(`/chatbots/${id}/test`, { message, sessionId })
}

// Users/Clients API (for OWNER and AGENCY)
export const usersAPI = {
  getStats: () => api.get('/users/stats'),
  getOverview: () => api.get('/users/overview'),
  getAll: () => api.get('/users'),
  getAgencies: () => api.get('/users/agencies'),
  createAgency: (data) => api.post('/users/agencies', data),
  getClients: (agencyId) => agencyId
    ? api.get(`/users/clients/${agencyId}`)
    : api.get('/users/clients'),
  createClient: (data) => api.post('/users/clients', data),
  updateRole: (id, role) => api.patch(`/users/${id}/role`, { role }),
  updateBilling: (id, data) => api.patch(`/users/${id}/billing`, data),
  delete: (id) => api.delete(`/users/${id}`)
}

// Twilio Credentials API
export const twilioAPI = {
  saveCredentials: (data) => api.post('/twilio/credentials', data),
  getCredentials: () => api.get('/twilio/credentials'),
  updateCredentials: (data) => api.put('/twilio/credentials', data),
  deleteCredentials: () => api.delete('/twilio/credentials'),
  verifyCredentials: () => api.post('/twilio/credentials/verify'),
  getBalances: () => api.get('/twilio/balances')
}

// Phone Numbers API
export const phoneNumbersAPI = {
  list: () => api.get('/phone-numbers'),
  listAvailable: () => api.get('/phone-numbers/available'),
  import: (data) => api.post('/phone-numbers/import', data),
  assignToAgent: (id, agentId) => api.patch(`/phone-numbers/${id}/assign`, { agentId }),
  unassign: (id) => api.patch(`/phone-numbers/${id}/assign`, { agentId: null }),
  remove: (id) => api.delete(`/phone-numbers/${id}`)
}

// Team Members API
export const teamMembersAPI = {
  list: () => api.get('/team-members'),
  create: (data) => api.post('/team-members', data),
  update: (id, data) => api.put(`/team-members/${id}`, data),
  delete: (id) => api.delete(`/team-members/${id}`),
  login: (data) => api.post('/team-members/login', data)
}

// Calls API
export const callsAPI = {
  create: (data) => api.post('/calls', data),
  get: (id) => api.get(`/calls/${id}`),
  list: () => api.get('/calls'),
  getAnalytics: (params) => api.get('/calls/analytics', { params }),
  getAdvancedAnalytics: (params) => api.get('/calls/analytics/advanced', { params }),
  updateOutcome: (id, outcome) => api.patch(`/calls/${id}/outcome`, { outcome })
}

// Credits API
export const creditsAPI = {
  list: () => api.get('/credits'),
  get: (userId) => api.get(`/credits/${userId}`),
  update: (userId, data) => api.post(`/credits/${userId}`, data)
}

// Rates API
export const ratesAPI = {
  get: () => api.get('/rates'),
  update: (data) => api.put('/rates', data),
  syncBilling: () => api.post('/rates/sync-billing')
}

// GHL Integration API
export const ghlAPI = {
  connect: (data) => api.post('/ghl/connect', data),
  getStatus: () => api.get('/ghl/status'),
  disconnect: () => api.delete('/ghl/disconnect'),
  getCalendars: () => api.get('/ghl/calendars'),
  getAuthUrl: () => api.get('/ghl/oauth/authorize'),
  getPipelines: () => api.get('/ghl/pipelines'),
  getTags: () => api.get('/ghl/tags'),
  getCustomFields: () => api.get('/ghl/custom-fields')
}

// Calendar Integration API (multi-provider)
export const calendarAPI = {
  listIntegrations: () => api.get('/calendar/integrations'),
  getCalendars: (integrationId) => api.get(`/calendar/integrations/${integrationId}/calendars`),
  connectProvider: (provider, data) => api.post(`/calendar/integrations/${provider}/connect`, data),
  disconnectIntegration: (id) => api.delete(`/calendar/integrations/${id}/disconnect`),
  getOAuthUrl: (provider) => api.get(`/calendar/oauth/${provider}/authorize`)
}

// VAPI Key Pool API (OWNER only)
export const vapiKeyPoolAPI = {
  list: () => api.get('/vapi-key-pool'),
  add: (data) => api.post('/vapi-key-pool', data),
  remove: (id) => api.delete(`/vapi-key-pool/${id}`)
}

// Prompt Generator API
export const promptGeneratorAPI = {
  generate: (data) => api.post('/prompt-generator/generate', data),
  update: (data) => api.post('/prompt-generator/update', data)
}

// Platform Settings API (OWNER only, except getVapiPublicKey)
export const platformSettingsAPI = {
  get: () => api.get('/platform-settings'),
  update: (data) => api.put('/platform-settings', data),
  getVapiPublicKey: () => api.get('/platform-settings/vapi-public-key')
}

// Account Settings API (per-account VAPI keys)
export const accountSettingsAPI = {
  getVapiKeys: () => api.get('/account-settings/vapi-keys'),
  updateVapiKeys: (data) => api.put('/account-settings/vapi-keys', data),
  getVapiPublicKey: () => api.get('/account-settings/vapi-public-key'),
  getTriggerKey: () => api.get('/account-settings/trigger-key'),
  generateTriggerKey: () => api.post('/account-settings/generate-trigger-key')
}

// Branding API
export const brandingAPI = {
  get: () => api.get('/branding'),
  update: (data) => api.put('/branding', data)
}

// Voices API
export const voicesAPI = {
  list: () => api.get('/voices'),
  listCustom: () => api.get('/voices/custom'),
  addCustom: (data) => api.post('/voices/custom', data),
  refreshCustom: (id) => api.patch(`/voices/custom/${id}/refresh`),
  deleteCustom: (id) => api.delete(`/voices/custom/${id}`)
}

// Tickets API
export const ticketsAPI = {
  list: (status) => api.get('/tickets', { params: status ? { status } : {} }),
  get: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  update: (id, data) => api.put(`/tickets/${id}`, data),
  updateStatus: (id, status) => api.patch(`/tickets/${id}/status`, { status }),
  addReply: (id, message) => api.post(`/tickets/${id}/replies`, { message }),
  delete: (id) => api.delete(`/tickets/${id}`)
}

// Pricing API (dynamic per-model/transcriber rates)
export const pricingAPI = {
  getModelRates: (forUserId) => api.get('/pricing/models', { params: forUserId ? { forUserId } : {} }),
  getTranscriberRates: (forUserId) => api.get('/pricing/transcribers', { params: forUserId ? { forUserId } : {} }),
  updateModelRates: (rates, forUserId) => api.put('/pricing/models', { rates, ...(forUserId ? { forUserId } : {}) }),
  updateTranscriberRates: (rates, forUserId) => api.put('/pricing/transcribers', { rates, ...(forUserId ? { forUserId } : {}) })
}

// Compliance API
export const complianceAPI = {
  getSettings: () => api.get('/compliance/settings'),
  updateSettings: (data) => api.put('/compliance/settings', data),
  getAuditLogs: (params) => api.get('/compliance/audit-logs', { params })
}

// Payments API
export const paymentsAPI = {
  // Products
  listProducts: () => api.get('/payments/products'),
  getProduct: (id) => api.get(`/payments/products/${id}`),
  createProduct: (data) => api.post('/payments/products', data),
  updateProduct: (id, data) => api.put(`/payments/products/${id}`, data),
  deleteProduct: (id) => api.delete(`/payments/products/${id}`),
  // User Products
  listUserProducts: () => api.get('/payments/user-products'),
  getUserProducts: (userId) => api.get(`/payments/user-products/${userId}`),
  assignUserProducts: (userId, data) => api.post(`/payments/user-products/${userId}`, data),
  updateUserProduct: (userId, productId, data) => api.put(`/payments/user-products/${userId}/${productId}`, data),
  removeUserProduct: (userId, productId) => api.delete(`/payments/user-products/${userId}/${productId}`),
  // Self-service
  selfUpdateProduct: (productId, data) => api.put(`/payments/my-products/${productId}`, data),
  selfCancelProduct: (productId) => api.delete(`/payments/my-products/${productId}`),
  // Catalog & Purchase
  getCatalog: () => api.get('/payments/catalog'),
  purchase: (data) => api.post('/payments/purchase', data),
  preview: (data) => api.post('/payments/preview', data),
  // PayPal
  createPayPalSubscription: (data) => api.post('/payments/paypal/create-subscription', data),
  createPayPalOrder: (data) => api.post('/payments/paypal/create-order', data),
  capturePayPalOrder: (data) => api.post('/payments/paypal/capture-order', data),
  syncProductToPayPal: (id) => api.post(`/payments/products/${id}/sync-paypal`),
  getTransactionHistory: (params) => api.get('/payments/transactions', { params }),
  // Credit loading
  createCreditOrder: (data) => api.post('/payments/paypal/create-credit-order', data),
  captureCreditOrder: (data) => api.post('/payments/paypal/capture-credit-order', data),
}

// Tools API (test HTTP requests via proxy)
export const toolsAPI = {
  testRequest: (data) => api.post('/tools/test-request', data)
}

// Callbacks API
export const callbackAPI = {
  list: () => api.get('/callbacks'),
  cancel: (id) => api.delete(`/callbacks/${id}`)
}

export const followUpAPI = {
  list: () => api.get('/follow-ups'),
  cancel: (id) => api.delete(`/follow-ups/${id}`)
}

// Demo API
export const demoAPI = {
  generate: (data) => api.post('/demo/generate', data),
  getVapiKey: () => api.get('/demo/vapi-key'),
  getBranding: () => api.get('/demo/branding')
}

// Google Calendar API
export const googleCalendarAPI = {
  getStatus: () => api.get('/google-calendar/status'),
  connect: () => api.get('/google-calendar/connect'),
  disconnect: () => api.post('/google-calendar/disconnect'),
  getEvents: (params) => api.get('/google-calendar/events', { params }),
  getEventsForClient: (clientId, params) => api.get(`/google-calendar/events/client/${clientId}`, { params }),
}

// Chat API (uses fetch for SSE streaming, not axios)
export const chatAPI = {
  sendMessage: async (messages, onChunk, onDone, onError) => {
    try {
      const token = localStorage.getItem('token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${baseURL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ messages })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        onError(err.error || 'Request failed')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            onDone()
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              onError(parsed.error)
              return
            }
            if (parsed.content) {
              onChunk(parsed.content)
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      onDone()
    } catch (err) {
      onError(err.message || 'Network error')
    }
  }
}

// WA Projects API
export const waProjectsAPI = {
  list: (params) => api.get('/wa-projects', { params }),
  getStats: () => api.get('/wa-projects/stats'),
  get: (id) => api.get(`/wa-projects/${id}`),
  update: (id, data) => api.put(`/wa-projects/${id}`, data),
  getMessages: (id, params) => api.get(`/wa-projects/${id}/messages`, { params }),
  getAlerts: (id) => api.get(`/wa-projects/${id}/alerts`),
  chat: async (id, messages, onChunk, onDone, onError) => {
    try {
      const token = localStorage.getItem('token')
      const baseURL = import.meta.env.VITE_API_URL || '/api'
      const response = await fetch(`${baseURL}/wa-projects/${id}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ messages })
      })

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Request failed' }))
        onError(err.error || 'Request failed')
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          const data = trimmed.slice(6)
          if (data === '[DONE]') {
            onDone()
            return
          }
          try {
            const parsed = JSON.parse(data)
            if (parsed.error) {
              onError(parsed.error)
              return
            }
            if (parsed.content) {
              onChunk(parsed.content)
            }
          } catch {
            // skip malformed lines
          }
        }
      }
      onDone()
    } catch (err) {
      onError(err.message || 'Network error')
    }
  }
}

// WA Alerts API
export const waAlertsAPI = {
  list: () => api.get('/wa-alerts'),
  resolve: (id) => api.patch(`/wa-alerts/${id}/resolve`),
  resolveAllForProject: (projectId) => api.patch(`/wa-alerts/project/${projectId}/resolve-all`)
}

// WA Bot Config API
export const waBotConfigAPI = {
  get: () => api.get('/wa-bot-config'),
  update: (data) => api.put('/wa-bot-config', data)
}

// WhatsApp API
export const whatsappAPI = {
  listSessions: () => api.get('/whatsapp/sessions'),
  createSession: (sessionId) => api.post('/whatsapp/sessions', { sessionId }),
  deleteSession: (sessionId) => api.delete(`/whatsapp/sessions/${sessionId}`),
  getQR: (sessionId) => api.get(`/whatsapp/sessions/${sessionId}/qr`),
  getGroups: (sessionId) => api.get(`/whatsapp/sessions/${sessionId}/groups`),
  getMessages: (sessionId, groupId, limit = 50) =>
    api.get(`/whatsapp/sessions/${sessionId}/groups/${encodeURIComponent(groupId)}/messages`, { params: { limit } }),
  sendMessage: (sessionId, groupId, body) =>
    api.post(`/whatsapp/sessions/${sessionId}/groups/${encodeURIComponent(groupId)}/messages`, { body }),
}

export default api
