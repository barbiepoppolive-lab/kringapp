/**
 * KRING FIX1 (F3) · one shared "is it on screen?" signal for motion budgets (Marco 7).
 *
 * Infinite or decorative animations must not run where nobody can see them. Instead of every component creating its
 * own IntersectionObserver, `watchInView(el)` adds the element to ONE observer per rootMargin and keeps
 * `data-inview="true" | "false"` on it in sync. CSS then gates motion on that attribute, e.g.
 *
 *   .kx-xc[data-inview='true'] .kx-xc-tag i::after { animation: kxPing 1.1s … 1; }   // pings each time it scrolls in
 *   .kp-hero[data-inview='false'] .kp-laser::before { animation-play-state: paused; } // no glow loop off screen
 *
 * An optional callback receives the same boolean (the Kring Price hero waits for it before striking the laser).
 * No IntersectionObserver (jsdom / very old browsers) → the element is treated as visible and the callback fires once
 * with `true`, so tests and fallbacks render the final state.
 */
import { useEffect, type RefObject } from 'react'

type Cb = (inView: boolean) => void
interface Shared {
  io: IntersectionObserver
  cbs: Map<Element, { n: number; cbs: Set<Cb> }>
}

const shared = new Map<string, Shared>()

function getShared(rootMargin: string): Shared | null {
  if (typeof IntersectionObserver === 'undefined') return null
  let s = shared.get(rootMargin)
  if (s) return s
  const cbs: Shared['cbs'] = new Map()
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        const v = e.isIntersecting
        const el = e.target as HTMLElement
        const next = v ? 'true' : 'false'
        if (el.dataset.inview !== next) el.dataset.inview = next
        cbs.get(el)?.cbs.forEach((cb) => cb(v))
      }
    },
    { rootMargin, threshold: 0 },
  )
  s = { io, cbs }
  shared.set(rootMargin, s)
  return s
}

/** Observe `el`; keeps `data-inview` current and calls `cb` on every change. Returns the matching unobserve. */
export function watchInView(el: Element | null | undefined, cb?: Cb, rootMargin = '0px'): () => void {
  if (!el) return () => {}
  const s = getShared(rootMargin)
  if (!s) {
    ;(el as HTMLElement).dataset.inview = 'true'
    cb?.(true)
    return () => {}
  }
  let rec = s.cbs.get(el)
  if (!rec) {
    rec = { n: 0, cbs: new Set() }
    s.cbs.set(el, rec)
    s.io.observe(el)
  }
  rec.n += 1
  if (cb) rec.cbs.add(cb)
  let done = false
  return () => {
    if (done) return
    done = true
    const cur = s.cbs.get(el)
    if (!cur) return
    if (cb) cur.cbs.delete(cb)
    cur.n -= 1
    if (cur.n <= 0) {
      s.cbs.delete(el)
      s.io.unobserve(el)
    }
  }
}

/** Hook form: keeps `data-inview` on `ref.current` (and calls `cb`, if given, on every change). */
export function useInView<T extends Element>(ref: RefObject<T>, cb?: Cb, rootMargin = '0px', deps: unknown[] = []): void {
  useEffect(
    () => watchInView(ref.current, cb, rootMargin),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ref, rootMargin, ...deps],
  )
}
