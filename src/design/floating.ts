/**
 * KRING VISUAL V2 · "Floating" motion helpers (owner V1). CSS lives in ./floating.css (imported once by main.tsx).
 *
 *   const ref = useFloatRef<HTMLDivElement>()
 *   <div ref={ref} className="hero-card kf-hero kf-press">          ← the ONE floating hero of the screen
 *     <span className="kf-spec" aria-hidden="true" />               ← optional slow light sweep (host must be positioned)
 *     …
 *   </div>
 *   <ul className="kf-stagger">…</ul>                                 ← rows rise once, 40 ms apart (--i auto)
 *
 * useFloatRef: a callback ref that puts the element on the app's ONE shared IntersectionObserver (lib/inView) so it
 * carries data-inview="false" while off-screen → the float + sweep pause. It also works on any other element whose
 * CSS should pause off-screen. Pass a callback to hear visibility changes.
 * installFloatingVisibility(): html[data-kf-hidden] while the document is hidden (called once by App).
 * FLOAT: the numbers, for code that has to animate by hand (WAAPI) — same values as the CSS.
 */
import { useCallback, useEffect, useRef } from 'react'
import { watchInView } from '../lib/inView'

export const FLOAT = {
  /** px up at the top of the drift */
  rise: 4,
  /** degrees of tilt at the top of the drift */
  tiltDeg: 1,
  /** one full drift */
  periodMs: 7000,
  /** the light sweep repeats every … */
  sweepMs: 8000,
  /** press scale */
  press: 0.98,
  /** list stagger, once */
  staggerMs: 40,
  /** sheet rise (soft spring) */
  sheetMs: 560,
  sheetEase: 'cubic-bezier(.3,1.25,.5,1)',
  /** max things moving at rest on one screen (header logo + one hero) */
  maxAtRest: 2,
} as const

export const FLOAT_CLASS = {
  hero: 'kf-hero',
  heroAlt: 'kf-hero-alt',
  spec: 'kf-spec',
  press: 'kf-press',
  stagger: 'kf-stagger',
  sheet: 'kf-sheet',
} as const

/** Callback ref: keeps data-inview on the element (pauses its float/sweep off-screen). */
export function useFloatRef<T extends HTMLElement>(onInView?: (inView: boolean) => void, rootMargin = '40px') {
  const stop = useRef<(() => void) | null>(null)
  const cb = useRef(onInView)
  cb.current = onInView
  const ref = useCallback(
    (el: T | null) => {
      stop.current?.()
      stop.current = null
      if (el) stop.current = watchInView(el, (v) => cb.current?.(v), rootMargin)
    },
    [rootMargin],
  )
  useEffect(() => () => stop.current?.(), [])
  return ref
}

let installed = false
/** html[data-kf-hidden] while the app is in the background, so no float/sweep/logo loop runs unseen. Idempotent. */
export function installFloatingVisibility(): void {
  if (installed || typeof document === 'undefined') return
  installed = true
  const sync = () => {
    if (document.visibilityState === 'hidden') document.documentElement.setAttribute('data-kf-hidden', '')
    else document.documentElement.removeAttribute('data-kf-hidden')
  }
  sync()
  document.addEventListener('visibilitychange', sync)
  // .kf-stagger: give each direct child its index once (capped at 11) so the rise is 40 ms apart
  const index = (list: HTMLElement) => {
    const kids = list.children
    for (let i = 0; i < kids.length; i++) {
      const k = kids[i] as HTMLElement
      if (!k.style.getPropertyValue('--i')) k.style.setProperty('--i', String(Math.min(i, 11)))
    }
  }
  const scan = (root: Element) => {
    if (root.classList.contains('kf-stagger')) index(root as HTMLElement)
    const found = root.getElementsByClassName('kf-stagger')
    for (let i = 0; i < found.length; i++) index(found[i] as HTMLElement)
  }
  if (typeof MutationObserver !== 'undefined' && document.body) {
    new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.target instanceof HTMLElement && r.target.classList.contains('kf-stagger')) index(r.target)
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1) scan(n as Element)
        })
      }
    }).observe(document.body, { childList: true, subtree: true })
  }
}
