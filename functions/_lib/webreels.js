// Public web pages for members' Reels (17 Nov 2026, founder-approved SEO item A).
// Only Reels whose member said yes to "Show my Reels on the web" (kr8_members.web_reels, asked in the app) are ever listed:
// the database function kr8_web_reels decides (approved, not hidden, not "Feed only"/AI, not ghost, not Kring Team, not test).
// It returns only safe fields: share short id, first name, caption, area/place names, date, duration, size. Never ids, handles,
// emails, storage paths or coordinates. Poster/video bytes go through /reel/<short>/poster.jpg|video.mp4 (see media()).
export const SUPA_LIVE = 'https://pedxoxpammnyfnizljyj.supabase.co';
export const ANON_LIVE = 'sb_publishable_SaAf7mILfPPpCeAEvj79bA_Vz8JnCBN';   // public key, the same one the app ships
export const ORIGIN = 'https://kringapp.com';
const TTL = 600;   // seconds: database answers are kept at the edge this long (an opt-out shows within ~10 minutes)

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// JSON inside <script type="application/ld+json">: no "</script>" break-out, no HTML comment tricks
export const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

const cfg = (env) => ({ url: (env && env.WEB_SUPA_URL) || SUPA_LIVE, anon: (env && env.WEB_SUPA_ANON) || ANON_LIVE });

// kr_area (kr8_places) → Thai name
export const AREA_TH = {
  Ari: 'อารีย์', 'Bang Rak': 'บางรัก', Bangkok: 'กรุงเทพฯ', Chatuchak: 'จตุจักร', Chinatown: 'เยาวราช', Ekkamai: 'เอกมัย',
  'Old Town': 'เมืองเก่า', 'Phrom Phong': 'พร้อมพงษ์', Ratchada: 'รัชดา', Riverside: 'ริมเจ้าพระยา', Sathorn: 'สาทร', Siam: 'สยาม',
  Silom: 'สีลม', Sukhumvit: 'สุขุมวิท', 'Talad Noi': 'ตลาดน้อย', Thonglor: 'ทองหล่อ', Yaowarat: 'เยาวราช',
};

// area pages. stat = a hand-written static page already exists (/bangkok/<slug>/ and /en/bangkok/<slug>/): the live Reels are added
// into it. The others are built here from the intro below, and are only indexable once they have at least one public Reel.
export const AREAS = {
  ari: { kr: ['Ari'], th: 'อารีย์', en: 'Ari', stat: true },
  siam: { kr: ['Siam'], th: 'สยาม', en: 'Siam', stat: true },
  thonglor: { kr: ['Thonglor'], th: 'ทองหล่อ', en: 'Thonglor', stat: true },
  yaowarat: { kr: ['Yaowarat', 'Chinatown'], th: 'เยาวราช', en: 'Yaowarat', stat: true },
  'talat-noi': { kr: ['Talad Noi'], th: 'ตลาดน้อย', en: 'Talat Noi', stat: true },
  thonburi: { kr: ['Thonburi'], th: 'ฝั่งธนฯ', en: 'Thonburi', stat: true },
  ekkamai: { kr: ['Ekkamai'], th: 'เอกมัย', en: 'Ekkamai',
    introTh: 'เอกมัยคือซอยยาวที่มีคาเฟ่ ร้านดีไซน์ และแกลเลอรีเล็ก ๆ ตลอดทาง คนแถวนี้ชอบนั่งคุยกันยาว ๆ ตั้งแต่บ่ายจนค่ำ',
    introEn: 'Ekkamai is one long soi of cafés, design shops and small galleries, where people settle in for long chats from afternoon into the evening.' },
  silom: { kr: ['Silom', 'Sathorn'], th: 'สีลม', en: 'Silom',
    introTh: 'สีลมกลางวันเป็นย่านออฟฟิศ พอเย็นคนออกมาวิ่งที่สวนลุมฯ แล้วไปนั่งต่อในซอย เป็นย่านที่คึกคักตั้งแต่เช้าจนดึก',
    introEn: 'Silom is offices by day. By evening people run laps in Lumphini Park, then spill into the sois. Busy from morning to late.' },
  sukhumvit: { kr: ['Sukhumvit', 'Phrom Phong'], th: 'สุขุมวิท', en: 'Sukhumvit',
    introTh: 'สุขุมวิทช่วงอโศกถึงพร้อมพงษ์ มีห้าง สวนเบญจกิติ คาเฟ่ และคนจากทั่วโลกที่ใช้ชีวิตปนกับคนกรุงเทพฯ ทุกวัน',
    introEn: 'Sukhumvit from Asok to Phrom Phong: malls, Benjakitti Park, cafés, and people from all over the world living side by side with Bangkokians.' },
  'charoen-krung': { kr: ['Bang Rak', 'Riverside'], th: 'เจริญกรุง', en: 'Charoen Krung',
    introTh: 'เจริญกรุงคือถนนเก่าริมแม่น้ำ ตึกแถวเก่ากลายเป็นแกลเลอรี ร้านกาแฟ และพื้นที่สร้างสรรค์ เดินเล่นได้ทั้งวัน',
    introEn: "Charoen Krung is Bangkok's old riverside road, where heritage shophouses became galleries, coffee bars and creative spaces. Made for a slow walk." },
  ratchada: { kr: ['Ratchada'], th: 'รัชดา', en: 'Ratchada',
    introTh: 'รัชดามีตลาดกลางคืน ห้างใหญ่ และโรงละคร นั่ง MRT มาง่าย คนวัยทำงานและนักศึกษาเยอะ',
    introEn: 'Ratchada has night markets, big malls and theatres, all easy by MRT, and plenty of young workers and students.' },
  chatuchak: { kr: ['Chatuchak'], th: 'จตุจักร', en: 'Chatuchak',
    introTh: 'จตุจักรมีตลาดนัดสุดสัปดาห์ สวนใหญ่สามสวนติดกัน และคนจากทุกมุมเมืองแวะมาเดินทุกเสาร์อาทิตย์',
    introEn: 'Chatuchak has the weekend market, three big parks side by side, and people from every corner of the city every Saturday and Sunday.' },
};
export const slugForArea = (kr) => Object.keys(AREAS).find((s) => AREAS[s].kr.includes(kr)) || null;
export const areaName = (kr, lang) => (lang === 'th' ? AREA_TH[kr] || kr : kr === 'Talad Noi' ? 'Talat Noi' : kr) || (lang === 'th' ? 'กรุงเทพฯ' : 'Bangkok');
export const placeName = (r, lang) => (lang === 'th' ? r.place_th || r.place_en : r.place_en || r.place_th) || areaName(r.area, lang);

