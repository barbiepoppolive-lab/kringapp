import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import Sheet from '../ui/Sheet'
import Odometer from '../ui/Odometer'
import { triggerHaptic } from '../../lib/haptics'
import { addMinutes, allowsVenueChange, counterOffer, hostShareThb, suggestChange, type Offer, type OfferField, type OfferTerms, type PlanSide } from '../../lib/planStore'
import { bkkDay, dayLabel, fmtThb } from './parts'
import { getExperience, toCity, venueIn } from '../../lib/experiences'
import './booking.css'

/**
 * Kring · Suggest a change (round 2 A5) — one sheet, three rows: time · venue · price.
 *
 * Either side can suggest. Each row that differs from the card gets a marigold rim and lifts 8 px; values tick with
 * a short roll. Send → `suggestChange` (or `counterOffer` when only the price moved and `mode === 'counter'`), which
 * restarts the 10-minute reply window. The Venue row is LOCKED for guests when the local turned
 * "Guests may suggest another venue" off at go-live ("Mint keeps a fixed meeting point").
 * The sheet tilts up from 14° (spring.default) — the `kb-tilt` class on the shared Sheet primitive.
 * Testids: kring-change-sheet, kring-change-{time|venue|price}-row, kring-change-send, kring-change-price-{minus|plus},
 *          kring-change-start-{minus|plus}, kring-change-venue-input.
 */

export interface SuggestChangeSheetProps {
  open: boolean
  offer: Offer | null
  side: PlanSide
  th: boolean
  /** 'counter' = the local's Counter button (price first); 'change' = Suggest a change */
  mode?: 'counter' | 'change'
  onClose: () => void
  onSent?: (offer: Offer) => void
}

/**
 * Public places people meet at (MRT exits, gates, info desks) — in the reader's language (FIX2 · Ploy: Thai mode is
 * Thai). A licensed venue (spa, salon) is never a generic suggestion: it only shows as the experience's own venue.
 */
export const MEETING_POINTS: ReadonlyArray<{ en: string; th: string; near: RegExp }> = [
  { en: 'Wat Mangkon MRT · exit 1', th: 'MRT วัดมังกร ทางออก 1', near: /yaowarat|chinatown|เยาวราช|ไชน่าทาวน์|wat mangkon|วัดมังกร/i },
  { en: 'Chinatown Gate (Odeon Circle)', th: 'วงเวียนโอเดียน (ซุ้มประตูเยาวราช)', near: /yaowarat|chinatown|เยาวราช|ไชน่าทาวน์|wat mangkon|วัดมังกร/i },
  { en: 'ICONSIAM · river entrance', th: 'ไอคอนสยาม ทางเข้าริมน้ำ', near: /iconsiam|ไอคอนสยาม|river|ริมน้ำ|wat arun|วัดอรุณ/i },
  { en: 'Lumphini Park · main gate', th: 'สวนลุมพินี ประตูหลัก', near: /lumphini|ลุมพินี|silom|สีลม/i },
  { en: 'Jodd Fairs · front gate', th: 'จ๊อดแฟร์ ประตูหน้า', near: /jodd|จ๊อด|rama ?9|พระราม 9/i },
  { en: 'Terminal 21 · ground-floor info desk', th: 'เทอร์มินอล 21 จุดประชาสัมพันธ์ชั้น G', near: /terminal 21|เทอร์มินอล|asok|อโศก/i },
  { en: 'Bali Hai Pier · info kiosk', th: 'ท่าเรือแหลมบาลีฮาย จุดประชาสัมพันธ์', near: /pattaya|พัทยา|koh larn|เกาะล้าน|bali hai|บาลีฮาย|jomtien|จอมเทียน|naklua|นาเกลือ/i },
  { en: 'Terminal 21 Pattaya · Gate 1', th: 'เทอร์มินอล 21 พัทยา ประตู 1', near: /pattaya|พัทยา|naklua|นาเกลือ|sanctuary|ปราสาทสัจธรรม/i },
  { en: 'Jomtien Night Market · entrance', th: 'ตลาดกลางคืนจอมเทียน ทางเข้าหลัก', near: /pattaya|พัทยา|jomtien|จอมเทียน|koh larn|เกาะล้าน/i },
]
export const PUBLIC_MEETING_POINTS = MEETING_POINTS.map((p) => p.en)

const STEP = 50

