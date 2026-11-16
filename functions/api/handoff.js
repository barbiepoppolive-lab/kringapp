// kringapp.com/api/handoff : the second half of leaving an in-app browser signed in (migration 0059).
// The app, signed in inside LINE / Instagram / Facebook / TikTok, gets a one-time code (kr8_handoff_create: 3 minutes, one
// use, only its hash stored) and opens the same page in Chrome / Safari with ?ho=<code>. There the page POSTs the code here;
// we swap it (kr8_handoff_take, service role) for the member's email and make a one-time sign-in hash (Supabase admin
// generate_link, sends no email). The page turns the hash into a session with verifyOtp, like the LINE sign-in does.
// Env: SUPABASE_SERVICE_ROLE_KEY (same as /api/push), optional SUPABASE_URL.
import { sbHeaders } from '../_lib/push-core.js';

const SUPA_DEFAULT = 'https://pedxoxpammnyfnizljyj.supabase.co';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function handoff(code, env, f = fetch) {
  if (!/^[0-9a-f]{64}$/.test(String(code || ''))) return { status: 400, body: { error: 'CODE' } };
  const base = (env.SUPABASE_URL || SUPA_DEFAULT).replace(/\/$/, '');
  const h = sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY);
  const t = await f(`${base}/rest/v1/rpc/kr8_handoff_take`, { method: 'POST', headers: h, body: JSON.stringify({ p_code: code }) });
  if (!t.ok) return { status: 502, body: { error: 'DB' } };
  const who = await t.json().catch(() => null);
  if (!who || !who.email) return { status: 410, body: { error: 'EXPIRED' } };   // used, expired or unknown: sign in as usual
  const g = await f(`${base}/auth/v1/admin/generate_link`, { method: 'POST', headers: h, body: JSON.stringify({ type: 'magiclink', email: who.email }) });
  const j = g.ok ? await g.json().catch(() => null) : null;
  const hash = j && (j.hashed_token || (j.properties && j.properties.hashed_token));
  if (!hash) return { status: 502, body: { error: 'AUTH' } };
  return { status: 200, body: { token_hash: hash } };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.SUPABASE_SERVICE_ROLE_KEY) return json({ error: 'not configured' }, 503);
  const origin = request.headers.get('origin');
  if (origin && !/^https:\/\/(www\.)?kringapp\.com$/.test(origin)) return json({ error: 'origin' }, 403);
  const body = await request.json().catch(() => null);
  try {
    const r = await handoff(body && body.code, env);
    return json(r.body, r.status);
  } catch {
    return json({ error: 'failed' }, 502);
  }
}
