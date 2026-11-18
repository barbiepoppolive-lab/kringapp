// board-1 v3 proof: the real local build on the local seeded backend (nothing leaves the machine). 390×844 @2×.
//   node tools/board/shots_v3.mjs <out dir>
// Ploy (#37) is #1 with 85 Rings (was #3 when she last looked → ↑2); ranks 4–8 under the 25-Ring floor.
import fs from 'node:fs';
import path from 'node:path';
import { open, settle, DEVICES } from '../prize_ui/run.mjs';
import { ranking } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/board3';
fs.mkdirSync(out, { recursive: true });
DEVICES.p390 = { ...DEVICES.iphone14, engine: 'chromium', isMobile: true, hasTouch: true };
const BOARD = [['ploy', 85], ['mint', 31], ['nat', 26], ['aom', 19], ['ton', 14], ['yui', 9], ['lena', 6], ['minjun', 5], ['liam', 3], ['valeria', 2]];
const ENDS = Date.parse('2026-11-22T17:00:00.000Z');
const browsers = {};
const log = [];
async function board(lang, opts = {}) {
  const o = await open(browsers, 'p390', 'TOP', { storage: { kr8_lang: lang, 'kr8_pz_seen_6f1c2b1e-0000-4000-8000-000000000001': JSON.stringify({ week: '2026-11-15T17:00:00.000Z', rank: 3 }) } });
  const r = o.state.data.rpc;
  r.kr8_weekly_ranking = ranking(BOARD);
  r.kr8_score_breakdown = { ...r.kr8_score_breakdown, rings: 85, rank: 1, reels: r.kr8_score_breakdown.reels.map((x) => ({ ...x, score: 85 })) };
  r.kr8_card_extras = { ...r.kr8_card_extras, week: 85, week_rank: 1 };
  r.kr8_seats_left = 38;
  r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-18T03:00:00Z', promo_ok: true } };
  r.kr8_promo_get = { on: true, terms_version: 'member-2026-11-17' };
  r.kr8_feed_ranked = r.kr8_feed;
  r.kr8_rings_rules = { like: 1, save: 3, open: 5, opens_day_cap: 30, traveller_mult: 2, best_reels: 1, min_rings_for_paid_seat: 25, invite: 10,
    prize_1: 1500, prize_2: 900, prize_3: 600, prize_4: 500, prize_5: 400, prize_6: 250, prize_7: 150, prize_8: 100 };
  if (opts.at) await o.page.clock.setSystemTime(opts.at);
  await o.page.reload({ waitUntil: 'domcontentloaded' });
  await settle(o.page, 2500);
  await o.page.click('nav.dock [data-tab="me"]');
  await settle(o.page, 1000);
  await o.page.click('#kxRankTile');
  await o.page.waitForSelector('#kxPodium', { timeout: 8000 });
  await settle(o.page, 2600);
  return o;
}
for (const lang of ['en', 'th']) {
  const o = await board(lang);
  await o.page.screenshot({ path: path.join(out, `BOARD2_after_${lang.toUpperCase()}.png`) });
  await o.page.evaluate(() => { const el = document.getElementById('kxRanking'); if (el) el.scrollTop = el.scrollHeight; });
  await o.page.waitForTimeout(500);
  await o.page.screenshot({ path: path.join(out, `BOARD2_after_${lang.toUpperCase()}_scrolled.png`) });
  const info = await o.page.evaluate(() => ({ text: document.getElementById('kxRanking')?.innerText.replace(/\n+/g, ' | '), cd: document.getElementById('kxCountdown')?.textContent }));
  if (lang === 'en') {
    await o.page.click('#kxBoardCta'); await o.page.waitForSelector('#kxShareSheet'); await o.page.waitForTimeout(500);
    await o.page.screenshot({ path: path.join(out, 'BOARD2_sharesheet_EN.png') });
    await o.page.click('.bx-shbg', { position: { x: 30, y: 60 } }); await o.page.waitForTimeout(300);
    await o.page.click('#kxWinOpen'); await o.page.waitForSelector('#kxWin'); await o.page.waitForTimeout(500);
    await o.page.screenshot({ path: path.join(out, 'BOARD2_info_EN.png') });
  }
  log.push({ lang, ...info, errors: o.page.errs, blocked: [...new Set(o.blocked)] });
  await o.context.close();
}
for (const [name, left] of [['BOARD2_last24h_EN', (8 * 3600 + 14 * 60 + 22) * 1000], ['BOARD2_lasthour_EN', (14 * 60 + 22) * 1000]]) {
  const o = await board('en', { at: ENDS - left });
  await o.page.screenshot({ path: path.join(out, `${name}.png`) });
  log.push({ name, cd: await o.page.evaluate(() => document.getElementById('kxCountdown')?.textContent), errors: o.page.errs });
  await o.context.close();
}
for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, '_log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
