/**
 * Kring V5 live layer: real Supabase sign-in (Google + email code), member cards, hellos + chat, posts, treats, block/report, PDPA.
 * Everything goes through the kr8_* SECURITY DEFINER RPCs from supabase/migrations/0022 — no direct table writes.
 * Off unless VITE_AUTH_LIVE=1, so the current "Sign-in opens on 1 Dec · join the waitlist" sheet stays the default.
 * supabase-js is lazy-loaded, so the waitlist build never downloads it.
 */
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { initialAvatar, NEUTRAL_IMG } from './v8Data';
import { demoPostAvatar } from './v5DemoAvatars';
import { appBase, lineChannel } from './lineEnv';
import type { V8ChatMessage, V8ChatThread, V8Deal, V8FeedItem, V8HelloRequest, V8Person } from './v8Data';

const ENV = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env || {}) as Record<string, string | undefined>;
export const V5_AUTH_LIVE = ENV.VITE_AUTH_LIVE === '1';
const SUPA_URL = ENV.VITE_SUPABASE_URL || 'https://pedxoxpammnyfnizljyj.supabase.co';
// Public publishable key (already shipped in v8Data); never a service key.
const SUPA_KEY = ENV.VITE_SUPABASE_ANON_KEY || 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';

/**
 * Admin Undo (audit P3-11): the last delayed tap is sent when the page closes. supabase-js cannot mark a request keepalive, so this
 * posts the same RPC straight to PostgREST with keepalive: true (the browser finishes it even after the tab is gone).
 */
export async function v5RpcKeepalive(fn: string, args: Record<string, unknown>): Promise<void> {
  const c = await v5Client();
  const tok = (await c.auth.getSession()).data.session?.access_token;
  await fetch(`${SUPA_URL.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
    method: 'POST', keepalive: true,
    headers: { apikey: SUPA_KEY, Authorization: `Bearer ${tok || SUPA_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
}

/** Areas the database accepts (kr8_area_ok). People and posts are shown by area only, never exact location. */
export const V5_AREAS = ['Bangkok', 'Ari', 'Siam', 'Thonglor', 'Ekkamai', 'Phrom Phong', 'Sukhumvit', 'Silom', 'Sathorn', 'Bang Rak',
  'Riverside', 'Talad Noi', 'Yaowarat', 'Chinatown', 'Old Town', 'Ratchada', 'Chatuchak'] as const;
export const V5_LANGS = ['TH', 'EN', 'ZH', 'HI', 'JA', 'KO', 'FR', 'DE', 'ES', 'RU', 'MS', 'ID', 'VI', 'AR'] as const;
export function v5Area(a?: string | null): string {
  return a && (V5_AREAS as readonly string[]).includes(a) ? a : 'Bangkok';
}

/** Plain brand backdrop for a plan posted without a photo (no stock photo pretending to be the member's). */
export const V5_PLAN_BG =
  "data:image/svg+xml;utf8," +
  encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' width='400' height='700'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#2A2A8C'/><stop offset='1' stop-color='#15131F'/></linearGradient></defs><rect width='400' height='700' fill='url(#g)'/><circle cx='330' cy='120' r='90' fill='#5B6CFF' opacity='0.35'/><circle cx='70' cy='560' r='120' fill='#FF5A6B' opacity='0.18'/></svg>");

let clientP: Promise<SupabaseClient> | null = null;
export function v5Client(): Promise<SupabaseClient> {
  if (!clientP) {
    clientP = import('@supabase/supabase-js').then((m) =>
      m.createClient(SUPA_URL, SUPA_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'kr8-v5-auth' },
      })
    );
  }
  return clientP;
}

/** Public storage object link (Ask a Thai photos and GIFs live in the public kr8-ask bucket, 0057). */
export function v5PublicObjectUrl(bucket: string, path: string): string {
  return viaEdgeUrls(`${SUPA_URL.replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`);
}
/** Error codes the UI turns into friendly 6-language messages. */
export class V5Error extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
function codeOf(e: unknown): string {
  const msg = String((e as { message?: string })?.message ?? e ?? '');
  const m = msg.match(/KR8_([A-Z_]+)/);
  if (m) return m[1];
  if (/failed to fetch|network|load failed|fetch failed|timeout|ERR_INTERNET/i.test(msg)) return 'NETWORK';
  if (/JWT|jwt expired|not authenticated|permission denied/i.test(msg)) return 'SIGN_IN';
  return 'UNKNOWN';
}
async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new V5Error('OFFLINE');
  const c = await v5Client();
  let res;
  try {
    res = await c.rpc(fn, args);
  } catch (e) {
    throw new V5Error(codeOf(e));
  }
  if (res.error) throw new V5Error(codeOf(res.error));
  return viaEdgeUrls(res.data) as T;
}
/** Public bucket photos (partner/venue pictures) are shown through kringapp.com/media/pub/ (Cloudflare cache), never straight
 *  from Supabase storage (16 Nov egress fix). Only on kringapp.com / preview hosts, where that route exists. */
