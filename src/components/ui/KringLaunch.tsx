import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { DUR, prefersReducedMotion } from '../../design/motion'
import { kringHaptic, triggerHaptic } from '../../lib/haptics'
import { playKringChime, warmAudio } from '../../lib/sfx'
import { t } from '../../lib/lexicon'
import { KringBump, KringWave, KringWordmark } from './KringMark'

/**
 * Launch · "the brand in 3 seconds" (round-2 B6, round-3 R4) — drawn as A · Liquid light since KRING VISUAL V2:
 * launch 2.9 s (contact at .95 s), resume 0.8 s (contact at .30 s); the rings are a canvas (ui/liquidLight.ts).
 *
 *  mode="full"    first open, signed out: night-blue screen, the anchan + marigold rings slide 62 px each and bump
 *                 (spring.bouncy 640 ms), violet lens + white spark, "กริ๊ง!" with the waveform, the wordmark and the
 *                 tagline in both languages, then "Let's go · ไปกันเลย" (starts the 1-minute sign-up).
 *  mode="resume"  signed in (a cold open, or a return after ≥ 10 min away): the short version, 0.8 s end to end (KRING VISUAL V2 · Liquid light)
 *                 (KRING FIX2 · Marco 3) — it grows out of the icon (320 ms) while the rings are already pulling in
 *                 (300 ms approach), bumps (กริ๊ง!, no wordmark · FIX3) and dissolves into the app. Shorter returns never replay.
 *
 * On contact: haptic light 10 ms + medium 20 ms, and the soft E6→B6 chime at most once a day — scheduled just after the
 * contact frame paints (an AudioContext built inside that frame used to stall the spark ~300 ms · Marco 1).
 * Reduced motion: a still frame (rings together, lens on) that fades out (a real 200 ms opacity fade, not a cut).
 * Tap anywhere skips the resume version.
 * Glows: anchan ring, lens, spark (3 of 3).
 */
export default function KringLaunch({ mode, onDone, language = 'en' }: { mode: 'full' | 'resume'; onDone: () => void; language?: string }) {
  const reduced = prefersReducedMotion()
  const [stage, setStage] = useState(reduced ? 4 : 0) // 0 grow · 1 contact · 2 word · 3 cta · 4 settled
  const [leaving, setLeaving] = useState(false)
  const doneRef = useRef(onDone)
  doneRef.current = onDone
  const leftRef = useRef(false)
  const rootRef = useRef<HTMLDivElement>(null)

  const leave = useCallback(() => {
    if (leftRef.current) return
    leftRef.current = true
    setLeaving(true)
    const ms = reduced || mode === 'resume' ? RESUME_FADE_MS : DUR.m
    // reduced motion: the global rule zeroes CSS transitions, so the fade is a WAAPI opacity tween (opacity only)
    try {
      if (reduced) rootRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: 'linear', fill: 'forwards' })
    } catch {
      // no WAAPI: the overlay simply goes
    }
    window.setTimeout(() => doneRef.current(), ms)
  }, [reduced, mode])

  const contactRef = useRef(false)

  // Reduced motion: a still frame. Otherwise the choreography is driven from the moment the rings touch.
  useEffect(() => {
    const ts: number[] = []
    if (reduced) {
      if (mode === 'resume') ts.push(window.setTimeout(leave, 500))
    } else if (mode === 'resume') {
      // Always play the launch bump smoothly without skipping on simulated mobile opens
      // the beat leaves from its contact frame (+300 ms); this is only the safety net if the canvas never ticks
      ts.push(window.setTimeout(leave, RESUME_TOTAL_MS + 1200))
      ts.push(window.setTimeout(warmAudio, 0))
    }
    return () => {
      ts.forEach(clearTimeout)
    }
  }, [mode, reduced, leave])

  const beats = useRef<number[]>([])
  useEffect(() => () => beats.current.forEach(clearTimeout), [])
  const onContact = useCallback(() => {
    contactRef.current = true
    setStage((s) => Math.max(s, 1))
    // KRING T2 · the Ching: the Launch cut on a cold start, the short Resume cut when coming back (haptic per cut)
    const variant = mode === 'resume' ? 'resume' : 'launch'
    kringHaptic(variant)
    // the chime goes out right after this frame paints — never build audio inside the contact frame (once a day)
    const chime = () => playKringChime({ variant, oncePerDay: true })
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => beats.current.push(window.setTimeout(chime, 0)))
    else chime()
    if (reduced) return
    // beats AFTER contact (contact itself is the approach animation finishing — KringBump, Marco 2)
    // KRING VISUAL V2 · Liquid light: the wordmark letters rise from contact + 300 ms, the CTA lands as the beat settles
    beats.current.push(window.setTimeout(() => setStage((s) => Math.max(s, 2)), mode === 'full' ? 300 : 120))
    if (mode === 'full') beats.current.push(window.setTimeout(() => setStage((s) => Math.max(s, 3)), 1500))
    else beats.current.push(window.setTimeout(leave, RESUME_HOLD_AFTER_CONTACT_MS))
  }, [mode, reduced, leave])

  if (typeof document === 'undefined') return null
  const th = language === 'th'
  const node = (
    <div
      ref={rootRef}
      className={`kr-launch is-${mode}${leaving ? ' is-leaving' : ''}${reduced ? ' is-still' : ''}`}
      data-testid="kring-launch"
      data-stage={stage}
      role="dialog"
      aria-modal="true"
      aria-label={`${t('brand', 'en')} · ${t('brand.tagline', 'en')}`}
      onClick={mode === 'resume' ? leave : undefined}
    >
      <div className="kr-launch-stage">
        <KringBump
          playOnMount
          width={362}
          lens="hold"
          variant={mode === 'resume' ? 'resume' : 'launch'}
          onContact={onContact}
          approachMs={mode === 'resume' ? RESUME_APPROACH_MS : undefined}
          className="kr-launch-rings"
        />
        <div className="kr-launch-brand">
          <KringWordmark size={48} pulse={false} />
        </div>
        {/* Kring! / กริ๊ง! pops on the contact frame — it IS the sound */}
        <div className="kr-launch-word" lang={th ? 'th' : undefined} aria-hidden="true">{t('kring', language)}</div>
        <KringWave playKey={stage >= 1 ? 1 : 0} className={stage >= 1 ? 'is-on' : ''} />
        <div className="kr-launch-brand is-tags">
          <p className="kr-launch-tag">
            {t('brand.tagline', language)}{' '}
            <br />
            {t('brand.cities', language)}
          </p>
        </div>
      </div>
      {mode === 'full' && (
        <div className="kr-launch-cta">
          <button
            type="button"
            className="sh-btn sh-btn-gold sh-btn-block kr-launch-go"
            data-testid="kring-launch-go"
            onClick={() => {
              triggerHaptic('select')
              leave()
            }}
          >
            {t('launch.cta', language)}
          </button>
          <p className="kr-launch-fine">{th ? t('ob.time', 'th') : t('ob.time', 'en')} · {t('brand.signoff', language)}</p>
        </div>
      )}
    </div>
  )
  return createPortal(node, document.body)
}

