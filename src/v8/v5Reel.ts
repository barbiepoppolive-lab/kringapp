/**
 * Reels (0024): check, shrink, upload and sign short vertical videos.
 * - Check: video file, 5–30 s, taller than wide, ≤ 300 MB before shrinking, ≤ 50 MB after.
 * - Shrink (when the browser can): redraw at 720×1280 (centre crop to 9:16) and record H.264 MP4 (or WebM) at ~2 Mbit/s,
 *   so the feed starts fast. If the browser cannot, the original file goes up as it is (if ≤ 50 MB).
 * - Poster: one JPEG frame for an instant first paint.
 * - Upload: private bucket kr8-reels/<user id>/<uuid>.<ext>, with progress and retry; then kr8_create_reel.
 * - Playback: short-lived signed links, only for Reels the server lets this viewer see.
 */
import { v5Client } from './v5Live';

export const REEL_MIN_MS = 5000;
export const REEL_MAX_MS = 30000;
export const REEL_MAX_BYTES = 50 * 1024 * 1024;
const RAW_MAX_BYTES = 300 * 1024 * 1024;
const OUT_W = 720;
const OUT_H = 1280;

export type ReelProblem = 'NOT_VIDEO' | 'TOO_SHORT' | 'TOO_LONG' | 'NOT_VERTICAL' | 'TOO_BIG' | 'UNREADABLE';
export class ReelError extends Error {
  constructor(public code: ReelProblem | 'UPLOAD' | 'SIGN_IN') { super(code); }
}
export interface ReelInfo { file: File; url: string; durationMs: number; width: number; height: number }
export interface ReelReady { blob: Blob; mime: string; ext: 'mp4' | 'webm' | 'mov'; poster: Blob; durationMs: number; width: number; height: number; shrunk: boolean }

function loadVideo(url: string): Promise<HTMLVideoElement> {
  return new Promise((ok, bad) => {
    const v = document.createElement('video');
    v.preload = 'auto'; v.muted = true; v.playsInline = true; v.crossOrigin = 'anonymous';
    v.onloadedmetadata = () => ok(v);
    v.onerror = () => bad(new ReelError('UNREADABLE'));
    v.src = url;
  });
}

/** Fast checks before anything is uploaded. */
export async function checkReel(file: File): Promise<ReelInfo> {
  if (!file || !/^video\//.test(file.type || '') && !/\.(mp4|mov|webm|m4v)$/i.test(file.name || '')) throw new ReelError('NOT_VIDEO');
  if (file.size > RAW_MAX_BYTES) throw new ReelError('TOO_BIG');
  const url = URL.createObjectURL(file);
  const v = await loadVideo(url).catch((e) => { URL.revokeObjectURL(url); throw e; });
  let d = v.duration;
  if (!isFinite(d)) {           // some MediaRecorder WebMs report Infinity until seeked
    v.currentTime = 1e6;
    await new Promise((r) => { v.ontimeupdate = r; setTimeout(r, 1500); });
    d = v.duration;
  }
  const durationMs = Math.round((isFinite(d) ? d : 0) * 1000);
  const width = v.videoWidth, height = v.videoHeight;
  if (!width || !height || !durationMs) { URL.revokeObjectURL(url); throw new ReelError('UNREADABLE'); }
  if (durationMs < REEL_MIN_MS - 300) { URL.revokeObjectURL(url); throw new ReelError('TOO_SHORT'); }
  if (durationMs > REEL_MAX_MS + 900) { URL.revokeObjectURL(url); throw new ReelError('TOO_LONG'); }
  if (height < width * 1.2) { URL.revokeObjectURL(url); throw new ReelError('NOT_VERTICAL'); }
  return { file, url, durationMs, width, height };
}

function pickMime(): string | null {
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

async function posterOf(v: HTMLVideoElement, atSec: number): Promise<Blob> {
  await new Promise<void>((r) => { v.onseeked = () => r(); v.currentTime = Math.min(atSec, Math.max(0, v.duration - 0.1)); setTimeout(r, 2500); });
  const c = document.createElement('canvas'); c.width = 540; c.height = 960;
  drawCover(c.getContext('2d')!, v, c.width, c.height);
  return new Promise((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new ReelError('UNREADABLE'))), 'image/jpeg', 0.78));
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
  const v = await loadVideo(info.url);
  const poster = await posterOf(v, Math.min(1, info.durationMs / 3000));
  const original = (): ReelReady => {
    if (info.file.size > REEL_MAX_BYTES) throw new ReelError('TOO_BIG');
    const ext = /webm/i.test(info.file.type) ? 'webm' : /quicktime|\.mov$/i.test(info.file.type || info.file.name) ? 'mov' : 'mp4';
    const mime = info.file.type || (ext === 'webm' ? 'video/webm' : ext === 'mov' ? 'video/quicktime' : 'video/mp4');
    return { blob: info.file, mime, ext, poster, durationMs: info.durationMs, width: info.width, height: info.height, shrunk: false };
  };
  const mime = pickMime();
  const canvas = document.createElement('canvas');
  if (!mime || typeof canvas.captureStream !== 'function') return original();
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
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 2_000_000, audioBitsPerSecond: 96_000 });
    const parts: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) parts.push(e.data); };
    const done = new Promise<void>((r) => { rec.onstop = () => r(); });
    v.currentTime = 0;
    await new Promise((r) => { v.onseeked = r; setTimeout(r, 800); });
    let raf = 0;
    const paint = () => {
      drawCover(ctx, v, OUT_W, OUT_H);
      onProgress(Math.min(1, v.currentTime / (info.durationMs / 1000)));
      raf = requestAnimationFrame(paint);
    };
    drawCover(ctx, v, OUT_W, OUT_H);
    rec.start(1000);
    await v.play();
    paint();
    await new Promise<void>((r) => { v.onended = () => r(); setTimeout(r, info.durationMs + 4000); });
    cancelAnimationFrame(raf);
    rec.stop();
    await done;
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(parts, { type: mime.split(';')[0] });
    onProgress(1);
    if (blob.size < 20_000 || blob.size > REEL_MAX_BYTES) return original();
    // keep whichever is smaller (a small original upload is already fast)
    if (info.file.size <= blob.size && info.file.size <= REEL_MAX_BYTES && /mp4|quicktime/i.test(info.file.type)) return original();
    return { blob, mime: blob.type, ext: blob.type.includes('webm') ? 'webm' : 'mp4', poster, durationMs: info.durationMs, width: OUT_W, height: OUT_H, shrunk: true };
  } catch {
    return original();
  }
}

