// Preview of the admin "Problems" and "Recruiters" pages (0063) with SAMPLE data (not real members). ?v=problems | recruiters | both | sheet
import { creditSheet, problemsBlock, recruitersBlock } from '../src/venue/adminApp';
import { el } from '../src/venue/shared';
import type { ProblemLog, Recruiters } from '../src/venue/problemsAdmin';

const now = Date.now();
const iso = (minAgo: number) => new Date(now - minAgo * 60000).toISOString();
const UA = {
  samsungWv: 'Mozilla/5.0 (Linux; Android 15; SM-S721B Build/AP3A.240905.015.A2; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/157.0.8103.38 Mobile Safari/537',
  samsungNet: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/30.0 Chrome/143.0.0.0 Mobile Safari/537.36',
  lineIos: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Safari Line/26.17.0 LIFF',
  chrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/157.0.0.0 Mobile Safari/537.36',
  fb: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/490.0.0;FBBV/1]',
};
const day = (n: number) => new Date(now + 7 * 3600_000 - n * 86400_000).toISOString().slice(0, 10);
const problems: ProblemLog = {
  since: iso(7 * 1440), hours: 168,
  totals: { opened: 14, opens: 61, pick_failed: 3, picked: 9, posted: 7, reels: 8, failures: 17, failed_people: 5 },
  days: [
    { day: day(0), opened: 6, opens: 29, pick_failed: 1, picked: 4, posted: 3, reels: 3 },
    { day: day(1), opened: 4, opens: 15, pick_failed: 1, picked: 3, posted: 2, reels: 3 },
    { day: day(2), opened: 3, opens: 12, pick_failed: 1, picked: 1, posted: 1, reels: 1 },
    { day: day(3), opened: 1, opens: 5, pick_failed: 0, picked: 1, posted: 1, reels: 1 },
  ],
  groups: [
    { kind: 'reel_publish_fail', code: 'UPLOAD:0', n: 9, people: 1, last_at: iso(95), details: ['video/mp4 6.7MB 43s 576x1024 inapp'] },
    { kind: 'verify_cam_fail', code: 'NotAllowedError', n: 3, people: 2, last_at: iso(20), details: null },
    { kind: 'reel_pick_fail', code: 'TOO_LONG', n: 2, people: 2, last_at: iso(92), details: ['video/mp4 34MB'] },
    { kind: 'reel_pick_fail', code: 'HEVC', n: 1, people: 1, last_at: iso(1900), details: ['video/quicktime 88MB'] },
    { kind: 'reel_trim', code: 'fail:webcodecs|record', n: 1, people: 1, last_at: iso(2900), details: ['video/mp4 41MB 95s inapp'] },
    { kind: 'reel_publish_fail', code: 'UPLOAD:403', n: 1, people: 1, last_at: iso(4000), details: null },
  ],
  agents: [{ ua: UA.samsungWv, n: 13, fails: 11, people: 1 }, { ua: UA.chrome, n: 4, fails: 3, people: 2 }, { ua: UA.fb, n: 3, fails: 2, people: 1 },
    { ua: UA.lineIos, n: 30, fails: 1, people: 6 }, { ua: UA.samsungNet, n: 6, fails: 0, people: 2 }],
  rows: [
    { at: iso(20), member_no: 26, first_name: 'Fon', kind: 'verify_cam_fail', code: 'NotAllowedError', detail: null, ua: UA.chrome, fail: true },
    { at: iso(92), member_no: 24, first_name: 'Beam', kind: 'reel_pick_fail', code: 'TOO_LONG', detail: 'video/mp4 34MB', ua: UA.samsungWv, fail: true },
    { at: iso(95), member_no: 24, first_name: 'Beam', kind: 'reel_publish_fail', code: 'UPLOAD:0', detail: 'video/mp4 6.7MB 43s 576x1024 inapp', ua: UA.samsungWv, fail: true },
    { at: iso(99), member_no: 24, first_name: 'Beam', kind: 'reel_trim', code: 'done', detail: '0:12-0:55 of 1:15', ua: UA.samsungWv, fail: false },
    { at: iso(101), member_no: 24, first_name: 'Beam', kind: 'reel_trim', code: 'open', detail: '75s 34MB inapp', ua: UA.samsungWv, fail: false },
    { at: iso(1900), member_no: 19, first_name: 'Mint', kind: 'reel_pick_fail', code: 'HEVC', detail: 'video/quicktime 88MB', ua: UA.fb, fail: true },
  ],
};
const m = (user_id: string, member_no: number, first_name: string, minAgo: number, verified: boolean, approved_reels: number, how: 'link' | 'credited' | 'none', src_code: string | null = null) =>
  ({ user_id, member_no, first_name, joined_at: iso(minAgo), src_code, verified, approved_reels, how, credited_by: how === 'credited' ? 'founder@example.com' : null, credited_at: how === 'credited' ? iso(40) : null });
