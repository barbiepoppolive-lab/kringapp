import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '../i18n/LanguageContext'
import { LANGUAGE_OPTIONS } from '../i18n/translations'
import { triggerHaptic } from '../lib/haptics'
import '../styles/shell.css'

/** Each language in its own script, with its English name under it (atlas A11). */
const ENGLISH_NAME: Record<string, string> = {
  en: 'English',
  th: 'Thai',
  zh: 'Chinese',
  hi: 'Hindi',
  ko: 'Korean',
  ru: 'Russian',
  ja: 'Japanese',
}
const NATIVE_NAME: Record<string, string> = { en: 'English' }

/**
 * Atlas A11 · language menu. Tap "EN ▾" and a small glass menu grows out of the pill. It is anchored to the pill and
 * clamped 10 px inside the screen, so it can never run off-screen. The content behind dims (no blur).
 * The group + buttons stay in the DOM (sr-only) while closed, so assistive tech and tests can always switch language.
 */
export default function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLSpanElement | null>(null)
  const [pos, setPos] = useState<{ top: number; left: number; origin: string } | null>(null)
  const activeOption = LANGUAGE_OPTIONS.find((opt) => opt.code === language) ?? LANGUAGE_OPTIONS[0]

  const MENU_W = 220
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const vw = window.innerWidth || document.documentElement.clientWidth || 375
    const left = Math.max(10, Math.min(vw - MENU_W - 10, r.right - MENU_W))
    const originX = Math.max(12, Math.min(MENU_W - 12, r.left + r.width / 2 - left))
    setPos({ top: Math.round(r.bottom + 8), left: Math.round(left), origin: `${Math.round(originX)}px 0` })
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    const onResize = () => setOpen(false)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const pick = (code: (typeof LANGUAGE_OPTIONS)[number]['code']) => {
    triggerHaptic('select')
    setLanguage(code)
    setOpen(false)
  }
  const toggle = () => {
    triggerHaptic('tap')
    setOpen((prev) => !prev)
  }
  const menuEl = (
      <div
        role="group"
        aria-label={t.switcherLabel}
        className={open && pos ? 'sh-lang-menu' : 'sr-only'}
        style={open && pos ? { top: pos.top, left: pos.left, width: MENU_W, transformOrigin: pos.origin } : undefined}
      >
        {LANGUAGE_OPTIONS.map((option) => {
          const isActive = option.code === language
          return (
            <button
              key={option.code}
              type="button"
              lang={option.htmlLang}
              aria-label={option.label}
              onClick={() => pick(option.code)}
              aria-pressed={isActive}
              className={`sh-lang-row${isActive ? ' is-on' : ''}`}
            >
              <span className="sh-lang-native" aria-hidden="true">{NATIVE_NAME[option.code] ?? option.nativeName}</span>
              <span className="sh-lang-en" aria-hidden="true">{ENGLISH_NAME[option.code] ?? option.label}</span>
              {isActive && (
                <svg className="sh-lang-tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              )}
            </button>
          )
        })}
      </div>
  )

  return (
    <div className="relative shrink-0">
      <span
        ref={triggerRef}
        role="tab"
        tabIndex={0}
        aria-label="Toggle language menu"
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
        className={`sh-lang-pill m-press${open ? ' is-open' : ''}`}
      >
        <span>{activeOption.code === 'en' ? 'EN' : activeOption.label.replace(/^\S+\s/, '')}</span>
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sh-lang-chev"><path d="M6 9l6 6 6-6" /></svg>
      </span>

      {/* portal: the sticky header is a containing block, so a fixed scrim inside it would only cover the header */}
      {open && pos && typeof document !== 'undefined'
        ? createPortal(<div className="sh-lang-scrim" aria-hidden="true" onClick={() => setOpen(false)} />, document.body)
        : null}
      {open && pos && typeof document !== 'undefined' ? createPortal(menuEl, document.body) : menuEl}
    </div>
  )
}
