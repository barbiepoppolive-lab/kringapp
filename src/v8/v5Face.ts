/**
 * On-device face check for "✓ verified" (0031). Everything here runs on the phone: face-api (MIT, @vladmandic/face-api) with
 * three small models served from /app/models/face/. Nothing about the face is sent anywhere except ONE selfie frame,
 * which the member agrees to on the consent screen. Since 0066 also one face code (numbers, not a photo; see kr8_face_prints).
 */
type FaceApi = typeof import('@vladmandic/face-api');
let apiP: Promise<FaceApi> | null = null;

/** 0066: the consent now says a face code is kept (one person, one account). The server only takes a face code after this version. */
/** 17 Nov release: 'face-2026-11-17c' adds "and from your card photo". Card-photo face codes are only made for members who agreed
 *  to this version (server: kr8_save_card_print / kr8_card_print_ok). Older members are NOT asked again; they simply get no card code. */
/** 0081 instant check: 'face-2026-11-17d' = 17c wording + "the result comes right away" + "compared with other members' face codes".
 *  Server rules unchanged: anything >= 17c may keep card and selfie face codes (string order: 17d > 17c). */
/** T-392 (18 Nov): 'face-2026-11-18' = 17d + the true photo line (one selfie goes to the team when the check is unsure or the phone
 *  can't run it; deleted about 30 days after the review). A new version so members who agreed to the old "never leaves your phone"
 *  line see the consent again. Server rules unchanged (>= 17c; '18' > '17d' in string order). */
export const FACE_CONSENT_VERSION = 'face-2026-11-18';
export const CARD_PRINT_CONSENT = 'face-2026-11-17c';

