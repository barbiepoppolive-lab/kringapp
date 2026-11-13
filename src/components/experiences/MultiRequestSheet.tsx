import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import HostPhoto from '../ui/HostPhoto'
import { HeartIcon, VerifiedTick } from './LocalCard'
import { triggerHaptic } from '../../lib/haptics'
import { showIsland } from '../fx/island'
import { isSelf } from '../../lib/selfGuard'
import { togglePin } from '../../lib/pins'
import { t as lx } from '../../lib/lexicon'
import {
  durationLabel,
  experiencePhoto,
  localPriceFor,
  shortTitle,
  shortTitleTh,
  useCity,
  venueFor,
  venueIn,
  type Experience,
  type LocalProfile,
} from '../../lib/experiences'
import {
  OFFER_REPLY_MS,
  effectiveMultiStatus,
  offerMsLeft,
  offerStage,
  releaseMultiRequest,
  requestMany,
  usePlanStore,
  type MultiRequest,
  type Offer,
} from '../../lib/planStore'
import { STAGGER } from '../../design/motion'
import { BALANCE_EVENT, lastKnownBalance, TOPUP_DONE_EVENT } from '../vip/walletKit'
import BookingCard from '../booking/BookingCard'
import { currentViewerId, effectiveOfferStatus, offersBetween, partnerKey } from '../../lib/planStore'
import { useFloatRef } from '../../design/floating'
import './experiences.css'

/** "Bee", "Bee and Kwan", "Bee, Kwan and Ken" */
const listEn = (xs: string[]) => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const listTh = (xs: string[]) => (xs.length < 3 ? xs.join(' และ ') : `${xs.slice(0, -1).join(' ')} และ ${xs[xs.length - 1]}`)
/** first-accept-wins choreography (Marco 7 / FIX2 Marco 5): the winner lights first, then each other local's
 *  "No charge" (text + stamp) follows WIN_LEAD_MS later and WIN_STEP_MS apart, then the ticket folds up. */
const WIN_STEP_MS = STAGGER.base * 3
const WIN_LEAD_MS = 240
const TICKET_AFTER_MS = 160

/**
 * Kring · MultiRequestSheet — "Book a local" / "Ask several locals" (K2; round 2 A3 + A4, round 3 R1 phone 2). This is
 * THE booking sheet (FIX2): profile "Book", experience detail, story "Book" and the Locals chips all open it via
 * `kring:book-local`; there is no second "offer" button to the old ClinkGiftSheet.
 *
 * Compose: the experience, the venue, when, who ("Just me"; "+ friends" is the quiet control), the price, then the
 * locals who host it — Saved ♥ first — each with a tick. One local → "Book Ploy"; several → "Ask 3 locals at once".
 * Pinned locals who don't host the experience are listed greyed ("Doesn't host this · not asked"), never dropped.
 * Send = K3's `requestMany(experienceId, localIds, amount, opts)`: ONE hold, one 10-minute request per local.
 * Live: a stack of cards, each with its own 10-minute ring and a status (Sent · Seen · Typing… · Accepted). The first
 * to accept gets it; the others are stamped "Released" and slide away (K3's store releases them, no charge), then the
 * ticket folds up. Nobody answers → the one hold comes back once ("Nothing was charged").
 *
 * Price: one offer goes to every ticked local. It starts at the highest "from" price among them (so any of them can
 * say yes) and the guest can lower it (− / +). Everything else (counter, suggest a change) happens in chat.
 * Self-guard: your own profile is never in the list; K3's store drops it too.
 * Money: never touched here — requestMany / releaseMultiRequest own the hold.
 */
export interface RequestLocal {
  id: string
  name: string
  photo: string
  profile: LocalProfile
  pinned: boolean
  live?: boolean
}

export interface MultiRequestSheetProps {
  open: boolean
  onClose: () => void
  experience: Experience
  locals: RequestLocal[]
  /** ticked when the sheet opens (a card's local, or the pinned locals) */
  initialSelected: string[]
  /** 'single' = R1 "Book a local" hero for the first selected local */
  mode?: 'single' | 'multi'
  /** FIX2 · Wei 56 — pinned locals who don't host this experience: shown (not asked), never dropped silently */
  notHosting?: RequestLocal[]
  language?: string
  /** "Make an offer · เสนอราคา" → the Offer card (K3) for that local */
  onOffer?: (localId: string, ctx: OfferContext) => void
  /** open the chat with the winner */
  onOpenChat?: (localId: string, name: string) => void
}

export interface OfferContext {
  experienceId: string
  experienceTitle: string
  fromThb: number
  venue: string
  date: string
  start: string
  end: string
  groupSize: number
}

