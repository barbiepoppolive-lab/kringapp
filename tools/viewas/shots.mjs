// View as member (0110) proof shots: the REAL local build (vite dev, tools/prize_ui/dev.sh) — admin page + the member app framed
// inside it — on a LOCAL fake backend. Every host other than the local dev server is aborted; nothing reaches live or test.
// The admin's own sign-in sits in the browser's real storage the whole time, to prove the frame never uses it.
//   bash tools/prize_ui/dev.sh &   node tools/viewas/shots.mjs <out dir>
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { APP, CAST, FAKE, MEDIA, ORIGIN, seed } from '../prize_ui/fake_kring.mjs';

const require = createRequire(import.meta.url);
const pw = require(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const out = process.argv[2] || '/tmp/viewas';
fs.mkdirSync(out, { recursive: true });

const ADMIN = '6f1c2b1e-0000-4000-8000-00000000a001', MEM = '6f1c2b1e-0000-4000-8000-00000000a002', NEW = '6f1c2b1e-0000-4000-8000-00000000a003';
const jwt = (sub) => { const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url'); return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: 1798761600 })}.sig`; };
const sess = (sub, email) => ({ access_token: jwt(sub), token_type: 'bearer', expires_in: 3600, expires_at: 1798761600, refresh_token: 'r-' + sub,
  user: { id: sub, aud: 'authenticated', role: 'authenticated', email, app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } });
const EMAIL = { member: 'mirror-member@kringapp.com', newmember: 'mirror-new@kringapp.com' };
const SUB_OF = { [EMAIL.member]: MEM, [EMAIL.newmember]: NEW };

const base = seed('C');
const memberRpc = { ...base.rpc };
const card = { ...memberRpc.kr8_me.card, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-18T03:00:00Z', promo_ok: true, first_name: 'Mirror', photo: `${ORIGIN}/app/icon-512.png`, ig_handle: null, bio: '' };
memberRpc.kr8_me = { ...memberRpc.kr8_me, card, posts: 0 };
memberRpc.kr8_profile = { ...memberRpc.kr8_profile, user_id: MEM, first_name: 'Mirror', photo: card.photo, ig_handle: null, bio: '', reels: [], followers: 0, following: 0, likes: 0 };
memberRpc.kr8_card_extras = { ...memberRpc.kr8_card_extras, member_no: null, ig_handle: null, week: 0, week_rank: null, has_reel: false, lifetime: 0 };
memberRpc.kr8_member_reels = { user_id: MEM, mine: true, best: null, reels: [] };
memberRpc.kr8_my_ghost = false;
const newRpc = { ...base.rpc, kr8_me: { card: null, hellos_today: 0, posts: 0, answers_today: 0, blocked: [] }, kr8_profile: null, kr8_card_extras: null, kr8_my_ghost: false };
const visitorRpc = { kr8_feed: base.rpc.kr8_feed, kr8_feed_ranked: base.rpc.kr8_feed, kr8_weekly_ranking: base.rpc.kr8_weekly_ranking, kr8_treats_live: [], kr8_listings_live: [], kr8_top10: [] };
const snapshot = { at: new Date().toISOString(), day_start: '2026-11-17T18:30:00Z', week_start: '2026-11-15T17:00:00Z', include_test: false,
  counts: { real: 61, real_today: 2, test: 3, team: 1, ghost: 2, admin: 1, nocard: 0 }, people: [], claims: [], codes: [],
  board: { week_start: '2026-11-15', paid_ranks: 8, floor: 25, rows: [] }, pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [] };
const state = { bugs: [], calls: [], writesFromFrame: [], adminSessionSeenInFrame: false };
const adminRpc = (fn, args) => {
  if (fn === 'kr8_is_admin') return true;
  if (fn === 'kr8_admin_v2_snapshot') return snapshot;
  if (fn === 'kr8_admin_mirror_signin') return { persona: args.p_persona, email: EMAIL[args.p_persona], password: 'one-time-' + args.p_persona };
  if (fn === 'kr8_admin_bug_spots') return state.bugs.filter((b) => b.status === 'open');
  if (fn === 'kr8_admin_bug_spot_add') { const id = 'bug' + (state.bugs.length + 1); state.bugs.unshift({ id, at: new Date().toISOString(), note: args.p_note, persona: args.p_persona,
    lang: args.p_lang, viewport: args.p_viewport, route: args.p_route, x: args.p_x, y: args.p_y, shot: args.p_shot, status: 'open', handled_at: null }); return id; }
  if (fn === 'kr8_admin_help_cases' || fn === 'kr8_admin_places_auto') return [];
  return null;
};
const subOf = (req) => { const a = req.headers()['authorization'] || ''; try { return JSON.parse(Buffer.from(a.split(' ')[1].split('.')[1], 'base64url').toString()).sub; } catch { return null; } };

async function wire(context) {
  const blocked = [];
  await context.route('**/*', async (route) => {
    const req = route.request(); const u = new URL(req.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (u.hostname === 'api.open-meteo.com') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ current: { temperature_2m: 31, apparent_temperature: 35, precipitation: 0, weather_code: 1 }, hourly: { precipitation_probability: Array(24).fill(10) } }) });
    if (u.origin !== ORIGIN) { blocked.push(u.hostname); return route.abort(); }
    if (!u.pathname.startsWith('/__fake/')) return route.continue();
    const p = u.pathname.slice('/__fake'.length);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (p.startsWith('/media/faces/')) { const f = path.join(MEDIA, 'faces', p.split('/').pop()); return fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'image/jpeg' }) : route.fulfill({ status: 404 }); }
    if (p.startsWith('/auth/v1/token')) {
      const body = JSON.parse(req.postData() || '{}');
      if (body.email) { const sub = SUB_OF[body.email]; return sub && body.password?.startsWith('one-time-') ? json(sess(sub, body.email)) : json({ error: 'invalid_grant' }, 400); }
      const sub = (body.refresh_token || '').replace(/^r-/, ''); return json(sess(sub, sub === ADMIN ? 'admin@kringapp.com' : 'mirror'));
    }
    if (p.startsWith('/auth/v1/user')) { const s = subOf(req); return s ? json(sess(s, '').user) : json({}, 401); }
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (p.startsWith('/auth/v1/settings')) return json({ external: { google: false, email: true } });
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop(); const sub = subOf(req); let args = {}; try { args = JSON.parse(req.postData() || '{}'); } catch { /* none */ }
      const fromFrame = !!req.frame()?.parentFrame();
      state.calls.push(`${fromFrame ? 'frame' : 'admin'}:${sub ? sub.slice(-4) : 'anon'}:${fn}`);
      if (fromFrame && sub === ADMIN) state.adminSessionSeenInFrame = true;
      if (fromFrame && /_(toggle|like|save_card|checkin|touch|log_|send|create|claim|follow)/.test(fn)) state.writesFromFrame.push(fn);
      const d = sub === ADMIN ? null : sub === MEM ? memberRpc : sub === NEW ? newRpc : visitorRpc;
      return json(d === null ? adminRpc(fn, args) : fn in d ? d[fn] : null);
    }
    if (p.startsWith('/rest/v1/')) return json([]);
    if (p.startsWith('/storage/v1/object/sign/kr8-reels') && req.method() === 'POST') {
      let paths = []; try { paths = JSON.parse(req.postData() || '{}').paths || []; } catch { /* none */ }
      return json(paths.map((x) => ({ path: x, signedURL: `/object/sign/kr8-reels/${x}?token=local`, error: null })));
    }
    if (p.startsWith('/storage/v1/object/')) { const f = path.join(MEDIA, p.split('/').pop()); return fs.existsSync(f) ? route.fulfill({ path: f, contentType: f.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg' }) : route.fulfill({ status: 404 }); }
    return route.fulfill({ status: 404, body: '' });
  });
  return blocked;
}

