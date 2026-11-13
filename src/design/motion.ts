/**
 * Kring motion tokens — from the motion-system panel (lab/known/SECTION_B.html) + round-2/3 notes.
 *
 * Springs are real spring physics (mass 1, stiffness k, damping d) sampled into CSS `linear()` curves.
 * `ms` is the design duration used by the approved screens (e.g. "spring.bouncy (640 ms)" for the bump).
 * The same values are exposed as CSS custom properties in src/index.css:
 *   --spring-snap / --spring-default / --spring-gentle / --spring-bouncy / --spring-effect  (easing)
 *   --spring-*-t (duration) · --dur-xs…xl · --ease-standard/decel/accel · --stagger · --depth-1…3
 * Rules: animate transform/opacity only (60 fps), ≤ 3 glows per screen, reduced motion → 150 ms fades.
 *
 * Usage:  import { SPRING, DUR, springTransition } from '../design/motion'
 *         style={{ transition: springTransition('transform', 'bouncy') }}
 */

export type SpringName = 'snap' | 'default' | 'gentle' | 'bouncy' | 'effect'

export interface SpringToken {
  /** stiffness (mass 1) */
  k: number
  /** damping */
  d: number
  /** design duration in ms */
  ms: number
  /** CSS easing — linear() sampled from the physics, cubic-bezier fallback for old engines */
  css: string
  fallback: string
  /** what it is for (one meaning each) */
  use: string
}

/** Sample a damped spring 0 → 1 into a CSS linear() easing (≤ 48 stops). */
export function springCurve(k: number, d: number): string {
  const dt = 1 / 600
  let x = 0
  let v = 0
  const a: number[] = []
  for (let i = 0; i < 6000; i++) {
    v += (-k * (x - 1) - d * v) * dt
    x += v * dt
    a.push(x)
  }
  let last = 0
  a.forEach((y, i) => {
    if (Math.abs(1 - y) > 0.003) last = i
  })
  const n = last + 1
  const N = Math.min(48, n)
  const s: number[] = []
  for (let j = 0; j <= N; j++) s.push(+a[Math.round((j * (n - 1)) / N)].toFixed(3))
  s[N] = 1
  return `linear(0, ${s.join(', ')})`
}

const mk = (k: number, d: number, ms: number, fallback: string, use: string): SpringToken => ({
  k, d, ms, css: springCurve(k, d), fallback, use,
})

export const SPRING: Record<SpringName, SpringToken> = {
  snap: mk(1400, 67, 220, 'cubic-bezier(.2,.8,.2,1)', 'presses, knobs, tab blob, selection'),
  default: mk(700, 48, 560, 'cubic-bezier(.22,1,.36,1)', 'sheets, cards, toasts, Paused separation'),
  gentle: mk(300, 31, 700, 'cubic-bezier(.22,1,.36,1)', 'pages, bars, wordmark rise, digits'),
  bouncy: mk(1400, 40, 640, 'cubic-bezier(.34,1.56,.64,1)', 'badges and the กริ๊ง! bump only'),
  effect: mk(1600, 80, 300, 'cubic-bezier(.2,0,0,1)', 'colour, fade'),
}

/** Tween durations (ms). `instant/fast/base/slow/hero` kept for older imports. */
export const DUR = {
  xs: 100, s: 150, m: 250, l: 400, xl: 600,
  instant: 100, fast: 200, base: 320, slow: 500, hero: 900,
  /** launch: full first-open sequence; resume: the short one on app resume / Live switch */
  launch: 2600, resume: 1600,
} as const

export const EASE = {
  standard: 'cubic-bezier(.2,0,0,1)',
  decel: 'cubic-bezier(0,0,0,1)', // enters, counts
  accel: 'cubic-bezier(.3,0,1,1)', // exits
  out: 'cubic-bezier(.22,1,.36,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
} as const

export const STAGGER = { base: 30, list: 40, max: 8, digit: 40, wave: 22 } as const
export const PRESS = { scale: 0.96, key: 0.92 } as const

/** Depth layers: translateZ / blur radius of the shadow (px). */
export const DEPTH = {
  0: { z: 0, shadow: 'none' },
  1: { z: 8, shadow: '0 8px 24px -12px rgba(0,0,0,.55)' },
  2: { z: 24, shadow: '0 24px 48px -20px rgba(0,0,0,.65)' },
  3: { z: 64, shadow: '0 64px 96px -32px rgba(0,0,0,.75)' },
} as const

export const PARALLAX = { bg: 0.3, mid: 0.6, fg: 1 } as const
export const TILT = { maxDeg: 4, perspective: 900 } as const
export const GLOW_BUDGET = 3

/** The กริ๊ง! bump choreography (launch, Live switch and the venue bump share it). */
export const BUMP = {
  travel: 62, // px each ring travels to meet (36 in the compact profile hero)
  travelCompact: 36,
  ringMs: SPRING.bouncy.ms,
  lensMs: 250,
  sparkMs: 900,
  sparkRotate: 60,
  waveStagger: STAGGER.wave,
  /** second bell strike, ms after the first (E6 → B6) */
  bellGap: 90,
  /** when the rings make contact, ms after start */
  contact: 420,
} as const

/** Haptic map — one meaning each (patterns in ms, see src/lib/haptics.ts). */
export const HAPTIC = {
  selection: [6],
  light: [10],
  medium: [20],
  heavy: [40],
  kring: [10, 70, 20],
  success: [10, 40, 20],
  error: [30, 40, 30, 40, 30],
  arrival: [30, 60, 30],
} as const

export function prefersReducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

let linearOk: boolean | null = null
function supportsLinear(): boolean {
  if (linearOk !== null) return linearOk
  try {
    linearOk = typeof CSS !== 'undefined' && !!CSS.supports?.('transition-timing-function', 'linear(0, 1)')
  } catch {
    linearOk = false
  }
  return linearOk
}

/** Easing string for a spring, with the cubic-bezier fallback where linear() is unsupported. */
export function springEase(name: SpringName): string {
  const s = SPRING[name]
  return supportsLinear() ? s.css : s.fallback
}

/** `transform 640ms linear(...)` — reduced motion becomes a 150 ms fade-friendly tween. */
export function springTransition(prop: string | string[], name: SpringName = 'default', delayMs = 0): string {
  const props = Array.isArray(prop) ? prop : [prop]
  if (prefersReducedMotion()) return props.map((p) => `${p} ${DUR.s}ms ${EASE.standard}`).join(', ')
  return props.map((p) => `${p} ${SPRING[name].ms}ms ${springEase(name)}${delayMs ? ` ${delayMs}ms` : ''}`).join(', ')
}

/** Writes the linear() spring curves into :root custom properties (index.css carries the fallbacks). */
export function installMotionVars(root: HTMLElement | null = typeof document !== 'undefined' ? document.documentElement : null): void {
  if (!root || !supportsLinear()) return
  ;(Object.keys(SPRING) as SpringName[]).forEach((n) => {
    root.style.setProperty(`--spring-${n}`, SPRING[n].css)
  })
}
