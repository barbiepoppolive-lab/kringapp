import { useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../design/motion'

/**
 * K4 · the Price Check gauge: green (usual) → amber → red (4×+), needle swings in with spring.bouncy.
 * `angle` is 0 (far left, cheap) … 180 (far right, 4×+). The red arc carries the screen's one gauge glow.
 */
const CX = 100
const CY = 104
const R = 80

function pt(deg: number, r = R): [number, number] {
  const a = (deg * Math.PI) / 180
  return [CX - r * Math.cos(a), CY - r * Math.sin(a)]
}
function arc(from: number, to: number): string {
  const [x1, y1] = pt(from)
  const [x2, y2] = pt(to)
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`
}

export const GAUGE_SEGMENTS = { green: [6, 58], amber: [62, 98], red: [102, 174] } as const

export default function Gauge({
  angle,
  labels,
  ticks = [],
  testId,
  size = 'md',
  live = true,
}: {
  angle: number
  labels: [string, string]
  /** FIX2 · Wei 8 — small marks on the arc, e.g. [[105, '2×'], [133, '3×']] */
  ticks?: Array<[number, string]>
  testId?: string
  size?: 'md' | 'sm'
  live?: boolean
}) {
  const reduce = prefersReducedMotion()
  const [shown, setShown] = useState(reduce || !live)
  useEffect(() => {
    if (reduce || !live) return
    setShown(false)
    const id = window.requestAnimationFrame(() => window.requestAnimationFrame(() => setShown(true)))
    return () => window.cancelAnimationFrame(id)
  }, [angle, reduce, live])
  const rot = (shown ? angle : 2) - 90
  return (
    <div className={`kp-gauge is-${size}${shown ? ' is-on' : ''}`} data-testid={testId} aria-hidden="true">
      <svg viewBox="0 0 200 118">
        <path d={arc(0, 180)} className="kp-g-track" />
        <path d={arc(...GAUGE_SEGMENTS.green)} className="kp-g-green" />
        <path d={arc(...GAUGE_SEGMENTS.amber)} className="kp-g-amber" />
        <path d={arc(...GAUGE_SEGMENTS.red)} className="kp-g-red-glow" />
        <path d={arc(...GAUGE_SEGMENTS.red)} className="kp-g-red" />
        <g className="kp-g-needle" style={{ transform: `rotate(${rot}deg)` }}>
          <line x1={CX} y1={CY} x2={CX} y2={CY - R + 14} />
        </g>
        <circle cx={CX} cy={CY} r="7" className="kp-g-hub" />
      </svg>
      {ticks.map(([deg, label]) => {
        const [x, y] = pt(deg, R + 19)
        return (
          <span key={label} className="kp-g-tick" style={{ left: `${(x / 200) * 100}%`, top: `${(y / 118) * 100}%` }}>
            {label}
          </span>
        )
      })}
      <span className="kp-g-l">{labels[0]}</span>
      <span className="kp-g-r">{labels[1]}</span>
    </div>
  )
}

/** Canvas version (share image). */
export function drawGauge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, angle: number) {
  const seg = (from: number, to: number, color: string, glow = false) => {
    ctx.save()
    ctx.lineWidth = r * 0.17
    ctx.lineCap = 'round'
    ctx.strokeStyle = color
    if (glow) {
      ctx.shadowColor = 'rgba(255,45,85,.85)'
      ctx.shadowBlur = r * 0.25
    }
    ctx.beginPath()
    ctx.arc(cx, cy, r, Math.PI + (from * Math.PI) / 180, Math.PI + (to * Math.PI) / 180)
    ctx.stroke()
    ctx.restore()
  }
  seg(0, 180, 'rgba(255,255,255,.08)')
  seg(GAUGE_SEGMENTS.green[0], GAUGE_SEGMENTS.green[1], '#3DDC97')
  seg(GAUGE_SEGMENTS.amber[0], GAUGE_SEGMENTS.amber[1], '#FFC145')
  seg(GAUGE_SEGMENTS.red[0], GAUGE_SEGMENTS.red[1], '#FF3B5C', true)
  const a = Math.PI + (angle * Math.PI) / 180
  ctx.save()
  ctx.strokeStyle = '#FFF6E6'
  ctx.lineWidth = r * 0.06
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  ctx.lineTo(cx + (r - r * 0.18) * Math.cos(a), cy + (r - r * 0.18) * Math.sin(a))
  ctx.stroke()
  ctx.fillStyle = '#FFF6E6'
  ctx.beginPath()
  ctx.arc(cx, cy, r * 0.09, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}
