// Dings end to end, locally, in Playwright Chromium (16 Nov). Usage:
//   node tools/push_e2e.mjs [site repo path]      (default /home/claude/kringapp_site_revamp; needs Chrome at $CHROME or /usr/bin/google-chrome)
// What runs for real: the ask card + push.ts subscribe flow, public/sw.js (push + notificationclick), and the site's sender
// (functions/api/push.js drain → push-core.js VAPID + aes128gcm) POSTing to a local push service that checks the VAPID JWT
// and decrypts the payload exactly like a browser's push service + browser would.
// What is mocked (no network): Supabase (kr8_push_subscribe / claim / done answered by an in-memory table), the browser's
// push-service subscription (headless Chrome has no FCM: PushManager.subscribe returns a subscription pointing at the local
// push service, with keys made in the page), and the hop push service → browser (CDP ServiceWorker.deliverPushMessage).
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.argv[2] || '/home/claude/kringapp_site_revamp';
const require = createRequire(path.join(ROOT, 'package.json'));
const { chromium } = require('playwright-core');
const core = await import(pathToFileURL(path.join(SITE, 'functions/_lib/push-core.js')).href);
const { drain } = await import(pathToFileURL(path.join(SITE, 'functions/api/push.js')).href);
const { b64u } = core;
const enc = new TextEncoder();
const log = (...a) => console.log('·', ...a);
const results = [];
const ok = (c, name) => { results.push([!!c, name]); console.log(c ? 'PASS' : 'FAIL', name); };

// ── a throwaway VAPID pair for this run (the real one never leaves the secrets file) ──
const vk = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const VAPID = { publicKey: b64u.enc(new Uint8Array(await crypto.subtle.exportKey('raw', vk.publicKey))), privateKey: (await crypto.subtle.exportKey('jwk', vk.privateKey)).d, subject: 'mailto:ops@kringapp.com' };

// ── local push service: checks VAPID, decrypts, then hands the plaintext to the browser over CDP ──
const PS_PORT = 5281, APP_PORT = 5282;
const PS = `http://127.0.0.1:${PS_PORT}`;
let subKeys = null;          // the page's subscription private key + auth (what the browser would hold)
let deliver = null;          // (plaintext) => Promise, set once the worker is up
const seenAtService = [];
const gone = new Set();
async function hk(salt, ikm, info, len) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, len * 8));
}
async function browserDecrypt(body) {
  const salt = body.slice(0, 16), idlen = body[20], asPub = body.slice(21, 21 + idlen), ct = body.slice(21 + idlen);
  const priv = await crypto.subtle.importKey('jwk', subKeys.jwk, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
  const as = await crypto.subtle.importKey('raw', asPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: as }, priv, 256));
  const ua = b64u.dec(subKeys.p256dh);
  const ikm = await hk(b64u.dec(subKeys.auth), shared, new Uint8Array([...enc.encode('WebPush: info\0'), ...ua, ...asPub]), 32);
  const key = await crypto.subtle.importKey('raw', await hk(salt, ikm, enc.encode('Content-Encoding: aes128gcm\0'), 16), 'AES-GCM', false, ['decrypt']);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: await hk(salt, ikm, enc.encode('Content-Encoding: nonce\0'), 12) }, key, ct));
  return new TextDecoder().decode(pt.slice(0, -1));
}
async function vapidValid(h) {
  const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(h || '');
  if (!m || m[4] !== VAPID.publicKey) return false;
  const claims = JSON.parse(new TextDecoder().decode(b64u.dec(m[2])));
  if (claims.aud !== PS || claims.exp * 1000 < Date.now()) return false;
  const pub = await crypto.subtle.importKey('raw', b64u.dec(m[4]), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub, b64u.dec(m[3]), enc.encode(`${m[1]}.${m[2]}`));
}
const pushService = http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = new Uint8Array(Buffer.concat(chunks));
  const id = req.url.split('/').pop();
  if (gone.has(id)) { res.writeHead(410).end(); return; }
  if (!(await vapidValid(req.headers.authorization))) { res.writeHead(401).end(); return; }
  if (req.headers['content-encoding'] !== 'aes128gcm' || !req.headers.ttl) { res.writeHead(400).end(); return; }
  try {
    const plain = await browserDecrypt(body);
    seenAtService.push(JSON.parse(plain));
    await deliver(plain);
    res.writeHead(201).end();
  } catch (e) { log('push service error', e.message); res.writeHead(400).end(); }
});
await new Promise((r) => pushService.listen(PS_PORT, '127.0.0.1', r));

