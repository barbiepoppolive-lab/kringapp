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
import { bestSampler, brightness, canvasJpeg, faceapiSampler, snap } from './v5Mp';
import type { Sampler } from './v5Mp';
import { checkPayload, clientVerdict, currentTurn, frontalScore, LIMITS_FAST, LIMITS_SLOW, liveStart, liveStepWith, progressOf, slowPhone, SLOW_FRAME_MS } from './verifyLive';
import type { FailWhy, Hint, LiveLimits, LiveState } from './verifyLive';
import { v5ErrCode, v5HandoffCreate, v5LogClient, v5SaveFacePrint, v5VerifyInstant, v5VerifySimple } from './v5Live';
import { allBlack, CAM_STEPS, camDenied, camFix, copyText, engineSupport, firstFrame, inAppBrowser, simpleWhy, withTimeout } from './camGuard';
import type { CamFix } from './camGuard';
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
const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent);
// the camera must answer and send a first frame in time, or the member gets "Camera blocked" + Open in Chrome (17 Nov)
export const CAM_FRAME_MS = 6000;
const camAskMs = () => (inAppBrowser(ua()) ? 6000 : 15000);   // a real browser may be showing its Allow prompt
export const CAM_BLACK_MS = 3000;     // frames still black this long after the video starts = the browser can't show the camera
export const TRACKER_MS = 2000;       // tracker errors (or MediaPipe blind while face-api sees a face) this long = switch tracker
export const ENGINE_MS = 20000;      // the face engine must load within this, or the simple path (one selfie → the founder looks)
export const ENGINE_SLOW_MS = 45000; // fix4: the same on a slow phone (few cores / little memory, or after a timeout here)
export const PHOTO_NOTE_MS = 1500;   // T-392: how long "We'll send this one photo to our team…" shows before the upload starts
// some phone-maker / X5 browsers take over a <video> with their own player (black picture, a "download" button): ask them not to
const VIDEO_ATTRS = { 'x5-playsinline': 'true', 'webkit-playsinline': 'true', 'x5-video-player-type': 'h5-page', controlsList: 'nodownload nofullscreen noremoteplayback', disablePictureInPicture: true, disableRemotePlayback: true } as Record<string, unknown>;
const device = () => (navigator.userAgent.match(/iPhone|iPad|Android|Mac|Windows|Linux/) || ['other'])[0];
const navHints = () => (typeof navigator === 'undefined' ? null : navigator as Navigator & { deviceMemory?: number });

/** 0111 (founder 18 Nov): the face check is needed ONLY to claim a prize.
 *  'signup' = right after a new card (clear "Do it later", nothing waits for it) · 'me' = opened by the member ·
 *  'claim' = the required step before a prize claim. */
