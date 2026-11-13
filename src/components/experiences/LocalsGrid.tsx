import { useLayoutEffect, useRef, type ReactNode } from 'react'
import './experiences.css'

/**
 * Kring · LocalsGrid — the 2-column Locals grid (K2).
 *
 * "The grid fills the screen, no blank space below; the next row peeks." The row height is measured, not guessed:
 * from the grid's top (at scroll 0) to the top of the bottom dock, two rows fit exactly and ~44 px of whatever comes
 * next (a third row, or the "ask several at once" strip) peeks above the dock. Clamped to 200–340 px so tiny and
 * huge screens stay sane. Re-measured on resize and when anything above the grid changes height.
 *
 * Change it: PEEK (px of the next row), ROWS (rows that fill the screen), MIN/MAX (row clamp).
 */
const ROWS = 2
const PEEK = 44
const MIN = 200
const MAX = 340
const GAP = 10

function dockTop(): number {
  const nav = document.querySelector<HTMLElement>('[data-testid="bottom-nav-dock"], .sh-dock, .ux-dock')
  const r = nav?.getBoundingClientRect()
  return r && r.height > 0 && r.top > window.innerHeight * 0.5 ? r.top : window.innerHeight - 92
}

export default function LocalsGrid({
  children,
  testId = 'locals-grid',
  className = '',
  fill = true,
}: {
  children: ReactNode
  testId?: string
  className?: string
  /** false → natural card height (aspect ratio), e.g. inside a sheet */
  fill?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !fill || typeof window === 'undefined') return
    let raf = 0
    const measure = () => {
      raf = 0
      const r = el.getBoundingClientRect()
      if (r.width === 0) return // hidden pane: keep the last value
      const topAtRest = r.top + window.scrollY
      const avail = dockTop() - topAtRest - PEEK
      const row = Math.max(MIN, Math.min(MAX, Math.floor((avail - GAP * (ROWS - 1)) / ROWS)))
      el.style.setProperty('--kx-row', `${row}px`)
    }
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('resize', schedule)
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(schedule) : null
    if (ro) {
      ro.observe(el)
      if (el.parentElement) ro.observe(el.parentElement)
      ro.observe(document.body)
    }
    return () => {
      window.removeEventListener('resize', schedule)
      ro?.disconnect()
      if (raf) cancelAnimationFrame(raf)
    }
  }, [fill])

  return (
    <div ref={ref} className={`kx-grid${fill ? ' is-fill' : ''} ${className}`.trim()} data-testid={testId}>
      {children}
    </div>
  )
}
