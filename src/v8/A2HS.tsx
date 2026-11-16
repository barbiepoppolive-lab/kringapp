/** "Add Kring to your home screen" (T-206, reworked 15 Nov · J).
 *  A bottom sheet at the moments members care most: right after a reward claim succeeds, when their first Reel is approved,
 *  and on their second visit on a different Bangkok day (signed-in members only). The older first-value triggers
 *  (first save / hello / Reel posted) still count. Never on the first visit, never inside the installed app, never while
 *  something else is open (upload, chat, claim, any sheet), at most once per session, "Later" = 3 days.
 *  Android Chrome: one-tap Install with the browser's own prompt (captured early in index.html as window.__kr8Install).
 *  iPhone Safari: two pictured steps (Share → Add to Home Screen) + "you sign in once more there" (separate storage).
 *  Inside LINE / Instagram / Facebook / TikTok browsers: "Open in browser" first. */
import { useEffect, useRef, useState } from 'react';
import './a2hs.css';

type Tx = (en: string) => string;
const KEY = 'kr8_a2hs';
const SESSION_KEY = 'kr8_a2hs_shown';
const EVENT = 'kr8-a2hs';
/** audit P3-6: the sheet waits this long after its trigger, and until the member has not scrolled for A2HS_STILL_MS */
export const A2HS_SETTLE_MS = 3000, A2HS_STILL_MS = 2500;
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
/** ?install=1 (the website's Install button, 16 Nov): the install step comes FIRST. Read once per page load, then removed from
 *  the address bar (so a home-screen app saved from this page never reopens the sheet). While it is on, the app holds back
 *  sign-in and "Make your card" until the install sheet is closed. Inside the installed app it is ignored. */
