/**
 * "Get verified ✓", instant version (0081, 17 Nov). Tap Verify → full-screen front camera with an oval, about 5 seconds,
 * no shutter button: look straight → turn your head a little left / right (random order) → blink. The best straight frame is
 * taken automatically. MediaPipe on the phone (face-api fallback) checks it is a live person; face-api compares the selfie with
 * the card photo; the SERVER compares the face with every other member and decides at once: ✓ verified / "we're checking" /
 * "already on another account" / friendly retry (3 a day). Consent once per consent version (PDPA, face data is sensitive).
 */
import { useEffect, useRef, useState } from 'react';
import { FACE_CONSENT_VERSION, faceDescriptor, loadFaceApi, loadImage } from './v5Face';
import { cosine, loadFaceEngine, readFace } from './faceEngine';
import type { FaceRead } from './faceEngine';
import { bestSampler, canvasJpeg, snap } from './v5Mp';
import type { Sampler } from './v5Mp';
import { checkPayload, clientVerdict, currentTurn, frontalScore, liveStart, liveStep, progressOf } from './verifyLive';
import type { FailWhy, Hint, LiveState } from './verifyLive';
import { v5ErrCode, v5LogClient, v5SaveFacePrint, v5VerifyInstant } from './v5Live';
import type { V5FaceDecision } from './v5Live';
import './verify.css';

type Tx = (en: string) => string;
// TEST COPY only: no card photo needed, the scan stands in for it (lets the founder test the scan in one tap)
const TESTCOPY = String(import.meta.env.VITE_SUPABASE_URL || '').includes('wulfcffljfuhrvjzrvuv');
type Stage = 'needphoto' | 'intro' | 'loading' | 'camera' | 'checking' | 'pass' | 'review' | 'fail' | 'block' | 'limit' | 'error';

const CONSENT_KEY = 'kr8_face_consent';
const consentSaved = () => { try { return localStorage.getItem(CONSENT_KEY) === FACE_CONSENT_VERSION; } catch { return false; } };
const saveConsent = () => { try { localStorage.setItem(CONSENT_KEY, FACE_CONSENT_VERSION); } catch { /* private mode */ } };

const HINT_TEXT: Record<Exclude<Hint, null>, string> = {
  face: 'Put your face in the oval', one: 'Only you in the picture', light: 'More light', closer: 'Move closer', back: 'Move back a little',
  centre: 'Centre your face', still: 'Hold still',
};
const FAIL_TEXT: Record<FailWhy, string> = {
  timeout: 'We couldn’t see the head turn and blink in time. Try again in good light.',
  still: 'We couldn’t see the head turn and blink in time. Try again in good light.',
  lost: 'Keep your face inside the oval the whole time.',
  noface: 'We couldn’t see your face clearly. Try again in good light.',
  swap: 'Keep your face inside the oval the whole time.',
  mismatch: 'This doesn’t look like your card photo. Use a clear, recent photo of your face.',
  spoof: 'Use your real face in front of the camera, not a photo or a screen.',
};
const device = () => (navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/) || ['other'])[0];

