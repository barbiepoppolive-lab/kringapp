// PRIZE_UI_BOARD.png: one picture-first contact sheet of the weekly-prize UI (real app screenshots + phone dings).
// Usage: node tools/prize_ui/board.mjs <screens dir> <notifications dir> <out png>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const pw = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const [S, N, OUT] = [process.argv[2], process.argv[3], process.argv[4]];
const f = (dir, n) => `file://${path.join(dir, n)}`;
const font = (fam, file, w) => `@font-face{font-family:'${fam}';font-weight:${w};src:url('file://${ROOT}/public/fonts/${file}') format('woff2');}`;

const phone = (src, cap, sub = '', cls = '') => `<figure class="ph ${cls}"><img src="${src}"><figcaption><b>${cap}</b>${sub ? `<span>${sub}</span>` : ''}</figcaption></figure>`;
const strip = (src, cap) => `<figure class="st"><div class="crop" style="background-image:url('${src}')"></div><figcaption><b>${cap}</b></figcaption></figure>`;
const ding = (src, en) => `<figure class="dg"><img src="${src}"><figcaption><span>${en}</span></figcaption></figure>`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
${font('Bricolage', 'bricolage-7.woff2', 500)}${font('Bricolage', 'bricolage-7.woff2', 800)}${font('Anuphan', 'anuphan-1.woff2', 500)}${font('Anuphan', 'anuphan-1.woff2', 700)}
*{box-sizing:border-box;margin:0;padding:0}
body{width:1520px;background:#0B0A12;color:#FFF7EC;font-family:'Bricolage','Anuphan',sans-serif;-webkit-font-smoothing:antialiased;padding:56px 60px 64px}
header{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:34px}
h1{font:800 44px/1.05 'Bricolage','Anuphan';letter-spacing:-.02em}
h1 small{display:block;font:700 22px/1.4 'Anuphan';color:rgba(255,247,236,.62);letter-spacing:0;margin-top:6px}
.note{font:500 15px/1.5 'Bricolage';color:rgba(255,247,236,.55);text-align:right}
h2{font:800 22px 'Bricolage','Anuphan';margin:40px 0 16px;display:flex;gap:12px;align-items:baseline}
h2 span{font:500 16px 'Bricolage';color:rgba(255,247,236,.5)}
.row{display:flex;gap:26px;align-items:flex-start}
figure{margin:0}
figcaption{margin-top:10px;font:500 15px/1.35 'Bricolage','Anuphan';color:rgba(255,247,236,.62)}
figcaption b{display:block;font:800 16px/1.3 'Bricolage','Anuphan';color:#FFF7EC;margin-bottom:2px}
.ph figcaption{width:330px}
.ph img{display:block;width:330px;border-radius:34px;box-shadow:0 0 0 1px rgba(255,255,255,.08),0 22px 50px -24px rgba(122,92,255,.45)}
.ph.sm img{width:262px;border-radius:28px}
.ph.sm figcaption{width:262px}
.st .crop{width:500px;height:114px;border-radius:22px;background-size:500px auto;background-position:0 0;box-shadow:0 0 0 1px rgba(255,255,255,.08)}
.grid2{display:grid;grid-template-columns:500px 500px;gap:22px 26px}
.dg img{display:block;width:216px;border-radius:26px;box-shadow:0 0 0 1px rgba(255,255,255,.08)}
.dg figcaption{width:216px;font-size:13.5px}
.dings{display:flex;gap:18px}
.sep{width:1px;background:rgba(255,247,236,.1);margin:0 8px}
.lab{font:800 16px 'Bricolage';margin-bottom:10px;color:rgba(255,247,236,.8)}
footer{margin-top:44px;padding-top:18px;border-top:1px solid rgba(255,247,236,.1);font:500 15px/1.5 'Bricolage';color:rgba(255,247,236,.5)}
</style></head><body>
<header>
  <div><h1>Weekly prize, inside the real app<small>รางวัลประจำสัปดาห์ · บนฟีดและหน้า ฉัน</small></h1></div>
  <div class="note">Local build on test data · Pixel 7 + iPhone 14, 2×<br>Nothing deployed · live app untouched</div>
</header>

<h2>Me tab <span>race card under “This week” · iPhone 14</span></h2>
<div class="row">
  ${phone(f(S, 'iphone14_A_me.png'), 'A · Mon–Wed, no Rings yet', 'New week · Top 8 win TrueMoney')}
  ${phone(f(S, 'iphone14_B_me.png'), 'B · Thu–Sun, pride first', 'Your Bangkok, for the whole world to see')}
  ${phone(f(S, 'iphone14_C_me.png'), 'C · the gap', '4 Rings to #2 · ฿900 · up 2 places')}
  ${phone(f(S, 'iphone14_C25_me.png'), 'Under 25 Rings', '10 Rings to 25, then in the running')}
</div>

<h2>Feed <span>slim ticker beside the weather · Pixel 7 · the line under it is the week passing</span></h2>
<div class="row">
  ${phone(f(S, 'pixel7_C_feed.png'), 'Feed stays clean', 'One quiet line at the top, tap → Ranking')}
  <div class="grid2">
    ${strip(f(S, 'pixel7_A_feed.png'), 'A · Top 8 win TrueMoney')}
    ${strip(f(S, 'pixel7_B_feed.png'), 'B · #1 of the week gets ฿1,500')}
    ${strip(f(S, 'pixel7_C_feed.png'), 'C · 4 Rings to #2')}
    ${strip(f(S, 'pixel7_C25_feed.png'), 'Under 25 · 10 Rings to 25')}
    ${strip(f(S, 'pixel7_LAST_feed.png'), 'Last 6 hours · live countdown, line pulses')}
    ${strip(f(S, 'pixel7_TOP_feed.png'), '#1 · pride line')}
  </div>
</div>

<h2>Moments <span>last hours · #1 · small phone · tap</span></h2>
<div class="row" style="gap:22px">
  ${phone(f(S, 'pixel7_LAST_me.png'), 'Sunday 19:12', 'Seconds count down, dot pulses', 'sm')}
  ${phone(f(S, 'pixel7_TOP_me.png'), 'At #1', 'Pride line, ฿1,500', 'sm')}
  ${phone(f(S, 'a360_C_me.png'), '360 px Android', 'Same card, nothing cut', 'sm')}
  ${phone(f(S, 'iphone14_C_thaiUI_me.png'), 'App in Thai', 'Banner stays Thai + English', 'sm')}
  ${phone(f(S, 'pixel7_C_tap_opens_ranking.png'), 'Tap', 'Opens Me → This week · Ranking', 'sm')}
</div>

<h2>Phone dings <span>Thai on the phone, English under · Kring icon from the app</span></h2>
<div class="dings">
  <div><div class="lab">iPhone</div><div class="row" style="gap:18px">
    ${ding(f(N, 'notif_ios_mon_th.png'), 'Mon 10:00 · A new week of Rings starts now. Top 8 win TrueMoney · #1 ฿1,500 · closes Sunday night')}
    ${ding(f(N, 'notif_ios_thu_th.png'), 'Thu 19:00 · Halfway there · you’re #5. 7 Rings to move up; every outside open = 5 Rings')}
    ${ding(f(N, 'notif_ios_sun_th.png'), 'Sun 18:00 · 6 hours left · 4 Rings short. Board closes at midnight, Bangkok time')}
  </div></div>
  <div class="sep"></div>
  <div><div class="lab">Android</div><div class="row" style="gap:18px">
    ${ding(f(N, 'notif_android_mon_th.png'), 'Mon 10:00 · start of the week')}
    ${ding(f(N, 'notif_android_thu_th.png'), 'Thu 19:00 · mid-week nudge')}
    ${ding(f(N, 'notif_android_sun_th.png'), 'Sun 18:00 · last hours')}
  </div></div>
</div>

<footer>Videos (≤8 s each): anim_1_spring_in · anim_2_number_tick · anim_3_prize_shimmer · anim_4_countdown_pulse. English lock screens: notifications/notif_*_en.png.</footer>
</body></html>`;

fs.writeFileSync(path.join(path.dirname(OUT), '_board.html'), html);
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1520, height: 1000 }, deviceScaleFactor: 2 });
await ctx.route('**/*', (r) => (r.request().url().startsWith('file://') ? r.continue() : r.abort()));
const page = await ctx.newPage();
await page.goto(`file://${path.join(path.dirname(OUT), '_board.html')}`);
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
await page.screenshot({ path: OUT, fullPage: true });
await browser.close();
fs.rmSync(path.join(path.dirname(OUT), '_board.html'));
console.log(OUT);
