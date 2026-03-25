import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { waProjectsAPI, waAlertsAPI } from '../../services/api'
import WaProjectChat from './WaProjectChat'

const STATUS_OPTIONS = ['activo', 'pausado', 'completado', 'en_riesgo']
const PRIORITY_OPTIONS = ['alta', 'media', 'baja']

const STATUS_COLORS = {
  activo: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  pausado: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  completado: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  en_riesgo: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
}

const NIVEL_COLORS = {
  critico: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  alto: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medio: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  bajo: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
}

export default function WaProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [messages, setMessages] = useState([])
  const [alerts, setAlerts] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('activity')
  const [editFields, setEditFields] = useState({})
  const [saving, setSaving] = useState(false)

  const fetchProject = useCallback(async () => {
    try {
      const { data } = await waProjectsAPI.get(id)
      setProject(data.project)
      setEditFields({
        estado: data.project.estado,
        prioridad: data.project.prioridad,
        responsable: data.project.responsable || '',
        cliente: data.project.cliente || '',
        descripcionEmpresa: data.project.descripcionEmpresa || '',
        objetivoProyecto: data.project.objetivoProyecto || ''
      })
    } catch (err) {
      console.error('Failed to load project:', err)
    }
  }, [id])

  const fetchMessages = useCallback(async () => {
    try {
      const { data } = await waProjectsAPI.getMessages(id, { limit: 100 })
      setMessages(data.messages)
    } catch (err) {
      console.error('Failed to load messages:', err)
    }
  }, [id])

  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await waProjectsAPI.getAlerts(id)
      setAlerts(data.alerts)
    } catch (err) {
      console.error('Failed to load alerts:', err)
    }
  }, [id])

  useEffect(() => {
    Promise.all([fetchProject(), fetchMessages(), fetchAlerts()])
      .finally(() => setLoading(false))
  }, [fetchProject, fetchMessages, fetchAlerts])

  const saveProject = async () => {
    setSaving(true)
    try {
      const { data } = await waProjectsAPI.update(id, editFields)
      setProject(data.project)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }

  const resolveAlert = async (alertId) => {
    try {
      await waAlertsAPI.resolve(alertId)
      setAlerts(prev => prev.map(a => a.id === alertId ? { ...a, resuelta: true } : a))
    } catch (err) {
      console.error('Failed to resolve alert:', err)
    }
  }

  const resolveAll = async () => {
    try {
      await waAlertsAPI.resolveAllForProject(id)
      setAlerts(prev => prev.map(a => ({ ...a, resuelta: true })))
    } catch (err) {
      console.error('Failed to resolve all:', err)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500 dark:text-gray-400">Project not found</p>
        <button onClick={() => navigate('/dashboard/wa-projects')} className="mt-4 text-primary-600 hover:underline text-sm">Back to projects</button>
      </div>
    )
  }

  const unresolvedAlerts = alerts.filter(a => !a.resuelta)

  return (
    <div className="p-6">
      {/* Back */}
      <button
        onClick={() => navigate('/dashboard/wa-projects')}
        className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 mb-4 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to projects
      </button>

      {/* Header */}
      <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{project.colorEmoji || '📁'}</span>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">{project.nombre}</h1>
              <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 dark:text-gray-400">
                {project.cliente && <span>Client: {project.cliente}</span>}
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[project.estado]}`}>
                  {project.estado}
                </span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <p className="text-lg font-bold text-gray-900 dark:text-white">{project.totalMensajes}</p>
              <p className="text-xs">Messages</p>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-red-600 dark:text-red-400">{unresolvedAlerts.length}</p>
              <p className="text-xs">Alerts</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-dark-hover rounded-lg p-1">
        {[
          { id: 'activity', label: 'Activity' },
          { id: 'alerts', label: `Alerts (${unresolvedAlerts.length})` },
          { id: 'info', label: 'Info' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'activity' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Message Feed</h2>
          </div>
          <div className="p-4 space-y-3 max-h-[600px] overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No messages yet</p>
            ) : (
              messages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.esDelCliente ? 'justify-start' : 'justify-end'}`}
                >
                  <div className={`max-w-[75%] px-3 py-2 rounded-xl text-sm ${
                    msg.esDelCliente
                      ? 'bg-gray-100 dark:bg-dark-hover text-gray-900 dark:text-gray-100'
                      : 'bg-primary-600 text-white'
                  }`}>
                    <p className="text-xs font-medium opacity-70 mb-1">{msg.sender}</p>
                    <p className="whitespace-pre-wrap">{msg.contenido}</p>
                    <p className="text-[10px] opacity-50 mt-1 text-right">
                      {new Date(msg.timestamp).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'alerts' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border">
          <div className="p-4 border-b border-gray-200 dark:border-dark-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Project Alerts</h2>
            {unresolvedAlerts.length > 0 && (
              <button
                onClick={resolveAll}
                className="text-xs px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
              >
                Resolve All
              </button>
            )}
          </div>
          <div className="p-4 space-y-3">
            {alerts.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-8">No alerts</p>
            ) : (
              alerts.map(alert => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-lg border ${
                    alert.resuelta
                      ? 'border-gray-200 dark:border-dark-border opacity-50'
                      : 'border-gray-200 dark:border-dark-border'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${NIVEL_COLORS[alert.nivel]}`}>
                          {alert.nivel}
                        </span>
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{alert.tipo}</span>
                        {alert.resuelta && (
                          <span className="text-xs text-green-600 dark:text-green-400">Resolved</span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{alert.descripcion}</p>
                      {alert.message && (
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          {alert.message.sender}: "{alert.message.contenido?.substring(0, 100)}"
                        </p>
                      )}
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                        {new Date(alert.createdAt).toLocaleString()}
                      </p>
                    </div>
                    {!alert.resuelta && (
                      <button
                        onClick={() => resolveAlert(alert.id)}
                        className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-lg text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors flex-shrink-0"
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'info' && (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-6">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">Project Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Status</label>
              <select
                value={editFields.estado}
                onChange={(e) => setEditFields({ ...editFields, estado: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
              >
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Priority</label>
              <select
                value={editFields.prioridad}
                onChange={(e) => setEditFields({ ...editFields, prioridad: e.target.value })}
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white focus:ring-2 focus:ring-primary-500"
              >
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Responsible</label>
              <input
                type="text"
                value={editFields.responsable}
                onChange={(e) => setEditFields({ ...editFields, responsable: e.target.value })}
                placeholder="Person in charge..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Client</label>
              <input
                type="text"
                value={editFields.cliente}
                onChange={(e) => setEditFields({ ...editFields, cliente: e.target.value })}
                placeholder="Client name..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Company Description</label>
              <textarea
                value={editFields.descripcionEmpresa}
                onChange={(e) => setEditFields({ ...editFields, descripcionEmpresa: e.target.value })}
                rows={2}
                placeholder="Brief company description..."
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Project Objective</label>
              <textarea
                value={editFields.objetivoProyecto}
                onChange={(e) => setEditFields({ ...editFields, objetivoProyecto: e.target.value })}
                rows={2}
                placeholder="What is the goal of this project?"
                className="w-full text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500"
              />
            </div>
          </div>
          <div className="mt-4">
            <button
              onClick={saveProject}
              disabled={saving}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}

      {/* Floating PM Agent Chat */}
      <WaProjectChat projectId={parseInt(id)} />
    </div>
  )
}
