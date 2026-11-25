// before/after pairs for the attention rule. Usage: node clutter.mjs <before|after> <en|th>
import { pw, open, wait } from './lib.mjs';
const tag = process.argv[2], lang = process.argv[3] || 'en';
const OUT = '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/retention10/shots/clutter';
import fs from 'node:fs'; fs.mkdirSync(OUT, { recursive: true });
const b = await pw.chromium.launch();
const shot = (p, n) => p.screenshot({ path: `${OUT}/${n}_${lang}_${tag}.png` });
const coach = async (page) => { for (let i = 0; i < 4; i++) { const c = await page.$('#goCoachOk'); if (!c) break; await c.click().catch(() => undefined); await wait(page, 300); } };
{ // 1: a member whose Reel just went live, 5pm window open, first-visit steps active (Ploy)
  const { ctx, page } = await open(b, 'ploy', lang, '/app/', false, { fresh: true });
  await coach(page); await wait(page, 9500); await shot(page, 'c1_feed_first_visit');
  await page.click('[data-tab="me"]'); await wait(page, 3500); await shot(page, 'c2_me_top');
  await ctx.close();
}
{ // 3: a returning member (Bee) in the 5pm window
  const { ctx, page } = await open(b, 'bee', lang);
  await coach(page); await wait(page, 9500); await shot(page, 'c3_feed_returning');
  await page.click('[data-tab="me"]'); await wait(page, 3500); await shot(page, 'c4_me_returning');
  await ctx.close();
}
await b.close(); console.log('ok', tag, lang);
