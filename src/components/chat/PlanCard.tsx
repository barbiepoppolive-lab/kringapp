import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import {
  PLAN_AGREED_EVENT,
  REPLY_WINDOW_MS,
  mmss,
  planEnd,
  planPhase,
  usePlanStore,
  type MeetPlan,
  type PlanSide,
} from '../../lib/planStore'
import '../../styles/chat-pulse.css'

/**
 * The receipt becomes the plan.
 *
 * <PlanCard>    venue photo strip · live ring · "฿300 held · comes back if you don't meet" · Directions + Cancel.
 *               Cab / table chips are passed in only after the other side said yes.
 *               ROUND5 · the ring is a real countdown (drains toward the start, then tracks the time left in the plan);
 *               confirming plays ONE ring pulse + a text crossfade.
 *
 * KRING FIX2: no paid hourly extensions. A time change goes through the offer card's "Suggest a change" (time),
 * agreed by both, before or during the booking. Presentation + planStore only.
 */

export function fmtClock(clock24: string, th: boolean): string {
  const [h, m] = clock24.split(':').map(Number)
  if (th) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} น.`
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h >= 12 ? 'PM' : 'AM'}`
}

/** ring-sized clock: '22:30' (TH) / '10:30' (EN, the start above already says PM) */
function shortClock(clock24: string, th: boolean): string {
  if (th) return clock24
  const [h, m] = clock24.split(':').map(Number)
  return m ? `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')}` : fmtClock(clock24, false)
}

function fmtThb(n: number): string {
  return `฿${Math.max(0, Math.round(n)).toLocaleString('en-US')}`
}

/** '42 min' · '1 h 05' (EN) / '42 นาที' · '1 ชม. 05' (TH) */
function fmtSpan(ms: number, th: boolean): string {
  const min = Math.max(0, Math.ceil(ms / 60_000))
  if (min < 60) return th ? `${min} นาที` : `${min} min`
  const h = Math.floor(min / 60)
  const mm = String(min % 60).padStart(2, '0')
  return th ? `${h} ชม. ${mm}` : `${h} h ${mm}`
}

function island(text: string, tone: 'gold' | 'green' | 'red' | 'neutral' = 'neutral', icon?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone, icon } }))
}

/** ticks only while `on` (an open ask, a live countdown) — nothing loops at rest */
function useNow(on: boolean, everyMs = 1000): number {
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => setTick((v) => v + 1), everyMs)
    return () => window.clearInterval(id)
  }, [on, everyMs])
  // read the clock at render: the first frame already shows the true time (no catch-up sprint)
  return Date.now()
}

/** Small clock glyph (no emoji in controls). */

/* ------------------------------------------------------------------ */
/* PlanCard                                                            */
/* ------------------------------------------------------------------ */
export type PlanCardStatus = 'waiting' | 'yes' | 'confirmed' | 'cancelled'

/** Mono strip label for the venues the demo talks about. */
const VENUE_FLOOR: Array<[RegExp, string]> = [
  [/octave/i, '45F'],
  [/tichuca/i, '46F'],
  [/sky ?bar|lebua/i, '63F'],
  [/above eleven/i, '33F'],
  [/pastel/i, '27F'],
  [/emquartier/i, 'PHROM PHONG'],
  [/wine republic/i, 'THONGLOR'],
  [/pattaya|beach club/i, 'PATTAYA'],
]

/** before the start the ring is a 12-hour face of the time still to go */
const PRE_START_WINDOW_MS = 12 * 3600_000

