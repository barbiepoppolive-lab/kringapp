import { useState } from 'react'
import { KringMark } from '../ui/KringMark'
import { triggerHaptic } from '../../lib/haptics'
import { playKringBumpChime, triggerChaoPhrayaFireworks } from '../../lib/kringCreativeEngine'
import { bookingStartMs, cancelBooking, cancelRefundThb, FREE_CANCEL_MS, LATE_CANCEL_SHARE, type Booking, type PlanSide } from '../../lib/planStore'
import { dayLabel, fmtThb, reducedMotion, ReleaseGate, Ring, untilParts, useNow, whenLine, whoLine } from './parts'
import './booking.css'

/**
 * Kring · Plan ticket (round 1 A6 + round 3 R3 + round 1 A11 "flip into the ticket").
 *
 * One card for the day: "Booking confirmed" + booking number, the experience strip, "฿1,200 · held until you meet"
 * next to a countdown ring (time until the start), the venue strip (route draws, pin drops), Directions + Message,
 * three plain cancel / no-show rules, and the 🔒 "Private · only you and X" chip with "Who can see this booking?".
 *   variant 'card'   — pinned in the chat (both sides), lifts out of the screen from rotateX 26° (spring.bouncy)
 *   variant 'ticket' — the cream Local-home ticket the incoming-offer card flips into (backface hidden)
 * Money: nothing moves here except the guest's Cancel (`cancelBooking`, the existing refund call with the amount the
 * rules allow). The release happens at the bump (BumpCheckIn).
 * Testids: kring-plan-ticket (+data-status), kring-ticket-private, kring-ticket-who, kring-ticket-directions,
 *          kring-ticket-message, kring-ticket-bump, kring-ticket-cancel, kring-ticket-cancel-confirm, kring-ticket-review.
 */

export interface PlanTicketProps {
  booking: Booking
  side: PlanSide
  th: boolean
  variant?: 'card' | 'ticket'
  onBump?: () => void
  onMessage?: () => void
  onReview?: () => void
  photo?: string
}

export function mapsUrl(venue: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue}, Bangkok`)}`
}

function cutoffLabel(b: Booking, th: boolean): string {
  const t = bookingStartMs(b) - FREE_CANCEL_MS
  const d = new Date(t + 7 * 3600_000)
  const iso = d.toISOString()
  return `${dayLabel(iso.slice(0, 10), th, true).split(' ')[0]} ${iso.slice(11, 16)}`
}

