/**
 * Reel trim (16 Nov): a phone clip longer than 60 s (up to 10 min) opens a trim step instead of being refused.
 * The member picks one 5–60 s window; only that window is cut and uploaded (prepareReel). Pure maths here, no DOM.
 */
export const TRIM_MIN_MS = 5000;
export const TRIM_MAX_MS = 60000;
/** Longest clip the trim step takes (about 10 minutes). Longer clips still get "too long". */
export const TRIM_SOURCE_MAX_MS = 10 * 60_000;

export interface TrimWindow { startMs: number; endMs: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const r = (n: number) => Math.round(n);

/** The first window: the first 60 s (or the whole clip when it is shorter). */
export function initialWindow(fullMs: number): TrimWindow {
  return { startMs: 0, endMs: r(Math.min(fullMs, TRIM_MAX_MS)) };
}

export const windowMs = (w: TrimWindow) => w.endMs - w.startMs;

/** Keeps a window inside the clip and 5–60 s long (start wins over end when they fight). */
export function normalize(w: TrimWindow, fullMs: number): TrimWindow {
  const min = Math.min(TRIM_MIN_MS, fullMs);
  let startMs = clamp(w.startMs, 0, Math.max(0, fullMs - min));
  let endMs = clamp(w.endMs, startMs + min, Math.min(fullMs, startMs + TRIM_MAX_MS));
  if (endMs - startMs < min) startMs = Math.max(0, endMs - min);
  return { startMs: r(startMs), endMs: r(endMs) };
}

/** Drag the whole window: same length, slides along the clip, stops at both ends. */
export function moveWindow(w: TrimWindow, deltaMs: number, fullMs: number): TrimWindow {
  const len = windowMs(w);
  const startMs = clamp(w.startMs + deltaMs, 0, Math.max(0, fullMs - len));
  return { startMs: r(startMs), endMs: r(startMs + len) };
}

/** Drag the start handle: end stays put; the window stays 5–60 s. */
export function setStart(w: TrimWindow, startMs: number, fullMs: number): TrimWindow {
  const lo = Math.max(0, w.endMs - TRIM_MAX_MS), hi = w.endMs - Math.min(TRIM_MIN_MS, fullMs);
  return { startMs: r(clamp(startMs, lo, Math.max(lo, hi))), endMs: w.endMs };
}

/** Drag the end handle: start stays put; the window stays 5–60 s. */
export function setEnd(w: TrimWindow, endMs: number, fullMs: number): TrimWindow {
  const lo = w.startMs + Math.min(TRIM_MIN_MS, fullMs), hi = Math.min(fullMs, w.startMs + TRIM_MAX_MS);
  return { startMs: w.startMs, endMs: r(clamp(endMs, lo, Math.max(lo, hi))) };
}

/** Pixels on the strip ↔ ms in the clip. */
export const msToPct = (ms: number, fullMs: number) => (fullMs > 0 ? clamp((ms / fullMs) * 100, 0, 100) : 0);
export const pxToMs = (px: number, stripPx: number, fullMs: number) => (stripPx > 0 ? (px / stripPx) * fullMs : 0);

/** 0:42 · 1:15 · 10:00 (m:ss, rounded to the nearest second). */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Times (ms) of the thumbnails on the strip: the middle of each of n equal slices. */
export function thumbTimes(fullMs: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => r(((i + 0.5) / n) * fullMs));
}

/** Where the looping preview should be: jump back to the start when it runs past the end (or sits before the start). */
export function loopTarget(currentMs: number, w: TrimWindow): number | null {
  return currentMs < w.startMs - 250 || currentMs >= w.endMs - 30 ? w.startMs : null;
}
