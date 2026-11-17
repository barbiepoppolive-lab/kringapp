/**
 * In-house face engine for the instant face check (0081, founder 17 Nov: no paid vendor, as strong as possible).
 * Runs on the member's phone with onnxruntime-web 1.22.0 (wasm, self-hosted under /app/models/ort/, one thread):
 *   · YuNet 2023mar (OpenCV Zoo, MIT): face box + 5 points (eyes, nose, mouth corners)
 *   · SFace 2021dec int8 (OpenCV Zoo, Apache-2.0): 112×112 aligned face → 128-number embedding, L2-normalised
 *     (cosine similarity; calibrated on LFW + the app's demo faces, see migration 0081)
 *   · MiniFASNetV2 (2.7×) + MiniFASNetV1SE (4.0×) fused (minivision Silent-Face-Anti-Spoofing, Apache-2.0): real-face score
 * The steps mirror OpenCV's FaceDetectorYN / FaceRecognizerSF::alignCrop + feature exactly (same reference points, same
 * similarity transform, same colour order), so the numbers match the calibration made with OpenCV.
 */
import type { InferenceSession, Tensor } from 'onnxruntime-web';

export const SFACE_MODEL = 'sface-2021dec-int8';

function base(): string {
  const b = ((import.meta as unknown as { env?: Record<string, string | undefined> }).env?.BASE_URL || '/').replace(/\/?$/, '/');
  return `${b}models/`;
}

// ─────────────── pure maths (unit-tested) ───────────────
export interface Face { x: number; y: number; w: number; h: number; score: number; kps: [number, number][] }

/** YuNet 2023mar output decoding (as OpenCV face_detect.cpp): strides 8/16/32, score = sqrt(cls × obj) */
export function decodeYunet(out: Record<string, { data: ArrayLike<number> }>, size: number, scoreMin = 0.6): Face[] {
  const faces: Face[] = [];
  for (const s of [8, 16, 32]) {
    const cols = size / s, rows = size / s;
    const cls = out[`cls_${s}`].data, obj = out[`obj_${s}`].data, bb = out[`bbox_${s}`].data, kp = out[`kps_${s}`].data;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const sc = Math.sqrt(Math.min(Math.max(cls[i], 0), 1) * Math.min(Math.max(obj[i], 0), 1));
      if (sc < scoreMin) continue;
      const cx = (c + bb[i * 4]) * s, cy = (r + bb[i * 4 + 1]) * s, w = Math.exp(bb[i * 4 + 2]) * s, h = Math.exp(bb[i * 4 + 3]) * s;
      const kps: [number, number][] = [];
      for (let n = 0; n < 5; n++) kps.push([(kp[i * 10 + 2 * n] + c) * s, (kp[i * 10 + 2 * n + 1] + r) * s]);
      faces.push({ x: cx - w / 2, y: cy - h / 2, w, h, score: sc, kps });
    }
  }
  return nms(faces, 0.3);
}
export function iou(a: Face, b: Face): number {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y), x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  const i = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  return i / (a.w * a.h + b.w * b.h - i || 1);
}
export function nms(f: Face[], th: number): Face[] {
  const s = [...f].sort((a, b) => b.score - a.score), keep: Face[] = [];
  for (const x of s) if (keep.every((k) => iou(k, x) <= th)) keep.push(x);
  return keep;
}

/** SFace reference points (OpenCV face_recognize.cpp), 112×112 */
export const SFACE_REF: [number, number][] = [[38.2946, 51.6963], [73.5318, 51.5014], [56.0252, 71.7366], [41.5493, 92.3655], [70.7299, 92.2041]];

/** Similarity transform (Umeyama, with scale) mapping src points onto dst: returns [a, b, tx, c, d, ty] (2×3, row-major). */
export function similarity(src: [number, number][], dst: [number, number][] = SFACE_REF): number[] {
  const n = src.length;
  let mx = 0, my = 0, nx = 0, ny = 0;
  for (let i = 0; i < n; i++) { mx += src[i][0]; my += src[i][1]; nx += dst[i][0]; ny += dst[i][1]; }
  mx /= n; my /= n; nx /= n; ny /= n;
  // covariance (dst × srcᵀ) / n and source variance
  let a = 0, b = 0, c = 0, d = 0, vs = 0;
  for (let i = 0; i < n; i++) {
    const sx = src[i][0] - mx, sy = src[i][1] - my, dx = dst[i][0] - nx, dy = dst[i][1] - ny;
    a += dx * sx; b += dx * sy; c += dy * sx; d += dy * sy; vs += sx * sx + sy * sy;
  }
  a /= n; b /= n; c /= n; d /= n; vs /= n;
  // Umeyama in 2D: the best PROPER rotation maximises trace(Rᵀ·Σ) → angle atan2(c − b, a + d), and that maximum
  // (= trace(D·S) in Umeyama's notation, reflection handled) is the length of (a + d, c − b)
  const th = Math.atan2(c - b, a + d);
  const s = vs ? Math.hypot(a + d, c - b) / vs : 1;
  const r00 = Math.cos(th), r01 = -Math.sin(th), r10 = Math.sin(th), r11 = Math.cos(th);
  return [s * r00, s * r01, nx - s * (r00 * mx + r01 * my), s * r10, s * r11, ny - s * (r10 * mx + r11 * my)];
}
export function invertAffine(m: number[]): number[] {
  const [a, b, tx, c, d, ty] = m, det = a * d - b * c || 1e-12;
  return [d / det, -b / det, (b * ty - d * tx) / det, -c / det, a / det, (c * tx - a * ty) / det];
}

