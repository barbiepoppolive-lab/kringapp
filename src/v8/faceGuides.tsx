/**
 * Face-check guide screens the founder picked on 19 Nov (design file face-guides/index.html, picks 1A · 2B · 3C).
 * Used by BOTH face checks (on-phone V5Verify and server V5VerifyAws). One language at a time: every word goes through L(),
 * including the words inside the pictures.
 *   1A OpenInBrowserGuide: Kring opened inside Instagram / TikTok (camera blocked there): two pictures with big 1 and 2
 *      (tap ⋯ top right → tap "Open in browser") + a big Copy link button. LINE keeps its own one-tap "Open in browser".
 *   2B FaceDoneScreen: the selfie in a spinning blue-pink ring, 3 ticks, "Keep using Kring". Pass → the 3rd tick turns green,
 *      "Verified ✓". Pending (the team looks) → "We'll notify you when it passes".
 *   3C CamFixCarousel: the camera was refused (NotAllowedError) in a normal browser: 3 swipe cards (1/3 2/3 3/3), dots, ›,
 *      iPhone Safari or Android Chrome steps picked from the phone, a small switch link, Try again.
 */
import { useEffect, useRef, useState } from 'react';
import { inAppOf, osOf } from './escape';
import { copyText } from './camGuard';
import './faceGuides.css';

type Tx = (en: string) => string;

/** 1A is for these in-app browsers (LINE has its own one-tap button) */
export function guideApp(ua: string): 'instagram' | 'tiktok' | null {
  const a = inAppOf(ua);
  return a === 'instagram' || a === 'tiktok' ? a : null;
}
/** 3C: which steps to show first */
export const camFixOs = (ua: string): 'ios' | 'android' => (osOf(ua) === 'ios' ? 'ios' : 'android');
export const CAM_FIX_STEPS: Record<'ios' | 'android', [string, string, string]> = {
  ios: ['Tap aA next to the link', 'Website Settings', 'Camera → Allow'],
  android: ['Tap the lock icon', 'Choose “Permissions”', 'Camera → Allow'],
};
/** "Title |tail": the part after | is drawn in the blue-pink gradient (the translation keeps the marker) */
function Grad({ text }: { text: string }) {
  const [a, b] = text.split('|');
  return <>{a}{b ? <span className="kfg-grad">{b}</span> : null}</>;
}

// ───────── small picture parts (from the design file) ─────────
const B = '#4f6bff', P = '#ff4fa3';
const GradDef = () => <defs><linearGradient id="kfg-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={B} /><stop offset="1" stopColor={P} /></linearGradient></defs>;
const Finger = ({ x, y, s = 1, bob = false }: { x: number; y: number; s?: number; bob?: boolean }) => (
  <g className={bob ? 'kfg-bob' : ''}><g transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-4 3 a4 4 0 0 1 8 0 v11 a3.5 3.5 0 0 1 7 1 a3.5 3.5 0 0 1 7 1.5 v10 c0 8 -5 12 -12 12 h-3 c-5 0 -8 -3 -10 -7 l-5 -9 a3 3 0 0 1 5 -3 l3 3 z" fill="#fff" stroke="#2a2340" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M4 14 v6 M11 15.5 v5" stroke="#2a2340" strokeWidth="1" opacity=".5" />
  </g></g>
);
const Tap = ({ x, y, r = 11 }: { x: number; y: number; r?: number }) => (
  <><circle cx={x} cy={y} r={r} fill="none" stroke={P} strokeWidth="2.5" /><circle className="kfg-rip" cx={x} cy={y} r="9" fill="none" stroke={P} strokeWidth="2" /></>
);
const Lines = ({ x, y, w }: { x: number; y: number; w: number }) => (
  <><rect x={x} y={y} width={w * 0.6} height="7" rx="3.5" fill="#fff" opacity=".22" /><rect x={x} y={y + 14} width={w} height="5" rx="2.5" fill="#fff" opacity=".1" />
    <rect x={x} y={y + 25} width={w * 0.8} height="5" rx="2.5" fill="#fff" opacity=".1" /></>
);
const TF = { fontFamily: 'Noto Sans Thai, Plus Jakarta Sans, sans-serif' };
const LF = { fontFamily: 'Plus Jakarta Sans, sans-serif' };
const Mini = ({ children }: { children: React.ReactNode }) => <svg viewBox="0 0 160 200" aria-hidden="true"><GradDef /><rect width="160" height="200" fill="#16122a" />{children}</svg>;

