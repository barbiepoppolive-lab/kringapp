import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { triggerHaptic } from '../../lib/haptics'

/**
 * Depth build · Living icons — small React wrappers around the CSS in src/index.css (section "D9").
 * Every motion here has a job (feedback, status, attention, brand) and is ONE-SHOT unless a condition is true
 * (LiveDot while live, ScanLine while scanning). Nothing animates at rest. Reduced motion → static (CSS).
 *
 * Exports and props (all optional unless marked *):
 * - LiveDot       { live = true, tone: 'green' | 'red' = 'green', className, label }       breathes 2.4 s while live
 * - HeartButton   { on*, onToggle*(next), label = 'Save', size = 32, className, testId }  fill + pop + 6 particles on save
 * - VerifiedCheck { size = 16, draw: 'session' | 'always' | 'never' = 'session', delayMs = 0, label = 'Verified', className }
 *                 'session' draws on only for checks mounted in the first ~2 s of the first visit this session
 *                 (sessionStorage `chon_vcheck_drawn_v1`); 'always' draws on every mount (e.g. photo just chosen)
 * - BellIcon      { count = 0, size = 22, label, className }       wiggles + badge scales in each time `count` rises
 * - StoryRing     { seen = false, size = 46, onOpen, label*, children (face: <img> or nothing), className, testId }
 *                 gradient ring turns once (800 ms) on tap, then calls onOpen
 * - PinDrop       { dropped*, size = 24, className }               drops + shadow squash when `dropped` turns true
 * - SosHold       { onComplete*, holdMs = 1200, label = 'SOS', doneLabel, ariaLabel, size = 56, className, testId }
 *                 ring fills while pressed (pointer or Enter/Space held); release early = cancel; `warning` haptic on done
 * - ScanLine      { active*, size = 72, className, children }       line sweeps only while `active`
 * - ShieldCheck   { checked*, size = 22, className }               check draws on when `checked` turns true
 * - EscrowLock    { released*, heldLabel*, releasedLabel*, treat = '🧋', size = 22, className, testId }
 * - GiftToken     { emoji*, tint: 'violet'|'gold'|'pink'|'green'|'blue' = 'violet', size = 52, popKey, className, label }
 *                 3D-ish token (gradient + rim + contact shadow); pops (900 ms) whenever `popKey` changes (not on mount)
 * - Coin3D        { size = 26, symbol = '฿', spinKey, spinOnMount = false, className, label }
 *                 front / back / edge coin; spins once whenever `spinKey` changes
 */

type Tint = 'violet' | 'gold' | 'pink' | 'green' | 'blue'

/** Returns a counter that increments every time `value` changes after mount (0 on first render). */
function useChangeKey(value: unknown): number {
  const first = useRef(true)
  const [k, setK] = useState(0)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setK((n) => n + 1)
  }, [value])
  return k
}

