/** Leaving an in-app browser (16 Nov). LINE / Instagram / Facebook / Messenger / TikTok open links in their own built-in
 *  browser, where phone dings can't work and Google sign-in is blocked. This file decides how to get the member into the
 *  phone's real browser on the same page (same path, query, ?ref / ?src), and carries the sign-in across with a one-time
 *  hand-off code (?ho=, kr8_handoff_create in 0059, swapped at /api/handoff).
 *  - LINE: the same URL + openExternalBrowser=1 → LINE opens it in the phone's default browser (automatic, once).
 *    Not inside a LIFF open (liff.line.me links sign members in inside LINE on purpose; those members get LINE dings).
 *  - Android FB / IG / TikTok / Messenger / other WebViews: intent:// to Chrome (automatic, once); if Chrome is missing,
 *    Android loads the fallback (this page + kr_esc=1) and the screen offers the browser chooser (intent without package).
 *  - iPhone FB / IG / TikTok / Messenger: x-safari-https:// behind a tap (iOS 17+), plus an arrow to the app's ⋯ menu.
 *  Pure functions here; the screen is V5Escape.tsx. */

export type InApp = 'line' | 'messenger' | 'instagram' | 'facebook' | 'tiktok' | 'webview';
export type Os = 'android' | 'ios' | 'other';

