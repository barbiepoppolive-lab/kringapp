// LOCAL-ONLY seeded backend for the weekly-prize UI proof (16 Nov).
// The dev server is started with VITE_SUPABASE_URL=http://127.0.0.1:5317/__fake, so every Supabase call (auth, RPC, storage)
// lands on this same local origin and Playwright answers it here with seeded data. Every other request is aborted,
// except Open-Meteo, which is answered locally with a fixed reading. Nothing can reach kringapp.com or the live project.
import fs from 'node:fs';
import path from 'node:path';

export const ORIGIN = 'http://127.0.0.1:5317';
export const APP = `${ORIGIN}/app/`;
export const FAKE = `${ORIGIN}/__fake`;
/** Approved demo media (AI faces, example Reels) from the app demo pack; never members' real photos. */
export const MEDIA = process.env.KR8_DEMO_MEDIA || '/mnt/attach/outputs/app_demo_v2_src/public/media/demo';

const uuid = (n) => `6f1c2b1e-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const ME_ID = uuid(1);
const face = (k) => `${FAKE}/media/faces/${k}.jpg`;

/** Seeded members: the example Kring cast (AI faces). */
export const CAST = {
  ploy: { id: ME_ID, name: 'Ploy', area: 'Ari', who: 'local' },
  mint: { id: uuid(2), name: 'Mint', area: 'Thonglor', who: 'local' },
  nat: { id: uuid(3), name: 'Nat', area: 'Silom', who: 'local' },
  aom: { id: uuid(4), name: 'Aom', area: 'Bang Rak', who: 'local' },
  ton: { id: uuid(5), name: 'Ton', area: 'Sathorn', who: 'local' },
  yui: { id: uuid(6), name: 'Yui', area: 'Siam', who: 'traveller' },
  lena: { id: uuid(7), name: 'Lena', area: 'Riverside', who: 'traveller' },
  minjun: { id: uuid(8), name: 'Min-jun', area: 'Ekkamai', who: 'traveller' },
  liam: { id: uuid(9), name: 'Liam', area: 'Chinatown', who: 'traveller' },
  valeria: { id: uuid(10), name: 'Valeria', area: 'Old Town', who: 'traveller' },
  arjun: { id: uuid(11), name: 'Arjun', area: 'Sukhumvit', who: 'traveller' },
};

const PRIZES = [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0];
const PAID = 8, FLOOR = 25;
const W0 = '2026-11-15T17:00:00.000Z';          // Mon 16 Nov 00:00 Bangkok (16 Nov 2026 is a Monday)
const ENDS = '2026-11-22T17:00:00.000Z';        // Sun 22 Nov 24:00 Bangkok

/**
 * The weekly board for a scenario: [castKey, rings] in rank order. The gap follows the same rules as kr8_rank_gap (0047).
 */
export function ranking(board, opts = {}) {
  const rows = board.map(([k, rings], i) => {
    const c = CAST[k];
    const rank = i + 1;
    return {
      rank, all_rank: rank, rings, prize: PRIZES[i] || 0, paid: rank <= PAID && rings >= FLOOR && (PRIZES[i] || 0) > 0,
      needs: rank <= PAID && rings < FLOOR ? FLOOR : null,
      to_line: rank > PAID ? Math.max(1, (board[PAID - 1]?.[1] ?? 0) - rings + 1, FLOOR - rings) : null,
      is_new: false, user_id: c.id, first_name: c.name, photo: face(k), area: c.area, move: null, is_me: c.id === ME_ID,
    };
  });
  const mine = rows.find((r) => r.is_me) || null;
  const my = mine?.rings ?? 0, rk = mine?.rank ?? null;
  const others = rows.length - (mine ? 1 : 0);
  const at = (r) => rows.find((x) => x.rank === r)?.rings ?? 0;
  let gap;
  const t = (rank, need, open = false) => ({ rank, need, prize: PRIZES[rank - 1] || 0, open });
  if (rk !== null && rk <= PAID && my < FLOOR) gap = { state: 'floor', target: t(rk, FLOOR - my) };
  else if (rk === 1) gap = { state: 'top', target: null };
  else if (rk !== null && rk <= PAID) gap = { state: 'paid', target: t(rk - 1, Math.max(1, at(rk - 1) - my + 1, FLOOR - my)) };
  else if (others >= PAID) gap = { state: rk === null ? 'off' : rk <= 10 ? 'board' : 'far', target: t(PAID, Math.max(1, at(PAID) - my + 1, FLOOR - my)) };
  else gap = { state: 'off', target: t(others + 1, Math.max(1, FLOOR - my), true) };
  const above = rk && rk > 1 ? { rank: rk - 1, name: rows[rk - 2].first_name, need: at(rk - 1) - my + 1 } : null;
  const behind = rk && rows[rk] ? { rank: rk + 1, diff: my - rows[rk].rings } : null;
  return {
    week_start: W0, ends_at: ENDS, scope: 'all', area: 'Ari', total: rows.length, paid_ranks: PAID, floor: FLOOR, posters: rows.length, min_posters: 0,
    payout_on: true, open_seats: Math.max(0, PAID - rows.length), prizes: PRIZES, rows: rows.slice(0, 10),
    me: mine ? { rank: mine.rank, all_rank: mine.rank, rings: mine.rings, prize: mine.prize, move: opts.move ?? null } : null,
    gap: { ...gap, rank: rk, rings: my, floor: FLOOR, prize_now: rk !== null && rk <= PAID && my >= FLOOR ? PRIZES[rk - 1] : 0, above, behind,
      top10_need: rk === null || rk > 10 ? Math.max(1, (rows[9]?.rings ?? 0) - my + 1) : null },
    mine: { pending: 0, live: mine ? 1 : 0, no_place: 0 },
  };
}

/** Bangkok wall time → ms. */
export const bkk = (iso) => Date.parse(`${iso}+07:00`);

/** The banner states. `now` is the phone's Bangkok time; `board` is the weekly board the server would return. */
export const SCENARIOS = {
  A: { label: 'A · Mon–Wed, no Rings yet', now: bkk('2026-11-18T20:15:00'),
    board: [['mint', 34], ['nat', 29], ['aom', 21], ['ton', 14], ['yui', 9]], week: 0 },
  B: { label: 'B · pride (Thu–Sun, no Rings yet)', now: bkk('2026-11-20T19:40:00'),
    board: [['mint', 96], ['nat', 71], ['aom', 58], ['ton', 47], ['yui', 39], ['lena', 33], ['minjun', 29], ['liam', 26], ['valeria', 18], ['arjun', 12]], week: 0 },
  C: { label: 'C · the gap (46 Rings, #3)', now: bkk('2026-11-19T21:05:00'), seenRank: 5,
    board: [['mint', 72], ['nat', 49], ['ploy', 46], ['aom', 38], ['ton', 31], ['yui', 27], ['lena', 26], ['minjun', 22], ['liam', 18], ['valeria', 12]], week: 46 },
  C25: { label: 'C · under 25 Rings (15 Rings, #6)', now: bkk('2026-11-18T12:30:00'), seenRank: 7,
    board: [['mint', 52], ['nat', 40], ['aom', 33], ['ton', 27], ['yui', 19], ['ploy', 15], ['lena', 11], ['minjun', 6]], week: 15 },
  LAST: { label: 'Last 6 hours (Sun 19:12)', now: bkk('2026-11-22T19:12:00'), seenRank: 4,
    board: [['mint', 118], ['ploy', 109], ['nat', 97], ['aom', 81], ['ton', 64], ['yui', 52], ['lena', 41], ['minjun', 33], ['liam', 24], ['valeria', 17]], week: 109 },
  TOP: { label: '#1 (pride)', now: bkk('2026-11-21T11:20:00'), seenRank: 2,
    board: [['ploy', 131], ['mint', 118], ['nat', 97], ['aom', 81], ['ton', 64], ['yui', 52], ['lena', 41], ['minjun', 33], ['liam', 24], ['valeria', 17]], week: 131 },
};

const REELS = [
  { id: uuid(101), k: 'fireworks', who: 'nat', area: 'Riverside', body: 'พลุกับเลเซอร์เหนือสะพานพระราม 8 ทั้งฟ้าเป็นสีทอง 🎆 #วิจิตรเจ้าพระยา', likes: 142 },
  { id: uuid(102), k: 'benjakitti', who: 'aom', area: 'Sukhumvit', body: 'สะพานลอยฟ้าเหนือบึง ไฟเพิ่งติดตอนฟ้าชมพู 🌆 สวนเบญจกิติ · MRT ศูนย์สิริกิติ์', likes: 77 },
  { id: uuid(103), k: 'lantern', who: 'minjun', area: 'Siam', body: 'Mirror room on the 58th floor, lights forever ✨', likes: 96 },
  { id: uuid(104), k: 'skypark', who: 'mint', area: 'Riverside', body: 'ฟ้าชมพูเหนือแม่น้ำ 🌅 Pink sky over the river', likes: 64 },
];
const reelRow = (r) => ({
  id: r.id, kind: 'reel', area: r.area, body: r.body, photo: null, event_id: null, here: false, created_at: '2026-11-18T12:00:00Z',
  video_path: `p/${r.k}.mp4`, poster_path: `p/${r.k}.jpg`, reel_status: 'approved', author_id: CAST[r.who].id, author_name: CAST[r.who].name,
  author_photo: face(r.who), author_langs: ['TH', 'EN'], author_who: CAST[r.who].who, mine: false, answers: [], likes: r.likes, liked: false, saved: false,
  views: r.likes * 9, ig_handle: `${r.who}.bkk`, venue_id: null, venue_name: null, venue_name_th: null, deal_id: null, deal_en: null, deal_th: null,
});

export function seed(sc) {
  const s = SCENARIOS[sc];
  const card = { first_name: 'Ploy', photo: face('ploy'), langs: ['TH', 'EN'], bio: 'Ari cafés and rooftops', area: 'Ari', who: 'local', here_until: null,
    verified: true, ig_handle: 'ploy.bkk', terms_accepted_at: '2026-11-10T03:00:00Z', terms_version: 'member-2026-11-10', interests: ['coffee', 'art', 'sunsets'],
    gender: 'female', show_gender: false };
  const myReels = [{ id: uuid(201), k: 'dusit' }, { id: uuid(202), k: 'lumpini' }, { id: uuid(203), k: 'bangpu' }];
  const rk = ranking(s.board);
  return {
    rpc: {
      kr8_me: { card, hellos_today: 0, posts: 3, answers_today: 0, blocked: [] },
      kr8_feed: REELS.map(reelRow),
      kr8_profile: { user_id: ME_ID, first_name: 'Ploy', photo: face('ploy'), langs: ['TH', 'EN'], bio: card.bio, area: 'Ari', who: 'local', verified: true,
        ig_handle: 'ploy.bkk', interests: card.interests, member_no: '00037', online: true, here: false, mine: true,
        level: { level: 'tea', posts: 3, visits: 0, points: 15, next: 'pandan', need_points: 10, pct: 60 },
        followers: 214, following: 88, likes: 1320, gifts: 0, i_follow: false, follows_me: false,
        reels: myReels.map((r) => ({ id: r.id, poster_path: `p/${r.k}.jpg`, likes: 40, status: 'approved' })) },
      kr8_card_extras: { member_no: 37, ig_handle: 'ploy.bkk', tiktok_handle: null, lifetime: 420, level: 1, week: s.week, week_rank: rk.me?.rank ?? null,
        founding_no: 12, founding_left: 38, founding_thb: 100, has_reel: true, prizes: 0 },
      kr8_weekly_ranking: rk,
      kr8_member_reels: { user_id: ME_ID, mine: true, best: myReels[0].id, reels: myReels.map((r, i) => ({ id: r.id, poster_path: `p/${r.k}.jpg`, video_path: `p/${r.k}.mp4`,
        body: null, created_at: '2026-11-1' + (5 - i) + 'T10:00:00Z', status: 'approved', likes: 40 - i * 9, saves: 6 - i, this_week: i === 0 && s.week > 0, rings: i === 0 ? s.week : 0,
        place: null, liked: false, saved: false })) },
      kr8_my_saved_reels: [],
      kr8_top10: [],
      kr8_my_activity: [],
      kr8_checkin: { added: 0, streak: 2, bonus: 0, ready: [], prizes: 0, result: null },
      kr8_coach_state: ['save', 'post', 'score', 'share'],
      kr8_reward_start: '2026-11-17T00:00:00+07:00',
      kr8_my_verification: [],
      kr8_my_saves: [],
      kr8_feed_extras: [],
      kr8_reel_people: [],
      kr8_inbox: [],
      kr8_people: [],
      kr8_treats_live: [],
      kr8_listings_live: [],
      kr8_my_blocks: [],
      kr8_score_breakdown: { user_id: ME_ID, first_name: 'Ploy', is_me: true, rings: s.week, rank: rk.me?.rank ?? null, more: 0,
        weights: { like: 1, save: 3, open: 5, mult: 2, cap: 30, best: 1 },
        reels: s.week ? [{ post_id: myReels[0].id, posted_at: '2026-11-18T05:00:00Z', poster_path: 'p/dusit.jpg', place: 'Dusit Central Park', place_th: 'ดุสิต เซ็นทรัล พาร์ค',
          l_local: 12, l_trav: 4, s_local: 2, s_trav: 1, opens: 1, score: s.week }] : [] },
    },
    session: {
      access_token: fakeJwt(ME_ID), token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.parse('2027-01-01T00:00:00Z') / 1000),
      refresh_token: 'local-fake-refresh', user: { id: ME_ID, aud: 'authenticated', role: 'authenticated', email: 'ploy@example.test',
        app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: '2026-11-10T03:00:00Z' },
    },
    scenario: s,
  };
}

function fakeJwt(sub) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'HS256', typ: 'JWT' })}.${b({ sub, role: 'authenticated', aud: 'authenticated', exp: 1798761600 })}.local-fake-signature`;
}

