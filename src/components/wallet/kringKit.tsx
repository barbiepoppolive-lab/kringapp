import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { triggerHaptic } from '../../lib/haptics'
import { useBackEntry } from '../../lib/backStack'
import { formatBahtValue } from '../../lib/money'
import { prefersReducedMotion, useTr } from '../vip/walletKit'
import '../../styles/wallet.css'

/**
 * K5 · Kring wallet kit — the small pieces every Kring money screen shares (Wallet, Top up, Earnings, Withdraw, Agency,
 * Safety). Display only: nothing in this file reads or writes the ledger.
 *
 *  RollingBaht   big baht figure whose digits roll one column at a time (from 0 on first show, then old → new)
 *  RolePill      "Traveller ▾" — asks the profile's role sheet to open (`kring:open-roles`), with a local fallback
 *  KSheet        light bottom sheet (portal, scrim, spring rise) used for the small explainers and the role fallback
 *  PinPad        6-digit pad: keys spring to .94, dots pop, wrong PIN → shake ±8 px ×4 + red dots + error haptic
 *  ExpiryRing    SVG ring that drains linearly with the real time left
 *  TierRing      agency tier progress ring (draws on mount)
 *  ThaiSlip      the Thai bank-style e-slip "โอนเงินสำเร็จ" + Save (PNG) / Share
 *  thaiDate()    "21 ต.ค. 69 · 19:42"
 */

/* ------------------------------------------------------------------------------------------------ */
/* RollingBaht                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

/**
 * Each digit is a reel (CSS pseudo-content 0–9) translated to its value; columns start 40 ms apart from the right
 * so the roll reads "one column at a time". textContent holds only the sr-only copy, like ui/Odometer.
 * `decimals` shows satang smaller (".00"), as on the B6 card.
 */
