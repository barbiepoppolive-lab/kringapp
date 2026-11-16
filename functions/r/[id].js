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

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function onRequestGet({ request, params, env }) {
  const url = new URL(request.url);
  const short = String(params.id || '').toLowerCase();
  const home = `${url.origin}/app/`;
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
  if (!out || !out.post_id) return go(home, cookie);
  const to = `${home}?reel=${encodeURIComponent(out.post_id)}${out.open_id ? `&so=${encodeURIComponent(out.open_id)}` : ''}`;
  if (ROBOT.test(ua)) {   // link-preview robots get a small card instead of the app
    const title = `${out.name || 'Kring'} · ${out.area || 'Bangkok'} · Kring · กริ๊ง!`;
    const desc = out.body || 'Share your Bangkok. Make new friends.';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title>
<meta property="og:type" content="video.other"><meta property="og:site_name" content="Kring"><meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(url.origin + url.pathname)}">
<meta property="og:image" content="${esc(url.origin)}/assets/home/og.jpg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(url.origin)}/assets/home/og.jpg">
<meta name="robots" content="noindex"><link rel="canonical" href="${esc(to)}"></head><body><a href="${esc(to)}">${esc(title)}</a></body></html>`;
    return new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...SEC } });
  }
  return go(to, cookie);
}