let installAsk: boolean | null = null;
export function installAskIn(href: string): boolean {
  try { return new URL(href).searchParams.get('install') === '1'; } catch { return false; }
}
export function takeInstallAsk(): boolean {
  if (installAsk !== null) return installAsk;
  installAsk = false;
  try {
    if (installAskIn(window.location.href)) {
      installAsk = !isStandalone();
      const u = new URL(window.location.href);
      u.searchParams.delete('install');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  } catch { /* ignore */ }
  return installAsk;
}
/** tests only */
export function resetInstallAsk() { installAsk = null; }
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
const W = () => window as unknown as { __kr8Install?: PromptEv | null; __kr8BipAt?: number; __kr8Installed?: boolean };
const promptEv = () => (typeof window === 'undefined' ? null : W().__kr8Install || null);
/** How long the sheet waits for the browser's install offer before showing the manual way (16 Nov). */
export const BIP_WAIT_MS = 8000;

/** Browser family, for the one-line manual step and the ?debug=1 line. Brave hides in a Chrome UA but exposes navigator.brave. */
export type BrowserFamily = 'samsung' | 'brave' | 'opera' | 'miui' | 'edge' | 'firefox' | 'chrome' | 'safari' | 'other';
export function browserFamily(ua: string, brave = false): BrowserFamily {
  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (brave) return 'brave';
  if (/OPR\/|Opera/i.test(ua)) return 'opera';
  if (/MiuiBrowser|XiaoMi/i.test(ua)) return 'miui';
  if (/EdgA?\//i.test(ua)) return 'edge';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/iPhone|iPad|iPod/i.test(ua) && !/CriOS/i.test(ua)) return 'safari';
  if (/Chrome\//i.test(ua)) return 'chrome';
  return 'other';
}
/** One line: where this browser keeps "install" / "add to home screen". */
export function manualStep(f: BrowserFamily): string {
  switch (f) {
    case 'samsung': return 'Tap ≡ at the bottom, then “Add page to” → “Home screen”';
    case 'brave': return 'Tap ⋮ at the bottom right, then “Add to Home screen”';
    case 'opera': return 'Tap ⋮ at the top right, then “Add to” → “Home screen”';
    case 'miui': return 'Tap ≡ at the bottom, then “Add to home screen”';
    case 'firefox': return 'Tap ⋮, then “Install” (or “Add to Home screen”)';
    case 'edge': return 'Tap ⋯ at the bottom, then “Add to phone”';
    default: return 'Tap ⋮ at the top right, then “Install app” or “Add to Home screen”';
  }
}
/** Pure: what the Install button shows right now. */
export function installState(hasPrompt: boolean, waitedMs: number, installed: boolean): 'installed' | 'ready' | 'preparing' | 'manual' {
  if (installed) return 'installed';
  if (hasPrompt) return 'ready';
  return waitedMs < BIP_WAIT_MS ? 'preparing' : 'manual';
}

export function A2HSBanner(props: { L: Tx; blocked?: boolean; force?: A2hsVariant; onClose?: () => void }) {
  const { L } = props;
  const [show, setShow] = useState(false);
  const [hasPrompt, setHasPrompt] = useState(!!promptEv());
  const [openedAt, setOpenedAt] = useState(0);
  const [now, setNow] = useState(0);
  const [installed, setInstalled] = useState(false);
  const [brave, setBrave] = useState(false);
  const [busy, setBusy] = useState(false);
  const wantRef = useRef(false);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const variant: A2hsVariant = props.force || a2hsVariant(ua, hasPrompt || !isIos(ua));
  const family = browserFamily(ua, brave);
  const debug = (() => { try { return new URLSearchParams(location.search).get('debug') === '1'; } catch { return false; } })();
  useEffect(() => {
    // asked for on purpose (button, or ?install=1 from the website): open now, whatever the snooze says
    const open = () => { if (!isStandalone()) { markShown(); setShow(true); } };
    window.addEventListener(OPEN_EVENT, open);
    if (takeInstallAsk()) open();
    // the browser's install offer can arrive seconds after the page: switch to one-tap the moment it does
    const bip = () => setHasPrompt(true);
    const done = () => { setInstalled(true); setHasPrompt(false); };
    window.addEventListener('kr8-bip', bip);
    window.addEventListener('appinstalled', done);
    try { (navigator as unknown as { brave?: { isBrave?: () => Promise<boolean> } }).brave?.isBrave?.().then((b) => setBrave(!!b)).catch(() => undefined); } catch { /* ignore */ }
    try {
      const g = (navigator as unknown as { getInstalledRelatedApps?: () => Promise<unknown[]> }).getInstalledRelatedApps;
      if (g) g.call(navigator).then((a) => { if (a && a.length) setInstalled(true); }).catch(() => undefined);
    } catch { /* ignore */ }
    if (W().__kr8Installed) setInstalled(true);
    return () => { window.removeEventListener(OPEN_EVENT, open); window.removeEventListener('kr8-bip', bip); window.removeEventListener('appinstalled', done); };
  }, []);
  useEffect(() => {
    if (props.force) { setShow(true); return; }
    // audit P3-6: never pop up mid-scroll or the instant a Save / Reel lands: wait until the member has been still for a moment
    let lastMove = 0;
    const moved = () => { lastMove = Date.now(); };
    document.addEventListener('scroll', moved, { capture: true, passive: true });
    document.addEventListener('touchmove', moved, { capture: true, passive: true });
    const check = () => {
      const st = read(), t = Date.now();
      if (st.due && (t - st.due < A2HS_SETTLE_MS || t - lastMove < A2HS_STILL_MS)) return;   // checked again in 4 s
      const ok = a2hsShouldShow(st, t, isStandalone(), { blocked: props.blocked, shownThisSession: shownThisSession() });
      if (ok) markShown();
      setShow((was) => was || ok);
    };
    check();
    window.addEventListener(EVENT, check);
    const t = setInterval(check, 4000);
    return () => {
      window.removeEventListener(EVENT, check); clearInterval(t);
      document.removeEventListener('scroll', moved, { capture: true });
      document.removeEventListener('touchmove', moved, { capture: true });
    };
  }, [props.blocked, props.force]);
  // a clock while the sheet waits for the install offer (stops once it is here or the wait is over)
  useEffect(() => {
    if (!show) return;
    const t0 = Date.now();
    setOpenedAt(t0); setNow(t0);
    const t = setInterval(() => { setNow(Date.now()); if (Date.now() - t0 > BIP_WAIT_MS + 500) clearInterval(t); }, 250);
    return () => clearInterval(t);
  }, [show]);
  const later = () => { write(a2hsDismissed(read(), Date.now())); setShow(false); props.onClose?.(); };
  const install = async () => {
    const ev = promptEv();
    if (!ev) { wantRef.current = true; return; }   // tapped while preparing: prompt as soon as the offer arrives
    setBusy(true);
    try { await ev.prompt(); const c = await ev.userChoice; if (c?.outcome === 'accepted') setInstalled(true); } catch { /* ignore */ }
    W().__kr8Install = null;   // a prompt can be used once
    setHasPrompt(false); setBusy(false);
    later();
  };
  useEffect(() => { if (hasPrompt && wantRef.current) { wantRef.current = false; void install(); } }, [hasPrompt]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!show) return null;
  const state = installState(hasPrompt, now - openedAt, installed);
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
  const manual = (
    <details className="a2s-manual" id="a2hsManual" open={state === 'manual'}>
      <summary>{L('Install manually')}</summary>
      <p className="a2s-one" id="a2hsStep">{L(manualStep(family))}</p>
    </details>
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
  } else if (state === 'installed') {
    body = (
      <>
        <p className="a2s-note" id="a2hsInstalled">{L('Kring is already on your home screen. Open it from there.')}</p>
        <a className="a2s-go" id="a2hsOpenApp" href="/app/?src=pwa">{L('Open app')}</a>
      </>
    );
  } else {
    // Android / desktop browsers: always one big Install button; it waits for the browser's offer, then installs in one tap
    body = (
      <>
        <button type="button" className={`a2s-go${state === 'preparing' ? ' wait' : ''}`} id="a2hsAdd" data-state={state} disabled={busy || state === 'manual'}
          onClick={() => void install()}>
          {state === 'preparing' ? <><i className="a2s-spin" aria-hidden="true" />{L('Preparing…')}</> : state === 'manual' ? L('Install from the browser menu') : L('Install')}
        </button>
        {state !== 'ready' ? manual : null}
      </>
    );
  }
  return (
    <div className="a2s-wrap" id="a2hs" data-variant={variant} data-state={state}>
      <button type="button" className="a2s-scrim" aria-label={L('Close')} onClick={later} />
      <div className="a2s" role="dialog" aria-modal="true" aria-label={L('Add Kring to your home screen')}>
        <i className="a2s-grab" aria-hidden="true" />
        {head}
        {body}
        <button type="button" className="a2s-later" id="a2hsLater" onClick={later}>{L('Later')}</button>
        {debug ? (
          <p className="a2s-debug" id="a2hsDebug">
            {`ua=${family} · offer=${hasPrompt ? `yes@${W().__kr8BipAt ?? '?'}ms` : 'no'} · state=${state} · standalone=${isStandalone() ? 'yes' : 'no'} · installed=${installed ? 'yes' : 'no'} · waited=${Math.round((now - openedAt) / 100) / 10}s`}
            <br />{ua.slice(0, 140)}
          </p>
        ) : null}
      </div>
    </div>
  );
}
