// Release 17 Nov proof board: the REAL local build (vite dev on the prize_ui fake backend) at 390 px, seeded demo data.
// LOCAL-ONLY: every host other than the local dev server is aborted (see ../prize_ui/fake_kring.mjs). Usage:
//   bash tools/prize_ui/dev.sh &   node tools/release_17nov/board.mjs <out dir>
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from '../prize_ui/run.mjs';
import { APP } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/release_board';
fs.mkdirSync(out, { recursive: true });
const browsers = {};
const img = (n) => `${APP}media/places/${n}.jpg`;
const TEAM = 'fd5cca36-9be2-4dde-9d7d-2dd9c898deaa';
const TREATS = [
  { id: 't1', venue: 'Baan Ari Coffee', venue_th: 'บ้านอารีย์ คอฟฟี่', area: 'Ari', cat: 'coffee', tag: 'Coffee', title: 'Free cookie', price_now: 0, price_was: 0, total: 50, claimed: 3, left_count: 47,
    valid_window: 'all day', img: img('bacc'), mine_code: null, deal_en: 'Free butter cookie with any coffee', deal_th: 'คุกกี้เนยฟรี เมื่อสั่งกาแฟแก้วใดก็ได้', hours_en: '8:00–18:00', hours_th: '8:00–18:00', maps_url: 'https://maps.app.goo.gl/x' },
  { id: 't2', venue: 'Talad Noi Studio', venue_th: 'ตลาดน้อย สตูดิโอ', area: 'Talad Noi', cat: 'fun', tag: 'Fun', title: 'Pottery', price_now: 0, price_was: 0, total: 20, claimed: 1, left_count: 19,
    valid_window: 'all day', img: img('bang-lamphu'), mine_code: null, deal_en: '฿50 off a 1-hour pottery class', deal_th: 'ลด ฿50 คลาสปั้นดิน 1 ชั่วโมง', hours_en: '10:00–20:00', hours_th: '10:00–20:00', maps_url: null },
];
const LISTINGS = [
  { id: 'l1', kind: 'stay', name: 'Riverside Hostel Bangkok', name_th: 'ริเวอร์ไซด์ โฮสเทล', area: 'Riverside', blurb_en: 'Dorm beds by the river, rooftop with a view', blurb_th: 'เตียงหอพักริมน้ำ ดาดฟ้าวิวสวย',
    photos: [img('asiatique-the-riverfront')], member_price_thb: 390, price_unit_en: 'per night', price_unit_th: 'ต่อคืน', saving_thb: 60, booking_kind: 'line', booking_contact: 'riverside', my_code: 'K-1234' },
];
const now = '2026-11-18T09:00:00Z';
const ASK = {
  items: [
    { id: 'q1', author_id: 'k-team', area: 'Bangkok', body: 'Loy Krathong is on 24 Nov 🪷 Where will you float yours this year?', details: null, media_path: null, media_kind: null, score: 41, my_vote: 0, answers: 6,
      top: { id: 'a1', parent_id: null, author_id: 'k-ploy', body: 'Benjakitti Park lake, quiet and pretty at 8pm', media_path: null, media_kind: null, score: 12, my_vote: 0, created_at: now }, created_at: now },
    { id: 'q2', author_id: 'k-lena', area: 'Riverside', body: 'Where do Thais watch the sunset by the river for free? 🌅', details: null, media_path: null, media_kind: null, score: 214, my_vote: 0, answers: 9,
      top: { id: 'a2', parent_id: null, author_id: 'k-nat', body: 'Lhong 1919 pier side, go at 17:30', media_path: null, media_kind: null, score: 30, my_vote: 0, created_at: now }, created_at: now },
  ],
  people: {
    'k-team': { name: 'Kring Team', photo: null, local: false, official: true },
    'k-ploy': { name: 'Ploy', photo: null, local: true }, 'k-lena': { name: 'Lena', photo: null, local: false }, 'k-nat': { name: 'Nat', photo: null, local: true },
  },
};
const REWARDS = { week: 64, rank: 3, lifetime: 420, level: 2, gap: null, ends_at: '2026-11-22T17:00:00Z', member_no: 37, founding_no: 12, founding_left: 38, floor: 25,
  rules: { truemoney_payout_pct: 100 }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 2, checked_in_today: true, claim_face_check: true,
  prizes: [{ id: 'pz1', kind: 'weekly', week: '2026-11-09', rank: 4, founding_no: null, amount: 500, rings: 88, status: 'won', claim_id: null, created_at: now }], claims: [] };

