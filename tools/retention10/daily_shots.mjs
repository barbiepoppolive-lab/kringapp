// m228 daily bonus QA shots (qa.kringapp.pages.dev, QA test account Bee). The strip's RPC answer is replaced in the browser only
// (filled / empty / won), so nothing is written anywhere. Usage: W=390 node daily_shots.mjs <en|th>
import { pw, open, wait, ACCT } from './lib.mjs';
import fs from 'node:fs';
const lang = process.argv[2] || 'en', W = +process.env.W || 390;
const OUT = process.env.OUT || '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/dailybonus'; fs.mkdirSync(OUT, { recursive: true });
const M = '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/dailytop/';
const img = (f) => 'data:image/png;base64,' + fs.readFileSync(M + f).toString('base64');
const who = { [ACCT.ploy.id]: { first_name: 'Ploy', photo: img('ploy.png'), me: false }, [ACCT.mint.id]: { first_name: 'Mint', photo: img('mint.png'), me: false },
  [ACCT.fah.id]: { first_name: 'Fah', photo: img('fah.png'), me: false }, [ACCT.bee.id]: { first_name: 'Bee', photo: img('you.png'), me: true } };
const base = { on: true, min: 10, bonus: [10, 6, 3], climb: 5, who };
const top = [{ rank: 1, member_id: ACCT.ploy.id, rings: 22, bonus: 10 }, { rank: 2, member_id: ACCT.mint.id, rings: 15, bonus: 6 }, { rank: 3, member_id: ACCT.fah.id, rings: 11, bonus: 3 }];
const STATES = {
  filled: { ...base, state: 'live', top, climber: { member_id: ACCT.bee.id, rings: 8, bonus: 5 } },
  empty: { ...base, state: 'live', top: [], climber: null },
  won: { ...base, state: 'won', top, climber: { member_id: ACCT.bee.id, rings: 8, bonus: 5 } },
};
const b = await pw.chromium.launch(); const log = [];
const tryStep = async (name, f) => { try { await f(); } catch (e) { log.push(`${name} FAILED: ${String(e.message).slice(0, 160)}`); } };
const states = (process.env.STATES || 'filled,empty,won').split(',');
for (const st of states) {
  const { ctx, page } = await open(b, 'bee', lang, '/app/', false, { w: W });
  await ctx.route('**/rest/v1/rpc/kr8_daily_top', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATES[st]) }));
  for (let i = 0; i < 4; i++) { const c = await page.$('#goCoachOk'); if (!c) break; await c.click().catch(() => undefined); await wait(page, 400); }
  await tryStep(st + ' board', async () => {
    await page.click('[data-tab="me"]'); await wait(page, 2500); await page.click('#meChip'); await wait(page, 900); await page.click('#meSheetRank');
    await page.waitForSelector('#kxDailyTop', { timeout: 15000 }); await wait(page, 2500);
    await page.screenshot({ path: `${OUT}/${lang}_${W}_strip_${st}.png` }); log.push(`${st}: ` + (await page.$eval('#kxDailyTop', (e) => e.innerText.replace(/\s+/g, ' '))));
    const o = await page.$eval('#kxDailyTop', (e) => { const r = e.getBoundingClientRect(); const h = e.querySelector('.r10-dth b').getBoundingClientRect(); const hb = e.querySelector('.r10-dth b');
      const cs = [...e.querySelectorAll('.r10-dtc')].map((c) => c.getBoundingClientRect());
      return { clipped: cs.some((c) => c.left < r.left || c.right > r.right) || (cs[0] && cs[0].left < h.right), titleCut: hb.scrollWidth > hb.clientWidth, docw: document.documentElement.scrollWidth }; });
    log.push(`${st} size ${JSON.stringify(o)}`);
  });
  if (st === 'filled') {
    await tryStep('chip->fairplay', async () => { await page.click('#kxDailyTop [data-dt="t1"]'); await wait(page, 2500); log.push('fairplay open: ' + !!(await page.$('#kxFairPlay')));
      await page.screenshot({ path: `${OUT}/${lang}_${W}_chip_fairplay.png` }); await page.keyboard.press('Escape'); await wait(page, 600);
      });
  }
  if (st === 'empty') {
    await tryStep('sheet', async () => { await page.click('#kxWinOpen'); await page.waitForSelector('#kxHowItWorks', { timeout: 8000 }); await wait(page, 1200);
      await page.screenshot({ path: `${OUT}/${lang}_${W}_sheet.png` }); log.push('sheet: ' + (await page.$eval('#kxHowItWorks', (e) => e.innerText.replace(/\s+/g, ' '))));
      const hw = await page.$('#hwWin'); if (hw) { await hw.click(); await wait(page, 1200); log.push('win sheet: ' + !!(await page.$('#kxWinOk')) + ' link back: ' + !!(await page.$('#kxWinHow')));
        await page.screenshot({ path: `${OUT}/${lang}_${W}_howtowin_link.png` }); } });
  }
  page.errs.length && log.push('errs: ' + page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 4).join(' || '));
  await ctx.close();
}
if (process.env.ASK) { // Ask BKK: one-line award rule opens the same sheet
  const { ctx, page } = await open(b, 'bee', lang, '/app/', false, { w: W });
  for (let i = 0; i < 4; i++) { const c = await page.$('#goCoachOk'); if (!c) break; await c.click().catch(() => undefined); await wait(page, 400); }
  await tryStep('ask', async () => {
    await page.evaluate(() => { location.hash = '#ask'; }); await wait(page, 1500);
    let el = await page.$('#askAwardRule');
    if (!el) { const t = await page.$('text=/^(Ask BKK|ถาม BKK)/'); if (t) { await t.click(); await wait(page, 2500); } el = await page.$('#askAwardRule'); }
    if (!el) throw new Error('no #askAwardRule');
    await el.scrollIntoViewIfNeeded(); await wait(page, 600); await page.screenshot({ path: `${OUT}/${lang}_${W}_ask_line.png` });
    await el.click(); await page.waitForSelector('#kxHowItWorks', { timeout: 8000 }); await wait(page, 1000);
    await page.screenshot({ path: `${OUT}/${lang}_${W}_ask_sheet.png` }); log.push('ask sheet: ' + (await page.$eval('#kxHowItWorks', (e) => e.innerText.replace(/\s+/g, ' '))));
  });
  page.errs.length && log.push('errs ask: ' + page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 4).join(' || '));
  await ctx.close();
}
await b.close();
console.log(lang, W, '\n' + log.join('\n'));
