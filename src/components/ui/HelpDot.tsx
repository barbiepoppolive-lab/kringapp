import { useEffect, useState } from 'react'
import { HELP } from '../../lib/helpContent'
import { GUIDES, guideTargetFor, openGuide } from '../../lib/guideContent'
import { playSfx } from '../../lib/sfx'
import { triggerHaptic } from '../../lib/haptics'

/**
 * HelpDot — the small 3D gold "?" (atlas A10/A13). It no longer opens a popover: every dot opens the ONE full-screen
 * guide (`chon:open-guide`) at the page that matches its id (Wallet → "Your wallet", Pulse → "Pay the Thai price"…).
 * Variants: 'orb' (header, 34 px) · 'dot' (section, 24 px).
 * Motion: the orb's ring turns once on mount and once per hover; the orb breathes ONE 2 s cycle on its first mount of
 * the session (`sessionStorage chon_help_breathed_v1`), then stays still. Reduced motion → static (CSS).
 */
const BREATHE_KEY = 'chon_help_breathed_v1'
function hasBreathed(): boolean {
  try {
    return window.sessionStorage.getItem(BREATHE_KEY) === '1'
  } catch {
    return true
  }
}
export default function HelpDot({
  id,
  language = 'en',
  variant = 'dot',
  className = '',
  page,
}: {
  id: string
  language?: string
  variant?: 'orb' | 'dot'
  className?: string
  /** open the guide at a specific page (defaults to the page mapped for this id) */
  page?: number
}) {
  // read-only initializer (StrictMode may call it twice); the flag is written in the effect
  const [breathe] = useState(() => variant === 'orb' && !hasBreathed())
  useEffect(() => {
    if (!breathe) return
    try {
      window.sessionStorage.setItem(BREATHE_KEY, '1')
    } catch {
      // ignore
    }
  }, [breathe])
  const target = guideTargetFor(id)
  const guide = GUIDES[target.id]
  const th = language === 'th'
  const legacy = HELP[id]
  const title = legacy ? (th ? legacy.titleTh : legacy.title) : guide.topic
  return (
    <button
      type="button"
      className={`ux-helpdot is-${variant}${breathe ? ' is-breathe' : ''} ${className}`}
      data-testid={`help-${id}`}
      data-guide={target.id}
      aria-label={`${th ? 'เคล็ดลับ' : 'Tips'} · ${id}`}
      title={title}
      aria-haspopup="dialog"
      onClick={(e) => {
        e.stopPropagation()
        playSfx('fold')
        triggerHaptic('tap')
        openGuide(target.id, page ?? target.page)
      }}
    >
      <span className="ux-helpdot-ring" aria-hidden="true" />
      <span className="ux-helpdot-core" aria-hidden="true">?</span>
    </button>
  )
}
