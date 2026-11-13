import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { flushSync } from 'react-dom'
import { BUMP, prefersReducedMotion } from '../../design/motion'
import { LIQUID_BEAT, LiquidStage, canLiquid, liquidFrame, type LiquidGeom, type LiquidVariant } from './liquidLight'

/**
 * Kring brand marks (round-2 brand board B2/B4/B6, round-3 R2/R4).
 *
 *  <KringMark />      the two-ring mark (anchan ring + marigold ring). Always exactly two rings — never three.
 *  <KringWordmark />  lowercase heavy "kring" whose i-dot is the two-ring bump (dotless ı + rings above it).
 *  <KringBump />      the กริ๊ง! choreography: the rings are pulled together (WAAPI, accelerating — the touch is the
 *                     impact), and on the frame that approach FINISHES the violet lens is born in the overlap, a white
 *                     spark pops from the seam and `onContact` (haptic + chime + กริ๊ง!) runs — never on a timer.
 *                     Then the rings recoil a few px and settle. Used by the launch, sign-in, onboarding, Live hero.
 *  <KringWave />      the little sound-logo waveform under "กริ๊ง!" (bars rise 22 ms apart).
 *
 * Colours come from tokens (--ring-a / --ring-b / --anchan-lime / --ring-off); CSS lives in src/styles/shell.css
 * under "KRING BRAND". The violet lens appears ONLY at the moment of the bump. No hearts anywhere.
 */

const lensPath = (c1: number, c2: number, y: number, r: number) => {
  const m = (c1 + c2) / 2
  const h = Math.sqrt(r * r - ((c2 - c1) / 2) ** 2)
  return `M${m} ${y - h}A${r} ${r} 0 0 1 ${m} ${y + h}A${r} ${r} 0 0 1 ${m} ${y - h}Z`
}
const sparkPath = (x: number, y: number, s: number) =>
  `M${x} ${y - s}l${s * 0.27} ${s * 0.73} ${s * 0.73} ${s * 0.27}-${s * 0.73} ${s * 0.27}-${s * 0.27} ${s * 0.73}-${s * 0.27}-${s * 0.73}-${s * 0.73}-${s * 0.27} ${s * 0.73}-${s * 0.27}z`

export interface KringMarkProps {
  /** rendered width in px (height follows the 34:20 ratio) */
  size?: number
  /** bump once every few seconds (the wordmark's i-dot and the header mark) */
  pulse?: boolean
  /** show the violet overlap (only for bump moments / the app icon) */
  lens?: boolean
  /** day = share cards, store, print (deeper strokes for cream backgrounds) */
  tone?: 'night' | 'day'
  className?: string
  title?: string
  style?: CSSProperties
}

export function KringMark({ size = 34, pulse = false, lens = false, tone = 'night', className = '', title, style }: KringMarkProps) {
  return (
    <svg
      className={`kr-mark${pulse ? ' is-pulse' : ''}${tone === 'day' ? ' is-day' : ''}${className ? ` ${className}` : ''}`}
      viewBox="0 0 34 20"
      width={size}
      height={(size * 20) / 34}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={style}
    >
      {lens && <path className="kr-mark-lens" d={lensPath(11, 23, 10, 7.5)} />}
      <circle className="kr-mark-a" cx="11" cy="10" r="7.5" />
      <circle className="kr-mark-b" cx="23" cy="10" r="7.5" />
    </svg>
  )
}

export interface KringWordmarkProps {
  /** font size in px */
  size?: number
  pulse?: boolean
  tone?: 'night' | 'day'
  /** add the Thai lockup (rings + กริ๊ง) under the Latin wordmark */
  thai?: boolean
  className?: string
}

