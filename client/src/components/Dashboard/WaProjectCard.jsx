import { useNavigate } from 'react-router-dom'

const STATUS_COLORS = {
  activo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pausado: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  en_riesgo: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

const PRIORITY_DOTS = {
  alta: 'bg-red-500',
  media: 'bg-yellow-500',
  baja: 'bg-green-500'
}

function timeAgo(date) {
  if (!date) return ''
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export default function WaProjectCard({ project }) {
  const navigate = useNavigate()

  const alertCount = project._count?.alerts ?? project.alertasCount ?? 0

  return (
    <button
      onClick={() => navigate(`/dashboard/wa-projects/${project.id}`)}
      className="w-full text-left bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-4 hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 transition-all"
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{project.colorEmoji || '📁'}</span>
          <h3 className="font-semibold text-gray-900 dark:text-white truncate">{project.nombre}</h3>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`w-2 h-2 rounded-full ${PRIORITY_DOTS[project.prioridad] || PRIORITY_DOTS.media}`} />
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[project.estado] || STATUS_COLORS.activo}`}>
            {project.estado}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 mb-3 text-sm text-gray-500 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {project.totalMensajes}
        </span>
        {alertCount > 0 && (
          <span className="flex items-center gap-1 text-red-500">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            {alertCount}
          </span>
        )}
      </div>

      {/* Last message preview */}
      {project.ultimoMensaje && (
        <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
          {project.ultimoMensaje}
        </p>
      )}

      {/* Footer */}
      <div className="text-xs text-gray-400 dark:text-gray-500">
        {timeAgo(project.ultimaActividad)}
      </div>
    </button>
  )
}
