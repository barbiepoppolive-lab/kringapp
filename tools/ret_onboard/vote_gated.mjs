// m216 check: an unchecked member (tasks_today gated, top-level 'vote') taps "Vote" on the steps strip → Ask BKK opens with the
// This-or-That card. LOCAL build + LOCAL fake backend only. Usage: node tools/ret_onboard/vote_gated.mjs <out dir>
import path from 'node:path'; import fs from 'node:fs';
import { start, settle, makeAvatars } from './harness.mjs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
await makeAvatars();
const browsers = {};
const vote = { kind: 'pair', q_en: 'A foreigner wais you first: sweet, or cringe?', q_th: 'ฝรั่งไหว้คุณก่อน น่ารักดี หรือ เขินแทน?', a_en: 'Sweet', a_th: 'น่ารักดี', a_img: null, b_en: 'Cringe', b_th: 'เขินแทน', b_img: null, c_en: null, c_th: null, img: null, pick: null, pct: null };
const s = await start(browsers, { lang: 'en', st: { on: true, new: true, vote: false, ask: false, likes: 0, clip: false, done: false, answers: 0, streak: 0 },
  rpc: { kr8_tasks_today: { on: true, day: '2026-11-25', gated: true, verified: false, tasks: [], vote }, kr8_ask_feed: { items: [], people: {} } } });
await s.page.click('#onbStrip .onb-line'); await settle(s.page, 500);
await s.page.click('#onbStrip [data-onb-go="vote"]'); await settle(s.page, 2000);
const seen = await s.page.getByText(vote.q_en).count();
await s.page.screenshot({ path: path.join(out, 'vote_gated.png') });
console.log('vote card shown to unchecked member:', seen > 0, s.page.errs.filter((e) => !/open-meteo|interactive-widget/.test(e)).slice(0, 3));
await s.context.close(); for (const b of Object.values(browsers)) await b.close();
