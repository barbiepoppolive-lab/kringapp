/**
 * 20 Nov (founder): camera-first posting. "Post" opens straight into the in-app camera, full screen like TikTok / IG:
 * live preview, one big record button, front/back flip, the gallery button bottom-left. 5–60 s, always vertical: the camera is
 * drawn onto a 720×1280 canvas (centre crop) and THAT is recorded, so a sideways laptop camera or a landscape phone still gives
 * a 9:16 clip. The finished clip goes through the same checks and trim step as a gallery clip (props.onDone → pickReel).
 *
 * Permission (0183 batch): the camera starts by itself only when the browser says it is already allowed (or it was allowed
 * earlier in this visit). Otherwise ONE compact glass screen: "Allow camera to film" (the browser's question comes only after
 * that tap, once per tap, never in a loop) and a smaller "Pick from gallery". No camera at all → the same screen, gallery first.
 */
import React, { useEffect, useRef, useState } from 'react';
import { REEL_MAX_MS, REEL_MIN_MS, pickMime } from './v5Reel';
import { camDenied, withTimeout } from './camGuard';
import './camera.css';

type Tx = (s: string) => string;
const W = 720, H = 1280;

/** this visit already got the camera once (Safari may not answer permissions.query, so remember it here) */
let allowedThisVisit = false;
/** tests only */
export const _resetCamAllowed = () => { allowedThisVisit = false; };

export type CamAccess = 'granted' | 'denied' | 'prompt' | 'none';
/** What the browser says about the camera, without asking the member anything. */
export async function camAccess(): Promise<CamAccess> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia || !pickMime()) return 'none';
  if (allowedThisVisit) return 'granted';
  try {
    const q = await navigator.permissions?.query({ name: 'camera' as PermissionName });
    if (q?.state === 'granted') return 'granted';
    if (q?.state === 'denied') return 'denied';
  } catch { /* Firefox / older Safari: unknown, so ask with a tap */ }
  return 'prompt';
}

