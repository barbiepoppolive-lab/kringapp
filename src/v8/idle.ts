/**
 * K-006 speed fix (18 Nov): heavy work that is not needed for the first screen (the card-photo face check downloads face-api,
 * 1.3 MB + a 194 KB model, and runs it on the phone) waits until the page has finished loading, a short pause has passed,
 * and the phone is idle. Returns a cancel function. Without requestIdleCallback (iPhone Safari) a short timer stands in.
 */
type Ric = (cb: () => void, opts?: { timeout: number }) => number;
export function afterStartIdle(fn: () => void, minDelayMs = 0, idleTimeoutMs = 3000): () => void {
  if (typeof window === 'undefined') { fn(); return () => undefined; }
  let cancelled = false;
  let timer = 0;
  let idleId = 0;
  const w = window as unknown as { requestIdleCallback?: Ric; cancelIdleCallback?: (id: number) => void };
  const run = () => { if (!cancelled) fn(); };
  const idle = () => {
    if (cancelled) return;
    if (w.requestIdleCallback) idleId = w.requestIdleCallback(run, { timeout: idleTimeoutMs });
    else timer = window.setTimeout(run, 120);
  };
  const start = () => { if (!cancelled) timer = window.setTimeout(idle, minDelayMs); };
  if (typeof document === 'undefined' || document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (idleId && w.cancelIdleCallback) w.cancelIdleCallback(idleId);
    window.removeEventListener('load', start);
  };
}