const PUB_PREFIX = `${SUPA_URL.replace(/\/$/, '')}/storage/v1/object/public/`;
const EDGE_HOST = typeof location !== 'undefined' && /(^|\.)kringapp\.com$|\.pages\.dev$/.test(location.hostname);
export function viaEdgeUrls<T>(v: T): T {
  if (!EDGE_HOST || v == null) return v;
  if (typeof v === 'string') return (v.startsWith(PUB_PREFIX) && /^kr8-venue-photos\//.test(v.slice(PUB_PREFIX.length)) ? `/media/pub/${v.slice(PUB_PREFIX.length)}` : v) as T;
  if (Array.isArray(v)) return v.map((x) => viaEdgeUrls(x)) as T;
  if (typeof v === 'object') { const o: Record<string, unknown> = {}; for (const [k, x] of Object.entries(v as Record<string, unknown>)) o[k] = typeof x === 'string' && x.length > 300 ? x : viaEdgeUrls(x); return o as T; }
  return v;
}
/**
 * Supabase egress (16 Nov): member photos are stored inline (data: images up to ~110 KB each) and came back inside every feed,
 * People and inbox response, again on every refresh (the inbox every 5-30 s). Now a photo is downloaded once per phone visit:
 * repeat calls ask PostgREST for every column except the photo ones (?select=...) and reuse the photo already here. A row from
 * someone new, an error, or 15 minutes passing → one normal full call (so a changed photo still shows up).
 */
type PhotoSpec = { id: string; photo: string };
const photoCache = new Map<string, string | null>();
const lastFull: Record<string, number> = {};
const FULL_EVERY_MS = 15 * 60_000;
async function rpcLite<T>(fn: string, args: Record<string, unknown>, cols: string[], specs: PhotoSpec[]): Promise<T[]> {
  const key = (sp: PhotoSpec, r: Record<string, unknown>) => `${fn}:${sp.photo}:${String(r[sp.id] ?? '')}`;
  if (Date.now() - (lastFull[fn] || 0) < FULL_EVERY_MS && !(typeof navigator !== 'undefined' && navigator.onLine === false)) {
    try {
      const c = await v5Client();
      const res = await c.rpc(fn, args).select(cols.filter((x) => !specs.some((sp) => sp.photo === x)).join(','));
      const rows = viaEdgeUrls(res.data || null) as Record<string, unknown>[] | null;
      if (!res.error && Array.isArray(rows) && rows.every((r) => specs.every((sp) => !r[sp.id] || photoCache.has(key(sp, r))))) {
        return rows.map((r) => { const o = { ...r }; for (const sp of specs) o[sp.photo] = r[sp.id] ? photoCache.get(key(sp, r)) ?? null : null; return o as T; });
      }
    } catch { /* fall back to the full call */ }
  }
  const rows = await rpc<T[]>(fn, args);
  lastFull[fn] = Date.now();
  for (const r of (rows || []) as Record<string, unknown>[]) for (const sp of specs) if (r[sp.id]) photoCache.set(key(sp, r), (r[sp.photo] as string | null) ?? null);
  return rows || [];
}
export function v5ErrCode(e: unknown): string {
  return e instanceof V5Error ? e.code : codeOf(e);
}

// ─────────────── auth ───────────────
export async function v5Session(): Promise<Session | null> {
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  return data.session;
}
export async function v5OnAuth(cb: (s: Session | null) => void): Promise<() => void> {
  const c = await v5Client();
  const { data } = c.auth.onAuthStateChange((_ev, s) => cb(s));
  return () => data.subscription.unsubscribe();
}
/** True only when the Supabase project has the Google provider switched on. */
export async function v5GoogleEnabled(): Promise<boolean> {
  try {
    const r = await fetch(`${SUPA_URL}/auth/v1/settings`, { headers: { apikey: SUPA_KEY } });
    if (!r.ok) return false;
    const j = (await r.json()) as { external?: { google?: boolean } };
    return j?.external?.google === true;
  } catch {
    return false;
  }
}
function returnUrl(): string {
  return typeof window === 'undefined' ? '' : window.location.origin + window.location.pathname;
}
/** 'redirect' = browser is leaving for Google; 'GOOGLE_OFF' = provider not switched on yet (use the email code). */
export async function v5SignInGoogle(): Promise<'redirect' | 'GOOGLE_OFF' | 'NETWORK'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'NETWORK';
  if (!(await v5GoogleEnabled())) return 'GOOGLE_OFF';
  const c = await v5Client();
  const { error } = await c.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: returnUrl(), queryParams: { prompt: 'select_account' } } });
  if (error) return /not enabled|unsupported provider|provider is not/i.test(error.message) ? 'GOOGLE_OFF' : 'NETWORK';
  return 'redirect';
}
/** If Google sent the user back with an error (e.g. provider still off), read it once and clean the URL. */
export function v5TakeOAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const all = new URLSearchParams(window.location.search + '&' + window.location.hash.replace(/^#/, ''));
  const desc = all.get('error_description') || all.get('error');
  if (!desc) return null;
  try {
    window.history.replaceState(null, '', returnUrl());
  } catch {
    // ignore
  }
  return /not enabled|unsupported provider/i.test(desc) ? (/line/i.test(desc) ? 'LINE_OFF' : 'GOOGLE_OFF') : 'OAUTH';
}
export async function v5SendCode(email: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new V5Error('OFFLINE');
  const c = await v5Client();
  const { error } = await c.auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true, emailRedirectTo: returnUrl() } });
  if (error) throw new V5Error(error.status === 429 ? 'RATE' : /fetch|network/i.test(error.message) ? 'NETWORK' : 'OTP_SEND');
}
export async function v5VerifyCode(email: string, code: string): Promise<void> {
  const c = await v5Client();
  const { error } = await c.auth.verifyOtp({ email: email.trim().toLowerCase(), token: code.trim(), type: 'email' });
  // Supabase answers "otp_expired" for both a wrong and an old code, so the message covers both
  if (error) throw new V5Error(error.status === 429 ? 'RATE' : /fetch|network/i.test(error.message) ? 'NETWORK' : 'BAD_CODE');
}
// ─────────────── LINE Login (T-205) ───────────────
// LINE web login with PKCE + state + nonce → /app/line-callback.html → Edge Function `line-auth` checks the LINE token
// and returns a one-time token_hash → verifyOtp gives a normal Supabase session. Only shown when the build has
// VITE_LINE_CHANNEL_ID (public; the channel secret lives only in the function).
export const v5LineOn = (): boolean => /^\d{6,12}$/.test(lineChannel());
const LINE_KEY = 'kr8_line_login';
export const LINE_PREFILL_KEY = 'kr8_line_prefill';
export function v5LineCallbackUrl(): string {
  return `${window.location.origin}${appBase()}line-callback.html`;
}
function b64url(bytes: Uint8Array): string {
  let s = '';
  bytes.forEach((b) => { s += String.fromCharCode(b); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
const randomToken = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));
/** 'redirect' = the browser is leaving for LINE; 'LINE_OFF' = this build has no LINE channel (use the email code). */
/** link = true (0066): add LINE to the account that is signed in now (no new account; refused if that LINE is another account). */
export async function v5SignInLine(link = false): Promise<'redirect' | 'LINE_OFF' | 'NETWORK'> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'NETWORK';
  if (!v5LineOn()) return 'LINE_OFF';
  // the recruiter code rides in `state` too ("<random>.<ref>"), so it survives a hand-over to another browser (13 Nov funnel fix)
  let ref = '';
  try { ref = localStorage.getItem('kr8_ref') || ''; } catch { /* private mode */ }
  const state = randomToken(24) + (/^[a-z0-9_-]{3,40}$/.test(ref) ? '.' + ref : ''), nonce = randomToken(24), verifier = randomToken(48);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  // localStorage, not sessionStorage: LINE may hand back to a new tab of the same browser
  localStorage.setItem(LINE_KEY, JSON.stringify({ state, nonce, verifier, back: window.location.pathname + window.location.search, t: Date.now(), ...(link ? { link: true } : {}) }));
  const q = new URLSearchParams({ response_type: 'code', client_id: lineChannel(), redirect_uri: v5LineCallbackUrl(), state, scope: 'openid profile email',
    nonce, code_challenge: challenge, code_challenge_method: 'S256',
    // 16 Nov dings: LINE offers "add Kring as a friend" on the sign-in screen (needs the OA linked to this Login channel),
    // so LINE members can get their dings as LINE messages
    bot_prompt: 'aggressive' });
  window.location.assign(`https://access.line.me/oauth2/v2.1/authorize?${q.toString()}`);
  return 'redirect';
}
/** On /app/line-callback.html: checks state, asks `line-auth`, signs in. Returns where to go next. Throws V5Error codes. */
export async function v5FinishLine(search: string): Promise<string> {
  const q = new URLSearchParams(search);
  let saved: { state?: string; nonce?: string; verifier?: string; back?: string; t?: number; link?: boolean } = {};
  try { saved = JSON.parse(localStorage.getItem(LINE_KEY) || '{}'); } catch { saved = {}; }
  localStorage.removeItem(LINE_KEY);   // one use
  const back = saved.back && saved.back.startsWith(appBase()) ? saved.back : appBase();
  v5RefFromLineState(q.get('state'));   // keep the recruiter code on this phone whatever happens next
  if (q.get('error')) throw new V5Error('LINE_CANCEL');
  const code = q.get('code') || '';
  if (!code || !saved.state || q.get('state') !== saved.state || !saved.t || Date.now() - saved.t > 10 * 60_000) throw new V5Error('LINE_STATE');
  const c = await v5Client();
  if (saved.link) {   // 0066: add LINE to the signed-in account; the function reads who is signed in from the session token
    const { data: s } = await c.auth.getSession();
    if (!s.session) throw new V5Error('SIGN_IN');
    const { data, error } = await c.functions.invoke('line-auth', { body: { link: true, code, redirect_uri: v5LineCallbackUrl(), code_verifier: saved.verifier, nonce: saved.nonce } });
    const r = data as { linked?: boolean; error?: string } | null;
    if (error || !r?.linked) {
      const ctx = (error as { context?: Response } | null)?.context;
      const body = ctx && typeof ctx.json === 'function' ? await ctx.json().catch(() => null) as { error?: string } | null : null;
      throw new V5Error(body?.error === 'LINE_TAKEN' ? 'LINE_TAKEN' : body?.error === 'LINE_OTHER' ? 'LINE_OTHER' : 'LINE_FAIL');
    }
    return back;
  }
  const { data, error } = await c.functions.invoke('line-auth', { body: { code, redirect_uri: v5LineCallbackUrl(), code_verifier: saved.verifier, nonce: saved.nonce } });
  const r = data as { token_hash?: string; name?: string; picture?: string | null } | null;
  if (error || !r?.token_hash) throw new V5Error('LINE_FAIL');
  const v = await c.auth.verifyOtp({ token_hash: r.token_hash, type: 'email' });
  if (v.error) throw new V5Error('LINE_FAIL');
  try { localStorage.setItem(LINE_PREFILL_KEY, JSON.stringify({ name: r.name || '', picture: r.picture || null })); } catch { /* private mode */ }
  return back;
}
/** "<random>.<ref>" → ref; also stores it as this phone's recruiter code if none is stored yet. */
export function v5RefFromLineState(state: string | null): string {
  const m = /\.([a-z0-9_-]{3,40})$/.exec(state || '');
  if (!m) return '';
  try { if (!localStorage.getItem('kr8_ref')) localStorage.setItem('kr8_ref', m[1]); } catch { /* private mode */ }
  return m[1];
}
/** Recruiter code this phone arrived with (?ref=), or ''. */
export function v5StoredRef(): string {
  try { return localStorage.getItem('kr8_ref') || ''; } catch { return ''; }
}
/** Name + picture from LINE for a new member card (read once). */
export function v5TakeLinePrefill(): { name: string; picture: string | null } | null {
  try {
    const raw = localStorage.getItem(LINE_PREFILL_KEY);
    if (!raw) return null;
    localStorage.removeItem(LINE_PREFILL_KEY);
    const j = JSON.parse(raw) as { name?: string; picture?: string | null };
    return { name: (j.name || '').slice(0, 30), picture: j.picture && /^https:\/\//.test(j.picture) ? j.picture : null };
  } catch {
    return null;
  }
}
// ─────────────── phone dings (push, 0059) ───────────────
/** Stores this phone's push subscription for the signed-in member (kr8_push_subscribe: own rows only, push services only). */
export async function v5PushSubscribe(endpoint: string, p256dh: string, auth: string, ua: string): Promise<void> {
  await rpc('kr8_push_subscribe', { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth, p_ua: ua.slice(0, 160) });
}
/** Forgets this phone for the signed-in member (kr8_push_unsubscribe deletes only the member's own row). */
export async function v5PushUnsubscribe(endpoint: string): Promise<void> {
  await rpc('kr8_push_unsubscribe', { p_endpoint: endpoint });
}

// ─────────────── sign-in hand-off to the phone's real browser (0059, /api/handoff) ───────────────
/** A one-time code (3 min, one use) that signs this member in on the page opened in Chrome / Safari. null when signed out. */
export async function v5HandoffCreate(): Promise<string | null> {
  if (!(await v5Session().catch(() => null))) return null;
  const code = await rpc<string>('kr8_handoff_create').catch(() => null);
  return code && /^[0-9a-f]{64}$/.test(code) ? code : null;
}
/** On start: ?ho=<code> (arrived from an in-app browser) → signed in here. The code leaves the address bar at once.
 *  'signed-in' | 'had-session' | 'none' | 'failed' (expired / used: the member just signs in as usual). */
export async function v5HandoffBoot(f: typeof fetch = fetch): Promise<'signed-in' | 'had-session' | 'none' | 'failed'> {
  if (typeof window === 'undefined') return 'none';
  const u = new URL(window.location.href);
  const code = u.searchParams.get('ho');
  if (!code) return 'none';
  u.searchParams.delete('ho');
  u.searchParams.delete('kr_esc');
  try { window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash); } catch { /* ignore */ }
  if (!/^[0-9a-f]{64}$/.test(code)) return 'failed';
  if (await v5Session().catch(() => null)) return 'had-session';
  try {
    const r = await f('/api/handoff', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
    const j = (await r.json().catch(() => null)) as { token_hash?: string } | null;
    if (!r.ok || !j?.token_hash) return 'failed';
    const v = await (await v5Client()).auth.verifyOtp({ token_hash: j.token_hash, type: 'email' });
    return v.error ? 'failed' : 'signed-in';
  } catch {
    return 'failed';
  }
}

export async function v5SignOut(): Promise<void> {
  const c = await v5Client();
  await c.auth.signOut().catch(() => undefined);
}

// ─────────────── member card ───────────────
export interface V5Card {
  first_name: string;
  photo: string | null;
  langs: string[];
  bio: string;
  area: string;
  who: 'local' | 'traveller';
  here_until: string | null;
  verified: boolean;
  ig_handle?: string | null;
  terms_accepted_at?: string | null;
  terms_version?: string | null;
  interests?: string[];
  /** optional, the member's own choice; show_gender = on their card for others */
  gender?: string | null;
  show_gender?: boolean | null;
}
export interface V5Me {
  card: V5Card | null;
  hellos_today: number;
  posts: number;
  answers_today: number;
  blocked: string[];
}
export const v5Me = () => rpc<V5Me>('kr8_me');
// Recruiter link kringapp.com/app/?ref=<code> and channel link ?src=<code> (hostel stand cards, ads). The first code seen
// on this phone is kept (localStorage survives the email-code sign-in) and saved on the member card once.
const ATTR = [
  { q: 'ref', key: 'kr8_ref', re: /^[A-Za-z0-9_-]{3,40}$/, fn: 'kr8_set_ref' },
  { q: 'src', key: 'kr8_src', re: /^[A-Za-z0-9_-]{2,40}$/, fn: 'kr8_set_src' },
] as const;
export function v5CaptureAttribution(search: string) {
  try {
    const qs = new URLSearchParams(search);
    for (const a of ATTR) {
      const v = qs.get(a.q);
      if (v && a.re.test(v) && !localStorage.getItem(a.key)) localStorage.setItem(a.key, v.toLowerCase());
    }
  } catch { /* private mode */ }
}
v5CaptureAttribution(typeof location === 'undefined' ? '' : location.search);
export const v5SetRef = (code: string) => rpc<string>('kr8_set_ref', { p_code: code });
/** Sends stored codes once the member has a card; the server keeps the first one. Never blocks sign-in or the card. */
export async function v5SyncAttribution() {
  for (const a of ATTR) {
    try {
      const v = localStorage.getItem(a.key);
      if (!v || localStorage.getItem(a.key + '_sent') === v) continue;
      await rpc<string | null>(a.fn, { p_code: v });
      localStorage.setItem(a.key + '_sent', v);
    } catch { /* not signed in / no card yet: try again next time */ }
  }
}
export const v5SaveCard = async (c: { first_name: string; langs: string[]; bio: string; area: string; who: 'local' | 'traveller'; photo?: string | null; age_ok: boolean }) => {
  const me = await rpc<V5Me>('kr8_save_card', { p_first_name: c.first_name, p_langs: c.langs, p_bio: c.bio, p_area: v5Area(c.area), p_who: c.who, p_photo: c.photo || null, p_age_ok: c.age_ok });
  await v5SyncAttribution();
  return me;
};
/** Locals-board rewards start (kr8_settings.reward_start_at, D-11NOV-G). Internal date; read once per session. */
export const V5_REWARD_START_FALLBACK = Date.parse('2026-11-17T00:00:00+07:00');   // Q: matches kr8_settings.reward_start_at (17 Nov 2026)
let rewardStartP: Promise<number> | null = null;
export function v5RewardStart(): Promise<number> {
  if (!rewardStartP) {
    rewardStartP = rpc<string>('kr8_reward_start')
      .then((v) => { const t = Date.parse(v); return Number.isFinite(t) ? t : V5_REWARD_START_FALLBACK; })
      .catch(() => { rewardStartP = null; return V5_REWARD_START_FALLBACK; });
  }
  return rewardStartP;
}
export const v5SetHere = (on: boolean) => rpc<void>('kr8_set_here', { p_on: on });

// ─────────────── people / feed / treats ───────────────
interface PersonRow { user_id: string; first_name: string; photo: string | null; langs: string[]; bio: string; area: string; who: 'local' | 'traveller'; here: boolean; verified: boolean }
export async function v5People(): Promise<V8Person[]> {
  const rows = await rpcLite<PersonRow>('kr8_people', { p_limit: 60 }, ['user_id', 'first_name', 'photo', 'langs', 'bio', 'area', 'who', 'here', 'verified'], [{ id: 'user_id', photo: 'photo' }]);
  return (rows || []).map((r) => ({
    id: r.user_id,
    name: r.first_name,
    langs: (r.langs || []).join(' · '),
    langCodes: r.langs || [],
    who: r.who,
    online: r.here === true,
    verified: r.verified === true, // only ever true when the team set it
    img: r.photo || NEUTRAL_IMG,
    hook: r.bio || '',
    tags: '',
    area: r.area,
    here: r.here === true,
  }));
}
interface FeedRow { id: string; kind: 'photo' | 'plan' | 'ask' | 'reel'; area: string; body: string; photo: string | null; event_id: string | null; here: boolean; created_at: string;
  video_path?: string | null; poster_path?: string | null; reel_status?: 'pending' | 'approved' | null;
  author_id: string | null; author_name: string; author_photo: string | null; author_langs: string[]; author_who: string; mine: boolean | null;
  answers: { id: string; body: string; name: string; who: string; photo: string | null }[]
  likes?: number | null; liked?: boolean | null; saved?: boolean | null; views?: number | null; ig_handle?: string | null;
  venue_id?: string | null; venue_name?: string | null; venue_name_th?: string | null; deal_id?: string | null; deal_en?: string | null; deal_th?: string | null }
const FEED_COLS = ['id', 'kind', 'area', 'body', 'photo', 'event_id', 'here', 'created_at', 'video_path', 'poster_path', 'reel_status', 'author_id', 'author_name',
  'author_photo', 'author_langs', 'author_who', 'mine', 'answers', 'likes', 'liked', 'saved', 'views', 'ig_handle', 'venue_id', 'venue_name', 'venue_name_th', 'deal_id',
  'deal_en', 'deal_th'];
export type V5FeedItem = V8FeedItem & { authorId?: string; mine?: boolean; v5Kind?: 'photo' | 'plan' | 'ask' | 'reel'; eventId?: string };
/** 16 Nov perf: two callers at start-up asked for the feed at the same moment (two feed calls, two signing calls); they now share one. */
let feedInFlight: Promise<V5FeedItem[]> | null = null;
export function v5Feed(): Promise<V5FeedItem[]> {
  if (!feedInFlight) feedInFlight = v5FeedOnce().finally(() => { setTimeout(() => { feedInFlight = null; }, 0); });
  return feedInFlight;
}
/** index.html asks for the feed the moment the page starts (16 Nov perf 2): on kringapp.com it is /feed0, the visitor feed with
 *  every Reel link already signed, from the Cloudflare edge. Elsewhere (local) it is the plain kr8_feed call for signed-out phones. */
type EarlyFeed = { rows: FeedRow[]; signed: Record<string, string> | null; at?: number; ttl?: number } | null;
let earlyP: Promise<EarlyFeed> | null | undefined;
let earlyUsed = false;
function early(): Promise<EarlyFeed> | null {
  if (earlyP === undefined) {
    if (typeof window === 'undefined') return (earlyP = null);
    const w = window as unknown as { __kr8Feed0?: Promise<EarlyFeed> | null };
    earlyP = w.__kr8Feed0 || null;
    w.__kr8Feed0 = null;
    if (earlyP) earlyP = earlyP.then((d) => (d && Array.isArray(d.rows) ? d : null)).catch(() => null);
  }
  return earlyP;
}
/** A session can only exist when one is stored on this phone or a sign-in is just coming back in the address. Checking this
 *  first means a visitor's feed never waits for the Supabase library (59 KB) to download and start. */
function maybeSignedIn(): boolean {
  try {
    return !!localStorage.getItem('kr8-v5-auth') || /[?&#](code|access_token|error_description)=/.test(location.search + location.hash);
  } catch {
    return true;
  }
}
async function hasSession(): Promise<boolean> {
  if (!maybeSignedIn()) return false;
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  return !!data.session;
}
/** Links signed by the edge are reused for the member's own feed too, so the Reel on screen does not reload when it arrives. */
async function signedFor(rows: FeedRow[], pre: Record<string, string> | null, at?: number, ttl?: number): Promise<Record<string, string>> {
  const m = await import('./v5Reel');
  if (pre) m.primeSigned(pre, (at || Date.now()) + (ttl || 3600) * 1000);
  const reelPaths = (rows || []).flatMap((r) => (r.kind === 'reel' ? [r.video_path || '', r.poster_path || ''] : []));
  return reelPaths.length ? m.signReelPaths(reelPaths).catch(() => ({} as Record<string, string>)) : {};
}
/** The visitor feed index.html already fetched (or null). A signed-in member sees this first while their own feed loads. */
export async function v5FeedPeek(): Promise<V5FeedItem[] | null> {
  const p = early();
  const d = p ? await p : null;
  if (!d || !d.signed) return null;
  return mapFeed(d.rows, await signedFor(d.rows, d.signed, d.at, d.ttl));
}
async function v5FeedOnce(): Promise<V5FeedItem[]> {
  const p = earlyUsed ? null : early();
  earlyUsed = true;
  if (p && !(await hasSession())) {   // a signed-in member gets their own feed (likes, saves, own Reels)
    const d = await p;
    if (d) return mapFeed(d.rows, await signedFor(d.rows, d.signed, d.at, d.ttl));
  }
  const all = await rpcLite<FeedRow>('kr8_feed', { p_area: null, p_limit: 60 }, FEED_COLS, [{ id: 'author_id', photo: 'author_photo' }, { id: 'id', photo: 'photo' }]);
  return mapFeed(all || [], await signedFor(all || [], null));
}
function mapFeed(all: FeedRow[], signed: Record<string, string>): V5FeedItem[] {
  // Reels-only feed (founder 9 Nov): photo posts are no longer made; old ones still show. Reels need signed links.
  const rows = (all || []).filter((r) => r.kind !== 'reel' || (r.video_path && signed[r.video_path]));
  return rows.map((r) =>
    r.kind === 'ask'
      ? { id: r.id, type: 'ask', q: r.body, asker: r.author_name, area: r.area, av: r.author_photo || initialAvatar(r.author_name), authorId: r.author_id || undefined, mine: !!r.mine, v5Kind: 'ask',
          answers: (r.answers || []).map((a) => ({ who: a.name, av: a.photo || initialAvatar(a.name), txt: a.body })) }
      : { id: r.id, type: 'photo', img: r.photo || V5_PLAN_BG, av: r.author_photo || demoPostAvatar(r.id) || (r.kind === 'reel' && signed[r.poster_path || '']) || initialAvatar(r.author_name), name: r.author_name, langs: (r.author_langs || []).join(' · '),
          area: r.area, here: r.here, cap: r.body, hiCount: 0, authorId: r.author_id || undefined, mine: !!r.mine, v5Kind: r.kind, eventId: r.event_id || undefined,
          ...(r.kind === 'reel' ? { video: signed[r.video_path || ''], poster: signed[r.poster_path || ''] || undefined, img: signed[r.poster_path || ''] || V5_PLAN_BG,
            reelPending: r.reel_status === 'pending', likes: r.likes || 0, liked: !!r.liked, views: r.views ?? undefined,
            ig: r.ig_handle || undefined,
            place: r.venue_id ? { venueId: r.venue_id, name: r.venue_name || '', nameTh: r.venue_name_th || undefined, dealId: r.deal_id || undefined,
              dealEn: r.deal_en || undefined, dealTh: r.deal_th || undefined } : undefined } : {}),
          saved: !!r.saved }
  );
}
interface TreatRow { id: string; venue: string; area: string; cat: V8Deal['cat']; tag: string; title: string; price_now: number; price_was: number; total: number; claimed: number; left_count: number; valid_window: string; img: string; mine_code: string | null;
  deal_en?: string | null; deal_th?: string | null; hours_en?: string | null; hours_th?: string | null; maps_url?: string | null; photos?: string[] | null; venue_th?: string | null; mine_expires_at?: string | null }
export async function v5Treats(): Promise<V8Deal[]> {
  const rows = await rpc<TreatRow[]>('kr8_treats_live');
  return (rows || []).map((r) => ({ id: r.id, cat: r.cat, tag: r.tag, title: r.title, venue: r.venue, area: r.area, now: r.price_now, was: r.price_was,
    claimed: r.claimed, leftCount: r.left_count, validWindow: r.valid_window, img: r.img || NEUTRAL_IMG, code: r.mine_code || '',
    dealEn: r.deal_en || undefined, dealTh: r.deal_th || undefined, hoursEn: r.hours_en || undefined, hoursTh: r.hours_th || undefined,
    mapsUrl: r.maps_url && /^https:\/\//.test(r.maps_url) ? r.maps_url : undefined, photos: r.photos || undefined, venueTh: r.venue_th || undefined,
    expiresAt: r.mine_expires_at || undefined }));
}
/** The QR a guest shows: opens the venue counter page with the code filled in (staff still enter their PIN). */
export function v5StaffUrl(code: string): string {
  const base = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${location.origin}${base}staff.html#c=${encodeURIComponent(code)}`;
}
export const v5Claim = (treatId: string) => rpc<string>('kr8_claim_treat', { p_treat: treatId });

// ─────────────── posts ───────────────
export const v5CreatePost = (p: { kind: 'photo' | 'plan' | 'ask'; area?: string | null; body: string; photo?: string | null; eventId?: string | null; here?: boolean }) =>
  rpc<string>('kr8_create_post', { p_kind: p.kind, p_area: v5Area(p.area), p_body: p.body, p_photo: p.photo || null, p_event_id: p.eventId || null, p_here: !!p.here });
export const v5Answer = (postId: string, body: string) => rpc<string>('kr8_answer', { p_post: postId, p_body: body });

// ─────────────── hellos + chat ───────────────
export const v5Hello = (to: string, body: string) => rpc<string>('kr8_send_hello', { p_to: to, p_body: body });
export const v5SendMessage = (thread: string, body: string) => rpc<number>('kr8_send_message', { p_thread: thread, p_body: body });
export type V5Thread = V8ChatThread & { v5Status: 'pending' | 'open'; v5OpenedByMe: boolean; area?: string };
interface InboxRow { thread_id: string; status: 'pending' | 'open'; opened_by_me: boolean; other_id: string; other_name: string; other_photo: string | null; other_langs: string[];
  other_verified: boolean; other_area: string; last_body: string; last_sender_me: boolean; last_at: string; unread: number }
export function v5TimeLabel(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60_000) return 'Now';
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h`;
  return `${Math.floor(d / 86_400_000)}d`;
}
/** 0073: the Kring Team account(s): official, sender only. Fetched once per app run; [] before 0073 is applied. */
export const KRING_TEAM_NAME = 'Kring Team';
export const kringTeamLogo = () => `${import.meta.env.BASE_URL}icon-192.png`;
let teamIdsP: Promise<string[]> | null = null;
export function v5TeamIds(): Promise<string[]> {
  if (!teamIdsP) teamIdsP = rpc<string[] | null>('kr8_team_ids').then((r) => (Array.isArray(r) ? r : [])).catch(() => { teamIdsP = null; return []; });
  return teamIdsP;
}
/** for tests */ export const _resetTeamIds = () => { teamIdsP = null; };
export async function v5Inbox(): Promise<{ threads: V5Thread[]; requests: V8HelloRequest[] }> {
  const teamP = v5TeamIds();
  const rows = await rpcLite<InboxRow>('kr8_inbox', {}, ['thread_id', 'status', 'opened_by_me', 'other_id', 'other_name', 'other_photo', 'other_langs', 'other_verified',
    'other_area', 'last_body', 'last_sender_me', 'last_at', 'unread'], [{ id: 'other_id', photo: 'other_photo' }]);
  const team = new Set(await teamP);
  const threads: V5Thread[] = [];
  const requests: V8HelloRequest[] = [];
  for (const r0 of rows || []) {
    const official = team.has(r0.other_id);
    const r = official ? { ...r0, other_name: KRING_TEAM_NAME, other_photo: kringTeamLogo(), other_area: 'Official · ทางการ', other_langs: [] as string[] } : r0;
    if (r.status === 'pending' && !r.opened_by_me) {
      requests.push({ id: r.thread_id, name: r.other_name, meta: `${r.other_area} · ${(r.other_langs || []).join(' · ')}`, img: r.other_photo || initialAvatar(r.other_name), msg: r.last_body || '', verified: r.other_verified === true, ...(official ? { meta: 'Official · ทางการ', official: true } : {}) });
    }
    threads.push({ id: r.thread_id, personId: r.other_id, name: r.other_name, avatar: r.other_photo || initialAvatar(r.other_name), langs: (r.other_langs || []).join(' · '), verified: r.other_verified === true,
      lastPreview: r.last_body || '', timeLabel: v5TimeLabel(r.last_at), unread: r.unread > 0, messages: [], v5Status: r.status, v5OpenedByMe: r.opened_by_me, area: r.other_area, ...(official ? { official: true } : {}) });
  }
  return { threads, requests };
}
interface MsgRow { id: number; mine: boolean; body: string; created_at: string }
export async function v5Messages(thread: string): Promise<V8ChatMessage[]> {
  const rows = await rpc<MsgRow[]>('kr8_thread_messages', { p_thread: thread, p_after: 0 });
  return (rows || []).map((m) => ({ id: String(m.id), sender: m.mine ? 'me' : 'them', text: m.body, createdAt: v5TimeLabel(m.created_at) }));
}
/**
 * Live updates: Supabase Realtime on kr8_messages / kr8_threads (RLS limits rows to my own threads).
 * If the socket is not subscribed (offline, local stack without Realtime, corporate proxy), poll every 5 s instead.
 */
export async function v5Subscribe(onChange: () => void): Promise<() => void> {
  const c = await v5Client();
  let live = false;
  let t: ReturnType<typeof setTimeout> | null = null;
  const fire = () => { if (!t) t = setTimeout(() => { t = null; onChange(); }, 800); };
  const ch = c
    .channel('kr8-me')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kr8_messages' }, () => fire())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'kr8_threads' }, () => fire())
    .subscribe((status) => {
      live = status === 'SUBSCRIBED';
      // a just-started Realtime tenant can miss events for a few seconds while it creates its replication slot
      if (live) setTimeout(() => onChange(), 6000);
    });
  const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible';
  // 16 Nov egress: fallback poll 5 s → 15 s, safety poll with Realtime up 30 s → 120 s, and a burst of events = one refresh
  const fast = setInterval(() => { if (!live && visible() && navigator.onLine !== false) fire(); }, 15000);
  const slow = setInterval(() => { if (live && visible()) fire(); }, 120000);
  return () => {
    clearInterval(fast);
    clearInterval(slow);
    if (t) clearTimeout(t);
    c.removeChannel(ch).catch(() => undefined);
  };
}

// ─────────────── safety + PDPA ───────────────
export const v5Block = (user: string) => rpc<void>('kr8_block', { p_user: user });
export const v5Report = (r: { user?: string | null; reason: string; thread?: string | null; post?: string | null }) =>
  rpc<void>('kr8_report', { p_user: r.user || null, p_reason: r.reason, p_thread: r.thread || null, p_post: r.post || null });
// ─────────────── Reel social (0026) ───────────────
export const v5ToggleLike = (post: string) => rpc<{ liked: boolean; likes: number }>('kr8_toggle_like', { p_post: post });
export const v5ToggleSave = (post: string) => rpc<boolean>('kr8_toggle_save', { p_post: post });
export const v5MergeSaves = (posts: string[]) => rpc<number>('kr8_merge_saves', { p_posts: posts });
export const v5MySaves = () => rpc<string[]>('kr8_my_saves');
export const v5NotInterested = (post: string) => rpc<void>('kr8_not_interested', { p_post: post });
export type V5ReportReason = 'spam' | 'unsafe' | 'stolen' | 'wrong_place' | 'block';
export const v5ReportReel = (post: string, reason: V5ReportReason) => rpc<void>('kr8_report_reel', { p_post: post, p_reason: reason, p_note: null });
export const v5SetIgHandle = (h: string) => rpc<string | null>('kr8_set_ig_handle', { p_handle: h });
export interface V5TagPlace { venue_id: string; name: string; name_th: string | null; area: string; deal_id: string | null; deal_en: string | null; deal_th: string | null }
export const v5TagPlaces = () => rpc<V5TagPlace[]>('kr8_tag_places');
export const v5SetReelPlace = (post: string, venue: string | null) => rpc<void>('kr8_set_reel_place', { p_post: post, p_venue: venue });
/** A random id this phone keeps, so signed-out views count once a day. Never sent anywhere else. */
function deviceId(): string {
  try {
    let d = localStorage.getItem('kr8_device');
    if (!d || !/^[A-Za-z0-9-]{16,64}$/.test(d)) { d = (crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}abcdef`).slice(0, 40); localStorage.setItem('kr8_device', d); }
    return d;
  } catch { return ''; }
}
export const v5LogView = (post: string) => rpc<boolean>('kr8_log_reel_view', { p_post: post, p_device: deviceId() || null }).catch(() => false);
export const v5LogShare = (post: string, channel: 'line' | 'copy' | 'native') => rpc<boolean>('kr8_log_reel_share', { p_post: post, p_channel: channel }).catch(() => false);
/** The link people share. kringapp.com/app/?reel=<id> opens the feed on that Reel (the website adds the preview card). */
export function v5ReelLink(id: string): string {
  const base = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${location.origin}${base}?reel=${encodeURIComponent(id)}`;
}
export const v5Export = () => rpc<Record<string, unknown>>('kr8_export_me');
// ─────────────── Me tab (0030): follow, levels, Top 10, activity ───────────────
export type V5Level = 'anchan' | 'tea' | 'pandan';
export interface V5LevelInfo { level: V5Level; posts: number; visits: number; points: number; next: V5Level | null; need_points: number; pct: number }
export interface V5Profile {
  user_id: string; first_name: string; photo: string | null; langs: string[]; bio: string; area: string; who: 'local' | 'traveller';
  verified: boolean; ig_handle: string | null; interests: string[]; member_no: string; online: boolean; here: boolean; mine: boolean;
  level: V5LevelInfo; followers: number; following: number; likes: number; gifts: number; i_follow: boolean; follows_me: boolean;
  reels: { id: string; poster_path: string; likes: number; status: string }[];
}
export const v5Profile = (user?: string | null) => rpc<V5Profile>('kr8_profile', { p_user: user || null });
export const v5Follow = (user: string) => rpc<boolean>('kr8_follow', { p_user: user });
export const v5Unfollow = (user: string) => rpc<boolean>('kr8_unfollow', { p_user: user });
export interface V5FollowRow { user_id: string; first_name: string; photo: string | null; ig_handle: string | null; who: string; verified: boolean; i_follow: boolean; follows_me: boolean }
export const v5FollowList = (user: string, kind: 'followers' | 'following') => rpc<V5FollowRow[]>('kr8_follow_list', { p_user: user, p_kind: kind });
export type V5TopPeriod = 'today' | 'week' | 'area';
export interface V5TopRow { rank: number; reel_id: string; user_id: string; first_name: string; photo: string | null; area: string; body: string; venue_name: string | null; poster_path: string; points: number; prize: string | null; is_me: boolean | null }
export const v5Top10 = (period: V5TopPeriod, area?: string | null) => rpc<V5TopRow[]>('kr8_top10', { p_period: period, p_area: area || null });
export interface V5Activity { kind: 'follow' | 'like' | 'gift' | 'approved' | 'hidden'; at: string; actor_id: string | null; actor_name: string | null; actor_photo: string | null;
  post_id: string | null; poster_path: string | null; n: number; rank: number | null; prize: string | null; i_follow: boolean | null }
export const v5Activity = () => rpc<V5Activity[]>('kr8_my_activity', { p_limit: 50 });
export const V5_INTERESTS = ['coffee', 'street_food', 'desserts', 'markets', 'running', 'yoga', 'film_photos', 'art', 'music', 'books',
  'language_exchange', 'board_games', 'cooking', 'sunsets', 'parks', 'shopping', 'gaming', 'fitness', 'cycling', 'volunteering'] as const;
export const v5SetInterests = (list: string[]) => rpc<string[]>('kr8_set_interests', { p_interests: list });
export const v5Touch = () => rpc<void>('kr8_touch').catch(() => undefined);
/** 0061 ghost mode: true only for the admin's own ghost card (nobody can ask about anyone else). Before 0061 is live: false. */
export const v5MyGhost = () => rpc<boolean>('kr8_my_ghost').then((v) => v === true).catch(() => false);
/** Link that opens someone's profile: kringapp.com/app/?u=<id> */
export function v5ProfileLink(id: string): string {
  const base = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${location.origin}${base}?u=${encodeURIComponent(id)}`;
}
// ─────────────── face verification (0031) ───────────────
export interface V5Verification { status: 'pending' | 'approved' | 'rejected'; created_at: string; reviewed_at: string | null; reject_reason: string | null }
export const v5MyVerification = async () => ((await rpc<V5Verification[]>('kr8_my_verification')) || [])[0] || null;
/** Uploads the one selfie frame (private bucket, team-only) and sends the check results. */
export async function v5RequestVerification(selfie: Blob, check: { straight: boolean; left: boolean; right: boolean; blink: boolean; blink_fallback?: boolean; match: number | null; device: string }, consent: string): Promise<string> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new V5Error('OFFLINE');
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  const uid = data.session?.user?.id;
  if (!uid) throw new V5Error('SIGN_IN');
  const path = `${uid}/${crypto.randomUUID()}.jpg`;
  const up = await fetch(`${SUPA_URL.replace(/\/$/, '')}/storage/v1/object/kr8-verify/${path}`, {
    method: 'POST', headers: { authorization: `Bearer ${data.session!.access_token}`, apikey: SUPA_KEY, 'content-type': 'image/jpeg', 'x-upsert': 'false' }, body: selfie,
  }).catch(() => null);
  if (!up || !up.ok) throw new V5Error('UPLOAD');
  return rpc<string>('kr8_request_verification', { p_selfie_path: path, p_consent_version: consent, p_check: check });
}
/** 0075: uploads the claim photo frame (private kr8-verify bucket, team-only) and returns its path; null on any failure
 *  (the claim still goes ahead and simply waits for the founder). Never throws. */
