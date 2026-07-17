import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { creditsAPI, whopAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'
import WhopCheckoutModal from './WhopCheckoutModal'

export default function Credits() {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingUser, setEditingUser] = useState(null)
  const [amount, setAmount] = useState('')
  const [operation, setOperation] = useState('add')
  const [updating, setUpdating] = useState(false)

  const canManageCredits = user?.role === 'OWNER' || user?.role === 'AGENCY'

  // Buy credits state
  const [creditConfig, setCreditConfig] = useState({ enabled: false, min: 1, max: 10000, presets: [] })
  const [buyAmount, setBuyAmount] = useState('')
  const [buyModalOpen, setBuyModalOpen] = useState(false)
  const [checkoutModal, setCheckoutModal] = useState(null) // { planId }
  const [buyLoading, setBuyLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [searchParams] = useSearchParams()

  // Auto-recharge + saved card (self-service)
  const [ar, setAr] = useState({ enabled: false, threshold: '', amount: '', hasCard: false, min: 1, max: 10000 })
  const [arSaving, setArSaving] = useState(false)
  const [setupModal, setSetupModal] = useState(null) // { sessionId }
  const [setupLoading, setSetupLoading] = useState(false)
  const [rechargeAmount, setRechargeAmount] = useState('')
  const [rechargeLoading, setRechargeLoading] = useState(false)

  useEffect(() => {
    fetchCredits()
    fetchTiers()
    fetchAutoRecharge()
  }, [])

  // Detect card-setup success from redirect fallback
  useEffect(() => {
    if (searchParams.get('setup') === 'success') {
      setSuccess('Payment method saved.')
      fetchAutoRecharge()
    }
  }, [searchParams])

  // Detect checkout success from redirect
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setSuccess(t('credits.purchaseSuccess') || 'Credits purchased successfully! They will appear shortly.')
      fetchCredits()
    }
  }, [searchParams])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 5000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const fetchCredits = async () => {
    try {
      setLoading(true)
      const response = await creditsAPI.list()
      setUsers(response.data.users)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load credits')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateCredits = async (e) => {
    e.preventDefault()
    if (!editingUser || !amount) return

    try {
      setUpdating(true)
      await creditsAPI.update(editingUser.id, {
        amount: parseFloat(amount),
        operation
      })
      await fetchCredits()
      setEditingUser(null)
      setAmount('')
      setOperation('add')
      // Dispatch event to refresh sidebar
      window.dispatchEvent(new CustomEvent('creditsUpdated'))
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update credits')
    } finally {
      setUpdating(false)
    }
  }

  const fetchTiers = async () => {
    try {
      const { data } = await whopAPI.getCreditTiers()
      const next = {
        enabled: !!data.enabled,
        min: data.min || 1,
        max: data.max || 10000,
        presets: Array.isArray(data.presets) ? data.presets : [],
      }
      setCreditConfig(next)
      if (next.presets.length) setBuyAmount(String(next.presets[0]))
    } catch {
      setCreditConfig(c => ({ ...c, enabled: false }))
    }
  }

  const handleBuyCredits = async () => {
    const num = parseFloat(buyAmount)
    if (!Number.isFinite(num) || num < creditConfig.min || num > creditConfig.max) {
      setError(`Ingresa un monto entre $${creditConfig.min} y $${creditConfig.max}.`)
      return
    }
    setBuyLoading(true)
    try {
      const { data } = await creditsAPI.purchase(num)
      if (data.planId) {
        setBuyModalOpen(false)
        // checkoutId is the Whop checkout configuration id (ch_xxx) that carries
        // metadata.userId. Passing it as the embed's sessionId makes that metadata
        // propagate to the payment webhook → reliable user attribution.
        setCheckoutModal({ planId: data.planId, sessionId: data.checkoutId })
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create checkout')
    } finally {
      setBuyLoading(false)
    }
  }

  const handleCheckoutComplete = () => {
    setCheckoutModal(null)
    setSuccess(t('credits.purchaseSuccess') || 'Credits purchased! They will appear shortly.')
    setTimeout(() => fetchCredits(), 2000)
  }

  const fetchAutoRecharge = async () => {
    try {
      const { data } = await creditsAPI.getAutoRecharge()
      setAr({
        enabled: !!data.enabled,
        threshold: data.threshold ?? '',
        amount: data.amount ?? '',
        hasCard: !!data.hasCard,
        hasBackupCard: !!data.hasBackupCard,
        selfServiceDisabled: !!data.selfServiceDisabled,
        billingMode: data.billingMode || 'platform',
        lastError: data.lastError || null,
        lastErrorAt: data.lastErrorAt || null,
        failCount: data.failCount || 0,
        maxFails: data.maxFails || 3,
        disabledByFailures: !!data.disabledByFailures,
        min: data.min || 1,
        max: data.max || 10000,
      })
    } catch {
      // Endpoint unavailable (e.g. Whop not configured) — leave defaults.
    }
  }

  const handleAddCard = async (slot = 'primary') => {
    setSetupLoading(true)
    setError(null)
    try {
      const { data } = await creditsAPI.setupCard(slot)
      if (data.sessionId) setSetupModal({ sessionId: data.sessionId })
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to start card setup')
    } finally {
      setSetupLoading(false)
    }
  }

  const handleRemoveCard = async (slot) => {
    if (!window.confirm(slot === 'backup' ? '¿Quitar la tarjeta de respaldo?' : '¿Quitar la tarjeta principal?')) return
    try {
      await creditsAPI.removeCard(slot)
      fetchAutoRecharge()
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo quitar la tarjeta')
    }
  }

  const handleSetupComplete = () => {
    setSetupModal(null)
    setSuccess('Payment method saved.')
    setTimeout(() => fetchAutoRecharge(), 2000)
  }

  const handleSaveAutoRecharge = async () => {
    if (ar.enabled) {
      const th = parseFloat(ar.threshold)
      const amt = parseFloat(ar.amount)
      if (!Number.isFinite(th) || th < 0) { setError('Ingresa un umbral válido (0 o mayor).'); return }
      if (!Number.isFinite(amt) || amt < ar.min || amt > ar.max) {
        setError(`El monto de recarga debe estar entre $${ar.min} y $${ar.max}.`); return
      }
    }
    setArSaving(true)
    setError(null)
    try {
      await creditsAPI.updateAutoRecharge({
        enabled: ar.enabled,
        threshold: parseFloat(ar.threshold),
        amount: parseFloat(ar.amount),
      })
      setSuccess('Auto-recarga actualizada.')
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to save auto-recharge')
    } finally {
      setArSaving(false)
    }
  }

  const handleRechargeNow = async () => {
    const amt = parseFloat(rechargeAmount)
    if (!Number.isFinite(amt) || amt < ar.min || amt > ar.max) {
      setError(`Ingresa un monto entre $${ar.min} y $${ar.max}.`); return
    }
    setRechargeLoading(true)
    setError(null)
    try {
      await creditsAPI.rechargeNow(amt)
      setSuccess('Cobro en proceso. Los créditos aparecerán en breve.')
      setRechargeAmount('')
      setTimeout(() => fetchCredits(), 3000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to charge saved card')
    } finally {
      setRechargeLoading(false)
    }
  }

  const getRoleBadgeColor = (role) => {
    switch (role) {
      case 'OWNER':
        return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
      case 'AGENCY':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('credits.title')}</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-1">
            {t('credits.subtitle')}
          </p>
        </div>
        {creditConfig.enabled && !ar.selfServiceDisabled && (
          <button
            onClick={() => setBuyModalOpen(true)}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 transition-colors"
          >
            {t('credits.buyCredits') || 'Buy Credits'}
          </button>
        )}
      </div>

      {/* Manual-billing accounts don't self-purchase — their provider loads credit. */}
      {ar.selfServiceDisabled && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg text-sm text-blue-800 dark:text-blue-300">
          Tu proveedor gestiona el saldo de tu cuenta. Para recargar créditos, contáctalo directamente.
        </div>
      )}

      {success && (
        <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400">
          {success}
        </div>
      )}

      {error && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
          {error}
          <button onClick={() => setError(null)} className="ml-2 underline">{t('common.dismiss')}</button>
        </div>
      )}

      {/* Auto-recharge / saved card (self-service) — hidden for manual billing */}
      {creditConfig.enabled && !ar.selfServiceDisabled && (
        <div className="mb-6 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('credits.autoRecharge') || 'Auto-recarga'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                {t('credits.autoRechargeDesc') || 'Cuando tu saldo baje del umbral, cobramos tu tarjeta guardada automáticamente.'}
              </p>
            </div>
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${ar.hasCard ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'}`}>
              {ar.hasCard ? (t('credits.cardOnFile') || 'Tarjeta guardada') : (t('credits.noCard') || 'Sin tarjeta')}
            </span>
          </div>

          {/* Last decline — tells the customer why the card failed instead of
              auto-recharge going quiet after N silent failures. */}
          {ar.lastError && (
            <div className="mb-4 p-3 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
                </svg>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-red-800 dark:text-red-300">
                    {ar.disabledByFailures
                      ? 'Auto-recarga desactivada: tu tarjeta fue rechazada'
                      : 'Tu tarjeta fue rechazada'}
                  </p>
                  <p className="text-sm text-red-700 dark:text-red-400 mt-0.5">{ar.lastError}</p>
                  <p className="text-xs text-red-600 dark:text-red-500 mt-1">
                    {ar.disabledByFailures
                      ? `Se intentó ${ar.failCount} ${ar.failCount === 1 ? 'vez' : 'veces'}. Agrega otra tarjeta y vuelve a activar la auto-recarga.`
                      : `Intento ${ar.failCount} de ${ar.maxFails}. Tras ${ar.maxFails} fallos la auto-recarga se desactiva sola.`}
                    {ar.lastErrorAt ? ` · ${new Date(ar.lastErrorAt).toLocaleString()}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Saved cards — primary + optional backup. If the primary declines,
              auto-recharge automatically retries the backup. */}
          <div className="space-y-2 mb-5">
            {/* Primary */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Tarjeta principal</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ar.hasCard ? 'Guardada' : 'Sin tarjeta'}</p>
                </div>
              </div>
              {ar.hasCard ? (
                <button onClick={() => handleRemoveCard('primary')} className="text-xs text-red-500 hover:text-red-600 px-2 py-1">Quitar</button>
              ) : (
                <button onClick={() => handleAddCard('primary')} disabled={setupLoading}
                  className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium disabled:opacity-50 flex items-center gap-2">
                  {setupLoading && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>}
                  Agregar tarjeta
                </button>
              )}
            </div>
            {/* Backup */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-dark-border">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-white">Tarjeta de respaldo</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{ar.hasBackupCard ? 'Guardada — se usa si la principal falla' : 'Opcional — se intenta si la principal es rechazada'}</p>
                </div>
              </div>
              {ar.hasBackupCard ? (
                <button onClick={() => handleRemoveCard('backup')} className="text-xs text-red-500 hover:text-red-600 px-2 py-1">Quitar</button>
              ) : (
                <button onClick={() => handleAddCard('backup')} disabled={setupLoading || !ar.hasCard}
                  title={!ar.hasCard ? 'Agrega primero la tarjeta principal' : ''}
                  className="px-3 py-1.5 border border-primary-300 dark:border-primary-700 text-primary-700 dark:text-primary-300 rounded-lg text-xs font-medium disabled:opacity-40 flex items-center gap-2">
                  {setupLoading && <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary-500"></div>}
                  Agregar respaldo
                </button>
              )}
            </div>
          </div>

          {ar.hasCard && (
            <div className="space-y-5">
              {/* Toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={ar.enabled}
                  onChange={(e) => setAr(s => ({ ...s, enabled: e.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('credits.enableAutoRecharge') || 'Activar auto-recarga'}
                </span>
              </label>

              {ar.enabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {t('credits.threshold') || 'Recargar cuando baje de (USD)'}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">$</span>
                      <input
                        type="number" inputMode="decimal" min="0" step="1"
                        value={ar.threshold}
                        onChange={(e) => { setAr(s => ({ ...s, threshold: e.target.value })); setError(null) }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                      {t('credits.rechargeAmount') || 'Monto a recargar (USD)'}
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">$</span>
                      <input
                        type="number" inputMode="decimal" min={ar.min} max={ar.max} step="1"
                        value={ar.amount}
                        onChange={(e) => { setAr(s => ({ ...s, amount: e.target.value })); setError(null) }}
                        className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:border-primary-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  onClick={handleSaveAutoRecharge}
                  disabled={arSaving}
                  className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  {arSaving ? (t('common.updating') || 'Guardando...') : (t('common.save') || 'Guardar')}
                </button>
                <button
                  onClick={handleAddCard}
                  disabled={setupLoading}
                  className="px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover transition-colors disabled:opacity-50"
                >
                  {t('credits.changeCard') || 'Cambiar tarjeta'}
                </button>
              </div>

              {/* 1-click manual recharge with the saved card */}
              <div className="pt-4 border-t border-gray-200 dark:border-dark-border">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  {t('credits.rechargeNow') || 'Recargar ahora con tarjeta guardada'}
                </label>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1 max-w-[200px]">
                    <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400">$</span>
                    <input
                      type="number" inputMode="decimal" min={ar.min} max={ar.max} step="1"
                      value={rechargeAmount}
                      onChange={(e) => { setRechargeAmount(e.target.value); setError(null) }}
                      placeholder={String(ar.min)}
                      className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:border-primary-500"
                    />
                  </div>
                  <button
                    onClick={handleRechargeNow}
                    disabled={rechargeLoading || !rechargeAmount}
                    className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {rechargeLoading && <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>}
                    {t('credits.rechargeNowBtn') || 'Recargar ahora'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Buy Credits Modal — Variable Amount */}
      {buyModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-dark-border">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {t('credits.buyCredits') || 'Buy Credits'}
              </h3>
              <button
                onClick={() => setBuyModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
              >
                &times;
              </button>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('credits.buyCreditsDesc') || 'Enter the amount you want to add. $1 = 1 credit.'}
            </p>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('credits.creditAmount') || 'Amount (USD)'}
            </label>
            <div className="relative mb-3">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-gray-400 dark:text-gray-500">$</span>
              <input
                type="number"
                inputMode="decimal"
                min={creditConfig.min}
                max={creditConfig.max}
                step="1"
                value={buyAmount}
                onChange={(e) => { setBuyAmount(e.target.value); setError(null) }}
                placeholder={String(creditConfig.min)}
                disabled={buyLoading}
                className="w-full pl-7 pr-3 py-2.5 rounded-lg bg-white dark:bg-dark-bg border border-gray-300 dark:border-dark-border text-gray-900 dark:text-white focus:outline-none focus:border-primary-500 disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mb-4">
              {t('credits.minCreditAmount')}: ${creditConfig.min} – ${creditConfig.max}
            </p>
            {creditConfig.presets.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-5">
                {creditConfig.presets.map(preset => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => { setBuyAmount(String(preset)); setError(null) }}
                    disabled={buyLoading}
                    className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-dark-border text-gray-700 dark:text-gray-300 hover:border-primary-500 hover:text-primary-600 dark:hover:text-primary-400 transition-colors disabled:opacity-50"
                  >
                    ${preset}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={handleBuyCredits}
              disabled={buyLoading || !buyAmount}
              className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {buyLoading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>{t('credits.buyCredits') || 'Buy Credits'}</>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Whop Checkout Modal */}
      {checkoutModal && (
        <WhopCheckoutModal
          planId={checkoutModal.planId}
          sessionId={checkoutModal.sessionId}
          userEmail={user?.email}
          onComplete={handleCheckoutComplete}
          onClose={() => setCheckoutModal(null)}
        />
      )}

      {/* Whop Setup (save card) Modal */}
      {setupModal && (
        <WhopCheckoutModal
          sessionId={setupModal.sessionId}
          userEmail={user?.email}
          title={t('credits.addCard') || 'Agregar tarjeta'}
          onComplete={handleSetupComplete}
          onClose={() => setSetupModal(null)}
        />
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-dark-card rounded-xl p-6 max-w-md w-full mx-4 border border-gray-200 dark:border-dark-border">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              {t('credits.updateCreditsFor', { name: editingUser.name || editingUser.email })}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              {t('credits.currentBalance')} <span className="font-semibold text-primary-600 dark:text-primary-400">${editingUser.vapiCredits?.toFixed(2) || '0.00'}</span>
            </p>

            <form onSubmit={handleUpdateCredits}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('credits.operation')}
                </label>
                <select
                  value={operation}
                  onChange={(e) => setOperation(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                >
                  <option value="add">{t('credits.addCredits')}</option>
                  <option value="subtract">{t('credits.subtractCredits')}</option>
                  <option value="set">{t('credits.setBalance')}</option>
                </select>
              </div>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  {t('credits.amount')}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-dark-border rounded-lg bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
                  required
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setEditingUser(null)
                    setAmount('')
                    setOperation('add')
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
                >
                  {updating ? t('common.updating') : t('common.update')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-dark-hover">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('credits.user')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('common.role')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('credits.agency')}
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {t('credits.title')}
                </th>
                {canManageCredits && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                    {t('common.actions')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-dark-border">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-dark-hover">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="font-medium text-gray-900 dark:text-white">
                        {u.name || 'No name'}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {u.email}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${getRoleBadgeColor(u.role)}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                    {u.agency?.name || u.agency?.email || '-'}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`font-semibold ${u.vapiCredits > 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      ${u.vapiCredits?.toFixed(2) || '0.00'}
                    </span>
                  </td>
                  {canManageCredits && (
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      {(user.role === 'OWNER' || (user.role === 'AGENCY' && u.agencyId === user.id)) && (
                        <button
                          onClick={() => setEditingUser(u)}
                          className="text-primary-600 dark:text-primary-400 hover:text-primary-800 dark:hover:text-primary-300 text-sm font-medium"
                        >
                          {t('common.manageCredits')}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={canManageCredits ? 5 : 4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    {t('credits.noUsersFound')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
