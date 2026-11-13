import { playSfx, registerKringHaptic, type KringVariant, type SfxName } from './sfx'
import { coinBurst } from './fx'

export type HapticPattern =
  | 'tap'
  | 'select'
  | 'sheet'
  | 'clink'
  | 'success'
  | 'warning'
  | 'error'
  | 'combo'
  | 'jackpot'
  | 'kring'
  | 'light'
  | 'medium'
  | 'heavy'

/**
 * KRING T2 · haptics for the Ching sound logo, one sharp pulse per ching (Android haptics UX: clear, short, timed to
 * the audio — no buzz). [seconds after contact, pulse ms], from the approved sound board (concept A).
 */
export const KRING_HAPTICS: Record<KringVariant, ReadonlyArray<readonly [number, number]>> = {
  launch: [[0, 14], [0.075, 8], [0.34, 5], [0.47, 6]],
  golive: [[0, 12], [0.06, 7], [0.24, 5], [0.33, 5]],
  resume: [[0, 8]],
  release: [[0, 12], [0.06, 7], [0.2, 4], [0.245, 4], [0.29, 6]],
}
/** [[t, ms], …] → navigator.vibrate pattern (on, off, on, …) */
export function hapPattern(haps: ReadonlyArray<readonly [number, number]>): number[] {
  const p: number[] = []
  let t = 0
  haps.forEach(([at, ms], i) => {
    const s = Math.round(at * 1000)
    if (i) p.push(Math.max(0, s - t))
    p.push(ms)
    t = s + ms
  })
  return p
}
/** the Ching's haptic for one cut (no sound — `playKring` in sfx.ts rings and calls this) */
export function kringHaptic(variant: KringVariant): boolean {
  try {
    if (!canHaptic()) return false
    // the cold-start Launch plays before any tap: browsers refuse (and log) a vibrate without a user gesture
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
    if (ua && !ua.hasBeenActive) return false
    return navigator.vibrate(hapPattern(KRING_HAPTICS[variant]))
  } catch {
    return false
  }
}
registerKringHaptic(kringHaptic)

export const HAPTIC_PATTERNS: Record<HapticPattern, number | number[]> = {
  tap: 18,
  select: 10,
  sheet: 14,
  clink: [28, 35, 55],
  success: [24, 30, 48],
  warning: [30, 40, 30],
  error: [45, 30, 45, 30, 60],
  combo: [30, 25, 45, 25, 80],
  jackpot: [55, 30, 65, 30, 95, 40, 140],
  /** กริ๊ง! bump (KRING T2): the Go Live cut of the Ching — one pulse per ching */
  kring: hapPattern(KRING_HAPTICS.golive),
  light: 10,
  medium: 20,
  /** going Paused: one heavy 40 ms, no sound */
  heavy: 40,
}

const HAPTICS_KEY = 'chon_haptics_enabled'
const REDUCED_MOTION_KEY = 'chon_reduced_motion'

export function isHapticsEnabled(): boolean {
  try {
    return window.localStorage.getItem(HAPTICS_KEY) !== '0'
  } catch {
    return true
  }
}

export function setHapticsEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(HAPTICS_KEY, on ? '1' : '0')
  } catch {
    // ignore
  }
}

export function isReducedMotionEnabled(): boolean {
  try {
    return window.localStorage.getItem(REDUCED_MOTION_KEY) === '1'
  } catch {
    return false
  }
}

export function setReducedMotionEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(REDUCED_MOTION_KEY, on ? '1' : '0')
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.reduceMotion = on ? 'true' : 'false'
    }
  } catch {
    // ignore
  }
}

export function canHaptic(): boolean {
  try {
    if (!isHapticsEnabled() || isReducedMotionEnabled()) return false
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return false
    }
    return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
  } catch {
    return false
  }
}

/** UX-P6 policy: light taps, selections and sheet moves are SILENT (the founder found the constant buzz on back/tab
 *  navigation annoying). Vibration is reserved for moments that mean something — clink, success, combo, jackpot,
 *  warning, error — and each of those is paired with a short synthesized sound (lib/sfx.ts). */
const SILENT: ReadonlySet<HapticPattern> = new Set(['tap', 'select', 'sheet'])
/* `kring` rings the Ching (sfx.ts, Go Live cut); light/medium/heavy are touch-only (no sound). */
const SOUND_FOR: Partial<Record<HapticPattern, SfxName>> = { kring: 'kring', clink: 'clink', success: 'success', combo: 'combo', jackpot: 'jackpot', warning: 'warning', error: 'error' }

export function triggerHaptic(pattern: HapticPattern = 'tap', opts: { burst?: boolean; sound?: boolean } = {}): boolean {
  try {
    if (SILENT.has(pattern)) return false
    const sound = SOUND_FOR[pattern]
    if (sound && opts.sound !== false) playSfx(sound)
    // Luxury moment: coins radiate from the control that was just tapped (gift send, clink, jackpot).
    // Atlas integration: callers pass `{ burst: false }` when no coins are credited (e.g. a Clink HOLD — no coin rain).
    if (opts.burst === false) {
      // sound + vibration only
    } else if (pattern === 'clink' || pattern === 'combo') coinBurst(typeof document !== 'undefined' ? document.activeElement : null)
    else if (pattern === 'jackpot') coinBurst(typeof document !== 'undefined' ? document.activeElement : null, { jackpot: true })
    if (!canHaptic()) return false
    return navigator.vibrate(HAPTIC_PATTERNS[pattern])
  } catch {
    // Ignore environments where vibration is restricted
  }
  return false
}

export const haptic = triggerHaptic