export async function v5UploadClaimPhoto(photo: Blob | null | undefined): Promise<string | null> {
  try {
    if (!photo || !photo.size || photo.size > 5_000_000) return null;
    const c = await v5Client();
    const { data } = await c.auth.getSession();
    const uid = data.session?.user?.id;
    if (!uid) return null;
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    const up = await fetch(`${SUPA_URL.replace(/\/$/, '')}/storage/v1/object/kr8-verify/${path}`, {
      method: 'POST', headers: { authorization: `Bearer ${data.session!.access_token}`, apikey: SUPA_KEY, 'content-type': 'image/jpeg', 'x-upsert': 'false' }, body: photo,
    }).catch(() => null);
    return up && up.ok ? path : null;
  } catch { return null; }
}
/** 0066: the face code (128 numbers, not a photo) from the face check; team-only on the server. Never throws. */
export async function v5SaveFacePrint(desc: Float32Array | null): Promise<boolean> {
  if (!desc || desc.length !== 128) return false;
  return rpc<boolean>('kr8_save_face_print', { p_desc: Array.from(desc, (x) => Math.round(x * 1e6) / 1e6) }).then((v) => v === true).catch(() => false);
}
/** 0076: the face code of the member's CURRENT card photo (one per member, team-only; only ever a "looks alike" flag).
 *  Resolves true when stored, false when the server has it switched off; throws on errors (the caller retries later). */
