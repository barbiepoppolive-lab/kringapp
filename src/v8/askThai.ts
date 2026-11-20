/**
 * Ask a Thai (16 Nov, founder-approved "Screen 2"): an open question-and-answer timeline on the Feed tab.
 * Anyone (a member, 18+) can ask; anyone can answer; Thai locals carry a "Thai Local" badge. Text, photos, emoji and GIFs.
 *
 * Live: the kr8_ask_* RPCs from supabase/migrations/0057_kr8_ask_a_thai.sql (SECURITY DEFINER, no direct table writes).
 * Until that migration is applied (function missing), or in demo / harness builds, everything runs on a local store in
 * this tab only, so the screen still works and renders. Demo builds seed it with example posts; the live app never does.
 */
import { initialAvatar } from './v8Data';

export interface AskPerson { id: string; name: string; photo: string; local: boolean; /** 0073: the Kring Team account */ official?: boolean }
export interface AskMedia { url: string; gif: boolean }
export interface AskAnswer {
  id: string; parentId: string | null; by: AskPerson; body: string; media: AskMedia | null;
  score: number; myVote: -1 | 0 | 1; at: string; best?: boolean;
}
export interface AskQuestion {
  id: string; by: AskPerson; area: string; body: string; details: string; media: AskMedia | null;
  score: number; myVote: -1 | 0 | 1; answers: number; top: AskAnswer | null; at: string;
}
export interface AskThreadData { q: AskQuestion; answers: AskAnswer[] }
// one language only (20 Nov): an English question may quote a Thai word (เกรงใจ), so count letters, not "any Thai".
export const hasThai = (s: string): boolean => /[\u0E00-\u0E7F]/.test(s || '');
export const mostlyEnglish = (s: string): boolean => ((s || '').match(/[A-Za-z]/g) || []).length > ((s || '').match(/[\u0E00-\u0E7F]/g) || []).length;
export interface AskDraft { body: string; details?: string; area?: string | null; file?: File | null }
export interface AskApi {
  /** 'live' = database; 'local' = this tab only (migration not applied yet, or a demo build) */
  mode(): 'live' | 'local';
  feed(before?: string): Promise<AskQuestion[]>;
  thread(id: string): Promise<AskThreadData>;
  ask(d: AskDraft): Promise<string>;
  answer(postId: string, parentId: string | null, body: string, file?: File | null): Promise<string>;
  vote(kind: 'q' | 'a', id: string, value: -1 | 0 | 1): Promise<number>;
  /** report a question / answer; the reporter stops seeing it at once ('block' also blocks the person) */
  report(kind: 'q' | 'a', id: string, reason: AskReportReason): Promise<void>;
}
export type AskReportReason = 'spam' | 'unsafe' | 'block';

