/**
 * Security audit H3: an Ask a Thai photo must never reach storage with its GPS location inside.
 * __fixtures__/gps.jpg is a real JPEG with an EXIF block (camera "TestCam", GPS 13°44'N 100°30'E) and a comment.
 * jsdom has no real canvas, so the canvas step is replaced by the WORST case: an encoder that hands back the original
 * bytes unchanged. The byte-level clean-up must still remove every bit of EXIF / GPS. (The real canvas path is checked in
 * Chrome by tools/askthai_gps_check.cjs.)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const live = vi.hoisted(() => ({ uploads: [] as { path: string; body: Blob; opts: { contentType?: string } }[], rpcs: [] as { fn: string; args: Record<string, unknown> }[] }));
vi.mock('./v5Live', () => ({
  v5Session: async () => ({ user: { id: '11111111-1111-4111-8111-111111111111' } }),
  v5PublicObjectUrl: (b: string, p: string) => `https://x/${b}/${p}`,
  v5Client: async () => ({
    storage: { from: () => ({ upload: async (p: string, body: Blob, opts: { contentType?: string }) => { live.uploads.push({ path: p, body, opts }); return { error: null }; } }) },
    rpc: async (fn: string, args: Record<string, unknown>) => { live.rpcs.push({ fn, args }); return { data: 'new-id', error: null }; },
  }),
}));
import { askCleanFile, bytesOf, createAskApi, stripGifMeta, stripJpegMeta } from './askThai';

const fixture = new Uint8Array(fs.readFileSync(path.join(__dirname, '__fixtures__', 'gps.jpg')));
const has = (b: Uint8Array, s: string) => Buffer.from(b).includes(Buffer.from(s, 'latin1'));
/** true when the JPEG carries an EXIF block with a GPS IFD pointer (tag 0x8825, either byte order) */
function hasExifGps(b: Uint8Array): boolean {
  const buf = Buffer.from(b);
  const at = buf.indexOf(Buffer.from('Exif\0\0', 'latin1'));
  if (at < 0) return false;
  const seg = buf.subarray(at, at + 65535);
  return seg.includes(Buffer.from([0x88, 0x25])) || seg.includes(Buffer.from([0x25, 0x88]));
}
const leakyEncoder = async (b: Blob) => b;   // worst case: "re-encoding" that keeps the original bytes
const bytes = (b: Blob) => bytesOf(b);