const shots = [];
const shot = async (page, name, label) => { const f = path.join(out, `${name}.png`); await page.screenshot({ path: f }); shots.push({ f, label }); };
const tap = async (page, sel) => { await page.click(sel, { timeout: 5000 }).catch((e) => console.log('tap', sel, e.message.split('\n')[0])); await settle(page, 1200); };

const { page, context, state } = await open(browsers, 'iphone14', 'C');
Object.assign(state.data.rpc, { kr8_treats_live: TREATS, kr8_listings_live: LISTINGS, kr8_ask_feed: ASK, kr8_my_rewards: REWARDS, kr8_team_ids: [TEAM],
  kr8_inbox: [{ thread_id: 'th1', status: 'open', opened_by_me: false, other_id: TEAM, other_name: 'Kring Team', other_photo: null, other_langs: ['TH', 'EN'], other_verified: false,
    other_area: 'Bangkok', last_body: 'Welcome to Kring! Your first Reel this week counts for the prize 🎉', last_sender_me: false, last_at: now, unread: 1 }] });
await settle(page, 2500);
await shot(page, '1_feed', 'Feed · weekly prize line');
await tap(page, '.at-sw button[role="tab"]:nth-child(2)');
await shot(page, '5_ask', 'Ask a Thai · Kring Team = Official');
await tap(page, '.at-sw button[role="tab"]:nth-child(1)');
await tap(page, 'nav.dock [data-tab="me"]');
await page.evaluate(() => { const c = document.querySelector('.kpz-cardwrap'); if (c) c.scrollIntoView({ block: 'center' }); });
await page.waitForTimeout(600);
await shot(page, '2_me', 'Me · prize race card');
await tap(page, '#kxRankTile');
await shot(page, '3_ranking', 'Ranking · look A, no tabs');
await page.goBack().catch(() => {}); await settle(page, 800);
await tap(page, 'nav.dock [data-tab="deals"]');
await shot(page, '4_deals', 'Deals · live design, no sideways scroll');
await page.evaluate(() => { const s = document.getElementById('s-deals'); const t = s && [...s.querySelectorAll('h2,h3,b')].find((e) => /For your trip|travel essentials/i.test(e.textContent || '')); if (t) t.scrollIntoView({ block: 'start' }); });
await page.waitForTimeout(600);
await shot(page, '4b_trip', 'Deals · For your trip');
const sw = await page.evaluate(() => { const s = document.getElementById('s-deals'); return { sw: s.scrollWidth, cw: s.clientWidth }; });
console.log('deals width', sw);
await context.close();

// claim face check: rewards page (push link ?open=rewards) → Claim → Grab → confirm → face step
{
  const { page: p2, context: c2, state: s2 } = await open(browsers, 'iphone14', 'C', { query: '?open=rewards' });
  Object.assign(s2.data.rpc, { kr8_my_rewards: REWARDS, kr8_team_ids: [TEAM] });
  await settle(p2, 3000);
  await tap(p2, '[data-claim-prize="pz1"]');
  await tap(p2, '#kxClaimGo');
  await shot(p2, '6_claim_face', 'Claim · face check');
  await c2.close();
}
// post screen note + Kring Team chat
{
  const { page: p3, context: c3, state: s3 } = await open(browsers, 'iphone14', 'C');
  Object.assign(s3.data.rpc, { kr8_team_ids: [TEAM], kr8_inbox: state.data.rpc.kr8_inbox });
  await settle(p3, 2500);
  await tap(p3, '.chat-fab');
  await shot(p3, '7_chats', 'Chats · Kring Team · Official');
  await c3.close();
}
for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, 'shots.json'), JSON.stringify(shots, null, 1));
console.log(shots.map((s) => s.f).join('\n'));
