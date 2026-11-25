// Release 25 Nov: member-side proof on the LOCAL build + LOCAL fake backend (tools/prize_ui/dev.sh), QA member "Ploy".
// First-visit steps strip + New in Bangkok row together (they must not overlap), a vote card, Me line, People, posting sheet.
// Usage: node tools/release_25nov/member_shots.mjs <out dir> <en|th> <iphone14|pixel7>
import fs from 'node:fs'; import path from 'node:path';
import { start, settle, makeAvatars } from '../ret_onboard/harness.mjs';
import { CAST, FAKE } from '../prize_ui/fake_kring.mjs';
const out = process.argv[2]; const lang = process.argv[3] || 'en'; const dev = process.argv[4] || 'iphone14';
fs.mkdirSync(out, { recursive: true }); await makeAvatars();
const at = '2026-11-25T08:00:00Z';
const nf = ['mint', 'nat', 'aom', 'yui'].map((k, i) => ({ k: 'ans', id: `nf-${k}`, author_id: CAST[k].id, name: CAST[k].name, body: 'Landhaus', at, mine: false, verified: true, post_id: `6f1c2b1e-0000-4000-8000-00000000a00${i}`, photo: `${FAKE}/media/faces/${k}.jpg` }));
const vc = [0, 1].map((n) => ({ id: `6f1c2b1e-0000-4000-8000-0000000vc00${n}`, body: lang === 'th' ? 'คาเฟ่ไหนในอารีย์นั่งทำงานได้ทั้งวัน?' : 'Which Ari café lets you work all day?', details: null, official: true, at, answers: 5, voters: 4,
  top: [{ id: `va${n}1`, body: 'Landhaus', score: 4, name: 'Nat' }, { id: `va${n}2`, body: 'Kaizen Coffee', score: 2, name: 'Mint' }, { id: `va${n}3`, body: 'Lay Lao', score: 1, name: 'Aom' }] }));
import { seed } from '../prize_ui/fake_kring.mjs';
const base = seed('A').rpc.kr8_feed || [];
const feed8 = [...base, ...base.map((r, i) => ({ ...r, id: String(r.id).replace(/.{4}$/, (m) => `9${String(i).padStart(3, '0')}`) }))];
const s = await start({}, { dev, lang, st: { on: true, new: true, ends_at: '2026-11-27T10:00:00Z', vote: true, ask: false, likes: 1, clip: false, done: false, badge: false, answers: 1, streak: 2 },
  rpc: { kr8_feed_new_faces: { hours: 24, items: nf }, kr8_feed_vote_cards: vc, kr8_feed_vote: { others: 4, same: 2, pct: null }, kr8_feed: feed8, kr8_feed_ranked: feed8 } });
const shot = (n) => s.page.screenshot({ path: path.join(out, `${dev}_${lang}_${n}.png`) });
const box = (sel) => s.page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; }, sel);
await shot('1_feed_top');
const geo = { strip: await box('#onbStrip'), row: await box('#newFaces'), sound: await box('.reel-sound'), top: await s.page.evaluate(() => document.querySelector('#feedScroll')?.scrollTop) };
// to the first vote card (after the 4th Reel)
await s.page.evaluate(() => { const v = document.querySelector('#feedScroll .slide.fv'); v && v.scrollIntoView({ block: 'start' }); }); await settle(s.page, 900);
const hasVote = await s.page.evaluate(() => [document.querySelectorAll('#feedScroll .slide').length, !!document.querySelector('#feedScroll .slide.fv')]);
await shot('2_vote_card');
await s.page.evaluate(() => document.querySelector('#feedScroll')?.scrollTo({ top: 0 })); await settle(s.page, 500);
await s.page.click('nav.dock [data-tab="me"]'); await settle(s.page, 1800); await shot('3_me');
await s.page.click('nav.dock [data-tab="people"]'); await settle(s.page, 1800); await shot('4_people');
await s.page.click('nav.dock [data-tab="feed"]'); await settle(s.page, 800);
await s.page.evaluate(() => window.dispatchEvent(new Event('kr8:post'))); await settle(s.page, 1500);
const posted = await s.page.evaluate(() => [...document.querySelectorAll('[role=dialog], .sheet, [class*=sheet]')].filter((e) => e.getBoundingClientRect().height > 100).map((e) => (e.getAttribute('aria-label') || e.className || '').toString().slice(0, 40)).slice(0, 3));
await shot('5_post');
console.log(dev, lang, s.state.calls.filter((c) => /vote_cards|new_faces/.test(c)).join(','), JSON.stringify({ geo, hasVote, posted }), 'errs', JSON.stringify(s.page.errs.filter((e) => !/open-meteo|interactive-widget/.test(e)).slice(0, 5)));
await s.context.close(); process.exit(0);