export const ASK_MAX_Q = 200;
export const ASK_MAX_TEXT = 1000;
export const ASK_MAX_FILE = 5 * 1024 * 1024;
/** a phone photo may be bigger before it is re-saved on the phone (the upload is always the small re-saved copy) */
export const ASK_MAX_PHOTO_IN = 30 * 1024 * 1024;
/** longest side of an uploaded photo */
export const ASK_PHOTO_SIDE = 1600;
export const ASK_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** Thread order: best answer first (top-level, highest score above 0), then the rest by score; replies right under their answer. */
export function orderThread(all: AskAnswer[]): AskAnswer[] {
  const tops = all.filter((a) => !a.parentId).sort((a, b) => b.score - a.score || a.at.localeCompare(b.at));
  const out: AskAnswer[] = [];
  tops.forEach((t, i) => {
    out.push({ ...t, best: i === 0 && t.score > 0 });
    all.filter((r) => r.parentId === t.id).sort((a, b) => a.at.localeCompare(b.at)).forEach((r) => out.push({ ...r, best: false }));
  });
  return out;
}
/** Tapping ▲ when it is already up takes the vote back (Reddit-style). */
export function nextVote(cur: -1 | 0 | 1, tap: -1 | 1): -1 | 0 | 1 {
  return cur === tap ? 0 : tap;
}
export function fmtCount(n: number): string {
  const a = Math.abs(n);
  if (a >= 10000) return `${Math.round(n / 1000)}k`;
  if (a >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(n);
}
export function askAge(iso: string, now = Date.now()): { n: number; u: 'now' | 'm' | 'h' | 'd' } {
  const d = Math.max(0, now - new Date(iso).getTime());
  if (d < 60_000) return { n: 0, u: 'now' };
  if (d < 3_600_000) return { n: Math.floor(d / 60_000), u: 'm' };
  if (d < 86_400_000) return { n: Math.floor(d / 3_600_000), u: 'h' };
  return { n: Math.floor(d / 86_400_000), u: 'd' };
}
export function checkAskFile(f: File): 'type' | 'size' | null {
  if (!ASK_TYPES.includes(f.type)) return 'type';
  if (f.size > (f.type === 'image/gif' ? ASK_MAX_FILE : ASK_MAX_PHOTO_IN)) return 'size';
  return null;
}

// ─────────────── photo clean-up (security audit H3): no GPS / camera data ever leaves the phone ───────────────
// Every photo is drawn onto a canvas and saved again as a new JPEG (quality 0.85, longest side 1600 px). A canvas copy
// carries pixels only, so the EXIF block (GPS location, camera, time) of the original is gone. As a second lock, the
// JPEG bytes are walked and every APP1–APP15 (EXIF / XMP / ICC / maker notes) and comment segment is cut out. A GIF keeps
// its frames but loses every comment / text / application block except the loop setting. The original File is never uploaded.

const isJpeg = (b: Uint8Array) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8;
/** Removes APP1–APP15 and COM segments from a JPEG (keeps APP0/JFIF, tables, frame, scan and everything after SOS). */
export function stripJpegMeta(b: Uint8Array): Uint8Array {
  if (!isJpeg(b)) throw new Error('KR8_BAD_FILE');
  const out: number[] = [0xff, 0xd8];
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) throw new Error('KR8_BAD_FILE');
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; }   // fill byte
    if (m === 0xda) { for (let k = i; k < b.length; k++) out.push(b[k]); return Uint8Array.from(out); }   // start of scan: the rest is image data
    if (m === 0xd9) { out.push(0xff, 0xd9); return Uint8Array.from(out); }
    const len = (b[i + 2] << 8) | b[i + 3];
    if (len < 2 || i + 2 + len > b.length) throw new Error('KR8_BAD_FILE');
    const drop = (m >= 0xe1 && m <= 0xef) || m === 0xfe;
    if (!drop) for (let k = i; k < i + 2 + len; k++) out.push(b[k]);
    i += 2 + len;
  }
  throw new Error('KR8_BAD_FILE');
}
/** Keeps a GIF's frames and loop setting; drops comment, plain-text and other application blocks (XMP etc). */
export function stripGifMeta(b: Uint8Array): Uint8Array {
  const sig = String.fromCharCode(...b.slice(0, 6));
  if (sig !== 'GIF89a' && sig !== 'GIF87a') throw new Error('KR8_BAD_FILE');
  const out: number[] = [];
  const copy = (a: number, z: number) => { for (let k = a; k < z; k++) out.push(b[k]); };
  const subBlocks = (i: number) => { while (i < b.length && b[i] !== 0) i += b[i] + 1; if (i >= b.length) throw new Error('KR8_BAD_FILE'); return i + 1; };
  let i = 13;
  if (b.length < 13) throw new Error('KR8_BAD_FILE');
  if (b[10] & 0x80) i += 3 * (1 << ((b[10] & 7) + 1));
  copy(0, i);
  while (i < b.length) {
    const t = b[i];
    if (t === 0x3b) { out.push(0x3b); return Uint8Array.from(out); }
    if (t === 0x2c) {   // image: descriptor, local colour table, LZW size, data
      let j = i + 10;
      if (b[i + 9] & 0x80) j += 3 * (1 << ((b[i + 9] & 7) + 1));
      j = subBlocks(j + 1);
      copy(i, j); i = j; continue;
    }
    if (t === 0x21) {
      const label = b[i + 1];
      const j = subBlocks(i + 2);
      const app = label === 0xff ? String.fromCharCode(...b.slice(i + 3, i + 14)) : '';
      if (label === 0xf9 || (label === 0xff && app === 'NETSCAPE2.0')) copy(i, j);   // frame timing / loop
      i = j; continue;
    }
    throw new Error('KR8_BAD_FILE');
  }
  throw new Error('KR8_BAD_FILE');
}
export const bytesOf = async (f: Blob): Promise<Uint8Array> => {
  if (typeof f.arrayBuffer === 'function') return new Uint8Array(await f.arrayBuffer());
  return new Promise((ok, bad) => { const r = new FileReader(); r.onload = () => ok(new Uint8Array(r.result as ArrayBuffer)); r.onerror = () => bad(new Error('KR8_BAD_FILE')); r.readAsArrayBuffer(f); });
};

