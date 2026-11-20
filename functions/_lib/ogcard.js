// kringapp.com/og/{r,u}/<id>[-sq].jpg : the share-link card (1200x630, or 600x600 square for apps that crop square).
// Rendered once by the Supabase edge function kr8-og (satori + resvg need more CPU than a Pages function has), stored as a
// ~50-120 KB JPEG in the public bucket kr8-og; this only passes bytes through the edge cache.
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
export async function ogCard(ctx, kind, id, sq) {
  const path = `${kind === 'reel' ? 'r' : 'u'}/${id}${sq ? '-sq' : ''}.jpg`;
  const cache = caches.default;
  const key = new Request(`${new URL(ctx.request.url).origin}/__og/v4/${path}`);
  const hit = await cache.match(key);
  if (hit) return hit;
  let r = await fetch(`${SUPA}/storage/v1/object/public/kr8-og/${path}`);
  if (!r.ok) r = await fetch(`${SUPA}/functions/v1/kr8-og?${kind === 'reel' ? 'r' : 'u'}=${encodeURIComponent(id)}${sq ? '&sq=1' : ''}`);
  if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/jpeg')) return null;
  const jpg = await r.arrayBuffer();
  const out = new Response(jpg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=3600', 'X-Content-Type-Options': 'nosniff' } });
  ctx.waitUntil(cache.put(key, new Response(jpg, { headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=21600' } })));
  return out;
}
