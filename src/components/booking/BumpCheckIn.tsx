import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent as ReactAnimationEvent,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal, flushSync } from 'react-dom'
import { KringMark } from '../ui/KringMark'
import { triggerHaptic } from '../../lib/haptics'
import { playKring, warmAudio } from '../../lib/sfx'
import {
  triggerApproachTick10m,
  triggerChaoPhrayaFireworks,
  triggerContactOneShot30ms,
} from '../../lib/kringCreativeEngine'
import { recordAttributedBump } from '../../lib/attribution'
import {
  canRelease,
  checkInBooking,
  checkInBookingAfterPaint,
  demoSkipToMeeting,
  getPlanStore,
  isDemoSession,
  usePlanStore,
  type Booking,
  type GeoPoint,
  type PlanSide,
} from '../../lib/planStore'
import { myShareLink, shownName } from '../../lib/identity'
import ShareChips from '../ui/ShareChips'
import { useBackEntry } from '../../lib/backStack'
import { dayLabel, fmtThb } from './parts'
import './booking.css'
import './bump-checkin.css'

/**
 * Kring · the กริ๊ง! bump at the venue — the signature moment (KRING FIX1, Marco 3 + 10).
 *
 * ONE stage: the seam where the two phones meet. Everything happens there.
 *  1. Hold — the two logo rings sit on the seam; while you press, they ORBIT and DRAW themselves (stroke = the hold
 *     progress) and slide into the logo overlap, while the phones (real perspective, each showing its OWNER's face
 *     and name) close the gap. Let go early and everything eases back.
 *  2. Contact — the frame the rings complete (rAF, not a timer): the seam flashes white-hot for 80 ms (never a
 *     full-phone flood), and on that same frame the violet lens is born in the overlap, three ripples and 18 sparks
 *     escape from the seam past the phones, the bell pops out of the seam above them, กริ๊ง! springs out of the seam
 *     below them, and the Ching + haptic fire (`playKring('release')`, sfx.ts). The hold is released here, once, through
 *     planStore `checkInBooking` (gated by `canRelease`: booking window + ~300 m when location is granted).
 *  3. The money moves — the booking amount leaves the guest's phone, arcs over the seam and drops into the local's
 *     phone, where HER goal ring fills (no % text). On that landing frame the SAME card rises on both phones:
 *     "You both went กริ๊ง!" · experience · day, one pill ("Paid to Kwan ฿1,200" / "Released to you ฿960") and the
 *     share card ("{me} × {other}" · experience · กริ๊ง!). KRING T3: never a percentage anywhere on this screen.
 * Not allowed yet (too early / too far / closed): the rings stay apart and grey and the stage says why —
 * "Opens at 13:30 at Siam Herbal Spa" — with the venue QR fallback explained, and (demo only) a labelled skip.
 * Reduced motion: no travel; the final frame (lens, ring filled, card) appears. The device's reduce-motion setting
 * also silences the vibration and the bell (haptics.ts / sfx.ts policy), so nothing moves or buzzes.
 * Glows (≤3): the seam flash, the lens, the goal ring.
 * Testids: kring-bump (data-phase), kring-bump-stage, kring-bump-word, kring-bump-released, kring-bump-qr,
 *          kring-bump-qr-open, kring-bump-qr-scan, kring-bump-done, kring-bump-close, kring-bump-locked,
 *          kring-bump-demo-skip, kring-bump-goal, kring-bump-share, kring-bump-share-card.
 * KRING FIX2: each phone shows its OWNER (left = guest, right = local) · the contact frame only paints + rings (the
 * release runs after paint) · phones ~half the width each, angled like an open book · the card and the share card
 * are born at the seam ~550 ms after contact.
 */

export interface BumpCheckInProps {
  booking: Booking
  side: PlanSide
  th: boolean
  /** after the release (bump or QR) — the chat fires its existing onPhoneClinkRelease here */
  onReleased?: (booking: Booking, method: 'bump' | 'qr') => void
  onClose: () => void
  /** after Done (the guest goes on to the review) */
  onDone?: (booking: Booking) => void
  /** optional faces (each phone shows its owner) — a monogram is drawn when missing or blocked */
  guestPhoto?: string
  localPhoto?: string
  /** V2.4 Act 1: approach distance in meters (bump unlocks within <=100m, soft haptic tick every 10m) */
  initialDistanceM?: number
  /** V2.4 Act 3: post-bump tip callback (฿50 · ฿100 · ฿200 · ฿500, 100% to Host) */
  onTip?: (thb: 50 | 100 | 200 | 500) => void
  /** V2.4 Act 3: Add Next Activity callback (requires its own bump) */
  onAddNextActivity?: () => void
}

type Phase = 'ready' | 'holding' | 'contact' | 'released' | 'qr' | 'scanning'

