// kringapp.com/og/q/<short>.jpg (1200x630) or -sq.jpg (600x600): the Ask BKK answer card for link previews (0185).
// Rendered once by the Supabase edge function kr8-og (?q=<short>) and stored in the public bucket kr8-og (q/<short>.jpg).
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
export async function onRequestGet(ctx) {
  const m = /^([a-z0-9]{6,10})(-sq)?\.(jpg|png)$/.exec(String(ctx.params.file || '').toLowerCase());
  const fallback = () => Response.redirect(new URL(m && m[2] ? '/assets/home/og-sq.jpg?v=3' : '/assets/home/og.jpg?v=3', ctx.request.url).toString(), 302);
  if (!m) return fallback();
  const path = `q/${m[1]}${m[2] ? '-sq' : ''}.jpg`;
  const cache = caches.default;
  const key = new Request(`${new URL(ctx.request.url).origin}/__og/v4/${path}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  try {
    let r = await fetch(`${SUPA}/storage/v1/object/public/kr8-og/${path}`);
    if (!r.ok) r = await fetch(`${SUPA}/functions/v1/kr8-og?q=${m[1]}${m[2] ? '&sq=1' : ''}`);
    if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/jpeg')) return fallback();
    const jpg = await r.arrayBuffer();
    ctx.waitUntil(cache.put(key, new Response(jpg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=21600' } })));
    return new Response(jpg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  } catch { return fallback(); }
}
