/** "Add Kring to your home screen" (T-206). Shown once right after the member's first value — first save, first hello sent
 *  or first Reel posted, whichever comes first — never on first open and never inside the installed app.
 *  Android/Chrome: the browser's own install prompt. iPhone: two pictured steps (Share → Add to Home Screen).
 *  Inside LINE / Instagram / Facebook / TikTok browsers: "open in your browser" instead. Dismiss = 7 days. */
import { useEffect, useState } from 'react';

type Tx = (en: string) => string;
const KEY = 'kr8_a2hs';
const EVENT = 'kr8-a2hs';
export const A2HS_SNOOZE_MS = 7 * 864e5;
export type A2hsTrigger = 'save' | 'hello' | 'reel';
export interface A2hsState { due?: number; by?: A2hsTrigger; snooze?: number }

const read = (): A2hsState => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') as A2hsState; } catch { return {}; } };
const write = (v: A2hsState) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode */ } };
const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true; } catch { return false; } };
const isIos = (ua: string) => /iphone|ipad|ipod/i.test(ua);

/** In-app browsers that cannot install a web app. */
export function inAppBrowser(ua: string): 'line' | 'other' | null {
  if (/\bLine\//i.test(ua)) return 'line';
  if (/FBAN|FBAV|FB_IAB|Instagram|TikTok|musical_ly|BytedanceWebview|Twitter|; wv\)/i.test(ua)) return 'other';
  return null;
}

/** Pure: the state after a first-value action. Only the first action counts; later ones change nothing. */
export function a2hsAfter(s: A2hsState, by: A2hsTrigger, now: number): A2hsState {
  return s.due ? s : { ...s, due: now, by };
}
/** Pure: show the sheet now? */
export function a2hsShouldShow(s: A2hsState, now: number, isStandalone: boolean): boolean {
  return !isStandalone && !!s.due && !(s.snooze && s.snooze > now);
}
export function a2hsDismissed(s: A2hsState, now: number): A2hsState {
  return { ...s, snooze: now + A2HS_SNOOZE_MS };
}

/** Call after the member's first save / hello sent / Reel posted. */
export function a2hsFirstValue(by: A2hsTrigger) {
  const before = read();
  const next = a2hsAfter(before, by, Date.now());
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

export function A2HSBanner(props: { L: Tx }) {
  const { L } = props;
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  const inApp = inAppBrowser(ua);
  useEffect(() => {
    const check = () => setShow(a2hsShouldShow(read(), Date.now(), standalone()));
    check();
    window.addEventListener(EVENT, check);
    const t = setInterval(check, 4000);
    return () => { window.removeEventListener(EVENT, check); clearInterval(t); };
  }, []);
  if (!show) return null;
  const later = () => { write(a2hsDismissed(read(), Date.now())); setShow(false); };
  const add = async () => {
    const ev = (window as unknown as { __kr8Install?: { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> } }).__kr8Install;
    if (ev) { try { await ev.prompt(); await ev.userChoice; } catch { /* ignore */ } later(); return; }
    setIos(true);
  };
  if (inApp) {
    return (
      <div className="a2hs" role="dialog" aria-label={L('Add Kring to your home screen')} id="a2hs" data-inapp={inApp}>
        <span className="a2hs-ic" aria-hidden="true"><i /><i /></span>
        <div className="a2hs-t">
          <b>{L('Open Kring in your browser to add it to your home screen')}</b>
          {inApp === 'other' && <small>{L('Tap ⋯ then “Open in browser”')}</small>}
        </div>
        {inApp === 'line' && <a className="a2hs-go" id="a2hsOpen" href={externalBrowserUrl(window.location.href)}>{L('Open in browser')}</a>}
        <button type="button" className="a2hs-x" aria-label={L('Not now')} onClick={later}>×</button>
      </div>
    );
  }
  return (
    <div className="a2hs" role="dialog" aria-label={L('Add Kring to your home screen')} id="a2hs">
      {!ios ? (
        <>
          <span className="a2hs-ic" aria-hidden="true"><i /><i /></span>
          <div className="a2hs-t"><b>{L('Add Kring to your home screen')}</b><small>{L('Opens full screen, like an app. Free.')}</small></div>
          <button type="button" className="a2hs-go" id="a2hsAdd" onClick={add}>{L('Add')}</button>
          <button type="button" className="a2hs-x" aria-label={L('Not now')} onClick={later}>×</button>
        </>
      ) : (
        <>
          <div className="a2hs-t">
            <b>{isIos(ua) ? L('On iPhone: 2 steps') : L('In your browser menu')}</b>
            <small>1. {isIos(ua) ? L('Tap Share ⬆️ at the bottom') : L('Tap ⋮ at the top right')}</small>
            <small>2. {L('Tap “Add to Home Screen”')}</small>
          </div>
          <button type="button" className="a2hs-x" aria-label={L('Close')} onClick={later}>×</button>
        </>
      )}
    </div>
  );
}