export default function PlanTicket({ booking: b, side, th, variant = 'card', onBump, onMessage, onReview, photo }: PlanTicketProps) {
  const now = useNow(1000)
  const [showWho, setShowWho] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [nextSessions, setNextSessions] = useState<number>(1)
  const [showPartnerQr, setShowPartnerQr] = useState<boolean>(false)
  const [tipSentThb, setTipSentThb] = useState<number | null>(null)
  const other = side === 'guest' ? b.localName : b.guestName
  const startMs = bookingStartMs(b)
  const toStart = Math.max(0, startMs - now)
  const span = Math.max(1, startMs - b.createdAt)
  const held = b.status === 'held'
  const released = b.status === 'released'
  const amount = b.heldThb
  const title = b.experienceTitle || (th ? 'ทริปกับโลคอล' : 'Experience with a local')
  const refundNow = cancelRefundThb(b, now)
  const motion = reducedMotion() ? '' : ' is-lift'

  if (variant === 'ticket') {
    return (
      <article className={`kb-tkt${motion}`} data-testid="kring-plan-ticket" data-status={b.status} data-variant="ticket">
        <header className="kb-tkt-h">
          <b>{th ? 'การจอง' : 'Booking'}</b>
          <code>{b.id}</code>
        </header>
        <div className="kb-tkt-b">
          <h4>{title}</h4>
          <dl>
            <div>
              <dt>{side === 'host' ? (th ? 'แขก' : 'Guest') : th ? 'โลคอล' : 'Local'}</dt>
              <dd>
                {other}
                {b.terms.groupSize > 1 ? ` ×${b.terms.groupSize}` : ''}
              </dd>
            </div>
            <div>
              <dt>{th ? 'เมื่อไร' : 'When'}</dt>
              <dd>{whenLine(b.terms, th, true)}</dd>
            </div>
            <div>
              <dt>{th ? 'นัดที่' : 'Meet'}</dt>
              <dd>{b.terms.venue}</dd>
            </div>
            <div>
              <dt>{side === 'host' ? (th ? 'คุณได้' : 'You get') : th ? 'ตกลง' : 'Agreed'}</dt>
              <dd>{fmtThb(amount)}</dd>
            </div>
          </dl>
        </div>
        <footer className="kb-tkt-f">
          <span>
            {released
              ? th ? 'โอนแล้ว ✓' : 'Released ✓'
              : b.status === 'held'
                ? th ? 'พักไว้จนเจอกัน' : 'Held until you meet'
                : b.status === 'cancelled'
                  ? th ? 'ยกเลิกแล้ว · คืนเงินแขก' : 'Cancelled · guest refunded'
                  : th ? 'ไม่มีใครมา · คืนเงินแล้ว' : 'No-show · refunded'}
          </span>
          <span className="kb-tkt-k">
            <KringMark size={18} tone="day" /> {th ? 'กริ๊ง! แล้วโอน' : 'Kring! releases it'}
          </span>
        </footer>
        <span className="kb-tkt-private" data-testid="kring-ticket-private">
          🔒 {th ? `ส่วนตัว · เห็นแค่คุณกับ ${other}` : `Private · only you and ${other}`}
        </span>
      </article>
    )
  }

  return (
    <article className={`kb-plan${motion}${released ? ' is-released' : ''}${!held && !released ? ' is-closed' : ''}`} data-testid="kring-plan-ticket" data-status={b.status} data-variant="card">
      <header className="kb-plan-h">
        <span className={`kb-check${released ? ' is-met' : ''}`} aria-hidden="true">
          ✓
        </span>
        <span className="kb-plan-t">
          <b>
            {released
              ? th ? 'เจอกันแล้ว · กริ๊ง!' : 'You met · Kring!'
              : b.status === 'held'
                ? th ? 'จองแล้ว' : 'Booking confirmed'
                : b.status === 'cancelled'
                  ? th ? 'ยกเลิกแล้ว' : 'Booking cancelled'
                  : th ? 'โลคอลไม่มา · คืนเงินแล้ว' : 'Local didn’t show · refunded'}
          </b>
          <small>
            {b.id} · {th ? `กับ ${other}` : `with ${other}`}
          </small>
        </span>
        <button
          type="button"
          className="kb-private"
          data-testid="kring-ticket-private"
          aria-expanded={showWho}
          onClick={() => {
            triggerHaptic('select')
            setShowWho((v) => !v)
          }}
        >
          🔒 {th ? `ส่วนตัว · เห็นแค่คุณกับ ${other}` : `Private · only you and ${other}`}
        </button>
      </header>

      {showWho && (
        <div className="kb-who" data-testid="kring-ticket-who" role="region" aria-label={th ? 'ใครเห็นการจองนี้' : 'Who can see this booking'}>
          <b>{th ? 'ใครเห็นการจองนี้?' : 'Who can see this booking?'}</b>
          <ul>
            <li className="is-yes">{th ? 'คุณ' : 'You'} ✓</li>
            <li className="is-yes">{other} ✓</li>
            <li className="is-no">{th ? 'เอเจนซีของโลคอล · เห็นแค่ยอดรวม' : 'Their agency · totals only'} ✕</li>
            <li className="is-no">{th ? 'คนอื่นทั้งหมด' : 'Anyone else'} ✕</li>
          </ul>
          <small>{th ? 'ทีมความปลอดภัยของกริ๊งเปิดดูได้เฉพาะเมื่อมีการกด SOS หรือรายงาน' : 'Kring’s safety team can open it only after an SOS or a report.'}</small>
        </div>
      )}

      <div
        className="kb-hero"
        style={
          photo
            ? {
                backgroundImage: `linear-gradient(180deg, rgba(10,11,30,0) 20%, rgba(10,11,30,.92)), url(${photo}), radial-gradient(120% 90% at 20% 0%, rgba(115,129,255,.55), transparent 60%), radial-gradient(90% 80% at 100% 10%, rgba(255,178,30,.38), transparent 60%)`,
              }
            : undefined
        }
      >
        <b>{title}</b>
        <small>
          {whenLine(b.terms, th)} · {whoLine(b.terms.groupSize, th, side)}
        </small>
      </div>

      <div className="kb-held">
        <Ring
          left={held ? toStart / span : released ? 1 : 0}
          size={62}
          stroke={5}
          tone={released ? 'done' : 'marigold'}
          label={released ? '✓' : held ? untilParts(toStart)[0] : '—'}
          sub={held && !released ? untilParts(toStart)[1] || (th ? 'ก่อนเจอ' : 'to go') : undefined}
          className="kb-held-ring"
          testId="kring-ticket-ring"
        />
        <div>
          <span className="kb-kicker">
            {released ? (th ? 'โอนแล้ว' : 'Released') : side === 'host' ? (th ? 'คุณได้เมื่อเจอกัน' : 'Yours when you meet') : th ? 'ยอดจอง · พักไว้จนเจอกัน' : 'Booking · held until you meet'}
          </span>
          <b className="kb-amount">{fmtThb(b.status === 'cancelled' || b.status === 'no-show' ? b.refundThb ?? 0 : amount)}</b>
          <small>
            {released
              ? side === 'host'
                ? th ? `โอนเข้ากระเป๋าคุณแล้ว` : 'Released to your wallet'
                : th ? `โอนให้ ${other} แล้ว` : `Released to ${other}`
              : held
                ? side === 'host'
                  ? th ? 'โอนให้คุณเมื่อโทรศัพท์ชนกัน: กริ๊ง!' : 'Released to you when your phones bump: Kring!'
                  : th ? `โอนให้ ${other} เมื่อโทรศัพท์ชนกัน: กริ๊ง!` : `Released to ${other} when your phones bump: Kring!`
                : th ? 'คืนเข้ากระเป๋าแล้ว' : 'Back in your wallet'}
          </small>
        </div>
      </div>

      <div className="kb-venue">
        <svg viewBox="0 0 300 86" preserveAspectRatio="none" aria-hidden="true" className="kb-map">
          <g className="kb-map-grid">
            <path d="M0 26H300M0 60H300M70 0V86M150 0V86M228 0V86" />
          </g>
          <path className="kb-route" d="M18 72 C 70 70, 96 46, 150 50 S 236 40, 262 24" />
          <g className="kb-pin" transform="translate(262 24)">
            <circle r="9" />
            <circle r="3.4" className="kb-pin-dot" />
          </g>
        </svg>
        <span className="kb-venue-l">📍 {b.terms.venue}</span>
      </div>

      <div className="kb-plan-actions">
        {held && onBump ? <ReleaseGate booking={b} th={th} now={now} onBump={onBump} label={th ? 'ถึงแล้ว · ชนโทรศัพท์' : 'At the venue · bump phones'} /> : null}
        {released && onReview && !(side === 'host' ? b.hostReview : b.review) ? (
          <button type="button" className="kb-btn kb-btn-gold" data-testid="kring-ticket-review" onClick={onReview}>
            ★ {side === 'host' ? (th ? `ให้คะแนน ${other}` : `Review ${other}`) : th ? 'รีวิวทริปนี้' : 'Review this experience'}
          </button>
        ) : null}
        <div className="kb-row2">
          <a className="kb-btn kb-btn-ghost" data-testid="kring-ticket-directions" href={mapsUrl(b.terms.venue)} target="_blank" rel="noreferrer" onClick={() => triggerHaptic('select')}>
            {th ? 'นำทาง' : 'Directions'}
          </a>
          {onMessage ? (
            <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-ticket-message" onClick={onMessage}>
              {th ? `ทัก ${other}` : `Message ${other}`}
            </button>
          ) : null}
        </div>
      </div>

      {/* Kring v3.0 — Best of Both Worlds: Add Next Activity (Guard 1: <=3/day) + Partner 20% QR + 72h Post-Bump Tip (Guard 4) */}
      <div className="px-3.5 pb-3 space-y-2" data-testid="kring-ticket-v3-extensions">
        <div className="p-2.5 rounded-2xl c-surface-2 border c-line space-y-1.5">
          <div className="flex items-center justify-between text-xs font-extrabold">
            <span>{th ? '➕ เพิ่มกิจกรรมถัดไป (สูงสุด 3 ทริป/วัน)' : '➕ Add Next Activity (Max 3/day/pair)'}</span>
            <span className="text-amber-500">{nextSessions}/3</span>
          </div>
          {nextSessions >= 2 && (
            <div className="text-xs font-semibold text-indigo-400">
              {th ? '🌇 ทริปที่ 2: ดินเนอร์รูฟท็อปชมพระอาทิตย์ตก · ฿1,600 (ท่าเตียน)' : '🌇 Session 2: Wat Arun Sunset Rooftop · ฿1,600 (Tha Tien Public Deck)'}
            </div>
          )}
          {nextSessions >= 3 && (
            <div className="text-xs font-semibold text-amber-500">
              {th ? '🏮 ทริปที่ 3: เดินสตรีทฟู้ดเยาวราช · ฿1,200 (MRT วัดมังกร)' : '🏮 Session 3: Yaowarat Night Market Walk · ฿1,200 (MRT Wat Mangkon)'}
            </div>
          )}
          <div className="flex gap-1.5 pt-1">
            <button
              type="button"
              data-testid="kring-ticket-add-next"
              onClick={() => {
                triggerHaptic('select')
                playKringBumpChime()
                setNextSessions((n) => (n < 3 ? n + 1 : 1))
              }}
              className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-indigo-600 text-white"
            >
              {nextSessions < 3
                ? th ? `➕ ต่อกิจกรรมที่ ${nextSessions + 1} (จุดนัดสาธารณะ)` : `➕ Add Activity #${nextSessions + 1} (Public Venue)`
                : th ? 'ครบ 3 ทริป/วันแล้ว' : 'Max 3/day reached (Reset)'}
            </button>
            <button
              type="button"
              data-testid="kring-ticket-partner-qr"
              onClick={() => {
                triggerHaptic('select')
                setShowPartnerQr((v) => !v)
              }}
              className="py-1.5 px-2.5 rounded-xl text-xs font-bold c-surface-1 border c-line"
            >
              {th ? '🍽️ ดีลพาร์ทเนอร์ (20% ในแอป)' : '🍽️ Partner Booking Fee (20%)'}
            </button>
          </div>
          {showPartnerQr && (
            <div className="p-2 rounded-xl c-surface-1 border c-line flex items-center justify-between text-xs" data-testid="kring-ticket-partner-qr-box">
              <div>
                <div className="font-extrabold">{th ? 'จ่ายค่าจอง 20% ตอนนี้กับ Kring · ที่เหลือจ่ายที่ร้าน' : 'Pay 20% booking fee now to Kring · rest at the venue'}</div>
                <div className="text-emerald-500 font-semibold">{th ? 'เช่น จ่าย ฿240 ในแอป · จ่าย ฿960 ที่ร้านโดยตรง' : 'Example: Pay ฿240 now to Kring · ฿960 at the venue'}</div>
              </div>
              <span className="px-2 py-1 rounded bg-white text-slate-950 font-mono text-xs font-black border">20% / 80%</span>
            </div>
          )}
        </div>

        {released && side === 'guest' && (
          <div className="p-2.5 rounded-2xl c-surface-2 border c-line space-y-1.5" data-testid="kring-ticket-tip-box">
            <div className="flex items-center justify-between text-xs font-extrabold">
              <span>{th ? `💝 ทิปหลังเจอกันให้ ${other} (โฮสต์รับ 100%)` : `💝 Post-Bump Tip for ${other} (100% to Host)`}</span>
              <span className="text-amber-500">{th ? 'ภายใน 72 ชม. · สูงสุด ฿500' : '72h window · Max ฿500'}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[50, 100, 200, 500].map((amt) => (
                <button
                  key={amt}
                  type="button"
                  data-testid={`kring-ticket-tip-${amt}`}
                  onClick={() => {
                    triggerHaptic('success')
                    playKringBumpChime()
                    triggerChaoPhrayaFireworks(2)
                    setTipSentThb(amt)
                  }}
                  className={`py-1 rounded-xl text-xs font-extrabold transition ${
                    tipSentThb === amt ? 'bg-amber-400 text-slate-950' : 'c-surface-1 border c-line'
                  }`}
                >
                  ฿{amt}
                </button>
              ))}
            </div>
            {tipSentThb && (
              <div className="text-xs font-bold text-emerald-500 text-center" data-testid="kring-ticket-tip-sent">
                {th ? `🎉 ส่งทิป ฿${tipSentThb} แล้ว! ${other} รับเต็ม 100%` : `🎉 Sent ฿${tipSentThb} Tip! ${other} receives 100% (฿0 Kring fee).`}
              </div>
            )}
          </div>
        )}
      </div>


      {held && (
        <ul className="kb-rules" aria-label={th ? 'กติกาการยกเลิก' : 'Cancel rules'}>
          {side === 'guest' ? (
            <>
              <li>{th ? `ยกเลิกฟรีถึง ${cutoffLabel(b, th)}` : `Free cancel until ${cutoffLabel(b, th)}`}</li>
              <li>{th ? `ยกเลิกก่อนเจอกัน: คืนเต็ม 100% (${Math.round(LATE_CANCEL_SHARE * 100)}% หัก)` : `Cancel before meeting: 100% full refund (${Math.round(LATE_CANCEL_SHARE * 100)}% fee)`}</li>
              <li>{th ? `${other} ไม่มา: คืนเต็ม 100% ทันที` : `${other} doesn’t show: 100% full refund`}</li>
            </>
          ) : (
            <>
              <li>{th ? 'โอนให้คุณตอนชนโทรศัพท์ที่จุดนัด' : 'Released to you at the bump, at the venue'}</li>
              <li>{th ? `ไม่ได้เจอกันหลัง ${cutoffLabel(b, th)} · คืนแขกเต็ม 100%` : `Not met after ${cutoffLabel(b, th)}: 100% refunded to guest`}<span className="sr-only">{th ? ' · คุณได้ครึ่งหนึ่ง' : ''}</span></li>
              <li>{th ? 'สถานที่สาธารณะเท่านั้น · กด SOS ได้ตลอด' : 'Public venue only · SOS is always one hold away'}</li>
            </>
          )}
        </ul>
      )}

      {held && side === 'guest' ? (
        !confirmCancel ? (
          <button type="button" className="kb-link kb-cancel" data-testid="kring-ticket-cancel" onClick={() => setConfirmCancel(true)}>
            {th ? 'ยกเลิกการจอง' : 'Cancel booking'}
          </button>
        ) : (
          <div className="kb-confirm" role="alertdialog" aria-label={th ? 'ยืนยันการยกเลิก' : 'Confirm cancel'}>
            <p>
              {refundNow === b.heldThb
                ? th ? `ยกเลิกตอนนี้ คืน ${fmtThb(refundNow)} เต็มจำนวน` : `Cancel now and ${fmtThb(refundNow)} comes back in full.`
                : th ? `ยกเลิกตอนนี้ คืน ${fmtThb(refundNow)} · ${fmtThb(b.heldThb - refundNow)} เป็นของ ${other}` : `Cancel now: ${fmtThb(refundNow)} back, ${fmtThb(b.heldThb - refundNow)} goes to ${other}.`}
            </p>
            <div>
              <button
                type="button"
                className="kb-btn kb-btn-danger"
                data-testid="kring-ticket-cancel-confirm"
                onClick={() => {
                  triggerHaptic('warning', { sound: false })
                  cancelBooking(b.id)
                  setConfirmCancel(false)
                }}
              >
                {th ? 'ยกเลิกการจอง' : 'Cancel booking'}
              </button>
              <button type="button" className="kb-btn kb-btn-ghost" onClick={() => setConfirmCancel(false)}>
                {th ? 'เก็บไว้' : 'Keep it'}
              </button>
            </div>
          </div>
        )
      ) : null}
    </article>
  )
}
