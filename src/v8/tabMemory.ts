/**
 * 17 Nov (real-phone audit): a browser refresh keeps the member on the tab they were on.
 * The tab is kept for this browser tab only (sessionStorage), so a fresh visit still opens on the Feed.
 * Deep links (?tab=, ?reel=, ?deal=, ?person=, ?post=) always win over the remembered tab.
 */
export type MemTab = 'feed' | 'people' | 'deals' | 'me';
const KEY = 'kr8-tab';
const TABS: MemTab[] = ['feed', 'people', 'deals', 'me'];
const DEEP = ['tab', 'reel', 'deal', 'person', 'post', 'me'];   // me=ghost: founder bookmark always opens the Feed

export const isMemTab = (t: unknown): t is MemTab => typeof t === 'string' && (TABS as string[]).includes(t);

/** The tab to open on: a deep link decides first (returns null so the deep-link code sets it), then the remembered tab. */
export function restoredTab(search: string): MemTab | null {
  try {
    const q = new URLSearchParams(search);
    if (DEEP.some((k) => q.has(k))) return null;
  } catch { /* bad query: ignore */ }
  try {
    const t = window.sessionStorage.getItem(KEY);
    return isMemTab(t) ? t : null;
  } catch { return null; }
}

export function rememberTab(t: MemTab): void {
  try { window.sessionStorage.setItem(KEY, t); } catch { /* storage blocked: refresh opens the Feed, as before */ }
}
