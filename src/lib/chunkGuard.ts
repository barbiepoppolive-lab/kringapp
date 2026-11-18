/**
 * Stale-tab chunk guard (18 Nov, Sentry KRING-WEB-4 / KRING-WEB-2): a tab opened before a deploy asks for a code chunk
 * that the new build no longer has ("Failed to fetch dynamically imported module", Safari "Importing a module script
 * failed"). The fix is a fresh page load. This reloads once, silently, and never loops: at most one reload per 60 s,
 * remembered in sessionStorage (and in memory when storage is blocked). Installed first thing by the app and admin entries.
 * Sentry drops these errors while a reload is under way (lib/sentry.ts beforeSend) and logs a breadcrumb after it.
 */
export const CHUNK_RELOAD_KEY = 'kr8_chunk_reload_at';
export const CHUNK_RELOAD_GAP_MS = 60_000;
const CHUNK_RE = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError|Loading (CSS )?chunk \S+ failed/i;

export function isChunkError(x: unknown): boolean {
  if (!x) return false;
  if (typeof x === 'string') return CHUNK_RE.test(x);
  const e = x as { name?: unknown; message?: unknown };
  return (typeof e.name === 'string' && e.name === 'ChunkLoadError') || (typeof e.message === 'string' && CHUNK_RE.test(e.message));
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;
export interface GuardDeps { now: () => number; store: () => Store | null; reload: () => void }

/** Pure-ish core so the loop protection can be tested: returns true when it reloaded. */
export function makeReloadOnce(d: GuardDeps) {
  let memAt = 0;
  let reloading = false;
  const fn = (): boolean => {
    if (reloading) return true;
    const t = d.now();
    let last = memAt;
    let s: Store | null = null;
    try { s = d.store(); const v = Number(s?.getItem(CHUNK_RELOAD_KEY) || 0); if (v > last) last = v; } catch { s = null; }
    if (last && t - last < CHUNK_RELOAD_GAP_MS) return false;    // reloaded a moment ago and it failed again: stop, no loop
    memAt = t;
    try { s?.setItem(CHUNK_RELOAD_KEY, String(t)); } catch { /* storage full or blocked: the in-memory flag still guards */ }
    reloading = true;
    d.reload();
    return true;
  };
  fn.reloading = () => reloading;
  return fn;
}

let active: (ReturnType<typeof makeReloadOnce>) | null = null;
/** True while the guard has asked the browser for a fresh load (Sentry drops chunk errors then). */
export const chunkReloadPending = (): boolean => !!active?.reloading();

/** Time of the last guard reload in this tab, if it was within the last 60 s (read once by lib/sentry.ts for a breadcrumb). */
export function recentChunkReload(now = Date.now()): number | null {
  try {
    const v = Number(sessionStorage.getItem(CHUNK_RELOAD_KEY) || 0);
    return v && now - v < CHUNK_RELOAD_GAP_MS ? v : null;
  } catch { return null; }
}

export function installChunkGuard(): void {
  if (typeof window === 'undefined' || active) return;
  const once = makeReloadOnce({
    now: () => Date.now(),
    store: () => window.sessionStorage,
    reload: () => window.location.reload(),
  });
  active = once;
  window.addEventListener('vite:preloadError', (e: Event) => { if (once()) e.preventDefault(); });
  window.addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => { if (isChunkError(e.reason) && once()) e.preventDefault(); });
  window.addEventListener('error', (e: ErrorEvent) => { if ((isChunkError(e.error) || isChunkError(e.message)) && once()) e.preventDefault(); });
}
