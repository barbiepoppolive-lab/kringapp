import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { translations, type Language, type Translations } from './translations'

interface LanguageContextValue {
  language: Language
  setLanguage: (language: Language) => void
  t: Translations
}

const DEFAULT_LANGUAGE_VALUE: LanguageContextValue = {
  language: 'en',
  setLanguage: () => {},
  t: translations.en,
}

const LanguageContext = createContext<LanguageContextValue>(DEFAULT_LANGUAGE_VALUE)

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = window.localStorage.getItem('chon_language') as Language | null
        if (saved && saved in translations) {
          return saved
        }
      } catch {
        // ignore storage errors
      }
    }
    return 'en'
  })

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = language === 'zh' ? 'zh-Hans' : language
    }
  }, [language])

  const handleSetLanguage = useCallback((next: Language) => {
    setLanguage(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('chon_language', next)
      } catch {
        // ignore storage errors
      }
    }
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({ language, setLanguage: handleSetLanguage, t: translations[language] }),
    [language, handleSetLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext)
}