function PicDots({ app }: { app: string }) {
  return (
    <svg viewBox="0 0 300 130" aria-hidden="true"><GradDef />
      <rect x="18" y="26" width="264" height="44" rx="12" fill="#fff" />
      <text x="38" y="54" fontSize="18" fill="#111">✕</text>
      <text x="150" y="47" fontSize="13" fontWeight="700" textAnchor="middle" fill="#111" style={LF}>kringapp.com</text>
      <text x="150" y="61" fontSize="10" textAnchor="middle" fill="#888" style={LF}>{app}</text>
      <text x="256" y="54" fontSize="22" fontWeight="800" textAnchor="middle" fill="#111">⋯</text>
      <Tap x={256} y={48} r={15} /><Finger x={262} y={66} s={1.25} bob /><Lines x={30} y={84} w={140} />
    </svg>
  );
}
function PicMenu({ L }: { L: Tx }) {
  return (
    <svg viewBox="0 0 300 118" aria-hidden="true"><GradDef />
      <rect x="18" y="12" width="264" height="98" rx="14" fill="#fff" />
      <text x="38" y="36" fontSize="12.5" fill="#333" style={TF}>{L('Refresh')}</text>
      <line x1="30" y1="45" x2="270" y2="45" stroke="#eee" />
      <text x="38" y="64" fontSize="12.5" fill="#333" style={TF}>{L('Copy link')}</text>
      <rect x="26" y="74" width="248" height="30" rx="9" fill="url(#kfg-g)" />
      <text x="38" y="94" fontSize="13.5" fontWeight="700" fill="#fff" style={TF}>{L('Open in browser')}</text>
      <Finger x={236} y={92} s={1.2} bob />
    </svg>
  );
}
function PicCam({ os, n, L }: { os: 'ios' | 'android'; n: 0 | 1 | 2; L: Tx }) {
  if (os === 'ios' && n === 0) return <Mini><Lines x={16} y={24} w={110} /><rect x="16" y="64" width="128" height="44" rx="10" fill="#fff" opacity=".06" />
    <rect x="8" y="128" width="144" height="36" rx="18" fill="#2c2840" />
    <text x="28" y="151" fontSize="14" fontWeight="700" fill="#fff" style={LF}>aA</text>
    <text x="92" y="150" fontSize="11" fill="#ddd" textAnchor="middle" style={LF}>kringapp.com</text><Tap x={36} y={146} r={15} /><Finger x={44} y={162} s={1.1} /></Mini>;
  if (os === 'ios' && n === 1) return <Mini><Lines x={16} y={18} w={110} />
    <rect x="8" y="58" width="132" height="122" rx="14" fill="#2c2840" />
    <text x="20" y="84" fontSize="11" fill="#ccc" style={TF}>{L('Hide Toolbar')}</text>
    <line x1="18" y1="94" x2="130" y2="94" stroke="rgba(255,255,255,.1)" />
    <text x="20" y="114" fontSize="11" fill="#ccc" style={TF}>{L('Reader')}</text>
    <rect x="12" y="128" width="124" height="38" rx="10" fill="url(#kfg-g)" />
    <circle cx="26" cy="147" r="6" fill="none" stroke="#fff" strokeWidth="2" /><circle cx="26" cy="147" r="2" fill="#fff" />
    <text x="38" y="151" fontSize="11" fontWeight="700" fill="#fff" style={TF}>{L('Website Settings')}</text><Finger x={122} y={152} s={1.05} /></Mini>;
  if (os === 'ios') return <Mini><rect x="0" y="0" width="160" height="200" fill="#1d1934" />
    <text x="80" y="26" fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff" style={LF}>kringapp.com</text>
    <rect x="10" y="40" width="140" height="34" rx="10" fill="#2c2840" />
    <text x="22" y="62" fontSize="12" fontWeight="600" fill="#fff" style={TF}>{L('Camera')}</text>
    <text x="138" y="62" fontSize="11" fill="#9fb0ff" textAnchor="end" style={TF}>{L('Allow')} ›</text>
    <rect x="10" y="82" width="140" height="106" rx="12" fill="#2c2840" />
    <text x="24" y="106" fontSize="11.5" fill="#bbb" style={TF}>{L('Ask')}</text>
    <text x="24" y="136" fontSize="11.5" fill="#bbb" style={TF}>{L('Deny')}</text>
    <rect x="16" y="148" width="128" height="32" rx="9" fill="url(#kfg-g)" />
    <text x="26" y="169" fontSize="12.5" fontWeight="700" fill="#fff" style={TF}>{L('Allow')}</text>
    <path d="M120 164 l5 5 l9 -10" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></Mini>;
  if (n === 0) return <Mini><rect x="0" y="0" width="160" height="38" fill="#262238" />
    <rect x="8" y="7" width="144" height="24" rx="12" fill="#3a3550" />
    <rect x="21" y="18" width="11" height="9" rx="2" fill="#fff" /><path d="M23.5 18 v-3 a3 3 0 0 1 6 0 v3" fill="none" stroke="#fff" strokeWidth="1.8" />
    <text x="40" y="24" fontSize="10.5" fill="#ddd" style={LF}>kringapp.com</text><Tap x={26} y={19} r={13} /><Finger x={30} y={34} s={1.1} />
    <Lines x={16} y={96} w={110} /><rect x="16" y="140" width="128" height="44" rx="10" fill="#fff" opacity=".06" /></Mini>;
  if (n === 1) return <Mini><rect x="0" y="0" width="160" height="38" fill="#262238" /><rect x="8" y="7" width="144" height="24" rx="12" fill="#3a3550" />
    <rect x="6" y="40" width="148" height="140" rx="14" fill="#2c2840" />
    <text x="18" y="64" fontSize="10.5" fill="#ccc" style={TF}>{L('Connection is secure')}</text>
    <line x1="16" y1="76" x2="144" y2="76" stroke="rgba(255,255,255,.1)" />
    <rect x="12" y="86" width="136" height="36" rx="10" fill="url(#kfg-g)" />
    <text x="24" y="109" fontSize="12.5" fontWeight="700" fill="#fff" style={TF}>{L('Permissions')}</text>
    <text x="18" y="148" fontSize="10.5" fill="#ccc" style={TF}>{L('Cookies and site data')}</text><Finger x={124} y={116} s={1.05} /></Mini>;
  return <Mini><rect x="0" y="0" width="160" height="200" fill="#1d1934" />
    <text x="16" y="28" fontSize="12" fontWeight="700" fill="#fff" style={TF}>{L('Permissions')}</text>
    <rect x="10" y="44" width="140" height="50" rx="12" fill="#2c2840" />
    <text x="22" y="66" fontSize="12.5" fontWeight="700" fill="#fff" style={TF}>{L('Camera')}</text>
    <text x="22" y="83" fontSize="10" fill="#9fe9c6" style={TF}>{L('Allow')}</text>
    <rect x="104" y="58" width="36" height="20" rx="10" fill="url(#kfg-g)" /><circle cx="130" cy="68" r="7.5" fill="#fff" />
    <rect x="10" y="104" width="140" height="40" rx="12" fill="#2c2840" opacity=".6" />
    <text x="22" y="129" fontSize="11" fill="#999" style={TF}>{L('Microphone')}</text>
    <rect x="104" y="114" width="36" height="20" rx="10" fill="#4a4562" /><circle cx="114" cy="124" r="7.5" fill="#bbb" /><Tap x={122} y={68} r={18} /></Mini>;
}
const IcoCopy = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="3" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
const IcoBell = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ff8fc6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
const IcoCam = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="13" height="11" rx="3" /><path d="M16 11l5-3v9l-5-3" /></svg>;
const Close = ({ L, onClose }: { L: Tx; onClose: () => void }) => <button type="button" className="kfv2-x kfg-x" aria-label={L('Close')} onClick={onClose}>✕</button>;

