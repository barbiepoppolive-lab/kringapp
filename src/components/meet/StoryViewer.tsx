import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal, flushSync } from 'react-dom'
import HostPhoto from '../ui/HostPhoto'
import { triggerHaptic } from '../../lib/haptics'
import { markTaskDone } from '../fx/island'
import { pauseTilt } from '../../lib/tilt'
import '../../styles/meet-motion.css'

/**
 * Atlas B3 · StoryViewer — the ONE story viewer (Meet rail + Chats inbox).
 * Full-screen, Instagram-style: tap right = next host, tap left = previous, swipe sideways turns a 3D cube
 * to the neighbouring host, swipe down closes, press-and-hold pauses. Opens with a morph from the tapped ring.
 *
 * Anyone can open it with `window.dispatchEvent(new CustomEvent('chon:open-story', { detail: { hostId } }))`.
 * Meet consumes the request (see `takePendingStory`); if Meet is not on screen the request is parked for a few
 * seconds and the app is asked to show the Meet tab, so a tap in Chats still lands in this viewer.
 *
 * Motion: transforms/opacity only; reduced motion = no cube, no morph, the progress bar steps once a second.
 *
 * ROUND5 (Marco B1/B2, Wei B13):
 * - OPEN is a shared-element zoom from the tapped ring: an opaque scrim is on screen from the first frame, and a circle
 *   holding the viewer grows out of the ring (scale ring→1, 300 ms, compositor-only), so the feed never bleeds through
 *   the story. CLOSE plays it backwards into the ring.
 * - A tap turns the cube through the Web Animations API in the same task as the tap (no React round-trip before the
 *   first frame), the header + progress commit to the incoming host at the turn's midpoint, and the index commits
 *   when the cube lands (flushSync, so there is no frame with the old face at 0°).
 * - The progress bar is a 3 px track that visibly fills; auto-advance turns the cube instead of hard-cutting.
 */

export interface StoryViewerItem {
  id: string
  hostName: string
  avatar: string
  photo: string
  venue: string
  hostId?: string
  verified?: boolean
  postedAgo?: string
  caption?: string
}

/* ---------- chon:open-story bridge (module scope so a request survives the Meet tab mounting) ---------- */
interface PendingStory {
  hostId?: string
  hostName?: string
  /** R4 · a daily-reward task the viewer should coach ('watch-story' | 'vibe-check' | 'toast-stories') */
  task?: string
  at: number
}
let pending: PendingStory | null = null
const openers = new Set<(req: PendingStory) => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('chon:open-story', (e: Event) => {
    const detail = ((e as CustomEvent).detail ?? {}) as { hostId?: string; hostName?: string; task?: string }
    const req: PendingStory = { hostId: detail.hostId, hostName: detail.hostName, task: detail.task, at: Date.now() }
    if (openers.size > 0) {
      openers.forEach((fn) => fn(req))
      return
    }
    pending = req
    window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
  })
}

/** Meet registers here; returns an unsubscribe. A parked request (≤ 4 s old) is delivered immediately. */
export function onStoryRequest(fn: (req: { hostId?: string; hostName?: string; task?: string }) => void): () => void {
  openers.add(fn)
  if (pending && Date.now() - pending.at < 4000) {
    const req = pending
    pending = null
    fn(req)
  }
  return () => {
    openers.delete(fn)
  }
}

/* the cube turn: starts moving on the first frame (no ease-in), passes 45° at ~25 % of the time, lands softly */
const TURN_MS = 340
const TURN_BEZIER = [0.35, 0.5, 0.2, 1] as const
const TURN_EASE = `cubic-bezier(${TURN_BEZIER.join(', ')})`

/** time fraction (0–1) at which the turn easing reaches `progress` (bisection on the cubic-bezier). */
export function timeAtProgress(progress: number, [x1, y1, x2, y2]: readonly number[] = TURN_BEZIER): number {
  if (progress <= 0) return 0
  if (progress >= 1) return 1
  const at = (a: number, b: number, t: number) => 3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t
  let lo = 0
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (at(y1, y2, mid) < progress) lo = mid
    else hi = mid
  }
  return at(x1, x2, (lo + hi) / 2)
}

