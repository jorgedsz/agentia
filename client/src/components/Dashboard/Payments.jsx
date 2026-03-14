import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { useLanguage } from '../../context/LanguageContext'
import { paymentsAPI, usersAPI } from '../../services/api'

const ROLES = {
  OWNER: 'OWNER',
  AGENCY: 'AGENCY',
  CLIENT: 'CLIENT'
}

export default function Payments() {
  const { user } = useAuth()
  const { t } = useLanguage()

  const [tiers, setTiers] = useState([])
  const [plans, setPlans] = useState([])
  const [allUsers, setAllUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Tier modal
  const [tierModal, setTierModal] = useState(null) // null | 'create' | tier object (edit)
  const [tierForm, setTierForm] = useState({ name: '', description: '', price: '', billingCycle: 'monthly', sortOrder: 0, isActive: true, features: ['voiceAgents', 'chatbots'] })
  const [tierSaving, setTierSaving] = useState(false)

  // Plan modal
  const [planModal, setPlanModal] = useState(null) // null | { userId, existing? }
  const [planForm, setPlanForm] = useState({ planTierId: '', amount: '', billingCycle: 'monthly', nextPaymentDate: '', status: 'active', notes: '' })
  const [planSaving, setPlanSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const fetchData = async () => {
    setLoading(true)
    setError('')
    try {
      const [tiersRes, plansRes] = await Promise.all([
        paymentsAPI.listTiers(),
        paymentsAPI.listPlans(),
      ])
      setTiers(tiersRes.data)
      setPlans(plansRes.data)

      // Fetch users for plan assignment (OWNER/AGENCY only)
      if (user?.role === ROLES.OWNER) {
        const usersRes = await usersAPI.getAll()
        setAllUsers(usersRes.data.users || [])
      } else if (user?.role === ROLES.AGENCY) {
        const usersRes = await usersAPI.getClients()
        setAllUsers(usersRes.data.clients || [])
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // ── Tier CRUD ──

  const openCreateTier = () => {
    setTierForm({ name: '', description: '', price: '', billingCycle: 'monthly', sortOrder: 0, isActive: true, features: ['voiceAgents', 'chatbots'] })
    setTierModal('create')
  }

  const openEditTier = (tier) => {
    const features = (() => { try { return JSON.parse(tier.features || '[]') } catch { return [] } })()
    setTierForm({ name: tier.name, description: tier.description || '', price: tier.price, billingCycle: tier.billingCycle, sortOrder: tier.sortOrder, isActive: tier.isActive, features })
    setTierModal(tier)
  }

  const saveTier = async () => {
    setTierSaving(true)
    setError('')
    try {
      if (tierModal === 'create') {
        await paymentsAPI.createTier(tierForm)
        setSuccess(t('payments.tierCreated'))
      } else {
        await paymentsAPI.updateTier(tierModal.id, tierForm)
        setSuccess(t('payments.tierUpdated'))
      }
      setTierModal(null)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save tier')
    } finally {
      setTierSaving(false)
    }
  }

  const deleteTier = async (tier) => {
    if (!confirm(t('payments.confirmDeleteTier'))) return
    try {
      await paymentsAPI.deleteTier(tier.id)
      setSuccess(t('payments.tierDeleted'))
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete tier')
    }
  }

  // ── Plan CRUD ──

  const openAssignPlan = (userId) => {
    const existing = plans.find(p => p.userId === userId)
    if (existing) {
      setPlanForm({
        planTierId: String(existing.planTierId),
        amount: String(existing.amount),
        billingCycle: existing.billingCycle,
        nextPaymentDate: existing.nextPaymentDate ? existing.nextPaymentDate.slice(0, 10) : '',
        status: existing.status,
        notes: existing.notes || '',
      })
      setPlanModal({ userId, existing: true })
    } else {
      setPlanForm({ planTierId: '', amount: '', billingCycle: 'monthly', nextPaymentDate: '', status: 'active', notes: '' })
      setPlanModal({ userId, existing: false })
    }
  }

  const savePlan = async () => {
    setPlanSaving(true)
    setError('')
    try {
      const data = {
        planTierId: parseInt(planForm.planTierId),
        billingCycle: planForm.billingCycle,
        nextPaymentDate: planForm.nextPaymentDate || null,
        notes: planForm.notes,
        status: planForm.status,
      }
      if (planForm.amount !== '') data.amount = parseFloat(planForm.amount)

      if (planModal.existing) {
        await paymentsAPI.updatePlan(planModal.userId, data)
        setSuccess(t('payments.planUpdated'))
      } else {
        await paymentsAPI.assignPlan(planModal.userId, data)
        setSuccess(t('payments.planAssigned'))
      }
      setPlanModal(null)
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save plan')
    } finally {
      setPlanSaving(false)
    }
  }

  const removePlan = async (userId) => {
    if (!confirm(t('payments.confirmRemovePlan'))) return
    try {
      await paymentsAPI.removePlan(userId)
      setSuccess(t('payments.planRemoved'))
      fetchData()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove plan')
    }
  }

  // When tier is selected in plan form, set default amount
  const handleTierSelect = (tierId) => {
    const tier = tiers.find(t => t.id === parseInt(tierId))
    setPlanForm(prev => ({
      ...prev,
      planTierId: tierId,
      amount: tier ? String(tier.price) : prev.amount,
      billingCycle: tier ? tier.billingCycle : prev.billingCycle,
    }))
  }

  const formatCurrency = (amount) => `$${parseFloat(amount).toFixed(2)}`

  const getBillingCycleLabel = (cycle) => {
    switch (cycle) {
      case 'monthly': return t('payments.monthly')
      case 'quarterly': return t('payments.quarterly')
      case 'annual': return t('payments.annual')
      default: return cycle
    }
  }

  const getBillingCycleSuffix = (cycle) => {
    switch (cycle) {
      case 'monthly': return t('payments.perMonth')
      case 'quarterly': return t('payments.perQuarter')
      case 'annual': return t('payments.perYear')
      default: return ''
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
      case 'cancelled': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
      case 'past_due': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return t('payments.statusActive')
      case 'cancelled': return t('payments.statusCancelled')
      case 'past_due': return t('payments.statusPastDue')
      default: return status
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // CLIENT view – read-only plan card
  if (user?.role === ROLES.CLIENT) {
    const myPlan = plans.find(p => p.userId === user.id)
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('payments.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-6">{t('payments.myPlan')}</p>

        {myPlan ? (
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 max-w-md">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">{myPlan.planTier?.name}</h3>
            {myPlan.planTier?.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{myPlan.planTier.description}</p>
            )}
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('payments.amount')}</span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {formatCurrency(myPlan.amount)}{getBillingCycleSuffix(myPlan.billingCycle)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('payments.billingCycle')}</span>
                <span className="text-gray-900 dark:text-white">{getBillingCycleLabel(myPlan.billingCycle)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600 dark:text-gray-400">{t('payments.status')}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(myPlan.status)}`}>
                  {getStatusLabel(myPlan.status)}
                </span>
              </div>
              {myPlan.nextPaymentDate && (
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{t('payments.nextPaymentDate')}</span>
                  <span className="text-gray-900 dark:text-white">{new Date(myPlan.nextPaymentDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-8 text-center max-w-md">
            <p className="text-gray-500 dark:text-gray-400">{t('payments.noPlan')}</p>
          </div>
        )}
      </div>
    )
  }

  // OWNER / AGENCY view
  // Users that don't have a plan yet (for assign dropdown)
  const usersWithoutPlan = allUsers.filter(u => !plans.find(p => p.userId === u.id))

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">{t('payments.title')}</h1>
        <p className="text-gray-500 dark:text-gray-400">{t('payments.subtitle')}</p>
      </div>

      {/* Status messages */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 p-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 p-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Plan Tiers (OWNER only) */}
      {user?.role === ROLES.OWNER && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('payments.planTiers')}</h2>
            <button
              onClick={openCreateTier}
              className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
            >
              {t('payments.createTier')}
            </button>
          </div>

          {tiers.length === 0 ? (
            <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('payments.noTiers')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-dark-border text-left text-gray-500 dark:text-gray-400">
                    <th className="px-4 py-3 font-medium">{t('payments.tierName')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.tierPrice')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.billingCycle')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.features')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.status')}</th>
                    <th className="px-4 py-3 font-medium">{t('payments.sortOrder')}</th>
                    <th className="px-4 py-3 font-medium">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {tiers.map(tier => (
                    <tr key={tier.id} className="border-b border-gray-100 dark:border-dark-border/50">
                      <td className="px-4 py-3">
                        <div className="font-medium text-gray-900 dark:text-white">{tier.name}</div>
                        {tier.description && <div className="text-xs text-gray-500 dark:text-gray-400">{tier.description}</div>}
                      </td>
                      <td className="px-4 py-3 text-gray-900 dark:text-white">{formatCurrency(tier.price)}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{getBillingCycleLabel(tier.billingCycle)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 flex-wrap">
                          {(() => { try { return JSON.parse(tier.features || '[]') } catch { return [] } })().map(f => (
                            <span key={f} className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                              {f === 'voiceAgents' ? t('payments.featureVoiceAgents') : t('payments.featureChatbots')}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tier.isActive ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'}`}>
                          {tier.isActive ? t('common.active') : t('common.inactive')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{tier.sortOrder}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button onClick={() => openEditTier(tier)} className="text-primary-600 hover:text-primary-700 text-sm">{t('common.edit')}</button>
                          <button onClick={() => deleteTier(tier)} className="text-red-500 hover:text-red-600 text-sm">{t('common.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* User Plans */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('payments.userPlans')}</h2>
          {usersWithoutPlan.length > 0 && (
            <select
              onChange={(e) => { if (e.target.value) openAssignPlan(parseInt(e.target.value)); e.target.value = '' }}
              className="px-3 py-1.5 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors cursor-pointer appearance-none"
              defaultValue=""
            >
              <option value="" disabled>{t('payments.assignPlan')}</option>
              {usersWithoutPlan.map(u => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
          )}
        </div>

        {plans.length === 0 ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">{t('payments.noPlans')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-dark-border text-left text-gray-500 dark:text-gray-400">
                  <th className="px-4 py-3 font-medium">{t('payments.user')}</th>
                  <th className="px-4 py-3 font-medium">{t('payments.plan')}</th>
                  <th className="px-4 py-3 font-medium">{t('payments.amount')}</th>
                  <th className="px-4 py-3 font-medium">{t('payments.billingCycle')}</th>
                  <th className="px-4 py-3 font-medium">{t('payments.status')}</th>
                  <th className="px-4 py-3 font-medium">{t('payments.nextPaymentDate')}</th>
                  <th className="px-4 py-3 font-medium">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map(plan => (
                  <tr key={plan.id} className="border-b border-gray-100 dark:border-dark-border/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">{plan.user?.name || plan.user?.email}</div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">{plan.user?.email}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">{plan.planTier?.name}</td>
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {formatCurrency(plan.amount)}{getBillingCycleSuffix(plan.billingCycle)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{getBillingCycleLabel(plan.billingCycle)}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(plan.status)}`}>
                        {getStatusLabel(plan.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {plan.nextPaymentDate ? new Date(plan.nextPaymentDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button onClick={() => openAssignPlan(plan.userId)} className="text-primary-600 hover:text-primary-700 text-sm">{t('common.edit')}</button>
                        <button onClick={() => removePlan(plan.userId)} className="text-red-500 hover:text-red-600 text-sm">{t('common.remove')}</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Tier Modal */}
      {tierModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-md">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {tierModal === 'create' ? t('payments.createTier') : t('payments.editTier')}
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.tierName')}</label>
                <input
                  type="text"
                  value={tierForm.name}
                  onChange={e => setTierForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.tierDescription')}</label>
                <input
                  type="text"
                  value={tierForm.description}
                  onChange={e => setTierForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.tierPrice')} ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={tierForm.price}
                    onChange={e => setTierForm(f => ({ ...f, price: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.billingCycle')}</label>
                  <select
                    value={tierForm.billingCycle}
                    onChange={e => setTierForm(f => ({ ...f, billingCycle: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  >
                    <option value="monthly">{t('payments.monthly')}</option>
                    <option value="quarterly">{t('payments.quarterly')}</option>
                    <option value="annual">{t('payments.annual')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.sortOrder')}</label>
                  <input
                    type="number"
                    value={tierForm.sortOrder}
                    onChange={e => setTierForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  />
                </div>
                {tierModal !== 'create' && (
                  <div className="flex items-center pt-6">
                    <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={tierForm.isActive}
                        onChange={e => setTierForm(f => ({ ...f, isActive: e.target.checked }))}
                        className="rounded"
                      />
                      {t('common.active')}
                    </label>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('payments.features')}</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tierForm.features.includes('voiceAgents')}
                      onChange={e => setTierForm(f => ({
                        ...f,
                        features: e.target.checked
                          ? [...f.features, 'voiceAgents']
                          : f.features.filter(ft => ft !== 'voiceAgents')
                      }))}
                      className="rounded"
                    />
                    {t('payments.featureVoiceAgents')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={tierForm.features.includes('chatbots')}
                      onChange={e => setTierForm(f => ({
                        ...f,
                        features: e.target.checked
                          ? [...f.features, 'chatbots']
                          : f.features.filter(ft => ft !== 'chatbots')
                      }))}
                      className="rounded"
                    />
                    {t('payments.featureChatbots')}
                  </label>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-2">
              <button
                onClick={() => setTierModal(null)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg"
>
                {t('common.cancel')}
              </button>
              <button
                onClick={saveTier}
                disabled={tierSaving || !tierForm.name || !tierForm.price}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {tierSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Plan Modal */}
      {planModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-md">
            <div className="p-4 border-b border-gray-200 dark:border-dark-border">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {planModal.existing ? t('payments.editPlan') : t('payments.assignPlan')}
              </h3>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.plan')}</label>
                <select
                  value={planForm.planTierId}
                  onChange={e => handleTierSelect(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                >
                  <option value="">{t('payments.selectTier')}</option>
                  {tiers.filter(t => t.isActive).map(tier => (
                    <option key={tier.id} value={tier.id}>{tier.name} — {formatCurrency(tier.price)}{getBillingCycleSuffix(tier.billingCycle)}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.amount')} ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={planForm.amount}
                    onChange={e => setPlanForm(f => ({ ...f, amount: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.billingCycle')}</label>
                  <select
                    value={planForm.billingCycle}
                    onChange={e => setPlanForm(f => ({ ...f, billingCycle: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  >
                    <option value="monthly">{t('payments.monthly')}</option>
                    <option value="quarterly">{t('payments.quarterly')}</option>
                    <option value="annual">{t('payments.annual')}</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.nextPaymentDate')}</label>
                  <input
                    type="date"
                    value={planForm.nextPaymentDate}
                    onChange={e => setPlanForm(f => ({ ...f, nextPaymentDate: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.status')}</label>
                  <select
                    value={planForm.status}
                    onChange={e => setPlanForm(f => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                  >
                    <option value="active">{t('payments.statusActive')}</option>
                    <option value="cancelled">{t('payments.statusCancelled')}</option>
                    <option value="past_due">{t('payments.statusPastDue')}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t('payments.notes')}</label>
                <textarea
                  value={planForm.notes}
                  onChange={e => setPlanForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-200 dark:border-dark-border flex justify-end gap-2">
              <button
                onClick={() => setPlanModal(null)}
                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-hover rounded-lg"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={savePlan}
                disabled={planSaving || !planForm.planTierId}
                className="px-4 py-2 text-sm bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {planSaving ? t('common.saving') : t('common.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
