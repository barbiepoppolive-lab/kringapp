import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { canRelease, demoSkipToMeeting, isDemoSession, type Booking, type OfferTerms } from '../../lib/planStore'
import { KringMark } from '../ui/KringMark'
import { triggerHaptic } from '../../lib/haptics'

/**
 * Kring booking · shared bits (K3). Small, dependency-free pieces the offer card, the ticket, the bump and
 * Local home all use, so every surface counts down, formats dates and draws rings the same way.
 */

export type Th = boolean

export const fmtThb = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`

const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DOW_TH = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.']
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MON_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

/** '2026-10-25' → 'Sat 25 Oct' · 'ส. 25 ต.ค.' (short = 'Sat 25') */
export function dayLabel(date: string, th: Th, short = false): string {
  const [y, m, d] = date.split('-').map(Number)
  if (!y || !m || !d) return date
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (short) return th ? `${DOW_TH[dow]} ${d}` : `${DOW_EN[dow]} ${d}`
  return th ? `${DOW_TH[dow]} ${d} ${MON_TH[m - 1]}` : `${DOW_EN[dow]} ${d} ${MON_EN[m - 1]}`
}

/** Bangkok 'YYYY-MM-DD' for now + n days */
export function bkkDay(offsetDays = 0, now = Date.now()): string {
  return new Date(now + 7 * 3600_000 + offsetDays * 86_400_000).toISOString().slice(0, 10)
}

export function whenLine(t: Pick<OfferTerms, 'date' | 'start' | 'end'>, th: Th, short = false): string {
  return `${dayLabel(t.date, th, short)} · ${t.start}–${t.end}`
}

/** "Just me" is the guest's own words; a local reads the party size (FIX2 · Ploy: never "แค่ฉัน" on her card). */
export function whoLine(n: number, th: Th, side: 'guest' | 'host' = 'guest'): string {
  if (side === 'host') return th ? `${Math.max(1, n)} คน` : n <= 1 ? '1 guest' : `${n} guests`
  if (n <= 1) return th ? 'แค่ฉัน' : 'Just me'
  return th ? `${n} คน` : `${n} people`
}

/** '2d 04h' · '3h 12m' · '9:41' (under an hour) */
export function untilLabel(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

/** The same, split for a ring: ['2d', '04h'] · ['22h', '29m'] · ['9:41', ''] */
export function untilParts(ms: number): [string, string] {
  const s = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return [`${d}d`, `${String(h).padStart(2, '0')}h`]
  if (h > 0) return [`${h}h`, `${String(m).padStart(2, '0')}m`]
  return [`${m}:${String(s % 60).padStart(2, '0')}`, '']
}

/** A 1 s clock (only while mounted). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}

export function reducedMotion(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/**
 * The countdown ring (request window, time until the booking). `left` 0…1 of the arc still drawn.
 * tone 'live' drains anchan → marigold as time runs down (round-1 A11: "green to gold" in the new palette).
 */
export function Ring({
  left,
  size = 56,
  stroke = 4,
  label,
  sub,
  tone = 'live',
  className = '',
  testId,
}: {
  left: number
  size?: number
  stroke?: number
  label?: ReactNode
  sub?: ReactNode
  tone?: 'live' | 'marigold' | 'anchan' | 'done'
  className?: string
  testId?: string
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const f = Math.max(0, Math.min(1, left))
  const color = tone === 'marigold' ? 'var(--marigold, #FFB21E)' : tone === 'anchan' ? 'var(--anchan-neon, #7381FF)' : tone === 'done' ? 'var(--success-text, #6FD39C)' : f > 0.35 ? 'var(--anchan-neon, #7381FF)' : 'var(--marigold, #FFB21E)'
  return (
    <span className={`kb-ring ${className}`} style={{ width: size, height: size } as CSSProperties} data-testid={testId}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-2, rgba(170,180,255,.15))" strokeWidth={stroke} />
        <circle
          className="kb-ring-arc"
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - f)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ ['--kb-c' as string]: c } as CSSProperties}
        />
      </svg>
      {label !== undefined && (
        <span className="kb-ring-l">
          <b style={{ fontSize: Math.max(10, Math.round(size * 0.24)) }}>{label}</b>
          {sub ? <small style={{ fontSize: Math.max(8, Math.round(size * 0.15)) }}>{sub}</small> : null}
        </span>
      )}
    </span>
  )
}

/** "✓ Req → Held 🔒 → กริ๊ง! → Done" 4-word progress chips (V4.4 minimal strip). */
export function OfferSteps({ stage, th }: { stage: 0 | 1 | 2; th: Th }) {
  const labels = th ? ['✓ คำขอ', 'พักเงิน 🔒', 'กริ๊ง!', 'เสร็จ'] : ['✓ Req', 'Held 🔒', 'กริ๊ง!', 'Done']
  return (
    <ol className="kb-steps" aria-label={th ? 'ขั้นตอนการจอง' : 'Booking steps'}>
      {labels.map((l, i) => (
        <li key={l} className={i <= stage ? 'is-on' : ''} aria-current={i === stage ? 'step' : undefined}>
          {l}
        </li>
      ))}
    </ol>
  )
}

/** Masked-contact line pinned under the chat header (1 crisp 6-word line). */
export function MaskedLine({ th }: { th: Th }) {
  return (
    <p className="kb-masked" data-testid="kring-masked-contacts">
      <span>
        {th ? '🔒 ซ่อนเบอร์ · พักเงินจนกริ๊ง!' : '🔒 Contacts hidden · ฿ held till กริ๊ง!'}
      </span>
    </p>
  )
}

/** Typing dots (the other side is answering). */
export function Typing({ label }: { label?: string }) {
  return (
    <span className="kb-typing" role="status" aria-label={label ?? 'typing'}>
      <i />
      <i />
      <i />
    </span>
  )
}

/**
 * The bump / venue-QR door (FIX1 · Wei 6, Ploy 6). Open only inside the booking window (30 min before the start →
 * 2 h after the end) — `canRelease` in planStore is the one gate (BumpCheckIn and `checkInBooking` use it too).
 * Outside the window the button is replaced by a calm locked line: "Opens Sat 25 at 13:30 at Siam Herbal Spa".
 * Demo sessions get a clearly labelled "Demo · skip to the meeting" so the bump can still be tried today.
 * Testids: kring-release-gate (+data-state open|locked|closed), kring-ticket-bump (when open), kring-demo-skip.
 */
export function ReleaseGate({ booking, th, now, label, onBump, block = false }: { booking: Booking; th: Th; now: number; label: ReactNode; onBump: () => void; block?: boolean }) {
  const r = canRelease(booking.id, now)
  if (booking.status !== 'held') return null
  if (r.ok) {
    return (
      <div className="kb-gate is-open" data-testid="kring-release-gate" data-state="open">
        <button type="button" className={`kb-btn kb-btn-gold kb-btn-bump${block ? ' kb-btn-block' : ''}`} data-testid="kring-ticket-bump" onClick={onBump}>
          <KringMark size={24} tone="day" /> {label}
        </button>
      </div>
    )
  }
  const demo = isDemoSession() && r.reason !== 'not-found'
  return (
    <div className={`kb-gate is-${r.reason === 'too-late' ? 'closed' : 'locked'}`} data-testid="kring-release-gate" data-state={r.reason === 'too-late' ? 'closed' : 'locked'} role="status">
      <span className="kb-gate-ic" aria-hidden="true">
        <KringMark size={22} tone="day" />
      </span>
      <span className="kb-gate-t">
        <b>{th ? r.text.th : r.text.en}</b>
        <small>
          {r.reason === 'too-late'
            ? th ? 'เงินยังพักไว้ · ทีมกริ๊งช่วยดูให้' : 'The money stays held · Kring support can help'
            : th ? 'กริ๊งได้เมื่อถึงจุดนัดทั้งคู่ · เงินยังพักไว้จนกว่าจะเจอกัน' : 'Bump when you are both at the meeting point · the money stays held until then'}
        </small>
      </span>
      {demo && r.reason === 'too-early' ? (
        <button
          type="button"
          className="kb-link kb-gate-demo"
          data-testid="kring-demo-skip"
          onClick={() => {
            triggerHaptic('select')
            demoSkipToMeeting(booking.id)
          }}
        >
          {th ? 'เดโม · ข้ามไปเวลานัด' : 'Demo · skip to the meeting'}
        </button>
      ) : null}
    </div>
  )
}
