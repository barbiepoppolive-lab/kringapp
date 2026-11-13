import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ShieldCheck } from '../ui/LivingIcons'
import { bookingStartMs, currentViewerId, partnerKey, planEnd, planPhase, usePlanStore, type MeetPlan } from '../../lib/planStore'
import { triggerHaptic } from '../../lib/haptics'
import { safety, useSafety } from '../../lib/safetyStore'
import { useLanguage } from '../../i18n/LanguageContext'
import { DeleteAccountSheet, PrivacyPage } from '../vip/WalletPages'
import {
  island,
  lastKnownBalance,
  openGuide,
  useIsHostRole,
  useStoredState,
  useTr,
  WPage,
  WRow,
  WSwitch,
  type SafetyRequest,
  type SafetySection,
} from '../vip/walletKit'
import '../../styles/wallet.css'

/**
 * Atlas D13 · D14 · D15 — THE one Safety Center, mounted once by App.
 * Open from anywhere with `window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section?, hostId?, hostName?, venue? } }))`
 *   section 'sos'    → Safety Center (1155 hold ring is the hero)
 *   section 'driver' → Thai driver card (full screen)
 *   section 'report' → report flow (for hostName when given)
 * SafetyMenu, the Wallet safety tile and the Kring Price taxi card all land here. No ledger reads/writes.
 * K5 · B11: hold SOS 3 s (linear ring) → 5 s call screen with slide/tap to cancel → tel:1155; share trip; report;
 * verified-only and public-venue-only rules shown as locked tiles. Booking privacy: Kring Safety may open a booking
 * only on SOS or a report (policy line on the page).
 */

const EMERGENCY_KEY = 'chon_emergency_contact_v1'
const TRIP_KEY = 'chon_trip_share_v1'
const DRIVER_KEY = 'chon_driver_card_v1'

type Dest = 'hotel' | 'venue' | 'airport'

interface DriverPrefs {
  hotel: string
  polite: 'ka' | 'krub'
  big: boolean
}

