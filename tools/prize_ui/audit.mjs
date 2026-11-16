// Weekly-prize UI audit: measures the REAL local build on seeded data at 360 / 390 / 412 px (Chromium + WebKit).
// Prints one PASS/FAIL line per check. Usage: node tools/prize_ui/audit.mjs [out.json]
import fs from 'node:fs';
import { open, settle } from './run.mjs';
import { ME_ID, SCENARIOS } from './fake_kring.mjs';

const W0 = '2026-11-15T17:00:00.000Z';
const BANNED = ['meet', 'guide', 'tour', 'host', 'creator', 'review', 'hidden gem', 'alcohol', 'gift', 'wallet', 'credit', 'lucky', 'draw', 'temple',
  'ลุ้น', 'ทัวร์', 'ไกด์', 'รีวิว', 'ของขวัญ', 'วอลเล็ท', 'เครดิต', 'โชค', 'สุ่ม', 'เหล้า', 'ครีเอเตอร์', 'วัด'];
const EXPECT = {
  A: { tick: ['ท็อป 8 รับ TrueMoney', 'Top 8 win TrueMoney'], head: ['สัปดาห์ใหม่เริ่มแล้ว · ท็อป 8 รับ TrueMoney', 'A new week has started · Top 8 win TrueMoney'], sub: ['รีลที่ดีที่สุดของคุณ คือรีลที่ได้นับ', 'Your best Reel is the one that counts'] },
  B: { tick: ['ที่ 1 ของสัปดาห์รับ ฿1,500', '#1 of the week gets ฿1,500'], head: ['กรุงเทพฯ ในแบบของคุณ ให้คนทั้งโลกเห็น', 'Your Bangkok, for the whole world to see'], sub: ['ที่ 1 ของสัปดาห์รับ ฿1,500 · ดูอันดับ ›', '#1 of the week gets ฿1,500 · See ranking ›'] },
  C: { tick: ['อีก 4 ริง ขึ้นที่ 2', '4 Rings to #2'], head: ['อีก 4 ริง ขึ้นที่ 2', '4 Rings to #2'], sub: ['ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›', 'Likes and saves from travellers count double ›'] },
  C25: { tick: ['อีก 10 ริง ถึง 25 ริง', '10 Rings to 25'], head: ['อีก 10 ริง ถึง 25 ริง พร้อมชิงท็อป 8', '10 Rings to 25 and you’re in the running for the Top 8'], sub: ['ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›', 'Likes and saves from travellers count double ›'] },
  LAST: { tick: ['อีก 10 ริง', '10 Rings to #1'], head: ['อีก 10 ริง ขึ้นที่ 1', '10 Rings to #1'], sub: ['ไลก์และเซฟจากนักเดินทางนับ 2 เท่า ›', 'Likes and saves from travellers count double ›'] },
  TOP: { tick: ['ที่ 1 ของสัปดาห์รับ ฿1,500', '#1 of the week gets ฿1,500'], head: ['กรุงเทพฯ ในแบบของคุณ ให้คนทั้งโลกเห็น', 'Your Bangkok, for the whole world to see'], sub: ['ที่ 1 ของสัปดาห์รับ ฿1,500 · ดูอันดับ ›', '#1 of the week gets ฿1,500 · See ranking ›'] },
};

