import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { KringMark } from '../ui/KringMark'
import { triggerHaptic } from '../../lib/haptics'
import { useBackEntry } from '../../lib/backStack'
import { BALANCE_EVENT, lastKnownBalance, TOPUP_DONE_EVENT } from '../vip/walletKit'
import { EXPERIENCES, getExperience, localProfile, shortTitle, shortTitleTh, toCity, venueIn } from '../../lib/experiences'
import {
  addMinutes,
  allowsVenueChange,
  changeOffer,
  createOffer,
  declineOffer,
  effectiveOfferStatus,
  getPlanStore,
  myReview,
  splitEachThb,
  theirReview,
  tryAcceptOffer,
  usePlanStore,
  type Booking,
  type Offer,
  type OfferField,
  type OfferStatus,
  type OfferTerms,
  type PlanSide,
} from '../../lib/planStore'
import { getPaymentsMode } from '../../lib/configDefaults'
import { MEETING_POINTS } from './SuggestChangeSheet'
import { t as lx } from '../../lib/lexicon'
import PlanTicket from './PlanTicket'
import { bkkDay, dayLabel, fmtThb, ReleaseGate, reducedMotion, useNow } from './parts'
import './living-card.css'

/**
 * KRING VISUAL V2 · V3 — the ONE living booking card ("7C").
 *
 * One component, one record per booking. The Book popup shows it as a draft ("Send request"); the chat docks the very
 * same card above the composer (a slim bar that expands on tap). Both people edit the rows in place — Experience ·
 * When · Where · Group · Trip fee — and ONE gold action follows the state:
 *   Send request → Waiting for Kwan… → (her change lands, rows rimmed marigold, old value struck)
 *   Accept · or change → (edit a row) Send change → ✓ Accepted · ฿1,200 held.
 * Every send is one planStore step (`createOffer` · `changeOffer` · `tryAcceptOffer`) and one one-line chat event;
 * History lists them. Money is never touched here: the one hold is placed by `createOffer` and settled to the agreed
 * fee at accept by `tryAcceptOffer` (top-up / refund of the difference — the existing path).
 *
 * Testids: kring-offer-card (+ data-state), kring-card-action (+ data-act), kring-offer-accept, kring-offer-withdraw,
 *          kring-offer-decline, kring-card-history, kring-card-{day|time|fee|group|where}…, short line via `shortTestId`.
 */

export interface CardSeed {
  experienceId?: string
  experienceTitle: string
  /** usual length in hours (sets the end time) */
  hours: number
  guestId?: string
  guestName?: string
  localId: string
  localName: string
  fromThb?: number
  terms: Pick<OfferTerms, 'date' | 'start' | 'venue' | 'groupSize' | 'priceThb'>
  /** "Kwan’s meeting point" vs "Mint hosts here · licensed business" */
  venueNote?: string
}

export interface BookingCardProps {
  /** the record (live card). Omitted → a draft built from `seed` (Book popup before Send request). */
  offer?: Offer | null
  seed?: CardSeed
  side: PlanSide
  th: boolean
  /** after Send request created the record */
  onSent?: (offer: Offer) => void
  onBooked?: (bookingId: string) => void
  onBump?: (b: Booking) => void
  onReview?: (b: Booking) => void
  /** 'sheet' (Book popup) or 'dock' (chat) — only spacing differs */
  variant?: 'sheet' | 'dock'
  shortTestId?: string
  /** testid of the gold action while it is a draft (the Book popup keeps `mr-send`) */
  sendTestId?: string
  className?: string
  /** V1 Floating: the slow specular sweep across the card (the Book popup's hero) */
  spec?: boolean
}

type Draft = { experienceId?: string; experienceTitle: string; date: string; start: string; venue: string; groupSize: number; priceThb: number }

const FEE_STEP = 100
const FEE_MIN = 300
const FEE_MAX = 50_000
const T_MIN = 6 * 60
const T_MAX = 22 * 60

const toMin = (c: string) => {
  const [h, m] = c.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}
const lengthOf = (t: Pick<OfferTerms, 'start' | 'end'>) => (((toMin(t.end) - toMin(t.start)) % 1440) + 1440) % 1440 || 120
const hoursLabel = (min: number, th: boolean) => {
  const h = Math.round((min / 60) * 2) / 2
  return th ? `~${h} ชม.` : `~${h} h`
}

/** T3 · going with friends: "Just me" or "ไปกับเพื่อน · 3 คน" — never a percentage. */
export function groupLabel(n: number, th: boolean, side: PlanSide = 'guest'): string {
  if (side === 'host') return th ? `${Math.max(1, n)} คน` : n <= 1 ? '1 guest' : `${n} guests`
  if (n <= 1) return th ? 'มาคนเดียว' : 'Just me'
  return th ? `ไปกับเพื่อน · ${n} คน` : `With friends · ${n}`
}

/** "Split 3 ways · ฿400 each" — what each friend owes the booker (display only; ONE hold stays on the booker). */
export function splitLabel(priceThb: number, n: number, th: boolean): string {
  const each = fmtThb(splitEachThb(priceThb, n))
  return th ? `หารกัน ${n} คน · ${each} / คน` : `Split ${n} ways · ${each} each`
}

const GROUP_MAX = 8

