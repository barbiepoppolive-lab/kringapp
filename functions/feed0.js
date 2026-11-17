// kringapp.com/feed0 : the visitor feed with its Reel links already signed, from the Cloudflare edge (16 Nov, start-up speed).
//
// Why: a phone opening Kring used to (1) download the app code, (2) load the Supabase library, (3) ask Supabase for the feed,
// (4) ask Supabase again to sign every Reel link, and only then (5) fetch the first poster. On 4G in India that was 3-4 s of
// black. Here one request to our own domain (no extra DNS or TLS to supabase.co) returns the feed AND the signed links, and
// index.html asks for it the moment the page starts, so the first poster can be on screen before the app code has even run.
//
// Same data and the same rules as before: the visitor (signed-out) feed from kr8_feed, signed with the public publishable key,
// exactly what the app did in the browser. Shared by all visitors, so it is kept at the edge for 60 s (served up to 10 min
// stale while a fresh copy is fetched; signed links last 60 min). A signed-in member still gets their own feed from the app.
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
const KEY = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';   // the public publishable key (the same one inside every app page), not a secret
const FRESH_S = 60, STALE_S = 600, SIGN_S = 3600;
const OK_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov|jpg|jpeg|webp)$/;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json' };

// 0085 (17 Nov): visitors get the ranked order (kr8_feed_ranked) like members; one seed per Bangkok day, so every visitor in
// the 60-s cache window shares one stable order. If the ranked call is missing or fails, the old newest-first kr8_feed.
const bkkDay = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
async function feedRows() {
  const rr = await fetch(`${SUPA}/rest/v1/rpc/kr8_feed_ranked`, { method: 'POST', headers: H,
    body: JSON.stringify({ p_area: null, p_limit: 60, p_offset: 0, p_seed: 'feed0:' + bkkDay() }) }).catch(() => null);
  if (rr && rr.ok) return rr.json();
  const fr = await fetch(`${SUPA}/rest/v1/rpc/kr8_feed`, { method: 'POST', headers: H, body: JSON.stringify({ p_area: null, p_limit: 60 }) });
  if (!fr.ok) throw new Error('feed ' + fr.status);
  return fr.json();
}

async function build() {
  const rows = await feedRows();
  const paths = [...new Set((rows || []).flatMap((r) => (r.kind === 'reel' ? [r.video_path, r.poster_path] : [])).filter((p) => p && OK_PATH.test(p)))];
  const signed = {};
  if (paths.length) {
    const sr = await fetch(`${SUPA}/storage/v1/object/sign/kr8-reels`, { method: 'POST', headers: H, body: JSON.stringify({ expiresIn: SIGN_S, paths }) });
    if (sr.ok) {
      for (const s of (await sr.json()) || []) {
        const tok = s && s.signedURL && !s.error ? new URL(s.signedURL, SUPA).searchParams.get('token') : null;
        if (tok && OK_PATH.test(s.path)) signed[s.path] = `/media/kr8-reels/${s.path}?t=${encodeURIComponent(tok)}`;
      }
    }
  }
  return JSON.stringify({ at: Date.now(), ttl: SIGN_S, rows, signed });
}

const out = (body, state) => new Response(body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Kring-Cache': state, 'X-Content-Type-Options': 'nosniff' } });

export async function onRequestGet({ request, waitUntil }) {
  const cache = caches.default;
  const key = new Request(new URL('/__feed0/v2', request.url).toString());
  const refresh = async () => {
    const body = await build();
    await cache.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${STALE_S}`, 'X-At': String(Date.now()) } }));
    return body;
  };
  const hit = await cache.match(key);
  if (hit) {
    const age = (Date.now() - Number(hit.headers.get('X-At') || 0)) / 1000;
    if (age < FRESH_S) return out(hit.body, 'HIT');
    if (age < STALE_S) { waitUntil(refresh().catch(() => {})); return out(hit.body, 'STALE'); }
  }
  try { return out(await refresh(), 'MISS'); }
  catch { return new Response('null', { status: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }); }
}
