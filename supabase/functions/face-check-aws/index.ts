// face-check-aws (19 Nov 2026): the face check on the SERVER with AWS Rekognition (ap-southeast-2 / Sydney), so the phone
// downloads no face models (~38 MB before). OFF until kr8_rings_config face_aws_on = 1 (migration 0125); while off, every call
// answers 409 FACE_AWS_OFF and the app keeps the on-phone check. See docs/face-aws.md.
//
// Member call (Supabase JWT required; deploy WITH JWT verification):
//   POST { consent, device?, frames: { straight, left, right } }   frames = base64 JPEG (~480 px, a "data:" prefix is fine)
//   → { result: 'pass' | 'review' | 'retry' | 'refused', why?, reasons?, verified, tries_left }
//     refused = 0171: the same face as another account → refused automatically (warning once, all-prizes ban, appeal button)
//     pass   = ✓ now (kr8_verifications approved, kr8_members.verified = true, the straight frame indexed in kring-members)
//     review = "Done ✓, we'll confirm shortly" (pending row → founder's Face checks; look-alike → founder alert)
//     retry  = no clear live face (no_face, many_faces, too_dark, too_blurry, too_far, eyes_closed, sunglasses, look_straight,
//              turn_left_missing, turn_right_missing); nothing is stored but a 'fail' line in kr8_face_decisions (counts as a try)
// Admin calls (the caller must pass kr8_is_admin()):
//   { action: 'index', id }   after the founder approves a pending AWS check: index its selfie (duplicate search finds it later)
//   { action: 'backfill', limit? }   index the card photos of verified members not in the collection yet (≤ 50 a call)
//   { action: 'sweep' }   remove faces of deleted / no longer verified members from the collection (PDPA)
//   { action: 'reel_copy_scan', limit? }   (0148, robot) new waiting Reels: poster + 2 scan frames → DetectText → copied watermark?
//                          recorded in kr8_reel_copy_checks (+ amber alert). Never hides a Reel.
//   { action: 'traveller_scan', limit? }   (0187, robot) traveller-tag requests not checked yet: OCR the passport page (Textract,
//                          Rekognition DetectText fallback) → MRZ? nationality? + CompareFaces with the member's selfie / card photo
//                          + name vs card → kr8_traveller_check_record (suggestion only; the founder decides). Once per request.
// 0148: the straight frame's DetectFaces also asks AGE_RANGE (same call); pass / review → kr8_age_check_record (likely under 18
//       → red alert). Never closes an account.
//
// Env: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION (default ap-southeast-2), FACE_AWS_COLLECTION (default kring-members),
//      FACE_AWS_YAW_SIGN (+1 / -1 / 0, see decide.ts), FACE_AWS_MOCK=1 (canned answers, no AWS keys needed: the body may add
//      mock: 'pass' | 'lookalike' | 'card_mismatch' | 'dark' | 'no_turn' | 'aws_down'; FACE_AWS_MOCK_OTHER = a user id for 'lookalike').
//      SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are set by Supabase.
// Rate limits: face_aws_hour (default 20) calls per member per hour + the usual verify_tries_day decisions a day (database).
import { AWS_LIMITS, cardSimilarity, decide, liveCheck, pickOther, summarize, type FaceAwsLimits, type FaceStep } from './decide.ts';
import { signV4 } from './sigv4.ts';
import { ageVerdict, copyHits, copySummary, scanFramePaths, type CopyHit, type TextDet } from './copyscan.ts';
import { dailyPhotoVerdict, type DailyV, type DFace, type DLabel } from './dailyphoto.ts';
import { dataUrlB64, frameFeatures, type FacesResp, type FrameF, type LabelsResp, type TextResp } from './quality.ts';
import { dhashRGBA, otherMemberInReel, type FaceHit } from './reelprint.ts';
import { photoVerdictAws, type Fd, type PhotoV } from './photoverdict.ts';
export { photoVerdictAws, PHOTO_TEXT_WORDS, PHOTO_CHILD_HIGH } from './photoverdict.ts';
import { faceOf, findMrz, nameMatch, verdict, type FaceResult, type NameResult } from './travellercheck.ts';
import jpeg from 'npm:jpeg-js@0.4.4';

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
const REELS = 'kr8-reels';
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
async function download(path: string, bucket = BUCKET): Promise<string | null> {
  const r = await fetch(`${SUPA}/storage/v1/object/${bucket}/${path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } }).catch(() => null);
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
/** 0187: AWS Textract (same keys / region as Rekognition) */
async function tx<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  if (MOCK) return { Blocks: [] } as T;
  if (!AK || !SK) throw new AwsError('NoKeys', 'AWS keys are not set');
  const url = `https://textract.${REGION}.amazonaws.com/`;
  const body = JSON.stringify(payload);
  const headers = await signV4({ method: 'POST', url, body, region: REGION, service: 'textract', accessKeyId: AK, secretAccessKey: SK, sessionToken: TOKEN,
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `Textract.${target}` } });
  const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) throw new AwsError(String(j.__type || `HTTP_${r.status}`).split('#').pop()!, String(j.message || j.Message || ''));
  return j as T;
}
const img = (b64: string) => ({ Bytes: b64 });
const detect = (b64: string) => rk<unknown>('DetectFaces', { Image: img(b64), Attributes: ['DEFAULT', 'EYES_OPEN', 'SUNGLASSES', 'AGE_RANGE'] });   // 0148: + age, same call
/** 0148: the age range of the biggest face in a DetectFaces answer (null when none) */
export function ageOf(resp: unknown): { Low: number; High: number } | null {
  const fs = ((resp as { FaceDetails?: { BoundingBox?: { Width?: number; Height?: number }; AgeRange?: { Low?: number; High?: number } }[] } | null)?.FaceDetails || [])
    .slice().sort((a, b) => (b.BoundingBox?.Width ?? 0) * (b.BoundingBox?.Height ?? 0) - (a.BoundingBox?.Width ?? 0) * (a.BoundingBox?.Height ?? 0));
  const a = fs[0]?.AgeRange;
  return a && typeof a.Low === 'number' && typeof a.High === 'number' ? { Low: a.Low, High: a.High } : null;
}

