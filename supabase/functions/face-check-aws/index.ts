// face-check-aws (19 Nov 2026): the face check on the SERVER with AWS Rekognition (ap-southeast-2 / Sydney), so the phone
// downloads no face models (~38 MB before). OFF until kr8_rings_config face_aws_on = 1 (migration 0125); while off, every call
// answers 409 FACE_AWS_OFF and the app keeps the on-phone check. See docs/face-aws.md.
//
// Member call (Supabase JWT required; deploy WITH JWT verification):
//   POST { consent, device?, frames: { straight, left, right } }   frames = base64 JPEG (~480 px, a "data:" prefix is fine)
//   → { result: 'pass' | 'review' | 'retry', why?, reasons?, verified, tries_left }
//     pass   = ✓ now (kr8_verifications approved, kr8_members.verified = true, the straight frame indexed in kring-members)
//     review = "Done ✓, we'll confirm shortly" (pending row → founder's Face checks; look-alike → founder alert)
//     retry  = no clear live face (no_face, many_faces, too_dark, too_blurry, too_far, eyes_closed, sunglasses, look_straight,
//              turn_left_missing, turn_right_missing); nothing is stored but a 'fail' line in kr8_face_decisions (counts as a try)
// Admin calls (the caller must pass kr8_is_admin()):
//   { action: 'index', id }   after the founder approves a pending AWS check: index its selfie (duplicate search finds it later)
//   { action: 'backfill', limit? }   index the card photos of verified members not in the collection yet (≤ 50 a call)
//   { action: 'sweep' }   remove faces of deleted / no longer verified members from the collection (PDPA)
//
// Env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default ap-southeast-2), FACE_AWS_COLLECTION (default kring-members),
//      FACE_AWS_YAW_SIGN (+1 / -1 / 0, see decide.ts), FACE_AWS_MOCK=1 (canned answers, no AWS keys needed: the body may add
//      mock: 'pass' | 'lookalike' | 'card_mismatch' | 'dark' | 'no_turn' | 'aws_down'; FACE_AWS_MOCK_OTHER = a user id for 'lookalike').
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
// Rate limits: face_aws_hour (default 20) calls per member per hour + the usual verify_tries_day decisions a day (database).
import { AWS_LIMITS, cardSimilarity, decide, liveCheck, pickOther, summarize, type FaceAwsLimits, type FaceStep } from './decide.ts';
import { signV4 } from './sigv4.ts';

const SUPA = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REGION = Deno.env.get('AWS_REGION') || 'ap-southeast-2';
const AK = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
const SK = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
const TOKEN = Deno.env.get('AWS_SESSION_TOKEN') || undefined;
const COLLECTION = Deno.env.get('FACE_AWS_COLLECTION') || 'kring-members';
const MOCK = Deno.env.get('FACE_AWS_MOCK') === '1';
const YAW_SIGN = Number(Deno.env.get('FACE_AWS_YAW_SIGN') || 0) || 0;
const BUCKET = 'kr8-verify';
const MAX_B64 = 1_400_000;   // ≈ 1 MB of JPEG per frame (a 480-px frame is ~40 KB)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

