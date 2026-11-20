/**
 * 0182 (20 Nov) share-link open beacon. /r/<short> sends a visitor to /app/?reel=…&so=<open id> and stores the open as 'pending'.
 * It only earns the Reel owner Rings once a real browser has shown the page: after 2 seconds of VISIBLE time (a hidden tab or a
 * link-preview fetcher never gets there) this posts once to /r/ok, which checks cookie, network, phone id and burst rules.
 * The open id is read when this module loads, before the app tidies the address bar.
 */
import { kr8DeviceId } from './deviceId';

export const BEACON_MS = 2000;

export function openIdFrom(search: string): string | null {
  try { const v = new URLSearchParams(search).get('so'); return v && /^[0-9a-f-]{36}$/.test(v) ? v : null; } catch { return null; }
}

const SO: string | null = typeof location !== 'undefined' ? openIdFrom(location.search) : null;

type Doc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;

/** Calls send() once, after `need` ms of visible time. Returns a stop function. */
export function afterVisible(doc: Doc, need: number, send: () => void, now: () => number = () => Date.now()): () => void {
  let total = 0, since = doc.visibilityState === 'visible' ? now() : 0, timer: ReturnType<typeof setTimeout> | null = null, fired = false;
  const stop = () => { if (timer) clearTimeout(timer); timer = null; doc.removeEventListener('visibilitychange', onVis); };
  const fire = () => { if (fired) return; fired = true; stop(); send(); };
  const arm = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { total += now() - since; since = now(); if (total >= need) fire(); else arm(); }, Math.max(50, need - total)); };
  function onVis() {
    if (doc.visibilityState === 'visible') { since = now(); arm(); }
    else { if (since) total += now() - since; since = 0; if (timer) clearTimeout(timer); timer = null; }
  }
  doc.addEventListener('visibilitychange', onVis);
  if (since) arm();
  return stop;
}

/** Starts the beacon for this page load (once per open id). Safe to call more than once. */
let started = false;
export function startOpenBeacon(): void {
  if (started || !SO || typeof document === 'undefined') return;
  started = true;
  try { if (sessionStorage.getItem(`kr8_so_${SO}`)) return; } catch { /* private mode */ }
  const t0 = Date.now();
  afterVisible(document, BEACON_MS, () => {
    try { sessionStorage.setItem(`kr8_so_${SO}`, '1'); } catch { /* private mode */ }
    const nav = navigator as Navigator & { webdriver?: boolean };
    const body = JSON.stringify({
      o: SO, d: kr8DeviceId() || null, wd: nav.webdriver ? 1 : 0, v: Date.now() - t0 >= BEACON_MS ? BEACON_MS : 0,
      tz: (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } })(),
      sw: typeof screen !== 'undefined' ? screen.width : 0, t: typeof navigator !== 'undefined' && (navigator.maxTouchPoints || 0) > 0 ? 1 : 0,
    });
    try {
      void fetch('/r/ok', { method: 'POST', body, credentials: 'same-origin', keepalive: true, headers: { 'Content-Type': 'application/json' } }).catch(() => undefined);
    } catch { /* never block the app */ }
  });
}
