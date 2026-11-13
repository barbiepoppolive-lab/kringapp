import { useEffect, useRef } from 'react'

/**
 * Deterministic LIFO Back-Stack & Universal Mobile Back-Swipe Engine (`src/lib/backStack.ts`)
 *
 * Ensures that whenever a user performs:
 *  1) A mobile left-to-right horizontal back-swipe (`dx > 64px`, `|dx| > |dy| * 2.1`), OR
 *  2) An OS edge back-swipe / browser Back button (`window.popstate`), OR
 *  3) Presses `Escape` on desktop,
 * the app always pops ONLY the top-most active layer in strict reverse chronological + priority order:
 *   Priority 100: Top-most sheets & modals (`Sheet`, `KSheet`, `TopUpSheet`, `CashOutSheet`, `BookingCardSheet`, `BumpCheckIn`, `StarterPack`, `MultiRequestSheet`, `FullGuide`, `SafetyCenterHost`, `RewardsSheet`, `MyProfile`)
 *   Priority 85:  Chat room inner drawers/trays (`giftOpen`, `stickerOpen`, `panel !== 'none'`)
 *   Priority 70:  Full-screen pushed sub-pages (`WPage`, `ExperienceDetail`, `HostLightbox`)
 *   Priority 60:  1-on-1 Chat Room (`hasEnteredChatRoom` -> back to Chats inbox list)
 *   Priority 40:  Intra-tab sub-views (`ExperiencesTab` `mode === 'locals'` -> `'experiences'`, `MeetFeed` sub-views)
 *   Priority 10:  Tab history (`tabHistoryRef` -> previous tab -> `'meet'`)
 */

export interface BackEntryOptions {
  id?: string
  priority?: number
  label?: string
}

interface InternalBackEntry {
  key: string
  id: string
  priority: number
  seq: number
  label?: string
  onBack: () => boolean | void
}

const entries = new Map<string, InternalBackEntry>()
let seqCounter = 0
let suppressPopCount = 0

function getSortedEntries(): InternalBackEntry[] {
  return Array.from(entries.values()).sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority
    return b.seq - a.seq
  })
}

export function hasActiveBackEntries(): boolean {
  return entries.size > 0
}

export function getTopBackEntry(): InternalBackEntry | undefined {
  return getSortedEntries()[0]
}

/**
 * Pops the top-most active back entry. Returns `true` if an entry handled the back navigation.
 */
export function popTopBackEntry(): boolean {
  const sorted = getSortedEntries()
  for (const entry of sorted) {
    try {
      const res = entry.onBack()
      if (res !== false) {
        return true
      }
    } catch {
      // ignore handler errors and try next
    }
  }
  return false
}

export function registerBackEntry(
  key: string,
  onBack: () => boolean | void,
  options: BackEntryOptions = {},
): () => void {
  const existing = entries.get(key)
  const seq = existing ? existing.seq : ++seqCounter
  entries.set(key, {
    key,
    id: options.id ?? key,
    priority: options.priority ?? 100,
    seq,
    label: options.label,
    onBack,
  })

  if (!existing && typeof window !== 'undefined') {
    try {
      window.history.pushState({ kringBackKey: key, priority: options.priority ?? 100 }, '')
    } catch {
      // ignore in restricted environments
    }
  }

  return () => {
    entries.delete(key)
  }
}

/**
 * React hook to register any modal, sheet, sub-page, or sub-view on the LIFO back stack while `active === true`.
 */
export function useBackEntry(
  active: boolean,
  onBack: () => boolean | void,
  options: BackEntryOptions = {},
): void {
  const cbRef = useRef(onBack)
  cbRef.current = onBack
  const keyRef = useRef<string>(
    options.id ? `${options.id}-${Math.random().toString(36).slice(2, 8)}` : `bk-${Math.random().toString(36).slice(2, 9)}`,
  )

  useEffect(() => {
    if (!active) return
    const key = keyRef.current
    const unregister = registerBackEntry(
      key,
      () => cbRef.current(),
      { id: options.id, priority: options.priority ?? 100, label: options.label },
    )
    return () => {
      unregister()
    }
  }, [active, options.id, options.priority, options.label])
}

/**
 * Global listener for document-level horizontal left-to-right back-swipe gestures (works even inside portalled modals)
 * and browser `popstate` events.
 */
export function useGlobalBackNavigation(fallbackBack: () => boolean): void {
  const fallbackRef = useRef(fallbackBack)
  fallbackRef.current = fallbackBack

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Ensure a guard history entry exists so an edge back-swipe never accidentally exits the PWA
    try {
      if (!window.history.state || !window.history.state.kringRootGuard) {
        window.history.replaceState({ ...(window.history.state ?? {}), kringRootGuard: true }, '')
      }
    } catch {
      // ignore
    }

    const onPopState = () => {
      if (suppressPopCount > 0) {
        suppressPopCount = Math.max(0, suppressPopCount - 1)
        return
      }
      if (popTopBackEntry()) {
        return
      }
      const handled = fallbackRef.current()
      if (handled) {
        try {
          window.history.pushState({ kringRootGuard: true }, '')
        } catch {
          // ignore
        }
      }
    }

    let touchStart: { x: number; y: number; t: number; blocked: boolean } | null = null

    const isHorizontallyScrollableTarget = (el: HTMLElement | null, startX: number): boolean => {
      // Left-edge swipe (first 28px from screen edge) always acts as system/app back-swipe
      if (startX <= 28) return false
      let cur: HTMLElement | null = el
      while (cur && cur !== document.body) {
        if (cur.dataset?.horizontalScroll === 'true' || cur.dataset?.noBackSwipe === 'true') {
          return true
        }
        const tag = cur.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || cur.getAttribute('role') === 'slider') {
          return true
        }
        try {
          const style = window.getComputedStyle(cur)
          const ox = style.overflowX
          if ((ox === 'auto' || ox === 'scroll') && cur.scrollWidth > cur.clientWidth + 8 && cur.scrollLeft > 4) {
            return true
          }
        } catch {
          // ignore
        }
        cur = cur.parentElement
      }
      return false
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchStart = null
        return
      }
      const t = e.touches[0]
      if (!t) return
      const target = e.target as HTMLElement | null
      touchStart = {
        x: t.clientX,
        y: t.clientY,
        t: Date.now(),
        blocked: isHorizontallyScrollableTarget(target, t.clientX),
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart || touchStart.blocked) {
        touchStart = null
        return
      }
      const start = touchStart
      touchStart = null
      const t = e.changedTouches[0]
      if (!t) return

      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const elapsed = Date.now() - start.t

      // Left-to-right horizontal back swipe:
      // Must move right by >= 64px, within 650ms, and be predominantly horizontal (|dx| > |dy| * 2.1)
      if (elapsed <= 650 && dx >= 64 && Math.abs(dx) > Math.abs(dy) * 2.1) {
        if (popTopBackEntry()) {
          return
        }
        fallbackRef.current()
      }
    }

    window.addEventListener('popstate', onPopState)
    document.addEventListener('touchstart', onTouchStart, { passive: true, capture: true })
    document.addEventListener('touchend', onTouchEnd, { passive: true, capture: true })

    return () => {
      window.removeEventListener('popstate', onPopState)
      document.removeEventListener('touchstart', onTouchStart, { capture: true })
      document.removeEventListener('touchend', onTouchEnd, { capture: true })
    }
  }, [])
}