function DriverCard({ open, onClose, venue }: { open: boolean; onClose: () => void; venue?: string }) {
  const [prefs, setPrefs] = useStoredState<DriverPrefs>(DRIVER_KEY, { hotel: '', polite: 'ka', big: false })
  const [dest, setDest] = useState<Dest>(venue ? 'venue' : 'hotel')
  const [editing, setEditing] = useState(false)
  const tr = useTr()
  useEffect(() => {
    if (open) setDest(venue ? 'venue' : 'hotel')
  }, [open, venue])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open || typeof document === 'undefined') return null

  const p = prefs.polite === 'ka' ? 'ค่ะ' : 'ครับ'
  const place =
    dest === 'airport' ? 'สนามบินสุวรรณภูมิ' : dest === 'venue' ? venue || 'สุขุมวิท' : prefs.hotel.trim() ? `โรงแรม ${prefs.hotel.trim()}` : 'โรงแรมของฉัน'
  const placeEn =
    dest === 'airport' ? 'Suvarnabhumi Airport' : dest === 'venue' ? venue || 'Sukhumvit' : prefs.hotel.trim() ? `Hotel ${prefs.hotel.trim()}` : 'my hotel'
  // a Latin venue name ("Tichuca") reads better spaced inside the Thai line: "ไป Tichuca ค่ะ"
  const line1 = /[A-Za-z]/.test(place) ? `ไป ${place} ${p}` : `ไป${place}${p}`
  const line2 = `กรุณาเปิดมิเตอร์${p}`

  const speak = () => {
    triggerHaptic('tap')
    try {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const u = new SpeechSynthesisUtterance(`${line1} ${line2}`)
        u.lang = 'th-TH'
        u.rate = 0.9
        window.speechSynthesis.speak(u)
      } else {
        island(tr('Show the screen — your phone can’t speak Thai', 'ยื่นหน้าจอให้คนขับดูแทนนะ'), 'neutral')
      }
    } catch {
      island(tr('Show the screen — your phone can’t speak Thai', 'ยื่นหน้าจอให้คนขับดูแทนนะ'), 'neutral')
    }
  }

  return createPortal(
    <div className={`wl-driver${prefs.big ? ' is-big' : ''}`} role="dialog" aria-modal="true" aria-label="Thai driver card" data-testid="safety-driver-card">
      <div className="wl-driver-top">
        <button type="button" className="wl-back m-press" aria-label="Close driver card" onClick={onClose}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <b>{tr('Show this to the driver', 'ยื่นให้คนขับดู')}</b>
        <div className="wl-seg is-sm" role="group" aria-label="Text size">
          <button type="button" aria-pressed={!prefs.big} onClick={() => setPrefs({ big: false })}>
            A
          </button>
          <button type="button" aria-pressed={prefs.big} onClick={() => setPrefs({ big: true })}>
            A+
          </button>
        </div>
      </div>
      <div className="wl-driver-body">
        <p lang="th" className="wl-thai">{line1}</p>
        <p lang="th" className="wl-thai is-2">{line2}</p>
        <p className="wl-driver-en">“To {placeEn}, please. Please use the meter.”</p>
        <button type="button" className="wl-speak m-press" aria-label="Speak it in Thai" onClick={speak}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 9v6h4l5 4V5L8 9zM16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
          </svg>
        </button>
        <p className="wl-s wl-center">{tr('Tap to speak it in Thai · turn your phone for a bigger card', 'แตะเพื่อให้มือถืออ่านออกเสียง · หมุนจอเพื่อดูตัวใหญ่')}</p>
        {dest === 'hotel' && (editing || !prefs.hotel.trim()) ? (
          <input
            className="wl-input"
            value={prefs.hotel}
            onChange={(e) => setPrefs({ hotel: e.target.value })}
            onBlur={() => setEditing(false)}
            placeholder={tr('Your hotel name, e.g. Sukhumvit 11', 'ชื่อโรงแรม เช่น สุขุมวิท 11')}
            aria-label="Your hotel name"
            autoComplete="off"
          />
        ) : null}
      </div>
      <div className="wl-driver-foot">
        <div className="wl-chips" role="radiogroup" aria-label="Where to">
          {(
            [
              ['hotel', tr('Hotel', 'โรงแรม')],
              ['venue', tr('Meeting point', 'จุดนัด')],
              ['airport', tr('Airport', 'สนามบิน')],
            ] as Array<[Dest, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={dest === id}
              className={`wl-chip m-press${dest === id ? ' is-on' : ''}`}
              onClick={() => {
                triggerHaptic('select')
                if (id === 'hotel' && dest === 'hotel') setEditing(true)
                setDest(id)
              }}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="wl-chip m-press"
            aria-label={prefs.polite === 'ka' ? 'Switch to male polite ending' : 'Switch to female polite ending'}
            onClick={() => setPrefs({ polite: prefs.polite === 'ka' ? 'krub' : 'ka' })}
          >
            {prefs.polite === 'ka' ? 'ค่ะ' : 'ครับ'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

const REASONS: Array<{ en: string; th: string }> = [
  { en: 'Fake photos', th: 'รูปไม่ตรงปก' },
  { en: 'Price not as agreed', th: 'ราคาไม่ตรงที่ตกลง' },
  { en: 'Asked to pay outside', th: 'ขอให้จ่ายนอกแอป' },
  { en: 'Didn’t show', th: 'เบี้ยวนัด' },
  { en: 'Rude / unsafe', th: 'หยาบคาย / ไม่ปลอดภัย' },
  { en: 'Underage', th: 'อายุไม่ถึง' },
  { en: 'Other', th: 'อื่นๆ' },
]
/** Hosts report guests: different worries (Ploy B12 — Safety copy follows the role). */
const HOST_REASONS: Array<{ en: string; th: string }> = [
  { en: 'Asked to meet somewhere private', th: 'ชวนไปที่ส่วนตัว' },
  { en: 'Asked to pay outside', th: 'ขอจ่ายนอกแอป' },
  { en: 'Didn’t show', th: 'เบี้ยวนัด' },
  { en: 'Rude / unsafe', th: 'หยาบคาย / ไม่ปลอดภัย' },
  { en: 'Pushy / unsafe behaviour', th: 'ตื๊อ / พฤติกรรมไม่ปลอดภัย' },
  { en: 'Other', th: 'อื่นๆ' },
]

function ReportFlow({
  open,
  onBack,
  hostId,
  hostName,
  onOpenCenter,
}: {
  open: boolean
  onBack: () => void
  hostId?: string
  hostName?: string
  onOpenCenter: () => void
}) {
  const [reason, setReason] = useState<string | null>(null)
  const [who, setWho] = useState(hostName ?? '')
  const [text, setText] = useState('')
  const [alsoBlock, setAlsoBlock] = useState(true)
  const [sent, setSent] = useState(false)
  const tr = useTr()
  const isHost = useIsHostRole()
  const reasons = isHost ? HOST_REASONS : REASONS
  useEffect(() => {
    if (!open) return
    setReason(null)
    setWho(hostName ?? '')
    setText('')
    setAlsoBlock(true)
    setSent(false)
  }, [open, hostName])
  const name = who.trim() || tr('them', 'คนนี้')
  const send = () => {
    const id = hostId || who.trim().toLowerCase()
    if (id) {
      safety.report(id)
      if (alsoBlock) safety.block(id)
    }
    triggerHaptic('success')
    island(tr('Report sent — a real person replies within 1 h', 'ส่งรายงานแล้ว ทีมงานตัวจริงตอบภายใน 1 ชม.'), 'green', '✓')
    setSent(true)
  }
  return (
    <WPage open={open} onBack={onBack} title={sent ? tr('Report sent', 'ส่งรายงานแล้ว') : `${tr('Report', 'รายงาน')} ${hostName ?? ''}`.trim()} testId="safety-report-flow" tone="red">
      {!sent ? (
        <div className="wl-stack">
          <div className="wl-dots" aria-hidden="true">
            <i className="on" />
            <i className={reason ? 'on' : ''} />
            <i />
          </div>
          {!hostName ? (
            <input
              className="wl-input"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              placeholder={tr('Who is this about? (name)', 'รายงานใคร? (ชื่อ)')}
              aria-label="Who is this about"
              autoComplete="off"
            />
          ) : null}
          <p className="wl-big">{tr('What happened?', 'เกิดอะไรขึ้น?')}</p>
          <div className="wl-chips is-wrap" role="radiogroup" aria-label="Reason">
            {reasons.map((r) => (
              <button
                key={r.en}
                type="button"
                role="radio"
                aria-checked={reason === r.en}
                className={`wl-chip m-press${reason === r.en ? ' is-red' : ''}`}
                onClick={() => {
                  triggerHaptic('select')
                  setReason(r.en)
                }}
              >
                {tr(r.en, r.th)}
              </button>
            ))}
          </div>
          <textarea
            className="wl-input wl-ta"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={tr('A few words (optional)', 'เล่าสั้นๆ (ไม่บังคับ)')}
            aria-label="A few words (optional)"
            rows={3}
          />
          <div className="wl-list">
            <div className="wl-row">
              <span className="wl-row-ic" aria-hidden="true">⛔</span>
              <span className="wl-row-t">
                <b>{tr(`Also block ${name}`, `บล็อก ${name} ด้วย`)}</b>
                <small>{tr('they won’t see you again', 'เขาจะไม่เห็นคุณอีก')}</small>
              </span>
              <WSwitch on={alsoBlock} onChange={setAlsoBlock} label={tr(`Also block ${name}`, `บล็อก ${name} ด้วย`)} />
            </div>
          </div>
          <p className="wl-s">{tr(`Your recent chat with ${name} goes with the report, so you don’t need screenshots.`, `แชทล่าสุดกับ ${name} แนบไปกับรายงานให้แล้ว ไม่ต้องแคปหน้าจอ`)}</p>
          <button type="button" className="ux-btn wl-cta wl-red m-press" disabled={!reason || !(hostName || who.trim())} onClick={send}>
            {tr('Send report', 'ส่งรายงาน')}
          </button>
        </div>
      ) : (
        <div className="wl-stack wl-center-col">
          <span className="wl-okc" aria-hidden="true">
            <ShieldCheck checked size={30} />
          </span>
          <p className="wl-big">{tr('Thanks — we’ve got it', 'ขอบคุณ เราได้รับแล้ว')}</p>
          <p className="wl-s wl-center">
            {tr('A real person replies within 1 h.', 'ทีมงานตัวจริงจะตอบภายใน 1 ชม.')}
            {alsoBlock ? tr(` ${name} is blocked.`, ` บล็อก ${name} แล้ว`) : ''}{' '}
            {isHost ? tr('Never take payment outside Kring.', 'อย่ารับเงินนอกแอปนะ') : tr('Never pay anyone outside Kring.', 'อย่าจ่ายเงินนอกแอปนะ')}
          </p>
          <button type="button" className="ux-btn ux-btn-quiet wl-cta m-press" onClick={onOpenCenter}>
            {tr('Open Safety Center', 'เปิดศูนย์ความปลอดภัย')}
          </button>
          <button type="button" className="ux-btn ux-btn-gold wl-cta m-press" onClick={onBack}>
            {tr('Done', 'เสร็จแล้ว')}
          </button>
        </div>
      )}
    </WPage>
  )
}

/* ---------------- K5 · B11 · hold-to-call SOS (3 s ring) + 5 s cancel screen ---------------- */
export const SOS_HOLD_MS = 3000
export const SOS_CANCEL_S = 5

/**
 * Hold for 3 s (pointer, or Space / Enter held). The white ring fills strictly linearly while the button grows to 1.06;
 * haptic ticks at 1 s and 2 s, a 200 ms buzz at 3 s. Releasing early cancels. A tap alone does nothing (no pocket calls).
 */
function SosButton({ onComplete, label, sub }: { onComplete: () => void; label: string; sub: string }) {
  const [p, setP] = useState(0)
  const raf = useRef(0)
  const t0 = useRef(0)
  const ticks = useRef(0)
  const holding = useRef(false)
  const doneRef = useRef(onComplete)
  doneRef.current = onComplete
  const stop = useCallback(() => {
    holding.current = false
    window.cancelAnimationFrame(raf.current)
    setP(0)
  }, [])
  const frame = useCallback(() => {
    if (!holding.current) return
    const e = performance.now() - t0.current
    const v = Math.min(1, e / SOS_HOLD_MS)
    const sec = Math.floor(e / 1000)
    if (sec > ticks.current && sec < 3) {
      ticks.current = sec
      triggerHaptic(sec === 1 ? 'tap' : 'select')
    }
    setP(v)
    if (v >= 1) {
      holding.current = false
      triggerHaptic('warning')
      window.setTimeout(() => setP(0), 300)
      doneRef.current()
      return
    }
    raf.current = window.requestAnimationFrame(frame)
  }, [])
  const start = () => {
    if (holding.current) return
    holding.current = true
    ticks.current = 0
    t0.current = performance.now()
    triggerHaptic('tap')
    raf.current = window.requestAnimationFrame(frame)
  }
  useEffect(() => () => window.cancelAnimationFrame(raf.current), [])
  const r = 56
  const c = 2 * Math.PI * r
  return (
    <button
      type="button"
      className={`kw-sos${p > 0 ? ' is-holding' : ''}`}
      data-testid="safety-sos-hold"
      aria-label="Hold to call 1155 Tourist Police"
      style={{ '--p': p } as CSSProperties}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId)
        start()
      }}
      onPointerUp={stop}
      onPointerCancel={stop}
      onPointerLeave={() => holding.current && stop()}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
          e.preventDefault()
          start()
        }
      }}
      onKeyUp={(e) => {
        if (e.key === ' ' || e.key === 'Enter') stop()
      }}
    >
      <svg viewBox="0 0 118 118" aria-hidden="true">
        <circle cx="59" cy="59" r={r} className="kw-sos-bg" />
        <circle cx="59" cy="59" r={r} transform="rotate(-90 59 59)" className="kw-sos-f" style={{ strokeDasharray: c, strokeDashoffset: c * (1 - p) }} />
      </svg>
      <b>{label}</b>
      <small>{sub}</small>
    </button>
  )
}