export function RollingBaht({
  value,
  decimals = false,
  fromZero = true,
  className = '',
  testId,
  symbol = true,
}: {
  /** baht */
  value: number
  decimals?: boolean
  /** first paint rolls up from ฿0 (the B6 / B8 entrance) */
  fromZero?: boolean
  className?: string
  testId?: string
  symbol?: boolean
}) {
  const safe = Number.isFinite(value) ? value : 0
  const [shown, setShown] = useState(() => (fromZero && !prefersReducedMotion() ? 0 : safe))
  useEffect(() => {
    if (shown === safe) return
    const id = window.requestAnimationFrame(() => setShown(safe))
    return () => window.cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safe])
  const target = formatBahtValue(safe, { decimals, symbol })
  const now = formatBahtValue(shown, { decimals, symbol })
  // pad the shown string to the target's shape so the columns line up while rolling up from 0
  const chars = target.split('')
  const nowDigits = now.replace(/[^0-9]/g, '')
  const targetDigits = target.replace(/[^0-9]/g, '')
  const padded = nowDigits.padStart(targetDigits.length, '0').slice(-targetDigits.length)
  let di = 0
  const total = targetDigits.length
  const intLen = decimals ? total - 2 : total
  // KRING FIX3 · Marco 4: never "฿000.00" mid-roll — leading zero reels show a blank cell (index −1 on the strip), and a
  // thousands comma hides while every digit before it is blank. The last integer digit always shows.
  let lead = 0
  while (lead < intLen - 1 && padded[lead] === '0') lead += 1
  let seen = 0
  return (
    <span className={`kw-roll ${className}`.trim()} data-testid={testId}>
      <span className="kw-roll-reels" aria-hidden="true">
        {chars.map((c, i) => {
          if (!/[0-9]/.test(c)) {
            const isDot = c === '.'
            const hide = c === ',' && seen <= lead && seen > 0
            return (
              <span key={`s${i}`} className={`kw-roll-s${c === '฿' ? ' is-sym' : ''}${isDot ? ' is-dec' : ''}${hide ? ' is-blank' : ''}`}>
                {c}
              </span>
            )
          }
          const idx = di
          di += 1
          seen = di
          const d = idx < lead ? -1 : Number(padded[idx] ?? c)
          const fromRight = total - 1 - idx
          const small = idx >= intLen
          return (
            <span
              key={`d${fromRight}`}
              className={`kw-roll-d${small ? ' is-dec' : ''}${idx < lead ? ' is-blank' : ''}`}
              style={{ '--d': d, '--i': fromRight } as CSSProperties}
            />
          )
        })}
      </span>
      <span className="sr-only">{target}</span>
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* KSheet                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

export function KSheet({
  open,
  onClose,
  title,
  children,
  testId,
  label,
  tone = 'default',
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  testId?: string
  label?: string
  tone?: 'default' | 'red'
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useBackEntry(open, () => closeRef.current(), { id: testId || 'ksheet', priority: 100 })
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault()
        closeRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])
  if (!open || typeof document === 'undefined') return null
  return createPortal(
    <div className={`kw-sheet-wrap is-${tone}`} data-testid={testId}>
      <button type="button" className="kw-scrim" aria-label="Close" tabIndex={-1} onClick={() => closeRef.current()} />
      <div className="kw-sheet" role="dialog" aria-modal="true" aria-label={label ?? (typeof title === 'string' ? title : undefined)}>
        <i className="kw-grab" aria-hidden="true" />
        {title ? <h3 className="kw-sheet-t">{title}</h3> : null}
        {children}
      </div>
    </div>,
    document.body,
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* Roles                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

export type KringRole = 'traveller' | 'local' | 'agency'
/** wallet modes keep their old internal ids ('host' = Local) so the hub and the tests stay unchanged */
export type WalletMode = 'traveller' | 'host' | 'agency'
export const modeToRole = (m: WalletMode): KringRole => (m === 'host' ? 'local' : m)
export const roleToMode = (r: string | undefined | null): WalletMode | null =>
  r === 'local' || r === 'host' ? 'host' : r === 'agency' ? 'agency' : r === 'traveller' || r === 'guest' ? 'traveller' : null

export const OPEN_ROLES_EVENT = 'kring:open-roles'
export const ROLE_CHANGED_EVENT = 'kring:role-changed'
export interface OpenRolesDetail {
  source: 'wallet'
  current: KringRole
  /** the profile's role sheet (K1 · MyProfile) sets this to true synchronously when it opens */
  handled: boolean
}

/**
 * Ask My profile's role sheet to open. Returns true when a listener took it (it sets `detail.handled = true`, or
 * calls preventDefault()); false → the caller shows its own fallback sheet.
 */
export function requestRoleSheet(current: KringRole): boolean {
  if (typeof window === 'undefined') return false
  const detail: OpenRolesDetail = { source: 'wallet', current, handled: false }
  const ev = new CustomEvent<OpenRolesDetail>(OPEN_ROLES_EVENT, { detail, cancelable: true })
  const notCancelled = window.dispatchEvent(ev)
  return detail.handled || !notCancelled
}

/** Announce a role switch made from the Wallet fallback so the profile pill / shell can follow. */
export function announceRole(role: KringRole) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(ROLE_CHANGED_EVENT, { detail: { role, source: 'wallet' } }))
}

export function useRoleLabels() {
  const tr = useTr()
  return useMemo(
    () => ({
      traveller: { icon: '🧳', name: tr('Traveller', 'ผู้จอง'), sub: tr('book experiences, Price Check', 'จองประสบการณ์ เช็คราคา') },
      local: { icon: '🌿', name: tr('Local', 'โลคอล'), sub: tr('show travellers around, earn', 'พาเที่ยว มีรายได้') },
      agency: { icon: '🏢', name: tr('Agency', 'เอเจนซี่'), sub: tr('manage your Locals', 'ดูแลโลคอลของคุณ') },
    }),
    [tr],
  )
}

export function RolePill({ mode, onOpen, testId = 'wallet-role-pill' }: { mode: WalletMode; onOpen: () => void; testId?: string }) {
  const labels = useRoleLabels()
  const role = modeToRole(mode)
  const [flip, setFlip] = useState(0)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setFlip((n) => n + 1)
  }, [role])
  return (
    <button
      type="button"
      className="kw-role m-press"
      data-testid={testId}
      data-role={role}
      aria-haspopup="dialog"
      aria-label={`${labels[role].name} · switch role`}
      onClick={() => {
        triggerHaptic('tap')
        onOpen()
      }}
    >
      <span key={flip} className="kw-role-l">
        {labels[role].name}
      </span>
      <svg viewBox="0 0 12 12" aria-hidden="true">
        <path d="M3 4.5l3 3 3-3" />
      </svg>
    </button>
  )
}

