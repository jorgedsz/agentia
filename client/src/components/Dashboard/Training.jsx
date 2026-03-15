import { useState } from 'react'
import { useParams } from 'react-router-dom'
import enTranslations from '../../i18n/en.json'
import esTranslations from '../../i18n/es.json'

const VIDEOS = [
  {
    id: 1,
    titleKey: 'training.vid1Title',
    descKey: 'training.vid1Desc',
    category: 'getting-started',
    duration: '5 min',
    icon: '\u{1F680}',
    youtubeId: 'PLACEHOLDER_1',
  },
  {
    id: 2,
    titleKey: 'training.vid2Title',
    descKey: 'training.vid2Desc',
    category: 'agents',
    duration: '8 min',
    icon: '\u{1F4DE}',
    youtubeId: 'PLACEHOLDER_2',
  },
  {
    id: 3,
    titleKey: 'training.vid3Title',
    descKey: 'training.vid3Desc',
    category: 'agents',
    duration: '7 min',
    icon: '\u{1F4E5}',
    youtubeId: 'PLACEHOLDER_3',
  },
  {
    id: 4,
    titleKey: 'training.vid4Title',
    descKey: 'training.vid4Desc',
    category: 'phone',
    duration: '4 min',
    icon: '\u{1F4F1}',
    youtubeId: 'PLACEHOLDER_4',
  },
  {
    id: 5,
    titleKey: 'training.vid5Title',
    descKey: 'training.vid5Desc',
    category: 'integrations',
    duration: '6 min',
    icon: '\u{1F4C5}',
    youtubeId: 'PLACEHOLDER_5',
  },
  {
    id: 6,
    titleKey: 'training.vid6Title',
    descKey: 'training.vid6Desc',
    category: 'agents',
    duration: '5 min',
    icon: '\u{1F399}\uFE0F',
    youtubeId: 'PLACEHOLDER_6',
  },
  {
    id: 7,
    titleKey: 'training.vid7Title',
    descKey: 'training.vid7Desc',
    category: 'billing',
    duration: '3 min',
    icon: '\u{1F4B3}',
    youtubeId: 'PLACEHOLDER_7',
  },
  {
    id: 8,
    titleKey: 'training.vid8Title',
    descKey: 'training.vid8Desc',
    category: 'integrations',
    duration: '10 min',
    icon: '\u{1F517}',
    youtubeId: 'PLACEHOLDER_8',
  },
]

const CATEGORY_KEYS = [
  { id: 'all', labelKey: 'training.catAll' },
  { id: 'getting-started', labelKey: 'training.catGettingStarted' },
  { id: 'agents', labelKey: 'training.catAgents' },
  { id: 'phone', labelKey: 'training.catPhone' },
  { id: 'integrations', labelKey: 'training.catIntegrations' },
  { id: 'billing', labelKey: 'training.catBilling' },
]

export default function Training() {
  const { lang } = useParams()
  const translations = lang === 'es' ? esTranslations : enTranslations
  const t = (key) => {
    const keys = key.split('.')
    let value = translations
    for (const k of keys) {
      value = value?.[k]
    }
    return value || key
  }
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [selectedVideo, setSelectedVideo] = useState(null)

  const filtered = VIDEOS.filter((v) => {
    if (categoryFilter !== 'all' && v.category !== categoryFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      const title = t(v.titleKey).toLowerCase()
      const desc = t(v.descKey).toLowerCase()
      if (!title.includes(q) && !desc.includes(q)) return false
    }
    return true
  })

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t('training.title')}</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t('training.subtitle')}</p>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('training.searchPlaceholder')}
            className="w-full pl-10 pr-4 py-2 rounded-lg border border-gray-300 dark:border-dark-border bg-white dark:bg-dark-bg text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Category filter */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-dark-bg rounded-lg p-1 w-fit flex-wrap">
        {CATEGORY_KEYS.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              categoryFilter === cat.id
                ? 'bg-white dark:bg-dark-card text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {t(cat.labelKey)}
          </button>
        ))}
      </div>

      {/* Video grid */}
      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-12 text-center">
          <svg className="w-12 h-12 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('training.noResults')}</h3>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((video) => (
            <div
              key={video.id}
              onClick={() => setSelectedVideo(video)}
              className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border p-5 hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer transition-colors group"
            >
              {/* Thumbnail area */}
              <div className="relative w-full aspect-video bg-gray-100 dark:bg-gray-700/50 rounded-lg mb-4 flex items-center justify-center overflow-hidden">
                <div className="text-4xl">{video.icon}</div>
                <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/20 transition-colors rounded-lg">
                  <div className="w-12 h-12 rounded-full bg-primary-600/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <svg className="w-6 h-6 text-white ml-0.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </div>

              {/* Info */}
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">{t(video.titleKey)}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed line-clamp-2 mb-3">{t(video.descKey)}</p>
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 text-[10px] font-medium rounded border border-gray-200 dark:border-gray-600/40 text-gray-500 dark:text-gray-400">
                  {t(CATEGORY_KEYS.find((c) => c.id === video.category)?.labelKey || 'training.catAll')}
                </span>
                <span className="flex items-center gap-1 text-xs text-gray-400">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {video.duration}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Video Modal */}
      {selectedVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setSelectedVideo(null)}>
          <div
            className="bg-white dark:bg-dark-card rounded-xl border border-gray-200 dark:border-dark-border w-full max-w-3xl mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-border">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t(selectedVideo.titleKey)}</h2>
              <button
                onClick={() => setSelectedVideo(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="aspect-video">
              <iframe
                className="w-full h-full rounded-b-xl"
                src={`https://www.youtube.com/embed/${selectedVideo.youtubeId}`}
                title={t(selectedVideo.titleKey)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
