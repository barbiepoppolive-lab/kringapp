import { useId } from 'react'

/**
 * K4 · the two-ring Kring mark (anchan blue + marigold, violet only where the rings overlap).
 * `bump` makes the rings meet once when it mounts (CSS, one shot, static under reduced motion). Used on the Kring Price header,
 * the verdict share card and the boarding pass. Purely decorative unless `label` is given.
 */
export default function KringMark({ size = 22, bump = false, word = false, label }: { size?: number; bump?: boolean; word?: boolean; label?: string }) {
  const id = useId().replace(/:/g, '')
  return (
    <span className={`kp-mark${bump ? ' is-bump' : ''}`} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg width={size * 1.6} height={size} viewBox="0 0 32 20" fill="none">
        <defs>
          <clipPath id={`kpl-${id}`}>
            <circle cx="11" cy="10" r="7.2" />
          </clipPath>
        </defs>
        <g className="kp-mark-a">
          <circle cx="11" cy="10" r="7.2" stroke="var(--kp-anchan-neon, #7381FF)" strokeWidth="2.6" />
        </g>
        <g className="kp-mark-b">
          <circle cx="21" cy="10" r="7.2" stroke="var(--kp-marigold, #FFB21E)" strokeWidth="2.6" />
          <g clipPath={`url(#kpl-${id})`}>
            <circle cx="21" cy="10" r="7.2" stroke="var(--kp-lime, #9B5CFF)" strokeWidth="2.6" />
          </g>
        </g>
      </svg>
      {word ? <b className="kp-word">kring</b> : null}
    </span>
  )
}

/** Canvas version of the mark (verdict share image). */
export function drawKringMark(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  ctx.save()
  ctx.lineWidth = r * 0.36
  ctx.strokeStyle = '#7381FF'
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = '#FFB21E'
  ctx.beginPath()
  ctx.arc(x + r * 1.39, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(x, y, r + ctx.lineWidth / 2, 0, Math.PI * 2)
  ctx.clip()
  ctx.strokeStyle = '#9B5CFF'
  ctx.beginPath()
  ctx.arc(x + r * 1.39, y, r, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()
}
