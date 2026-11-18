/**
 * Camera frame → LiveFrame for the instant face check (0081). First choice: MediaPipe Face Landmarker
 * (@mediapipe/tasks-vision 0.10.21, pinned; model + wasm self-hosted under /app/models/mp/). It gives 478 face points and the
 * eye-blink blendshapes, ~15-30 frames a second even on cheap Android phones. If it can't load (old iPhone, blocked wasm, slow
 * network: 12-s limit), the existing face-api models do the same job (slower, eye-shape blink). Everything runs on the phone.
 */
import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { glSafe, loadFaceApi } from './v5Face';
import type { LiveFrame } from './verifyLive';

export type Engine = 'mediapipe' | 'faceapi';
export interface Sampler { engine: Engine; read: (v: HTMLVideoElement) => Promise<LiveFrame>; close: () => void }

function base(): string {
  const b = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${b}models/mp/`;
}

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((ok, bad) => { const t = setTimeout(() => bad(new Error('MP_TIMEOUT')), ms); p.then((v) => { clearTimeout(t); ok(v); }, (e) => { clearTimeout(t); bad(e); }); });

type Delegate = 'GPU' | 'CPU';
const lmP: Partial<Record<Delegate, Promise<FaceLandmarker>>> = {};
const SLOW_KEY = 'kr8_mp_cpu';
/** T-310 (17 Nov): CPU by default. On Android the GPU path fell back from WebGL2 to WebGL1 and then aborted on EVERY frame
 *  (gl_texture_buffer.cc "Check failed: prod_token"), while createFromOptions still resolved. GPU only when asked for
 *  (localStorage kr8_mp_delegate = 'GPU', a test aid). */
function preferCpu(): boolean {
  try { return localStorage.getItem('kr8_mp_delegate') !== 'GPU' || localStorage.getItem(SLOW_KEY) === '1'; } catch { return true; }
}
/** The landmarker on the phone's GPU (WebGL) or CPU (wasm + XNNPACK). GPU first; CPU when the GPU path fails or was slow here. */
export function loadLandmarker(want: Delegate = preferCpu() ? 'CPU' : 'GPU', timeoutMs = 12000): Promise<FaceLandmarker> {
  if (!lmP[want]) {
    lmP[want] = withTimeout((async () => {
      const { FaceLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const files = await FilesetResolver.forVisionTasks(base() + 'wasm');
      const make = (delegate: Delegate) => FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: base() + 'face_landmarker.task', delegate },
        runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true,
        minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5,
      });
      if (want === 'CPU') return await make('CPU');
      try { return await make('GPU'); } catch { return await make('CPU'); }   // some cheap phones have no usable WebGL
    })(), timeoutMs).catch((e) => { delete lmP[want]; throw e; });
  }
  return lmP[want]!;
}

// brightness: the frame drawn very small, mean of the pixels (cheap; every 4th frame)
let lumaCanvas: HTMLCanvasElement | null = null;
export function brightness(v: HTMLVideoElement | HTMLCanvasElement): number | null {
  try {
    lumaCanvas ||= document.createElement('canvas');
    lumaCanvas.width = 24; lumaCanvas.height = 18;
    const g = lumaCanvas.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(v, 0, 0, 24, 18);
    const d = g.getImageData(0, 0, 24, 18).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 4) s += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    return s / (d.length / 4) / 255;
  } catch { return null; }
}

type P = { x: number; y: number };
const NO_FACE = (t: number, bright: number | null): LiveFrame => ({ found: false, faces: 0, yaw: 0.5, closed: null, ear: 0, size: 0, cx: 0.5, cy: 0.5, bright, t });

/** MediaPipe: points 33 / 263 = outer eye corners (image left / right), 1 = nose tip; box from all 478 points */
export function mpFrame(pts: P[], faces: number, blend: { categoryName: string; score: number }[] | undefined, bright: number | null, t: number): LiveFrame {
  let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x; if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y; }
  const l = pts[33], r = pts[263], nose = pts[1];
  const yaw = (nose.x - l.x) / ((r.x - l.x) || 1e-6);
  const sc = (k: string) => blend?.find((c) => c.categoryName === k)?.score;
  const bl = sc('eyeBlinkLeft'), br = sc('eyeBlinkRight');
  return { found: true, faces, yaw, closed: bl !== undefined && br !== undefined ? (bl + br) / 2 : null, ear: 0,
    size: x1 - x0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, bright, t };
}

export async function mediapipeSampler(): Promise<Sampler> {
  let lm = await loadLandmarker();
  let onCpu = preferCpu(), switching = false;
  let last = 0, n = 0, bright: number | null = null;
  const took: number[] = [];
  return {
    engine: 'mediapipe',
    async read(v) {
      const t = Math.max(performance.now(), last + 1);   // timestamps must always grow
      last = t;
      if (n++ % 4 === 0) bright = brightness(v);
      const r = lm.detectForVideo(v, t);
      // some phones (and software-only WebGL) run the GPU path far slower than the CPU one: after 8 frames slower than
      // 90 ms each (≈ 11 frames a second), switch to the CPU path for good on this phone
      if (!onCpu && !switching && took.push(performance.now() - t) >= 8) {
        const med = [...took].sort((x, y) => x - y)[4];
        if (med > 90) {
          switching = true;
          try { localStorage.setItem(SLOW_KEY, '1'); } catch { /* private mode */ }
          void loadLandmarker('CPU').then((c) => { lm = c; onCpu = true; last = 0; }).catch(() => undefined);
        } else took.length = 0;
      }
      const now = Date.now();
      if (!r.faceLandmarks?.length) return NO_FACE(now, bright);
      return mpFrame(r.faceLandmarks[0], r.faceLandmarks.length, r.faceBlendshapes?.[0]?.categories, bright, now);
    },
    close() { /* the landmarker stays loaded for a retry */ },
  };
}

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const eyeAR = (p: Pt[]) => (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]) || 1);

/** face-api fallback (the models the app already has) */
export async function faceapiSampler(): Promise<Sampler> {
  const faceapi = await loadFaceApi();
  let n = 0, bright: number | null = null;
  return {
    engine: 'faceapi',
    async read(v) {
      if (n++ % 4 === 0) bright = brightness(v);
      const w = v.videoWidth || 1, h = v.videoHeight || 1;
      const all = await glSafe(faceapi, async () => await faceapi.detectAllFaces(v, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.45 })).withFaceLandmarks());
      const now = Date.now();
      if (!all.length) return NO_FACE(now, bright);
      const r = all.sort((a, b) => b.detection.box.width - a.detection.box.width)[0];
      const pts = r.landmarks.positions as Pt[];
      const box = r.detection.box;
      const big = all.filter((x) => x.detection.box.width >= box.width * 0.6).length;
      return { found: true, faces: big, yaw: (pts[30].x - pts[36].x) / ((pts[45].x - pts[36].x) || 1), closed: null,
        ear: (eyeAR(pts.slice(36, 42)) + eyeAR(pts.slice(42, 48))) / 2,
        size: box.width / w, cx: (box.x + box.width / 2) / w, cy: (box.y + box.height / 2) / h, bright, t: now };
    },
    close() { /* keep the models */ },
  };
}

/** MediaPipe first; face-api if MediaPipe can't load here. The face-api models load in the background either way
 *  (they make the face code that is compared with the card photo and with other members). */
export async function bestSampler(): Promise<Sampler> {
  // T-310: face-api is no longer loaded alongside (it was part of a ~40 MB boot); it loads only as the fallback tracker or
  // after a passed check (the 0075 prize-claim print)
  try { return await mediapipeSampler(); } catch { return await faceapiSampler(); }
}

/** copy the current video frame into a canvas (the selfie candidates; only the best one is ever uploaded) */
export function snap(v: HTMLVideoElement, into?: HTMLCanvasElement | null, maxSide = 640): HTMLCanvasElement {
  const w = v.videoWidth, h = v.videoHeight;
  const k = Math.min(1, maxSide / Math.max(w, h, 1));
  const c = into || document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(v, 0, 0, c.width, c.height);
  return c;
}
export function canvasJpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('FRAME'))), 'image/jpeg', 0.86));
}
