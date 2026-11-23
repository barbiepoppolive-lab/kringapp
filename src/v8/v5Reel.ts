/**
 * Reels (0024): check, shrink, upload and sign short vertical videos.
 * - Check: video file, 5–60 s, taller than wide, ≤ 300 MB before shrinking, ≤ 50 MB after.
 * - Shrink (when the browser can): redraw at 720×1280 (centre crop to 9:16) and record H.264 MP4 (or WebM) at ~2 Mbit/s,
 *   so the feed starts fast. If the browser cannot, the original file goes up as it is (if ≤ 50 MB).
 * - Poster: one JPEG frame for an instant first paint.
 * - Upload: private bucket kr8-reels/<user id>/<uuid>.<ext>, with progress and retry; then kr8_create_reel.
 * - Playback: short-lived signed links, only for Reels the server lets this viewer see.
 */
import { v5Client } from './v5Live';
import { isHevc, probeMp4 } from './mp4Probe';
import { TRIM_SOURCE_MAX_MS, type TrimWindow } from './reelTrim';

export const REEL_MIN_MS = 5000;
export const REEL_MAX_MS = 60000;      // 15 Nov: 5–60 s (DB check widened in 0055; 61000 ms there)
export const REEL_MAX_BYTES = 50 * 1024 * 1024;
const RAW_MAX_BYTES = 300 * 1024 * 1024;
const OUT_W = 720;
/** Reel upload target (16 Nov perf job): 720×1280, H.264 ~1.3 Mbit/s + 96 kbit/s sound. */
export const TARGET_VIDEO_BPS = 1_300_000;
const LIGHT_BPS = 1_700_000;
export const bitrate = (bytes: number, ms: number) => (ms > 0 ? (bytes * 8) / (ms / 1000) : Infinity);
const OUT_H = 1280;
const META_TIMEOUT_MS = 12000;

export type ReelProblem = 'NOT_VIDEO' | 'TOO_SHORT' | 'TOO_LONG' | 'NOT_VERTICAL' | 'TOO_BIG' | 'UNREADABLE' | 'EMPTY' | 'HEVC' | 'INTERRUPTED' | 'TRIM_FAIL';
export class ReelError extends Error {
  /** status: the storage server's HTTP status for UPLOAD (0 = the request never left the phone), for the problem log;
   *  why: short reason for the problem log (TRIM_FAIL: what each pipeline said) */
  constructor(public code: ReelProblem | 'UPLOAD' | 'SIGN_IN' | 'REPICK', public status?: number, public why?: string) { super(code); }
}
/**
 * decodable = this browser could show a frame (false: we only know the header, e.g. a slow cloud file); codec from the header.
 * Trim (16 Nov): needsTrim = longer than 60 s, the trim step must run first. After it, `trim` is the chosen part of the file,
 * durationMs is that part's length and fullMs the whole file's.
 */
export interface ReelInfo {
  file: File; url: string; durationMs: number; width: number; height: number; decodable?: boolean; codec?: string;
  needsTrim?: boolean; trim?: TrimWindow; fullMs?: number;
}
export interface ReelReady { blob: Blob; mime: string; ext: 'mp4' | 'webm' | 'mov'; poster: Blob; durationMs: number; width: number; height: number; shrunk: boolean }

/** Phone pickers send odd types: '' (content:// files), application/octet-stream, video/3gpp, video/x-matroska, video/hevc … */
export const VIDEO_EXT = /\.(mp4|m4v|mov|qt|webm|3gp|3g2|mkv|hevc|h265)$/i;
export function looksLikeVideo(file: { name?: string; type?: string }): boolean {
  const t = (file.type || '').toLowerCase();
  return t.startsWith('video/') || VIDEO_EXT.test(file.name || '') || t === '' || t === 'application/octet-stream' || t === 'application/mp4';
}

/**
 * 18 Nov (member #74, Android 10 installed app, ~23 failed tries): the phone's picker hands over files whose bytes come and go
 * (Google Photos / cloud-backed clips, content:// files). The same clip read fine one minute and failed the next: "UNREADABLE"
 * on pick, "REPICK" on Post, and the shrink step failing on big clips (→ TOO_BIG). Fix: copy the clip into memory ONCE, right
 * when it is picked (with a few retries while the phone finishes fetching it). From then on every step (header, preview,
 * shrink, upload) reads the in-memory copy, which cannot disappear. Clips over MEM_COPY_MAX keep the old path.
 */
