// 25 Nov open onboarding proof shots: the REAL local build (vite dev, tools/prize_ui/dev.sh) on the LOCAL seeded backend
// (tools/prize_ui/fake_kring.mjs). Every host other than the local dev server is aborted: nothing reaches live or test.
//   bash tools/prize_ui/dev.sh &   node tools/face_gate/shots.mjs <out dir>
// Pixel size 412×915 at 2×. Ploy (#90) has just joined with a name + photo and has NOT done the face check.
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from '../prize_ui/run.mjs';
import { CAST, FAKE, MEDIA } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/face_gate';
const only = process.argv[3] || '';
fs.mkdirSync(out, { recursive: true });
const face = (k) => `${FAKE}/media/faces/${k}.jpg`;
const browsers = {};
const log = [];

/** Founder rule (25 Nov): no realistic person photos in mocks. Every face the fake backend serves is the app's own placeholder
 *  avatar (initialAvatar in src/v8/v8Data.ts: the first letter on a soft gradient), rendered once to PNG here. */
function initialSvg(name) {
  const ch = (Array.from((name || '').trim())[0] || '?').toUpperCase();
  let h = 0;
  for (const c of name || '?') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const pairs = [['#5B6CFF', '#2A2C6E'], ['#FF4FA3', '#5B2A6E'], ['#6EE7A8', '#1E5B4B'], ['#FFB547', '#6E3A1E'], ['#3FD0FF', '#1E3F6E']];
  const [a, b] = pairs[h % pairs.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><text x="48" y="62" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="700" fill="#fff">${ch}</text></svg>`;
}
const AVATAR_DIR = path.join(out, '_avatars');
async function makeAvatars() {
  fs.mkdirSync(AVATAR_DIR, { recursive: true });
  const { createRequire } = await import('node:module');
  const pw = createRequire(import.meta.url)(process.env.PW || '/home/claude/.npm-global/lib/node_modules/playwright');
  const b = await pw.chromium.launch();
  const pg = await b.newPage({ viewport: { width: 384, height: 384 } });
  for (const [k, c] of Object.entries(CAST)) {
    await pg.setContent(`<body style="margin:0">${initialSvg(c.name).replace('<svg ', '<svg width="384" height="384" ')}</body>`);
    await pg.screenshot({ path: path.join(AVATAR_DIR, `${k}.png`) });
  }
  await b.close();
}
await makeAvatars();
async function placeholderFaces(context) {
  await context.route('**/__fake/media/faces/**', (route) => {
    const k = new URL(route.request().url()).pathname.split('/').pop().replace(/\.jpg$/, '');
    const f = path.join(AVATAR_DIR, `${k}.png`);
    return fs.existsSync(f) ? route.fulfill({ path: f, contentType: 'image/png' }) : route.fulfill({ status: 404 });
  });
}

function unverified(data, { noCard = false } = {}) {
  const r = data.rpc;
  const card = { ...r.kr8_me.card, verified: false, ig_handle: null, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-25T03:00:00Z', promo_ok: true };
  r.kr8_me = { ...r.kr8_me, card: noCard ? null : card, posts: 0 };
  r.kr8_save_card = { ...r.kr8_me, card: { ...card, member_no: 690 } };
  r.kr8_accept_terms = '2026-11-25T03:00:00Z';
  r.kr8_feed_ranked = r.kr8_feed;
  r.kr8_profile = { ...r.kr8_profile, verified: false, member_no: '00690', reels: [], followers: 0, following: 0, likes: 0, ig_handle: null };
  r.kr8_card_extras = { ...r.kr8_card_extras, member_no: 690, founding_no: null, has_reel: false, lifetime: 0, week: 0, week_rank: null, ig_handle: null };
  r.kr8_member_reels = { user_id: CAST.ploy.id, mine: true, best: null, reels: [] };
  r.kr8_my_verification = [];
  r.kr8_my_face_status = { verified: false, new_check: false, pending: false, blocked: false, tries_left: 3 };
  r.kr8_toggle_like = { liked: true, likes: 41 };
  r.kr8_my_unv_stats = { gated: true, verified: false, views: 14, likes: 9, saves: 2, prompt_at: 5 };
  r.kr8_people = [];
  r.kr8_coach_state = [];   // a brand-new member: no profile-builder step done yet
  r.kr8_set_qa = { qa_q: null, qa_answer: null };
  return data;
}

async function shot(name, page, note) {
  const f = path.join(out, name);
  await page.screenshot({ path: f });
  log.push({ name, note, errors: page.errs.filter((e) => !/interactive-widget/.test(e)) });
}

async function run(key, lang, steps) {
  if (only && !key.startsWith(only)) return;
  const storage = { kr8_lang: lang, kr8_pz_seen_6f1c2b1e: '1', ...(steps.storage || {}) };
  const o = await open(browsers, 'pixel7', 'A', { storage, query: steps.query || '' });
  unverified(o.state.data, steps.opts || {});
  await placeholderFaces(o.context);
  await o.page.reload({ waitUntil: 'domcontentloaded' });
  await settle(o.page, 3500);
  try { await steps.go(o.page, o); } catch (e) {
    await o.page.screenshot({ path: path.join(out, `debug_${key}_${lang}.png`) });
    console.log('STEP FAILED', key, lang, String(e).slice(0, 300), o.page.errs, [...new Set(o.state.calls)].join(','));
  }
  log.push({ key, lang, blocked: [...new Set(o.blocked)], calls: [...new Set(o.state.calls)].filter((c) => /unv|save_card|toggle_like|verify/.test(c)) });
  await o.context.close();
}
const sfx = (lang) => (lang === 'th' ? '_TH' : '');

for (const lang of ['en', 'th']) {
  // 01 · join: name + photo only → straight into the Feed (no face check sheet)
  await run('01', lang, { opts: { noCard: true }, go: async (page) => {
    await page.waitForSelector('#v5Name', { timeout: 10000 });
    await page.setInputFiles('#v5Photo', path.join(AVATAR_DIR, 'ploy.png'));
    await page.waitForTimeout(2500);
    await page.fill('#v5Name', 'Ploy');
    if (await page.$('#v5TermsOk')) await page.check('#v5TermsOk').catch(() => page.click('#v5TermsOk'));
    await page.waitForTimeout(400);
    await shot(`FG_01a_join_name_photo${sfx(lang)}.png`, page, 'card screen');
    await page.click('#v5SaveCard');
    // open join → the six-step profile builder (all skippable) → the Feed; no face check sheet on the way
    await page.waitForSelector('#buildFlow', { timeout: 8000 });
    await page.waitForTimeout(700);
    await shot(`FG_01b_builder_after_join${sfx(lang)}.png`, page, { verifyOpen: !!(await page.$('#verifyIntro')) });
    for (let i = 0; i < 8 && !(await page.$('#buildDone')); i++) { await page.click('#buildSkip'); await page.waitForTimeout(450); }
    await page.waitForSelector('#buildDone', { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(`FG_01c_builder_done${sfx(lang)}.png`, page, await page.$eval('#buildDone', (e) => e.textContent));
    await page.click('#buildDone');
    await settle(page, 1500);
    await shot(`FG_01d_feed_after_builder${sfx(lang)}.png`, page, { verifyOpen: !!(await page.$('#verifyIntro')), feedActive: await page.evaluate(() => document.querySelector('nav.dock [data-tab="feed"]')?.className || '') });
  } });

  // 02 · limited state: People wall, and own Me shows "Your profile is hidden"
  await run('02', lang, { go: async (page) => {
    await page.click('nav.dock [data-tab="people"]');
    await settle(page, 2000);
    await shot(`FG_02a_limited_people${sfx(lang)}.png`, page, await page.evaluate(() => document.getElementById('unvPeople')?.innerText || 'no wall'));
    await page.click('nav.dock [data-tab="me"]');
    await settle(page, 2000);
    const row = await page.waitForSelector('#unvMe', { timeout: 8000 });
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(600);
    await shot(`FG_02b_limited_me_hidden${sfx(lang)}.png`, page, await row.evaluate((el) => el.textContent));
    await page.click('#unvMeGo');
    await page.waitForSelector('#unvSheet', { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(`FG_02c_me_prompt${sfx(lang)}.png`, page, await page.$eval('#unvSheet', (e) => e.dataset.why));
  } });

  // 03 · face-check nudges: (a) Say hi on a Reel names it; (b) post; (c) the 5th like shows the real numbers
  await run('03', lang, { go: async (page) => {
    const hi = await page.$('.rv4-hi');
    if (hi) { await hi.click(); } else { await page.evaluate(() => window.dispatchEvent(new CustomEvent('kr8-verify-first', { detail: 'hi' }))); }
    await page.waitForSelector('#unvSheet', { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(`FG_03a_nudge_say_hi${sfx(lang)}.png`, page, await page.$eval('#unvSheet', (e) => e.dataset.why + ' · ' + e.querySelector('#unvTitle').textContent));
    await page.click('#unvNotNow');
    await page.waitForTimeout(400);
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('kr8-verify-first', { detail: 'post' })));
    await page.waitForSelector('#unvSheet', { timeout: 5000 });
    await page.waitForTimeout(500);
    await shot(`FG_03b_nudge_post${sfx(lang)}.png`, page, await page.$eval('#unvTitle', (e) => e.textContent));
    await page.click('#unvNotNow');
    await page.waitForTimeout(400);
  } });
  await run('04', lang, { storage: { kr8_unv_lp_6f1c2b1e_x: '1' }, go: async (page, o) => {
    // 4 likes already counted on this phone; the 5th (double-tap on the Reel) brings the prompt
    await page.evaluate((uid) => localStorage.setItem('kr8_unv_lp_' + uid, JSON.stringify({ n: 4, at: 0, times: 0 })), CAST.ploy.id);
    const likeBtn = await page.$('[aria-label="Like"], .rv4-like, button[data-act="like"]');
    if (likeBtn) await likeBtn.click();
    else { const box = await page.$('.rv4-stage, .v8-reel, video'); const b = await box.boundingBox(); await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2); }
    await page.waitForSelector('#unvSheet[data-why="likes"]', { timeout: 6000 });
    await page.waitForTimeout(500);
    await shot(`FG_04_nudge_after_likes${sfx(lang)}.png`, page, await page.$eval('#unvBody', (e) => e.textContent));
    void o;
  } });

  // 05 · invite nudge for members: Share & win sheet says friends can join without the face check
  await run('05', lang, { query: '?open=share', go: async (page, o) => {
    o.state.data.rpc.kr8_me.card.verified = true;
    await page.waitForSelector('#kxShareWin', { timeout: 9000 });
    await page.waitForTimeout(700);
    await shot(`FG_05_invite_nudge${sfx(lang)}.png`, page, await page.$eval('#kxShareWinOpen', (e) => e.textContent).catch(() => 'NO LINE'));
  } });
}

for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, '_face_gate_log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
