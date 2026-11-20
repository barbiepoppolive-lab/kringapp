// 20 Nov: a shared profile link (/app/?u=<id>, /app-preview/?u=<id>) shows that member's picture card in LINE / WhatsApp /
// Facebook / X instead of the generic app card. People get the app as before; only link-preview robots see this page.
const ROBOT = /bot|crawl|spider|facebookexternalhit|meta-external|whatsapp|telegram|slack|discord|embed|(^|[^a-z])line\/|tiktok|bytespider|bytedance|instagram|skype|pinterest|applebot|twitterbot/i;
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export async function profileCard(ctx) {
  const url = new URL(ctx.request.url);
  const u = (url.searchParams.get('u') || '').toLowerCase();
  if (!/^[0-9a-f-]{36}$/.test(u) || url.searchParams.has('_h') || !ROBOT.test(ctx.request.headers.get('user-agent') || '')) return ctx.next();
  // LINE / TikTok / Instagram use one name for the preview robot and the in-app browser: a person is sent on by a script
  const go = new URL(url.href); go.searchParams.set('_h', '1');
  const img = `${url.origin}/og/u/${u}.jpg`;
  const sq = `${url.origin}/og/u/${u}-sq.jpg`;
  const title = 'Meet me on Kring · มาเจอกันที่กริ๊ง!';
  const desc = 'Bangkok locals and travellers, all face-checked. Say hi on Kring.';
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="profile"><meta property="og:site_name" content="Kring"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url.href)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image" content="${esc(sq)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="600"><meta property="og:image:height" content="600">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${esc(img)}"><meta name="robots" content="noindex"></head>
<body><a href="${esc(go.href)}">${esc(title)}</a><script>location.replace(${JSON.stringify(go.href).replace(/</g, '\\u003c')})</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}