export default function SuggestChangeSheet({ open, offer, side, th, mode = 'change', onClose, onSent }: SuggestChangeSheetProps) {
  const [draft, setDraft] = useState<OfferTerms | null>(offer?.terms ?? null)
  const [venueQuery, setVenueQuery] = useState('')
  useEffect(() => {
    if (open && offer) {
      setDraft(offer.terms)
      setVenueQuery('')
    }
  }, [open, offer])

  const venueLocked = !!offer && side === 'guest' && !allowsVenueChange(offer.localId)
  const lengthMin = useMemo(() => {
    if (!offer) return 120
    const [sh, sm] = offer.terms.start.split(':').map(Number)
    const [eh, em] = offer.terms.end.split(':').map(Number)
    return ((eh * 60 + em - (sh * 60 + sm)) % 1440 + 1440) % 1440 || 120
  }, [offer])

  if (!offer || !draft) return null
  const base = offer.terms
  const changed: OfferField[] = []
  if (draft.date !== base.date || draft.start !== base.start || draft.end !== base.end) changed.push('time')
  if (draft.venue !== base.venue) changed.push('venue')
  if (draft.priceThb !== base.priceThb) changed.push('price')
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => bkkDay(i))
  const other = side === 'guest' ? offer.localName : offer.guestName

  const shiftStart = (delta: number) => {
    triggerHaptic('select')
    setDraft((d) => (d ? { ...d, start: addMinutes(d.start, delta), end: addMinutes(d.start, delta + lengthMin) } : d))
  }
  const shiftPrice = (delta: number) => {
    triggerHaptic('select')
    setDraft((d) => (d ? { ...d, priceThb: Math.max(STEP * 6, d.priceThb + delta) } : d))
  }
  const send = () => {
    if (!changed.length) return
    const only = changed.length === 1 && changed[0] === 'price'
    const next =
      mode === 'counter' && only
        ? counterOffer(offer.id, side, draft.priceThb)
        : suggestChange(offer.id, side, { date: draft.date, start: draft.start, end: draft.end, venue: draft.venue, priceThb: draft.priceThb }, Date.now(), mode === 'counter' ? 'counter' : 'change')
    if (!next) {
      triggerHaptic('error', { sound: false })
      return
    }
    triggerHaptic('select')
    onSent?.(next)
    onClose()
  }
  // FIX2 · Ploy 22: suggestions come from the BOOKED experience only — its own meeting place in this city
  // (venueIn), then public points right next to it. Never another local's spa / salon.
  const exp = getExperience(offer.experienceId)
  const ownV = exp ? venueIn(exp, toCity(/pattaya|พัทยา/i.test(base.venue) ? 'Pattaya' : 'Bangkok')) : null
  const own = ownV ? (th ? ownV.th : ownV.en) : ''
  const area = `${ownV?.en ?? ''} ${ownV?.th ?? ''} ${base.venue}`
  const points = [...(own ? [own] : []), ...MEETING_POINTS.filter((p) => p.near.test(area)).map((p) => (th ? p.th : p.en))].filter((v, i, a) => a.indexOf(v) === i)
  const matches = venueQuery.trim()
    ? points.filter((v) => v.toLowerCase().includes(venueQuery.trim().toLowerCase()))
    : points.filter((v) => v !== draft.venue).slice(0, 4)

  // portalled: a sheet opened from inside the chat room must not inherit the room's stacking rules
  return portal(
    <Sheet
      open={open}
      onClose={onClose}
      testId="kring-change-sheet"
      className="kb-tilt"
      initialDetent="92%"
      ariaLabel={mode === 'counter' ? (th ? 'เสนอกลับ' : 'Counter') : th ? 'ขอเปลี่ยน' : 'Suggest a change'}
      title={mode === 'counter' ? (th ? 'เสนอกลับ' : 'Counter') : th ? 'ขอเปลี่ยน' : 'Suggest a change'}
      subtitle={th ? `${other} จะเห็นเฉพาะสิ่งที่เปลี่ยน` : `${other} sees only what changed`}
      footer={
        <button type="button" className="kb-btn kb-btn-gold kb-btn-block" data-testid="kring-change-send" disabled={!changed.length} onClick={send}>
          {changed.length
            ? th ? `ส่งให้ ${other}` : `Send to ${other}`
            : th ? 'ยังไม่ได้เปลี่ยนอะไร' : 'Change something first'}
        </button>
      }
    >
      <div className="kb-change">
        {/* TIME */}
        <section className={`kb-crow${changed.includes('time') ? ' is-changed' : ''}`} data-testid="kring-change-time-row">
          <header>
            <span className="kb-kicker">{th ? 'เวลา' : 'Time'}</span>
            {changed.includes('time') ? <s>{dayLabel(base.date, th, true)} · {base.start}</s> : null}
          </header>
          <div className="kb-days" role="radiogroup" aria-label={th ? 'วัน' : 'Day'}>
            {days.map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={draft.date === d}
                className={draft.date === d ? 'is-on' : undefined}
                onClick={() => {
                  triggerHaptic('select')
                  setDraft((x) => (x ? { ...x, date: d } : x))
                }}
              >
                {dayLabel(d, th, true)}
              </button>
            ))}
          </div>
          <div className="kb-stepper">
            <button type="button" aria-label={th ? 'เร็วขึ้น 30 นาที' : '30 min earlier'} data-testid="kring-change-start-minus" onClick={() => shiftStart(-30)}>
              −
            </button>
            <b className="kb-tabnum">
              {draft.start}–{draft.end}
            </b>
            <button type="button" aria-label={th ? 'ช้าลง 30 นาที' : '30 min later'} data-testid="kring-change-start-plus" onClick={() => shiftStart(30)}>
              +
            </button>
          </div>
        </section>

        {/* VENUE */}
        <section className={`kb-crow${changed.includes('venue') ? ' is-changed' : ''}${venueLocked ? ' is-locked' : ''}`} data-testid="kring-change-venue-row">
          <header>
            <span className="kb-kicker">{th ? 'จุดนัด' : 'Venue'}</span>
            {venueLocked ? (
              <small className="kb-lockline">🔒 {th ? `${offer.localName} ใช้จุดนัดเดิม` : `${offer.localName} keeps a fixed meeting point`}</small>
            ) : side === 'guest' ? (
              <small className="kb-okline">✓ {th ? `${offer.localName} รับจุดนัดอื่นได้` : `${offer.localName} accepts other venues`}</small>
            ) : null}
          </header>
          {changed.includes('venue') ? <s className="kb-old">{base.venue}</s> : null}
          <b className="kb-venue-now">📍 {draft.venue || (th ? 'จุดนัดสาธารณะ' : 'Public meeting point')}</b>
          {!venueLocked && (
            <>
              <input
                type="search"
                className="kb-input"
                data-testid="kring-change-venue-input"
                placeholder={th ? 'ค้นหาสถานที่สาธารณะ' : 'Search a public place'}
                value={venueQuery}
                onChange={(e) => setVenueQuery(e.target.value)}
                aria-label={th ? 'ค้นหาจุดนัด' : 'Search a meeting point'}
              />
              <div className="kb-venues">
                {matches.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => {
                      triggerHaptic('select')
                      setDraft((x) => (x ? { ...x, venue: v } : x))
                      setVenueQuery('')
                    }}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <small className="kb-note">{th ? 'สถานที่สาธารณะเท่านั้น · ไม่มีห้องส่วนตัวหรือคอนโด' : 'Public places only · never private rooms or condos'}</small>
            </>
          )}
        </section>

        {/* PRICE */}
        <section className={`kb-crow${changed.includes('price') ? ' is-changed' : ''}`} data-testid="kring-change-price-row">
          <header>
            <span className="kb-kicker">{th ? 'ราคา' : 'Price'}</span>
            {changed.includes('price') ? <s>{fmtThb(base.priceThb)}</s> : null}
          </header>
          <div className="kb-stepper is-price">
            <button type="button" aria-label={th ? `ลด ฿${STEP}` : `Lower by ฿${STEP}`} data-testid="kring-change-price-minus" onClick={() => shiftPrice(-STEP)}>
              −
            </button>
            <Odometer value={draft.priceThb} className="kb-odo kb-odo-lg" />
            <button type="button" aria-label={th ? `เพิ่ม ฿${STEP}` : `Raise by ฿${STEP}`} data-testid="kring-change-price-plus" onClick={() => shiftPrice(STEP)}>
              +
            </button>
          </div>
          <small className="kb-note">
            {side === 'guest'
              ? th ? 'ยอดจองพักไว้จนเจอกัน · ปรับตามราคาที่ตกลง' : 'Held until you meet · settles to the agreed price'
              : th ? `คุณได้รับ ${fmtThb(hostShareThb(draft.priceThb))}` : `You receive ${fmtThb(hostShareThb(draft.priceThb))}`}
          </small>
        </section>
      </div>
    </Sheet>,
  )
}

function portal(node: React.ReactElement) {
  return typeof document !== 'undefined' ? createPortal(node, document.body) : node
}
