/** "Add Kring to your home screen" (T-206, reworked 15 Nov · J).
 *  A bottom sheet at the moments members care most: right after a reward claim succeeds, when their first Reel is approved,
 *  and on their second visit on a different Bangkok day (signed-in members only). The older first-value triggers
 *  (first save / hello / Reel posted) still count. Never on the first visit, never inside the installed app, never while
 *  something else is open (upload, chat, claim, any sheet), at most once per session, "Later" = 3 days.
 *  Android Chrome: one-tap Install with the browser's own prompt (captured early in index.html as window.__kr8Install).
 *  iPhone Safari: two pictured steps (Share → Add to Home Screen) + "you sign in once more there" (separate storage).
 *  Inside LINE / Instagram / Facebook / TikTok browsers: "Open in browser" first. */
import { useEffect, useState } from 'react';

type Tx = (en: string) => string;
const KEY = 'kr8_a2hs';
const SESSION_KEY = 'kr8_a2hs_shown';
const EVENT = 'kr8-a2hs';
export const A2HS_SNOOZE_MS = 3 * 864e5;
export type A2hsTrigger = 'save' | 'hello' | 'reel' | 'claim' | 'reel_approved' | 'second_day';
/** due/by: a trigger is waiting · snooze: "Later" until · firstDay: first Bangkok day seen · done: one-time triggers already used */
export interface A2hsState { due?: number; by?: A2hsTrigger; snooze?: number; firstDay?: string; done?: A2hsTrigger[] }