/** y(x) of a CSS cubic-bezier, for JS-built keyframes */
function bezierEase(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const at = (a: number, b: number, s: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s
  return (t: number) => {
    if (t <= 0) return 0
    if (t >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2
      if (at(x1, x2, mid) < t) lo = mid
      else hi = mid
    }
    return at(y1, y2, (lo + hi) / 2)
  }
}

/* ROUND5 Marco B2 · the shared-element zoom. The viewer sits in a circle (radius R, centred on the tapped ring) that
   grows from the ring's size to cover the screen, while the story inside zooms from Z0 to 1 around the same point.
   The inner layer is counter-scaled (Z/S) so both stay compositor transforms; keyframes are sampled in JS. */
const OPEN_MS = 300
const CLOSE_MS = 230
const OPEN_EASE = bezierEase(0.2, 0.85, 0.25, 1)
const CLOSE_EASE = bezierEase(0.45, 0, 0.75, 0.25)
const CONTENT_Z0 = 0.42

export interface ZoomGeometry {
  ox: number
  oy: number
  vw: number
  vh: number
  radius: number
  s0: number
}

export function zoomGeometry(origin: { x: number; y: number; size?: number } | null | undefined): ZoomGeometry {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 390
  const vh = typeof window !== 'undefined' ? window.innerHeight : 844
  const ox = origin?.x ?? vw / 2
  const oy = origin?.y ?? vh / 2
  const radius = Math.ceil(Math.hypot(Math.max(ox, vw - ox), Math.max(oy, vh - oy))) + 2
  // no ring to grow from (opened from Chats / a deep link) → a gentle zoom from the centre
  const s0 = origin ? Math.min(0.5, Math.max(0.02, (origin.size ?? 56) / (radius * 2))) : 0.82
  return { ox, oy, vw, vh, radius, s0 }
}

/** Keyframes for the circle (outer) and the story (inner) at `steps`+1 evenly spaced times. */
export function zoomKeyframes(
  g: ZoomGeometry,
  dir: 'open' | 'close',
  steps = 18,
  fromDragY = 0,
): { outer: Keyframe[]; inner: Keyframe[] } {
  const ease = dir === 'open' ? OPEN_EASE : CLOSE_EASE
  // the story starts ~3× the circle's scale (it reads as the ring's face, filling the circle) — capped so the inner
  // layer's counter-scale stays small; a large counter-scale makes the first frame rasterise at a huge scale
  const z0 = g.s0 >= 0.8 ? 0.94 : Math.min(CONTENT_Z0, g.s0 * 3)
  const outer: Keyframe[] = []
  const inner: Keyframe[] = []
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    // p = how "open" the viewer is at this keyframe
    const p = dir === 'open' ? ease(t) : 1 - ease(t)
    const S = g.s0 + (1 - g.s0) * p
    const Z = z0 + (1 - z0) * p
    const dy = dir === 'close' ? fromDragY * (1 - ease(t)) : 0
    outer.push({ offset: t, transform: `translateY(${dy.toFixed(2)}px) scale(${S.toFixed(5)})` })
    inner.push({ offset: t, transform: `scale(${(Z / S).toFixed(5)})` })
  }
  return { outer, inner }
}

function reducedMotion(): boolean {
  try {
    return (
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true ||
      document.documentElement.dataset.reduceMotion === 'true'
    )
  } catch {
    return false
  }
}

export interface StoryViewerProps {
  stories: StoryViewerItem[]
  index: number
  onIndex: (next: number) => void
  onClose: () => void
  /** where the tapped ring was (centre + diameter), for the shared-element zoom */
  origin?: { x: number; y: number; size?: number } | null
  /** where a story's own ring is right now (close zooms back into the host on screen) */
  originFor?: (story: StoryViewerItem | null) => { x: number; y: number; size?: number } | null
  /** per-frame duration before auto-advancing to the next host */
  frameMs?: number
  language?: string
  /** rendered in the bottom action area (reply row, toast, meet …) */
  renderActions?: (story: StoryViewerItem) => ReactNode
  /** sr-only / small text rendered above the actions */
  renderNote?: (story: StoryViewerItem) => ReactNode
  /** dialog label */
  labelFor?: (story: StoryViewerItem) => string
  testId?: string
}