/** "kring" — the i is a dotless ı with the two rings as its dot. Screen readers hear "Kring". */
export function KringWordmark({ size = 30, pulse = true, tone = 'night', thai = false, className = '' }: KringWordmarkProps) {
  return (
    <span className={`kr-wm-wrap${className ? ` ${className}` : ''}`} style={{ ['--kr-wm' as string]: `${size}px` }}>
      <span className={`kr-wm${tone === 'day' ? ' is-day' : ''}`} role="img" aria-label="Kring">
        <span aria-hidden="true">kr</span>
        <span className="kr-wm-i" aria-hidden="true">
          ı
          <KringMark pulse={pulse} tone={tone} className="kr-wm-dot" />
        </span>
        <span aria-hidden="true">ng</span>
      </span>
      {thai && (
        <span className="kr-wm-th" lang="th" aria-hidden="true">
          <KringMark size={Math.round(size * 0.9)} tone={tone} />
          กริ๊ง
        </span>
      )}
    </span>
  )
}

export interface KringBumpProps {
  /** together = Live / launched · apart = Paused (rings separate, dim to slate) */
  state?: 'together' | 'apart'
  /** change this number to replay the slide-in + bump from apart (launch, going Live) */
  replayKey?: number
  /** play the slide-in on first mount (launch). Default false: mount in the final state. */
  playOnMount?: boolean
  /** compact travel (36 units) for the profile hero; full 62 for the launch */
  compact?: boolean
  /** gentle micro-bump every 3.4 s while together */
  idle?: boolean
  /** lens behaviour: hold (launch, stays bright) · flash (Live: flares on contact, then rests softly in the overlap) */
  lens?: 'hold' | 'flash'
  /** fires ON the contact frame (haptic + chime + กริ๊ง! go here) — driven by the approach animation finishing */
  onContact?: () => void
  /** approach length in ms (default 500 · compact 360). The resume launch uses ~300 so the whole thing fits in 1.2 s. */
  approachMs?: number
  width?: number
  className?: string
  label?: string
  /** KRING VISUAL V2 · which Liquid-light beat: launch 2.9 s · golive 1.2 s · resume 0.8 s (default from the props:
   *  approachMs → resume, compact → golive, else launch) */
  variant?: LiquidVariant
}

type LensState = 'off' | 'on' | 'rest'

/**
 * the approach: magnets pulling in — accelerating, so the touch IS the impact (Marco 2: contact = animation end).
 * KRING FIX2 · Marco 8: the old (.5,0,.9,.45) left the rings visibly parked for the first half; this one starts moving
 * on the first frames and still arrives fastest.
 */
const APPROACH_EASE = 'cubic-bezier(.4, .08, .85, .5)'
/** after the touch: the rings push into each other and spring back (spring.bouncy feel, transform only) */
const RECOIL_MS = 420

/** Feature test for WAAPI (jsdom and very old engines fall back to a timer). */
function canAnimate(el: Element | null): el is Element & { animate: Element['animate'] } {
  return !!el && typeof (el as Element).animate === 'function'
}

