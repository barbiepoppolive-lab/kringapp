/**
 * 20 Nov (founder): "Film now" — the in-app camera for a new Reel. Live preview, one big record button, front/back flip,
 * 5–60 s, always vertical: the camera is drawn onto a 720×1280 canvas (centre crop) and THAT is recorded, so a sideways
 * laptop camera or a landscape phone still gives a 9:16 clip. The finished clip goes through the same checks as a gallery
 * clip (props.onDone → pickReel). Camera blocked / no camera / no MediaRecorder → the gallery picker instead.
 */
import { useEffect, useRef, useState } from 'react';
import { REEL_MAX_MS, REEL_MIN_MS, pickMime } from './v5Reel';
import { camDenied, withTimeout } from './camGuard';
import './camera.css';

type Tx = (s: string) => string;
const W = 720, H = 1280;

export function ReelCamera(props: { L: Tx; onDone: (f: File) => void; onGallery: () => void; onClose: () => void }) {
  const { L } = props;
  const vid = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const raf = useRef(0);
  const t0 = useRef(0);
  const [face, setFace] = useState<'environment' | 'user'>('environment');
  const [state, setState] = useState<'starting' | 'ready' | 'rec' | 'blocked'>('starting');
  const [ms, setMs] = useState(0);
  const [why, setWhy] = useState('');
  const [short, setShort] = useState(false);

  const stopAll = () => {
    cancelAnimationFrame(raf.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
  };

  // camera on (again on flip)
  useEffect(() => {
    let dead = false;
    setState('starting');
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia || !pickMime()) { setWhy('nosupport'); setState('blocked'); return; }
      try {
        const s = await withTimeout(navigator.mediaDevices.getUserMedia({
          video: { facingMode: face, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: { echoCancellation: true, noiseSuppression: true },
        }), 9000, (late) => late.getTracks().forEach((t) => t.stop()));
        if (dead) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current?.getTracks().forEach((t) => t.stop());
        stream.current = s;
        const v = vid.current;
        if (v) { v.srcObject = s; v.muted = true; await v.play().catch(() => undefined); }
        setState('ready');
      } catch (e) {
        if (dead) return;
        const name = (e as { name?: string })?.name || '';
        setWhy(camDenied(name) ? 'denied' : name || 'timeout');
        setState('blocked');
      }
    })();
    return () => { dead = true; };
  }, [face]);
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
      if (took < REEL_MIN_MS) { setShort(true); setState('ready'); setMs(0); return; }
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

  const sec = Math.floor(ms / 1000);
  const pct = Math.min(100, (ms / REEL_MAX_MS) * 100);
  return (
    <div className="cam" id="reelCam" role="dialog" aria-label={L('Film now')}>
      <video ref={vid} className={`cam-v${face === 'user' ? ' mirror' : ''}`} playsInline muted autoPlay />
      <div className="cam-top">
        <button type="button" className="cam-ic" id="camClose" aria-label={L('Close')} onClick={() => { stop(); stopAll(); props.onClose(); }}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        {state === 'rec' ? <span className="cam-time" id="camTime"><i />{`0:${String(sec).padStart(2, '0')}`} / 1:00</span> : <span className="cam-lim">{L('Vertical video · 5–60 seconds')}</span>}
        <span className="cam-sp" />
      </div>
      {state === 'rec' ? <div className="cam-bar"><i style={{ width: `${pct}%` }} /></div> : null}
      {state === 'blocked' ? (
        <div className="cam-blk" id="camBlocked" role="alert">
          <b>{why === 'denied' ? L('Camera blocked') : L('The camera isn’t available here')}</b>
          <p>{why === 'denied' ? L('Allow the camera for kringapp.com in your browser settings, or pick a clip from your gallery.') : L('Pick a clip from your gallery instead.')}</p>
          <button type="button" className="cam-gal" id="camToGallery" onClick={() => { stopAll(); props.onGallery(); }}>{L('Pick from gallery')}</button>
        </div>
      ) : null}
      {short ? <p className="cam-short" role="status">{L('Keep filming: at least 5 seconds')}</p> : null}
      <div className="cam-bot">
        <button type="button" className="cam-ic" id="camGallery" aria-label={L('Pick from gallery')} onClick={() => { stop(); stopAll(); props.onGallery(); }} disabled={state === 'rec'}>
          <svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="3" /><circle cx="9" cy="10" r="1.8" /><path d="m4 17 5-5 4 4 2.5-2.5L20 17" /></svg>
        </button>
        <button type="button" className={`cam-rec${state === 'rec' ? ' on' : ''}`} id="camRec" disabled={state !== 'ready' && state !== 'rec'}
          aria-label={state === 'rec' ? L('Stop') : L('Record')} onClick={() => (state === 'rec' ? stop() : start())}>
          <i />
        </button>
        <button type="button" className="cam-ic" id="camFlip" aria-label={L('Flip camera')} disabled={state === 'rec' || state === 'blocked'}
          onClick={() => setFace((f) => (f === 'user' ? 'environment' : 'user'))}>
          <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2" /><path d="M20 4v4h-4M4 20v-4h4" /></svg>
        </button>
      </div>
    </div>
  );
}