// ───────── Supabase (service role) ─────────
const SRH = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };
class DbError extends Error { code: string; constructor(code: string, msg: string) { super(msg); this.code = code; } }
async function rpc<T>(fn: string, args: Record<string, unknown> = {}, jwt?: string): Promise<T> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args),
    headers: jwt ? { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' } : SRH });
  const text = await r.text();
  if (!r.ok) {
    const m = text.match(/KR8_([A-Z_]+)/);
    throw new DbError(m ? m[1] : 'DB', `${fn} ${r.status} ${text.slice(0, 300)}`);
  }
  return (text ? JSON.parse(text) : null) as T;
}
async function userOf(req: Request): Promise<{ id: string; jwt: string } | null> {
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!jwt || jwt === ANON) return null;
  const r = await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } }).catch(() => null);
  if (!r || !r.ok) return null;
  const u = await r.json().catch(() => null) as { id?: string } | null;
  return u?.id ? { id: u.id, jwt } : null;
}
const b64ToBytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesToB64(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}
async function upload(path: string, b64: string): Promise<void> {
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, { method: 'POST', body: b64ToBytes(b64),
    headers: { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'false' } });
  if (!r.ok) throw new Error(`upload ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function removeFile(path: string): Promise<void> {
  await fetch(`${SUPA}/storage/v1/object/${BUCKET}`, { method: 'DELETE', headers: SRH, body: JSON.stringify({ prefixes: [path] }) }).catch(() => undefined);
}
async function download(path: string): Promise<string | null> {
  const r = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } }).catch(() => null);
  if (!r || !r.ok) return null;
  return bytesToB64(new Uint8Array(await r.arrayBuffer()));
}
/** kr8_members.photo: a data: URL (base64 JPEG) or, for older cards, a link → base64 for Rekognition (null if unusable) */
async function photoB64(photo: string | null | undefined): Promise<string | null> {
  if (!photo) return null;
  const m = photo.match(/^data:image\/(jpeg|jpg|png);base64,(.+)$/i);
  if (m) return m[2];
  if (/^https:\/\//.test(photo)) {
    const r = await fetch(photo).catch(() => null);
    if (!r || !r.ok || !/image\/(jpeg|png)/.test(r.headers.get('content-type') || '')) return null;
    return bytesToB64(new Uint8Array(await r.arrayBuffer()));
  }
  return null;
}
/** a base64 JPEG frame from the phone (a data: prefix is removed); null when missing, too big or not a JPEG */
function frameB64(x: unknown): string | null {
  if (typeof x !== 'string') return null;
  const b = x.replace(/^data:image\/jpe?g;base64,/i, '').replace(/\s+/g, '');
  if (b.length < 200 || b.length > MAX_B64 || !b.startsWith('/9j/')) return null;
  return b;
}

// ───────── Rekognition ─────────
class AwsError extends Error { type: string; constructor(type: string, msg: string) { super(msg); this.type = type; } }
let mockCase = 'pass';
async function rk<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  if (MOCK) return mockRk(target, payload) as T;
  if (!AK || !SK) throw new AwsError('NoKeys', 'AWS keys are not set');
  const url = `https://rekognition.${REGION}.amazonaws.com/`;
  const body = JSON.stringify(payload);
  const headers = await signV4({ method: 'POST', url, body, region: REGION, service: 'rekognition', accessKeyId: AK, secretAccessKey: SK, sessionToken: TOKEN,
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `RekognitionService.${target}` } });
  const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(9000) });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) throw new AwsError(String(j.__type || `HTTP_${r.status}`).split('#').pop()!, String(j.message || j.Message || ''));
  return j as T;
}
const img = (b64: string) => ({ Bytes: b64 });
const detect = (b64: string) => rk<unknown>('DetectFaces', { Image: img(b64), Attributes: ['DEFAULT', 'EYES_OPEN', 'SUNGLASSES'] });
async function search(b64: string): Promise<unknown> {
  const p = { CollectionId: COLLECTION, Image: img(b64), FaceMatchThreshold: 90, MaxFaces: 5, QualityFilter: 'NONE' };
  try { return await rk<unknown>('SearchFacesByImage', p); }
  catch (e) {
    // first run: the collection does not exist yet → make it (empty, so no matches this time)
    if (e instanceof AwsError && e.type === 'ResourceNotFoundException') {
      await rk('CreateCollection', { CollectionId: COLLECTION }).catch((x) => log({ create_collection: String(x) }));
      return { FaceMatches: [] };
    }
    throw e;
  }
}
async function indexFace(uid: string, b64: string, source: 'check' | 'card', verification: string | null): Promise<string | null> {
  const r = await rk<{ FaceRecords?: { Face?: { FaceId?: string } }[] }>('IndexFaces',
    { CollectionId: COLLECTION, Image: img(b64), ExternalImageId: uid, MaxFaces: 1, QualityFilter: 'AUTO', DetectionAttributes: [] });
  const id = r.FaceRecords?.[0]?.Face?.FaceId || null;
  if (id) await rpc('kr8_face_aws_face_add', { p_user: uid, p_face_id: id, p_source: source, p_verification: verification });
  return id;
}

