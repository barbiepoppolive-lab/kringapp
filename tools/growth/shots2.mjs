// Growth day by day (0114) proof shots: the REAL admin page from the local dev server (tools/prize_ui/dev.sh), signed in as a fake admin.
// kr8_admin_growth answers come from the REAL 0113 function run on a throwaway LOCAL Postgres (stub_schema.sql + seed_local.sql),
// exported to JSON files (g1/g7/g30.json). Every host other than the local dev server is aborted; nothing reaches live or TEST.
//   bash tools/prize_ui/dev.sh &   node tools/growth/shots2.mjs <json dir> <out dir>   (ORIGIN=http://127.0.0.1:<port> when 5317 is busy)
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const pw = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const ORIGIN = process.env.ORIGIN || 'http://127.0.0.1:5317', APP = `${ORIGIN}/app/`;
const [jdir, out] = [process.argv[2], process.argv[3] || '/tmp/growth'];
fs.mkdirSync(out, { recursive: true });
const G = Object.fromEntries([1, 7, 30].map((d) => [d, JSON.parse(fs.readFileSync(path.join(jdir, `g${d}.json`), 'utf8'))]));
const J = (f) => { const p = path.join(jdir, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : null; };
const ADMIN = '6f1c2b1e-0000-4000-8000-00000000a001';
const jwt = (sub) => { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: 1798761600 })}.sig`; };
const sess = { access_token: jwt(ADMIN), token_type: 'bearer', expires_in: 3600, expires_at: 1798761600, refresh_token: 'r-' + ADMIN,
  user: { id: ADMIN, aud: 'authenticated', role: 'authenticated', email: 'admin@kringapp.com', app_metadata: { provider: 'email' }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
const snapshot = { at: new Date().toISOString(), day_start: '2026-11-17T18:30:00Z', week_start: '2026-11-15T17:00:00Z', include_test: false,
  counts: { real: 61, real_today: 2, test: 3, team: 1, ghost: 2, admin: 1, nocard: 0 }, people: [], claims: [], codes: [],
  board: { week_start: '2026-11-15', paid_ranks: 8, floor: 25, rows: [] }, pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [] };
const calls = []; const blocked = [];
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Asia/Kolkata', serviceWorkers: 'block', hasTouch: true, isMobile: true });
await ctx.route('**/*', async (route) => {
  const req = route.request(); const u = new URL(req.url());
  if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  if (u.origin !== ORIGIN) { blocked.push(u.hostname); return route.abort(); }
  if (!u.pathname.startsWith('/__fake/')) return route.continue();
  const p = u.pathname.slice('/__fake'.length);
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (p.startsWith('/auth/v1/token')) return json(sess);
  if (p.startsWith('/auth/v1/user')) return json(sess.user);
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.split('/').pop(); let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
    calls.push(fn);
    if (fn === 'kr8_admin_growth') return json(G[args.p_days] || G[7]);
    if (fn === 'kr8_admin_growth_day') return json(J(`day_${args.p_day}.json`));
    if (fn === 'kr8_admin_growth_daily') return json(J(`daily_${args.p_from}_${args.p_to}.json`));
    if (fn === 'kr8_is_admin') return json(true);
    if (fn === 'kr8_admin_v2_snapshot') return json(snapshot);
    if (/places_auto|help_cases|bug_spots|dups_auto/.test(fn)) return json([]);
    return json(null);
  }
  if (p.startsWith('/rest/v1/')) return json([]);
  return route.fulfill({ status: 404, body: '' });
});
await ctx.addInitScript((s) => { try { localStorage.setItem('kr8-v5-auth', s); localStorage.setItem('kr8_lang', 'en'); localStorage.setItem('kr8-v2-gp', '7'); } catch { /* */ } }, JSON.stringify(sess));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
const shot = async (name) => { await page.screenshot({ path: path.join(out, name) }); console.log('shot', name); };
const top = () => page.evaluate(() => window.scrollTo(0, 0));
// 1 · 7 days: the Day by day table sits right under the top card
await page.goto(`${APP}admin.html`);
await page.waitForSelector('#grDaily .gr-tr[data-day]', { timeout: 20000 });
await page.waitForTimeout(800);
await page.locator('#grDailyInfo').evaluate((n) => { n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -16); });
await page.waitForTimeout(400);
await shot('GROWTH2_table_EN.png');
// 2 · tap yesterday's row → the Day view of that day
const yday = await page.$eval('#grDaily a.gr-tr[data-day]:nth-of-type(2)', (a) => a.dataset.day);
await page.click(`#grDaily .gr-tr[data-day="${yday}"]`);
await page.waitForSelector('#grDayNav', { timeout: 10000 }); await page.waitForSelector('#grHero:not(.gr-dim)'); await page.waitForTimeout(900);
console.log('day hash', await page.evaluate(() => location.hash), 'title', await page.$eval('.gr-dayname b', (b) => b.textContent));
await top(); await shot('GROWTH2_day_EN.png');
// 3 · ‹ steps one day back; › comes back; › is off on today
await page.click('#grPrevDay'); await page.waitForTimeout(900);
console.log('after prev', await page.evaluate(() => location.hash));
await shot('GROWTH2_day_prev_EN.png');
await page.goto(`${APP}admin.html#growth/2026-11-18`); await page.waitForTimeout(1500);
console.log('today next disabled', await page.$eval('#grNextDay', (b) => b.disabled));
await shot('GROWTH2_day_today_EN.png');
// 4 · 30 days table (first 10 rows + "earlier days")
await page.goto(`${APP}admin.html#growth`); await page.waitForTimeout(800);
await page.click('#grP30'); await page.waitForSelector('#grDailyMore', { timeout: 10000 }); await page.waitForTimeout(600);
await page.locator('#grDailyInfo').evaluate((n) => { n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -16); });
await page.waitForTimeout(400);
await shot('GROWTH2_table30_EN.png');
await page.click('#grP1'); await page.waitForTimeout(900);
console.log('today view has table', !!(await page.$('#grDaily')));
const dock = await page.$$eval('.v2bar nav a', (a) => a.map((x) => x.textContent.trim()));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ dock, overflow, errs, blocked: [...new Set(blocked)], calls: [...new Set(calls)] }));
await browser.close();