export default function StoryViewer({
  stories,
  index,
  onIndex,
  onClose,
  origin,
  originFor,
  frameMs = 6000,
  language = 'en',
  renderActions,
  renderNote,
  labelFor = (s) => `${s.hostName} 10s live story`,
  testId = 'story-overlay',
}: StoryViewerProps) {
  const th = language === 'th'
  const count = stories.length
  const safeIdx = ((index % count) + count) % count
  const story = stories[safeIdx]
  const prevStory = stories[(safeIdx - 1 + count) % count]
  const nextStory = stories[(safeIdx + 1) % count]
  const reduce = useRef(reducedMotion()).current

  const [drag, setDrag] = useState(0) // px, + = towards previous
  const [dragY, setDragY] = useState(0)
  const [settling, setSettling] = useState<null | 'next' | 'prev' | 'back'>(null)
  const [paused, setPaused] = useState(false)
  const [progressKey, setProgressKey] = useState(0)
  /** which host the header + progress show: switches at the cube's midpoint, before the index commits */
  const [headIdx, setHeadIdx] = useState<number | null>(null)
  const [closing, setClosing] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const cubeRef = useRef<HTMLDivElement | null>(null)
  const turnAnim = useRef<Animation | null>(null)
  const midTimer = useRef<number | null>(null)
  const settlingRef = useRef(false)
  const zoomRef = useRef<HTMLDivElement | null>(null)
  const innerRef = useRef<HTMLDivElement | null>(null)
  const scrimRef = useRef<HTMLSpanElement | null>(null)
  const dragYRef = useRef(0)
  dragYRef.current = dragY
  /** the neighbouring cube faces mount after the open lands, so the first frame only rasterises one face */
  const [opened, setOpened] = useState(reduce)
  const originRef = useRef(origin)
  const originForRef = useRef(originFor)
  originForRef.current = originFor
  const storyRef = useRef<StoryViewerItem | null>(null)

  useLayoutEffect(() => {
    const zoom = zoomRef.current
    const inner = innerRef.current
    const scrim = scrimRef.current
    if (reduce || !zoom || !inner || typeof zoom.animate !== 'function') {
      setOpened(true)
      return
    }
    const g = zoomGeometry(originRef.current)
    const k = zoomKeyframes(g, 'open')
    const a = zoom.animate(k.outer, { duration: OPEN_MS, easing: 'linear' })
    inner.animate(k.inner, { duration: OPEN_MS, easing: 'linear' })
    // opaque base from the very first frame (0.7 → 1), so the feed never shows through the story
    scrim?.animate([{ opacity: 0.7 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' })
    const done = () => setOpened(true)
    a.onfinish = done
    const safety = window.setTimeout(done, OPEN_MS + 120)
    return () => window.clearTimeout(safety)
  }, [reduce])
  const touch = useRef<{ x: number; y: number; t: number; axis: 'x' | 'y' | null } | null>(null)
  const holdTimer = useRef<number | null>(null)
  const advanceTimer = useRef<number | null>(null)
  const width = () => stageRef.current?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 375)

  /* the world behind an opaque story does not need to tilt (each tilt write restyles the whole page) */
  useEffect(() => pauseTilt(), [])

  /* Atlas integration #6: a story watched for 2 s completes the daily "watch 1 story" task (marks it only, mints nothing) */
  useEffect(() => {
    const id = window.setTimeout(() => markTaskDone('watch-story'), 2000)
    return () => window.clearTimeout(id)
  }, [])

  /* auto-advance: one frame per host; pauses while held. The last host closes (zooming back into its ring). */
  useEffect(() => {
    setProgressKey((k) => k + 1)
    setHeadIdx(null)
  }, [safeIdx])
  useEffect(() => {
    if (paused || settling || closing || count < 1) return
    advanceTimer.current = window.setTimeout(() => {
      if (safeIdx === count - 1) requestClose()
      else finishSettleRef.current('next')
    }, frameMs)
    return () => {
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused, settling, closing, safeIdx, count, frameMs, progressKey])

  /* close = the open zoom played backwards into the ring (reduced motion → immediate) */
  const closeTimer = useRef<number | null>(null)
  const requestClose = useCallback(() => {
    const zoom = zoomRef.current
    const inner = innerRef.current
    if (reduce || !zoom || !inner || typeof zoom.animate !== 'function') {
      onClose()
      return
    }
    if (closeTimer.current !== null) return
    closeTimer.current = 0
    setClosing(true)
    turnAnim.current?.cancel()
    // back into the ring of the host on screen now (after a turn that is not the ring that was tapped)
    const live = originForRef.current?.(storyRef.current) ?? null
    const target = live ?? originRef.current
    // the circle is centred on the OPEN origin; when the target ring differs, move the whole circle there
    const g0 = zoomGeometry(originRef.current)
    const g = { ...g0, s0: target?.size ? Math.min(0.5, Math.max(0.02, target.size / (g0.radius * 2))) : g0.s0 }
    const dx = target ? target.x - g0.ox : 0
    const dy = target ? target.y - g0.oy : 0
    const k = zoomKeyframes(g, 'close', 14, dragYRef.current)
    const outer = k.outer.map((f, i) => {
      const t = i / (k.outer.length - 1)
      const e = CLOSE_EASE(t)
      return { ...f, transform: `translate(${(dx * e).toFixed(2)}px, ${(dy * e).toFixed(2)}px) ${String(f.transform)}` }
    })
    const done = () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      closeTimer.current = -1
      onClose()
    }
    const a = zoom.animate(outer, { duration: CLOSE_MS, easing: 'linear', fill: 'forwards' })
    inner.animate(k.inner, { duration: CLOSE_MS, easing: 'linear', fill: 'forwards' })
    zoom.animate([{ opacity: 1, offset: 0.7 }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' })
    scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: CLOSE_MS, easing: 'ease-in', fill: 'forwards' })
    // unmount when the zoom has really landed (a slow frame must not cut it short); a safety net covers a lost event
    a.onfinish = done
    closeTimer.current = window.setTimeout(done, CLOSE_MS + 400)
  }, [onClose, reduce])
  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
      if (midTimer.current !== null) window.clearTimeout(midTimer.current)
      turnAnim.current?.cancel()
    },
    [],
  )

  /* keyboard + body scroll lock */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') requestClose()
      else if (e.key === 'ArrowRight') finishSettleRef.current('next')
      else if (e.key === 'ArrowLeft') finishSettleRef.current('prev')
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [requestClose])

  /** current cube angle for a drag offset (90° = a full quarter turn) */
  const angleFor = (dx: number) => Math.max(-90, Math.min(90, (dx / Math.max(1, width())) * 90))
  const cubeTransform = (deg: number) => `translateZ(${-width() / 2}px) rotateY(${deg}deg)`

  const finishSettle = (dir: 'next' | 'prev' | 'back', fromDx = drag) => {
    if (settlingRef.current || closing) return
    if (count < 2 && dir !== 'back') return
    const target = dir === 'next' ? (safeIdx + 1) % count : dir === 'prev' ? (safeIdx - 1 + count) % count : safeIdx
    if (reduce || !cubeRef.current || typeof cubeRef.current.animate !== 'function') {
      if (dir !== 'back') onIndex(target)
      setDrag(0)
      return
    }
    settlingRef.current = true
    const from = angleFor(fromDx)
    const to = dir === 'next' ? -90 : dir === 'prev' ? 90 : 0
    const dur = Math.round(TURN_MS * Math.max(0.45, Math.abs(to - from) / 90))
    // the turn starts in THIS task (before React re-renders), so the first frame after the tap already moves
    turnAnim.current?.cancel()
    const anim = cubeRef.current.animate([{ transform: cubeTransform(from) }, { transform: cubeTransform(to) }], {
      duration: dur,
      easing: TURN_EASE,
      fill: 'forwards',
    })
    turnAnim.current = anim
    setSettling(dir)
    // the incoming host owns the header + progress from the midpoint (the face is half-turned in by then)
    if (dir !== 'back') {
      if (midTimer.current !== null) window.clearTimeout(midTimer.current)
      // the moment the cube passes 45° (both faces equally on screen) — solved on the same easing curve
      const p = Math.abs(from) >= 45 ? 0 : (45 - Math.abs(from)) / (90 - Math.abs(from))
      const midAt = Math.round(dur * timeAtProgress(p))
      // counted from the animation's real start (it can wait a frame for the compositor), not from the tap
      const arm = () => {
        if (turnAnim.current !== anim) return
        midTimer.current = window.setTimeout(() => setHeadIdx(target), midAt)
      }
      if (anim.ready && typeof anim.ready.then === 'function') anim.ready.then(arm, () => {})
      else arm()
    }
    anim.onfinish = () => {
      flushSync(() => {
        if (dir !== 'back') onIndex(target)
        setSettling(null)
        setDrag(0)
      })
      anim.cancel()
      if (turnAnim.current === anim) turnAnim.current = null
      settlingRef.current = false
    }
  }
  const finishSettleRef = useRef(finishSettle)
  finishSettleRef.current = finishSettle

  /* R4 Marco 9 · a tap turns the same cube a swipe does (it used to hard-cut). One host → nothing to turn to. */
  const tapTurn = (dir: 'next' | 'prev') => {
    if (count < 2) return
    triggerHaptic('tap')
    finishSettle(dir, 0)
  }

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0]
    if (!t) return
    touch.current = { x: t.clientX, y: t.clientY, t: Date.now(), axis: null }
    holdTimer.current = window.setTimeout(() => setPaused(true), 220)
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const t = e.touches[0]
    const s = touch.current
    if (!t || !s) return
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    if (!s.axis && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) s.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (s.axis) {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
      setPaused(true)
    }
    if (s.axis === 'x' && count > 1) setDrag(dx)
    if (s.axis === 'y' && dy > 0) setDragY(dy)
  }
  const onTouchEnd = (e: React.TouchEvent) => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    const s = touch.current
    touch.current = null
    setPaused(false)
    if (!s) return
    const t = e.changedTouches[0]
    const dx = (t?.clientX ?? s.x) - s.x
    const dy = (t?.clientY ?? s.y) - s.y
    if (s.axis === 'y') {
      if (dy > 110) requestClose()
      setDragY(0)
      return
    }
    if (s.axis === 'x') {
      const w = width()
      const fast = Math.abs(dx) / Math.max(1, Date.now() - s.t) > 0.5
      if (count > 1 && (dx < -w * 0.22 || (fast && dx < -30))) finishSettle('next', dx)
      else if (count > 1 && (dx > w * 0.22 || (fast && dx > 30))) finishSettle('prev', dx)
      else finishSettle('back', dx)
    }
  }

  storyRef.current = story ?? null
  if (!story) return null

  // cube angle while dragging (a settle animates the cube with WAAPI and leaves this at the drag angle)
  const w = width()
  const angle = reduce ? 0 : angleFor(drag)
  const half = w / 2
  const cubeStyle: CSSProperties = { transform: `translateZ(${-half}px) rotateY(${angle}deg)` }

  // shared-element zoom geometry (see zoomGeometry): circle radius + centre, dialog pinned back to the viewport
  const geo = zoomGeometry(origin)
  const zoomVars = {
    '--sv-ox': `${geo.ox}px`,
    '--sv-oy': `${geo.oy}px`,
    '--sv-r': `${geo.radius}px`,
    '--sv-vw': `${geo.vw}px`,
    '--sv-vh': `${geo.vh}px`,
  } as CSSProperties
  // swipe-down: the story card follows the finger and the scrim thins out so the feed shows where it will land
  const zoomStyle: CSSProperties | undefined =
    dragY > 0 ? { transform: `translateY(${dragY}px) scale(${Math.max(0.86, 1 - dragY / 1400)})`, transition: 'none' } : undefined
  const scrimStyle: CSSProperties | undefined = dragY > 0 ? { opacity: Math.max(0.35, 1 - dragY / 420) } : undefined
  const headStory = stories[headIdx ?? safeIdx] ?? story
  const headI = headIdx ?? safeIdx

  // R4 Marco · the face turning away darkens a little and the incoming one brightens (sells the cube's depth)
  const turn = settling === 'next' || settling === 'prev' ? 1 : settling === 'back' ? 0 : Math.abs(angle) / 90
  const shadeTransition = settling ? 'opacity 320ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
  const face = (s: StoryViewerItem, pos: 'cur' | 'prev' | 'next') => (
    <div
      className={`sv-face sv-face-${pos}`}
      style={{ transform: `rotateY(${pos === 'cur' ? 0 : pos === 'next' ? 90 : -90}deg) translateZ(${half}px)` }}
      aria-hidden={pos !== 'cur'}
      data-fallback-name={s.hostName}
    >
      <HostPhoto
        src={s.photo}
        name={s.hostName}
        alt={pos === 'cur' ? `${s.hostName} live story frame` : ''}
        className="sv-photo-frame"
        imgClassName="sv-photo"
        draggable={false}
      />
      <span className="sv-shade" aria-hidden="true" />
      <span
        className="sv-turn"
        aria-hidden="true"
        style={{ opacity: reduce ? 0 : (pos === 'cur' ? turn : 1 - turn) * 0.42, transition: shadeTransition }}
      />
    </div>
  )

  const node = (
    <div
      data-testid={testId}
      className={`sv-root${reduce ? ' is-reduced' : ''}${closing ? ' is-closing' : ''}${opened ? ' is-open' : ''}`}
      style={zoomVars}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <span ref={scrimRef} className="sv-scrim" aria-hidden="true" style={scrimStyle} />
      <div ref={zoomRef} className="sv-zoom" style={zoomStyle}>
      <div ref={innerRef} role="dialog" aria-modal="true" aria-label={labelFor(story)} className="sv-dialog">
        <div ref={stageRef} className="sv-stage">
          <div ref={cubeRef} className={`sv-cube${settling ? ' is-turning' : ''}`} style={cubeStyle}>
            {count > 1 && opened && face(prevStory, 'prev')}
            {face(story, 'cur')}
            {count > 1 && opened && face(nextStory, 'next')}
          </div>
        </div>

        {/* tap zones: left third = previous host, right two thirds = next host (Instagram muscle memory) */}
        <button
          type="button"
          aria-label="Previous story"
          data-testid="story-prev-btn"
          className="sv-tap sv-tap-prev"
          onClick={() => tapTurn('prev')}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
        />
        <button
          type="button"
          aria-label="Next story"
          data-testid="story-next-btn"
          className="sv-tap sv-tap-next"
          onClick={() => tapTurn('next')}
          onMouseDown={() => setPaused(true)}
          onMouseUp={() => setPaused(false)}
        />

        <div className="sv-top">
          <div className="sv-prog" aria-hidden="true">
            {stories.map((s, i) => (
              <i key={s.id} className={i < headI ? 'is-done' : i === headI ? 'is-now' : ''}>
                {i === headI && (
                  <b
                    key={`${progressKey}-${headI}`}
                    style={{
                      animationDuration: `${frameMs}ms`,
                      ['--sv-frame' as string]: `${frameMs}ms`,
                      // the incoming host's bar waits at 0 until its face has landed
                      animationPlayState: paused || settling || closing ? 'paused' : 'running',
                    }}
                  />
                )}
              </i>
            ))}
          </div>
          <div className="sv-head">
            <span className="sv-av" aria-hidden="true" data-fallback-name={headStory.hostName} key={`av-${headStory.id}`}>
              <HostPhoto src={headStory.avatar} name={headStory.hostName} round className="sv-av-photo" imgClassName="avatar" />
            </span>
            <span className="sv-who" key={`who-${headStory.id}`}>
              <b>
                {headStory.hostName}
                {headStory.verified !== false && <span className="sv-ver" aria-hidden="true">✓</span>}
              </b>
              <small>
                {headStory.postedAgo ?? (th ? '2 ชม.' : '2h')} · {headStory.venue.split('·')[0].trim()}
              </small>
            </span>
            <button type="button" aria-label="Close story" className="sv-close m-press" onClick={requestClose}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="sv-bottom">
          {/* NEXT95 · a small mono venue label instead of the white sticker */}
          <span className="sv-sticker ux-mono-label" aria-hidden="true">
            <i />
            {headStory.venue}
          </span>
          {/* the caption + reply follow the header: they swap to the incoming host at the cube's midpoint */}
          {headStory.caption && <p className="sv-caption" key={`cap-${headStory.id}`}>{headStory.caption}</p>}
          {renderNote?.(headStory)}
          <div className="sv-actions">{renderActions?.(headStory)}</div>
        </div>
      </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}
