import { type CSSProperties } from 'react'

/**
 * Depth build · Odometer — rolling digits for money figures (`.ux-odo` in index.css).
 *
 * Props
 * - `value`      the number to show (rounded, formatted en-US with thousands separators)
 * - `prefix`     text before the digits (default '฿'); pass '' for none
 * - `suffix`     optional text after the digits
 * - `durationMs` roll duration (default 700)
 * - `srLabel`    render a screen-reader copy of the formatted value (default true). Pass false when the parent
 *                already carries its own sr-only text (e.g. the header balance pill), so nothing is announced twice.
 *
 * Rolls only when `value` changes: each digit column is keyed by its position from the right, so React keeps the
 * same element and the CSS transition on `--odo-d` animates it. On first paint the digits simply sit at their value.
 * The visible reels are CSS pseudo-content, so `textContent` holds only the sr-only copy — tests and screen
 * readers read one clean string. Reduced motion → no transition (index.css).
 */
export default function Odometer({
  value,
  prefix = '฿',
  suffix = '',
  durationMs = 700,
  srLabel = true,
  className = '',
  testId,
}: {
  value: number
  prefix?: string
  suffix?: string
  durationMs?: number
  srLabel?: boolean
  className?: string
  testId?: string
}) {
  const safe = Number.isFinite(value) ? Math.round(value) : 0
  const formatted = `${prefix}${safe.toLocaleString('en-US')}${suffix}`
  const chars = formatted.split('')
  const style = { '--odo-ms': `${Math.max(0, durationMs)}ms` } as CSSProperties
  return (
    <span className={`ux-odo ${className}`.trim()} data-testid={testId} data-value={safe}>
      {srLabel ? <span className="sr-only">{formatted}</span> : null}
      <span className="ux-odo-reels" aria-hidden="true" style={style}>
        {chars.map((ch, i) => {
          const fromRight = chars.length - i
          if (ch >= '0' && ch <= '9') {
            return <span key={`d${fromRight}`} className="ux-odo-d" style={{ '--odo-d': Number(ch) } as CSSProperties} />
          }
          return <span key={`s${fromRight}${ch}`} className="ux-odo-s" data-c={ch} />
        })}
      </span>
    </span>
  )
}