describe('Ask a Thai photos lose their GPS location before upload', () => {
  beforeEach(() => { live.uploads.length = 0; live.rpcs.length = 0; });

  it('the fixture really carries EXIF GPS (so the test means something)', () => {
    expect(hasExifGps(fixture)).toBe(true);
    expect(has(fixture, 'TestCam')).toBe(true);
    expect(has(fixture, 'secret note')).toBe(true);
  });

  it('stripJpegMeta removes EXIF, GPS and comments but keeps a valid JPEG', () => {
    const out = stripJpegMeta(fixture);
    expect(hasExifGps(out)).toBe(false);
    expect(has(out, 'Exif')).toBe(false);
    expect(has(out, 'TestCam')).toBe(false);
    expect(has(out, 'secret note')).toBe(false);
    expect([out[0], out[1]]).toEqual([0xff, 0xd8]);
    expect([out[out.length - 2], out[out.length - 1]]).toEqual([0xff, 0xd9]);
    expect(Buffer.from(out).includes(Buffer.from([0xff, 0xda]))).toBe(true);   // image data kept
  });

  it('askCleanFile: an EXIF-GPS JPEG comes out as a JPEG without GPS, even from a leaky encoder', async () => {
    const f = new File([fixture], 'IMG_0001.jpg', { type: 'image/jpeg' });
    const out = await askCleanFile(f, leakyEncoder);
    expect(out).not.toBe(f);
    expect(out.type).toBe('image/jpeg');
    expect(out.name).toBe('photo.jpg');
    expect(hasExifGps(await bytes(out))).toBe(false);
    expect(has(await bytes(out), 'Exif')).toBe(false);
  });

  it('askCleanFile sends PNG / WebP through the encoder too (always JPEG out)', async () => {
    const f = new File([fixture], 'x.png', { type: 'image/png' });
    let seen: Blob | null = null;
    const out = await askCleanFile(f, async (b) => { seen = b; return new Blob([fixture], { type: 'image/jpeg' }); });
    expect(seen).toBe(f);
    expect(out.type).toBe('image/jpeg');
    expect(hasExifGps(await bytes(out))).toBe(false);
  });

  it('a file that is not really a JPEG after encoding is refused, never uploaded as is', async () => {
    const f = new File([fixture], 'x.jpg', { type: 'image/jpeg' });
    await expect(askCleanFile(f, async () => new Blob(['not a jpeg']))).rejects.toThrow('KR8_BAD_FILE');
  });

  it('GIF: frames and loop kept, comment / XMP application blocks removed', () => {
    const lsd = [0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00];   // 1×1, global colour table of 2
    const gct = [0, 0, 0, 255, 255, 255];
    const loop = [0x21, 0xff, 0x0b, ...Buffer.from('NETSCAPE2.0'), 0x03, 0x01, 0x00, 0x00, 0x00];
    const xmp = [0x21, 0xff, 0x0b, ...Buffer.from('XMP DataXMP'), 0x08, ...Buffer.from('GPS 13.7'), 0x00];
    const com = [0x21, 0xfe, 0x06, ...Buffer.from('secret'), 0x00];
    const gce = [0x21, 0xf9, 0x04, 0x00, 0x0a, 0x00, 0x00, 0x00];
    const img = [0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0x00, 0x02, 0x02, 0x44, 0x01, 0x00];
    const gif = Uint8Array.from([...Buffer.from('GIF89a'), ...lsd, ...gct, ...loop, ...xmp, ...com, ...gce, ...img, 0x3b]);
    const out = stripGifMeta(gif);
    expect(has(out, 'NETSCAPE2.0')).toBe(true);
    expect(has(out, 'XMP')).toBe(false);
    expect(has(out, 'GPS')).toBe(false);
    expect(has(out, 'secret')).toBe(false);
    expect(Buffer.from(out).includes(Buffer.from(img))).toBe(true);
    expect(out[out.length - 1]).toBe(0x3b);
  });

  it('live upload: storage only ever gets the cleaned copy (asking and answering)', async () => {
    // jsdom: createImageBitmap + canvas stand-ins whose toBlob leaks the original bytes (worst case)
    const g = globalThis as unknown as { createImageBitmap?: unknown };
    const orig = { cib: g.createImageBitmap, gc: HTMLCanvasElement.prototype.getContext, tb: HTMLCanvasElement.prototype.toBlob };
    g.createImageBitmap = vi.fn(async () => ({ width: 4000, height: 3000, close: () => undefined }));
    let drawn: number[] = [];
    HTMLCanvasElement.prototype.getContext = function () { return { fillRect: () => undefined, drawImage: (_s: unknown, _x: number, _y: number, w: number, h: number) => { drawn = [w, h]; }, fillStyle: '' }; } as never;
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback, type?: string, q?: number) { expect(type).toBe('image/jpeg'); expect(q).toBe(0.85); cb(new Blob([fixture], { type: 'image/jpeg' })); };
    try {
      const api = createAskApi({ live: true, demo: false, me: () => null });
      const original = new File([fixture], 'IMG_0001.jpg', { type: 'image/jpeg' });
      await api.ask({ body: 'Where is the quiet pier?', file: original });
      await api.answer('q1', null, 'Here', original);
      expect(live.uploads).toHaveLength(2);
      for (const u of live.uploads) {
        expect(u.body).not.toBe(original);
        expect(u.opts.contentType).toBe('image/jpeg');
        expect(u.path).toMatch(/^11111111-1111-4111-8111-111111111111\/[0-9a-f-]{36}\.jpg$/);
        expect(hasExifGps(await bytes(u.body))).toBe(false);
      }
      expect(drawn).toEqual([1600, 1200]);   // longest side 1600 px
      expect(live.rpcs.map((r) => [r.fn, r.args.p_media_kind])).toEqual([['kr8_ask_create', 'photo'], ['kr8_ask_answer', 'photo']]);
    } finally {
      g.createImageBitmap = orig.cib;
      HTMLCanvasElement.prototype.getContext = orig.gc;
      HTMLCanvasElement.prototype.toBlob = orig.tb;
    }
  });

  it('report goes to kr8_ask_report', async () => {
    const api = createAskApi({ live: true, demo: false, me: () => null });
    await api.report('a', 'a1', 'unsafe');
    expect(live.rpcs).toEqual([{ fn: 'kr8_ask_report', args: { p_kind: 'a', p_id: 'a1', p_reason: 'unsafe' } }]);
  });
});