/** minivision CropImage._get_new_box: the face box grown by `scale`, kept inside the picture */
export function fasBox(srcW: number, srcH: number, box: { x: number; y: number; w: number; h: number }, scale: number): [number, number, number, number] {
  const k = Math.min((srcH - 1) / box.h, Math.min((srcW - 1) / box.w, scale));
  const nw = box.w * k, nh = box.h * k, cx = box.w / 2 + box.x, cy = box.h / 2 + box.y;
  let x0 = cx - nw / 2, y0 = cy - nh / 2, x1 = cx + nw / 2, y1 = cy + nh / 2;
  if (x0 < 0) { x1 -= x0; x0 = 0; }
  if (y0 < 0) { y1 -= y0; y0 = 0; }
  if (x1 > srcW - 1) { x0 -= x1 - srcW + 1; x1 = srcW - 1; }
  if (y1 > srcH - 1) { y0 -= y1 - srcH + 1; y1 = srcH - 1; }
  return [Math.trunc(x0), Math.trunc(y0), Math.trunc(x1), Math.trunc(y1)];
}

export function l2norm(v: ArrayLike<number>): Float32Array {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const k = 1 / (Math.sqrt(s) || 1), o = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) o[i] = v[i] * k;
  return o;
}
export function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

// ─────────────── the runtime ───────────────
type Ort = typeof import('onnxruntime-web');
interface Engine { ort: Ort; yunet: InferenceSession; sface: InferenceSession; fas: InferenceSession }
let engP: Promise<Engine> | null = null;

/** Loads onnxruntime-web + the 3 models (only on the Verify screen). */
export function loadFaceEngine(): Promise<Engine> {
  if (!engP) {
    engP = (async () => {
      const ort = await import('onnxruntime-web/wasm');
      ort.env.wasm.wasmPaths = base() + 'ort/';
      ort.env.wasm.numThreads = 1;   // no cross-origin isolation on kringapp.com → no threads; also the safe choice on cheap phones
      ort.env.logLevel = 'error';
      const opt: InferenceSession.SessionOptions = { executionProviders: ['wasm'], graphOptimizationLevel: 'all' };
      const m = base() + 'face2/';
      const [yunet, sface, fas] = await Promise.all([
        ort.InferenceSession.create(m + 'yunet_2023mar.onnx', opt),
        ort.InferenceSession.create(m + 'sface_2021dec_int8.onnx', opt),
        ort.InferenceSession.create(m + 'minifasnet_v2_v1se_80.onnx', opt),
      ]);
      return { ort, yunet, sface, fas } as Engine;
    })().catch((e) => { engP = null; throw e; });
  }
  return engP;
}

type Src = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
const srcSize = (s: Src) => ({
  w: (s as HTMLVideoElement).videoWidth || (s as HTMLImageElement).naturalWidth || (s as HTMLCanvasElement).width,
  h: (s as HTMLVideoElement).videoHeight || (s as HTMLImageElement).naturalHeight || (s as HTMLCanvasElement).height,
});
function ctx2d(w: number, h: number): CanvasRenderingContext2D {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c.getContext('2d', { willReadFrequently: true })!;
}
/** RGBA pixels → planar float32 [1,3,h,w], 0-255, in the order asked */
function planes(px: Uint8ClampedArray, w: number, h: number, order: 'bgr' | 'rgb'): Float32Array {
  const n = w * h, o = new Float32Array(3 * n);
  const [r0, r1, r2] = order === 'bgr' ? [2, 1, 0] : [0, 1, 2];
  for (let i = 0; i < n; i++) { o[i] = px[i * 4 + r0]; o[n + i] = px[i * 4 + r1]; o[2 * n + i] = px[i * 4 + r2]; }
  return o;
}

export interface FaceRead {
  face: Face | null;
  faces: number;
  /** 128 numbers, L2-normalised (null without a face) */
  emb: Float32Array | null;
  /** real-face score 0..1 (MiniFASNet, both scales fused) */
  real: number | null;
  ms: number;
}

