// Growth (0113) proof shots: the REAL admin page from the local dev server (tools/prize_ui/dev.sh), signed in as a fake admin.
// kr8_admin_growth answers come from the REAL 0113 function run on a throwaway LOCAL Postgres (stub_schema.sql + seed_local.sql),
// exported to JSON files (g1/g7/g30.json). Every host other than the local dev server is aborted; nothing reaches live or TEST.
//   bash tools/prize_ui/dev.sh &   node tools/growth/shots.mjs <json dir> <out dir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const pw = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const ORIGIN = 'http://127.0.0.1:5317', APP = `${ORIGIN}/app/`;
const [jdir, out] = [process.argv[2], process.argv[3] || '/tmp/growth'];
fs.mkdirSync(out, { recursive: true });
const G = Object.fromEntries([1, 7, 30].map((d) => [d, JSON.parse(fs.readFileSync(path.join(jdir, `g${d}.json`), 'utf8'))]));
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
await page.goto(`${APP}admin.html`);   // no hash: must open on Growth
await page.waitForSelector('#grHero', { timeout: 20000 });
await page.waitForTimeout(1200);
const shot = async (name) => { await page.screenshot({ path: path.join(out, name) }); console.log('shot', name); };
await shot('GROWTH_01_top.png');
await page.evaluate(() => { const n = document.querySelector('.gr-sec:nth-of-type(2)') || document.getElementById('grFunnel'); n?.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); });
await page.locator('#grFunnelInfo').evaluate((n) => { n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
await page.waitForTimeout(400);
await shot('GROWTH_02_funnel_sources.png');
await page.locator('#grRefInfo').evaluate((n) => { n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
await page.waitForTimeout(400);
await shot('GROWTH_03_recruiter_links.png');
await page.locator('#grCtyInfo').evaluate((n) => { n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -80); });
await page.waitForTimeout(400);
await shot('GROWTH_04_countries.png');
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('#grP1'); await page.waitForTimeout(900);
await shot('GROWTH_05_today.png');
await page.click('#grP30'); await page.waitForTimeout(900);
await shot('GROWTH_06_30_days.png');
await page.goto(`${APP}admin.html#more`); await page.waitForTimeout(1500);
await shot('GROWTH_07_more_has_board.png');
const dock = await page.$$eval('.v2bar nav a', (a) => a.map((x) => x.textContent.trim()));
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
console.log(JSON.stringify({ dock, overflow, errs, blocked: [...new Set(blocked)], calls: [...new Set(calls)] }));
await browser.close();
