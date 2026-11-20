// kringapp.com/q/<short> : the public page of one Ask BKK answer (0185, 20 Nov). Shared from the app as a picture card.
// 1. logs the open through kr8_share_open's twin kr8_ask_share_open (same first-stage rules) as 'pending'; the page posts
//    /q/ok after 2 seconds of visible time and the SAME kr8_share_open_confirm decides → +5 Rings for the answer's author.
// 2. shows the question and that answer (og:title = the question, og:image = the answer card /og/q/<short>.jpg) with
//    "Join Kring to answer" → /app/?ask=<question>&ref=<sharer>. Indexable. One language: Thai when the browser asks for Thai.
// No IP address is stored: only one-way hashes. Without SHARE_OPEN_KEY the page still opens the app (nothing is logged).
import { ipRange } from '../_lib/opennet.js';
const SUPA = 'https://pedxoxpammnyfnizljyj.supabase.co';
const ANON = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';   // public key, the same one the app ships
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };

const T = {
  en: { ask: 'Ask BKK', local: 'BKK Local', join: 'Join Kring to answer', open: 'Open in Kring', more: (n) => (n === 1 ? '1 answer' : `${n} answers`), tag: 'Bangkok questions, answered by people who live here.', gone: 'This answer isn’t available any more.' },
  th: { ask: 'ถาม BKK', local: 'คนกรุงเทพฯ', join: 'มาตอบบนกริ๊ง!', open: 'เปิดในกริ๊ง!', more: (n) => `${n} คำตอบ`, tag: 'คำถามเรื่องกรุงเทพฯ ตอบโดยคนที่อยู่ที่นี่', gone: 'คำตอบนี้ไม่มีแล้ว' },
};

