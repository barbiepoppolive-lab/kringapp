// 25 Nov profile badges (m211) proof shots: the REAL local build (vite dev, tools/prize_ui/dev.sh) on the LOCAL seeded backend
// (tools/prize_ui/fake_kring.mjs). Every host other than the local dev server is aborted: nothing reaches live or test.
//   bash tools/prize_ui/dev.sh &   node tools/badges/shots.mjs <out dir>
// Member names, bios, areas, counts and week-47 places are copied read-only from production kr8_profile (25 Nov).
// Faces are the app's own initial avatars (founder rule: no realistic person photos in mocks).
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from '../prize_ui/run.mjs';
import { CAST, FAKE } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/badges';
fs.mkdirSync(out, { recursive: true });
const face = (k) => `${FAKE}/media/faces/b_${k}.jpg`;
const browsers = {};
const log = [];

const W47 = (rank) => ({ rank, week: '2026-11-16', week_no: 47 });
const M = {
  jaaaa: { user_id: '04035699-1ee6-4e12-9d94-abdc4b013387', first_name: 'Jaaaa', bio: 'ชอบเดินหาของกินแถวบ้านมากกว่าห้าง', area: 'Chatuchak', langs: ['TH'],
    interests: ['books', 'cooking', 'desserts', 'markets', 'sunsets'], followers: 9, following: 7, likes: 67, member_no: 'KR 2935', ig_handle: 'jaaaa.tyl',
    qa_q: 'soi_shop', qa_answer: 'ร้านข้าวมันไก่', badges: [], last_week: W47(1) },
  nut: { user_id: '8276541f-2826-4a05-89a3-e054e593dcd7', first_name: 'Nut', bio: '', area: 'Bangkok', langs: ['TH'], interests: [], followers: 3, following: 2, likes: 40,
    member_no: 'KR 1180', badges: [], last_week: W47(2) },
  otop: { user_id: '0a21313a-b688-43d2-87ce-2d611fc7dbed', first_name: 'โอท็อปไงจะใครหล่ะ', bio: 'No.1 เรื่องเที่ยว', area: 'Bangkok', langs: ['TH'], interests: [],
    followers: 4, following: 0, likes: 10, member_no: 'KR 2236', ig_handle: 'tanet_kulsatan', badges: ['founding_local'], last_week: W47(3) },
  mn: { user_id: '46b15064-48e8-4622-b725-839ddfaec0d0', first_name: 'M.n', bio: '', area: 'Bangkok', langs: ['TH'], interests: [], followers: 2, following: 1, likes: 22,
    member_no: 'KR 5120', badges: [], last_week: W47(4) },
  pich: { user_id: '474b8497-2bad-47d1-9b39-68ebc780f717', first_name: 'Pichy Review💗', bio: '', area: 'Bangkok', langs: ['TH'], interests: [], followers: 5, following: 3,
    likes: 18, member_no: 'KR 3307', badges: ['founding_local'], last_week: W47(6) },
  meaw: { user_id: 'c6844e7d-b3a2-4a08-9bda-33c6e5823dfd', first_name: 'Meaw On Tour', bio: '', area: 'Bangkok', langs: ['EN'], interests: [], followers: 1, following: 0,
    likes: 12, member_no: 'KR 6537', ig_handle: null, badges: [], last_week: null },
};
const ORDER = ['jaaaa', 'otop', 'pich', 'mn', 'nut', 'meaw'];

