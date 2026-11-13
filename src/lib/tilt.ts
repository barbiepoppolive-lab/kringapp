/**
 * NEXT95 · One tilt space.
 *
 * ONE rAF loop for the whole app writes two numbers, `--tx` and `--ty` (each −1…1, 3 decimals) — since KRING FIX1 only
 * on the elements whose CSS reads them (see "scoped writes" below), never per frame on <html>.
 * Every depth layer reads them in CSS, so the skyline, the Meet cards, the story rings, the Welcome portraits and the
 * Wallet's metal card move as one physical world (near layers further than far ones):
 *
 *   far  (stage / skyline)        translate ±5px    → `calc(var(--tx) * var(--tilt-far))`
 *   near (cards / rings / faces)  translate ±12px   → `calc(var(--tx) * var(--tilt-near))`
 *   metal card (G3)               rotate            → `rotateY(calc(var(--tx) * 8deg)) rotateX(calc(var(--ty) * -6deg))`
 *
 * Inputs, best first: DeviceOrientation (iOS asks permission once, on the first tap anywhere — never at boot),
 * then the mouse pointer on desktop. Touch drags are scrolls, so they never tilt. The loop only runs while the
 * smoothed value is still travelling towards the latest reading, then stops (no idle frames).
 * Reduced motion (OS setting, or the in-app switch `html[data-reduce-motion="true"]`) → off: both values are 0
 * and no listener is attached. Turning it back on resumes without a reload.
 *
 * Usage: `startTilt()` returns a stop function (ref-counted; App starts it once). `useTilt()` is the hook form.
 * `readTilt()` gives JS consumers the current smoothed pair.
 *
 * ROUND5:
 * - `pauseTilt()` (returns a resume) holds the world still while a full-screen layer covers it (story viewer):
 *   every `--tx` write restyles the whole document, which nobody can see behind an opaque overlay and which made the
 *   story cube stutter while a mouse moved. Ref-counted; resuming eases back in from the frozen value.
 * - Desktop: while the cursor is over a control (button, link, input…) the target is frozen, so the thing you are
 *   about to click does not slide out from under the pointer (Marco R5 #12).
 */
import { useEffect } from 'react'
import { isReducedMotionEnabled } from './haptics'

export const TILT_FAR_PX = 5
export const TILT_NEAR_PX = 12

const PERMISSION_KEY = 'chon_tilt_permission_v1'
/** KRING VISUAL V2: device-orientation tilt disabled (see attach) — flip to true only after a real-phone perf check */
const ORIENTATION_TILT = false
/** degrees of phone roll / pitch that map to a full ±1 */
const RANGE_DEG = 22
/** fraction of the remaining distance covered per frame (critically damped feel at 60 fps) */
const EASE = 0.14

type Source = 'none' | 'pointer' | 'orientation'

let refs = 0
let attached = false
let raf = 0
let source: Source = 'none'
let target = { x: 0, y: 0 }
let current = { x: 0, y: 0 }
let lastWritten = ''
/** the pitch the phone is naturally held at; drifts slowly so a new posture re-centres */
let neutralBeta: number | null = null
let pauses = 0
let cleanups: Array<() => void> = []
let watchCleanups: Array<() => void> = []

const clamp = (n: number) => (n > 1 ? 1 : n < -1 ? -1 : n)

function root(): HTMLElement | null {
  return typeof document === 'undefined' ? null : document.documentElement
}

export function tiltIsReduced(): boolean {
  if (typeof window === 'undefined') return true
  try {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return true
    if (document.documentElement.dataset.reduceMotion === 'true') return true
    return isReducedMotionEnabled()
  } catch {
    return false
  }
}

/* ---------------------------------------------------------------------------------------------------------------
 * KRING FIX1 (F3) · Marco 8 — scoped writes. A custom property set on <html> invalidates the style of EVERY element
 * (84 ms per write headless; median frame 23 → 197 ms while the pointer moved). Now the live values go only onto the
 * elements that actually read them: the selectors of every CSS rule that uses var(--tx|--ty|--tilt-ry|--tilt-rx) are
 * collected from the loaded stylesheets (re-scanned when a lazy chunk adds a sheet), matched elements get the four
 * vars inline, and only their own subtrees restyle. <html> keeps the neutral 0 (written once at start/stop), which is
 * what anything mounted while the world is at rest reads. Rules that merely DEFINE a var on :root are skipped.
 * ------------------------------------------------------------------------------------------------------------- */
