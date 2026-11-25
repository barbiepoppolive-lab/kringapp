// ret-onboard proof shots (m214, four steps m216) on the LOCAL build + LOCAL fake backend, QA member "Ploy" (example cast, initial avatars).
// Usage: node tools/ret_onboard/shots.mjs <out dir> <en|th>   (dev server: tools/prize_ui/dev.sh)
import fs from 'node:fs'; import path from 'node:path';
import { start, settle, makeAvatars } from './harness.mjs';
import { CAST, FAKE } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2]; const lang = process.argv[3] || 'en';
fs.mkdirSync(out, { recursive: true });
await makeAvatars();
const browsers = {};
const shot = (s, n) => s.page.screenshot({ path: path.join(out, `${lang}_${n}.png`) });
const DAY = '2026-11-25';
const Q = '6f1c2b1e-0000-4000-8000-00000000a001';
const at = '2026-11-25T08:00:00Z';
const ppl = Object.fromEntries(['ploy', 'mint', 'nat', 'aom'].map((k) => [CAST[k].id, { name: CAST[k].name, photo: `${FAKE}/media/faces/${k}.jpg`, local: true }]));
const ansRow = (id, k, body, score) => ({ id, parent_id: null, author_id: CAST[k].id, body, media_path: null, media_kind: null, score, my_vote: 0, created_at: at, reacts: {}, my_react: null, media_check: null });
const rawQ = { id: Q, author_id: CAST.mint.id, area: 'Ari', body: lang === 'th' ? 'คาเฟ่ไหนในอารีย์นั่งทำงานได้ทั้งวัน?' : 'Which Ari café lets you work all day?', details: null,
  media_path: null, media_kind: null, score: 6, my_vote: 0, answers: 3, top: null, created_at: at };
const vote = { kind: 'price', q_en: 'Fair price for a mango sticky rice?', q_th: 'ข้าวเหนียวมะม่วงราคาเท่าไหร่ถึงพอดี?', a_en: '฿60', a_th: '฿60', a_img: null, b_en: '฿100', b_th: '฿100', b_img: null,
  c_en: '฿150', c_th: '฿150', c_img: null, img: null, pick: 'b', pct: { a: 30, b: 55, c: 15, n: 20 } };
const tasks = { on: true, day: DAY, resets_at: '2026-11-25T17:00:00Z', verified: true, max: 4, rings_today: 1, streak: [true, true, false, false, false, false, false],
  tasks: [{ id: 'vote', rings: 1, done: true, claimed: false, vote }, { id: 'ask', rings: 1, question: { id: Q, body: rawQ.body } }, { id: 'watch', rings: 1, progress: 0, goal: 3 }] };
const rpc = {
  kr8_tasks_today: tasks, kr8_task_vote_who: [], kr8_task_reasons_today: { presets: {}, reasons: [] }, kr8_task_streak: null,
  kr8_ask_feed: { items: [rawQ], people: ppl },
  kr8_ask_thread: { q: rawQ, answers: [ansRow('a1', 'nat', lang === 'th' ? 'Landhaus ปลั๊กเยอะ เงียบดี' : 'Landhaus: lots of plugs, quiet', 4), ansRow('a2', 'ploy', lang === 'th' ? 'Kaizen Coffee ชั้นสอง' : 'Kaizen Coffee, upstairs', 1)], people: ppl },
};

// 1-3: Feed strip, opened, Me line (new member; m216 four steps: vote done = 1 of 4, 1 of 3 likes)
{
  const s = await start(browsers, { lang, st: { on: true, new: true, ends_at: '2026-11-27T10:00:00Z', vote: true, ask: false, likes: 1, clip: false, done: false, badge: false, answers: 1, streak: 1 }, rpc });
  await shot(s, '1_feed_strip');
  await s.page.click('#onbStrip .onb-line'); await settle(s.page, 700);
  await shot(s, '2_feed_steps');
  await s.page.click('nav.dock [data-tab="me"]'); await settle(s.page, 1800);
  await s.page.click('#meOnb .onb-me-line').catch((e) => console.log('meOnb', e.message.slice(0, 120))); await settle(s.page, 600);
  await shot(s, '3_me_steps');
  console.log(lang, 'A errs', s.page.errs.filter((e) => !/open-meteo|interactive-widget/.test(e)).slice(0, 4));
  await s.context.close();
}
if (!process.env.ONLY_A) {
// 4-7: done member: People "answered like you", own profile tags, another member's profile tags, This-or-That + Ask thread rows
{
  const s = await start(browsers, { lang, st: { on: true, new: true, vote: true, ask: true, likes: 3, clip: true, done: true, badge: true, answers: 4, streak: 4 }, rpc,
    badges: { ploy: ['bangkok_local'], mint: ['bangkok_local'] }, streaks: { ploy: 4, mint: 3 } });
  await s.page.click('nav.dock [data-tab="people"]'); await settle(s.page, 1800);
  await shot(s, '4_people_alike');
  await s.page.click('nav.dock [data-tab="me"]'); await settle(s.page, 1800);
  await shot(s, '5_me_tags');
  await s.page.click('nav.dock [data-tab="people"]'); await settle(s.page, 800);
  await s.page.click('#pplAlike .al-who >> nth=0'); await settle(s.page, 1800);
  await shot(s, '6_profile_tags');
  await s.page.keyboard.press('Escape'); await settle(s.page, 500);
  await s.page.click('nav.dock [data-tab="feed"]'); await settle(s.page, 800);
  await s.page.click('.at-sw button >> nth=1').catch(async () => { await s.page.getByText(/Ask BKK/).first().click(); }); await settle(s.page, 2000);
  await s.page.evaluate(() => document.querySelector('#alike-vote')?.scrollIntoView({ block: 'center' }));
  await settle(s.page, 600);
  await shot(s, '7_vote_alike');
  await s.page.evaluate(() => (document.querySelector('[data-ask-q], .rva-card, .at-card') || null)?.dispatchEvent(new MouseEvent('click', { bubbles: true })));
  await s.page.getByText(rawQ.body).first().click().catch((e) => console.log('q', e.message.slice(0, 120)));
  await settle(s.page, 1800);
  await shot(s, '8_ask_alike');
  console.log(lang, 'B errs', s.page.errs.filter((e) => !/open-meteo|interactive-widget/.test(e)).slice(0, 4));
  await s.context.close();
}
} // end ONLY_A guard
for (const b of Object.values(browsers)) await b.close();
