import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { authAPI, usersAPI, whopAPI, stripeAPI, creditsAPI, payAPI, phoneSwitchAPI, infraCostAPI } from '../../services/api'

const ROLES = {
  OWNER: 'OWNER',
  WHITELABEL: 'WHITELABEL',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

// Menu items an admin can hide per user (ids match DashboardLayout menu items).
const MANAGEABLE_ITEMS = [
  { id: 'overview', label: 'Inicio' },
  { id: 'analytics', label: 'Analítica' },
  { id: 'agents', label: 'Agentes' },
  { id: 'voice-library', label: 'Biblioteca de voces' },
  { id: 'chatbots', label: 'Chatbots' },
  { id: 'reports', label: 'Reportes' },
  { id: 'twilio-setup', label: 'Configurar telefonía' },
  { id: 'phone-numbers', label: 'Números de teléfono' },
  { id: 'call-logs', label: 'Registro de llamadas' },
  { id: 'message-logs', label: 'Registro de mensajes' },
  { id: 'scheduled-calls', label: 'Llamadas programadas' },
  { id: 'settings', label: 'Ajustes' },
  { id: 'credentials', label: 'Credenciales' },
  { id: 'support', label: 'Soporte' },
  { id: 'tutorials/en', label: 'Tutoriales (EN)' },
  { id: 'tutorials/es', label: 'Tutoriales (ES)' },
]

export default function AccountManagement() {
  const { user, switchAccount, isImpersonating } = useAuth()
  const { t } = useLanguage()
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [switching, setSwitching] = useState(null)

  // Billing modal state
  const [editingUser, setEditingUser] = useState(null)
  const [billingForm, setBillingForm] = useState({
    credits: '',
    creditOperation: 'add',
    voiceAgentsEnabled: true,
    chatbotsEnabled: true,
    crmEnabled: false,
    agentGeneratorEnabled: false,
    callsPaused: false,
    messagesPaused: false,
    hiddenSections: [],
    planType: '',
    planPrice: '',
    infraMonthlyCost: '',
    infraCostNote: '',
    chatbotMessagePrice: '',
  })
  const [saving, setSaving] = useState(false)

  // Create modals state
  const [showModal, setShowModal] = useState(null)
  const [formData, setFormData] = useState({})
  const [creating, setCreating] = useState(false)

  // Role change modal state
  const [roleTarget, setRoleTarget] = useState(null) // the account being edited
  const [newRole, setNewRole] = useState('')
  const [roleSaving, setRoleSaving] = useState(false)

  // Partner Whop modal state
  const [whopTarget, setWhopTarget] = useState(null)
  const [whopForm, setWhopForm] = useState({ billingMode: 'platform', companyId: '', apiKey: '', webhookSecret: '', allowNegativeBalance: false })
  const [whopStatus, setWhopStatus] = useState(null)
  const [whopSaving, setWhopSaving] = useState(false)
  const [whopMsg, setWhopMsg] = useState('')

  // Stripe credentials for the same partner (billingMode 'own_stripe'). Unlike
  // Whop, Stripe applies to the partner's WHOLE subtree, agencies included.
  const [stripeForm, setStripeForm] = useState({ secretKey: '', publishableKey: '', webhookSecret: '' })
  const [stripeStatus, setStripeStatus] = useState(null)

  const openWhopModal = async (account) => {
    setWhopTarget(account)
    setWhopForm({ billingMode: 'platform', companyId: '', apiKey: '', webhookSecret: '', allowNegativeBalance: false })
    setWhopStatus(null)
    setWhopMsg('')
    setStripeForm({ secretKey: '', publishableKey: '', webhookSecret: '' })
    setStripeStatus(null)
    try {
      const { data } = await whopAPI.getPartnerConfig(account.id)
      setWhopStatus(data)
      setWhopForm(f => ({ ...f, billingMode: data.billingMode || 'platform', companyId: data.companyId || '', allowNegativeBalance: !!data.allowNegativeBalance }))
    } catch {
      setWhopMsg('No se pudo cargar la configuración.')
    }
    try {
      const { data } = await stripeAPI.getPartnerConfig(account.id)
      setStripeStatus(data)
      setStripeForm(f => ({ ...f, publishableKey: data.publishableKey || '' }))
    } catch {
      // Stripe never configured for this partner — the form starts empty.
    }
  }

  const saveWhop = async () => {
    if (!whopTarget) return
    setWhopSaving(true)
    setWhopMsg('')
    try {
      // Stripe keys and the switch to own_stripe live on the Stripe endpoint, which
      // refuses the switch until a working secret key is stored.
      if (whopForm.billingMode === 'own_stripe' || stripeForm.secretKey || stripeForm.webhookSecret) {
        const { data: sData } = await stripeAPI.setPartnerConfig(whopTarget.id, {
          billingMode: whopForm.billingMode,
          secretKey: stripeForm.secretKey,         // blank keeps existing
          publishableKey: stripeForm.publishableKey,
          webhookSecret: stripeForm.webhookSecret, // blank keeps existing
        })
        setStripeStatus(sData)
        setStripeForm(f => ({ ...f, secretKey: '', webhookSecret: '' }))
      }
      if (whopForm.billingMode === 'own_stripe') {
        // Negative balance is stored on the same row but only the Whop endpoint writes it.
        await whopAPI.setPartnerConfig(whopTarget.id, { allowNegativeBalance: !!whopForm.allowNegativeBalance })
        setWhopMsg('Guardado.')
        setWhopSaving(false)
        return
      }
      const { data } = await whopAPI.setPartnerConfig(whopTarget.id, {
        billingMode: whopForm.billingMode,
        companyId: whopForm.companyId,
        apiKey: whopForm.apiKey,           // blank keeps existing
        webhookSecret: whopForm.webhookSecret, // blank keeps existing
        allowNegativeBalance: !!whopForm.allowNegativeBalance,
      })
      setWhopStatus(data)
      setWhopForm(f => ({ ...f, billingMode: data.billingMode || f.billingMode, allowNegativeBalance: !!data.allowNegativeBalance, apiKey: '', webhookSecret: '' }))
      setWhopMsg('Guardado.')
    } catch (e) {
      setWhopMsg(e.response?.data?.error || 'Error al guardar.')
    } finally {
      setWhopSaving(false)
    }
  }

  // Per-row overflow menu (keeps the actions column from overflowing off-screen)
  const [rowMenu, setRowMenu] = useState(null)
  // Where to draw the open menu, in viewport coordinates. The dropdown sits inside
  // the table's scroll container, which clips anything drawn past its edges — so it
  // is positioned fixed, floating above the table instead of being cut off.
  const [rowMenuPos, setRowMenuPos] = useState(null)

  const openRowMenu = (event, accountId) => {
    if (rowMenu === accountId) { setRowMenu(null); return }
    const rect = event.currentTarget.getBoundingClientRect()
    const MENU_HEIGHT = 190 // four items plus padding
    const roomBelow = window.innerHeight - rect.bottom
    setRowMenuPos({
      right: Math.max(8, window.innerWidth - rect.right),
      // Flip upward for the last rows, where there is no room underneath.
      ...(roomBelow < MENU_HEIGHT
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    })
    setRowMenu(accountId)
  }

  // A fixed menu doesn't travel with the page, so close it if anything moves.
  useEffect(() => {
    if (rowMenu === null) return
    const close = () => setRowMenu(null)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [rowMenu])

  // Phone-switch: OWNER curates which of an account's agents its number can switch to
  const [psTarget, setPsTarget] = useState(null)
  const [psData, setPsData] = useState(null)
  const [psSelected, setPsSelected] = useState([])
  const [psSaving, setPsSaving] = useState(false)
  const [psMsg, setPsMsg] = useState('')

  const openPhoneSwitchModal = async (account) => {
    setPsTarget(account)
    setPsData(null)
    setPsSelected([])
    setPsMsg('')
    try {
      const { data } = await phoneSwitchAPI.adminGetAgents(account.id)
      setPsData(data)
      setPsSelected((data.agents || []).filter(a => a.phoneSwitchEnabled).map(a => a.id))
    } catch (e) {
      setPsMsg('No se pudieron cargar los agentes.')
    }
  }

  const togglePsAgent = (id) => {
    setPsSelected(sel => sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id])
  }

  const savePhoneSwitch = async () => {
    if (!psTarget) return
    setPsSaving(true)
    setPsMsg('')
    try {
      await phoneSwitchAPI.adminSetAgents(psTarget.id, psSelected)
      setPsMsg(`Guardado. ${psSelected.length} agente(s) habilitado(s).`)
    } catch (e) {
      setPsMsg(e.response?.data?.error || 'Error al guardar.')
    } finally {
      setPsSaving(false)
    }
  }

  const clearWhop = async () => {
    if (!whopTarget) return
    if (!window.confirm('¿Borrar la configuración de Whop de este partner? Sus cobros volverán a la cuenta global.')) return
    setWhopSaving(true)
    try {
      await whopAPI.setPartnerConfig(whopTarget.id, { clear: true })
      setWhopStatus({ configured: false, companyId: '', hasApiKey: false, hasWebhookSecret: false, webhookUrl: null })
      setWhopForm({ companyId: '', apiKey: '', webhookSecret: '' })
      setWhopMsg('Configuración borrada.')
    } catch (e) {
      setWhopMsg(e.response?.data?.error || 'Error al borrar.')
    } finally {
      setWhopSaving(false)
    }
  }

  // Roles this actor is allowed to assign. Mirrors server-side ROLE_TRANSITIONS.
  const allowedTargetRoles = (() => {
    if (user?.role === ROLES.OWNER) return [ROLES.WHITELABEL, ROLES.AGENCY, ROLES.CLIENT]
    if (user?.role === ROLES.WHITELABEL) return [ROLES.AGENCY, ROLES.CLIENT]
    if (user?.role === ROLES.AGENCY) return [ROLES.CLIENT]
    return []
  })()

  const canChangeRoleOf = (account) => {
    if (!account || account.id === user?.id) return false
    if (account.role === ROLES.OWNER) return false
    if (user?.role === ROLES.OWNER) return true
    if (user?.role === ROLES.WHITELABEL) {
      // direct agency under this whitelabel, OR a client under one of their agencies
      if (account.whitelabelId === user.id) return true
      const parentAgency = accounts.find(a => a.id === account.agencyId)
      return parentAgency?.whitelabelId === user.id
    }
    if (user?.role === ROLES.AGENCY) {
      return account.role === ROLES.CLIENT && account.agencyId === user.id
    }
    return false
  }

  const openRoleModal = (account) => {
    setRoleTarget(account)
    // Default to the first allowed role that isn't the current one
    const first = allowedTargetRoles.find(r => r !== account.role) || allowedTargetRoles[0] || ''
    setNewRole(first)
  }

  const submitRoleChange = async () => {
    if (!roleTarget || !newRole || newRole === roleTarget.role) {
      setRoleTarget(null)
      return
    }
    setRoleSaving(true)
    setError('')
    try {
      await usersAPI.updateRole(roleTarget.id, newRole)
      setSuccess(`Rol actualizado: ${roleTarget.email} → ${newRole}`)
      setRoleTarget(null)
      await fetchAccounts()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cambiar el rol')
    } finally {
      setRoleSaving(false)
    }
  }

  useEffect(() => {
    fetchAccounts()
  }, [user?.id, user?.role])

  const fetchAccounts = async () => {
    setLoading(true)
    setError('')
    try {
      if (user?.role === ROLES.OWNER) {
        const response = await usersAPI.getAll()
        setAccounts(response.data.users)
      } else if (user?.role === ROLES.WHITELABEL || user?.role === ROLES.AGENCY) {
        const response = await authAPI.getAccessibleAccounts()
        setAccounts(response.data.accounts)
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load accounts')
    } finally {
      setLoading(false)
    }
  }

  const handleSwitch = async (account) => {
    setSwitching(account.id)
    setError('')
    try {
      await switchAccount(account.id)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to switch account')
      setSwitching(null)
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case ROLES.OWNER: return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case ROLES.WHITELABEL: return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
      case ROLES.AGENCY: return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      default: return 'bg-green-500/20 text-green-400 border-green-500/30'
    }
  }

  const getCreditColor = (credits) => {
    if (credits <= 0) return 'text-red-500'
    if (credits < 5) return 'text-yellow-500'
    return 'text-green-500'
  }

  // Filter and search
  const filteredAccounts = accounts.filter(account => {
    const matchesFilter = filter === 'all' || account.role === filter
    const matchesSearch = !search ||
      account.email.toLowerCase().includes(search.toLowerCase()) ||
      (account.name && account.name.toLowerCase().includes(search.toLowerCase()))
    return matchesFilter && matchesSearch
  })

  // Billing modal handlers
  // Collecting an outstanding balance from the account's saved card.
  const [cardStatus, setCardStatus] = useState(null)
  const [chargeAmount, setChargeAmount] = useState('')
  const [charging, setCharging] = useState(false)

  const loadCardStatus = async (userId) => {
    setCardStatus(null)
    setChargeAmount('')
    try {
      const { data } = await creditsAPI.getCardStatus(userId)
      setCardStatus(data)
      // Default to what the account owes; the amount stays editable.
      if (data.outstanding > 0) setChargeAmount(String(data.outstanding))
    } catch {
      // No permission or endpoint unavailable — the section just stays hidden.
    }
  }

  const chargeSavedCard = async () => {
    const amount = parseFloat(chargeAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('Ingresa el monto a cobrar.')
      return
    }
    if (!confirm(`¿Cobrar $${amount.toFixed(2)} a la tarjeta guardada de ${editingUser.email}?`)) return
    setCharging(true)
    setError('')
    setSuccess('')
    try {
      const { data } = await creditsAPI.chargeCard(editingUser.id, amount)
      setSuccess(data.message)
      setEditingUser(u => ({ ...u, vapiCredits: data.balance }))
      loadCardStatus(editingUser.id)
      fetchAccounts()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo cobrar la tarjeta')
    } finally {
      setCharging(false)
    }
  }

  // Public payment link / embed for this account.
  const [payLink, setPayLink] = useState(null)
  const [payLinkBusy, setPayLinkBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const loadPayLink = async (userId) => {
    setPayLink(null)
    try {
      const { data } = await payAPI.getLink(userId)
      setPayLink(data)
    } catch {
      // No permission for this account — the section stays hidden.
    }
  }

  const issuePayLink = async (rotate = false) => {
    if (rotate && !confirm('Al regenerar, el enlace anterior deja de funcionar de inmediato, incluido cualquier iframe ya publicado. ¿Continuar?')) return
    setPayLinkBusy(true)
    try {
      const { data } = await payAPI.createLink(editingUser.id, rotate)
      setPayLink(data)
      setSuccess(rotate ? 'Enlace regenerado.' : 'Enlace de pago creado.')
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear el enlace de pago')
    } finally {
      setPayLinkBusy(false)
    }
  }

  const copyToClipboard = async (text, what) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(''), 1500)
    } catch {
      setError('No se pudo copiar. Selecciona el texto y cópialo a mano.')
    }
  }

  const openBillingModal = (targetUser) => {
    setEditingUser(targetUser)
    loadCardStatus(targetUser.id)
    loadPayLink(targetUser.id)
    setBillingForm({
      credits: '',
      creditOperation: 'add',
      voiceAgentsEnabled: targetUser.voiceAgentsEnabled !== false,
      chatbotsEnabled: targetUser.chatbotsEnabled !== false,
      crmEnabled: targetUser.crmEnabled || false,
      agentGeneratorEnabled: targetUser.agentGeneratorEnabled || false,
      budgetsEnabled: targetUser.budgetsEnabled || false,
      callsPaused: targetUser.callsPaused || false,
      messagesPaused: targetUser.messagesPaused || false,
      hiddenSections: (() => { try { const a = JSON.parse(targetUser.hiddenSections || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } })(),
      planType: targetUser.planType || '',
      planPrice: targetUser.planPrice != null ? String(targetUser.planPrice) : '',
      infraMonthlyCost: targetUser.infraMonthlyCost != null ? String(targetUser.infraMonthlyCost) : '',
      infraCostNote: targetUser.infraCostNote || '',
      chatbotMessagePrice: targetUser.chatbotMessagePrice != null ? String(targetUser.chatbotMessagePrice) : '',
      receiptEmail: targetUser.receiptEmail || '',
    })
    setError('')
    setSuccess('')
  }

  const closeBillingModal = () => {
    setEditingUser(null)
    setBillingForm({ credits: '', creditOperation: 'add', voiceAgentsEnabled: true, chatbotsEnabled: true, crmEnabled: false, agentGeneratorEnabled: false, budgetsEnabled: false, callsPaused: false, messagesPaused: false, hiddenSections: [], planType: '', planPrice: '', infraMonthlyCost: '', infraCostNote: '', chatbotMessagePrice: '', receiptEmail: '' })
  }

  const handleBillingSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    try {
      const data = {}
      if (billingForm.credits && billingForm.credits !== '') {
        data.credits = parseFloat(billingForm.credits)
        data.creditOperation = billingForm.creditOperation
      }

      // Always send feature toggles
      data.voiceAgentsEnabled = billingForm.voiceAgentsEnabled
      data.chatbotsEnabled = billingForm.chatbotsEnabled
      data.crmEnabled = billingForm.crmEnabled
      data.agentGeneratorEnabled = billingForm.agentGeneratorEnabled
      data.budgetsEnabled = billingForm.budgetsEnabled
      data.callsPaused = billingForm.callsPaused
      data.messagesPaused = billingForm.messagesPaused
      data.hiddenSections = billingForm.hiddenSections
      if (editingUser.role === ROLES.CLIENT) {
        data.planType = billingForm.planType || null
      }
      data.planPrice = billingForm.planPrice !== '' ? billingForm.planPrice : null
      data.chatbotMessagePrice = billingForm.chatbotMessagePrice !== '' ? billingForm.chatbotMessagePrice : null
      data.receiptEmail = billingForm.receiptEmail

      await usersAPI.updateBilling(editingUser.id, data)

      // The infrastructure cost lives behind its own endpoint, because only
      // the OWNER or the partner above an account may set it. Sent only when
      // it actually changed, so editing anything else is never refused over a
      // field the editor was not touching.
      const costChanged = String(billingForm.infraMonthlyCost ?? '') !== String(editingUser.infraMonthlyCost ?? '')
        || (billingForm.infraCostNote || '') !== (editingUser.infraCostNote || '')
      if (costChanged) {
        await infraCostAPI.set(editingUser.id, {
          amount: billingForm.infraMonthlyCost,
          note: billingForm.infraCostNote,
        })
      }
      setSuccess('Billing updated successfully')
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
      await fetchAccounts()
      setTimeout(() => closeBillingModal(), 1000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update billing')
    } finally {
      setSaving(false)
    }
  }

  // Delete user handler
  const handleDeleteUser = async (account) => {
    if (!confirm(`Are you sure you want to delete "${account.name || account.email}"? This action cannot be undone.`)) return
    try {
      await usersAPI.delete(account.id)
      setSuccess(`User "${account.name || account.email}" deleted successfully`)
      setTimeout(() => setSuccess(''), 3000)
      await fetchAccounts()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user')
    }
  }

  // Create client/agency/whitelabel handlers
  const handleCreate = async (type) => {
    setCreating(true)
    setError('')
    try {
      if (type === 'client') {
        await usersAPI.createClient(formData)
      } else if (type === 'agency') {
        await usersAPI.createAgency(formData)
      } else if (type === 'whitelabel') {
        await usersAPI.createWhitelabel(formData)
      }
      setShowModal(null)
      setFormData({})
      await fetchAccounts()
    } catch (err) {
      setError(err.response?.data?.error || 'Operation failed')
    } finally {
      setCreating(false)
    }
  }

  // Access restricted for CLIENT role
  if (user?.role === ROLES.CLIENT) {
    return (
      <div className="p-6">
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('subAccounts.accessRestricted')}</h3>
          <p className="text-gray-500 dark:text-gray-400">{t('subAccounts.onlyOwnersAgencies')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Impersonation Warning */}
      {isImpersonating && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 flex items-center gap-3">
          <svg className="w-5 h-5 text-yellow-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-sm text-yellow-400">{t('subAccounts.impersonatingWarning')}</p>
        </div>
      )}

      {/* Error */}
      {error && !editingUser && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && !editingUser && (
        <div className="bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Header Card */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-primary-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
            <svg className="w-6 h-6 text-primary-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('sidebar.accounts')}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {user?.role === ROLES.OWNER
                ? t('allUsers.subtitle')
                : t('subAccounts.agencyDesc')}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {(user?.role === ROLES.OWNER || user?.role === ROLES.WHITELABEL || user?.role === ROLES.AGENCY) && (
              <button
                onClick={() => { setShowModal('client'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboardContent.addClient')}
              </button>
            )}
            {(user?.role === ROLES.OWNER || user?.role === ROLES.WHITELABEL) && (
              <button
                onClick={() => { setShowModal('agency'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('dashboardContent.addAgency')}
              </button>
            )}
            {user?.role === ROLES.OWNER && (
              <button
                onClick={() => { setShowModal('whitelabel'); setFormData({}); setError(''); }}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2 text-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add Whitelabel
              </button>
            )}
            <div className="text-right">
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{accounts.length}</div>
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('allUsers.totalUsers')}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder={t('allUsers.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex gap-2">
          {['all', ROLES.WHITELABEL, ROLES.AGENCY, ROLES.CLIENT].filter(f => f === 'all' || user?.role === ROLES.OWNER || f !== ROLES.WHITELABEL).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-primary-600 text-white'
                  : 'bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover'
              }`}
            >
              {f === 'all' ? t('common.all') : f === ROLES.AGENCY ? t('sidebar.agencies') : t('sidebar.clients')}
            </button>
          ))}
        </div>
      </div>

      {/* Accounts Table */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-dark-hover">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credits.user')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common.role')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credits.title')}</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('credits.agency')}</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
                {filteredAccounts.map((account) => (
                  <tr key={account.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-white text-sm font-medium">
                          {(account.name || account.email)[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900 dark:text-white">{account.name || 'Unnamed'}</span>
                            <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400">ID: {account.id}</span>
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">{account.email}</div>
                          {account.waProjects?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {account.waProjects.map(wp => (
                                <span
                                  key={wp.id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                  title={`Messages: ${wp.totalMensajes} | Alerts: ${wp.alertasCount}${wp.ultimaActividad ? ' | Last: ' + new Date(wp.ultimaActividad).toLocaleDateString() : ''}`}
                                >
                                  <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
                                  </svg>
                                  {wp.nombre}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex flex-col gap-1">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full border w-fit ${getRoleBadgeColor(account.role)}`}>
                          {account.role}
                        </span>
                        {account.role === ROLES.CLIENT && account.planType && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 w-fit">
                            {account.planType}
                          </span>
                        )}
                        {account.planPrice != null && (
                          <span className="text-xs text-gray-400">${account.planPrice.toFixed(2)}/mo</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`font-medium ${getCreditColor(account.vapiCredits || 0)}`}>
                        ${(account.vapiCredits || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {account.agency ? (
                        <span className="text-sm text-gray-600 dark:text-gray-300">
                          {account.agency.name || account.agency.email}
                        </span>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-2">
                        {account.id !== user?.id && (
                          <button
                            onClick={() => handleSwitch(account)}
                            disabled={switching === account.id}
                            className="px-3 py-1.5 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 text-sm rounded-lg hover:bg-gray-200 dark:hover:bg-dark-border transition-colors disabled:opacity-50 flex items-center gap-1.5"
                          >
                            {switching === account.id ? (
                              <>
                                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-600 dark:border-gray-300"></div>
                                {t('common.switching')}
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                                </svg>
                                {t('common.accessAccount')}
                              </>
                            )}
                          </button>
                        )}
                        {(user?.role === ROLES.OWNER || user?.role === ROLES.WHITELABEL || (user?.role === ROLES.AGENCY && account.agencyId === user?.id)) && (
                          <button
                            onClick={() => openBillingModal(account)}
                            className="px-3 py-1.5 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 transition-colors"
                          >
                            {t('common.manageBilling')}
                          </button>
                        )}
                        {(() => {
                          const canRole = canChangeRoleOf(account)
                          const canBilling = user?.role === ROLES.OWNER && (account.role === ROLES.WHITELABEL || account.role === ROLES.AGENCY)
                          const canPhoneSwitch = user?.role === ROLES.OWNER
                          const canDelete = account.id !== user?.id && (user?.role === ROLES.OWNER || user?.role === ROLES.WHITELABEL || (user?.role === ROLES.AGENCY && account.agencyId === user?.id))
                          if (!canRole && !canBilling && !canPhoneSwitch && !canDelete) return null
                          const open = rowMenu === account.id
                          return (
                            <div className="relative" data-row-menu>
                              <button
                                onClick={(e) => openRowMenu(e, account.id)}
                                className="px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-dark-border text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
                                title="Más acciones"
                              >
                                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 8a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4zm0 6a2 2 0 100-4 2 2 0 000 4z" /></svg>
                              </button>
                              {/* Rendered into <body>: inside the table the menu
                                  paints underneath the next row's buttons, which
                                  hides its options and swallows the clicks. */}
                              {open && createPortal(
                                <>
                                  <div className="fixed inset-0 z-[998]" onClick={() => setRowMenu(null)} />
                                  <div
                                    className="fixed w-52 z-[999] bg-white dark:bg-dark-card border border-gray-200 dark:border-dark-border rounded-xl shadow-lg py-1 text-left"
                                    style={{ top: rowMenuPos?.top, bottom: rowMenuPos?.bottom, right: rowMenuPos?.right }}
                                  >
                                    {canRole && (
                                      <button onClick={() => { setRowMenu(null); openRoleModal(account) }}
                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-dark-hover">
                                        Cambiar rol
                                      </button>
                                    )}
                                    {canBilling && (
                                      <button onClick={() => { setRowMenu(null); openWhopModal(account) }}
                                        className="w-full text-left px-4 py-2 text-sm text-purple-700 dark:text-purple-300 hover:bg-gray-50 dark:hover:bg-dark-hover">
                                        Facturación
                                      </button>
                                    )}
                                    {canPhoneSwitch && (
                                      <button onClick={() => { setRowMenu(null); openPhoneSwitchModal(account) }}
                                        className="w-full text-left px-4 py-2 text-sm text-teal-700 dark:text-teal-300 hover:bg-gray-50 dark:hover:bg-dark-hover">
                                        Cambio de número (agentes API)
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button onClick={() => { setRowMenu(null); handleDeleteUser(account) }}
                                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 border-t border-gray-100 dark:border-dark-border">
                                        Eliminar cuenta
                                      </button>
                                    )}
                                  </div>
                                </>,
                                document.body
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredAccounts.length === 0 && (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 dark:bg-dark-hover rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                {search ? t('subAccounts.noMatchingAccounts') : t('credits.noUsersFound')}
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                {search ? t('subAccounts.adjustSearch') : t('subAccounts.noCreatedYet')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Role Change Modal */}
      {roleTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cambiar rol</h3>
              <button onClick={() => setRoleTarget(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              <span className="font-medium text-gray-900 dark:text-white">{roleTarget.name || roleTarget.email}</span>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">Rol actual: <span className="font-mono">{roleTarget.role}</span></p>

            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">Nuevo rol</label>
            <div className="space-y-2">
              {allowedTargetRoles.map((r) => (
                <label key={r} className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer ${newRole === r ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}>
                  <input type="radio" name="newRole" value={r} checked={newRole === r} onChange={() => setNewRole(r)} className="accent-primary-600" />
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full border ${getRoleBadgeColor(r)}`}>{r}</span>
                  {r === roleTarget.role && <span className="text-xs text-gray-500 ml-auto">(actual)</span>}
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setRoleTarget(null)}
                disabled={roleSaving}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover rounded-lg disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={submitRoleChange}
                disabled={roleSaving || !newRole || newRole === roleTarget.role}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {roleSaving ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Billing Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          {/* Capped at the window height: this modal grew long (collection, payment
              link, features, sections, plan, receipts) and used to run off-screen. */}
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-md mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('common.manageBilling')}
              </h3>
              <button
                onClick={closeBillingModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Only this middle part scrolls; header and buttons stay put. */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">

            {/* User info */}
            <div className="mb-6 p-4 bg-gray-50 dark:bg-dark-hover rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-600 flex items-center justify-center text-white font-medium">
                  {(editingUser.name || editingUser.email)[0].toUpperCase()}
                </div>
                <div>
                  <div className="font-medium text-gray-900 dark:text-white">{editingUser.name || 'Unnamed'}</div>
                  <div className="text-sm text-gray-500 dark:text-gray-400">{editingUser.email}</div>
                </div>
              </div>
              <div className="mt-3 text-sm">
                <span className="text-gray-500 dark:text-gray-400">{t('allUsers.currentCredits')} </span>
                <span className="font-medium text-gray-900 dark:text-white">${(editingUser.vapiCredits || 0).toFixed(2)}</span>
              </div>
            </div>

            {error && (
              <div className="mb-4 bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 bg-green-500/10 border border-green-500/30 text-green-400 px-4 py-3 rounded-lg text-sm">
                {success}
              </div>
            )}

            {/* Collect from the saved card — settles what the account has run up */}
            {cardStatus && cardStatus.provider !== 'manual' && (
              <div className="mb-4 p-4 rounded-lg border border-gray-200 dark:border-dark-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Cobrar con tarjeta guardada</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cardStatus.hasCard ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-dark-hover dark:text-gray-400'}`}>
                    {cardStatus.hasCard ? `tarjeta en ${cardStatus.provider === 'stripe' ? 'Stripe' : 'Whop'}` : 'sin tarjeta'}
                  </span>
                </div>

                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {cardStatus.outstanding > 0
                    ? `Esta cuenta acumula $${cardStatus.outstanding.toFixed(2)} sin pagar. El cobro suma ese monto en créditos, así que el saldo vuelve a cero.`
                    : 'La cuenta no debe nada. Puedes cobrar igual el monto que indiques; entra como saldo a favor.'}
                </p>

                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min={cardStatus.min}
                      value={chargeAmount}
                      onChange={(e) => setChargeAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={!cardStatus.hasCard}
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={chargeSavedCard}
                    disabled={charging || !cardStatus.hasCard}
                    className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {charging ? 'Cobrando…' : 'Cobrar'}
                  </button>
                </div>

                {!cardStatus.hasCard && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
                    El cliente tiene que guardar una tarjeta desde su panel de créditos antes de que puedas cobrarle.
                  </p>
                )}
              </div>
            )}

            {/* Public payment link — the client pays without logging in, and the
                same page can be embedded in their own site. */}
            {payLink && (
              <div className="mb-4 p-4 rounded-lg border border-gray-200 dark:border-dark-border">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enlace de pago del cliente</span>
                  {payLink.token && (
                    <button type="button" onClick={() => issuePayLink(true)} disabled={payLinkBusy}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline disabled:opacity-50">
                      Regenerar
                    </button>
                  )}
                </div>

                {!payLink.token ? (
                  <>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                      Crea una página donde este cliente ve lo que debe y paga sin entrar a la plataforma. Sirve como enlace y como iframe para su propio sitio.
                    </p>
                    <button type="button" onClick={() => issuePayLink(false)} disabled={payLinkBusy}
                      className="px-4 py-2 bg-primary-600 text-white text-sm rounded-lg hover:bg-primary-700 disabled:opacity-50">
                      {payLinkBusy ? 'Creando…' : 'Crear enlace de pago'}
                    </button>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Enlace directo</label>
                      <div className="flex gap-2">
                        <input readOnly value={payLink.url}
                          onFocus={(e) => e.target.select()}
                          className="flex-1 px-3 py-2 text-xs bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300" />
                        <button type="button" onClick={() => copyToClipboard(payLink.url, 'url')}
                          className="px-3 py-2 text-xs bg-gray-800 dark:bg-dark-hover text-white rounded-lg hover:opacity-90">
                          {copied === 'url' ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Código para incrustar en otro sitio</label>
                      <div className="flex gap-2">
                        <textarea readOnly value={payLink.embed} rows={2}
                          onFocus={(e) => e.target.select()}
                          className="flex-1 px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300" />
                        <button type="button" onClick={() => copyToClipboard(payLink.embed, 'embed')}
                          className="px-3 py-2 text-xs bg-gray-800 dark:bg-dark-hover text-white rounded-lg hover:opacity-90 self-start">
                          {copied === 'embed' ? '¡Copiado!' : 'Copiar'}
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      Quien tenga el enlace puede ver el saldo de esta cuenta y pagarlo. No da acceso a llamadas, mensajes ni al panel.
                    </p>
                  </div>
                )}
              </div>
            )}

            <form id="account-billing-form" onSubmit={handleBillingSubmit} className="space-y-4">
              {/* Credits Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('allUsers.creditsAdjustment')}
                </label>
                <div className="flex gap-2">
                  <select
                    value={billingForm.creditOperation}
                    onChange={(e) => setBillingForm({ ...billingForm, creditOperation: e.target.value })}
                    className="px-3 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="add">{t('allUsers.add')}</option>
                    <option value="subtract">{t('allUsers.subtract')}</option>
                    <option value="set">{t('allUsers.setTo')}</option>
                  </select>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billingForm.credits}
                      onChange={(e) => setBillingForm({ ...billingForm, credits: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                </div>
              </div>

              {/* Features Section */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  {t('common.featureToggles')}
                </label>
                <div className="space-y-3">
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{t('common.voiceAgents')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.voiceAgentsEnabled ? t('common.enabled') : t('common.disabled')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, voiceAgentsEnabled: !billingForm.voiceAgentsEnabled })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.voiceAgentsEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.voiceAgentsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{t('common.chatbots')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.chatbotsEnabled ? t('common.enabled') : t('common.disabled')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, chatbotsEnabled: !billingForm.chatbotsEnabled })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.chatbotsEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.chatbotsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{t('common.crm')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.crmEnabled ? t('common.enabled') : t('common.disabled')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, crmEnabled: !billingForm.crmEnabled })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.crmEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.crmEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{t('common.agentGenerator')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.agentGeneratorEnabled ? t('common.enabled') : t('common.disabled')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, agentGeneratorEnabled: !billingForm.agentGeneratorEnabled })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.agentGeneratorEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.agentGeneratorEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  {/* Budgets are inherited: switched on for a partner, every account below it gets them */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">Presupuestos (bolsillos)</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.budgetsEnabled ? t('common.enabled') : t('common.disabled')}
                        {(editingUser.role === 'WHITELABEL' || editingUser.role === 'AGENCY') && ' · aplica a todas las cuentas que cuelgan de esta'}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, budgetsEnabled: !billingForm.budgetsEnabled })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.budgetsEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.budgetsEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{t('common.pauseCalls')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.callsPaused ? t('common.callsPaused') : t('common.disabled')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, callsPaused: !billingForm.callsPaused })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.callsPaused ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.callsPaused ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-dark-hover rounded-lg">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{t('common.pauseMessages')}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {billingForm.messagesPaused ? t('common.messagesPaused') : t('common.disabled')}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setBillingForm({ ...billingForm, messagesPaused: !billingForm.messagesPaused })}
                      className={`w-11 h-6 rounded-full p-0.5 transition-colors ${billingForm.messagesPaused ? 'bg-orange-500' : 'bg-gray-300 dark:bg-gray-600'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${billingForm.messagesPaused ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Visible sections (per-user menu access) */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Secciones visibles</label>
                <p className="text-xs text-gray-500 dark:text-gray-400">Desmarca para ocultar la sección a este usuario (no aparece en el menú y no puede entrar por URL).</p>
                <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {MANAGEABLE_ITEMS.map(item => {
                    const hidden = billingForm.hiddenSections.includes(item.id)
                    return (
                      <label key={item.id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer py-0.5">
                        <input
                          type="checkbox"
                          checked={!hidden}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? billingForm.hiddenSections.filter(x => x !== item.id)
                              : [...billingForm.hiddenSections, item.id]
                            setBillingForm({ ...billingForm, hiddenSections: next })
                          }}
                          className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                        />
                        {item.label}
                      </label>
                    )
                  })}
                </div>
              </div>

              {/* Plan Section */}
              <div className="space-y-3">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Plan</label>
                {editingUser.role === ROLES.CLIENT && (
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan Type</label>
                    <select
                      value={billingForm.planType}
                      onChange={(e) => setBillingForm({ ...billingForm, planType: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    >
                      <option value="">— No plan —</option>
                      <option value="DIY">DIY</option>
                      <option value="DFY">DFY</option>
                      <option value="Partnership">Partnership</option>
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">Plan Price ($/mo)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billingForm.planPrice}
                      onChange={(e) => setBillingForm({ ...billingForm, planPrice: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Coste de infraestructura ($/mes)
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={billingForm.infraMonthlyCost}
                      onChange={(e) => setBillingForm({ ...billingForm, infraMonthlyCost: e.target.value })}
                      placeholder="0.00"
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                  <input
                    value={billingForm.infraCostNote}
                    onChange={(e) => setBillingForm({ ...billingForm, infraCostNote: e.target.value })}
                    maxLength={200}
                    placeholder="Qué cubre (servidor, números, licencias…)"
                    className="w-full mt-2 px-3 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                  />
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                    Se descuenta del saldo de la cuenta el día 30 de cada mes (el último día en meses más cortos). En blanco no se cobra nada.
                  </p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                    Chatbot $/message <span className="text-gray-400 normal-case">(blank = default $0.01)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                    <input
                      type="number"
                      step="0.001"
                      min="0"
                      value={billingForm.chatbotMessagePrice}
                      onChange={(e) => setBillingForm({ ...billingForm, chatbotMessagePrice: e.target.value })}
                      placeholder="0.01"
                      className="w-full pl-7 pr-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                    />
                  </div>
                </div>
              </div>

              {/* Where Stripe sends the receipt for this account's payments */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Correo para recibos de pago
                </label>
                <input
                  type="email"
                  value={billingForm.receiptEmail}
                  onChange={(e) => setBillingForm({ ...billingForm, receiptEmail: e.target.value })}
                  placeholder={editingUser.email}
                  className="w-full px-4 py-2 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Stripe manda el recibo aquí cada vez que esta cuenta paga. En blanco, va al correo de la cuenta.
                  {(editingUser.role === 'WHITELABEL' || editingUser.role === 'AGENCY') && ' Al ser un socio, también aplica a las cuentas que cuelgan de él y no tengan su propio correo.'}
                </p>
              </div>

            </form>
            </div>

            {/* Pinned to the bottom, so Save is one click away no matter how far
                down the form the reader is. */}
            <div className="flex gap-3 px-6 py-4 border-t border-gray-200 dark:border-dark-border shrink-0">
              <button
                type="button"
                onClick={closeBillingModal}
                className="flex-1 px-4 py-2 border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="account-billing-form"
                disabled={saving}
                className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    {t('common.saving')}
                  </>
                ) : (
                  t('common.saveChanges')
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Client Modal */}
      {showModal === 'client' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboardContent.addNewClient')}</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate('client'); }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.phoneNumber')}</label>
                <input
                  type="tel"
                  value={formData.phoneNumber || ''}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')} *</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.password')} *</label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan Type</label>
                <select
                  value={formData.planType || ''}
                  onChange={(e) => setFormData({ ...formData, planType: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">— No plan —</option>
                  <option value="DIY">DIY</option>
                  <option value="DFY">DFY</option>
                  <option value="Partnership">Partnership</option>
                </select>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan Price ($/mo)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.planPrice || ''}
                    onChange={(e) => setFormData({ ...formData, planPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {creating ? t('common.creating') : t('dashboardContent.addClient')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Agency Modal */}
      {showModal === 'agency' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">{t('dashboardContent.addNewAgency')}</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate('agency'); }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.phoneNumber')}</label>
                <input
                  type="tel"
                  value={formData.phoneNumber || ''}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')} *</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.password')} *</label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan Price ($/mo)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.planPrice || ''}
                    onChange={(e) => setFormData({ ...formData, planPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {creating ? t('common.creating') : t('dashboardContent.addAgency')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Whitelabel Modal */}
      {showModal === 'whitelabel' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-dark-border">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Whitelabel</h2>
              <button onClick={() => setShowModal(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); handleCreate('whitelabel'); }}>
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.name')}</label>
                <input
                  type="text"
                  value={formData.name || ''}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.phoneNumber')}</label>
                <input
                  type="tel"
                  value={formData.phoneNumber || ''}
                  onChange={(e) => setFormData({ ...formData, phoneNumber: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.email')} *</label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('common.password')} *</label>
                <input
                  type="password"
                  value={formData.password || ''}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-3 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Plan Price ($/mo)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.planPrice || ''}
                    onChange={(e) => setFormData({ ...formData, planPrice: e.target.value })}
                    placeholder="0.00"
                    className="w-full pl-7 pr-4 py-2 bg-gray-50 dark:bg-dark-hover border border-gray-300 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setShowModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? t('common.creating') : 'Add Whitelabel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Partner Whop config modal (OWNER → WHITELABEL) */}
      {whopTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setWhopTarget(null)}>
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Modo de facturación</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{whopTarget.email} · {whopTarget.role}</p>
              </div>
              <button onClick={() => setWhopTarget(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Cómo pagan <strong>los clientes de este partner</strong>. El partner siempre te compra sus créditos a ti (tu Whop global); esto define cómo le pagan a él sus cuentas.
              </p>

              {/* Mode selector */}
              <div className="space-y-2">
                {[
                  { value: 'platform', title: 'Whop de la plataforma', desc: 'Los clientes del partner pagan por tu Whop global (tú recibes el dinero).' },
                  { value: 'own_whop', title: 'Su propio Whop', desc: 'Los clientes del partner pagan por el Whop del partner — el dinero le llega directo a él.' },
                  { value: 'own_stripe', title: 'Su propio Stripe', desc: 'Todo lo que cuelga del partner — sus agencias y los clientes de esas agencias — paga por el Stripe del partner. El dinero le llega directo a él.' },
                  { value: 'manual', title: 'Carga manual de saldo', desc: 'Los clientes del partner no compran solos: el partner les carga crédito desde "Gestionar" y arregla el pago con ellos por fuera.' },
                ].map(opt => (
                  <label key={opt.value} className={`flex gap-2 p-3 rounded-xl border cursor-pointer transition-colors ${whopForm.billingMode === opt.value ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}>
                    <input type="radio" name="billingMode" checked={whopForm.billingMode === opt.value}
                      onChange={() => setWhopForm(f => ({ ...f, billingMode: opt.value }))} className="mt-0.5 text-primary-600 focus:ring-primary-500" />
                    <div>
                      <span className="text-sm font-medium text-gray-900 dark:text-white">{opt.title}</span>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Allow negative balance — inherited by every account below this partner */}
              <label className="flex gap-2 p-3 rounded-xl border border-gray-200 dark:border-dark-border cursor-pointer hover:bg-gray-50 dark:hover:bg-dark-hover">
                <input
                  type="checkbox"
                  checked={!!whopForm.allowNegativeBalance}
                  onChange={(e) => setWhopForm(f => ({ ...f, allowNegativeBalance: e.target.checked }))}
                  className="mt-0.5 text-primary-600 focus:ring-primary-500"
                />
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Permitir saldo negativo</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Esta cuenta y todas las que cuelgan de ella podrán seguir haciendo llamadas y enviando mensajes aunque el saldo quede en negativo.</p>
                </div>
              </label>

              {/* Whop credentials — only for own_whop */}
              {whopForm.billingMode === 'own_whop' && (
                <div className="space-y-4 border-t border-gray-100 dark:border-dark-border pt-4">
                  <div className={`px-3 py-2 rounded-lg text-xs font-medium ${whopStatus?.configured ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {whopStatus?.configured ? '✓ Whop del partner configurado — cobros van a su cuenta' : 'Falta configurar el Whop del partner (API key + company).'}
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Company ID (biz_...)</label>
                    <input type="text" value={whopForm.companyId} onChange={(e) => setWhopForm(f => ({ ...f, companyId: e.target.value }))}
                      placeholder="biz_XXXXXXXX"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      API Key {whopStatus?.hasApiKey && <span className="text-green-600 dark:text-green-400 normal-case">· ya guardada (deja en blanco para conservarla)</span>}
                    </label>
                    <input type="password" value={whopForm.apiKey} onChange={(e) => setWhopForm(f => ({ ...f, apiKey: e.target.value }))}
                      placeholder={whopStatus?.hasApiKey ? '•••••••• (sin cambios)' : 'Whop API key'} autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Webhook Secret {whopStatus?.hasWebhookSecret && <span className="text-green-600 dark:text-green-400 normal-case">· ya guardado</span>}
                    </label>
                    <input type="password" value={whopForm.webhookSecret} onChange={(e) => setWhopForm(f => ({ ...f, webhookSecret: e.target.value }))}
                      placeholder={whopStatus?.hasWebhookSecret ? '•••••••• (sin cambios)' : 'ws_... webhook signing secret'} autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                  </div>

                  {whopStatus?.webhookUrl && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">URL de webhook para el panel de Whop de este partner:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs break-all text-blue-700 dark:text-blue-300">{whopStatus.webhookUrl}</code>
                        <button onClick={() => navigator.clipboard.writeText(whopStatus.webhookUrl)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0">Copiar</button>
                      </div>
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">Pégala en Whop → Developer → Webhooks, y suscribe payment.succeeded, payment.failed y setup_intent.succeeded.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Stripe credentials — only for own_stripe */}
              {whopForm.billingMode === 'own_stripe' && (
                <div className="space-y-4 border-t border-gray-100 dark:border-dark-border pt-4">
                  <div className={`px-3 py-2 rounded-lg text-xs font-medium ${stripeStatus?.configured ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'}`}>
                    {stripeStatus?.configured
                      ? '✓ Stripe del partner configurado — los cobros van a su cuenta'
                      : 'Falta configurar Stripe (clave secreta + secreto del webhook).'}
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Clave secreta (sk_...) {stripeStatus?.hasSecretKey && <span className="text-green-600 dark:text-green-400 normal-case">· ya guardada (deja en blanco para conservarla)</span>}
                    </label>
                    <input type="password" value={stripeForm.secretKey} onChange={(e) => setStripeForm(f => ({ ...f, secretKey: e.target.value }))}
                      placeholder={stripeStatus?.hasSecretKey ? '•••••••• (sin cambios)' : 'sk_live_... o sk_test_...'} autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">Se valida contra Stripe al guardar: si la clave no sirve, no se guarda.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">Clave publicable (pk_...)</label>
                    <input type="text" value={stripeForm.publishableKey} onChange={(e) => setStripeForm(f => ({ ...f, publishableKey: e.target.value }))}
                      placeholder="pk_live_... (opcional)"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
                      Secreto del webhook (whsec_...) {stripeStatus?.hasWebhookSecret && <span className="text-green-600 dark:text-green-400 normal-case">· ya guardado</span>}
                    </label>
                    <input type="password" value={stripeForm.webhookSecret} onChange={(e) => setStripeForm(f => ({ ...f, webhookSecret: e.target.value }))}
                      placeholder={stripeStatus?.hasWebhookSecret ? '•••••••• (sin cambios)' : 'whsec_...'} autoComplete="new-password"
                      className="w-full px-3 py-2 border border-gray-200 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm" />
                  </div>

                  {stripeStatus?.webhookUrl && (
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                      <p className="text-xs font-semibold text-blue-800 dark:text-blue-300 mb-1">URL de webhook para el panel de Stripe de este partner:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs break-all text-blue-700 dark:text-blue-300">{stripeStatus.webhookUrl}</code>
                        <button onClick={() => navigator.clipboard.writeText(stripeStatus.webhookUrl)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 flex-shrink-0">Copiar</button>
                      </div>
                      <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                        Pégala en Stripe → Developers → Webhooks y suscribe: {(stripeStatus.requiredEvents || []).join(', ')}. El secreto que Stripe te dé ahí va en el campo de arriba.
                      </p>
                    </div>
                  )}

                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    Las tarjetas guardadas en Whop no se pueden trasladar a Stripe: al cambiar de modo, las cuentas con auto-recarga tendrán que volver a cargar su tarjeta.
                  </p>
                </div>
              )}

              {whopForm.billingMode === 'manual' && (
                <p className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-dark-border pt-3">
                  Los clientes de este partner no verán la opción de comprar créditos. El partner les carga saldo desde <strong>Gestionar → cobro/créditos</strong> y arregla el pago con ellos por fuera.
                </p>
              )}

              {whopMsg && <p className="text-sm text-gray-600 dark:text-gray-400">{whopMsg}</p>}
            </div>
            <div className="flex items-center justify-between gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
              <button onClick={clearWhop} disabled={whopSaving || (whopForm.billingMode === 'platform' && !whopStatus?.configured)}
                className="px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg disabled:opacity-40">
                Restablecer
              </button>
              <div className="flex items-center gap-3">
                <button onClick={() => setWhopTarget(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Cerrar</button>
                <button onClick={saveWhop} disabled={whopSaving}
                  className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                  {whopSaving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Phone-switch: pick which agents the account's number can switch between */}
      {psTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setPsTarget(null)}>
          <div className="bg-white dark:bg-dark-card rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-dark-border">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Cambio de número — agentes</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400">{psTarget.email}</p>
              </div>
              <button onClick={() => setPsTarget(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Elige los agentes que el endpoint externo <code>/api/phone-switch</code> puede usar para mover el número de teléfono de esta cuenta. Solo los marcados aquí serán seleccionables.
              </p>

              {psData?.phoneNumbers?.length > 0 && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Números: {psData.phoneNumbers.map(n => `${n.phoneNumber}${n.currentAgentName ? ` → ${n.currentAgentName}` : ''}`).join(', ')}
                </div>
              )}

              {!psData ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Cargando…</p>
              ) : psData.agents.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Esta cuenta no tiene agentes.</p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto">
                  {psData.agents.map(a => (
                    <label key={a.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${psSelected.includes(a.id) ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20' : 'border-gray-200 dark:border-dark-border hover:bg-gray-50 dark:hover:bg-dark-hover'}`}>
                      <input type="checkbox" checked={psSelected.includes(a.id)} onChange={() => togglePsAgent(a.id)}
                        className="h-4 w-4 rounded border-gray-300 text-teal-600 focus:ring-teal-500" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{a.name}</span>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{a.agentType}{!a.vapiId ? ' · sin conectar a VAPI' : ''}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}

              {psMsg && <p className="text-sm text-gray-600 dark:text-gray-400">{psMsg}</p>}
            </div>
            <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-100 dark:border-dark-border">
              <button onClick={() => setPsTarget(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Cerrar</button>
              <button onClick={savePhoneSwitch} disabled={psSaving || !psData}
                className="px-5 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 disabled:opacity-50">
                {psSaving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
