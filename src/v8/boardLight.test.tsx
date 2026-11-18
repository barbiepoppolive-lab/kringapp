/** board-1 (18 Nov): Kring Light on the weekly board + the "Share my rank" story card. One language at a time, everywhere. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, waitFor } from '@testing-library/react';
import { RankingPage } from './V5KxRanking';
import { KX_L, V5_L } from './v5Strings';
import { prizeFor, prizeLadder } from './kxLogic';
import { SAFE_BOTTOM, SAFE_TOP, STORY_H, STORY_W, storyButton, storyButtonLabel, storyText } from './rankStory';
import type { KxGap, KxRanking, KxRankRow } from './v5Kx';

const kx = vi.hoisted(() => ({ kxRanking: vi.fn(), kxSeatsLeft: vi.fn(), kxRules: vi.fn(), kxMemberReels: vi.fn(), kxBreakdown: vi.fn(), kxCardExtras: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kx }));

const THAI = /[ก-ฺเ-๿]/;   // ฿ (U+0E3F) is fine in English
const LATIN_WORD = /[A-Za-z]{2,}/;
const en = (s: string) => s;
const enf = (s: string, a: string, b = '') => s.replace('{0}', a).replace('{1}', b);
const th = (s: string) => V5_L.th[s] || KX_L.th[s] || s;
const thf = (s: string, a: string, b = '') => th(s).replace('{0}', a).replace('{1}', b);
const NAMES = ['อาร์ม', 'เอิร์ธ', 'นีน่า', 'อามีร่า', 'ฟิล์ม', 'พลอย', 'มิ้นท์', 'บีม', 'โอ๊ต', 'แพร'];
const row = (rank: number, rings: number, extra: Partial<KxRankRow> = {}): KxRankRow => ({ rank, all_rank: rank, rings, prize: prizeFor(rank), paid: rank <= 8 && rings >= 25,
  needs: rank <= 8 && rings < 25 ? 25 : null, to_line: rank > 8 ? 25 - rings + 1 : null, user_id: `u${rank}`, first_name: NAMES[rank - 1], photo: null, area: 'Ari',
  move: null, is_me: false, ...extra });
const gap = (g: Partial<KxGap>): KxGap => ({ state: 'top', rank: 1, rings: 85, floor: 25, prize_now: 1500, target: null, above: null, behind: { rank: 2, diff: 54 } as KxGap['behind'], top10_need: null, ...g });
const board = (rows: KxRankRow[], extra: Partial<KxRanking> = {}): KxRanking => ({ week_start: '2026-11-16', ends_at: '2026-11-22T17:00:00Z', scope: 'all', area: null, total: rows.length,
  paid_ranks: 8, floor: 25, posters: rows.length, min_posters: 0, payout_on: true, open_seats: 0, prizes: prizeLadder(), rows, me: null, gap: null,
  mine: { pending: 0, live: 1, no_place: 0 }, ...extra });
// early in the week: #1 has 85, ranks 4–8 are still under the 25-Ring floor
const ROWS = [row(1, 85, { is_me: true, user_id: 'me' }), row(2, 31), row(3, 26), row(4, 19), row(5, 14), row(6, 9), row(7, 6), row(8, 5), row(9, 3), row(10, 2)];
const reel = { id: 'r1', status: 'approved', created_at: '2026-11-17T01:00:00Z', poster_path: 'p/x.jpg', video_path: '', body: null, likes: 0, saves: 0, this_week: true, rings: 85, place: null, liked: false, saved: false };
const page = (lang: 'th' | 'en') => render(<RankingPage L={lang === 'th' ? th : en} Lf={lang === 'th' ? thf : enf} lang={lang} myArea={null} myPhoto={null} myName={lang === 'th' ? 'พลอย' : 'Ploy'} myId="me"
  onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);

beforeEach(() => {
  for (const f of Object.values(kx)) f.mockReset();
  kx.kxSeatsLeft.mockResolvedValue(38);
  kx.kxRules.mockResolvedValue({ like: 1, save: 3, open: 5, opens_day_cap: 30, traveller_mult: 2, best_reels: 1, min_rings_for_paid_seat: 25 });
  kx.kxMemberReels.mockResolvedValue({ user_id: 'me', mine: true, best: 'r1', reels: [reel] });
  kx.kxCardExtras.mockResolvedValue({ member_no: 37 });
  kx.kxRanking.mockResolvedValue(board(ROWS, { gap: gap({}) }));
});

describe('board-1: one language per mode on the whole board', () => {
  it('Thai mode: every word on the board (incl. the new Share my rank button) is Thai, no English sub-lines', async () => {
    page('th');
    await waitFor(() => expect(document.querySelector('#kxShareRank')).toBeTruthy());
    const text = document.querySelector('#kxRanking')!.textContent!;
    expect(text).toContain('แชร์อันดับ');
    expect(text).not.toMatch(LATIN_WORD);
    expect(document.querySelectorAll('#kxRanking [lang="en"]').length).toBe(0);
    const labels = [...document.querySelectorAll('#kxRanking [aria-label]')].map((e) => e.getAttribute('aria-label')!);
    for (const l of labels) expect(l, l).not.toMatch(LATIN_WORD);
  });
  it('English mode: no Thai anywhere on the board, labels included', async () => {
    kx.kxRanking.mockResolvedValue(board(ROWS.map((r) => ({ ...r, first_name: `P${r.rank}` })), { gap: gap({}) }));
    page('en');
    await waitFor(() => expect(document.querySelector('#kxShareRank')).toBeTruthy());
    const text = document.querySelector('#kxRanking')!.textContent!;
    expect(text).toContain('Share my rank');
    expect(text).not.toMatch(THAI);
    for (const e of document.querySelectorAll('#kxRanking [aria-label]')) expect(e.getAttribute('aria-label')!).not.toMatch(THAI);
  });
  it('every string key the board uses has a Thai text with no English words, and no Thai in the English key', () => {
    const src = fs.readFileSync(path.join(__dirname, 'V5KxRanking.tsx'), 'utf8');
    const keys = new Set<string>();
    for (const m of src.matchAll(/\bLf?\(\s*'((?:[^'\\]|\\.)*)'/g)) keys.add(m[1]);
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) {
      const t = V5_L.th[k] || KX_L.th[k];
      expect(t, `missing Thai: ${k}`).toBeTruthy();
      expect(t.replace(/Instagram|TikTok|Grab|TrueMoney/g, ''), `English in Thai: ${k}`).not.toMatch(LATIN_WORD);
      expect(k, `Thai in English key: ${k}`).not.toMatch(THAI);
    }
  });
});

describe('board-1: less clutter', () => {
  it('"X more Rings to be eligible" shows only on my own row, never under other members', async () => {
    kx.kxRanking.mockResolvedValue(board(ROWS.map((r) => (r.rank === 6 ? { ...r, is_me: true, user_id: 'me' } : { ...r, is_me: false })),
      { gap: gap({ state: 'paid', rank: 6, rings: 9, prize_now: 0, target: { rank: 5, need: 16, prize: 400, open: false } }) }));
    page('en');
    await waitFor(() => expect(document.querySelector('#kxRankList')).toBeTruthy());
    const elig = [...document.querySelectorAll('#kxRanking .rka-elig')];
    expect(elig.length).toBe(1);
    expect(elig[0].closest('[data-rank]')!.getAttribute('data-rank')).toBe('6');
    expect(elig[0].textContent).toBe('16 more Rings to be eligible');
  });
  it('no dark slab: the pinned area and the prize-line label are see-through (no near-black fills)', () => {
    const css = fs.readFileSync(path.join(__dirname, 'kx.css'), 'utf8');
    const light = css.slice(css.indexOf('board-1 · Kring Light'), css.indexOf('Kring Light 5a'));
    expect(light).toMatch(/\.bx-pin \{[^}]*rgba\(58,22,120,0\)/);
    expect(light).not.toMatch(/#120836|rgba\(18,8,54/);
    expect(light).toMatch(/\.bx-line span::before \{[^}]*rgba\(255,255,255,\.06\)/);
    expect(light).not.toMatch(/backdrop-filter/);
  });
});

describe('board-1: Share my rank (story card)', () => {
  it('Share my Reel still works next to it; the story button only shows when I am on the board', async () => {
    const r = page('en');
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('data-act')).toBe('share'));
    expect(document.querySelector('#kxBoardCta')!.textContent).toBe('Share my Reel');
    expect(document.querySelector('#kxShareRank')!.getAttribute('aria-label')).toBe('Share my rank as a story');
    r.unmount();
    kx.kxRanking.mockResolvedValue(board(ROWS.slice(1).map((x) => ({ ...x, is_me: false })), { gap: gap({ state: 'off', rank: null, rings: 0, prize_now: 0, target: { rank: 8, need: 25, prize: 100, open: false } }) }));
    page('en');
    await waitFor(() => expect(document.querySelector('#kxMeRow')).toBeTruthy());
    expect(document.querySelector('#kxShareRank')).toBeNull();
  });
  it('card words: one language, the prize only when I qualify, my invite code', () => {
    const t = storyText({ lang: 'th', rank: 1, rings: 85, prize: 1500, code: 'k00037' });
    const thWords = Object.entries(t).filter(([k]) => k !== 'site').map(([, v]) => v.replace(/k\d{5}/, '')).join(' ');
    expect(thWords).not.toMatch(LATIN_WORD);
    expect(t).toMatchObject({ rank: '#1', rings: '85 ริง', prize: 'รางวัล ฿1,500', code: 'โค้ดชวนเพื่อน k00037', site: 'kringapp.com' });
    const e = storyText({ lang: 'en', rank: 3, rings: 1, prize: 0, code: 'k00037' });
    expect(Object.values(e).join(' ')).not.toMatch(THAI);
    expect(e).toMatchObject({ rank: '#3', week: 'this week', rings: '1 Ring', prize: '', code: 'Invite code k00037' });
    expect(storyText({ lang: 'zh', rank: 2, rings: 40, prize: 900, code: '' }).prize).toBe('฿900 prize');   // other languages: English only
    expect([storyButton('th'), storyButtonLabel('th')].join(' ')).not.toMatch(LATIN_WORD);
    expect([storyButton('en'), storyButtonLabel('en')].join(' ')).not.toMatch(THAI);
  });
  it('1080×1920 with story safe areas; draws only me (no other member names or photos reach the card)', () => {
    expect([STORY_W, STORY_H]).toEqual([1080, 1920]);
    expect(SAFE_TOP).toBeGreaterThanOrEqual(220);
    expect(SAFE_BOTTOM).toBeGreaterThanOrEqual(250);
    const src = fs.readFileSync(path.join(__dirname, 'V5KxRanking.tsx'), 'utf8');
    const built = src.slice(src.indexOf('const storyIn'), src.indexOf('const storyKey'));
    expect(built).toMatch(/name: props\.myName, photo: props\.myPhoto/);
    expect(built).not.toMatch(/rows|first_name|r\.photo/);
    expect(built).toMatch(/refCode\(myNo\)/);
  });
});