/** In-page measurements (runs in the browser). */
function measure() {
  const vis = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.getAttribute && n.getAttribute('aria-hidden') === 'true') return '';
    if (n.getAttribute && n.getAttribute('role') === 'img' && n.getAttribute('aria-label')) return n.getAttribute('aria-label');
    return [...n.childNodes].map(vis).join('');
  };
  const t = (sel, root = document) => { const e = root.querySelector(sel); return e ? vis(e).replace(/\s+/g, ' ').trim() : null; };
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const tick = document.getElementById('kpzTicker');
  const card = document.getElementById('kpzCard');
  const lines = (el) => {   // where each visual line of a block starts (first characters)
    if (!el) return [];
    const range = document.createRange(); const out = []; let lastTop = null;
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('[aria-hidden="true"]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    let n;
    while ((n = walker.nextNode())) {
      for (let i = 0; i < n.textContent.length; i++) {
        range.setStart(n, i); range.setEnd(n, i + 1);
        const rects = range.getClientRects(); if (!rects.length) continue;
        const top = Math.round(rects[0].top);
        if (lastTop === null || top > lastTop + 6) { out.push(n.textContent.slice(i, i + 6)); lastTop = top; }
      }
    }
    return out;
  };
  const odo = [...document.querySelectorAll('.kpz-odo')].filter((o) => o.getBoundingClientRect().height).map((o) => {
    // every column: the visible digit of the 0–9 strip sits exactly where the (hidden) real digit sits
    return Math.max(0, ...[...o.querySelectorAll('.kpz-od')].map((col) => {
      const w = col.querySelector('.kpz-odw'); const digit = col.querySelector('.kpz-ods').children[Number(w.textContent)];
      return Math.abs(w.getBoundingClientRect().top - digit.getBoundingClientRect().top);
    }));
  });
  const wx = document.querySelector('#s-feed .kp-wx'); const chat = document.getElementById('chatFab');
  const tiles = document.getElementById('kxTiles')?.querySelector('.kx-weekrow');
  const hitRect = (() => { if (!tick) return null; const h = tick.querySelector('.kpz-hit'); const b = h.getBoundingClientRect(); const st = getComputedStyle(h, '::before'); return { w: b.width, h: b.height + (parseFloat(st.top) < 0 ? -2 * parseFloat(st.top) : 0) }; })();
  const xs = [...document.querySelectorAll('.kpz-x')].filter((e) => e.getBoundingClientRect().height).map((e) => r(e));
  const overflowPh = [...document.querySelectorAll('#kpzCard .kpz-ph')].filter((p) => p.getBoundingClientRect().right > (card?.getBoundingClientRect().right ?? 1e9) - 8).length;
  const fontOk = document.fonts.check('700 16px Anuphan', 'กข') && document.fonts.check('500 12px "Bricolage Grotesque"', 'Ab');
  const thFam = card ? getComputedStyle(card.querySelector('.kpz-h.kpz-th')).fontFamily : tick ? getComputedStyle(tick.querySelector('.kpz-th')).fontFamily : '';
  return {
    vw: innerWidth, docOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    tick: tick && { kind: tick.dataset.kind, th: t('.kpz-th', tick), en: t('.kpz-en', tick), box: r(tick), cut: [...tick.querySelectorAll('.kpz-th,.kpz-en')].some((e) => e.scrollWidth > e.clientWidth + 1), hit: hitRect, chip: t('.kpz-tcd', tick) || (tick.querySelector('.kpz-tcd')?.textContent ?? null) },
    card: card && { kind: card.dataset.kind, head: [t('.kpz-h.kpz-th', card), t('.kpz-h.kpz-en', card)], sub: [t('.kpz-s.kpz-th', card), t('.kpz-s.kpz-en', card)], box: r(card),
      cd: [t('.kpz-cd .kpz-th', card), t('.kpz-cd .kpz-en', card)], stake: t('.kpz-stake .kpz-baht', card), rank: card.querySelector('.kpz-rk')?.dataset.rank ?? null,
      delta: card.querySelector('.kpz-dl')?.getAttribute('aria-label') ?? null, lineStarts: [...card.querySelectorAll('.kpz-th')].flatMap((e) => lines(e)) },
    wx: r(wx), chat: r(chat), tiles: r(tiles), xs, overflowPh, odoDrift: odo, fontOk, thFam,
    text: [tick, card].filter(Boolean).map((e) => vis(e)).join(' ').toLowerCase(),
    anims: [...document.querySelectorAll('.kpz, .kpz *')].filter((e) => getComputedStyle(e).animationName !== 'none').length,
  };
}

