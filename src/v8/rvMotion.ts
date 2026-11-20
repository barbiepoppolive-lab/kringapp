/**
 * Revamp Phase 1 (20 Nov, ChatGPT motion table) — tiny, dependency-free motion helpers.
 *  · "Open profile → smooth image transition": the People card photo remembers where it was; the profile hero photo
 *    animates FROM that rectangle into place (FLIP, transform + opacity only, 380 ms). Skipped for reduced motion.
 *  · "Claim Rings → briefly expand and settle": rvSettle(el) plays a one-off scale pulse.
 */
let from: { r: DOMRect; img: string; at: number } | null = null;

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

/** Call on the card photo element right before opening the profile. */
export function rvHeroFrom(el: Element | null, img: string) {
  if (!el) return;
  from = { r: el.getBoundingClientRect(), img, at: Date.now() };
}

/** Call once the profile hero photo is on screen. Plays only when a card was tapped within the last 2 s. */
export function rvHeroIn(el: HTMLElement | null) {
  const f = from;
  from = null;
  if (!el || !f || Date.now() - f.at > 2000 || reduced() || typeof el.animate !== 'function') return;
  const to = el.getBoundingClientRect();
  if (!to.width || !to.height) return;
  const sx = f.r.width / to.width, sy = f.r.height / to.height;
  const dx = f.r.left - to.left, dy = f.r.top - to.top;
  el.animate(
    [
      { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`, borderRadius: '18px', opacity: 0.9 },
      { transformOrigin: '0 0', transform: 'none', borderRadius: '28px', opacity: 1 },
    ],
    { duration: 380, easing: 'cubic-bezier(.22,1,.36,1)' },
  );
}

/** Rings balance: expand briefly, then settle. */
export function rvSettle(el: HTMLElement | null) {
  if (!el || reduced() || typeof el.animate !== 'function') return;
  el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.08)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 520, easing: 'cubic-bezier(.22,1,.36,1)' });
}
