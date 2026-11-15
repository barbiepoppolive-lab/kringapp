/**
 * J1 (15 Nov): an installed app left open for days keeps running old code. The build writes /app/version.json
 * (served no-cache); this compares it with the version baked into the bundle when the app comes back to the screen
 * and every 30 minutes. Coming back from the background with nothing in progress → reload at once (nobody is mid-action);
 * while the member is using the app → a small "อัปเดตใหม่ · แตะเพื่อรีเฟรช" chip instead.
 * Also: if a code chunk from an old build fails to load, reload once (old index + new deploy).
 */
declare const __KR8_RELEASE__: string;
export const APP_RELEASE = typeof __KR8_RELEASE__ === 'string' ? __KR8_RELEASE__ : 'dev';
const RELOAD_KEY = 'kr8_chunk_reload';

export async function latestRelease(base: string, f: typeof fetch = fetch): Promise<string | null> {
  try {
    const r = await f(`${base}version.json?t=${Date.now()}`, { cache: 'no-store', credentials: 'omit' });
    if (!r.ok) return null;
    const j = (await r.json()) as { v?: unknown };
    return typeof j.v === 'string' ? j.v : null;
  } catch { return null; }
}
/** Pure: what to do with a version we just read. */
export function versionAction(current: string, latest: string | null, resumed: boolean, busy: boolean): 'none' | 'reload' | 'chip' {
  if (!latest || current === 'dev' || latest === current) return 'none';
  return resumed && !busy ? 'reload' : 'chip';
}
const typing = () => { const a = document.activeElement as HTMLElement | null; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };

export function installVersionWatch(base: string, isBusy: () => boolean, onChip: () => void): () => void {
  let dead = false;
  const check = async (resumed: boolean) => {
    const v = await latestRelease(base);
    if (dead) return;
    const a = versionAction(APP_RELEASE, v, resumed, isBusy() || typing());
    if (a === 'reload') location.reload();
    else if (a === 'chip') onChip();
  };
  const vis = () => { if (document.visibilityState === 'visible') void check(true); };
  document.addEventListener('visibilitychange', vis);
  const t = setInterval(() => { if (document.visibilityState === 'visible') void check(false); }, 30 * 60_000);
  const reloadOnce = () => {
    try { if (sessionStorage.getItem(RELOAD_KEY) === APP_RELEASE) return false; sessionStorage.setItem(RELOAD_KEY, APP_RELEASE); } catch { return false; }
    location.reload();
    return true;
  };
  const pre = (e: Event) => { if (reloadOnce()) e.preventDefault(); };
  const rej = (e: PromiseRejectionEvent) => {
    const m = String((e.reason as Error)?.message || e.reason || '');
    if (/Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk/i.test(m)) reloadOnce();
  };
  window.addEventListener('vite:preloadError', pre);
  window.addEventListener('unhandledrejection', rej);
  return () => { dead = true; document.removeEventListener('visibilitychange', vis); clearInterval(t); window.removeEventListener('vite:preloadError', pre); window.removeEventListener('unhandledrejection', rej); };
}