/* ------------------------------------------------------------------------------------------------ */
/* When to play it                                                                                   */
/* ------------------------------------------------------------------------------------------------ */

/** KRING FIX2 · Marco 3 — the resume launch, end to end (mount → gone), on a normal device */
export const RESUME_TOTAL_MS = 800
const RESUME_APPROACH_MS = 300
const RESUME_HOLD_AFTER_CONTACT_MS = 300
const RESUME_FADE_MS = 200

/** Background time after which coming back counts as an "app resume" (plays the short launch). Quicker returns
 *  (a photo, a LINE reply, a payment app) go straight back to where you were — no replay. */
export const RESUME_AFTER_MS = 10 * 60_000
/** Background time after which the app re-opens on Experiences, like a fresh open. */
export const REOPEN_AFTER_MS = 30 * 60_000

function launchDisabled(): boolean {
  try {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return true
    const q = new URLSearchParams(window.location.search)
    if (q.has('nolaunch')) return true
    if ((window as unknown as { __kringNoLaunch?: boolean }).__kringNoLaunch) return true
  } catch {
    // ignore
  }
  return false
}

/**
 * Plays the launch on first open and on app resume (after ≥ 20 s in the background). `onReopen` fires when the app
 * was away long enough to count as a fresh open (≥ 30 min) so the shell can return to Experiences.
 * Disabled in tests (jsdom) and with `?nolaunch` (QA links).
 */
export function useKringLaunch(signedIn: boolean, onReopen?: () => void): { mode: 'full' | 'resume' | null; done: () => void } {
  const [mode, setMode] = useState<'full' | 'resume' | null>(() => (launchDisabled() ? null : signedIn ? 'resume' : 'full'))
  const hiddenAt = useRef<number | null>(null)
  const reopenRef = useRef(onReopen)
  reopenRef.current = onReopen
  const signedRef = useRef(signedIn)
  signedRef.current = signedIn

  useEffect(() => {
    if (launchDisabled()) return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
        return
      }
      const at = hiddenAt.current
      hiddenAt.current = null
      if (at === null) return
      const away = Date.now() - at
      if (away >= REOPEN_AFTER_MS) reopenRef.current?.()
      if (away >= RESUME_AFTER_MS && signedRef.current) setMode('resume')
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  const done = useCallback(() => setMode(null), [])
  return { mode, done }
}