const browser = await pw.chromium.launch();
async function adminPage(view, prefs) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: 2, locale: 'en-US', timezoneId: 'Asia/Kolkata', serviceWorkers: 'block', hasTouch: view.width < 600, isMobile: view.width < 600 });
  const blocked = await wire(ctx);
  const adminSess = JSON.stringify(sess(ADMIN, 'admin@kringapp.com'));
  await ctx.addInitScript(([s, p]) => { try { if (window.top === window) { localStorage.setItem('kr8-v5-auth', s); localStorage.setItem('kr8_lang', 'en'); for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v); } } catch { /* */ } }, [adminSess, prefs]);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e).slice(0, 200)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) page.errs.push('console: ' + m.text().slice(0, 400)); });
  return { ctx, page, blocked };
}
const settle = async (page, ms = 1500) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(ms); };
async function frameReady(page, sel) {
  const f = page.frameLocator('#vaFrame');
  await f.locator(sel).first().waitFor({ timeout: 20000 }).catch((e) => console.log('frame wait', sel, e.message.split('\n')[0]));
  await page.waitForTimeout(1800);
}
const DESK = { width: 1440, height: 900 }, PHONE = { width: 390, height: 844 };
const shots = [];
const shot = async (page, name) => { const f = path.join(out, name); await page.screenshot({ path: f }); shots.push(f); };