function initialSvg(name) {
  const ch = (Array.from((name || '').trim())[0] || '?').toUpperCase();
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pairs = [['#5B6CFF', '#2A2C6E'], ['#FF4FA3', '#5B2A6E'], ['#6EE7A8', '#1E5B4B'], ['#FFB547', '#6E3A1E'], ['#3FD0FF', '#1E3F6E']];
  const [a, b] = pairs[h % pairs.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="62" text-anchor="middle" font-family="Noto Sans Thai, Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${ch}</text></svg>`;
}
const AVATAR_DIR = path.join(out, '_avatars');
async function makeAvatars() {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const { createRequire } = await import('node:module');
  const pw = createRequire(import.meta.url)(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
  const b = await pw.chromium.launch();
  const pg = await b.newPage({ viewport: { width: 384, height: 384 } });
  for (const [k, c] of Object.entries(M)) {
    await pg.setContent(`<body style="margin:0">${initialSvg(c.first_name).replace('<svg ', '<svg width="384" height="384" ')}</body>`);
    await pg.screenshot({ path: path.join(AVATAR_DIR, `b_${k}.png`) });
  }
  await b.close();
}
await makeAvatars();

const reels = ['dusit', 'lumpini', 'bangpu'];
function profileOf(k, mine) {
  const m = M[k];
  return { photo: face(k), who: 'local', verified: true, online: false, here: false, mine, gated: mine ? false : null, gifts: 0, ig_handle: null, qa_q: null, qa_answer: null,
    level: { level: 'anchan', posts: 4, visits: 0, points: 4, next: 'tea', need_points: 6, pct: 40 }, i_follow: false, follows_me: false, lists_private: false,
    reels: reels.map((r, i) => ({ id: `6f1c2b1e-0000-4000-8000-0000000003${i}${ORDER.indexOf(k)}`, poster_path: `p/${r}.jpg`, likes: 4, status: 'approved' })),
    ...m, ...(mine ? { user_id: CAST.ploy.id } : {}) };
}

/** Me = `meKey` (signed in as that member); kr8_profile answers by p_user. */
async function wireBadges(o, meKey) {
  const r = o.state.data.rpc;
  const me = M[meKey];
  r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, first_name: me.first_name, photo: face(meKey), bio: me.bio, area: me.area, langs: me.langs, interests: me.interests, verified: true, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-25T03:00:00Z', promo_ok: true } };
  r.kr8_accept_terms = '2026-11-25T03:00:00Z';
  r.kr8_my_face_status = { verified: true, new_check: false, pending: false, blocked: false, tries_left: 3 };
  r.kr8_feed_ranked = r.kr8_feed;
  r.kr8_coach_state = ['save', 'post', 'score', 'share', 'pb_gender', 'pb_area', 'pb_likes', 'pb_langs', 'pb_bio', 'pb_qa', 'pb_done'];
  r.kr8_people = ORDER.filter((k) => k !== meKey).map((k) => ({ user_id: M[k].user_id, first_name: M[k].first_name, photo: face(k), langs: M[k].langs, bio: M[k].bio,
    area: M[k].area, who: 'local', here: false, verified: true }));
  r.kr8_people_extras = ORDER.filter((k) => k !== meKey).map((k) => ({ user_id: M[k].user_id, interests: M[k].interests, reels: 3, badges: M[k].badges,
    last_rank: M[k].last_week?.rank ?? null }));
  r.kr8_card_extras = { ...r.kr8_card_extras, week: 0, week_rank: null, founding_no: null };
  await o.context.route('**/__fake/rest/v1/rpc/kr8_profile', async (route) => {
    let u = null;
    try { u = JSON.parse(route.request().postData() || '{}').p_user || null; } catch { /* none */ }
    const k = u ? Object.keys(M).find((x) => M[x].user_id === u) : meKey;
    o.state.calls.push('kr8_profile');
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(profileOf(k || 'meaw', !u)) });
  });
  await o.context.route('**/__fake/rest/v1/rpc/kr8_member_reels', async (route) => {
    let u = null;
    try { u = JSON.parse(route.request().postData() || '{}').p_user || null; } catch { /* none */ }
    const p = profileOf(Object.keys(M).find((x) => M[x].user_id === u) || meKey, !u);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ user_id: u || CAST.ploy.id, mine: !u, best: null, reels: p.reels.map((x) => ({ ...x, video_path: x.poster_path.replace('.jpg', '.mp4'), body: null,
        created_at: '2026-11-18T10:00:00Z', saves: 0, this_week: false, rings: 0, place: null, liked: false, saved: false })) }) });
  });
  await o.context.route('**/__fake/media/faces/**', (route) => {
    const k = new URL(route.request().url()).pathname.split('/').pop().replace(/\.jpg$/, '');
    const f = path.join(AVATAR_DIR, `${k}.png`);
    return fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'image/png' }) : route.fulfill({ status: 404 });
  });
}

async function shot(name, page, sel) {
  const f = path.join(out, name);
  await page.screenshot({ path: f });
  const txt = sel ? await page.evaluate((s) => document.querySelector(s)?.textContent ?? '(none)', sel) : '';
  log.push({ name, badges: txt, errors: page.errs.filter((e) => !/interactive-widget/.test(e)) });
}

async function run(key, lang, meKey, go) {
  const o = await open(browsers, 'pixel7', 'A', { storage: { kr8_lang: lang, kr8_pz_seen_6f1c2b1e: '1' } });
  await wireBadges(o, meKey);
  await o.page.reload({ waitUntil: 'domcontentloaded' });
  await settle(o.page, 3500);
  try { await go(o.page); } catch (e) {
    await o.page.screenshot({ path: path.join(out, `debug_${key}_${lang}.png`) });
    console.log('STEP FAILED', key, lang, String(e).slice(0, 300), o.page.errs, [...new Set(o.state.calls)].join(','));
  }
  log.push({ key, lang, blocked: [...new Set(o.blocked)] });
  await o.context.close();
}

async function openFromPeople(page, name) {
  await page.click('nav.dock [data-tab="people"]');
  await settle(page, 1800);
  await page.click(`#pplGrid .pcard:has(.nm:text-is("${name}"))`);
  await page.waitForSelector('#profileView', { timeout: 8000 });
  await settle(page, 1500);
}

for (const lang of ['en', 'th']) {
  const L = lang.toUpperCase();
  await run('people', lang, 'nut', async (page) => {
    await page.click('nav.dock [data-tab="people"]');
    await settle(page, 2200);
    await shot(`B5_people_cards_${L}.png`, page, '#pplGrid');
  });
  await run('winner', lang, 'nut', async (page) => { await openFromPeople(page, 'Jaaaa'); await shot(`B1_winner_rank1_profile_${L}.png`, page, '#profileBadges'); });
  await run('otop', lang, 'nut', async (page) => { await openFromPeople(page, M.otop.first_name); await shot(`B2_otop_profile_${L}.png`, page, '#profileBadges'); });
  await run('mn', lang, 'nut', async (page) => { await openFromPeople(page, 'M.n'); await shot(`B4_rank4_profile_${L}.png`, page, '#profileBadges'); });
  await run('none', lang, 'nut', async (page) => { await openFromPeople(page, 'Meaw On Tour'); await shot(`B6_no_badge_profile_${L}.png`, page, '#profileBadges'); });
  await run('me', lang, 'otop', async (page) => {
    await page.click('nav.dock [data-tab="me"]');
    await settle(page, 2500);
    await shot(`B3_otop_own_me_${L}.png`, page, '#meBadges');
  });
}
for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, 'log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