/** the ring once the plan is on: drains toward the start, then tracks the time left in the plan */
function liveRing(plan: MeetPlan, now: number, th: boolean): { pct: number; extPct: number; text: string; sub: string; label: string } {
  const { phase, startMs, endMs } = planPhase(plan, now)
  const endLabel = fmtClock(planEnd(plan), th)
  if (phase === 'before') {
    // a 12-hour face: the arc is the time still to go before the start, so it visibly shortens all evening
    const pct = Math.max(2, Math.min(100, ((startMs - now) / PRE_START_WINDOW_MS) * 100))
    const left = fmtSpan(startMs - now, th)
    return {
      pct,
      extPct: 0,
      text: shortClock(plan.start, th),
      sub: th ? `อีก ${left}` : `in ${left}`,
      label: th ? `เริ่ม ${fmtClock(plan.start, true)} อีก ${left} · ถึง ${endLabel}` : `Starts ${fmtClock(plan.start, false)} in ${left} · until ${endLabel}`,
    }
  }
  if (phase === 'during') {
    const pct = Math.max(2, Math.min(100, ((endMs - now) / Math.max(1, endMs - startMs)) * 100))
    const minLeft = Math.max(0, Math.ceil((endMs - now) / 60_000))
    const hm = `${Math.floor(minLeft / 60)}:${String(minLeft % 60).padStart(2, '0')}`
    return {
      pct,
      extPct: 0,
      text: hm,
      sub: `→ ${shortClock(planEnd(plan), th)}`,
      label: th ? `เหลือ ${hm} ชม. ถึง ${endLabel}` : `${hm} left · until ${endLabel}`,
    }
  }
  return { pct: 0, extPct: 0, text: shortClock(planEnd(plan), th), sub: th ? 'จบแล้ว' : 'ended', label: th ? `จบแล้ว ${endLabel}` : `Ended ${endLabel}` }
}

