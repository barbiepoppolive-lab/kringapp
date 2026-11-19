// 0138 screenshots at 390×844 (Playwright + Chromium). Needs `npx vite --port 5391` running in the repo. SAMPLE data only.
const { chromium } = require('playwright');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:5391';
const OUT = process.env.OUT || require('os').tmpdir();   // screenshots are not committed
const PREFIX = process.env.PREFIX || '';
const IMG = path.join(__dirname, '../../harness/img');
const now = new Date().toISOString();
const ago = (m) => new Date(Date.now() - m * 60000).toISOString();
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const shot = async (url, name, before) => {
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', (e) => errs.push(String(e)));
    if (before) await before(p, 'route');
    await p.goto(BASE + url, { waitUntil: 'networkidle' });
    await p.waitForTimeout(700);
    if (before) await before(p, 'after');
    await p.screenshot({ path: path.join(OUT, PREFIX + name) });
    if (errs.length) console.log(name, 'ERR', errs);
    console.log('saved', name);
    await p.close();
  };
  const pickPassport = async (p, when) => {
    if (when !== 'after') return;
    await p.setInputFiles('#ktGallery input', path.join(IMG, 'specimen_passport.jpg'));
    await p.waitForSelector('#ktFrame img');
    await p.waitForTimeout(400);
  };
  await shot('/harness/traveller.html?lang=en&v=form', 'member_request_en.png');
  await shot('/harness/traveller.html?lang=th&v=form', 'member_request_th.png');
  await shot('/harness/traveller.html?lang=en&v=form', 'member_request_en_photo.png', pickPassport);
  await shot('/harness/traveller.html?lang=th&v=form', 'member_request_th_photo.png', async (p, w) => { await pickPassport(p, w); if (w === 'after') await p.evaluate(() => document.querySelector('.kt-page').scrollTo(0, 9999)); });
  await shot('/harness/traveller.html?lang=en&v=pending', 'member_pending_en.png');
  await shot('/harness/traveller.html?lang=th&v=pending', 'member_pending_th.png');
  await shot('/harness/traveller.html?lang=en&v=refused', 'member_refused_en.png');
  await shot('/harness/traveller.html?lang=en&v=edit&s=pending', 'member_card_edit_pending_en.png', async (p, w) => { if (w === 'after') { await p.evaluate(() => document.querySelector('#kxTravRow').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200); } });
  await shot('/harness/traveller.html?lang=th&v=edit&s=pending', 'member_card_edit_pending_th.png', async (p, w) => { if (w === 'after') { await p.evaluate(() => document.querySelector('#kxTravRow').scrollIntoView({ block: 'center' })); await p.waitForTimeout(200); } });

  // admin: answer the Supabase calls with sample data
  const person = (o) => ({ kind: 'real', who: 'local', area: 'Ari', last_active_at: now, ref: null, src: null, verified: true, ig: null, tt: null, has_photo: true, photo_check: null,
    email_hint: null, line: true, check: null, reels: { live: 1, waiting: 0, hidden: 0, board_off: 0, board_off_reason: null }, claims: { n: 0, paid: 0, held: 0, thb: 0, first_at: null },
    links: [], shared_net: 0, refs: 0, board: null, score: null, ...o });
  const snapshot = { at: now, day_start: ago(600), week_start: ago(5000), include_test: false, counts: { real: 2, real_today: 0, test: 0, team: 0, ghost: 0, admin: 0, nocard: 0 },
    people: [person({ user_id: 'u77', no: 77, name: 'Lena', joined_at: ago(3000) }), person({ user_id: 'u81', no: 81, name: 'Yui', joined_at: ago(2000), verified: false })],
    claims: [], codes: [], board: { week_start: ago(5000), paid_ranks: 8, floor: 25, rows: [] }, pending: { reels: [], checks: [], reports: 0, places: 0 }, alerts: [] };
  const trav = [
    { id: 'req1', user_id: 'u77', member_no: 77, first_name: 'Lena', who: 'local', verified: true, passport_path: 'u77/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg', status: 'pending', reason_code: null, reason_note: null, created_at: ago(95), decided_at: null, file_deleted_at: null },
    { id: 'req2', user_id: 'u81', member_no: 81, first_name: 'Yui', who: 'local', verified: false, passport_path: 'u81/bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb.jpg', status: 'pending', reason_code: null, reason_note: null, created_at: ago(30), decided_at: null, file_deleted_at: null },
  ];
  const fs = require('fs');
  const admin = async (p, when) => {
    if (when === 'route') {
      await p.route('**/rest/v1/rpc/*', async (r) => {
        const fn = r.request().url().split('/rpc/')[1].split('?')[0];
        const body = fn === 'kr8_admin_v2_snapshot' ? snapshot : fn === 'kr8_admin_traveller_requests' ? trav
          : fn === 'kr8_admin_v2_photos' ? { u77: BASE + '/harness/img/lena.jpg', u81: BASE + '/harness/img/yui.jpg' } : fn === 'kr8_admin_places_auto' || fn === 'kr8_admin_dups_auto' ? [] : null;
        await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
      });
      await p.route('**/storage/v1/object/sign/kr8-passport/**', async (r) => {
        if (r.request().method() === 'POST') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ signedURL: '/object/sign/kr8-passport/x.jpg?token=t' }) });
        return r.fulfill({ status: 200, contentType: 'image/jpeg', body: fs.readFileSync(path.join(IMG, 'specimen_passport.jpg')) });
      });
      await p.route('**/functions/v1/**', (r) => r.fulfill({ status: 200, body: '{}' }));
    } else {
      await p.waitForSelector('.v2pp-pass img', { timeout: 8000 }).catch(() => console.log('no passport img'));
      await p.waitForTimeout(500);
      await p.evaluate(() => { const c = document.querySelector('[data-item="t:req1"]'); window.scrollTo(0, c.getBoundingClientRect().top + window.scrollY - 12); });
      await p.waitForTimeout(300);
    }
  };
  await shot('/harness/travadmin.html', 'admin_case_card.png', admin);
  await shot('/harness/travadmin.html', 'admin_case_refuse.png', async (p, w) => {
    await admin(p, w);
    if (w === 'after') {
      await p.click('#v2TravNo-req1'); await p.click('#v2TravRefuse-req1 [data-code="other"]');
      await p.fill('#v2TravNote-req1', 'Please send the page with your photo on it.');
      await p.evaluate(() => document.querySelector('#v2TravRefuse-req1').scrollIntoView({ block: 'end' }));
      await p.waitForTimeout(200);
    }
  });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