export async function v5SaveCardPrint(desc: Float32Array): Promise<boolean> {
  if (desc.length !== 128) throw new V5Error('BAD_FACE');
  return (await rpc<boolean>('kr8_save_card_print', { p_desc: Array.from(desc, (x) => Math.round(x * 1e6) / 1e6) })) === true;
}
/** 0076: the face code of the member's CURRENT card photo (one per member, team-only; only ever a "looks alike" flag).
 *  Resolves true when stored, false when the server has it switched off; throws on errors (the caller retries later). */
export async function v5SaveCardPrint(desc: Float32Array): Promise<boolean> {
  if (desc.length !== 128) throw new V5Error('BAD_FACE');
  return (await rpc<boolean>('kr8_save_card_print', { p_desc: Array.from(desc, (x) => Math.round(x * 1e6) / 1e6) })) === true;
}
/** 16 Nov: phone-side failures (Reel pick / upload, face check) go to kr8_client_events so the team can see them. Never throws. */
export function v5LogClient(kind: string, code?: string, detail?: string): void {
  try {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    void rpc<void>('kr8_log_client', { p_kind: kind, p_code: code || null, p_detail: detail || null, p_ua: ua }).catch(() => undefined);
  } catch { /* never block the member */ }
}
/** Terms + Privacy notice version the member agreed to (sign-in sheet line). Bump when terms.html / privacy.html change. */
export const V5_TERMS_VERSION = 'member-2026-11-10';
export const v5AcceptTerms = () => rpc<string>('kr8_accept_terms', { p_version: V5_TERMS_VERSION });
export interface V5Blocked { user_id: string; first_name: string; photo: string | null; blocked_at: string }
export const v5MyBlocks = () => rpc<V5Blocked[]>('kr8_my_blocks');
export const v5Unblock = (user: string) => rpc<void>('kr8_unblock', { p_user: user });
/** Deletes my card and content. An admin / staff / Kring Team sign-in is kept (audit P0-3): then keptSignIn is true. */
export async function v5DeleteMe(): Promise<{ keptSignIn: boolean }> {
  // Reel videos + posters first (Storage API), then the account and everything linked to it
  try {
    const files = await rpc<string[]>('kr8_my_reel_files');
    if (files && files.length) {
      const c = await v5Client();
      for (let i = 0; i < files.length; i += 100) await c.storage.from('kr8-reels').remove(files.slice(i, i + 100));
    }
    const selfies = await rpc<string[]>('kr8_my_verify_files').catch(() => [] as string[]);
    if (selfies && selfies.length) await (await v5Client()).storage.from('kr8-verify').remove(selfies);
  } catch {
    // never block deletion on file clean-up
  }
  let keptSignIn = false;
  try {
    const r = await rpc<{ kept_sign_in?: boolean }>('kr8_delete_me2');
    keptSignIn = r?.kept_sign_in === true;
  } catch (e) {
    // a database without 0070 yet: the old call (which deletes the whole sign-in)
    if (v5ErrCode(e) !== 'UNKNOWN') throw e;
    await rpc<void>('kr8_delete_me');
  }
  await v5SignOut();
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('kr8')) localStorage.removeItem(k);
  } catch {
    // ignore
  }
  return { keptSignIn };
}