// ───────── 1A ─────────
export function OpenInBrowserGuide(props: { L: Tx; app: 'instagram' | 'tiktok'; link: string; onClose: () => void;
  /** a one-tap way out when the phone has one (Android → Chrome intent, iPhone → Safari): a quiet second button under Copy link */
  open?: { kind: 'chrome' | 'safari' | 'browser'; url: string } | null; onOpen?: () => void }) {
  const { L } = props;
  const [copied, setCopied] = useState(false);
  return (
    <div className="kfg" id="verifyOpenGuide" data-app={props.app}>
      <Close L={L} onClose={props.onClose} />
      <div className="kfg-head">
        <h2 className="kfg-h1"><Grad text={L('Open in your browser |first')} /></h2>
        <p className="kfg-sub">{L('The camera doesn’t work inside this app')}</p>
      </div>
      <div className="kfg-step">
        <div className="kfg-numpic"><span className="kfg-bn">1</span><div className="kfg-pic"><PicDots app={props.app === 'tiktok' ? 'TikTok' : 'Instagram'} /></div></div>
        <div className="kfg-stepline">{L('Tap ⋯ top right')}</div>
      </div>
      <div className="kfg-step">
        <div className="kfg-numpic"><span className="kfg-bn">2</span><div className="kfg-pic"><PicMenu L={L} /></div></div>
        <div className="kfg-stepline">{L('Tap “Open in browser”')}</div>
      </div>
      <div className="kfg-foot">
        <button type="button" className="kfg-btn" id="verifyCopyLink" onClick={() => { void copyText(props.link).then(setCopied); }}>
          <IcoCopy />{copied ? L('Link copied') : L('Copy link')}</button>
        <p className="kfg-tiny">{L('then paste in Safari or Chrome')}</p>
        {props.open && <a className="kfg-btn kfg-ghost" id={props.open.kind === 'chrome' ? 'verifyOpenChrome' : 'verifyOpenBrowser'} href={props.open.url} onClick={props.onOpen}>
          {L(props.open.kind === 'chrome' ? 'Open in Chrome' : props.open.kind === 'safari' ? 'Open in Safari' : 'Open in browser')}</a>}
      </div>
    </div>
  );
}

