// kringapp.com/api/push : sends the waiting phone dings (Web Push with VAPID). Poked by the database (migration 0059, pg_net)
// whenever a ding is queued; each call sends one small batch and the database pokes again if more are waiting.
//
// Env (Cloudflare Pages → Settings → Environment variables, Production; mark the secret ones "Encrypt"):
//   PUSH_HOOK_SECRET           shared with the Supabase vault secret 'push_hook_secret' (the database sends it as x-push-secret)
//   SUPABASE_SERVICE_ROLE_KEY  reads the queue (kr8_push_claim / kr8_push_done are service-role only)
//   VAPID_PUBLIC               the public key (same as the app's VITE_VAPID_PUBLIC)
//   VAPID_PRIVATE              the private key (never in any repo)
//   VAPID_SUBJECT              optional, default mailto:ops@kringapp.com
//   SUPABASE_URL               optional, default the Kring project
//   PUSH_BATCH                 optional, pushes per call (default 10; keep low on the Workers free plan's CPU limit)
//   LINE_CHANNEL_ACCESS_TOKEN  optional: the Kring OA's Messaging API token, for LINE dings (members with LINE and no app dings)
import { sameSecret, sbHeaders, sendLine, sendPush } from '../_lib/push-core.js';

const SUPA_DEFAULT = 'https://pedxoxpammnyfnizljyj.supabase.co';
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });


async function sbRpc(env, fn, args, f) {
  const r = await f(`${(env.SUPABASE_URL || SUPA_DEFAULT).replace(/\/$/, '')}/rest/v1/rpc/${fn}`, { method: 'POST', headers: sbHeaders(env.SUPABASE_SERVICE_ROLE_KEY), body: JSON.stringify(args) });
  if (!r.ok) throw new Error(`${fn} ${r.status}`);
  return r.json();
}

/** One drain round: claim → send → report. Exported for tests (fetch and extra test origins can be passed in). */
export async function drain(env, opts = {}) {
  const f = opts.fetch || fetch;
  const vapid = { publicKey: env.VAPID_PUBLIC, privateKey: env.VAPID_PRIVATE, subject: env.VAPID_SUBJECT || 'mailto:ops@kringapp.com' };
  const batch = Math.max(1, Math.min(Number(env.PUSH_BATCH) || 10, 40));
  const rows = (await sbRpc(env, 'kr8_push_claim', { p_limit: batch }, opts.supaFetch || f)) || [];
  const results = await Promise.all(rows.map(async (row) => ({ id: row.id, ...(row.channel === 'line'
    ? await sendLine(row, env.LINE_CHANNEL_ACCESS_TOKEN, { fetch: opts.lineFetch || f })
    : await sendPush(row, vapid, { fetch: f, extraOrigins: opts.extraOrigins })) })));
  let more = false;
  if (results.length) more = !!(await sbRpc(env, 'kr8_push_done', { p_results: results }, opts.supaFetch || f))?.more;
  const n = (k) => results.filter((x) => x.result === k).length;
  return { claimed: rows.length, sent: n('sent'), gone: n('gone'), retry: n('retry'), failed: n('failed'), notfriend: n('notfriend'), more };
}

export async function onRequest({ request, env }) {
  if (request.method !== 'POST') return json({ error: 'method' }, 405);
  if (!env.PUSH_HOOK_SECRET || !sameSecret(request.headers.get('x-push-secret'), env.PUSH_HOOK_SECRET)) return json({ error: 'forbidden' }, 403);
  if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return json({ error: 'not configured' }, 503);
  try {
    return json(await drain(env));
  } catch (e) {
    return json({ error: String((e && e.message) || e).slice(0, 120) }, 502);
  }
}
