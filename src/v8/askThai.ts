/**
 * Ask a Thai (16 Nov, founder-approved "Screen 2"): an open question-and-answer timeline on the Feed tab.
 * Anyone (a member, 20+) can ask; anyone can answer; Thai locals carry a "Thai Local" badge. Text, photos, emoji and GIFs.
 *
 * Live: the kr8_ask_* RPCs from supabase/migrations/0057_kr8_ask_a_thai.sql (SECURITY DEFINER, no direct table writes).
 * Until that migration is applied (function missing), or in demo / harness builds, everything runs on a local store in
 * this tab only, so the screen still works and renders. Demo builds seed it with example posts; the live app never does.
 */
import { initialAvatar } from './v8Data';

export interface AskPerson { id: string; name: string; photo: string; local: boolean }
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
export interface AskDraft { body: string; details?: string; area?: string | null; file?: File | null }
export interface AskApi {
  /** 'live' = database; 'local' = this tab only (migration not applied yet, or a demo build) */
  mode(): 'live' | 'local';
  feed(before?: string): Promise<AskQuestion[]>;
  thread(id: string): Promise<AskThreadData>;
  ask(d: AskDraft): Promise<string>;
  answer(postId: string, parentId: string | null, body: string, file?: File | null): Promise<string>;
  vote(kind: 'q' | 'a', id: string, value: -1 | 0 | 1): Promise<number>;
}

export const ASK_MAX_Q = 200;
export const ASK_MAX_TEXT = 1000;
export const ASK_MAX_FILE = 5 * 1024 * 1024;
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
  if (f.size > ASK_MAX_FILE) return 'size';
  return null;
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
  };
}

// ─────────────── live (0057) ───────────────
interface RawPerson { name: string; photo: string | null; local: boolean }
interface RawA { id: string; parent_id: string | null; author_id: string; body: string; media_path: string | null; media_kind: string | null; score: number; my_vote: number; created_at: string }
interface RawQ { id: string; author_id: string; area: string; body: string; details: string | null; media_path: string | null; media_kind: string | null; score: number; my_vote: number;
  answers: number; top: RawA | null; created_at: string }

/** PostgREST "function not found" / Postgres "undefined function / table": the migration is not applied yet. */
export function isMissing(e: unknown): boolean {
  const o = (e || {}) as { code?: string; message?: string };
  return o.code === 'PGRST202' || o.code === '42883' || o.code === '42P01' || /could not find the function|does not exist/i.test(o.message || '');
}

function liveApi(): Omit<AskApi, 'mode'> {
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
    return { id, name: p?.name || '', photo: p?.photo || initialAvatar(p?.name || '?'), local: !!p?.local };
  };
  const media = async (path: string | null, kind: string | null): Promise<AskMedia | null> =>
    path ? { url: (await lib()).v5PublicObjectUrl('kr8-ask', path), gif: kind === 'gif' } : null;
  const mapA = async (a: RawA, P: (id: string) => AskPerson): Promise<AskAnswer> => ({
    id: a.id, parentId: a.parent_id, by: P(a.author_id), body: a.body || '', media: await media(a.media_path, a.media_kind),
    score: a.score || 0, myVote: (Math.sign(a.my_vote || 0) as -1 | 0 | 1), at: a.created_at,
  });
  const mapQ = async (q: RawQ, P: (id: string) => AskPerson): Promise<AskQuestion> => ({
    id: q.id, by: P(q.author_id), area: q.area || 'Bangkok', body: q.body || '', details: q.details || '', media: await media(q.media_path, q.media_kind),
    score: q.score || 0, myVote: (Math.sign(q.my_vote || 0) as -1 | 0 | 1), answers: q.answers || 0, top: q.top ? await mapA(q.top, P) : null, at: q.created_at,
  });
  const upload = async (f?: File | null): Promise<{ path: string | null; kind: string | null }> => {
    if (!f) return { path: null, kind: null };
    const m = await lib();
    const c = await m.v5Client();
    const s = await m.v5Session();
    if (!s) throw new Error('KR8_SIGN_IN');
    const ext = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' } as Record<string, string>)[f.type] || 'jpg';
    const path = `${s.user.id}/${uid()}.${ext}`;
    const up = await c.storage.from('kr8-ask').upload(path, f, { contentType: f.type, upsert: false });
    if (up.error) throw up.error;
    return { path, kind: f.type === 'image/gif' ? 'gif' : 'photo' };
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
      const m = await upload(d.file);
      return call<string>('kr8_ask_create', { p_body: d.body.trim(), p_details: (d.details || '').trim(), p_area: d.area || 'Bangkok', p_media_path: m.path, p_media_kind: m.kind });
    },
    async answer(postId, parentId, body, file) {
      const m = await upload(file);
      return call<string>('kr8_ask_answer', { p_post: postId, p_parent: parentId, p_body: body.trim(), p_media_path: m.path, p_media_kind: m.kind });
    },
    vote(kind, id, value) {
      return call<number>('kr8_ask_vote', { p_kind: kind, p_id: id, p_value: value });
    },
  };
}

/**
 * live = the app is on real accounts. demo = example posts (demo / harness builds only).
 * The first "function missing" answer from the database moves this screen to the local store for the rest of the visit.
 */
export function createAskApi(o: { live: boolean; demo: boolean; me: () => AskPerson | null; base?: string }): AskApi {
  if (o.demo) seed(o.base ?? '/');
  const loc = localApi(o.me);
  if (!o.live) return { mode: () => 'local', ...loc };
  const lv = liveApi();
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
    feed: wrap('feed'), thread: wrap('thread'), ask: wrap('ask'), answer: wrap('answer'), vote: wrap('vote'),
  };
}