/** One-shot class driver: `play()` (re)starts the class for `ms` without remounting (keeps focus on buttons). */
function useReplay(ms: number): [boolean, () => void] {
  const [on, setOn] = useState(false)
  const raf = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (raf.current) window.cancelAnimationFrame(raf.current)
    if (timer.current) clearTimeout(timer.current)
    raf.current = 0
    timer.current = null
  }
  const play = useCallback(() => {
    clear()
    setOn(false)
    raf.current = window.requestAnimationFrame(() => {
      raf.current = 0
      setOn(true)
      timer.current = setTimeout(() => setOn(false), ms + 40)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms])
  useEffect(() => clear, [])
  return [on, play]
}

/** Plays a one-shot class each time `flag` turns true after mount. */
function useOnTrue(flag: boolean, ms: number): boolean {
  const [on, play] = useReplay(ms)
  const prev = useRef(flag)
  useEffect(() => {
    if (flag && !prev.current) play()
    prev.current = flag
  }, [flag, play])
  return on
}

/* ---------------- LiveDot ---------------- */
export function LiveDot({ live = true, tone = 'green', className = '', label }: { live?: boolean; tone?: 'green' | 'red'; className?: string; label?: string }) {
  return (
    <span
      className={`ux-live-dot${tone === 'green' ? ' is-green' : ''}${live ? '' : ' is-off'} ${className}`.trim()}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  )
}

/* ---------------- HeartButton ---------------- */
const HEART_PARTICLES: ReadonlyArray<[number, number]> = [[-14, -10], [14, -12], [0, -18], [-16, 8], [16, 6], [0, 16]]

export function HeartButton({
  on,
  onToggle,
  label = 'Save',
  size = 32,
  className = '',
  testId,
}: {
  on: boolean
  onToggle: (next: boolean) => void
  label?: string
  size?: number
  className?: string
  testId?: string
}) {
  const [popping, pop] = useReplay(420)
  return (
    <button
      type="button"
      className={`ux-heart${on ? ' is-on' : ''}${popping && on ? ' is-pop' : ''} ${className}`.trim()}
      style={{ width: size, height: size, minWidth: size, minHeight: size }}
      aria-pressed={on}
      aria-label={label}
      data-testid={testId}
      onClick={(e) => {
        e.stopPropagation()
        const next = !on
        if (next) {
          pop()
          triggerHaptic('select')
        }
        onToggle(next)
      }}
    >
      {HEART_PARTICLES.map(([dx, dy], i) => (
        <i key={i} aria-hidden="true" style={{ '--dx': `${dx}px`, '--dy': `${dy}px` } as CSSProperties} />
      ))}
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0 1 12 6a5.5 5.5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z" />
      </svg>
    </button>
  )
}

/* ---------------- VerifiedCheck ---------------- */
const VCHECK_KEY = 'chon_vcheck_drawn_v1'
let vcheckWindowStart = 0
function shouldDrawVerified(): boolean {
  try {
    if (window.sessionStorage.getItem(VCHECK_KEY) === '1') return false
  } catch {
    return false
  }
  const now = Date.now()
  if (!vcheckWindowStart) {
    vcheckWindowStart = now
    setTimeout(() => {
      try {
        window.sessionStorage.setItem(VCHECK_KEY, '1')
      } catch {
        // ignore
      }
    }, 2000)
  }
  return now - vcheckWindowStart < 2000
}

export function VerifiedCheck({
  size = 16,
  draw = 'session',
  delayMs = 0,
  label = 'Verified',
  className = '',
}: {
  size?: number
  draw?: 'session' | 'always' | 'never'
  delayMs?: number
  label?: string
  className?: string
}) {
  const [drawing] = useState(() => (draw === 'always' ? true : draw === 'session' ? shouldDrawVerified() : false))
  return (
    <span
      className={`ux-vcheck${drawing ? ' is-draw' : ''} ${className}`.trim()}
      style={{ '--vc': `${size}px`, '--vc-delay': `${delayMs}ms` } as CSSProperties}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12l5 5 9-10" />
      </svg>
    </span>
  )
}

/* ---------------- BellIcon ---------------- */
export function BellIcon({ count = 0, size = 22, label, className = '' }: { count?: number; size?: number; label?: string; className?: string }) {
  const prev = useRef(count)
  const [wiggleKey, setWiggleKey] = useState(0)
  useEffect(() => {
    if (count > prev.current) setWiggleKey((k) => k + 1)
    prev.current = count
  }, [count])
  return (
    <span
      key={wiggleKey}
      className={`ux-bell${wiggleKey > 0 ? ' is-wiggle' : ''} ${className}`.trim()}
      style={{ '--bell': `${size}px` } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4zM10 20a2 2 0 0 0 4 0" />
      </svg>
      {count > 0 ? <span className="ux-tab-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span> : null}
    </span>
  )
}

/* ---------------- StoryRing ---------------- */
export function StoryRing({
  seen = false,
  size = 46,
  onOpen,
  label,
  children,
  className = '',
  testId,
}: {
  seen?: boolean
  size?: number
  onOpen?: () => void
  label: string
  children?: ReactNode
  className?: string
  testId?: string
}) {
  const [spinning, spin] = useReplay(800)
  return (
    <button
      type="button"
      className={`ux-story-ring${seen ? ' is-seen' : ''}${spinning ? ' ux-ring-spin' : ''} ${className}`.trim()}
      style={{ '--story-ring': `${size}px` } as CSSProperties}
      aria-label={label}
      data-testid={testId}
      onClick={() => {
        spin()
        triggerHaptic('select')
        onOpen?.()
      }}
    >
      <span className="ux-story-face">{children}</span>
    </button>
  )
}

/* ---------------- PinDrop ---------------- */
export function PinDrop({ dropped, size = 24, className = '' }: { dropped: boolean; size?: number; className?: string }) {
  const playing = useOnTrue(dropped, 300)
  return (
    <span className={`ux-pin${playing ? ' ux-pin-drop' : ''} ${className}`.trim()} style={{ '--pin': `${size}px` } as CSSProperties} aria-hidden="true">
      <span className="ux-pin-shadow" />
      <svg viewBox="0 0 24 24">
        <path d="M12 22s7-7 7-12a7 7 0 0 0-14 0c0 5 7 12 7 12z" />
        <circle cx="12" cy="10" r="2.5" />
      </svg>
    </span>
  )
}

/* ---------------- SosHold ---------------- */
export function SosHold({
  onComplete,
  holdMs = 1200,
  label = 'SOS',
  doneLabel,
  ariaLabel,
  size = 56,
  className = '',
  testId,
}: {
  onComplete: () => void
  holdMs?: number
  label?: ReactNode
  doneLabel?: ReactNode
  ariaLabel?: string
  size?: number
  className?: string
  testId?: string
}) {
  const [holding, setHolding] = useState(false)
  const [done, setDone] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const start = () => {
    if (done || timer.current) return
    setHolding(true)
    timer.current = setTimeout(() => {
      timer.current = null
      setDone(true)
      triggerHaptic('warning')
      onComplete()
    }, holdMs)
  }
  const stop = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    setHolding(false)
  }
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])
  return (
    <button
      type="button"
      className={`ux-sos-hold${holding ? ' is-holding' : ''}${done ? ' is-done' : ''} ${className}`.trim()}
      style={{ '--sos': `${size}px`, '--sos-ms': `${holdMs}ms` } as CSSProperties}
      aria-label={ariaLabel ?? (typeof label === 'string' ? `${label} — press and hold` : 'Press and hold')}
      data-testid={testId}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === 'Enter' || e.key === ' ') stop()
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="16" pathLength={100} />
      </svg>
      <span>{done && doneLabel ? doneLabel : label}</span>
    </button>
  )
}