const stars = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(Math.max(0, 5 - n))}`

/** Status chip on the card and the slim bar. */
export function cardStatus(o: Offer | null | undefined, side: PlanSide, th: boolean, now = Date.now(), booking?: Booking | null): { tone: 'wait' | 'turn' | 'ok' | 'off'; label: string } {
  if (!o) return { tone: 'wait', label: th ? 'ร่าง' : 'Draft' }
  const other = side === 'guest' ? o.localName : o.guestName
  const st = effectiveOfferStatus(o, now)
  if (st === 'open') return o.lastBy === side ? { tone: 'wait', label: th ? `รอ ${other}` : `Waiting for ${other}` } : { tone: 'turn', label: th ? 'ตาคุณ' : 'Your turn' }
  if (st === 'accepted') {
    const b = booking ?? (o.bookingId ? getPlanStore().bookings[o.bookingId] : undefined)
    if (b?.status === 'released') return { tone: 'ok', label: th ? 'กริ๊ง! แล้ว' : 'Done · Kring!' }
    if (b?.status === 'cancelled') return { tone: 'off', label: th ? 'ยกเลิกแล้ว' : 'Cancelled' }
    if (b?.status === 'no-show') return { tone: 'off', label: th ? 'ไม่ได้เจอกัน' : 'No-show' }
    return { tone: 'ok', label: th ? 'ตกลงแล้ว' : 'Accepted' }
  }
  const map: Record<Exclude<OfferStatus, 'open' | 'accepted'>, [string, string]> = {
    expired: ['Expired', 'หมดเวลา'],
    declined: ['Declined', 'ปฏิเสธแล้ว'],
    withdrawn: ['Withdrawn', 'ถอนแล้ว'],
    released: ['Closed', 'ปิดแล้ว'],
  }
  const [en, tth] = map[st as keyof typeof map] ?? ['Closed', 'ปิดแล้ว']
  return { tone: 'off', label: th ? tth : en }
}

/* ---------- tiny icons (inline, currentColor) ---------- */
const I = {
  minus: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12" /></svg>,
  plus: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12" /></svg>,
  check: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 12.5l4.2 4.2L18.5 8" /></svg>,
  history: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" /><path d="M12 8v4.5l3 1.8" /></svg>,
  chev: <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>,
}

function venueOptions(experienceId: string | undefined, venue: string, th: boolean): string[] {
  const exp = getExperience(experienceId)
  const ownV = exp ? venueIn(exp, toCity(/pattaya|พัทยา/i.test(venue) ? 'Pattaya' : 'Bangkok')) : null
  const own = ownV ? (th ? ownV.th : ownV.en) : ''
  const area = `${ownV?.en ?? ''} ${ownV?.th ?? ''} ${venue}`
  return [venue, ...(own ? [own] : []), ...MEETING_POINTS.filter((p) => p.near.test(area)).map((p) => (th ? p.th : p.en))].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i)
}

/** Three day chips around the chosen day (never before today, at most two weeks out). */
function dayWindow(date: string): string[] {
  const days = Array.from({ length: 15 }, (_, i) => bkkDay(i))
  const at = Math.max(0, days.indexOf(date))
  const from = Math.max(0, Math.min(days.length - 3, at - 1))
  return days.slice(from, from + 3)
}

export default function BookingCard({ offer: offerProp, seed, side, th, onSent, onBooked, onBump, onReview, variant = 'sheet', shortTestId = 'kring-offer-short', sendTestId = 'kring-card-action', className = '', spec = false }: BookingCardProps) {
  const store = usePlanStore()
  const offer = offerProp ? store.offers[offerProp.id] ?? offerProp : null
  const now = useNow(offer && effectiveOfferStatus(offer) === 'open' ? 1000 : 30_000)
  const st: OfferStatus | 'draft' = offer ? effectiveOfferStatus(offer, now) : 'draft'
  const booking = offer?.bookingId ? store.bookings[offer.bookingId] : undefined
  const baseTitle = offer?.experienceTitle ?? seed?.experienceTitle ?? (th ? 'ทริปกับโลคอล' : 'Experience')
  const baseExpId = offer?.experienceId ?? seed?.experienceId
  const base: Draft = offer
    ? { experienceId: baseExpId, experienceTitle: baseTitle, date: offer.terms.date, start: offer.terms.start, venue: offer.terms.venue, groupSize: offer.terms.groupSize, priceThb: offer.terms.priceThb }
    : { experienceId: baseExpId, experienceTitle: baseTitle, date: seed?.terms.date ?? bkkDay(1), start: seed?.terms.start ?? '14:00', venue: seed?.terms.venue ?? '', groupSize: seed?.terms.groupSize ?? 1, priceThb: seed?.terms.priceThb ?? FEE_MIN }
  const lenMin = offer ? lengthOf(offer.terms) : Math.round((seed?.hours ?? 2) * 60)
  const [draft, setDraft] = useState<Draft>(base)
  // a new step on the record (either side) resets the draft to what is now on the table
  const recKey = offer ? `${offer.id}:${offer.steps.length}:${offer.status}` : 'draft'
  const lastKey = useRef(recKey)
  const [flash, setFlash] = useState(0)
  useEffect(() => {
    if (lastKey.current === recKey) return
    lastKey.current = recKey
    setDraft(base)
    setShort(null)
    // the other side's move lands on screen → one soft flash (never on my own send)
    const lastStep = offer?.steps[offer.steps.length - 1]
    if (lastStep && lastStep.by !== side && !reducedMotion()) setFlash((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recKey])

  const localId = offer?.localId ?? seed?.localId ?? ''
  const localName = offer?.localName ?? seed?.localName ?? ''
  const guestName = offer?.guestName ?? seed?.guestName ?? ''
  const other = side === 'guest' ? localName : guestName
  const title = draft.experienceTitle || baseTitle
  const open = st === 'open' || st === 'draft'
  const locked = !open
  const mine = offer ? offer.lastBy === side : true
  const edited = Boolean(offer) && open && (draft.experienceId !== base.experienceId || draft.experienceTitle !== base.experienceTitle || draft.date !== base.date || draft.start !== base.start || draft.venue !== base.venue || draft.groupSize !== base.groupSize || draft.priceThb !== base.priceThb)
  const venueEditable = side === 'host' || allowsVenueChange(localId)
  const venues = useMemo(() => venueOptions(draft.experienceId ?? baseExpId, base.venue, th), [draft.experienceId, baseExpId, base.venue, th])
  const expChoices = useMemo(() => {
    const prof = localProfile({ id: localId || 'mint', name: localName || 'Mint' })
    const sigIds = prof.signature.map((s) => s.id)
    const list = [
      ...(baseExpId ? [getExperience(baseExpId)] : []),
      ...sigIds.map((id) => getExperience(id)),
      ...EXPERIENCES.slice(0, 6),
    ].filter((x): x is NonNullable<typeof x> => Boolean(x))
    const seen = new Set<string>()
    return list.filter((x) => {
      if (seen.has(x.id)) return false
      seen.add(x.id)
      return true
    })
  }, [localId, localName, baseExpId])

  // what changed on the table last (rows rimmed marigold, old value struck) — the newest change step
  const lastChange = offer ? [...offer.steps].reverse().find((s) => s.kind === 'counter' || s.kind === 'change') : undefined
  const lastStep = offer?.steps[offer.steps.length - 1]
  const showChange = Boolean(lastChange && (lastChange === lastStep || st === 'accepted'))
  const changed: OfferField[] = showChange && lastChange ? lastChange.changed : []
  const prev = showChange ? lastChange?.prev : undefined

  /* ---------- cash (the short line follows the wallet live) ---------- */
  const [short, setShort] = useState<{ needThb: number; forThb: number; act: 'send' | 'accept' } | null>(null)
  const [cashThb, setCashThb] = useState<number | null>(() => {
    const b = lastKnownBalance()
    return b ? Math.floor(b.paidCoins / 100) : null
  })
  const retryAccept = useRef(false)
  useEffect(() => {
    const read = () => {
      const b = lastKnownBalance()
      if (b) setCashThb(Math.floor(b.paidCoins / 100))
    }
    const onDone = () => {
      read()
      if (retryAccept.current) window.setTimeout(() => doAccept(true), 60)
    }
    window.addEventListener(BALANCE_EVENT, read)
    window.addEventListener(TOPUP_DONE_EVENT, onDone)
    return () => {
      window.removeEventListener(BALANCE_EVENT, read)
      window.removeEventListener(TOPUP_DONE_EVENT, onDone)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer?.id])
  const shortVisible = Boolean(short && (short.act === 'accept' || cashThb === null || cashThb < short.forThb))
  const openTopUp = (needThb: number, forThb: number) =>
    window.dispatchEvent(
      new CustomEvent('chon:open-topup', {
        detail: {
          needThb,
          reason: th ? `เติมเงินสด ${fmtThb(needThb)} สำหรับค่าทริป ${fmtThb(forThb)} · โปรโมใช้จ่ายค่าจองไม่ได้` : `Add ${fmtThb(needThb)} cash for the ${fmtThb(forThb)} trip fee · promo can't pay bookings`,
        },
      }),
    )
  const cashNow = () => {
    const b = lastKnownBalance()
    return b ? Math.floor(b.paidCoins / 100) : 0
  }

  /* ---------- actions ---------- */
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const terms = (d: Draft): Partial<OfferTerms> & { priceThb: number; experienceId?: string; experienceTitle?: string } => ({
    experienceId: d.experienceId,
    experienceTitle: d.experienceTitle,
    date: d.date,
    start: d.start,
    end: addMinutes(d.start, lenMin),
    venue: d.venue,
    groupSize: d.groupSize,
    priceThb: d.priceThb,
  })

  const sendNew = () => {
    const s = seed
    const from = offer
    const created = createOffer(
      {
        experienceId: draft.experienceId ?? from?.experienceId ?? s?.experienceId,
        experienceTitle: title,
        guestId: from?.guestId ?? s?.guestId,
        guestName: from ? from.guestName : s?.guestName,
        localId: from?.localId ?? s?.localId ?? '',
        localName,
        fromThb: from?.fromThb ?? s?.fromThb,
        terms: terms(draft),
      },
      'guest',
    )
    if (!created) {
      triggerHaptic('error', { sound: false })
      const cash = cashNow()
      const need = Math.max(1, draft.priceThb - cash)
      setCashThb(cash)
      setShort({ needThb: need, forThb: draft.priceThb, act: 'send' })
      openTopUp(need, draft.priceThb)
      return
    }
    triggerHaptic('success', { sound: false })
    setShort(null)
    onSent?.(created)
  }

  function doAccept(fromTopUp = false) {
    if (!offer) return
    const r = tryAcceptOffer(offer.id, side)
    if (!r.booking) {
      if (r.reason === 'short-cash') {
        const need = Math.max(1, (r.needThb ?? 0) - Math.max(0, cashNow()))
        triggerHaptic('warning', { sound: false })
        setShort({ needThb: need, forThb: offer.terms.priceThb, act: 'accept' })
        retryAccept.current = true
        if (!fromTopUp) openTopUp(need, offer.terms.priceThb)
      } else {
        triggerHaptic('error', { sound: false })
      }
      return
    }
    retryAccept.current = false
    setShort(null)
    triggerHaptic('success', { burst: false, sound: false })
    onBooked?.(r.booking.id)
  }

  const main = () => {
    if (busy || busyRef.current) return
    if (st === 'draft' || (offer && st !== 'open' && st !== 'accepted' && side === 'guest')) {
      busyRef.current = true
      setBusy(true)
      // paint the pressed state first, then hold + create (FIX2 · Marco 6: never stall the tap frame)
      const run = () => {
        try {
          sendNew()
        } finally {
          busyRef.current = false
          setBusy(false)
        }
      }
      if (typeof window.requestAnimationFrame === 'function' && import.meta.env.MODE !== 'test') window.requestAnimationFrame(() => window.setTimeout(run, 0))
      else run()
      return
    }
    if (!offer || st !== 'open') return
    if (edited) {
      const next = changeOffer(offer.id, side, terms(draft))
      if (!next) {
        triggerHaptic('error', { sound: false })
        setDraft(base)
        return
      }
      triggerHaptic('select')
      return
    }
    if (!mine) doAccept()
  }

  const set = (patch: Partial<Draft>) => {
    if (locked) return
    triggerHaptic('select')
    setDraft((d) => ({ ...d, ...patch }))
  }

  /* ---------- labels ---------- */
  const fee = draft.priceThb
  const action: { label: ReactNode; tone: 'g' | 'w' | 'k' | 'off'; act: string; disabled?: boolean } = (() => {
    if (st === 'draft') return { label: busy ? (th ? 'กำลังส่ง…' : 'Sending…') : lx('card.sendRequest', th ? 'th' : 'en'), tone: 'g', act: 'send' }
    if (st === 'open') {
      if (edited) return { label: lx('card.sendChange', th ? 'th' : 'en'), tone: 'g', act: 'change' }
      if (mine) return { label: th ? `รอ ${other} ตอบ…` : `Waiting for ${other}…`, tone: 'w', act: 'wait', disabled: true }
      return { label: lx('card.acceptOrChange', th ? 'th' : 'en'), tone: 'g', act: 'accept' }
    }
    if (st === 'accepted') {
      const amt = fmtThb(booking?.heldThb ?? offer?.terms.priceThb ?? fee)
      const label = (() => {
        switch (booking?.status) {
          case 'released':
            return side === 'host' ? (th ? `กริ๊ง! · ${amt} เข้ากระเป๋าคุณ` : `Kring! · ${amt} released to you`) : th ? `กริ๊ง! · โอน ${amt} ให้ ${other}` : `Kring! · ${amt} released to ${other}`
          case 'cancelled':
            return th ? `ยกเลิกแล้ว · คืน ${fmtThb(booking.refundThb ?? 0)}` : `Cancelled · ${fmtThb(booking.refundThb ?? 0)} back`
          case 'no-show':
            return th ? `ไม่ได้เจอกัน · คืน ${amt}` : `No-show · ${amt} back`
          default:
            return side === 'host' ? (th ? `ตกลงแล้ว · พัก ${amt} ไว้ให้คุณ` : `Accepted · ${amt} held for you`) : lx('card.accepted', th ? 'th' : 'en', { amount: amt })
        }
      })()
      return { label: <>{I.check}{label}</>, tone: 'k', act: 'booked', disabled: true }
    }
    // closed: the guest can send the same card again (a new request, a new hold)
    if (side === 'guest') return { label: th ? 'ส่งคำขอใหม่' : 'Send a new request', tone: 'g', act: 'resend' }
    return { label: closedLine(offer!, side, th), tone: 'off', act: 'closed', disabled: true }
  })()

  const statusChip = cardStatus(offer, side, th, now, booking)
  const strike = (k: OfferField, text: string | null) => (changed.includes(k) && prev && text ? <s>{text}</s> : null)
  const rowCls = (k: OfferField) => (changed.includes(k) ? ' is-changed' : '')
  const days = dayWindow(draft.date)
  const tMin = toMin(draft.start)
  const venueSub = side === 'host' ? (th ? 'จุดนัดของคุณ' : 'Your meeting point') : seed?.venueNote && !offer ? seed.venueNote : venueEditable ? (th ? `${localName} ให้เสนอที่อื่นได้` : `${localName} allows suggestions`) : seed?.venueNote ?? (th ? `จุดนัดของ ${localName}` : `${localName}’s meeting point`)
  const hist = offer ? historyRows(offer, side, th) : []
  const [hOpen, setHOpen] = useState(false)
  const [tOpen, setTOpen] = useState(false)

  return (
    <article
      key={flash}
      className={`lc${variant === 'dock' ? ' is-dock' : ''}${locked ? ' is-locked' : ''}${flash ? ' is-flash' : ''}${className ? ` ${className}` : ''}`}
      data-testid="kring-offer-card"
      data-offer-id={offer?.id}
      data-state={st}
      aria-label={th ? `การ์ดจองกับ ${other} · ${statusChip.label}` : `Booking card with ${other} · ${statusChip.label}`}
    >
      {spec ? <span className="kf-spec" aria-hidden="true" /> : null}
      <header className="lc-h">
        <span className="lc-k">
          <KringMark size={22} />
          {th ? 'การ์ดเดียว · พักเงินครั้งเดียว' : 'One card · one hold'}
        </span>
        <span className={`lc-st is-${statusChip.tone}`} data-testid="kring-card-status">{statusChip.label}</span>
      </header>

      {/* Experience */}
      <div className="lc-r" data-testid="kring-card-experience">
        <div className="lc-l1">
          <span className="lc-lb">{th ? 'ทริป' : 'Experience'}</span>
          <span className="lc-v">
            {title}
            <small>{hoursLabel(lenMin, th)} · {side === 'guest' ? (th ? `กับ ${localName}` : `with ${localName}`) : th ? `กับ ${guestName}` : `with ${guestName}`}</small>
          </span>
          {!locked && expChoices.length > 1 ? (
            <button
              type="button"
              className="lc-lnk"
              data-testid="kring-card-exp-change"
              aria-label={th ? 'เปลี่ยนทริป' : 'Change experience'}
              onClick={() => {
                const idx = expChoices.findIndex((x) => x.id === draft.experienceId || shortTitle(x) === draft.experienceTitle || shortTitleTh(x) === draft.experienceTitle)
                const nextExp = expChoices[(idx + 1) % expChoices.length]
                if (!nextExp) return
                set({
                  experienceId: nextExp.id,
                  experienceTitle: th ? shortTitleTh(nextExp) : shortTitle(nextExp),
                })
              }}
            >
              {th ? 'เปลี่ยน' : 'Change'}
            </button>
          ) : null}
        </div>
      </div>

      {/* When */}
      <div className={`lc-r${rowCls('time')}`} data-testid="kring-card-when">
        <div className="lc-l1">
          <span className="lc-lb">{lx('card.when', th ? 'th' : 'en')}</span>
          <span className="lc-v">
            {strike('time', prev ? `${dayLabel(prev.date, th, true)} · ${prev.start}` : null)}
            {dayLabel(draft.date, th, true)} · {draft.start}
          </span>
        </div>
        <div className="lc-l2" role="radiogroup" aria-label={th ? 'วัน' : 'Day'}>
          {days.map((d) => (
            <button key={d} type="button" role="radio" aria-checked={draft.date === d} className="lc-dc" data-testid={`kring-card-day-${d}`} disabled={locked} onClick={() => set({ date: d })}>
              {dayLabel(d, th, true)}
            </button>
          ))}
        </div>
        <div className="lc-l2">
          <span className="lc-lb is-sm">{th ? 'เวลา' : 'Time'}</span>
          <span className="lc-stp">
            <button type="button" className="lc-sb" aria-label={th ? 'เร็วขึ้น' : 'Earlier'} data-testid="kring-card-time-minus" disabled={locked || tMin <= T_MIN} onClick={() => set({ start: addMinutes(draft.start, -30) })}>
              {I.minus}
            </button>
            <span className="lc-num">{draft.start}</span>
            <button type="button" className="lc-sb" aria-label={th ? 'ช้าลง' : 'Later'} data-testid="kring-card-time-plus" disabled={locked || tMin >= T_MAX} onClick={() => set({ start: addMinutes(draft.start, 30) })}>
              {I.plus}
            </button>
          </span>
        </div>
      </div>

      {/* Where */}
      <div className={`lc-r${rowCls('venue')}`} data-testid="kring-card-where">
        <div className="lc-l1">
          <span className="lc-lb">{lx('card.where', th ? 'th' : 'en')}</span>
          <span className="lc-v">
            {strike('venue', prev?.venue ?? null)}
            {draft.venue || (th ? 'จุดนัดสาธารณะ' : 'Public meeting point')}
            <small>{venueSub}</small>
          </span>
          {venueEditable && venues.length > 1 ? (
            <button
              type="button"
              className="lc-lnk"
              data-testid="kring-card-where-change"
              aria-label={th ? 'เสนอจุดนัดอื่น' : 'Suggest another meeting point'}
              disabled={locked}
              onClick={() => set({ venue: venues[(venues.indexOf(draft.venue) + 1) % venues.length] })}
            >
              {th ? 'เปลี่ยน' : 'Change'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Group */}
      <div className={`lc-r${rowCls('group')}`} data-testid="kring-card-group">
        <div className="lc-l1">
          <span className="lc-lb">{lx('card.group', th ? 'th' : 'en')}</span>
          {side === 'guest' ? (
            <span className="lc-stp lc-grp">
              {changed.includes('group') && prev ? <s className="lc-gs">{groupLabel(prev.groupSize, th)}</s> : null}
              <button type="button" className="lc-dc is-fit" aria-pressed={draft.groupSize === 1} disabled={locked} data-testid="kring-card-solo" onClick={() => draft.groupSize !== 1 && set({ groupSize: 1 })}>
                {groupLabel(1, th)}
              </button>
              {draft.groupSize > 1 ? (
                <span className="lc-gstp" role="group" aria-label={groupLabel(draft.groupSize, th)}>
                  <button type="button" className="lc-sb" aria-label={th ? 'ลดจำนวนคน' : 'Fewer people'} data-testid="kring-card-group-minus" disabled={locked} onClick={() => set({ groupSize: Math.max(1, draft.groupSize - 1) })}>
                    {I.minus}
                  </button>
                  <span className="lc-num" data-testid="kring-card-friends" aria-live="polite">
                    {groupLabel(draft.groupSize, th)}
                  </span>
                  <button type="button" className="lc-sb" aria-label={th ? 'เพิ่มจำนวนคน' : 'More people'} data-testid="kring-card-group-plus" disabled={locked || draft.groupSize >= GROUP_MAX} onClick={() => set({ groupSize: Math.min(GROUP_MAX, draft.groupSize + 1) })}>
                    {I.plus}
                  </button>
                </span>
              ) : (
                <button type="button" className="lc-dc is-fit" data-testid="kring-card-friends" aria-pressed={false} disabled={locked} onClick={() => set({ groupSize: 2 })}>
                  {th ? 'ไปกับเพื่อน' : 'With friends'}
                </button>
              )}
            </span>
          ) : (
            <span className="lc-v">
              {strike('group', prev ? groupLabel(prev.groupSize, th, 'host') : null)}
              {groupLabel(draft.groupSize, th, 'host')}
            </span>
          )}
        </div>
      </div>

      {/* Trip fee */}
      <div className={`lc-r${rowCls('price')}`} data-testid="kring-card-fee">
        <div className="lc-l1">
          <span className="lc-lb">
            {th ? lx('trip.fee', 'th') : lx('trip.fee', 'en')}
          </span>
          <span className="lc-stp">
            <button type="button" className="lc-sb" aria-label={th ? 'ลดค่าทริป' : 'Lower trip fee'} data-testid="kring-card-fee-minus" disabled={locked || fee <= FEE_MIN} onClick={() => set({ priceThb: Math.max(FEE_MIN, fee - FEE_STEP) })}>
              {I.minus}
            </button>
            <span className="lc-num is-fee">
              {changed.includes('price') && prev ? <s>{fmtThb(prev.priceThb)}</s> : null}
              {fmtThb(fee)}
            </span>
            <button type="button" className="lc-sb" aria-label={th ? 'เพิ่มค่าทริป' : 'Raise trip fee'} data-testid="kring-card-fee-plus" disabled={locked || fee >= FEE_MAX} onClick={() => set({ priceThb: Math.min(FEE_MAX, fee + FEE_STEP) })}>
              {I.plus}
            </button>
          </span>
        </div>
        {draft.groupSize > 1 && side === 'guest' ? (
          <p className="lc-split" data-testid="kring-card-split">
            <span>{splitLabel(fee, draft.groupSize, th)}</span>
            <small>{th ? 'พักเงินครั้งเดียวที่คุณ · เพื่อนจ่ายส่วนของตัวเองให้คุณ' : 'One hold, on you · friends pay you their share'}</small>
          </p>
        ) : null}
        <p className="lc-note">
          {th ? (
            <>ค่าทริปกิจกรรมเท่านั้น · ค่าอาหารจ่ายที่ร้าน · พักเงินจน <span lang="th">กริ๊ง!</span></>
          ) : (
            <>Activity session fee only · venue bills paid there · held till กริ๊ง!</>
          )}
        </p>
        <div className="mt-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs flex flex-wrap items-center justify-between gap-1" data-testid="kring-card-atm-savings">
          <span className="font-bold text-emerald-500">
            {th ? '🧾 ค่าบริการ ฿25 · ไม่ต้องกดตู้ ATM (ตู้ ATM ไทยคิดค่าธรรมเนียม ฿220–250/ครั้ง)' : '🧾 ฿25 Service Fee · No ATM needed — Thai ATMs charge ฿220–250 a withdrawal'}
          </span>
          <span className="opacity-75">{th ? 'พักเงินปลอดภัยจนชนโทรศัพท์ กริ๊ง!' : 'Held in escrow till ≤100m กริ๊ง! bump'}</span>
        </div>
        {getPaymentsMode() === 'off' && (
          <p className="lc-note" data-testid="kring-payments-off-note">
            {th ? 'โหมดแลกเปลี่ยนสองทาง · ไม่มีการพักเงินในแอป' : 'Two-way exchange mode · no in-app payment hold'}
          </p>
        )}
      </div>

      {st !== 'open' && st !== 'draft' && st !== 'accepted' ? (
        <p className="lc-closed" data-testid="kring-offer-closed">{closedLine(offer!, side, th)}</p>
      ) : null}

      <button
        type="button"
        className={`lc-act is-${action.tone}`}
        data-testid={action.act === 'accept' ? 'kring-offer-accept' : action.act === 'send' ? sendTestId : 'kring-card-action'}
        data-act={action.act}
        aria-disabled={action.disabled || undefined}
        aria-busy={busy || undefined}
        onClick={() => (action.disabled ? undefined : main())}
      >
        {action.label}
      </button>

      {/* quiet secondary: withdraw my waiting card · a local can decline politely */}
      {offer && st === 'open' && !edited && (mine || side === 'host') ? (
        <div className="lc-sec">
          {mine ? (
            <button type="button" className="lc-q" data-testid="kring-offer-withdraw" onClick={() => { triggerHaptic('select'); declineOffer(offer.id, side) }}>
              {side === 'guest' && offer.heldThb > 0 ? (th ? `ถอนคำขอ · คืน ${fmtThb(offer.heldThb)}` : `Withdraw · ${fmtThb(offer.heldThb)} back`) : th ? 'ถอน' : 'Withdraw'}
            </button>
          ) : (
            <button type="button" className="lc-q" data-testid="kring-offer-decline" onClick={() => { triggerHaptic('select'); declineOffer(offer.id, side) }}>
              {th ? 'ปฏิเสธอย่างสุภาพ' : 'Decline politely'}
            </button>
          )}
        </div>
      ) : null}
      {edited ? (
        <div className="lc-sec">
          <button type="button" className="lc-q" data-testid="kring-card-undo" onClick={() => setDraft(base)}>
            {th ? 'ยกเลิกที่แก้' : 'Undo my edits'}
          </button>
        </div>
      ) : null}

      {shortVisible && short ? (
        <p className="lc-short" role="status" data-testid={shortTestId}>
          <span>
            {th ? `ขาดเงินสดอีก ${fmtThb(short.needThb)} สำหรับ ${fmtThb(short.forThb)} · โปรโมใช้จ่ายค่าจองไม่ได้` : `Add ${fmtThb(short.needThb)} cash for ${fmtThb(short.forThb)} · promo can't pay bookings.`}
          </span>
          <button type="button" className="lc-lnk" data-testid="kring-offer-topup" onClick={() => openTopUp(short.needThb, short.forThb)}>
            {th ? 'เติมเงิน' : 'Top up'}
          </button>
        </p>
      ) : null}

      {/* booked: the bump door + the ticket (KR no., cancel rules) live INSIDE the one card */}
      {booking && booking.status === 'held' && onBump ? (
        <div className="lc-gate">
          <ReleaseGate booking={booking} th={th} now={now} block onBump={() => onBump(booking)} label={th ? 'ถึงแล้ว · ชนโทรศัพท์' : 'At the venue · bump phones'} />
        </div>
      ) : null}
      {booking && booking.status === 'released' ? <ReviewRow booking={booking} side={side} th={th} other={other} onReview={onReview} /> : null}
      {booking ? (
        <div className={`lc-acc${tOpen ? ' is-open' : ''}`}>
          <button type="button" className="lc-acc-h" aria-expanded={tOpen} data-testid="kring-card-ticket" onClick={() => setTOpen((v) => !v)}>
            <span className="lc-acc-ic" aria-hidden="true">🎫</span>
            {th ? `ตั๋ว ${booking.id} · กฎการยกเลิก` : `Ticket ${booking.id} · cancel rules`}
            <span className="lc-cv">{I.chev}</span>
          </button>
          {tOpen ? (
            <div className="lc-acc-b">
              <PlanTicket booking={booking} side={side} th={th} onReview={onReview ? () => onReview(booking) : undefined} />
            </div>
          ) : null}
        </div>
      ) : null}

      {offer ? (
        <div className={`lc-acc${hOpen ? ' is-open' : ''}`}>
          <button type="button" className="lc-acc-h" aria-expanded={hOpen} data-testid="kring-card-history" disabled={!hist.length} onClick={() => setHOpen((v) => !v)}>
            {I.history}
            {`${lx('card.history', th ? 'th' : 'en')} (${hist.length})`}
            <span className="lc-cv">{I.chev}</span>
          </button>
          {hOpen ? (
            <ul className="lc-hist">
              {hist.map((r) => (
                <li key={r.key}>
                  <span className="lc-hp">{fmtThb(r.fee)}</span>
                  <span className="lc-ht">{r.text}</span>
                  <span className="lc-hm">{r.at}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="lc-acc">
          <button type="button" className="lc-acc-h" disabled>
            {I.history}
            {`${lx('card.history', th ? 'th' : 'en')} (0)`}
            <span className="lc-cv">{I.chev}</span>
          </button>
        </div>
      )}
    </article>
  )
}

/**
 * T3 · mutual reviews, after the bump — both people rate each other from the same card. The other person's stars show
 * only once you have posted yours.
 */
function ReviewRow({ booking, side, th, other, onReview }: { booking: Booking; side: PlanSide; th: boolean; other: string; onReview?: (b: Booking) => void }) {
  const mine = myReview(booking, side)
  const theirs = theirReview(booking, side)
  return (
    <div className="lc-rv" data-testid="kring-card-review">
      {mine ? (
        <span className="lc-rv-l">
          <span>{th ? `คุณให้ ${other}` : `You rated ${other}`}</span>
          <b className="lc-stars" aria-label={`${mine.stars} / 5`}>{stars(mine.stars)}</b>
        </span>
      ) : (
        <button type="button" className="lc-rv-b" data-testid="kring-card-review-open" disabled={!onReview} onClick={() => { triggerHaptic('select'); onReview?.(booking) }}>
          <span>{th ? `ให้คะแนน ${other}` : `Review ${other}`}</span>
          <b className="lc-stars is-empty" aria-hidden="true">★★★★★</b>
        </button>
      )}
      {theirs ? (
        <span className="lc-rv-l" data-testid="kring-card-review-theirs">
          <span>{th ? `${other} ให้คุณ` : `${other} rated you`}</span>
          <b className="lc-stars" aria-label={`${theirs.stars} / 5`}>{stars(theirs.stars)}</b>
        </span>
      ) : mine ? (
        <small className="lc-rv-w">{th ? `รีวิวของ ${other} จะขึ้นเมื่อเขารีวิวเสร็จ` : `${other}’s review shows once they post it`}</small>
      ) : null}
    </div>
  )
}

/* ---------- words shared by the card, the slim bar and the chat events ---------- */

const clock = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(11, 16)
const who = (o: Offer, by: PlanSide, side: PlanSide, th: boolean) => (by === side ? (th ? 'คุณ' : 'You') : by === 'guest' ? o.guestName : o.localName)

/** "฿1,200 · Sat 24 · 17:00 · Yaowarat gate" — only what this step changed (the first step: fee · day time). */
export function stepDiff(o: Offer, i: number, th: boolean, side: PlanSide = 'guest'): string {
  const s = o.steps[i]
  if (!s) return ''
  const t = s.terms
  if (s.kind === 'offer' || !s.prev) return `${fmtThb(t.priceThb)} · ${dayLabel(t.date, th, true)} ${t.start}`
  const out: string[] = []
  if (s.changed.includes('price')) out.push(fmtThb(t.priceThb))
  if (s.changed.includes('time')) out.push(s.prev.date !== t.date ? `${dayLabel(t.date, th, true)} ${t.start}` : t.start)
  if (s.changed.includes('venue')) out.push(t.venue)
  if (s.changed.includes('group')) out.push(side === 'host' ? groupLabel(t.groupSize, th, 'host') : groupLabel(t.groupSize, th))
  return out.join(' · ') || (th ? 'ไม่มีอะไรเปลี่ยน' : 'no change')
}

export function closedLine(o: Offer, side: PlanSide, th: boolean): string {
  const st = effectiveOfferStatus(o)
  const first = fmtThb(o.steps[0]?.terms.priceThb ?? o.terms.priceThb)
  if (st === 'released' && o.taken) return side === 'host' ? (th ? 'มีโลคอลรับไปแล้ว · ไม่นับในคะแนนตอบกลับ' : 'This one was taken · it doesn’t count against your reply score') : th ? `ปล่อย ${o.localName} แล้ว · ไม่เสียเงิน` : `${o.localName} released automatically · no charge`
  if (st === 'declined') return th ? 'ปฏิเสธอย่างสุภาพ · คืนเงินครบ' : 'Declined politely · nothing charged'
  if (st === 'withdrawn') return th ? 'ถอนคำขอแล้ว · คืนเงินครบ' : 'Request withdrawn · nothing charged'
  if (st === 'released') return th ? 'ปิดแล้ว · ไม่เสียเงิน' : 'Closed · no charge'
  return side === 'host'
    ? th ? `หมดเวลา · ${first} คืนให้แขกแล้ว · ไม่มีผลกับคุณ` : `Expired · ${first} back to the guest · no effect on you`
    : th ? `หมดเวลา · ${first} คืนเข้ากระเป๋าคุณแล้ว` : `Expired · ${first} back to you · nothing charged`
}

function historyRows(o: Offer, side: PlanSide, th: boolean): Array<{ key: string; fee: number; text: string; at: string }> {
  return o.steps.map((s, i) => {
    const w = who(o, s.by, side, th)
    const what = (() => {
      switch (s.kind) {
        case 'offer':
          return th ? `ส่ง ${dayLabel(s.terms.date, th, true)} ${s.terms.start}` : `sent ${dayLabel(s.terms.date, th, true)} ${s.terms.start}`
        case 'counter':
        case 'change':
          return th ? `แก้ ${stepDiff(o, i, th, side)}` : `changed ${stepDiff(o, i, th, side)}`
        case 'accept':
          return th ? 'ตกลง' : 'accepted'
        case 'decline':
          return th ? 'ปฏิเสธ' : 'declined'
        case 'withdraw':
          return th ? 'ถอน' : 'withdrew'
        default:
          return th ? 'ปิดแล้ว' : 'closed'
      }
    })()
    return { key: `${o.id}-${i}`, fee: s.terms.priceThb, text: `${w} · ${what}`, at: clock(s.at) }
  })
}

/** One-line chat events for one record: every step, then what happened to the booking. */
export interface CardEvent {
  key: string
  at: number
  text: ReactNode
  tone?: 'ok' | 'off'
}
export function cardEvents(o: Offer, side: PlanSide, th: boolean, booking?: Booking | null, now = Date.now()): CardEvent[] {
  const out: CardEvent[] = o.steps.map((s, i) => {
    const w = who(o, s.by, side, th)
    const key = `${o.id}-${i}`
    switch (s.kind) {
      case 'offer':
        return { key, at: s.at, text: <>{w} {th ? 'ส่งคำขอ' : 'sent'}: <b>{fmtThb(s.terms.priceThb)}</b> · {dayLabel(s.terms.date, th, true)} {s.terms.start}</> }
      case 'counter':
      case 'change': {
        const d = stepDiff(o, i, th, side)
        const [fee, ...rest] = s.changed.includes('price') ? [d.split(' · ')[0], ...d.split(' · ').slice(1)] : ['', ...d.split(' · ')]
        return { key, at: s.at, text: <>{w} {th ? 'แก้' : 'changed'}: {fee ? <b>{fee}</b> : null}{fee && rest.length ? ' · ' : ''}{rest.join(' · ')}</> }
      }
      case 'accept':
        return { key, at: s.at, tone: 'ok' as const, text: <>{w} {th ? 'ตกลง' : 'accepted'} · <b>{fmtThb(s.terms.priceThb)}</b> {th ? <>พักไว้จน <span lang="th">กริ๊ง!</span></> : <>held until Kring!</>}</> }
      case 'decline':
        return { key, at: s.at, tone: 'off' as const, text: <>{w} {th ? 'ปฏิเสธ · ไม่เสียเงิน' : 'declined · nothing charged'}</> }
      case 'withdraw':
        return { key, at: s.at, tone: 'off' as const, text: <>{w} {th ? 'ถอนคำขอ · คืนเงินครบ' : 'withdrew · nothing charged'}</> }
      default:
        return { key, at: s.at, tone: 'off' as const, text: <>{closedLine(o, side, th)}</> }
    }
  })
  const st = effectiveOfferStatus(o, now)
  if (st === 'expired') out.push({ key: `${o.id}-exp`, at: o.replyBy, tone: 'off', text: <>{closedLine(o, side, th)}</> })
  if (booking && booking.status === 'released') {
    const amt = fmtThb(booking.heldThb)
    out.push({ key: `${o.id}-rel`, at: booking.releasedAt ?? booking.updatedAt, tone: 'ok', text: <><span lang={th ? 'th' : undefined}>{th ? 'กริ๊ง!' : 'Kring!'}</span> · <b>{amt}</b> {side === 'host' ? (th ? 'เข้ากระเป๋าคุณ' : 'released to you') : th ? `โอนให้ ${o.localName}` : `released to ${o.localName}`}</> })
  } else if (booking && (booking.status === 'cancelled' || booking.status === 'no-show')) {
    out.push({ key: `${o.id}-cx`, at: booking.cancelledAt ?? booking.updatedAt, tone: 'off', text: <>{booking.status === 'cancelled' ? (th ? `ยกเลิกการจอง · คืน ${fmtThb(booking.refundThb ?? 0)}` : `Booking cancelled · ${fmtThb(booking.refundThb ?? 0)} back`) : th ? `ไม่ได้เจอกัน · คืน ${fmtThb(booking.heldThb)}` : `No-show · ${fmtThb(booking.heldThb)} back`}</> })
  }
  return out
}

/** The one-line event in the thread ("Kwan changed: ฿1,200 · 17:00  view"). */
export function CardEventLine({ ev, th, onView }: { ev: CardEvent; th: boolean; onView?: () => void }) {
  return (
    <div className={`lc-evt${ev.tone ? ` is-${ev.tone}` : ''}`} data-testid="kring-card-event" role="note">
      <span className="lc-evd" aria-hidden="true" />
      <span className="lc-evt-t">{ev.text}</span>
      {onView ? (
        <button type="button" className="lc-vw" onClick={onView} data-testid="kring-card-event-view">
          {th ? 'ดู' : 'view'}
        </button>
      ) : null}
    </div>
  )
}

/**
 * The card docked above the composer: a slim bar ("฿1,200 · Sat 17:00 · Street-food walk  [Your turn] ⌄") that
 * expands the same card upward. `open` is owned by the chat so an event's "view" can open it.
 */
export function BookingDock({ offer, side, th, open, onToggle, onBump, onReview, onBooked }: { offer: Offer; side: PlanSide; th: boolean; open: boolean; onToggle: (open: boolean) => void; onBump?: (b: Booking) => void; onReview?: (b: Booking) => void; onBooked?: (id: string) => void }) {
  const store = usePlanStore()
  const o = store.offers[offer.id] ?? offer
  const now = useNow(effectiveOfferStatus(o) === 'open' ? 1000 : 30_000)
  const booking = o.bookingId ? store.bookings[o.bookingId] : undefined
  const s = cardStatus(o, side, th, now, booking)
  const short = `${dayLabel(o.terms.date, th, true).split(' ')[0]} ${o.terms.start}`
  // the other side's move opens the card by itself (your turn) — once per step
  const seen = useRef(o.steps.length)
  useEffect(() => {
    if (o.steps.length === seen.current) return
    seen.current = o.steps.length
    const last = o.steps[o.steps.length - 1]
    if (last && last.by !== side && effectiveOfferStatus(o) === 'open') onToggle(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.steps.length])
  return (
    <div className={`lc-dock${open ? ' is-open' : ''}`} data-testid="kring-card-dock" data-state={effectiveOfferStatus(o, now)}>
      <div className="lc-pan" aria-hidden={!open} {...(!open ? ({ inert: '' } as Record<string, string>) : {})}>
        {open ? <BookingCard offer={o} side={side} th={th} variant="dock" onBump={onBump} onReview={onReview} onBooked={onBooked} /> : null}
      </div>
      <button
        type="button"
        className={`lc-slim is-${s.tone}`}
        data-testid="kring-card-slim"
        aria-expanded={open}
        aria-label={th ? `การ์ดจอง: ${s.label} · ${open ? 'ปิด' : 'เปิด'}` : `Booking card: ${s.label}. ${open ? 'Close' : 'Open'}`}
        onClick={() => {
          triggerHaptic('tap')
          onToggle(!open)
        }}
      >
        <KringMark size={22} />
        <span className="lc-slim-t">
          <b>{fmtThb(o.terms.priceThb)}</b> · {short} · {o.experienceTitle || (th ? 'ทริป' : 'Experience')}
        </span>
        <span className={`lc-st is-${s.tone}`}>{s.label}</span>
        <span className="lc-cv">{I.chev}</span>
      </button>
    </div>
  )
}

/**
 * The same card on its own sheet (Local home "Change", or anywhere a card must open outside the chat). Portalled to
 * body at the sheet layer.
 */
export function BookingCardSheet({ offer, side, th, onClose, onBump, onReview }: { offer: Offer; side: PlanSide; th: boolean; onClose: () => void; onBump?: (b: Booking) => void; onReview?: (b: Booking) => void }) {
  const [closing, setClosing] = useState(false)
  const close = () => {
    setClosing(true)
    window.setTimeout(onClose, 220)
  }
  useBackEntry(!closing, close)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const other = side === 'guest' ? offer.localName : offer.guestName
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className={`lc-book${closing ? ' is-closing' : ''}`} role="dialog" aria-modal="true" aria-label={th ? `การ์ดจองกับ ${other}` : `Your card with ${other}`} data-testid="kring-card-sheet">
      <button type="button" className="lc-book-scrim" aria-label={th ? 'ปิด' : 'Close'} tabIndex={-1} onClick={close} />
      <div className="lc-book-sh">
        <div className="lc-grab" aria-hidden="true" />
        <header className="lc-book-h">
          <div>
            <small>{offer.experienceTitle || (th ? 'ทริป' : 'Experience')}</small>
            <h2>{th ? `การ์ดของคุณกับ ${other}` : `Your card with ${other}`}</h2>
          </div>
          <button type="button" className="lc-x kf-press" aria-label={th ? 'ปิด' : 'Close'} onClick={close}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </header>
        <BookingCard offer={offer} side={side} th={th} spec onBump={onBump} onReview={onReview} />
      </div>
    </div>,
    document.body,
  )
}