/** FACE_AWS_MOCK=1: canned Rekognition answers, so the whole flow (database rows, storage, alerts, the app) can be tested without keys */
function mockRk(target: string, p: Record<string, unknown>): unknown {
  const face = (yaw: number, extra: Record<string, unknown> = {}) => ({ Confidence: 99.9, BoundingBox: { Width: 0.45, Height: 0.6 }, Pose: { Yaw: yaw, Pitch: 2, Roll: 1 },
    Quality: { Brightness: 70, Sharpness: 60 }, EyesOpen: { Value: true, Confidence: 98 }, Sunglasses: { Value: false, Confidence: 99 }, ...extra });
  if (target === 'DetectFaces') {
    const step = (p as { __step?: FaceStep }).__step || 'straight';
    if (mockCase === 'aws_down') throw new AwsError('ThrottlingException', 'mock: Rekognition is busy');
    if (mockCase === 'dark') return { FaceDetails: [face(0, { Quality: { Brightness: 8, Sharpness: 40 } })] };
    const yaw = step === 'straight' ? 1 : mockCase === 'no_turn' ? 2 : step === 'left' ? 24 : -23;
    return { FaceDetails: [face(yaw)] };
  }
  if (target === 'CompareFaces') return mockCase === 'card_mismatch' ? { FaceMatches: [], UnmatchedFaces: [{}] } : { FaceMatches: [{ Similarity: 99.1 }] };
  if (target === 'SearchFacesByImage') {
    const other = Deno.env.get('FACE_AWS_MOCK_OTHER') || '00000000-0000-0000-0000-000000000000';
    return mockCase === 'lookalike' ? { FaceMatches: [{ Similarity: 98.7, Face: { ExternalImageId: other, FaceId: 'mock-face' } }] } : { FaceMatches: [] };
  }
  if (target === 'IndexFaces') return { FaceRecords: [{ Face: { FaceId: `mock-${crypto.randomUUID()}` } }] };
  if (target === 'ListFaces' || target === 'DeleteFaces' || target === 'CreateCollection') return {};
  return {};
}

// ───────── the member's check ─────────
type Gate = { again: boolean; verified: boolean; photo?: string | null; tries_left?: number; card_min?: number; dup_min?: number; auto_on?: number };
type Rec = { result: 'pass' | 'review' | 'fail'; reasons: string[]; verified: boolean; tries_left: number; verification_id?: string };

