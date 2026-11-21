// Ask BKK question pages for search and AI answers (founder 21 Nov): kringapp.com/q/<question id>.
// Server-rendered: the question and up to 10 visible answers in the language they were posted PLUS the stored translation (kr8_ask_tr),
// so crawlers without JavaScript read both Thai and English. Only what kr8_ask_public_page returns (0192): public questions with at
// least one visible answer, display first names only, no photos, no member ids. The member app itself stays one language at a time.
import { SUPA_LIVE, ANON_LIVE, ORIGIN, esc, ldJson } from './webreels.js';

const TTL = 600;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isQuestionId = (s) => UUID.test(String(s || ''));
const thai = (s) => /[฀-๿]/.test(String(s || ''));
const cut = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const SEC = { 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'strict-origin-when-cross-origin' };

async function rpc(env, fn, args) {
  const url = (env && env.WEB_SUPA_URL) || SUPA_LIVE, anon = (env && env.WEB_SUPA_ANON) || ANON_LIVE;
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', signal: ctl.signal, headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args), cf: { cacheTtl: TTL, cacheEverything: true } });
    return r.ok ? await r.json() : null;
  } catch { return null; } finally { clearTimeout(t); }
}

// the other language of a text: Thai original → English translation, English original → Thai translation
const other = (orig, tr) => { const o = thai(orig) ? 'en' : 'th'; const v = tr && tr[o]; return v && v.trim() && v.trim() !== String(orig).trim() ? { lang: o, text: v.trim() } : null; };

// link_visits counter, same as the other pages (one row per phone per Bangkok day per ref); ref = utm_source or ?ref
const visitJs = (path) => `<script>(function(){try{var q=new URLSearchParams(location.search),r=(q.get('utm_source')||q.get('ref')||'').toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||null;var s=null;try{s=localStorage.getItem('kr_vid')}catch(e){}if(!s||!/^[a-z0-9]{4,40}$/.test(s)){s=Math.random().toString(36).slice(2,12)+Math.random().toString(36).slice(2,8);try{localStorage.setItem('kr_vid',s)}catch(e){}}if(navigator.webdriver&&s.indexOf('zztest')!==0)s=('zztest'+s).slice(0,40);var dy=new Date(Date.now()+252e5).toISOString().slice(0,10),k='kr_lv:'+dy+':'+${JSON.stringify(path)}+':'+(r||'');try{if(localStorage.getItem(k))return;localStorage.setItem(k,'1')}catch(e){}var h='';try{h=document.referrer?new URL(document.referrer).host:''}catch(e){}var K=${JSON.stringify(ANON_LIVE)};fetch(${JSON.stringify(SUPA_LIVE)}+'/rest/v1/link_visits',{method:'POST',keepalive:true,credentials:'omit',headers:{apikey:K,Authorization:'Bearer '+K,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify({ref:r,path:${JSON.stringify(path)},referrer:h.slice(0,200)||null,session_id:s})}).catch(function(){})}catch(e){}})();</script>`;

