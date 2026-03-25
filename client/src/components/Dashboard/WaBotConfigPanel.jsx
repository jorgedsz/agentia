import { useState, useEffect } from 'react'
import { waBotConfigAPI } from '../../services/api'

export default function WaBotConfigPanel() {
  const [config, setConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [blockInput, setBlockInput] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const { data } = await waBotConfigAPI.get()
      setConfig(data.config)
    } catch (err) {
      console.error('Failed to load bot config:', err)
    } finally {
      setLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setSuccess('')
    try {
      const { data } = await waBotConfigAPI.update({
        teamKeywords: config.teamKeywords,
        blockedGroups: config.blockedGroups,
        enabled: config.enabled
      })
      setConfig(data.config)
      setSuccess('Saved!')
      setTimeout(() => setSuccess(''), 2000)
    } catch (err) {
      console.error('Failed to save config:', err)
    } finally {
      setSaving(false)
    }
  }

  const addTag = (field, input, setInput) => {
    const val = input.trim()
    if (!val || config[field].includes(val)) return
    setConfig({ ...config, [field]: [...config[field], val] })
    setInput('')
  }

  const removeTag = (field, idx) => {
    setConfig({ ...config, [field]: config[field].filter((_, i) => i !== idx) })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    )
  }

  if (!config) return null

  return (
    <div className="space-y-6">
      {/* Enable/Disable */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Bot Enabled</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400">Process incoming WhatsApp messages</p>
        </div>
        <button
          onClick={() => setConfig({ ...config, enabled: !config.enabled })}
          className={`w-11 h-6 rounded-full p-0.5 transition-colors ${config.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'}`}
        >
          <div className={`w-5 h-5 rounded-full bg-white transition-transform ${config.enabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>

      {/* Team Keywords */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Team Keywords</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Messages from senders matching these keywords won't trigger alerts</p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag('teamKeywords', tagInput, setTagInput) } }}
            placeholder="Add keyword..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={() => addTag('teamKeywords', tagInput, setTagInput)}
            className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.teamKeywords.map((kw, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 rounded-full text-xs">
              {kw}
              <button onClick={() => removeTag('teamKeywords', i)} className="hover:text-red-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Blocked Groups */}
      <div>
        <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-1">Blocked Groups</label>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Group chat IDs to ignore (e.g. 123456789@g.us)</p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={blockInput}
            onChange={(e) => setBlockInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag('blockedGroups', blockInput, setBlockInput) } }}
            placeholder="Add group ID..."
            className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
          <button
            onClick={() => addTag('blockedGroups', blockInput, setBlockInput)}
            className="px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
          >
            Add
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          {config.blockedGroups.map((gid, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 rounded-full text-xs font-mono">
              {gid.length > 24 ? gid.slice(0, 12) + '...' + gid.slice(-12) : gid}
              <button onClick={() => removeTag('blockedGroups', i)} className="hover:text-red-500">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </span>
          ))}
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        {success && <span className="text-sm text-green-600 dark:text-green-400">{success}</span>}
      </div>
    </div>
  )
}