export function PlanCard({
  side,
  language,
  venue,
  startClock,
  otherName,
  amountThb,
  amountLine,
  status,
  replyMsLeft,
  planKey,
  onCancel,
  extra,
  chips,
  testId,
  example,
}: {
  /** R6 · Wei N2: a demo plan no Clink paid for — never call it "held" */
  example?: boolean
  side: PlanSide
  language: string
  venue: string
  /** 24 h start '20:00' */
  startClock: string | null
  otherName: string
  amountThb: number
  /** plain sentence under the amount ("Comes back if you don't meet") */
  amountLine: string
  status: PlanCardStatus
  /** reply countdown for `waiting` */
  replyMsLeft?: number
  /** shared plan clock key — the live ring once `confirmed` */
  planKey?: string
  onCancel?: () => void
  /** extra action in the button row while not confirmed (e.g. the host's Accept) */
  extra?: ReactNode
  /** cab / table chips — pass them only after the other side said yes */
  chips?: ReactNode
  testId?: string
}) {
  const th = language === 'th'
  const meet = usePlanStore().meet
  const plan = planKey ? meet[planKey] : undefined
  const [confirmCancel, setConfirmCancel] = useState(false)
  const floor = VENUE_FLOOR.find(([re]) => re.test(venue))?.[1]
  const strip = `${venue.toUpperCase()}${floor ? ` · ${floor}` : ''}`
  const live = Boolean(plan && (status === 'confirmed' || status === 'yes'))
  const now = useNow(live, 30_000)

  // ONE moment per change: confirm → ring pulse + crossfade; "she agreed" → gold pulse. Never on a plain mount/reload.
  const [fx, setFx] = useState<'' | 'confirm' | 'agreed'>('')
  const prevStatus = useRef(status)
  const prevExt = useRef(plan?.extendedMin ?? 0)
  useEffect(() => {
    let next: '' | 'confirm' | 'agreed' = ''
    if (status === 'confirmed' && prevStatus.current !== 'confirmed') next = 'confirm'
    else if ((plan?.extendedMin ?? 0) > prevExt.current) next = 'agreed'
    prevStatus.current = status
    prevExt.current = plan?.extendedMin ?? 0
    if (!next) return
    setFx(next)
    const id = window.setTimeout(() => setFx(''), 1100)
    return () => window.clearTimeout(id)
  }, [status, plan?.extendedMin])
  useEffect(() => {
    if (!planKey) return
    const on = (e: Event) => {
      const k = (e as CustomEvent<{ key?: string }>).detail?.key
      if (k !== planKey) return
      setFx('agreed')
      window.setTimeout(() => setFx(''), 1100)
    }
    window.addEventListener(PLAN_AGREED_EVENT, on)
    return () => window.removeEventListener(PLAN_AGREED_EVENT, on)
  }, [planKey])

  // ring: reply window while waiting; the plan's live countdown once it is on
  let ringPct = 100
  let ringExtPct = 0
  let ringText = startClock ? fmtClock(startClock, th).replace(/ น\.$/, '') : '—'
  let ringSub: string | null = null
  let ringLabel = ringText
  if (status === 'waiting' && typeof replyMsLeft === 'number') {
    ringPct = Math.max(0, Math.min(100, (replyMsLeft / REPLY_WINDOW_MS) * 100))
    ringText = mmss(replyMsLeft)
    ringLabel = th ? `เหลือ ${ringText} ให้ตอบ` : `${ringText} left to reply`
  } else if (plan && live) {
    const r = liveRing(plan, now, th)
    ringPct = r.pct
    ringExtPct = r.extPct
    ringText = r.text
    ringSub = r.sub
    ringLabel = r.label
  } else if (status === 'cancelled') {
    ringPct = 0
  }

  const directions = () => {
    triggerHaptic('tap')
    try {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${venue} Bangkok`)}`, '_blank', 'noopener,noreferrer')
    } catch {
      // blocked popups: the island still says where to go
    }
    island(th ? `เปิดแผนที่ไป ${venue}` : `Directions to ${venue}`, 'neutral', '📍')
  }

  return (
    <div
      className={`pc-card is-${status} is-${side}${fx ? ` fx-${fx}` : ''}`}
      data-testid={testId}
      data-fx={fx || undefined}
      role="group"
      aria-label={th ? `แผนกับ ${otherName}` : `Plan with ${otherName}`}
    >
      <div className="pc-strip" aria-hidden="true">
        <i className="pc-sky" />
        <span className="pc-strip-l">{strip}</span>
      </div>
      <div className="pc-main">
        <span
          className={`pc-ring${status === 'waiting' ? ' is-live' : ''}`}
          style={{ '--pc-a': `${ringPct}%`, '--pc-b': `${ringPct + ringExtPct}%` } as CSSProperties}
          role="img"
          aria-label={ringLabel}
          data-testid={testId ? `${testId}-ring` : undefined}
          data-pct={Math.round(ringPct)}
        >
          <i>
            <b>{ringText}</b>
            {ringSub ? <small>{ringSub}</small> : null}
          </i>
        </span>
        <span className="pc-amt" key={status === 'confirmed' ? 'on' : 'off'}>
          <b>
            {fmtThb(amountThb)} {status === 'cancelled' ? (th ? 'คืนแล้ว' : 'back') : side === 'guest' ? (example ? (th ? '· ตัวอย่าง' : '· example') : th ? 'กันไว้' : 'held') : th ? 'ของคุณ' : 'for you'}
          </b>
          <small>{amountLine}</small>
        </span>
      </div>
      {status !== 'cancelled' ? (
        <div className="pc-btns">
          <button type="button" className="pc-fbtn" data-testid={testId ? `${testId}-directions` : undefined} onClick={directions}>
            {th ? 'เส้นทาง' : 'Directions'}
          </button>
          {extra}
          {status !== 'confirmed' && onCancel ? (
            <button
              type="button"
              className="pc-fbtn"
              data-testid={testId ? `${testId}-cancel` : undefined}
              aria-expanded={confirmCancel}
              onClick={() => {
                triggerHaptic('tap')
                setConfirmCancel((v) => !v)
              }}
            >
              {th ? 'ยกเลิก' : 'Cancel'}
            </button>
          ) : null}
        </div>
      ) : null}
      {confirmCancel && status !== 'confirmed' && status !== 'cancelled' && onCancel ? (
        <div className="pc-confirm" role="alertdialog" aria-label={th ? 'ยืนยันยกเลิก' : 'Confirm cancel'}>
          <span>{th ? `ยกเลิกนัดกับ ${otherName}? ปล่อย ${fmtThb(amountThb)} คืน ไม่เสียเงินสักบาท` : `Cancel with ${otherName}? The ${fmtThb(amountThb)} is released — you pay nothing.`}</span>
          <div>
            <button
              type="button"
              className="cp-btn cp-btn-ghost"
              data-testid={testId ? `${testId}-cancel-yes` : undefined}
              onClick={() => {
                setConfirmCancel(false)
                onCancel()
              }}
            >
              {th ? 'ยกเลิกนัด' : 'Yes, cancel'}
            </button>
            <button type="button" className="cp-btn cp-btn-ghost" onClick={() => setConfirmCancel(false)}>
              {th ? 'ไม่ยกเลิก' : 'Keep it'}
            </button>
          </div>
        </div>
      ) : null}
      {chips ? (
        <div className="pc-chips pc-fold">
          <span className="pc-lbl">{th ? 'เพิ่มในแผน' : 'Add to the plan'}</span>
          <div>{chips}</div>
        </div>
      ) : null}
    </div>
  )
}
