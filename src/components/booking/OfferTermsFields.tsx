import { useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { addMinutes } from '../../lib/planStore'
import { bkkDay, dayLabel, whoLine } from './parts'
import './booking.css'

/**
 * Kring · the offer's date · start–end · group fields (round 1 A5 "the offer sheet": price stepper, date,
 * start–end time, group size). Single is the default; groups hide behind a quiet "+ friends" (round 2 item 2).
 * Lives inside the booking / offer sheet (meet/ClinkGiftSheet) under the venue line.
 * Testids: kring-offer-day-{i}, kring-offer-start-minus|plus, kring-offer-friends, kring-offer-group-minus|plus.
 */

export interface OfferTermsValue {
  date: string
  start: string
  end: string
  groupSize: number
}

export function defaultTerms(hours = 2, start = '18:00', date = bkkDay(1)): OfferTermsValue {
  return { date, start, end: addMinutes(start, Math.round(hours * 60)), groupSize: 1 }
}

export default function OfferTermsFields({ value, onChange, th, experience }: { value: OfferTermsValue; onChange: (v: OfferTermsValue) => void; th: boolean; experience?: string }) {
  const [friends, setFriends] = useState(value.groupSize > 1)
  const len = (() => {
    const [sh, sm] = value.start.split(':').map(Number)
    const [eh, em] = value.end.split(':').map(Number)
    return ((eh * 60 + em - (sh * 60 + sm)) % 1440 + 1440) % 1440 || 120
  })()
  const days = [0, 1, 2, 3, 4, 5, 6].map((i) => bkkDay(i))
  const set = (patch: Partial<OfferTermsValue>) => onChange({ ...value, ...patch })
  const shift = (d: number) => {
    triggerHaptic('select')
    const start = addMinutes(value.start, d)
    set({ start, end: addMinutes(start, len) })
  }
  const stretch = (d: number) => {
    triggerHaptic('select')
    const next = Math.max(60, Math.min(8 * 60, len + d))
    set({ end: addMinutes(value.start, next) })
  }
  return (
    <div className="kb-terms" data-testid="kring-offer-terms">
      {experience ? (
        <p className="kb-terms-exp">
          <span className="kb-kicker">{th ? 'ประสบการณ์' : 'Experience'}</span>
          <b>{experience}</b>
        </p>
      ) : null}
      <div className="kb-days" role="radiogroup" aria-label={th ? 'วัน' : 'Day'}>
        {days.map((d, i) => (
          <button
            key={d}
            type="button"
            role="radio"
            aria-checked={value.date === d}
            className={value.date === d ? 'is-on' : undefined}
            data-testid={`kring-offer-day-${i}`}
            onClick={() => {
              triggerHaptic('select')
              set({ date: d })
            }}
          >
            {i === 0 ? (th ? 'วันนี้' : 'Today') : i === 1 ? (th ? 'พรุ่งนี้' : 'Tomorrow') : dayLabel(d, th, true)}
          </button>
        ))}
      </div>
      <div className="kb-terms-row">
        <div className="kb-mini" aria-label={th ? 'เวลาเริ่ม' : 'Start'}>
          <button type="button" data-testid="kring-offer-start-minus" aria-label={th ? 'เร็วขึ้น 30 นาที' : '30 min earlier'} onClick={() => shift(-30)}>
            −
          </button>
          <b>
            {value.start}–{value.end}
          </b>
          <button type="button" data-testid="kring-offer-start-plus" aria-label={th ? 'ช้าลง 30 นาที' : '30 min later'} onClick={() => shift(30)}>
            +
          </button>
        </div>
        <div className="kb-mini is-len" aria-label={th ? 'ระยะเวลา' : 'Length'}>
          <button type="button" aria-label={th ? 'สั้นลง' : 'Shorter'} onClick={() => stretch(-30)}>
            −
          </button>
          <b>~{len % 60 ? (len / 60).toFixed(1) : len / 60}h</b>
          <button type="button" aria-label={th ? 'นานขึ้น' : 'Longer'} onClick={() => stretch(30)}>
            +
          </button>
        </div>
      </div>
      <div className="kb-terms-row">
        <span className="kb-who-now">{whoLine(value.groupSize, th)}</span>
        {!friends ? (
          <button
            type="button"
            className="kb-friends"
            data-testid="kring-offer-friends"
            onClick={() => {
              triggerHaptic('select')
              setFriends(true)
              set({ groupSize: 2 })
            }}
          >
            + {th ? 'เพื่อน' : 'friends'}
          </button>
        ) : (
          <div className="kb-mini is-group">
            <button type="button" data-testid="kring-offer-group-minus" aria-label={th ? 'ลดจำนวน' : 'Fewer people'} onClick={() => { triggerHaptic('select'); const n = value.groupSize - 1; if (n <= 1) setFriends(false); set({ groupSize: Math.max(1, n) }) }}>
              −
            </button>
            <b>{value.groupSize}</b>
            <button type="button" data-testid="kring-offer-group-plus" aria-label={th ? 'เพิ่มจำนวน' : 'More people'} onClick={() => { triggerHaptic('select'); set({ groupSize: Math.min(8, value.groupSize + 1) }) }}>
              +
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