export const MEM_COPY_MAX = 120 * 1024 * 1024;
const inMemory = new WeakSet<Blob>();
export const isInMemory = (b: Blob) => inMemory.has(b);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export async function copyToMemory(file: File, tries = 4): Promise<{ file: File; copied: boolean; why?: string }> {
  if (inMemory.has(file)) return { file, copied: true };
  if (!file.size || file.size > MEM_COPY_MAX) return { file, copied: false, why: file.size ? 'big' : 'empty' };
  let why = '';
  for (let i = 0; i < tries; i++) {
    try {
      const buf = await file.arrayBuffer();
      if (buf.byteLength === file.size) {
        const f = new File([buf], file.name || 'clip.mp4', { type: file.type, lastModified: file.lastModified });
        inMemory.add(f);
        return { file: f, copied: true };
      }
      why = `short${buf.byteLength}`;
    } catch (e) { why = String((e as Error)?.name || 'err').slice(0, 16); }
    if (i < tries - 1) await sleep(500 * (i + 1));
  }
  return { file, copied: false, why };
}

function loadVideo(url: string, timeoutMs = META_TIMEOUT_MS): Promise<HTMLVideoElement> {
  return new Promise((ok, bad) => {
    const v = document.createElement('video');
    const t = setTimeout(() => bad(new ReelError('UNREADABLE')), timeoutMs);
    v.preload = 'auto'; v.muted = true; v.playsInline = true;
    v.onloadedmetadata = () => { clearTimeout(t); ok(v); };
    v.onerror = () => { clearTimeout(t); bad(new ReelError('UNREADABLE')); };
    v.src = url;
  });
}

/** Browser duration in ms, or 0. Some files report Infinity / NaN until seeked (MediaRecorder WebMs, some Android MP4s). */
async function browserDurationMs(v: HTMLVideoElement): Promise<number> {
  let d = v.duration;
  if (!isFinite(d) || !(d > 0)) {
    try {
      v.currentTime = 1e6;
      await new Promise((r) => { v.ontimeupdate = r; v.ondurationchange = r; setTimeout(r, 1500); });
      d = v.duration;
      v.currentTime = 0;
    } catch { d = NaN; }
  }
  return isFinite(d) && d > 0 ? Math.round(d * 1000) : 0;
}

/**
 * Fast checks before anything is uploaded. Never blocks a valid clip:
 * the browser is asked first; whatever it cannot tell us (length, size) is read from the MP4/MOV header.
 * Only a clip that this browser cannot open AND that is HEVC gets the "HEVC" message (with how to fix it).
 */
export async function checkReel(file: File): Promise<ReelInfo> {
  if (!file) throw new ReelError('NOT_VIDEO');
  if (!file.size) throw new ReelError('EMPTY');
  if (!looksLikeVideo(file)) throw new ReelError('NOT_VIDEO');
  if (file.size > RAW_MAX_BYTES) throw new ReelError('TOO_BIG');
  const mem = await copyToMemory(file);
  // the bytes could not be read at all (cloud-only / lost file): say so plainly instead of a generic "can't open"
  if (!mem.copied && mem.why && mem.why !== 'big') throw new ReelError('UNREADABLE', undefined, `read:${mem.why}`);
  file = mem.file;
  const head = await probeMp4(file);
  const t = (file.type || '').toLowerCase();
  if (!head && !t.startsWith('video/') && !VIDEO_EXT.test(file.name || '')) throw new ReelError('NOT_VIDEO');
  const url = URL.createObjectURL(file);
  const fail = (code: ReelProblem): never => { URL.revokeObjectURL(url); throw new ReelError(code); };
  let v: HTMLVideoElement | null = null;
  try { v = await loadVideo(url); } catch { v = null; }
  let durationMs = v ? await browserDurationMs(v) : 0;
  let width = v?.videoWidth || 0, height = v?.videoHeight || 0;
  const decodable = !!(v && width && height);
  if (!durationMs && head?.durationMs) durationMs = head.durationMs;
  if (!width || !height) { width = head?.width || 0; height = head?.height || 0; }
  // 16 Nov: an HEVC clip that <video> cannot open is fine when WebCodecs can decode it (it is shrunk to H.264 before upload)
  if (!decodable && head && isHevc(head.codec) && !(await import('./reelTranscode').then((m) => m.canDecodeReel(file)).catch(() => false))) fail('HEVC');
  // 18 Nov: header and <video> both silent (unusual MP4 layout, moov > 16 MB, MKV/3GP…): ask the WebCodecs demuxer before giving up
  if (!width || !height || !durationMs) {
    const m = await import('./reelTranscode').then((x) => x.readMeta(file)).catch(() => null);
    if (m) { if (!durationMs) durationMs = m.durationMs; if (!width || !height) { width = m.width; height = m.height; } }
  }
  if (!width || !height || !durationMs) fail('UNREADABLE');
  if (durationMs < REEL_MIN_MS - 300) fail('TOO_SHORT');
  // 16 Nov: over 60 s (up to ~10 min) is no longer refused: the member trims it to one 5–60 s part first
  if (durationMs > TRIM_SOURCE_MAX_MS + 900) fail('TOO_LONG');
  if (height < width * 1.2) fail('NOT_VERTICAL');
  if (v) { v.removeAttribute('src'); try { v.load(); } catch { /* jsdom */ } }
  const needsTrim = durationMs > REEL_MAX_MS + 900;
  return { file, url, durationMs, width, height, decodable, codec: head?.codec || '', ...(needsTrim ? { needsTrim, fullMs: durationMs } : {}) };
}