const read = (): A2hsState => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as A2hsState; } catch { return {}; } };
const write = (v: A2hsState) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const shownThisSession = () => { try { return sessionStorage.getItem(SESSION_KEY) === '1'; } catch { return false; } };
const markShown = () => { try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignore */ } };
export const isStandalone = () => { try { return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { return false; } };
const isIos = (ua: string) => /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
/** Bangkok calendar day, e.g. "2026-11-15" */
export const bkkDay = (t: number) => new Date(t + 7 * 3600_000).toISOString().slice(0, 10);

/** In-app browsers that cannot install a web app. */
export function inAppBrowser(ua: string): 'line' | 'other' | null {
  if (/\bLine\//i.test(ua)) return 'line';
  if (/FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Twitter|; wv\)/i.test(ua)) return 'other';
  return null;
}
export type A2hsVariant = 'android' | 'ios' | 'inapp-line' | 'inapp-other' | 'menu';
export function a2hsVariant(ua: string, hasPrompt: boolean): A2hsVariant {
  const inApp = inAppBrowser(ua);
  if (inApp) return inApp === 'line' ? 'inapp-line' : 'inapp-other';
  if (hasPrompt) return 'android';
  if (isIos(ua)) return 'ios';
  return 'menu';
}

/** Pure: the state after a trigger. claim can come back (every new claim); the others count once each. */
export function a2hsAfter(s: A2hsState, by: A2hsTrigger, now: number): A2hsState {
  const once = by !== 'claim';
  if (once && (s.done || []).includes(by)) return s;
  if (['save', 'hello', 'reel'].includes(by) && (s.done || []).some((d) => ['save', 'hello', 'reel'].includes(d))) return s;   // first value: only the first one
  return { ...s, due: now, by, done: once ? [...(s.done || []), by] : s.done };
}
/** Pure: show the sheet now? */
export function a2hsShouldShow(s: A2hsState, now: number, standalone: boolean, opts: { blocked?: boolean; shownThisSession?: boolean } = {}): boolean {
  return !standalone && !opts.blocked && !opts.shownThisSession && !!s.due && !(s.snooze && s.snooze > now);
}
export function a2hsDismissed(s: A2hsState, now: number): A2hsState {
  return { ...s, due: undefined, snooze: now + A2HS_SNOOZE_MS };
}
/** Pure: J5, a signed-in member's visit on a later Bangkok day than the first one seen → 'second_day' trigger. */
export function a2hsVisit(s: A2hsState, now: number): A2hsState {
  const day = bkkDay(now);
  if (!s.firstDay) return { ...s, firstDay: day };
  if (day !== s.firstDay) return a2hsAfter(s, 'second_day', now);
  return s;
}

function fire(by: A2hsTrigger) {
  const before = read();
  const next = a2hsAfter(before, by, Date.now());
  if (next === before) return;
  write(next);
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
}
/** Call after the member's first save / hello sent / Reel posted. */
export const a2hsFirstValue = (by: 'save' | 'hello' | 'reel') => fire(by);
/** Call after a reward claim succeeded, and when the member's first Reel is seen approved. */
export const a2hsMoment = (by: 'claim' | 'reel_approved') => fire(by);
/** Call once per app start for a signed-in member (never before sign-up). */
export function a2hsSignedInVisit() {
  const before = read();
  const next = a2hsVisit(before, Date.now());
  if (next === before) return;
  write(next);
  try { window.dispatchEvent(new Event(EVENT)); } catch { /* ignore */ }
}

/** "Open in your browser" link: LINE opens a URL with openExternalBrowser=1 in the phone's own browser. */
export function externalBrowserUrl(href: string): string {
  const u = new URL(href);
  u.searchParams.set('openExternalBrowser', '1');
  return u.toString();
}

const OPEN_EVENT = 'kr8-a2hs-open';
/** Opens the install sheet now (the "Install app" button on Me, or /app/?install=1 from the website). */
export function openInstallSheet() { try { window.dispatchEvent(new Event(OPEN_EVENT)); } catch { /* ignore */ } }
/** "ติดตั้งแอป · Install app" button for the top of Me: only when Kring is not already installed. */
export function InstallChip(props: { L: Tx; id?: string }) {
  if (isStandalone()) return null;
  return (
    <button type="button" className="a2s-chip" id={props.id || 'installChip'} onClick={openInstallSheet}>
      <span className="a2s-chip-ic" aria-hidden="true"><i /><i /></span>{props.L('Install app')}
    </button>
  );
}

type PromptEv = { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
const promptEv = () => (window as unknown as { __kr8Install?: PromptEv | null }).__kr8Install || null;

export function A2HSBanner(props: { L: Tx; blocked?: boolean; force?: A2hsVariant }) {
  const { L } = props;
  const [show, setShow] = useState(false);
  const [steps, setSteps] = useState(false);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const variant: A2hsVariant = props.force || a2hsVariant(ua, !!promptEv());
  useEffect(() => {
    // asked for on purpose (button, or ?install=1 from the website): open now, whatever the snooze says
    const open = () => { if (!isStandalone()) { markShown(); setShow(true); } };
    window.addEventListener(OPEN_EVENT, open);
    try { if (new URLSearchParams(location.search).get('install') === '1') open(); } catch { /* ignore */ }
    return () => window.removeEventListener(OPEN_EVENT, open);
  }, []);
  useEffect(() => {
    if (props.force) { setShow(true); return; }
    const check = () => {
      const ok = a2hsShouldShow(read(), Date.now(), isStandalone(), { blocked: props.blocked, shownThisSession: shownThisSession() });
      if (ok) markShown();
      setShow((was) => was || ok);
    };
    check();
    window.addEventListener(EVENT, check);
    const t = setInterval(check, 4000);
    return () => { window.removeEventListener(EVENT, check); clearInterval(t); };
  }, [props.blocked, props.force]);
  if (!show) return null;
  const later = () => { write(a2hsDismissed(read(), Date.now())); setShow(false); };
  const install = async () => {
    const ev = promptEv();
    if (!ev) { setSteps(true); return; }
    try { await ev.prompt(); await ev.userChoice; } catch { /* ignore */ }
    (window as unknown as { __kr8Install?: null }).__kr8Install = null;   // a prompt can be used once
    later();
  };
  const head = (
    <>
      <span className="a2s-icon" aria-hidden="true"><i /><i /></span>
      <h2>{L('Add Kring to your home screen · opens fast like an app')}</h2>
      <ul className="a2s-why">
        <li>🎁 {L('Your rewards, one tap away')}</li>
        <li>♥ {L('See new likes on your Reels first')}</li>
      </ul>
    </>
  );
  let body: React.ReactNode;
  if (variant === 'inapp-line' || variant === 'inapp-other') {
    body = (
      <>
        <p className="a2s-step"><b>1</b>{variant === 'inapp-line' ? L('Open Kring in your phone’s browser') : L('Tap ⋯ then “Open in browser”')}</p>
        <p className="a2s-step dim"><b>2</b>{L('Then tap “Add to Home Screen” there')}</p>
        {variant === 'inapp-line' ? <a className="a2s-go" id="a2hsOpen" href={externalBrowserUrl(window.location.href)}>{L('Open in browser')}</a> : null}
      </>
    );
  } else if (variant === 'android' && !steps) {
    body = <button type="button" className="a2s-go" id="a2hsAdd" onClick={() => void install()}>{L('Install')}</button>;
  } else if (variant === 'ios') {
    body = (
      <>
        <div className="a2s-ios">
          <div className="a2s-pic"><span className="share" aria-hidden="true" /><small>{L('Tap Share ⬆️ at the bottom')}</small></div>
          <div className="a2s-pic"><span className="plus" aria-hidden="true">＋</span><small>{L('Tap “Add to Home Screen”')}</small></div>
        </div>
        <p className="a2s-note">{L('The home-screen app keeps its own sign-in: sign in once more there with your email code.')}</p>
      </>
    );
  } else {
    body = (
      <div className="a2s-ios">
        <div className="a2s-pic"><span className="plus" aria-hidden="true">⋮</span><small>{L('Tap ⋮ at the top right')}</small></div>
        <div className="a2s-pic"><span className="plus" aria-hidden="true">＋</span><small>{L('Tap “Add to Home Screen”')}</small></div>
      </div>
    );
  }
  return (
    <div className="a2s-wrap" id="a2hs" data-variant={variant}>
      <button type="button" className="a2s-scrim" aria-label={L('Close')} onClick={later} />
      <div className="a2s" role="dialog" aria-modal="true" aria-label={L('Add Kring to your home screen')}>
        <i className="a2s-grab" aria-hidden="true" />
        {head}
        {body}
        <button type="button" className="a2s-later" id="a2hsLater" onClick={later}>{L('Later')}</button>
      </div>
    </div>
  );
}