/** One full read of a picture: find the face, embed it, score it real / spoof. */
export async function readFace(src: Src, opts: { fas?: boolean } = {}): Promise<FaceRead> {
  const t0 = performance.now();
  const e = await loadFaceEngine();
  const { w, h } = srcSize(src);
  const full = ctx2d(w, h);
  full.drawImage(src, 0, 0, w, h);
  const px = full.getImageData(0, 0, w, h).data;
  // YuNet (fixed 640×640 input): the picture letterboxed (top-left), BGR 0-255
  const S = 640;
  const detect = async (sx: number, sy: number, sw: number, sh: number): Promise<Face[]> => {
    const k = Math.min(1, S / Math.max(sw, sh));   // never enlarge: OpenCV runs YuNet at the picture's own size
    const lb = ctx2d(S, S);
    lb.fillStyle = '#000'; lb.fillRect(0, 0, S, S);
    lb.drawImage(full.canvas, sx, sy, sw, sh, 0, 0, sw * k, sh * k);
    const det = await e.yunet.run({ input: new e.ort.Tensor('float32', planes(lb.getImageData(0, 0, S, S).data, S, S, 'bgr'), [1, 3, S, S]) });
    return decodeYunet(det as unknown as Record<string, { data: ArrayLike<number> }>, S).map((f) => ({ ...f, x: sx + f.x / k, y: sy + f.y / k, w: f.w / k, h: f.h / k,
      kps: f.kps.map(([x, y]) => [sx + x / k, sy + y / k] as [number, number]) }));
  };
  const all = await detect(0, 0, w, h);
  if (!all.length) return { face: null, faces: 0, emb: null, real: null, ms: performance.now() - t0 };
  let face = all.sort((a, b) => b.w * b.h - a.w * a.h)[0];
  const faces = all.filter((f) => f.w >= face.w * 0.6).length;
  // a big photo was shrunk to fit 640: find the 5 points again on a close crop at full detail (the alignment needs them exact)
  if (Math.max(w, h) > S * 1.15) {
    const side = Math.min(Math.max(face.w, face.h) * 2.2, Math.max(w, h));
    const cx = face.x + face.w / 2, cy = face.y + face.h / 2;
    const sx = Math.max(0, Math.min(w - side, cx - side / 2)), sy = Math.max(0, Math.min(h - side, cy - side / 2));
    const again = (await detect(sx, sy, Math.min(side, w), Math.min(side, h))).sort((a, b) => b.w * b.h - a.w * a.h)[0];
    if (again && iou(again, face) > 0.5) face = again;
  }
  // SFace: 112×112 aligned crop (bilinear, like cv2.warpAffine), RGB 0-255
  const inv = invertAffine(similarity(face.kps));
  const A = 112, al = new Uint8ClampedArray(A * A * 4);
  for (let y = 0; y < A; y++) for (let x = 0; x < A; x++) {
    const sx = inv[0] * x + inv[1] * y + inv[2], sy = inv[3] * x + inv[4] * y + inv[5];
    const x0 = Math.floor(sx), y0 = Math.floor(sy), fx = sx - x0, fy = sy - y0, o = (y * A + x) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const g = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : px[(yy * w + xx) * 4 + ch]);
      al[o + ch] = (g(x0, y0) * (1 - fx) + g(x0 + 1, y0) * fx) * (1 - fy) + (g(x0, y0 + 1) * (1 - fx) + g(x0 + 1, y0 + 1) * fx) * fy;
    }
    al[o + 3] = 255;
  }
  const fr = await e.sface.run({ data: new e.ort.Tensor('float32', planes(al, A, A, 'rgb'), [1, 3, A, A]) });
  const emb = l2norm((fr.fc1 as Tensor).data as Float32Array);
  // MiniFASNet: crops at 2.7× and 4.0× the face box, resized to 80×80, BGR 0-255
  let real: number | null = null;
  if (opts.fas !== false) {
    const crop = (scale: number) => {
      const [x0, y0, x1, y1] = fasBox(w, h, face, scale);
      const c = ctx2d(80, 80);
      c.drawImage(full.canvas, x0, y0, x1 - x0 + 1, y1 - y0 + 1, 0, 0, 80, 80);
      return new e.ort.Tensor('float32', planes(c.getImageData(0, 0, 80, 80).data, 80, 80, 'bgr'), [1, 3, 80, 80]);
    };
    const pr = await e.fas.run({ crop27: crop(2.7), crop40: crop(4.0) });
    real = ((pr.prob as Tensor).data as Float32Array)[1];
  }
  return { face, faces, emb, real, ms: performance.now() - t0 };
}
