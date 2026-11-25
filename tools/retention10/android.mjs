import { pw, open, wait, ACCT } from './lib.mjs';
const OUT = '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/retention10/shots';
const b = await pw.chromium.launch();
for (const lang of ['th', 'en']) {
  const { ctx, page } = await open(b, 'ploy', lang, '/app/', true);
  for (let i = 0; i < 4; i++) { const c = await page.$('#goCoachOk'); if (!c) break; await c.click().catch(() => undefined); await wait(page, 300); }
  await page.screenshot({ path: `${OUT}/android_${lang}_feed.png` });
  await page.click('#dtOrb'); await wait(page, 2200); await page.screenshot({ path: `${OUT}/android_${lang}_tasks.png` });
  await page.keyboard.press('Escape'); await wait(page, 600);
  await page.evaluate((id) => window.dispatchEvent(new CustomEvent('kr8:r10-profile', { detail: id })), ACCT.mint.id); await wait(page, 3000);
  await page.screenshot({ path: `${OUT}/android_${lang}_profile.png` });
  await page.click('#profileScore'); await wait(page, 2500); await page.screenshot({ path: `${OUT}/android_${lang}_fairplay.png` });
  console.log(lang, 'errs', page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 3));
  await ctx.close();
}
await b.close();
