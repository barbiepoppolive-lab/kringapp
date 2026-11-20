// kr8-ask-photo (20 Nov, Ask BKK rich replies): checks a photo / GIF on an answer or reply BEFORE anyone else sees it.
// POST { answer } with the member's Supabase JWT (deploy WITH JWT verification). Only the answer's author can ask.
// AWS Rekognition (same keys / region as face-check-aws): DetectModerationLabels + DetectFaces(AGE_RANGE) + DetectText.
// GIFs: three frames (first, middle, last) are checked. Verdict → kr8_ask_media_record (0185): 'ok' shows it to everyone,
// anything else keeps it hidden ('refused'). If AWS can't answer, it stays 'pending' (hidden) and the app asks again later.
import { signV4 } from '../face-check-aws/sigv4.ts';
import { askPhotoVerdict, type AgeFace, type ModLabel } from './rules.ts';
import jpeg from 'npm:jpeg-js@0.4.4';
import { GifReader } from 'npm:omggif@1.0.10';

const SUPA = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '');
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const REGION = Deno.env.get('AWS_REGION') || 'ap-southeast-2';
const AK = Deno.env.get('AWS_ACCESS_KEY_ID') ?? '';
const SK = Deno.env.get('AWS_SECRET_ACCESS_KEY') ?? '';
const TOKEN = Deno.env.get('AWS_SESSION_TOKEN') || undefined;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const SRH = { apikey: SR, Authorization: `Bearer ${SR}`, 'Content-Type': 'application/json' };
const log = (o: Record<string, unknown>) => console.log(JSON.stringify(o));

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: SRH, body: JSON.stringify(args) });
  const t = await r.text();
  if (!r.ok) throw new Error(`${fn} ${r.status} ${t.slice(0, 200)}`);
  return (t ? JSON.parse(t) : null) as T;
}
async function rk<T>(target: string, payload: Record<string, unknown>): Promise<T> {
  if (!AK || !SK) throw new Error('NoKeys');
  const url = `https://rekognition.${REGION}.amazonaws.com/`;
  const body = JSON.stringify(payload);
  const headers = await signV4({ method: 'POST', url, body, region: REGION, service: 'rekognition', accessKeyId: AK, secretAccessKey: SK, sessionToken: TOKEN,
    headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `RekognitionService.${target}` } });
  const r = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(9000) });
  const j = await r.json().catch(() => ({})) as Record<string, unknown>;
  if (!r.ok) throw new Error(String(j.__type || `HTTP_${r.status}`));
  return j as T;
}
const b64 = (a: Uint8Array) => { let s = ''; for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, Array.from(a.subarray(i, i + 0x8000))); return btoa(s); };

function gifFrames(bytes: Uint8Array): Uint8Array[] {
  const g = new GifReader(bytes);
  const n = g.numFrames(), W = g.width, H = g.height;
  const pick = [...new Set([0, Math.floor(n / 2), n - 1])].filter((i) => i >= 0 && i < n);
  const canvas = new Uint8Array(W * H * 4);
  const out: Uint8Array[] = [];
  for (let i = 0; i < n && out.length < pick.length; i++) {
    g.decodeAndBlitFrameRGBA(i, canvas);   // frames build on each other
    if (pick.includes(i)) out.push(new Uint8Array(jpeg.encode({ data: canvas, width: W, height: H }, 85).data));
  }
  return out;
}

async function check(bytes: Uint8Array): Promise<'ok' | 'child' | 'nudity' | 'copied'> {
  const B = b64(bytes);
  const [m, f, t] = await Promise.all([
    rk<{ ModerationLabels?: ModLabel[] }>('DetectModerationLabels', { Image: { Bytes: B }, MinConfidence: 50 }),
    rk<{ FaceDetails?: AgeFace[] }>('DetectFaces', { Image: { Bytes: B }, Attributes: ['DEFAULT', 'AGE_RANGE'] }),
    rk<{ TextDetections?: { DetectedText?: string; Type?: string; Confidence?: number }[] }>('DetectText', { Image: { Bytes: B } }).catch(() => null),
  ]);
  return askPhotoVerdict(m.ModerationLabels, f.FaceDetails, t?.TextDetections);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'METHOD' }, 405);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const u = jwt && jwt !== ANON ? await fetch(`${SUPA}/auth/v1/user`, { headers: { apikey: ANON, Authorization: `Bearer ${jwt}` } }).then((r) => (r.ok ? r.json() : null)).catch(() => null) : null;
  if (!u?.id) return json({ error: 'SIGN_IN' }, 401);
  let body: { answer?: string };
  try { body = await req.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
  const id = String(body.answer || '');
  if (!/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'BAD_BODY' }, 400);
  try {
    const todo = await rpc<{ author: string; path: string | null; kind: string | null; check: string } | null>('kr8_ask_media_todo', { p_answer: id });
    if (!todo || todo.author !== u.id || !todo.path) return json({ error: 'NOT_FOUND' }, 404);
    if (todo.check !== 'pending') return json({ check: todo.check });
    const r = await fetch(`${SUPA}/storage/v1/object/kr8-ask/${todo.path}`, { headers: { apikey: SR, Authorization: `Bearer ${SR}` } });
    if (!r.ok) return json({ check: 'pending' });
    const raw = new Uint8Array(await r.arrayBuffer());
    let verdict: 'ok' | 'child' | 'nudity' | 'copied' = 'ok';
    const frames = todo.kind === 'gif' ? gifFrames(raw) : [raw];
    if (!frames.length) verdict = 'nudity';
    for (const fr of frames) { const v = await check(fr); if (v !== 'ok') { verdict = v; break; } }
    const now = await rpc<string>('kr8_ask_media_record', { p_answer: id, p_ok: verdict === 'ok', p_why: verdict === 'ok' ? null : verdict });
    log({ ask_photo: verdict });
    return json({ check: now, why: verdict === 'ok' ? null : verdict });
  } catch (e) {
    log({ ask_photo_error: String(e).slice(0, 200) });
    return json({ check: 'pending' });
  }
});
