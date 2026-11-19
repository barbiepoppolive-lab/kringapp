// Me tab (A · Card + one line) screenshots of the REAL local build (vite dev on 127.0.0.1:5317, seeded data, nothing leaves the machine).
// Usage: node tools/me_variants/shots.mjs <out dir> [lang]   (dev server: tools/me_variants/dev.sh)
// Saves me.png (first screen), me_scrolled.png, me_menu.png (⋯ open); Thai files end in _th.
import fs from 'node:fs';
import path from 'node:path';
import { open, settle, DEVICES } from './run.mjs';

const out = process.argv[2] || '/tmp/me-a';
fs.mkdirSync(out, { recursive: true });
DEVICES.p390 = { ...DEVICES.iphone14, engine: 'chromium', isMobile: true, hasTouch: true };
const lang = process.argv[3] || 'en';
const sfx = lang === 'en' ? '' : `_${lang}`;
const browsers = {};
const log = [];
for (const mode of ['screen', 'menu']) {
  const { page, context, blocked } = await open(browsers, 'p390', 'NORMAL', { storage: { kr8_lang: lang } });
  await settle(page, 1800);
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 2200);
  if (mode === 'menu') {
    await page.click('#meMore');
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(out, `me_menu${sfx}.png`) });
  } else {
    await page.screenshot({ path: path.join(out, `me${sfx}.png`) });
    await page.evaluate(() => { const s = document.querySelector('#s-me'); s.scrollTop = s.scrollHeight; });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `me_scrolled${sfx}.png`) });
  }
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  log.push({ mode, lang, hscroll, errors: page.errs, blocked: [...new Set(blocked)] });
  await context.close();
}
for (const b of Object.values(browsers)) await b.close();
console.log(JSON.stringify(log));