async function search(b64: string): Promise<unknown> {
  const p = { CollectionId: COLLECTION, Image: img(b64), FaceMatchThreshold: 80, MaxFaces: 5, QualityFilter: 'NONE' };   // 19 Nov: 80 so look-alikes are kept for the prize check
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

/** 19 Nov: every other member whose face is ≥ 80 % like this one is kept (kr8_face_lookalikes); a prize claim with a look-alike
 *  that already has a prize is held for the founder. The ✓ itself still only waits at ≥ dupMin (95). */
async function noteLookalikes(uid: string, resp: unknown): Promise<void> {
  const list = (resp as { FaceMatches?: { Similarity?: number; Face?: { ExternalImageId?: string } }[] } | null)?.FaceMatches || [];
  for (const m of list) {
    const id = m?.Face?.ExternalImageId, sim = typeof m?.Similarity === 'number' ? m.Similarity : null;
    if (!id || sim === null || sim < 80 || id.toLowerCase() === uid.toLowerCase()) continue;
    try { await rpc('kr8_face_lookalike_note', { p_user: uid, p_other: id, p_sim: Math.round(sim * 10) / 10 }); }
    catch (e) { log({ lookalike_error: String(e).slice(0, 200) }); }
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
    Quality: { Brightness: 70, Sharpness: 60 }, EyesOpen: { Value: true, Confidence: 98 }, Sunglasses: { Value: false, Confidence: 99 },
    AgeRange: mockCase === 'minor' ? { Low: 12, High: 18 } : { Low: 24, High: 32 }, ...extra });
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
  if (target === 'DetectText') return { TextDetections: mockCase === 'tiktok' ? [{ DetectedText: 'TikTok', Type: 'LINE', Confidence: 99 }] : [] };
  if (target === 'IndexFaces') return { FaceRecords: [{ Face: { FaceId: `mock-${crypto.randomUUID()}` } }] };
  if (target === 'ListFaces' || target === 'DeleteFaces' || target === 'CreateCollection') return {};
  return {};
}

// ───────── the member's check ─────────
type Gate = { again: boolean; verified: boolean; photo?: string | null; tries_left?: number; card_min?: number; dup_min?: number; auto_on?: number };
type Rec = { result: 'pass' | 'review' | 'fail' | 'block'; reasons: string[]; verified: boolean; tries_left: number; verification_id?: string };

