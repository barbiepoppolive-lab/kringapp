// 0111 "Do it later" proof shots: the REAL local build (vite dev, tools/prize_ui/dev.sh) on the LOCAL seeded backend
// (tools/prize_ui/fake_kring.mjs). Every host other than the local dev server is aborted: nothing reaches live or test.
//   bash tools/prize_ui/dev.sh &   node tools/facelater/shots.mjs <out dir>
// iPhone size 390×844 at 2×. Ploy (#90) is a member who skipped the face check (verified = false).
import fs from 'node:fs';
import path from 'node:path';
import { open, settle } from '../prize_ui/run.mjs';
import { CAST, FAKE } from '../prize_ui/fake_kring.mjs';

const out = process.argv[2] || '/tmp/facelater';
fs.mkdirSync(out, { recursive: true });
const face = (k) => `${FAKE}/media/faces/${k}.jpg`;
const browsers = {};
const log = [];

/** the seeded data, changed so Ploy skipped the face check and has a Founding prize to claim */
function unverified(data) {
  const r = data.rpc;
  r.kr8_me = { ...r.kr8_me, card: { ...r.kr8_me.card, verified: false, terms_version: 'member-2026-11-17', terms_accepted_at: '2026-11-18T03:00:00Z', promo_ok: true } };
  r.kr8_feed_ranked = r.kr8_feed;
  r.kr8_promo_get = { on: true, terms_version: 'member-2026-11-17' };
  r.kr8_profile = { ...r.kr8_profile, verified: false, member_no: '00090' };
  r.kr8_card_extras = { ...r.kr8_card_extras, member_no: 90, founding_no: 12 };
  r.kr8_my_verification = [];
  r.kr8_my_face_status = { verified: false, new_check: false, pending: false, blocked: false, tries_left: 3 };
  r.kr8_my_rewards = { week: 46, rank: 3, lifetime: 420, level: 1, gap: null, ends_at: '2026-11-22T17:00:00.000Z', member_no: 90, founding_no: 12, founding_left: 38,
    floor: 25, rules: { truemoney_payout_pct: 100 }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 2, checked_in_today: true,
    prizes: [{ id: 'pz-founding-12', kind: 'founding', week: null, rank: null, founding_no: 12, amount: 100, rings: null, status: 'won', claim_id: null, created_at: '2026-11-18T05:00:00Z' }],
    claims: [], line_linked: false, claim_needs_line: false, claim_face_check: true };
  // People: members who skipped the check show like everyone else (no ✓), next to verified ones
  const P = (k, verified, bio, here = false) => ({ user_id: CAST[k].id, first_name: CAST[k].name, photo: face(k), langs: ['TH', 'EN'], bio, area: CAST[k].area, who: CAST[k].who, here, verified });
  r.kr8_people = [P('mint', true, 'Rooftops after work, always up for a chat', true), P('ton', false, 'New here · Sathorn street food and Muay Thai'),
    P('aom', false, 'Joined today · film photos around Bang Rak'), P('nat', true, 'Silom runner, coffee after'), P('yui', false, 'From Osaka, here for two weeks'),
    P('lena', true, 'Riverside sunsets'), P('minjun', false, 'Ekkamai cafés'), P('liam', true, 'Chinatown at night')];
  return data;
}

async function shot(name, page, note) {
  const f = path.join(out, name);
  await page.screenshot({ path: f });
  log.push({ name, note, errors: page.errs.filter((e) => !/interactive-widget/.test(e)) });
}

async function run(lang, steps) {
  const storage = { kr8_lang: lang, kr8_pz_seen_6f1c2b1e: '1' };
  const o = await open(browsers, 'iphone14', 'C', { storage, query: steps.query || '' });
  unverified(o.state.data);
  await o.page.reload({ waitUntil: 'domcontentloaded' });
  await settle(o.page, 3500);
  try { await steps.go(o.page); } catch (e) {
    await o.page.screenshot({ path: path.join(out, `debug_${lang}_${Date.now()}.png`) });
    console.log('STEP FAILED', lang, String(e).slice(0, 200), o.page.errs, [...new Set(o.state.calls)].join(','));
  }
  log.push({ lang, blocked: [...new Set(o.blocked)] });
  await o.context.close();
}

// 01 · the face check with "Do it later" (same words as right after a new card; opened by ?open=verify)
for (const lang of ['en', 'th']) {
  await run(lang, { query: '?open=verify', go: async (page) => {
    await page.waitForSelector('#verifyIntro', { timeout: 8000 });
    await page.waitForTimeout(600);
    await shot(lang === 'en' ? 'FACELATER_01_signup_do_it_later.png' : 'FACELATER_01_signup_do_it_later_TH.png', page, await page.$eval('#verifyLater', (b) => b.textContent));
    await page.click('#verifyLater');
    await page.waitForTimeout(500);
    log.push({ lang, closedAfterLater: !(await page.$('#verifyIntro')) });
  } });
}

// 02 · People: members who skipped the check are seen like everyone else
await run('en', { go: async (page) => {
  await page.click('nav.dock [data-tab="people"]');
  await settle(page, 2500);
  await shot('FACELATER_02_people_unverified_seen.png', page, await page.evaluate(() => document.body.innerText.includes('Ton')));
} });

// 03 · Me: the gentle "Verify your face in 5 seconds" row (× hides it for a week)
for (const lang of ['en', 'th']) {
  await run(lang, { go: async (page) => {
    await page.click('nav.dock [data-tab="me"]');
    await settle(page, 2500);
    const row = await page.waitForSelector('#meVerify', { timeout: 8000 });
    await row.evaluate((el) => el.scrollIntoView({ block: 'center' }));
    await page.waitForTimeout(700);
    await shot(lang === 'en' ? 'FACELATER_03_me_nudge.png' : 'FACELATER_03_me_nudge_TH.png', page, await row.evaluate((el) => el.textContent));
  } });
}

// 04 · claiming the Founding prize asks for the face check first
await run('en', { go: async (page) => {
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 2500);
  const go = await page.$('.nx-cardwrap button, .nx-cardwrap [role="button"]');
  if (go) await go.click(); else await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((x) => /Claim/.test(x.textContent || '')); b?.click(); });
  await settle(page, 1500);
  if (await page.$('#kxClaimGo')) { await page.click('#kxClaimGo'); await page.waitForTimeout(1200); }
  await page.waitForSelector('#verifyIntro', { timeout: 8000 });
  await shot('FACELATER_04_claim_needs_face_check.png', page, await page.$eval('#verifyIntro h2', (h) => h.textContent));
  await page.click('#verifyLater');
  await page.waitForTimeout(700);
  await shot('FACELATER_04b_claim_verify_step.png', page, await page.evaluate(() => document.getElementById('kxClaimVerify')?.textContent || 'no step'));
} });

for (const b of Object.values(browsers)) await b.close();
fs.writeFileSync(path.join(out, '_facelater_log.json'), JSON.stringify(log, null, 1));
console.log(JSON.stringify(log, null, 1));