async function check(uid: string, body: Record<string, unknown>): Promise<Response> {
  const t0 = Date.now();
  const consent = typeof body.consent === 'string' ? body.consent : '';
  const device = typeof body.device === 'string' ? body.device.slice(0, 60) : '';
  const fr = (body.frames || {}) as Record<string, unknown>;
  const frames = { straight: frameB64(fr.straight), left: frameB64(fr.left), right: frameB64(fr.right) };
  if (!frames.straight || !frames.left || !frames.right) return json({ error: 'BAD_FRAMES' }, 400);
  if (MOCK) mockCase = typeof body.mock === 'string' ? body.mock : 'pass';

  const gate = await rpc<Gate>('kr8_face_aws_gate', { p_user: uid, p_consent: consent });
  if (gate.again) return json({ result: 'pass', again: true, verified: true, reasons: [] });
  const lim: FaceAwsLimits = { ...AWS_LIMITS, yawSign: YAW_SIGN, cardMin: gate.card_min ?? AWS_LIMITS.cardMin, dupMin: gate.dup_min ?? AWS_LIMITS.dupMin };
  const S = frames.straight;
  const record = (decision: 'pass' | 'review' | 'fail', reasons: string[], live: Record<string, unknown>, path: string | null, card: number | null, dup: { user_id: string; similarity: number } | null) =>
    rpc<Rec>('kr8_face_aws_record', { p_user: uid, p_selfie_path: path, p_consent: consent, p_decision: decision, p_reasons: reasons,
      p_live: { ...live, device, ms: Date.now() - t0 }, p_card_sim: card, p_dup_user: dup?.user_id ?? null, p_dup_sim: dup?.similarity ?? null });
  /** keep the straight frame (private bucket, deleted ~30 days after the decision) for the founder, then write the decision */
  const keep = async (decision: 'pass' | 'review', reasons: string[], live: Record<string, unknown>, card: number | null, dup: { user_id: string; similarity: number } | null) => {
    const path = `${uid}/${crypto.randomUUID()}.jpg`;
    await upload(path, S);
    try { return { rec: await record(decision, reasons, live, path, card, dup), path }; }
    catch (e) { await removeFile(path); throw e; }
  };

  let live: ReturnType<typeof liveCheck>;
  let yaws: (number | null)[] = [];   // 19 Nov: kept on a retry so the turn limits can be tuned on real members
  let card: number | null = null, other: ReturnType<typeof pickOther> = null;
  try {
    const det = await Promise.all((['straight', 'left', 'right'] as const).map((k) =>
      (MOCK ? rk<unknown>('DetectFaces', { __step: k }) : detect(frames[k]!)).then(summarize)));
    yaws = det.map((fs) => (fs[0] ? Math.round(fs[0].yaw * 10) / 10 : null));
    live = liveCheck({ straight: det[0], left: det[1], right: det[2] }, lim);
    if (live.ok) {
      const cardB64 = await photoB64(gate.photo);
      const [cmp, srch] = await Promise.all([
        cardB64 ? rk<unknown>('CompareFaces', { SourceImage: img(S), TargetImage: img(cardB64), SimilarityThreshold: 0, QualityFilter: 'NONE' })
          .catch((e) => (e instanceof AwsError && /InvalidParameter|InvalidImageFormat|ImageTooLarge/.test(e.type) ? null : Promise.reject(e))) : Promise.resolve(null),
        search(S),
      ]);
      card = cmp ? cardSimilarity(cmp) : null;
      other = pickOther(srch, uid);
    }
  } catch (e) {
    // Rekognition down / throttled / keys wrong: the member is never stuck, the selfie goes to the founder's Face checks
    log({ aws_error: String(e).slice(0, 300), type: e instanceof AwsError ? e.type : 'other' });
    const { rec } = await keep('review', ['aws_error'], { aws_error: e instanceof AwsError ? e.type : 'other' }, null, null);
    return json({ result: 'review', reasons: rec.reasons, verified: rec.verified, tries_left: rec.tries_left });
  }
  if (!live.ok) {
    const rec = await record('fail', [live.why], { fail_aws: live.why, yaws }, null, null, null);
    return json({ result: 'retry', why: live.why, verified: rec.verified, tries_left: rec.tries_left });
  }
  const d = decide({ card, other, autoOn: (gate.auto_on ?? 1) === 1 }, lim);
  const liveInfo = { yaw: live.yaw, card_sim: card, other_sim: other?.similarity ?? null };
  const { rec } = await keep(d.result, d.reasons, liveInfo, card, other);
  if (rec.result === 'pass') {
    try { await indexFace(uid, S, 'check', rec.verification_id ?? null); }
    catch (e) { log({ index_error: String(e).slice(0, 300) }); }   // the ✓ stays; the next sweep / backfill can add it
  }
  log({ check: rec.result, reasons: rec.reasons, ms: Date.now() - t0 });
  return json({ result: rec.result === 'pass' ? 'pass' : 'review', reasons: rec.reasons, verified: rec.verified, tries_left: rec.tries_left });
}


// ───────── card photo check (19 Nov fix5) ─────────
// The card screen used to run a face finder ON the phone (a 1 MB model + WebGL). On many Android phones WebGL is broken, the
// finder fell back to the CPU and members waited on a black "loading" screen, or a good photo was refused. Now the phone sends the
// small card photo (≤ 384 px) here: one AWS DetectFaces call (~1 s, nothing stored). Same rules as before: ok · none · small · group.
type Fd = { BoundingBox?: { Width?: number }; Confidence?: number };
export function photoVerdictAws(faces: Fd[]): 'ok' | 'none' | 'small' | 'group' {
  const f = (faces || []).filter((x) => (x.Confidence ?? 0) >= 90).map((x) => x.BoundingBox?.Width ?? 0).sort((a, b) => b - a);
  if (!f.length || f[0] > 0.95) return 'none';
  if (f[0] < 0.08) return 'small';
  if (f.length > 1 && f[1] >= f[0] * 0.85) return 'group';
  return 'ok';
}
async function photoCheck(body: Record<string, unknown>): Promise<Response> {
  const b64 = frameB64(body.image);
  if (!b64) return json({ verdict: 'error', why: 'bad_image' });
  if (MOCK) return json({ verdict: typeof body.mock === 'string' ? body.mock : 'ok' });
  const r = await rk<{ FaceDetails?: Fd[] }>('DetectFaces', { Image: img(b64), Attributes: ['DEFAULT'] });
  return json({ verdict: photoVerdictAws(r.FaceDetails || []) });
}

