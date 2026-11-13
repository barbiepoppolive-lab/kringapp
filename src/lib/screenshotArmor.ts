/**
 * UX-P5 · Founder rule 3 — passive anti-screenshot armor (best effort in a PWA).
 *  • context-menu / long-press save is blocked on protected media (host photos, stories, chat photos, Lucky games)
 *  • the whole app is blurred (24 px) the instant the tab is hidden or the window loses focus, unblurred on focus
 *  • CSS (index.css §armor) adds -webkit-touch-callout:none / user-select:none / -webkit-user-drag:none on media
 * No network, no storage. Returns a cleanup function.
 */

export const ARMOR_ATTR = 'data-armor'
// Media only — never inputs (a wildcard on "photo"/"story" test ids broke paste in caption fields)
export const PROTECTED_SELECTOR = 'img, video, canvas, picture, [data-protected], .ux-host-photo, [data-testid="host-photo"], [data-testid^="lucky-"]'

export function setArmorBlur(on: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (on) root.setAttribute(ARMOR_ATTR, 'blur')
  else root.removeAttribute(ARMOR_ATTR)
}

export function installScreenshotArmor(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {}

  const onContextMenu = (e: Event) => {
    const target = e.target as Element | null
    if (!target || typeof target.closest !== 'function') return
    if (target.closest('input, textarea, [contenteditable="true"]')) return
    if (target.closest(PROTECTED_SELECTOR)) e.preventDefault()
  }
  const onDragStart = (e: Event) => {
    const target = e.target as Element | null
    if (target && typeof target.closest === 'function' && target.closest('img, video, [data-protected]')) e.preventDefault()
  }
  let blurTimer = 0
  const onVisibility = () => setArmorBlur(document.visibilityState === 'hidden')
  // iOS fires window.blur for the camera/file picker, <select>, and payment iframes while the page stays visible,
  // and `focus` is not guaranteed on return — so blur only if focus is really gone, and always clear on touch.
  const onBlur = () => {
    window.clearTimeout(blurTimer)
    blurTimer = window.setTimeout(() => {
      if (!document.hasFocus() && document.visibilityState === 'visible') setArmorBlur(true)
    }, 300)
  }
  const onFocus = () => {
    window.clearTimeout(blurTimer)
    setArmorBlur(false)
  }
  const onPointerDown = () => {
    if (document.visibilityState === 'visible') setArmorBlur(false)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    // Desktop PrintScreen / ⌘⇧3-4-5: blur for a beat so the capture is useless (e.code — Shift changes e.key)
    const isPrint = e.key === 'PrintScreen' || (e.metaKey && e.shiftKey && ['Digit3', 'Digit4', 'Digit5'].includes(e.code))
    if (isPrint) {
      setArmorBlur(true)
      window.setTimeout(() => {
        if (document.hasFocus() && document.visibilityState === 'visible') setArmorBlur(false)
      }, 900)
    }
  }

  document.addEventListener('contextmenu', onContextMenu, true)
  document.addEventListener('dragstart', onDragStart, true)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  window.addEventListener('pointerdown', onPointerDown, true)
  window.addEventListener('keydown', onKeyDown, true)

  return () => {
    document.removeEventListener('contextmenu', onContextMenu, true)
    document.removeEventListener('dragstart', onDragStart, true)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('blur', onBlur)
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('pointerdown', onPointerDown, true)
    window.removeEventListener('keydown', onKeyDown, true)
    window.clearTimeout(blurTimer)
    setArmorBlur(false)
  }
}

/** Short, non-reversible-looking guest tag for the watermark: `#G-7F3A` */
export function guestWatermarkId(userId: string | undefined | null): string {
  const src = (userId ?? 'guest').toString()
  let h = 5381
  for (let i = 0; i < src.length; i++) h = ((h << 5) + h + src.charCodeAt(i)) >>> 0
  return `#G-${h.toString(16).toUpperCase().padStart(8, '0').slice(-6)}`
}