// ───────── 2B ─────────
export type DoneState = 'checking' | 'pass' | 'pending';
export function FaceDoneScreen(props: { L: Tx; state: DoneState; selfie: string | null; sent: boolean; claim?: boolean; onContinue: () => void; onClose: () => void; id?: string }) {
  const { L, state } = props;
  const pass = state === 'pass';
  const checking = L('Checking your face…');   // founder's 2B title: กำลังตรวจ…
  const title = pass ? L('Verified ✓') : checking.endsWith('…') ? `${checking.slice(0, -1)}|…` : checking;
  return (
    <div className="kfg kfg-done" id={props.id || (pass ? 'verifyPass' : state === 'pending' ? 'verifyReview' : 'verifyChecking')} data-done={state}>
      <Close L={L} onClose={props.onClose} />
      <div className={`kfg-ring${pass ? ' ok' : ''}`} aria-hidden="true">
        <svg viewBox="0 0 190 190"><GradDef />
          <circle cx="95" cy="95" r="84" fill="none" stroke="rgba(255,255,255,.1)" strokeWidth="8" />
          <g className={pass ? '' : 'kfg-spin'}><circle cx="95" cy="95" r="84" fill="none" stroke="url(#kfg-g)" strokeWidth="8" strokeLinecap="round" strokeDasharray={pass ? '528 528' : '370 528'} /></g>
        </svg>
        {props.selfie ? <img src={props.selfie} alt="" /> : <span className="kfg-face" />}
        {pass && <span className="kfg-badge">✓</span>}
      </div>
      <h2 className="kfg-h2"><Grad text={title} /></h2>
      {/* 19 Nov founder: a yellow progress bar shows where the check is (fills to ~90% while checking, full when done) */}
      <div className={`kfg-prog ${state}`} id="verifyProgress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={state === 'checking' ? 60 : 100}
        aria-label={state === 'checking' ? L('Checking your face…') : pass ? L('Verified ✓') : L('Our team checks it')}><span /></div>
      <p className="kfg-sub">{pass ? (props.claim ? L('Now pick where to get your prize.') : L('The ✓ is on your card now. Members can see you’re real.'))
        : L('No need to wait here. Go ahead and keep using the app.')}</p>
      <div className="kfg-checks">
        <div><span className="d">✓</span>{L('Selfie taken')}</div>
        <div><span className="d">✓</span>{props.sent ? L('Photo sent') : L('Checked on your phone')}</div>
        <div data-tick3={state}>{pass ? <span className="d">✓</span> : <span className="d w" />}
          {pass ? L('Verified ✓') : state === 'pending' ? L('Our team checks it') : L('Face check · under 1 minute')}</div>
      </div>
      <div className="kfg-foot">
        <button type="button" className="kfg-btn" id="verifyContinue" onClick={props.onContinue}>{props.claim ? L('Back to my prize') : L('Keep using Kring')}</button>
        {!pass && <p className="kfg-tiny kfg-bell"><IcoBell />{L('We’ll notify you when it passes')}</p>}
      </div>
    </div>
  );
}