export function V5VerifySheet(props: { L: Tx; photo: string | null; nudge?: boolean; onClose: () => void; onSent: () => void; onVerified?: () => void;
  onAddPhoto: () => void; errText: (e: unknown) => string }) {
  const { L } = props;
  const [stage, setStage] = useState<Stage>(!props.photo && !TESTCOPY ? 'needphoto' : consentSaved() && !props.nudge ? 'loading' : 'intro');
  const [agree, setAgree] = useState(false);
  const [live, setLive] = useState<LiveState>(() => liveStart());
  const [why, setWhy] = useState<FailWhy>('timeout');
  const [left, setLeft] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const samplerRef = useRef<Sampler | null>(null);
  const bestRef = useRef<HTMLCanvasElement | null>(null);
  const midRef = useRef<HTMLCanvasElement | null>(null);
  const firstRef = useRef<HTMLCanvasElement | null>(null);
  const endRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<Promise<FaceRead | null> | null>(null);

  const stop = () => {
    runRef.current++;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };
  useEffect(() => {
    if (stage === 'loading') void start();
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => stop, []);
  const close = () => { stop(); props.onClose(); };

  const start = async () => {
    setErr('');
    setStage('loading');
    const run = ++runRef.current;
    try {
      // the camera opens as soon as the live-check tracker is ready; the face models finish loading meanwhile
      const engine = loadFaceEngine();
      engine.catch(() => undefined);
      const [sampler, stream] = await Promise.all([
        samplerRef.current ? Promise.resolve(samplerRef.current) : bestSampler(),
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
      ]);
      if (run !== runRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
      samplerRef.current = sampler;
      streamRef.current = stream;
      bestRef.current = null; midRef.current = null; firstRef.current = null; endRef.current = null;
      setLive(liveStart());
      setStage('camera');
      // the card photo is read while the member lines up their face (before the timed part starts)
      if (!cardRef.current && props.photo) cardRef.current = engine.then(() => loadImage(props.photo!)).then((im) => readFace(im, { fas: false })).catch(() => null);
      requestAnimationFrame(() => void loop(stream, sampler, run));
    } catch (e) {
      stop();
      const name = (e as { name?: string })?.name || '';
      v5LogClient('verify_cam_fail', name || (e as Error)?.message || 'UNKNOWN');
      setErr(name === 'NotAllowedError' ? L('Camera access was blocked. Allow the camera for kringapp.com in your browser settings, then try again.')
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? L('No front camera found on this device.')
        : L('The face check could not start on this phone. Try again, or try later on another phone.'));
      setStage('error');
    }
  };

  const loop = async (stream: MediaStream, sampler: Sampler, run: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.srcObject = stream;
    await v.play().catch(() => undefined);
    let s = liveStart();
    let best = -9;
    let afterDone = 0;
    // test aid: localStorage kr8_face_debug = '1' keeps the last 600 readings in window.__kr8Frames (numbers only, never sent)
    const dbg = (() => { try { return localStorage.getItem('kr8_face_debug') === '1'; } catch { return false; } })();
    const W = window as unknown as { __kr8Frames?: unknown[] };
    if (dbg) W.__kr8Frames = [];
    while (run === runRef.current) {
      if (v.readyState < 2) { await new Promise((ok) => setTimeout(ok, 40)); continue; }
      const f = await sampler.read(v).catch(() => null);
      if (run !== runRef.current) return;
      if (!f) { await new Promise((ok) => setTimeout(ok, 30)); continue; }
      if (s.step !== 'done') {
        const before = s.step;
        s = liveStep(s, f);
        if (dbg && W.__kr8Frames!.length < 600) W.__kr8Frames!.push({ t: f.t, found: f.found, yaw: +f.yaw.toFixed(3), closed: f.closed === null ? null : +f.closed.toFixed(2),
          size: +f.size.toFixed(2), cx: +f.cx.toFixed(2), cy: +f.cy.toFixed(2), bright: f.bright === null ? null : +f.bright.toFixed(2), step: s.step, hint: s.hint, good: s.good });
        if (s.restarts && before !== 'straight' && s.step === 'straight') { best = -9; bestRef.current = null; midRef.current = null; firstRef.current = null; }
        // the selfie: the most frontal, eyes-open, centred frame of the straight step
        if (before === 'straight' && s.hint === null) {
          if (s.good === 1) firstRef.current = snap(v, firstRef.current);   // spare 3rd frame if no mid-check frame is caught
          const sc = frontalScore(f, 0.5);
          if (sc > best) { best = sc; bestRef.current = snap(v, bestRef.current); }
        }
        // a frame mid-check: after both turns, facing the camera again, eyes open (the anti-spoof model is made for frontal faces)
        if (s.step === 'blink' && !midRef.current && Math.abs(f.yaw - s.yaw0) < 0.1 && (f.closed === null || f.closed < 0.3)) midRef.current = snap(v);
        setLive(s);
        if (s.step === 'failed') break;
      } else if (f.found && Math.abs(f.yaw - s.yaw0) < 0.09 && (f.closed === null || f.closed < 0.35)) {
        endRef.current = snap(v);   // the same face again after the blink
        break;
      } else if (++afterDone > 25) break;
      await new Promise((ok) => (sampler.engine === 'mediapipe' ? requestAnimationFrame(() => ok(undefined)) : setTimeout(ok, 0)));
    }
    if (run !== runRef.current) return;
    v.pause();
    await finish(s, sampler.engine);
  };

  const sendFail = async (s: LiveState, engine: Sampler['engine'], w: FailWhy, extra: { match?: number | null; same?: number | null; realMin?: number | null } = {}) => {
    setWhy(w);
    try {
      const r = await v5VerifyInstant(null, checkPayload(s, { engine, match: extra.match ?? null, same: extra.same ?? null, realMin: extra.realMin, fail: w, device: device() }), null, null, FACE_CONSENT_VERSION);
      setLeft(typeof r.tries_left === 'number' ? r.tries_left : null);
      setStage('fail');
    } catch (e) {
      if (v5ErrCode(e) === 'SLOW_DOWN') { setStage('limit'); return; }
      setLeft(null);
      setStage('fail');   // the retry still works; the server counts on the next send
    }
  };

  const finish = async (s: LiveState, engine: Sampler['engine']) => {
    setStage('checking');
    stop();
    // let "Checking…" paint before the face models run (they keep the phone busy for a moment)
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 30)));
    const t0 = performance.now();
    try {
      if (s.step !== 'done') { v5LogClient('verify_live_fail', s.fail || 'timeout', `r${s.restarts}`); await sendFail(s, engine, s.fail || 'timeout'); return; }
      const read = (c: HTMLCanvasElement | null) => (c ? readFace(c) : Promise.resolve(null));
      // 3 frames of the check: anti-spoof on all of them, and the same face throughout
      const selfie = await read(bestRef.current);
      const mid = await read(midRef.current || firstRef.current);
      const end = await read(endRef.current);
      const card = cardRef.current ? await cardRef.current : (TESTCOPY ? selfie : null);
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      const match = selfie?.emb && card?.emb ? r3(cosine(selfie.emb, card.emb)) : null;
      const others = [mid, end].filter((x): x is FaceRead => !!x);
      const verdict = clientVerdict({ live: s, selfie, others, match });
      (window as unknown as { __kr8Verify?: unknown }).__kr8Verify = { ms: Math.round(performance.now() - t0), reads: [selfie, mid, end].map((x) => x && { real: x.real, ms: Math.round(x.ms), faces: x.faces }), match, verdict };
      if (verdict.kind === 'fail') { await sendFail(s, engine, verdict.why, { match, same: null, realMin: null }); return; }
      const blob = await canvasJpeg(bestRef.current!);
      const r: V5FaceDecision = await v5VerifyInstant(blob, checkPayload(s, { engine, match, same: verdict.same, realMin: verdict.realMin, frames: 1 + others.length, doubt: verdict.doubt, device: device() }),
        selfie!.emb, card?.emb ?? null, FACE_CONSENT_VERSION);
      setLeft(typeof r.tries_left === 'number' ? r.tries_left : null);
      if (r.result === 'pass') { setStage('pass'); props.onVerified?.(); }
      else if (r.result === 'block') setStage('block');
      else if (r.result === 'fail') { setWhy('timeout'); setStage('fail'); }
      else { setStage('review'); props.onSent(); }
      // the prize-claim check (0075) still compares with the older face-api code: made in the background, never blocks
      if ((r.result === 'pass' || r.result === 'review') && bestRef.current) {
        const c = bestRef.current;
        void loadFaceApi().then(() => faceDescriptor(c)).then((d) => v5SaveFacePrint(d)).catch(() => undefined);
      }
    } catch (e) {
      const code = v5ErrCode(e);
      v5LogClient('verify_fail', code || (e as Error)?.message || 'UNKNOWN', `${s.step}`);
      if (code === 'SLOW_DOWN') { setStage('limit'); return; }
      setErr(props.errText(e));
      setStage('error');
    }
  };

  const turn = currentTurn(live);
  const prompt = live.step === 'straight' ? L('Look straight at the camera')
    : turn === 'left' ? L('Turn your head slightly left') : turn === 'right' ? L('Turn your head slightly right')
    : live.step === 'blink' ? L('Now blink') : L('Hold still');
  const hint = live.hint && !(live.step !== 'straight' && live.hint === 'centre') ? live.hint : null;
  const prog = progressOf(live);
  const ringLen = 320;
  const tone = stage === 'checking' || live.step === 'done' ? 'ok' : hint ? 'warn' : 'go';

  return (
    <div className="kfv2" id="sh-verify" data-stage={stage} data-step={live.step} data-turn={turn || ''} role="dialog" aria-modal="true" aria-label={L('Get verified ✓')}>
      {(stage === 'loading' || stage === 'camera' || stage === 'checking') && (
        <div className="kfv2-cam">
          <video ref={videoRef} playsInline muted autoPlay id="verifyVideo" />
          <div className={`kfv2-oval t-${tone}`} id="verifyOval">
            <svg viewBox="0 0 100 133" aria-hidden="true">
              <defs><linearGradient id="kfv2g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5B6CFF" /><stop offset="1" stopColor="#FF4FA3" /></linearGradient></defs>
              <ellipse cx="50" cy="66.5" rx="48" ry="64.5" className="trk" />
              <ellipse cx="50" cy="66.5" rx="48" ry="64.5" className="arc" pathLength={ringLen}
                style={{ strokeDasharray: `${Math.max(0.001, (stage === 'checking' ? 1 : prog) * ringLen)} ${ringLen}` }} />
            </svg>
            {stage === 'camera' && turn && <span className={`kfv2-arrow ${turn}`} aria-hidden="true"><i /><i /><i /></span>}
            {stage === 'camera' && live.step === 'blink' && <span className="kfv2-eye" aria-hidden="true"><i /></span>}
          </div>
          <div className="kfv2-top">
            <button type="button" className="kfv2-x" aria-label={L('Close')} onClick={close}>✕</button>
          </div>
          <div className="kfv2-say" aria-live="polite">
            <b id="verifyStep" key={stage === 'camera' ? live.step + (turn || '') : stage}>
              {stage === 'loading' ? L('Getting the camera ready…') : stage === 'checking' ? L('Checking…') : prompt}
            </b>
            <span className={`kfv2-hint${hint && stage === 'camera' ? ' on' : ''}`} id="verifyHint" data-hint={hint || ''}>
              {hint && stage === 'camera' ? L(HINT_TEXT[hint]) : ' '}
            </span>
          </div>
          <div className="kfv2-foot">
            <div className="kfv2-dots" aria-hidden="true">
              {(['straight', 'turn1', 'turn2', 'blink'] as const).map((k, i) => <i key={k} className={prog * 4 > i + 0.99 || stage === 'checking' ? 'on' : Math.floor(prog * 4) === i ? 'now' : ''} />)}
            </div>
            <p>{L('Checked on your phone · about 5 seconds')}</p>
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
        <Panel L={L} onClose={close} icon="intro" title={props.nudge ? L('New: 5-second face check') : L('Verify in 5 seconds')}
          text={props.nudge ? L('Do it once. It keeps your ✓ and your prizes safe.') : L('Look at the camera, turn your head a little, blink. That’s it.')}>
          <details className="kfv2-consent" id="verifyConsent">
            <summary>{L('Your face data')}</summary>
            <ul>
              <li>{L('Your face is sensitive personal data under Thailand’s PDPA. We use it only to confirm you are a real person and that your profile photo is you.')}</li>
              <li>{L('The check runs on your phone and the result comes right away. To keep Kring one person, one account, we keep a face code made from your selfie and from your card photo (numbers, not a photo) and compare it with other members’ face codes. Only the Kring team can see it.')}</li>
              <li>{L('We delete the face code with your account. If you received a prize, we keep it for one year so the same prize can’t be claimed twice.')}</li>
              <li>{L('We keep one selfie photo, which only the Kring team can see, and delete it 30 days after the review.')}</li>
              <li>{L('Questions or deletion: ops@kringapp.com')}</li>
            </ul>
          </details>
          <label className="kfv2-agree">
            <input type="checkbox" id="verifyAgree" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{L('I agree that Kring uses my face this way')}</span>
          </label>
          <button type="button" className="kfv2-cta" id="verifyStart" disabled={!agree} onClick={() => { saveConsent(); void start(); }}>{L('Agree and start')}</button>
          <button type="button" className="kfv2-2nd" id="verifyLater" onClick={close}>{L('Not now · remind me later')}</button>
        </Panel>
      )}

      {stage === 'pass' && (
        <Panel L={L} onClose={close} icon="pass" photo={props.photo} title={L('You’re verified ✓')} text={L('The ✓ is on your card now. Members can see you’re real.')} id="verifyPass">
          <button type="button" className="kfv2-cta" onClick={close}>{L('Done')}</button>
        </Panel>
      )}

      {stage === 'review' && (
        <Panel L={L} onClose={close} icon="review" title={L('We’re checking · usually within a day')} text={L('You’ll see ✓ verified on your card when it’s done')} id="verifyReview">
          <button type="button" className="kfv2-cta" onClick={close}>{L('OK')}</button>
        </Panel>
      )}

      {stage === 'fail' && (
        <Panel L={L} onClose={close} icon="fail" title={L('Let’s try that again')} text={L(FAIL_TEXT[why])} id="verifyFail">
          {left === 0 ? <p className="kfv2-small">{L('That’s 3 tries for today. Try again tomorrow.')}</p> : (
            <button type="button" className="kfv2-cta" id="verifyRetry" onClick={() => void start()}>
              {left !== null ? L('Try again · {0} left today').replace('{0}', String(left)) : L('Try again')}
            </button>
          )}
          {why === 'mismatch'
            ? <button type="button" className="kfv2-2nd" id="verifyChangePhoto" onClick={props.onAddPhoto}>{L('Change card photo')}</button>
            : <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>}
          <TipRow L={L} />
        </Panel>
      )}

      {stage === 'block' && (
        <Panel L={L} onClose={close} icon="block" title={L('This face is already on another Kring account')} id="verifyBlock"
          text={L('One person, one account. If this is a mistake, tell us and we’ll sort it out.')}>
          <a className="kfv2-cta" id="verifyContact" href="mailto:ops@kringapp.com?subject=Face%20check">{L('Contact Kring')}</a>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Close')}</button>
        </Panel>
      )}

      {stage === 'limit' && (
        <Panel L={L} onClose={close} icon="fail" title={L('That’s 3 tries for today')} text={L('Try again tomorrow, in good light.')} id="verifyLimit">
          <button type="button" className="kfv2-cta" onClick={close}>{L('OK')}</button>
        </Panel>
      )}

      {stage === 'error' && (
        <Panel L={L} onClose={close} icon="fail" title={L('The camera didn’t start')} text={err} id="verifyError">
          <button type="button" className="kfv2-cta" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      )}
    </div>
  );
}

function TipRow({ L }: { L: Tx }) {
  return (
    <div className="kfv2-tips" aria-hidden="true">
      <span><i className="ic-sun" />{L('Good light')}</span>
      <span><i className="ic-face" />{L('Face in the oval')}</span>
      <span><i className="ic-turn" />{L('Turn, then blink')}</span>
    </div>
  );
}

function Panel(props: { L: Tx; onClose: () => void; icon: 'photo' | 'intro' | 'pass' | 'review' | 'fail' | 'block'; photo?: string | null; title: string; text: string; id?: string; children?: React.ReactNode }) {
  return (
    <div className={`kfv2-panel i-${props.icon}`} id={props.id}>
      <button type="button" className="kfv2-x" aria-label={props.L('Close')} onClick={props.onClose}>✕</button>
      <div className="kfv2-art" aria-hidden="true">
        {props.icon === 'pass' && props.photo ? <img src={props.photo} alt="" /> : <span className="kfv2-glyph" />}
        {props.icon === 'pass' && <span className="kfv2-tick">✓</span>}
      </div>
      <h2>{props.title}</h2>
      {props.text ? <p className="kfv2-text">{props.text}</p> : null}
      <div className="kfv2-acts">{props.children}</div>
    </div>
  );
}
