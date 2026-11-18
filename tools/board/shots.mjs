// Board "Kring Light" + story share card proof: the REAL local build (vite dev, tools/prize_ui/dev.sh) on the LOCAL seeded backend
// (tools/prize_ui/fake_kring.mjs). Every host other than the local dev server is aborted: nothing reaches live or test.
//   bash tools/prize_ui/dev.sh &   node tools/board/shots.mjs <out dir> <tag: before|after> [card]
// 390×844 at 2×. Ploy (#37) is #1 with 85 Rings; ranks 4–8 are still under the 25-Ring floor (early in the week).
import fs from 'node:fs';
import path from 'node:path';
import { open, settle, DEVICES } from '../prize_ui/run.mjs';
import { ranking } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/board';
const tag = process.argv[3] || 'after';
const withCard = process.argv[4] === 'card';
fs.mkdirSync(out, { recursive: true });
DEVICES.p390 = { ...DEVICES.iphone14, engine: 'chromium', isMobile: true, hasTouch: true };
const BOARD = [['ploy', 85], ['mint', 31], ['nat', 26], ['aom', 19], ['ton', 14], ['yui', 9], ['lena', 6], ['minjun', 5], ['liam', 3], ['valeria', 2]];
const browsers = {};
const log = [];

for (const lang of ['th', 'en']) {
  const o = await open(browsers, 'p390', 'TOP', { storage: { kr8_lang: lang, kr8_pz_seen_6f1c2b1e: '1' } });
  const r = o.state.data.rpc;
  r.kr8_weekly_ranking = ranking(BOARD);
  r.kr8_score_breakdown = { ...r.kr8_score_breakdown, rings: 85, rank: 1, reels: r.kr8_score_breakdown.reels.map((x) => ({ ...x, score: 85 })) };
  r.kr8_card_extras = { ...r.kr8_card_extras, week: 85, week_rank: 1 };
  r.kr8_seats_left = 38;
  r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-18T03:00:00Z', promo_ok: true } };
  r.kr8_promo_get = { on: true, terms_version: 'member-2026-11-17' };
  r.kr8_feed_ranked = r.kr8_feed;
  await o.page.reload({ waitUntil: 'domcontentloaded' });
  await settle(o.page, 2500);
  const page = o.page;
  try {
    await page.click('nav.dock [data-tab="me"]');
    await settle(page, 1000);
    await page.click('#kxRankTile');
    await page.waitForSelector('#kxPodium', { timeout: 8000 });
    await settle(page, 2600);
    await page.screenshot({ path: path.join(out, `BOARD_${tag}_${lang.toUpperCase()}.png`) });
    const text = await page.evaluate(() => document.getElementById('kxRanking')?.innerText || '');
    // the bottom of the list, scrolled
    await page.evaluate(() => { const el = document.getElementById('kxRanking'); if (el) el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(out, `BOARD_${tag}_${lang.toUpperCase()}_scrolled.png`) });
    if (withCard) {
      // the story card: capture the PNG the button makes (download path: no navigator.share files on desktop chromium)
      const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('#kxShareRank')]);
      const f = path.join(out, `SHARECARD_${lang.toUpperCase()}.png`);
      await dl.saveAs(f);
      log.push({ lang, card: f, name: dl.suggestedFilename() });
    }
    log.push({ lang, tag, text: text.replace(/\n+/g, ' | ').slice(0, 1500), errors: page.errs, blocked: [...new Set(o.blocked)] });
  } catch (e) {
    await page.screenshot({ path: path.join(out, `debug_${lang}.png`) });
    log.push({ lang, failed: String(e).slice(0, 300), errors: page.errs });
  }
  await o.context.close();
}
for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, `_log_${tag}.json`), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
