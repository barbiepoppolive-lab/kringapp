/**
 * F (15 Nov): pinching a Reel on Android left the whole app zoomed in. Like TikTok / IG, Reels never zoom the page:
 * 1. CSS touch-action: pan-x pan-y on the feed, the full-screen player, the place viewer and every <video> (v8.css),
 *    so a pinch there scrolls nothing and zooms nothing; the rest of the app (cards, text, settings) can still be zoomed.
 * 2. Safety net: if the page still ends up zoomed after a touch on a Reel (older browsers, two fingers landing on
 *    different areas), the viewport snaps back to 100% by briefly adding maximum-scale=1 to the viewport meta.
 *    Android's "Force enable zoom" accessibility setting still wins over this, as it should.
 */
export const REEL_ZONE = '#s-feed, .go-player, .kx-viewer, .reel-preview-video, video';

export function installZoomGuard(win: Window = window): () => void {
  const vv = win.visualViewport;
  const meta = win.document.querySelector('meta[name="viewport"]');
  if (!vv || !meta) return () => undefined;
  const base = meta.getAttribute('content') || 'width=device-width, initial-scale=1.0, viewport-fit=cover';
  let onReel = false;
  let t: ReturnType<typeof setTimeout> | undefined;
  const start = (e: TouchEvent) => {
    const el = e.target as Element | null;
    if (e.touches.length === 1) onReel = !!el?.closest?.(REEL_ZONE);
    else if (el?.closest?.(REEL_ZONE)) onReel = true;
  };
  const end = (e: TouchEvent) => {
    if (e.touches.length || !onReel || vv.scale <= 1.01) return;
    meta.setAttribute('content', `${base.replace(/,\s*maximum-scale=[^,]*/g, '')}, maximum-scale=1`);
    clearTimeout(t);
    t = setTimeout(() => meta.setAttribute('content', base), 350);
  };
  win.addEventListener('touchstart', start, { passive: true, capture: true });
  win.addEventListener('touchend', end, { passive: true, capture: true });
  win.addEventListener('touchcancel', end, { passive: true, capture: true });
  return () => {
    win.removeEventListener('touchstart', start, { capture: true });
    win.removeEventListener('touchend', end, { capture: true });
    win.removeEventListener('touchcancel', end, { capture: true });
    clearTimeout(t);
  };
}
