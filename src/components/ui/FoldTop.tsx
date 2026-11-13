import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { playSfx } from '../../lib/sfx'

/**
 * UX-P6 · FoldTop — a collapsible, animated top section.
 * - Expanded: renders `children` at natural height.
 * - Folded: renders the slim `strip` (44 px) instead.
 * - Auto-folds once the user scrolls ~80 px into the list (a sentinel observed via IntersectionObserver);
 *   tapping the strip or the chevron re-expands. The user's last manual choice wins for the session.
 * - Height animates via CSS grid 1fr→0fr (no layout thrash); reduced-motion gets an instant switch.
 * - Depth build: the body folds away on a 3D hinge (`rotateX(-90deg)` from its top edge, 420 ms spring) and, on
 *   re-open, its direct children rise in with 50 ms steps (`.ux-fold-stagger`). The transform exists only while
 *   folded, so an open fold never traps `position: fixed` sheets rendered inside it.
 * The folded content is only hidden visually when folded (`inert` + `aria-hidden`), so test hooks stay in the DOM.
 */
export default function FoldTop({
  id,
  strip,
  children,
  threshold = 80,
  defaultFolded = false,
  label = 'Collapse',
  collapseLabel,
}: {
  id: string
  strip: ReactNode
  children: ReactNode
  threshold?: number
  defaultFolded?: boolean
  label?: string
  collapseLabel?: string
}) {
  const storageKey = `chon_fold_${id}`
  const [folded, setFolded] = useState<boolean>(() => {
    try {
      const v = window.sessionStorage.getItem(storageKey)
      if (v === '1') return true
      if (v === '0') return false
    } catch {
      // ignore
    }
    return defaultFolded
  })
  const manual = useRef(false)
  const uid = useId()

  // Auto-fold on scroll. Meet's top lives in a sticky header, so a plain window-scroll listener is the reliable
  // signal (an IntersectionObserver sentinel never leaves the viewport there). Manual choice wins for the session.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let raf = 0
    const onScroll = () => {
      if (manual.current) return
      if (raf) return
      raf = window.requestAnimationFrame(() => {
        raf = 0
        const y = window.scrollY || document.documentElement.scrollTop || 0
        if (y > threshold) setFolded(true)
        else if (y < 8) setFolded(false)
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [threshold])

  const toggle = () => {
    manual.current = true
    setFolded((f) => {
      const n = !f
      try {
        window.sessionStorage.setItem(storageKey, n ? '1' : '0')
      } catch {
        // ignore
      }
      return n
    })
    playSfx('fold')
  }

  return (
    <div className={`ux-fold${folded ? ' is-folded' : ''}`} data-testid={`fold-${id}`} data-folded={folded ? 'true' : 'false'}>
      <div className="ux-fold-body" aria-hidden={folded} {...(folded ? { inert: '' as unknown as boolean } : {})}>
        <div className="ux-fold-inner ux-fold-stagger" id={`${uid}-body`}>
          {children}
        </div>
      </div>
      {/* Row is a plain surface (tap anywhere to toggle); the chevron is the accessible control so the strip may hold its own buttons. */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="ux-fold-strip" data-testid={`fold-${id}-strip`} onClick={toggle}>
        <span className="ux-fold-strip-content">{folded ? strip : <span className="ux-fold-hint">{collapseLabel ?? label}</span>}</span>
        <button
          type="button"
          className="ux-fold-chev-btn"
          data-testid={`fold-${id}-toggle`}
          aria-expanded={!folded}
          aria-controls={`${uid}-body`}
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation()
            toggle()
          }}
        >
          <svg className="ux-fold-chev" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
