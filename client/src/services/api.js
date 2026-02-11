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
    if (error.response?.status === 401) {
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

// Users/Clients API (for OWNER and AGENCY)
export const usersAPI = {
  getStats: () => api.get('/users/stats'),
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
  getAuthUrl: () => api.get('/ghl/oauth/authorize')
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
  generate: (data) => api.post('/prompt-generator/generate', data)
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

// Compliance API
export const complianceAPI = {
  getSettings: () => api.get('/compliance/settings'),
  updateSettings: (data) => api.put('/compliance/settings', data),
  getAuditLogs: (params) => api.get('/compliance/audit-logs', { params })
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

export default api
