// Retention 10 QA proof shots on qa.kringapp.pages.dev, 390×844 @2x, QA test accounts only. Usage: node shots.mjs <en|th>
import { pw, open, wait, ACCT } from './lib.mjs';
const lang = process.argv[2] || 'en';
const OUT = process.env.OUT ? process.env.OUT + '' : '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/retention10/shots';
const b = await pw.chromium.launch();
const log = [];
const shot = async (page, n) => { await page.screenshot({ path: `${OUT}/${lang}_${n}.png` }); log.push(n); };
const coach = async (page) => { for (let i = 0; i < 4; i++) { const c = await page.$('#goCoachOk'); if (!c) break; await c.click().catch(() => undefined); await wait(page, 400); } };
const esc = async (page) => { await page.keyboard.press('Escape'); await wait(page, 500); };
const clickDim = async (page) => { const d = await page.$('.r10-dim, .dt-dim'); if (d) { await d.click({ position: { x: 20, y: 20 } }).catch(() => undefined); await wait(page, 500); } };
const tryStep = async (name, f) => { try { await f(); } catch (e) { log.push(`${name} FAILED: ${String(e.message).slice(0, 160)}`); } };

if (!process.env.ONLY_C) { // Ploy: Feed (5pm banner + New in Bangkok with the 5pm tile), first-visit steps + Follow 3, tasks sheet (welcome + 5pm row)
  const { ctx, page } = await open(b, 'ploy', lang);
  await coach(page);
  await tryStep('feed', async () => { await wait(page, 1500); await shot(page, '01_feed_b5banner_newrow'); });
  await tryStep('b5sheet', async () => { await page.click('#r10B5Tile'); await wait(page, 2500); await shot(page, '02_b5_sheet'); await clickDim(page); });
  await tryStep('banner-hide', async () => { await page.click('#r10B5Banner .r10-x'); await wait(page, 900); await shot(page, '03_feed_after_banner_hidden_onb'); });
  await tryStep('onb-open', async () => { await page.click('#onbStrip .onb-line'); await wait(page, 900); await shot(page, '04_onb_steps_follow_row'); });
  await tryStep('follow3', async () => { await page.click('#r10F3Go'); await wait(page, 2000); await shot(page, '05_follow3_sheet'); await clickDim(page); });
  await tryStep('tasks', async () => { await page.click('#dtOrb'); await wait(page, 2500); await shot(page, '06_tasks_welcome_b5');
    await page.evaluate(() => document.querySelector('#dtSheet')?.scrollTo(0, 9999)); await wait(page, 500); await shot(page, '07_tasks_list_b5row'); });
  await tryStep('welcome-play', async () => { await page.evaluate(() => document.querySelector('#dtSheet')?.scrollTo(0, 0)); await wait(page, 300);
    await page.click('#r10WelcomeGo'); await wait(page, 3000); await shot(page, '08_welcome_player'); await esc(page); });
  page.errs.length && log.push('errs A: ' + page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 4).join(' || '));
  await ctx.close();
}
if (!process.env.ONLY_C) { // Ploy: Me (profile-only sheet, opening question, bestie), then Mint's profile (question card + bestie), Say hi gate
  const { ctx, page } = await open(b, 'ploy', lang);
  await coach(page);
  await tryStep('me', async () => { await page.click('nav [data-tab="me"], [data-tab="me"]'); await wait(page, 3500); await shot(page, '09_me_profile_only_sheet'); });
  await tryStep('po-close', async () => { await clickDim(page); await wait(page, 600);
    await page.evaluate(() => document.querySelector('#meStatus')?.scrollIntoView({ block: 'center' })); await wait(page, 500); await shot(page, '10_me_lines'); });
  await tryStep('me-grid', async () => { await page.evaluate(() => document.querySelector('#goGrid')?.scrollIntoView({ block: 'center' })); await wait(page, 800); await shot(page, '11_me_grid_on_profile_tag'); });
  await tryStep('oq', async () => { await page.click('#meOpenQ'); await wait(page, 900); await shot(page, '12_opening_question_editor'); await clickDim(page); });
  await tryStep('bestie', async () => { await page.click('#meBestie'); await wait(page, 900); await shot(page, '13_bestie_sheet'); await clickDim(page); });
  await tryStep('profile', async () => { await page.evaluate((id) => window.dispatchEvent(new CustomEvent('kr8:r10-profile', { detail: id })), ACCT.mint.id); await wait(page, 3500);
    await shot(page, '14_profile_mint_question_bestie'); });
  await tryStep('answer', async () => { await page.click('#profileOpenQ'); await wait(page, 1200);
    { const n = await page.$('text=/^(Not now|ไว้ก่อน|ยังก่อน|ไว้ทีหลัง)$/'); if (n) { await n.click(); await wait(page, 700); await page.click('#profileOpenQ'); await wait(page, 1500); } } await shot(page, '15_sayhi_answer_gate'); await esc(page); });
  page.errs.length && log.push('errs B: ' + page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 4).join(' || '));
  await ctx.close();
}
{ // Bee (not new): Say hi from a Reel = playful openers; weekly board → fair-play + newcomers league
  const { ctx, page } = await open(b, 'bee', lang, '/app/?reel=7a10a000-0000-4000-8000-000000000001');
  await coach(page);
  const notNow = async () => { const n = await page.$('text=/^(Not now|ไว้ก่อน|ยังก่อน|ไว้ทีหลัง)$/'); if (n) { await n.click(); await wait(page, 700); } };
  await tryStep('openers', async () => {
    const hi = await page.$('.slide:has-text("Mint") .rv4-hi[data-act="hi"], .rv4-hi[data-act="hi"]'); if (!hi) throw new Error('no Say hi on the first Reel');
    await hi.click(); await wait(page, 1200); await notNow();
    if (!(await page.$('#sh-hi'))) { await (await page.$('.rv4-hi[data-act="hi"]')).click(); await wait(page, 1500); }
    await shot(page, '16_sayhi_playful_openers'); await page.click('#sh-hi .xbtn').catch(() => esc(page)); await wait(page, 600); });
  await tryStep('board', async () => {
    const t = await page.$('.kpz-tick, #kpzTick, [class*="kpz-tick"]');
    if (false && t) await t.click(); else { await page.click('[data-tab="me"]'); await wait(page, 2500); await page.click('#meChip'); await wait(page, 900); await page.click('#meSheetRank'); }
    await wait(page, 3500); await shot(page, '17_board'); });
  await tryStep('fairplay', async () => { await page.click('.bx-img[data-rank="1"]'); await wait(page, 2500); await shot(page, '18_fairplay');
    const w = await page.$('#kxFairPlay .r10-link.sm'); if (w) { await w.click(); await wait(page, 400); }
    await page.click('#fpDays'); await wait(page, 500); await page.evaluate(() => document.querySelector('#kxFairPlay')?.scrollTo(0, 9999)); await wait(page, 400); await shot(page, '19_fairplay_who_days'); await clickDim(page); });
  await tryStep('newcomers', async () => { await page.evaluate(() => document.querySelector('#kxNewcomers')?.scrollIntoView({ block: 'center' })); await wait(page, 800); await shot(page, '20_newcomers_league'); });
  page.errs.length && log.push('errs C: ' + page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 4).join(' || '));
  await ctx.close();
}
await b.close();
console.log(lang, log.join('\n'));
