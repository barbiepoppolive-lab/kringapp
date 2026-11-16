// Weekly-prize push preview: the three dings (founder copy pack §2) on an iOS and an Android lock screen.
// Web push as Kring sends it (public/sw.js): title + body, icon /app/icon-192.png, badge /app/badge-96.png.
// Thai on the phones (what a Thai member sees); the English goes under each phone on the board.
// Usage: node tools/prize_ui/lockscreens.mjs <out dir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const pw = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const PUB = path.join(ROOT, 'public');
const MEDIA = process.env.KR8_DEMO_MEDIA || '/mnt/attach/outputs/app_demo_v2_src/public/media/demo';
const out = process.argv[2] || '/tmp/prize_notif';
fs.mkdirSync(out, { recursive: true });
const tmp = path.join(out, '_src');
fs.mkdirSync(tmp, { recursive: true });

// wallpapers: Bangkok at dusk (approved demo media), sized and lightly sharpened for a 2× phone screen
const WP = {
  ios: { src: path.join(MEDIA, 'skypark.jpg'), w: 780, h: 1688 },
  android: { src: path.join(MEDIA, 'dusit.jpg'), w: 824, h: 1830 },
};
for (const [k, v] of Object.entries(WP)) {
  const f = path.join(tmp, `wp_${k}.jpg`);
  execFileSync('convert', [v.src, '-resize', `${v.w}x${v.h}^`, '-gravity', 'center', '-extent', `${v.w}x${v.h}`, '-unsharp', '0x0.9+0.6+0', '-quality', '92', f]);
  v.file = f;
}

/** The three notifications, word for word (sample {rank} = 5, {n} = 7 and 4). */
export const DINGS = [
  { key: 'mon', day: 'Monday 23 November', dShort: 'Mon, 23 Nov', time: '10:00', when: 'Mon 10:00 · start',
    th: { t: 'สัปดาห์ใหม่ เริ่มนับริงแล้ว 🔔', b: 'ลงรีลกรุงเทพฯ ของคุณ ท็อป 8 รับ TrueMoney · ที่ 1 ฿1,500 · ปิดคืนวันอาทิตย์' },
    en: { t: 'A new week of Rings starts now 🔔', b: 'Post your Bangkok Reel. Top 8 win TrueMoney · #1 ฿1,500 · closes Sunday night' } },
  { key: 'thu', day: 'Thursday 26 November', dShort: 'Thu, 26 Nov', time: '19:00', when: 'Thu 19:00 · mid-week',
    th: { t: 'ครึ่งทางแล้ว ตอนนี้คุณที่ 5', b: 'อีก 7 ริงขึ้นอีกขั้น แชร์ลิงก์รีลลง IG ทุกคนที่เปิดจากข้างนอก = 5 ริง' },
    en: { t: 'Halfway there · you’re #5', b: '7 Rings to move up. Share your Reel link on IG: every outside open = 5 Rings' } },
  { key: 'sun', day: 'Sunday 29 November', dShort: 'Sun, 29 Nov', time: '18:00', when: 'Sun 18:00 · last hours',
    th: { t: 'เหลือ 6 ชม. · ขาดอีก 4 ริง ⏳', b: 'บอร์ดปิดเที่ยงคืนนี้ เวลาไทย · ติดท็อป 8 กดรับในแอปครั้งเดียว' },
    en: { t: '6 hours left · 4 Rings short ⏳', b: 'The board closes at midnight, Bangkok time · Top 8 claim in the app with one tap' } },
];

const font = (fam, file, w) => `@font-face{font-family:'${fam}';font-weight:${w};src:url('file://${PUB}/fonts/${file}') format('woff2');}`;
const FONTS = [
  font('Thai Looped', 'noto-sans-thai-looped-thai-400-normal.woff2', 400), font('Thai Looped', 'noto-sans-thai-looped-thai-600-normal.woff2', 600),
  font('Thai Looped', 'noto-sans-thai-looped-thai-700-normal.woff2', 700),
  font('Thai Sans', 'noto-sans-thai-thai-400-normal.woff2', 400), font('Thai Sans', 'noto-sans-thai-thai-500-normal.woff2', 500),
  font('Thai Sans', 'noto-sans-thai-thai-600-normal.woff2', 600),
].join('\n');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const ICON = `file://${PUB}/icon-192.png`;
const BADGE = `file://${PUB}/badge-96.png`;

const sig = (c = '#fff') => `<svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="${c}"/><rect x="5" y="5.5" width="3" height="6.5" rx="1" fill="${c}"/><rect x="10" y="3" width="3" height="9" rx="1" fill="${c}"/><rect x="15" y="0" width="3" height="12" rx="1" fill="${c}"/></svg>`;
const wifi = (c = '#fff') => `<svg width="16" height="12" viewBox="0 0 16 12"><path d="M8 11.2 5.6 8.6a3.4 3.4 0 0 1 4.8 0zM3.4 6.4a6.5 6.5 0 0 1 9.2 0l-1.2 1.3a4.8 4.8 0 0 0-6.8 0zM1 4a9.9 9.9 0 0 1 14 0l-1.2 1.2a8.2 8.2 0 0 0-11.6 0z" fill="${c}"/></svg>`;
const batt = (pct) => `<svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.6" fill="none" stroke="rgba(255,255,255,.4)"/><rect x="2" y="2" width="${(20 * pct) / 100}" height="9" rx="2.2" fill="#fff"/><path d="M25 4.4v4.2c.8-.3 1.4-1.1 1.4-2.1s-.6-1.8-1.4-2.1z" fill="rgba(255,255,255,.45)"/></svg>`;

