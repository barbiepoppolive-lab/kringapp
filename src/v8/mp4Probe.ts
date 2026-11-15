/**
 * Reads the length, picture size and video codec straight from an MP4 / MOV / 3GP file header (ISO BMFF boxes),
 * without asking the browser to decode anything. Used when the phone's browser cannot open a clip
 * (HEVC from Android "high efficiency" cameras, slow cloud files, Infinity/NaN durations) so we never
 * block a good file and can say exactly what is wrong with a bad one.
 */
export interface Mp4Head {
  container: 'mp4' | 'mov' | '3gp' | 'webm' | 'unknown';
  durationMs: number;          // 0 when unknown
  width: number;               // after the rotation flag is applied (portrait phone clips come out taller than wide)
  height: number;
  codec: string;               // sample-entry fourcc of the video track, e.g. avc1, hvc1, hev1, dvh1, av01, vp09 ('' when unknown)
  rotation: 0 | 90 | 180 | 270;
}

export const HEVC_CODECS = ['hvc1', 'hev1', 'dvh1', 'dvhe'];
export const isHevc = (codec: string) => HEVC_CODECS.includes(codec);

const MAX_MOOV = 16 * 1024 * 1024;

async function read(file: Blob, start: number, len: number): Promise<DataView> {
  const end = Math.min(file.size, start + len);
  const b = file.slice(start, end);
  const buf = typeof (b as Blob & { arrayBuffer?: () => Promise<ArrayBuffer> }).arrayBuffer === 'function'
    ? await b.arrayBuffer()
    : await new Promise<ArrayBuffer>((ok, bad) => { const r = new FileReader(); r.onload = () => ok(r.result as ArrayBuffer); r.onerror = () => bad(r.error); r.readAsArrayBuffer(b); });
  return new DataView(buf);
}
const fourcc = (d: DataView, o: number) => String.fromCharCode(d.getUint8(o), d.getUint8(o + 1), d.getUint8(o + 2), d.getUint8(o + 3));
const u64 = (d: DataView, o: number) => d.getUint32(o) * 2 ** 32 + d.getUint32(o + 4);

interface Box { type: string; start: number; head: number; size: number }
/** Child boxes inside d[from, to). */
function boxes(d: DataView, from: number, to: number): Box[] {
  const out: Box[] = [];
  let o = from;
  while (o + 8 <= to) {
    let size = d.getUint32(o);
    const type = fourcc(d, o + 4);
    let head = 8;
    if (size === 1) { if (o + 16 > to) break; size = u64(d, o + 8); head = 16; }
    else if (size === 0) size = to - o;
    if (size < head || o + size > to) break;
    out.push({ type, start: o, head, size });
    o += size;
  }
  return out;
}
const child = (d: DataView, b: Box, type: string) => boxes(d, b.start + b.head, b.start + b.size).find((x) => x.type === type);

function parseMoov(d: DataView, moov: Box): Omit<Mp4Head, 'container'> {
  let durationMs = 0, width = 0, height = 0, codec = '', rotation: Mp4Head['rotation'] = 0;
  const mvhd = child(d, moov, 'mvhd');
  if (mvhd) {
    const p = mvhd.start + mvhd.head;
    const v = d.getUint8(p);
    const scale = v === 1 ? d.getUint32(p + 20) : d.getUint32(p + 12);
    const dur = v === 1 ? u64(d, p + 24) : d.getUint32(p + 16);
    if (scale > 0 && dur > 0 && dur !== 0xffffffff) durationMs = Math.round((dur / scale) * 1000);
  }
  for (const trak of boxes(d, moov.start + moov.head, moov.start + moov.size).filter((b) => b.type === 'trak')) {
    const mdia = child(d, trak, 'mdia');
    const hdlr = mdia && child(d, mdia, 'hdlr');
    if (!hdlr || fourcc(d, hdlr.start + hdlr.head + 8) !== 'vide') continue;
    const tkhd = child(d, trak, 'tkhd');
    if (tkhd) {
      const end = tkhd.start + tkhd.size;
      const w = d.getUint32(end - 8) / 65536, h = d.getUint32(end - 4) / 65536;
      const m = end - 8 - 36;                                   // 3×3 matrix just before width/height
      const a = d.getInt32(m) / 65536, b = d.getInt32(m + 4) / 65536;
      if (Math.abs(a) < 0.01 && b > 0.99) rotation = 90;
      else if (Math.abs(a) < 0.01 && b < -0.99) rotation = 270;
      else if (a < -0.99) rotation = 180;
      width = Math.round(rotation === 90 || rotation === 270 ? h : w);
      height = Math.round(rotation === 90 || rotation === 270 ? w : h);
    }
    const minf = mdia && child(d, mdia, 'minf');
    const stbl = minf && child(d, minf, 'stbl');
    const stsd = stbl && child(d, stbl, 'stsd');
    if (stsd) {
      const p = stsd.start + stsd.head + 8;                     // version/flags + entry count
      if (p + 8 <= stsd.start + stsd.size) codec = fourcc(d, p + 4);
    }
    if (!durationMs && mdia) {
      const mdhd = child(d, mdia, 'mdhd');
      if (mdhd) {
        const p = mdhd.start + mdhd.head;
        const v = d.getUint8(p);
        const scale = v === 1 ? d.getUint32(p + 20) : d.getUint32(p + 12);
        const dur = v === 1 ? u64(d, p + 24) : d.getUint32(p + 16);
        if (scale > 0 && dur > 0 && dur !== 0xffffffff) durationMs = Math.round((dur / scale) * 1000);
      }
    }
    break;
  }
  return { durationMs, width, height, codec, rotation };
}

/** Returns what the header says, or null when the file is not an MP4/MOV/3GP we can read. Never throws. */
export async function probeMp4(file: Blob): Promise<Mp4Head | null> {
  try {
    if (!file || file.size < 16) return null;
    const first = await read(file, 0, 64);
    if (first.byteLength >= 4 && first.getUint32(0) === 0x1a45dfa3) return { container: 'webm', durationMs: 0, width: 0, height: 0, codec: '', rotation: 0 };
    let container: Mp4Head['container'] = 'unknown';
    let o = 0, guard = 0;
    while (o + 8 <= file.size && guard++ < 64) {
      const h = await read(file, o, 16);
      if (h.byteLength < 8) break;
      let size = h.getUint32(0);
      const type = fourcc(h, 4);
      if (!/^[\x20-\x7e]{4}$/.test(type)) break;
      if (size === 1) size = h.byteLength >= 16 ? u64(h, 8) : 0;
      else if (size === 0) size = file.size - o;
      if (size < 8) break;
      if (type === 'ftyp') {
        const brand = fourcc(h, 8);
        container = brand === 'qt  ' ? 'mov' : /^3g/.test(brand) ? '3gp' : 'mp4';
      } else if (type === 'moov') {
        if (size > MAX_MOOV) return container === 'unknown' ? null : { container, durationMs: 0, width: 0, height: 0, codec: '', rotation: 0 };
        const d = await read(file, o, size);
        if (d.byteLength < size) return null;
        return { container: container === 'unknown' ? 'mov' : container, ...parseMoov(d, { type, start: 0, head: size === d.byteLength && h.getUint32(0) === 1 ? 16 : 8, size }) };
      }
      o += size;
    }
    return container === 'unknown' ? null : { container, durationMs: 0, width: 0, height: 0, codec: '', rotation: 0 };
  } catch {
    return null;
  }
}