/** Draws the photo on a canvas (longest side 1600 px, white behind see-through parts) and saves it as JPEG 0.85. */
export async function askReencodePhoto(f: Blob): Promise<Blob> {
  let src: CanvasImageSource; let w: number; let h: number; let done = () => {};
  if (typeof createImageBitmap === 'function') {
    const bmp = await createImageBitmap(f, { imageOrientation: 'from-image' } as ImageBitmapOptions).catch(() => createImageBitmap(f));
    src = bmp; w = bmp.width; h = bmp.height; done = () => bmp.close();
  } else {
    const url = URL.createObjectURL(f);
    const img = await new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => bad(new Error('KR8_BAD_FILE')); i.src = url; });
    src = img; w = img.naturalWidth; h = img.naturalHeight; done = () => URL.revokeObjectURL(url);
  }
  try {
    if (!w || !h) throw new Error('KR8_BAD_FILE');
    const k = Math.min(1, ASK_PHOTO_SIDE / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    const ctx = c.getContext('2d');
    if (!ctx) throw new Error('KR8_BAD_FILE');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const out = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    if (!out) throw new Error('KR8_BAD_FILE');
    return out;
  } finally {
    done();
  }
}

/** The only way a picked file reaches storage: photos are re-saved as a clean JPEG, GIFs lose their extra blocks. */
export async function askCleanFile(f: File, reencode: (b: Blob) => Promise<Blob> = askReencodePhoto): Promise<File> {
  if (f.type === 'image/gif') {
    const g = stripGifMeta(await bytesOf(f));
    if (g.length > ASK_MAX_FILE) throw new Error('KR8_BAD_FILE');
    return new File([g as BlobPart], 'photo.gif', { type: 'image/gif' });
  }
  if (!ASK_TYPES.includes(f.type)) throw new Error('KR8_BAD_FILE');
  const j = stripJpegMeta(await bytesOf(await reencode(f)));
  if (j.length > ASK_MAX_FILE) throw new Error('KR8_BAD_FILE');
  return new File([j as BlobPart], 'photo.jpg', { type: 'image/jpeg' });
}