/** the hold: long enough to read as a ritual, short enough to never feel stuck */
const HOLD_MS = 900
/** a physical bump / keyboard / QR success closes the remaining gap this fast */
const SNAP_MS = 200
const SPARKS = Array.from({ length: 18 }, (_, i) => i)
const GOAL_KEY = 'chon_host_goal_v1'
const GOAL_DEFAULT = 2200

function clock(ts: number): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(11, 16)
}
function bkkDate(ts: number): string {
  return new Date(ts + 7 * 3600_000).toISOString().slice(0, 10)
}
function readGoal(): number {
  try {
    const n = Number(window.localStorage.getItem(GOAL_KEY))
    return Number.isFinite(n) && n >= 500 ? n : GOAL_DEFAULT
  } catch {
    return GOAL_DEFAULT
  }
}
function prefersReduced(): boolean {
  try {
    if (document.documentElement.dataset.reduceMotion === 'true') return true
    return !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}
/** no WAAPI / rAF-driven CSS here (jsdom, very old engines): skip straight to the final frame */
function canAnimate(): boolean {
  try {
    return typeof document !== 'undefined' && typeof document.body?.animate === 'function' && typeof requestAnimationFrame === 'function'
  } catch {
    return false
  }
}

/** a face, never a blank: photo when it loads, otherwise a per-person anchan/violet/marigold monogram */
function Face({ name, src }: { name: string; src?: string }) {
  const [ok, setOk] = useState(false)
  const hue = useMemo(() => [...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 3, 0), [name])
  return (
    <span className={`kc-face is-h${hue}`} aria-hidden="true">
      <b>{[...name.trim()][0]?.toUpperCase() ?? '•'}</b>
      {src ? <img src={src} alt="" onLoad={() => setOk(true)} onError={() => setOk(false)} style={{ opacity: ok ? 1 : 0 }} /> : null}
    </span>
  )
}

export default function BumpCheckIn({
  booking: initial,
  side,
  th,
  onReleased,
  onClose,
  onDone,
  guestPhoto,
  localPhoto,
  initialDistanceM,
  onTip,
  onAddNextActivity,
}: BumpCheckInProps) {
  useBackEntry(true, onClose)
  const store = usePlanStore()
  const booking = store.bookings[initial.id] ?? initial
  /** no rAF/WAAPI (jsdom): logic runs straight through */
  const instant = useMemo(() => !canAnimate(), [])
  /** reduced motion (or no animation engine): the hold still draws the rings, but contact lands on the final frame */
  const skipFx = useMemo(() => instant || prefersReduced(), [instant])
  const [phase, setPhase] = useState<Phase>(booking.status === 'released' ? 'released' : 'ready')
  const [method, setMethod] = useState<'bump' | 'qr'>(booking.method ?? 'bump')
  const [metAt, setMetAt] = useState<number | null>(booking.metAt ?? null)
  /** the coin has dropped into her phone (the ring fills) */
  const [landed, setLanded] = useState(booking.status === 'released')
  const [coords, setCoords] = useState<GeoPoint | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [nudge, setNudge] = useState(0)
  const [failText, setFailText] = useState<string | null>(null)
  const [shared, setShared] = useState(false)
  const [distanceM, setDistanceM] = useState<number>(() => initialDistanceM ?? 60)
  const [selectedTip, setSelectedTip] = useState<50 | 100 | 200 | 500 | null>(null)
  const [nextActivityAdded, setNextActivityAdded] = useState<boolean>(false)

  const rootRef = useRef<HTMLDivElement>(null)
  const sceneRef = useRef<HTMLDivElement>(null)
  const chipRef = useRef<HTMLSpanElement>(null)
  const goalRef = useRef<HTMLSpanElement>(null)
  const progress = useRef(0)
  /** the bump happened on this screen (animate) — vs. opening an already-released booking (final frame, still) */
  const playedHere = useRef(false)
  const raf = useRef(0)
  const timers = useRef<number[]>([])
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const lang = th ? 'th' : 'en'
  const local = shownName(booking.localName, { self: side === 'host', th, role: 'local' })
  const guest = shownName(booking.guestName, { self: side === 'guest', th, role: 'guest' })
  const amount = booking.heldThb
  const share = booking.localReceiveThb
  const check = canRelease(booking.id, now, coords)
  const distanceLocked = distanceM > 100
  const locked = (!check.ok || distanceLocked) && booking.status === 'held'

  const stepApproachBy10m = () => {
    setDistanceM((prev) => {
      const next = Math.max(0, prev - 10)
      if (Math.floor(next / 10) !== Math.floor(prev / 10)) {
        triggerApproachTick10m()
      }
      return next
    })
  }

  // her goal ring: the released earnings of the BOOKING'S OWN DAY for this local (KRING FIX3 r4 · Ploy: a demo-skipped
  // Sunday trip counts on Sunday, never on today's goal — the same rule as Local home)
  const tripDay = booking.terms.date
  const isToday = tripDay === bkkDate(Date.now())
  const goal = useMemo(() => {
    const target = readGoal()
    const earned = Object.values(store.bookings)
      .filter((b) => b.localId === booking.localId && b.id !== booking.id && b.status === 'released' && (b.terms?.date ?? (b.releasedAt ? bkkDate(b.releasedAt) : '')) === tripDay)
      .reduce((a, b) => a + b.localReceiveThb, 0)
    return { target, from: Math.min(1, earned / target), to: Math.min(1, (earned + share) / target) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking.id, booking.localId, share, tripDay])

  /* ------------------------------------------------------------------ housekeeping */
  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current)
      timers.current.forEach((t) => window.clearTimeout(t))
    },
    [],
  )
  // the window opens on its own: re-check every 15 s while the screen is up
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15_000)
    return () => window.clearInterval(id)
  }, [])
  // place check — only when location permission is ALREADY granted (we never prompt from here)
  useEffect(() => {
    let off = false
    try {
      const perms = (navigator as Navigator & { permissions?: Permissions }).permissions
      void perms
        ?.query({ name: 'geolocation' as PermissionName })
        .then((st) => {
          if (off || st.state !== 'granted') return
          navigator.geolocation?.getCurrentPosition(
            (pos) => !off && setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
            () => undefined,
            { enableHighAccuracy: true, timeout: 6000, maximumAge: 60_000 },
          )
        })
        .catch(() => undefined)
    } catch {
      // no permissions API: the time window still applies
    }
    return () => {
      off = true
    }
  }, [])
  // Escape closes (not mid-bump)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phaseRef.current !== 'contact') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  /* ------------------------------------------------------------------ progress (CSS vars on the scene only) */
  const paint = (p: number) => {
    progress.current = p
    const el = sceneRef.current
    if (!el) return
    // --p: linear (the rings draw) · --pe: ease-in (the phones are pulled together, the touch is the impact)
    el.style.setProperty('--p', p.toFixed(4))
    el.style.setProperty('--pe', (p * p * (1.6 - 0.6 * p)).toFixed(4))
  }

  /** never fail silently: say why and go back to the stage */
  const fail = useCallback(
    (at: number) => {
      const why = canRelease(booking.id, at, coords)
      triggerHaptic('warning', { burst: false, sound: false })
      rootRef.current?.removeAttribute('data-hit')
      playedHere.current = false
      setFailText(why.text[lang] || (th ? 'ยังโอนไม่ได้ ลองใหม่อีกครั้ง หรือสแกน QR ร้าน' : 'Couldn’t release yet · try again or scan the venue QR'))
      setLanded(false)
      paint(0)
      setPhase('ready')
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booking.id, coords, lang, th],
  )

  /**
   * THE contact frame (KRING FIX2 · Marco 1: it must cost < 16 ms). Only what you SEE and FEEL commits here — the
   * seam flash, lens, sparks, bell + haptic (audio was warmed on pointerdown). The release itself (store write,
   * the local's demo credit, the chat's onPhoneClinkRelease) runs after this frame has painted, through planStore
   * `checkInBookingAfterPaint` — same gate, same `now`, same result.
   */
  const contact = useCallback(
    (how: 'bump' | 'qr') => {
      cancelAnimationFrame(raf.current)
      const at = Date.now()
      const latest = getPlanStore().bookings[booking.id] ?? booking
      let next: Booking | null = null
      if (latest.status === 'held') {
        if (instant) next = checkInBooking(booking.id, how, at, coords)
        else
          next = checkInBookingAfterPaint(booking.id, how, at, coords, (done) => {
            if (!done) {
              fail(Date.now())
              return
            }
            setMetAt(done.metAt ?? at)
            onReleased?.(done, how)
          })
      }
      if (!next) {
        fail(at)
        return
      }
      // coin flight: from the ฿ chip on the guest's phone to the goal ring on the local's phone (seam-relative)
      const scene = sceneRef.current
      const chip = chipRef.current?.getBoundingClientRect()
      const ring = goalRef.current?.getBoundingClientRect()
      const box = scene?.getBoundingClientRect()
      if (scene && box) {
        const cx = box.left + box.width / 2
        const cy = box.top + box.height / 2
        if (chip) {
          scene.style.setProperty('--cx', `${Math.round(chip.left + chip.width / 2 - cx)}px`)
          scene.style.setProperty('--cy', `${Math.round(chip.top + chip.height / 2 - cy)}px`)
        }
        if (ring) {
          scene.style.setProperty('--tx', `${Math.round(ring.left + ring.width / 2 - cx)}px`)
          scene.style.setProperty('--ty', `${Math.round(ring.top + ring.height / 2 - cy)}px`)
        }
      }
      paint(1)
      playedHere.current = true
      rootRef.current?.setAttribute('data-hit', 'true')
      flushSync(() => {
        setFailText(null)
        setMethod(how)
        setMetAt(next.metAt ?? Date.now())
        setPhase(skipFx ? 'released' : 'contact')
        if (skipFx) setLanded(true)
      })
      // KRING T2 · the Ching (Release cut) + V2.4 Act 2 30ms one-shot haptic on this same frame (0ms)
      playKring('release')
      triggerContactOneShot30ms()
      recordAttributedBump()
      if (instant) onReleased?.(next, how)
      // safety net only (a backgrounded tab never fires animationend): the sequence itself is event-driven
      if (!skipFx) {
        const settle = () => {
          // still flying (e.g. a slow device or a paused timeline)? check again rather than cut the moment short
          const flying = typeof document.getAnimations === 'function' && document.getAnimations().some((x) => (x as CSSAnimation).animationName === 'kcCoinFly' && x.playState !== 'finished')
          if (flying) {
            timers.current.push(window.setTimeout(settle, 400))
            return
          }
          setLanded(true)
          setPhase((p) => (p === 'contact' ? 'released' : p))
        }
        timers.current.push(window.setTimeout(settle, 1400))
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [booking.id, coords, skipFx, instant, fail, onReleased],
  )

  /** run the progress to `to` (1 = contact) — hold (HOLD_MS for the full way) or snap (physical bump / QR / key) */
  const run = (to: 0 | 1, fullMs: number, how: 'bump' | 'qr' = 'bump') => {
    cancelAnimationFrame(raf.current)
    if (instant) {
      if (to === 1) contact(how)
      else paint(0)
      return
    }
    let last = performance.now()
    const step = (t: number) => {
      const dt = Math.max(0, t - last)
      last = t
      const dir = to === 1 ? 1 : -1
      const before = progress.current
      const p = Math.max(0, Math.min(1, progress.current + (dir * dt) / fullMs))
      paint(p)
      // V2.4 Act 1 (approach): soft haptic tick every 10m (10% of 100m approach) via navigator.vibrate(8)
      if (to === 1 && Math.floor(p * 10) > Math.floor(before * 10)) {
        triggerApproachTick10m()
      }
      // KRING FIX3 · Marco: a two-part haptic that maps to the picture — a light tick as the rings close, the strike on the seam
      if (to === 1 && before < 0.82 && p >= 0.82) triggerHaptic('light', { burst: false, sound: false })
      if (to === 1 && p >= 1) {
        contact(how)
        return
      }
      if (to === 0 && p <= 0) return
      raf.current = requestAnimationFrame(step)
    }
    raf.current = requestAnimationFrame(step)
  }

  const refuse = () => {
    triggerHaptic('warning', { burst: false, sound: false })
    setNudge((n) => n + 1)
  }

  // press-and-hold = the phones held together
  const onDown = (e: ReactPointerEvent) => {
    if (phaseRef.current !== 'ready') return
    if (locked) {
      refuse()
      return
    }
    try {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    } catch {
      // ignore
    }
    // KRING FIX2 · Marco 1: build/resume the AudioContext NOW (the press), so the contact frame only schedules the bell
    warmAudio()
    setFailText(null)
    setPhase('holding')
    // iOS asks for motion permission on a gesture — ask once, quietly
    try {
      const DM = (window as unknown as { DeviceMotionEvent?: { requestPermission?: () => Promise<string> } }).DeviceMotionEvent
      void DM?.requestPermission?.().catch(() => undefined)
    } catch {
      // no motion sensor: the hold still works
    }
    run(1, HOLD_MS)
  }
  const onUp = () => {
    if (phaseRef.current !== 'holding') return
    setPhase('ready')
    run(0, 320)
  }
  const snap = (how: 'bump' | 'qr' = 'bump') => {
    if (phaseRef.current !== 'ready' && phaseRef.current !== 'holding' && phaseRef.current !== 'qr' && phaseRef.current !== 'scanning') return
    if (locked) {
      refuse()
      return
    }
    warmAudio()
    setPhase('holding')
    run(1, SNAP_MS / Math.max(0.05, 1 - progress.current), how)
  }

  // a real bump: a sharp motion spike while the screen is open
  useEffect(() => {
    if (phase !== 'ready' && phase !== 'holding') return
    const onMotion = (e: DeviceMotionEvent) => {
      const a = e.acceleration ?? e.accelerationIncludingGravity
      if (!a) return
      const g = e.acceleration ? 0 : 9.8
      const mag = Math.sqrt((a.x ?? 0) ** 2 + (a.y ?? 0) ** 2 + (a.z ?? 0) ** 2) - g
      if (mag > 18) snap('bump')
    }
    window.addEventListener('devicemotion', onMotion)
    return () => window.removeEventListener('devicemotion', onMotion)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, locked])

  const scanQr = () => {
    if (locked) {
      refuse()
      return
    }
    warmAudio()
    setPhase('scanning')
    // the camera "reads" the venue code, then the stage comes back and the phones meet at the seam
    timers.current.push(
      window.setTimeout(() => {
        flushSync(() => setPhase('holding'))
        paint(instant ? 1 : 0.55)
        run(1, SNAP_MS * 2.2, 'qr')
      }, instant ? 0 : 1400),
    )
  }

  /* ------------------------------------------------------------------ event-driven sequence after contact */
  const onSceneAnimEnd = (e: ReactAnimationEvent) => {
    const name = e.animationName
    if (name === 'kcCoinFly') {
      // KRING FIX2 · Marco 2: the coin lands ~550 ms after contact — her ring starts filling AND the card rises out of
      // the seam on this same frame (the eye never leaves the seam; no wait for the ring to finish)
      setLanded(true)
      triggerHaptic('light', { burst: false, sound: false })
      setPhase((p) => (p === 'contact' ? 'released' : p))
    }
  }
  // reduced/instant: landed comes with released
  useEffect(() => {
    if (landed && skipFx) setPhase((p) => (p === 'contact' ? 'released' : p))
  }, [landed, skipFx])

  const released = phase === 'released'
  const hit = phase === 'contact' || released
  const ringPct = landed ? goal.to : goal.from
  // the check-in stamp reads the booking's own day/time when it was met on another day (demo skip): never "today 22:32"
  const metReal = metAt ?? Date.now()
  const metClock = bkkDate(metReal) === tripDay ? clock(metReal) : `${dayLabel(tripDay, th, true)} ${booking.terms.start}`
  const dayGoalL = isToday ? (th ? 'เป้าวันนี้' : 'Today’s goal') : th ? `เป้า ${dayLabel(tripDay, th, true)}` : `${dayLabel(tripDay, th, true)} goal`
  const exp = booking.experienceTitle?.trim()
  const when = `${dayLabel(booking.terms.date, th, true)} ${booking.terms.start}`
  const youA = side === 'guest'
  const shareLink = myShareLink()
  const shareText = `${th ? 'เราไปกริ๊งกันมา!' : 'We went Kring!'} · ${exp || (th ? 'ทริปกับโลคอล' : 'A trip with a local')}`
  /** KRING FIX3 · founder: Share opens the chips (native · LINE · WeChat · 小红书 · Copy link) right on the card */
  const onShare = () => setShared((v) => !v)
  const phoneLabel = (isYou: boolean, name: string) => (isYou ? (th ? 'โทรศัพท์คุณ' : 'Your phone') : th ? `โทรศัพท์ ${name}` : `${name}’s phone`)

  const hint = failText ? (
    <b className="kc-warn">{failText}</b>
  ) : locked ? null : phase === 'holding' ? (
    th ? 'กดค้างไว้… ห่วงกำลังมาบรรจบ' : 'Keep holding… the rings are closing'
  ) : phase === 'ready' ? (
    th ? `เจอ ${youA ? local : guest} แล้ว? เอาโทรศัพท์ชนกัน แล้วกดค้างที่รอยต่อ` : `With ${youA ? local : guest}? Touch phones, then press and hold the seam`
  ) : null

  const currentAct = released ? 'release' : phase === 'contact' ? 'contact' : 'approach'

  const body = (
    <div
      ref={rootRef}
      className={`kc-bump is-${phase}${shared ? ' is-sharing' : ''}${skipFx ? ' is-instant' : ''}${locked ? ' is-locked' : ''}${landed ? ' is-landed' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={th ? 'เช็คอินด้วยการชนโทรศัพท์' : 'Check in with the bump'}
      data-testid="kring-bump"
      data-phase={phase}
      data-act={currentAct}
      data-distance-m={distanceM}
      data-hit={hit ? (playedHere.current ? 'true' : 'static') : undefined}
    >
      <div className="kc-bg" aria-hidden="true" />
      <header className="kc-h">
        <span className="kc-title">
          <KringMark size={26} /> {th ? 'เช็คอิน' : 'Check in'}
        </span>
        <span className="kc-venue">📍 {booking.terms.venue || check.venue}</span>
        <button
          type="button"
          className="kc-approach-pill"
          data-testid="kring-bump-approach-step"
          onClick={(e) => {
            e.stopPropagation()
            stepApproachBy10m()
          }}
        >
          {distanceM <= 100
            ? th
              ? `ระยะ ${distanceM} ม. · พร้อมกริ๊ง`
              : `${distanceM}m · Ready`
            : th
              ? `ระยะ ${distanceM} ม. · เดินเข้าใกล้ 10 ม.`
              : `${distanceM}m · Step 10m closer`}
        </button>
        <button type="button" className="kc-x" aria-label={th ? 'ปิด' : 'Close'} data-testid="kring-bump-close" onClick={onClose}>
          ✕
        </button>
      </header>
      <p className="kc-exp">
        {exp ? <b>{exp}</b> : null}
        {exp ? ' · ' : ''}
        {when} · {th ? `${guest} กับ ${local}` : `${guest} with ${local}`}
      </p>

      {phase === 'qr' || phase === 'scanning' ? (
        <section className="kb-qr kc-qr" data-testid="kring-bump-qr">
          <div className={`kb-qr-frame${phase === 'scanning' ? ' is-scan' : ''}`} aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <span className="kb-qr-line" />
            <KringMark size={64} lens />
          </div>
          <b>{th ? 'สแกน QR กริ๊งที่เคาน์เตอร์' : 'Scan the Kring QR at the counter'}</b>
          <p>{locked ? check.text[lang] : th ? 'ทุกจุดนัดในกริ๊งมี QR ประจำร้าน สแกนแล้วยอดจองโอนให้โลคอลเหมือนการชนโทรศัพท์' : 'Every Kring meeting point has its own QR. Scanning it releases the booking exactly like the bump.'}</p>
          <button type="button" className="kb-btn kb-btn-gold kb-btn-block" data-testid="kring-bump-qr-scan" disabled={phase === 'scanning' || locked} onClick={scanQr}>
            {phase === 'scanning' ? (th ? 'กำลังสแกน…' : 'Scanning…') : th ? 'สแกน' : 'Scan'}
          </button>
          <button type="button" className="kb-link" onClick={() => setPhase('ready')}>
            {th ? 'กลับไปชนโทรศัพท์' : 'Back to the bump'}
          </button>
        </section>
      ) : (
        <>
          <div
            className="kc-stage"
            data-testid="kring-bump-stage"
            role="button"
            tabIndex={0}
            aria-disabled={locked || undefined}
            aria-label={locked ? check.text[lang] : th ? 'กดค้างที่รอยต่อเพื่อกริ๊ง' : 'Press and hold the seam to bump'}
            onPointerDown={onDown}
            onPointerUp={onUp}
            onPointerCancel={onUp}
            onLostPointerCapture={onUp}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                snap('bump')
              }
            }}
          >
            <div ref={sceneRef} className="kc-scene" key={`n${nudge}`} data-nudge={nudge ? 'true' : undefined} onAnimationEnd={onSceneAnimEnd} style={{ ['--p' as string]: hit ? 1 : 0, ['--pe' as string]: hit ? 1 : 0 } as CSSProperties}>
              <span className="kc-floor" aria-hidden="true" />
              {/* KRING FIX2 · Ploy 29/33, Wei 9: each phone is its OWNER's — label, face and name match.
                  Left = the guest's phone (the held ฿ sits on it) · right = the local's phone (HER goal ring, where it lands). */}
              <div className="kc-phone is-a" aria-hidden="true" data-owner="guest" data-you={youA ? 'true' : undefined}>
                <span className="kc-glass" />
                <span className="kc-notch" />
                <small className="kc-plabel">{phoneLabel(youA, guest)}</small>
                <Face name={guest} src={guestPhoto} />
                <b className="kc-pname">{guest}</b>
                <small className="kc-prole">{youA ? (th ? 'คุณ · ผู้จอง' : 'You · guest') : th ? 'แขกของคุณ' : 'Your guest'}</small>
                <span ref={chipRef} className="kc-chip">
                  {hit ? `✓ ${fmtThb(amount)}` : th ? `พักไว้ ${fmtThb(amount)}` : `${fmtThb(amount)} held`}
                </span>
              </div>
              <div className="kc-phone is-b" aria-hidden="true" data-owner="local" data-you={!youA ? 'true' : undefined}>
                <span className="kc-glass" />
                <span className="kc-notch" />
                <small className="kc-plabel">{phoneLabel(!youA, local)}</small>
                <Face name={local} src={localPhoto} />
                <b className="kc-pname">{local}</b>
                <small className="kc-prole">{!youA ? (th ? 'คุณ · โลคอล' : 'You · local') : th ? 'โลคอลของคุณ' : 'Your local'}</small>
                <span ref={goalRef} className="kc-goal" data-testid="kring-bump-goal" data-pct={Math.round(ringPct * 100)}>
                  <svg viewBox="0 0 48 48" aria-hidden="true">
                    <circle className="kc-goal-track" cx="24" cy="24" r="19" pathLength={100} />
                    <circle className="kc-goal-arc" cx="24" cy="24" r="19" pathLength={100} style={{ strokeDashoffset: 100 - ringPct * 100 }} />
                  </svg>
                </span>
                <small className="kc-goal-l">{dayGoalL}</small>
                <span className="kc-plus">+{fmtThb(amount)}</span>
              </div>

              {/* the seam: the two logo rings ARE the hold progress; the lens is born here at contact */}
              <svg className="kc-rings" viewBox="0 0 96 56" aria-hidden="true">
                <g className="kc-ring is-a">
                  <circle className="kc-ring-track" cx="32" cy="28" r="20" pathLength={100} />
                  <circle className="kc-ring-arc" cx="32" cy="28" r="20" pathLength={100} />
                </g>
                <g className="kc-ring is-b">
                  <circle className="kc-ring-track" cx="64" cy="28" r="20" pathLength={100} />
                  <circle className="kc-ring-arc" cx="64" cy="28" r="20" pathLength={100} />
                </g>
                <path className="kc-lens" d="M48 16A20 20 0 0 1 48 40A20 20 0 0 1 48 16Z" />
              </svg>
              <i className="kc-seam" aria-hidden="true" />
              {/* V2.4 Act 2 (contact 0ms): violet #9B5CFF overlap flash (0-120ms) & shockwave ring (120-600ms) */}
              <span
                className="kc-violet-flash"
                data-testid="kring-bump-violet-flash"
                data-color="#9B5CFF"
                data-window-ms="0-120"
                aria-hidden="true"
              />
              <span
                className="kc-shockwave-ring"
                data-testid="kring-bump-shockwave"
                data-window-ms="120-600"
                aria-hidden="true"
              />
              <span className="kc-ripples" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="kc-sparks" aria-hidden="true">
                {SPARKS.map((i) => (
                  <i key={i} style={{ ['--a' as string]: `${(360 / SPARKS.length) * i + (i % 2 ? 7 : -4)}deg`, ['--d' as string]: `${118 + (i % 5) * 22}px`, ['--s' as string]: i % 3 } as CSSProperties} />
                ))}
              </span>
              <span className="kc-bell" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="24" height="24">
                  <path d="M12 3a6 6 0 0 0-6 6v4l-1.6 2.6c-.3.5 0 1.4.8 1.4h13.6c.8 0 1.1-.9.8-1.4L18 13V9a6 6 0 0 0-6-6Z" fill="currentColor" />
                  <circle cx="12" cy="19.6" r="1.9" fill="currentColor" />
                </svg>
              </span>
              <b className="kc-word" data-testid="kring-bump-word" aria-live="polite" lang="th">
                {hit ? 'กริ๊ง!' : ''}
              </b>
              {/* V2.4 Act 3 (release 600-1400ms): animated gold coin arcs into the host ring */}
              <span className="kc-coin" data-testid="kring-bump-gold-coin" data-window-ms="600-1400" aria-hidden="true">
                <span>+{fmtThb(amount)}</span>
              </span>

              {/* KRING FIX2 · Marco 2: the ending is born AT the seam (~550 ms after contact, when the coin lands) and
                  stays there: what moved, then the share card. */}
              <div className={`kc-card${released ? ' is-in' : ''}`} data-testid={released ? 'kring-bump-released' : undefined} aria-hidden={!released} role="status">
                <span className="kc-card-k">
                  ✓ {th ? `เช็คอินแล้ว ${metClock}` : `Checked in ${metClock}`}
                  {method === 'qr' ? (th ? ' · ผ่าน QR ร้าน' : ' · via venue QR') : ''} · {booking.id}
                </span>
                {/* KRING T3 · the same card on both phones: one title, one sub line; only the money pill differs (the
                    guest sees what she paid, the local sees her own amount — never a percentage) */}
                <b className="kc-card-t" lang={th ? 'th' : undefined}>{th ? 'คุณทั้งคู่ กริ๊ง! แล้ว' : 'You both went กริ๊ง!'}</b>
                <small className="kc-card-s">
                  {exp || (th ? 'ทริปกับโลคอล' : 'A trip with a local')} · {dayLabel(tripDay, th, true)}
                </small>
                <span className="kc-card-pill" data-testid="kring-bump-money">
                  {side === 'host'
                    ? th
                      ? `เข้ากระเป๋าคุณแล้ว ${fmtThb(share)}`
                      : `Released to you ${fmtThb(share)}`
                    : th
                      ? `จ่ายให้ ${local} แล้ว ${fmtThb(amount)}`
                      : `Paid to ${local} ${fmtThb(amount)}`}
                </span>
                <small className="kc-act3-release-line kring-living-thai-type" data-testid="kring-bump-act3-release-line">
                  {th ? `ส่งเงินถึง ${local} แล้ว ${fmtThb(share)}` : `Released to ${local} ${fmtThb(share)}`}
                </small>

                {/* V2.4 Act 3: Post-bump Tip chips (฿50 · ฿100 · ฿200 · ฿500, 100% to Host) & ➕ Add Next Activity */}
                <div className="kc-post-bump-actions" data-testid="kring-bump-post-actions" data-host-share-pct="100">
                  <div className="kc-tip-chips" role="group" aria-label={th ? 'ทิปให้โฮสต์' : 'Tip host'}>
                    {([50, 100, 200, 500] as const).map((tipVal) => (
                      <button
                        key={tipVal}
                        type="button"
                        className={`kc-tip-chip${selectedTip === tipVal ? ' is-on' : ''}`}
                        data-testid={`kring-bump-tip-${tipVal}`}
                        data-host-share-pct="100"
                        aria-pressed={selectedTip === tipVal}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setSelectedTip(tipVal)
                          triggerChaoPhrayaFireworks(1)
                          onTip?.(tipVal)
                        }}
                      >
                        ฿{tipVal}
                      </button>
                    ))}
                  </div>
                  {selectedTip && (
                    <small className="kc-tip-sent" data-testid="kring-bump-tip-sent">
                      {th ? `ส่งทิป ฿${selectedTip} ให้ ${local} เต็มจำนวนแล้ว` : `Sent ฿${selectedTip} tip directly to ${local}`}
                    </small>
                  )}
                  <button
                    type="button"
                    className="kc-add-next-btn"
                    data-testid="kring-bump-add-next"
                    data-requires-own-bump="true"
                    onClick={(ev) => {
                      ev.stopPropagation()
                      setNextActivityAdded(true)
                      onAddNextActivity?.()
                    }}
                  >
                    {nextActivityAdded
                      ? th
                        ? '✓ เพิ่มกิจกรรมถัดไปแล้ว (ต้องกริ๊งที่จุดนัดถัดไป)'
                        : '✓ Next activity queued (requires its own bump)'
                      : th
                        ? '➕ เพิ่มกิจกรรมถัดไป (ต้องกริ๊งใหม่)'
                        : '➕ Add Next Activity'}
                  </button>
                </div>

                <span className="kc-share" data-testid="kring-bump-share-card">
                  <KringMark size={22} lens />
                  <span className="kc-share-t">
                    <b>{`${side === 'host' ? local : guest} × ${side === 'host' ? guest : local}`}</b>
                    <small>
                      {exp || (th ? 'ทริปกับโลคอล' : 'A trip with a local')} · <span lang="th">กริ๊ง!</span> · {shareLink}
                    </small>
                  </span>
                </span>
                {shared ? <ShareChips text={shareText} url={shareLink} title="Kring" lang={lang} testIdPrefix="kring-bump-share" className="kc-share-chips" /> : null}
              </div>
            </div>

            {locked ? (
              <div className="kc-locked" data-testid="kring-bump-locked" role="status">
                <b>{check.text[lang]}</b>
                <small>
                  {check.reason === 'too-far'
                    ? th
                      ? 'กริ๊งได้เมื่อทั้งคู่อยู่ที่จุดนัด (ประมาณ 300 ม.)'
                      : 'The bump works when you’re both at the meeting point (about 300 m).'
                    : check.reason === 'too-late'
                      ? th
                        ? 'เงินยังพักไว้อย่างปลอดภัย'
                        : 'The money is still held safely.'
                      : th
                        ? 'กริ๊งได้ตั้งแต่ 30 นาทีก่อนเริ่ม ที่จุดนัด · เงินยังพักไว้จนกว่าจะเจอกัน'
                        : 'The bump opens 30 min before the start, at the meeting point · the money stays held until you meet.'}
                </small>
                {isDemoSession() && check.reason !== 'not-found' ? (
                  <button
                    type="button"
                    className="kb-link kc-demo"
                    data-testid="kring-bump-demo-skip"
                    onClick={(e) => {
                      e.stopPropagation()
                      demoSkipToMeeting(booking.id)
                      setNow(Date.now())
                    }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    {th ? 'เดโม · ข้ามไปเวลานัด' : 'Demo · skip to the meeting time'}
                  </button>
                ) : null}
              </div>
            ) : (
              <p className="kc-hint" aria-live="polite">
                {hint}
              </p>
            )}
          </div>

          <footer className="kc-f">
            {released ? (
              <div className="kc-f-row">
                <button type="button" className="kb-btn kb-btn-ghost" data-testid="kring-bump-share" onClick={onShare}>
                  {shared ? (th ? 'ปิดแชร์' : 'Hide share') : th ? 'แชร์' : 'Share'}
                </button>
                <button
                  type="button"
                  className="kb-btn kb-btn-gold"
                  data-testid="kring-bump-done"
                  onClick={() => {
                    onDone?.(getPlanStore().bookings[booking.id] ?? booking)
                    onClose()
                  }}
                >
                  {/* KRING T3 · mutual reviews: both sides go on to rate each other (W3's chat opens the ReviewSheet) */}
                  {th ? `เสร็จแล้ว · ให้คะแนน ${side === 'host' ? guest : local}` : `Done · review ${side === 'host' ? guest : local}`}
                </button>
              </div>
            ) : phase === 'contact' ? null : (
              <button type="button" className="kb-link" data-testid="kring-bump-qr-open" onClick={() => setPhase('qr')}>
                {th ? 'ชนไม่ได้? สแกน QR ร้านแทน' : 'Can’t bump? Scan the venue QR'}
              </button>
            )}
          </footer>
        </>
      )}
    </div>
  )
  return typeof document !== 'undefined' ? createPortal(body, document.body) : body
}