// ── data ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
async function cached(key, ttl, load) {
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const k = new Request(`${ORIGIN}/__webreels/${key}`);
  if (cache) {
    const hit = await cache.match(k);
    if (hit) return hit.json();
  }
  const v = await load();
  if (cache && v !== undefined) {
    try { await cache.put(k, new Response(JSON.stringify(v), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${ttl}` } })); } catch { /* ignore */ }
  }
  return v;
}

async function rpc(env, fn, args) {
  const { url, anon } = cfg(env);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 4000);
  try {
    const r = await fetch(`${url}/rest/v1/rpc/${fn}`, {
      method: 'POST', signal: ctl.signal,
      headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
    return await r.json();
  } finally { clearTimeout(timer); }
}

/** public Reels. opts: { areas?: string[] (kr_area names), short?: string, limit?: number } → array ([] on any error) */
export async function getReels(env, opts = {}) {
  const areas = opts.areas && opts.areas.length ? [...opts.areas].sort() : null;
  const short = opts.short ? String(opts.short).toLowerCase() : null;
  if (short && !/^[a-z0-9]{6,10}$/.test(short)) return [];
  const limit = Math.max(1, Math.min(opts.limit || 24, 1000));
  const key = `reels/${short || '-'}/${areas ? encodeURIComponent(areas.join('|')) : 'all'}/${limit}`;
  try {
    const v = await cached(key, TTL, () => rpc(env, 'kr8_web_reels', { p_areas: areas, p_short: short, p_limit: limit }));
    return Array.isArray(v) ? v.filter((r) => r && /^[a-z0-9]{6,10}$/.test(r.short || '')) : [];
  } catch { return []; }
}

/** storage paths of a PUBLIC Reel's poster and video, for the website function only (needs SHARE_OPEN_KEY) */
export async function getMedia(env, short) {
  const key = env && env.SHARE_OPEN_KEY;
  if (!key || !/^[a-z0-9]{6,10}$/.test(short)) return null;
  try {
    const v = await cached(`media/${short}`, TTL, async () => (await rpc(env, 'kr8_web_reel_media', { p_short: short, p_key: key })) || { none: true });
    return v && !v.none ? v : null;
  } catch { return null; }
}

// ── html bits ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const reelPath = (short, lang) => `${lang === 'en' ? '/en' : ''}/reel/${short}`;
export const areaPath = (slug, lang) => `${lang === 'en' ? '/en' : ''}/bangkok/${slug}/`;
export const posterPath = (short) => `/reel/${short}/poster.jpg`;
export const videoPath = (short) => `/reel/${short}/video.mp4`;
const fmtDate = (iso, lang) => {
  try { return new Date(iso).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }); }
  catch { return ''; }
};
export const isoDuration = (ms) => {
  const s = Math.max(1, Math.round((Number(ms) || 0) / 1000)); const m = Math.floor(s / 60); const r = s % 60;
  return `PT${m ? `${m}M` : ''}${r ? `${r}S` : ''}`;
};

/** the grid of Reel cards (re-uses the area pages' .grid style) */
export function cardsHtml(reels, lang) {
  return `<ul class="grid wr-grid">${reels.map((r) => {
    const place = placeName(r, lang);
    const alt = lang === 'th' ? `รีลที่${place} โดย ${r.name}` : `Reel at ${place} by ${r.name}`;
    return `<li><a href="${reelPath(r.short, lang)}"><img alt="${esc(alt)}" decoding="async" loading="lazy" src="${posterPath(r.short)}" width="${Number(r.w) || 720}" height="${Number(r.h) || 1280}"/><span>${esc(place)}<small class="wr-by">${esc(r.name)}</small></span></a></li>`;
  }).join('')}</ul>`;
}

export const WR_CSS = '<style>.wr-grid a{font-size:14px}.wr-by{display:block;font:400 12.5px "Plus Jakarta Sans","Noto Sans Thai",system-ui,sans-serif;color:rgba(255,255,255,.8);margin-top:2px}.wr-note{font-size:13px;color:rgba(255,255,255,.6);margin:-4px 0 12px}.wr-chips{display:flex;flex-wrap:wrap;gap:8px;list-style:none;padding:0;margin-top:14px}.wr-chips a{display:inline-block;border:1px solid rgba(255,255,255,.3);border-radius:99px;padding:6px 14px;color:#fff;text-decoration:none;font-size:14px}</style>';

/** the "latest Reels" section added into an area page */
export function reelsSection(reels, lang, title) {
  if (!reels.length) return '';
  const note = lang === 'th' ? 'จากสมาชิกกริ๊ง! ที่เลือกให้รีลของตัวเองแสดงบนเว็บ' : 'From Kring members who chose to show their Reels on the web.';
  return `<section id="reels"><h2>${esc(title)}</h2><p class="wr-note">${esc(note)}</p>${cardsHtml(reels, lang)}</section>`;
}

/** insert a block into a static page: before the closing CTA of <main> (else before </main>) */
export function injectIntoMain(html, block, headExtra = '') {
  let out = html;
  if (headExtra) out = out.replace('</head>', `${headExtra}</head>`);
  if (!block) return out;
  const i = out.indexOf('<div class="end">');
  if (i > -1) return out.slice(0, i) + block + out.slice(i);
  const j = out.indexOf('</main>');
  return j > -1 ? out.slice(0, j) + block + out.slice(j) : out;
}

export const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff', 'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY',
  // _headers does not reach Function responses, so the site-wide ones are repeated here
  'Content-Security-Policy': "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
};
export const htmlResponse = (html, status = 200, extra = {}) => new Response(html, {
  status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=600', ...SEC_HEADERS, ...extra },
});

const FONTS = `@font-face{font-family:Unbounded;font-weight:800;font-display:swap;src:url(/fonts/unbounded-latin-800-normal.woff2) format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:400;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-400-normal.woff2) format("woff2")}
@font-face{font-family:"Plus Jakarta Sans";font-weight:700;font-display:swap;src:url(/fonts/plus-jakarta-sans-latin-700-normal.woff2) format("woff2")}
@font-face{font-family:"Noto Sans Thai";font-weight:400;font-display:swap;src:url(/fonts/noto-sans-thai-thai-400-normal.woff2) format("woff2")}
@font-face{font-family:"Noto Sans Thai";font-weight:800;font-display:swap;src:url(/fonts/noto-sans-thai-thai-800-normal.woff2) format("woff2")}`;
// the same look as the hand-written area pages
export const BASE_CSS = `${FONTS}
*{box-sizing:border-box;margin:0;padding:0}body{background:#07060c;color:#fff;font:400 17px/1.65 "Plus Jakarta Sans","Noto Sans Thai",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
a{color:#3ff0ff}.top{position:absolute;top:0;left:0;right:0;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:16px 18px}
.top a{color:#fff;text-decoration:none;font-weight:700}.logo{font:800 20px Unbounded,"Noto Sans Thai",sans-serif}.logo i{color:#ff4fd8;font-style:normal}
.lg{font-size:13px;border:1px solid rgba(255,255,255,.35);border-radius:99px;padding:6px 12px;background:rgba(7,6,12,.4)}
.hero{position:relative;min-height:min(78vh,720px);display:flex;align-items:flex-end;overflow:hidden}
.hero img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,12,.45),rgba(7,6,12,0) 28%,rgba(7,6,12,.2) 52%,#07060c 96%)}
.hero .in{position:relative;z-index:2;padding:0 20px 34px;max-width:760px;margin:0 auto;width:100%}
.bc{font-size:13px;color:rgba(255,255,255,.75);margin-bottom:10px}.bc a{color:inherit}
h1{font:800 clamp(28px,8vw,48px)/1.15 Unbounded,"Noto Sans Thai",sans-serif;text-shadow:0 2px 24px rgba(0,0,0,.6);overflow-wrap:anywhere}html[lang=th] h1{line-height:1.3}
h1 em{font-style:normal;color:#ff4fd8}.lead{margin-top:12px;font-size:18px;color:rgba(255,255,255,.92);text-shadow:0 1px 12px rgba(0,0,0,.7)}
.btn{display:inline-flex;align-items:center;gap:8px;margin-top:18px;background:linear-gradient(90deg,#ff4fd8,#8b5cff);color:#fff;text-decoration:none;font-weight:700;padding:14px 26px;border-radius:99px;box-shadow:0 0 28px rgba(255,79,216,.45)}
.sub{display:block;margin-top:9px;font-size:12.5px;color:rgba(255,255,255,.7)}
main{max-width:760px;margin:0 auto;padding:8px 20px 30px}section{padding:22px 0;border-top:1px solid rgba(255,255,255,.1)}section:first-child{border:0}
h2{font:800 21px/1.25 Unbounded,"Noto Sans Thai",sans-serif;margin-bottom:10px}html[lang=th] h2{line-height:1.4}
p,li{color:rgba(255,255,255,.84)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;list-style:none;padding:0}
.grid a{position:relative;display:block;aspect-ratio:3/4;border-radius:16px;overflow:hidden;color:#fff;text-decoration:none;font:800 16px Unbounded,"Noto Sans Thai",sans-serif}
.grid img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.grid a::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(7,6,12,0) 45%,rgba(7,6,12,.85))}
.grid span{position:absolute;left:12px;right:12px;bottom:12px;z-index:1}
.end{text-align:center;padding:30px 0 10px}footer{max-width:760px;margin:0 auto;padding:18px 20px 40px;font-size:13px;color:rgba(255,255,255,.55);display:flex;flex-wrap:wrap;gap:6px 16px}footer a{color:rgba(255,255,255,.75);text-decoration:none}`;

export const footerHtml = (lang) => (lang === 'th'
  ? '<footer><a href="/">หน้าแรก</a><a href="/bangkok/">ย่านในกรุงเทพฯ</a><a href="/locals/">Kring Locals</a><a href="/partners/">สำหรับร้าน</a><a href="/safety">ความปลอดภัย</a><a href="/terms">ข้อกำหนด</a><a href="/privacy">ความเป็นส่วนตัว</a></footer>'
  : '<footer><a href="/en/">Home</a><a href="/en/bangkok/">Bangkok areas</a><a href="/locals/">Kring Locals</a><a href="/partners/">For venues</a><a href="/safety">Safety</a><a href="/terms">Terms</a><a href="/privacy">Privacy</a></footer>');
export const endCta = (lang) => (lang === 'th'
  ? '<div class="end"><a class="btn" href="/app/?join=1">เปิดกริ๊ง! →</a><span class="sub">ฟรี · LINE หรืออีเมล · 20+</span></div>'
  : '<div class="end"><a class="btn" href="/app/?join=1">Open Kring →</a><span class="sub">Free · LINE or email · 20+</span></div>');

// ── one Reel ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
export function reelPage(r, more, lang) {
  const th = lang === 'th';
  const place = placeName(r, lang);
  const area = areaName(r.area, lang);
  const slug = slugForArea(r.area);
  const url = `${ORIGIN}${reelPath(r.short, lang)}`;
  const poster = `${ORIGIN}${posterPath(r.short)}`;
  const caption = String(r.caption || '').trim();
  const title = th ? `${place} · รีลโดย ${r.name} · กริ๊ง!` : `${place} · Reel by ${r.name} · Kring`;
  const fallback = th ? `รีลจาก${place} ย่าน${area} กรุงเทพฯ โดย ${r.name} สมาชิกกริ๊ง! แอปหาเพื่อนใหม่ในกรุงเทพฯ`
    : `A Reel from ${place}, ${area}, Bangkok, by ${r.name} on Kring, the Bangkok app for making new friends.`;
  const desc = (caption ? `${caption.replace(/\s+/g, ' ').slice(0, 140)}${caption.length > 140 ? '…' : ''} · ${place}` : fallback).slice(0, 200);
  const date = fmtDate(r.at, lang);
  const bc = [
    { name: 'Kring', item: `${ORIGIN}${th ? '/' : '/en/'}` },
    { name: th ? 'ย่านในกรุงเทพฯ' : 'Bangkok areas', item: `${ORIGIN}${th ? '/bangkok/' : '/en/bangkok/'}` },
    ...(slug ? [{ name: th ? AREAS[slug].th : AREAS[slug].en, item: `${ORIGIN}${areaPath(slug, lang)}` }] : []),
    { name: place, item: url },
  ];
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'VideoObject', '@id': `${url}#video`, name: title.replace(/ · (กริ๊ง!|Kring)$/, ''), description: desc,
      thumbnailUrl: [poster], uploadDate: new Date(r.at).toISOString(), duration: isoDuration(r.dur),
      contentUrl: `${ORIGIN}${videoPath(r.short)}`, url, inLanguage: th ? 'th' : 'en', isFamilyFriendly: true,
      width: Number(r.w) || undefined, height: Number(r.h) || undefined,
      contentLocation: { '@type': 'Place', name: r.place_en || place, address: { '@type': 'PostalAddress', addressLocality: 'Bangkok', addressRegion: r.area || 'Bangkok', addressCountry: 'TH' } },
      creator: { '@type': 'Person', name: r.name },
      publisher: { '@type': 'Organization', name: 'Kring', url: ORIGIN, logo: { '@type': 'ImageObject', url: `${ORIGIN}/icon-512.png` } } },
    { '@type': 'BreadcrumbList', itemListElement: bc.map((b, i) => ({ '@type': 'ListItem', position: i + 1, name: b.name, item: b.item })) },
  ] };
  const others = more.filter((m) => m.short !== r.short).slice(0, 6);
  const moreTitle = slug ? (th ? `รีลอื่นจากย่าน${AREAS[slug].th}` : `More Reels from ${AREAS[slug].en}`) : (th ? 'รีลอื่นในกรุงเทพฯ' : 'More Reels in Bangkok');
  const w = Number(r.w) || 720; const h = Number(r.h) || 1280;
  return `<!doctype html>
<html lang="${th ? 'th' : 'en'}">
<head>
<meta charset="utf-8"/><meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/>
<title>${esc(title)}</title>
<meta content="${esc(desc)}" name="description"/>
<link href="${url}" rel="canonical"/>
<link href="${ORIGIN}${reelPath(r.short, 'th')}" hreflang="th" rel="alternate"/>
<link href="${ORIGIN}${reelPath(r.short, 'en')}" hreflang="en" rel="alternate"/>
<link href="${ORIGIN}${reelPath(r.short, 'th')}" hreflang="x-default" rel="alternate"/>
<meta content="#07060c" name="theme-color"/><link href="/icon-192.png" rel="icon" sizes="192x192" type="image/png"/>
<meta content="video.other" property="og:type"/><meta content="Kring" property="og:site_name"/><meta content="${th ? 'th_TH' : 'en_US'}" property="og:locale"/>
<meta content="${url}" property="og:url"/><meta content="${esc(title)}" property="og:title"/><meta content="${esc(desc)}" property="og:description"/>
<meta content="${poster}" property="og:image"/><meta content="${w}" property="og:image:width"/><meta content="${h}" property="og:image:height"/>
<meta content="summary_large_image" name="twitter:card"/>
<link as="image" href="${posterPath(r.short)}" rel="preload"/>
<script type="application/ld+json">${ldJson(ld)}</script>
<style>${BASE_CSS}
.reel{display:grid;gap:22px;padding-top:76px}@media(min-width:760px){.reel{grid-template-columns:minmax(0,380px) 1fr;align-items:start}}
.vid{position:relative;border-radius:22px;overflow:hidden;background:#15131f;aspect-ratio:${w}/${h};max-height:78vh;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 20px 60px rgba(139,92,255,.25)}
.vid video,.vid img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block}
.meta .bc{margin-bottom:12px}.who{margin-top:10px;font-size:15px;color:rgba(255,255,255,.75)}.who b{color:#fff}
.cap{margin-top:16px;white-space:pre-line;font-size:17px;color:rgba(255,255,255,.92);border-left:3px solid #ff4fd8;padding-left:14px;overflow-wrap:anywhere}
.meta h1{font-size:clamp(26px,7vw,40px)}</style>
</head>
<body>
<div class="top"><a class="logo" href="${th ? '/' : '/en/'}">${th ? 'กริ๊ง<i>!</i>' : 'Kring<i>!</i>'}</a><a class="lg" href="${reelPath(r.short, th ? 'en' : 'th')}" hreflang="${th ? 'en' : 'th'}">${th ? 'EN' : 'ไทย'}</a></div>
<main>
<article class="reel">
<div class="vid"><video controls playsinline preload="none" poster="${posterPath(r.short)}" width="${w}" height="${h}" aria-label="${esc(title)}"><source src="${videoPath(r.short)}" type="video/mp4"/></video></div>
<div class="meta">
<p class="bc">${bc.slice(0, -1).map((b) => `<a href="${b.item.replace(ORIGIN, '')}">${esc(b.name === 'Kring' ? (th ? 'หน้าแรก' : 'Home') : b.name)}</a>`).join(' › ')}</p>
<h1>${esc(place)}</h1>
<p class="who">${th ? 'รีลโดย' : 'Reel by'} <b>${esc(r.name)}</b> · ${esc(area)}${date ? ` · <time datetime="${esc(new Date(r.at).toISOString())}">${esc(date)}</time>` : ''}</p>
${caption ? `<p class="cap">${esc(caption)}</p>` : ''}
<a class="btn" href="/r/${r.short}" rel="nofollow">${th ? 'ดูในกริ๊ง! →' : 'Watch in Kring →'}</a>
<span class="sub">${th ? 'ฟรี · LINE หรืออีเมล · 20+' : 'Free · LINE or email · 20+'}</span>
</div>
</article>
${others.length ? `<section><h2>${esc(moreTitle)}</h2>${cardsHtml(others, lang)}</section>` : ''}
${endCta(lang)}
</main>
${WR_CSS}
${footerHtml(lang)}
</body>
</html>`;
}

// ── a built area page (areas without a hand-written page) ─────────────────────────────────────────────────────────────────
export function areaPage(slug, reels, lang) {
  const a = AREAS[slug];
  const th = lang === 'th';
  const name = th ? a.th : a.en;
  const url = `${ORIGIN}${areaPath(slug, lang)}`;
  const title = th ? `หาเพื่อนใหม่ย่าน${name} กรุงเทพฯ · กริ๊ง!` : `Make new friends in ${name}, Bangkok · Kring`;
  const intro = th ? a.introTh : a.introEn;
  const desc = th ? `${intro} ดูรีลจากสมาชิกกริ๊ง! ในย่าน${name}` : `${intro} See Reels from Kring members in ${name}.`;
  const hero = reels[0] ? posterPath(reels[0].short) : '/assets/hoods/bangkok.webp';
  const heroAbs = reels[0] ? `${ORIGIN}${hero}` : `${ORIGIN}/assets/hoods/og-bangkok.jpg`;
  const ld = { '@context': 'https://schema.org', '@graph': [
    { '@type': 'BreadcrumbList', itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Kring', item: `${ORIGIN}${th ? '/' : '/en/'}` },
      { '@type': 'ListItem', position: 2, name: th ? 'ย่านในกรุงเทพฯ' : 'Bangkok areas', item: `${ORIGIN}${th ? '/bangkok/' : '/en/bangkok/'}` },
      { '@type': 'ListItem', position: 3, name, item: url }] },
    ...(reels.length ? [{ '@type': 'ItemList', name: th ? `รีลจากย่าน${name}` : `Reels from ${name}`,
      itemListElement: reels.map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: `${ORIGIN}${reelPath(r.short, lang)}` })) }] : []),
  ] };
  return `<!doctype html>
<html lang="${th ? 'th' : 'en'}">
<head>
<meta charset="utf-8"/><meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/>
<title>${esc(title)}</title>
<meta content="${esc(desc)}" name="description"/>
${reels.length ? '' : '<meta content="noindex" name="robots"/>\n'}<link href="${url}" rel="canonical"/>
<link href="${ORIGIN}${areaPath(slug, 'th')}" hreflang="th" rel="alternate"/>
<link href="${ORIGIN}${areaPath(slug, 'en')}" hreflang="en" rel="alternate"/>
<link href="${ORIGIN}${areaPath(slug, 'th')}" hreflang="x-default" rel="alternate"/>
<meta content="#07060c" name="theme-color"/><link href="/icon-192.png" rel="icon" sizes="192x192" type="image/png"/>
<meta content="website" property="og:type"/><meta content="Kring" property="og:site_name"/><meta content="${th ? 'th_TH' : 'en_US'}" property="og:locale"/><meta content="${url}" property="og:url"/>
<meta content="${esc(title)}" property="og:title"/><meta content="${esc(desc)}" property="og:description"/><meta content="${heroAbs}" property="og:image"/>
<meta content="summary_large_image" name="twitter:card"/>
<link as="image" href="${hero}" rel="preload"/>
<script type="application/ld+json">${ldJson(ld)}</script>
<style>${BASE_CSS}</style>
</head>
<body>
<div class="top"><a class="logo" href="${th ? '/' : '/en/'}">${th ? 'กริ๊ง<i>!</i>' : 'Kring<i>!</i>'}</a><a class="lg" href="${areaPath(slug, th ? 'en' : 'th')}" hreflang="${th ? 'en' : 'th'}">${th ? 'EN' : 'ไทย'}</a></div>
<header class="hero"><img alt="${esc(th ? `ย่าน${name} กรุงเทพฯ` : `${name}, Bangkok`)}" fetchpriority="high" src="${hero}"/><div class="in"><p class="bc"><a href="${th ? '/' : '/en/'}">${th ? 'หน้าแรก' : 'Home'}</a> › <a href="${th ? '/bangkok/' : '/en/bangkok/'}">${th ? 'ย่านในกรุงเทพฯ' : 'Bangkok areas'}</a></p><h1>${th ? `หาเพื่อนใหม่ย่าน<em>${esc(name)}</em>` : `Make new friends in <em>${esc(name)}</em>`}</h1><p class="lead">${esc(intro)}</p><a class="btn" href="/app/?join=1">${th ? 'เปิดกริ๊ง! →' : 'Open Kring →'}</a><span class="sub">${th ? 'ฟรี · LINE หรืออีเมล · 20+' : 'Free · LINE or email · 20+'}</span></div></header>
<main>
${reels.length ? reelsSection(reels, lang, th ? `รีลล่าสุดจากย่าน${name}` : `Latest Reels from ${name}`)
    : `<section><p>${th ? `ยังไม่มีรีลจากย่าน${esc(name)}บนเว็บ เปิดกริ๊ง! แล้วโพสต์รีลแรกของย่านนี้` : `No Reels from ${esc(name)} on the web yet. Open Kring and post the first one.`}</p></section>`}
${endCta(lang)}
</main>
${WR_CSS}
${footerHtml(lang)}
</body>
</html>`;
}

