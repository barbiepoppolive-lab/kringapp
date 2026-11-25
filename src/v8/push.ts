/** Phone dings (Web Push, 16 Nov). Client side: support check, the one permission prompt, subscribe/unsubscribe, and when to ask.
 *  - Never asks on first load. Asks after a meaningful moment (card minted, first Reel posted) with a small in-app card; only its
 *    [Turn on] button (or the Settings toggle) calls Notification.requestPermission().
 *  - iPhone: push works only in the home-screen app (iOS 16.4+). In a Safari tab we show one line: add Kring to the home screen first.
 *  - Off unless the build has VITE_VAPID_PUBLIC (the public VAPID key). Without it nothing here shows or runs.
 *  The server side is migration 0059 (kr8_push_subs + outbox) and kringapp.com/api/push (site repo). */
import { v5PushSubscribe, v5PushUnsubscribe } from './v5Live';
import { inAppOf } from './escape';

export const VAPID_PUBLIC = String(import.meta.env.VITE_VAPID_PUBLIC || '').trim();
export const pushConfigured = (key = VAPID_PUBLIC) => /^[A-Za-z0-9_-]{80,100}$/.test(key);

// ───────── what this phone can do ─────────
export type PushSupport = 'ok' | 'ios-install' | 'inapp' | 'unsupported';
export interface PushEnv { ua: string; standalone: boolean; hasSW: boolean; hasPush: boolean; hasNotif: boolean }
const isIos = (ua: string, touch = 0) => /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && touch > 1);
const inApp = (ua: string) => !!inAppOf(ua) || /Twitter/i.test(ua);
/** Pure. iPhone Safari tab → 'ios-install' (push needs the home-screen app); LINE/IG/FB/TikTok browsers → 'inapp'. */
export function pushSupport(e: PushEnv, touch = 0): PushSupport {
  if (inApp(e.ua)) return 'inapp';
  if (isIos(e.ua, touch) && !e.standalone) return 'ios-install';
  return e.hasSW && e.hasPush && e.hasNotif ? 'ok' : 'unsupported';
}
export function pushEnvNow(): PushEnv {
  const w = typeof window === 'undefined' ? undefined : (window as unknown as Record<string, unknown>);
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  let standalone = false;
  try { standalone = matchMedia('(display-mode: standalone)').matches || (nav as unknown as { standalone?: boolean })?.standalone === true; } catch { /* ignore */ }
  return { ua: nav?.userAgent || '', standalone, hasSW: !!nav && 'serviceWorker' in nav, hasPush: !!w && 'PushManager' in w, hasNotif: !!w && 'Notification' in w };
}

// ───────── subscribe / unsubscribe (dependencies injectable for tests) ─────────
export interface PushDeps {
  key: string;
  env: PushEnv;
  touch?: number;
  permission: () => NotificationPermission;
  requestPermission: () => Promise<NotificationPermission>;
  registration: () => Promise<{ pushManager: Pick<PushManager, 'getSubscription' | 'subscribe'> } | null>;
  save: (endpoint: string, p256dh: string, auth: string, ua: string) => Promise<void>;
  forget: (endpoint: string) => Promise<void>;
  store?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null;
}
const ON_KEY = 'kr8_push_on';
const SYNC_KEY = 'kr8_push_sync';

