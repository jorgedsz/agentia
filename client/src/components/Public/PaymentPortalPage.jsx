import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { payAPI } from '../../services/api'

// Public, per-client payment page. Opened directly from a link or embedded in
// someone else's site with ?embed=1 (which drops the outer padding so the iframe
// hugs the card). No login: the token in the URL identifies the account.
export default function PaymentPortalPage() {
  const { token } = useParams()
  const [searchParams] = useSearchParams()
  const embedded = searchParams.get('embed') === '1'

  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [amount, setAmount] = useState('')
  const [working, setWorking] = useState('')

  const load = async () => {
    try {
      const { data } = await payAPI.getBilling(token)
      setData(data)
      if (data.outstanding > 0) setAmount(String(data.outstanding))
    } catch (err) {
      setError(err.response?.status === 404
        ? 'Este enlace de pago no existe o fue reemplazado.'
        : 'No pudimos cargar tu información de pago.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [token])

  // The tab title and icon default to the platform's own brand (index.html).
  // A client paying their provider must only ever see that provider's brand.
  useEffect(() => {
    if (!data) return
    const name = data.brand?.companyName
    document.title = name ? `Pagar · ${name}` : 'Pagar'
    let icon = document.querySelector("link[rel~='icon']")
    if (!icon) {
      icon = document.createElement('link')
      icon.rel = 'icon'
      document.head.appendChild(icon)
    }
    if (data.brand?.companyLogo) icon.href = data.brand.companyLogo
    else icon.removeAttribute('href')
  }, [data])

  // From an embed the checkout opens in another tab; when the client comes back
  // to this one, refresh so the balance they see reflects what they just paid.
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [token])

  // Coming back from the payment provider. Stripe returns the session id, which
  // the server verifies with Stripe and credits on the spot — the balance never
  // depends on the webhook alone. Whop has no session to verify, so it just waits.
  useEffect(() => {
    if (searchParams.get('pago') === 'ok') {
      const sessionId = searchParams.get('session_id')
      setNotice('Confirmando tu pago…')
      const confirmation = sessionId
        ? payAPI.confirm(token, sessionId).then(({ data }) => data.paid
            ? '¡Pago recibido! Tu saldo ya está actualizado.'
            : 'Tu pago está en proceso. El saldo se actualizará en unos minutos.')
        : new Promise((resolve) => setTimeout(() => resolve('¡Pago recibido! Tu saldo se actualiza en unos segundos.'), 2500))
      confirmation
        .catch(() => 'Recibimos tu pago. El saldo puede tardar unos minutos en reflejarse.')
        .then((message) => { setNotice(message); load() })
    }
    if (searchParams.get('tarjeta') === 'ok') setNotice('Tarjeta guardada correctamente.')
  }, [searchParams])

  // Stripe and Whop refuse to run inside an iframe, so from an embed the
  // checkout has to open in a new tab; on the standalone page we just navigate.
  const goTo = (url) => {
    if (window.top !== window.self) window.open(url, '_blank', 'noopener')
    else window.location.href = url
  }

  const pay = async () => {
    const num = parseFloat(amount)
    if (!Number.isFinite(num) || num < (data?.min || 0.5)) {
      setError(`Ingresa un monto de al menos $${data?.min ?? 0.5}.`)
      return
    }
    setWorking('pay'); setError('')
    try {
      const { data: res } = await payAPI.checkout(token, num)
      goTo(res.checkoutUrl || res.purchaseUrl)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos iniciar el pago.')
    } finally {
      setWorking('')
    }
  }

  const saveCard = async () => {
    setWorking('card'); setError('')
    try {
      const { data: res } = await payAPI.saveCard(token)
      goTo(res.checkoutUrl || res.purchaseUrl)
    } catch (err) {
      setError(err.response?.data?.error || 'No pudimos abrir el guardado de tarjeta.')
    } finally {
      setWorking('')
    }
  }

  if (loading) {
    return (
      <div className="min-h-[300px] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="min-h-[300px] flex items-center justify-center p-6">
        <p className="text-gray-600 dark:text-gray-300 text-center">{error || 'Enlace no disponible.'}</p>
      </div>
    )
  }

  const owes = data.outstanding > 0

  return (
    <div className={embedded ? 'bg-transparent' : 'min-h-screen bg-gray-50 dark:bg-dark-bg py-10 px-4'}>
      <div className="max-w-lg mx-auto bg-white dark:bg-dark-card rounded-2xl border border-gray-200 dark:border-dark-border p-6">
        {/* Provider branding, so the client recognizes who is charging them */}
        <div className="flex items-center gap-3 mb-6">
          {data.brand?.companyLogo && (
            <img src={data.brand.companyLogo} alt="" className="h-9 w-auto" />
          )}
          <div>
            <p className="font-semibold text-gray-900 dark:text-white leading-tight">
              {data.brand?.companyName || 'Pagar cuenta'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{data.account.name}</p>
          </div>
        </div>

        {/* What they owe */}
        <div className={`rounded-xl p-5 mb-5 ${owes ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
            {owes ? 'Saldo pendiente' : 'Saldo a favor'}
          </p>
          <p className={`text-3xl font-bold ${owes ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'}`}>
            ${owes ? data.outstanding.toFixed(2) : Math.abs(data.balance).toFixed(2)}
          </p>
          {!owes && (
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">No tienes nada pendiente. Puedes abonar saldo por adelantado.</p>
          )}
        </div>

        {notice && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-sm">
            {notice}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 text-sm">
            {error}
          </div>
        )}

        {data.canPay ? (
          <>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Monto a pagar</label>
            <div className="flex gap-2 mb-3">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  min={data.min}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full pl-7 pr-4 py-3 bg-white dark:bg-dark-hover border border-gray-200 dark:border-dark-border rounded-lg text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <button
                onClick={pay}
                disabled={working === 'pay'}
                className="px-6 py-3 bg-primary-600 text-white font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50"
              >
                {working === 'pay' ? 'Abriendo…' : 'Pagar'}
              </button>
            </div>

            <button
              onClick={saveCard}
              disabled={working === 'card'}
              className="w-full px-4 py-2.5 text-sm border border-gray-300 dark:border-dark-border rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-dark-hover disabled:opacity-50"
            >
              {working === 'card'
                ? 'Abriendo…'
                : data.hasCard ? 'Cambiar la tarjeta guardada' : 'Guardar una tarjeta para futuros pagos'}
            </button>
            {data.hasCard && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">Ya tienes una tarjeta guardada.</p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Tu proveedor gestiona el saldo de esta cuenta. Contáctalo para ponerte al día.
          </p>
        )}

        {/* What the balance came from */}
        <div className="mt-6 pt-5 border-t border-gray-200 dark:border-dark-border">
          <p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-3">
            Tu consumo de los últimos {data.usage.days} días
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Llamadas</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.usage.calls.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {data.usage.calls.minutes} min · ${data.usage.calls.cost.toFixed(2)}
              </p>
            </div>
            <div className="rounded-lg bg-gray-50 dark:bg-dark-hover p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Mensajes</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">{data.usage.messages.count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">${data.usage.messages.cost.toFixed(2)}</p>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-5 text-center">
          El pago se procesa de forma segura. Nunca guardamos los datos de tu tarjeta.
        </p>
      </div>
    </div>
  )
}
