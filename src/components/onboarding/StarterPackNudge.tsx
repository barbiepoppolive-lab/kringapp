import { useCallback, useEffect, useRef, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'
import { dismissStarterPack, openStarterPack, readStarterPackState, STARTER_PACK_EVENT, starterPackHidden } from '../../lib/demoState'
import { ISLAND_VISIBLE_EVENT, reserveIslandSpace } from '../fx/island'
import '../../styles/shell.css'

const SHOWN_KEY = 'chon_starter_nudge_v1'
/** how long the pill stays before it tucks itself away (the pack also lives in Wallet) */
export const STARTER_NUDGE_MS = 7000
/** its band under the header: 6 px + 40 px pill + 6 px */
const NUDGE_SPACE_PX = 52
/** keep in sync with the Starter Pack sheet (src/components/wallet/StarterPack.tsx → STARTER_PACK_WORTH_THB) */
const WORTH_THB = 1390
const PRICE_THB = 999

/**
 * NEXT95 · Starter Pack entry after onboarding (first session, travellers only).
 *
 * ROUND5 Wei B11 / Marco B12 · one compact island-style pill right under the header — "Worth ฿1,363 for ฿999" —
 * that RESERVES its band (the feed slides down, so it never covers a Clink button), steps aside while a top-island
 * toast shows, and tucks itself away after STARTER_NUDGE_MS. Never on a later session, never for hosts or agencies,
 * never after the pack was bought or dismissed. "See" dispatches `chon:open-starter-pack` (the wallet sheet owns
 * the price and the top-up hand-off); ✕ dismisses it for good. No money moves here.
 */
export default function StarterPackNudge({ role, userId, armed, language = 'en' }: { role: string; userId: string; armed: boolean; language?: string }) {
  const th = language === 'th'
  const [open, setOpen] = useState(false)
  const [islandBusy, setIslandBusy] = useState(false)
  const [top, setTop] = useState(56)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    if (!armed || starterPackHidden(role, userId)) return
    let seen = false
    try {
      seen = window.localStorage.getItem(SHOWN_KEY) === '1'
      window.localStorage.setItem(SHOWN_KEY, '1')
    } catch {
      seen = false
    }
    if (seen) return
    // let the onboarding screen leave and Meet settle first
    const t = window.setTimeout(() => setOpen(true), 900)
    return () => window.clearTimeout(t)
  }, [armed, role, userId])

  useEffect(() => {
    if (!open) return
    const sync = () => {
      if (readStarterPackState(userId) !== 'new') setOpen(false)
    }
    window.addEventListener(STARTER_PACK_EVENT, sync)
    window.addEventListener('storage', sync)
    return () => {
      window.removeEventListener(STARTER_PACK_EVENT, sync)
      window.removeEventListener('storage', sync)
    }
  }, [open, userId])

  // auto-dismiss (the timer pauses while a toast has the band)
  useEffect(() => {
    if (!open || islandBusy) return
    timer.current = window.setTimeout(() => setOpen(false), STARTER_NUDGE_MS)
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [open, islandBusy])

  useEffect(() => {
    const onIsland = (e: Event) => setIslandBusy(Boolean((e as CustomEvent<{ visible?: boolean }>).detail?.visible))
    window.addEventListener(ISLAND_VISIBLE_EVENT, onIsland)
    return () => window.removeEventListener(ISLAND_VISIBLE_EVENT, onIsland)
  }, [])

  const measure = useCallback(() => {
    const hr = document.querySelector<HTMLElement>('header.ux-header')?.getBoundingClientRect()
    setTop(hr && hr.height > 1 ? Math.round(hr.bottom) + 6 : 56)
  }, [])

  // reserve the band only while the pill itself is on screen
  const visible = open && !islandBusy
  useEffect(() => {
    if (open) measure()
    reserveIslandSpace('starter-pack', visible ? NUDGE_SPACE_PX : 0)
  }, [open, visible, measure])
  useEffect(() => () => reserveIslandSpace('starter-pack', 0), [])

  if (!open) return null

  const worth = `฿${WORTH_THB.toLocaleString('en-US')}`
  const price = `฿${PRICE_THB.toLocaleString('en-US')}`
  return (
    <aside
      className={`sh-spn${visible ? '' : ' is-away'}`}
      style={{ top }}
      role="region"
      aria-label={th ? 'สตาร์ทเตอร์แพ็กสำหรับนักเดินทาง' : 'Traveller Starter Pack'}
      data-testid="starter-pack-nudge"
    >
      <span className="sh-spn-ticket" aria-hidden="true">
        {price}
      </span>
      <span className="sh-spn-copy">
        <b>{th ? `มูลค่า ${worth}` : `Worth ${worth}`}</b>
        <small>{th ? 'สตาร์ทเตอร์แพ็ก · ครั้งเดียว' : 'Starter pack · once'}</small>
      </span>
      <span className="sh-spn-actions">
        <button
          type="button"
          className="sh-btn sh-btn-gold sh-spn-go"
          data-testid="starter-pack-nudge-open"
          onClick={() => {
            triggerHaptic('select')
            setOpen(false)
            openStarterPack('onboarding')
          }}
        >
          {th ? 'ดู' : 'See'}
        </button>
        <button
          type="button"
          className="sh-spn-x"
          data-testid="starter-pack-nudge-dismiss"
          aria-label={th ? 'ไม่เป็นไร ขอบคุณ' : 'No thanks'}
          onClick={() => {
            triggerHaptic('tap')
            setOpen(false)
            dismissStarterPack(userId)
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </span>
    </aside>
  )
}