export function urlB64ToBytes(b64: string): Uint8Array {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '='.repeat((4 - (s.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function keysOf(sub: PushSubscription): { endpoint: string; p256dh: string; auth: string } | null {
  const j = (sub.toJSON ? sub.toJSON() : sub) as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth };
}
const st = (d: PushDeps) => { try { return d.store === undefined ? localStorage : d.store; } catch { return null; } };
const setOn = (d: PushDeps, on: boolean) => { try { const s = st(d); if (on) s?.setItem(ON_KEY, '1'); else s?.removeItem(ON_KEY); } catch { /* private mode */ } };

export function defaultPushDeps(): PushDeps {
  return {
    key: VAPID_PUBLIC,
    env: pushEnvNow(),
    touch: typeof navigator === 'undefined' ? 0 : navigator.maxTouchPoints || 0,
    permission: () => (typeof Notification === 'undefined' ? 'denied' : Notification.permission),
    requestPermission: () => Notification.requestPermission(),
    registration: async () => {
      const sw = navigator.serviceWorker;
      if (!sw) return null;
      const existing = await sw.getRegistration().catch(() => undefined);
      if (existing?.active) return existing;
      // the app shell registers sw.js on load; wait for it (8 s), registering it ourselves if it never came
      if (!existing) await sw.register('sw.js', { updateViaCache: 'none' }).catch(() => undefined);
      return Promise.race([sw.ready, new Promise<null>((r) => setTimeout(() => r(null), 8000))]);
    },
    save: v5PushSubscribe,
    forget: v5PushUnsubscribe,
  };
}

export type PushState = 'on' | 'off' | 'denied' | 'ios-install' | 'inapp' | 'unsupported';
export async function pushState(d: PushDeps = defaultPushDeps()): Promise<PushState> {
  if (!pushConfigured(d.key)) return 'unsupported';
  const s = pushSupport(d.env, d.touch);
  if (s !== 'ok') return s;
  const perm = d.permission();
  if (perm === 'denied') return 'denied';
  if (perm !== 'granted') return 'off';
  const reg = await d.registration().catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  return sub ? 'on' : 'off';
}

export type PushResult = 'on' | 'denied' | 'unsupported' | 'error';
/** Call ONLY from a tap ([Turn on] or the Settings toggle): asks the browser's permission, subscribes, stores it for the member. */
export async function pushEnable(d: PushDeps = defaultPushDeps()): Promise<PushResult> {
  if (!pushConfigured(d.key) || pushSupport(d.env, d.touch) !== 'ok') return 'unsupported';
  let perm = d.permission();
  if (perm === 'default') perm = await d.requestPermission().catch(() => 'default' as NotificationPermission);
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'error';
  try {
    const reg = await d.registration();
    if (!reg) return 'error';
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(d.key) as BufferSource });
    const k = keysOf(sub);
    if (!k) return 'error';
    await d.save(k.endpoint, k.p256dh, k.auth, d.env.ua);
    setOn(d, true);
    return 'on';
  } catch {
    return 'error';
  }
}
/** Settings toggle off, or signing out: the member's row goes, and this browser's subscription is dropped too. */
export async function pushDisable(d: PushDeps = defaultPushDeps()): Promise<void> {
  setOn(d, false);
  if (!pushConfigured(d.key) || pushSupport(d.env, d.touch) !== 'ok') return;
  const reg = await d.registration().catch(() => null);
  const sub = reg ? await reg.pushManager.getSubscription().catch(() => null) : null;
  if (!sub) return;
  await d.forget(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => false);
}
/** On a signed-in start: keeps the server row in step with this phone (new member on the phone, rotated subscription), once a day.
 *  Never prompts: only runs when permission is already granted and the member turned dings on here before. */
export async function pushResync(uid: string, d: PushDeps = defaultPushDeps(), now = Date.now()): Promise<'synced' | 'skipped'> {
  if (!uid || !pushConfigured(d.key) || pushSupport(d.env, d.touch) !== 'ok' || d.permission() !== 'granted') return 'skipped';
  const s = st(d);
  const was = (() => { try { return s?.getItem(ON_KEY) === '1'; } catch { return false; } })();
  const mark = `${uid}:${new Date(now + 7 * 3600_000).toISOString().slice(0, 10)}`;
  try { if (s?.getItem(SYNC_KEY) === mark) return 'skipped'; } catch { /* ignore */ }
  const reg = await d.registration().catch(() => null);
  if (!reg) return 'skipped';
  let sub = await reg.pushManager.getSubscription().catch(() => null);
  if (!sub && !was) return 'skipped';
  try {
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(d.key) as BufferSource });
    const k = keysOf(sub);
    if (!k) return 'skipped';
    await d.save(k.endpoint, k.p256dh, k.auth, d.env.ua);
    setOn(d, true);
    try { s?.setItem(SYNC_KEY, mark); } catch { /* ignore */ }
    return 'synced';
  } catch {
    return 'skipped';
  }
}