function SosCallScreen({
  open,
  onCancel,
  onCall,
  sharedWith,
  withName,
}: {
  open: boolean
  onCancel: () => void
  onCall: () => void
  sharedWith: string
  withName: string
}) {
  const tr = useTr()
  const [left, setLeft] = useState(SOS_CANCEL_S)
  const [drag, setDrag] = useState(0)
  const dragStart = useRef<number | null>(null)
  const callRef = useRef(onCall)
  callRef.current = onCall
  useEffect(() => {
    if (!open) return
    setLeft(SOS_CANCEL_S)
    setDrag(0)
    const id = window.setInterval(() => {
      setLeft((s) => {
        if (s <= 1) {
          window.clearInterval(id)
          window.setTimeout(() => callRef.current(), 0)
          return 0
        }
        return s - 1
      })
    }, 1000)
    return () => window.clearInterval(id)
  }, [open])
  if (!open || typeof document === 'undefined') return null
  const track = 240
  return createPortal(
    <div className="kw-call" role="alertdialog" aria-modal="true" aria-label={tr('Calling Tourist Police 1155', 'กำลังโทรหาตำรวจท่องเที่ยว 1155')} data-testid="safety-sos-call">
      <div className="kw-call-pls" aria-hidden="true">
        <i />
        <i />
        <b>1155</b>
      </div>
      <b className="kw-call-t">{left > 0 ? tr(`Calling Tourist Police in ${left}`, `จะโทรหาตำรวจท่องเที่ยวใน ${left}`) : tr('Calling Tourist Police', 'กำลังโทรหาตำรวจท่องเที่ยว')}</b>
      <p className="kw-call-s">
        {tr('English spoken · 24 h.', 'พูดภาษาอังกฤษได้ · 24 ชม.')}
        {sharedWith ? tr(` Your live trip stays shared with ${sharedWith}.`, ` ทริปสดยังแชร์ให้ ${sharedWith} อยู่`) : ''}
        {withName ? tr(` Kring Safety can open your booking with ${withName} because you pressed SOS.`, ` ทีมความปลอดภัยของกริ๊งเปิดดูการจองกับ ${withName} ได้เพราะคุณกด SOS`) : ''}
      </p>
      <div
        className="kw-sld"
        style={{ '--x': `${drag}px`, width: track } as CSSProperties}
        onPointerDown={(e) => {
          dragStart.current = e.clientX
          e.currentTarget.setPointerCapture?.(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (dragStart.current === null) return
          setDrag(Math.max(0, Math.min(track - 52, e.clientX - dragStart.current)))
        }}
        onPointerUp={() => {
          dragStart.current = null
          if (drag > track - 80) onCancel()
          else setDrag(0)
        }}
      >
        <i aria-hidden="true">✕</i>
        <span aria-hidden="true">{tr('Slide to cancel', 'เลื่อนเพื่อยกเลิก')}</span>
      </div>
      <button type="button" className="kw-call-x m-press" data-testid="safety-sos-cancel" onClick={onCancel}>
        {tr('Cancel', 'ยกเลิก')}
      </button>
    </div>,
    document.body,
  )
}

/** The experience happening now (or next tonight), from the same plan records the Plans card reads. */
function useCurrentTrip(): { title: string; name: string; end: string | null } | null {
  const store = usePlanStore()
  const now = Date.now()
  // KRING FIX1 · a booking names its experience and venue ("Yaowarat street-food walk · Yaowarat Rd") and the other person
  const me = partnerKey(currentViewerId())
  const live = Object.values(store.bookings ?? {})
    .filter((b) => b.status === 'held' && (b.heldHere || b.participants.some((p) => partnerKey(p) === me)))
    .map((b) => ({ b, start: bookingStartMs(b) }))
    .filter(({ start }) => start - now < 12 * 3600_000 && now - start < 6 * 3600_000)
    .sort((a, z) => a.start - z.start)[0]
  if (live) {
    const { b } = live
    const iAmLocal = partnerKey(b.localId) === me
    return {
      title: [b.experienceTitle, b.terms.venue].filter(Boolean).join(' · '),
      name: iAmLocal ? b.guestName : b.localName,
      end: b.terms.end || null,
    }
  }
  const meets = Object.values(store.meet ?? {}) as MeetPlan[]
  for (const m of meets) {
    try {
      const ph = planPhase(m, now)
      if (ph.phase === 'after' || ph.startMs - now > 12 * 3600_000) continue
    } catch {
      continue
    }
    const hostPlan = (store.host ?? {})[m.key]
    const hold = (store.guest ?? {})[m.key]
    if (!hostPlan && !hold && !m.guestConfirmedAt) continue
    const name = hostPlan ? hostPlan.guest : m.host || hold?.hostName || ''
    const venue = hostPlan?.venue ?? ''
    let end: string | null = null
    try {
      end = planEnd(m)
    } catch {
      end = null
    }
    return { title: venue, name, end }
  }
  return null
}

export function SafetyCenterPage({
  open,
  onBack,
  onDriver,
  onReport,
  onPrivacy,
}: {
  open: boolean
  onBack: () => void
  onDriver: () => void
  onReport: () => void
  onPrivacy: () => void
}) {
  const s = useSafety()
  const tr = useTr()
  const isHost = useIsHostRole()
  const [contact, setContact] = useStoredState<{ name: string; phone: string }>(EMERGENCY_KEY, { name: '', phone: '' })
  const [trip, setTrip] = useStoredState<{ sharedWith: string; at: number }>(TRIP_KEY, { sharedWith: '', at: 0 })
  const [editContact, setEditContact] = useState(false)
  const [verifyOpen, setVerifyOpen] = useState(false)
  const [calling, setCalling] = useState(false)
  const blockedCount = s.blockedHostIds.length + s.preBlocked.length
  const tripLive = Boolean(trip.sharedWith) && Date.now() - trip.at < 6 * 3600_000
  const current = useCurrentTrip()

  useEffect(() => {
    if (!open) setCalling(false)
  }, [open])

  const shareTrip = async () => {
    triggerHaptic('select')
    const link = 'https://kringapp.com/trip/live'
    const text = tr('I’m out with a Kring Local — here’s my live trip.', 'ฉันออกไปเที่ยวกับโลคอลของกริ๊ง นี่คือทริปสดของฉัน')
    const to = contact.name.trim() || tr('your contact', 'คนที่ไว้ใจ')
    try {
      if (navigator.share) {
        await navigator.share({ title: tr('My live trip', 'ทริปสดของฉัน'), text, url: link })
        setTrip({ sharedWith: to, at: Date.now() })
        island(tr(`Trip shared with ${to}`, `แชร์ทริปให้ ${to} แล้ว`), 'green', '📍')
        return
      }
    } catch {
      return
    }
    try {
      await navigator.clipboard?.writeText(`${text} ${link}`)
    } catch {
      // ignore
    }
    setTrip({ sharedWith: to, at: Date.now() })
    island(tr('Trip link copied — paste it to someone you trust', 'คัดลอกลิงก์ทริปแล้ว ส่งให้คนที่ไว้ใจได้เลย'), 'green', '📍')
  }

  const tiles: Array<{ id: string; testId: string; icon: string; title: string; sub: string; live?: boolean; locked?: boolean; onClick: () => void; expanded?: boolean }> = [
    {
      id: 'share',
      testId: 'safety-tile-share',
      icon: '📍',
      title: tr('Share trip', 'แชร์ทริป'),
      sub: tripLive ? tr(`Live with ${trip.sharedWith} until the experience ends`, `แชร์สดให้ ${trip.sharedWith} จนจบทริป`) : tr('Live location until the experience ends', 'ตำแหน่งสดจนจบทริป'),
      live: tripLive,
      onClick: () => void shareTrip(),
    },
    {
      id: 'report',
      testId: 'safety-tile-report',
      icon: '⚑',
      title: tr('Report', 'รายงาน'),
      sub: tr('A person, a price or a venue. We reply within 1 h.', 'คน ราคา หรือสถานที่ เราตอบภายใน 1 ชม.'),
      onClick: onReport,
    },
    {
      id: 'verify',
      testId: 'safety-tile-verify',
      icon: '✓',
      title: isHost ? tr('Verified guests only', 'แขกยืนยันตัวตนแล้ว') : tr('Verified Locals only', 'โลคอลยืนยันตัวตนแล้วเท่านั้น'),
      sub: tr('ID + selfie checked. Always on.', 'ตรวจบัตรและเซลฟี่แล้ว เปิดตลอด'),
      locked: true,
      expanded: verifyOpen,
      onClick: () => setVerifyOpen((v) => !v),
    },
    {
      id: 'public',
      testId: 'safety-tile-public',
      icon: '🏛',
      title: tr('Public venues only', 'เจอกันที่สาธารณะเท่านั้น'),
      sub: tr('Meet points are public places. Always on.', 'จุดนัดเป็นที่สาธารณะ เปิดตลอด'),
      locked: true,
      onClick: () => openGuide('safety', 1),
    },
  ]

  return (
    <WPage
      open={open}
      onBack={onBack}
      title={tr('Safety · ความปลอดภัย', 'ความปลอดภัย')}
      guide="safety"
      testId="safety-center-page"
      tone="red"
      right={tripLive ? <span className="kw-shared">● {tr('Shared', 'แชร์อยู่')}</span> : undefined}
    >
      <div className="kw-stack kw-safety">
        <div className="kw-trip" data-testid="safety-current-trip">
          <span className="kw-trip-ic" aria-hidden="true">🛡️</span>
          <span className="kw-grow">
            {current ? (
              <>
                <b>
                  {current.title ? `${current.title} · ` : ''}
                  {tr(`with ${current.name}`, `กับ ${current.name}`)} <span className="kw-vf" aria-label="verified">✓</span>
                </b>
                <small>
                  {tr('Public venue', 'สถานที่สาธารณะ')}
                  {current.end ? tr(` · ends ~${current.end}`, ` · จบราว ${current.end} น.`) : ''}
                  {tripLive ? tr(` · live trip shared with ${trip.sharedWith}`, ` · แชร์ทริปสดให้ ${trip.sharedWith}`) : ''}
                </small>
              </>
            ) : (
              <>
                <b>{tr('No experience right now', 'ตอนนี้ยังไม่มีทริป')}</b>
                <small>{tr('Share your trip before you head out', 'แชร์ทริปไว้ก่อนออกไปนะ')}</small>
              </>
            )}
          </span>
        </div>

        <div className="kw-sosw">
          <SosButton onComplete={() => setCalling(true)} label="SOS" sub={tr('Hold 3 s · 1155', 'กดค้าง 3 วิ · 1155')} />
          <p className="kw-sub kw-c">
            {isHost
              ? tr('Tourist Police 1155 · 24 h · or 191 for police', 'ตำรวจท่องเที่ยว 1155 · 24 ชม. · หรือ 191')
              : tr('Tourist Police 1155 · English spoken · 24 h', 'ตำรวจท่องเที่ยว 1155 · พูดอังกฤษได้ · 24 ชม.')}
          </p>
        </div>

        <div className="kw-sg">
          {tiles.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`kw-sgt m-press${t.locked ? ' is-locked' : ''}`}
              style={{ '--i': i } as CSSProperties}
              data-testid={t.testId}
              aria-expanded={t.expanded}
              onClick={() => {
                triggerHaptic('tap')
                t.onClick()
              }}
            >
              <span className="kw-sgt-ic" aria-hidden="true">
                {t.icon}
                {t.live ? <b className="kw-livetag">LIVE</b> : null}
                {t.locked ? <i className="kw-lk" /> : null}
              </span>
              <b>{t.title}</b>
              <small>{t.sub}</small>
            </button>
          ))}
        </div>

        {verifyOpen ? (
          <div className="wl-note m-fade">
            <ShieldCheck checked size={20} />
            <p className="wl-s">
              {isHost
                ? tr(
                    'Every guest pays before the booking is set, and you only ever meet at a public venue. Their name and country show on the request.',
                    'แขกทุกคนจ่ายก่อนการจองจะยืนยัน และเจอกันที่สาธารณะเท่านั้น ชื่อและประเทศของแขกขึ้นในคำขอ',
                  )
                : tr(
                    'Every Local passes an ID check and a live selfie match before they go Live. Look for the ✓ on their photo — no ✓, no booking.',
                    'โลคอลทุกคนผ่านการตรวจบัตรและสแกนหน้าสดก่อนออนไลน์ ดู ✓ บนรูป ไม่มี ✓ ไม่ต้องจอง',
                  )}{' '}
              <button type="button" className="wl-inline-link" onClick={() => openGuide('safety', 1)}>
                {tr('How we check', 'เราตรวจยังไง')}
              </button>
            </p>
          </div>
        ) : null}

        {editContact ? (
          <div className="wl-box m-fade">
            <input
              className="wl-input"
              value={contact.name}
              onChange={(e) => setContact({ name: e.target.value })}
              placeholder={tr('Name, e.g. Mum or Sam (UK)', 'ชื่อ เช่น แม่ หรือ เพื่อนสนิท')}
              aria-label="Emergency contact name"
              autoComplete="off"
            />
            <input
              className="wl-input"
              value={contact.phone}
              onChange={(e) => setContact({ phone: e.target.value })}
              placeholder={tr('+44 7… phone number', '08x-xxx-xxxx')}
              aria-label="Emergency contact phone"
              inputMode="tel"
              autoComplete="off"
            />
            <button
              type="button"
              className="kw-btn is-mg kw-wide m-press"
              disabled={!contact.name.trim()}
              onClick={() => {
                setEditContact(false)
                island(tr(`${contact.name.trim()} is your emergency contact`, `ตั้ง ${contact.name.trim()} เป็นเบอร์ฉุกเฉินแล้ว`), 'green', '✓')
              }}
            >
              {tr('Save contact', 'บันทึก')}
            </button>
          </div>
        ) : null}

        <div className="wl-list">
          <WRow
            icon="📞"
            title={contact.name.trim() ? tr(`Emergency contact · ${contact.name.trim()}`, `เบอร์ฉุกเฉิน · ${contact.name.trim()}`) : tr('Emergency contact', 'เบอร์ฉุกเฉิน')}
            sub={contact.name.trim() ? tr('gets your live trip when you share', 'ได้รับทริปสดเมื่อคุณแชร์') : tr('Add someone you trust', 'เพิ่มคนที่ไว้ใจ')}
            onClick={() => setEditContact((v) => !v)}
            chevron
            testId="safety-tile-contact"
          />
          <WRow icon="🚕" title={isHost ? tr('Ride card', 'การ์ดเรียกรถ') : tr('Thai driver card', 'การ์ดคุยกับคนขับ')} sub={tr('Show it to the driver · speaks Thai', 'ยื่นให้คนขับดู · อ่านออกเสียงไทยได้')} onClick={onDriver} chevron testId="safety-tile-driver" />
          <WRow
            icon="⛔"
            title={tr('Blocked people', 'คนที่บล็อก')}
            sub={tr(`${blockedCount} · in Privacy`, `${blockedCount} คน · ในความเป็นส่วนตัว`)}
            onClick={onPrivacy}
            chevron
            testId="safety-blocked-row"
          />
          <WRow icon="⊘" title={tr('Block someone', 'บล็อกใครสักคน')} sub={tr('They won’t see you again', 'เขาจะไม่เห็นคุณอีก')} onClick={onPrivacy} chevron testId="safety-tile-block" />
          <WRow
            icon="☎"
            title={tr('Police 191 · Ambulance 1669', 'ตำรวจ 191 · รถพยาบาล 1669')}
            sub={tr('Tap to call', 'แตะเพื่อโทร')}
            onClick={() => (window.location.href = 'tel:191')}
            chevron
          />
        </div>

        <div className="kw-lock is-quiet" data-testid="safety-booking-privacy">
          <span aria-hidden="true">🔒</span>
          <div>
            <b>{tr('Your bookings are private', 'การจองของคุณเป็นความลับ')}</b>
            <small>
              {tr(
                'Only you and your Local see a booking. Kring Safety can open it only when one of you presses SOS or sends a report.',
                'เห็นการจองได้แค่คุณกับโลคอล ทีมความปลอดภัยของกริ๊งเปิดดูได้เฉพาะเมื่อมีคนกด SOS หรือส่งรายงานเท่านั้น',
              )}
            </small>
          </div>
        </div>
      </div>
      <SosCallScreen
        open={calling}
        sharedWith={tripLive ? trip.sharedWith : ''}
        withName={current?.name ?? ''}
        onCancel={() => {
          triggerHaptic('tap')
          setCalling(false)
        }}
        onCall={() => {
          setCalling(false)
          try {
            window.location.href = 'tel:1155'
          } catch {
            // ignore
          }
        }}
      />
    </WPage>
  )
}