for (const [view, suf] of (process.env.ONLY_DESK ? [[DESK, '']] : [[DESK, ''], [PHONE, '_phone']])) {
  // 01 Member · English · iPhone
  state.bugs.length = 0;
  let { ctx, page } = await adminPage(view, { 'kr8-va-p': 'member', 'kr8-va-l': 'en', 'kr8-va-s': '390x844' });
  await page.goto(`${APP}admin.html#viewas`); await settle(page);
  await frameReady(page, 'nav.dock');
  await shot(page, `VIEWAS_01_member_en${suf}.png`);
  const iso = await page.frames().find((fr) => fr.parentFrame())?.evaluate(() => ({ mirror: window.__kr8Mirror, keys: Object.keys(localStorage), realAdmin: localStorage.getItem('kr8-v5-auth') }));
  const top = await page.evaluate(() => ({ admin: !!localStorage.getItem('kr8-v5-auth'), mirrorKeyLeaked: !!localStorage.getItem('kr8-mirror-auth'), lang: localStorage.getItem('kr8_lang') }));
  console.log('isolation', suf, JSON.stringify(iso), JSON.stringify(top));
  // 04 Spot a bug (desktop + phone): tap the Board/Ranking area, type a line, before Save
  await page.click('#vaSpot'); await page.waitForTimeout(300);
  const box = await page.locator('#vaTap').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.32);
  await page.fill('#vaNote', 'Prize line text is cut off on the right');
  await page.waitForTimeout(300);
  await shot(page, `VIEWAS_04_spot_bug${suf}.png`);
  await page.click('#vaSave');
  await page.waitForSelector('#vaToast', { timeout: 15000 }).catch(() => console.log('no toast'));
  await page.waitForTimeout(400);
  // 05 Needs you with the bug case
  await page.evaluate(() => document.getElementById('vaToast')?.remove());
  await page.goto(`${APP}admin.html#inbox`); await settle(page, 2500);
  await page.locator('#v2Bugs').scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(500);
  await shot(page, `VIEWAS_05_needs_you_bug_case${suf}.png`);
  console.log('errors', suf, page.errs);
  await ctx.close();

  // 02 Visitor · Thai
  ({ ctx, page } = await adminPage(view, { 'kr8-va-p': 'visitor', 'kr8-va-l': 'th', 'kr8-va-s': '390x844' }));
  await page.goto(`${APP}admin.html#viewas`); await settle(page);
  await frameReady(page, 'nav.dock, button');
  await shot(page, `VIEWAS_02_visitor_th${suf}.png`);
  await ctx.close();

  // 03 New member · English · Android 360
  ({ ctx, page } = await adminPage(view, { 'kr8-va-p': 'newmember', 'kr8-va-l': 'en', 'kr8-va-s': '360x780' }));
  await page.goto(`${APP}admin.html#viewas`); await settle(page);
  await frameReady(page, 'button');
  await page.waitForTimeout(1500);
  await shot(page, `VIEWAS_03_newmember${suf}.png`);
  await ctx.close();
}
console.log('frame writes that reached the backend:', state.writesFromFrame);
console.log('admin session used inside the frame:', state.adminSessionSeenInFrame);
console.log('frame calls:', [...new Set(state.calls.filter((c) => c.startsWith('frame')))].join(' '));
await browser.close();
console.log(shots.join('\n'));
