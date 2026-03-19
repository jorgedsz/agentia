import { useState } from 'react'
import { PayPalButtons, usePayPalScriptReducer } from '@paypal/react-paypal-js'
import { paymentsAPI } from '../../services/api'

export default function PayPalCheckoutButton({ product, billingCycle, onSuccess, onError, onCancel }) {
  const [{ isPending }] = usePayPalScriptReducer()
  const [processing, setProcessing] = useState(false)

  const isLifetime = billingCycle === 'lifetime'

  if (isPending) {
    return (
      <div className="h-11 flex items-center justify-center">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  // Check if product has PayPal configured for this cycle
  const hasPlan = isLifetime
    ? product.lifetimePrice > 0
    : billingCycle === 'monthly' ? !!product.paypalMonthlyPlanId
    : billingCycle === 'quarterly' ? !!product.paypalQuarterlyPlanId
    : billingCycle === 'annual' ? !!product.paypalAnnualPlanId
    : false

  if (!hasPlan) {
    return (
      <div className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">
        PayPal not configured for this plan
      </div>
    )
  }

  if (isLifetime) {
    // One-time payment via Orders API
    return (
      <PayPalButtons
        style={{ layout: 'horizontal', height: 40, tagline: false, label: 'pay' }}
        disabled={processing}
        createOrder={async () => {
          setProcessing(true)
          try {
            const { data } = await paymentsAPI.createPayPalOrder({ productId: product.id })
            return data.orderId
          } catch (err) {
            setProcessing(false)
            onError?.(err.response?.data?.error || 'Failed to create order')
            throw err
          }
        }}
        onApprove={async (data) => {
          try {
            const { data: result } = await paymentsAPI.capturePayPalOrder({ orderId: data.orderID })
            setProcessing(false)
            onSuccess?.(result)
          } catch (err) {
            setProcessing(false)
            onError?.(err.response?.data?.error || 'Failed to capture order')
          }
        }}
        onCancel={() => {
          setProcessing(false)
          onCancel?.()
        }}
        onError={(err) => {
          setProcessing(false)
          onError?.(err.message || 'PayPal error')
        }}
      />
    )
  }

  // Recurring subscription via Subscriptions API
  return (
    <PayPalButtons
      style={{ layout: 'horizontal', height: 40, tagline: false, label: 'subscribe' }}
      disabled={processing}
      createSubscription={async (data, actions) => {
        setProcessing(true)
        try {
          const { data: result } = await paymentsAPI.createPayPalSubscription({
            productId: product.id,
            billingCycle,
          })
          return result.subscriptionId
        } catch (err) {
          setProcessing(false)
          onError?.(err.response?.data?.error || 'Failed to create subscription')
          throw err
        }
      }}
      onApprove={async (data) => {
        setProcessing(false)
        // Subscription activation is confirmed via webhook (BILLING.SUBSCRIPTION.ACTIVATED)
        onSuccess?.({ subscriptionId: data.subscriptionID })
      }}
      onCancel={() => {
        setProcessing(false)
        onCancel?.()
      }}
      onError={(err) => {
        setProcessing(false)
        onError?.(err.message || 'PayPal error')
      }}
    />
  )
}
