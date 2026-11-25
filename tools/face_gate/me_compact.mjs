// 25 Nov Me compact block proof shots (local dev + fake backend only; every other host is aborted).
//   bash tools/prize_ui/dev.sh &   node tools/face_gate/me_compact.mjs <out dir>
// Three members, EN + TH, 412×915: unverified (no ✓, profile unfinished), verified (profile unfinished), complete (✓ + builder done).
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from '../prize_ui/run.mjs';
import { CAST, FAKE } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/me_compact';
fs.mkdirSync(out, { recursive: true });
const browsers = {};
const log = [];

// Founder rule (25 Nov): no realistic person photos in mocks: every face is the app's own initial avatar, as in shots.mjs.
function initialSvg(name) {
  const ch = (Array.from((name || '').trim())[0] || '?').toUpperCase();
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pairs = [['#5B6CFF', '#2A2C6E'], ['#FF4FA3', '#5B2A6E'], ['#6EE7A8', '#1E5B4B'], ['#FFB547', '#6E3A1E'], ['#3FD0FF', '#1E3F6E']];
  const [a, b] = pairs[h % pairs.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="384" height="384" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${ch}</text></svg>`;
}
async function placeholderFaces(context) {
  await context.route('**/__fake/media/faces/**', (route) => {
    const k = new URL(route.request().url()).pathname.split('/').pop().replace(/\.jpg$/, '');
    return route.fulfill({ body: initialSvg((CAST[k] && CAST[k].name) || k), contentType: 'image/svg+xml' });
  });
}

function prep(data, kind) {
  const r = data.rpc;
  r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-25T03:00:00Z', promo_ok: true } };
  if (kind === 'unverified') {
    r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, verified: false } };
    r.kr8_profile = { ...r.kr8_profile, verified: false };
    r.kr8_my_verification = [];
    r.kr8_my_face_status = { verified: false, new_check: false, pending: false, blocked: false, tries_left: 3 };
    r.kr8_my_unv_stats = { gated: true, verified: false, views: 14, likes: 9, saves: 2, prompt_at: 5 };
    r.kr8_coach_state = [];
  } else if (kind === 'verified') {
    r.kr8_coach_state = ['save', 'post', 'score', 'share', 'pb_gender', 'pb_area', 'pb_likes', 'pb_langs', 'pb_bio'];
    r.kr8_profile = { ...r.kr8_profile, qa_q: null, qa_answer: null };
  } else if (kind === 'profile') {
    const face = (k) => `${FAKE}/media/faces/${k}.jpg`;
    r.kr8_people = [{ user_id: CAST.ton.id, first_name: 'Ton', photo: face('ton'), langs: ['TH', 'EN'], bio: 'Sathorn street food and Muay Thai', area: 'Sathorn', who: 'local', here: false, verified: true }];
    r.kr8_profile = { ...r.kr8_profile, user_id: CAST.ton.id, first_name: 'Ton', photo: face('ton'), bio: 'Sathorn street food and Muay Thai', area: 'Sathorn', verified: true, mine: false, ig_handle: null, member_no: 'KR 4821', reels: [], followers: 3, following: 12, likes: 0, i_follow: false, follows_me: false, qa_q: null, qa_answer: null };
  } else {
    r.kr8_coach_state = ['save', 'post', 'score', 'share', 'pb_gender', 'pb_area', 'pb_likes', 'pb_langs', 'pb_bio', 'pb_qa', 'pb_done'];
  }
  return data;
}

for (const lang of ['en', 'th']) {
  for (const kind of ['unverified', 'verified', 'complete', 'profile']) {
    const o = await open(browsers, 'pixel7', 'A', { storage: { kr8_lang: lang, kr8_pz_seen_6f1c2b1e: '1' } });
    prep(o.state.data, kind);
    await placeholderFaces(o.context);
    await o.page.reload({ waitUntil: 'domcontentloaded' });
    await settle(o.page, 3000);
    if (kind === 'profile') {
      await o.page.click('nav.dock [data-tab="people"]');
      await settle(o.page, 2500);
      if (await o.page.$('#buildAskLater')) { await o.page.click('#buildAskLater'); await o.page.waitForTimeout(400); }
      await o.page.click('[data-verified]');
      await o.page.waitForTimeout(1800);
    } else {
      await o.page.click('nav.dock [data-tab="me"]');
      await settle(o.page, 2500);
    }
    const name = `${kind === 'profile' ? 'profile_view' : 'me_' + kind}_${lang.toUpperCase()}.png`;
    await o.page.screenshot({ path: path.join(out, name) });
    const info = await o.page.evaluate(() => {
      const q = (s) => document.querySelector(s);
      const box = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) }; };
      const cs = (s, p) => { const e = q(s); return e ? getComputedStyle(e)[p] : null; };
      return { st1: q('#unvMe')?.innerText || null, st2: q('#meBuild')?.innerText || null, bio: box('#meIdentity .rv4-pbio') || box('#meIdentity'), ident: box('#meIdentity'),
        status: box('#meStatus'), l1: box('#unvMe'), l2: box('#meBuild'), pill: box('#unvMeGo'), tabs: box('#s-me .go-seg'),
        ring: cs('#meEdit', 'boxShadow') || cs('#profileView .rv4-pav', 'boxShadow'), f1: cs('#unvMe .me-st1-t', 'font'), f2: cs('#meBuild', 'font'), c2: cs('#meBuild', 'color'), verifyRow: !!q('#meVerify') };
    });
    log.push({ name, kind, lang, info, errors: o.page.errs });
    await o.context.close();
  }
}
for (const b of Object.values(browsers)) await b.close();
console.log(JSON.stringify(log, null, 1));
