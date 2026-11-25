// QA helper: reads throwaway QA-account passwords from Kring-secrets/qa_r10_accounts.json (never committed).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export const pw = require('/home/claude/.npm-global/lib/node_modules/playwright');
const env = Object.fromEntries(fs.readFileSync('/home/claude/kringapp-retention10/.env.production.local', 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]));
export const SUPA = env.VITE_SUPABASE_URL, ANON = env.VITE_SUPABASE_ANON_KEY;
export const ACCT = JSON.parse(fs.readFileSync('/mnt/user-data/uploads/Kring-secrets/qa_r10_accounts.json', 'utf8'));
export const QA = 'https://qa.kringapp.pages.dev';
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
export async function open(browser, k, lang, path = '/app/', android = false) {
  const s = await session(k);
  const ctx = await browser.newContext({ viewport: android ? { width: 412, height: 915 } : { width: 390, height: 844 }, deviceScaleFactor: android ? 2.625 : 2, isMobile: true, hasTouch: true, locale: lang === 'th' ? 'th-TH' : 'en-GB',
    timezoneId: 'Asia/Bangkok',
    userAgent: android ? 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36' : 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  const sess = { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: s.expires_in, expires_at: Math.floor(Date.now() / 1000) + s.expires_in, token_type: 'bearer', user: s.user };
  await ctx.addInitScript(([sess, lang]) => {
    try {
      if (!sessionStorage.getItem('r10_init')) {
        localStorage.setItem('kr8-v5-auth', JSON.stringify(sess)); localStorage.setItem('kr8_lang', lang); sessionStorage.setItem('r10_init', '1');
        localStorage.setItem('kr8_coach', JSON.stringify(['post', 'score', 'share', 'save']));
        localStorage.setItem('kr8_live_seen_' + sess.user.id, JSON.stringify(['7a10a000-0000-4000-8000-000000000001','7a10a000-0000-4000-8000-000000000002','7a10a000-0000-4000-8000-000000000003','7a10a000-0000-4000-8000-000000000004','7a10a000-0000-4000-8000-000000000005','7a10a000-0000-4000-8000-000000000006']));
      }
      sessionStorage.setItem('kr8_a2hs_shown', '1');
    } catch { /* */ }
  }, [sess, lang]);
  const page = await ctx.newPage();
  page.errs = [];
  page.on('pageerror', (e) => page.errs.push(String(e.message || e)));
  page.on('console', (m) => { if (m.type() === 'error') page.errs.push(m.text().slice(0, 200)); });
  await page.goto(QA + path, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);
  return { ctx, page };
}
export const wait = (p, ms = 800) => p.waitForTimeout(ms);
