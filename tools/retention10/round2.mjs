// Round 2 proof shots: daily photo, Ask BKK awards + nudge + kindness, leaderboard orb (+ overlap check at 360/390/430), rule cards, fair-play award line.
// Usage: node round2.mjs <en|th> [part]
import { pw, open, wait } from './lib.mjs';
import fs from 'node:fs';
const lang = process.argv[2] || 'en', part = process.argv[3] || 'all';
const OUT = '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/retention10/shots/r2'; fs.mkdirSync(OUT, { recursive: true });
const b = await pw.chromium.launch(); const log = [];
const ALLOW = /\b(BKK|Kring|LINE|Instagram|TikTok|Facebook|TrueMoney|Grab|Ploy|Mint|Fah|Bee|Nes|Pichy|Review|Ari|Siam|Square|Silom|Lumpini|Jodd|Fairs|Hua|Lamphong|Wat|Dan|Phaya|Thai|Pathum|Wan|Huai|Khwang|GIF|TH|EN|KR)\b/g;
// language mode: in Thai mode no English words in new UI blocks; in English mode no Thai (member names / their own text excluded)
const langCheck = async (p, n) => {
  const t = await p.evaluate(() => [...document.querySelectorAll('.r10-sheet, .r10-wc, .dt-row[data-task="photo"], .dt-row[data-task="b5"], #meOrb, .r10-meln, .r10-nc .r10-nch, .at-kind, .at-min, .award, #kxFairPlay .r10-fpt span, #kxFairPlay .r10-fpl span, .rw-sheet .bi, .rw-sheet .chip')]
    .filter((e) => e.offsetParent).map((e) => { const c = e.cloneNode(true); c.querySelectorAll('.r10-wn, .r10-wc-n, .r10-who b, .r10-pair b, .r10-b5c span, .r10-exc span, .r10-ncr .t, textarea, input, .r10-oqc b, .r10-sub').forEach((x) => x.remove()); return c.textContent || ''; }).join(' | '));
  const bad = lang === 'th' ? (t.replace(ALLOW, '').match(/\b[A-Za-z]{3,}\b/g) || []) : (t.replace(/฿/g, '').match(/[\u0E00-\u0E7F]+/g) || []);
  if (bad.length) log.push(`LANG ${n}: ${[...new Set(bad)].slice(0, 8).join(', ')}`);
};
const shot = async (p, n) => { await p.screenshot({ path: `${OUT}/${lang}_${n}.png` }); log.push(n); await langCheck(p, n); };
const coach = async (page) => { for (let i = 0; i < 4; i++) { const c = await page.$('#goCoachOk'); if (!c) break; await c.click().catch(() => undefined); await wait(page, 300); } };
const tryStep = async (n, f) => { try { await f(); } catch (e) { log.push(`${n} FAILED: ${String(e.message).split('\n')[0].slice(0, 140)}`); } };
const dim = async (page) => { const d = await page.$('.r10-dim'); if (d) { await d.click({ position: { x: 20, y: 20 } }).catch(() => undefined); await wait(page, 500); } };
if (part === 'all' || part === 'photo') {
  const { ctx, page } = await open(b, process.env.WHO || 'mint', lang);   // a verified member with no post today
  await coach(page);
  await tryStep('tasks', async () => { await page.click('#dtOrb'); await wait(page, 2500); await page.evaluate(() => document.querySelector('[data-task="photo"]')?.scrollIntoView({ block: 'center' })); await wait(page, 400); await shot(page, 'p1_tasks_photo_row'); });
  await tryStep('sheet', async () => { await page.click('#r10PhotoGo'); await wait(page, 1500); await shot(page, 'p2_photo_examples'); });
  if (process.env.POST_PHOTO) await tryStep('pick', async () => { await page.setInputFiles('#r10PhotoInput', 'test_photo.jpg'); await wait(page, 1500); await page.fill('#r10PhotoCap', lang === 'th' ? 'สวนลุมตอนเย็น' : 'Lumpini at golden hour'); await shot(page, 'p3_photo_preview');
    await page.click('#r10PhotoPost'); await wait(page, 2500); await shot(page, 'p4_posted_toast'); });
  await tryStep('me', async () => { await dim(page); await page.click('[data-tab="me"]'); await wait(page, 3500); await page.evaluate(() => document.querySelector('#goGrid')?.scrollIntoView({ block: 'center' })); await wait(page, 600); await shot(page, 'p5_me_grid_photo'); });
  await tryStep('viewer', async () => { await page.click('[data-photo]'); await wait(page, 1200); await shot(page, 'p6_photo_viewer'); await dim(page); });
  log.push('errs: ' + page.errs.filter((e) => !/429|open-meteo/.test(e)).slice(0, 3).join(' | '));
  await ctx.close();
}
if (part === 'all' || part === 'feedphoto') {
  const { ctx, page } = await open(b, 'bee', lang);
  await coach(page);
  await tryStep('feedphoto', async () => {
    for (let i = 0; i < 25; i++) { if (await page.evaluate(() => { const s = [...document.querySelectorAll('#feedScroll > .slide')]; const t = s.find((x) => /Lumpini|สวนลุม/.test(x.textContent || '')); if (t) { t.scrollIntoView(); return true; } return false; })) break; await page.mouse.wheel(0, 800); await wait(page, 300); }
    await wait(page, 1500); await shot(page, 'p7_feed_photo_card'); });
  await ctx.close();
}
if (part === 'all' || part === 'ask') {
  const { ctx, page } = await open(b, 'mint', lang);
  await coach(page);
  await tryStep('ask', async () => {
    await page.click('.at-sw button >> nth=1'); await wait(page, 2500);
    const q = await page.$('[data-ask-answer]'); await q.click(); await wait(page, 2500);
    await page.evaluate(() => document.querySelector('[data-award]')?.scrollIntoView({ block: 'center' })); await wait(page, 600); await shot(page, 'a1_award_tags'); });
  await tryStep('nudge', async () => { await page.fill('.at-composer input', lang === 'th' ? 'ไปรูฟท็อปที่อารีย์เลย สวยมาก' : 'Try the rooftop at Ari, love it'); await wait(page, 500); await shot(page, 'a2_award_nudge'); });
  await tryStep('kind', async () => { await page.fill('.at-composer input', lang === 'th' ? 'ถามอะไรโง่ ๆ หาเองสิ ควาย' : 'what a stupid question, idiot'); await page.click('.at-go'); await wait(page, 600); await shot(page, 'a3_kindness_check'); });
  await ctx.close();
}
if (part === 'all' || part === 'orb') {
  for (const w of [360, 390, 430]) {
    for (const who of ['bee', 'ploy']) {
      const { ctx, page } = await open(b, who, lang, '/app/', false, { w });
      await coach(page);
      await page.click('[data-tab="me"]'); await wait(page, 4000);
      const r = await page.evaluate(() => {
        const R = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left, y: b.top, r: b.right, b: b.bottom }; };
        const orb = R('#meOrb'); const hit = (a, c) => a && c && a.x < c.r && c.x < a.r && a.y < c.b && c.y < a.b;
        const others = { photo: R('#meEdit'), stats: R('#meStats'), icons: R('.kme-icons'), chip: R('#meChip'), tabs: R('#goMeReels .go-seg'), grid: R('#goGrid'), name: R('.rv4-pnm'), question: R('.mc-q, .kme-q, [class*="qbub"]') };
        return { orb, overlaps: Object.entries(others).filter(([, v]) => hit(orb, v)).map(([k]) => k), inView: orb ? orb.r <= window.innerWidth && orb.x >= 0 : false };
      });
      log.push(`orb ${who} ${w}px: ${JSON.stringify(r.overlaps)} inView=${r.inView} ${r.orb ? Math.round(r.orb.x) + ',' + Math.round(r.orb.y) : 'none'}`);
      if (w === 390) await shot(page, `o1_me_orb_${who}`);
      if (w !== 390 && who === 'bee') await shot(page, `o2_me_orb_${w}`);
      if (w === 390 && who === 'bee') {
        await page.click('#meOrb', { force: true }); await wait(page, 3500); await shot(page, 'o3_orb_opens_board');
        await tryStep('win', async () => { await page.click('#kxWinOpen'); await wait(page, 1200); await shot(page, 'r1_how_to_win'); await page.evaluate(() => document.querySelector('.rw-fine, .rw-scroll, #kxHow')?.scrollIntoView({ block: 'end' })); await wait(page, 400); await shot(page, 'r2_how_to_win_more'); await page.keyboard.press('Escape'); await page.click('#kxWinOk').catch(() => undefined); await wait(page, 500); });
        await tryStep('fpaward', async () => { await page.locator('[aria-label="Fah"]').first().click(); await wait(page, 2500); await shot(page, 'f1_fairplay_award_line'); });
      }
      await ctx.close();
    }
  }
}
await b.close(); console.log(lang, '\n' + log.join('\n'));
