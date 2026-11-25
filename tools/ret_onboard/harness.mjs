// ret-onboard proof shots: the REAL local build (vite dev, tools/prize_ui/dev.sh) on the LOCAL seeded backend
// (tools/prize_ui/fake_kring.mjs). Every host other than the local dev server is aborted: nothing reaches live or test.
// Signed in as the QA member "Ploy" from the example cast (placeholder initial avatars, no real member's data).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { open, settle } from '../prize_ui/run.mjs';
import { CAST, FAKE } from '../prize_ui/fake_kring.mjs';
export { settle };

const pw = createRequire(import.meta.url)(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
const face = (k) => `${FAKE}/media/faces/${k}.jpg`;

function initialSvg(name) {
  const ch = (Array.from((name || '').trim())[0] || '?').toUpperCase();
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pairs = [['#5B6CFF', '#2A2C6E'], ['#FF4FA3', '#5B2A6E'], ['#6EE7A8', '#1E5B4B'], ['#FFB547', '#6E3A1E'], ['#3FD0FF', '#1E3F6E']];
  const [a, b] = pairs[h % pairs.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${ch}</text></svg>`;
}
const AV = '/tmp/claude-0/-home-claude/b4df4a5f-34ab-5ac3-93b2-e9f658e3bfed/scratchpad/_avatars';
export async function makeAvatars() {
  fs.mkdirSync(AV, { recursive: true });
  if (fs.readdirSync(AV).length >= Object.keys(CAST).length) return;
  const b = await pw.chromium.launch();
  const pg = await b.newPage({ viewport: { width: 384, height: 384 } });
  for (const [k, c] of Object.entries(CAST)) {
    await pg.setContent(`<body style="margin:0">${initialSvg(c.name)}</body>`);
    await pg.screenshot({ path: path.join(AV, `${k}.png`) });
  }
  await b.close();
}

const PEOPLE = ['mint', 'nat', 'aom', 'ton', 'yui', 'lena', 'minjun', 'liam'];
const json = (route, body) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/** st: the kr8_onb_state the QA member gets; alike: people list; streaks: per cast key */
export async function start(browsers, o) {
  const s = await open(browsers, o.dev || 'iphone14', 'A', { storage: { kr8_lang: o.lang || 'en', kr8_pz_seen_6f1c2b1e: '1', kr8_ask_seen: '1', ...(o.storage || {}) } });
  const r = s.state.data.rpc;
  r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, verified: true, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-25T03:00:00Z', promo_ok: true } };
  r.kr8_accept_terms = '2026-11-25T03:00:00Z';
  r.kr8_my_face_status = { verified: true, new_check: false, pending: false, blocked: false, tries_left: 3 };
  r.kr8_feed_ranked = r.kr8_feed;
  r.kr8_coach_state = ['save', 'post', 'score', 'share', 'pb_gender', 'pb_area', 'pb_likes', 'pb_langs', 'pb_bio', 'pb_qa', 'pb_done'];
  r.kr8_people = PEOPLE.map((k) => ({ user_id: CAST[k].id, first_name: CAST[k].name, photo: face(k), langs: ['TH', 'EN'], bio: '', area: CAST[k].area, who: CAST[k].who, here: false, verified: k !== 'liam' }));
  r.kr8_people_extras = PEOPLE.map((k) => ({ user_id: CAST[k].id, interests: ['coffee'], reels: 2, badges: [], last_rank: null }));
  r.kr8_card_extras = { ...r.kr8_card_extras, week: 0, week_rank: null, founding_no: null };
  r.kr8_onb_state = o.st || { on: true, new: true, ends_at: '2026-11-27T10:00:00Z', ask: false, likes: 0, clip: false, done: false, badge: false, answers: 0, streak: 0 };
  r.kr8_onb_alike = { eligible: true, answers: 3, people: (o.alike || ['mint', 'aom', 'yui', 'nat', 'liam']).map((k, i) => ({ user_id: CAST[k].id, first_name: CAST[k].name, photo: face(k), verified: k !== 'liam', same_votes: 2 - (i % 2), same_questions: i % 2 })) };
  r.kr8_follow = true;
  Object.assign(r, o.rpc || {});
  const prof = (k, mine) => ({ user_id: CAST[k].id, first_name: CAST[k].name, photo: face(k), langs: ['TH', 'EN'], bio: mine ? 'Ari cafés and rooftops' : '', area: CAST[k].area, who: CAST[k].who,
    verified: true, online: false, here: false, mine, gated: mine ? false : null, ig_handle: null, interests: ['coffee', 'sunsets'], member_no: 'KR 2041',
    level: { level: 'anchan', posts: 1, visits: 0, points: 4, next: 'tea', need_points: 6, pct: 40 }, followers: 3, following: 5, likes: 12, gifts: 0,
    i_follow: false, follows_me: false, lists_private: false, qa_q: null, qa_answer: null, reels: [{ id: `6f1c2b1e-0000-4000-8000-00000000030${PEOPLE.indexOf(k) + 1}`, poster_path: 'p/dusit.jpg', likes: 4, status: 'approved' }],
    badges: (o.badges || {})[k] || [], last_week: null, streak: (o.streaks || {})[k] ?? 0 });
  await s.context.route('**/__fake/rest/v1/rpc/kr8_profile', async (route) => {
    let u = null;
    try { u = JSON.parse(route.request().postData() || '{}').p_user || null; } catch { /* none */ }
    const k = u ? Object.keys(CAST).find((x) => CAST[x].id === u) : 'ploy';
    s.state.calls.push('kr8_profile');
    return json(route, prof(k || 'mint', !u || k === 'ploy'));
  });
  await s.context.route('**/__fake/media/faces/**', (route) => {
    const k = new URL(route.request().url()).pathname.split('/').pop().replace(/\.jpg$/, '');
    const f = path.join(AV, `${k}.png`);
    return fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'image/png' }) : route.fulfill({ status: 404 });
  });
  await s.page.reload({ waitUntil: 'domcontentloaded' });
  await settle(s.page, 3500);
  return s;
}