const STATIC_TILT_SELECTOR = '.ux-stage-layer, .tilt-far, .tilt-near, .tilt-card, .wl-face, .sh-coin, .sh-sky-layer, .kx-xc'
let consumers: HTMLElement[] = []
let consumersAt = 0
const REQUERY_MS = 1200

function liveConsumers(): HTMLElement[] {
  const now = performance.now()
  if (now - consumersAt > REQUERY_MS) {
    consumersAt = now
    const next = Array.from(document.querySelectorAll<HTMLElement>(STATIC_TILT_SELECTOR))
    for (const el of consumers) if (!next.includes(el)) clearVars(el)
    consumers = next
  }
  return consumers
}

function clearVars(el: HTMLElement) {
  el.style.removeProperty('--tx')
  el.style.removeProperty('--ty')
  el.style.removeProperty('--tilt-ry')
  el.style.removeProperty('--tilt-rx')
}

/** Neutral value on <html> — only at start / stop / reduced motion, never per frame. */
function writeRoot(x: number, y: number) {
  const el = root()
  if (!el) return
  el.style.setProperty('--tx', x.toFixed(3))
  el.style.setProperty('--ty', y.toFixed(3))
}

function write(x: number, y: number) {
  if (!root()) return
  const key = `${x.toFixed(3)}|${y.toFixed(3)}`
  if (key === lastWritten) return
  lastWritten = key
  const tx = x.toFixed(3)
  const ty = y.toFixed(3)
  const ry = `${(x * 8).toFixed(3)}deg`
  const rx = `${(y * -6).toFixed(3)}deg`
  for (const el of liveConsumers()) {
    if (!el.isConnected) continue
    el.style.setProperty('--tx', tx)
    el.style.setProperty('--ty', ty)
    el.style.setProperty('--tilt-ry', ry)
    el.style.setProperty('--tilt-rx', rx)
  }
}

/** Back to neutral everywhere (stop / reduced motion). */
function resetAll() {
  lastWritten = ''
  for (const el of consumers) clearVars(el)
  consumers = []
  consumersAt = 0
  writeRoot(0, 0)
}

function frame() {
  raf = 0
  const dx = target.x - current.x
  const dy = target.y - current.y
  if (Math.abs(dx) < 0.002 && Math.abs(dy) < 0.002) {
    current = { ...target }
    write(current.x, current.y)
    return // settled → the loop stops until the next reading
  }
  current = { x: current.x + dx * EASE, y: current.y + dy * EASE }
  write(current.x, current.y)
  raf = window.requestAnimationFrame(frame)
}

function schedule() {
  if (pauses > 0) return
  if (!raf && typeof window !== 'undefined') {
    consumersAt = 0 // a new gesture → pick up anything mounted while the world was at rest
    raf = window.requestAnimationFrame(frame)
  }
}

/** Freeze the tilt (no writes, no frames) until the returned resume is called. Ref-counted, idempotent resume. */
export function pauseTilt(): () => void {
  pauses += 1
  if (pauses === 1 && raf && typeof window !== 'undefined') {
    window.cancelAnimationFrame(raf)
    raf = 0
  }
  let done = false
  return () => {
    if (done) return
    done = true
    pauses = Math.max(0, pauses - 1)
    if (pauses === 0) schedule()
  }
}

const CONTROL_SELECTOR = 'button, a[href], input, select, textarea, label, [role="button"], [role="tab"], [role="switch"]'

function setTarget(x: number, y: number) {
  target = { x: clamp(x), y: clamp(y) }
  schedule()
}

function onOrientation(e: DeviceOrientationEvent) {
  if (e.gamma == null || e.beta == null || document.hidden) return
  source = 'orientation'
  if (neutralBeta == null) neutralBeta = e.beta
  // slow re-centre: lying on a sofa or standing at a bar both become "level" after a few seconds
  neutralBeta += (e.beta - neutralBeta) * 0.012
  setTarget(e.gamma / RANGE_DEG, (e.beta - neutralBeta) / RANGE_DEG)
}

