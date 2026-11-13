import { useCallback, useEffect, useRef, useState } from 'react'
import '../../styles/shell.css'
import { ISLAND_VISIBLE_EVENT, reserveIslandSpace } from '../fx/island'

/**
 * Atlas A12 · the ONE top island. Every money moment, win and status shows here, one at a time, directly under the
 * header (never over the dock, never stacked, never white).
 *
 * Contract: `window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone?, icon?, ms? } }))`
 * Extras (optional): `key` — a sticky status (e.g. 'offline') that stays until `chon:island-dismiss { key }`;
 * `testId` — the island element carries it while that message shows (keeps legacy test ids alive);
 * `action: 'wallet'` — a tap opens Wallet.
 */
export type IslandTone = 'gold' | 'green' | 'red' | 'neutral'
export interface IslandDetail {
  text: string
  tone?: IslandTone
  icon?: string
  ms?: number
  key?: string
  sticky?: boolean
  testId?: string
  action?: 'wallet'
}
interface IslandItem extends IslandDetail {
  id: number
}

/** Convenience helper for callers. */
export function showIsland(detail: IslandDetail): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:island', { detail }))
}

const MAX_QUEUE = 4
/** the band the island occupies under the header: 6 px gap + 36 px pill + 8 px gap */
const ISLAND_SPACE_PX = 50

export default function TopIsland() {
  const [queue, setQueue] = useState<IslandItem[]>([])
  const [sticky, setSticky] = useState<IslandItem[]>([])
  const [top, setTop] = useState<number>(56)
  /** true when the pill hangs under the App header (not a chat room) → it reserves its band instead of covering */
  const [underHeader, setUnderHeader] = useState(true)
  const idRef = useRef(0)
  const timerRef = useRef<number | null>(null)
  const roomOpenRef = useRef(false)

  const measure = useCallback(() => {
    if (typeof document === 'undefined') return
    // Atlas integration #3: when a full-screen surface hides the App header (the chat room), sit under ITS header
    // instead (`[data-island-anchor]` or the chat room's `.cp-ch`), so the pill never covers the back / ⋯ buttons.
    const header = document.querySelector<HTMLElement>('header.ux-header')
    const hr = header?.getBoundingClientRect()
    if (hr && hr.height > 1 && hr.bottom > 0) {
      // R4 Wei B5 · the island's band starts flush with the header and carries its own 6 px gap (see .sh-island-wrap)
      setTop(Math.max(2, Math.round(hr.bottom)))
      setUnderHeader(true)
      return
    }
    // chat room: clear its header AND the plan ticket pinned right under it (both stay visible)
    let bottom = 0
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[data-island-anchor], .cp-room > .cp-ch, .cp-room .cp-plan'))) {
      const r = el.getBoundingClientRect()
      if (r.height > 1 && r.bottom > 0 && r.top < 240) bottom = Math.max(bottom, r.bottom)
    }
    setUnderHeader(false)
    if (bottom > 0) {
      setTop(Math.round(bottom))
      return
    }
    // chat room announced but not laid out yet → safe default below a ~56px room header
    setTop(roomOpenRef.current ? 58 : 4)
  }, [])

  useEffect(() => {
    const onRoom = (e: Event) => {
      roomOpenRef.current = Boolean((e as CustomEvent<{ open?: boolean }>).detail?.open)
      // measure after the room (or header) has laid out
      window.requestAnimationFrame(() => window.requestAnimationFrame(measure))
    }
    window.addEventListener('chon:chat-room-state', onRoom)
    return () => window.removeEventListener('chon:chat-room-state', onRoom)
  }, [measure])

  useEffect(() => {
    const onIsland = (e: Event) => {
      const d = (e as CustomEvent<IslandDetail>).detail
      if (!d || typeof d.text !== 'string' || !d.text.trim()) return
      const item: IslandItem = { ...d, id: ++idRef.current }
      if (d.sticky || d.key) {
        setSticky((s) => [...s.filter((x) => x.key !== d.key), item])
        return
      }
      setQueue((q) => {
        // a newer money toast replaces a queued one with the same text; never grow without bound
        const next = [...q.filter((x, i) => i === 0 || x.text !== item.text), item]
        return next.length > MAX_QUEUE ? [next[0], ...next.slice(-(MAX_QUEUE - 1))] : next
      })
    }
    const onDismiss = (e: Event) => {
      const key = (e as CustomEvent<{ key?: string }>).detail?.key
      if (key) setSticky((s) => s.filter((x) => x.key !== key))
      else setQueue([])
    }
    window.addEventListener('chon:island', onIsland)
    window.addEventListener('chon:island-dismiss', onDismiss)
    return () => {
      window.removeEventListener('chon:island', onIsland)
      window.removeEventListener('chon:island-dismiss', onDismiss)
    }
  }, [])

  const current = queue[0] ?? sticky[sticky.length - 1] ?? null

  useEffect(() => {
    if (!current) return
    measure()
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (queue[0] && current.id === queue[0].id) {
      // a waiting toast shortens the one on screen so the line never builds up
      const base = current.ms ?? 2500
      const ms = queue.length > 1 ? Math.min(base, 1400) : base
      timerRef.current = window.setTimeout(() => {
        setQueue((q) => q.slice(1))
      }, ms)
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
    }
  }, [current?.id, queue.length, measure]) // eslint-disable-line react-hooks/exhaustive-deps

  // ROUND5 Ploy B9 · under the header the island takes its own room (content slides down), so it never covers the
  // header, the Host home "Tonight" row / online switch, or a back pill. In a chat room it hangs over the thread.
  const showing = Boolean(current)
  useEffect(() => {
    reserveIslandSpace('island', showing && underHeader ? ISLAND_SPACE_PX : 0)
    window.dispatchEvent(new CustomEvent(ISLAND_VISIBLE_EVENT, { detail: { visible: showing } }))
  }, [showing, underHeader])
  useEffect(() => () => reserveIslandSpace('island', 0), [])

  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  if (!current) return null
  const tone = current.tone ?? 'neutral'
  const clickable = current.action === 'wallet'
  return (
    <div className="sh-island-wrap" style={{ top }} aria-live="polite">
      <div
        key={current.id}
        role="status"
        data-testid={current.testId ?? 'top-island'}
        data-tone={tone}
        className={`sh-island is-${tone}${clickable ? ' is-tap' : ''}`}
        onClick={
          clickable
            ? () => {
                setQueue((q) => q.slice(1))
                window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'vip' } }))
              }
            : undefined
        }
      >
        {current.icon ? (
          <span className="sh-island-ico" aria-hidden="true">
            {current.icon}
          </span>
        ) : tone === 'neutral' ? (
          <span className="sh-island-dot" aria-hidden="true" />
        ) : null}
        <span className="sh-island-text">{current.text}</span>
      </div>
    </div>
  )
}
