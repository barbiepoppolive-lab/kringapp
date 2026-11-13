/**
 * On-device face check for "✓ verified" (0031). Everything here runs on the phone: face-api (MIT, @vladmandic/face-api) with
 * three small models served from /app/models/face/. Nothing about the face is sent anywhere except ONE selfie frame,
 * which the member agrees to on the consent screen. No face template or measurement leaves the phone.
 */
type FaceApi = typeof import('@vladmandic/face-api');
let apiP: Promise<FaceApi> | null = null;

export const FACE_CONSENT_VERSION = 'face-2026-11-10';

function modelUrl(): string {
  const base = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${base}models/face`;
}

export function loadFaceApi(): Promise<FaceApi> {
  if (!apiP) {
    apiP = (async () => {
      const faceapi = await import('@vladmandic/face-api');
      const tf = faceapi.tf as unknown as { setBackend: (b: string) => Promise<boolean>; ready: () => Promise<void> };
      try {
        if (!(await tf.setBackend('webgl'))) await tf.setBackend('cpu');
      } catch {
        await tf.setBackend('cpu');
      }
      await tf.ready();
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
  const r = await faceapi.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold: 0.45 })).withFaceLandmarks();
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

/** Face "fingerprint" used only on the phone to compare the selfie with the profile photo. Never uploaded. */
export async function faceDescriptor(input: HTMLVideoElement | HTMLImageElement | HTMLCanvasElement): Promise<Float32Array | null> {
  const faceapi = await loadFaceApi();
  const r = await faceapi.detectSingleFace(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.4 })).withFaceLandmarks().withFaceDescriptor();
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
  /** blink step: time of its first frame, straight-face frames seen, frames with the eyes shut */
  blinkAt: number; still: number; shut: number;
}
export const LIVE_START: LiveState = { step: 'straight', straight: false, left: false, right: false, blink: false, openEar: 0, frames: 0, closed: false, blinkAt: 0, still: 0, shut: 0 };

/** Eyes count as shut below 72 % of the open baseline and as open again above 82 % (small eyes, glasses, side light). */
export const EYE_SHUT = 0.72, EYE_OPEN = 0.82;
/** After this long in the blink step with a straight, centred face, the check moves on; the team sees whether a blink was seen. */
export const BLINK_FALLBACK_MS = 20000;

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
      if (f.yaw < 0.34) { n.frames = s.frames + 1; if (n.frames >= 2) Object.assign(n, { right: true, step: 'blink', frames: 0 }); } else n.frames = 0;
      return n;
    case 'blink': {
      if (f.t !== undefined && !s.blinkAt) n.blinkAt = f.t;
      if (Math.abs(f.yaw - 0.5) > 0.2) return n;                  // look back at the camera first
      const open = s.openEar || f.ear;
      if (f.centered && Math.abs(f.yaw - 0.5) < 0.16) n.still = s.still + 1;
      if (f.ear < open * EYE_SHUT) { n.closed = true; n.shut = s.shut + 1; }        // eyes shut…
      else if (s.closed && f.ear > open * EYE_OPEN) return Object.assign(n, { blink: true, step: 'done' as LiveStep });   // …and open again
      else if (!s.closed) n.openEar = open * 0.9 + f.ear * 0.1;
      // fallback: 20 s facing the camera without a clean shut → open; two shut frames still count as a blink
      if (f.t !== undefined && n.blinkAt && f.t - n.blinkAt >= BLINK_FALLBACK_MS && n.still >= 4) Object.assign(n, { blink: n.shut >= 2, step: 'done' as LiveStep });
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