function ios(d) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
  *{box-sizing:border-box;margin:0;padding:0} html,body{width:390px;height:844px;overflow:hidden;background:#000}
  body{font-family:'Inter','Thai Looped',sans-serif;-webkit-font-smoothing:antialiased;color:#fff;position:relative}
  .wp{position:absolute;inset:0;background:url('file://${WP.ios.file}') center/cover}
  .wp::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.32) 0%,rgba(0,0,0,.05) 34%,rgba(0,0,0,0) 55%,rgba(0,0,0,.30) 100%)}
  .sb{position:absolute;top:0;left:0;right:0;height:54px;display:flex;align-items:center;justify-content:space-between;padding:4px 30px 0 34px;font:600 16px 'Inter';letter-spacing:-.2px}
  .sb .r{display:flex;gap:6px;align-items:center}
  .di{position:absolute;top:11px;left:50%;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000}
  .lock{position:absolute;top:62px;left:50%;margin-left:-7px}
  .date{position:absolute;top:92px;left:0;right:0;text-align:center;font:600 21px 'Inter Display','Inter';letter-spacing:-.1px;color:rgba(255,255,255,.88)}
  .clock{position:absolute;top:110px;left:0;right:0;text-align:center;font:600 104px/1 'Inter Display','Inter';letter-spacing:-3px;color:rgba(255,255,255,.93)}
  .nt{position:absolute;left:8px;right:8px;bottom:118px;border-radius:24px;padding:14px 15px 15px 14px;display:flex;gap:11px;
    background:rgba(36,36,40,.55);backdrop-filter:blur(26px) saturate(170%);-webkit-backdrop-filter:blur(26px) saturate(170%);box-shadow:0 1px 0 rgba(255,255,255,.08) inset}
  .nt img{width:38px;height:38px;border-radius:9px;flex:none;margin-top:1px}
  .nt .c{flex:1;min-width:0}
  .nt .h{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
  .nt .t{font:600 15px/1.32 'Inter','Thai Looped';letter-spacing:-.15px}
  .nt .tm{font:400 13px 'Inter';color:rgba(255,255,255,.55);flex:none}
  .nt .b{font:400 15px/1.34 'Inter','Thai Looped';letter-spacing:-.1px;color:rgba(255,255,255,.92);margin-top:1px}
  .qa{position:absolute;bottom:44px;width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:rgba(0,0,0,.32);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px)}
  .qa.l{left:46px}.qa.r{right:46px}
  .hi{position:absolute;bottom:8px;left:50%;width:134px;height:5px;margin-left:-67px;border-radius:3px;background:#fff}
  </style></head><body><div class="wp"></div>
  <div class="sb"><span>TRUE-H</span><span class="r">${sig()}${wifi()}${batt(78)}</span></div><div class="di"></div>
  <svg class="lock" width="14" height="18" viewBox="0 0 14 18"><rect x="1" y="7.5" width="12" height="9.5" rx="2.4" fill="#fff"/><path d="M3.6 7.6V5.2a3.4 3.4 0 0 1 6.8 0v2.4" fill="none" stroke="#fff" stroke-width="1.8"/></svg>
  <div class="date">${d.day}</div><div class="clock">${d.time}</div>
  <div class="nt"><img src="${ICON}"><div class="c"><div class="h"><div class="t">${esc(d.msg.t)}</div><div class="tm">now</div></div><div class="b">${esc(d.msg.b)}</div></div></div>
  <div class="qa l"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"><path d="M8 2h8l-1 6H9zM9 8h6v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/><path d="M12 12v3" stroke-linecap="round"/></svg></div>
  <div class="qa r"><svg width="24" height="22" viewBox="0 0 26 22" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6h4.5l2-3h7l2 3H23a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 23 20H3a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 3 6z"/><circle cx="13" cy="12.5" r="4.2"/></svg></div>
  <div class="hi"></div></body></html>`;
}

function android(d) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>${FONTS}
  *{box-sizing:border-box;margin:0;padding:0} html,body{width:412px;height:915px;overflow:hidden;background:#000}
  body{font-family:'Inter','Thai Sans',sans-serif;-webkit-font-smoothing:antialiased;color:#fff;position:relative}
  .wp{position:absolute;inset:0;background:url('file://${WP.android.file}') center/cover}
  .wp::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.45) 0%,rgba(0,0,0,.18) 30%,rgba(0,0,0,.25) 70%,rgba(0,0,0,.5) 100%)}
  .sb{position:absolute;top:0;left:0;right:0;height:40px;display:flex;align-items:center;justify-content:space-between;padding:6px 22px 0 24px;font:500 14px 'Inter'}
  .sb .r{display:flex;gap:7px;align-items:center}
  .ck{position:absolute;top:70px;left:24px;font:300 76px/1 'Poppins';letter-spacing:-1px}
  .dt{position:absolute;top:158px;left:26px;font:400 16px 'Inter';color:rgba(255,255,255,.92);display:flex;gap:10px;align-items:center}
  .nt{position:absolute;left:12px;right:12px;top:214px;border-radius:26px;padding:16px 16px 18px 14px;background:rgba(32,30,38,.93);box-shadow:0 2px 12px rgba(0,0,0,.25)}
  .row{display:flex;gap:12px}
  .ic{width:36px;height:36px;border-radius:50%;flex:none;background:#FF4FA3;display:grid;place-items:center}
  .ic img{width:24px;height:24px}
  .c{flex:1;min-width:0}
  .hd{display:flex;align-items:center;gap:6px;font:400 12.5px 'Inter';color:rgba(255,255,255,.62);height:20px}
  .hd b{font-weight:500;color:rgba(255,255,255,.82)}
  .ex{margin-left:auto;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,.1);display:grid;place-items:center}
  .tt{font:500 15.5px/1.38 'Inter','Thai Sans';margin-top:2px}
  .bd{font:400 14.5px/1.42 'Inter','Thai Sans';color:rgba(255,255,255,.74);margin-top:2px}
  .lg{width:44px;height:44px;border-radius:12px;flex:none;margin-top:22px}
  .fp{position:absolute;left:50%;bottom:118px;margin-left:-22px;width:44px;height:44px;display:grid;place-items:center;opacity:.9}
  .sc{position:absolute;bottom:34px;width:56px;height:56px;border-radius:50%;background:rgba(32,30,38,.75);display:grid;place-items:center}
  .sc.l{left:22px}.sc.r{right:22px}
  .lk{position:absolute;top:44px;left:50%;margin-left:-7px}
  </style></head><body><div class="wp"></div>
  <div class="sb"><span>TRUE-H</span><span class="r">${wifi()}${sig()}<span style="font:500 14px Inter;margin-left:2px">78%</span></span></div>
  <svg class="lk" width="14" height="17" viewBox="0 0 14 18"><rect x="1" y="7.5" width="12" height="9.5" rx="2.4" fill="#fff"/><path d="M3.6 7.6V5.2a3.4 3.4 0 0 1 6.8 0v2.4" fill="none" stroke="#fff" stroke-width="1.8"/></svg>
  <div class="ck">${d.time}</div>
  <div class="dt"><span>${d.dShort}</span><span>·</span><span>☁ 31°C</span></div>
  <div class="nt"><div class="row"><span class="ic"><img src="${BADGE}"></span><div class="c">
    <div class="hd"><b>Kring</b><span>•</span><span>kringapp.com</span><span>•</span><span>now</span>
      <span class="ex"><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 7.5 6 4.5l3 3" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span></div>
    <div class="tt">${esc(d.msg.t)}</div><div class="bd">${esc(d.msg.b)}</div></div>
    <img class="lg" src="${ICON}"></div></div>
  <div class="fp"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.3" stroke-linecap="round"><path d="M7.8 4.6A8 8 0 0 1 20 11.4v1.2M4.2 8.4A8 8 0 0 0 4 10.6v2.2M12 10.6v3.2c0 2.3.8 4.4 2.2 6.1M8.6 20.6a10.6 10.6 0 0 1-1.4-5.2v-3.2a4.8 4.8 0 0 1 9.6 0v2.2M17.4 18.6c-.3-1-.5-2-.6-3.1M20 15.6v.4"/></svg></div>
  <div class="sc l"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"><path d="M8 2h8l-1 6H9zM9 8h6v12a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z"/></svg></div>
  <div class="sc r"><svg width="24" height="22" viewBox="0 0 26 22" fill="none" stroke="#fff" stroke-width="1.7" stroke-linejoin="round"><path d="M3 6h4.5l2-3h7l2 3H23a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 23 20H3a1.5 1.5 0 0 1-1.5-1.5v-11A1.5 1.5 0 0 1 3 6z"/><circle cx="13" cy="12.5" r="4.2"/></svg></div>
  </body></html>`;
}

const browser = await pw.chromium.launch();
const made = [];
for (const lang of ['th', 'en']) {
  for (const d of DINGS) {
    for (const [os, fn, vp] of [['ios', ios, { width: 390, height: 844 }], ['android', android, { width: 412, height: 915 }]]) {
      const html = path.join(tmp, `${os}_${d.key}_${lang}.html`);
      fs.writeFileSync(html, fn({ ...d, msg: d[lang] }));
      const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 2 });
      await ctx.route('**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
      const page = await ctx.newPage();
      await page.goto(`file://${html}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      const png = path.join(out, `notif_${os}_${d.key}_${lang}.png`);
      await page.screenshot({ path: png });
      made.push(png);
      await ctx.close();
    }
  }
}
await browser.close();
console.log(made.join('\n'));
