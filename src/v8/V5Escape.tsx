/** "Open Kring in your phone's browser" (16 Nov). Runs once on the first open from an in-app browser (LINE / Instagram /
 *  Facebook / Messenger / TikTok) only when an action needs the real browser: sign-in, install, Turn on dings (T301-020). Tries the automatic jump once
 *  (LINE, Android), otherwise shows one big button. Never blocks browsing: "Stay here" closes it. Logic in escape.ts. */
import { useEffect, useRef, useState } from 'react';
import { ESCAPE_EVENT, escapeFlags, escapeOnStart, escapePlan, markAutoTried, markFirstShown, type EscapePlan } from './escape';
import { v5HandoffCreate, v5StoredRef } from './v5Live';
import './push.css';

type Tx = (en: string) => string;
const CODE_MS = 150_000;   // hand-off codes last 3 minutes: a fresh one every 2.5 min while the screen is open

// T301-020: one language per screen (the active one); the English line under the Thai is gone
function Two(props: { L: Tx; lang: string; en: string; cls?: string }) {
  return <span className={props.cls}>{props.L(props.en)}</span>;
}

export function EscapeScreen(props: { L: Tx; lang: string; liff: boolean; signedIn: boolean; authReady: boolean; ua?: string }) {
  const { L, lang } = props;
  const ua = props.ua ?? (typeof navigator === 'undefined' ? '' : navigator.userAgent);
  const [plan, setPlan] = useState<EscapePlan | null>(null);
  const [show, setShow] = useState(false);
  const started = useRef(false);
  const dingsRef = useRef(false);
  const build = async (): Promise<EscapePlan | null> => {
    const ho = props.signedIn ? await v5HandoffCreate().catch(() => null) : null;
    return escapePlan(window.location.href, ua, { liff: props.liff, ho, ref: v5StoredRef(), dings: dingsRef.current });
  };
  // first open: once, after we know whether the member is signed in (the code carries the sign-in)
  useEffect(() => {
    if (started.current || !props.authReady) return;
    started.current = true;
    const base = escapePlan(window.location.href, ua, { liff: props.liff });
    const start = escapeOnStart(base, escapeFlags(window.location.search));
    if (start.kind === 'none') return;
    markFirstShown();
    void build().then((p) => {
      if (!p) return;
      setPlan(p);
      if (start.kind === 'auto' && p.auto) {
        markAutoTried();
        try { window.location.href = p.auto; } catch { /* blocked */ }
        // still here a moment later (the app blocked it, or Chrome is missing): show the buttons
        setTimeout(() => { if (document.visibilityState === 'visible') setShow(true); }, 1500);
      } else setShow(true);
    });
  }, [props.authReady]);   // eslint-disable-line react-hooks/exhaustive-deps
  // Turn on dings in an in-app browser
  useEffect(() => {
    const open = (e: Event) => { dingsRef.current = (e as CustomEvent).detail === 'dings'; void build().then((p) => { if (p) { setPlan(p); setShow(true); } }); };
    window.addEventListener(ESCAPE_EVENT, open);
    return () => window.removeEventListener(ESCAPE_EVENT, open);
  });
  useEffect(() => {
    if (!show) return;
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setShow(false); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [show]);
  useEffect(() => {
    if (!show) return;
    const t = setInterval(() => { void build().then((p) => p && setPlan(p)); }, CODE_MS);
    return () => clearInterval(t);
  }, [show]);   // eslint-disable-line react-hooks/exhaustive-deps
  if (!show || !plan) return null;
  const go = (e: React.MouseEvent) => {
    if (!(props.liff && plan.app === 'line')) return;   // a normal link: the tap opens it
    e.preventDefault();
    void import('@line/liff').then((m) => (m.default as unknown as { openWindow: (o: { url: string; external: boolean }) => void }).openWindow({ url: plan.button.url.replace(/[?&]openExternalBrowser=1/, ''), external: true }))
      .catch(() => { window.location.href = plan.button.url; });
  };
  const label = plan.button.kind === 'chrome' ? 'Open in Chrome' : plan.button.kind === 'safari' ? 'Open in Safari' : 'Open in browser';
  return (
    <div className="kesc" id="escape" data-app={plan.app} data-os={plan.os} role="dialog" aria-modal="true" aria-label={L('Open Kring in your phone’s browser')}
      onClick={(e) => { if (e.target === e.currentTarget) setShow(false); }}>
      {plan.menuHint ? (
        <div className="kesc-hint" id="escHint" aria-hidden="true"><i className="kesc-arrow" /><Two L={L} lang={lang} en="Tap ⋯ then Open in browser" /></div>
      ) : null}
      <div className="kesc-box">
        <span className="kpa-ic kesc-ic" aria-hidden="true"><i /><i /><b /></span>
        <h2><Two L={L} lang={lang} en="Open Kring in your phone’s browser" /></h2>
        {/* audit P3-7: Thai and English ran together ("…ในแตะเดียวFor dings"): each line is its own block now */}
        <p className="kesc-why"><Two L={L} lang={lang} en="For dings and one-tap sign-in" />{props.signedIn ? <Two L={L} lang={lang} en="You stay signed in" /> : null}</p>
        <a className="kesc-go" id="escGo" href={plan.button.url} data-kind={plan.button.kind} onClick={go}><Two L={L} lang={lang} en={label} /></a>
        {plan.alt ? <a className="kesc-alt" id="escAlt" href={plan.alt}><Two L={L} lang={lang} en="Other browser" /></a> : null}
        <button type="button" className="kesc-stay" id="escStay" onClick={() => setShow(false)}><Two L={L} lang={lang} en="Stay here" /></button>
      </div>
    </div>
  );
}