// ─────────────── local store (this tab only) ───────────────
interface LocalA extends Omit<AskAnswer, 'best'> { postId: string }
/** votes: one per person per question / answer, key `${person}:${q|a}:${id}` */
interface LocalStore { qs: Omit<AskQuestion, 'answers' | 'top'>[]; as: LocalA[]; votes: Map<string, -1 | 1>; seeded: boolean }
const store: LocalStore = { qs: [], as: [], votes: new Map(), seeded: false };
/** for tests */
export function resetAskLocal(): void {
  store.qs = []; store.as = []; store.votes = new Map(); store.seeded = false;
}
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString();
const face = (n: string, base: string) => `${base}media/demo/faces/${n.toLowerCase()}.jpg`;
function seed(base: string): void {
  if (store.seeded) return;
  store.seeded = true;
  const P = (name: string, local: boolean): AskPerson => ({ id: `demo-${name.toLowerCase()}`, name, photo: face(name, base), local });
  const arjun = P('Arjun', false), lena = P('Lena', false), liam = P('Liam', false), ploy = P('Ploy', true), aom = P('Aom', true), nat = P('Nat', true),
    mint = P('Mint', true), yui = P('Yui', false), ton = P('Ton', true);
  const img = (n: string): AskMedia => ({ url: `${base}media/demo/${n}.jpg`, gif: false });
  store.qs.push(
    { id: 'dq1', by: arjun, area: 'Talad Noi', body: 'Best time to visit So Heng Tai without crowds? 📸', details: '', media: img('sohengtai'), score: 148, myVote: 0, at: ago(120) },
    { id: 'dq2', by: lena, area: 'Riverside', body: 'Where do Thais watch the sunset by the river for free? 🌅', details: '', media: null, score: 214, myVote: 0, at: ago(240) },
    { id: 'dq3', by: liam, area: 'Thonglor', body: 'BTS or Grab after 11pm back to Sukhumvit?', details: '', media: null, score: 96, myVote: 0, at: ago(360) },
    { id: 'dq4', by: yui, area: 'Yaowarat', body: 'Is Yaowarat busy on a Monday night? 🏮', details: '', media: img('yaowarat'), score: 61, myVote: 0, at: ago(540) },
    { id: 'dq5', by: lena, area: 'Siam', body: 'Rainy afternoon in Siam, what would you do?', details: '', media: null, score: 37, myVote: 0, at: ago(900) },
  );
  const A = (id: string, postId: string, parentId: string | null, by: AskPerson, body: string, score: number, min: number, media: AskMedia | null = null): LocalA =>
    ({ id, postId, parentId, by, body, media, score, myVote: 0, at: ago(min) });
  store.as.push(
    A('da1', 'dq1', null, ploy, 'Weekday, 9–10am. Then walk on to Song Wat Road.', 96, 100),
    A('da2', 'dq1', null, lena, 'Went Tuesday at 9. Had the pool room to myself 😍', 41, 80, { url: `${base}media/demo/sohengtai.jpg`, gif: false }),
    A('da3', 'dq1', 'da2', nat, 'Yes, and Mondays some cafés nearby close.', 12, 60),
    A('da4', 'dq1', null, mint, 'Bring cash for the entry, and wear shoes you can slip off.', 9, 50),
    A('da5', 'dq2', null, aom, 'Santi Chai Prakan Park at 5:30. Free, breezy, lights after dark.', 122, 200),
    A('da6', 'dq2', null, ton, 'Lhong 1919 pier side too, sit on the steps by the water.', 30, 180),
    A('da8', 'dq4', null, nat, 'Busy but fine. Some street stalls rest on Mondays, most are open.', 18, 500),
  );
}
const myVote = (viewer: string | undefined, kind: 'q' | 'a', id: string): -1 | 0 | 1 => (viewer && store.votes.get(`${viewer}:${kind}:${id}`)) || 0;
const localAnswers = (postId: string, viewer?: string): AskAnswer[] =>
  orderThread(store.as.filter((a) => a.postId === postId).map((a) => ({ ...stripLocal(a), myVote: myVote(viewer, 'a', a.id) })));
const stripLocal = (a: AskAnswer | LocalA): AskAnswer => {
  const { postId: _p, ...rest } = a as LocalA;
  void _p;
  return rest as AskAnswer;
};
const localQ = (q: LocalStore['qs'][number], viewer?: string): AskQuestion =>
  ({ ...q, myVote: myVote(viewer, 'q', q.id), answers: store.as.filter((a) => a.postId === q.id).length, top: localAnswers(q.id, viewer)[0] || null });
const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `l${Date.now()}${Math.random().toString(16).slice(2)}`);
const fileMedia = (f?: File | null): AskMedia | null => (f && typeof URL !== 'undefined' && URL.createObjectURL ? { url: URL.createObjectURL(f), gif: f.type === 'image/gif' } : null);