/** The trim step's choice: the Reel becomes that part (durationMs = the part's length). */
export function applyTrim(info: ReelInfo, w: TrimWindow): ReelInfo {
  const fullMs = info.fullMs ?? info.durationMs;
  return { ...info, needsTrim: false, trim: { startMs: w.startMs, endMs: w.endMs }, fullMs, durationMs: w.endMs - w.startMs };
}

export function pickMime(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  const opts = ['video/mp4;codecs=avc1.4d002a,mp4a.40.2', 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
    'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return opts.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch { return false; } }) || null;
}

function drawCover(ctx: CanvasRenderingContext2D, v: HTMLVideoElement, w: number, h: number) {
  const s = Math.max(w / v.videoWidth, h / v.videoHeight);
  const dw = v.videoWidth * s, dh = v.videoHeight * s;
  ctx.drawImage(v, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** A plain branded frame when no video frame can be drawn (the server still gets a valid JPEG poster). */
function fallbackPoster(): Promise<Blob> {
  return new Promise((ok) => {
    const empty = () => ok(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xd9])], { type: 'image/jpeg' }));
    try {
      const c = document.createElement('canvas'); c.width = 540; c.height = 960;
      const ctx = c.getContext('2d');
      if (!ctx) { empty(); return; }
      const g = ctx.createLinearGradient(0, 0, 540, 960);
      g.addColorStop(0, '#1F4BFF'); g.addColorStop(1, '#FF3D8B');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 540, 960);
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath(); ctx.moveTo(230, 420); ctx.lineTo(330, 480); ctx.lineTo(230, 540); ctx.closePath(); ctx.fill();
      c.toBlob((b) => (b ? ok(b) : empty()), 'image/jpeg', 0.8);
    } catch { empty(); }
  });
}

/** True when the canvas is (almost) one flat dark colour: nothing was drawn. */
function looksBlank(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  try {
    const d = ctx.getImageData(0, 0, w, h).data;
    let max = 0;
    for (let i = 0; i < d.length; i += 4 * 97) max = Math.max(max, d[i], d[i + 1], d[i + 2]);
    return max < 12;
  } catch { return false; }
}

/**
 * Poster from the <video> element, or null when it cannot draw a frame.
 * 16 Nov black-poster bug: this used to draw after `seeked` OR a 2.5 s timeout without checking that a frame was decoded.
 * A 4K / HEVC / 100+ MB phone clip has its size from the header (videoWidth > 0) but no decoded frame yet (or the phone's
 * <video> decoder cannot decode it at all), so drawImage painted nothing and the empty canvas became a black JPEG.
 * Now: wait for a decoded frame (readyState ≥ 2), and reject a canvas that is still blank.
 */
async function posterOf(v: HTMLVideoElement, atSec: number): Promise<Blob | null> {
  await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = Math.min(atSec, Math.max(0, v.duration - 0.1)); setTimeout(r, 2500); });
  if (v.readyState < 2) await new Promise<void>((r) => { v.onloadeddata = () => r(); v.oncanplay = () => r(); setTimeout(r, 1500); });
  if (v.readyState < 2) return null;
  const c = document.createElement('canvas'); c.width = 540; c.height = 960;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  drawCover(ctx, v, c.width, c.height);
  if (looksBlank(ctx, c.width, c.height)) return null;
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.72));
}

/** Poster: <video> frame → WebCodecs-decoded frame → branded gradient. Never a black frame from a failed draw. */
async function makePoster(info: ReelInfo, vv: HTMLVideoElement | null): Promise<Blob> {
  // trimmed: the poster comes from inside the chosen part
  const at = (info.trim ? info.trim.startMs / 1000 : 0) + Math.min(1, info.durationMs / 3000);
  try { const p = vv && vv.videoWidth ? await posterOf(vv, at) : null; if (p) return p; } catch { /* next */ }
  try { const p = await (await import('./reelTranscode')).webCodecsPoster(info.file, at); if (p) return p; } catch { /* next */ }
  return fallbackPoster();
}

