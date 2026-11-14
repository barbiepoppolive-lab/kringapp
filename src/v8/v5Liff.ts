/**
 * LIFF one-tap sign-in (LINE Front-end Framework). Share https://liff.line.me/<LIFF_ID>?ref=pich (lineEnv.liffUrl):
 * from Instagram / TikTok / Chrome / Safari it opens the LINE app, LINE shows its own permission screen once, and Kring
 * opens inside LINE already signed in. The LINE ID token goes to the `line-auth` Edge Function (LIFF path), which
 * returns the same one-time token_hash as the web login; verifyOtp turns it into a normal Supabase session.
 *
 * Only loaded when the build has VITE_LIFF_ID (KringAppV8 imports this file behind that check), and only does
 * anything in a LIFF context, so an empty VITE_LIFF_ID build behaves exactly as before. @line/liff is lazy-loaded.
 */
import { appBase, liffId, liffOn } from './lineEnv';
import { LINE_PREFILL_KEY, V5Error, v5CaptureAttribution, v5Client, v5Session, v5StoredRef } from './v5Live';

const RETRY_KEY = 'kr8_liff_retry';
const CTX_KEY = 'kr8_liff_ctx';
const REF_RE = /^[a-z0-9_-]{3,40}$/;

/** The query LIFF carries in ?liff.state= ("/path?ref=pich" or "?ref=pich"), as "?ref=pich", or ''. */
export function liffStateQuery(search: string): string {
  let st = '';
  try { st = new URLSearchParams(search).get('liff.state') || ''; } catch { return ''; }
  for (let i = 0; i < 2 && /%[0-9A-Fa-f]{2}/.test(st) && !st.includes('?'); i++) {
    try { st = decodeURIComponent(st); } catch { break; }   // some launchers double-encode
  }
  const q = st.indexOf('?');
  return q >= 0 ? st.slice(q).split('#')[0] : '';
}
/** Recruiter code from ?ref= or from LIFF's ?liff.state= (lower-case, validated), or ''. */
export function liffRefFromUrl(search: string): string {
  for (const s of [search, liffStateQuery(search)]) {
    try {
      const r = (new URLSearchParams(s).get('ref') || '').toLowerCase();
      if (REF_RE.test(r)) return r;
    } catch { /* ignore */ }
  }
  return '';
}
/** Opened through liff.line.me (first hop, or back from liff.login), or running in the LIFF browser inside LINE. */
export function liffContext(search: string, referrer: string, ua: string): boolean {
  let q: URLSearchParams;
  try { q = new URLSearchParams(search); } catch { q = new URLSearchParams(); }
  let hop = false;   // the LIFF SDK's own hop (?liff.state= → real page) keeps us in the LIFF flow
  try { hop = sessionStorage.getItem(CTX_KEY) === '1'; } catch { /* private mode */ }
  return q.has('liff.state') || q.has('liffClientId') || q.has('liffRedirectUri') || /^https:\/\/liff\.line\.me\//.test(referrer) || /[?&]liff\.state=/.test(referrer) || hop || /\bLIFF\b/.test(ua);
}
/** Where liff.login sends the member back: this page minus LIFF/OAuth params, with ?ref kept (redirectUri must sit under the endpoint URL). */
export function liffReturnUrl(href: string, ref: string): string {
  const u = new URL(href);
  const inner = liffStateQuery(u.search);
  for (const k of ['liff.state', 'liff.referrer', 'liffClientId', 'liffRedirectUri', 'code', 'state', 'error', 'error_description', 'friendship_status_changed']) u.searchParams.delete(k);
  if (inner) new URLSearchParams(inner).forEach((v, k) => { if (!u.searchParams.has(k)) u.searchParams.set(k, v); });
  if (ref && REF_RE.test(ref) && !u.searchParams.get('ref')) u.searchParams.set('ref', ref);
  if (!u.pathname.startsWith(appBase())) u.pathname = appBase();
  u.hash = '';
  return u.toString();
}

export type LiffBoot = 'off' | 'redirect' | 'had-session' | 'signed-in';
type LiffLike = {
  init(c: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  isInClient(): boolean;
  login(c?: { redirectUri?: string }): void;
  logout(): void;
  getIDToken(): string | null;
};
const loadLiff = async (): Promise<LiffLike> => (await import('@line/liff')).default as unknown as LiffLike;

/**
 * Run before the app reads its Supabase session. 'redirect' = the page is leaving (LIFF hop or LINE login);
 * 'signed-in' = a Supabase session now exists; 'had-session' = already signed in; 'off' = not a LIFF open.
 * Throws V5Error('LINE_FAIL') when LINE or the function refuses (the app then shows the normal join sheet).
 */
export async function v5LiffBoot(load: () => Promise<LiffLike> = loadLiff): Promise<LiffBoot> {
  if (!liffOn() || typeof window === 'undefined') return 'off';
  const loc = window.location;
  if (!liffContext(loc.search, typeof document === 'undefined' ? '' : document.referrer, typeof navigator === 'undefined' ? '' : navigator.userAgent)) return 'off';
  // 1. recruiter code first, before anything can leave the page (same first-seen rule as ?ref=)
  v5CaptureAttribution(loc.search);
  const inner = liffStateQuery(loc.search);
  if (inner) v5CaptureAttribution(inner);
  const ref = v5StoredRef() || liffRefFromUrl(loc.search);
  const back = liffReturnUrl(loc.href, ref);
  try { sessionStorage.setItem(CTX_KEY, '1'); } catch { /* private mode */ }

  // 2. LIFF SDK (its secondary redirect turns ?liff.state= into the real page)
  const liff = await load();
  await liff.init({ liffId: liffId() });
  if (new URLSearchParams(window.location.search).has('liff.state')) return 'redirect';
  if (await v5Session().catch(() => null)) {
    try { sessionStorage.removeItem(CTX_KEY); } catch { /* ignore */ }
    return 'had-session';
  }
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: back });   // outside LINE: LINE login page; inside LINE this never happens
    return 'redirect';
  }

  // 3. LINE ID token → line-auth (LIFF path) → one-time hash → Supabase session
  const idToken = liff.getIDToken();
  const c = await v5Client();
  const res = idToken ? await c.functions.invoke('line-auth', { body: { liff_id_token: idToken } }).catch(() => ({ data: null, error: new Error('NETWORK') })) : { data: null, error: new Error('NO_TOKEN') };
  const r = res.data as { token_hash?: string; name?: string; picture?: string | null } | null;
  if (res.error || !r?.token_hash) {
    // a stale cached token in an outside browser: log in to LINE again once
    let retried = true;
    try { retried = sessionStorage.getItem(RETRY_KEY) === '1'; sessionStorage.setItem(RETRY_KEY, '1'); } catch { /* private mode */ }
    if (!liff.isInClient() && !retried) {
      liff.logout();
      liff.login({ redirectUri: back });
      return 'redirect';
    }
    throw new V5Error('LINE_FAIL');
  }
  const v = await c.auth.verifyOtp({ token_hash: r.token_hash, type: 'email' });
  if (v.error) throw new V5Error('LINE_FAIL');
  try { sessionStorage.removeItem(RETRY_KEY); sessionStorage.removeItem(CTX_KEY); } catch { /* ignore */ }
  try { localStorage.setItem(LINE_PREFILL_KEY, JSON.stringify({ name: r.name || '', picture: r.picture || null })); } catch { /* private mode */ }
  // clean LIFF leftovers out of the address bar, keep ?ref and the rest
  try { window.history.replaceState(null, '', liffReturnUrl(window.location.href, '')); } catch { /* ignore */ }
  return 'signed-in';
}