// ── handlers shared by /bangkok/* and /en/bangkok/* ──────────────────────────────────────────────────────────────────────
export async function areaHandler(ctx, lang) {
  const { request, params, env } = ctx;
  if (request.method !== 'GET' && request.method !== 'HEAD') return ctx.next();
  const parts = (Array.isArray(params.path) ? params.path : params.path ? [params.path] : []).filter(Boolean);
  const th = lang === 'th';
  const url = new URL(request.url);
  if (parts.length === 0) {   // the /bangkok/ index: latest Reels from all of Bangkok + the built areas that have Reels
    const res = await ctx.next();
    if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const [html, reels] = await Promise.all([res.text(), getReels(env, { limit: 12 })]);
    const built = Object.keys(AREAS).filter((s) => !AREAS[s].stat && reels.some((r) => AREAS[s].kr.includes(r.area)));
    const chips = built.length ? `<ul class="wr-chips">${built.map((s) => `<li><a href="${areaPath(s, lang)}">${esc(th ? AREAS[s].th : AREAS[s].en)}</a></li>`).join('')}</ul>` : '';
    const block = reels.length ? reelsSection(reels, lang, th ? 'รีลล่าสุดจากกรุงเทพฯ' : 'Latest Reels from Bangkok').replace('</section>', `${chips}</section>`) : '';
    return htmlResponse(request.method === 'HEAD' ? null : injectIntoMain(html, block, block ? WR_CSS : ''));
  }
  const slug = parts[0].toLowerCase();
  const a = AREAS[slug];
  if (!a || parts.length > 1) return ctx.next();
  if (a.stat) {
    if (!url.pathname.endsWith('/')) return ctx.next();   // the static page's own /bangkok/ari → /bangkok/ari/ redirect
    const res = await ctx.next();
    if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('text/html')) return res;
    const [html, reels] = await Promise.all([res.text(), getReels(env, { areas: a.kr, limit: 12 })]);
    const block = reelsSection(reels, lang, th ? `รีลล่าสุดจากย่าน${a.th}` : `Latest Reels from ${a.en}`);
    return htmlResponse(request.method === 'HEAD' ? null : injectIntoMain(html, block, block ? WR_CSS : ''));
  }
  if (!url.pathname.endsWith('/')) return new Response(null, { status: 308, headers: { Location: `${url.pathname}/`, ...SEC_HEADERS } });
  const reels = await getReels(env, { areas: a.kr, limit: 24 });
  return htmlResponse(request.method === 'HEAD' ? null : areaPage(slug, reels, lang), 200, reels.length ? {} : { 'X-Robots-Tag': 'noindex' });
}

