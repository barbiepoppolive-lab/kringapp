/**
 * "Get verified ✓", server version (0125, 19 Nov). Used only when kr8_rings_config face_aws_on = 1 (V5VerifyPick decides);
 * otherwise the on-phone check (V5Verify) runs unchanged.
 * Nothing to download: the phone shows the front camera with the oval and takes 3 small photos by itself, each after a short
 * 3-2-1 (look straight → turn a little left → turn a little right). The edge function face-check-aws asks AWS Rekognition and
 * answers in 1–2 s: ✓ verified (most members) · "Done ✓, we'll confirm shortly" (the founder looks) · a friendly retry.
 * Too dark → the countdown waits and says "Too dark — face a light" (the same tiny brightness sample as the phone check).
 */
import { useEffect, useRef, useState } from 'react';
import { brightness } from './v5Mp';
import { DARK } from './verifyLive';
import { v5AccountCheckRequest, v5ErrCode, v5FaceAwsCheck, v5HandoffCreate, v5LogClient } from './v5Live';
import { CAM_STEPS, camDenied, camFix, copyText, firstFrame, inAppBrowser, withTimeout } from './camGuard';
import type { CamFix } from './camGuard';
import { CamFixCarousel, FaceDoneScreen, OpenInBrowserGuide, guideApp } from './faceGuides';
import type { VerifyMode } from './V5Verify';
import './verify.css';
import './verifyAws.css';

type Tx = (en: string) => string;
type Stage = 'needphoto' | 'intro' | 'camera' | 'sending' | 'pass' | 'review' | 'retry' | 'limit' | 'error' | 'refused';
export type AwsStep = 'straight' | 'left' | 'right';
export const AWS_STEPS: readonly AwsStep[] = ['straight', 'left', 'right'];

/** the consent text of the server check (photos go to AWS Australia, Sydney); the database asks for at least this version */
export const FACE_AWS_CONSENT_VERSION = 'face-2026-11-19a';
const CONSENT_KEY = 'kr8_face_aws_consent';
const consentSaved = () => { try { return localStorage.getItem(CONSENT_KEY) === FACE_AWS_CONSENT_VERSION; } catch { return false; } };
const saveConsent = () => { try { localStorage.setItem(CONSENT_KEY, FACE_AWS_CONSENT_VERSION); } catch { /* private mode */ } };

export const TICK_MS = 650;          // one countdown number
export const COUNT_FROM = 3;         // 3-2-1, then the photo
export const SETTLE_MS = 700;        // after "turn left/right" shows, time to turn before the countdown starts
export const FRAME_W = 480;          // photo width sent to the server
export const FRAME_Q = 0.8;          // JPEG quality
export const DARK_POLL_MS = 400;
export const SEND_MS = 25000;        // the server answers in 1–2 s; after this the member gets "try again"

/** the size of the photo sent: at most FRAME_W wide, same shape as the camera picture */
export function frameSize(vw: number, vh: number, maxW = FRAME_W): { w: number; h: number } {
  if (!vw || !vh) return { w: 0, h: 0 };
  const k = Math.min(1, maxW / vw);
  return { w: Math.round(vw * k), h: Math.round(vh * k) };
}
/** the server's retry reason → the line the member reads (English key, L() translates) */
export const AWS_RETRY_TEXT: Record<string, string> = {
  no_face: 'We couldn’t see your face clearly. Try again in good light.',
  many_faces: 'Only you in the picture',
  too_dark: 'Too dark — face a light',
  too_blurry: 'The photo was blurry. Hold the phone still and try again.',
  too_far: 'Move closer',
  eyes_closed: 'Keep your eyes open and look at the camera.',
  sunglasses: 'Take off your sunglasses and try again.',
  look_straight: 'Look straight at the camera',
  // 20 Nov: either direction counts and some phones mirror the preview, so the retry never names a side
  turn_left_missing: 'Turn your head a little more to the side.',
  turn_right_missing: 'Turn your head a little more to the side.',
  network: 'No connection. Try again in a moment.',
};
export const retryText = (why: string | null | undefined) => AWS_RETRY_TEXT[why || ''] || AWS_RETRY_TEXT.no_face;

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);
const device = () => (navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/) || ['other'])[0];
const VIDEO_ATTRS = { 'x5-playsinline': 'true', 'webkit-playsinline': 'true', 'x5-video-player-type': 'h5-page', controlsList: 'nodownload nofullscreen noremoteplayback', disablePictureInPicture: true, disableRemotePlayback: true } as Record<string, unknown>;
const wait = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/** one photo of the camera picture (raw, not mirrored: what the server checks), FRAME_W wide JPEG */
function grab(v: HTMLVideoElement): Promise<Blob> {
  const { w, h } = frameSize(v.videoWidth, v.videoHeight);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d')!.drawImage(v, 0, 0, w, h);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('FRAME'))), 'image/jpeg', FRAME_Q));
}