async function check(uid: string, body: Record<string, unknown>): Promise<Response> {
  const t0 = Date.now();
  const consent = typeof body.consent === 'string' ? body.consent : '';
  const device = typeof body.device === 'string' ? body.device.slice(0, 60) : '';
  const fr = (body.frames || {}) as Record<string, unknown>;
  const frames = { straight: frameB64(fr.straight), left: frameB64(fr.left), right: frameB64(fr.right) };
  if (!frames.straight || !frames.left || !frames.right) return json({ error: 'BAD_FRAMES' }, 400);
  // 20 Nov: newer apps add a 2nd straight frame (eyes) and an earlier frame of each turn (the bigger turn counts); optional
  const more = { straight2: frameB64(fr.straight2), left2: frameB64(fr.left2), right2: frameB64(fr.right2) };
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
  let age: { Low: number; High: number } | null = null;   // 0148
  try {
    const raw = await Promise.all((['straight', 'left', 'right'] as const).map((k) =>
      (MOCK ? rk<unknown>('DetectFaces', { __step: k }) : detect(frames[k]!))));
    age = ageOf(raw[0]);
    const det = raw.map(summarize);
    yaws = det.map((fs) => (fs[0] ? Math.round(fs[0].yaw * 10) / 10 : null));
    const extraKeys = (['straight2', 'left2', 'right2'] as const).filter((k) => !MOCK && more[k]);
    const extraDet = await Promise.all(extraKeys.map((k) => detect(more[k]!).then(summarize).catch(() => [] as ReturnType<typeof summarize>)));
    const extra: Record<string, ReturnType<typeof summarize>> = {};
    extraKeys.forEach((k, i) => { extra[k] = extraDet[i]; yaws.push(extraDet[i][0] ? Math.round(extraDet[i][0].yaw * 10) / 10 : null); });
    live = liveCheck({ straight: det[0], left: det[1], right: det[2] }, lim, extra);
    if (live.ok) {
      const cardB64 = await photoB64(gate.photo);
      const [cmp, srch] = await Promise.all([
        cardB64 ? rk<unknown>('CompareFaces', { SourceImage: img(S), TargetImage: img(cardB64), SimilarityThreshold: 0, QualityFilter: 'NONE' })
          .catch((e) => (e instanceof AwsError && /InvalidParameter|InvalidImageFormat|ImageTooLarge/.test(e.type) ? null : Promise.reject(e))) : Promise.resolve(null),
        search(S),
      ]);
      card = cmp ? cardSimilarity(cmp) : null;
      other = pickOther(srch, uid);
      await noteLookalikes(uid, srch);
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
  const liveInfo = { yaw: live.yaw, card_sim: card, other_sim: other?.similarity ?? null, card_fix: d.cardFix };
  const { rec } = await keep(d.result, d.reasons, liveInfo, card, other);
  if (rec.result === 'pass' && d.cardFix) {
    try { await rpc('kr8_face_card_nudge', { p_user: uid, p_why: d.cardFix }); } catch (e) { log({ nudge_error: String(e).slice(0, 200) }); }
  }
  // 0148 under-18 check: recorded for the founder (likely minor → red alert); never blocks or closes anything here
  if (age && ageVerdict(age)) {
    try { await rpc('kr8_age_check_record', { p_user: uid, p_low: age.Low, p_high: age.High, p_source: 'check' }); }
    catch (e) { log({ age_error: String(e).slice(0, 200) }); }   // before 0148: the function is missing, the check goes on
  }
  if (rec.result === 'pass') {
    try { await indexFace(uid, S, 'check', rec.verification_id ?? null); }
    catch (e) { log({ index_error: String(e).slice(0, 300) }); }   // the ✓ stays; the next sweep / backfill can add it
  }
  log({ check: rec.result, reasons: rec.reasons, ms: Date.now() - t0 });
  // 0171 (20 Nov, founder): the same face as another account is refused straight away (no founder card); the app shows the
  // "one person, one account" screen with "Ask Kring to check my account". The other account is never named to the member.
  if (rec.result === 'block') return json({ result: 'refused', reasons: rec.reasons, verified: false, tries_left: rec.tries_left });
  return json({ result: rec.result === 'pass' ? 'pass' : 'review', reasons: rec.reasons, verified: rec.verified, tries_left: rec.tries_left });
}


// ───────── card photo check (19 Nov fix5) ─────────
// The card screen used to run a face finder ON the phone (a 1 MB model + WebGL). On many Android phones WebGL is broken, the
// finder fell back to the CPU and members waited on a black "loading" screen, or a good photo was refused. Now the phone sends the
// small card photo (≤ 384 px) here: one AWS DetectFaces call (~1 s, nothing stored). Same rules as before: ok · none · small · group.
async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** 20 Nov: the database only takes a card photo that passed here (kr8_photo_passes, checked by the kr8_members photo trigger).
 *  AWS down → the photo is let in as 'unchecked' and the 5-minute photo robot checks it again (kr8_photo_audit_run). */
async function photoCheck(uid: string, body: Record<string, unknown>): Promise<Response> {
  const b64 = frameB64(body.image);
  if (!b64 || typeof body.image !== 'string') return json({ verdict: 'error', why: 'bad_image' });
  const sha = await sha256Hex(body.image);
  const pass = (verdict: 'ok' | 'unchecked') => rpc('kr8_photo_pass_add', { p_user: uid, p_sha: sha, p_verdict: verdict }).catch((e) => log({ pass_error: String(e).slice(0, 200) }));
  if (MOCK) {
    const v = typeof body.mock === 'string' ? body.mock : 'ok';
    if (v === 'ok') await pass('ok');
    return json({ verdict: v });
  }
  let v: PhotoV;
  try {
    const [r, t] = await Promise.all([
      rk<{ FaceDetails?: Fd[] }>('DetectFaces', { Image: img(b64), Attributes: ['DEFAULT', 'AGE_RANGE'] }),
      rk<{ TextDetections?: { Type?: string; Confidence?: number }[] }>('DetectText', { Image: img(b64) }).catch(() => null),
    ]);
    const words = (t?.TextDetections || []).filter((x) => x.Type === 'WORD' && (x.Confidence ?? 0) >= 80).length;
    v = photoVerdictAws(r.FaceDetails || [], words);
  } catch (e) {
    log({ photo_aws_error: String(e).slice(0, 200) });
    await pass('unchecked');
    return json({ verdict: 'error', why: 'aws' });
  }
  if (v === 'ok') await pass('ok');
  log({ photo_verdict: v });
  return json({ verdict: v });
}


// ───────── m242 (27 Nov): daily photo check ─────────
// The phone sends the daily photo here before posting. AWS: labels (is a person in it?), faces (+age), words, and for ONE clear face
// a search in the members' faces (is it this member?). ok → a 'dok' pass for that exact photo; kr8_create_photo only takes a photo
// with a pass. AWS down → a 'dun' pass (posted, checked again later). Nothing is stored at AWS.
async function dailyPhotoEval(uid: string, b64: string, dbg = false): Promise<DailyV> {
  const [lb, fc, tt] = await Promise.all([
    rk<{ Labels?: DLabel[] }>('DetectLabels', { Image: img(b64), MaxLabels: 40, MinConfidence: 60 }),
    rk<{ FaceDetails?: DFace[] }>('DetectFaces', { Image: img(b64), Attributes: ['DEFAULT', 'AGE_RANGE'] }),
    rk<{ TextDetections?: { Type?: string; Confidence?: number }[] }>('DetectText', { Image: img(b64) }).catch(() => null),
  ]);
  const faces = fc.FaceDetails || [];
  const words = (tt?.TextDetections || []).filter((x) => x.Type === 'WORD' && (x.Confidence ?? 0) >= 80).length;
  const clear = faces.filter((f) => (f.Confidence ?? 0) >= 95 && (f.BoundingBox?.Width ?? 0) >= 0.08);
  let matches = clear.length === 1 ? faceHits(await search(b64).catch(() => ({ FaceMatches: [] }))) : null;
  // the members' face search can miss a member whose selfies use beauty filters: compare with their own card photo too (≥ 70 % = them)
  if (matches && !matches.some((m) => m.user.toLowerCase() === uid.toLowerCase() && m.sim >= 80)) {
    try {
      const r = await fetch(`${SUPA}/rest/v1/kr8_members?select=photo&user_id=eq.${encodeURIComponent(uid)}`, { headers: SRH });
      const card = await photoB64(((await r.json()) as { photo?: string | null }[])?.[0]?.photo);
      if (card) {
        const c = await rk<{ FaceMatches?: { Similarity?: number }[] }>('CompareFaces', { SourceImage: img(b64), TargetImage: img(card), SimilarityThreshold: 0, QualityFilter: 'NONE' });
        const sim = Math.max(0, ...(c.FaceMatches || []).map((m) => m.Similarity ?? 0));
        if (sim >= 70) matches = [...matches, { user: uid, sim: 99 }];
        if (dbg) log({ dphoto_card_sim: Math.round(sim) });
      }
    } catch (e) { log({ dphoto_card_error: String(e).slice(0, 160) }); }
  }
  const v = dailyPhotoVerdict(uid, lb.Labels || [], faces, words, matches);
  if (dbg) log({ dphoto_dbg: v, labels: (lb.Labels || []).slice(0, 12).map((l) => `${l.Name}:${Math.round(l.Confidence ?? 0)}:${(l.Instances || []).length}`), faces: faces.length, words });
  return v;
}
async function dailyPhotoCheck(uid: string, body: Record<string, unknown>): Promise<Response> {
  const b64 = frameB64(body.image);
  if (!b64 || typeof body.image !== 'string') return json({ verdict: 'error', why: 'bad_image' });
  const sha = await sha256Hex(body.image);
  const pass = (v: 'dok' | 'dun') => rpc('kr8_photo_pass_add', { p_user: uid, p_sha: sha, p_verdict: v }).catch((e) => log({ dpass_error: String(e).slice(0, 200) }));
  if (MOCK) { const v = typeof body.mock === 'string' ? body.mock : 'ok'; if (v === 'ok') await pass('dok'); return json({ verdict: v }); }
  let v: DailyV;
  try { v = await dailyPhotoEval(uid, b64); }
  catch (e) { log({ dphoto_aws_error: String(e).slice(0, 200) }); await pass('dun'); return json({ verdict: 'ok', checked: false }); }
  if (v === 'ok') await pass('dok');
  log({ dphoto_verdict: v });
  return json({ verdict: v });
}
// ───────── 0168 (20 Nov): "same phone" links settled by the robot, never a card for the founder ─────────
// Compare the two card photos (AWS CompareFaces). < 80% different people → dismissed; >= 95% same person → second-account
// rule (newer account: all-prizes ban + one polite warning); no clear face / in between → a quiet flag only.
async function deviceLinks(limit: number): Promise<Record<string, unknown>> {
  const todo = await rpc<{ a: string; b: string; photo_a: string | null; photo_b: string | null }[]>('kr8_device_links_todo', { p_limit: limit });
  const out: Record<string, number> = {};
  for (const t of todo || []) {
    let sim: number | null = null; let note = '';
    const [A, B] = await Promise.all([photoB64(t.photo_a), photoB64(t.photo_b)]);
    if (!A || !B) note = 'card photo missing';
    else {
      try {
        const r = await rk<{ FaceMatches?: { Similarity?: number }[]; UnmatchedFaces?: unknown[]; SourceImageFace?: unknown }>('CompareFaces',
          { SourceImage: img(A), TargetImage: img(B), SimilarityThreshold: 0, QualityFilter: 'NONE' });
        const best = Math.max(0, ...(r.FaceMatches || []).map((m) => m.Similarity ?? 0));
        sim = (r.FaceMatches?.length || r.UnmatchedFaces?.length) ? Math.round(best * 10) / 10 : null;
        if (sim == null) note = 'no clear face';
      } catch (e) {
        if (e instanceof AwsError && /InvalidParameter|InvalidImageFormat|ImageTooLarge/.test(e.type)) note = 'no clear face';
        else { log({ device_links_error: String(e).slice(0, 200) }); continue; }   // AWS down: try again next run
      }
    }
    const v = await rpc<string>('kr8_device_link_settle', { p_a: t.a, p_b: t.b, p_sim: sim, p_note: note || null });
    out[v] = (out[v] || 0) + 1;
  }
  return { checked: (todo || []).length, ...out };
}

// ───────── 0187: traveller-tag pre-checks ─────────
// One run per request (claimed in kr8_traveller_check_todo). Only the outcome is saved: never the MRZ text, number or names.
// Rekognition DetectText reads at most 100 words per call, so on a busy passport page the MRZ at the bottom is often cut off.
// Read the whole picture first, then the bottom band (where the MRZ sits), then the left / right edges (a sideways photo);
// stop as soon as an MRZ is found: 1–4 calls (≈ US$0.001 each). Textract (better OCR) only when TRAVELLER_TEXTRACT=1 and the
// AWS user has textract:DetectDocumentText (it does not on 21 Nov).
const OCR_REGIONS: (Record<string, number> | null)[] = [null, { Left: 0, Top: 0.55, Width: 1, Height: 0.45 },
  { Left: 0, Top: 0, Width: 0.4, Height: 1 }, { Left: 0.6, Top: 0, Width: 0.4, Height: 1 }];
async function readMrz(b64: string): Promise<{ mrz: ReturnType<typeof findMrz>; ocr: 'textract' | 'rekognition'; calls: number }> {
  let calls = 0;
  if (Deno.env.get('TRAVELLER_TEXTRACT') === '1') {
    try {
      calls++;
      const r = await tx<{ Blocks?: { BlockType?: string; Text?: string }[] }>('DetectDocumentText', { Document: { Bytes: b64 } });
      const mrz = findMrz((r.Blocks || []).filter((b) => b.BlockType === 'LINE' && b.Text).map((b) => b.Text as string));
      if (mrz) return { mrz, ocr: 'textract', calls };
    } catch (e) { log({ traveller_textract: e instanceof AwsError ? e.type : String(e).slice(0, 120) }); }
  }
  for (const roi of OCR_REGIONS) {
    calls++;
    const r = await rk<{ TextDetections?: { Type?: string; DetectedText?: string }[] }>('DetectText',
      { Image: img(b64), ...(roi ? { Filters: { RegionsOfInterest: [{ BoundingBox: roi }] } } : {}) });
    const mrz = findMrz((r.TextDetections || []).filter((d) => d.Type === 'LINE' && d.DetectedText).map((d) => d.DetectedText as string));
    if (mrz) return { mrz, ocr: 'rekognition', calls };
  }
  return { mrz: null, ocr: 'rekognition', calls };
}
export async function travellerScan(limit: number): Promise<{ checked: number; results: Record<string, number> }> {
  const todo = await rpc<{ request_id: string; user_id: string; passport_path: string; first_name: string | null; photo: string | null; selfie_path: string | null }[]>(
    'kr8_traveller_check_todo', { p_limit: limit });
  const results: Record<string, number> = {};
  for (const t of todo || []) {
    const errors: string[] = []; let calls = 0;
    const res: Record<string, unknown> = { mrz_found: null, face_result: 'skipped', name_result: 'unknown' };
    try {
      const pass = await download(t.passport_path, 'kr8-passport');
      if (!pass) { errors.push('passport_missing'); throw new Error('passport file missing'); }
      let mrz: ReturnType<typeof findMrz> = null;
      try { const o = await readMrz(pass); calls += o.calls; res.ocr = o.ocr; mrz = o.mrz; }
      catch (e) { errors.push('ocr'); log({ traveller_ocr_error: String(e).slice(0, 160) }); }
      res.mrz_found = errors.includes('ocr') ? null : !!mrz;
      let face: FaceResult = 'skipped'; let name: NameResult = 'unknown';
      if (mrz) {
        res.mrz_valid = mrz.valid; res.issuing = mrz.issuing; res.nationality = mrz.nationality;
        res.is_thai = mrz.issuing === 'THA' || mrz.nationality === 'THA';
        name = nameMatch(t.first_name, mrz.surname, mrz.given);
        // the face: the member's face-check selfie (kept ~30 days) or else the card photo (which the face check matched)
        let ref: string | null = null;
        if (t.selfie_path) { ref = await download(t.selfie_path); if (ref) res.face_ref = 'selfie'; }
        if (!ref) { ref = await photoB64(t.photo); if (ref) res.face_ref = 'card'; }
        if (!ref) { res.face_ref = 'none'; face = 'no_reference'; }
        else {
          try {
            calls++;
            const f = faceOf(await rk<unknown>('CompareFaces', { SourceImage: img(ref), TargetImage: img(pass), SimilarityThreshold: 0, QualityFilter: 'NONE' }));
            face = f.result; res.face_sim = f.sim;
          } catch (e) {
            if (e instanceof AwsError && /InvalidParameter/.test(e.type)) face = 'no_reference';   // no face found in the reference photo
            else { face = 'error'; errors.push('face'); log({ traveller_face_error: String(e).slice(0, 160) }); }
          }
        }
      }
      res.face_result = face; res.name_result = name;
      const v = verdict({ mrz: !!mrz, thai: !!res.is_thai, face, name, errors });
      res.suggestion = v.suggestion; res.fail_code = v.fail_code;
    } catch (e) {
      if (!errors.length) errors.push('server');
      log({ traveller_scan_error: String(e).slice(0, 200), request: t.request_id });
      // passport gone: nothing to retry; anything else (AWS down) is retried once by the 5-min job
      if (errors.includes('passport_missing')) { res.suggestion = 'check'; }
    }
    res.errors = errors; res.aws_calls = calls;
    try { await rpc('kr8_traveller_check_record', { p_request: t.request_id, p_res: res }); }
    catch (e) { log({ traveller_record_error: String(e).slice(0, 200) }); }
    const k = String(res.suggestion ?? 'error');
    results[k] = (results[k] || 0) + 1;
  }
  log({ traveller_scan: (todo || []).length, results });
  return { checked: (todo || []).length, results };
}

// ───────── admin actions ─────────
async function admin(jwt: string, body: Record<string, unknown>, robot = false): Promise<Response> {
  // 19 Nov fix2: the canary (service key) runs backfill every hour, so faces the team approves by hand get into AWS too
  const ok = robot ? (body.action === 'backfill' || body.action === 'sweep' || body.action === 'reel_copy_scan' || body.action === 'quality_scan' || body.action === 'device_links' || body.action === 'traveller_scan') : await rpc<boolean>('kr8_is_admin', {}, jwt).catch(() => false);
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
      try { await noteLookalikes(t.user_id, await search(b64).catch(() => null)); if (await indexFace(t.user_id, b64, 'card', null)) done++; else skipped++; }
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
  if (body.action === 'traveller_scan') return json(await travellerScan(Math.min(Number(body.limit) || 5, 10)));
  if (body.action === 'device_links') return json(await deviceLinks(Math.min(Number(body.limit) || 10, 25)));
  if (body.action === 'reel_copy_scan') return json(await reelCopyScan(Math.min(Number(body.limit) || 10, 20)));
  if (body.action === 'quality_scan') return json(await qualityScan(Math.min(Number(body.reels) || 6, 12), Math.min(Number(body.people) || 8, 20), body.post ? String(body.post) : null));
  return json({ error: 'BAD_ACTION' }, 400);
}

// ───────── 0148: copied-Reel check ─────────
// Deno cannot run ffmpeg, so the frames come from the phone: the poster it already makes + two small scan frames
// (<video>.s1.jpg middle, .s2.jpg end, see v5Reel scanFrames; older app versions: poster only). One DetectText per frame.
export async function reelCopyScan(limit: number): Promise<{ scanned: number; copied: number }> {
  if (MOCK) mockCase = 'tiktok';
  const todo = await rpc<{ id: string; video_path: string | null; poster_path: string | null }[]>('kr8_reel_copy_todo', { p_limit: limit });
  let scanned = 0, copied = 0;
  for (const t of todo || []) {
    const frames: [string, string][] = [];
    if (t.poster_path) frames.push(['poster', t.poster_path]);
    if (t.video_path) scanFramePaths(t.video_path).forEach((p, i) => frames.push([i === 0 ? 'middle' : 'end', p]));
    const hits: CopyHit[] = [];
    let read = 0;
    for (const [at, path] of frames) {
      const b64 = MOCK ? '/9j/mock' : await download(path, REELS);
      if (!b64) continue;
      read++;
      try { hits.push(...copyHits((await rk<{ TextDetections?: TextDet[] }>('DetectText', { Image: img(b64) })).TextDetections, at)); }
      catch (e) { log({ copy_scan_error: String(e).slice(0, 200), post: t.id }); }
    }
    const s = copySummary(hits);
    await rpc('kr8_reel_copy_record', { p_post: t.id, p_copied: s.copied, p_kind: s.kind, p_watermark: s.watermark, p_app: s.app, p_evidence: hits.slice(0, 20), p_frames: read });
    scanned++;
    if (s.copied) copied++;
  }
  log({ reel_copy_scan: scanned, copied });
  return { scanned, copied };
}

// ───────── 0150: Feed quality autopilot ─────────
// Every 5 min (pg_cron, robot key) or from the admin: new / changed Reels and profile photos → AWS features → the database scores
// them (kr8_reel_quality_record / kr8_people_quality_record). Reels: poster + the 2 scan frames (<video>.s1.jpg / .s2.jpg).
// The bot ranks and SUGGESTS (Feed / Profile only / Not yet); it never hides or approves a Reel: the founder decides.
async function pictureFeatures(at: string, b64: string): Promise<FrameF> {
  const [lb, fc, tx] = await Promise.all([
    rk<LabelsResp>('DetectLabels', { Image: img(b64), Features: ['GENERAL_LABELS', 'IMAGE_PROPERTIES'], MaxLabels: 30, MinConfidence: 55 }).catch((e) => { log({ q_labels: String(e).slice(0, 160) }); return null; }),
    rk<FacesResp>('DetectFaces', { Image: img(b64), Attributes: ['DEFAULT', 'AGE_RANGE'] }).catch((e) => { log({ q_faces: String(e).slice(0, 160) }); return null; }),
    rk<TextResp>('DetectText', { Image: img(b64) }).catch((e) => { log({ q_text: String(e).slice(0, 160) }); return null; }),
  ]);
  if (!lb && !fc && !tx) throw new Error('AWS gave no answer');
  return frameFeatures(at, lb, fc, tx);
}
/** 0165: picture fingerprint of one JPEG frame (reelprint.ts dHash) */
function frameHash(b64: string): string {
  const d = jpeg.decode(b64ToBytes(b64), { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return dhashRGBA(d.data, d.width, d.height);
}
/** 0165: members' faces AWS found in one frame → [{user, sim}] */
function faceHits(resp: unknown): FaceHit[] {
  return ((resp as { FaceMatches?: { Similarity?: number; Face?: { ExternalImageId?: string } }[] } | null)?.FaceMatches || [])
    .filter((m) => m?.Face?.ExternalImageId && typeof m.Similarity === 'number')
    .map((m) => ({ user: m.Face!.ExternalImageId as string, sim: Math.round((m.Similarity as number) * 10) / 10 }));
}
export async function qualityScan(nReels: number, nPeople: number, only: string | null): Promise<{ reels: number; people: number; errors: number; last_error?: string }> {
  const todo = await rpc<{ reels: { id: string; video_path: string | null; poster_path: string | null }[]; people: { user_id: string; photo: string | null; md5: string }[] }>(
    'kr8_quality_todo', { p_reels: nReels, p_people: nPeople, p_post: only });
  let reels = 0, people = 0, errors = 0, lastErr = '';
  const err = (e: unknown) => { errors++; lastErr = String(e).slice(0, 240); };
  for (const t of todo?.reels || []) {
    const paths: [string, string][] = [];
    if (t.poster_path) paths.push(['poster', t.poster_path]);
    if (t.video_path) scanFramePaths(t.video_path).forEach((p, i) => paths.push([i === 0 ? 'middle' : 'end', p]));
    const frames: FrameF[] = []; const hits: CopyHit[] = [];
    const prints: { at: string; h: string }[] = []; const faceFrames: { at: string; hits: FaceHit[] }[] = [];   // 0165
    for (const [at, path] of paths) {
      const b64 = await download(path, REELS);
      if (!b64) continue;
      try {
        const f = await pictureFeatures(at, b64);
        frames.push(f);
        hits.push(...copyHits(f.text.map((x) => ({ DetectedText: x, Type: 'LINE', Confidence: 99 }) as TextDet), at));
        // 0165: someone else's face in it? (only a big, clear face is searched in the members' faces)
        if (f.faces.some((x) => x.conf >= 95 && x.a >= 0.02)) faceFrames.push({ at, hits: faceHits(await search(b64).catch(() => null)) });
      } catch (e) { err(e); log({ q_reel_error: String(e).slice(0, 200), post: t.id }); }
      try { prints.push({ at, h: frameHash(b64) }); } catch (e) { log({ q_print_error: String(e).slice(0, 160), post: t.id }); }
    }
    // 0165: same clip as another member's video / another member's face → kr8_reel_reuse (a "looks copied" reason; never hides)
    const author = (t.video_path || '').split('/')[0];
    try { await rpc('kr8_reel_reuse_check', { p_post: t.id, p_prints: prints, p_face: author ? otherMemberInReel(author, faceFrames) : null }); }
    catch (e) { log({ q_reuse_error: String(e).slice(0, 200), post: t.id }); }
    const s = copySummary(hits);
    try {
      await rpc('kr8_reel_quality_record', { p_post: t.id, p_features: { frames, v: 1 }, p_copy: { ...s, evidence: hits.slice(0, 20) } });
      reels++;
    } catch (e) { err(e); log({ q_record_error: String(e).slice(0, 200), post: t.id }); }
  }
  for (const m of todo?.people || []) {
    let b64 = dataUrlB64(m.photo);
    if (!b64 && /^https:\/\//.test(m.photo || '')) {
      const r = await fetch(m.photo as string).catch(() => null);
      if (r && r.ok) b64 = bytesToB64(new Uint8Array(await r.arrayBuffer()));
    }
    let f: FrameF | null = null;
    if (b64 && b64.length <= MAX_B64 * 4) {
      try { f = await pictureFeatures('photo', b64); } catch (e) { err(e); log({ q_photo_error: String(e).slice(0, 200), user: m.user_id }); }
    }
    try { await rpc('kr8_people_quality_record', { p_user: m.user_id, p_md5: m.md5, p_features: f ? { photo: f, v: 1 } : { none: true, v: 1 } }); people++; }
    catch (e) { err(e); log({ q_precord_error: String(e).slice(0, 200), user: m.user_id }); }
  }
  log({ quality_scan: { reels, people, errors, lastErr } });
  return { reels, people, errors, ...(lastErr ? { last_error: lastErr } : {}) };
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
    if (b.action === 'daily_photo_eval' && typeof b.user === 'string' && typeof b.image === 'string') {
      const x = frameB64(b.image); if (!x) return json({ verdict: 'error' });
      try { return json({ verdict: await dailyPhotoEval(b.user, x, true) }); } catch (e) { return json({ verdict: 'error', why: String(e).slice(0, 120) }); }
    }
    try { return await admin('', b, true); } catch (e) { log({ robot_error: String(e).slice(0, 300) }); return json({ error: 'SERVER' }, 500); }
  }
  const who = await userOf(req);
  if (!who) return json({ error: 'SIGN_IN' }, 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
  try {
    if (body.action === 'photo') return await photoCheck(who.id, body);
    if (body.action === 'daily_photo') return await dailyPhotoCheck(who.id, body);
    return typeof body.action === 'string' ? await admin(who.jwt, body) : await check(who.id, body);
  } catch (e) {
    if (e instanceof DbError && STATUS[e.code]) return json({ error: e.code }, STATUS[e.code]);
    log({ error: String(e).slice(0, 400) });
    return json({ error: e instanceof DbError ? e.code : 'SERVER' }, 500);
  }
});