export async function reelHandler(ctx, lang) {
  const { request, params, env } = ctx;
  const short = String(params.short || '').toLowerCase();
  const gone = () => htmlResponse(`<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${lang === 'th' ? 'ไม่พบรีลนี้ · กริ๊ง!' : 'Reel not found · Kring'}</title><style>${BASE_CSS}</style></head><body><main style="padding-top:90px"><h1>${lang === 'th' ? 'ไม่พบรีลนี้' : 'This Reel is not here'}</h1><p class="lead">${lang === 'th' ? 'รีลนี้อาจถูกลบ หรือเจ้าของปิดการแสดงบนเว็บแล้ว' : 'It may have been removed, or its owner turned off showing it on the web.'}</p><a class="btn" href="${lang === 'th' ? '/bangkok/' : '/en/bangkok/'}">${lang === 'th' ? 'ดูรีลอื่น →' : 'See other Reels →'}</a></main></body></html>`,
    404, { 'X-Robots-Tag': 'noindex', 'Cache-Control': 'public, max-age=60' });
  if (!/^[a-z0-9]{6,10}$/.test(short)) return gone();
  const [r] = await getReels(env, { short, limit: 1 });
  if (!r) return gone();
  const slug = slugForArea(r.area);
  const more = await getReels(env, { areas: slug ? AREAS[slug].kr : null, limit: 7 });
  return htmlResponse(request.method === 'HEAD' ? null : reelPage(r, more, lang));
}

