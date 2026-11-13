import { useEffect, useRef } from 'react'
import { isReducedMotionEnabled } from '../../lib/haptics'
import sceneRooftop from '../../assets/pulse/scenes/rooftop-table.svg'
import sceneCab from '../../assets/pulse/scenes/late-cab.svg'
import sceneSpa from '../../assets/pulse/scenes/spa.svg'
import sceneEsim from '../../assets/pulse/scenes/esim-5g.svg'

/**
 * Depth build · BackgroundStage — the `.ux-stage` layer behind Welcome and Meet (never on other tabs).
 * Three colour orbs, two floating scene pictures and a veil that fades the night into `--surface-0`.
 *
 * NEXT95 · one tilt space: the stage no longer runs its own pointer loop. It is the FAR layer of the shared tilt
 * (src/lib/tilt.ts writes `--tx/--ty` on :root; CSS moves the orbs ±3px and the pictures ±5px). The only thing this
 * component still writes is scroll progress (0…1 over 600 px) → `--sy`, on scroll only. Each layer also drifts once
 * (CSS). Reduced motion (OS or in-app setting) → a static picture: no listener, no drift, tilt is 0.
 *
 * The parent must carry `.has-stage` (isolation: isolate; transparent background) so the stage's z-index −1 sits
 * above the parent's paint but below its content.
 */
export default function BackgroundStage({ variant = 'welcome' }: { variant?: 'welcome' | 'meet' }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || typeof window === 'undefined') return
    const mq = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
    if ((mq && mq.matches) || isReducedMotionEnabled()) return

    let sy = -1
    let raf = 0
    const flush = () => {
      raf = 0
      const y = window.scrollY || document.documentElement.scrollTop || 0
      const next = Math.max(0, Math.min(1, y / 600))
      if (Math.abs(next - sy) < 0.002) return
      sy = next
      el.style.setProperty('--sy', sy.toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = window.requestAnimationFrame(flush)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    flush()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  const [picA, picB] = variant === 'meet' ? [sceneSpa, sceneEsim] : [sceneRooftop, sceneCab]
  return (
    <div ref={ref} className={`ux-stage is-${variant}`} data-testid={`background-stage-${variant}`} aria-hidden="true">
      <div className="ux-stage-layer is-orbs">
        <span className="ux-stage-orb is-a" />
        <span className="ux-stage-orb is-b" />
        <span className="ux-stage-orb is-c" />
      </div>
      <div className="ux-stage-layer is-pics">
        <span className="ux-stage-pic is-1">
          <img src={picA} alt="" loading="lazy" decoding="async" draggable={false} />
        </span>
        <span className="ux-stage-pic is-2">
          <img src={picB} alt="" loading="lazy" decoding="async" draggable={false} />
        </span>
      </div>
      <div className="ux-stage-veil" />
    </div>
  )
}