// ─────────────── photos ───────────────
/** Shrinks a picked photo to a small JPEG data URL (card ~384 px, post ~1080 px) so it fits the database caps. */
export async function v5CompressImage(file: File | string, maxSide: number, maxChars: number): Promise<string> {
  const url = typeof file === 'string' ? file : URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new V5Error('BAD_PHOTO'));
      i.src = url;
    });
    let side = maxSide;
    for (let attempt = 0; attempt < 6; attempt++) {
      const k = Math.min(1, side / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
      const cv = document.createElement('canvas');
      cv.width = Math.max(1, Math.round((img.naturalWidth || 1) * k));
      cv.height = Math.max(1, Math.round((img.naturalHeight || 1) * k));
      const ctx = cv.getContext('2d');
      if (!ctx) throw new V5Error('BAD_PHOTO');
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      for (const q of [0.82, 0.7, 0.58]) {
        const out = cv.toDataURL('image/jpeg', q);
        if (out.startsWith('data:image/jpeg') && out.length <= maxChars) return out;
      }
      side = Math.round(side * 0.75);
    }
    throw new V5Error('BAD_PHOTO');
  } finally {
    if (typeof file !== 'string') URL.revokeObjectURL(url);
  }
}

// ─────────────── STAFF SWIPE: stand QR → live ticket → staff slide (0032, D-10NOV-C) ───────────────
export interface V5StandInfo { id: string; name: string; name_th: string | null; area: string; practice: boolean; deal_en: string | null; deal_th: string | null; treat_id: string | null }
export interface V5Ticket { status: 'ready' | 'used'; code: string; expires_at: string; used_at: string | null; again?: boolean; venue?: V5StandInfo; given_at?: string | null; name?: string | null; photo?: string | null }
/** OPTION A (D-10NOV-E): "I'm here" → live pass; opening it is the use. venue = venue slug or a treat id. confirm = guest said "use it anyway" after KR8_FAR. */
export const v5HerePass = (venue: string, lat: number | null, lng: number | null, confirm = false) =>
  rpc<V5Ticket>('kr8_here_pass', { p_venue: venue, p_lat: lat, p_lng: lng, p_confirm: confirm });
