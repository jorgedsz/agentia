import { useState, useEffect, useRef, useCallback } from 'react'
import { voicesAPI } from '../../services/api'

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

const LANGUAGES = [
  { value: 'all', label: 'All Languages' },
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
]

const LANG_LABELS = { en: 'EN', es: 'ES', fr: 'FR', de: 'DE', it: 'IT', pt: 'PT', pl: 'PL', nl: 'NL', ru: 'RU', ja: 'JA', zh: 'ZH', ko: 'KO', hi: 'HI', ar: 'AR' }

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
  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [providerFilter, setProviderFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const audioRef = useRef(null)

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

    const audio = new Audio(voice.previewUrl)
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

  const filtered = voices.filter(v => {
    if (providerFilter !== 'all' && v.provider !== providerFilter) return false
    if (genderFilter !== 'all' && v.gender !== genderFilter) return false
    if (languageFilter !== 'all' && !(v.languages || []).includes(languageFilter)) return false
    if (search && !v.name.toLowerCase().includes(search.toLowerCase())) return false
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

                <div className="flex items-center gap-2 mb-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    voice.provider === 'vapi'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                      : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                  }`}>
                    {voice.provider === 'vapi' ? 'VAPI' : 'ElevenLabs'}
                  </span>
                  {voice.gender && (
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      voice.gender === 'female'
                        ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
                        : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                    }`}>
                      {voice.gender.charAt(0).toUpperCase() + voice.gender.slice(1)}
                    </span>
                  )}
                  {(voice.languages || []).map(lang => (
                    <span key={lang} className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                      lang === 'es'
                        ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400'
                    }`}>
                      {LANG_LABELS[lang] || lang.toUpperCase()}
                    </span>
                  ))}
                </div>

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