export async function onRequestGet({ request, params, env }) {
  const url = new URL(request.url);
  const short = String(params.id || '').toLowerCase();
  const rawInv = (url.searchParams.get('ref') || '').trim();
  const inv = /^k[0-9]{5,7}$/i.test(rawInv) ? rawInv.toLowerCase() : /^[A-Za-z]{2,8}[0-9]{1,4}$/.test(rawInv) ? rawInv.toUpperCase() : '';
  const SEC = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' };
  if (!/^[a-z0-9]{6,10}$/.test(short)) return Response.redirect(`${url.origin}/app/?feed=ask`, 302);
  const lang = /^th\b/i.test(request.headers.get('accept-language') || '') ? 'th' : 'en';
  const L = T[lang];

  const ua = request.headers.get('user-agent') || '';
  const ref = request.headers.get('referer') || '';
  const m = /(?:^|;\s*)kr_qsid=([A-Za-z0-9-]{16,64})/.exec(request.headers.get('cookie') || '');
  const sid = m ? m[1] : crypto.randomUUID();
  const cookie = m ? null : `kr_qsid=${sid}; Path=/q; Max-Age=31536000; Secure; HttpOnly; SameSite=Lax`;
  const key = env.SHARE_OPEN_KEY || '';
  let d = null;
  if (key) {
    try {
      const ip = request.headers.get('cf-connecting-ip') || '';
      const net = ip.includes(':') ? ip.split(':').slice(0, 4).join(':') : ip;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 3000);
      const r = await fetch(`${SUPA}/rest/v1/rpc/kr8_ask_share_open`, {
        method: 'POST', signal: ctl.signal,
        headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_short: short, p_ref: ref.slice(0, 300), p_ua: ua.slice(0, 300), p_session: sid, p_device: await sha(`${key}|${net}`),
          p_country: (request.cf && request.cf.country) || null, p_key: key, p_range: await sha(`${key}|range|${ipRange(ip)}`) }),
      });
      clearTimeout(timer);
      if (r.ok) d = await r.json();
    } catch { /* never block the page */ }
  }
  const keep = new URLSearchParams();
  if (inv) keep.set('ref', inv);
  const appUrl = d && d.post_id ? `${url.origin}/app/?ask=${encodeURIComponent(d.post_id)}${inv ? `&ref=${inv}` : ''}` : `${url.origin}/app/?feed=ask${inv ? `&ref=${inv}` : ''}`;
  const canon = `${url.origin}/q/${short}`;
  const title = d && d.q ? `${cut(d.q, 90)} · ${L.ask} · Kring` : `${L.ask} · Kring · กริ๊ง!`;
  const desc = d && d.a ? cut(`${d.name}: ${d.a}`, 180) : L.tag;
  const img = d && d.q ? `${url.origin}/og/q/${short}.jpg` : `${url.origin}/assets/home/og.jpg?v=3`;
  const sqImg = d && d.q ? `${url.origin}/og/q/${short}-sq.jpg` : `${url.origin}/assets/home/og-sq.jpg?v=3`;
  const beacon = d && d.open_id ? `<script>(function(){var o=${JSON.stringify(d.open_id)},t0=Date.now(),need=2000,tot=0,since=document.visibilityState==='visible'?Date.now():0,tm=null,sent=false;
function send(){if(sent)return;sent=true;var did='';try{did=localStorage.getItem('kr8_did')||localStorage.getItem('kr8_device')||''}catch(e){}
var b=JSON.stringify({o:o,d:/^[A-Za-z0-9-]{16,64}$/.test(did)?did:null,wd:navigator.webdriver?1:0,v:need,tz:(function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return''}})(),sw:screen.width||0,t:(navigator.maxTouchPoints||0)>0?1:0});
try{fetch('/q/ok',{method:'POST',body:b,credentials:'same-origin',keepalive:true,headers:{'Content-Type':'application/json'}})}catch(e){}}
function arm(){clearTimeout(tm);tm=setTimeout(function(){tot+=Date.now()-since;since=Date.now();if(tot>=need)send();else arm()},Math.max(50,need-tot))}
document.addEventListener('visibilitychange',function(){if(document.visibilityState==='visible'){since=Date.now();arm()}else{if(since)tot+=Date.now()-since;since=0;clearTimeout(tm)}});if(since)arm();})();</script>` : '';

  const body = d && d.q ? `
  <main class="w">
    <header><a class="brand" href="${esc(url.origin)}/"><i class="rk"><b></b><b></b></i>Kring · กริ๊ง!</a><span class="chip">${esc(L.ask)}</span></header>
    <span class="area">📍 ${esc(d.area || 'Bangkok')}</span>
    <h1>${esc(d.q)}</h1>
    <section class="ans">
      <div class="who"><span class="av">${esc((d.name || '?').charAt(0).toUpperCase())}</span><b>${esc(d.name || '')}</b>${d.local ? `<em>${esc(L.local)}</em>` : ''}</div>
      <p>${esc(d.a)}</p>
    </section>
    ${d.answers > 1 ? `<p class="more">${esc(L.more(d.answers))}</p>` : ''}
    <a class="cta" href="${esc(appUrl)}">${esc(L.join)}</a>
    <p class="tag">${esc(L.tag)}</p>
  </main>` : `
  <main class="w"><header><a class="brand" href="${esc(url.origin)}/"><i class="rk"><b></b><b></b></i>Kring · กริ๊ง!</a></header>
    <h1>${esc(L.gone)}</h1><a class="cta" href="${esc(appUrl)}">${esc(L.open)}</a></main>`;

  const ld = d && d.q ? `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'QAPage', mainEntity: { '@type': 'Question', name: cut(d.q, 200), answerCount: d.answers || 1,
    acceptedAnswer: { '@type': 'Answer', text: cut(d.a, 600), author: { '@type': 'Person', name: d.name || 'Kring member' } } } }).replace(/</g, '\\u003c')}</script>` : '';
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(canon)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Kring"><meta property="og:title" content="${esc(d && d.q ? cut(d.q, 120) : title)}">
<meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${esc(canon)}">
<meta property="og:image" content="${esc(img)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image" content="${esc(sqImg)}"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:width" content="600"><meta property="og:image:height" content="600">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(d && d.q ? cut(d.q, 120) : title)}"><meta name="twitter:description" content="${esc(desc)}"><meta name="twitter:image" content="${esc(img)}">
<meta name="theme-color" content="#0B0A16"><link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;700&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
${ld}
<style>
:root{--pk:#FF4FD8;--bl:#5B8CFF}*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:#0B0A16;color:#fff;font-family:Inter,Anuphan,system-ui,sans-serif}
body{background:linear-gradient(180deg,rgba(9,7,22,.55),rgba(9,7,22,.88) 45%,#0B0A16 75%),url('/app/media/places/rv4-me-sky.jpg') top center/cover no-repeat fixed;min-height:100dvh}
body:before{content:'';position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 90% 8%,rgba(255,79,216,.28),transparent 45%),radial-gradient(circle at 0% 95%,rgba(91,140,255,.26),transparent 50%)}
.w{position:relative;max-width:560px;margin:0 auto;padding:20px 16px 48px;display:flex;flex-direction:column;gap:18px}
header{display:flex;align-items:center;justify-content:space-between}
.brand{display:inline-flex;align-items:center;gap:10px;padding:6px 16px 6px 8px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:#fff;text-decoration:none;font-weight:700;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.rk{position:relative;width:34px;height:22px;display:inline-block}.rk b{position:absolute;top:0;width:22px;height:22px;border-radius:50%;border:3.5px solid var(--bl)}.rk b+b{left:12px;border-color:var(--pk)}
.chip{padding:6px 14px;border-radius:999px;font-weight:800;font-size:.85rem;background:linear-gradient(90deg,var(--bl),var(--pk))}
.area{margin-top:20px;color:rgba(255,255,255,.75);font-size:.9rem;font-weight:500}
h1{margin:0;font-size:clamp(1.6rem,6.4vw,2.2rem);line-height:1.18;font-weight:800;text-shadow:0 2px 18px rgba(0,0,0,.5)}
.ans{padding:18px 18px 20px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.12),rgba(255,255,255,.06));border:1px solid rgba(255,255,255,.16);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.who{display:flex;align-items:center;gap:10px}.av{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;font-weight:800;background:linear-gradient(135deg,var(--bl),var(--pk))}
.who em{font-style:normal;font-size:.75rem;font-weight:700;color:#F3D98B;padding:3px 10px;border-radius:999px;border:1px solid rgba(233,196,106,.55);background:rgba(233,196,106,.14)}
.ans p{margin:12px 0 0;font-size:1.06rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere;color:rgba(255,255,255,.94)}
.more{margin:0;color:rgba(255,255,255,.7);font-weight:700;font-size:.9rem;text-align:center}
.cta{display:flex;align-items:center;justify-content:center;height:56px;border-radius:999px;color:#fff;text-decoration:none;font-weight:800;font-size:1.05rem;background:linear-gradient(90deg,var(--bl),var(--pk));box-shadow:0 12px 32px rgba(255,79,216,.38)}
.tag{margin:0;text-align:center;color:rgba(255,255,255,.6);font-size:.85rem}
</style></head><body>${body}${beacon}</body></html>`;
  return new Response(html, { status: d && d.q ? 200 : 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', ...SEC, ...(cookie ? { 'Set-Cookie': cookie } : {}) } });
}
