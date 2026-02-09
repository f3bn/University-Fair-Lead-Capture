'use client'

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react'
import { Locale, Dictionary, getDictionary } from './dictionaries'

interface I18nContextType {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: Dictionary
  dir: 'rtl' | 'ltr'
}

const I18nContext = createContext<I18nContextType | null>(null)

const LOCALE_KEY = 'app_locale'

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === 'undefined') return 'ar'
    const stored = localStorage.getItem(LOCALE_KEY) as Locale | null
    if (stored === 'ar' || stored === 'en') return stored
    return 'ar'
  })

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr'
    document.body.dir = locale === 'ar' ? 'rtl' : 'ltr'
    document.documentElement.style.direction = locale === 'ar' ? 'rtl' : 'ltr'
    document.body.style.direction = locale === 'ar' ? 'rtl' : 'ltr'
  }, [locale])

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale)
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCALE_KEY, newLocale)
    }
  }, [])

  const t = getDictionary(locale)
  const dir = locale === 'ar' ? 'rtl' : 'ltr'

  return (
    <I18nContext.Provider value={{ locale, setLocale, t, dir }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider')
  }
  return context
}