const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function addHours(start: string, h: number): string {
  const [hh, mm] = start.split(':').map(Number)
  const t = (hh * 60 + mm + Math.round(h * 60)) % (24 * 60)
  return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`
}
function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000)
  return `${Math.floor(s / 60)}:${pad(s % 60)}`
}
const TIMES = ['09:00', '11:00', '14:00', '17:00', '18:30']

function dayChips(th: boolean, now = new Date()) {
  const out: Array<{ id: string; label: string; long: string }> = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i)
    const wd = d.toLocaleDateString(th ? 'th-TH' : 'en-GB', { weekday: 'short' })
    const long = d.toLocaleDateString(th ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
    out.push({ id: ymd(d), label: i === 0 ? (th ? 'วันนี้' : 'Today') : i === 1 ? (th ? 'พรุ่งนี้' : 'Tomorrow') : `${wd} ${d.getDate()}`, long })
  }
  return out
}

export default function MultiRequestSheet({
  open,
  onClose,
  experience: e,
  locals: allLocals,
  initialSelected,
  mode = 'multi',
  notHosting = [],
  language = 'en',
  onOpenChat,
}: MultiRequestSheetProps) {
  const th = language === 'th'
  const [city] = useCity()
  const locals = useMemo(() => allLocals.filter((l) => !isSelf(l.id) && !isSelf(l.name)), [allLocals])
  const [selected, setSelected] = useState<string[]>(() => initialSelected.filter((id) => locals.some((l) => l.id === id)))
  const days = useMemo(() => dayChips(th), [th])
  const [date, setDate] = useState(days[Math.min(2, days.length - 1)].id)
  // FIX1 · the default slot fits the experience: long days start in the morning, night markets / evenings at 18:30
  const [start, setStart] = useState(e.hours >= 5 ? '09:00' : e.group === 'evenings' || /night|sunset|dinner/i.test(e.title) ? '18:30' : '14:00')
  const [friends, setFriends] = useState(0)
  const [showFriends, setShowFriends] = useState(false)
  const [multiId, setMultiId] = useState<string | null>(null)
  const [short, setShort] = useState(false)
  // FIX3 · Wei 1 — the shortfall is live: it follows the wallet and clears the moment cash covers the price
  const [cashThb, setCashThb] = useState<number | null>(() => {
    const b = lastKnownBalance()
    return b ? Math.floor(b.paidCoins / 100) : null
  })
  useEffect(() => {
    const read = () => {
      const b = lastKnownBalance()
      if (b) setCashThb(Math.floor(b.paidCoins / 100))
    }
    window.addEventListener(BALANCE_EVENT, read)
    window.addEventListener(TOPUP_DONE_EVENT, read)
    return () => {
      window.removeEventListener(BALANCE_EVENT, read)
      window.removeEventListener(TOPUP_DONE_EVENT, read)
    }
  }, [])
  const [closing, setClosing] = useState(false)
  // FIX2 · Marco 6 — the money button shows "Sending…" on the frame of the tap; the hold + requests run after paint
  const [sending, setSending] = useState(false)
  const sendingRef = useRef(false)

  const picked = locals.filter((l) => selected.includes(l.id))
  const lead = mode === 'single' ? locals.find((l) => l.id === initialSelected[0]) ?? picked[0] : undefined
  const prices = picked.map((l) => localPriceFor(l.profile, e.id))
  const suggested = prices.length ? Math.max(...prices) : e.fromThb
  const [price, setPrice] = useState<number | null>(null)
  const amount = price ?? suggested
  const end = addHours(start, e.hours)
  const title = th ? shortTitleTh(e) : shortTitle(e)
  // FIX2 · Wei 56/70 — the venue is always a real, named place: the local's own licensed venue when she hosts this
  // there (Mint's salon, Ken's gym), else the experience's meeting point in this city ("Siam Paragon beauty floor
  // (4F), Siam"), never a category like "Salon in a mall".
  // FIX3 · Wei 3 — one rule everywhere (`venueFor`): her own licensed venue when this experience happens there, else
  // the experience's meeting point. Several locals with different places → each row says where, the plan says so.
  const venueOf = (l: RequestLocal) => venueFor(l.profile, e, l.profile.city ?? city)
  const pickedVenues = picked.map(venueOf)
  const sameVenue = pickedVenues.length > 0 && pickedVenues.every((v) => v.en === pickedVenues[0].en)
  const leadVenue = lead ? venueOf(lead) : sameVenue ? pickedVenues[0] : { ...venueIn(e, city), own: false }
  const ownVenue = leadVenue.own
  const mixedVenues = !lead && picked.length > 1 && !sameVenue
  const venue = mixedVenues ? (th ? 'ที่ของโลคอลแต่ละคน' : 'Each local’s own place') : th ? leadVenue.th : leadVenue.en
  const venueFor1 = (id: string) => {
    const l = locals.find((x) => x.id === id)
    return l ? (th ? venueOf(l).th : venueOf(l).en) : venue
  }
  const licensed = lead?.profile.licensed ?? (e.plusVenue === 'spa' || e.plusVenue === 'gym' || e.plusVenue === 'school' ? e.plusVenue : undefined)
  const dayLong = days.find((d) => d.id === date)?.long ?? date
  const needThb = Math.max(1, amount - Math.max(0, cashThb ?? 0))
  const shortNow = short && (cashThb === null || cashThb < amount)
  const openTopUp = (need: number) =>
    window.dispatchEvent(
      new CustomEvent('chon:open-topup', {
        detail: { reason: 'request', needThb: need },
      }),
    )

  useEffect(() => {
    if (!open) return
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open || typeof document === 'undefined') return null

  // KRING VISUAL V2 · V3 — one local: "Book" just pops up THE card (the same record the chat docks above the composer)
  if (mode === 'single' && lead) {
    return createPortal(
      <BookCardSheet
        experience={e}
        lead={lead}
        title={title}
        date={date}
        start={start}
        venue={th ? leadVenue.th : leadVenue.en}
        venueNote={ownVenue ? (th ? `${lead.name} รับที่นี่ · ธุรกิจมีใบอนุญาต` : `${lead.name} hosts here · licensed business`) : undefined}
        priceThb={localPriceFor(lead.profile, e.id)}
        th={th}
        closing={closing}
        onClose={() => close()}
        onSent={() => {
          showIsland(th ? `ส่งคำขอถึง ${lead.name} แล้ว · 10 นาที` : `Request sent to ${lead.name} · 10 min to reply`, 'gold')
          onOpenChat?.(lead.id, lead.name)
          close()
        }}
        onOpenChat={() => {
          onOpenChat?.(lead.id, lead.name)
          close()
        }}
      />,
      document.body,
    )
  }

  function close() {
    setClosing(true)
    window.setTimeout(onClose, 220)
  }

  const toggle = (id: string) => {
    triggerHaptic('select')
    setPrice(null)
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]))
  }

  const send = () => {
    if (!picked.length || sending || sendingRef.current) return
    sendingRef.current = true
    triggerHaptic('select')
    setSending(true)
    // paint the pressed / "Sending…" state first, then do the store work (hold, one offer per local, chat lines)
    const run = () => {
      try {
        doSend()
      } finally {
        sendingRef.current = false
        setSending(false)
      }
    }
    if (typeof window.requestAnimationFrame === 'function' && import.meta.env.MODE !== 'test') window.requestAnimationFrame(() => window.setTimeout(run, 0))
    else run()
  }

  const doSend = () => {
    const m = requestMany(e.id, picked.map((l) => l.id), amount, {
      experienceTitle: title,
      localNames: Object.fromEntries(picked.map((l) => [l.id, l.name])),
      fromThb: Object.fromEntries(picked.map((l) => [l.id, localPriceFor(l.profile, e.id)])),
      // untouched price + several locals: each is asked at their own from-price; the hold is the highest one
      ...(price === null && picked.length > 1 ? { pricesThb: Object.fromEntries(picked.map((l) => [l.id, localPriceFor(l.profile, e.id)])) } : {}),
      // mixed places: the store keeps the experience's meeting point; the sheet's ticket names the winner's own place
      // FIX3 · each local's own place is stored on her own child offer (requestMany `venues`)
      venues: Object.fromEntries(picked.map((l) => [l.id, th ? venueOf(l).th : venueOf(l).en])),
      terms: { date, start, end, venue: mixedVenues ? (th ? venueIn(e, city).th : venueIn(e, city).en) : venue, groupSize: 1 + friends },
    })
    if (!m) {
      triggerHaptic('error')
      setShort(true)
      // FIX3 · Wei 2 — open the top-up for them, the missing cash pre-filled (the line stays as the way back)
      const b = lastKnownBalance()
      const cash = b ? Math.floor(b.paidCoins / 100) : 0
      if (b) setCashThb(cash)
      openTopUp(Math.max(1, amount - cash))
      window.setTimeout(() => document.querySelector('[data-testid="mr-short"]')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }), 30)
      return
    }
    triggerHaptic('success')
    setShort(false)
    setMultiId(m.id)
    showIsland(
      picked.length === 1
        ? th ? `ส่งคำขอถึง ${picked[0].name} แล้ว · 10 นาที` : `Request sent to ${picked[0].name} · 10 min to reply`
        : th ? `ส่งถึงโลคอล ${picked.length} คน · 10 นาที` : `Sent to ${picked.length} locals · 10 min to reply`,
      'gold',
    )
  }

  const pinnedRows = locals.filter((l) => l.pinned)
  const otherRows = locals.filter((l) => !l.pinned)
  // FIX2 · one verb: "Book Kwan" (one local) · "Ask 2 locals at once" (several, first to accept gets it)
  const ctaLabel = sending
    ? th ? 'กำลังส่ง…' : 'Sending…'
    : picked.length === 0
      ? th ? 'เลือกโลคอลอย่างน้อย 1 คน' : 'Pick at least one local'
      : picked.length === 1
        ? th ? `${lx('make.offer', 'th')} ${picked[0].name}` : `${lx('make.offer', 'en')} ${picked[0].name}`
        : th ? `ทักพร้อมกัน ${picked.length} คน` : `Ask ${picked.length} locals at once`
  const sheetTitle = mode === 'single' ? (th ? 'จองโลคอล' : 'Book a local') : th ? 'ทักหลายโลคอล' : 'Ask several locals'

  return createPortal(
    <div
      className={`kx-page kx-mr${closing ? ' is-closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={sheetTitle}
      data-testid="multi-request-sheet"
    >
      <header className="kx-page-top">
        <button type="button" className="kx-back m-press" aria-label={th ? 'กลับ' : 'Back'} onClick={close}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <h2 className="kx-page-title">
          {multiId ? (th ? 'คำขอของคุณ' : 'Your request') : sheetTitle}
        </h2>
      </header>

      {multiId ? (
        <LiveRequests
          multiId={multiId}
          locals={locals}
          title={title}
          when={`${dayLong} · ${start}`}
          venueOf={venueFor1}
          language={language}
          onOpenChat={(id, name) => {
            onOpenChat?.(id, name)
            close()
          }}
          onAgain={() => setMultiId(null)}
          onDone={close}
        />
      ) : (
        <>
          <div className="kx-page-scroll">
            {lead ? (
              <div className="kx-mr-hero">
                <HostPhoto src={lead.photo} name={lead.name} className="kx-mr-hero-ph" imgClassName="kx-cover" />
                <span className="kx-lc-fade" aria-hidden="true" />
                <span className="kx-pill kx-pill-live">
                  <i aria-hidden="true" />
                  {lead.live ? (th ? 'ออนไลน์อยู่' : 'Live') : th ? 'โลคอล' : 'Local'} · {th ? `ตอบใน ~${lead.profile.replyMin} นาที` : `replies in ~${lead.profile.replyMin} min`}
                </span>
                <div className="kx-mr-hero-meta">
                  <b className="kx-mr-hero-name">
                    {lead.name} <VerifiedTick />
                  </b>
                  <small>
                    {th ? 'โลคอลตัวจริง' : 'Verified local'} · ★ {lead.profile.rating.toFixed(1)} · {lead.profile.done} {th ? 'ทริป' : 'experiences'} · {lead.profile.langs.slice(0, 2).join(' · ')}
                  </small>
                </div>
              </div>
            ) : (
              <div className="kx-mr-exp">
                <span className="kx-art kx-art-sm has-photo" data-group={e.group} aria-hidden="true">
                  <img
                    className="kx-art-img"
                    src={experiencePhoto(e)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    draggable={false}
                    onError={(ev) => {
                      ev.currentTarget.style.display = 'none'
                      ev.currentTarget.parentElement?.classList.remove('has-photo')
                    }}
                  />
                  <span className="kx-art-glyph">{e.emoji}</span>
                </span>
                <span>
                  <b>{title}</b>
                  <small>
                    {dayLong} · {start} · {durationLabel(e.hours, language)} · {friends ? (th ? `คุณ + ${friends}` : `you + ${friends}`) : th ? 'มาคนเดียว' : 'just me'}
                  </small>
                </span>
              </div>
            )}

            <p className="kx-eyebrow">{lead ? (th ? `คุณกำลังจอง ${lead.name} สำหรับ` : `You're booking ${lead.name} for`) : th ? 'รายละเอียด' : 'The plan'}</p>
            <div className="kx-fields">
              {lead && (
              <div className="kx-field">
                <span className="kx-field-k">{th ? 'ทริป' : 'Experience'}</span>
                <span className="kx-field-v">
                  <b>{title}</b>
                  <small>{durationLabel(e.hours, language)}{e.plusVenue ? (th ? ' · + ค่าสถานที่' : ` · + ${e.plusVenue} fee`) : ''}</small>
                </span>
              </div>
              )}
              <div className="kx-field">
                <span className="kx-field-k">{th ? 'สถานที่' : 'Venue'}</span>
                <span className="kx-field-v">
                  <b>{venue}</b>
                  <small>
                    {mixedVenues
                      ? th ? 'แต่ละคนรับที่ร้านของตัวเอง · ดูด้านล่าง · ตั๋วจะบอกที่ของคนที่รับ' : 'Shown under each local · your ticket names the one who says yes'
                      : ownVenue
                        ? th ? `${lead?.name ?? picked[0]?.name} รับที่นี่ · ธุรกิจมีใบอนุญาต` : `${lead?.name ?? picked[0]?.name} hosts here · licensed business`
                        : th ? 'จุดนัดพบ · ที่สาธารณะ' : 'Meeting point · public place'}
                  </small>
                </span>
                {licensed && <span className="kx-badge-ok">✓ {th ? 'มีใบอนุญาต' : `Licensed ${licensed}`}</span>}
              </div>
              <div className="kx-field is-col">
                <span className="kx-field-k">{th ? 'เมื่อไร' : 'When'}</span>
                <div className="kx-chips-x" role="radiogroup" aria-label={th ? 'วัน' : 'Day'}>
                  {days.map((d) => (
                    <button key={d.id} type="button" role="radio" aria-checked={date === d.id} className="kx-mini m-press" onClick={() => { triggerHaptic('select'); setDate(d.id) }}>
                      {d.label}
                    </button>
                  ))}
                </div>
                <div className="kx-chips-x" role="radiogroup" aria-label={th ? 'เวลา' : 'Start time'}>
                  {TIMES.map((tm) => (
                    <button key={tm} type="button" role="radio" aria-checked={start === tm} className="kx-mini m-press" onClick={() => { triggerHaptic('select'); setStart(tm) }}>
                      {tm}
                    </button>
                  ))}
                </div>
                <small className="kx-field-note">{dayLong} · {start}–{end}</small>
              </div>
              <div className="kx-field">
                <span className="kx-field-k">{th ? 'ใคร' : 'Who'}</span>
                <span className="kx-field-v">
                  <b>{friends ? (th ? `คุณ + เพื่อน ${friends}` : `You + ${friends}`) : th ? 'มาคนเดียว' : 'Just me'}</b>
                </span>
                {showFriends ? (
                  <span className="kx-step" role="group" aria-label={th ? 'จำนวนเพื่อน' : 'Friends'}>
                    <button type="button" className="m-press" aria-label={th ? 'ลดเพื่อน' : 'Fewer friends'} disabled={friends === 0} onClick={() => setFriends((f) => Math.max(0, f - 1))}>−</button>
                    <b aria-live="polite">{friends}</b>
                    <button type="button" className="m-press" aria-label={th ? 'เพิ่มเพื่อน' : 'More friends'} disabled={friends >= 5} onClick={() => setFriends((f) => Math.min(5, f + 1))}>+</button>
                  </span>
                ) : (
                  <button type="button" className="kx-quiet m-press" data-testid="plus-friends" onClick={() => { triggerHaptic('select'); setShowFriends(true) }}>
                    {lx('plus.friends', language)}
                  </button>
                )}
              </div>
              <div className="kx-field">
                <span className="kx-field-k">{th ? 'ค่าทริป' : 'Trip fee'}</span>
                <span className="kx-field-v">
                  <b className="kx-gold">{picked.length > 1 || price !== null ? baht(amount) : `${th ? 'เริ่ม' : 'from'} ${baht(amount)}`}</b>
                  <small>{picked.length > 1 && price === null ? (th ? 'แต่ละคนตามค่าทริปของตัวเอง · พักไว้สูงสุด ' + baht(amount) : `Each at their own trip fee · up to ${baht(amount)} held`) : picked.length > 1 ? (th ? 'ค่าทริปเดียวส่งถึงทุกคน · แก้ในการ์ดได้' : 'One trip fee to all · change it on the card') : th ? 'ค่าทริปของโลคอล · แก้ในการ์ดได้' : 'The local’s trip fee · change it on the card'}</small>
                </span>
                <span className="kx-step" role="group" aria-label={th ? 'ปรับค่าทริป' : 'Adjust trip fee'}>
                  <button type="button" className="m-press" aria-label={th ? 'ลดค่าทริป' : 'Lower trip fee'} disabled={amount <= 300} onClick={() => setPrice(Math.max(300, amount - 100))}>−</button>
                  <button type="button" className="m-press" aria-label={th ? 'เพิ่มค่าทริป' : 'Raise trip fee'} onClick={() => setPrice(amount + 100)}>+</button>
                </span>
              </div>
            </div>

            {mode === 'multi' || locals.length > 1 ? (
              <>
                <p className="kx-eyebrow">{pinnedRows.length ? (th ? 'บันทึกไว้ · รับทริปนี้' : 'Saved · host this') : th ? 'โลคอลที่รับทริปนี้' : 'Locals who host this'}</p>
                <ul className="kx-rows" aria-label={th ? 'เลือกโลคอล' : 'Choose locals'}>
                  {[...pinnedRows, ...otherRows].map((l, i) => {
                    const on = selected.includes(l.id)
                    const p = localPriceFor(l.profile, e.id)
                    const firstOther = i === pinnedRows.length && pinnedRows.length > 0
                    return (
                      <li key={l.id} className={firstOther ? 'kx-rows-split' : undefined}>
                        {firstOther && <span className="kx-eyebrow is-inline">{th ? 'คนอื่นที่รับทริปนี้' : 'Also host this'}</span>}
                        <div
                          role="checkbox"
                          aria-checked={on}
                          tabIndex={0}
                          data-testid={`mr-row-${l.id}`}
                          className={`kx-row m-press${on ? ' is-on' : ''}`}
                          style={{ '--i': i } as CSSProperties}
                          onClick={() => toggle(l.id)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter' || ev.key === ' ') {
                              ev.preventDefault()
                              toggle(l.id)
                            }
                          }}
                        >
                          <HostPhoto src={l.photo} name={l.name} round className="kx-row-av" />
                          <span className="kx-row-main">
                            <b>
                              {l.name} <VerifiedTick size={13} />
                            </b>
                            <small>★ {l.profile.rating.toFixed(1)} · {th ? `ตอบ ~${l.profile.replyMin} นาที` : `replies ~${l.profile.replyMin} min`} · {l.profile.langs.slice(0, 2).join(' · ')}</small>
                            {mixedVenues && <small className="kx-row-at">📍 {th ? venueOf(l).th : venueOf(l).en}</small>}
                          </span>
                          <span className="kx-row-price">{baht(p)}</span>
                          <span className="kx-tickbox" aria-hidden="true">
                            <svg viewBox="0 0 24 24"><path d="M6 12.5l4 4 8-9" /></svg>
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`kx-row-pin is-heart kf-press${l.pinned ? ' is-on' : ''}`}
                          aria-pressed={l.pinned}
                          aria-label={l.pinned ? (th ? `เอา ${l.name} ออกจากที่บันทึกไว้` : `Unsave ${l.name}`) : th ? `บันทึก ${l.name}` : `Save ${l.name}`}
                          onClick={() => togglePin(l.id, l.name, language)}
                        >
                          <HeartIcon on={l.pinned} />
                        </button>
                      </li>
                    )
                  })}
                  {notHosting.map((l) => (
                    <li key={`nh-${l.id}`}>
                      <div className="kx-row is-na" data-testid={`mr-row-na-${l.id}`} aria-disabled="true">
                        <HostPhoto src={l.photo} name={l.name} round className="kx-row-av" />
                        <span className="kx-row-main">
                          <b>{l.name}</b>
                          <small>{th ? `ไม่ได้รับทริปนี้ · ไม่ได้ส่งคำขอ` : `Doesn't host this · not asked`}</small>
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="kx-explain">
                  <span aria-hidden="true">⚡</span>
                  <span>
                    <b>{th ? 'ใครรับก่อน ได้เลย' : 'First to accept gets it.'}</b>{' '}
                    {th ? 'คำขอที่เหลือปิดเองอัตโนมัติ ไม่มีค่าใช้จ่าย คุณจองได้ครั้งละหนึ่งคนเสมอ' : 'The other requests close automatically, no charge. You only ever book one.'}
                  </span>
                </p>
              </>
            ) : null}

            {shortNow && (
              <p className="kx-explain is-warn" role="status" data-testid="mr-short">
                <span aria-hidden="true">👛</span>
                <span>
                  {th ? `ขาดเงินสดอีก ${baht(needThb)} สำหรับ ${baht(amount)} · โปรโมใช้จ่ายค่าจองไม่ได้` : `Add ${baht(needThb)} cash for ${baht(amount)} · promo can't pay bookings.`}{' '}
                  <button type="button" className="kx-link" onClick={() => openTopUp(needThb)}>
                    {th ? 'เติมเงิน' : 'Top up'}
                  </button>
                </span>
              </p>
            )}
          </div>

          <footer className="kx-page-foot">
            <button
              type="button"
              className={`kx-cta m-press${sending ? ' is-pending' : ''}`}
              data-testid="mr-send"
              disabled={!picked.length}
              aria-busy={sending || undefined}
              onPointerDown={() => triggerHaptic('tap')}
              onClick={send}
            >
              {ctaLabel}
              {picked.length > 0 && !sending && <span className="kx-cta-sub"> · {baht(amount)}</span>}
            </button>
            <p className="kx-fine">
              <span className="kx-rings-mini" aria-hidden="true"><i /><i /></span>
              {th
                ? `พัก ${baht(amount)} ไว้ · ไม่มีใครรับใน 10 นาที คืนเต็ม · โอนให้โลคอลตอนกริ๊ง! ที่หน้างาน`
                : `${baht(amount)} held now · back in full if nobody accepts in 10 min · released when you both go Kring!`}
            </p>
          </footer>
        </>
      )}
    </div>,
    document.body,
  )
}

/* ---------------- live: first to accept gets it ---------------- */

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [active])
  return now
}

