/**
 * Screenshot the real This-or-That card (24 Nov). Not part of the app build.
 *
 * Serves the harness build and intercepts every Supabase RPC, so the shipped component and the shipped CSS render
 * against fixtures that match today's live shape — one vote in, the member's own reason written in their own words.
 *
 *   node scripts/tot-shots.cjs <harness-dir> <out-dir>
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium, devices } = require('playwright');

const dir = path.resolve(process.argv[2] || 'dist');
const out = process.argv[3] || '/mnt/user-data/outputs';
const PORT = 5599;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

const vote = {
  kind: 'pair', q_en: 'Aircon at 25°C or 18°C?', q_th: 'แอร์ 25 องศา หรือ 18 องศา?',
  a_en: '25°C', a_th: '25 องศา', a_img: 'tot-aircon-25.jpg',
  b_en: '18°C', b_th: '18 องศา', b_img: 'tot-aircon-18.jpg',
  c_en: null, c_th: null, img: null, pick: 'a', pct: { a: 100, b: 0, n: 1 },
};
const presets = {
  a: [{ k: 'a1', en: 'The bill would kill me', th: 'ค่าไฟไม่ไหว' },
      { k: 'a2', en: 'I get cold easily', th: 'ขี้หนาว' },
      { k: 'a3', en: 'A fan is enough', th: 'พัดลมก็พอ' }],
  b: [{ k: 'b1', en: 'Bangkok is boiling', th: 'กรุงเทพร้อนจะตาย' },
      { k: 'b2', en: 'Cold air plus a blanket is bliss', th: 'ห่มผ้าแล้วฟินสุด' },
      { k: 'b3', en: 'I sleep better', th: 'นอนหลับสบายกว่า' }],
};
// the state the founder asked for: the member typed their own reason instead of tapping a preset
const reasons = {
  day: '2026-11-24', voted: true, my_pick: 'a', presets,
  reasons: [{ id: 'r1', pick: 'a', key: null, own_words: true, ups: 0, mine: true, upvoted: false,
    name: 'Rocker', photo: null, en: 'My landlord bills 8 baht a unit, no thanks', th: 'เจ้าของห้องคิดหน่วยละ 8 บาท ไม่ไหว' }],
};
const streak = { current: 1, best: 3, days: 4, hits: 1, through: '2026-11-23',
  last: [{ day: '2026-11-23', hit: true, mine: 'a', majority: 'a' }, { day: '2026-11-22', hit: false, mine: 'a', majority: 'b' },
         { day: '2026-11-21', hit: false, mine: 'b', majority: 'a' }, { day: '2026-11-20', hit: false, mine: null, majority: 'a' }] };

const BODIES = {
  kr8_tasks_today: { on: true, day: '2026-11-24', verified: true, max: 11, rings_today: 1,
    tasks: [{ id: 'vote', rings: 1, done: true, claimed: true, vote }] },
  kr8_task_vote_who: [],
  kr8_task_reasons_today: reasons,
  kr8_task_reason: reasons,
  kr8_task_reason_up: reasons,
  kr8_task_streak: streak,
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/tot-harness.html';
  const f = path.join(dir, p);
  if (!f.startsWith(path.resolve(dir)) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const browser = await chromium.launch();
  const shots = [['wired2-390.png', 390, 844], ['wired2-412.png', 412, 915]];
  for (const [name, w, h] of shots) {
    const ctx = await browser.newContext({ ...devices['Pixel 7'], viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true });
    const page = await ctx.newPage();
    await page.route('**/rest/v1/rpc/**', (route) => {
      const fn = route.request().url().split('/rpc/')[1].split('?')[0];
      const body = Object.prototype.hasOwnProperty.call(BODIES, fn) ? BODIES[fn] : null;
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    // the vote images are served live; let them through to the real site so the card is the genuine one
    await page.goto(`http://127.0.0.1:${PORT}/tot-harness.html?lang=en`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    // open the own-words box so the screenshot shows the thing that was added
    const own = page.locator('.tor-chip.own');
    if (await own.count()) { await own.first().click(); await page.waitForTimeout(400);
      await page.locator('.tor-in').fill('My landlord bills 8 baht a unit'); await page.waitForTimeout(300); }
    await page.screenshot({ path: path.join(out, name) });
    await ctx.close();
    console.log('shot', name);
  }
  await browser.close();
  server.close();
})().catch((e) => { console.error(e); process.exit(1); });