function uuid(): string {
  return (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ||
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16); });
}

/** Raw upload with progress (supabase-js has no progress callback). */
function putObject(base: string, key: string, token: string, path: string, body: Blob, type: string, onProgress: (p: number) => void): Promise<void> {
  return new Promise((ok, bad) => {
    const x = new XMLHttpRequest();
    x.open('POST', `${base.replace(/\/$/, '')}/storage/v1/object/kr8-reels/${path}`);
    x.setRequestHeader('authorization', `Bearer ${token}`);
    x.setRequestHeader('apikey', key);
    x.setRequestHeader('content-type', type);
    x.setRequestHeader('x-upsert', 'false');
    x.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    x.onload = () => (x.status >= 200 && x.status < 300 ? ok() : bad(new ReelError('UPLOAD')));
    x.onerror = () => bad(new ReelError('UPLOAD'));
    x.send(body);
  });
}

export interface UploadedReel { videoPath: string; posterPath: string }

/** Uploads poster + video. Re-calling with the same `paths` retries the parts that did not land. */
export async function uploadReel(r: ReelReady, onProgress: (p: number) => void, prev?: Partial<UploadedReel> & { done?: string[] }): Promise<UploadedReel & { done: string[] }> {
  const c = await v5Client();
  const { data } = await c.auth.getSession();
  const s = data.session;
  if (!s) throw new ReelError('SIGN_IN');
  const cfg = c as unknown as { supabaseUrl: string; supabaseKey: string };
  const id = uuid();
  const videoPath = prev?.videoPath || `${s.user.id}/${id}.${r.ext}`;
  const posterPath = prev?.posterPath || `${s.user.id}/${id}.jpg`;
  const done = [...(prev?.done || [])];
  if (!done.includes(posterPath)) { await putObject(cfg.supabaseUrl, cfg.supabaseKey, s.access_token, posterPath, r.poster, 'image/jpeg', () => undefined); done.push(posterPath); }
  if (!done.includes(videoPath)) { await putObject(cfg.supabaseUrl, cfg.supabaseKey, s.access_token, videoPath, r.blob, r.mime.split(';')[0], onProgress); done.push(videoPath); }
  onProgress(1);
  return { videoPath, posterPath, done };
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
      if (row.signedUrl && row.path) { out[row.path] = row.signedUrl; signCache.set(row.path, { url: row.signedUrl, until: now + 3600_000 }); }
    }
  }
  return out;
}