export default function SafetyCenterHost() {
  const { language } = useLanguage()
  const [view, setView] = useState<null | 'center' | 'report' | 'privacy'>(null)
  const [driver, setDriver] = useState(false)
  const [req, setReq] = useState<SafetyRequest>({})
  const [returnTo, setReturnTo] = useState<null | 'center'>(null)
  const [deleting, setDeleting] = useState(false)

  const openSection = useCallback((detail: SafetyRequest) => {
    setReq(detail)
    const section: SafetySection = detail.section ?? 'sos'
    if (section === 'driver') {
      setDriver(true)
      return
    }
    if (section === 'report') {
      setReturnTo(null)
      setView('report')
      return
    }
    if (section === 'privacy') {
      setReturnTo(null)
      setView('privacy')
      return
    }
    setView('center')
  }, [])

  useEffect(() => {
    const on = (e: Event) => openSection(((e as CustomEvent<SafetyRequest>).detail ?? {}) as SafetyRequest)
    const onDelete = () => setDeleting(true)
    window.addEventListener('chon:open-safety', on)
    window.addEventListener('chon:open-delete-account', onDelete)
    return () => {
      window.removeEventListener('chon:open-safety', on)
      window.removeEventListener('chon:open-delete-account', onDelete)
    }
  }, [openSection])

  const back = () => {
    if (returnTo === 'center') {
      setReturnTo(null)
      setView('center')
      return
    }
    setView(null)
  }

  return (
    <>
      <SafetyCenterPage
        open={view === 'center'}
        onBack={() => setView(null)}
        onDriver={() => setDriver(true)}
        onReport={() => {
          setReq({})
          setReturnTo('center')
          setView('report')
        }}
        onPrivacy={() => {
          setReturnTo('center')
          setView('privacy')
        }}
      />
      <ReportFlow
        open={view === 'report'}
        onBack={back}
        hostId={req.hostId}
        hostName={req.hostName}
        onOpenCenter={() => {
          setReturnTo(null)
          setView('center')
        }}
      />
      <PrivacyPage open={view === 'privacy'} onBack={back} language={language} />
      <DriverCard open={driver} onClose={() => setDriver(false)} venue={req.venue} />
      <DeleteAccountSheet
        open={deleting}
        onClose={() => setDeleting(false)}
        balanceThb={(() => {
          const b = lastKnownBalance()
          return b ? b.paidCoins / 100 : 0
        })()}
      />
    </>
  )
}
