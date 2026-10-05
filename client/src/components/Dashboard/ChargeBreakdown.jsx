import { useEffect, useRef, useState } from 'react'

// What a charge will really cost, shown before anyone pays it.
//
// A reseller partner that collects a tax charges it ON TOP of the amount the
// client asked for: $100 of balance is a $127 card charge at 27%. This block is
// how the client learns that before pressing the button.
//
// THE FEATURE SHIPS DARK. Every account not under a tax-collecting partner gets
// `taxAmount: 0` from the quote endpoints, and this component then renders
// NOTHING AT ALL — no block, no empty rows, no placeholder. An untaxed
// account's screens must look exactly as they did before this existed, so the
// `taxAmount > 0` guard below is the whole contract: do not soften it into
// "render the subtotal anyway", and do not give the component a loading
// skeleton that shows up where no tax is collected.

const money = (n) => `$${(Number(n) || 0).toFixed(2)}`

// 27 prints as "27", 16.5 as "16.5" — never "27.00%", which reads like money.
const rateOf = (n) => String(Number(n) || 0)

export default function ChargeBreakdown({ quote, loading }) {
  // No quote yet, a quote that failed, or an account with no tax: nothing.
  // `loading` only dims a breakdown that is already on screen while the next
  // one is in flight — it never makes one appear.
  if (!quote || !(quote.taxAmount > 0)) return null

  return (
    <div
      className={`rounded-lg border border-gray-200 dark:border-dark-border bg-gray-50 dark:bg-dark-bg px-3 py-2.5 text-sm transition-opacity ${loading ? 'opacity-50' : ''}`}
    >
      <div className="flex items-center justify-between gap-4 text-gray-600 dark:text-gray-400">
        <span>Subtotal</span>
        <span className="tabular-nums">{money(quote.subtotal)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 mt-1 text-gray-600 dark:text-gray-400">
        <span>{quote.taxLabel || 'ITBIS'} ({rateOf(quote.taxRate)}%)</span>
        <span className="tabular-nums">{money(quote.taxAmount)}</span>
      </div>
      <div className="flex items-center justify-between gap-4 mt-2 pt-2 border-t border-gray-200 dark:border-dark-border font-semibold text-gray-900 dark:text-white">
        <span>Total a pagar</span>
        <span className="tabular-nums">{money(quote.total)}</span>
      </div>
    </div>
  )
}

/**
 * Quote `amount` through `fetcher`, debounced, for a <ChargeBreakdown>.
 *
 * Lives here rather than in each of the four screens that take money so the
 * debounce, the cancellation and — most importantly — the failure behaviour are
 * written once: A QUOTE THAT FAILS MUST NEVER BLOCK A PAYMENT. The catch below
 * clears the quote, which renders nothing at all, and the pay button stays
 * exactly as enabled as it was. It never raises, never sets an error banner and
 * never disables anything.
 *
 * `fetcher` is read through a ref, so callers can pass an inline arrow without
 * restarting the debounce on every render; only the amount and `enabled` do
 * that. Returns `{ quote, loading }`, which are this file's component's props.
 */
export function useChargeQuote(amount, fetcher, { enabled = true, delay = 350 } = {}) {
  const [quote, setQuote] = useState(null)
  const [loading, setLoading] = useState(false)
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const num = Number(amount)
  // An empty field, a half-typed "1." or a zero is not something to quote.
  const askable = enabled && Number.isFinite(num) && num > 0

  useEffect(() => {
    if (!askable) {
      setQuote(null)
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    const timer = setTimeout(() => {
      Promise.resolve()
        .then(() => fetcherRef.current(num))
        .then((data) => { if (alive) setQuote(data || null) })
        .catch(() => { if (alive) setQuote(null) })
        .then(() => { if (alive) setLoading(false) })
    }, delay)
    return () => { alive = false; clearTimeout(timer) }
  }, [num, askable, delay])

  return { quote, loading }
}