const CSS = `:root{--pk:#FF4FD8;--bl:#5B8CFF}*{box-sizing:border-box}html,body{margin:0;background:#0B0A16;color:#fff;font-family:Inter,Anuphan,system-ui,sans-serif}
body{min-height:100dvh;background:radial-gradient(circle at 90% 4%,rgba(255,79,216,.22),transparent 42%),radial-gradient(circle at 0% 96%,rgba(91,140,255,.2),transparent 48%),#0B0A16}
.w{max-width:620px;margin:0 auto;padding:20px 16px 48px;display:flex;flex-direction:column;gap:16px}
header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.brand{display:inline-flex;align-items:center;gap:10px;padding:6px 16px 6px 8px;border-radius:999px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.16);color:#fff;text-decoration:none;font-weight:700}
.rk{position:relative;width:34px;height:22px;display:inline-block}.rk b{position:absolute;top:0;width:22px;height:22px;border-radius:50%;border:3.5px solid var(--bl)}.rk b+b{left:12px;border-color:var(--pk)}
.chip{padding:6px 14px;border-radius:999px;font-weight:800;font-size:.85rem;background:linear-gradient(90deg,var(--bl),var(--pk))}
.area{margin:14px 0 0;color:rgba(255,255,255,.72);font-size:.9rem}
h1{margin:0;font-size:clamp(1.55rem,6.2vw,2.15rem);line-height:1.22;font-weight:800}
.sub{margin:-6px 0 0;color:rgba(255,255,255,.72);font-size:1.02rem;line-height:1.45}
.n{margin:4px 0 0;color:rgba(255,255,255,.6);font-weight:700;font-size:.85rem;text-transform:uppercase;letter-spacing:.04em}
ol{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
li{padding:16px 16px 18px;border-radius:20px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.13)}
.who{display:flex;align-items:center;gap:8px;font-size:.92rem}.who b{font-weight:700}.who em{font-style:normal;font-size:.72rem;font-weight:700;color:#F3D98B;padding:2px 9px;border-radius:999px;border:1px solid rgba(233,196,106,.55)}
.who span{margin-left:auto;color:rgba(255,255,255,.5);font-size:.78rem}
li p{margin:8px 0 0;font-size:1.04rem;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}
li p.tr{margin-top:6px;font-size:.95rem;color:rgba(255,255,255,.7)}
.cta{display:flex;align-items:center;justify-content:center;height:54px;border-radius:999px;color:#fff;text-decoration:none;font-weight:800;background:linear-gradient(90deg,var(--bl),var(--pk))}
.tag{margin:0;text-align:center;color:rgba(255,255,255,.55);font-size:.85rem}html[lang=th] h1,html[lang=th] li p{line-height:1.6}`;

