import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import en from '../i18n/en.json'
import es from '../i18n/es.json'

const translations = { en, es }

const LanguageContext = createContext(null)

function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj)
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    const saved = localStorage.getItem('language')
    return saved || 'en'
  })

  useEffect(() => {
    localStorage.setItem('language', language)
  }, [language])

  const toggleLanguage = () => setLanguage(prev => prev === 'en' ? 'es' : 'en')

  const t = useCallback((key, params) => {
    const value = getNestedValue(translations[language], key)
    if (value === undefined) return key
    if (!params) return value
    return value.replace(/\{\{(\w+)\}\}/g, (_, name) => params[name] ?? '')
  }, [language])

  return (
    <LanguageContext.Provider value={{ language, toggleLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}
