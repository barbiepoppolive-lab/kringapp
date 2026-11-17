/** Board V2 "Compact" (founder pick 18 Nov): prizes, the 25-Ring progress row, empty spots, Share my Reel vs Post a Reel, one language at a time. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { closeLine, closesAt, floorProgress, latestApproved, RankingPage } from './V5KxRanking';
import { KX_L, V5_L } from './v5Strings';
import { prizeFor, prizeLadder } from './kxLogic';
import type { KxGap, KxRanking, KxRankRow } from './v5Kx';

const kx = vi.hoisted(() => ({ kxRanking: vi.fn(), kxSeatsLeft: vi.fn(), kxRules: vi.fn(), kxMemberReels: vi.fn(), kxBreakdown: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kx }));

const en = (s: string) => s;
const enf = (s: string, a: string, b = '') => s.replace('{0}', a).replace('{1}', b);
const th = (s: string) => V5_L.th[s] || KX_L.th[s] || s;
const thf = (s: string, a: string, b = '') => th(s).replace('{0}', a).replace('{1}', b);
const RULES = { like: 1, save: 3, open: 5, opens_day_cap: 30, traveller_mult: 2, best_reels: 1, min_rings_for_paid_seat: 25,
  prize_1: 1500, prize_2: 900, prize_3: 600, prize_4: 500, prize_5: 400, prize_6: 250, prize_7: 150, prize_8: 100 };
const NAMES = ['อาร์ม', 'เอิร์ธ', 'นีน่า', 'อามีร่า', 'ฟิล์ม', 'พลอย', 'มิ้นท์', 'บีม', 'โอ๊ต', 'แพร'];
const row = (rank: number, rings: number, extra: Partial<KxRankRow> = {}): KxRankRow => ({ rank, all_rank: rank, rings, prize: prizeFor(rank), paid: rank <= 8 && rings >= 25,
  needs: rank <= 8 && rings < 25 ? 25 : null, to_line: rank > 8 ? 25 - rings + 1 : null, user_id: `u${rank}`, first_name: NAMES[rank - 1] || `N${rank}`, photo: null, area: 'Ari',
  move: null, is_me: false, ...extra });
const gap = (g: Partial<KxGap>): KxGap => ({ state: 'board', rank: 14, rings: 12, floor: 25, prize_now: 0, target: { rank: 8, need: 14, prize: 100, open: false }, above: null, behind: null, top10_need: null, ...g });
const board = (rows: KxRankRow[], extra: Partial<KxRanking> = {}): KxRanking => ({ week_start: '2026-11-16', ends_at: '2026-11-22T17:00:00Z', scope: 'all', area: null, total: rows.length,
  paid_ranks: 8, floor: 25, posters: rows.length, min_posters: 0, payout_on: true, open_seats: Math.max(0, 8 - rows.length), prizes: prizeLadder(), rows, me: null, gap: null,
  mine: { pending: 0, live: 1, no_place: 0 }, ...extra });
const TOP8 = [41, 37, 31, 29, 27, 26, 26, 25].map((r, i) => row(i + 1, r));
const reel = (id: string, status: string, created_at: string) => ({ id, status, created_at, poster_path: '', video_path: '', body: null, likes: 0, saves: 0, this_week: true, rings: 0, place: null, liked: false, saved: false });
const page = (o: { lang?: string; myId?: string | null; onShare?: (id: string) => void; onPost?: () => void; onPerson?: (id: string) => void } = {}) => {
  const lang = o.lang || 'en';
  return render(<RankingPage L={lang === 'th' ? th : en} Lf={lang === 'th' ? thf : enf} lang={lang} myArea={null} myPhoto={null} myName="You" myId={o.myId === undefined ? 'me' : o.myId}
    onBack={() => undefined} onPerson={o.onPerson || (() => undefined)} onPost={o.onPost || (() => undefined)} onShare={o.onShare || (() => undefined)} />);
};

beforeEach(() => {
  for (const f of Object.values(kx)) f.mockReset();
  kx.kxSeatsLeft.mockResolvedValue(38);
  kx.kxRules.mockResolvedValue(RULES);
  kx.kxMemberReels.mockResolvedValue({ user_id: 'me', mine: true, best: null, reels: [] });
  kx.kxRanking.mockResolvedValue(board(TOP8, { gap: gap({}) }));
});

describe('Board V2: prizes', () => {
  it('podium ฿900 · ฿1,500 · ฿600 as gold text, #4–#8 ฿500 / 400 / 250 / 150 / 100 from the config', async () => {
    page();
    await waitFor(() => expect(document.querySelector('#kxPodium')).toBeTruthy());
    expect(prizeLadder().slice(0, 8)).toEqual([1500, 900, 600, 500, 400, 250, 150, 100]);
    expect([...document.querySelectorAll('#kxPodium .bx-pz[data-prize]')].map((e) => e.textContent)).toEqual(['฿900', '฿1,500', '฿600']);
    expect([...document.querySelectorAll('.bx-row .kx-pz')].map((e) => e.textContent)).toEqual(['฿500', '฿400', '฿250', '฿150', '฿100']);
    expect(document.querySelectorAll('.bx-row').length).toBe(5);
  });
  it('#9 and below: plain rows with "X to #8", under the prize line', async () => {
    kx.kxRanking.mockResolvedValue(board([...TOP8, row(9, 20), row(10, 12)], { gap: gap({}) }));
    page();
    await screen.findByText('PRIZE LINE');
    expect([...document.querySelectorAll('.bx-row.plain .kx-tl')].map((e) => e.textContent)).toEqual(['6 to #8', '14 to #8']);
    expect(document.querySelector('.bx-row.plain .kx-pz')).toBeNull();
  });
  it('#1 is bigger and has a thin gold ring + crown, no laurel wreath', () => {
    const css = fs.readFileSync(path.join(__dirname, 'kx.css'), 'utf8');
    const p1 = css.match(/\.bx-pc\.p1 \.bx-img \{([^}]*)\}/)![1];
    expect(p1).toMatch(/width: 84px/);
    expect(p1).toMatch(/0 0 0 2\.5px #F7C955/);
    expect(css).toMatch(/\.bx-img \{[^}]*width: 66px/);
    const tsx = fs.readFileSync(path.join(__dirname, 'V5KxRanking.tsx'), 'utf8') + fs.readFileSync(path.join(__dirname, 'BoardArt.tsx'), 'utf8');
    expect(tsx).not.toMatch(/laurel/i);
  });
});

describe('Board V2: the line under the title', () => {
  it('"Closes Sun 23:59 · 38/50 seats left" with real values (Thai: ปิดรอบ อา. 23:59 · เหลือ 38/50 ที่นั่ง)', () => {
    const end = Date.parse('2026-11-22T17:00:00Z');
    expect(closesAt(end, 'en')).toBe('Sun 23:59');
    expect(closesAt(end, 'th')).toBe('อา. 23:59');
    expect(closeLine(enf, 'en', end - 3 * 86400_000, end)).toEqual({ text: 'Closes Sun 23:59', soon: false });
    expect(closeLine(thf, 'th', end - 3 * 86400_000, end).text).toBe('ปิดรอบ อา. 23:59');
    // the countdown is kept: in the last 24 h the line counts down
    expect(closeLine(enf, 'en', end - (5 * 60 + 12) * 60_000, end)).toEqual({ text: 'Closes in 05:12', soon: true });
    expect(thf('{0}/{1} seats left', '38', '50')).toBe('เหลือ 38/50 ที่นั่ง');
  });
});

describe('Board V2: pinned row + progress to 25 Rings', () => {
  it('below the floor: "#14 · You · 12 Rings · 13 more Rings for a prize seat", bar 48%', async () => {
    page();
    await waitFor(() => expect(document.querySelector('#kxMeRow')).toBeTruthy());
    const me = document.querySelector('#kxMeRow')!;
    expect(me.querySelector('.n')!.textContent).toBe('#14');
    expect(me.querySelector('.l1')!.textContent).toBe('You · 12 Rings');
    expect(me.querySelector('#kxMeNext')!.textContent).toBe('13 more Rings for a prize seat');
    const bar = me.querySelector('#kxMeBar')!;
    expect(bar.getAttribute('data-pct')).toBe('48');
    expect(bar.getAttribute('aria-valuemax')).toBe('25');
    expect(bar.className).not.toContain('full');
  });
  it('qualified: full bar and the next step (Rings to the next rank and its ฿)', async () => {
    kx.kxRanking.mockResolvedValue(board(TOP8, { gap: gap({ state: 'board', rank: 9, rings: 30, target: { rank: 8, need: 3, prize: 100, open: false } }) }));
    page();
    await waitFor(() => expect(document.querySelector('#kxMeBar')).toBeTruthy());
    expect(document.querySelector('#kxMeBar')!.className).toContain('full');
    expect(document.querySelector('#kxMeNext')!.textContent).toBe('3 Rings to #8 · ฿100');
  });
  it('floorProgress / latestApproved', () => {
    expect(floorProgress(12, 25)).toEqual({ pct: 48, below: true, need: 13 });
    expect(floorProgress(25, 25)).toEqual({ pct: 100, below: false, need: 0 });
    expect(floorProgress(0, 25).pct).toBe(0);
    expect(latestApproved([reel('a', 'approved', '2026-11-16T01:00:00Z'), reel('b', 'pending', '2026-11-18T01:00:00Z'), reel('c', 'approved', '2026-11-17T01:00:00Z'), reel('d', 'hidden', '2026-11-18T02:00:00Z')])).toBe('c');
    expect(latestApproved([reel('b', 'pending', '2026-11-18T01:00:00Z')])).toBeNull();
    expect(latestApproved(null)).toBeNull();
  });
});

describe('Board V2: empty podium spot', () => {
  it('"Your spot?" on the empty podium places; tapping opens Post a Reel', async () => {
    const onPost = vi.fn();
    kx.kxRanking.mockResolvedValue(board([row(1, 41)], { gap: gap({}) }));
    page({ onPost });
    await waitFor(() => expect(document.querySelector('.bx-pc.p2.open')).toBeTruthy());
    expect([...document.querySelectorAll('.bx-pc.open .bx-nm')].map((e) => e.textContent)).toEqual(['Your spot?', 'Your spot?']);
    fireEvent.click(document.querySelector('.bx-pc.p3 [data-seat="open"]')!);
    expect(onPost).toHaveBeenCalled();
  });
});

describe('Board V2: one main button', () => {
  it('has an approved Reel → "Share my Reel" shares the newest approved one (the app\'s Reel share flow)', async () => {
    const onShare = vi.fn(), onPost = vi.fn();
    kx.kxMemberReels.mockResolvedValue({ user_id: 'me', mine: true, best: 'a', reels: [reel('a', 'approved', '2026-11-16T01:00:00Z'), reel('n', 'approved', '2026-11-17T09:00:00Z'), reel('p', 'pending', '2026-11-18T01:00:00Z')] });
    page({ onShare, onPost });
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('data-act')).toBe('share'));
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('aria-busy')).toBe('false'));
    expect(document.querySelector('#kxBoardCta')!.textContent).toBe('Share my Reel');
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    expect(onShare).toHaveBeenCalledWith('n');
    expect(onPost).not.toHaveBeenCalled();
    expect(kx.kxMemberReels).toHaveBeenCalledWith('me');
  });
  it('no Reel yet → "Post a Reel" opens the composer', async () => {
    const onShare = vi.fn(), onPost = vi.fn();
    page({ onShare, onPost });
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('data-act')).toBe('post'));
    expect(document.querySelector('#kxBoardCta')!.textContent).toBe('Post a Reel');
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    expect(onPost).toHaveBeenCalled();
    expect(onShare).not.toHaveBeenCalled();
  });
  it('Thai labels: แชร์คลิปของฉัน / โพสต์คลิป', async () => {
    const r = page({ lang: 'th' });
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.textContent).toBe('โพสต์คลิป'));
    r.unmount();
    kx.kxMemberReels.mockResolvedValue({ user_id: 'me', mine: true, best: 'a', reels: [reel('a', 'approved', '2026-11-16T01:00:00Z')] });
    page({ lang: 'th' });
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.textContent).toBe('แชร์คลิปของฉัน'));
  });
  it('signed out: Post a Reel (sign-in happens in the composer flow)', async () => {
    const onPost = vi.fn();
    page({ myId: null, onPost });
    await waitFor(() => expect(document.querySelector('#kxPodium')).toBeTruthy());
    expect(document.querySelector('#kxMeRow')).toBeNull();
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    expect(onPost).toHaveBeenCalled();
  });
});

describe('Board V2: one language at a time', () => {
  it('Thai mode: no English anywhere on the board (no English sub-lines)', async () => {
    kx.kxRanking.mockResolvedValue(board([...TOP8, row(9, 20)], { gap: gap({}) }));
    page({ lang: 'th' });
    await waitFor(() => expect(document.querySelector('#kxSeatsLeft')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('#kxMeRow')).toBeTruthy());
    const text = document.querySelector('#kxRanking')!.textContent!;
    expect(text).toContain('อันดับประจำสัปดาห์');
    expect(text).toContain('ปิดรอบ อา. 23:59');
    expect(text).toContain('เหลือ 38/50 ที่นั่ง');
    expect(text).toContain('อีก 13 ริง ได้ที่นั่งรับรางวัล');
    expect(text).not.toMatch(/[A-Za-z]{2,}/);
    expect(document.querySelectorAll('#kxRanking [lang="en"]').length).toBe(0);
  });
  it('English mode: no Thai on the board', async () => {
    kx.kxRanking.mockResolvedValue(board(TOP8.map((r) => ({ ...r, first_name: `P${r.rank}` })), { gap: gap({}) }));
    page();
    await waitFor(() => expect(document.querySelector('#kxSeatsLeft')).toBeTruthy());
    const t = document.querySelector('#kxRanking')!.textContent!;
    expect(t.match(/.{0,8}[\u0E01-\u0E3A\u0E40-\u0E7F]+.{0,10}/g)).toBeNull();   // ฿ (U+0E3F) is fine
  });
  it('ⓘ opens How to win + prize rules in a light glass sheet, Thai only in Thai mode', async () => {
    page({ lang: 'th' });
    await waitFor(() => expect(kx.kxRules).toHaveBeenCalled());
    await waitFor(() => expect(document.querySelector('#kxPodium')).toBeTruthy());
    fireEvent.click(document.querySelector('#kxWinOpen')!);
    const sheet = await waitFor(() => { const e = document.querySelector('#kxWin'); if (!e) throw new Error('no sheet'); return e; });
    expect(sheet.className).toContain('glass');
    expect(sheet.textContent).toContain('วิธีชนะ');
    expect(sheet.textContent).toContain('฿1,500');
    expect(sheet.textContent!.replace(/TrueMoney/g, '')).not.toMatch(/[A-Za-z]{3,}/);
  });
  it('new board copy has Thai and every other language, and no banned words', () => {
    const KEYS = ['Closes {0}', 'Closes in {0}', '{0}/{1} seats left', 'Your spot?', '{0} more Rings for a prize seat', 'Share my Reel', 'How to win'];
    const BANNED = /\b(meet|guide|tour|host|creator|reviews|hidden gem|alcohol|gift|wallet|credit|lucky|draw|temples)\b|ลุ้น/i;
    for (const k of KEYS) {
      expect(KX_L.th[k], k).toBeTruthy();
      expect(V5_L.th[k], k).toBeTruthy();
      expect(BANNED.test(k) || BANNED.test(KX_L.th[k])).toBe(false);
      for (const l of ['zh', 'hi', 'ja', 'ko']) {
        const src = fs.readFileSync(path.join(__dirname, `strings/v5.${l}.ts`), 'utf8');
        expect(src.includes(`'${k}':`), `${l}: ${k}`).toBe(true);
      }
    }
    expect(BANNED.test('โพสต์คลิป')).toBe(false);
  });
});

describe('Board V2: light for cheap Android', () => {
  it('one background picture under 100 KB (WebP + JPG fallback); no backdrop-filter on the page itself', () => {
    for (const f of ['board_bg.webp', 'board_bg.jpg']) expect(fs.statSync(path.join(__dirname, 'art', f)).size).toBeLessThan(100 * 1024);
    const css = fs.readFileSync(path.join(__dirname, 'kx.css'), 'utf8');
    const bxAll = css.slice(css.indexOf('Board V2 "Compact"'));
    const bx = bxAll.includes('Kring Light 5a') ? bxAll.slice(0, bxAll.indexOf('Kring Light 5a')) : bxAll;   // app-wide sheet glass (Light 5a) lives after the board block
    const blurRules = bx.split('}').filter((l) => /backdrop-filter: blur/.test(l));
    expect(blurRules.length).toBeGreaterThan(0);
    expect(blurRules.every((l) => /\.rw-sheet\.glass \{/.test(l))).toBe(true);
    expect(bx).toMatch(/\.lowfx \.rw-sheet\.glass \{[^}]*backdrop-filter: none/);
    expect(bx).toMatch(/@media \(prefers-reduced-motion: no-preference\)/);
    expect(bx.match(/animation:/g)?.length ?? 0).toBe(1);
  });
});