// ── poster / video bytes of a PUBLIC Reel ─────────────────────────────────────────────────────────────────────────────────
const TYPES = { mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png' };
const OK_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(mp4|webm|mov|jpg|jpeg|webp|png)$/;
const deny = (status) => new Response(null, { status, headers: { 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' } });

export async function mediaHandler(ctx) {
  const { request, params, env, waitUntil } = ctx;
  if (request.method !== 'GET' && request.method !== 'HEAD') return deny(405);
  const short = String(params.short || '').toLowerCase();
  const file = String(params.file || '');
  const kind = file === 'poster.jpg' ? 'poster' : file === 'video.mp4' ? 'video' : null;
  if (!kind || !/^[a-z0-9]{6,10}$/.test(short)) return deny(404);
  const svc = env && env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svc) return deny(404);
  const m = await getMedia(env, short);
  const path = m && m[kind];
  if (!path || !OK_PATH.test(path)) return deny(404);
  const supa = (env && env.SUPABASE_URL) || SUPA_LIVE;
  const src = `${supa}/storage/v1/object/authenticated/kr8-reels/${path}`;
  const auth = { apikey: svc, Authorization: `Bearer ${svc}` };
  const ext = path.split('.').pop().toLowerCase();
  // browsers/Google may keep it 10 minutes, so an opt-out is honoured quickly; the bytes themselves stay in the edge cache by path
  const CC = 'public, max-age=600';
  const cache = caches.default;
  const objKey = `${ORIGIN}/__webreelmedia/${path}`;
  const range = request.headers.get('range');
  const hit = await cache.match(new Request(objKey, { headers: range ? { Range: range } : {} }));
  const out = (body, status, h) => {
    const hh = new Headers();
    for (const k of ['content-type', 'content-length', 'content-range']) { const v = h.get(k); if (v) hh.set(k, v); }
    if (!hh.get('content-type')) hh.set('Content-Type', TYPES[ext] || 'application/octet-stream');
    hh.set('Cache-Control', CC); hh.set('Accept-Ranges', 'bytes'); hh.set('X-Content-Type-Options', 'nosniff');
    return new Response(request.method === 'HEAD' ? null : body, { status, headers: hh });
  };
  if (hit) return out(hit.body, hit.status, hit.headers);
  const fill = () => waitUntil((async () => {
    try {
      const f = await fetch(src, { headers: auth });
      if (!f.ok) return;
      const hh = new Headers({ 'Content-Type': f.headers.get('content-type') || TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=2592000', 'Accept-Ranges': 'bytes' });
      const l = f.headers.get('content-length'); if (l) hh.set('Content-Length', l);
      await cache.put(new Request(objKey), new Response(f.body, { status: 200, headers: hh }));
    } catch { /* the next viewer fills it */ }
  })());
  if (range) {
    const part = await fetch(src, { headers: { ...auth, Range: range } });
    if (part.status !== 206 && part.status !== 200) return deny(part.status === 404 || part.status === 400 ? 404 : 502);
    if (/^bytes=0-/.test(range)) fill();
    return out(part.body, part.status, part.headers);
  }
  const full = await fetch(src, { headers: auth });
  if (!full.ok) return deny(full.status === 404 || full.status === 400 ? 404 : 502);
  const [a, b] = full.body.tee();
  const ch = new Headers({ 'Content-Type': full.headers.get('content-type') || TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'public, max-age=2592000', 'Accept-Ranges': 'bytes' });
  const len = full.headers.get('content-length'); if (len) ch.set('Content-Length', len);
  waitUntil(cache.put(new Request(objKey), new Response(a, { status: 200, headers: ch })));
  return out(b, 200, full.headers);
}

// ── /sitemap-reels.xml ───────────────────────────────────────────────────────────────────────────────────────────────────
export async function sitemap(env) {
  const reels = await getReels(env, { limit: 1000 });
  const day = (iso) => { try { return new Date(iso).toISOString().slice(0, 10); } catch { return ''; } };
  const alt = (th, en) => `<xhtml:link rel="alternate" hreflang="th" href="${th}"/><xhtml:link rel="alternate" hreflang="en" href="${en}"/><xhtml:link rel="alternate" hreflang="x-default" href="${th}"/>`;
  const urls = [];
  for (const r of reels) {
    const th = `${ORIGIN}${reelPath(r.short, 'th')}`; const en = `${ORIGIN}${reelPath(r.short, 'en')}`;
    const video = `<video:video><video:thumbnail_loc>${ORIGIN}${posterPath(r.short)}</video:thumbnail_loc><video:title>${esc(`${placeName(r, 'en')} · Reel by ${r.name}`)}</video:title><video:description>${esc((r.caption || `A Reel from ${placeName(r, 'en')}, Bangkok`).slice(0, 2000))}</video:description><video:content_loc>${ORIGIN}${videoPath(r.short)}</video:content_loc>${r.dur ? `<video:duration>${Math.max(1, Math.round(r.dur / 1000))}</video:duration>` : ''}<video:publication_date>${new Date(r.at).toISOString()}</video:publication_date><video:family_friendly>yes</video:family_friendly></video:video>`;
    for (const u of [th, en]) urls.push(`<url><loc>${u}</loc><lastmod>${day(r.at)}</lastmod>${alt(th, en)}${video}</url>`);
  }
  for (const s of Object.keys(AREAS).filter((s) => !AREAS[s].stat && reels.some((r) => AREAS[s].kr.includes(r.area)))) {
    const th = `${ORIGIN}${areaPath(s, 'th')}`; const en = `${ORIGIN}${areaPath(s, 'en')}`;
    const last = reels.find((r) => AREAS[s].kr.includes(r.area));
    for (const u of [th, en]) urls.push(`<url><loc>${u}</loc><lastmod>${day(last.at)}</lastmod>${alt(th, en)}</url>`);
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:video="http://www.google.com/schemas/sitemap-video/1.1">
${urls.join('\n')}
</urlset>
`;
}
