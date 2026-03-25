import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { waAlertsAPI } from '../../services/api'

const TIPO_ICONS = {
  cancelacion: { icon: '🚪', label: 'Cancellation' },
  reembolso: { icon: '🔸', label: 'Refund' },
  enojo: { icon: '😡', label: 'Anger' },
  urgente: { icon: '⚡', label: 'Urgent' },
  entrega: { icon: '📦', label: 'Delivery' },
  pago: { icon: '💳', label: 'Payment' }
}

const NIVEL_COLORS = {
  critico: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  alto: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medio: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  bajo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
}

export default function WaAlertsDashboard() {
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchAlerts = async () => {
    try {
      const { data } = await waAlertsAPI.list()
      setAlerts(data.alerts)
    } catch (err) {
      console.error('Failed to load alerts:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAlerts()
  }, [])

  const resolveAlert = async (id) => {
    try {
      await waAlertsAPI.resolve(id)
      setAlerts(prev => prev.filter(a => a.id !== id))
    } catch (err) {
      console.error('Failed to resolve alert:', err)
    }
  }

  // Count by nivel
  const counts = alerts.reduce((acc, a) => {
    acc[a.nivel] = (acc[a.nivel] || 0) + 1
    return acc
  }, {})

  // Group by tipo
  const grouped = alerts.reduce((acc, a) => {
    if (!acc[a.tipo]) acc[a.tipo] = []
    acc[a.tipo].push(a)
    return acc
  }, {})

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Unresolved alerts across all projects</p>
      </div>

      {/* Summary Pills */}
      <div className="flex flex-wrap gap-3 mb-6">
        {['critico', 'alto', 'medio', 'bajo'].map(nivel => (
          counts[nivel] ? (
            <span key={nivel} className={`px-3 py-1.5 rounded-full text-sm font-medium ${NIVEL_COLORS[nivel]}`}>
              {nivel.charAt(0).toUpperCase() + nivel.slice(1)}: {counts[nivel]}
            </span>
          ) : null
        ))}
        {alerts.length === 0 && !loading && (
          <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
            All clear!
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : alerts.length === 0 ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <div className="text-gray-400 text-5xl mb-4">✅</div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">No active alerts</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm">All alerts have been resolved. Great job!</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([tipo, tipoAlerts]) => {
            const info = TIPO_ICONS[tipo] || { icon: '🔔', label: tipo }
            return (
              <div key={tipo}>
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <span className="text-lg">{info.icon}</span>
                  {info.label} ({tipoAlerts.length})
                </h2>
                <div className="space-y-2">
                  {tipoAlerts.map(alert => (
                    <div
                      key={alert.id}
                      className="bg-white dark:bg-dark-card rounded-lg border border-gray-200 dark:border-dark-border p-4 flex items-start gap-4"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${NIVEL_COLORS[alert.nivel]}`}>
                            {alert.nivel}
                          </span>
                          <button
                            onClick={() => navigate(`/dashboard/wa-projects/${alert.project?.id}`)}
                            className="text-sm font-medium text-primary-600 dark:text-primary-400 hover:underline truncate"
                          >
                            {alert.project?.colorEmoji} {alert.project?.nombre}
                          </button>
                        </div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">{alert.descripcion}</p>
                        {alert.message && (
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 truncate">
                            {alert.message.sender}: "{alert.message.contenido}"
                          </p>
                        )}
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {new Date(alert.createdAt).toLocaleString()}
                        </p>
                      </div>
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex-shrink-0"
                      >
                        Resolve
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
