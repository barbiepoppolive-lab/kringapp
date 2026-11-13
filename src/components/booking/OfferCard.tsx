import { useEffect, useRef, useState } from 'react'
import Odometer from '../ui/Odometer'
import { triggerHaptic } from '../../lib/haptics'
import { lastKnownBalance, TOPUP_DONE_EVENT } from '../vip/walletKit'
import {
  tryAcceptOffer,
  allowsVenueChange,
  declineOffer,
  effectiveOfferStatus,
  getPlanStore,
  offerMsLeft,
  offerStage,
  OFFER_REPLY_MS,
  type Offer,
  type OfferField,
  type OfferTerms,
  type PlanSide,
} from '../../lib/planStore'
import { fmtThb, OfferSteps, Ring, Typing, whenLine, whoLine, useNow, reducedMotion, untilParts } from './parts'
import './booking.css'

/**
 * Kring · Offer card (chat bubble) — round 1 A5 + round 2 A5.
 *
 * ONE card per offer that holds price · date · start–end · venue · group size. It reads straight from planStore, so
 * the guest's chat, the local's chat and Local home always show the same terms.
 *   · my terms on the table    → marigold card "OFFER · YOU", "Waiting for Mint…" + countdown ring (+ typing dots)
 *   · their terms on the table → night card with [Suggest a change] [Accept · ตกลง] (a local also gets Decline)
 *   · a change                 → only the rows that changed get a marigold rim; old value struck through, new bold
 *   · accepted                 → green "ACCEPTED" stamp lands from 1.6× at −8° + "✓ Booked · ฿X held until you meet"
 *   · taken / declined / expired → dims to 55 % with the plain reason ("No charge")
 * Motion: pops in from rotateX 30° (spring.bouncy); stamp lands bouncy; digits roll (Odometer). Reduced motion: static.
 * Testids: kring-offer-card (+ data-state), kring-offer-accept, kring-offer-change, kring-offer-decline, kring-offer-stamp.
 */

export interface OfferCardProps {
  offer: Offer
  /** which side THIS device is in the chat */
  side: PlanSide
  th: boolean
  /** open the Suggest-a-change sheet (time · venue · price) */
  onSuggestChange?: (offer: Offer) => void
  /** after a booking is made from this card */
  onBooked?: (bookingId: string) => void
  /** "Message" shortcut on a released card is not needed — keep the card quiet */
  compact?: boolean
}

const ROW_ORDER: Array<{ k: 'when' | 'meet' | 'who'; field?: OfferField }> = [
  { k: 'when', field: 'time' },
  { k: 'meet', field: 'venue' },
  { k: 'who' },
]

