// kringapp.com/media/kr8-reels/<user>/<file>?t=<token> : Reel videos and posters through Cloudflare's cache (16 Nov).
//
// Why: the app played Reels straight from Supabase storage with signed links. Those responses carry no cache header and the
// token changes, so every view downloaded the whole file again from Supabase. Here the file is cached at the Cloudflare edge
// by its PATH (the file never changes: a new upload always gets a new name), and phones get Cache-Control: immutable.
//
// Who may see a file is still decided by Supabase: every request must carry the signed-link token the app received from
// Supabase for this viewer (pending or hidden Reels are never signed for other people). The token is checked once with
// Supabase (a 1-byte request) and that "yes" is remembered at the edge until the token expires; the bytes then come from
// the edge cache. Range requests (seeking, Safari) are answered from the cache too.
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
const OK_PATH = /^kr8-reels\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov|jpg|jpeg|webp)$/;
const TYPES = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp' };
const YEAR = 'public, max-age=31536000, immutable';

const deny = (status) => new Response(null, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });

function tokenExp(t) {
  try {
    const p = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof p.exp === 'number' ? p.exp : 0;
  } catch { return 0; }
}

export async function onRequest({ request, params, waitUntil }) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405);
  const url = new URL(request.url);
  const path = (Array.isArray(params.path) ? params.path : [params.path]).map((s) => decodeURIComponent(s)).join('/');
  if (!OK_PATH.test(path)) return deny(404);
  const token = url.searchParams.get('t') || '';
  if (!/^[A-Za-z0-9._-]{20,2000}$/.test(token)) return deny(403);
  const now = Math.floor(Date.now() / 1000);
  const exp = tokenExp(token);
  if (!exp || exp <= now) return deny(403);

  const cache = caches.default;
  const signed = `${SUPA}/storage/v1/object/sign/${path}?token=${encodeURIComponent(token)}`;

  // 1. Is this token good for this file? (asked once per token, remembered until it expires)
  const okKey = new Request(`${url.origin}/__media_ok/${path}/${token.slice(-48)}`);
  if (!(await cache.match(okKey))) {
    const r = await fetch(signed, { headers: { Range: 'bytes=0-0' } });
    if (r.status !== 200 && r.status !== 206) return deny(r.status === 400 || r.status === 404 ? 404 : 403);
    try { await r.body?.cancel(); } catch { /* ignore */ }
    waitUntil(cache.put(okKey, new Response('1', { headers: { 'Cache-Control': `public, max-age=${Math.max(60, exp - now - 30)}` } })));
  }

  // 2. The bytes: from the edge cache by path (Range is answered from the cached copy), else fetched once and stored.
  const objUrl = `${url.origin}/__media/${path}`;
  const range = request.headers.get('range');
  const hit = await cache.match(new Request(objUrl, { headers: range ? { Range: range } : {} }));
  if (hit) {
    const h = new Headers(hit.headers);
    h.set('Cache-Control', YEAR); h.set('Accept-Ranges', 'bytes'); h.set('X-Kring-Cache', 'HIT');
    return new Response(request.method === 'HEAD' ? null : hit.body, { status: hit.status, headers: h });
  }
  const ext = path.split('.').pop().toLowerCase();
  if (range) {
    // a seek / partial read before the file is in the edge cache: pass the range through (206), and fill the cache in the background
    const part = await fetch(signed, { headers: { Range: range } });
    if (part.status !== 206 && part.status !== 200) return deny(part.status === 404 || part.status === 400 ? 404 : 502);
    if (/^bytes=0-/.test(range)) waitUntil((async () => {   // only the first read of a file fills the cache (not every seek)
      try {
        const f = await fetch(signed);
        if (!f.ok) return;
        const hh = new Headers({ 'Content-Type': f.headers.get('content-type') || TYPES[ext] || 'application/octet-stream', 'Cache-Control': YEAR, 'Accept-Ranges': 'bytes' });
        const l = f.headers.get('content-length'); if (l) hh.set('Content-Length', l);
        await cache.put(new Request(objUrl), new Response(f.body, { status: 200, headers: hh }));
      } catch { /* next viewer fills it */ }
    })());
    const ph = new Headers();
    for (const k of ['content-type', 'content-length', 'content-range']) { const v = part.headers.get(k); if (v) ph.set(k, v); }
    ph.set('Cache-Control', YEAR); ph.set('Accept-Ranges', 'bytes'); ph.set('X-Kring-Cache', 'MISS-RANGE'); ph.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : part.body, { status: part.status, headers: ph });
  }
  const full = await fetch(signed);
  if (!full.ok) return deny(full.status === 404 || full.status === 400 ? 404 : 502);
  const headers = new Headers({
    'Content-Type': full.headers.get('content-type') || TYPES[ext] || 'application/octet-stream',
    'Cache-Control': YEAR, 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff',
  });
  const len = full.headers.get('content-length');
  if (len) headers.set('Content-Length', len);
  const [a, b] = full.body.tee();
  waitUntil(cache.put(new Request(objUrl), new Response(a, { status: 200, headers })));
  const out = new Headers(headers); out.set('X-Kring-Cache', 'MISS');
  // first viewer gets the whole file (a valid answer to a Range request); later range requests come from the cache
  return new Response(request.method === 'HEAD' ? null : b, { status: 200, headers: out });
}
