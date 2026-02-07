import { useState, useEffect, useRef, useCallback } from 'react'
import { voicesAPI } from '../../services/api'
import { useAuth } from '../../context/AuthContext'

const PROVIDERS = [
  { value: 'all', label: 'All Providers' },
  { value: 'vapi', label: 'VAPI' },
  { value: '11labs', label: 'ElevenLabs' },
]

const GENDERS = [
  { value: 'all', label: 'All Genders' },
  { value: 'male', label: 'Male' },
  { value: 'female', label: 'Female' },
]

const ACCENTS = [
  { value: 'all', label: 'All Accents' },
  { value: 'american', label: 'American' },
  { value: 'british', label: 'British' },
  { value: 'australian', label: 'Australian' },
  { value: 'swedish', label: 'Swedish' },
  { value: 'transatlantic', label: 'Transatlantic' },
]

const LANGUAGES = [
  { value: 'all', label: 'All Languages' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'it', label: 'Italian' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'pl', label: 'Polish' },
  { value: 'nl', label: 'Dutch' },
  { value: 'ru', label: 'Russian' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh', label: 'Chinese' },
  { value: 'ko', label: 'Korean' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
  { value: 'sv', label: 'Swedish' },
  { value: 'da', label: 'Danish' },
  { value: 'fi', label: 'Finnish' },
  { value: 'no', label: 'Norwegian' },
  { value: 'tr', label: 'Turkish' },
  { value: 'el', label: 'Greek' },
  { value: 'cs', label: 'Czech' },
  { value: 'ro', label: 'Romanian' },
  { value: 'hu', label: 'Hungarian' },
  { value: 'sk', label: 'Slovak' },
  { value: 'uk', label: 'Ukrainian' },
  { value: 'vi', label: 'Vietnamese' },
  { value: 'id', label: 'Indonesian' },
  { value: 'ms', label: 'Malay' },
  { value: 'he', label: 'Hebrew' },
]

const LANG_LABELS = {
  en: 'EN', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT',
  pl: 'PL', nl: 'NL', ru: 'RU', ja: 'JA', zh: 'ZH', ko: 'KO',
  hi: 'HI', ar: 'AR', sv: 'SV', da: 'DA', fi: 'FI', no: 'NO',
  tr: 'TR', el: 'EL', cs: 'CS', ro: 'RO', hu: 'HU', sk: 'SK',
  uk: 'UK', vi: 'VI', id: 'ID', ms: 'MS', he: 'HE',
}

const ACCENT_COLORS = {
  american: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  british: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  australian: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  swedish: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  transatlantic: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
}

function EqualizerIcon() {
  return (
    <div className="flex items-end gap-0.5 h-4">
      <span className="w-1 bg-primary-500 rounded-full animate-eq-1" style={{ height: '40%' }} />
      <span className="w-1 bg-primary-500 rounded-full animate-eq-2" style={{ height: '70%' }} />
      <span className="w-1 bg-primary-500 rounded-full animate-eq-3" style={{ height: '50%' }} />
      <span className="w-1 bg-primary-500 rounded-full animate-eq-4" style={{ height: '80%' }} />
    </div>
  )
}

export default function VoiceLibrary() {
  const { user } = useAuth()
  const isOwner = user?.role === 'OWNER'

  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [providerFilter, setProviderFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [accentFilter, setAccentFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

  // Custom voice management state (OWNER only)
  const [customVoiceId, setCustomVoiceId] = useState('')
  const [customVoiceName, setCustomVoiceName] = useState('')
  const [customPreviewUrl, setCustomPreviewUrl] = useState('')
  const [addingCustom, setAddingCustom] = useState(false)
  const [customError, setCustomError] = useState(null)
  const [customSuccess, setCustomSuccess] = useState(null)
  const [deletingId, setDeletingId] = useState(null)
  const [refreshingId, setRefreshingId] = useState(null)

  useEffect(() => {
    fetchVoices()
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  const fetchVoices = async () => {
    try {
      setLoading(true)
      const res = await voicesAPI.list()
      setVoices(res.data)
    } catch (err) {
      setError('Failed to load voices')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // Extract voice ID from ElevenLabs URL or return as-is
  const parseVoiceInput = (input) => {
    const trimmed = input.trim()
    // Match ElevenLabs URLs like https://elevenlabs.io/community/voice/voice-name/voiceId123
    const communityMatch = trimmed.match(/elevenlabs\.io\/community\/voice\/[^/]+\/([a-zA-Z0-9]+)/)
    if (communityMatch) return communityMatch[1]
    // Match voice-lab or app URLs with voice ID in path
    const appMatch = trimmed.match(/elevenlabs\.io\/[^?]*[/=]([a-zA-Z0-9]{20,})/)
    if (appMatch) return appMatch[1]
    return trimmed
  }

  // Convert Google Drive share links to direct streamable URLs
  const convertDriveUrl = (url) => {
    // Match: https://drive.google.com/file/d/FILE_ID/view?...
    const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
    if (fileMatch) return `https://drive.usercontent.google.com/download?id=${fileMatch[1]}&export=download&confirm=t`
    // Match: https://drive.google.com/open?id=FILE_ID
    const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
    if (openMatch) return `https://drive.usercontent.google.com/download?id=${openMatch[1]}&export=download&confirm=t`
    // Match: https://drive.google.com/uc?...id=FILE_ID (old direct links)
    const ucMatch = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/)
    if (ucMatch) return `https://drive.usercontent.google.com/download?id=${ucMatch[1]}&export=download&confirm=t`
    // Already a direct link or other URL — return as-is
    return url
  }

  const handleAddCustomVoice = async () => {
    if (!customVoiceId.trim()) return
    setAddingCustom(true)
    setCustomError(null)
    setCustomSuccess(null)
    try {
      const voiceId = parseVoiceInput(customVoiceId)
      const payload = { voiceId }
      if (customVoiceName.trim()) payload.name = customVoiceName.trim()
      if (customPreviewUrl.trim()) payload.previewUrl = convertDriveUrl(customPreviewUrl.trim())
      const res = await voicesAPI.addCustom(payload)
      setCustomSuccess(`Added "${res.data.name}" successfully`)
      setCustomVoiceId('')
      setCustomVoiceName('')
      setCustomPreviewUrl('')
      // Refresh voice list
      const voicesRes = await voicesAPI.list()
      setVoices(voicesRes.data)
    } catch (err) {
      const serverMsg = err.response?.data?.error
      const status = err.response?.status
      console.error('Add custom voice error:', status, err.response?.data, err.message)
      setCustomError(serverMsg || (status ? `Error ${status}: Failed to add custom voice` : `Network error: ${err.message}`))
    } finally {
      setAddingCustom(false)
    }
  }

  const handleDeleteCustomVoice = async (customId) => {
    setDeletingId(customId)
    setCustomError(null)
    try {
      await voicesAPI.deleteCustom(customId)
      const voicesRes = await voicesAPI.list()
      setVoices(voicesRes.data)
    } catch (err) {
      setCustomError(err.response?.data?.error || 'Failed to delete custom voice')
    } finally {
      setDeletingId(null)
    }
  }

  const handleRefreshCustomVoice = async (customId) => {
    setRefreshingId(customId)
    setCustomError(null)
    try {
      await voicesAPI.refreshCustom(customId)
      const voicesRes = await voicesAPI.list()
      setVoices(voicesRes.data)
      setCustomSuccess('Voice metadata refreshed')
    } catch (err) {
      setCustomError(err.response?.data?.error || 'Failed to refresh voice metadata')
    } finally {
      setRefreshingId(null)
    }
  }

  const handlePlay = useCallback((voice) => {
    if (playingId === voice.voiceId) {
      // Stop current
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPlayingId(null)
      return
    }

    // Stop previous
    if (audioRef.current) {
      audioRef.current.pause()
    }

    if (!voice.previewUrl) {
      setPlayingId(null)
      return
    }

    const audio = new Audio(convertDriveUrl(voice.previewUrl))
    audioRef.current = audio
    setPlayingId(voice.voiceId)

    audio.play().catch(() => setPlayingId(null))
    audio.addEventListener('ended', () => {
      setPlayingId(null)
      audioRef.current = null
    })
    audio.addEventListener('error', () => {
      setPlayingId(null)
      audioRef.current = null
    })
  }, [playingId])

  const customVoices = voices.filter(v => v.isCustom)

  const filtered = voices.filter(v => {
    if (providerFilter !== 'all' && v.provider !== providerFilter) return false
    if (genderFilter !== 'all' && v.gender !== genderFilter) return false
    if (accentFilter !== 'all' && (v.accent || '').toLowerCase() !== accentFilter) return false
    if (languageFilter !== 'all' && !(v.languages || []).includes(languageFilter)) return false
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) &&
        !(v.accent || '').toLowerCase().includes(search.toLowerCase()) &&
        !(v.description || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
        </div>
      </div>
    )
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Voice Library</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Browse and preview voices for your agents</p>
      </div>

      {/* Custom Voice Management (OWNER only) */}
      {isOwner && (
        <div className="mb-6 bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Manage Custom Voices</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Paste a Voice ID or ElevenLabs URL. You can also paste the preview audio URL for playback.
          </p>

          {/* Add form */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <input
              type="text"
              value={customVoiceId}
              onChange={(e) => setCustomVoiceId(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !addingCustom && handleAddCustomVoice()}
              placeholder="Voice ID or ElevenLabs URL..."
              className="flex-1 min-w-[200px] max-w-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={addingCustom}
            />
            <input
              type="text"
              value={customVoiceName}
              onChange={(e) => setCustomVoiceName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !addingCustom && handleAddCustomVoice()}
              placeholder="Name (optional)"
              className="max-w-[160px] px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={addingCustom}
            />
            <input
              type="text"
              value={customPreviewUrl}
              onChange={(e) => setCustomPreviewUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !addingCustom && handleAddCustomVoice()}
              placeholder="Preview audio URL (optional)"
              className="flex-1 min-w-[200px] max-w-sm px-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-hover text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              disabled={addingCustom}
            />
            <button
              onClick={handleAddCustomVoice}
              disabled={addingCustom || !customVoiceId.trim()}
              className="px-4 py-2 rounded-lg bg-primary-600 text-white text-sm font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {addingCustom && (
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
              )}
              {addingCustom ? 'Adding...' : 'Add'}
            </button>
          </div>

          {/* Status messages */}
          {customError && (
            <div className="mb-3 p-2 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
              {customError}
            </div>
          )}
          {customSuccess && (
            <div className="mb-3 p-2 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg text-sm">
              {customSuccess}
            </div>
          )}

          {/* Existing custom voices list */}
          {customVoices.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wider">
                Custom Voices ({customVoices.length})
              </p>
              {customVoices.map((voice) => (
                <div
                  key={voice.customId}
                  className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-dark-hover border border-gray-100 dark:border-dark-border"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-white">{voice.name}</span>
                    <span className="ml-2 text-xs text-gray-400">{voice.voiceId}</span>
                    {voice.gender && (
                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400 capitalize">{voice.gender}</span>
                    )}
                  </div>
                  {voice.previewUrl ? (
                    <button
                      onClick={() => handlePlay(voice)}
                      className="p-1.5 rounded-lg text-gray-500 hover:text-primary-600 hover:bg-gray-100 dark:hover:bg-dark-border transition-colors"
                      title="Preview"
                    >
                      {playingId === voice.voiceId ? (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <rect x="6" y="4" width="4" height="16" rx="1" />
                          <rect x="14" y="4" width="4" height="16" rx="1" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400">No preview</span>
                  )}
                  <button
                    onClick={() => handleRefreshCustomVoice(voice.customId)}
                    disabled={refreshingId === voice.customId}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                    title="Refresh metadata from ElevenLabs"
                  >
                    {refreshingId === voice.customId ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h5M20 20v-5h-5M4 9a9 9 0 0115.36-5.36M20 15a9 9 0 01-15.36 5.36" />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteCustomVoice(voice.customId)}
                    disabled={deletingId === voice.customId}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    title="Delete"
                  >
                    {deletingId === voice.customId ? (
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-red-400 border-t-transparent" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    )}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            {PROVIDERS.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            {GENDERS.map(g => (
              <option key={g.value} value={g.value}>{g.label}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <select
            value={accentFilter}
            onChange={(e) => setAccentFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            {ACCENTS.map(a => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="relative">
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="pl-3 pr-8 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            {LANGUAGES.map(l => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
          <div className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search voices..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {filtered.length} voice{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Voice Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((voice) => {
          const isPlaying = playingId === voice.voiceId
          return (
            <div
              key={`${voice.provider}-${voice.voiceId}`}
              className={`relative bg-white dark:bg-dark-card rounded-xl border transition-all ${
                isPlaying
                  ? 'border-primary-500 ring-2 ring-primary-500/20'
                  : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <div className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{voice.name}</h3>
                    {voice.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{voice.description}</p>
                    )}
                  </div>
                  {isPlaying && <EqualizerIcon />}
                </div>

                <div className="flex items-center gap-1.5 mb-3 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    voice.provider === 'vapi'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    {voice.provider === 'vapi' ? 'VAPI' : 'ElevenLabs'}
                  </span>
                  {voice.isCustom && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      Custom
                    </span>
                  )}
                  {voice.gender && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      voice.gender === 'female'
                        ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                    }`}>
                      {voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)}
                    </span>
                  )}
                  {voice.accent && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      ACCENT_COLORS[voice.accent.toLowerCase()] || 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400'
                    }`}>
                      {voice.accent.charAt(0).toUpperCase() + voice.accent.slice(1)}
                    </span>
                  )}
                  {voice.age && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">
                      {voice.age}
                    </span>
                  )}
                </div>
                {/* Language count indicator for multilingual voices */}
                {(voice.languages || []).length > 3 && (
                  <div className="mb-3 text-xs text-gray-500 dark:text-gray-400">
                    Supports {voice.languages.length} languages
                  </div>
                )}
                {(voice.languages || []).length <= 3 && (voice.languages || []).length > 0 && (
                  <div className="flex items-center gap-1 mb-3 flex-wrap">
                    {voice.languages.map(lang => (
                      <span key={lang} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">
                        {LANG_LABELS[lang] || lang.toUpperCase()}
                      </span>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => handlePlay(voice)}
                  disabled={!voice.previewUrl}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isPlaying
                      ? 'bg-primary-600 text-white hover:bg-primary-700'
                      : voice.previewUrl
                        ? 'bg-gray-100 dark:bg-dark-hover text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-dark-border'
                        : 'bg-gray-50 dark:bg-dark-hover/50 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {isPlaying ? (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="4" width="4" height="16" rx="1" />
                        <rect x="14" y="4" width="4" height="16" rx="1" />
                      </svg>
                      Stop
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Preview
                    </>
                  )}
                </button>
              </div>
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && !loading && (
        <div className="text-center py-12">
          <p className="text-gray-500 dark:text-gray-400">No voices match your filters</p>
        </div>
      )}

      {/* CSS for equalizer animation */}
      <style>{`
        @keyframes eq1 { 0%, 100% { height: 40%; } 50% { height: 80%; } }
        @keyframes eq2 { 0%, 100% { height: 70%; } 50% { height: 30%; } }
        @keyframes eq3 { 0%, 100% { height: 50%; } 50% { height: 90%; } }
        @keyframes eq4 { 0%, 100% { height: 80%; } 50% { height: 40%; } }
        .animate-eq-1 { animation: eq1 0.8s ease-in-out infinite; }
        .animate-eq-2 { animation: eq2 0.6s ease-in-out infinite; }
        .animate-eq-3 { animation: eq3 0.7s ease-in-out infinite; }
        .animate-eq-4 { animation: eq4 0.5s ease-in-out infinite; }
      `}</style>
    </div>
  )
}