export default function OfferCard({ offer, side, th, onSuggestChange, onBooked, compact = false }: OfferCardProps) {
  const now = useNow(1000)
  const st = effectiveOfferStatus(offer, now)
  const stage = offerStage(offer, now)
  const mine = offer.lastBy === side
  const open = st === 'open'
  const last = offer.steps[offer.steps.length - 1]
  const lastChange = [...offer.steps].reverse().find((s) => s.kind === 'counter' || s.kind === 'change')
  const changed = open && lastChange && lastChange === last ? lastChange.changed : st === 'accepted' && lastChange ? lastChange.changed : []
  const prev: OfferTerms | undefined = changed.length ? lastChange?.prev : undefined
  const other = side === 'guest' ? offer.localName : offer.guestName
  const author = offer.lastBy === 'guest' ? offer.guestName : offer.localName
  // the ring drains over THIS window (an offer riding on the sheet's 15-min hold keeps that window)
  const windowMs = Math.max(OFFER_REPLY_MS, offer.replyBy - (offer.steps[offer.steps.length - 1]?.at ?? offer.createdAt))
  const left = offerMsLeft(offer, now) / windowMs
  // the ACCEPTED stamp lands once — when the accept happens while the card is on screen, or when the card first
  // mounts within a few seconds of it (the sheet → chat hand-off), never again on a reload
  const [stampKey, setStampKey] = useState(() => (st === 'accepted' && Date.now() - offer.updatedAt < 6_000 && !reducedMotion() ? 1 : 0))
  const wasAccepted = useRef(st === 'accepted')
  const cardRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (st !== 'accepted' || wasAccepted.current) return
    wasAccepted.current = true
    // FIX3 · Marco 2: the stamp must be SEEN — it waits (≤ 8 s) until the card is on screen and nothing (the
    // top-up e-slip, a sheet) covers it, then lands
    const seen = () => {
      const el = cardRef.current
      if (!el || typeof document.elementFromPoint !== 'function') return true
      const r = el.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= window.innerHeight || r.height === 0) return false
      const y = Math.min(window.innerHeight - 4, Math.max(4, r.top + Math.min(r.height / 2, 60)))
      // a sheet / dialog open above the chat (e.g. the top-up e-slip) hides the moment even if it doesn't cover the point
      const covering = [...document.querySelectorAll('[role="dialog"], [aria-modal="true"]')].some((d) => {
        if (d.contains(el)) return false
        const b = (d as HTMLElement).getBoundingClientRect()
        return b.height > 40 && b.bottom > 0 && b.top < window.innerHeight && getComputedStyle(d as HTMLElement).visibility !== 'hidden'
      })
      if (covering) return false
      const hit = document.elementFromPoint(r.left + r.width / 2, y)
      return !hit || el.contains(hit)
    }
    let tries = 0
    let t: number | undefined
    const land = () => {
      if (seen() || ++tries > 40) {
        setStampKey((k) => k + 1)
        triggerHaptic('success', { burst: false, sound: false })
        return
      }
      t = window.setTimeout(land, 200)
    }
    land()
    return () => window.clearTimeout(t)
  }, [st])
  // FIX1 · never fail silently: an accept that needs more CASH says so and opens Top up with the exact amount;
  // once the top-up lands the accept goes through by itself.
  const [short, setShort] = useState<{ needThb: number } | null>(null)
  const retryRef = useRef(false)

  const kicker = (() => {
    const kind = offer.steps.length > 1 && lastChange ? (lastChange.kind === 'counter' ? 'counter' : 'change') : 'offer'
    if (kind === 'offer') return mine ? (th ? 'ข้อเสนอ · คุณ' : 'Offer · you') : th ? `ข้อเสนอ · จาก ${author}` : `Offer · from ${author}`
    if (kind === 'counter') return mine ? (th ? 'คุณเสนอกลับ' : 'You countered') : th ? `${author} เสนอกลับ` : `Counter · ${author}`
    return mine ? (th ? 'คุณขอเปลี่ยน' : 'You suggested a change') : th ? `${author} ขอเปลี่ยน` : `${author} suggested a change`
  })()

  const openTopUp = (needThb: number) => {
    retryRef.current = true
    window.dispatchEvent(
      new CustomEvent('chon:open-topup', {
        detail: {
          needThb,
          reason: th
            ? `เติมเงินสด ${fmtThb(needThb)} เพื่อตกลง ${fmtThb(offer.terms.priceThb)} กับ ${other} · โปรโมใช้จ่ายค่าจองไม่ได้`
            : `Add ${fmtThb(needThb)} cash to accept ${other}'s ${fmtThb(offer.terms.priceThb)} · promo can't pay bookings`,
        },
      }),
    )
  }
  const accept = (fromTopUp = false) => {
    const r = tryAcceptOffer(offer.id, side)
    if (!r.booking) {
      if (r.reason === 'short-cash') {
        const cash = Math.floor((lastKnownBalance()?.paidCoins ?? 0) / 100)
        const needThb = Math.max(1, (r.needThb ?? 0) - Math.max(0, cash))
        triggerHaptic('warning', { sound: false })
        setShort({ needThb })
        if (!fromTopUp) openTopUp(needThb)
      } else {
        triggerHaptic('error', { sound: false })
        window.dispatchEvent(new CustomEvent('chon:island', { detail: { text: th ? 'ข้อเสนอนี้ปิดไปแล้ว · ดูสถานะล่าสุดบนการ์ด' : 'This offer already closed · the card shows where it stands', tone: 'neutral' } }))
      }
      return
    }
    setShort(null)
    retryRef.current = false
    onBooked?.(r.booking.id)
  }
  useEffect(() => {
    if (!short) return
    const onDone = () => {
      if (!retryRef.current) return
      // the credit lands on the same tick; accept right after
      window.setTimeout(() => accept(true), 60)
    }
    window.addEventListener(TOPUP_DONE_EVENT, onDone)
    return () => window.removeEventListener(TOPUP_DONE_EVENT, onDone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [short, offer.id])

  const decline = () => {
    triggerHaptic('select')
    declineOffer(offer.id, side)
  }

  const venueLocked = side === 'guest' && !allowsVenueChange(offer.localId)
  const stepIdx: 0 | 1 | 2 = st === 'accepted' ? 2 : offer.steps.length > 1 ? 1 : 0
  const booking = offer.bookingId ? getPlanStore().bookings[offer.bookingId] : undefined
  const dim = st === 'released' || st === 'declined' || st === 'withdrawn' || st === 'expired'
  const tone = st === 'accepted' ? 'is-agreed' : mine ? 'is-mine' : 'is-theirs'

  const rowValue = (k: 'when' | 'meet' | 'who', t: OfferTerms) => (k === 'when' ? whenLine(t, th, true) : k === 'meet' ? t.venue || (th ? 'จุดนัดสาธารณะ' : 'Public meeting point') : whoLine(t.groupSize, th, side))

  return (
    <article
      ref={cardRef}
      data-offer-id={offer.id}
      className={`kb-offer ${tone}${dim ? ' is-dim' : ''}${compact ? ' is-compact' : ''}${reducedMotion() ? '' : ' is-pop'}`}
      data-testid="kring-offer-card"
      data-state={st}
      aria-label={`${kicker} · ${fmtThb(offer.terms.priceThb)}`}
    >
      {!compact && <OfferSteps stage={stepIdx} th={th} />}
      <header className="kb-offer-h">
        <span className="kb-kicker">{kicker}</span>
        {open && mine ? (
          <span className="kb-offer-cd">
            <small>{untilParts(offerMsLeft(offer, now))[0]}</small>
            <Ring left={left} size={26} stroke={3} className="kb-offer-ring" testId="kring-offer-ring" />
          </span>
        ) : null}
      </header>
      <div className={`kb-offer-price${changed.includes('price') ? ' is-changed' : ''}`}>
        {prev && changed.includes('price') ? <s>{fmtThb(prev.priceThb)}</s> : null}
        <Odometer value={offer.terms.priceThb} className="kb-odo" />
      </div>
      <dl className="kb-rows">
        {ROW_ORDER.map(({ k, field }) => {
          const isCh = field ? changed.includes(field) : false
          return (
            <div key={k} className={isCh ? 'is-changed' : undefined}>
              <dt>{k === 'when' ? (th ? 'เวลา' : 'When') : k === 'meet' ? (th ? 'นัดที่' : 'Meet') : side === 'host' ? (th ? 'ผู้ร่วมทริป' : 'Guests') : th ? 'ใคร' : 'Who'}</dt>
              <dd>
                {isCh && prev ? <s>{rowValue(k, prev)}</s> : null}
                <b>{rowValue(k, offer.terms)}</b>
                {k === 'meet' && venueLocked && open && !mine ? <small className="kb-lockline">{th ? `${offer.localName} ใช้จุดนัดเดิม` : `${offer.localName} keeps a fixed meeting point`}</small> : null}
              </dd>
            </div>
          )
        })}
      </dl>

      {/* actions */}
      {open && !mine ? (
        <>
        <div className="kb-actions">
          {side === 'host' ? (
            <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-offer-decline" onClick={decline}>
              {th ? 'ปฏิเสธ' : 'Decline'}
            </button>
          ) : null}
          <button
            type="button"
            className="kb-btn kb-btn-ghost"
            data-testid="kring-offer-change"
            onClick={() => {
              triggerHaptic('select')
              onSuggestChange?.(offer)
            }}
          >
            {side === 'host' ? (th ? 'เสนอกลับ' : 'Counter') : th ? 'ขอเปลี่ยน' : 'Suggest a change'}
          </button>
          <button type="button" className="kb-btn kb-btn-gold" data-testid="kring-offer-accept" onClick={() => accept()}>
            {th ? 'ตกลง' : 'Accept'}
            <span className="kb-btn-sub">{fmtThb(offer.terms.priceThb)}</span>
          </button>
        </div>
          {short ? (
            <div className="kb-short" role="alert" data-testid="kring-offer-short">
              <span>
                <b>{th ? `ขาดเงินสดอีก ${fmtThb(short.needThb)}` : `${fmtThb(short.needThb)} more cash needed`}</b>
                <small>{th ? 'โปรโมใช้จ่ายค่าจองไม่ได้ · เติมแล้วระบบตกลงให้เลย' : "Promo can't pay bookings · top up and we accept for you"}</small>
              </span>
              <button type="button" className="kb-btn kb-btn-gold" data-testid="kring-offer-topup" onClick={() => openTopUp(short.needThb)}>
                {th ? `เติม ${fmtThb(short.needThb)}` : `Add ${fmtThb(short.needThb)}`}
              </button>
            </div>
          ) : null}
        </>
      ) : open && mine ? (
        <p className="kb-wait" data-testid="kring-offer-waiting">
          <span className="kb-wait-l">
          {stage === 'typing' ? <Typing label={th ? `${other} กำลังพิมพ์` : `${other} is typing`} /> : null}
          <span>
            {stage === 'typing'
              ? th ? `${other} กำลังพิมพ์…` : `${other} is typing…`
              : stage === 'seen'
                ? th ? `${other} เห็นแล้ว · รอคำตอบ` : `Seen by ${other} · waiting…`
                : th ? `ส่งถึง ${other} แล้ว · รอคำตอบ` : `Waiting for ${other}…`}
          </span>
          </span>
          {side === 'guest' && offer.heldThb > 0 ? <small>{th ? `กัน ${fmtThb(offer.heldThb)} ไว้ · ไม่เจอ ไม่เสียเงิน` : `${fmtThb(offer.heldThb)} held · no meet, no charge`}</small> : null}
          <button type="button" className="kb-link" data-testid="kring-offer-withdraw" onClick={decline}>
            {th ? 'ถอนข้อเสนอ' : 'Withdraw'}
          </button>
        </p>
      ) : st === 'accepted' ? (
        <p className={`kb-booked${booking && booking.status !== 'held' ? ` is-${booking.status}` : ''}`} data-testid="kring-offer-booked" data-booking={booking?.status ?? 'held'}>
          {(() => {
            const amt = fmtThb(booking?.heldThb ?? offer.terms.priceThb)
            const toLocal = fmtThb(
              booking?.localReceiveThb ?? Math.round((booking?.heldThb ?? offer.terms.priceThb) * 0.8),
            )
            switch (booking?.status) {
              case 'released':
                return side === 'host'
                  ? th ? `✓ โอนแล้ว · ${toLocal} เข้ากระเป๋าคุณ · กริ๊ง!` : `✓ Released · ${toLocal} to your wallet · Kring!`
                  : th ? `✓ โอนแล้ว · ${amt} ให้ ${offer.localName} · กริ๊ง!` : `✓ Released · ${amt} to ${offer.localName} · Kring!`
              case 'cancelled':
                return th ? `ยกเลิกการจองแล้ว · คืน ${fmtThb(booking.refundThb ?? 0)}` : `Booking cancelled · ${fmtThb(booking.refundThb ?? 0)} back`
              case 'no-show':
                return th ? `${offer.localName} ไม่มา · คืนเต็ม ${amt}` : `${offer.localName} didn’t show · ${amt} back in full`
              default:
                return side === 'host'
                  ? th ? `✓ จองแล้ว · คุณได้ ${toLocal} ตอนกริ๊ง` : `✓ Booked · you get ${toLocal} at the bump`
                  : th ? `✓ จองแล้ว · ${amt} พักไว้จนเจอกัน` : `✓ Booked · ${amt} held until you meet`
            }
          })()}
        </p>
      ) : (
        <p className="kb-closed" data-testid="kring-offer-closed">
          {st === 'released' && offer.taken
            ? side === 'host'
              ? th ? 'มีโลคอลรับไปแล้ว · ไม่นับในอัตราตอบกลับ' : 'This one was taken · it doesn’t count against your reply score'
              : th ? `ปล่อย ${offer.localName} แล้ว · ไม่เสียเงิน` : `${offer.localName} released automatically · no charge`
            : st === 'declined'
              ? th ? 'ปฏิเสธอย่างสุภาพ · คืนเงินครบ' : 'Declined politely · nothing charged'
              : st === 'withdrawn'
                ? th ? 'ถอนข้อเสนอแล้ว · คืนเงินครบ' : 'Offer withdrawn · nothing charged'
                : side === 'host'
                  ? th
                    ? `หมดเวลา · ${fmtThb(offer.steps[0]?.terms.priceThb ?? offer.terms.priceThb)} คืนให้แขกแล้ว · ไม่มีผลกับคุณ`
                    : `Expired · ${fmtThb(offer.steps[0]?.terms.priceThb ?? offer.terms.priceThb)} back to the guest · no effect on you`
                  : th
                    ? `หมดเวลา · ${fmtThb(offer.steps[0]?.terms.priceThb ?? offer.terms.priceThb)} คืนเข้ากระเป๋าคุณแล้ว`
                    : `Expired · ${fmtThb(offer.steps[0]?.terms.priceThb ?? offer.terms.priceThb)} back to you · nothing charged`}
        </p>
      )}

      {st === 'accepted' ? (
        <span key={stampKey} className={`kb-stamp${stampKey ? ' is-land' : ''}`} data-testid="kring-offer-stamp" aria-hidden="true">
          {lastChange && lastChange.kind === 'change' ? (th ? 'ตกลงแล้ว' : 'Agreed') : th ? 'ตกลงแล้ว' : 'Accepted'}
        </span>
      ) : null}
    </article>
  )
}