function localApi(me: () => AskPerson | null): Omit<AskApi, 'mode'> {
  const who = () => {
    const m = me();
    if (!m) throw new Error('KR8_SIGN_IN');
    return m;
  };
  return {
    async feed(before) {
      const v = me()?.id;
      return store.qs.filter((q) => !before || q.at < before).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 20).map((q) => localQ(q, v));
    },
    async thread(id) {
      const q = store.qs.find((x) => x.id === id);
      if (!q) throw new Error('KR8_NOT_FOUND');
      const v = me()?.id;
      return { q: localQ(q, v), answers: localAnswers(id, v) };
    },
    async ask(d) {
      const id = uid();
      const m = who();
      store.qs.push({ id, by: m, area: d.area || 'Bangkok', body: d.body.trim(), details: (d.details || '').trim(), media: fileMedia(d.file), score: 1, myVote: 0, at: new Date().toISOString() });
      store.votes.set(`${m.id}:q:${id}`, 1);   // your own question starts at +1
      return id;
    },
    async answer(postId, parentId, body, file) {
      const id = uid();
      const top = parentId ? store.as.find((a) => a.id === parentId) : null;
      const m = who();
      store.as.push({ id, postId, parentId: top ? top.parentId || top.id : null, by: m, body: body.trim(), media: fileMedia(file), score: 1, myVote: 0, at: new Date().toISOString() });
      store.votes.set(`${m.id}:a:${id}`, 1);
      return id;
    },
    async vote(kind, id, value) {
      const m = who();
      const row = kind === 'q' ? store.qs.find((x) => x.id === id) : store.as.find((x) => x.id === id);
      if (!row) throw new Error('KR8_NOT_FOUND');
      const key = `${m.id}:${kind}:${id}`;
      row.score += value - (store.votes.get(key) || 0);
      if (value) store.votes.set(key, value); else store.votes.delete(key);
      return row.score;
    },
    async report(kind, id) {
      who();
      if (kind === 'q') store.qs = store.qs.filter((x) => x.id !== id);
      else store.as = store.as.filter((x) => x.id !== id && x.parentId !== id);
    },
  };
}

// ─────────────── live (0057) ───────────────
interface RawPerson { name: string; photo: string | null; local: boolean; official?: boolean }
interface RawA { id: string; parent_id: string | null; author_id: string; body: string; media_path: string | null; media_kind: string | null; score: number; my_vote: number; created_at: string }
interface RawQ { id: string; author_id: string; area: string; body: string; details: string | null; media_path: string | null; media_kind: string | null; score: number; my_vote: number;
  answers: number; top: RawA | null; created_at: string }

/** PostgREST "function not found" / Postgres "undefined function / table": the migration is not applied yet. */
export function isMissing(e: unknown): boolean {
  const o = (e || {}) as { code?: string; message?: string };
  return o.code === 'PGRST202' || o.code === '42883' || o.code === '42P01' || /could not find the function|does not exist/i.test(o.message || '');
}