const MIME = { '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.png': 'image/png', '.webp': 'image/webp' };
function fileFor(p) {
  const name = p.split('/').pop();
  const f = path.join(MEDIA, name.startsWith('face-') ? 'faces' : '', name);
  return fs.existsSync(f) ? f : null;
}

/**
 * Wires a Playwright context to the seeded backend. `state.data` can be swapped at any time (e.g. new Rings arrive).
 * Returns the list of blocked hosts so the run can prove nothing left the machine.
 */
export async function wire(context, state) {
  const blocked = [];
  await context.route('**/*', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return route.continue();
    if (u.hostname === 'api.open-meteo.com') {
      return route.fulfill({ status: 200, contentType: 'application/json',
        body: JSON.stringify({ current: { temperature_2m: 31, apparent_temperature: 35, precipitation: 0, weather_code: 1 }, hourly: { precipitation_probability: Array(24).fill(10) } }) });
    }
    if (u.origin !== ORIGIN) { blocked.push(u.hostname); return route.abort(); }
    if (!u.pathname.startsWith('/__fake/')) return route.continue();
    const p = u.pathname.slice('/__fake'.length);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
    if (p.startsWith('/media/faces/')) { const f = path.join(MEDIA, 'faces', p.split('/').pop()); return fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'image/jpeg' }) : route.fulfill({ status: 404 }); }
    if (p.startsWith('/auth/v1/user')) return json(state.data.session.user);
    if (p.startsWith('/auth/v1/token')) return json(state.data.session);
    if (p.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (p.startsWith('/auth/v1/settings')) return json({ external: { google: false, email: true } });
    if (p.startsWith('/rest/v1/rpc/')) {
      const fn = p.split('/').pop();
      state.calls.push(fn);
      const d = state.data.rpc;
      return json(fn in d ? d[fn] : null);
    }
    if (p.startsWith('/rest/v1/')) return json([]);
    if (p.startsWith('/storage/v1/object/sign/kr8-reels') && req.method() === 'POST') {
      let paths = [];
      try { paths = JSON.parse(req.postData() || '{}').paths || []; } catch { /* none */ }
      return json(paths.map((x) => ({ path: x, signedURL: `/object/sign/kr8-reels/${x}?token=local`, error: null })));
    }
    if (p.startsWith('/storage/v1/object/sign/kr8-reels/') || p.startsWith('/storage/v1/object/public/')) {
      const name = p.split('/').pop();
      const f = path.join(MEDIA, name);
      if (!fs.existsSync(f)) return route.fulfill({ status: 404 });
      return route.fulfill({ path: f, contentType: MIME[path.extname(f)] || 'application/octet-stream' });
    }
    return route.fulfill({ status: 404, body: '' });
  });
  return blocked;
}

/** Storage the app reads before the first paint: the session, and "already seen" flags for one-time prompts. */
export function initStorage(data, extra = {}) {
  return {
    'kr8-v5-auth': JSON.stringify(data.session),
    kr8_coach: JSON.stringify(['save', 'post', 'score', 'share']),
    kr8_a2hs: JSON.stringify({ snooze: Date.parse('2027-01-01T00:00:00Z'), done: ['visit2', 'reel', 'claim'] }),
    kr8_push_ask: JSON.stringify({ asked: true, snooze: Date.parse('2027-01-01T00:00:00Z') }),
    kr8_esc_first: '1',
    kr8_lang: 'en',
    ...extra,
  };
}