function onPointer(e: PointerEvent) {
  if (source === 'orientation' || e.pointerType === 'touch') return
  // hovering a control → hold still so the target does not drift under the cursor
  const el = e.target instanceof Element ? e.target : null
  if (el && el.closest(CONTROL_SELECTOR)) return
  const w = window.innerWidth || 1
  const h = window.innerHeight || 1
  source = 'pointer'
  setTarget((e.clientX / w) * 2 - 1, (e.clientY / h) * 2 - 1)
}

function onLeave() {
  if (source === 'pointer') setTarget(0, 0)
}

type PermissionCtor = { requestPermission?: () => Promise<'granted' | 'denied' | 'default'> }

function listenOrientation() {
  window.addEventListener('deviceorientation', onOrientation, { passive: true })
  cleanups.push(() => window.removeEventListener('deviceorientation', onOrientation))
}

/** iOS 13+: DeviceOrientation needs a user gesture. Ask once, on the first tap, and remember the answer. */
function armPermission() {
  const ctor = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as unknown as
    | PermissionCtor
    | undefined
  if (!ctor || typeof ctor.requestPermission !== 'function') {
    listenOrientation()
    return
  }
  let remembered: string | null = null
  try {
    remembered = window.localStorage.getItem(PERMISSION_KEY)
  } catch {
    remembered = null
  }
  if (remembered === 'denied') return
  const ask = () => {
    window.removeEventListener('pointerup', ask, true)
    ctor.requestPermission?.()
      .then((state) => {
        try {
          window.localStorage.setItem(PERMISSION_KEY, state)
        } catch {
          // storage blocked
        }
        if (state === 'granted' && attached) listenOrientation()
      })
      .catch(() => {
        // not a user gesture / unsupported → pointer fallback stays
      })
  }
  // a granted answer survives a reload on iOS only for the session; re-asking on the first tap is silent then
  window.addEventListener('pointerup', ask, true)
  cleanups.push(() => window.removeEventListener('pointerup', ask, true))
}

function attach() {
  if (attached || typeof window === 'undefined') return
  if (tiltIsReduced()) {
    resetAll()
    return
  }
  attached = true
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  cleanups.push(() => {
    window.removeEventListener('pointermove', onPointer)
    document.documentElement.removeEventListener('pointerleave', onLeave)
  })
  // KRING VISUAL V2 · Motion = Floating: one hero per screen floats on its own (design/floating.css); the gyro-driven
  // world tilt is OFF on phones. It wrote CSS variables up to 60×/s while a phone was held (parity audit root cause 1:
  // idle style recalc 110 → 567 ms per 2 s, tab switch frames up to 550 ms). Desktop keeps the gentle pointer parallax.
  if (ORIENTATION_TILT) armPermission()
}

function detach() {
  cleanups.forEach((fn) => fn())
  cleanups = []
  attached = false
  source = 'none'
  neutralBeta = null
  if (raf) window.cancelAnimationFrame(raf)
  raf = 0
  target = { x: 0, y: 0 }
  current = { x: 0, y: 0 }
  resetAll()
}

/** Re-evaluate when the OS or in-app reduced-motion setting flips. */
function watchReduced() {
  const sync = () => {
    if (tiltIsReduced()) detach()
    else attach()
  }
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
  if (mq && typeof mq.addEventListener === 'function') {
    mq.addEventListener('change', sync)
    watchCleanups.push(() => mq.removeEventListener('change', sync))
  }
  if (typeof MutationObserver !== 'undefined') {
    const mo = new MutationObserver(sync)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-reduce-motion'] })
    watchCleanups.push(() => mo.disconnect())
  }
}

/** Start the shared tilt (ref-counted). Returns the matching stop. Safe in jsdom / SSR. */
export function startTilt(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}
  refs += 1
  if (refs === 1) {
    writeRoot(0, 0)
    watchReduced()
    attach()
  }
  let stopped = false
  return () => {
    if (stopped) return
    stopped = true
    refs = Math.max(0, refs - 1)
    if (refs === 0) {
      detach()
      watchCleanups.forEach((fn) => fn())
      watchCleanups = []
    }
  }
}

export function useTilt(): void {
  useEffect(() => startTilt(), [])
}

/** The current smoothed tilt (−1…1). Prefer the CSS variables; this is for canvas / JS consumers. */
export function readTilt(): { x: number; y: number } {
  return { ...current }
}