const recruiters: Recruiters = {
  codes: [
    { code: 'pich', signups: 9, via_link: 8, credited: 1, posted: 4, verified: 5, members: [
      m('a1', 27, 'Ploy', 300, true, 2, 'link'), m('a2', 21, 'Nok', 3000, true, 1, 'credited', 'pwa'), m('a3', 18, 'Ton', 4200, false, 0, 'link') ] },
    { code: 'nattham', signups: 3, via_link: 3, credited: 0, posted: 1, verified: 2, members: [m('b1', 23, 'Aom', 900, true, 1, 'link')] },
  ],
  no_code: [m('c1', 22, 'Som', 200, false, 0, 'none'), m('c2', 20, 'Mai', 2600, true, 1, 'none', 'pwa')],
  log: [{ at: iso(40), action: 'credit', ref_code: 'pich', prev_code: null, by: 'founder@example.com', member_no: 21, first_name: 'Nok' }],
};

const v = new URLSearchParams(location.search).get('v') || 'both';
const st = document.createElement('style');
st.textContent = `body{background:#0b0a12} .cols{display:flex;flex-wrap:wrap;gap:24px;justify-content:center;align-items:flex-start}
.col{flex:1 1 360px;max-width:560px;min-width:0} .note{color:#ffc44d;font-size:12px;margin:0 0 8px}`;
document.head.append(st);
const back = (t: string) => el('div', { class: 'row', style: 'margin:6px 0 16px' }, el('span', { class: 'icb' }, '‹'), el('h1', { style: 'font-size:26px' }, t));
const seg = (on: number) => el('div', { class: 'seg' }, el('button', { type: 'button', class: on === 24 ? 'on' : '' }, 'Last 24 h'), el('button', { type: 'button', class: on === 168 ? 'on' : '' }, '7 days'));
const noop = { credit: () => undefined, uncredit: () => undefined };
const pCol = () => el('div', { class: 'col scr' }, el('p', { class: 'note' }, 'SAMPLE data · preview only'), back('Problems'),
  el('p', { class: 'dim sm', style: 'margin:-6px 0 14px' }, 'What failed on members’ phones: Reel pick, trim, upload and face check. Test members left out.'), seg(168), problemsBlock(problems));
const rCol = () => el('div', { class: 'col scr' }, el('p', { class: 'note' }, 'SAMPLE data · preview only'), back('Recruiters'),
  el('p', { class: 'dim sm', style: 'margin:-6px 0 14px' }, 'One row per recruiter code. Test members left out.'), recruitersBlock(recruiters, noop));
const root = el('main', { class: 'cols' });
if (v === 'problems' || v === 'both') root.append(pCol());
if (v === 'recruiters' || v === 'both' || v === 'sheet') root.append(rCol());
document.getElementById('root')!.append(root);
if (v === 'sheet') creditSheet(recruiters.no_code[0], recruiters.codes.map((c) => c.code), () => undefined);