/** 0148 copied-Reel check: two extra frames (middle, near the end of the chosen part) for the server's watermark reader
 *  (TikTok / CapCut marks often appear after the first second). Best effort, ≤ 4 s, never blocks posting. Kept by poster blob. */
const scanOf = new WeakMap<Blob, Blob[]>();
export const scanFramesOf = (poster: Blob): Blob[] => scanOf.get(poster) || [];
export async function makeScanFrames(info: ReelInfo, vv: HTMLVideoElement | null, poster: Blob): Promise<Blob[]> {
  const from = info.trim ? info.trim.startMs / 1000 : 0;
  const len = info.durationMs / 1000;
  const out: Blob[] = [];
  // 0150: when the <video> cannot give a frame (some iPhones / Safari), read the file with WebCodecs like the poster does
  const grab = async (at: number): Promise<Blob | null> => {
    if (vv && vv.videoWidth) { const b = await posterOf(vv, at).catch(() => null); if (b) return b; }
    return (await import('./reelTranscode')).webCodecsPoster(info.file, at).catch(() => null);
  };
  const work = (async () => {
    for (const at of [from + len * 0.5, from + Math.max(len - 0.5, len * 0.9)]) {
      const b = await grab(at);
      if (b) out.push(b);
    }
  })();
  await Promise.race([work, new Promise((r) => setTimeout(r, 5000))]);
  const got = out.slice(0, 2);
  if (got.length) scanOf.set(poster, got);
  return got;
}

/** Preview image for the post sheet when the <video> there cannot show a frame (object URL, or ''). */
export async function previewPoster(info: ReelInfo): Promise<string> {
  const p = await (await import('./reelTranscode')).webCodecsPoster(info.file, (info.trim ? info.trim.startMs / 1000 : 0) + Math.min(1, info.durationMs / 3000)).catch(() => null);
  return p ? URL.createObjectURL(p) : '';
}

/**
 * Prepares the upload. Call `startAudio()` synchronously inside the tap handler first (iOS needs the tap to allow sound capture).
 * onProgress gets 0..1 while re-recording (this takes as long as the clip).
 */
export function makeAudio(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    const ac = AC ? new AC() : null;
    void ac?.resume();
    return ac;
  } catch { return null; }
}

