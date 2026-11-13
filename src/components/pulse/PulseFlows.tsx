import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { recordTripSaving } from '../../lib/tripSavings'
import { FLOOR_PRICES, PLAN_ADDON_THB, bahtLabel, floorForRide, saveThb, type FloorPrice } from './floorPrices'
import sceneEsim from '../../assets/pulse/scenes/esim-5g.svg'
import sceneCab from '../../assets/pulse/scenes/airport-cab.svg'
import sceneBag from '../../assets/pulse/scenes/bag-drop.svg'
import '../../styles/chat-pulse.css'
import '../../styles/kring-price.css'

/**
 * Atlas build · Section C (C11–C17) — Pulse building blocks.
 *
 * ArrivalKit (C11 hero, eSIM glowing) · TicketStack (3D stack that lays flat on first view + one-shot red laser on the
 * walk-in price) · PulseBookingFlow (C13 eSIM, C14 table, C15 ride, C16 driver → boarding pass) · ScamCheckFlow (C17).
 * Presentational only: no coins are credited here. Payment stops at the "request sent" state, exactly like before.
 */

/* ------------------------------------------------------------------ */
/* shared                                                              */
/* ------------------------------------------------------------------ */
export function fmtThb(n: number): string {
  return Math.max(0, Math.round(n)).toLocaleString('en-US')
}

function prefersReducedMotion(): boolean {
  try {
    if (typeof document !== 'undefined' && document.documentElement.getAttribute('data-reduce-motion') === 'true') return true
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

/** true once the element has been ≥50 % in view (one-shot). No observer (tests, old browsers) or reduced motion → true at once. */
export function useFirstView<T extends HTMLElement>(delayMs = 250): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null)
  const [seen, setSeen] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined' || prefersReducedMotion()) {
      setSeen(true)
      return
    }
    let timer = 0
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          timer = window.setTimeout(() => setSeen(true), delayMs)
          io.disconnect()
        }
      },
      { threshold: 0.5 },
    )
    io.observe(el)
    return () => {
      io.disconnect()
      window.clearTimeout(timer)
    }
  }, [delayMs])
  return [ref, seen]
}

/** Deterministic 21×21 QR-looking pattern (finder squares + noise). Decorative. */
export function FakeQr({ seed = 7, testId }: { seed?: number; testId?: string }) {
  const cells = useMemo(() => {
    let s = seed
    const out: boolean[] = []
    const inF = (x: number, y: number, a: number, b: number) => x >= a && x < a + 7 && y >= b && y < b + 7
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        let on = false
        const finders: [number, number][] = [[0, 0], [14, 0], [0, 14]]
        const f = finders.find(([a, b]) => inF(x, y, a, b))
        if (f) {
          const dx = x - f[0]
          const dy = y - f[1]
          on = dx === 0 || dy === 0 || dx === 6 || dy === 6 || (dx > 1 && dx < 5 && dy > 1 && dy < 5)
        } else if (!((x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12))) {
          s = (s * 9301 + 49297) % 233280
          on = s / 233280 > 0.52
        }
        out.push(on)
      }
    }
    return out
  }, [seed])
  return (
    <div className="cp-qr" role="img" aria-label="Activation QR code" data-testid={testId}>
      {cells.map((on, i) => (on ? <i key={i} /> : <span key={i} />))}
    </div>
  )
}

function Laser({ lit, children }: { lit: boolean; children: ReactNode }) {
  return <span className={`cp-laser${lit ? ' is-lit' : ''}`}>{children}</span>
}

/* ------------------------------------------------------------------ */
/* NEXT95 · Floor price vs Our price                                   */
/* ------------------------------------------------------------------ */
export function floorWords(language: string) {
  const th = language === 'th'
  return {
    floor: th ? 'ที่อื่น' : 'Elsewhere',
    ours: th ? 'ราคากริ๊ง' : 'Kring',
    save: (n: string) => (th ? `เซฟ ${n}` : `save ${n}`),
    free: th ? 'ฟรี' : 'Free',
    walkIn: th ? 'ราคานักท่องเที่ยว' : 'tourist',
  }
}

/**
 * The two-price block. `row` = right-aligned stack on a ticket (FLOOR ฿195 / OURS ฿175 / save ฿20);
 * `tile` = compact (ours big, floor small) for the kit; `inline` = one sentence "Floor ฿195 · ours ฿175 · save ฿20".
 */
export function TwoPrice({ p, language, variant = 'row', pending, testId }: { p: FloorPrice; language: string; variant?: 'row' | 'tile' | 'inline'; pending?: string; testId?: string }) {
  const w = floorWords(language)
  const save = saveThb(p)
  const ours = p.oursThb === 0 ? w.free : bahtLabel(p.oursThb)
  const label = `${w.floor} ${bahtLabel(p.floorThb)} · ${w.ours} ${ours}${save > 0 ? ` · ${w.save(bahtLabel(save))}` : ''}`
  if (variant === 'inline') {
    return (
      <span className="pl-inline" data-testid={testId}>
        <span className="pl-f">{w.floor} <b>{bahtLabel(p.floorThb)}</b></span>
        <span aria-hidden="true">·</span>
        <span className="pl-o">{w.ours} <b>{ours}</b></span>
        {save > 0 ? <em className="pl-s">{w.save(bahtLabel(save))}</em> : null}
      </span>
    )
  }
  if (variant === 'tile') {
    return (
      <span className="pl-tile" aria-label={label} data-testid={testId}>
        <b>{ours}</b>
        <small>{w.floor} {bahtLabel(p.floorThb)}</small>
      </span>
    )
  }
  return (
    <span className="pl-row" aria-label={pending ?? label} data-testid={testId}>
      <span className="pl-f" aria-hidden="true">
        <i>{w.floor}</i> {bahtLabel(p.floorThb)}
      </span>
      {pending ? (
        <b className="pl-pend" aria-hidden="true">{pending}</b>
      ) : (
        <span className="pl-o" aria-hidden="true">
          <i>{w.ours}</i> <b>{ours}</b>
        </span>
      )}
      {save > 0 && !pending ? <em className="pl-s" aria-hidden="true">{w.save(bahtLabel(save))}</em> : null}
    </span>
  )
}

