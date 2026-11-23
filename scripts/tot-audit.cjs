/**
 * Visual audit of the whole This-or-That flow (24 Nov). Not part of the app build.
 *
 * Renders the shipped ThisOrThatCard and the shipped CSS at phone size, through its real RPC wiring (Playwright
 * fulfils the kr8_* calls), and walks it through every state a member actually sees. Vote images are proxied to
 * the live site so the pictures are the genuine ones.
 *
 *   node scripts/tot-audit.cjs <harness-dir> <out-dir>
 */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const dir = path.resolve(process.argv[2] || 'dist');
const out = process.argv[3] || '/mnt/user-data/outputs';
const PORT = 5601;
const LIVE = 'https://kringapp.com/app/';

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

const pair = {
  kind: 'pair', q_en: 'Aircon at 25°C or 18°C?', q_th: 'แอร์ 25 องศา หรือ 18 องศา?',
  a_en: '25°C', a_th: '25 องศา', a_img: 'tot-aircon-25.jpg',
  b_en: '18°C', b_th: '18 องศา', b_img: 'tot-aircon-18.jpg',
  c_en: null, c_th: null, img: null,
};
const presets = {
  a: [{ k: 'a1', en: 'The bill would kill me', th: 'ค่าไฟไม่ไหว' },
      { k: 'a2', en: 'I get cold easily', th: 'ขี้หนาว' },
      { k: 'a3', en: 'A fan is enough', th: 'พัดลมก็พอ' }],
  b: [{ k: 'b1', en: 'Bangkok is boiling', th: 'กรุงเทพร้อนจะตาย' },
      { k: 'b2', en: 'Cold air plus a blanket is bliss', th: 'ห่มผ้าแล้วฟินสุด' },
      { k: 'b3', en: 'I sleep better', th: 'นอนหลับสบายกว่า' }],
};
const tasks = (vote) => ({ on: true, day: '2026-11-24', verified: true, max: 11, rings_today: 1,
  tasks: [{ id: 'vote', rings: 1, done: !!vote.pick, claimed: !!vote.pick, vote }] });

const noReasons = { day: '2026-11-24', voted: true, my_pick: 'a', presets, reasons: [] };
const mineOwn = { day: '2026-11-24', voted: true, my_pick: 'a', presets,
  reasons: [{ id: 'r1', pick: 'a', key: null, own_words: true, ups: 0, mine: true, upvoted: false, name: 'Rocker', photo: null,
    en: 'My landlord bills 8 baht a unit, no thanks', th: 'เจ้าของห้องคิดหน่วยละ 8 บาท ไม่ไหว' }] };
const busyReasons = { day: '2026-11-24', voted: true, my_pick: 'a', presets,
  reasons: [{ id: 'r9', pick: 'a', key: 'a1', own_words: false, ups: 12, mine: false, upvoted: false, name: 'ใบเตย', photo: null,
      en: 'The bill would kill me', th: 'ค่าไฟไม่ไหว' },
    { id: 'r1', pick: 'a', key: null, own_words: true, ups: 2, mine: true, upvoted: false, name: 'Rocker', photo: null,
      en: 'My landlord bills 8 baht a unit', th: 'เจ้าของห้องคิดหน่วยละ 8 บาท' }] };
const streakNew = { current: 0, best: 0, days: 0, hits: 0, through: '2026-11-23', last: [] };
const streakRun = { current: 4, best: 6, days: 9, hits: 7, through: '2026-11-23',
  last: ['2026-11-23', '2026-11-22', '2026-11-21', '2026-11-20', '2026-11-19', '2026-11-18', '2026-11-17']
    .map((day, i) => ({ day, hit: i < 4 || i === 5, mine: 'a', majority: i < 4 || i === 5 ? 'a' : 'b' })) };

// each scenario: what the RPCs answer, and what to do on the page before the shot
const SHOTS = [
  { name: 'audit-1-before-vote', lang: 'en', vote: { ...pair, pick: null, pct: null }, reasons: noReasons, streak: streakNew, wait: 1200 },
  { name: 'audit-2-just-voted', lang: 'en', vote: { ...pair, pick: null, pct: null }, voted: { ...pair, pick: 'a', pct: { a: 100, b: 0, n: 1 } },
    reasons: noReasons, streak: streakNew, click: '.toth-side[data-side="a"], .toth-half[data-side="a"]', wait: 900 },
  { name: 'audit-3-folded-no-reason', lang: 'en', vote: { ...pair, pick: 'a', pct: { a: 100, b: 0, n: 1 } }, reasons: noReasons, streak: streakNew, wait: 3000 },
  { name: 'audit-4-own-words-open', lang: 'en', vote: { ...pair, pick: 'a', pct: { a: 100, b: 0, n: 1 } }, reasons: noReasons, streak: streakNew,
    wait: 3000, own: 'My landlord bills 8 baht a unit' },
  { name: 'audit-5-busy-day', lang: 'en', vote: { ...pair, pick: 'a', pct: { a: 62, b: 38, n: 34 } }, reasons: busyReasons, streak: streakRun, wait: 3000 },
  { name: 'audit-6-busy-thai', lang: 'th', vote: { ...pair, pick: 'a', pct: { a: 62, b: 38, n: 34 } }, reasons: busyReasons, streak: streakRun, wait: 3000 },
  { name: 'audit-7-before-vote-thai', lang: 'th', vote: { ...pair, pick: null, pct: null }, reasons: noReasons, streak: streakNew, wait: 1200 },
];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/tot-harness.html';
  // the two vote pictures live on the real site — proxy so the audit shows the genuine card
  if (p.startsWith('/media/places/')) {
    https.get(LIVE + p.slice(1), (r) => { res.writeHead(r.statusCode || 200, { 'content-type': r.headers['content-type'] || 'image/jpeg' }); r.pipe(res); })
      .on('error', () => { res.writeHead(502); res.end('x'); });
    return;
  }
  const f = path.join(dir, p);
  if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  for (const s of SHOTS) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    let voted = false;
    await page.route('**/rest/v1/rpc/**', (route) => {
      const fn = route.request().url().split('/rpc/')[1].split('?')[0];
      let body = null;
      if (fn === 'kr8_tasks_today') body = tasks(voted && s.voted ? s.voted : s.vote);
      else if (fn === 'kr8_task_vote') { voted = true; body = tasks(s.voted || s.vote); }
      else if (fn === 'kr8_task_vote_who') body = [];
      else if (fn === 'kr8_task_streak') body = s.streak;
      else if (fn.startsWith('kr8_task_reason')) body = s.reasons;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.goto(`http://127.0.0.1:${PORT}/tot-harness.html?lang=${s.lang}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    if (s.click) { const el = page.locator(s.click).first(); if (await el.count()) await el.click({ force: true }); }
    await page.waitForTimeout(s.wait);
    if (s.own) {
      const chip = page.locator('.tor-chip.own').first();
      if (await chip.count()) { await chip.click(); await page.waitForTimeout(350); await page.locator('.tor-in').fill(s.own); await page.waitForTimeout(250); }
    }
    await page.screenshot({ path: path.join(out, `${s.name}.png`) });
    await ctx.close();
    console.log('shot', s.name);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