/** The B6 role sheet — used only when My profile's sheet is not mounted. */
export function RoleSheetFallback({
  open,
  onClose,
  mode,
  onPick,
}: {
  open: boolean
  onClose: () => void
  mode: WalletMode
  onPick: (m: WalletMode) => void
}) {
  const tr = useTr()
  const labels = useRoleLabels()
  const order: KringRole[] = ['traveller', 'local', 'agency']
  const idx = order.indexOf(modeToRole(mode))
  return (
    <KSheet open={open} onClose={onClose} title={tr('Switch role', 'สลับบทบาท')} testId="wallet-role-sheet">
      <p className="kw-sub">{tr('One account · one ID check ✓ · switch any time', 'บัญชีเดียว · ยืนยันตัวตนครั้งเดียว ✓ · สลับได้ตลอด')}</p>
      <div className="kw-roles" role="radiogroup" aria-label={tr('Role', 'บทบาท')} style={{ '--i': Math.max(0, idx) } as CSSProperties}>
        <i className="kw-roles-ring" aria-hidden="true" />
        {order.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={modeToRole(mode) === r}
            data-testid={`wallet-role-${r}`}
            className="kw-roles-row m-press"
            onClick={() => {
              triggerHaptic('select')
              onPick(roleToMode(r) ?? 'traveller')
            }}
          >
            <span className="kw-roles-ic" aria-hidden="true">
              {labels[r].icon}
            </span>
            <span className="kw-grow">
              <b>{labels[r].name}</b>
              <small>{labels[r].sub}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="kw-fine">{tr('You can’t book yourself · no agency commission on your own bookings', 'จองตัวเองไม่ได้ · ไม่มีค่าคอมเอเจนซี่จากการจองของตัวเอง')}</p>
    </KSheet>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* PIN                                                                                               */
/* ------------------------------------------------------------------------------------------------ */

const PIN_KEY = 'kring_payout_pin_v1'
const PIN_LOCK_KEY = 'kring_payout_pin_lock_v1'
export const PIN_LEN = 6
export const PIN_MAX_TRIES = 5
export const PIN_LOCK_MS = 5 * 60 * 1000

/** FNV-1a over salt+pin. A device-level gate only — TODO(Argon): the payout PIN is verified server-side. */
function pinHash(pin: string, salt: string): string {
  let h = 0x811c9dc5
  const s = `${salt}:${pin}:kring`
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}
interface StoredPin {
  salt: string
  hash: string
}
export function hasPayoutPin(): boolean {
  try {
    const raw = window.localStorage.getItem(PIN_KEY)
    const v = raw ? (JSON.parse(raw) as Partial<StoredPin>) : null
    return Boolean(v && typeof v.hash === 'string' && typeof v.salt === 'string')
  } catch {
    return false
  }
}
export function savePayoutPin(pin: string) {
  const salt = Math.random().toString(36).slice(2, 10)
  try {
    window.localStorage.setItem(PIN_KEY, JSON.stringify({ salt, hash: pinHash(pin, salt) }))
    window.localStorage.removeItem(PIN_LOCK_KEY)
  } catch {
    // storage blocked: the PIN is asked again next time
  }
}
export function checkPayoutPin(pin: string): boolean {
  try {
    const raw = window.localStorage.getItem(PIN_KEY)
    const v = raw ? (JSON.parse(raw) as StoredPin) : null
    return Boolean(v && pinHash(pin, v.salt) === v.hash)
  } catch {
    return false
  }
}
interface PinLock {
  tries: number
  until: number
}
export function readPinLock(): PinLock {
  try {
    const raw = window.localStorage.getItem(PIN_LOCK_KEY)
    const v = raw ? (JSON.parse(raw) as Partial<PinLock>) : null
    return { tries: Number(v?.tries) || 0, until: Number(v?.until) || 0 }
  } catch {
    return { tries: 0, until: 0 }
  }
}
function writePinLock(v: PinLock) {
  try {
    window.localStorage.setItem(PIN_LOCK_KEY, JSON.stringify(v))
  } catch {
    // ignore
  }
}

export type PinStage = 'create' | 'confirm' | 'enter'

/**
 * The payout PIN pad. `mode='enter'` checks the saved PIN; when none exists it walks create → confirm first.
 * Calls `onSuccess()` exactly once. Wrong PIN / mismatch → shake, red dots, error haptic, tries left.
 */
export function PinPad({ onSuccess, subtitle, testId = 'wallet-pin-pad' }: { onSuccess: () => void; subtitle?: ReactNode; testId?: string }) {
  const tr = useTr()
  const [stage, setStage] = useState<PinStage>(() => (hasPayoutPin() ? 'enter' : 'create'))
  const [pin, setPin] = useState('')
  const [first, setFirst] = useState('')
  const [bad, setBad] = useState(0)
  const [ok, setOk] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [lock, setLock] = useState<PinLock>(() => readPinLock())
  const done = useRef(false)
  const [pressed, setPressed] = useState<string | null>(null)
  const locked = lock.until > Date.now()

  useEffect(() => {
    if (!locked) return
    const id = window.setInterval(() => {
      const l = readPinLock()
      setLock(l)
      if (l.until <= Date.now()) window.clearInterval(id)
    }, 1000)
    return () => window.clearInterval(id)
  }, [locked])

  const fail = (text: string, after?: () => void) => {
    triggerHaptic('error')
    setBad((n) => n + 1)
    setMsg(text)
    window.setTimeout(() => {
      setPin('')
      after?.()
    }, prefersReducedMotion() ? 600 : 420)
  }

  const complete = (value: string) => {
    if (stage === 'create') {
      setFirst(value)
      setStage('confirm')
      setMsg(null)
      window.setTimeout(() => setPin(''), 160)
      return
    }
    if (stage === 'confirm') {
      if (value !== first) {
        // Marco 9: the title stays "Enter it again" while the dots shake red; it goes back to "Create" only once the
        // shake is over and the dots have cleared (same frame), so the heading never flips mid-error.
        fail(tr('Those didn’t match. Start again.', 'ไม่ตรงกัน เริ่มใหม่อีกครั้ง'), () => {
          setStage('create')
          setFirst('')
        })
        return
      }
      savePayoutPin(value)
    } else if (!checkPayoutPin(value)) {
      const tries = lock.tries + 1
      const next: PinLock = tries >= PIN_MAX_TRIES ? { tries: 0, until: Date.now() + PIN_LOCK_MS } : { tries, until: 0 }
      writePinLock(next)
      setLock(next)
      fail(
        next.until
          ? tr('Too many tries. Wait 5 minutes.', 'ลองผิดหลายครั้ง รอ 5 นาที')
          : tr(`Wrong PIN · ${PIN_MAX_TRIES - tries} tries left`, `PIN ไม่ถูก · เหลืออีก ${PIN_MAX_TRIES - tries} ครั้ง`),
      )
      return
    } else {
      writePinLock({ tries: 0, until: 0 })
    }
    if (done.current) return
    done.current = true
    setOk(true)
    setMsg(null)
    triggerHaptic('success')
    window.setTimeout(onSuccess, prefersReducedMotion() ? 0 : 420)
  }

  const press = (d: string) => {
    if (locked || ok) return
    triggerHaptic('select')
    setPressed(d)
    window.setTimeout(() => setPressed((p) => (p === d ? null : p)), 140)
    if (d === '⌫') {
      setPin((p) => p.slice(0, -1))
      return
    }
    if (pin.length >= PIN_LEN) return
    const next = pin + d
    setPin(next)
    if (bad) setMsg(null)
    if (next.length === PIN_LEN) window.setTimeout(() => complete(next), 120)
  }

  // physical keyboard (desktop / tests)
  const pressRef = useRef(press)
  pressRef.current = press
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) pressRef.current(e.key)
      else if (e.key === 'Backspace') pressRef.current('⌫')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const title =
    stage === 'create' ? tr('Create a 6-digit payout PIN', 'ตั้ง PIN ถอนเงิน 6 หลัก') : stage === 'confirm' ? tr('Enter it again', 'ใส่อีกครั้ง') : tr('Enter your PIN', 'ใส่ PIN ของคุณ')

  return (
    <div className="kw-pin" data-testid={testId} data-stage={stage}>
      <b className="kw-pin-t">{title}</b>
      {subtitle ? <p className="kw-sub kw-c">{subtitle}</p> : null}
      <div
        key={bad}
        className={`kw-dots${bad ? ' is-bad' : ''}${ok ? ' is-ok' : ''}`}
        role="img"
        aria-label={tr(`${pin.length} of ${PIN_LEN} digits entered`, `ใส่แล้ว ${pin.length} จาก ${PIN_LEN} หลัก`)}
      >
        {Array.from({ length: PIN_LEN }).map((_, i) => (
          <i key={i} className={i < pin.length ? 'is-on' : ''} style={{ '--i': i } as CSSProperties} />
        ))}
        {ok ? (
          <span className="kw-pin-ok" aria-hidden="true">
            ✓
          </span>
        ) : null}
      </div>
      <p className={`kw-pin-msg${bad && msg ? ' is-bad' : ''}`} role="status" aria-live="polite">
        {locked ? tr('Locked for a few minutes', 'ล็อกไว้ชั่วครู่') : msg ?? ' '}
      </p>
      <div className="kw-keys">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((d, i) =>
          d ? (
            <button
              key={i}
              type="button"
              className={`kw-key${d === '⌫' ? ' is-fn' : ''}${pressed === d ? ' is-press' : ''}`}
              aria-label={d === '⌫' ? 'Delete digit' : d}
              disabled={locked || ok}
              onClick={() => press(d)}
            >
              {d}
            </button>
          ) : (
            <span key={i} />
          ),
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* Rings                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

/** Drains linearly; `left`/`total` in seconds. */
export function ExpiryRing({ left, total, size = 38, label }: { left: number; total: number; size?: number; label?: ReactNode }) {
  const r = 15
  const c = 2 * Math.PI * r
  const p = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0
  return (
    <span className={`kw-exp${p < 0.15 ? ' is-low' : ''}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 34 34" aria-hidden="true">
        <circle cx="17" cy="17" r={r} className="kw-exp-bg" />
        <circle cx="17" cy="17" r={r} transform="rotate(-90 17 17)" className="kw-exp-f" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - p) }} />
      </svg>
      {label ? <b>{label}</b> : null}
    </span>
  )
}

/** Agency tier ring: draws to `pct` (0–100) once on mount, 1.2 s. */
export function TierRing({ pct, top, bottom, size = 78 }: { pct: number; top: ReactNode; bottom: ReactNode; size?: number }) {
  const r = 30
  const c = 2 * Math.PI * r
  const [p, setP] = useState(() => (prefersReducedMotion() ? pct : 0))
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setP(pct))
    return () => window.cancelAnimationFrame(id)
  }, [pct])
  return (
    <span className="kw-tier" style={{ width: size, height: size }} role="img" aria-label={`${Math.round(pct)}%`}>
      <svg viewBox="0 0 74 74" aria-hidden="true">
        <defs>
          <linearGradient id="kwTierG" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="var(--kw-marigold-deep)" />
            <stop offset="1" stopColor="var(--kw-marigold-hi)" />
          </linearGradient>
        </defs>
        <circle cx="37" cy="37" r={r} className="kw-tier-bg" />
        <circle cx="37" cy="37" r={r} transform="rotate(-90 37 37)" className="kw-tier-f" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - Math.max(0, Math.min(100, p)) / 100) }} />
      </svg>
      <span className="kw-tier-in">
        <b>{top}</b>
        <small>{bottom}</small>
      </span>
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* Dates                                                                                             */
/* ------------------------------------------------------------------------------------------------ */

/** "21 ต.ค. 69 · 19:42" (Thai bank-slip style, Buddhist year) */
export function thaiDate(d: Date): string {
  let date = ''
  try {
    date = d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit', timeZone: 'Asia/Bangkok' })
  } catch {
    date = `${d.getDate()}/${d.getMonth() + 1}/${(d.getFullYear() + 543) % 100}`
  }
  // Bangkok wall clock (UTC+7), whatever the phone's zone
  const b = new Date(d.getTime() + 7 * 3600_000)
  return `${date} · ${String(b.getUTCHours()).padStart(2, '0')}:${String(b.getUTCMinutes()).padStart(2, '0')}`
}
/** "Fri 24 Oct" / "ศ. 24 ต.ค." */
export function shortDay(d: Date, th: boolean): string {
  try {
    return d.toLocaleDateString(th ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }).replace(',', '')
  } catch {
    return d.toDateString().slice(0, 10)
  }
}
/** Settlement day for a card payment made at `at` (3 days for Trusted Locals; 14 days for New Locals with < 5 bookings). */
export function cardSettleDate(at: number, isNewLocal = false): Date {
  const days = isNewLocal ? 14 : 3
  return new Date(at + days * 24 * 3600_000)
}

/* ------------------------------------------------------------------------------------------------ */
/* QR art (decorative until the gateway returns the EMVCo payload)                                   */
/* ------------------------------------------------------------------------------------------------ */

export function QrArt({ seed, className = 'kw-qr-svg' }: { seed: number; className?: string }) {
  const cells = useMemo(() => {
    const out: Array<[number, number]> = []
    let x = (Math.abs(Math.round(seed)) * 9301 + 49297) % 233280
    for (let r = 0; r < 25; r += 1) {
      for (let c = 0; c < 25; c += 1) {
        const inFinder = (r < 8 && c < 8) || (r < 8 && c > 16) || (r > 16 && c < 8)
        if (inFinder) continue
        x = (x * 9301 + 49297) % 233280
        if (x / 233280 > 0.52) out.push([r, c])
      }
    }
    return out
  }, [seed])
  const finder = (x: number, y: number) => (
    <g key={`f${x}${y}`}>
      <rect x={x} y={y} width={7} height={7} rx={1.4} className="kw-qr-ink" />
      <rect x={x + 1} y={y + 1} width={5} height={5} rx={1} className="kw-qr-paper" />
      <rect x={x + 2} y={y + 2} width={3} height={3} rx={0.6} className="kw-qr-ink" />
    </g>
  )
  return (
    <svg viewBox="0 0 25 25" className={className} aria-hidden="true" shapeRendering="crispEdges">
      <rect width={25} height={25} className="kw-qr-paper" />
      {cells.map(([r, c]) => (
        <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} className="kw-qr-ink" />
      ))}
      {finder(0, 0)}
      {finder(18, 0)}
      {finder(0, 18)}
    </svg>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* Thai e-slip                                                                                       */
/* ------------------------------------------------------------------------------------------------ */

export interface SlipData {
  kind: 'topup' | 'payout'
  amountThb: number
  feeThb: number
  from: string
  to: string
  ref: string
  at: Date
}

export function slipRef(at: Date, seed: number): string {
  const y = at.getFullYear() + 543
  const md = `${String(at.getMonth() + 1).padStart(2, '0')}${String(at.getDate()).padStart(2, '0')}`
  const hm = `${String(at.getHours()).padStart(2, '0')}${String(at.getMinutes()).padStart(2, '0')}`
  return `${y} ${md} ${hm} ${String(Math.abs(seed) % 10000).padStart(4, '0')}`
}

/** Draws the slip on a canvas (no libraries) so Save gives a real image, like every Thai bank app. */
export function slipToCanvas(s: SlipData): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null
  const W = 720
  const H = 980
  const cv = document.createElement('canvas')
  cv.width = W
  cv.height = H
  const g = cv.getContext('2d')
  if (!g) return null
  const font = (w: number, px: number) => `${w} ${px}px "Noto Sans Thai", "Manrope", system-ui, sans-serif`
  g.fillStyle = '#FFF6E6'
  g.beginPath()
  g.roundRect?.(0, 0, W, H, 40)
  g.fill()
  // header band
  g.fillStyle = '#3446FF'
  g.fillRect(0, 0, W, 150)
  g.fillStyle = '#FFF6E6'
  g.font = font(800, 40)
  g.fillText('kring', 56, 92)
  g.fillStyle = '#FFB21E'
  g.beginPath()
  g.arc(W - 120, 76, 26, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#FFF6E6'
  g.lineWidth = 6
  g.beginPath()
  g.arc(W - 88, 76, 26, 0, Math.PI * 2)
  g.stroke()
  // check
  g.fillStyle = '#1f9d5b'
  g.beginPath()
  g.arc(96, 236, 34, 0, Math.PI * 2)
  g.fill()
  g.strokeStyle = '#fff'
  g.lineWidth = 7
  g.beginPath()
  g.moveTo(80, 236)
  g.lineTo(92, 249)
  g.lineTo(113, 224)
  g.stroke()
  g.fillStyle = '#0A0B1E'
  g.font = font(800, 38)
  g.fillText('โอนเงินสำเร็จ', 150, 232)
  g.fillStyle = '#5b5a6e'
  g.font = font(500, 24)
  g.fillText(`${s.kind === 'topup' ? 'Top-up successful' : 'Withdrawal sent'} · ${thaiDate(s.at)}`, 150, 270)
  const row = (y: number, k: string, v: string, big = false) => {
    g.fillStyle = '#7a7486'
    g.font = font(500, 24)
    g.fillText(k, 56, y)
    g.fillStyle = '#0A0B1E'
    g.font = font(big ? 800 : 700, big ? 52 : 28)
    const w = g.measureText(v).width
    g.fillText(v, W - 56 - w, y)
  }
  g.strokeStyle = 'rgba(10,11,30,.12)'
  g.lineWidth = 2
  for (const y of [330, 430, 530, 630]) {
    g.beginPath()
    g.moveTo(56, y)
    g.lineTo(W - 56, y)
    g.stroke()
  }
  row(390, 'From', s.from)
  row(490, 'To', s.to)
  row(590, 'Ref', s.ref)
  row(720, `Amount · ${s.kind === 'topup' ? 'cash' : 'PromptPay'}`, formatBahtValue(s.amountThb, { decimals: true }), true)
  g.fillStyle = '#7a7486'
  g.font = font(500, 22)
  g.fillText(`Fee ${formatBahtValue(s.feeThb)}`, 56, 760)
  g.fillStyle = '#7a7486'
  g.font = font(500, 20)
  g.fillText('Kring · Bangkok Locals · เที่ยวกับโลคอลตัวจริง ในราคากันเอง', 56, H - 60)
  return cv
}

export async function saveSlip(s: SlipData): Promise<boolean> {
  try {
    const cv = slipToCanvas(s)
    if (!cv) return false
    const url = cv.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `kring-slip-${s.ref.replace(/\s/g, '')}.png`
    a.click()
    return true
  } catch {
    return false
  }
}

export async function shareSlip(s: SlipData): Promise<'shared' | 'copied' | 'none'> {
  const text = `Kring · ${s.kind === 'topup' ? 'Top up' : 'Withdrawal'} ${formatBahtValue(s.amountThb, { decimals: true })} · ${thaiDate(s.at)} · Ref ${s.ref}`
  try {
    const cv = slipToCanvas(s)
    const blob: Blob | null = cv ? await new Promise((res) => cv.toBlob((b) => res(b), 'image/png')) : null
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
    if (blob && nav.share) {
      const file = new File([blob], `kring-slip.png`, { type: 'image/png' })
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'Kring e-slip', text })
        return 'shared'
      }
    }
    if (nav.share) {
      await nav.share({ title: 'Kring e-slip', text })
      return 'shared'
    }
  } catch {
    // user cancelled, or share is unavailable → copy
  }
  try {
    await navigator.clipboard?.writeText(text)
    return 'copied'
  } catch {
    return 'none'
  }
}

export function ThaiSlip({
  data,
  onSave,
  onShare,
  testId = 'wallet-e-slip',
}: {
  data: SlipData
  onSave: () => void
  onShare: () => void
  testId?: string
}) {
  const tr = useTr()
  return (
    <div className="kw-slip" data-testid={testId}>
      <div className="kw-slip-ok">
        <i aria-hidden="true">✓</i>
        <span>
          <b>{data.kind === 'topup' ? tr('Top-up successful', 'เติมเงินสำเร็จ') : tr('Withdrawal sent', 'โอนเงินสำเร็จ')}</b>
          <small>
            {data.kind === 'topup' ? tr('Top-up successful', 'เติมเงินสำเร็จ') : tr('Withdrawal sent', 'ถอนเงินสำเร็จ')} · {thaiDate(data.at)}
          </small>
        </span>
      </div>
      <div className="kw-slip-l">
        <span>{tr('From', 'จาก')}</span>
        <b>{data.from}</b>
      </div>
      <div className="kw-slip-l">
        <span>{tr('To', 'ไปยัง')}</span>
        <b>{data.to}</b>
      </div>
      <div className="kw-slip-l">
        <span>{tr('Ref', 'เลขอ้างอิง')}</span>
        <b className="kw-mono">{data.ref}</b>
      </div>
      <div className="kw-slip-l is-total">
        <span>
          {data.kind === 'topup' ? tr('Amount · cash', 'จำนวนเงิน · เงินสด') : tr('Amount', 'จำนวนเงิน')}
          <small>
            {tr('Fee', 'ค่าธรรมเนียม')} {formatBahtValue(data.feeThb)}
          </small>
        </span>
        <span className="kw-slip-amt">
          <QrArt seed={data.ref.length * 97 + Math.round(data.amountThb)} className="kw-slip-qr" />
          <b data-testid={`${testId}-amount`}>{formatBahtValue(data.amountThb, { decimals: true })}</b>
        </span>
      </div>
      <div className="kw-slip-b">
        <button type="button" className="m-press" data-testid={`${testId}-save`} onClick={onSave}>
          {tr('Save', 'บันทึก')}
        </button>
        <button type="button" className="m-press" data-testid={`${testId}-share`} onClick={onShare}>
          {tr('Share', 'แชร์')}
        </button>
      </div>
      <i className="kw-sheen" aria-hidden="true" />
    </div>
  )
}
