// Ranking look A proof: screenshots of the REAL local build (vite dev on 127.0.0.1:5317, seeded data, nothing leaves the machine).
// Usage: node tools/rank_a/shots.mjs <out dir>   (dev server: tools/rank_a/dev.sh)
import fs from 'node:fs';
import path from 'node:path';
import { open, settle, DEVICES } from './run.mjs';

const out = process.argv[2] || '/tmp/rankA';
fs.mkdirSync(out, { recursive: true });
DEVICES.p390 = { ...DEVICES.iphone14, engine: 'chromium', isMobile: true, hasTouch: true };
const devs = ['a360', 'p390'];
const scs = (process.argv[3] || 'NORMAL,LAST6,TOP3,BELOW8,TWO').split(',');
const browsers = {};
const log = [];

async function toRanking(page) {
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 1000);
  await page.click('#kxRankTile');
  await page.waitForSelector('#kxPodium', { timeout: 8000 });
}

for (const dev of devs) for (const sc of scs) {
  const { page, context, blocked } = await open(browsers, dev, sc);
  await settle(page, 1800);
  await toRanking(page);
  await settle(page, 2600);
  const w = DEVICES[dev].viewport.width;
  const f = path.join(out, `${w}_${sc}.png`);
  await page.screenshot({ path: f });
  const info = await page.evaluate(() => ({
    hot: document.getElementById('kxCountdown')?.dataset.hot, chip: document.getElementById('kxCountdown')?.textContent,
    me: document.getElementById('kxMeRow')?.innerText.replace(/\n/g, ' | '), nudge: !!document.getElementById('kxVerifyNudge'),
    hscroll: document.documentElement.scrollWidth > window.innerWidth || [...document.querySelectorAll('#kxRanking *')].some((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed'),
    tabs: !!document.querySelector('#kxRanking [role="tablist"]'), dock: [...document.querySelectorAll('nav.dock [data-tab]')].map((e) => e.getAttribute('data-tab')).join(','),
  }));
  // tap #1's photo → their Reel opens (existing behaviour)
  let tap = null;
  if (sc === 'NORMAL') {
    await page.click('.rka-pc.p1 .rka-img');
    await settle(page, 1500);
    tap = await page.evaluate(() => !document.getElementById('kxRanking') || !!document.querySelector('.go-player, [data-go], .kgo'));
    await page.screenshot({ path: path.join(out, `${w}_NORMAL_tap1_opens_reel.png`) });
  }
  log.push({ dev, w, sc, ...info, tap, errors: page.errs, blocked: [...new Set(blocked)] });
  await context.close();
}

// opening animation video (390 px), and reduced-motion check
{
  const vdir = path.join(out, '_vid');
  const { page, context } = await open(browsers, 'p390', 'TOP3', { video: vdir });
  await settle(page, 1800);
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 900);
  const t0 = Date.now();
  await page.evaluate(() => { window.__t0 = performance.now(); });
  await page.click('#kxRankTile');
  await page.waitForTimeout(4200);
  const vid = await page.video().path();
  await context.close();
  log.push({ video: vid, clickedAfterMs: t0 });
  fs.writeFileSync(path.join(out, '_vidpath.txt'), vid);
}
{
  const { page, context } = await open(browsers, 'p390', 'TOP3', { reducedMotion: 'reduce' });
  await settle(page, 1500);
  await toRanking(page);
  await page.waitForTimeout(300);
  const moving = await page.evaluate(() => [...document.querySelectorAll('#kxRanking, #kxRanking *')].filter((e) => getComputedStyle(e).animationName !== 'none').length);
  log.push({ reducedMotion: true, moving });
  await context.close();
}
for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, '_log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 0));