export function inAppOf(ua: string): InApp | null {
  if (/\bLine\//i.test(ua)) return 'line';
  if (/FBAN\/Messenger|FB_IAB\/MESSENGER|MessengerLite|Orca-Android|FBAN\/MessengerForiOS/i.test(ua)) return 'messenger';
  if (/Instagram/i.test(ua)) return 'instagram';
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return 'facebook';
  if (/musical_ly|BytedanceWebview|TikTok|trill_|ByteLocale/i.test(ua)) return 'tiktok';
  if (/Android/i.test(ua) && /; wv\)/.test(ua)) return 'webview';
  return null;
}
export function osOf(ua: string): Os {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

const DROP = ['openExternalBrowser', 'kr_esc', 'ho', 'dings', 'liff.state', 'liff.referrer', 'liffClientId', 'liffRedirectUri'];
/** The page to open in the real browser: same path + query (minus our own markers), https, plus ?ref and ?ho if given. */
export function targetUrl(href: string, extra: { ho?: string | null; ref?: string | null; esc?: boolean; dings?: boolean } = {}): string {
  const u = new URL(href);
  for (const k of DROP) u.searchParams.delete(k);
  u.protocol = 'https:';
  if (extra.ref && /^[a-z0-9_-]{3,40}$/.test(extra.ref) && !u.searchParams.get('ref')) u.searchParams.set('ref', extra.ref);
  if (extra.ho && /^[0-9a-f]{64}$/.test(extra.ho)) u.searchParams.set('ho', extra.ho);
  if (extra.esc) u.searchParams.set('kr_esc', '1');
  if (extra.dings) u.searchParams.set('dings', '1');   // the real browser asks for dings straight away (one tap)
  u.hash = '';
  return u.toString();
}
const hostPath = (https: string) => https.replace(/^https:\/\//, '');
/** Android: open in Chrome; when Chrome is not there, Android loads `fallback` (this page + kr_esc=1) instead. */
export function chromeIntent(https: string, fallback: string): string {
  return `intent://${hostPath(https)}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}
/** Android: any browser (the system chooser / default browser), for phones without Chrome. */
export function anyBrowserIntent(https: string): string {
  return `intent://${hostPath(https)}#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end`;
}
/** iPhone (iOS 17+): Safari opens this. */
export const safariUrl = (https: string) => 'x-safari-' + https;
/** LINE: opens the link in the phone's default browser. */
export function lineExternal(https: string): string {
  const u = new URL(https);
  u.searchParams.set('openExternalBrowser', '1');
  return u.toString();
}

export interface EscapePlan {
  app: InApp;
  os: Os;
  /** opened by itself once (null = needs a tap) */
  auto: string | null;
  /** the big button */
  button: { kind: 'chrome' | 'safari' | 'browser'; url: string };
  /** Android: any browser, for phones without Chrome */
  alt: string | null;
  /** iPhone: arrow to the app's ⋯ menu */
  menuHint: boolean;
}
/** Pure. null = not an in-app browser (nothing to do). `liff` = opened through liff.line.me (signed in inside LINE on purpose). */
export function escapePlan(href: string, ua: string, opts: { liff?: boolean; ho?: string | null; ref?: string | null; dings?: boolean } = {}): EscapePlan | null {
  const app = inAppOf(ua);
  if (!app) return null;
  const os = osOf(ua);
  const https = targetUrl(href, { ho: opts.ho, ref: opts.ref, dings: opts.dings });
  if (app === 'line') {
    const url = lineExternal(https);
    return { app, os, auto: opts.liff ? null : url, button: { kind: 'browser', url }, alt: null, menuHint: false };
  }
  if (os === 'android') {
    const intent = chromeIntent(https, targetUrl(href, { ref: opts.ref, esc: true, dings: opts.dings }));
    return { app, os, auto: intent, button: { kind: 'chrome', url: intent }, alt: anyBrowserIntent(https), menuHint: false };
  }
  if (os === 'ios') return { app, os, auto: null, button: { kind: 'safari', url: safariUrl(https) }, alt: null, menuHint: true };
  return { app, os, auto: null, button: { kind: 'browser', url: https }, alt: null, menuHint: true };
}

// ───────── once only ─────────
const AUTO_KEY = 'kr8_esc_auto';     // sessionStorage: the automatic jump was tried in this tab (never loops)
const FIRST_KEY = 'kr8_esc_first';   // localStorage: the first-open screen was shown on this phone/app
export type EscapeStart = { kind: 'none' } | { kind: 'auto'; plan: EscapePlan } | { kind: 'screen'; plan: EscapePlan };
/** Pure decision for the app start. `back` = Android loaded our fallback (Chrome missing / blocked). */
/** T301-020 (17 Nov): the visitor watches Reels first. No screen on a cold boot; it opens only when an action needs the real
 *  browser (sign-in, install, dings: openEscape). On start only LINE's silent openExternalBrowser reload runs (once), and the
 *  buttons come back when an Android Chrome jump the member tapped did not work (kr_esc=1). */
export function escapeOnStart(plan: EscapePlan | null, s: { autoTried: boolean; firstShown: boolean; back: boolean }): EscapeStart {
  if (!plan) return { kind: 'none' };
  if (s.back) return { kind: 'screen', plan };                         // the tapped jump did not work: offer the buttons
  if (s.firstShown) return { kind: 'none' };
  if (plan.app === 'line' && plan.auto && !s.autoTried) return { kind: 'auto', plan };
  return { kind: 'none' };
}
const ss = () => { try { return sessionStorage; } catch { return null; } };
const ls = () => { try { return localStorage; } catch { return null; } };
export function escapeFlags(search: string) {
  let back = false;
  try { back = new URLSearchParams(search).get('kr_esc') === '1'; } catch { /* ignore */ }
  let autoTried = false, firstShown = false;
  try { autoTried = ss()?.getItem(AUTO_KEY) === '1'; } catch { /* ignore */ }
  try { firstShown = ls()?.getItem(FIRST_KEY) === '1'; } catch { /* ignore */ }
  return { autoTried, firstShown, back };
}
export function markAutoTried() { try { ss()?.setItem(AUTO_KEY, '1'); } catch { /* ignore */ } }
export function markFirstShown() { try { ls()?.setItem(FIRST_KEY, '1'); } catch { /* ignore */ } }

export const ESCAPE_EVENT = 'kr8-escape-open';
/** Opens the escape screen now (Turn on dings inside an in-app browser). */
export function openEscape(why: 'dings' | 'start' | 'signin' | 'install' = 'dings') { try { window.dispatchEvent(new CustomEvent(ESCAPE_EVENT, { detail: why })); } catch { /* ignore */ } }

/** Opened as a LIFF app inside LINE (liff.line.me link): Kring signs the member in there on purpose, so no automatic jump. */
export function isLiffOpen(search: string, ua: string): boolean {
  let hop = false;
  try { hop = sessionStorage.getItem('kr8_liff_ctx') === '1'; } catch { /* ignore */ }
  return /\bLIFF\b/.test(ua) || /[?&](liff\.state|liffClientId)=/.test(search) || hop;
}