export function ReelCamera(props: {
  L: Tx; onDone: (f: File) => void; onClose: () => void;
  /** the gallery file input (id="reelFile"), wrapped in the bottom-left gallery button and in "Pick from gallery" */
  gallery: (cls: string, label: React.ReactNode, id: string) => React.ReactNode;
  /** a refused clip ("too short", "too long"…), shown over the camera */
  problem?: string;
  /** tests only */
  access?: () => Promise<CamAccess>;
}) {
  const { L } = props;
  const vid = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const raf = useRef(0);
  const t0 = useRef(0);
  const [face, setFace] = useState<'environment' | 'user'>('environment');
  /** check = reading the permission; gate = the compact "Allow camera" screen; on = camera wanted */
  const [mode, setMode] = useState<'check' | 'gate' | 'on'>('check');
  const [gateWhy, setGateWhy] = useState<'prompt' | 'denied' | 'none'>('prompt');
  const [state, setState] = useState<'starting' | 'ready' | 'rec'>('starting');
  const [ms, setMs] = useState(0);
  const [short, setShort] = useState(false);

  const stopAll = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  useEffect(() => {
    let dead = false;
    void (props.access || camAccess)().then((a) => {
      if (dead) return;
      if (a === 'granted') setMode('on');
      else { setGateWhy(a === 'denied' ? 'denied' : a === 'none' ? 'none' : 'prompt'); setMode('gate'); }
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // camera on (again on flip) — only after the browser said yes, or after the member tapped "Allow camera to film"
  useEffect(() => {
    if (mode !== 'on') return undefined;
    let dead = false;
    setState('starting');
    (async () => {
      try {
        const s = await withTimeout(navigator.mediaDevices.getUserMedia({
          video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        }), 9000, (late) => late.getTracks().forEach((t) => t.stop()));
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        allowedThisVisit = true;
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = vid.current;
        if (v) { v.srcObject = s; v.muted = true; await v.play().catch(() => undefined); }
        setState('ready');
      } catch (e) {
        if (dead) return;
        // refused or no answer: back to the one compact screen (a new try only comes from a new tap)
        const name = (e as { name?: string })?.name || '';
        setGateWhy(camDenied(name) ? 'denied' : 'none');
        setMode('gate');
      }
    })();
    return () => { dead = true; };
  }, [face, mode]);
  useEffect(() => () => { try { rec.current?.state === 'recording' && rec.current.stop(); } catch { /* ignore */ } stopAll(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // draws the camera onto the vertical canvas (centre crop, mirrored for the selfie camera like every camera app)
  const draw = () => {
    const v = vid.current, c = canvas.current;
    if (v && c && v.videoWidth) {
      const g = c.getContext('2d');
      if (g) {
        const s = Math.max(W / v.videoWidth, H / v.videoHeight);
        const dw = v.videoWidth * s, dh = v.videoHeight * s;
        g.save();
        if (face === 'user') { g.translate(W, 0); g.scale(-1, 1); }
        g.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
        g.restore();
      }
    }
    if (rec.current?.state === 'recording') {
      const t = performance.now() - t0.current;
      setMs(t);
      if (t >= REEL_MAX_MS) { stop(); return; }
    }
    raf.current = requestAnimationFrame(draw);
  };

  const start = () => {
    const s = stream.current, mime = pickMime();
    if (!s || !mime) return;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    canvas.current = c;
    const out = (c as HTMLCanvasElement & { captureStream: (fps?: number) => MediaStream }).captureStream(30);
    s.getAudioTracks().forEach((a) => out.addTrack(a));
    chunks.current = [];
    const r = new MediaRecorder(out, { mimeType: mime, videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 96_000 });
    r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.current.push(e.data); };
    r.onstop = () => {
      cancelAnimationFrame(raf.current);
      const took = performance.now() - t0.current;
      if (took < REEL_MIN_MS) { setShort(true); setState('ready'); setMs(0); raf.current = requestAnimationFrame(draw); return; }
      const type = mime.split(';')[0];
      const blob = new Blob(chunks.current, { type });
      const f = new File([blob], `kring-${Date.now()}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type });
      stopAll();
      props.onDone(f);
    };
    rec.current = r;
    t0.current = performance.now();
    setShort(false);
    setMs(0);
    r.start(1000);
    setState('rec');
    try { navigator.vibrate?.(15); } catch { /* ignore */ }
    raf.current = requestAnimationFrame(draw);
  };
  const stop = () => { try { if (rec.current?.state === 'recording') rec.current.stop(); } catch { /* ignore */ } };
  const close = () => { stop(); stopAll(); props.onClose(); };

  const sec = Math.floor(ms / 1000);
  const pct = Math.min(100, (ms / REEL_MAX_MS) * 100);
  const galIcon = <svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-5 4 4 2.5-2.5L20 17" /></svg>;
  const closeBtn = (
    <button type="button" className="cam-ic" id="camClose" aria-label={L('Close')} onClick={close}>
      <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
    </button>
  );

  if (mode !== 'on') {
    // the ONE compact glass screen (nothing while the permission is being read: a black screen for a few ms)
    return (
      <div className="cam cam-gate" id="reelCam" role="dialog" aria-label={L('New Reel')} data-cam={mode === 'check' ? 'check' : `gate-${gateWhy}`}>
        <div className="cam-top">{closeBtn}<span className="cam-sp" /></div>
        {mode === 'gate' ? (
          <div className="cam-allow" id="camGate">
            <span className="cam-allow-ic" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="6.5" width="13" height="11" rx="2.6" /><path d="m16 10.5 5-3v9l-5-3" /></svg></span>
            {gateWhy === 'none' ? (
              <>
                <b>{L('The camera isn’t available here')}</b>
                <p>{L('Pick a clip from your gallery instead.')}</p>
                {props.gallery('cam-gal', L('Pick from gallery'), 'camToGallery')}
              </>
            ) : (
              <>
                <b>{L('Allow camera to film')}</b>
                <p>{gateWhy === 'denied' ? L('Camera is off for kringapp.com. Turn it on in your browser settings, or pick a clip.') : L('Film your Reel right here. Kring only uses the camera while this screen is open.')}</p>
                <button type="button" className="cam-gal" id="camAllow" onClick={() => setMode('on')}>{L('Allow camera to film')}</button>
                {props.gallery('cam-pick', L('Pick from gallery'), 'camToGallery')}
              </>
            )}
            <small className="cam-allow-lim">{L('Vertical video · 5–60 seconds')}</small>
          </div>
        ) : null}
        {props.problem ? <p className="cam-prob" id="reelProblem" role="alert">{props.problem}</p> : null}
      </div>
    );
  }

  return (
    <div className="cam" id="reelCam" role="dialog" aria-label={L('Film now')} data-cam={state}>
      <video ref={vid} className={`cam-v${face === 'user' ? ' mirror' : ''}`} playsInline muted autoPlay />
      <div className="cam-top">
        {closeBtn}
        {state === 'rec' ? <span className="cam-time" id="camTime"><i />{`0:${String(sec).padStart(2, '0')}`} / 1:00</span> : <span className="cam-lim">{L('Vertical video · 5–60 seconds')}</span>}
        <span className="cam-sp" />
      </div>
      {state === 'rec' ? <div className="cam-bar"><i style={{ width: `${pct}%` }} /></div> : null}
      {short ? <p className="cam-short" role="status">{L('Keep filming: at least 5 seconds')}</p> : null}
      {props.problem && state !== 'rec' ? <p className="cam-prob" id="reelProblem" role="alert">{props.problem}</p> : null}
      <div className="cam-bot">
        {state === 'rec' ? <span className="cam-ic cam-thumb off" aria-hidden="true">{galIcon}</span>
          : props.gallery('cam-ic cam-thumb', <>{galIcon}<span className="cam-sr">{L('Pick from gallery')}</span></>, 'camGallery')}
        <button type="button" className={`cam-rec${state === 'rec' ? ' on' : ''}`} id="camRec" disabled={state !== 'ready' && state !== 'rec'}
          aria-label={state === 'rec' ? L('Stop') : L('Record')} onClick={() => (state === 'rec' ? stop() : start())}>
          <i />
        </button>
        <button type="button" className="cam-ic" id="camFlip" aria-label={L('Flip camera')} disabled={state === 'rec'}
          onClick={() => setFace((f) => (f === 'user' ? 'environment' : 'user'))}>
          <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></svg>
        </button>
      </div>
    </div>
  );
}
