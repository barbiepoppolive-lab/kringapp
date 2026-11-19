// Me tab variants preview: screenshots of the REAL local build (vite dev on 127.0.0.1:5317, seeded data, nothing leaves the machine).
// Usage: node tools/me_variants/shots.mjs <out dir> [now,1,2,3,4] [lang]   (dev server: tools/me_variants/dev.sh)
import fs from 'node:fs';
import path from 'node:path';
import { open, settle, DEVICES } from './run.mjs';

const out = process.argv[2] || '/tmp/me-variants';
fs.mkdirSync(out, { recursive: true });
DEVICES.p390 = { ...DEVICES.iphone14, engine: 'chromium', isMobile: true, hasTouch: true };
const vs = (process.argv[3] || 'now,1,2,3,4').split(',');
const lang = process.argv[4] || 'en';
const browsers = {};
const log = [];
for (const v of vs) {
  // '2rings' = variant 2 opened on its Rings tab, '1more' = variant 1 with the ⋯ menu open
  const [num, extra] = [v.replace(/\D+$/, ''), v.replace(/^\d+/, '')];
  const q = v === 'now' ? '' : `?mev=${num}${extra === 'rings' || extra === 'more' ? `&mevtab=${extra}` : ''}`;
  const { page, context, blocked } = await open(browsers, 'p390', 'NORMAL', { query: q, storage: { kr8_lang: lang } });
  await settle(page, 1800);
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 2200);
  if (extra === 'menu') { await page.click('#mevMore'); await page.waitForTimeout(400); }
  const name = v === 'now' ? 'now' : `v${num}${extra ? '_' + extra : ''}`;
  const sfx = lang === 'en' ? '' : `_${lang}`;
  await page.screenshot({ path: path.join(out, `${name}${sfx}.png`) });
  const h = await page.evaluate(() => {
    const s = document.querySelector('#s-me');
    const cands = [s, ...s.querySelectorAll('*')].filter((e) => e.scrollHeight > e.clientHeight + 20 && /(auto|scroll)/.test(getComputedStyle(e).overflowY));
    const el = cands[0];
    if (!el) return null;
    el.scrollTop = el.scrollHeight;
    return { sh: el.scrollHeight, ch: el.clientHeight, id: el.id || el.className };
  });
  await page.waitForTimeout(500);
  if (!extra && h && h.sh > h.ch + 40) await page.screenshot({ path: path.join(out, `${name}${sfx}_scrolled.png`) });
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  log.push({ v, lang, h, hscroll, errors: page.errs, blocked: [...new Set(blocked)] });
  await context.close();
}
for (const b of Object.values(browsers)) await b.close();
console.log(JSON.stringify(log));
