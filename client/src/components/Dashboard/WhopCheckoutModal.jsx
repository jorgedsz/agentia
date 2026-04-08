import { WhopCheckoutEmbed } from '@whop/checkout/react'
import { useLanguage } from '../../context/LanguageContext'

export default function WhopCheckoutModal({ planId, onComplete, onClose }) {
  const { t } = useLanguage()

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-lg max-h-[90vh] overflow-auto">
        <div className="p-4 border-b border-gray-200 dark:border-dark-border flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('payments.completePayment') || 'Complete Payment'}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="p-4">
          <WhopCheckoutEmbed
            planId={planId}
            onComplete={({ receiptId }) => onComplete(receiptId)}
            onStateChange={(state) => {
              if (state === 'disabled') {
                // Plan not available or error
                console.warn('Whop checkout disabled')
              }
            }}
            theme="system"
            skipRedirect
          />
        </div>
      </div>
    </div>
  )
}
