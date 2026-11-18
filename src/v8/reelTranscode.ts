/**
 * 16 Nov (member on Android, 57 s phone clip): WebCodecs shrink with mediabunny, loaded only when a Reel is posted.
 * Decodes the file directly (HEVC / 4K / 60 fps included, when the phone's decoder can), so it works even when the
 * <video> element cannot draw a frame, and runs much faster than real time (no playback).
 * Output: MP4 H.264 720×1280 (cover crop) ~1.3 Mbit/s + AAC 96 kbit/s; if this browser has no H.264/AAC encoder,
 * WebM VP9/VP8 + Opus (the bucket takes mp4, mov and webm). Returns null when it cannot do the job, so the caller falls back.
 * Trim (16 Nov): transcodeReel can cut one part of a long clip (Conversion `trim`); thumbsOf draws the trim strip's pictures
 * for clips the <video> element cannot draw.
 */
import {
  ALL_FORMATS, BlobSource, BufferSource, BufferTarget, CanvasSink, Conversion, Input, Mp4OutputFormat, Output, WebMOutputFormat,
  canEncodeAudio, canEncodeVideo, type InputVideoTrack,
} from 'mediabunny';

const W = 720, H = 1280;

export interface Transcoded { blob: Blob; mime: 'video/mp4' | 'video/webm'; ext: 'mp4' | 'webm'; durationMs: number; hasAudio: boolean }

const open = (file: Blob) => new Input({ source: new BlobSource(file), formats: ALL_FORMATS });

async function decodableTrack(input: Input): Promise<InputVideoTrack | null> {
  if (typeof VideoDecoder === 'undefined') return null;
  const v = await input.getPrimaryVideoTrack();
  return v && (await v.canDecode()) ? v : null;
}

/** Can this browser decode the clip with WebCodecs (e.g. HEVC that <video> cannot open)? */
export async function canDecodeReel(file: Blob): Promise<boolean> {
  try { return !!(await decodableTrack(open(file))); } catch { return false; }
}

async function jpeg(c: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ('convertToBlob' in c) return c.convertToBlob({ type: 'image/jpeg', quality: 0.72 }).catch(() => null);
  return new Promise((ok) => c.toBlob((b) => ok(b), 'image/jpeg', 0.72));
}

/** Poster from the WebCodecs-decoded frame at `atSec` (540×960, cover). */
export async function webCodecsPoster(file: Blob, atSec: number): Promise<Blob | null> {
  try {
    const v = await decodableTrack(open(file));
    if (!v) return null;
    const sink = new CanvasSink(v, { width: 540, height: 960, fit: 'cover' });
    const start = await v.getFirstTimestamp();
    const got = (await sink.getCanvas(start + atSec)) || (await sink.getCanvas(start));
    return got ? jpeg(got.canvas) : null;
  } catch { return null; }
}

async function pickCodecs(withAudio: boolean, bps: number): Promise<{ fmt: 'mp4' | 'webm'; v: 'avc' | 'vp9' | 'vp8'; a: 'aac' | 'opus' } | null> {
  const okA = async (a: 'aac' | 'opus') => !withAudio || canEncodeAudio(a, { numberOfChannels: 2, sampleRate: 48000, bitrate: 96_000 });
  if (await canEncodeVideo('avc', { width: W, height: H, bitrate: bps }) && await okA('aac')) return { fmt: 'mp4', v: 'avc', a: 'aac' };
  if (await okA('opus')) {
    for (const v of ['vp9', 'vp8'] as const) if (await canEncodeVideo(v, { width: W, height: H, bitrate: bps })) return { fmt: 'webm', v, a: 'opus' };
  }
  return null;
}

/** trim (16 Nov): only that part of the file (seconds in the file) is decoded and written; the output starts at 0. */
export async function transcodeReel(file: Blob, bps: number, onProgress: (p: number) => void, trim?: { startSec: number; endSec: number }): Promise<Transcoded | null> {
  if (typeof VideoEncoder === 'undefined' || typeof VideoDecoder === 'undefined') return null;
  const input = open(file);
  const video = await decodableTrack(input);
  if (!video) return null;
  const audio = await input.getPrimaryAudioTrack();
  const withAudio = !!(audio && (await audio.canDecode()));
  const c = await pickCodecs(withAudio, bps);
  if (!c) return null;
  const output = new Output({
    format: c.fmt === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const conv = await Conversion.init({
    input, output, showWarnings: false,
    ...(trim ? { trim: { start: trim.startSec, end: trim.endSec } } : {}),
    video: { width: W, height: H, fit: 'cover', codec: c.v, bitrate: bps, keyFrameInterval: 2, forceTranscode: true, allowRotationMetadata: false },
    audio: withAudio ? { codec: c.a, bitrate: 96_000, numberOfChannels: 2, forceTranscode: true } : { discard: true },
  });
  // keep the sound: if the audio track would be dropped, let the canvas route (which records the sound) try instead
  if (!conv.isValid || (withAudio && conv.discardedTracks.some((d) => d.track.type === 'audio'))) return null;
  conv.onProgress = (p) => onProgress(Math.min(0.99, p));
  await conv.execute();
  const buf = (output.target as BufferTarget).buffer;
  if (!buf) return null;
  // the result must be as long as the original (trimmed: as the chosen part): read the written file back
  const check = new Input({ source: new BufferSource(buf), formats: ALL_FORMATS });
  const durationMs = Math.round((await check.computeDuration()) * 1000);
  const mime = c.fmt === 'mp4' ? 'video/mp4' : 'video/webm';
  return { blob: new Blob([buf], { type: mime }), mime, ext: c.fmt, durationMs, hasAudio: withAudio };
}

/** Small pictures for the trim strip at the given times (ms), via WebCodecs. Missing ones are null. */
export async function thumbsOf(file: Blob, timesMs: number[], w: number, h: number): Promise<(Blob | null)[]> {
  const out: (Blob | null)[] = timesMs.map(() => null);
  try {
    const v = await decodableTrack(open(file));
    if (!v) return out;
    const sink = new CanvasSink(v, { width: w, height: h, fit: 'cover', poolSize: 1 });
    const start = await v.getFirstTimestamp();
    let i = 0;
    for await (const got of sink.canvasesAtTimestamps(timesMs.map((t) => start + t / 1000))) {
      if (got) out[i] = await jpeg(got.canvas);
      i++;
    }
  } catch { /* keep what we have */ }
  return out;
}

/** Length of a finished file (ms), read through all its packets: right for fragmented MP4 from MediaRecorder too. 0 = unknown. */
export async function blobDurationMs(b: Blob): Promise<number> {
  try { return Math.round((await open(b).computeDuration()) * 1000); } catch { return 0; }
}

/** 18 Nov: length + upright picture size from the demuxer (any container it knows), for clips whose header our own
 *  MP4 reader and the <video> element could not read. null = unknown. */
export async function readMeta(b: Blob): Promise<{ durationMs: number; width: number; height: number } | null> {
  try {
    const input = open(b);
    const v = await input.getPrimaryVideoTrack();
    if (!v) return null;
    const [d, w, h] = await Promise.all([input.computeDuration(), v.getDisplayWidth(), v.getDisplayHeight()]);
    const durationMs = Math.round(d * 1000);
    return durationMs > 0 && w > 0 && h > 0 ? { durationMs, width: w, height: h } : null;
  } catch { return null; }
}