/** Seconds until midnight in Bangkok (UTC+7, no DST) — the deals are Bangkok deals, wherever the phone thinks it is. */
function secsToMidnight(now = Date.now()): number {
  const bkk = Math.floor(now / 1000) + 7 * 3600
  return 86_400 - (((bkk % 86_400) + 86_400) % 86_400)
}

/** Small LED-style deal clock. Ticks once a second; frozen at its first value under reduced motion. */
export function LedClock({ testId }: { testId?: string }) {
  const [left, setLeft] = useState(() => secsToMidnight())
  useEffect(() => {
    if (prefersReducedMotion()) return
    const id = window.setInterval(() => setLeft(secsToMidnight()), 1000)
    return () => window.clearInterval(id)
  }, [])
  const hh = String(Math.floor(left / 3600)).padStart(2, '0')
  const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0')
  const ss = String(left % 60).padStart(2, '0')
  return (
    <span className="pl-led" data-testid={testId} role="timer" aria-label={`${hh}:${mm}:${ss}`}>
      {hh}
      <i>:</i>
      {mm}
      <i>:</i>
      {ss}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* C11 · Arrival kit                                                   */
/* ------------------------------------------------------------------ */
/** demo PromptPay: how long the bank takes to confirm the eSIM payment */
export const ESIM_BANK_MS = 2400

export const ESIM_PLANS = [
  { id: '8d', label: '8 days · 15 GB', short: 'eSIM 15 GB', thb: 185, walkIn: 499 },
  { id: '15d', label: '15 days · 30 GB', short: 'eSIM 30 GB', thb: 329, walkIn: 699 },
] as const

export const ARRIVAL_KIT = [
  { id: 'esim', emoji: '📶', label: ESIM_PLANS[0].short, labelTh: ESIM_PLANS[0].short, thb: ESIM_PLANS[0].thb, walkIn: ESIM_PLANS[0].walkIn, hero: true, floor: FLOOR_PRICES['esim:8d'] },
  { id: 'cab', emoji: '🚕', label: 'Airport cab', labelTh: 'รถจากสนามบิน', thb: 665, walkIn: 1200, hero: false, floor: FLOOR_PRICES['cab:airport'] },
  { id: 'bag', emoji: '🧳', label: 'Bag drop', labelTh: 'ฝากกระเป๋า', thb: 105, walkIn: 200, hero: false, floor: FLOOR_PRICES.bag },
] as const

export function ArrivalKit({
  language,
  onPick,
  onGetKit,
}: {
  language: string
  onPick: (id: (typeof ARRIVAL_KIT)[number]['id']) => void
  onGetKit: () => void
}) {
  const th = language === 'th'
  const total = ARRIVAL_KIT.reduce((a, k) => a + k.thb, 0)
  const floorTotal = ARRIVAL_KIT.reduce((a, k) => a + k.floor.floorThb, 0)
  const [ref, seen] = useFirstView<HTMLElement>(150)
  const [hero, ...rest] = ARRIVAL_KIT
  const tile: Record<string, string> = { esim: sceneEsim, cab: sceneCab, bag: sceneBag }
  return (
    <section ref={ref} className={`cp-kit pl-kit${seen ? ' is-glowing' : ''}`} aria-label="Arrival kit" data-testid="pulse-arrival-kit">
      <div className="h">
        <b>{th ? 'ชุดเพิ่งถึง' : 'Arrival kit'}</b>
        <span className="pl-ends">
          <span className="pl-ends-w">{th ? 'จบคืนนี้' : 'Ends tonight'}</span> <LedClock testId="pulse-deal-clock" />
        </span>
      </div>
      {/* the hero deal is a lit ticket: one key light, notched edges, the two prices side by side */}
      <button
        type="button"
        className={`pl-hero${seen ? ' is-lit' : ''}`}
        data-testid={`pulse-kit-${hero.id}`}
        onClick={() => {
          triggerHaptic('tap')
          onPick(hero.id)
        }}
      >
        <span className="pl-hero-ic" aria-hidden="true">
          <img src={tile[hero.id]} alt="" />
        </span>
        <span className="pl-hero-t">
          <b>{th ? 'eSIM นักท่องเที่ยว · 15 GB' : 'Tourist eSIM · 15 GB'}</b>
          <small>
            <Laser lit={seen}>{bahtLabel(hero.walkIn)}</Laser> {th ? 'ที่สนามบิน' : 'at the airport'}
          </small>
          <small className="pl-src">{th ? `ถูกสุดที่ ${hero.floor.source.th}` : `Floor at ${hero.floor.source.en}`}</small>
        </span>
        <TwoPrice p={hero.floor} language={language} testId="pulse-kit-esim-prices" />
      </button>
      <div className="pl-kit-rows">
        {rest.map((k) => (
          <button
            key={k.id}
            type="button"
            className="pl-kit-row"
            data-testid={`pulse-kit-${k.id}`}
            onClick={() => {
              triggerHaptic('tap')
              onPick(k.id)
            }}
          >
            <span className="pl-kit-ic" aria-hidden="true">
              <img src={tile[k.id]} alt="" />
            </span>
            <span className="pl-kit-t">
              <b>{th ? k.labelTh : k.label}</b>
              <small>{th ? `ถูกสุดที่ ${k.floor.source.th}` : `Floor at ${k.floor.source.en}`}</small>
            </span>
            <TwoPrice p={k.floor} language={language} testId={`pulse-kit-${k.id}-prices`} />
          </button>
        ))}
      </div>
      <button type="button" className="cp-btn cp-btn-gold cp-btn-block pl-kit-cta" data-testid="pulse-bundle-row" onClick={onGetKit}>
        {th ? `รับทั้งชุด · ฿${fmtThb(total)}` : `Get the kit · ฿${fmtThb(total)}`}
        <small>{th ? `ถูกสุดที่อื่น ฿${fmtThb(floorTotal)}` : `floor ฿${fmtThb(floorTotal)}`}</small>
      </button>
    </section>
  )
}

/* ------------------------------------------------------------------ */
/* Ticket stack                                                        */
/* ------------------------------------------------------------------ */
export interface StackTicket {
  id: string
  icon: ReactNode
  title: string
  sub: string
  walkInLabel?: string
  priceLabel: string
  /** NEXT95 · floor vs ours (the walk-in then moves to a secondary struck line under the title) */
  floor?: FloorPrice | null
  pending?: boolean
  testId?: string
  onClick: () => void
}

export function TicketStack({ tickets, testId, label, language = 'en' }: { tickets: StackTicket[]; testId?: string; label: string; language?: string }) {
  const w = floorWords(language)
  const [ref, flat] = useFirstView<HTMLDivElement>(350)
  const [lit, setLit] = useState(false)
  useEffect(() => {
    if (!flat) return
    const id = window.setTimeout(() => setLit(true), prefersReducedMotion() ? 0 : 300)
    return () => window.clearTimeout(id)
  }, [flat])
  return (
    <div ref={ref} className={`cp-stack${flat ? ' is-flat' : ''}`} data-testid={testId} role="list" aria-label={label}>
      {tickets.map((tk) => (
        <button key={tk.id} type="button" role="listitem" className={`cp-tk${tk.pending ? ' is-pending' : ''}`} data-testid={tk.testId} onClick={tk.onClick}>
          <span className="ic" aria-hidden="true">{tk.icon}</span>
          <span className="tx">
            <b>{tk.title}</b>
            <span>{tk.sub}</span>
            {tk.floor && tk.walkInLabel ? (
              <span className="pl-walk">
                {w.walkIn} <Laser lit={lit}>{tk.walkInLabel}</Laser>
              </span>
            ) : null}
          </span>
          {tk.floor ? (
            <span className="pr">
              <TwoPrice p={tk.floor} language={language} pending={tk.pending ? tk.priceLabel : undefined} />
              <span className="sr-only">{tk.priceLabel}</span>
            </span>
          ) : (
            <span className="pr">
              {tk.walkInLabel ? <Laser lit={lit}>{tk.walkInLabel}</Laser> : null}
              <b>{tk.priceLabel}</b>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* C13–C16 · one booking flow                                          */
/* ------------------------------------------------------------------ */
export interface InteractiveBookingPayload {
  itemId: string
  title: string
  rateLabel: string
  rebateCoins: number
  partnerName: string
  partnerUrl: string
  isCab?: boolean
  autoConfirmPass?: boolean
  /** explicit flow; inferred from isCab / itemId when absent */
  kind?: 'ride' | 'esim' | 'table'
  /** ride: destination + pickup + preferred car */
  to?: string
  from?: string
  car?: 'comfort' | 'xl' | 'tuk'
  hostName?: string
}

type RouteZone = 'city' | 'airport' | 'pattaya'

function routeZone(from: string, to: string): RouteZone {
  const s = `${from} ${to}`.toLowerCase()
  if (/pattaya|bali hai/.test(s)) return 'pattaya'
  if (/airport|suvarnabhumi|\bbkk\b|dmk|don mueang/.test(s)) return 'airport'
  return 'city'
}

const CARS: Record<RouteZone, { id: 'comfort' | 'xl' | 'tuk'; emoji: string; label: string; meta: string; thb: number }[]> = {
  city: [
    { id: 'comfort', emoji: '🚗', label: 'Comfort', meta: '4 min · 4 seats', thb: PLAN_ADDON_THB.cab },
    { id: 'xl', emoji: '🚙', label: 'XL', meta: '6 min · 6 seats', thb: 295 },
    { id: 'tuk', emoji: '🛺', label: 'Tuk-tuk', meta: '9 min · fixed price', thb: 165 },
  ],
  airport: [
    { id: 'comfort', emoji: '🚗', label: 'Comfort', meta: 'Gate 4 · tolls in', thb: 665 },
    { id: 'xl', emoji: '🚙', label: 'XL', meta: '6 seats · tolls in', thb: 930 },
  ],
  pattaya: [
    { id: 'comfort', emoji: '🚗', label: 'Comfort', meta: '90 min · tolls in', thb: 1285 },
    { id: 'xl', emoji: '🚙', label: 'XL', meta: '6 seats · tolls in', thb: 1850 },
  ],
}
const STREET: Record<RouteZone, number> = { city: 350, airport: 1200, pattaya: 2000 }

function thaiDriverLine(to: string): string {
  return `รบกวนไปส่งที่ ${to} ครับ/ค่ะ`
}

function clockPlus(min: number): string {
  const d = new Date(Date.now() + min * 60_000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function cleanTitle(t: string): string {
  return t.replace(/^[^\p{L}\p{N}]+/u, '').split('/')[0].trim()
}

/**
 * K4 · B5 — the boarding-pass ticket (Kring): marigold header with the two-ring mark + booking code, the trip set like
 * departure → arrival, a perforated stub with the price, and a QR mode: "Show QR" flips the ticket 180° on rotateY
 * (1000 px perspective, hidden backfaces, spring.gentle) to a big QR with one marigold scan line.
 * The ticket tilts with the finger (pointer) and its sheen follows. Static under reduced motion.
 */
function BoardingPass({ from, to, rows, code, title, price, priceNote, language = 'en' }: { from: string; to: string; rows: [string, string][]; code: string; title?: string; price?: string; priceNote?: string; language?: string }) {
  const th = language === 'th'
  const [tilt, setTilt] = useState<{ rx: number; ry: number; gx: number } | null>(null)
  const [qr, setQr] = useState(false)
  const reduce = prefersReducedMotion()
  return (
    <div className="kp-bpw">
      <div
        className="cp-bpw"
        onPointerMove={(e) => {
          if (reduce) return
          const r = e.currentTarget.getBoundingClientRect()
          const x = (e.clientX - r.left) / r.width - 0.5
          const y = (e.clientY - r.top) / r.height - 0.5
          setTilt({ rx: -y * 8, ry: x * 10, gx: 30 + (x + 0.5) * 60 })
        }}
        onPointerLeave={() => setTilt(null)}
      >
        <div
          className={`cp-bp kp-bp${qr ? ' is-qr' : ''}`}
          data-testid="confirmed-boarding-pass-visual"
          style={tilt ? ({ '--rx': `${tilt.rx}deg`, '--ry': `${tilt.ry}deg`, '--gx': `${tilt.gx}%` } as CSSProperties) : undefined}
        >
          <div className="kp-bp-face kp-bp-front" aria-hidden={qr}>
            <span className="gl" aria-hidden="true" />
            <div className="kp-bp-head">
              <span className="kp-bp-brand" aria-hidden="true">
                <svg width="26" height="16" viewBox="0 0 32 20" fill="none"><circle cx="11" cy="10" r="7.2" stroke="#1B1640" strokeWidth="2.6" /><circle cx="21" cy="10" r="7.2" stroke="#1B1640" strokeWidth="2.6" opacity=".72" /></svg>
                <b>kring</b>
              </span>
              <span className="kp-bp-code">{code}</span>
            </div>
            <div className="a">
              {title ? <b className="kp-bp-title">{title}</b> : null}
              <div className="rt">
                <div>
                  <small>{th ? 'จาก' : 'FROM'}</small>
                  <b>{from}</b>
                </div>
                <em aria-hidden="true" className="kp-bp-dash">
                  <i />✦<i />
                </em>
                <div style={{ textAlign: 'right' }}>
                  <small>{th ? 'ถึง' : 'TO'}</small>
                  <b>{to}</b>
                </div>
              </div>
              <div className="gr">
                {rows.map(([k, v]) => (
                  <div key={k}>
                    <small>{k}</small>
                    {v}
                  </div>
                ))}
              </div>
            </div>
            <div className="perf" aria-hidden="true" />
            <div className="b">
              <span className="kp-bp-price">
                <small>{priceNote ?? (th ? 'ราคากริ๊ง · รวมหมด' : 'KRING PRICE · ALL-IN')}</small>
                <b>{price ?? ''}</b>
              </span>
              <span className="cp-bar" aria-hidden="true" />
            </div>
          </div>
          <div className="kp-bp-face kp-bp-back" aria-hidden={!qr}>
            <span className="kp-bp-qrk">{th ? 'แสดงตอนขึ้นรถ / ที่ร้าน' : 'Show at pickup / the venue'}</span>
            <div className="kp-bp-qr">
              <FakeQr seed={code.length * 7 + 3} testId="boarding-pass-qr" />
              <span className="kp-bp-scan" aria-hidden="true" />
            </div>
            <b className="kp-bp-qrcode">{code}</b>
          </div>
        </div>
      </div>
      <button
        type="button"
        className="kp-bp-flip"
        data-testid="boarding-pass-qr-btn"
        aria-pressed={qr}
        onClick={() => {
          triggerHaptic('light')
          setQr((v) => !v)
        }}
      >
        {qr ? (th ? 'ดูตั๋ว' : 'Show ticket') : th ? 'แสดง QR' : 'Show QR'}
      </button>
    </div>
  )
}

export function PulseBookingFlow({
  booking,
  language,
  onClose,
  onConfirmBooking,
}: {
  booking: InteractiveBookingPayload
  language: string
  onClose: () => void
  onConfirmBooking?: (itemId: string) => void
}) {
  const th = language === 'th'
  const kind: 'ride' | 'esim' | 'table' = booking.kind ?? (booking.isCab ? 'ride' : booking.itemId.includes('esim') ? 'esim' : 'table')
  // 'paying' = the PromptPay request is out and the bank has not confirmed yet (Wei B10: no QR before that)
  const [step, setStep] = useState<'select' | 'paying' | 'done'>(booking.autoConfirmPass ? 'done' : 'select')
  const [shared, setShared] = useState(false)
  const [showSign, setShowSign] = useState(false)

  // ride
  const isAirportItem = /airport|suvarnabhumi|suv/.test(booking.itemId)
  const isPattayaItem = /pattaya/.test(booking.itemId)
  const [from, setFrom] = useState(booking.from ?? (isAirportItem || isPattayaItem ? 'Suvarnabhumi · Gate 4' : 'Hotel · Sukhumvit 11'))
  const [to, setTo] = useState(booking.to ?? (isPattayaItem ? 'Pattaya Beach Road' : isAirportItem ? 'Hotel · Sukhumvit 11' : 'ICONSIAM, Charoen Nakhon'))
  const zone = routeZone(from, to)
  const cars = CARS[zone]
  const [carId, setCarId] = useState<'comfort' | 'xl' | 'tuk'>(booking.car ?? 'comfort')
  const car = cars.find((c) => c.id === carId) ?? cars[0]
  const [lit, setLit] = useState(false)
  useEffect(() => {
    const id = window.setTimeout(() => setLit(true), 500)
    return () => window.clearTimeout(id)
  }, [])

  // eSIM
  const [planId, setPlanId] = useState<(typeof ESIM_PLANS)[number]['id']>('8d')
  const esim = ESIM_PLANS.find((p) => p.id === planId) ?? ESIM_PLANS[0]
  // PromptPay: the activation QR and the saving only exist once the bank confirms (demo: it clears in ~2.4 s)
  useEffect(() => {
    if (kind !== 'esim' || step !== 'paying') return
    const id = window.setTimeout(() => {
      triggerHaptic('success')
      onConfirmBooking?.(booking.itemId)
      const f = FLOOR_PRICES[`esim:${esim.id}`]
      recordTripSaving('esim', f ? f.floorThb : esim.walkIn, esim.thb)
      window.dispatchEvent(new CustomEvent('chon:island', { detail: { text: th ? `จ่ายแล้ว ฿${fmtThb(esim.thb)} · QR พร้อม` : `Paid ฿${fmtThb(esim.thb)} · your QR is ready`, tone: 'green', icon: '📶' } }))
      setStep('done')
    }, ESIM_BANK_MS)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, step])

  // table
  const venueName = cleanTitle(booking.title) || 'Octave Rooftop'
  const SLOTS = ['18:30', '19:00', '19:30', '21:00', '22:00'] as const
  const [slot, setSlot] = useState<string>('19:00')
  const [guests, setGuests] = useState(2)
  const ZONES = [
    { id: 'rail', label: th ? 'ในร้าน' : 'Inside', note: th ? 'รวมแล้ว' : 'Included', extra: 0 },
    { id: 'edge', label: th ? 'ขอบตึกชมวิว' : 'Sunset edge', note: '+฿200', extra: 200 },
    { id: 'lounge', label: th ? 'เลานจ์' : 'Lounge', note: th ? 'ขั้นต่ำ ฿3,000' : 'Min ฿3,000', extra: 0 },
  ] as const
  const [zoneId, setZoneId] = useState<string>('edge')
  const deposit = PLAN_ADDON_THB.table + (ZONES.find((z) => z.id === zoneId)?.extra ?? 0)
  const [px, setPx] = useState(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const sharePass = (title: string, priceLabel: string) => {
    triggerHaptic('success')
    setShared(true)
    onConfirmBooking?.(booking.itemId)
    const payload = { hostName: booking.hostName ?? 'Ploy', title, priceLabel, voucherCode: 'KR-8842', rebateCoins: booking.rebateCoins }
    try {
      window.sessionStorage.setItem('chon_latest_sent_pass', JSON.stringify(payload))
    } catch {
      // ignore
    }
    window.dispatchEvent(new CustomEvent('chon:send-pass-to-chat', { detail: payload }))
    window.dispatchEvent(new CustomEvent('chon:island', { detail: { text: th ? 'แชร์เข้าแชตแล้ว' : 'Shared to chat', tone: 'gold', icon: '🎟' } }))
  }

  const top = (title: string, back?: () => void) => (
    <div className="cp-flow-top">
      <button type="button" className="bk" aria-label={back ? 'Back' : 'Close booking modal'} onClick={() => (triggerHaptic('tap'), back ? back() : onClose())}>
        ‹
      </button>
      <b>{title}</b>
      {back ? (
        <button type="button" className="cp-x" aria-label="Close booking modal" onClick={onClose}>
          ✕
        </button>
      ) : null}
    </div>
  )

  const signBlock = showSign ? (
    <div className="cp-thai-sign" data-testid="uber-inline-thai-driver-sign" lang="th">
      <p className="th">{thaiDriverLine(to)}</p>
      <p className="en">“Please take me to {to}.” · {th ? 'จ่ายผ่านแอปแล้ว' : 'Paid in the app'}</p>
    </div>
  ) : null

  /* ---------------- C15 ride ---------------- */
  if (kind === 'ride' && step === 'select') {
    return (
      <div className="cp-flow" role="dialog" aria-modal="true" aria-label="Ride booking" data-testid="interactive-booking-modal">
        {top(th ? 'เรียกรถ' : 'Ride')}
        <div className="cp-flow-body">
          <div className="cp-rmap" aria-hidden="true">
            <svg viewBox="0 0 216 150" preserveAspectRatio="none">
              <path d="M30 124 C60 116 70 76 104 72 S154 44 186 26" />
            </svg>
            <span className="a" />
            <span className="b" />
          </div>
          <div className="cp-pd">
            <label>
              <i style={{ background: 'var(--success-text)' }} />
              <input data-testid="uber-visible-pickup-input" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Pickup" />
              <small>{th ? 'รับ' : 'Pickup'}</small>
            </label>
            <label>
              <i style={{ background: 'var(--cyan)' }} />
              <input data-testid="uber-visible-dropoff-input" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Drop-off" />
              <small>{zone === 'pattaya' ? '90 min' : zone === 'airport' ? '35 min' : '18 min'}</small>
            </label>
          </div>
          <div className="cp-cars" role="radiogroup" aria-label="Car">
            {cars.map((c) => (
              <button
                key={c.id}
                type="button"
                className="cp-car"
                aria-pressed={car.id === c.id}
                data-testid={c.id === 'comfort' ? 'uber-vehicle-camry' : c.id === 'xl' ? 'uber-vehicle-alphard' : 'uber-vehicle-tuk'}
                onClick={() => {
                  triggerHaptic('select')
                  setCarId(c.id)
                }}
              >
                <em aria-hidden="true">{c.emoji}</em>
                <span className="t">
                  <b>{c.label}</b>
                  <small>{c.meta}</small>
                </span>
                {(() => {
                  const f = floorForRide(zone, c.id)
                  return f && f.oursThb === c.thb ? <TwoPrice p={f} language={language} variant="tile" /> : <b className="p">฿{fmtThb(c.thb)}</b>
                })()}
              </button>
            ))}
          </div>
          <button type="button" className="cp-sign" data-testid="uber-flash-thai-sign-btn" aria-expanded={showSign} onClick={() => setShowSign((v) => !v)}>
            🇹🇭 <b>{th ? 'ป้ายให้คนขับ' : 'Show driver'}</b>
            <span lang="th">ไป {to} ›</span>
          </button>
          {signBlock}
        </div>
        <div className="cp-flow-foot">
          <span className="side">
            {th ? 'นักท่องเที่ยว' : 'Tourist'} <Laser lit={lit}>~฿{fmtThb(STREET[zone])}</Laser>
          </span>
          <button
            type="button"
            className="cp-btn cp-btn-gold"
            data-testid="uber-confirm-pickup-btn"
            onClick={() => {
              triggerHaptic('success')
              onConfirmBooking?.(booking.itemId)
              // ROUND5 · savings are measured against the FLOOR (cheapest app fare tonight), the same baseline as every row
              const f = floorForRide(zone, car.id)
              if (f && f.oursThb === car.thb) recordTripSaving(`ride:${zone}`, f.floorThb, car.thb)
              setShowSign(false)
              setStep('done')
            }}
          >
            {th ? `จอง ${car.label} · ฿${fmtThb(car.thb)}` : `Book ${car.label} · ฿${fmtThb(car.thb)}`}
          </button>
        </div>
      </div>
    )
  }

  /* ---------------- C16 driver → boarding pass ---------------- */
  if (kind === 'ride') {
    const short = (s: string) => {
      const w = s.replace(/^Hotel · /, '').split(/[·,(]/)[0].trim().split(/\s+/)
      return (w[0] && w[0].length >= 5 ? w[0] : w.slice(0, 2).join(' ')).toUpperCase()
    }
    return (
      <div className="cp-flow" role="dialog" aria-modal="true" aria-label="Driver on the way" data-testid="interactive-booking-modal">
        {top(th ? 'คนขับกำลังมา' : 'Driver on the way', () => setStep('select'))}
        <div className="cp-flow-body" data-testid="uber-driver-enroute-card">
          <div className="cp-drv">
            <span className="cp-av is-sm" aria-hidden="true">S</span>
            <span className="t">
              <b>Somchai · 3 min</b>
              <span className="cp-dim">Toyota Altis · silver · ★ 4.9</span>
            </span>
            <span className="cp-plate" lang="th">กข 1234</span>
          </div>
          <div className="cp-eta" aria-hidden="true">
            <i />
          </div>
          <BoardingPass
            language={language}
            from={short(from) || 'HOTEL'}
            to={short(to) || 'VENUE'}
            code="RIDE · KR-4821"
            title={th ? `รถไป ${to}` : `Ride to ${to}`}
            price={`฿${fmtThb(car.thb)}`}
            rows={[
              ['PICKUP', clockPlus(4)],
              ['ARRIVE', clockPlus(zone === 'pattaya' ? 94 : zone === 'airport' ? 39 : 22)],
              ['CAR', car.label],
              ['PLATE', 'กข 1234'],
              ['SEATS', car.id === 'xl' ? '6' : '4'],
              ['DRIVER', 'Somchai ✓'],
            ]}
          />
          <div className="cp-btns">
            <button type="button" className="cp-btn cp-btn-ghost" data-testid="uber-flash-thai-sign-btn" onClick={() => setShowSign((v) => !v)}>
              🇹🇭 {th ? 'ป้ายคนขับ' : 'Driver sign'}
            </button>
            <button
              type="button"
              className="cp-btn cp-btn-gold"
              data-testid="visible-share-pass-in-chat-btn"
              onClick={() => sharePass(`Ride to ${to}`, `฿${fmtThb(car.thb)}`)}
            >
              {shared ? (th ? 'แชร์แล้ว ✓' : 'Shared ✓') : th ? 'แชร์เข้าแชต' : 'Share to chat'}
            </button>
          </div>
          {signBlock}
          <p className="cp-dim" style={{ textAlign: 'center', fontSize: 12.5, margin: 0 }}>
            {th
              ? `การแชร์จะส่งเวลาถึงแบบสดให้ ${booking.hostName ?? 'เธอ'} · ชำระเมื่อขึ้นรถ`
              : `Sharing sends ${booking.hostName ?? 'your local'} your live arrival time · you pay when the ride starts.`}
          </p>
          {shared ? (
            <button
              type="button"
              className="cp-btn cp-btn-ghost"
              data-testid="jump-to-chat-enroute-pass-btn"
              onClick={() => {
                onClose()
                window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'chats' } }))
              }}
            >
              {th ? 'เปิดแชต' : 'Open chat'}
            </button>
          ) : null}
        </div>
      </div>
    )
  }

  /* ---------------- C13 eSIM ---------------- */
  if (kind === 'esim') {
    return (
      <div className="cp-flow" role="dialog" aria-modal="true" aria-label="Tourist eSIM" data-testid="interactive-booking-modal">
        {top(th ? 'อีซิมนักท่องเที่ยว' : 'Tourist eSIM')}
        <div className="cp-flow-body" data-testid="esim-step1-checkout">
          <div className="cp-tc" role="radiogroup" aria-label="Plan" hidden={step !== 'select'}>
            {ESIM_PLANS.map((p) => (
              <button
                key={p.id}
                type="button"
                aria-pressed={planId === p.id}
                data-testid={`esim-plan-${p.id}`}
                onClick={() => {
                  triggerHaptic('select')
                  setPlanId(p.id)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="cp-dep" style={{ background: 'color-mix(in srgb, var(--cyan) 8%, var(--surface-1))' }}>
            <span>
              <b style={{ fontSize: 15 }}>{esim.label}</b>
              <br />
              AIS 5G · {th ? 'มีเบอร์ +66' : '+66 number included'}
              <br />
              <span className="cp-dim">{th ? 'ใช้ได้กับ iPhone XS+ / Pixel 3+' : 'Works on iPhone XS+ / Pixel 3+'}</span>
            </span>
            <span className="r">
              {(() => {
                const f = FLOOR_PRICES[`esim:${esim.id}`]
                return f ? <TwoPrice p={f} language={language} /> : <b className="cp-gold">฿{fmtThb(esim.thb)}</b>
              })()}
              <span className="pl-walk">
                {floorWords(language).walkIn} <Laser lit={lit}>฿{fmtThb(esim.walkIn)}</Laser>
              </span>
            </span>
          </div>
          {step === 'paying' ? (
            <div className="pl-paying" role="status" data-testid="esim-payment-pending">
              <span className="pl-paying-dot" aria-hidden="true" />
              <span>
                <b>{th ? `รอธนาคารยืนยัน ฿${fmtThb(esim.thb)}` : `Waiting for your bank · ฿${fmtThb(esim.thb)}`}</b>
                <small>{th ? 'ส่งคำขอพร้อมเพย์แล้ว · QR จะขึ้นเมื่อเงินเข้า' : 'PromptPay request sent · the QR appears once it clears'}</small>
              </span>
            </div>
          ) : step === 'done' ? (
            <>
              <span className="cp-okline" role="status">
                ✓ {(() => {
                  const f = FLOOR_PRICES[`esim:${esim.id}`]
                  const under = f ? saveThb(f) : esim.walkIn - esim.thb
                  return th ? `จ่ายแล้ว ฿${fmtThb(esim.thb)} · ถูกกว่าที่อื่น ฿${fmtThb(under)}` : `Paid ฿${fmtThb(esim.thb)} · ฿${fmtThb(under)} under the cheapest elsewhere`
                })()}
              </span>
              <span className="cp-lab" style={{ textAlign: 'center' }}>{th ? 'สแกนเพื่อเปิดใช้' : 'Scan to activate'}</span>
              <FakeQr seed={11} testId="esim-activation-qr" />
              <div className="cp-steps cp-hr">
                <div>
                  <b>1</b>
                  {th ? 'ตั้งค่า → มือถือ → เพิ่ม eSIM' : 'Settings → Mobile → Add eSIM'}
                </div>
                <div>
                  <b>2</b>
                  {th ? 'สแกนโค้ดนี้ · เปิดโรมมิ่งข้อมูล' : 'Scan this code · turn data roaming on'}
                </div>
              </div>
            </>
          ) : (
            <div className="cp-steps cp-hr">
              <div>
                <b>⚡</b>
                {th ? 'QR พร้อมทันทีหลังจ่าย' : 'QR ready the moment you pay'}
              </div>
              <div>
                <b>☎</b>
                {th ? 'มีเบอร์ไทยสำหรับ Grab และ LINE' : 'Thai number for Grab & LINE'}
              </div>
            </div>
          )}
        </div>
        <div className="cp-flow-foot">
          {step === 'done' ? (
            <button
              type="button"
              className="cp-btn cp-btn-gold"
              data-testid="complete-step2-rebate-btn"
              onClick={() => {
                triggerHaptic('success')
                window.dispatchEvent(new CustomEvent('chon:island', { detail: { text: th ? 'เปิดตั้งค่า eSIM แล้ว' : 'Opening eSIM setup', tone: 'green', icon: '📶' } }))
                onClose()
              }}
            >
              {th ? 'ติดตั้งในเครื่องนี้' : 'Install on this phone'}
            </button>
          ) : step === 'paying' ? (
            <button type="button" className="cp-btn cp-btn-gold" disabled aria-disabled="true" data-testid="esim-waiting-bank-btn">
              {th ? 'รอธนาคารยืนยัน…' : 'Waiting for your bank…'}
            </button>
          ) : (
            <button
              type="button"
              className="cp-btn cp-btn-gold"
              data-testid="esim-confirm-activate-btn"
              onClick={() => {
                triggerHaptic('tap')
                setStep('paying')
              }}
            >
              {th ? `จ่าย ฿${fmtThb(esim.thb)} ด้วยพร้อมเพย์` : `Pay ฿${fmtThb(esim.thb)} with PromptPay`}
            </button>
          )}
        </div>
      </div>
    )
  }

  /* ---------------- C14 table ---------------- */
  return (
    <div className="cp-flow" role="dialog" aria-modal="true" aria-label="Book a table" data-testid="interactive-booking-modal">
      {top(th ? 'จอง' : 'Reserve', step === 'done' ? () => setStep('select') : undefined)}
      <div className="cp-flow-body" data-testid="venue-step1-checkout">
        <div
          className="cp-hero"
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            setPx(((e.clientX - r.left) / r.width - 0.5) * -14)
          }}
          onPointerLeave={() => setPx(0)}
        >
          <span className="cp-sky" aria-hidden="true" style={{ '--px': `${px}px` } as CSSProperties} />
          <b>{venueName}</b>
          <span>{th ? 'ร้านมีใบอนุญาต · เปิดถึง 02:00' : 'Licensed venue · open till 02:00'}</span>
        </div>
        {step === 'select' ? (
          <>
            <span className="cp-lab">{th ? 'คืนนี้' : 'Tonight'}</span>
            <div className="cp-tc" role="radiogroup" aria-label="Time">
              {SLOTS.map((s) => (
                <button key={s} type="button" aria-pressed={slot === s} disabled={s === '22:00'} data-testid={`venue-time-${s}`} onClick={() => (triggerHaptic('select'), setSlot(s))}>
                  {s}
                </button>
              ))}
            </div>
            <span className="cp-lab">{th ? 'จำนวนคน' : 'Party'}</span>
            <div className="cp-stepper">
              <span>{th ? 'แขก' : 'Guests'}</span>
              <div>
                <button type="button" aria-label="Fewer guests" disabled={guests <= 1} onClick={() => setGuests((g) => Math.max(1, g - 1))}>
                  −
                </button>
                <b aria-live="polite">{guests}</b>
                <button type="button" aria-label="More guests" disabled={guests >= 8} onClick={() => setGuests((g) => Math.min(8, g + 1))}>
                  +
                </button>
              </div>
            </div>
            <span className="cp-lab">{th ? 'โซน' : 'Zone'}</span>
            <div className="cp-zone" role="radiogroup" aria-label="Zone">
              {ZONES.map((z) => (
                <button key={z.id} type="button" aria-pressed={zoneId === z.id} onClick={() => (triggerHaptic('select'), setZoneId(z.id))}>
                  {z.label}
                  <small>{z.note}</small>
                </button>
              ))}
            </div>
            <div className="cp-dep">
              <span>
                {th ? 'มัดจำ หักจากบิล' : 'Deposit, comes off your bill'}
                <br />
                <span className="cp-dim">{th ? 'ยกเลิกฟรีถึง 17:00' : 'Free cancel until 17:00'}</span>
              </span>
              <b>฿{fmtThb(deposit)}</b>
            </div>
          </>
        ) : (
          <>
            <span className="cp-okline" role="status">
              ✓ {th ? `ส่งคำขอมัดจำ ฿${fmtThb(deposit)} แล้ว · ร้านยืนยันเมื่อชำระ` : `Deposit request sent · ฿${fmtThb(deposit)} · the venue confirms once it clears`}
            </span>
            <BoardingPass
              language={language}
              from={slot}
              to={venueName.split(' ')[0].toUpperCase()}
              code="TABLE · KR-8842"
              title={venueName}
              price={`฿${fmtThb(deposit)}`}
              priceNote={th ? 'มัดจำ · หักจากบิล' : 'DEPOSIT · COMES OFF THE BILL'}
              rows={[
                ['GUESTS', String(guests)],
                ['ZONE', ZONES.find((z) => z.id === zoneId)?.label ?? ''],
                ['TIME', slot],
              ]}
            />
          </>
        )}
      </div>
      <div className="cp-flow-foot">
        {step === 'select' ? (
          <button
            type="button"
            className="cp-btn cp-btn-gold"
            data-testid="venue-confirm-reservation-btn"
            onClick={() => {
              triggerHaptic('success')
              onConfirmBooking?.(booking.itemId)
              setStep('done')
            }}
          >
            {th ? `จองโต๊ะ · ฿${fmtThb(deposit)}` : `Hold table · ฿${fmtThb(deposit)}`}
          </button>
        ) : (
          <button
            type="button"
            className="cp-btn cp-btn-gold"
            data-testid="visible-share-pass-in-chat-btn"
            onClick={() => sharePass(`${venueName} · ${slot} · ${guests} guests`, `฿${fmtThb(deposit)} deposit`)}
          >
            {shared ? (th ? 'แชร์แล้ว ✓' : 'Shared to chat ✓') : th ? 'แชร์เป็นแผนในแชต' : 'Share as the plan in chat'}
          </button>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* C17 · Scam check                                                    */
/* ------------------------------------------------------------------ */
type ScamKind = 'taxi' | 'tuk' | 'bar'

function fairRange(kind: ScamKind, text: string): [number, number, string] {
  const s = text.toLowerCase()
  if (kind === 'taxi') {
    if (/airport|suvarnabhumi|\bbkk\b|dmk|don mueang/.test(s))
      return [300, 400, 'Airport → Sukhumvit on the meter is about ฿350 plus a ฿50 airport fee and tolls. Say “meter, please” or book a fixed price.']
    if (/pattaya/.test(s)) return [1100, 1500, 'Bangkok ⇄ Pattaya by car is about ฿1,200 with tolls. Agree the price before you leave, or book a fixed one.']
    return [80, 150, 'Across town on the meter is ฿80–150. Say “meter, please” (กดมิเตอร์ด้วยครับ) or book a fixed price.']
  }
  if (kind === 'tuk') return [80, 120, 'Short tuk-tuk hops are ฿80–120. Never accept a “free tour” stop.']
  return [350, 650, 'Rooftop cocktails run ฿350–650 each. Ask for the menu price before you order.']
}

export function ScamCheckFlow({
  language,
  onClose,
  onBookFixed,
}: {
  language: string
  onClose: () => void
  onBookFixed: (kind: ScamKind, fromAirport: boolean) => void
}) {
  const th = language === 'th'
  const [kind, setKind] = useState<ScamKind>('taxi')
  const [quote, setQuote] = useState('Taxi to Sukhumvit from the airport, ฿1,500, no meter')
  const [checked, setChecked] = useState(true)
  const amount = useMemo(() => {
    const m = quote.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/)
    return m ? Number(m[1]) : null
  }, [quote])
  const [lo, hi, advice] = fairRange(kind, quote)
  const bad = amount !== null && amount > hi * 1.3
  const times = amount !== null ? amount / ((lo + hi) / 2) : 0
  const markerPct = amount === null ? 0 : Math.min(97, Math.max(3, (amount / hi) * 34))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="cp-flow" role="dialog" aria-modal="true" aria-label="Scam check" data-testid="pulse-scam-check">
      <div className="cp-flow-top">
        <button type="button" className="bk" aria-label="Close scam check" onClick={onClose}>
          ‹
        </button>
        <b>{th ? 'เช็คราคาโกง' : 'Scam check'}</b>
        <button
          type="button"
          className="cp-x"
          aria-label="How we know the fair price"
          onClick={() => window.dispatchEvent(new CustomEvent('chon:open-guide', { detail: { id: 'pulse', page: 2 } }))}
        >
          ?
        </button>
      </div>
      <div className="cp-flow-body">
        <div className="cp-paste">
          <span className="cp-lab">{th ? 'ราคาที่เขาบอก' : 'The quote you got'}</span>
          <textarea
            data-testid="scam-ai-custom-input"
            value={quote}
            onChange={(e) => {
              setQuote(e.target.value)
              setChecked(false)
            }}
            aria-label="Quote"
            placeholder={th ? 'เช่น ตุ๊กตุ๊ก 400 บาท' : 'e.g. Tuk-tuk asking ฿400'}
          />
          <div className="cp-chips" role="radiogroup" aria-label="What is it">
            {(
              [
                ['taxi', th ? 'แท็กซี่' : 'Taxi'],
                ['tuk', th ? 'ตุ๊กตุ๊ก' : 'Tuk-tuk'],
                ['bar', th ? 'บิลบาร์' : 'Bar bill'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => (triggerHaptic('select'), setKind(k), setChecked(false))}>
                {l}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="cp-btn cp-btn-gold"
            data-testid="scam-ai-check-btn"
            onClick={() => {
              triggerHaptic(bad ? 'warning' : 'success')
              setChecked(true)
            }}
          >
            {th ? 'เช็คราคา' : 'Check price'}
          </button>
        </div>

        {checked && amount === null ? (
          <p className="cp-dim" style={{ fontSize: 14, margin: 0 }}>{th ? 'ใส่ตัวเลขราคาด้วย เช่น 400' : 'Add the price they quoted, e.g. 400.'}</p>
        ) : null}

        {checked && amount !== null ? (
          <div className={`cp-vd ${bad ? 'is-bad' : 'is-good'}`} data-testid="scam-ai-custom-verdict" role="status">
            <div className="v">
              <i aria-hidden="true">{bad ? '!' : '✓'}</i>
              <b>{bad ? (th ? `แพงไป ${Math.max(2, Math.round(times))} เท่า` : `${Math.max(2, Math.round(times))}× too high`) : th ? 'ราคาโอเค' : 'Fair price'}</b>
            </div>
            <div className="cp-meter" aria-hidden="true">
              <i style={{ left: `${markerPct}%` }} />
            </div>
            <div className="cp-mlab">
              <span>
                {th ? 'ราคาปกติ' : 'FAIR'} ฿{fmtThb(lo)}–{fmtThb(hi)}
              </span>
              <span>
                {th ? 'ที่เขาบอก' : 'QUOTE'} ฿{fmtThb(amount)}
              </span>
            </div>
            <p>{advice}</p>
            {bad && kind !== 'bar' ? (
              <button type="button" className="cp-btn cp-btn-gold" data-testid="scam-book-fixed-btn" onClick={() => onBookFixed(kind, /airport|suvarnabhumi|\bbkk\b|dmk/.test(quote.toLowerCase()))}>
                {/airport|suvarnabhumi|\bbkk\b/.test(quote.toLowerCase())
                  ? th ? 'จองราคาตายตัว · ฿665' : 'Book fixed · ฿665 airport cab'
                  : th ? 'จองรถราคาตายตัว' : 'Book a fixed-price ride'}
              </button>
            ) : null}
          </div>
        ) : null}

        <button
          type="button"
          className="cp-link"
          data-testid="scam-safety-center-link"
          onClick={() => {
            triggerHaptic('tap')
            window.dispatchEvent(new CustomEvent('chon:open-safety', { detail: { section: 'driver' } }))
          }}
        >
          <span>{th ? 'การ์ดคนขับ · 1155 · แชร์ทริป' : 'Driver card · 1155 · share trip'}</span>
          <b>{th ? 'ศูนย์ความปลอดภัย ›' : 'Safety Center ›'}</b>
        </button>
      </div>
    </div>
  )
}
