import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { payAPI } from '../../services/api'

// Everything about an account's money in one page, meant to be embedded in
// someone else's site: what is owed and paying it, the balance, loading more,
// the budgets carved out of it, and asking for money for one of them.
//
// No login. The token in the URL is the same one the payment page uses, so a
// site that already embeds that page can swap in this one.

const money = (n) => `$${Math.abs(Number(n) || 0).toFixed(2)}`
const when = (d) => new Date(d).toLocaleDateString('es', { day: '2-digit', month: 'short' })

const STATUS = {
  pending: { label: 'Pendiente', className: 'bg-amber-100 text-amber-800' },
  approved: { label: 'Aprobada', className: 'bg-green-100 text-green-800' },
  rejected: { label: 'Rechazada', className: 'bg-gray-200 text-gray-700' },
}

export default function WalletPage() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const embedded = searchParams.get('embed') === '1'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [working, setWorking] = useState('')

  const [topUpAmount, setTopUpAmount] = useState('')
  const [ask, setAsk] = useState({ slug: '', amount: '', description: '' })
  // Approving from here is proved with the key the provider set, asked for
  // only at the moment of approving and never stored.
  const [approving, setApproving] = useState(null) // the request being approved
  const [approveForm, setApproveForm] = useState({ key: '', amount: '' })

  const load = async () => {
    try {
      const { data } = await payAPI.getWallet(token)
      setData(data)
      setAsk((current) => ({ ...current, slug: current.slug || data.budgets?.[0]?.slug || '' }))
    } catch (err) {
      setError(err.response?.status === 404
        ? 'Este enlace no existe o fue reemplazado.'
        : 'No pudimos cargar la información de tu cuenta.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  // The page carries the provider's name and logo, never the platform's.
  useEffect(() => {
    if (!data) return
    const name = data.brand?.companyName
    document.title = name ? `Saldo · ${name}` : 'Saldo'
    let icon = document.querySelector("link[rel~='icon']")
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    if (data.brand?.companyLogo) icon.href = data.brand.companyLogo
    else icon.removeAttribute('href')
  }, [data])

  // From an embed, checkout opens in another tab; refresh on the way back.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [token])

  useEffect(() => {
    if (searchParams.get('pago') === 'ok') {
      setNotice('Confirmando tu pago…')
      setTimeout(() => { setNotice('¡Pago recibido! Tu saldo se actualiza en unos segundos.'); load() }, 2500)
    }
  }, [searchParams])

  // Stripe and Whop refuse to run inside an iframe, so from an embed the
  // checkout opens in a new tab.
  const goTo = (url) => {
    if (window.top !== window.self) window.open(url, '_blank', 'noopener')
    else window.location.href = url
  }

  const payOwed = async () => {
    setWorking('pay'); setError('')
    try {
      const { data: res } = await payAPI.checkout(token)
      goTo(res.checkoutUrl || res.purchaseUrl)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar el pago.')
    } finally { setWorking('') }
  }

  const topUp = async (e) => {
    e.preventDefault()
    setWorking('topup'); setError('')
    try {
      const { data: res } = await payAPI.topUp(token, topUpAmount)
      goTo(res.url)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar la carga de saldo.')
    } finally { setWorking('') }
  }

  const askForBudget = async (e) => {
    e.preventDefault()
    setWorking('ask'); setError(''); setNotice('')
    try {
      await payAPI.requestBudget(token, ask)
      setNotice('Solicitud enviada. Te avisamos cuando la aprueben.')
      setAsk({ ...ask, amount: '', description: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos enviar la solicitud.')
    } finally { setWorking('') }
  }

  const approve = async (e) => {
    e.preventDefault()
    setWorking('approve'); setError(''); setNotice('')
    try {
      const { data: res } = await payAPI.approveRequest(token, approving.id, {
        key: approveForm.key,
        ...(approveForm.amount ? { amount: approveForm.amount } : {}),
      })
      setNotice(`Aprobada: ${money(res.request.approvedAmount)} enviados a ${res.request.budget?.name}.`)
      setApproving(null)
      setApproveForm({ key: '', amount: '' })
      await load()
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos aprobar la solicitud.')
    } finally { setWorking('') }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-gray-400"></div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <p className="text-gray-600 text-sm">{error || 'No pudimos cargar esta página.'}</p>
      </div>
    )
  }

  const card = 'bg-white rounded-2xl border border-gray-200 p-5'
  const input = 'w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400'
  const primary = 'px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-50'

  return (
    <div className={embedded ? 'bg-transparent' : 'min-h-screen bg-gray-50 py-8 px-4'}>
      <div className="max-w-xl mx-auto space-y-4">
        {/* Who this belongs to */}
        <div className="flex items-center gap-3">
          {data.brand?.companyLogo && (
            <img src={data.brand.companyLogo} alt="" className="w-10 h-10 rounded-lg object-contain bg-white" />
          )}
          <div>
            <p className="text-sm text-gray-500">{data.brand?.companyName || ''}</p>
            <p className="font-semibold text-gray-900">{data.account.name}</p>
          </div>
        </div>

        {error && <div className="px-4 py-3 rounded-lg bg-red-50 text-red-700 text-sm">{error}</div>}
        {notice && <div className="px-4 py-3 rounded-lg bg-green-50 text-green-700 text-sm">{notice}</div>}

        {/* Balance, and what is owed */}
        <div className={card}>
          <p className="text-xs uppercase text-gray-500">{data.account.creditsLabel}</p>
          <p className={`text-3xl font-bold ${data.balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
            {data.balance < 0 ? '-' : ''}{money(data.balance)}
          </p>

          {data.outstanding > 0 ? (
            <div className="mt-4">
              <p className="text-sm text-gray-700">
                Tienes <span className="font-semibold">{money(data.outstanding)}</span> pendientes de pago.
              </p>
              <button onClick={payOwed} disabled={!data.canPay || working === 'pay'} className={`${primary} mt-3`}>
                {working === 'pay' ? 'Abriendo el pago…' : `Pagar ${money(data.outstanding)}`}
              </button>
              {!data.canPay && (
                <p className="text-xs text-gray-500 mt-2">Tu proveedor gestiona los pagos de esta cuenta. Contáctalo para ponerte al día.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500 mt-2">No tienes saldo pendiente de pago.</p>
          )}
        </div>

        {/* Loading credit by choice */}
        {data.canTopUp && (
          <form onSubmit={topUp} className={card}>
            <p className="font-medium text-gray-900 mb-1">Cargar saldo</p>
            <p className="text-xs text-gray-500 mb-3">Añade saldo a tu cuenta cuando quieras, sin esperar a que se acabe.</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number" step="0.01" min={data.min} max={data.max}
                  value={topUpAmount}
                  onChange={(e) => setTopUpAmount(e.target.value)}
                  placeholder="100.00"
                  className={`${input} pl-7`}
                />
              </div>
              <button type="submit" disabled={!topUpAmount || working === 'topup'} className={primary}>
                {working === 'topup' ? 'Abriendo…' : 'Cargar'}
              </button>
            </div>
          </form>
        )}

        {/* The budgets carved out of the balance */}
        {data.budgetsEnabled && (
          <div className={card}>
            <p className="font-medium text-gray-900 mb-3">Presupuestos</p>
            {data.budgets.length === 0 ? (
              <p className="text-sm text-gray-500">Todavía no hay presupuestos.</p>
            ) : (
              <div className="space-y-2">
                {data.budgets.map((b) => (
                  <div key={b.slug} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
                    <span className="text-sm text-gray-900">{b.name}</span>
                    <span className="text-sm font-semibold text-gray-900">{money(b.balance)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Asking for money for a budget */}
        {data.budgetsEnabled && data.budgets.length > 0 && (
          <form onSubmit={askForBudget} className={card}>
            <p className="font-medium text-gray-900 mb-1">Pedir recarga de un presupuesto</p>
            <p className="text-xs text-gray-500 mb-3">
              El dinero sale del saldo de la cuenta cuando alguien aprueba la solicitud.
            </p>
            <div className="space-y-2">
              <select value={ask.slug} onChange={(e) => setAsk({ ...ask, slug: e.target.value })} className={input}>
                {data.budgets.map((b) => <option key={b.slug} value={b.slug}>{b.name}</option>)}
              </select>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                <input
                  type="number" step="0.01" min="0.01"
                  value={ask.amount}
                  onChange={(e) => setAsk({ ...ask, amount: e.target.value })}
                  placeholder="500.00"
                  className={`${input} pl-7`}
                />
              </div>
              <input
                value={ask.description}
                onChange={(e) => setAsk({ ...ask, description: e.target.value })}
                maxLength={300}
                placeholder="Para qué es (opcional)"
                className={input}
              />
              <button type="submit" disabled={!ask.amount || !ask.slug || working === 'ask'} className={primary}>
                {working === 'ask' ? 'Enviando…' : 'Pedir'}
              </button>
            </div>
          </form>
        )}

        {/* What has been asked for, and how each request ended */}
        {data.budgetsEnabled && data.requests.length > 0 && (
          <div className={card}>
            <p className="font-medium text-gray-900 mb-3">Solicitudes</p>
            <div className="space-y-2">
              {data.requests.map((r) => (
                <div key={r.id} className="px-3 py-2 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900">
                        {money(r.amount)} · {r.budget?.name}
                        {r.approvedAmount !== null && r.approvedAmount !== r.amount && (
                          <span className="text-gray-500"> (aprobado {money(r.approvedAmount)})</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {when(r.createdAt)}{r.description ? ` · ${r.description}` : ''}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${STATUS[r.status].className}`}>
                      {STATUS[r.status].label}
                    </span>
                  </div>

                  {r.status === 'pending' && data.canApprove && (
                    approving?.id === r.id ? (
                      <form onSubmit={approve} className="mt-3 space-y-2">
                        <input
                          type="password"
                          value={approveForm.key}
                          onChange={(e) => setApproveForm({ ...approveForm, key: e.target.value })}
                          placeholder="Clave de aprobación"
                          autoComplete="off"
                          className={input}
                        />
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                          <input
                            type="number" step="0.01" min="0.01" max={r.amount}
                            value={approveForm.amount}
                            onChange={(e) => setApproveForm({ ...approveForm, amount: e.target.value })}
                            placeholder={`${r.amount} (puedes enviar menos)`}
                            className={`${input} pl-7`}
                          />
                        </div>
                        <div className="flex gap-2">
                          <button type="submit" disabled={!approveForm.key || working === 'approve'} className={primary}>
                            {working === 'approve' ? 'Aprobando…' : 'Aprobar'}
                          </button>
                          <button
                            type="button"
                            onClick={() => { setApproving(null); setApproveForm({ key: '', amount: '' }) }}
                            className="px-4 py-2 text-sm rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setApproving(r)}
                        className="mt-2 text-xs text-gray-700 underline hover:text-gray-900"
                      >
                        Aprobar con clave
                      </button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-gray-400 text-center">
          Pagos procesados de forma segura. No guardamos los datos de tu tarjeta.
        </p>
      </div>
    </div>
  )
}