function liveApi(gate?: () => boolean): Omit<AskApi, 'mode'> {
  const lib = () => import('./v5Live');
  const call = async <T,>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const m = await lib();
    const c = await m.v5Client();
    const res = await c.rpc(fn, args);
    if (res.error) throw res.error;
    return res.data as T;
  };
  const people = (raw: Record<string, RawPerson> | null | undefined) => (id: string): AskPerson => {
    const p = (raw || {})[id];
    if (p?.official) return { id, name: 'Kring Team', photo: `${import.meta.env.BASE_URL}icon-192.png`, local: false, official: true };
    return { id, name: p?.name || '', photo: p?.photo || initialAvatar(p?.name || '?'), local: !!p?.local };
  };
  const media = async (path: string | null, kind: string | null): Promise<AskMedia | null> =>
    path ? { url: (await lib()).v5PublicObjectUrl('kr8-ask', path), gif: kind === 'gif' } : null;
  const mapA = async (a: RawA, P: (id: string) => AskPerson): Promise<AskAnswer> => ({
    id: a.id, parentId: a.parent_id, by: P(a.author_id), body: a.body || '', media: await media(a.media_path, a.media_kind),
    score: a.score || 0, myVote: (Math.sign(a.my_vote || 0) as -1 | 0 | 1), at: a.created_at,
  });
  // 20 Nov: Kring Team questions carry an English question + its Thai version in details → show ONE language only.
  const oneLang = (by: AskPerson, body: string, details: string): { body: string; details: string } => {
    if (!by.official || !details || !mostlyEnglish(body) || !hasThai(details)) return { body, details };
    let th = false; try { th = (localStorage.getItem('kr8_lang') || 'en') === 'th'; } catch { /* default English */ }
    return th ? { body: details, details: '' } : { body, details: '' };
  };
  const mapQ = async (q: RawQ, P: (id: string) => AskPerson): Promise<AskQuestion> => ({
    id: q.id, by: P(q.author_id), area: q.area || 'Bangkok', ...oneLang(P(q.author_id), q.body || '', q.details || ''), media: await media(q.media_path, q.media_kind),
    score: q.score || 0, myVote: (Math.sign(q.my_vote || 0) as -1 | 0 | 1), answers: q.answers || 0, top: q.top ? await mapA(q.top, P) : null, at: q.created_at,
  });
  const upload = async (f?: File | null): Promise<{ path: string | null; kind: string | null }> => {
    if (!f) return { path: null, kind: null };
    const m = await lib();
    const c = await m.v5Client();
    const s = await m.v5Session();
    if (!s) throw new Error('KR8_SIGN_IN');
    const clean = await askCleanFile(f);   // never the original file (GPS)
    const gif = clean.type === 'image/gif';
    const path = `${s.user.id}/${uid()}.${gif ? 'gif' : 'jpg'}`;
    const up = await c.storage.from('kr8-ask').upload(path, clean, { contentType: clean.type, upsert: false });
    if (up.error) throw up.error;
    return { path, kind: gif ? 'gif' : 'photo' };
  };
  return {
    async feed(before) {
      const r = await call<{ items: RawQ[]; people: Record<string, RawPerson> }>('kr8_ask_feed', { p_before: before || null, p_limit: 20 });
      const P = people(r?.people);
      return Promise.all((r?.items || []).map((q) => mapQ(q, P)));
    },
    async thread(id) {
      const r = await call<{ q: RawQ; answers: RawA[]; people: Record<string, RawPerson> }>('kr8_ask_thread', { p_post: id });
      const P = people(r?.people);
      const answers = await Promise.all((r?.answers || []).map((a) => mapA(a, P)));
      return { q: await mapQ(r.q, P), answers: orderThread(answers) };
    },
    async ask(d) {
      if (gate?.()) throw new Error('KR8_VERIFY_FIRST');   // 0093: a face-gated member never uploads a photo the server would refuse
      const m = await upload(d.file);
      return call<string>('kr8_ask_create', { p_body: d.body.trim(), p_details: (d.details || '').trim(), p_area: d.area || 'Bangkok', p_media_path: m.path, p_media_kind: m.kind });
    },
    async answer(postId, parentId, body, file) {
      if (gate?.()) throw new Error('KR8_VERIFY_FIRST');
      const m = await upload(file);
      return call<string>('kr8_ask_answer', { p_post: postId, p_parent: parentId, p_body: body.trim(), p_media_path: m.path, p_media_kind: m.kind });
    },
    vote(kind, id, value) {
      return call<number>('kr8_ask_vote', { p_kind: kind, p_id: id, p_value: value });
    },
    async report(kind, id, reason) {
      await call<null>('kr8_ask_report', { p_kind: kind, p_id: id, p_reason: reason });
    },
  };
}

/**
 * live = the app is on real accounts. demo = example posts (demo / harness builds only).
 * The first "function missing" answer from the database moves this screen to the local store for the rest of the visit.
 */
/** gate (0093): true when the signed-in member must pass the face check before posting; it also opens the check */
export function createAskApi(o: { live: boolean; demo: boolean; me: () => AskPerson | null; base?: string; gate?: () => boolean }): AskApi {
  if (o.demo) seed(o.base ?? '/');
  const loc = localApi(o.me);
  if (!o.live) return { mode: () => 'local', ...loc };
  const lv = liveApi(o.gate);
  let mode: 'live' | 'local' = 'live';
  const wrap = <A extends unknown[], R>(k: keyof typeof lv) => async (...a: A): Promise<R> => {
    if (mode === 'local') return (loc[k] as unknown as (...x: A) => Promise<R>)(...a);
    try {
      return await (lv[k] as unknown as (...x: A) => Promise<R>)(...a);
    } catch (e) {
      if (!isMissing(e)) throw e;
      mode = 'local';
      return (loc[k] as unknown as (...x: A) => Promise<R>)(...a);
    }
  };
  return {
    mode: () => mode,
    feed: wrap('feed'), thread: wrap('thread'), ask: wrap('ask'), answer: wrap('answer'), vote: wrap('vote'), report: wrap('report'),
  };
}
