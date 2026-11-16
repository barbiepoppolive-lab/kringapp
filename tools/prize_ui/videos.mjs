// Weekly-prize UI animations from the REAL local build on seeded data (Pixel 7, Chromium), at the phone's real 2× resolution.
// Frame by frame: the page clock and every CSS animation/transition are paused and stepped 1/30 s at a time, and each frame is a
// 2× screenshot, so the clips are sharp and play at true speed. Each clip ≤ 8 s, H.264 MP4.
// Usage: node tools/prize_ui/videos.mjs <out dir> [spring,tick,sheen,pulse]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { open, settle } from './run.mjs';
import { ME_ID, ranking, SCENARIOS } from './fake_kring.mjs';

const out = process.argv[2] || '/tmp/prize_videos';
const only = (process.argv[3] || 'spring,tick,sheen,pulse').split(',');
const raw = path.join(out, '_frames');
fs.mkdirSync(raw, { recursive: true });
const W0 = '2026-11-15T17:00:00.000Z';
const FPS = 30;
const seen = (sc) => ({ [`kr8_pz_seen_${ME_ID}`]: JSON.stringify({ week: W0, rank: SCENARIOS[sc].seenRank || 5 }) });
const browsers = {};
const nodeWait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(page, fn, arg, ms = 4000) {
  const t = Date.now();
  while (Date.now() - t < ms) { if (await page.evaluate(fn, arg).catch(() => false)) return true; await nodeWait(25); }
  return false;
}

/** Opens Me and puts "This week" + the race card in view (no animation-frame waits: the page clock is paused). */
async function showMe(page) {
  await page.click('nav.dock [data-tab="me"]');
  await until(page, () => !!document.getElementById('kpzCard')?.getBoundingClientRect().height);
  await page.evaluate(() => {
    const row = document.getElementById('kxTiles');
    let box = row && row.parentElement;
    while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement;
    if (row && box) box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top - 150;
  });
}
/** New Rings arrive: the seeded server answers with the new board; the app refreshes as it does when it comes back to the front. */
async function newRings(page, state, board, expectN) {
  state.data.rpc.kr8_weekly_ranking = ranking(board);
  await page.clock.runFor(61_000);   // past the once-a-minute refresh limit
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await until(page, (n) => document.querySelector('#kpzCard .kpz-h.kpz-en .kpz-odo')?.getAttribute('data-value') === String(n), expectN);
}

async function clip(name, sc, { secs, prep, actions = [] }) {
  const { page, context, state } = await open(browsers, 'pixel7', sc, { storage: seen(sc) });
  await settle(page, 2600);
  if (prep) await prep(page, state);
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));   // freeze the page clock (it keeps the scenario's Bangkok time)
  await page.evaluate(() => { for (const v of document.querySelectorAll('video')) { v.pause(); v.dataset.t0 = String(v.currentTime); } });
  // any animation that starts (a tab opens, a card mounts, a digit changes) is caught the moment the DOM changes and held at its
  // first frame, so no motion runs off-camera while a screenshot is being taken
  await page.evaluate(() => {
    const w = window;
    w.__kr8T = 0;
    w.__kr8Freeze = () => { for (const a of document.getAnimations()) { if (a.__b === undefined) { a.__b = w.__kr8T - (Number(a.currentTime) || 0) / 1000; a.pause(); } } };
    w.__kr8Freeze();
    new MutationObserver(() => w.__kr8Freeze()).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'data-value'] });
  });
  await nodeWait(200);
  const dir = path.join(raw, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(secs * FPS);
  for (let i = 0; i < n; i++) {
    const t = i / FPS;
    for (const a of actions) if (!a.done && t >= a.at) { a.done = true; await a.run(page, state); }
    if (i) await page.clock.runFor(1000 / FPS);
    await page.evaluate((t) => {
      window.__kr8T = t;
      for (const an of document.getAnimations()) {
        const a = an;
        if (a.__b === undefined) { a.__b = t - (Number(a.currentTime) || 0) / 1000; a.pause(); }
        a.currentTime = Math.max(0, (t - a.__b) * 1000);
      }
      // the Reel behind keeps playing at true speed: it is moved 1/30 s per frame too
      for (const v of document.querySelectorAll('video')) {
        if (!v.getBoundingClientRect().height || !v.duration) continue;
        v.pause();
        if (v.dataset.t0 === undefined) v.dataset.t0 = String(v.currentTime - t);
        v.currentTime = (Number(v.dataset.t0) + t) % v.duration;
      }
    }, t);
    await until(page, () => [...document.querySelectorAll('video')].every((v) => !v.seeking), null, 800);
    await page.screenshot({ path: path.join(dir, `f${String(i).padStart(4, '0')}.jpg`), type: 'jpeg', quality: 93 });
  }
  const errs = page.errs.filter((e) => !/interactive-widget/.test(e));
  await context.close();
  const mp4 = path.join(out, `${name}.mp4`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', String(FPS), '-i', path.join(dir, 'f%04d.jpg'), '-vf', 'format=yuv420p',
    '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', mp4]);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(name, `${secs} s`, `${n} frames`, mp4, errs);
}

if (only.includes('spring')) await clip('anim_1_spring_in', 'C', {
  secs: 7.4,
  // the ticker is hidden for a moment so its entrance happens on camera; then Me opens and the race card springs in
  prep: (page) => page.evaluate(() => { const t = document.getElementById('kpzTicker'); if (t) t.style.display = 'none'; }),
  actions: [
    { at: 0.4, run: (page) => page.evaluate(() => { const t = document.getElementById('kpzTicker'); if (t) t.style.display = ''; }) },
    { at: 2.9, run: (page) => showMe(page) },
  ],
});

if (only.includes('tick')) await clip('anim_2_number_tick', 'C', {
  secs: 7.0,
  prep: async (page) => { await showMe(page); await settle(page, 2600); },
  actions: [
    { at: 0.9, run: (page, state) => newRings(page, state, SCENARIOS.C.board.map(([k, r]) => [k, k === 'ploy' ? 48 : r]), 2) },    // +2 Rings: 4 → 2 to #2
    { at: 3.6, run: (page, state) => newRings(page, state, [['mint', 72], ['ploy', 53], ['nat', 49], ...SCENARIOS.C.board.slice(3)], 20) },   // passes Nat: #2, 20 to #1
  ],
});

if (only.includes('sheen')) await clip('anim_3_prize_shimmer', 'A', {
  secs: 4.4,
  actions: [{ at: 0.2, run: (page) => showMe(page) }],
});

if (only.includes('pulse')) await clip('anim_4_countdown_pulse', 'LAST', {
  secs: 7.6,
  actions: [{ at: 3.6, run: (page) => showMe(page) }],
});

for (const b of Object.values(browsers)) await b.close();
