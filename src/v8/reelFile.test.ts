/**
 * A (15 Nov, member #16): "อ่านวิดีโอนี้ไม่ได้ · ลองไฟล์อื่น" on a normal vertical clip.
 * The browser could not open the clip (Android HEVC "high efficiency" video, a slow cloud file, Infinity/NaN length),
 * and the old check gave up. Now the MP4/MOV header is read directly and the browser is only one source of truth.
 * Fixtures are tiny ffmpeg clips (180×320, 2 fps): H.264 MP4 (moov at end and at start), HEVC (hvc1) MP4, MOV, VP9 WebM,
 * 3 s / 25 s / 45 s / 65 s, and a landscape-encoded clip with a 90° rotation flag (how phones store portrait video).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { probeMp4 } from './mp4Probe';
import { checkReel, looksLikeVideo, REEL_MAX_MS, ReelError, uploadType } from './v5Reel';

const DIR = join(__dirname, '__fixtures__', 'reels');
const fx = (name: string, type = 'video/mp4', as = name) => new File([readFileSync(join(DIR, name))], as, { type });

describe('mp4Probe reads the header without decoding', () => {
  it('H.264 MP4, moov at the end', async () => {
    const h = await probeMp4(fx('h264_25s.mp4'));
    expect(h).toMatchObject({ container: 'mp4', codec: 'avc1', width: 180, height: 320, rotation: 0 });
    expect(Math.abs(h!.durationMs - 25000)).toBeLessThan(200);
  });
  it('H.264 MP4, moov at the start (faststart)', async () => {
    const h = await probeMp4(fx('h264_25s_fast.mp4'));
    expect(h?.codec).toBe('avc1');
    expect(Math.abs(h!.durationMs - 25000)).toBeLessThan(200);
  });
  it('HEVC MP4 is recognised as hvc1', async () => {
    const h = await probeMp4(fx('hevc_25s.mp4'));
    expect(h?.codec).toBe('hvc1');
    expect(h).toMatchObject({ width: 180, height: 320 });
  });
  it('MOV (QuickTime brand)', async () => {
    const h = await probeMp4(fx('h264_25s.mov', 'video/quicktime'));
    expect(h).toMatchObject({ container: 'mov', codec: 'avc1', width: 180, height: 320 });
  });
  it('rotation flag turns a 320×180 stored clip into a portrait 180×320', async () => {
    const h = await probeMp4(fx('h264_rot90.mp4'));
    expect([90, 270]).toContain(h?.rotation);
    expect(h).toMatchObject({ width: 180, height: 320 });
  });
  it('WebM is recognised (length left to the browser)', async () => {
    expect((await probeMp4(fx('vp9_25s.webm', 'video/webm')))?.container).toBe('webm');
  });
  it('junk is null, never a throw', async () => {
    expect(await probeMp4(new File([new Uint8Array(4000).fill(7)], 'x.bin'))).toBeNull();
    expect(await probeMp4(new File([], 'x.mp4'))).toBeNull();
  });
});

describe('checkReel never blocks a valid clip', () => {
  // jsdom cannot decode video: make every <video> fail like an Android browser that cannot open the clip
  const realCreate = document.createElement.bind(document);
  beforeEach(() => {
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = realCreate(tag);
      if (tag === 'video') {
        Object.defineProperty(el, 'src', { set() { setTimeout(() => (el as HTMLVideoElement).onerror?.(new Event('error') as never), 0); }, get() { return ''; } });
      }
      return el;
    }) as typeof document.createElement);
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
  });
  afterEach(() => vi.restoreAllMocks());
  const code = async (f: File) => { try { await checkReel(f); return 'OK'; } catch (e) { return e instanceof ReelError ? e.code : String(e); } };

  it('limit is 5–60 s', () => expect(REEL_MAX_MS).toBe(60000));
  it('H.264 MP4 the browser cannot open is still accepted from its header', async () => {
    const r = await checkReel(fx('h264_25s.mp4'));
    expect(r).toMatchObject({ width: 180, height: 320, decodable: false, codec: 'avc1' });
    expect(Math.abs(r.durationMs - 25000)).toBeLessThan(200);
  });
  it('empty file type (content:// pickers) and odd names are fine', async () => {
    expect(await code(fx('h264_25s.mp4', '', 'video:12345'))).toBe('OK');
    expect(await code(fx('h264_25s.mp4', 'application/octet-stream', 'VID_20261115.mp4'))).toBe('OK');
    expect(await code(fx('h264_25s.mov', 'video/quicktime'))).toBe('OK');
    expect(await code(fx('h264_25s.mp4', 'video/3gpp', 'clip.3gp'))).toBe('OK');
  });
  it('45 s is fine; 65 s and 10 min open the trim step (no TOO_LONG); over 10 min is too long; 3 s is too short', async () => {
    expect(await code(fx('h264_45s.mp4'))).toBe('OK');
    expect((await checkReel(fx('h264_45s.mp4'))).needsTrim).toBeFalsy();
    for (const f of ['h264_65s.mp4', 'h264_600s.mp4']) {
      const r = await checkReel(fx(f));
      expect(r.needsTrim, f).toBe(true);
      expect(r.fullMs, f).toBe(r.durationMs);
    }
    expect(await code(fx('h264_660s.mp4'))).toBe('TOO_LONG');
    expect(await code(fx('h264_3s.mp4'))).toBe('TOO_SHORT');
  });
  it('a portrait phone clip stored landscape + rotation flag counts as vertical', async () => {
    expect(await code(fx('h264_rot90.mp4'))).toBe('OK');
    expect(await code(fx('h264_land.mp4'))).toBe('NOT_VERTICAL');
  });
  it('HEVC this browser cannot open gets the HEVC how-to-fix message', async () => {
    expect(await code(fx('hevc_25s.mp4'))).toBe('HEVC');
  });
  it('empty file and photos', async () => {
    expect(await code(new File([], 'clip.mp4', { type: 'video/mp4' }))).toBe('EMPTY');
    expect(await code(new File([new Uint8Array(100)], 'a.jpg', { type: 'image/jpeg' }))).toBe('NOT_VIDEO');
  });
  it('a WebM the browser cannot open has no header length → UNREADABLE (clear fix text)', async () => {
    expect(await code(fx('vp9_25s.webm', 'video/webm'))).toBe('UNREADABLE');
  });
});

describe('upload type always matches the storage bucket (mp4 / mov / webm only)', () => {
  it.each([
    [{ name: 'a.mp4', type: 'video/mp4' }, 'mp4', 'video/mp4'],
    [{ name: 'a.MOV', type: '' }, 'mov', 'video/quicktime'],
    [{ name: 'a.3gp', type: 'video/3gpp' }, 'mp4', 'video/mp4'],
    [{ name: 'video:123', type: '' }, 'mp4', 'video/mp4'],
    [{ name: 'a.mkv', type: 'video/x-matroska' }, 'webm', 'video/webm'],
    [{ name: 'a.webm', type: 'video/webm' }, 'webm', 'video/webm'],
  ])('%o → %s', (f, ext, mime) => expect(uploadType(f)).toEqual({ ext, mime }));
  it('looksLikeVideo', () => {
    expect(looksLikeVideo({ name: 'x', type: '' })).toBe(true);
    expect(looksLikeVideo({ name: 'x.jpg', type: 'image/jpeg' })).toBe(false);
  });
});
