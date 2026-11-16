// Weekly-prize UI proof: screenshots of the REAL local build (vite dev on 127.0.0.1:5317, seeded data, nothing leaves the machine).
// Pixel 7 (Chromium) + iPhone 14 (WebKit) at 2×, plus a 360 px Android check. Usage: node tools/prize_ui/shots.mjs <out dir> [devices] [scenarios]
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from './run.mjs';
import { ME_ID, SCENARIOS } from './fake_kring.mjs';

const out = process.argv[2] || '/tmp/prize_shots';
const devs = (process.argv[3] || 'pixel7,iphone14,a360').split(',');
const scs = (process.argv[4] || 'A,B,C,C25,LAST,TOP').split(',');
fs.mkdirSync(out, { recursive: true });
const W0 = '2026-11-15T17:00:00.000Z';
const seen = (sc) => (SCENARIOS[sc].seenRank ? { [`kr8_pz_seen_${ME_ID}`]: JSON.stringify({ week: W0, rank: SCENARIOS[sc].seenRank }) } : {});
const log = [];
const browsers = {};

async function toMe(page) {
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 1200);
  await page.evaluate(() => {
    const row = document.getElementById('kxTiles');
    const sc = row && row.closest('.v8-screen');
    let box = row && row.parentElement;   // the nearest ancestor that scrolls
    while (box && box !== sc && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (row && box) box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - 150;
  });
  await page.waitForTimeout(2600);
}

for (const dev of devs) {
  for (const sc of scs) {
    for (const lang of dev === 'iphone14' && sc === 'C' ? ['en', 'th'] : ['en']) {
      const { page, context, blocked } = await open(browsers, dev, sc, { storage: { ...seen(sc), kr8_lang: lang } });
      await settle(page, 4600);   // after the ticker's first sheen has passed
      const tag = `${dev}_${sc}${lang === 'th' ? '_thaiUI' : ''}`;
      const feed = path.join(out, `${tag}_feed.png`);
      await page.screenshot({ path: feed });
      const tick = await page.$('#kpzTicker');
      const tb = tick ? await tick.boundingBox() : null;
      await toMe(page);
      await page.screenshot({ path: path.join(out, `${tag}_me.png`) });
      const card = await page.$('#kpzCard');
      const cb = card ? await card.boundingBox() : null;
      log.push({ dev, sc, lang, ticker: tb, card: cb, kind: await page.evaluate(() => document.getElementById('kpzCard')?.dataset.kind || null), errors: page.errs, blocked: [...new Set(blocked)] });
      await context.close();
    }
  }
}

// tap proof: the Feed ticker opens Me → This week · Ranking
for (const dev of devs.filter((d) => d !== 'a360')) {
  const { page, context, blocked } = await open(browsers, dev, 'C', { storage: seen('C') });
  await settle(page, 3000);
  await page.click('#kpzTicker .kpz-hit');
  await settle(page, 2200);
  await page.screenshot({ path: path.join(out, `${dev}_C_tap_opens_ranking.png`) });
  log.push({ dev, sc: 'tap', ranking: !!(await page.$('#kxRanking')), meTab: await page.evaluate(() => document.querySelector('nav.dock [data-tab="me"]')?.className || ''), errors: page.errs, blocked: [...new Set(blocked)] });
  await context.close();
}

// reduce motion: same card, no movement at all
{
  const { page, context } = await open(browsers, 'pixel7', 'C', { storage: seen('C'), reducedMotion: 'reduce' });
  await settle(page, 2500);
  await toMe(page);
  const anim = await page.evaluate(() => [...document.querySelectorAll('.kpz, .kpz *')].map((e) => getComputedStyle(e)).filter((s) => s.animationName !== 'none' || s.transitionDuration.split(',').some((x) => parseFloat(x) * (x.trim().endsWith('ms') ? 1 : 1000) > 1)).length);
  await page.screenshot({ path: path.join(out, 'pixel7_C_reduce_motion_me.png') });
  log.push({ dev: 'pixel7', sc: 'reduce-motion', movingElements: anim });
  await context.close();
}

for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, '_shots_log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log.map((l) => ({ dev: l.dev, sc: l.sc, lang: l.lang, kind: l.kind, errs: (l.errors || []).filter((e) => !/interactive-widget/.test(e)).length, blocked: l.blocked, extra: l.movingElements ?? l.ranking })), null, 0));