// ───────── 3C ─────────
export function CamFixCarousel(props: { L: Tx; ua: string; onRetry: () => void; onClose: () => void }) {
  const { L } = props;
  const [os, setOs] = useState<'ios' | 'android'>(() => camFixOs(props.ua));
  const [at, setAt] = useState(0);
  const car = useRef<HTMLDivElement>(null);
  useEffect(() => { setAt(0); car.current?.scrollTo?.({ left: 0 }); }, [os]);
  const go = (i: number) => {
    const c = car.current, n = (i + 3) % 3;
    setAt(n);
    if (c) c.scrollTo?.({ left: n * c.clientWidth, behavior: 'smooth' });
  };
  const onScroll = () => { const c = car.current; if (c && c.clientWidth) setAt(Math.max(0, Math.min(2, Math.round(c.scrollLeft / c.clientWidth)))); };
  const steps = CAM_FIX_STEPS[os];
  return (
    <div className="kfg" id="verifyCamFix" data-os={os}>
      <Close L={L} onClose={props.onClose} />
      <div className="kfg-head kfg-c">
        <h2 className="kfg-h1">{L('Turn on the camera in 3 steps')}</h2>
        <p className="kfg-tiny">{os === 'ios' ? 'iPhone' : 'Android'} · <button type="button" className="kfg-switch" id="verifyCamFixSwitch" onClick={() => setOs(os === 'ios' ? 'android' : 'ios')}>
          {os === 'ios' ? L('Switch to Android') : L('Switch to iPhone')}</button></p>
      </div>
      <div className="kfg-car" ref={car} onScroll={onScroll}>
        {steps.map((t, i) => (
          <div className="kfg-card" key={os + i} data-card={i + 1}>
            <span className="kfg-cnt">{i + 1}/3</span>
            <div className="kfg-pic"><PicCam os={os} n={i as 0 | 1 | 2} L={L} /></div>
            <div className="kfg-stepline kfg-c"><span className="kfg-num">{i + 1}</span>{L(t)}</div>
          </div>
        ))}
      </div>
      <div className="kfg-dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} className={i === at ? 'on' : ''} />)}</div>
      <div className="kfg-foot kfg-nav">
        <button type="button" className="kfg-rnd" id="verifyCamFixNext" aria-label={L('Next')} onClick={() => go(at + 1)}>›</button>
        <button type="button" className="kfg-btn" id="verifyCamRetry" onClick={props.onRetry}><IcoCam />{L('Try again')}</button>
      </div>
    </div>
  );
}
