import { useEffect, useMemo, useRef, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { LOCAL_PROFILES, type LocalProfile } from '../../lib/experiences'
import {
  tryAcceptOffer,
  allowsVenueChange,
  bookingsFor,
  partnerKey,
  createOffer,
  effectiveOfferStatus,
  declineOffer,
  hasSeen,
  incomingOffersFor,
  isDemoSession,
  markSeen,
  OFFER_REPLY_MS,
  offerMsLeft,
  setAllowVenueChange,
  usePlanStore,
  type Booking,
  type Offer,
} from '../../lib/planStore'
import BumpCheckIn from './BumpCheckIn'
import PlanTicket from './PlanTicket'
import { BookingCardSheet } from './BookingCard'
import { flowLogo } from '../ui/KringMark'
import { bkkDay, fmtThb, reducedMotion, ReleaseGate, Ring, untilParts, useNow, whenLine } from './parts'
import './booking.css'

/**
 * Kring · Local home — incoming offers (round 1 A11) + today's booking tickets.
 *
 * Each guest offer drops in from the top tilted −30° (spring.bouncy) with a countdown ring that drains linearly and
 * turns anchan → marigold, "Their offer ฿1,000" next to "Your from ฿1,200", and Decline / Counter / Accept.
 *   Accept  → `acceptOffer(…, 'host')` and the card flips 180° on Y into the cream ticket (backface hidden).
 *   Counter → the Suggest-a-change sheet (price + time; venue too); when the guest accepts, a "✓ Sarah accepted"
 *             pill lands on the ticket.
 *   Decline → polite, nothing charged (`declineOffer`).
 * A local's phone never moves wallet money for a guest's hold (`heldHere` is false here) — the release to her happens
 * at the bump (BumpCheckIn, side 'host').
 * Demo: one traveller offer (Sarah, solo, the local's OWN signature experience — e.g. Ploy's herbal-spa afternoon) is
 * seeded once a night. Real accounts with no offers yet get a helpful empty state + "See an example offer" (a card
 * clearly labelled EXAMPLE that never touches planStore).
 * The bump button is the shared ReleaseGate: it opens only inside the booking window (planStore `canRelease`).
 * Testids: kring-local-offers, kring-incoming-{offerId} (data-state), kring-incoming-accept|counter|decline,
 *          kring-local-ticket-{bookingId}, kring-local-bump, kring-venue-change-setting.
 */

const SARAH = 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=200&q=80'

/** the local's own signature experience (so the demo offer is for something she actually hosts) */
function ownExperience(localName: string, th: boolean): { id: string; title: string; venue: string; fromThb: number; hours: number } {
  const first = localName.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  const p: LocalProfile | undefined = Object.values(LOCAL_PROFILES).find((x) => x.name.toLowerCase() === first)
  const sig = p?.signature[0]
  if (p && sig) return { id: sig.id, title: th ? sig.titleTh : sig.titleEn, venue: th ? p.placeTh : p.placeEn, fromThb: sig.fromThb, hours: sig.hours }
  return { id: 'street-food-walk', title: th ? 'เดินกินสตรีทฟู้ดเยาวราช' : 'Yaowarat street-food walk', venue: th ? 'MRT วัดมังกร ทางออก 1' : 'Wat Mangkon MRT · exit 1', fromThb: 1200, hours: 3 }
}
const addHours = (start: string, h: number) => {
  const [hh, mm] = start.split(':').map(Number)
  const t = (hh * 60 + mm + Math.round(h * 60)) % 1440
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export interface IncomingOffersProps {
  localId: string
  localName: string
  th: boolean
  /** her own starting price (shown as "Your from") */
  fromThb: number
  online: boolean
  faces?: Record<string, string>
  /** Local home shows Live / Paused in its own header — don't repeat it here */
  showStatus?: boolean
}

/**
 * Demo: one traveller request for the local's own experience arrives once a night (same record in Chats — a hosting
 * row — and in Local home). Real sessions: nothing.
 */
export function seedDemoIncoming(localId: string, localName: string, th: boolean, fromThb = 1000): void {
  if (!isDemoSession() || !localId) return
  const key = `kring:seed-offer:${localId}`
  if (hasSeen(key)) return
  markSeen(key)
  const exp = ownExperience(localName, th)
  const from = Math.max(300, exp.fromThb || fromThb)
  createOffer(
    {
      experienceId: exp.id,
      experienceTitle: exp.title,
      guestId: 'sarah',
      guestName: 'Sarah',
      localId,
      localName,
      fromThb: from,
      // a daytime booking, a few days out, a little under her "from" (so Change has a reason)
      terms: { priceThb: Math.max(300, from - 200), date: bkkDay(3), start: '14:00', end: addHours('14:00', exp.hours || 2), venue: exp.venue, groupSize: 1 },
    },
    'guest',
    Date.now() - 20_000,
    { hold: false, demoReply: false },
  )
}

export default function IncomingOffers({ localId, localName, th, fromThb, online, faces = {}, showStatus = true }: IncomingOffersProps) {
  const store = usePlanStore()
  const now = useNow(1000)
  const [changeFor, setChangeFor] = useState<Offer | null>(null)
  const [flipping, setFlipping] = useState<Record<string, string>>({})
  const [flipOn, setFlipOn] = useState<Record<string, boolean>>({})
  const [bumpFor, setBumpFor] = useState<Booking | null>(null)
  const seeded = useRef(false)

  // demo: one traveller offer arrives once a night
  useEffect(() => {
    if (seeded.current) return
    seeded.current = true
    seedDemoIncoming(localId, localName, th, fromThb)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localId])

  const incoming = useMemo(() => incomingOffersFor(localId, now), [store.offers, localId, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const tickets = useMemo(() => bookingsFor(localId).filter((b) => partnerKey(b.localId) === partnerKey(localId)).filter((b) => b.status === 'held' || (b.status === 'released' && now - (b.releasedAt ?? 0) < 6 * 3600_000)), [store.bookings, localId, now]) // eslint-disable-line react-hooks/exhaustive-deps
  const flipIds = new Set(Object.values(flipping))
  // FIX3 · Ploy 1: the moment a waiting request runs out on screen, say so (island) and mark its line as new
  const prevOpen = useRef<Set<string>>(new Set())
  const [justLapsed, setJustLapsed] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const openNow = new Set(incoming.map((o) => o.id))
    for (const id of prevOpen.current) {
      const o = store.offers[id]
      if (!openNow.has(id) && o && effectiveOfferStatus(o, now) === 'expired') {
        window.dispatchEvent(new CustomEvent('chon:island', { detail: { text: th ? `คำขอของ ${o.guestName} หมดเวลา · แขกได้เงินคืน ไม่มีผลกับคุณ` : `${o.guestName}'s request expired · the guest got their money back · no effect on you`, tone: 'neutral', icon: '⏱' } }))
        setJustLapsed((m) => ({ ...m, [id]: true }))
      }
    }
    prevOpen.current = openNow
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incoming])
  // FIX2 · Ploy 10: a request that ran out never just vanishes — one quiet line says so (no effect on her)
  const lapsed = useMemo(
    () =>
      Object.values(store.offers)
        .filter((o) => partnerKey(o.localId) === partnerKey(localId) && !o.multiId && effectiveOfferStatus(o, now) === 'expired' && now - o.replyBy < 12 * 3600_000)
        .sort((a, b) => b.replyBy - a.replyBy)
        .slice(0, 2),
    [store.offers, localId, now], // eslint-disable-line react-hooks/exhaustive-deps
  )

  const [example, setExample] = useState(false)
  const accept = (o: Offer) => {
    const b = tryAcceptOffer(o.id, 'host').booking
    if (!b) {
      triggerHaptic('error', { sound: false })
      window.dispatchEvent(new CustomEvent('chon:island', { detail: { text: th ? 'ข้อเสนอนี้ปิดไปแล้ว' : 'This offer already closed', tone: 'neutral' } }))
      return
    }
    triggerHaptic('success', { burst: false })
    setFlipping((f) => ({ ...f, [o.id]: b.id }))
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => setFlipOn((f) => ({ ...f, [o.id]: true }))))
    // once the flip has landed, the ticket joins today's list (same component, no flip wrapper)
    window.setTimeout(() => {
      setFlipping((f) => {
        const { [o.id]: _gone, ...rest } = f
        void _gone
        return rest
      })
    }, reducedMotion() ? 0 : 900)
  }

  const venueOpen = allowsVenueChange(localId)
  const drop = reducedMotion() ? '' : ' is-drop'

  const card = (o: Offer, isExample = false) => {
    const left = isExample ? 0.72 : offerMsLeft(o, now) / OFFER_REPLY_MS
    const mine = o.lastBy === 'host'
    const face = faces[o.guestId] ?? (o.guestId === 'sarah' ? SARAH : undefined)
    return (
      <div className={`kb-inc${drop}${isExample ? ' is-example' : ''}`} data-testid={isExample ? 'kring-incoming-example' : `kring-incoming-${o.id}`} data-state={isExample ? 'example' : mine ? 'countered' : 'open'}>
        {isExample ? <span className="kb-example-tag">{th ? 'ตัวอย่าง' : 'Example'}</span> : null}
        <div className="kb-inc-top">
          <Ring left={left} size={56} stroke={4} label={isExample ? '7:12' : untilParts(offerMsLeft(o, now))[0]} testId="kring-incoming-ring" />
          <div>
            <span className="kb-kicker">
              {mine ? (th ? 'คุณเสนอกลับแล้ว' : 'You countered') : th ? 'คำขอจองใหม่' : 'New booking request'} · {th ? 'ผู้จอง' : 'Guest'}
            </span>
            <b>
              {o.guestName} <span aria-hidden="true" style={{ color: 'var(--verified, #3DF2FF)' }}>✓</span> · {o.terms.groupSize <= 1 ? (th ? '1 คน' : '1 guest') : th ? `${o.terms.groupSize} คน` : `${o.terms.groupSize} guests`}
            </b>
            <small className="kb-inc-exp">
              <b>{o.experienceTitle || (th ? 'ทริปกับโลคอล' : 'Experience with a local')}</b>
              <span>{whenLine(o.terms, th, true)}</span>
            </small>
          </div>
          {face ? <img className="kb-inc-av" src={face} alt="" loading="lazy" /> : <span className="kb-inc-av" aria-hidden="true">{o.guestName.slice(0, 1)}</span>}
        </div>
        <div className="kb-cmp">
          <div className={mine ? undefined : 'is-hi'}>
            <span className="kb-kicker">{mine ? (th ? 'ข้อเสนอคุณ' : 'Your counter') : th ? 'ข้อเสนอของแขก' : 'Their offer'}</span>
            <b>{fmtThb(o.terms.priceThb)}</b>
          </div>
          <div>
            <span className="kb-kicker">{th ? 'ราคาเริ่มของคุณ' : 'Your “from”'}</span>
            <b>{fmtThb(o.fromThb ?? fromThb)}</b>
          </div>
        </div>
        <small className="kb-note" style={{ marginTop: -4 }}>
          📍 {o.terms.venue} · {th ? `เงินแขกพักไว้แล้ว · คุณได้ ${fmtThb(Math.round(o.terms.priceThb * 0.8))} ตอนกริ๊ง` : `guest's money is held · you get ${fmtThb(Math.round(o.terms.priceThb * 0.8))} at the bump`}
        </small>
        {isExample ? (
          <p className="kb-note kb-example-note">
            {th
              ? 'คำขอจริงจะหน้าตาแบบนี้ · ตกลง เสนอกลับ หรือปฏิเสธได้ภายใน 10 นาที · ไม่ตอบ = แขกได้เงินคืน ไม่มีผลกับคุณ'
              : 'Real requests look like this · Accept, Counter or Decline within 10 min · no answer = the guest gets their money back, no penalty for you'}
          </p>
        ) : mine ? (
          <p className="kb-wait" style={{ margin: 0 }}>
            <span>{th ? `รอ ${o.guestName} ตอบ…` : `Waiting for ${o.guestName}…`}</span>
          </p>
        ) : (
          <div className="kb-actions" style={{ marginTop: 0 }}>
            <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-incoming-decline" onClick={() => { triggerHaptic('select'); declineOffer(o.id, 'host') }}>
              {th ? 'ปฏิเสธ' : 'Decline'}
            </button>
            <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-incoming-counter" onClick={() => { triggerHaptic('select'); setChangeFor(o) }}>
              {th ? 'แก้การ์ด' : 'Change'}
            </button>
            <button type="button" className="kb-btn kb-btn-gold" data-testid="kring-incoming-accept" onClick={() => accept(o)}>
              {th ? 'ตกลง' : 'Accept'}
            </button>
          </div>
        )}
      </div>
    )
  }


  return (
    <section className="kb-lh" data-testid="kring-local-offers" aria-label={th ? 'ข้อเสนอที่เข้ามา' : 'Incoming offers'}>
      <div className="kb-lh-status" hidden={!showStatus}>
        <span className="dot" aria-hidden="true" style={online ? undefined : { background: 'var(--ring-off, #4A4F72)', boxShadow: 'none' }} />
        <b>{online ? (th ? 'ออนไลน์อยู่' : 'Live') : th ? 'พักไว้ก่อน' : 'Paused'}</b>
        <span style={{ color: 'var(--text-3)' }}>· {online ? (th ? 'รับข้อเสนอถึง 22:00' : 'taking offers until 22:00') : th ? 'ไม่แสดงในหน้าประสบการณ์' : 'hidden from Experiences'}</span>
      </div>

      <div className="kb-lh-h">
        <h3>{th ? 'คำขอจองทริป' : 'Booking requests'}</h3>
        <small className="kb-note" style={{ margin: 0 }}>{incoming.length ? (th ? `${incoming.length} รอคุณตอบ` : `${incoming.length} waiting`) : ''}</small>
      </div>

      {lapsed.length ? (
        <div className="kb-lapsed-box" data-testid="kring-incoming-expired-box">
          <span className="kb-kicker">{th ? `คำขอที่หมดเวลา (${lapsed.length})` : `Expired requests (${lapsed.length})`}</span>
          {lapsed.map((o) => (
            <p key={`lapsed-${o.id}`} className={`kb-note kb-lapsed${justLapsed[o.id] ? ' is-new' : ''}`} data-testid="kring-incoming-expired">
              <b>{th ? 'หมดเวลา' : 'Expired'}</b>
              {' · '}
              {th
                ? `${o.guestName} · ${o.experienceTitle ?? 'ทริป'} · ${fmtThb(o.terms.priceThb)} คืนให้แขกแล้ว · ไม่มีผลกับคุณ`
                : `${o.guestName} · ${o.experienceTitle ?? 'experience'} · ${fmtThb(o.terms.priceThb)} back to the guest · no effect on you`}
            </p>
          ))}
        </div>
      ) : null}
      {incoming.length === 0 && Object.keys(flipping).length === 0 && tickets.length > 0 ? (
        <p className="kb-empty" data-testid="kring-local-empty">{th ? 'ไม่มีคำขอใหม่ตอนนี้ · การจองของคุณอยู่ด้านล่าง' : 'No new requests right now · your bookings are below'}</p>
      ) : null}
      {incoming.length === 0 && Object.keys(flipping).length === 0 && tickets.length === 0 ? (
        <div className="kb-empty-lh" data-testid="kring-local-empty">
          <b>{online ? (th ? 'ยังไม่มีคำขอจอง · ไม่เป็นไรนะ' : 'No booking requests yet · that’s normal') : th ? 'พักไว้ก่อน · ไม่มีคำขอใหม่' : 'Paused · no new requests come in'}</b>
          <ul>
            {online ? (
              <>
                <li>{th ? 'คำขอจะเด้งที่นี่ทันที พร้อมเวลา 10 นาทีให้ตอบ' : 'Requests land here instantly, with 10 minutes to answer'}</li>
                <li>{th ? 'โพสต์สตอรี่ 10 วิ ช่วยให้ขึ้นบนสุดในหน้าโลคอล' : 'A 10-second story moves you up in Locals'}</li>
                <li>{th ? 'ราคาที่ใกล้ราคากลางได้คำขอเร็วกว่า' : 'A “from” price near the usual price gets booked sooner'}</li>
              </>
            ) : (
              <li>{th ? 'เปิดออนไลน์อยู่เมื่อพร้อมรับทริป' : 'Go Live when you are ready to host'}</li>
            )}
          </ul>
          <button type="button" className="kb-link" data-testid="kring-local-example-btn" aria-expanded={example} onClick={() => { triggerHaptic('select'); setExample((v) => !v) }}>
            {example ? (th ? 'ซ่อนตัวอย่าง' : 'Hide the example') : th ? 'ดูตัวอย่างคำขอจอง' : 'See an example offer'}
          </button>
        </div>
      ) : null}
      {example && incoming.length === 0
        ? (() => {
            const exp = ownExperience(localName, th)
            const from = Math.max(300, exp.fromThb || fromThb)
            const t = Date.now()
            const ex: Offer = {
              id: 'example',
              experienceId: exp.id,
              experienceTitle: exp.title,
              guestId: 'example-guest',
              guestName: 'Emily',
              localId,
              localName,
              fromThb: from,
              terms: { priceThb: Math.max(300, from - 100), date: bkkDay(2), start: '10:00', end: addHours('10:00', exp.hours || 2), venue: exp.venue, groupSize: 2 },
              lastBy: 'guest',
              status: 'open',
              steps: [],
              heldThb: 0,
              heldHere: false,
              createdAt: t,
              updatedAt: t,
              replyBy: t + OFFER_REPLY_MS,
            }
            return <div className="kb-incoming">{card(ex, true)}</div>
          })()
        : null}

      {incoming.map((o) => (
        <div key={o.id} className="kb-incoming">
          {card(o)}
        </div>
      ))}

      {/* accepted just now: the card flips into the ticket */}
      {Object.entries(flipping).map(([oid, bid]) => {
        const o = store.offers[oid]
        const b = store.bookings[bid]
        if (!o || !b) return null
        return (
          <div key={oid} className="kb-incoming">
            <div className={`kb-flip${flipOn[oid] ? ' is-flipped' : ''}`}>
              <div className="kb-face">{card({ ...o, status: 'open' })}</div>
              <div className="kb-face is-back">
                <PlanTicket booking={b} side="host" th={th} variant="ticket" />
              </div>
            </div>
          </div>
        )
      })}

      {tickets.filter((b) => !flipIds.has(b.id)).map((b) => {
        const o = store.offers[b.offerId]
        const guestAccepted = o && o.lastBy === 'host' && now - b.createdAt < 8_000
        return (
          <div key={b.id} className="kb-incoming" data-testid={`kring-local-ticket-${b.id}`}>
            {guestAccepted ? <span className="kb-toast">✓ {th ? `${b.guestName} ตกลง ${fmtThb(b.heldThb)}` : `${b.guestName} accepted ${fmtThb(b.heldThb)}`}</span> : null}
            <PlanTicket booking={b} side="host" th={th} variant="ticket" />
            {b.status === 'held' ? (
              <div className="kb-lh-gate" data-testid="kring-local-bump-wrap">
                <ReleaseGate
                  booking={b}
                  th={th}
                  now={now}
                  block
                  label={th ? `ถึงจุดนัดแล้ว · ชนโทรศัพท์กับ ${b.guestName}` : `At the venue · bump with ${b.guestName}`}
                  onBump={() => {
                    triggerHaptic('select')
                    setBumpFor(b)
                  }}
                />
              </div>
            ) : null}
          </div>
        )
      })}

      <button
        type="button"
        className="kb-lh-status"
        data-testid="kring-venue-change-setting"
        role="switch"
        aria-checked={venueOpen}
        style={{ justifyContent: 'space-between', cursor: 'pointer', color: 'inherit' }}
        onClick={() => {
          triggerHaptic('select')
          setAllowVenueChange(localId, !venueOpen)
        }}
      >
        <span>{th ? 'แขกขอเปลี่ยนจุดนัดได้' : 'Guests may suggest another venue'}</span>
        <b style={{ color: venueOpen ? 'var(--success-text)' : 'var(--text-3)' }}>{venueOpen ? (th ? 'ได้' : 'Yes') : th ? 'ไม่' : 'No'}</b>
      </button>

      {/* V3 · the local edits the SAME living card the guest sees (no second "counter" form) */}
      {changeFor ? <BookingCardSheet offer={store.offers[changeFor.id] ?? changeFor} side="host" th={th} onClose={() => setChangeFor(null)} onBump={(b) => setBumpFor(b)} /> : null}
      {bumpFor ? <BumpCheckIn booking={bumpFor} side="host" th={th} onClose={() => setBumpFor(null)} onReleased={() => window.setTimeout(flowLogo, 900)} /> : null}
    </section>
  )
}