// ───────── admin actions ─────────
async function admin(jwt: string, body: Record<string, unknown>, robot = false): Promise<Response> {
  // 19 Nov fix2: the canary (service key) runs backfill every hour, so faces the team approves by hand get into AWS too
  const ok = robot ? (body.action === 'backfill' || body.action === 'sweep') : await rpc<boolean>('kr8_is_admin', {}, jwt).catch(() => false);
  if (ok !== true) return json({ error: 'ADMIN_ONLY' }, 403);
  if (body.action === 'index') {
    const info = await rpc<{ user_id: string; selfie_path: string | null; status: string; aws: boolean } | null>('kr8_face_aws_index_info', { p_id: body.id });
    if (!info || info.status !== 'approved' || !info.selfie_path) return json({ indexed: false, why: 'not_approved_or_no_selfie' });
    const b64 = await download(info.selfie_path);
    if (!b64) return json({ indexed: false, why: 'selfie_missing' });
    const id = await indexFace(info.user_id, b64, 'check', String(body.id));
    return json({ indexed: !!id });
  }
  if (body.action === 'backfill') {
    const todo = await rpc<{ user_id: string; photo: string | null }[]>('kr8_face_aws_backfill_todo', { p_limit: Math.min(Number(body.limit) || 25, 50) });
    let done = 0, skipped = 0;
    for (const t of todo || []) {
      const b64 = await photoB64(t.photo);
      if (!b64) { skipped++; continue; }
      try { if (await indexFace(t.user_id, b64, 'card', null)) done++; else skipped++; }
      catch (e) { skipped++; log({ backfill_error: String(e).slice(0, 200) }); }
    }
    return json({ indexed: done, skipped, left: Math.max((todo || []).length - done - skipped, 0) });
  }
  if (body.action === 'sweep') {
    const stale = await rpc<string[]>('kr8_face_aws_stale', { p_limit: 1000 });
    if (!stale?.length) return json({ removed: 0 });
    for (let i = 0; i < stale.length; i += 1000) await rk('DeleteFaces', { CollectionId: COLLECTION, FaceIds: stale.slice(i, i + 1000) });
    const n = await rpc<number>('kr8_face_aws_forgot', { p_face_ids: stale });
    return json({ removed: n });
  }
  return json({ error: 'BAD_ACTION' }, 400);
}

const STATUS: Record<string, number> = { SIGN_IN: 401, NO_CARD: 400, CONSENT_REQUIRED: 400, SLOW_DOWN: 429, FACE_AWS_OFF: 409, BAD_SELFIE: 400, ADMIN_ONLY: 403 };
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  if (!SUPA || !SR || !ANON) return json({ error: 'NOT_CONFIGURED' }, 500);
  const robotKey = Deno.env.get('FACE_ROBOT_KEY') ?? '';
  if (robotKey.length >= 32 && req.headers.get('x-kring-robot') === robotKey) {
    let b: Record<string, unknown>;
    try { b = await req.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
    try { return await admin('', b, true); } catch (e) { log({ robot_error: String(e).slice(0, 300) }); return json({ error: 'SERVER' }, 500); }
  }
  const who = await userOf(req);
  if (!who) return json({ error: 'SIGN_IN' }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
  try {
    if (body.action === 'photo') return await photoCheck(body);
    return typeof body.action === 'string' ? await admin(who.jwt, body) : await check(who.id, body);
  } catch (e) {
    if (e instanceof DbError && STATUS[e.code]) return json({ error: e.code }, STATUS[e.code]);
    log({ error: String(e).slice(0, 400) });
    return json({ error: e instanceof DbError ? e.code : 'SERVER' }, 500);
  }
});
