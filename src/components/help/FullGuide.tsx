import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getGuide, guideChrome, guideTargetFor, type GuideId, type GuideRole } from '../../lib/guideContent'
import { useLanguage } from '../../i18n/LanguageContext'
import { useOptionalAuth } from '../../context/AuthContext'
import { triggerHaptic } from '../../lib/haptics'
import { playSfx } from '../../lib/sfx'
import { getTapOrigin } from '../ui/Sheet'
import GuideDemo from './GuideDemo'
import '../../styles/shell.css'

/**
 * Atlas A13 · the ONE help system. Full-screen, story-style pages (max 3): progress bars, a mono topic label, a 3-second
 * demo of the real screen (NEXT95 · GuideDemo), one big line and one plain sentence. Back / Next, swipe, arrow keys; ✕ or Escape closes.
 * Opens on `chon:open-guide` `{ id, page? }` and grows out of the tapped "?" (transform-origin = last tap point).
 * Pages slide sideways like stories. Reduced motion → no grow, no slide.
 */
export default function FullGuide() {
  const [state, setState] = useState<{ id: GuideId; page: number; origin: string; n: number } | null>(null)
  const [dir, setDir] = useState<'next' | 'prev' | 'none'>('none')
  const closeRef = useRef<HTMLButtonElement | null>(null)
  const lastFocus = useRef<HTMLElement | null>(null)
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null)
  // Round 4 · Ploy B9: the guide follows the app language and the account role (hosts read host guides)
  const { language } = useLanguage()
  const auth = useOptionalAuth()
  const role: GuideRole = auth?.session?.role === 'host' || auth?.session?.role === 'agency' ? 'host' : 'guest'
  const langRef = useRef({ language, role })
  langRef.current = { language, role }
  const ui = guideChrome(language)

  useEffect(() => {
    const onOpen = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; page?: number }>).detail ?? {}
      const target = guideTargetFor(d.id ?? 'meet')
      const guide = getGuide(target.id, langRef.current.language, langRef.current.role)
      const page = Math.max(0, Math.min(guide.pages.length - 1, typeof d.page === 'number' ? d.page : target.page))
      const o = getTapOrigin()
      lastFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      setDir('none')
      setState((s) => ({ id: target.id, page, origin: o ? `${o.x}px ${o.y}px` : '50% 30%', n: (s?.n ?? 0) + 1 }))
    }
    window.addEventListener('chon:open-guide', onOpen)
    return () => window.removeEventListener('chon:open-guide', onOpen)
  }, [])

  const close = useCallback(() => {
    triggerHaptic('tap')
    setState(null)
    const el = lastFocus.current
    lastFocus.current = null
    if (el) {
      try {
        el.focus({ preventScroll: true })
      } catch {
        // detached
      }
    }
  }, [])

  const go = useCallback((delta: number) => {
    setState((s) => {
      if (!s) return s
      const total = getGuide(s.id, langRef.current.language, langRef.current.role).pages.length
      const next = s.page + delta
      if (next < 0) return s
      if (next >= total) return null
      return { ...s, page: next }
    })
    setDir(delta > 0 ? 'next' : 'prev')
    triggerHaptic('select')
  }, [])

  useEffect(() => {
    if (!state) return
    closeRef.current?.focus({ preventScroll: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        close()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        go(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        go(-1)
      }
    }
    // capture so App's global arrow-key scroller and Escape handler don't also fire
    window.addEventListener('keydown', onKey, true)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey, true)
      document.body.style.overflow = prevOverflow
    }
    // re-run only when the guide opens/closes, not on every page turn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.n, state === null])

  useEffect(() => {
    if (state) playSfx('fold')
  }, [state?.n]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state || typeof document === 'undefined') return null
  const guide = getGuide(state.id, language, role)
  const th = language === 'th'
  // Thai script breaks apart under the mono label's wide tracking + uppercase (Ploy R5: no letter-spaced Thai crumbs)
  const monoStyle = th ? { letterSpacing: 0, textTransform: 'none' as const, fontFamily: 'inherit' } : undefined
  const total = guide.pages.length
  const page = guide.pages[state.page]
  const last = state.page === total - 1

  return createPortal(
    <div
      className="sh-guide"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sh-guide-title"
      data-testid="full-guide"
      data-guide-id={state.id}
      data-guide-role={role}
      lang={th ? 'th' : undefined}
      style={{ transformOrigin: state.origin }}
      key={state.n}
      onPointerDown={(e) => {
        swipe.current = { x: e.clientX, y: e.clientY, t: Date.now() }
      }}
      onPointerUp={(e) => {
        const s = swipe.current
        swipe.current = null
        if (!s) return
        const dx = e.clientX - s.x
        const dy = e.clientY - s.y
        if (Date.now() - s.t < 600 && Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) go(dx < 0 ? 1 : -1)
      }}
    >
      <div className="sh-guide-glow" aria-hidden="true" />
      <div className="sh-guide-bars" role="tablist" aria-label={`${guide.topic} pages`}>
        {guide.pages.map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === state.page}
            aria-label={ui.pageAria(i + 1, total)}
            className={`sh-guide-bar${i < state.page ? ' is-done' : ''}${i === state.page ? ' is-on' : ''}`}
            onClick={() => {
              if (i === state.page) return
              setDir(i > state.page ? 'next' : 'prev')
              setState((s) => (s ? { ...s, page: i } : s))
            }}
          >
            <i />
          </button>
        ))}
      </div>
      <div className="sh-guide-top">
        <p className="sh-mono" style={monoStyle}>
          {/* Marco B12: the eyebrow speaks ONE language — no Thai tucked into the English crumb */}
          {guide.topic} · {state.page + 1} {ui.of} {total}
        </p>
        <button ref={closeRef} type="button" className="sh-guide-x" aria-label={ui.closeAria} data-testid="full-guide-close" onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="sh-guide-stage">
        <article key={`${state.id}-${state.page}`} className={`sh-guide-page is-${dir}`} aria-live="polite">
          {/* NEXT95 · G3: guides that show — a 3-second demo of the real screen above the one line */}
          {page.demo ? <GuideDemo demo={page.demo} /> : null}
          <h2 id="sh-guide-title" className="sh-guide-title">
            {page.title.split('\n').map((l, i) => (
              <span key={i}>{l}</span>
            ))}
          </h2>
          <p className="sh-guide-line">{page.line}</p>
          {page.example && !page.demo && (
            <section className="sh-guide-ex" aria-label="Example">
              <p className="sh-mono" style={monoStyle}>{page.example.label ?? ui.example}</p>
              <ul>
                {page.example.rows.map((r, i) => (
                  <li key={i} style={{ animationDelay: `${120 + i * 70}ms` }}>
                    <span className="sh-guide-ico" aria-hidden="true">{r.icon}</span>
                    <span className="sh-guide-row">
                      {r.text}
                      {r.amount ? (
                        <>
                          {' '}
                          <b>{r.amount}</b>
                        </>
                      ) : null}
                      {r.after ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {page.tip && <p className="sh-guide-tip">{page.tip}</p>}
        </article>
      </div>

      <div className="sh-guide-foot">
        <button type="button" className="sh-btn sh-btn-ghost" onClick={() => (state.page === 0 ? close() : go(-1))} data-testid="full-guide-back">
          {state.page === 0 ? ui.close : ui.back}
        </button>
        <button type="button" className="sh-btn sh-btn-gold" onClick={() => (last ? close() : go(1))} data-testid="full-guide-next">
          {last ? guide.done : ui.next}
        </button>
      </div>
    </div>,
    document.body,
  )
}