export function V5VerifyAws(props: { L: Tx; photo: string | null; nudge?: boolean; mode?: VerifyMode; onClose: () => void; onSent: () => void; onVerified?: () => void;
  onAddPhoto: () => void; errText: (e: unknown) => string; onFeed?: () => void;
  /** the server says the switch is off (or this phone can't do it): the picker shows the on-phone check instead */
  onFallback?: (why: string) => void }) {
  const { L } = props;
  const mode: VerifyMode = props.mode || 'me';
  const [stage, setStage] = useState<Stage>(!props.photo ? 'needphoto' : consentSaved() && !props.nudge ? 'camera' : 'intro');
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState<AwsStep>('straight');
  const [count, setCount] = useState<number | null>(null);
  const [shot, setShot] = useState(0);            // photos taken (0–3)
  const [dark, setDark] = useState(false);
  const [why, setWhy] = useState<string>('no_face');
  const [left, setLeft] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [camWhy, setCamWhy] = useState('');
  const [fix, setFix] = useState<CamFix | null>(null);
  const [copied, setCopied] = useState(false);
  const [selfie, setSelfie] = useState<string | null>(null);   // the straight photo, shown in the 2B ring
  const inApp = inAppBrowser(ua());
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const darkRef = useRef(false);

  const stop = () => {
    runRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => {
    if (stage === 'camera') void start();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => stop, []);
  useEffect(() => () => { if (selfie) URL.revokeObjectURL(selfie); }, [selfie]);
  const close = () => { stop(); props.onClose(); };
  const toFeed = () => { stop(); (props.onFeed || props.onClose)(); };

  // "Too dark": a 24×18 sample of the picture every 400 ms; two dark readings in a row (a starting camera is black for a moment)
  useEffect(() => {
    if (stage !== 'camera') { setDark(false); darkRef.current = false; return undefined; }
    let low = 0;
    const t = window.setInterval(() => {
      const v = videoRef.current;
      const b = v && v.readyState >= 2 ? brightness(v) : null;
      if (b === null) return;
      low = b < DARK ? low + 1 : 0;
      darkRef.current = low >= 2;
      setDark(low >= 2);
    }, DARK_POLL_MS);
    return () => clearInterval(t);
  }, [stage]);

  // camera blocked: the same help as the phone check (open in Chrome / Safari with a one-time sign-in code, or allow steps)
  useEffect(() => {
    if (stage !== 'error' || !camWhy) return undefined;
    let live = true;
    const denied = camDenied(camWhy);
    setCopied(false);
    setFix(camFix(window.location.href, ua(), null, denied));
    if (camFix(window.location.href, ua(), null, denied).open) void v5HandoffCreate().then((ho) => { if (live) setFix(camFix(window.location.href, ua(), ho, denied)); }).catch(() => undefined);
    return () => { live = false; };
  }, [stage, camWhy]);

  const start = async () => {
    setErr(''); setCamWhy(''); setStep('straight'); setShot(0); setCount(null);
    setStage('camera');
    const run = ++runRef.current;
    let stream: MediaStream;
    try {
      stream = await withTimeout(navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
        inApp ? 6000 : 15000, (late) => late.getTracks().forEach((t) => t.stop()));
    } catch (e) {
      if (run !== runRef.current) return;
      const name = (e as { name?: string })?.name || (e as Error)?.message || 'UNKNOWN';
      stop();
      v5LogClient('verify_aws_cam_fail', name, inApp || '');
      if (name === 'NotFoundError' || name === 'OverconstrainedError') { setErr(L('No front camera found on this device.')); setStage('error'); return; }
      setCamWhy(name); setStage('error');
      return;
    }
    if (run !== runRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;
    await new Promise((ok) => requestAnimationFrame(() => ok(undefined)));
    const v = videoRef.current;
    if (!v) return;
    v.muted = true; v.playsInline = true; v.autoplay = true;
    v.srcObject = stream;
    await v.play().catch(() => wait(300).then(() => v.play()).catch(() => undefined));
    if (!(await firstFrame(v, 6000))) { if (run === runRef.current) { stop(); setCamWhy('NoFrames'); setStage('error'); } return; }
    await capture(v, run);
  };

  /** look straight → left → right: each photo after a 3-2-1 that pauses while the picture is too dark */
  const capture = async (v: HTMLVideoElement, run: number) => {
    const blobs: Partial<Record<AwsStep, Blob>> = {};
    // 20 Nov: one more photo per step half-way through the 3-2-1 (the server keeps the bigger turn and checks eyes on both
    // straight photos), so a member who turns early or blinks once is not sent back
    const extra: Partial<Record<'straight2' | 'left2' | 'right2', Blob>> = {};
    for (const s of AWS_STEPS) {
      if (run !== runRef.current) return;
      setStep(s); setCount(null);
      // 19 Nov: the straight photo came back faceless on cheap Androids (camera still focusing / adjusting light): wait 1.2 s first
      await wait(s === 'straight' ? 1200 : SETTLE_MS);
      for (let n = COUNT_FROM; n > 0;) {
        if (run !== runRef.current) return;
        if (darkRef.current) { setCount(null); await wait(DARK_POLL_MS); n = COUNT_FROM; continue; }
        setCount(n);
        await wait(TICK_MS);
        n--;
        if (n === 1 && !extra[`${s}2` as const]) { try { extra[`${s}2` as const] = await grab(v); } catch { /* the main photo still counts */ } }
      }
      if (run !== runRef.current) return;
      setCount(null);
      try { blobs[s] = await grab(v); } catch { blobs[s] = undefined; }
      setShot((x) => x + 1);
    }
    if (run !== runRef.current) return;
    stop();
    if (!blobs.straight || !blobs.left || !blobs.right) { setWhy('no_face'); setStage('retry'); return; }
    await send({ straight: blobs.straight, left: blobs.left, right: blobs.right, ...extra });
  };

  const send = async (frames: { straight: Blob; left: Blob; right: Blob; straight2?: Blob; left2?: Blob; right2?: Blob }) => {
    setSelfie((old) => { if (old) URL.revokeObjectURL(old); try { return URL.createObjectURL(frames.straight); } catch { return null; } });
    setStage('sending');
    try {
      const r = await v5FaceAwsCheck(frames, FACE_AWS_CONSENT_VERSION, device(), SEND_MS);
      setLeft(typeof r.tries_left === 'number' ? r.tries_left : null);
      if (r.result === 'pass') { setStage('pass'); props.onVerified?.(); }
      else if (r.result === 'review') { setStage('review'); props.onSent(); }
      else if (r.result === 'refused') { v5LogClient('verify_aws_refused', 'same_face'); setStage('refused'); }
      else { v5LogClient('verify_aws_retry', r.why || 'retry'); setWhy(r.why || 'no_face'); setStage('retry'); }
    } catch (e) {
      const code = v5ErrCode(e);
      v5LogClient('verify_aws_fail', code);
      if (code === 'SLOW_DOWN') { setStage('limit'); return; }
      if (code === 'FACE_AWS_OFF' && props.onFallback) { props.onFallback('off'); return; }
      if (code === 'NETWORK' || code === 'OFFLINE') { setWhy('network'); setStage('retry'); return; }
      setErr(props.errText(e));
      setStage('error');
    }
  };

  // 20 Nov (founder: the text said "right" while his preview went left): the words never name a side; the arrow on screen shows it
  const prompt = step === 'straight' ? L('Look straight at the camera') : L('Turn your head toward the arrow');
  return (
    <div className="kfv2 kfa" id="sh-verify" data-stage={stage} data-step={step} data-engine="aws" role="dialog" aria-modal="true" aria-label={L('Get verified ✓')}>
      {stage === 'camera' && (
        <div className="kfv2-cam">
          <video ref={videoRef} playsInline muted autoPlay id="verifyVideo" {...VIDEO_ATTRS} />
          <div className={`kfv2-oval t-${dark ? 'warn' : 'go'}`} id="verifyOval">
            <svg viewBox="0 0 100 133" aria-hidden="true">
              <defs><linearGradient id="kfag" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5B6CFF" /><stop offset="1" stopColor="#FF4FA3" /></linearGradient></defs>
              <ellipse cx="50" cy="66.5" rx="48" ry="64.5" className="trk" />
              <ellipse cx="50" cy="66.5" rx="48" ry="64.5" className="arc" pathLength={320} stroke="url(#kfag)"
                style={{ strokeDasharray: `${Math.max(0.001, (shot / 3) * 320)} 320` }} />
            </svg>
            {stage === 'camera' && step !== 'straight' && <span className={`kfv2-arrow ${step}`} aria-hidden="true"><i /><i /><i /></span>}
            {stage === 'camera' && count !== null && <span className="kfa-count" key={`${step}${count}`} id="verifyCount" aria-hidden="true">{count}</span>}
          </div>
          <div className="kfv2-top">
            <button type="button" className="kfv2-x" aria-label={L('Close')} onClick={close}>✕</button>
          </div>
          <div className="kfv2-say" aria-live="polite">
            <b id="verifyStep" key={step}>{prompt}</b>
            <span className={`kfv2-hint${dark ? ' on' : ''}`} id="verifyHint" data-hint={dark ? 'light' : ''}>{dark ? L('Too dark — face a light') : ' '}</span>
          </div>
          <div className="kfv2-foot">
            <div className="kfv2-dots" aria-hidden="true">
              {AWS_STEPS.map((k, i) => <i key={k} className={shot > i ? 'on' : shot === i ? 'now' : ''} />)}
            </div>
            <p>{L('Checked securely · about 3 seconds')}</p>
            <PrivacyLink L={L} />
          </div>
        </div>
      )}

      {stage === 'needphoto' && (
        <Panel L={L} onClose={close} icon="photo" title={L('Add a photo first')} text={L('Add a clear photo of your face to your card first. The face check compares it with your camera.')}>
          <button type="button" className="kfv2-cta" id="verifyAddPhoto" onClick={props.onAddPhoto}>{L('Add a photo')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      )}

      {stage === 'intro' && (
        <Panel L={L} onClose={close} icon="intro" id="verifyIntro"
          title={mode === 'claim' ? L('One quick step to get your prize') : L('Verify in 3 seconds')}
          text={mode === 'claim' ? L('A 3-second face check keeps every prize one person, one account.')
            : L('You only need it to claim a prize. Look at the camera, then turn a little left and right.')}>
          <details className="kfv2-consent" id="verifyConsent">
            <summary>{L('Your face data')}</summary>
            <ul>
              <li>{L('Your face is sensitive personal data under Thailand’s PDPA. We use it only to confirm you are a real person and that your profile photo is you.')}</li>
              <li>{L('Your phone takes 3 quick photos. They go securely to our face-check service (Amazon Web Services, Australia), which compares them with your card photo and with other members’ faces, to keep Kring one person, one account.')}</li>
              <li><b>{L('We keep one photo for our team to check and delete it about 30 days later. Your face code stays with Amazon until you delete your face data or your account.')}</b></li>
              <li>{L('Questions or deletion: ops@kringapp.com')}</li>
            </ul>
          </details>
          <label className="kfv2-agree">
            <input type="checkbox" id="verifyAgree" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{L('I agree that Kring uses my face this way')}</span>
          </label>
          <button type="button" className="kfv2-cta" id="verifyStart" disabled={!agree} onClick={() => { saveConsent(); void start(); }}>{L('Agree and start')}</button>
          <button type="button" className="kfv2-2nd" id="verifyLater" onClick={close}>{mode === 'claim' ? L('Not now') : L('Do it later')}</button>
          <PrivacyLink L={L} />
        </Panel>
      )}

      {/* 2B (founder's pick, 19 Nov): checking → ✓ verified (most checks, 1–2 s) or "we'll notify you" (the team looks) */}
      {(stage === 'sending' || stage === 'pass' || stage === 'review') && (
        <FaceDoneScreen L={L} state={stage === 'pass' ? 'pass' : stage === 'review' ? 'pending' : 'checking'} selfie={selfie || props.photo} sent claim={mode === 'claim'}
          onContinue={mode === 'claim' ? close : toFeed} onClose={close} />
      )}

      {stage === 'retry' && (
        <Panel L={L} onClose={close} icon="fail" title={L('Let’s try that again')} text={L(retryText(why))} id="verifyFail">
          {left === 0 ? <p className="kfv2-small">{L('No more tries today. Try again tomorrow.')}</p> : (
            <button type="button" className="kfv2-cta" id="verifyRetry" onClick={() => void start()}>
              {left !== null && left <= 5 ? L('Try again · {0} left today').replace('{0}', String(left)) : L('Try again')}
            </button>
          )}
          <button type="button" className="kfv2-2nd" onClick={close}>{mode === 'claim' ? L('Not now') : L('Do it later')}</button>
        </Panel>
      )}

      {/* 0171 (20 Nov, founder): the same face is already on another account → refused automatically, with a one-tap appeal */}
      {stage === 'refused' && <RefusedPanel L={L} onClose={close} />}

      {stage === 'limit' && (
        <Panel L={L} onClose={close} icon="fail" title={L('That’s 3 tries for today')} text={L('Try again tomorrow, in good light.')} id="verifyLimit">
          <button type="button" className="kfv2-cta" onClick={close}>{L('OK')}</button>
        </Panel>
      )}

      {stage === 'error' && camWhy && guideApp(ua()) && (
        <OpenInBrowserGuide L={L} app={guideApp(ua())!} link={fix?.copy || window.location.href} onClose={close}
          open={fix?.open} onOpen={() => v5LogClient('verify_cam_open', fix!.open!.kind, inApp || '')} />
      )}

      {stage === 'error' && camWhy && !inApp && camDenied(camWhy) && (
        <CamFixCarousel L={L} ua={ua()} onRetry={() => void start()} onClose={close} />
      )}

      {stage === 'error' && camWhy && !guideApp(ua()) && (inApp || !camDenied(camWhy)) && (
        <Panel L={L} onClose={close} icon="fail" id="verifyCamBlocked"
          title={L('Camera blocked')} text={L('Open this page in Chrome (or Safari) and allow the camera.')}>
          {fix && CAM_STEPS[fix.steps].length > 0 && <ol className="kfv2-steps" id="verifyCamSteps">{CAM_STEPS[fix.steps].map((t) => <li key={t}>{L(t)}</li>)}</ol>}
          {fix?.open && (
            <a className="kfv2-cta" id="verifyOpenBrowser" href={fix.open.url} onClick={() => v5LogClient('verify_cam_open', fix.open!.kind, inApp || '')}>
              {L(fix.open.kind === 'chrome' ? 'Open in Chrome' : fix.open.kind === 'safari' ? 'Open in Safari' : 'Open in browser')}</a>
          )}
          {fix?.copy && (
            <button type="button" className={fix.open ? 'kfv2-2nd' : 'kfv2-cta'} id="verifyCopyLink" onClick={() => { void copyText(fix.copy!).then(setCopied); }}>
              {copied ? L('Link copied') : L('Copy link')}</button>
          )}
          <button type="button" className="kfv2-2nd" id="verifyCamRetry" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      )}

      {stage === 'error' && !camWhy && (
        <Panel L={L} onClose={close} icon="fail" title={L('Let’s try that again')} text={err} id="verifyError">
          <button type="button" className="kfv2-cta" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      )}
    </div>
  );
}

const FACE_PRIVACY_URL = 'https://kringapp.com/terms#face';
function PrivacyLink({ L }: { L: Tx }) {
  return <a className="kfv2-privacy" id="verifyPrivacy" href={FACE_PRIVACY_URL} target="_blank" rel="noopener noreferrer">{L('How we protect your face')}</a>;
}

function Panel(props: { L: Tx; onClose: () => void; icon: 'photo' | 'intro' | 'fail'; title: string; text: string; id?: string; children?: React.ReactNode }) {
  return (
    <div className={`kfv2-panel i-${props.icon}`} id={props.id}>
      <button type="button" className="kfv2-x" aria-label={props.L('Close')} onClick={props.onClose}>✕</button>
      <div className="kfv2-art" aria-hidden="true"><span className="kfv2-glyph" /></div>
      <h2>{props.title}</h2>
      {props.text ? <p className="kfv2-text">{props.text}</p> : null}
      <div className="kfv2-acts">{props.children}</div>
    </div>
  );
}

/** 0171: "one person, one account" refusal. One tap sends an account check request to Kring (optional short note). */
export function RefusedPanel({ L, onClose, send = v5AccountCheckRequest }: { L: Tx; onClose: () => void; send?: (note?: string) => Promise<string> }) {
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const ask = async () => {
    setState('sending');
    try { await send(note); setState('sent'); v5LogClient('verify_aws_appeal', 'sent'); }
    catch { setState('error'); }
  };
  return (
    <Panel L={L} onClose={onClose} icon="fail" id="verifyRefused" title={L('This face is already on another Kring account')}
      text={L('Kring is one person, one account, so this account can’t be verified or win prizes.')}>
      {state === 'sent' ? (
        <p className="kfv2-small" id="verifyAppealSent" role="status">{L('Sent ✓ Our team will check your account and reply in your Kring messages.')}</p>
      ) : (
        <>
          <label className="kfv2-small" htmlFor="verifyAppealNote" style={{ display: 'block', textAlign: 'left' }}>{L('Anything we should know? (optional)')}</label>
          <textarea id="verifyAppealNote" className="kfv2-note" maxLength={300} rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', borderRadius: 12, padding: '10px 12px', font: 'inherit', background: 'rgba(255,255,255,.06)', color: 'inherit', border: '1px solid rgba(255,255,255,.18)' }} />
          <button type="button" className="kfv2-cta" id="verifyAppeal" disabled={state === 'sending'} onClick={() => void ask()}>
            {state === 'sending' ? L('Sending…') : L('Ask Kring to check my account')}
          </button>
          {state === 'error' && <p className="kfv2-small" role="alert">{L('Couldn’t send. Check your connection and try again.')}</p>}
        </>
      )}
      <button type="button" className="kfv2-2nd" id="verifyRefusedOk" onClick={onClose}>{L('OK')}</button>
    </Panel>
  );
}