const STAGE: Record<string, [string, string]> = {
  sent: ['Sent · waiting', 'ส่งแล้ว · รออยู่'],
  seen: ['Seen', 'เห็นแล้ว'],
  typing: ['Typing…', 'กำลังพิมพ์…'],
  countered: ['Countered · open chat', 'เสนอกลับ · เปิดแชท'],
  accepted: ['Accepted', 'ตกลงแล้ว'],
  released: ['Closed · no charge', 'ปิดแล้ว · ไม่มีค่าใช้จ่าย'],
  declined: ['Can’t make it', 'ไม่สะดวก'],
  withdrawn: ['Withdrawn', 'ยกเลิกแล้ว'],
  expired: ['No reply', 'ไม่ได้ตอบ'],
}

function LiveRequests({
  multiId,
  locals,
  title,
  when,
  venueOf,
  language,
  onOpenChat,
  onAgain,
  onDone,
}: {
  multiId: string
  locals: RequestLocal[]
  title: string
  when: string
  venueOf: (localId: string) => string
  language: string
  onOpenChat: (id: string, name: string) => void
  onAgain: () => void
  onDone: () => void
}) {
  const th = language === 'th'
  const store = usePlanStore()
  const m: MultiRequest | undefined = store.multi[multiId]
  const status = m ? effectiveMultiStatus(m) : 'released'
  const now = useNow(status === 'open')
  // FIX2 · Marco 5 — winner first: on `won` the winner lights at once; each other local's "No charge" (status text and
  // stamp together) is revealed WIN_LEAD_MS later, WIN_STEP_MS apart; the ticket folds up after the last one.
  const nOthers = m ? m.localIds.filter((id) => id !== m.winner).length : 0
  const [revealed, setRevealed] = useState(0)
  // FIX3 · Marco 4 — the ticket mounts only after the last "No charge" (its own timer, queued after the reveals, so a
  // long task can delay both but never reorder them)
  const [ticketOn, setTicketOn] = useState(false)
  useEffect(() => {
    if (status !== 'won') return
    const reduce =
      typeof window === 'undefined' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
      document.documentElement.dataset.reduceMotion === 'true' ||
      import.meta.env.MODE === 'test'
    if (reduce) {
      setRevealed(nOthers)
      setTicketOn(true)
      return
    }
    // FIX3 r4 · Marco — one clock: t0 = the frame the winner paints (first rAF after `won`); every step is read off
    // that start, so a slow frame can't stretch the 240 ms gap (no chained timeouts drifting under load)
    const lastAt = WIN_LEAD_MS + Math.max(0, nOthers - 1) * WIN_STEP_MS
    const ticketAtMs = lastAt + TICKET_AFTER_MS + 120
    let t0 = 0
    let raf = 0
    let shown = 0
    const tick = (now: number) => {
      if (!t0) t0 = now
      const el = now - t0
      let n = 0
      for (let k = 0; k < nOthers; k++) if (el >= WIN_LEAD_MS + k * WIN_STEP_MS) n = k + 1
      const allBefore = shown >= nOthers // every "No charge" was already on screen in an earlier frame
      if (n !== shown) {
        shown = n
        setRevealed(n)
      }
      if (el >= ticketAtMs && allBefore) {
        setTicketOn(true)
        return
      }
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(raf)
  }, [status, nOthers])
  if (!m) return null
  const offers: Array<{ l: RequestLocal | undefined; id: string; o: Offer | undefined }> = m.localIds.map((id) => ({
    id,
    l: locals.find((x) => x.id === id),
    o: store.offers[m.offerIds[id]],
  }))
  const winner = m.winner ? offers.find((x) => x.id === m.winner) : undefined
  const others = offers.filter((x) => x.id !== m.winner)
  const left = Math.max(0, m.replyBy - now)
  const nameOf = (x: { l?: RequestLocal; id: string; o?: Offer }) => x.l?.name ?? x.o?.localName ?? x.id
  const ticketAt = WIN_LEAD_MS + Math.max(0, others.length - 1) * WIN_STEP_MS + TICKET_AFTER_MS

  return (
    <div className="kx-page-scroll kx-live" data-testid="mr-live" data-status={status}>
      <div className="kx-live-head">
        <b>
          {status === 'won'
            ? th ? `${nameOf(winner ?? offers[0])} รับแล้ว` : `${nameOf(winner ?? offers[0])} said yes`
            : status === 'open'
              ? th ? `ส่งคำขอ ${m.localIds.length} รายการ` : `${m.localIds.length} request${m.localIds.length === 1 ? '' : 's'} out`
              : th ? 'ยังไม่มีใครรับ' : 'Nobody accepted this time'}
        </b>
        {status === 'open' && (
          <span className="kx-pill kx-pill-time" aria-label={th ? `เหลือ ${mmss(left)}` : `${mmss(left)} left`}>
            ⏳ {mmss(left)}
          </span>
        )}
      </div>
      <p className="kx-live-sub">
        {title} · {when} · {th ? 'มาคนเดียว' : 'just me'}
      </p>

      {/* FIX1 · Marco 7 — first-accept-wins lands as a sequence, not all at once: the winner lifts at 0 ms, each
          RELEASED stamp follows +90 ms after the previous (3 × STAGGER.base), the booked ticket folds up at ≥ 450 ms. */}
      <ol
        className={`kx-stack${status === 'won' ? ' is-won' : ''}`}
        style={{ '--ticket-at': `${ticketAt}ms` } as CSSProperties}
      >
        {(winner ? [winner, ...others] : offers).map((x, i) => {
          const o = x.o
          const k = others.indexOf(x)
          // until its turn in the win sequence, a loser still reads as it did (no stamp yet)
          const held = status === 'won' && k >= 0 && k >= revealed
          const stage = held ? 'sent' : o ? offerStage(o, now) : 'released'
          const frac = o && stage !== 'released' && stage !== 'accepted' ? offerMsLeft(o, now) / OFFER_REPLY_MS : 0
          const isWin = x.id === m.winner
          return (
            <li
              key={x.id}
              className={`kx-req${isWin ? ' is-win' : ''}${stage === 'released' || stage === 'expired' || stage === 'declined' ? ' is-out' : ''}`}
              style={{ '--i': i } as CSSProperties}
              data-testid={`mr-req-${x.id}`}
              data-stage={stage}
            >
              <span className="kx-ring" style={{ '--p': frac } as CSSProperties} aria-hidden="true">
                <svg viewBox="0 0 44 44">
                  <circle cx="22" cy="22" r="20" className="kx-ring-track" />
                  <circle cx="22" cy="22" r="20" className="kx-ring-fill" pathLength={100} />
                </svg>
                <HostPhoto src={x.l?.photo} name={nameOf(x)} round className="kx-ring-av" />
              </span>
              <span className="kx-req-main">
                <b>{nameOf(x)}</b>
                <small>
                  {stage === 'released' && winner
                    ? th ? `${nameOf(winner)} รับก่อน · ไม่มีค่าใช้จ่าย` : `${nameOf(winner)} said yes first · no charge`
                    : (STAGE[stage] ?? STAGE.sent)[th ? 1 : 0]}
                </small>
              </span>
              {stage === 'released' || stage === 'expired' ? (
                <span className="kx-stamp" aria-hidden="true">{th ? 'ไม่เสียเงิน' : 'No charge'}</span>
              ) : (
                <span className="kx-req-price">{baht(o?.terms.priceThb ?? m.amountThb)}</span>
              )}
              {stage === 'countered' && (
                <button type="button" className="kx-quiet m-press" onClick={() => onOpenChat(x.id, nameOf(x))}>
                  {th ? 'เปิดแชท' : 'Open chat'}
                </button>
              )}
            </li>
          )
        })}
      </ol>

      {status === 'won' && winner && !ticketOn ? null : status === 'won' && winner ? (
        <div className="kx-ticket is-won" data-testid="mr-ticket" style={{ '--ticket-at': '0ms' } as CSSProperties}>
          <span className="kx-rings-mini is-bump" aria-hidden="true"><i /><i /></span>
          <b>{th ? `จองกับ ${nameOf(winner)} แล้ว` : `Booked with ${nameOf(winner)}`}</b>
          <p>
            {when} · {venueOf(winner.id)}
          </p>
          <p className="kx-gold">{lx('mc.heldSafe', language, { price: baht(winner.o?.terms.priceThb ?? m.amountThb) })}</p>
          {others.length > 0 && (
            <p className="kx-fine">
              {th
                ? `คำขอถึง ${listTh(others.map(nameOf))} ปิดอัตโนมัติแล้ว ไม่มีค่าใช้จ่าย`
                : `Your request${others.length === 1 ? '' : 's'} to ${listEn(others.map(nameOf))} closed automatically. No charge.`}
            </p>
          )}
          <button type="button" className="kx-cta m-press" onClick={() => onOpenChat(winner.id, nameOf(winner))}>
            {th ? `เปิดแชทกับ ${nameOf(winner)}` : `Open chat with ${nameOf(winner)}`}
          </button>
        </div>
      ) : status !== 'open' ? (
        <div className="kx-ticket is-quiet">
          <b>{th ? 'ไม่มีการหักเงิน' : 'Nothing was charged'}</b>
          <p>{th ? `${baht(m.amountThb)} กลับเข้ากระเป๋าแล้ว` : `${baht(m.amountThb)} is back in your wallet.`}</p>
          <button type="button" className="kx-cta m-press" onClick={onAgain}>
            {th ? 'ลองอีกครั้ง' : 'Ask again'}
          </button>
        </div>
      ) : (
        <>
          <p className="kx-explain">
            <span aria-hidden="true">⏳</span>
            <span>{th ? 'คำขอแต่ละรายการมีเวลา 10 นาที ถ้าไม่มีใครรับ เงินคืนทันที แล้วขอใหม่ได้' : 'Each request lasts 10 minutes. If nobody accepts, the hold comes straight back and you can ask again.'}</span>
          </p>
          <button
            type="button"
            className="kx-cta is-quiet m-press"
            onClick={() => {
              triggerHaptic('tap')
              releaseMultiRequest(multiId)
              showIsland(th ? 'ยกเลิกคำขอแล้ว · เงินคืนแล้ว' : 'Request called off · hold returned', 'neutral')
            }}
          >
            {th ? 'ยกเลิกคำขอ' : 'Call it off'}
          </button>
        </>
      )}
      <button type="button" className="kx-done m-press" onClick={onDone}>
        {lx('cta.done', language)}
      </button>
    </div>
  )
}

/* ---------------- KRING VISUAL V2 · V3 · the Book popup = the living card ---------------- */

function BookCardSheet({
  experience: e,
  lead,
  title,
  date,
  start,
  venue,
  venueNote,
  priceThb,
  th,
  closing,
  onClose,
  onSent,
  onOpenChat,
}: {
  experience: Experience
  lead: RequestLocal
  title: string
  date: string
  start: string
  venue: string
  venueNote?: string
  priceThb: number
  th: boolean
  closing: boolean
  onClose: () => void
  onSent: () => void
  onOpenChat: () => void
}) {
  const store = usePlanStore()
  const heroRef = useFloatRef<HTMLDivElement>()
  // ONE record per booking: an open request or a held booking with her is shown, never a second card
  const live = offersBetween(currentViewerId(), lead.id)
    .filter((o) => partnerKey(o.localId) === partnerKey(lead.id))
    .filter((o) => {
      const st = effectiveOfferStatus(o)
      if (st === 'open') return true
      if (st !== 'accepted' || !o.bookingId) return false
      const b = store.bookings[o.bookingId]
      return b?.status === 'held'
    })
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(-1)[0]
  return (
    <div className={`lc-book${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={th ? 'จองโลคอล' : 'Book a local'} data-testid="multi-request-sheet">
      <button type="button" className="lc-book-scrim" aria-label={th ? 'ปิด' : 'Close'} tabIndex={-1} onClick={onClose} />
      <div className="lc-book-sh">
        <div className="lc-grab" aria-hidden="true" />
        <header className="lc-book-h">
          <div>
            <small>{title}</small>
            <h2>{th ? `การ์ดของคุณกับ ${lead.name}` : `Your card with ${lead.name}`}</h2>
          </div>
          <button type="button" className="lc-x kf-press" aria-label={th ? 'ปิด' : 'Close'} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <div ref={heroRef}>
          <BookingCard
            key={live?.id ?? 'draft'}
            offer={live ?? null}
            seed={{
              experienceId: e.id,
              experienceTitle: title,
              hours: e.hours,
              localId: lead.id,
              localName: lead.name,
              fromThb: priceThb,
              venueNote,
              terms: { date, start, venue, groupSize: 1, priceThb },
            }}
            side="guest"
            th={th}
            spec
            sendTestId="mr-send"
            shortTestId="mr-short"
            onSent={onSent}
          />
        </div>
        {live ? (
          <button type="button" className="lc-book-chat kf-press" onClick={onOpenChat}>
            {th ? `เปิดแชทกับ ${lead.name} ›` : `Open the chat with ${lead.name} ›`}
          </button>
        ) : (
          <p className="lc-book-foot">
            {th
              ? `${lead.name} ตอบใน ~${lead.profile.replyMin} นาที · ไม่มีใครรับใน 10 นาที เงินคืนเต็ม`
              : `${lead.name} replies in ~${lead.profile.replyMin} min · back in full if there’s no answer in 10 min`}
          </p>
        )}
      </div>
    </div>
  )
}
