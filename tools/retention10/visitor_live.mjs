// Logged-out visitor on the LIVE app: screenshots + every RPC response searched for QA test accounts / their posts.
import { pw, session, wait } from './lib.mjs';
const OUT = process.env.OUT; const BASE = process.env.BASE || 'https://kringapp.com';
const ids = []; for (const k of ['ploy', 'mint', 'fah', 'bee']) { try { ids.push((await session(k)).user.id); } catch { /* */ } }
const names = /\b(Ploy|Mint|Fah|Bee)\b|qa-r10|7a10a000/;
const b = await pw.chromium.launch(); const log = []; const hits = [];
for (const [lang, w] of [['en', 390], ['th', 390], ['en', 360], ['th', 430]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: lang === 'th' ? 'th-TH' : 'en-GB', timezoneId: 'Asia/Bangkok',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('kr8_lang', l); sessionStorage.setItem('kr8_a2hs_shown', '1'); } catch { /* */ } }, lang);
  const page = await ctx.newPage(); let rpcs = 0;
  page.on('response', async (r) => { if (!/\/rest\/v1\//.test(r.url())) return; rpcs++; try { const t = await r.text(); for (const id of ids) if (t.includes(id)) hits.push(`${r.url().split('/').pop().split('?')[0]} has test id`); } catch { /* */ } });
  await page.goto(BASE + '/app/', { waitUntil: 'domcontentloaded' }); await wait(page, 7000);
  const sh = async (n) => { await page.screenshot({ path: `${OUT}/visitor_${lang}${w}_${n}.png` }); const t = await page.evaluate(() => document.body.innerText); const m = t.match(names); if (m) hits.push(`${n} text: ${m[0]}`); log.push(`${lang}${w} ${n}`); };
  await sh('01_feed');
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 850); await wait(page, 900); } await sh('02_feed_scrolled');
  for (const [tab, n] of [['people', '03_people'], ['deals', '04_deals'], ['me', '05_me']]) { try { await page.click(`[data-tab="${tab}"]`); await wait(page, 3000); await sh(n); } catch (e) { log.push(`${n} FAILED ${String(e.message).slice(0, 80)}`); } }
  try { await page.goto(BASE + '/app/#ask', { waitUntil: 'domcontentloaded' }); await wait(page, 5000); await sh('06_ask'); } catch { /* */ }
  log.push(`${lang}${w} rpc responses checked: ${rpcs}`);
  await ctx.close();
}
await b.close();
console.log(log.join('\n')); console.log('TEST IDS', ids.length, 'HITS', JSON.stringify(hits));
