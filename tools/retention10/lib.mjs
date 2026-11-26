import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const pw = require('/home/claude/.npm-global/lib/node_modules/playwright');
const env = Object.fromEntries(fs.readFileSync('/home/claude/kringapp-retention10/.env.production.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
export const SUPA = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
export const ACCT = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/Kring-secrets/qa_r10_accounts.json', 'utf8'));
export const QA = process.env.BASE || 'https://qa.kringapp.pages.dev';
// LIVE audit: never write anything on the live site (no answers, likes, hellos, posts, claims, pushes)
export const LIVE_BLOCK = /\/rpc\/kr8_(ask_answer|ask_create|ask_react|ask_vote|ask_report|answer|like|toggle_like|toggle_save|follow|unfollow|send_hello|send_message|bestie_act|bestie_invite|bestie_nudge|comment_add|comment_reply|create_photo|create_post|create_reel|create_reel_v2|feed_vote|task_vote|task_claim|task_extra_claim|claim_prize|open_q_answer|set_open_q|report|report_reel|log_reel_view|task_watch|roast_post|invite_try|push_[a-z_]+|b5_mark|link_try|ref_sent)$/;
export async function session(k) {
  const a = ACCT[k];
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: a.email, password: a.password }) });
  const j = await r.json();
  if (!j.access_token) throw new Error('signin failed ' + r.status);
  return j;
}
export async function rpcAs(k, fn, args = {}) {
  const s = await session(k);
  const r = await fetch(`${SUPA}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: ANON, Authorization: 'Bearer ' + s.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
  return { status: r.status, body: await r.json().catch(() => null) };
}
export async function open(browser, k, lang, path = '/app/', android = false, opts = {}) {
  const s = await session(k);
  const ctx = await browser.newContext({ viewport: android ? { width: 412, height: 915 } : ((opts.w || +process.env.W) ? { width: opts.w || +process.env.W, height: 844 } : { width: 390, height: 844 }), deviceScaleFactor: android ? 2.625 : 2, isMobile: true, hasTouch: true, locale: lang === 'th' ? 'th-TH' : 'en-GB',
    timezoneId: 'Asia/Bangkok',
    userAgent: android ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const sess = { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: Math.floor(Date.now() / 1000) + s.expires_in, token_type: 'bearer', user: s.user };
  await ctx.addInitScript(([sess, lang, fresh]) => {
    try {
      if (!sessionStorage.getItem('r10_init')) {
        localStorage.setItem('kr8-v5-auth', JSON.stringify(sess)); localStorage.setItem('kr8_lang', lang); sessionStorage.setItem('r10_init', '1');
        localStorage.setItem('kr8_coach', JSON.stringify(['post', 'score', 'share', 'save']));
        if (!fresh) localStorage.setItem('kr8_live_seen_' + sess.user.id, JSON.stringify(['7a10a000-0000-4000-8000-000000000001','7a10a000-0000-4000-8000-000000000002','7a10a000-0000-4000-8000-000000000003','7a10a000-0000-4000-8000-000000000004','7a10a000-0000-4000-8000-000000000005','7a10a000-0000-4000-8000-000000000006']));
      }
      sessionStorage.setItem('kr8_a2hs_shown', '1');
    } catch { /* */ }
  }, [sess, lang, !!opts.fresh]);
  if (process.env.LIVE) { ctx.blocked = []; await ctx.route('**/rest/v1/rpc/**', (r) => { const u = r.request().url().split('?')[0]; if (LIVE_BLOCK.test(u)) { ctx.blocked.push(u.split('/').pop()); return r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }); } return r.continue(); }); }
  const page = await ctx.newPage();
  page.errs = []; page.setDefaultTimeout(+process.env.PW_TO || 30000);
  page.on('pageerror', (e) => page.errs.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text().slice(0, 200)); });
  await page.goto(QA + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  return { ctx, page };
}
export const wait = (p, ms = 800) => p.waitForTimeout(ms);