// ───────── when to ask (the small card) ─────────
const ASK_KEY = 'kr8_push_ask';
const ASK_EVENT = 'kr8-push-ask';
export const PUSH_SNOOZE_MS = 14 * 864e5;
// 'daily_task' (20 Nov, founder): the planned daily tasks are the main moment to offer "Remind me tomorrow" (LINE first, phone
// dings second, iPhone via home screen). Call pushMoment('daily_task') when a member finishes one; the card then shows once.
export type PushMoment = 'minted' | 'first_reel' | 'escaped' | 'daily_task';
export interface PushAsk { due?: number; by?: PushMoment; snooze?: number; asked?: boolean; seen?: PushMoment[] }
const readAsk = (): PushAsk => { try { return JSON.parse(localStorage.getItem(ASK_KEY) || '{}') as PushAsk; } catch { return {}; } };
const writeAsk = (v: PushAsk) => { try { localStorage.setItem(ASK_KEY, JSON.stringify(v)); } catch { /* ignore */ } };
/** Pure. Each moment counts once (the first mint, the first Reel); once asked, never again. */
export function pushAskAfter(s: PushAsk, by: PushMoment, now: number): PushAsk {
  if (s.asked || (s.seen || []).includes(by)) return s;
  return { ...s, due: now, by, seen: [...(s.seen || []), by] };
}
/** Pure: show the card now? Only when a moment is waiting, not snoozed, never asked, and the browser has not been asked yet. */
export function pushAskShow(s: PushAsk, now: number, support: PushSupport, perm: NotificationPermission, opts: { configured: boolean; blocked?: boolean }): boolean {
  if (!opts.configured || opts.blocked || s.asked || !s.due || (s.snooze && s.snooze > now)) return false;
  if (support === 'ios-install' || support === 'inapp') return true;   // inapp: [Turn on] opens "Open in your browser" first
  return support === 'ok' && perm === 'default';
}
export const pushAskLater = (s: PushAsk, now: number): PushAsk => ({ ...s, due: undefined, snooze: now + PUSH_SNOOZE_MS });
export const pushAskDone = (s: PushAsk): PushAsk => ({ ...s, due: undefined, asked: true });
/** Call right after the member mints their card, and after their first Reel is posted. */
export function pushMoment(by: PushMoment) {
  const before = readAsk();
  const next = pushAskAfter(before, by, Date.now());
  if (next === before) return;
  writeAsk(next);
  try { window.dispatchEvent(new Event(ASK_EVENT)); } catch { /* ignore */ }
}
export const pushAskRead = readAsk;
export const pushAskWrite = writeAsk;
export const PUSH_ASK_EVENT = ASK_EVENT;

/** A link from a ding → what the app should do (pure; used by the service-worker message and on start). */
export interface PushLink { tab?: 'feed' | 'people' | 'deals' | 'me'; rewards?: boolean; reel?: string; /** m213 */ ask?: string }
export function parsePushLink(url: string): PushLink | null {
  let u: URL;
  try { u = new URL(url, 'https://kringapp.com'); } catch { return null; }
  if (u.origin !== 'https://kringapp.com' || !u.pathname.startsWith('/app')) return null;
  const out: PushLink = {};
  const t = u.searchParams.get('tab');
  if (t && ['feed', 'people', 'deals', 'me'].includes(t)) out.tab = t as PushLink['tab'];
  if (u.searchParams.get('open') === 'rewards') out.rewards = true;
  const r = u.searchParams.get('reel');
  if (r && /^[0-9a-f-]{36}$/.test(r)) { out.reel = r; out.tab = 'feed'; }
  const a = u.searchParams.get('ask');   // m213: the evening summary opens an Ask BKK question
  if (a && /^[0-9a-f-]{36}$/.test(a)) { out.ask = a; out.tab = 'feed'; }
  return out;
}