const results = [];
const check = (ok, area, name, extra = '') => { results.push({ ok: !!ok, area, name, extra }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${area.padEnd(18)} ${name}${extra ? `  [${extra}]` : ''}`); };
const browsers = {};
for (const dev of ['a360', 'iphone14', 'pixel7']) {
  for (const sc of Object.keys(SCENARIOS)) {
    const { page, context, blocked } = await open(browsers, dev, sc, { storage: { [`kr8_pz_seen_${ME_ID}`]: JSON.stringify({ week: W0, rank: SCENARIOS[sc].seenRank || 5 }) } });
    await settle(page, 3000);
    const f = await page.evaluate(measure);
    await page.click('nav.dock [data-tab="me"]');
    await settle(page, 1800);
    const m = await page.evaluate(measure);
    const tag = `${dev}/${sc}`;
    const e = EXPECT[sc];
    check(f.tick && f.tick.th === e.tick[0] && f.tick.en === e.tick[1], tag, 'ticker copy exact (TH + EN)', f.tick ? `${f.tick.th} | ${f.tick.en}` : 'no ticker');
    check(f.tick && !f.tick.cut, tag, 'ticker text not cut');
    check(f.tick && f.tick.box.x >= 8 && (!f.wx || f.tick.box.r <= f.wx.x - 6), tag, 'ticker clear of weather pill', f.wx && f.tick ? `gap ${Math.round(f.wx.x - f.tick.box.r)} px` : '');
    check(f.tick && f.wx && Math.abs((f.tick.box.y + f.tick.box.h / 2) - (f.wx.y + f.wx.h / 2)) <= 1.5, tag, 'ticker centred on the weather pill row');
    check(f.tick && f.tick.hit.h >= 44, tag, 'ticker tap area ≥ 44 px', f.tick ? `${Math.round(f.tick.hit.h)} px` : '');
    check(m.card && m.card.head[0] === e.head[0] && m.card.head[1] === e.head[1] && m.card.sub[0] === e.sub[0] && m.card.sub[1] === e.sub[1], tag, 'card copy exact (TH + EN)', m.card ? `${m.card.head.join(' | ')}` : 'no card');
    check(m.card && m.tiles && Math.abs(m.card.box.x - m.tiles.x) <= 1 && Math.abs(m.card.box.r - m.tiles.r) <= 1, tag, 'card aligned with the This week row');
    check(m.card && m.card.box.r <= m.vw - 8 && !m.docOverflow && m.overflowPh === 0, tag, 'no overflow at this width', `${m.vw} px`);
    check(m.card && !m.card.lineStarts.some((s) => /^[·›\d]/.test(s.trim())), tag, 'no Thai line starts with · › or a digit', m.card ? m.card.lineStarts.join(' / ') : '');
    check([...f.xs, ...m.xs].every((x) => x.w >= 44 && x.h >= 44), tag, '✕ tap area ≥ 44 px');
    check(m.odoDrift.every((d) => d <= 1), tag, 'rolling digits sit on the text line', m.odoDrift.map((d) => d.toFixed(1)).join(','));
    check(m.fontOk && /Anuphan/.test(m.thFam), tag, 'Anuphan + Bricolage loaded');
    check(!BANNED.some((w) => (f.text + ' ' + m.text).includes(w)), tag, 'no banned word on screen');
    check(page.errs.filter((x) => !/interactive-widget/.test(x)).length === 0, tag, 'no page errors', page.errs.join(' | ').slice(0, 120));
    check(new Set(blocked).size === 0, tag, 'nothing left the machine (no outside request)', [...new Set(blocked)].join(','));
    if (sc === 'C') check(m.card.stake === '฿900' && m.card.rank === '3' && /Up 2/.test(m.card.delta || ''), tag, 'C: ฿900 for #2, rank #3, up 2');
    if (sc === 'LAST') check(f.tick.chip && /^\d:\d\d:\d\d$/.test(f.tick.chip) && /^จบใน \d:\d\d:\d\d$/.test(m.card.cd[0]), tag, 'last 6 h: seconds in ticker + card', `${f.tick.chip} · ${m.card.cd.join(' / ')}`);
    if (sc === 'A') check(m.card.cd[0] === 'จบใน 4 วัน 03:45' || m.card.cd[0] === 'จบใน 4 วัน 03:44', tag, 'A: countdown to Sun 24:00 Bangkok', m.card.cd.join(' / '));
    await context.close();
  }
}
// reduce motion: nothing animates
{
  const { page, context } = await open(browsers, 'pixel7', 'C', { reducedMotion: 'reduce' });
  await settle(page, 2500);
  const f = await page.evaluate(measure);
  await page.click('nav.dock [data-tab="me"]');
  await settle(page, 1500);
  const m = await page.evaluate(measure);
  check(f.anims === 0 && m.anims === 0, 'pixel7/reduce', 'reduce motion: no animation runs', `${f.anims}/${m.anims}`);
  await context.close();
}
// jank: frame gaps while the card springs in + the rings draw, and while the digits roll after new Rings
{
  // real clock here (a faked clock would also fake the frame timer we measure); the seeded week is the current one
  const { page, context, state } = await open(browsers, 'pixel7', 'C', { clock: false });
  await settle(page, 2500);
  const sample = (ms) => page.evaluate((ms) => new Promise((done) => {
    const t = []; const t0 = performance.now();
    const f = (now) => { t.push(now); if (now - t0 < ms) requestAnimationFrame(f); else done(t.slice(1).map((x, i) => x - t[i])); };
    requestAnimationFrame(f);
  }), ms);
  const p = sample(1600);
  await page.click('nav.dock [data-tab="me"]');
  const a = await p;
  const { ranking } = await import('./fake_kring.mjs');
  state.data.rpc.kr8_weekly_ranking = ranking(SCENARIOS.C.board.map(([k, r]) => [k, k === 'ploy' ? 48 : r]));
  await page.click('nav.dock [data-tab="feed"]');
  await page.waitForTimeout(300);
  const q = sample(1600);
  await page.click('nav.dock [data-tab="me"]');   // opening Me always refreshes the week
  const b = await q;
  const stat = (g) => { const s = [...g].sort((x, y) => x - y); return { n: g.length, p95: s[Math.floor(s.length * 0.95)] || 0, max: s[s.length - 1] || 0 }; };
  const sa = stat(a), sb = stat(b);
  check(sa.p95 <= 34 && sa.max <= 120, 'pixel7/motion', 'spring-in + ring draw: smooth frames', `p95 ${sa.p95.toFixed(1)} ms · worst ${sa.max.toFixed(0)} ms · ${sa.n} frames`);
  check(sb.p95 <= 34 && sb.max <= 120, 'pixel7/motion', 'rolling digits: smooth frames', `p95 ${sb.p95.toFixed(1)} ms · worst ${sb.max.toFixed(0)} ms · ${sb.n} frames`);
  check(await page.evaluate(() => document.querySelector('#kpzCard .kpz-h.kpz-en .kpz-odo')?.getAttribute('data-value') === '2'), 'pixel7/motion', 'new Rings reach the card without a reload (4 → 2)');
  await context.close();
}
for (const b of Object.values(browsers)) await b.close();
const fails = results.filter((x) => !x.ok);
console.log(`\n${results.length - fails.length}/${results.length} checks pass`);
if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify(results, null, 1));