function SvgBump({
  state = 'together',
  replayKey = 0,
  playOnMount = false,
  compact = false,
  idle = false,
  lens = 'hold',
  onContact,
  approachMs: approachProp,
  width = 200,
  className = '',
  label,
}: KringBumpProps) {
  const reduced = prefersReducedMotion()
  const restLens: LensState = lens === 'hold' ? 'on' : 'rest'
  const startsTogether = state === 'together' && (!playOnMount || reduced)
  const [phase, setPhase] = useState<'apart' | 'together'>(() => (startsTogether ? 'together' : 'apart'))
  const [lensState, setLensState] = useState<LensState>(() => (startsTogether ? restLens : 'off'))
  const [sparkKey, setSparkKey] = useState(0)
  const svgRef = useRef<SVGSVGElement>(null)
  const aRef = useRef<SVGCircleElement>(null)
  const bRef = useRef<SVGCircleElement>(null)
  const contactRef = useRef(onContact)
  contactRef.current = onContact
  /** the (state, replayKey) the last effect run saw — a change replays the bump; StrictMode's replay is ignored */
  type Prev = { state: string; replayKey: number; before: Prev | null }
  const prevRef = useRef<Prev | null>(null)

  useEffect(() => {
    const timers: number[] = []
    const anims: Animation[] = []
    let alive = true
    const last = prevRef.current
    // React never re-runs an effect with identical deps, except StrictMode's dev replay: then decide as the first run did
    const prev = last && last.state === state && last.replayKey === replayKey ? last.before : last
    prevRef.current = { state, replayKey, before: prev }
    if (state === 'apart') {
      setPhase('apart')
      setLensState('off')
      return
    }
    // together: animate on a real change, or on mount when asked to
    const changed = prev !== null && (prev.state !== state || prev.replayKey !== replayKey)
    const animate = prev === null ? playOnMount : changed
    if (!animate || reduced) {
      setPhase('together')
      setLensState(restLens)
      if (animate) contactRef.current?.()
      return
    }

    const svg = svgRef.current
    const a = aRef.current
    const b = bRef.current
    const travel = compact ? BUMP.travelCompact : BUMP.travel

    /** THE contact frame: lens, spark and the caller's haptic/chime/word all commit synchronously, together. */
    const contact = () => {
      if (!alive) return
      if (svg) {
        svg.setAttribute('data-phase', 'together')
        svg.setAttribute('data-bumped', 'true')
      }
      flushSync(() => {
        setPhase('together')
        setLensState('on')
        setSparkKey((k) => k + 1)
        contactRef.current?.()
      })
      if (lens === 'flash') timers.push(window.setTimeout(() => alive && setLensState('rest'), 1100))
    }

    if (!svg || !canAnimate(a) || !canAnimate(b)) {
      // no WAAPI (tests, old engines): the old timed path
      setPhase('apart')
      setLensState('off')
      timers.push(window.setTimeout(() => {
        setPhase('together')
        timers.push(window.setTimeout(contact, BUMP.contact))
      }, 32))
      return () => {
        alive = false
        timers.forEach((t) => window.clearTimeout(t))
      }
    }

    // Start apart, freeze CSS transitions on the rings (the WAAPI timeline owns the transform), then pull in.
    svg.setAttribute('data-anim', 'true')
    setPhase('together')
    setLensState('off')
    const approachMs = approachProp ?? (compact ? 360 : 500)
    const from = (dir: number) => `translateX(${dir * travel}px)`
    const opts: KeyframeAnimationOptions = { duration: approachMs, easing: APPROACH_EASE, fill: 'backwards', delay: approachProp ? 0 : 34 }
    const pa = a.animate([{ transform: from(-1) }, { transform: 'translateX(0px)' }], opts)
    const pb = b.animate([{ transform: from(1) }, { transform: 'translateX(0px)' }], opts)
    anims.push(pa, pb)
    pa.finished
      .then(() => {
        if (!alive) return
        contact()
        // recoil: they bite a few px deeper and spring back out (the "bump")
        const k = compact ? 3 : 5
        const ro: KeyframeAnimationOptions = { duration: RECOIL_MS, easing: 'cubic-bezier(.2,.7,.3,1)' }
        const ra = a.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${k}px)`, offset: 0.22 }, { transform: `translateX(${-k * 0.35}px)`, offset: 0.6 }, { transform: 'translateX(0px)' }], ro)
        const rb = b.animate([{ transform: 'translateX(0px)' }, { transform: `translateX(${-k}px)`, offset: 0.22 }, { transform: `translateX(${k * 0.35}px)`, offset: 0.6 }, { transform: 'translateX(0px)' }], ro)
        anims.push(ra, rb)
        return ra.finished
      })
      .then(() => {
        if (alive) svg.removeAttribute('data-anim')
      })
      .catch(() => undefined) // cancelled (unmount / replay)

    return () => {
      alive = false
      anims.forEach((x) => x.cancel())
      svg.removeAttribute('data-anim')
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, replayKey])

  const travel = compact ? BUMP.travelCompact : BUMP.travel
  return (
    <svg
      ref={svgRef}
      className={`kr-bump${className ? ` ${className}` : ''}`}
      viewBox="0 0 200 120"
      width={width}
      height={(width * 120) / 200}
      data-phase={phase}
      data-state={state}
      data-bumped={lensState === 'on' ? 'true' : lensState === 'rest' ? 'rest' : 'false'}
      data-idle={idle && state === 'together' ? 'true' : undefined}
      style={{ ['--kr-travel' as string]: `${travel}px` }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle ref={aRef} className="kr-ring kr-ring-a" cx={RING_A} cy="60" r={RING_R} />
      <circle ref={bRef} className="kr-ring kr-ring-b" cx={RING_B} cy="60" r={RING_R} />
      <path className="kr-lens" d={lensPath(RING_A, RING_B, 60, RING_R)} />
      {sparkKey > 0 && <path key={sparkKey} className="kr-spark" d={sparkPath(100, 60, 14)} />}
    </svg>
  )
}

/* KRING VISUAL V2 · ring geometry in the 200 × 120 viewBox — the Liquid-light proportions (pair spans 3.6 R + stroke),
   ~1.4× the old r = 30 rings so the launch pair is the mockup size. */
const RING_R = 42
const RING_A = 100 - 0.8 * RING_R
const RING_B = 100 + 0.8 * RING_R
/** the canvas reaches 70 / 80 units past the box on every side (glow pools, ripples, sparks), masked soft at its edge */
const LIQ_GEOM: LiquidGeom = { cx: 100, cy: 60, r: RING_R, x0: -70, y0: -80, w: 340, h: 280 }

/**
 * KringBump = the กริ๊ง! choreography. Where Canvas 2D exists it is drawn as "A · Liquid light" (liquidLight.ts):
 * the rings slide in, and on the frame the approach FINISHES (t = ta) contact fires — lens, bloom, ripples, sparks and
 * the caller's onContact (haptic + chime + กริ๊ง!) commit together — then each ring carries its partner's colour.
 * With `idle` the settled rings keep a slow float + flow (paused off-screen / in the background, ~30 fps). Paused
 * ('apart') shows the slate SVG rings. No canvas (tests, very old engines) → the SVG bump (same props, same contact).
 */
export function KringBump(props: KringBumpProps) {
  const [liquid] = useState(() => canLiquid())
  return liquid ? <LiquidBump {...props} /> : <SvgBump {...props} />
}

function LiquidBump({
  state = 'together',
  replayKey = 0,
  playOnMount = false,
  compact = false,
  idle = false,
  lens = 'hold',
  onContact,
  approachMs,
  width = 200,
  className = '',
  label,
  variant: variantProp,
}: KringBumpProps) {
  const variant: LiquidVariant = variantProp ?? (approachMs ? 'resume' : compact ? 'golive' : 'launch')
  const reduced = prefersReducedMotion()
  const startsTogether = state === 'together'
  const [phase, setPhase] = useState<'apart' | 'together'>(startsTogether ? 'together' : 'apart')
  const [bumped, setBumped] = useState<'false' | 'true' | 'rest'>(() => (startsTogether && !playOnMount ? (lens === 'hold' ? 'true' : 'rest') : 'false'))
  const cvRef = useRef<HTMLCanvasElement>(null)
  const contactRef = useRef(onContact)
  contactRef.current = onContact
  type Prev = { state: string; replayKey: number; before: Prev | null }
  const prevRef = useRef<Prev | null>(null)

  useEffect(() => {
    const last = prevRef.current
    const prev = last && last.state === state && last.replayKey === replayKey ? last.before : last
    prevRef.current = { state, replayKey, before: prev }
    if (state === 'apart') {
      setPhase('apart')
      setBumped('false')
      return
    }
    const cv = cvRef.current
    if (!cv) return
    let stage: LiquidStage
    try {
      stage = new LiquidStage(cv, LIQ_GEOM)
    } catch {
      return
    }
    const changed = prev !== null && (prev.state !== state || prev.replayKey !== replayKey)
    const animate = prev === null ? playOnMount : changed
    const beat = LIQUID_BEAT[variant]
    let alive = true
    let raf = 0
    let visible = true
    let fired = !animate
    let lastDraw = 0
    // t of the clock: a played beat starts at 0; a mount in the final state starts settled (idle ramps from here)
    let t0 = performance.now() - (animate ? 0 : (beat.total + 1.4) * 1000)
    let pausedAt: number | null = null
    // A played beat waits (up to 1.2 s) for two smooth frames before its clock starts, so a busy main thread (the app
    // booting under the launch) never eats the approach — the rings are simply still apart a moment longer.
    let armed = !animate
    let lastNow = 0
    let smoothFrames = 0
    const waitFrom = performance.now()
    stage.resize()
    setPhase('together')
    if (animate) setBumped('false')

    const contact = () => {
      fired = true
      cv.dataset.contact = String(Date.now())
      flushSync(() => {
        setBumped('true')
        contactRef.current?.()
      })
      if (lens === 'flash') window.setTimeout(() => alive && setBumped('rest'), 1100)
    }
    const frame = (now: number) => {
      if (!alive) return
      if (!armed) {
        smoothFrames = lastNow && now - lastNow < 40 ? smoothFrames + 1 : 0
        lastNow = now
        if (smoothFrames >= 2 || now - waitFrom > 1200) {
          armed = true
          t0 = now
        } else {
          if (!lastDraw) {
            stage.draw(liquidFrame(LIQ_GEOM, 0, variant, false, idle))
            lastDraw = now
          }
          raf = requestAnimationFrame(frame)
          return
        }
      }
      const t = (now - t0) / 1000
      const settled = t >= beat.total + 1.4
      if (!reduced) {
        // the beat paints every frame; the idle float only every other frame (~30 fps is plenty for a 7 s drift)
        if (!settled || !idle || now - lastDraw > 30) {
          stage.draw(liquidFrame(LIQ_GEOM, t, variant, false, idle))
          lastDraw = now
        }
      }
      if (!fired && t >= beat.ta) contact()
      if (reduced) return
      if (settled && !idle) return // the beat is over: the last frame stays
      if (!visible || document.visibilityState === 'hidden') {
        pausedAt = now
        return
      }
      raf = requestAnimationFrame(frame)
    }
    if (reduced) {
      stage.draw(liquidFrame(LIQ_GEOM, 0, variant, true, false))
      if (animate) contact()
    } else {
      raf = requestAnimationFrame(frame)
    }
    // idle loops pause off-screen and in the background, then pick up where they were
    const resume = () => {
      if (!alive || pausedAt === null || reduced) return
      if (!visible || document.visibilityState === 'hidden') return
      t0 += performance.now() - pausedAt
      pausedAt = null
      raf = requestAnimationFrame(frame)
    }
    const io = typeof IntersectionObserver !== 'undefined'
      ? new IntersectionObserver((es) => {
          visible = es.some((e) => e.isIntersecting)
          if (visible) resume()
        })
      : null
    io?.observe(cv)
    const onVis = () => resume()
    document.addEventListener('visibilitychange', onVis)
    const onResize = () => stage.resize()
    window.addEventListener('resize', onResize)
    return () => {
      alive = false
      cancelAnimationFrame(raf)
      io?.disconnect()
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('resize', onResize)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, replayKey])

  const svgTravel = compact ? BUMP.travelCompact : BUMP.travel
  return (
    <span
      className={`kr-bump-box is-liquid${className ? ` ${className}` : ''}`}
      style={{ ['--kr-w' as string]: `${width}px` }}
      data-phase={phase}
      data-state={state}
      data-bumped={bumped}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {/* Paused: the slate rings apart (and the box that sizes the canvas) */}
      <svg className="kr-bump" viewBox="0 0 200 120" data-phase={phase} data-state={state} style={{ ['--kr-travel' as string]: `${svgTravel}px` }} aria-hidden="true">
        <circle className="kr-ring kr-ring-a" cx={RING_A} cy="60" r={RING_R} />
        <circle className="kr-ring kr-ring-b" cx={RING_B} cy="60" r={RING_R} />
      </svg>
      <canvas ref={cvRef} className="kr-bump-cv" aria-hidden="true" />
    </span>
  )
}

/* ------------------------------------------------------------------------------------------------ */
/* KringLogo · the header two-ring logo (KRING VISUAL V2, P3 "Ring logo = B")                       */
/* ------------------------------------------------------------------------------------------------ */

/** Window event: play the logo's full blue→gold flow once (the bump, a top-up, a claim). */
export const LOGO_FLOW_EVENT = 'kring:logo-flow'
export function flowLogo(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(LOGO_FLOW_EVENT))
}

export interface KringLogoProps {
  /** rendered width in px (34:24 artwork) */
  size?: number
  /** change to play the full blue→gold flow once */
  flowKey?: number
  /** embossed / static use (no light running) */
  still?: boolean
  className?: string
  label?: string
}

/**
 * Two rings, each a CSS-masked stroke filled by a slowly turning conic gradient: anchan keeps anchan, marigold keeps
 * marigold, and a soft light runs inside each ring once every 12 s (the "sweep"). On special moments (`flowKey`
 * changes, or LOGO_FLOW_EVENT) blue and gold flow through both rings in one quick turn. Violet only in the overlap.
 * Pauses with the app in the background (html[data-kf-hidden]); reduced motion = still.
 */
export function KringLogo({ size = 40, flowKey = 0, still = false, className = '', label = 'Kring' }: KringLogoProps) {
  const [flowing, setFlowing] = useState(false)
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    if (!flowKey || prefersReducedMotion()) return
    setFlowing(false)
    const r = window.requestAnimationFrame(() => setFlowing(true))
    const t = window.setTimeout(() => setFlowing(false), 1700)
    return () => {
      window.cancelAnimationFrame(r)
      window.clearTimeout(t)
    }
  }, [flowKey])
  const uid = useRef(`kl${Math.random().toString(36).slice(2, 8)}`).current
  return (
    <span
      className={`kr-logo${still ? ' is-still' : ''}${flowing ? ' is-flow' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: (size * 24) / 34 }}
      role={label ? 'img' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="kr-logo-rg is-l"><i /></span>
      <span className="kr-logo-rg is-r"><i /></span>
      <svg viewBox="0 0 34 24" aria-hidden="true">
        <defs>
          <clipPath id={`${uid}a`}><circle cx="12" cy="12" r="9" /></clipPath>
          <clipPath id={`${uid}b`}><circle cx="22" cy="12" r="9" /></clipPath>
        </defs>
        <g clipPath={`url(#${uid}b)`}><circle className="kr-logo-lens" cx="12" cy="12" r="8.6" /></g>
        <g clipPath={`url(#${uid}a)`}><circle className="kr-logo-lens" cx="22" cy="12" r="8.6" /></g>
      </svg>
    </span>
  )
}

const WAVE = [5, 12, 16, 10, 7, 5, 3, 14, 16, 11, 7, 4, 3]

/** The กริ๊ง! waveform: anchan bars then marigold bars (first strike, second strike). Replays when `playKey` changes. */
export function KringWave({ playKey = 0, className = '' }: { playKey?: number; className?: string }) {
  return (
    <span className={`kr-wave${className ? ` ${className}` : ''}`} key={playKey} aria-hidden="true">
      {WAVE.map((h, i) => (
        <i key={i} style={{ ['--i' as string]: i, ['--h' as string]: `${h}px` }} />
      ))}
    </span>
  )
}

export default KringMark