function modelUrl(): string {
  const base = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${base}models/face`;
}

/** T301-001 / T301-032: some phones and PCs have WebGL but cannot compile the face models' shaders ("Failed to compile fragment
 *  shader"), and a few crash the page. Probe WebGL once with a tiny sum; if anything fails (or failed before on this device),
 *  use the slower CPU path. Remembered per device, so the error is never repeated. */
const NO_GL_KEY = 'kr8_face_nogl';
type TfLite = { setBackend: (b: string) => Promise<boolean>; ready: () => Promise<void>;
  tidy: <T>(f: () => T) => T; scalar: (n: number) => { add: (o: unknown) => { dataSync: () => ArrayLike<number> } } };
export function hasWebGL(): boolean {
  try {
    if (typeof document === 'undefined') return false;
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch { return false; }
}
function glBroken(): boolean { try { return localStorage.getItem(NO_GL_KEY) === '1'; } catch { return false; } }
function markGlBroken() { try { localStorage.setItem(NO_GL_KEY, '1'); } catch { /* private mode */ } }
/** T-406 (Sentry KRING-WEB-5, iPhone iOS 18.7): a shader that fails to LINK inside face-api escaped as an unhandled rejection and
 *  froze the face check until it timed out. Any GL error now moves this device to CPU, is logged, and never reaches the page. */
const GL_ERR = /shader|webgl|gl_|context|INVALID|vertex|fragment/i;
export function isGlError(e: unknown): boolean { return GL_ERR.test(String((e as Error)?.message || e)); }
function logBackend(code: string, detail?: string) {
  void import('./v5Live').then((m) => m.v5LogClient('verify_backend', code, detail)).catch(() => undefined);
}
let guardOn = false;
function guardStrayGlErrors() {
  if (guardOn || typeof window === 'undefined') return;
  guardOn = true;
  window.addEventListener('unhandledrejection', (ev) => {
    if (!isGlError(ev.reason)) return;
    ev.preventDefault();
    markGlBroken();
    logBackend('gl_stray', String((ev.reason as Error)?.message || ev.reason).slice(0, 120));
    const tf = apiTf;
    if (tf) void tf.setBackend('cpu').then(() => tf.ready()).catch(() => undefined);
  });
}
let apiTf: TfLite | null = null;
export async function pickFaceBackend(tf: TfLite): Promise<'webgl' | 'cpu'> {
  apiTf = tf; guardStrayGlErrors();
  if (!glBroken() && hasWebGL()) {
    try {
      if (await tf.setBackend('webgl')) {
        await tf.ready();
        const v = tf.tidy(() => tf.scalar(1).add(tf.scalar(1)).dataSync()[0]);
        if (v === 2) { logBackend('webgl'); return 'webgl'; }
      }
    } catch { /* falls through to CPU */ }
    markGlBroken();
  }
  await tf.setBackend('cpu');
  await tf.ready();
  logBackend('cpu', glBroken() ? 'gl_broken_before' : 'no_webgl');
  return 'cpu';
}

/** A WebGL error in the middle of a check (a shader that compiles only on first use): switch this device to CPU and try once more. */
const FIRST_GL_MS = 6000;
let glProven = false;   // one WebGL detect has finished on this page
export async function glSafe<T>(faceapi: FaceApi, run: () => Promise<T>): Promise<T> {
  const tf = faceapi.tf as unknown as TfLite & { getBackend: () => string };
  const toCpu = async (why: string) => {
    markGlBroken();
    logBackend('cpu', why);
    await tf.setBackend('cpu');
    await tf.ready();
  };
  try {
    if (tf.getBackend() === 'webgl' && !glProven) {
      // the first WebGL detect can hang while shaders compile on some phones: give it 6 s, then use the CPU
      const first = run();
      first.catch(() => undefined);   // a late failure of the abandoned try must not surface as an unhandled rejection
      const r = await Promise.race([first, new Promise<'__slow'>((ok) => setTimeout(() => ok('__slow'), FIRST_GL_MS))]);
      if (r === '__slow') { await toCpu('first_detect_slow'); return await run(); }
      glProven = true;
      return r as T;
    }
    return await run();
  } catch (e) {
    if (tf.getBackend() !== 'webgl' || !isGlError(e)) throw e;
    await toCpu(String((e as Error)?.message || e).slice(0, 120));
    return await run();
  }
}

export function loadFaceApi(): Promise<FaceApi> {
  if (!apiP) {
    apiP = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await pickFaceBackend(faceapi.tf as unknown as TfLite);
      const url = modelUrl();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(url),
        faceapi.nets.faceLandmark68Net.loadFromUri(url),
        faceapi.nets.faceRecognitionNet.loadFromUri(url),
      ]);
      return faceapi;
    })().catch((e) => {
      apiP = null;
      throw e;
    });
  }
  return apiP;
}

/** K-006 (18 Nov): on a screen that leads to the face check (its consent screen, a prize claim), download face-api's code in idle
 *  time so the camera step starts faster. Only the code: the backend and models still load when the check starts (loadFaceApi). */
let prefetched = false;
export function prefetchFaceApi(): void {
  if (prefetched || apiP || typeof window === 'undefined') return;
  prefetched = true;
  const w = window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  const go = () => { void import('@vladmandic/face-api').catch(() => { prefetched = false; }); };
  if (w.requestIdleCallback) w.requestIdleCallback(go, { timeout: 2000 }); else window.setTimeout(go, 300);
}

export interface FaceSample {
  found: boolean;
  /** 0.5 = looking straight; > 0.5 = nose towards the image's right (the member's own left); < 0.5 = the other way */
  yaw: number;
  /** eye openness (eye aspect ratio, both eyes averaged) */
  ear: number;
  /** face box covers this share of the frame width */
  size: number;
  centered: boolean;
  /** when the frame was read (ms); only the blink step's 20-s fallback uses it */
  t?: number;
}

type Pt = { x: number; y: number };
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
function eyeAR(p: Pt[]): number {
  return (dist(p[1], p[5]) + dist(p[2], p[4])) / (2 * dist(p[0], p[3]) || 1);
}

/** One reading from the camera frame (or a photo). */
export async function sampleFace(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement, inputSize = 320): Promise<FaceSample> {
  const faceapi = await loadFaceApi();
  const r = await glSafe(faceapi, async () => await faceapi.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.45 })).withFaceLandmarks());
  const w = (input as HTMLVideoElement).videoWidth || (input as HTMLImageElement).naturalWidth || (input as HTMLCanvasElement).width || 1;
  if (!r) return { found: false, yaw: 0.5, ear: 0, size: 0, centered: false };
  const pts = r.landmarks.positions as Pt[];
  const l = pts[36], rr = pts[45], nose = pts[30];
  const yaw = (nose.x - l.x) / ((rr.x - l.x) || 1);
  const ear = (eyeAR(pts.slice(36, 42)) + eyeAR(pts.slice(42, 48))) / 2;
  const box = r.detection.box;
  const cx = (box.x + box.width / 2) / w;
  return { found: true, yaw, ear, size: box.width / w, centered: cx > 0.25 && cx < 0.75 };
}

/** Face code (128 numbers) from face-api's recognition model. Used on the phone to compare the selfie with the profile photo,
 *  and (0066, consent face-2026-11-17) saved team-only on the server so one person can't hold two accounts. */
export async function faceDescriptor(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  const faceapi = await loadFaceApi();
  const r = await glSafe(faceapi, async () => await faceapi.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })).withFaceLandmarks().withFaceDescriptor());
  return r ? r.descriptor : null;
}
export function faceDistance(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, bad) => {
    const im = new Image();
    im.crossOrigin = 'anonymous';
    im.onload = () => ok(im);
    im.onerror = () => bad(new Error('IMAGE'));
    im.src = src;
  });
}

// ─────────────── the live check: look straight → turn left → turn right → blink ───────────────
export type LiveStep = 'straight' | 'left' | 'right' | 'blink' | 'done';
export interface LiveState {
  step: LiveStep; straight: boolean; left: boolean; right: boolean; blink: boolean; openEar: number; frames: number; closed: boolean;
  /** audit P2-5: the blink step passed on the 12-s fallback (no blink was seen). blink stays false so the team can tell. */
  blinkFallback?: boolean;
  /** blink step: time of its first frame, straight-face frames seen, frames with the eyes shut */
  blinkAt: number; still: number; shut: number;
  /** blink step: shut frames in a row and when that run started (for the short "hold") */
  shutRun: number; shutAt: number;
}
export const LIVE_START: LiveState = { step: 'straight', straight: false, left: false, right: false, blink: false, openEar: 0, frames: 0, closed: false, blinkAt: 0, still: 0, shut: 0, shutRun: 0, shutAt: 0 };

/**
 * K (15 Nov, member #16, monolid eyes, indoor light): eyes count as shut below 76 % of the member's OWN open-eye level in
 * the blink step, and as open again above 82 %. The open level is measured in the blink step itself (it reads frames at a
 * different size than the straight step) and only rises quickly / sinks very slowly, so a slow, deliberate eye closure is
 * no longer absorbed into it (that was the bug: the old average followed the eyes down). A short hold (350 ms, or 3 shut
 * frames in a row) counts, as does a normal blink (shut, then open).
 */
export const EYE_SHUT = 0.76, EYE_OPEN = 0.82, EYE_HOLD_MS = 350, EYE_HOLD_FRAMES = 3;
/** After this many ms in the blink step without success the screen shows "close your eyes fully, then open them" + Retry. */
export const BLINK_HINT_MS = 6000;
/** After this long in the blink step with a straight, centred face, the check moves on; the team sees whether a blink was seen. */
export const BLINK_FALLBACK_MS = 12000;
/** Retry button in the blink step: measure the open-eye level again from the next frame. */
export const blinkRetry = (s: LiveState, now: number): LiveState => ({ ...s, openEar: 0, closed: false, shutRun: 0, shutAt: 0, blinkAt: s.step === 'blink' ? now : s.blinkAt });

/** Pure step machine, fed one sample per frame. Turning "left" = the member's own left (nose towards the image's right). */
export function liveNext(s: LiveState, f: FaceSample): LiveState {
  if (!f.found) return { ...s, frames: 0 };
  const n = { ...s };
  switch (s.step) {
    case 'straight':
      if (f.centered && f.size > 0.15 && Math.abs(f.yaw - 0.5) < 0.1) {
        n.frames = s.frames + 1;
        n.openEar = s.openEar ? s.openEar * 0.7 + f.ear * 0.3 : f.ear;
        if (n.frames >= 4) Object.assign(n, { straight: true, step: 'left', frames: 0 });
      } else n.frames = 0;
      return n;
    case 'left':
      if (f.yaw > 0.66) { n.frames = s.frames + 1; if (n.frames >= 2) Object.assign(n, { left: true, step: 'right', frames: 0 }); } else n.frames = 0;
      return n;
    case 'right':
      if (f.yaw < 0.34) { n.frames = s.frames + 1; if (n.frames >= 2) Object.assign(n, { right: true, step: 'blink', frames: 0, openEar: 0, closed: false, shutRun: 0, shutAt: 0 }); } else n.frames = 0;
      return n;
    case 'blink': {
      if (f.t !== undefined && !s.blinkAt) n.blinkAt = f.t;
      if (Math.abs(f.yaw - 0.5) > 0.2) return n;                  // look back at the camera first
      if (f.centered && Math.abs(f.yaw - 0.5) < 0.16) n.still = s.still + 1;
      if (!s.openEar) { n.openEar = f.ear; return n; }           // first facing frame = this member's open-eye level
      const open = s.openEar;
      const done = (): LiveState => Object.assign(n, { blink: true, step: 'done' as LiveStep });
      if (f.ear < open * EYE_SHUT) {                              // eyes shut…
        n.shut = s.shut + 1; n.closed = true; n.shutRun = s.shutRun + 1;
        n.shutAt = s.shutRun ? s.shutAt : f.t ?? 0;
        const held = f.t !== undefined && s.shutRun > 0 && f.t - n.shutAt >= EYE_HOLD_MS;
        if (held || n.shutRun >= EYE_HOLD_FRAMES) return done();  // …and held for a moment
      } else {
        n.shutRun = 0; n.shutAt = 0;
        if (s.closed && f.ear > open * EYE_OPEN) return done();   // …or a normal blink: shut, then open again
        if (s.closed && f.ear <= open * EYE_OPEN) { /* half open: keep waiting, do not move the open level */ }
        else n.openEar = f.ear > open ? open * 0.6 + f.ear * 0.4 : open * 0.995 + f.ear * 0.005;   // rises fast, sinks very slowly
      }
      // fallback: 12 s facing the camera without a clean shut → moves on, but marked "no blink seen" (blink false, blinkFallback true)
      if (f.t !== undefined && n.blinkAt && f.t - n.blinkAt >= BLINK_FALLBACK_MS && n.still >= 4) Object.assign(n, { blink: false, blinkFallback: true, step: 'done' as LiveStep });   // 16 Nov: a real, live face that faced the camera this long passes; the team still checks the selfie by eye (was blink = shut >= 2, which the server always rejected)
      return n;
    }
    default:
      return n;
  }
}

/** JPEG of the current camera frame, at most 640 px on the long side (the one selfie that is uploaded). */
export function grabFrame(video: HTMLVideoElement, maxSide = 640): Promise<Blob> {
  const w = video.videoWidth, h = video.videoHeight;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext('2d')!.drawImage(video, 0, 0, c.width, c.height);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error('FRAME'))), 'image/jpeg', 0.86));
}

// ─────────────── profile photo check (16 Nov): the card photo must show one clear face ───────────────
// Only the small face finder (~190 KB) is loaded for this, not the selfie-matching models. Runs on the phone; nothing is sent.
let detP: Promise<FaceApi> | null = null;
function loadDetector(): Promise<FaceApi> {
  if (apiP) return apiP;
  if (!detP) {
    detP = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      await pickFaceBackend(faceapi.tf as unknown as TfLite);
      if (!faceapi.nets.tinyFaceDetector.isLoaded) await faceapi.nets.tinyFaceDetector.loadFromUri(modelUrl());
      return faceapi;
    })().catch((e) => { detP = null; throw e; });
  }
  return detP;
}

/** 'ok' | 'none' (no face: helmet, scenery, fireworks, pets, cartoons) | 'small' (face too far away) | 'group' (no clear main person) | 'error' (could not check: let it through) */
export type PhotoVerdict = 'ok' | 'none' | 'small' | 'group' | 'error';
export const PHOTO_MIN_FACE = 0.14;   // face box at least 14 % of the photo's width
export const PHOTO_GROUP_RATIO = 0.7;
export const PHOTO_MIN_SCORE = 0.5; // a second face this big or bigger = group photo

export function photoVerdict(faces: { w: number; score: number }[], imgW: number): PhotoVerdict {
  const f = faces.filter((x) => x.score >= PHOTO_MIN_SCORE).sort((a, b) => b.w - a.w);
  if (!f.length) return 'none';
  if (f[0].w / (imgW || 1) < PHOTO_MIN_FACE) return 'small';
  if (f.length > 1 && f[1].w >= f[0].w * PHOTO_GROUP_RATIO) return 'group';
  return 'ok';
}

export const PHOTO_MAX_FACE = 0.9;    // 17 Nov: a "face" wider than 90 % of the photo is a food bowl / texture, not a person
export const PHOTO_SURE_SCORE = 0.65; // one scale is enough only when the finder is this sure; otherwise it must agree at 2 scales

/** 17 Nov (a shrimp bowl passed as a face at one scale, score 0.53, box wider than the photo): a photo passes only when a real-sized
 *  face is found at 2 of the 3 scales, or at 1 scale with a confident score. */
export function photoVerdictMulti(perScale: { w: number; score: number }[][], imgW: number): PhotoVerdict {
  const clean = perScale.map((fs) => fs.filter((x) => x.w <= imgW * PHOTO_MAX_FACE));
  const vs = clean.map((fs) => photoVerdict(fs, imgW));
  const okIdx = vs.map((v, i) => (v === 'ok' ? i : -1)).filter((i) => i >= 0);
  const top = Math.max(0, ...okIdx.map((i) => Math.max(...clean[i].map((x) => x.score))));
  if (okIdx.length >= 2 || (okIdx.length === 1 && top >= PHOTO_SURE_SCORE)) return 'ok';
  return vs.find((v) => v === 'group') || vs.find((v) => v === 'small') || 'none';
}

export async function checkProfilePhoto(src: string): Promise<PhotoVerdict> {
  try {
    const [faceapi, img] = await Promise.all([loadDetector(), loadImage(src)]);
    // the small finder misses some faces at one scale (glasses, soft light), so look at 3 scales and decide on all of them together
    const per: { w: number; score: number }[][] = [];
    for (const inputSize of [416, 320, 512]) {
      const det = await glSafe(faceapi, async () => await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.3 })));
      per.push(det.map((d) => ({ w: d.box.width, score: d.score })));
    }
    return photoVerdictMulti(per, img.naturalWidth);
  } catch {
    return 'error';
  }
}

/** test helper: raw scores per scale */
export async function debugPhotoScores(src: string): Promise<Record<number, number[]>> {
  const [faceapi, img] = await Promise.all([loadDetector(), loadImage(src)]);
  const out: Record<number, number[]> = {};
  for (const inputSize of [224, 320, 416, 512, 608]) {
    const det = await faceapi.detectAllFaces(img, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.2 }));
    out[inputSize] = det.map((d) => Math.round(d.score * 100) / 100);
  }
  return out;
}