/* ---------------- ScanLine ---------------- */
export function ScanLine({ active, size = 72, className = '', children }: { active: boolean; size?: number; className?: string; children?: ReactNode }) {
  return (
    <span className={`ux-scan ${className}`.trim()} style={{ '--scan': `${size}px` } as CSSProperties} aria-hidden={children ? undefined : true}>
      {children}
      {active ? <span className="ux-scan-line" aria-hidden="true" /> : null}
    </span>
  )
}

/* ---------------- ShieldCheck ---------------- */
export function ShieldCheck({ checked, size = 22, className = '' }: { checked: boolean; size?: number; className?: string }) {
  const drawing = useOnTrue(checked, 300)
  return (
    <svg
      className={`ux-shield-check${checked ? ' is-checked' : ''}${drawing ? ' is-draw' : ''} ${className}`.trim()}
      style={{ '--shield': `${size}px` } as CSSProperties}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" />
      <path className="chk" d="M8.5 12.5l2.5 2.5 4.5-5" />
    </svg>
  )
}

/* ---------------- EscrowLock ---------------- */
export function EscrowLock({
  released,
  heldLabel,
  releasedLabel,
  treat = '🧋',
  size = 22,
  className = '',
  testId,
}: {
  released: boolean
  heldLabel: ReactNode
  releasedLabel: ReactNode
  treat?: string
  size?: number
  className?: string
  testId?: string
}) {
  return (
    <span
      className={`ux-lock${released ? ' is-open' : ''} ${className}`.trim()}
      style={{ '--lock': `${size}px` } as CSSProperties}
      data-testid={testId}
      data-state={released ? 'released' : 'held'}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path className="shackle" d="M8 10V7a4 4 0 0 1 8 0v3" />
        <rect x="5" y="10" width="14" height="10" rx="2" />
      </svg>
      <span>{released ? releasedLabel : heldLabel}</span>
      <span className="ux-lock-treat" aria-hidden="true">{treat}</span>
    </span>
  )
}

/* ---------------- GiftToken ---------------- */
export function GiftToken({
  emoji,
  tint = 'violet',
  size = 52,
  popKey,
  className = '',
  label,
}: {
  emoji: string
  tint?: Tint
  size?: number
  popKey?: string | number
  className?: string
  label?: string
}) {
  const k = useChangeKey(popKey)
  return (
    <span
      key={k}
      className={`ux-token is-${tint}${k > 0 ? ' ux-gift-pop' : ''} ${className}`.trim()}
      style={{ '--tok': `${size}px` } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {emoji}
    </span>
  )
}

/* ---------------- Coin3D ---------------- */
export function Coin3D({
  size = 26,
  symbol = '฿',
  spinKey,
  spinOnMount = false,
  className = '',
  label,
}: {
  size?: number
  symbol?: string
  spinKey?: string | number
  spinOnMount?: boolean
  className?: string
  label?: string
}) {
  const k = useChangeKey(spinKey)
  const spinning = k > 0 || spinOnMount
  return (
    <span
      key={k}
      className={`ux-coin3d${spinning ? ' is-spin' : ''} ${className}`.trim()}
      style={{ '--coin': `${size}px` } as CSSProperties}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="ux-coin3d-edge" />
      <span className="ux-coin3d-face is-back">{symbol}</span>
      <span className="ux-coin3d-face">{symbol}</span>
    </span>
  )
}