export const v5PassGiven = (code: string) => rpc<{ given_at: string }>('kr8_pass_given', { p_code: code });
export const v5StandInfo = (venue: string) => rpc<V5StandInfo | null>('kr8_stand_info', { p_venue: venue });
export const v5StandTicket = (venue: string, src: string) => rpc<V5Ticket>('kr8_stand_ticket', { p_venue: venue, p_src: src === 'stand' ? 'stand' : 'link' });
export const v5TicketUse = (code: string) => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const dev = /iPhone|iPad/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'web';
  return rpc<V5Ticket>('kr8_ticket_use', { p_code: code, p_device: dev });
};

// ─────────────── Stay / Do listings (T-209, 0041) ───────────────
/** A partner stay or "do" (workshop). The partner sets member_price_thb; Kring only shows it. Members only. */
export interface V5Listing { id: string; kind: 'stay' | 'do'; name: string; name_th: string | null; area: string; blurb_en: string | null; blurb_th: string | null;
  photos: string[]; member_price_thb: number; price_unit_en: string | null; price_unit_th: string | null; saving_thb: number | null;
  booking_kind: 'line_oa' | 'line' | 'ig' | 'url'; booking_contact: string; my_code: string }
export const v5Listings = () => rpc<V5Listing[]>('kr8_listings_live');
/** Logs one "Book direct" tap (the proof shown to partners). Fire and forget. */
export const v5ListingTap = (id: string) => rpc<boolean>('kr8_listing_tap', { p_id: id });
