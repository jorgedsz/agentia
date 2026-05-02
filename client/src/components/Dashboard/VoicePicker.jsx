import { useState, useEffect, useRef } from 'react'
import { voicesAPI } from '../../services/api'
import { useLanguage } from '../../context/LanguageContext'

export default function VoicePicker({ open, onClose, onSelect, selectedVoiceId }) {
  const { t } = useLanguage()
  // Helper that mirrors AgentEdit's `ta()` — keys live under agentEdit.* in en.json
  const ta = (key) => t(`agentEdit.${key}`)

  const [voices, setVoices] = useState([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [providerFilter, setProviderFilter] = useState('all')
  const [genderFilter, setGenderFilter] = useState('all')
  const [accentFilter, setAccentFilter] = useState('all')
  const [languageFilter, setLanguageFilter] = useState('all')
  const [previewPlayingId, setPreviewPlayingId] = useState(null)
  const [customVoiceIdInput, setCustomVoiceIdInput] = useState('')
  const audioRef = useRef(null)

  // Fetch + reset when opening
  useEffect(() => {
    if (!open) return
    setSearch('')
    setProviderFilter('all')
    setGenderFilter('all')
    setAccentFilter('all')
    setLanguageFilter('all')
    setCustomVoiceIdInput('')
    if (voices.length === 0) {
      setLoading(true)
      voicesAPI.list()
        .then(res => setVoices(res.data || []))
        .catch(err => console.error('Failed to load voices:', err))
        .finally(() => setLoading(false))
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPreviewPlayingId(null)
    }
  }, [open])

  if (!open) return null

  const handlePreview = (voice) => {
    if (previewPlayingId === voice.voiceId) {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setPreviewPlayingId(null)
      return
    }
    if (audioRef.current) {
      audioRef.current.pause()
    }
    if (!voice.previewUrl) return
    // Convert Google Drive sharing URLs to direct download URLs
    const convertDriveUrl = (url) => {
      const fileMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
      if (fileMatch) return `https://drive.usercontent.google.com/download?id=${fileMatch[1]}&export=download&confirm=t`
      const openMatch = url.match(/drive\.google\.com\/open\?id=([^&]+)/)
      if (openMatch) return `https://drive.usercontent.google.com/download?id=${openMatch[1]}&export=download&confirm=t`
      const ucMatch = url.match(/drive\.google\.com\/uc\?.*id=([^&]+)/)
      if (ucMatch) return `https://drive.usercontent.google.com/download?id=${ucMatch[1]}&export=download&confirm=t`
      return url
    }
    const rawUrl = convertDriveUrl(voice.previewUrl)
    const needsProxy = rawUrl.includes('drive.google.com') || rawUrl.includes('drive.usercontent.google.com') || rawUrl.includes('docs.google.com')
    const playUrl = needsProxy
      ? `${import.meta.env.VITE_API_URL || '/api'}/voices/audio-proxy?url=${encodeURIComponent(rawUrl)}`
      : rawUrl
    const audio = new Audio(playUrl)
    audioRef.current = audio
    setPreviewPlayingId(voice.voiceId)
    audio.play().catch(() => setPreviewPlayingId(null))
    audio.addEventListener('ended', () => { setPreviewPlayingId(null); audioRef.current = null })
    audio.addEventListener('error', () => { setPreviewPlayingId(null); audioRef.current = null })
  }

  const close = () => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPreviewPlayingId(null)
    onClose()
  }

  const filtered = voices.filter(v => {
    if (providerFilter === 'custom' && !v.isCustom) return false
    if (providerFilter === '11labs' && (v.isCustom || v.provider !== '11labs')) return false
    if (genderFilter !== 'all' && v.gender !== genderFilter) return false
    if (accentFilter !== 'all' && (v.accent || '').toLowerCase() !== accentFilter) return false
    if (languageFilter !== 'all' && !(v.languages || []).includes(languageFilter)) return false
    if (search && !v.name.toLowerCase().includes(search.toLowerCase()) &&
        !(v.accent || '').toLowerCase().includes(search.toLowerCase()) &&
        !(v.description || '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={close}>
      <div className="bg-white dark:bg-dark-card rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{ta('chooseVoice')}</h2>
          <button onClick={close} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-b border-gray-200 dark:border-dark-border">
          <select
            value={providerFilter}
            onChange={(e) => setProviderFilter(e.target.value)}
            className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            <option value="all">{ta('allVoicesOption')}</option>
            <option value="11labs">{ta('elevenLabsOption')}</option>
            <option value="custom">{ta('customOption')}</option>
          </select>
          <select
            value={genderFilter}
            onChange={(e) => setGenderFilter(e.target.value)}
            className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            <option value="all">{ta('allGendersOption')}</option>
            <option value="male">{ta('maleOption')}</option>
            <option value="female">{ta('femaleOption')}</option>
          </select>
          <select
            value={accentFilter}
            onChange={(e) => setAccentFilter(e.target.value)}
            className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            <option value="all">{ta('allAccentsOption')}</option>
            <option value="american">{ta('accentAmerican')}</option>
            <option value="british">{ta('accentBritish')}</option>
            <option value="australian">{ta('accentAustralian')}</option>
            <option value="swedish">{ta('accentSwedish')}</option>
            <option value="transatlantic">{ta('accentTransatlantic')}</option>
            <option value="mexican">{ta('accentMexican')}</option>
            <option value="colombian">{ta('accentColombian')}</option>
            <option value="argentinian">{ta('accentArgentinian')}</option>
            <option value="chilean">{ta('accentChilean')}</option>
            <option value="peruvian">{ta('accentPeruvian')}</option>
            <option value="venezuelan">{ta('accentVenezuelan')}</option>
            <option value="cuban">{ta('accentCuban')}</option>
            <option value="dominican">{ta('accentDominican')}</option>
            <option value="puerto rican">{ta('accentPuertoRican')}</option>
            <option value="ecuadorian">{ta('accentEcuadorian')}</option>
            <option value="uruguayan">{ta('accentUruguayan')}</option>
            <option value="paraguayan">{ta('accentParaguayan')}</option>
            <option value="bolivian">{ta('accentBolivian')}</option>
            <option value="costarrican">{ta('accentCostaRican')}</option>
            <option value="panamanian">{ta('accentPanamanian')}</option>
            <option value="guatemalan">{ta('accentGuatemalan')}</option>
            <option value="honduran">{ta('accentHonduran')}</option>
            <option value="salvadoran">{ta('accentSalvadoran')}</option>
            <option value="nicaraguan">{ta('accentNicaraguan')}</option>
            <option value="spanish">{ta('accentSpanishSpain')}</option>
          </select>
          <select
            value={languageFilter}
            onChange={(e) => setLanguageFilter(e.target.value)}
            className="pl-2 pr-7 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 appearance-none cursor-pointer"
          >
            <option value="all">{ta('allLanguagesOption')}</option>
            <option value="en">{ta('langEnglish')}</option>
            <option value="es">{ta('langSpanish')}</option>
            <option value="fr">{ta('langFrench')}</option>
            <option value="de">{ta('langGerman')}</option>
            <option value="it">{ta('langItalian')}</option>
            <option value="pt">{ta('langPortuguese')}</option>
            <option value="pl">{ta('langPolish')}</option>
            <option value="nl">{ta('langDutch')}</option>
            <option value="ru">{ta('langRussian')}</option>
            <option value="ja">{ta('langJapanese')}</option>
            <option value="zh">{ta('langChinese')}</option>
            <option value="ko">{ta('langKorean')}</option>
            <option value="hi">{ta('langHindi')}</option>
            <option value="ar">{ta('langArabic')}</option>
            <option value="sv">{ta('langSwedish')}</option>
            <option value="da">{ta('langDanish')}</option>
            <option value="fi">{ta('langFinnish')}</option>
            <option value="no">{ta('langNorwegian')}</option>
            <option value="tr">{ta('langTurkish')}</option>
            <option value="el">{ta('langGreek')}</option>
            <option value="cs">{ta('langCzech')}</option>
            <option value="ro">{ta('langRomanian')}</option>
            <option value="hu">{ta('langHungarian')}</option>
            <option value="sk">{ta('langSlovak')}</option>
            <option value="uk">{ta('langUkrainian')}</option>
            <option value="vi">{ta('langVietnamese')}</option>
            <option value="id">{ta('langIndonesian')}</option>
            <option value="ms">{ta('langMalay')}</option>
            <option value="he">{ta('langHebrew')}</option>
          </select>
          <div className="relative flex-1 min-w-[150px]">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={ta('searchVoices')}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Voice Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {/* Manual Voice ID Card */}
              <div className={`rounded-lg border border-dashed p-3 flex flex-col justify-between ${customVoiceIdInput.trim() ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500' : 'border-gray-300 dark:border-dark-border'}`}>
                <div className="mb-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">{ta('addVoiceManually')}</span>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ta('pasteVoiceIdDesc')}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={customVoiceIdInput}
                    onChange={(e) => setCustomVoiceIdInput(e.target.value)}
                    placeholder={ta('voiceIdPlaceholder')}
                    onClick={(e) => e.stopPropagation()}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-md border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-card text-gray-900 dark:text-white placeholder-gray-400 text-xs focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    disabled={!customVoiceIdInput.trim()}
                    onClick={(e) => {
                      e.stopPropagation()
                      onSelect({ provider: '11labs', voiceId: customVoiceIdInput.trim(), isCustom: true })
                      onClose()
                    }}
                    className="px-2.5 py-1.5 rounded-md bg-primary-600 text-white text-xs font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    {ta('useVoice')}
                  </button>
                </div>
              </div>
              {filtered.map((voice) => {
                const isPlaying = previewPlayingId === voice.voiceId
                const isSelected = voice.voiceId === selectedVoiceId
                return (
                  <div
                    key={`${voice.provider}-${voice.voiceId}`}
                    className={`relative rounded-lg border p-3 cursor-pointer transition-all ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 ring-1 ring-primary-500'
                        : isPlaying
                          ? 'border-primary-400 bg-primary-50/50 dark:bg-primary-900/10'
                          : 'border-gray-200 dark:border-dark-border hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                    onClick={() => {
                      onSelect({ provider: '11labs', voiceId: voice.voiceId, isCustom: false })
                      onClose()
                    }}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-sm font-medium text-gray-900 dark:text-white truncate">{voice.name}</span>
                      {isSelected && (
                        <svg className="w-4 h-4 text-primary-600 flex-shrink-0 ml-1" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                    {voice.description && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 truncate">{voice.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                          voice.isCustom
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            : 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                        }`}>
                          {voice.isCustom ? ta('customOption') : ta('elevenLabsOption')}
                        </span>
                        {voice.gender && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            voice.gender === 'female'
                              ? 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400'
                              : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400'
                          }`}>
                            {voice.gender === 'female' ? 'F' : 'M'}
                          </span>
                        )}
                        {voice.accent && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            {voice.accent.charAt(0).toUpperCase() + voice.accent.slice(1)}
                          </span>
                        )}
                        {(voice.languages || []).length > 3 ? (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">
                            {voice.languages.length} {ta('langsCount')}
                          </span>
                        ) : (voice.languages || []).map(lang => (
                          <span key={lang} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 dark:bg-gray-700/30 dark:text-gray-400">
                            {lang.toUpperCase()}
                          </span>
                        ))}
                      </div>
                      {voice.previewUrl && (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handlePreview(voice) }}
                          className={`p-1 rounded-full transition-colors ${
                            isPlaying
                              ? 'text-primary-600 bg-primary-100 dark:bg-primary-900/30'
                              : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-dark-hover'
                          }`}
                        >
                          {isPlaying ? (
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
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <p className="text-center text-gray-500 dark:text-gray-400 py-8 text-sm">{ta('noVoicesMatch')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
