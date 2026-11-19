// Admin clean-up (19 Nov) phone screenshots, 390×844, on a LOCAL fake backend (tools/admin_cleanup/fixture.mjs, SAMPLE data only).
// Every host other than the local dev server is aborted: nothing reaches the live or test database.
//   bash tools/admin_cleanup/dev.sh &   node tools/admin_cleanup/shots.mjs <out dir> <prefix>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN, APP, ORIGIN, adminRpc } from './fixture.mjs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PW || 'playwright');
const out = process.argv[2] || '/tmp/admin_cleanup';
const prefix = process.argv[3] || 'admin_';
fs.mkdirSync(out, { recursive: true });
const IMG = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../harness/img');

const jwt = (sub) => { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: 1798761600 })}.sig`; };
const sess = (sub, email) => ({ access_token: jwt(sub), token_type: 'bearer', expires_in: 3600, expires_at: 1798761600, refresh_token: 'r-' + sub,
  user: { id: sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
const calls = new Set();

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Asia/Kolkata', serviceWorkers: 'block', hasTouch: true, isMobile: true });
await ctx.route('**/*', async (route) => {
  const req = route.request(); const u = new URL(req.url());
  if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
  if (u.origin !== ORIGIN) return route.abort();
  if (!u.pathname.startsWith('/__fake/')) return route.continue();
  const p = u.pathname.slice('/__fake'.length);
  const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  if (p.startsWith('/auth/v1/token')) return json(sess(ADMIN, 'admin@kringapp.com'));
  if (p.startsWith('/auth/v1/user')) return json(sess(ADMIN, 'admin@kringapp.com').user);
  if (p.startsWith('/rest/v1/rpc/')) {
    const fn = p.split('/').pop(); let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
    calls.add(fn);
    const body = adminRpc(fn, args);
    if (body === undefined) return json({ message: 'not found' }, 404);
    return json(body);
  }
  if (p.startsWith('/rest/v1/')) return json([]);
  if (p.startsWith('/storage/v1/object/sign/') && req.method() === 'POST') {
    let paths = []; try { const b = JSON.parse(req.postData() || '{}'); paths = b.paths || []; } catch { /* none */ }
    const bucket = p.split('/')[5];
    return json(paths.map((x) => ({ path: x, signedURL: `/object/sign/${bucket}/${x}?token=local`, error: null })));
  }
  if (p.startsWith('/storage/v1/object/')) {
    const who = (p.match(/u(\d+)\//) || [])[1];
    const pick = { 150: 'yui', 130: 'lena', 126: 'ploy', 137: 'mint', 127: 'ton', 118: 'nat', 114: 'minjun', 56: 'minjun', 141: 'mint' }[who] || 'aom';
    return route.fulfill({ path: path.join(IMG, pick + '.jpg'), contentType: 'image/jpeg' });
  }
  return route.fulfill({ status: 404, body: '' });
});
const adminSess = JSON.stringify(sess(ADMIN, 'admin@kringapp.com'));
await ctx.addInitScript((s) => { try { localStorage.setItem('kr8-v5-auth', s); localStorage.setItem('kr8_lang', 'en'); localStorage.setItem('kr8-v2-if', 'all'); } catch { /* */ } }, adminSess);
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
const settle = async (ms = 1600) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(ms); };
const go = async (hash, ms) => { await page.goto(`${APP}admin.html${hash}`); await settle(ms); };
const shot = async (name, full = false) => { await page.screenshot({ path: path.join(out, `${prefix}${name}.png`), fullPage: full }); console.log('saved', `${prefix}${name}.png`); };
const scrollTo = async (sel) => { await page.evaluate((s) => { const n = document.querySelector(s); if (n) n.scrollIntoView({ block: 'start' }); window.scrollBy(0, -8); }, sel); await page.waitForTimeout(700); };

await go('#inbox', 2500);
await shot('needs_you');
await shot('needs_you_full', true);
await scrollTo('[data-item="c:c-held-127"]'); await shot('claim_card');
await scrollTo('[data-item="v:v150"]'); await shot('face_check_card');
await scrollTo('.k-lookalike'); await shot('lookalike_card');
await page.evaluate(() => { const d = document.getElementById('v2AlertFold'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); } }); await page.waitForTimeout(600);
await shot('alerts');
await shot('alerts_full', true);
await go('#today', 2000); await shot('today');
await go('#q/faces', 2500); await shot('face_queue'); await shot('face_queue_full', true);
await go('#more', 1200);
await page.evaluate(() => { const d = document.getElementById('moreTools'); if (d) d.open = true; }); await page.waitForTimeout(300);
await shot('more'); await shot('more_full', true);
await go('#m/6f1c2b1e-0000-4000-8000-000000000141', 2200); await shot('member');
await go('#dups', 2200); await shot('same_person', true);
console.log('rpc calls:', [...calls].sort().join(' '));
console.log('page errors:', errs.length ? errs : 'none');
await browser.close();
