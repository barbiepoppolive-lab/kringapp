// kringapp.com/r/<short> : the share link of one Reel.
// 1. logs the open (Reel, referrer, browser, session, country, time) through the database function kr8_share_open,
// 2. sends the visitor into the app at that Reel (/app/?reel=<id>&so=<open id>).
// The poster earns Rings for opens from outside (Instagram, TikTok, …); LINE opens, link-preview robots, repeats and the
// poster's own opens are stored but never count (decided in the database, not here).
// Needs the Pages secret SHARE_OPEN_KEY (same value as the database vault secret "share_open_key"). Without it the link still
// works, it just cannot log opens. No IP address is stored: only a one-way hash of secret + IP + browser, to count a device once a day.
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
const ANON = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';   // public key, the same one the app ships
const ROBOT = /bot|crawl|spider|facebookexternalhit|meta-external|preview|whatsapp|telegram|slack|discord|embed|curl|wget|python|okhttp|headless|lighthouse|monitor|scan/i;
// 20 Nov: LINE and TikTok fetch link previews with their in-app browser's name (people use the same apps), so they get the card
// page too; a person is sent on by a one-line script (preview robots don't run scripts).
const CARD_UA = /(^|[^a-z])line\/|tiktok|bytespider|bytedance|musical_ly|instagram|pinterest|skype|vkshare|redditbot|applebot|twitterbot/i;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ request, params, env }) {
  const url = new URL(request.url);
  const short = String(params.id || '').toLowerCase();
  const home = `${url.origin}/app/`;
  // invite-1 (18 Nov): the sharer's invite code rides along (/r/<short>?ref=k00184 → /app/?reel=…&ref=k00184), so the friend who joins is credited.
  // r-ref-1 (18 Nov): also a name-style code (NAT44, proposal 0114) and the story-card tracking (utm_*, e.g. utm_content=share-help).
  // Only safe, short values pass; anything else is dropped. Nothing else from the link reaches the app.
  const rawInv = (url.searchParams.get('ref') || '').trim();
  const inv = /^k[0-9]{5,7}$/i.test(rawInv) ? rawInv.toLowerCase() : /^[A-Za-z]{2,8}[0-9]{1,4}$/.test(rawInv) ? rawInv.toUpperCase() : '';
  const keep = new URLSearchParams();
  if (inv) keep.set('ref', inv);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']) {
    const v = url.searchParams.get(k) || '';
    if (/^[A-Za-z0-9._-]{1,40}$/.test(v)) keep.set(k, v);
  }
  const refQ = keep.toString();
  const SEC = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'X-Robots-Tag': 'noindex' };
  const go = (to, cookie) => new Response(null, { status: 302, headers: { Location: to, 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', ...SEC, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
  if (!/^[a-z0-9]{6,10}$/.test(short)) return go(home);

  const ua = request.headers.get('user-agent') || '';
  const ref = request.headers.get('referer') || '';
  const m = /(?:^|;\s*)kr_sid=([A-Za-z0-9-]{16,64})/.exec(request.headers.get('cookie') || '');
  const sid = m ? m[1] : crypto.randomUUID();
  const cookie = m ? null : `kr_sid=${sid}; Path=/r; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`;
  const key = env.SHARE_OPEN_KEY || '';
  let out = null;
  if (key) {
    try {
      const ip = request.headers.get('cf-connecting-ip') || '';
      // security 16 Nov (C1): one counted open per NETWORK per Reel per day (browser name is no longer part of it, so a script
      // that changes its browser name can't farm opens). IPv6: one /64 = one home or phone.
      const net = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
      const device = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${key}|${net}`)));
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(`${SUPA}/rest/v1/rpc/kr8_share_open`, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_short: short, p_ref: ref.slice(0, 300), p_ua: ua.slice(0, 300), p_session: sid, p_device: device,
          p_country: (request.cf && request.cf.country) || null, p_key: key }),
      });
      clearTimeout(timer);
      if (r.ok) out = await r.json();
    } catch { /* never block the link */ }
  }
  // T301-007: link-preview robots (LINE, WhatsApp, X, Facebook) ALWAYS get a card with og:title / og:image, never a bare 302.
  // When the Reel could not be looked up (no SHARE_OPEN_KEY, database slow), it is a generic Kring card that still opens the app.
  const found = !!(out && out.post_id);
  if (!found) out = {};
  const to = found ? `${home}?reel=${encodeURIComponent(out.post_id)}${out.open_id ? `&so=${encodeURIComponent(out.open_id)}` : ''}${refQ ? `&${refQ}` : ''}` : (refQ ? `${home}?${refQ}` : home);
  const card = ROBOT.test(ua) || CARD_UA.test(ua);
  if (!found && !card) return go(to, cookie);
  if (card) {   // link-preview robots get a small card instead of the app
    const title = found ? `${out.name || 'Kring'} · ${out.area || 'Bangkok'} · Kring · กริ๊ง!` : 'A Bangkok Reel on Kring · กริ๊ง!';
    const desc = out.body || 'Share your Bangkok. Make new friends.';
    // 20 Nov: the Reel's own picture card (poster frame, name, place, Kring mark), rendered by /og/r/<short>.png
    const img = found ? `${url.origin}/og/r/${short}.jpg` : `${url.origin}/assets/home/og.jpg`;
    const sqImg = found ? `${url.origin}/og/r/${short}-sq.jpg` : `${url.origin}/assets/home/og-sq.jpg`;
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="video.other"><meta property="og:site_name" content="Kring"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url.origin + url.pathname)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:secure_url" content="${esc(img)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image" content="${esc(sqImg)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="600"><meta property="og:image:height" content="600">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<meta name="robots" content="noindex"><link rel="canonical" href="${esc(to)}"></head><body><a href="${esc(to)}">${esc(title)}</a><script>location.replace(${JSON.stringify(to).replace(/</g, '\\u003c')})</script></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...SEC } });
  }
  return go(to, cookie);
}