export async function prepareReel(info: ReelInfo, ac: AudioContext | null, onProgress: (p: number) => void): Promise<ReelReady> {
  // Trim (16 Nov): `trim` set = cut only that part. The whole long file is NEVER uploaded: where an untrimmed clip would fall
  // back to "send the original", a trimmed one stops with TRIM_FAIL (the member picks another clip).
  const cut = info.trim;
  const fromSec = cut ? cut.startMs / 1000 : 0;
  const toSec = cut ? cut.endMs / 1000 : 0;
  const why: string[] = [];
  let vv: HTMLVideoElement | null = null;
  if (info.decodable !== false) { try { vv = await loadVideo(info.url); } catch { vv = null; } }
  const poster = await makePoster(info, vv);
  await makeScanFrames(info, vv, poster).catch(() => []);   // 0148: frames for the copied-Reel check (best effort)
  const original = (): ReelReady => {
    if (cut) throw new ReelError('TRIM_FAIL', undefined, why.join('|').slice(0, 52) || 'none');
    if (info.file.size > REEL_MAX_BYTES) throw new ReelError('TOO_BIG', undefined, why.join('|').slice(0, 52) || 'none');   // message: trim it shorter or film at 1080p
    const { ext, mime } = uploadType(info.file);
    return { blob: info.file, mime, ext, poster, durationMs: info.durationMs, width: info.width, height: info.height, shrunk: false };
  };
  // 16 Nov: an original that is already light (≤ ~1.6 Mbit/s, ≤ 720 px wide) goes up as it is; everything else is shrunk
  // to 720×1280 and ~1.3 Mbit/s (≈5 MB per 30 s), which is what makes the feed start fast on 4G
  if (!cut && bitrate(info.file.size, info.durationMs) <= LIGHT_BPS && Math.min(info.width, info.height) <= 720 && /mp4|quicktime/i.test(uploadType(info.file).mime)) return original();
  // 1st choice (16 Nov): WebCodecs transcode (mediabunny, loaded only now). Faster than real time, decodes HEVC/4K that
  // <video> may not, and cannot be cut short by the screen locking: the result is read back and must be the full length
  // (trimmed: the length of the chosen part).
  try {
    const t = await (await import('./reelTranscode')).transcodeReel(info.file, TARGET_VIDEO_BPS, onProgress, cut ? { startSec: fromSec, endSec: toSec } : undefined);
    if (!t) why.push('wc:none');
    else if (t.blob.size < 20_000 || t.blob.size > REEL_MAX_BYTES) why.push(`wc:size${Math.round(t.blob.size / 1e5) / 10}`);
    else if (Math.abs(t.durationMs - info.durationMs) > 500) why.push(`wc:len${t.durationMs}`);
    else {
      onProgress(1);
      return { blob: t.blob, mime: t.mime, ext: t.ext, poster, durationMs: info.durationMs, width: OUT_W, height: OUT_H, shrunk: true };
    }
  } catch (e) { why.push(`wc:${String((e as Error)?.name || 'err').slice(0, 16)}`); }
  // 2nd choice: re-record in real time through <video> + canvas + MediaRecorder (trimmed: from the start of the part to its end)
  if (!vv || !vv.videoWidth) { why.push('rec:novideo'); return original(); }
  const v = vv;
  const mime = pickMime();
  const canvas = document.createElement('canvas');
  if (!mime || typeof canvas.captureStream !== 'function') { why.push('rec:nomime'); return original(); }
  const endSec = cut ? toSec : Infinity;
  try {
    canvas.width = OUT_W; canvas.height = OUT_H;
    const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(30);
    if (ac) {
      try {
        v.muted = false;
        const src = ac.createMediaElementSource(v);
        const dest = ac.createMediaStreamDestination();
        src.connect(dest);                       // not connected to the speakers: the user hears nothing
        dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
      } catch { v.muted = true; }
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: TARGET_VIDEO_BPS, audioBitsPerSecond: 96_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    v.currentTime = fromSec;
    await new Promise((r) => { v.onseeked = r; setTimeout(r, cut ? 2500 : 800); });
    let raf = 0;
    let reachedEnd = false;
    let stopAtEnd: () => void = () => undefined;
    const paint = () => {
      drawCover(ctx, v, OUT_W, OUT_H);
      onProgress(Math.min(1, (v.currentTime - fromSec) / (info.durationMs / 1000)));
      if (v.currentTime >= endSec) { stopAtEnd(); return; }
      raf = requestAnimationFrame(paint);
    };
    drawCover(ctx, v, OUT_W, OUT_H);
    // O (15 Nov): the phone locking or switching to LINE mid-recording used to upload a cut-short clip. Now it stops and asks.
    let hidden = false;
    const onHide = () => { if (document.hidden) { hidden = true; v.pause(); v.dispatchEvent(new Event('ended')); } };
    document.addEventListener('visibilitychange', onHide);
    // trimmed: rAF stops when the tab is in the background, so `timeupdate` also watches for the end of the part
    const onTime = () => { if (v.currentTime >= endSec) stopAtEnd(); };
    if (cut) v.addEventListener('timeupdate', onTime);
    rec.start(1000);
    try {
      await v.play();
      paint();
      await new Promise<void>((r) => {
        stopAtEnd = () => { if (!reachedEnd) { reachedEnd = true; v.pause(); r(); } };
        v.onended = () => r(); v.addEventListener('ended', () => r(), { once: true });
        setTimeout(r, info.durationMs + 4000);
      });
    } finally {
      document.removeEventListener('visibilitychange', onHide);
      v.removeEventListener('timeupdate', onTime);
      cancelAnimationFrame(raf);
      rec.stop();
      await done;
      stream.getTracks().forEach((t) => t.stop());
    }
    const recordedMs = Math.round((v.currentTime - fromSec) * 1000);
    const whole = !hidden && (cut ? reachedEnd || recordedMs >= info.durationMs - 500 : v.ended || recordedMs >= info.durationMs - 500);
    if (!whole) {
      // never upload a shortened clip: use the original if it is small enough (never when trimmed), otherwise ask to try again
      if (!cut && info.file.size <= REEL_MAX_BYTES) return original();
      throw new ReelError('INTERRUPTED');
    }
    const blob = new Blob(parts, { type: mime.split(';')[0] });
    onProgress(1);
    if (blob.size < 20_000 || blob.size > REEL_MAX_BYTES) { why.push(`rec:size${Math.round(blob.size / 1e5) / 10}`); return original(); }
    // the recorded file must be as long as the original (trimmed: the chosen part) ±0.5 s when its header says how long it is
    // 16 Nov: Chrome's MediaRecorder writes FRAGMENTED MP4, whose header only covers the first fragment (e.g. 111 ms), so that
    // number used to throw away every good recording. A header under 1 s is "unknown": the file is then measured packet by packet.
    const head = blob.type.includes('mp4') ? await probeMp4(blob) : null;
    let gotMs = head?.durationMs && head.durationMs >= 1000 ? head.durationMs : 0;
    if (!gotMs && (cut || head)) gotMs = await import('./reelTranscode').then((m) => m.blobDurationMs(blob)).catch(() => 0);
    if (gotMs && Math.abs(gotMs - info.durationMs) > 500) { why.push(`rec:len${gotMs}`); return original(); }
    // keep whichever is smaller (a small original upload is already fast); a trimmed Reel is always the recorded part
    if (!cut && info.file.size <= blob.size && info.file.size <= REEL_MAX_BYTES && /mp4|quicktime/i.test(info.file.type)) return original();
    return { blob, mime: blob.type, ext: blob.type.includes('webm') ? 'webm' : 'mp4', poster, durationMs: info.durationMs, width: OUT_W, height: OUT_H, shrunk: true };
  } catch (e) {
    if (e instanceof ReelError && (e.code === 'INTERRUPTED' || e.code === 'TRIM_FAIL')) throw e;
    why.push(`rec:${String((e as Error)?.name || 'err').slice(0, 16)}`);
    return original();
  }
}

/** The storage bucket only takes video/mp4, video/quicktime and video/webm (and paths ending .mp4/.mov/.webm), so odd phone types are mapped. */
export function uploadType(file: { name?: string; type?: string }): { ext: 'mp4' | 'webm' | 'mov'; mime: string } {
  const t = (file.type || '').toLowerCase(), n = (file.name || '').toLowerCase();
  const ext = /webm|matroska/.test(t) || /\.(webm|mkv)$/.test(n) ? 'webm' : /quicktime/.test(t) || /\.(mov|qt)$/.test(n) ? 'mov' : 'mp4';
  return { ext, mime: ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4' };
}

function uuid(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}

/** Raw upload with progress (supabase-js has no progress callback). */
function putOnce(base: string, key: string, token: string, path: string, body: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((ok, bad) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${base.replace(/\/$/, '')}/storage/v1/object/kr8-reels/${path}`);
    x.setRequestHeader('authorization', `Bearer ${token}`);
    x.setRequestHeader('apikey', key);
    x.setRequestHeader('content-type', type);
    x.setRequestHeader('x-upsert', 'false');
    x.setRequestHeader('cache-control', 'max-age=31536000');   // a file never changes after upload (new upload = new name)
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    // errfix-1 (18 Nov): storage's own reason (e.g. "InvalidJWT", "Payload too large") goes into the log, not just "400"
    // fix4 (19 Nov): a 409 / "Duplicate" is NOT a success any more (it can be a half-sent file); every try uses a fresh name instead
    x.onload = () => (x.status >= 200 && x.status < 300) ? ok() : bad(new ReelError('UPLOAD', x.status, storageWhy(x.responseText)));
    x.onerror = () => bad(new ReelError('UPLOAD', 0));
    x.send(body);
  });
}
/** Short reason from a Supabase Storage error body ({"error":"…","message":"…"}), for the phone-error log. */
export function storageWhy(body: string | null | undefined): string | undefined {
  if (!body) return undefined;
  try {
    const j = JSON.parse(body) as { error?: unknown; message?: unknown; statusCode?: unknown };
    const parts = [j.statusCode, j.error, j.message].filter((x) => typeof x === 'string' || typeof x === 'number').map(String);
    return parts.length ? parts.join(' ').replace(/\s+/g, ' ').slice(0, 80) : undefined;
  } catch { return body.replace(/\s+/g, ' ').slice(0, 80) || undefined; }
}
/**
 * fix4 (19 Nov, live: UPLOAD:0 then UPLOAD:400 "409 Duplicate The resource already exists" on every Retry): the old code reused the
 * same storage name on every try, so a file that had (half) landed on the first try blocked every retry. Now EVERY try, inside one
 * upload and across Retry taps, gets a brand-new name `<user id>/<new uuid>.<ext>` (the server only checks that shape). A file that
 * landed half-way is simply left behind under its old name and never blocks the next try.
 */
export function reelObjectPath(uid: string, ext: string, gen: () => string = uuid): string { return `${uid}/${gen()}.${ext}`; }
/** Storage says "this name is taken" — as HTTP 409 or as 400 with statusCode 409 / "Duplicate" in the body. */
export function isDuplicate(e: unknown): boolean {
  const r = e as ReelError;
  return r?.status === 409 || /\b409\b|duplicate|already exists/i.test(r?.why || '');
}
/** Worth another try with a fresh name: no answer (0), server trouble, timeouts, rate limits, and "name taken". */
export function retryableUpload(e: unknown): boolean {
  const st = (e as ReelError)?.status ?? 0;
  return !st || st >= 500 || st === 408 || st === 429 || isDuplicate(e);
}
/** Tries `put` up to `tries` times, each with a NEW name from `newPath`; returns the name that landed. */
export async function putFresh(put: (path: string) => Promise<void>, newPath: () => string, tries = 3, waitMs = 800): Promise<string> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    const path = newPath();
    try { await put(path); return path; } catch (e) {
      last = e;
      if (!retryableUpload(e)) break;   // a real "no" (bad token, too big…): retrying won't help
      if (i < tries - 1 && waitMs) await new Promise((r) => setTimeout(r, waitMs * (i + 1)));
    }
  }
  throw last;
}
/**
 * 16 Nov: inside LINE / Facebook / Instagram's own browser on Android, the picked file can stop being readable a moment later
 * (every upload then fails at once). Reading it into memory first makes it safe to send, and a file that can't be read at all
 * gives a clear "choose the video again" instead of endless failures.
 */
export async function readable(b: Blob): Promise<Blob> {
  if (!(typeof File !== 'undefined' && b instanceof File) || inMemory.has(b)) return b;
  let buf: ArrayBuffer;
  try { buf = await b.arrayBuffer(); } catch { throw new ReelError('REPICK'); }
  // errfix-1 (18 Nov, #68): a lost file can also read back EMPTY or cut short instead of failing; sending that gave storage 400s
  if (buf.byteLength === 0 || buf.byteLength !== b.size) throw new ReelError('REPICK');
  return new Blob([buf], { type: b.type });
}
/** fix4: parts of a Reel that already landed (kept across Retry taps, so only the missing part is sent again, under a new name). */
const landed = new WeakMap<ReelReady, { posterPath?: string; videoPath?: string; scanned?: boolean }>();

export interface UploadedReel { videoPath: string; posterPath: string }

/** Uploads poster + video. Parts that landed on an earlier call are kept; every new try of a missing part gets a fresh name. */
export async function uploadReel(r: ReelReady, onProgress: (p: number) => void, prev?: Partial<UploadedReel> & { done?: string[] }): Promise<UploadedReel & { done: string[] }> {
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  const s = data.session;
  if (!s) throw new ReelError('SIGN_IN');
  const cfg = c as unknown as { supabaseUrl: string; supabaseKey: string };
  const have = landed.get(r) || {};
  landed.set(r, have);
  const prevDone = prev?.done || [];
  if (!have.posterPath && prev?.posterPath && prevDone.includes(prev.posterPath)) have.posterPath = prev.posterPath;
  if (!have.videoPath && prev?.videoPath && prevDone.includes(prev.videoPath)) have.videoPath = prev.videoPath;
  const uid = s.user.id;
  if (!have.posterPath) {
    have.posterPath = await putFresh((p) => putOnce(cfg.supabaseUrl, cfg.supabaseKey, s.access_token, p, r.poster, 'image/jpeg', () => undefined), () => reelObjectPath(uid, 'jpg'));
  }
  if (!have.videoPath) {
    const body = await readable(r.blob);
    have.videoPath = await putFresh((p) => putOnce(cfg.supabaseUrl, cfg.supabaseKey, s.access_token, p, body, r.mime.split(';')[0], onProgress), () => reelObjectPath(uid, r.ext));
  }
  // 0148: the scan frames sit next to the video (<video>.s1.jpg / .s2.jpg) for the server's watermark check; a failure is ignored
  // (the check then reads the poster only). Nothing references them, so the nightly orphan clean-up removes them after a day.
  const scan = scanFramesOf(r.poster);
  if (scan.length && !have.scanned) {
    have.scanned = true;
    for (const [i, b] of scan.entries()) {
      await putOnce(cfg.supabaseUrl, cfg.supabaseKey, s.access_token, `${have.videoPath}.s${i + 1}.jpg`, b, 'image/jpeg', () => undefined).catch(() => undefined);
    }
  }
  onProgress(1);
  return { videoPath: have.videoPath, posterPath: have.posterPath, done: [have.posterPath, have.videoPath] };
}

export async function createReel(u: UploadedReel, r: ReelReady, area: string, body: string, here: boolean): Promise<{ id: string; status: 'pending' | 'approved' }> {
  const c = await v5Client();
  const { data, error } = await c.rpc('kr8_create_reel', {
    p_video_path: u.videoPath, p_poster_path: u.posterPath, p_duration_ms: r.durationMs, p_width: r.width, p_height: r.height,
    p_area: area, p_body: body || null, p_here: here,
  });
  if (error) throw error;
  return data as { id: string; status: 'pending' | 'approved' };
}

const signCache = new Map<string, { url: string; until: number }>();
/** Links the edge already signed (/feed0, 16 Nov perf 2) go straight into the cache, so they are not signed a second time. */
export function primeSigned(signed: Record<string, string>, until: number): void {
  for (const [p, url] of Object.entries(signed || {})) {
    const hit = signCache.get(p);
    if (url && (!hit || hit.until < until)) signCache.set(p, { url, until });
  }
}
/**
 * 16 Nov: on kringapp.com (and its previews) Reels and posters come through the site's /media/ route, which keeps each file
 * in Cloudflare's cache by path (with Range support) and sends Cache-Control: immutable. Supabase still decides who may see
 * a file: the route needs this viewer's signed-link token. Elsewhere (local dev) the plain Supabase link is used.
 */
export function viaEdge(path: string, signedUrl: string, host: string = typeof location === 'undefined' ? '' : location.hostname): string {
  if (!/(^|\.)kringapp\.com$|\.pages\.dev$/.test(host)) return signedUrl;
  let token = '';
  try { token = new URL(signedUrl).searchParams.get('token') || ''; } catch { return signedUrl; }
  if (!token || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov|jpg|jpeg|webp)$/.test(path)) return signedUrl;
  return `/media/kr8-reels/${path}?t=${encodeURIComponent(token)}`;
}
/** Signed playback links (1 h). Paths the server will not show this viewer simply come back empty. */
export async function signReelPaths(paths: string[]): Promise<Record<string, string>> {
  const now = Date.now();
  const out: Record<string, string> = {};
  const need = [...new Set(paths.filter(Boolean))].filter((p) => {
    const hit = signCache.get(p);
    if (hit && hit.until > now + 60_000) { out[p] = hit.url; return false; }
    return true;
  });
  if (need.length) {
    const c = await v5Client();
    const { data } = await c.storage.from('kr8-reels').createSignedUrls(need, 3600);
    for (const row of data || []) {
      if (row.signedUrl && row.path) { const u = viaEdge(row.path, row.signedUrl); out[row.path] = u; signCache.set(row.path, { url: u, until: now + 3600_000 }); }
    }
  }
  return out;
}

/** 23 Nov (founder: photo posting on): a photo becomes a 7-second vertical Reel (slow zoom, soft fade),
 *  so it goes through the same review, Feed, ranking and Daily Card as any Reel. Records in real time (~6 s). */
export const isImageFile = (f: { type?: string; name?: string }) => /^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(f.name || '');
export async function photoToReel(file: File, onProgress?: (p: number) => void, ms = 7000): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new ReelError('UNREADABLE')); i.src = url; });
    const W = 720, H = 1280;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); if (!ctx) throw new ReelError('UNREADABLE');
    const mime = (pickMime() || '').replace(/,mp4a[^;]*|,opus/g, '');
    if (typeof c.captureStream !== 'function' || !mime) throw new ReelError('UNREADABLE');
    const stream = c.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const draw = (k: number) => {
      // blurred cover background + the whole photo fitted, slow Ken Burns zoom
      const sb = Math.max(W / img.width, H / img.height) * 1.15;
      ctx.filter = 'blur(28px) brightness(.55)';
      ctx.drawImage(img, (W - img.width * sb) / 2, (H - img.height * sb) / 2, img.width * sb, img.height * sb);
      ctx.filter = 'none';
      const fit = Math.min(W / img.width, H / img.height);
      const cover = Math.max(W / img.width, H / img.height);
      const base = img.height >= img.width ? cover : fit;   // portrait photos fill the screen, landscape ones sit on the blur
      const s = base * (1 + 0.08 * k);
      ctx.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2 - 20 * k, img.width * s, img.height * s);
      const fade = Math.min(1, k * 8, (1 - k) * 8);
      if (fade < 1) { ctx.fillStyle = `rgba(5,4,10,${1 - fade})`; ctx.fillRect(0, 0, W, H); }
    };
    draw(0);
    const done = new Promise<void>((ok) => { rec.onstop = () => ok(); });
    rec.start(250);
    const t0 = performance.now();
    await new Promise<void>((ok) => {
      const tick = () => { const k = Math.min(1, (performance.now() - t0) / ms); draw(k); onProgress?.(k); if (k < 1) requestAnimationFrame(tick); else ok(); };
      requestAnimationFrame(tick);
    });
    rec.stop(); await done;
    stream.getTracks().forEach((t) => t.stop());
    const type = mime.split(';')[0];
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    return new File(parts, `photo-reel.${ext}`, { type });
  } finally { URL.revokeObjectURL(url); }
}