export async function questionPage(env, id) {
  const d = await rpc(env, 'kr8_ask_public_page', { p_post: id });
  const canon = `${ORIGIN}/q/${id.toLowerCase()}`;
  const head = (title, extra) => `<!doctype html><html lang="${extra.lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>${extra.meta}<meta name="theme-color" content="#0B0A16"><link rel="icon" href="/icon-192.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Anuphan:wght@500;700&family=Inter:wght@500;700;800&display=swap" rel="stylesheet">
<style>${CSS}</style></head>`;
  if (!d || !d.q) {
    return new Response(head('Ask BKK · Kring', { lang: 'en', meta: '<meta name="robots" content="noindex">' }) + `<body><main class="w"><header><a class="brand" href="/"><i class="rk"><b></b><b></b></i>Kring · กริ๊ง!</a></header><h1>This question isn’t available.</h1><p class="sub" lang="th">คำถามนี้ไม่มีแล้ว</p><a class="cta" href="/app/?feed=ask">Ask BKK · ถาม BKK</a></main></body></html>`,
      { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300', ...SEC } });
  }
  const qTh = thai(d.q), lang = qTh ? 'th' : 'en';
  const qAlt = other(d.q, d.tr);
  const ans = (d.answers || []).map((a, i) => ({ ...a, alt: other(a.body, a.tr), i: i + 1, who: a.team ? 'Kring Team' : a.name || (qTh ? 'สมาชิก Kring' : 'Kring member') }));
  const top = ans[0];
  const brand = qTh ? 'ถาม BKK · กริ๊ง! Kring' : 'Ask BKK · Kring';
  const title = `${cut(d.q, 90)} · ${brand}`;
  const desc = top ? cut(`${top.who}: ${top.body}${top.alt ? ` · ${top.alt.text}` : ''}`, 180) : '';
  const day = (s) => String(s || '').slice(0, 10);
  const ld = { '@context': 'https://schema.org', '@type': 'QAPage', url: canon, inLanguage: lang,
    mainEntity: { '@type': 'Question', name: cut(d.q, 300), text: d.q, inLanguage: lang, ...(qAlt ? { alternateName: qAlt.text } : {}),
      answerCount: d.n || ans.length, dateCreated: d.at, author: { '@type': 'Person', name: qTh ? 'สมาชิก Kring' : 'Kring member' },
      ...(top ? { acceptedAnswer: { '@type': 'Answer', text: top.alt ? `${top.body}\n\n${top.alt.text}` : top.body, dateCreated: top.at, upvoteCount: top.score || 0, url: `${canon}#a1`, author: { '@type': 'Person', name: top.who } } } : {}),
      suggestedAnswer: ans.slice(1).map((a) => ({ '@type': 'Answer', text: a.alt ? `${a.body}\n\n${a.alt.text}` : a.body, dateCreated: a.at, upvoteCount: a.score || 0, url: `${canon}#a${a.i}`, author: { '@type': 'Person', name: a.who } })) } };
  const meta = `<meta name="description" content="${esc(desc)}"><meta name="robots" content="index,follow,max-snippet:-1"><link rel="canonical" href="${esc(canon)}">
<meta property="og:type" content="article"><meta property="og:site_name" content="Kring"><meta property="og:title" content="${esc(cut(d.q, 120))}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canon)}"><meta property="og:image" content="${ORIGIN}/assets/home/og.jpg?v=3"><meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${ldJson(ld)}</script>`;
  const li = (a) => `<li id="a${a.i}"><div class="who"><b>${esc(a.who)}</b>${a.local && !a.team ? `<em>${qTh ? 'คนกรุงเทพฯ' : 'BKK Local'}</em>` : ''}<span>${esc(day(a.at))}</span></div>
<p lang="${thai(a.body) ? 'th' : 'en'}" dir="auto">${esc(a.body)}</p>${a.alt ? `<p class="tr" lang="${a.alt.lang}">${esc(a.alt.text)}</p>` : ''}</li>`;
  const body = `<body><main class="w"><header><a class="brand" href="/"><i class="rk"><b></b><b></b></i>Kring · กริ๊ง!</a><span class="chip">${qTh ? 'ถาม BKK' : 'Ask BKK'}</span></header>
<p class="area">📍 ${esc(d.area || 'Bangkok')}</p>
<h1 lang="${lang}">${esc(d.q)}</h1>${qAlt ? `<p class="sub" lang="${qAlt.lang}">${esc(qAlt.text)}</p>` : ''}
<p class="n">${qTh ? `${d.n} คำตอบ · ${d.n} answers` : `${d.n} ${d.n === 1 ? 'answer' : 'answers'} · ${d.n} คำตอบ`}</p>
<ol>${ans.map(li).join('')}</ol>
<a class="cta" href="/app/?ask=${encodeURIComponent(d.id)}">${qTh ? 'ตอบบนกริ๊ง! · Answer on Kring' : 'Answer on Kring · ตอบบนกริ๊ง!'}</a>
<p class="tag">${qTh ? 'คำถามเรื่องกรุงเทพฯ ตอบโดยคนที่อยู่ที่นี่ · Bangkok questions, answered by people who live here.' : 'Bangkok questions, answered by people who live here · คำถามเรื่องกรุงเทพฯ ตอบโดยคนที่อยู่ที่นี่'}</p></main>
${visitJs(`/q/${id.toLowerCase()}`)}</body></html>`;
  return new Response(head(title, { lang, meta }) + body, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': `public, max-age=300, s-maxage=${TTL}`, ...SEC } });
}

export async function askSitemap(env) {
  const list = (await rpc(env, 'kr8_ask_public_list', {})) || [];
  const rows = (Array.isArray(list) ? list : []).filter((x) => isQuestionId(x.id)).map((x) =>
    `  <url><loc>${ORIGIN}/q/${String(x.id).toLowerCase()}</loc><lastmod>${esc(String(x.updated || '').slice(0, 10))}</lastmod></url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${rows.join('\n')}\n</urlset>\n`;
}