export type VerifyMode = 'signup' | 'me' | 'claim';
export function V5VerifySheet(props: { L: Tx; photo: string | null; nudge?: boolean; mode?: VerifyMode; onClose: () => void; onSent: () => void; onVerified?: () => void;
  onAddPhoto: () => void; errText: (e: unknown) => string }) {
  const { L } = props;
  const mode: VerifyMode = props.mode || 'me';
  const [stage, setStage] = useState<Stage>(!props.photo && !TESTCOPY ? 'needphoto' : consentSaved() && !props.nudge ? 'loading' : 'intro');
  const [agree, setAgree] = useState(false);
  const [live, setLive] = useState<LiveState>(() => liveStart());
  const [why, setWhy] = useState<FailWhy>('timeout');
  const [left, setLeft] = useState<number | null>(null);
  const [err, setErr] = useState('');
  const [camBlocked, setCamBlocked] = useState(false);
  const [camWhy, setCamWhy] = useState('');   // fix4: why the camera was blocked (NotAllowedError = a permission "no")
  const [fix, setFix] = useState<CamFix | null>(null);
  const [copied, setCopied] = useState(false);
  const inApp = inAppBrowser(ua());
  const [simple, setSimple] = useState<string | null>(null);   // why the simple path is used (null = the full check)
  const [ready, setReady] = useState(false);   // the tracker is loaded (the camera shows before it)
  const [pct, setPct] = useState(0);
  const [photoNote, setPhotoNote] = useState(false);   // T-392: the selfie is about to go to the team (need_photo)
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const runRef = useRef(0);
  const samplerRef = useRef<Sampler | null>(null);
  const bestRef = useRef<HTMLCanvasElement | null>(null);
  const midRef = useRef<HTMLCanvasElement | null>(null);
  const firstRef = useRef<HTMLCanvasElement | null>(null);
  const endRef = useRef<HTMLCanvasElement | null>(null);
  const cardRef = useRef<Promise<FaceRead | null> | null>(null);
  /** fix4: this phone is slow (hardware hints, slow frames, or a timeout already on this screen): longer limits from now on */
  const slowRef = useRef(slowPhone(navHints()));
  const engineMs = () => (slowRef.current ? ENGINE_SLOW_MS : ENGINE_MS);

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

  const blocked = (why: string) => {
    stop();
    v5LogClient('verify_cam_fail', why, inApp || '');
    setErr('');
    setCamWhy(why);
    setCamBlocked(true);
    setStage('error');
  };
  // "Open in Chrome / Safari": the same page (face check opens again) with a one-time sign-in code, renewed every 2.5 min.
  // fix4: already in Chrome / Safari → no open button, just the steps to allow the camera (camFix)
  useEffect(() => {
    if (stage !== 'error' || !camBlocked) return undefined;
    let live = true;
    setCopied(false);
    const denied = camDenied(camWhy);
    setFix(camFix(window.location.href, ua(), null, denied));
    const renew = () => { if (camFix(window.location.href, ua(), null, denied).open) void v5HandoffCreate().then((ho) => { if (live) setFix(camFix(window.location.href, ua(), ho, denied)); }).catch(() => undefined); };
    renew();
    const t = window.setInterval(renew, 150_000);
    return () => { live = false; clearInterval(t); };
  }, [stage, camBlocked, camWhy]);

  const start = async () => {
    setErr('');
    setCamBlocked(false);
    setSimple(null);
    setReady(false);
    setPct(0);
    setPhotoNote(false);
    setStage('loading');
    const run = ++runRef.current;
    // no WebAssembly / no SIMD here: the face engine can't run at all → the simple path, never a hang
    let why: string | null = simpleWhy(engineSupport());
    // T-310: the models load IN PARALLEL with the camera; the camera never waits for them
    const engine = why ? null : loadFaceEngine();
    engine?.catch(() => undefined);
    const samplerP = why ? null : samplerRef.current ? Promise.resolve(samplerRef.current) : withTimeout(bestSampler(slowRef.current), engineMs());
    samplerP?.catch(() => undefined);
    let stream: MediaStream;
    try {
      // in-app browsers can leave getUserMedia hanging forever: give up after a few seconds (a late stream is stopped)
      stream = await (async () => withTimeout(navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false }),
        camAskMs(), (late) => late.getTracks().forEach((t) => t.stop())))();
    } catch (e) {
      if (run !== runRef.current) return;
      const name = (e as { name?: string })?.name || '';
      // the camera itself refused or never answered (not "no camera"): Camera blocked + Open in Chrome
      if (name !== 'NotFoundError' && name !== 'OverconstrainedError') { blocked(name || (e as Error)?.message || 'UNKNOWN'); return; }
      stop();
      v5LogClient('verify_cam_fail', name);
      setErr(L('No front camera found on this device.'));
      setStage('error');
      return;
    }
    if (run !== runRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
    streamRef.current = stream;
    bestRef.current = null; midRef.current = null; firstRef.current = null; endRef.current = null;
    setLive(liveStart());
    setStage('camera');   // the member sees themselves at once; "Getting ready… x%" while the tracker loads
    await new Promise((ok) => requestAnimationFrame(() => ok(undefined)));
    const v = await attach(stream, run);
    if (!v) return;
    const toSimple = (w: string) => { v5LogClient('verify_simple', w, device()); setSimple(w); setReady(true); };
    if (why || !samplerP) { toSimple(why || 'engine_fail'); return; }
    const sampler = await samplerP.catch((e: unknown) => { why = (e as Error)?.name === 'CamTimeout' ? 'model_timeout' : 'engine_fail'; return null; });
    if (run !== runRef.current) return;
    if (!sampler) { toSimple(why || 'engine_fail'); return; }
    samplerRef.current = sampler;
    setPct(100);
    setReady(true);
    // the card photo is read while the member lines up their face (before the timed part starts)
    if (!cardRef.current && props.photo && engine) cardRef.current = engine.then(() => loadImage(props.photo!)).then((im) => readFace(im, { fas: false })).catch(() => null);
    void loop(v, sampler, run);
  };
  // "Getting ready… x%": eases towards 92 % while the tracker loads, 100 % when it is ready
  useEffect(() => {
    if (stage !== 'camera' || ready) return undefined;
    const t = window.setInterval(() => setPct((p) => Math.min(92, p + Math.max(0.6, (92 - p) * 0.07))), 200);
    return () => clearInterval(t);
  }, [stage, ready]);

  /** stream → <video>, played at once; null (and "Camera blocked") when no frame arrives in time. Then watches for an all-black picture. */
  const attach = async (stream: MediaStream, run: number): Promise<HTMLVideoElement | null> => {
    const v = videoRef.current;
    if (!v) return null;
    v.muted = true; v.playsInline = true; v.autoplay = true;
    v.srcObject = stream;
    await v.play().catch(() => new Promise((ok) => setTimeout(ok, 300)).then(() => v.play()).catch(() => undefined));
    // no frame in time (black oval): the browser gave a stream that never plays
    if (!(await firstFrame(v, CAM_FRAME_MS))) { if (run === runRef.current) blocked('NoFrames'); return null; }
    if (run !== runRef.current) return null;
    // frames arrive but are black (the browser can't show the camera): 3 s of readings, in the background
    void (async () => {
      const seen: (number | null)[] = [];
      for (let t0 = performance.now(); performance.now() - t0 < CAM_BLACK_MS && run === runRef.current;) {
        seen.push(brightness(v));
        await new Promise((ok) => setTimeout(ok, 250));
      }
      if (run === runRef.current && allBlack(seen)) blocked('BlackFrames');
    })();
    return v;
  };

  /** T-310: the tracker broke (errors on every frame for 2 s) or MediaPipe sees no face for 2 s while face-api does:
   *  switch to face-api; if face-api can't load either, the simple path (one selfie → the founder). */
  const fallbackTracker = async (run: number): Promise<Sampler | null> => {
    const alt = await withTimeout(faceapiSampler(), engineMs()).catch(() => null);
    if (run !== runRef.current) return null;
    if (alt) { samplerRef.current = alt; v5LogClient('verify_tracker_switch', 'faceapi', device()); return alt; }
    v5LogClient('verify_simple', 'tracker_fail', device());
    setSimple('engine_fail');
    return null;
  };

  const loop = async (v: HTMLVideoElement, first: Sampler, run: number) => {
    let sampler = first;
    let s = liveStart();
    let best = -9;
    let afterDone = 0;
    let errSince = 0, emptySince = 0, probed = false;
    let probe: Promise<Sampler | null> | null = null;
    // fix4: slow phones get longer limits; the first 8 frame reads decide too (a slow tracker = few frames a second)
    let lim: LiveLimits = slowRef.current ? LIMITS_SLOW : LIMITS_FAST;
    const readMs: number[] = [];
    // test aid: localStorage kr8_face_debug = '1' keeps the last 600 readings in window.__kr8Frames (numbers only, never sent)
    const dbg = (() => { try { return localStorage.getItem('kr8_face_debug') === '1'; } catch { return false; } })();
    const W = window as unknown as { __kr8Frames?: unknown[] };
    if (dbg) W.__kr8Frames = [];
    while (run === runRef.current) {
      if (v.readyState < 2) { await new Promise((ok) => setTimeout(ok, 40)); continue; }
      const r0 = performance.now();
      const f = await sampler.read(v).then((x) => { errSince = 0; return x; }, () => { errSince ||= performance.now(); return null; });
      if (f && lim !== LIMITS_SLOW && readMs.push(performance.now() - r0) >= 8) {
        const med = [...readMs].sort((a, b) => a - b)[4];
        if (med > SLOW_FRAME_MS) { slowRef.current = true; lim = LIMITS_SLOW; v5LogClient('verify_slow', 'frames', `${Math.round(med)}ms ${device()}`); }
        else readMs.length = 0;
      }
      if (run !== runRef.current) return;
      if (!f) {
        if (errSince && performance.now() - errSince > TRACKER_MS) {
          const alt = await fallbackTracker(run);
          if (!alt) return;
          sampler = alt; s = liveStart(); best = -9; errSince = 0; setLive(s);
        }
        await new Promise((ok) => setTimeout(ok, 30));
        continue;
      }
      // MediaPipe sees nothing for 2 s: ask face-api once (in the background) whether there is a face after all
      if (sampler.engine === 'mediapipe' && !f.found && !probed) {
        emptySince ||= performance.now();
        if (performance.now() - emptySince > TRACKER_MS) {
          probed = true;
          probe = withTimeout(faceapiSampler(), engineMs()).then(async (alt) => ((await alt.read(v)).found ? alt : null)).catch(() => null);
        }
      } else if (f.found) emptySince = 0;
      if (probe) {
        const p = probe;
        const alt = await Promise.race([p, Promise.resolve(undefined)]);
        if (alt !== undefined) {
          probe = null;
          if (alt && run === runRef.current) { samplerRef.current = alt; sampler = alt; s = liveStart(); best = -9; v5LogClient('verify_tracker_switch', 'faceapi_probe', device()); setLive(s); continue; }
        }
      }
      if (s.step !== 'done') {
        const before = s.step;
        s = liveStepWith(s, f, lim);
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

  /** the simple path: this one frame goes to the founder's Face checks queue ("We're checking"); nothing is decided on the phone */
  const sendSimple = async (frame: HTMLCanvasElement | null, w: string) => {
    setStage('checking');
    stop();
    try {
      if (!frame || !frame.width) throw new Error('FRAME');
      const r = await v5VerifySimple(await canvasJpeg(frame), { why: w, device: device() }, FACE_CONSENT_VERSION);
      setLeft(typeof r.tries_left === 'number' ? r.tries_left : null);
      if (r.result === 'pass') { setStage('pass'); props.onVerified?.(); } else { setStage('review'); props.onSent(); }
    } catch (e) {
      const code = v5ErrCode(e);
      v5LogClient('verify_simple_fail', code || (e as Error)?.message || 'UNKNOWN', w);
      if (code === 'SLOW_DOWN') { setStage('limit'); return; }
      setErr(code === 'UNKNOWN' ? L('The face check could not start on this phone. Try again, or try later on another phone.') : props.errText(e));
      setStage('error');
    }
  };
  const takeSelfie = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    void sendSimple(snap(v), simple || 'engine_fail');
  };

  const finish = async (s: LiveState, engine: Sampler['engine']) => {
    setStage('checking');
    stop();
    // let "Checking…" paint before the face models run (they keep the phone busy for a moment)
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok, 30)));
    const t0 = performance.now();
    try {
      if (s.step !== 'done') {
        v5LogClient('verify_live_fail', s.fail || 'timeout', `r${s.restarts}${slowRef.current ? ' slow' : ''}`);
        // fix4: after a timeout the next try gets the slow-phone limits (and "Do it later" shows next to "Try again")
        if (s.fail === 'timeout' || s.fail === 'still') slowRef.current = true;
        await sendFail(s, engine, s.fail || 'timeout'); return;
      }
      // the face-code models never loaded: the selfie still goes to the founder (simple path), the member is never stuck
      if (!(await withTimeout(loadFaceEngine(), engineMs()).then(() => true, () => false))) { await sendSimple(bestRef.current, 'model_timeout'); return; }
      const read = (c: HTMLCanvasElement | null) => (c ? readFace(c) : Promise.resolve(null));
      // 3 frames of the check: anti-spoof on all of them, and the same face throughout
      const selfie = await read(bestRef.current);
      const mid = await read(midRef.current || firstRef.current);
      const end = await read(endRef.current);
      const card = TESTCOPY ? selfie : cardRef.current ? await cardRef.current : null;
      const r3 = (x: number) => Math.round(x * 1000) / 1000;
      const match = selfie?.emb && card?.emb ? r3(cosine(selfie.emb, card.emb)) : null;
      const others = [mid, end].filter((x): x is FaceRead => !!x);
      const verdict = clientVerdict({ live: s, selfie, others, match });
      (window as unknown as { __kr8Verify?: unknown }).__kr8Verify = { ms: Math.round(performance.now() - t0), reads: [selfie, mid, end].map((x) => x && { real: x.real, ms: Math.round(x.ms), faces: x.faces }), match, verdict };
      if (verdict.kind === 'fail') { await sendFail(s, engine, verdict.why, { match, same: null, realMin: null }); return; }
      const blob = await canvasJpeg(bestRef.current!);
      const r: V5FaceDecision = await v5VerifyInstant(blob, checkPayload(s, { engine, match, same: verdict.same, realMin: verdict.realMin, frames: 1 + others.length, doubt: verdict.doubt, device: device() }),
        selfie!.emb, card?.emb ?? null, FACE_CONSENT_VERSION,
        // need_photo: say so on screen before the one selfie is uploaded for the team (PDPA, T-392)
        () => { setPhotoNote(true); return new Promise<void>((ok) => setTimeout(ok, PHOTO_NOTE_MS)); });
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

  const tracking = stage === 'camera' && ready && !simple;
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
          <video ref={videoRef} playsInline muted autoPlay id="verifyVideo" {...VIDEO_ATTRS} />
          <div className={`kfv2-oval t-${tone}`} id="verifyOval">
            <svg viewBox="0 0 100 133" aria-hidden="true">
              <defs><linearGradient id="kfv2g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5B6CFF" /><stop offset="1" stopColor="#FF4FA3" /></linearGradient></defs>
              <ellipse cx="50" cy="66.5" rx="48" ry="64.5" className="trk" />
              <ellipse cx="50" cy="66.5" rx="48" ry="64.5" className="arc" pathLength={ringLen}
                style={{ strokeDasharray: `${Math.max(0.001, (stage === 'checking' ? 1 : prog) * ringLen)} ${ringLen}` }} />
            </svg>
            {tracking && turn && <span className={`kfv2-arrow ${turn}`} aria-hidden="true"><i /><i /><i /></span>}
            {tracking && live.step === 'blink' && <span className="kfv2-eye" aria-hidden="true"><i /></span>}
          </div>
          <div className="kfv2-top">
            <button type="button" className="kfv2-x" aria-label={L('Close')} onClick={close}>✕</button>
          </div>
          <div className="kfv2-say" aria-live="polite">
            <b id="verifyStep" key={stage === 'camera' ? live.step + (turn || '') : stage}>
              {stage === 'loading' ? L('Getting the camera ready…') : stage === 'checking' ? L('Checking…') : !tracking ? L('Look straight at the camera') : prompt}
            </b>
            <span className={`kfv2-hint${hint && tracking ? ' on' : ''}`} id="verifyHint" data-hint={hint || ''}>
              {hint && tracking ? L(HINT_TEXT[hint]) : ' '}
            </span>
          </div>
          <div className="kfv2-foot">
            {stage === 'camera' && !ready && !simple && (
              <div className="kfv2-ready" id="verifyReady" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <span>{L('Getting ready… {0}%').replace('{0}', String(Math.round(pct)))}</span>
                <i><b style={{ transform: `scaleX(${pct / 100})` }} /></i>
              </div>
            )}
            <div className="kfv2-dots" aria-hidden="true" hidden={!!simple || (stage === 'camera' && !ready)}>
              {(['straight', 'turn1', 'turn2', 'blink'] as const).map((k, i) => <i key={k} className={prog * 4 > i + 0.99 || stage === 'checking' ? 'on' : Math.floor(prog * 4) === i ? 'now' : ''} />)}
            </div>
            {stage === 'camera' && simple
              ? <><p id="verifyPhotoNote">{L('We’ll send this one photo to our team to check, then delete it.')}</p><button type="button" className="kfv2-cta" id="verifySnap" onClick={takeSelfie}>{L('Take selfie')}</button></>
              : photoNote && stage === 'checking'
                ? <p id="verifyPhotoNote" role="status">{L('We’ll send this one photo to our team to check, then delete it.')}</p>
                : <p>{L('Checked on your phone · about 5 seconds')}</p>}
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
          title={mode === 'claim' ? L('One quick step to get your prize') : props.nudge ? L('New: 5-second face check') : L('Verify in 5 seconds')}
          text={mode === 'claim' ? L('A 5-second face check keeps every prize one person, one account.')
            : props.nudge ? L('Do it once. It keeps your ✓ and your prizes safe.')
            : L('You only need it to claim a prize. Look at the camera, turn a little, blink.')}>
          {inApp && <p className="kfv2-small kfv2-inapp" id="verifyInApp" role="note">{L('You’re in an app’s built-in browser, where the camera often doesn’t work. If it doesn’t start, open this page in Chrome (or Safari).')}</p>}
          <details className="kfv2-consent" id="verifyConsent">
            <summary>{L('Your face data')}</summary>
            <ul>
              <li>{L('Your face is sensitive personal data under Thailand’s PDPA. We use it only to confirm you are a real person and that your profile photo is you.')}</li>
              <li>{L('The check runs on your phone and the result comes right away. To keep Kring one person, one account, we keep a face code made from your selfie and from your card photo (numbers, not a photo) and compare it with other members’ face codes. Only the Kring team can see it.')}</li>
              <li>{L('We delete the face code with your account. If you received a prize, we keep it for one year so the same prize can’t be claimed twice.')}</li>
              <li><b>{L('Usually your face photo stays on your phone and Kring keeps only a face code (numbers). If the check is unsure, or your phone can’t run it, one selfie goes to our team to look at, and we delete it about 30 days after the review.')}</b></li>
              <li>{L('Questions or deletion: ops@kringapp.com')}</li>
            </ul>
          </details>
          <label className="kfv2-agree">
            <input type="checkbox" id="verifyAgree" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{L('I agree that Kring uses my face this way')}</span>
          </label>
          <button type="button" className="kfv2-cta" id="verifyStart" disabled={!agree} onClick={() => { saveConsent(); void start(); }}>{L('Agree and start')}</button>
          {/* 0111: a clear second choice; skipping never blocks anything (only a prize claim asks again) */}
          <button type="button" className="kfv2-2nd" id="verifyLater" onClick={close}>{mode === 'claim' ? L('Not now') : L('Do it later')}</button>
        </Panel>
      )}

      {stage === 'pass' && (
        <Panel L={L} onClose={close} icon="pass" photo={props.photo} title={L('You’re verified ✓')} id="verifyPass"
          text={mode === 'claim' ? L('Now pick where to get your prize.') : L('The ✓ is on your card now. Members can see you’re real.')}>
          <button type="button" className="kfv2-cta" onClick={close}>{mode === 'claim' ? L('Back to my prize') : L('Done')}</button>
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
            : (why === 'timeout' || why === 'still') && mode !== 'claim'
              // fix4: the face check is only needed to claim a prize, so a timed-out check never feels like a dead end
              ? <><button type="button" className="kfv2-2nd" id="verifyLaterFail" onClick={() => { v5LogClient('verify_later', why); close(); }}>{L('Do it later')}</button>
                <p className="kfv2-small" id="verifyLaterNote">{L('No rush. You only need this to claim a prize.')}</p></>
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

      {stage === 'error' && camBlocked && (inApp || !camDenied(camWhy) ? (
        <Panel L={L} onClose={close} icon="fail" title={L('Camera blocked')} text={L('Open this page in Chrome (or Safari) and allow the camera.')} id="verifyCamBlocked">
          <CamSteps L={L} steps={fix ? CAM_STEPS[fix.steps] : []} />
          {fix?.open
            ? <a className="kfv2-cta" id={fix.open.kind === 'chrome' ? 'verifyOpenChrome' : 'verifyOpenBrowser'} href={fix.open.url}
              onClick={() => v5LogClient('verify_cam_open', fix.open!.kind, inApp || '')}>
              {L(fix.open.kind === 'chrome' ? 'Open in Chrome' : fix.open.kind === 'safari' ? 'Open in Safari' : 'Open in browser')}</a>
            : null}
          {fix?.copy
            ? <button type="button" className={fix.open ? 'kfv2-2nd' : 'kfv2-cta'} id="verifyCopyLink" onClick={() => { void copyText(fix.copy!).then(setCopied); }}>
              {copied ? L('Link copied') : L('Copy link')}</button>
            : null}
          {fix?.copy && copied && <p className="kfv2-small" id="verifyCopied">{L('Paste it in Safari (or Chrome) and allow the camera.')}</p>}
          <button type="button" className="kfv2-2nd" id="verifyCamRetry" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      ) : (
        // fix4: already in Chrome / Safari and the camera is blocked for this site: how to allow it, then Try again
        <Panel L={L} onClose={close} icon="fail" title={L('Allow the camera')} text={L('Your browser is blocking the camera for Kring. Allow it, then try again.')} id="verifyCamBlocked">
          <CamSteps L={L} steps={fix ? CAM_STEPS[fix.steps] : []} />
          <button type="button" className="kfv2-cta" id="verifyCamRetry" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      ))}

      {stage === 'error' && !camBlocked && (
        <Panel L={L} onClose={close} icon="fail" title={L('The camera didn’t start')} text={err} id="verifyError">
          <button type="button" className="kfv2-cta" onClick={() => void start()}>{L('Try again')}</button>
          <button type="button" className="kfv2-2nd" onClick={close}>{L('Not now')}</button>
        </Panel>
      )}
    </div>
  );
}

/** fix4: short numbered steps (open in the real browser / allow the camera); plain text, no box */
function CamSteps({ L, steps }: { L: Tx; steps: string[] }) {
  if (!steps.length) return null;
  return <ol className="kfv2-steps" id="verifyCamSteps">{steps.map((t) => <li key={t}>{L(t)}</li>)}</ol>;
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