// ── the app: vite dev server with base /app/ and a VAPID public key for this run ──
const vite = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), '--base', '/app/', '--port', String(APP_PORT), '--strictPort', '--host', '127.0.0.1'],
  { cwd: ROOT, env: { ...process.env, VITE_VAPID_PUBLIC: VAPID.publicKey, VITE_AUTH_LIVE: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('vite did not start')), 60000);
  vite.stdout.on('data', (d) => { if (/Local:|ready in/.test(String(d))) { clearTimeout(t); resolve(); } });
  vite.on('exit', (c) => reject(new Error('vite exited ' + c)));
});
const APP = `http://127.0.0.1:${APP_PORT}/app/`;

// ── in-memory kr8_push_subs / outbox (stands in for Supabase) ──
const db = { subs: [], outbox: [], nextId: 1 };
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ locale: 'th-TH', viewport: { width: 412, height: 860 } });
  await ctx.route('https://pedxoxpammnyfnizljyj.supabase.co/**', async (route) => {
    const u = route.request().url();
    if (u.endsWith('/rest/v1/rpc/kr8_push_subscribe')) {
      const a = route.request().postDataJSON();
      db.subs = db.subs.filter((s) => s.endpoint !== a.p_endpoint);
      db.subs.push({ id: db.nextId++, endpoint: a.p_endpoint, p256dh: a.p_p256dh, auth: a.p_auth, ua: a.p_ua });
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    }
    if (u.endsWith('/rest/v1/rpc/kr8_push_unsubscribe')) {
      const a = route.request().postDataJSON();
      db.subs = db.subs.filter((s) => s.endpoint !== a.p_endpoint);
      return route.fulfill({ status: 200, contentType: 'application/json', body: 'true' });
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  // headless Chrome has no FCM: the subscription points at the local push service; its keys are made in the page
  await ctx.addInitScript(({ ps }) => {
    if (typeof PushManager === 'undefined') return;
    let sub = null;
    const make = async () => {
      const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
      const raw = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
      const auth = crypto.getRandomValues(new Uint8Array(16));
      const b = (u) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      const endpoint = `${ps}/fcm/send/${b(crypto.getRandomValues(new Uint8Array(9)))}`;
      window.__subKeys = { jwk: await crypto.subtle.exportKey('jwk', kp.privateKey), p256dh: b(raw), auth: b(auth), endpoint };
      return { endpoint, expirationTime: null, toJSON: () => ({ endpoint, keys: { p256dh: b(raw), auth: b(auth) } }), unsubscribe: async () => { sub = null; return true; } };
    };
    PushManager.prototype.subscribe = async function (opts) {
      window.__subscribeOpts = { userVisibleOnly: opts.userVisibleOnly, keyLen: new Uint8Array(opts.applicationServerKey).length };
      sub = sub || (await make());
      return sub;
    };
    PushManager.prototype.getSubscription = async function () { return sub; };
  }, { ps: PS });

  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('ServiceWorker.enable');
  let regId = null;
  cdp.on('ServiceWorker.workerRegistrationUpdated', (e) => { for (const r of e.registrations) if (r.scopeURL === APP && !r.isDeleted) regId = r.registrationId; });
  deliver = async (plain) => cdp.send('ServiceWorker.deliverPushMessage', { origin: `http://127.0.0.1:${APP_PORT}`, registrationId: regId, data: plain });

  await page.goto(APP + 'harness/push.html?lang=th');
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true), null, { timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  for (let i = 0; i < 50 && !regId; i++) await page.waitForTimeout(100);
  ok(!!regId, 'service worker /app/sw.js registered with scope /app/');

  // 1. no prompt and no card on first load
  await page.waitForTimeout(500);
  ok(await page.evaluate(() => Notification.permission) === 'default', 'first load: the browser was never asked');
  ok(!(await page.$('#pushAsk')), 'first load: no card');

  // 2. a meaningful moment (card minted) → the small card, Thai with English under it
  await page.evaluate(() => window.__push.pushMoment('minted'));
  await page.waitForSelector('#pushAsk', { timeout: 5000 });
  const line = await page.textContent('#pushAskLine');
  ok(/การแจ้งเตือน/.test(line) && line.includes('Get a ding when you’re verified, your reward is ready, or your Reel goes live') && !/like/i.test(line), 'card: Thai line + English line (no promise of likes)');
  await page.screenshot({ path: path.join(process.env.KR_OUT || '/tmp', 'push_card.png') });

  // 3. grant notifications, tap [Turn on] → subscribe → stored for the member
  await ctx.grantPermissions(['notifications'], { origin: `http://127.0.0.1:${APP_PORT}` });
  await page.click('#pushAskOn');
  await page.waitForSelector('#pushAsk', { state: 'detached', timeout: 10000 });
  const opts = await page.evaluate(() => window.__subscribeOpts);
  ok(opts && opts.userVisibleOnly === true && opts.keyLen === 65, 'subscribe called with userVisibleOnly and the 65-byte VAPID key');
  subKeys = await page.evaluate(() => window.__subKeys);
  ok(db.subs.length === 1 && db.subs[0].endpoint === subKeys.endpoint && db.subs[0].p256dh === subKeys.p256dh, 'kr8_push_subscribe got this phone\'s endpoint + keys');
  ok((await page.evaluate(() => window.__toasts)).some((t) => t.includes('เปิดการแจ้งเตือนแล้ว')), 'toast: dings on (Thai)');
  ok(await page.evaluate(() => window.__push.pushState()) === 'on', 'pushState() = on');

  // 4. the database queues a ding (face check approved); the sender drains it
  const supaFetch = async (u, init) => {
    if (u.endsWith('/rpc/kr8_push_claim')) {
      const rows = db.outbox.filter((o) => o.state === 'queued').map((o) => { const s = db.subs.find((x) => x.id === o.sub_id); return { id: o.id, endpoint: s.endpoint, p256dh: s.p256dh, auth: s.auth, kind: o.kind, title: o.title, body: o.body, url: o.url, msg: o.msg }; });
      return Response.json(rows);
    }
    if (u.endsWith('/rpc/kr8_push_done')) {
      for (const r of JSON.parse(init.body).p_results) {
        const o = db.outbox.find((x) => x.id === r.id); o.state = r.result; o.http = r.http;
        if (r.result === 'gone') db.subs = db.subs.filter((s) => s.id !== o.sub_id);
      }
      return Response.json({ more: false });
    }
    throw new Error('unexpected ' + u);
  };
  const env = { SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_local_test', VAPID_PUBLIC: VAPID.publicKey, VAPID_PRIVATE: VAPID.privateKey };
  const queue = (o) => db.outbox.push({ id: db.outbox.length + 1, sub_id: db.subs[0].id, state: 'queued', msg: db.outbox.length + 100, ...o });
  queue({ kind: 'verified', url: '/app/?tab=me' });
  const r1 = await drain(env, { fetch, supaFetch, extraOrigins: [PS] });
  ok(r1.sent === 1 && seenAtService.length === 1, 'sender → push service: VAPID valid, payload decrypts (201)');
  ok(seenAtService[0].t.startsWith('ยืนยันตัวตนแล้ว') && seenAtService[0].u === '/app/?tab=me', 'payload: Thai-first title + in-app link');

  // 5. the worker shows it
  const notes = async () => page.evaluate(async () => (await (await navigator.serviceWorker.ready).getNotifications()).map((n) => ({ title: n.title, body: n.body, tag: n.tag, url: n.data && n.data.url, badge: n.badge, icon: n.icon })));
  let shown = [];
  for (let i = 0; i < 40 && !shown.length; i++) { await page.waitForTimeout(150); shown = await notes(); }
  ok(shown.length === 1 && shown[0].title === seenAtService[0].t && shown[0].body === seenAtService[0].b, 'service worker showed the notification (title + body)');
  ok(shown[0] && shown[0].url === '/app/?tab=me' && /badge-96\.png$/.test(shown[0].badge) && /icon-192\.png$/.test(shown[0].icon), 'notification: link, icon and badge');

  // 6. an admin message with a link, then tapping it while Kring is open → the open window gets the link
  queue({ kind: 'admin', title: 'ทดสอบ · Test', body: 'สวัสดี\nHello', url: '/app/?tab=me&open=rewards' });
  await drain(env, { fetch, supaFetch, extraOrigins: [PS] });
  for (let i = 0; i < 40 && (await notes()).length < 2; i++) await page.waitForTimeout(150);
  const sw = ctx.serviceWorkers().find((w) => w.url().endsWith('/app/sw.js'));
  await sw.evaluate(async () => {
    const n = (await self.registration.getNotifications()).find((x) => x.data && x.data.url === '/app/?tab=me&open=rewards');
    self.dispatchEvent(new NotificationEvent('notificationclick', { notification: n }));
  });
  let opened = [];
  for (let i = 0; i < 30 && !opened.length; i++) { await page.waitForTimeout(100); opened = await page.evaluate(() => window.__opened); }
  ok(opened[0] === '/app/?tab=me&open=rewards', 'tap → open Kring window focused and told the link');

  // 7. the phone's subscription expired at the push service (410) → the row is deleted
  gone.add(subKeys.endpoint.split('/').pop());
  queue({ kind: 'reel', url: '/app/?reel=cccccccc-0000-0000-0000-000000000001' });
  const r3 = await drain(env, { fetch, supaFetch, extraOrigins: [PS] });
  ok(r3.gone === 1 && db.subs.length === 0, '410 from the push service → subscription removed');

  // 8. Settings off path: pushDisable forgets the phone on the server
  gone.clear();
  db.subs.push({ id: 99, endpoint: subKeys.endpoint, p256dh: subKeys.p256dh, auth: subKeys.auth });
  await page.evaluate(() => window.__push.pushDisable());
  ok(db.subs.length === 0, 'turn off → kr8_push_unsubscribe removed the row');
  // ───────── leaving in-app browsers (UA strings of the real apps) ─────────
  const UA = JSON.parse(await (await import('node:fs/promises')).readFile(path.join(ROOT, 'src/v8/__fixtures__/inAppUAs.json'), 'utf8'));
  const ESC = `${APP}harness/escape.html?ref=pich&src=ig`;
  const open = async (ua, url = ESC) => {
    const c = await browser.newContext({ userAgent: ua, locale: 'th-TH', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const navs = [];
    await c.route('**/*', (route) => {
      const u = route.request().url();
      if (route.request().isNavigationRequest() && /openExternalBrowser=1/.test(u)) { navs.push(u); return route.abort(); }   // "LINE opened it outside"
      return route.continue();
    });
    const pg = await c.newPage();
    await pg.goto(url);
    return { c, pg, navs };
  };
  for (const k of ['line_android', 'line_ios']) {
    const { c, pg, navs } = await open(UA[k]);
    for (let i = 0; i < 40 && !navs.length; i++) await pg.waitForTimeout(100);
    const u = navs[0] ? new URL(navs[0]) : null;
    ok(u && u.pathname === '/app/harness/escape.html' && u.searchParams.get('openExternalBrowser') === '1' && u.searchParams.get('ref') === 'pich' && u.searchParams.get('src') === 'ig',
      `${k}: reloads itself with openExternalBrowser=1, same page, ?ref/?src kept`);
    await pg.goto(ESC);   // back in LINE later: no second jump, no screen
    await pg.waitForTimeout(1800);
    ok(navs.length === 1 && !(await pg.$('#escape')), `${k}: never loops (once per phone, guarded)`);
    await c.close();
  }
  {
    const { c, pg, navs } = await open(UA.line_liff, `${APP}harness/escape.html?ref=pich&liff.state=%3Fref%3Dpich`);
    await pg.waitForTimeout(1800);
    ok(!navs.length, 'LINE LIFF open: no automatic jump (sign-in in LINE, LINE dings)');
    await c.close();
  }
  for (const k of ['fb_android', 'ig_android', 'tiktok_android']) {
    const { c, pg } = await open(UA[k]);
    await pg.waitForSelector('#escape', { timeout: 6000 });   // the intent did not leave (desktop Chrome has no Android) → the buttons
    const go = await pg.getAttribute('#escGo', 'href'), alt = await pg.getAttribute('#escAlt', 'href');
    const tried = await pg.evaluate(() => sessionStorage.getItem('kr8_esc_auto'));
    ok(tried === '1' && go.startsWith('intent://127.0.0.1:' + APP_PORT + '/app/harness/escape.html?ref=pich&src=ig#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=')
      && decodeURIComponent(/S\.browser_fallback_url=([^;]+)/.exec(go)[1]).endsWith('/app/harness/escape.html?ref=pich&src=ig&kr_esc=1'),
      `${k}: tried the Chrome intent once, then one big "Open in Chrome" button with the same intent`);
    ok(alt && alt.includes('#Intent;scheme=https;action=android.intent.action.VIEW;category=android.intent.category.BROWSABLE;end') && !alt.includes('package='), `${k}: "Other browser" = chooser intent (no Chrome needed)`);
    ok((await pg.textContent('#escGo')).includes('เปิดใน Chrome') && (await pg.textContent('#escGo')).includes('Open in Chrome'), `${k}: button "เปิดใน Chrome · Open in Chrome"`);
    // desktop Chrome keeps the failed intent:// launch pending and ignores emulated taps meanwhile (a real Android phone
    // leaves or refuses at once), so the tap is a DOM click here
    await pg.evaluate(() => document.getElementById('escStay').click());
    ok(!(await pg.$('#escape')), `${k}: "Stay here" closes it (never blocks browsing)`);
    await c.close();
  }
  for (const k of ['fb_ios', 'ig_ios', 'tiktok_ios']) {
    const { c, pg } = await open(UA[k]);
    await pg.waitForSelector('#escape', { timeout: 6000 });
    ok(await pg.getAttribute('#escGo', 'href') === `x-safari-https://127.0.0.1:${APP_PORT}/app/harness/escape.html?ref=pich&src=ig`, `${k}: "Open in Safari" = x-safari-https, same page`);
    ok(!!(await pg.$('#escHint')) && (await pg.textContent('#escHint')).includes('Tap ⋯ then Open in browser'), `${k}: arrow to ⋯ with "แตะ ⋯ แล้วเลือก เปิดในเบราว์เซอร์"`);
    await pg.click('#escStay');
    await pg.reload(); await pg.waitForTimeout(800);
    ok(!(await pg.$('#escape')), `${k}: first open only`);
    // Turn on dings inside Instagram/FB/TikTok → the escape screen again, carrying ?dings=1
    await pg.evaluate(() => window.__push.pushMoment('first_reel'));
    await pg.waitForSelector('#pushAskOn', { timeout: 5000 });
    await pg.click('#pushAskOn');
    await pg.waitForSelector('#escape', { timeout: 5000 });
    ok((await pg.getAttribute('#escGo', 'href')).includes('dings=1'), `${k}: Turn on dings → open in Safari, where dings are asked at once (?dings=1)`);
    await c.close();
  }
  // landing in the real browser with a hand-off code → signed in, code gone from the address bar
  {
    const c = await browser.newContext({ userAgent: UA.chrome_android });
    const code = 'd'.repeat(64);
    let asked = null;
    await c.route('**/api/handoff', (r) => { asked = r.request().postDataJSON(); r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ token_hash: 'h1' }) }); });
    const now = Math.floor(Date.now() / 1000);
    const jwt = ['{"alg":"HS256","typ":"JWT"}', JSON.stringify({ sub: '11111111-1111-1111-1111-111111111111', exp: now + 3600, role: 'authenticated', aud: 'authenticated' }), 'sig']
      .map((x, i) => (i < 2 ? Buffer.from(x).toString('base64url') : x)).join('.');
    await c.route('https://pedxoxpammnyfnizljyj.supabase.co/auth/v1/verify**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      access_token: jwt, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1',
      user: { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'm@x', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() } }) }));
    await c.route('https://pedxoxpammnyfnizljyj.supabase.co/**', (r) => r.fallback());
    const pg = await c.newPage();
    await pg.goto(`${APP}harness/escape.html?ref=pich&ho=${code}`);
    await pg.waitForFunction(() => window.__handoff, null, { timeout: 10000 });
    ok(asked && asked.code === code, 'landing: the hand-off code goes to /api/handoff');
    ok(await pg.evaluate(() => window.__handoff) === 'signed-in' && await pg.evaluate(() => window.__uid) === '11111111-1111-1111-1111-111111111111', 'landing: signed in in the real browser');
    ok(!/[?&]ho=/.test(pg.url()) && pg.url().includes('ref=pich'), 'landing: code removed from the address bar, ?ref kept');
    await c.close();
  }
} finally {
  await browser?.close().catch(() => undefined);
  vite.kill();
  pushService.close();
}
const failed = results.filter(([p]) => !p).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
