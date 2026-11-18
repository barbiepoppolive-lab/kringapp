/** board-1 (18 Nov): Kring Light on the weekly board + the "Share my rank" story card. One language at a time, everywhere. */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fireEvent, render, waitFor } from '@testing-library/react';
import { RankingPage } from './V5KxRanking';
import { KX_L, V5_L } from './v5Strings';
import { prizeFor, prizeLadder } from './kxLogic';
import { boardMoment, cardCaption, cardLink, cardText, linkCopiedToast, MOMENTS, SAFE_BOTTOM, SAFE_TOP, STORY_H, STORY_W, storyButton, storyButtonLabel } from './rankStory';
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
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('aria-busy')).toBe('false'));
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    await waitFor(() => expect(document.querySelector('#kxShareRank')).toBeTruthy());
    const text = document.querySelector('#kxRanking')!.textContent!;
    expect(text).toContain('อันดับของฉัน');
    expect(text).toContain('คลิปของฉัน');
    expect(text).not.toMatch(LATIN_WORD);
    expect(document.querySelectorAll('#kxRanking [lang="en"]').length).toBe(0);
    const labels = [...document.querySelectorAll('#kxRanking [aria-label]')].map((e) => e.getAttribute('aria-label')!);
    for (const l of labels) expect(l, l).not.toMatch(LATIN_WORD);
  });
  it('English mode: no Thai anywhere on the board, labels included', async () => {
    kx.kxRanking.mockResolvedValue(board(ROWS.map((r) => ({ ...r, first_name: `P${r.rank}` })), { gap: gap({}) }));
    page('en');
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('aria-busy')).toBe('false'));
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    await waitFor(() => expect(document.querySelector('#kxShareRank')).toBeTruthy());
    const text = document.querySelector('#kxRanking')!.textContent!;
    expect(text).toContain('My rank');
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
  it('one Share button → a tiny sheet: My Reel (the Reel share flow) / My rank (the story card) + the friend line; not on the board → Share goes straight to my Reel', async () => {
    const onShare = vi.fn();
    const r = render(<RankingPage L={en} Lf={enf} lang="en" myArea={null} myPhoto={null} myName="Ploy" myId="me" onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={onShare} />);
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('aria-busy')).toBe('false'));
    await waitFor(() => expect(document.querySelector('#kxMeRow')).toBeTruthy());
    expect(document.querySelector('#kxBoardCta')!.textContent).toBe('Share');
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    const sheet = document.querySelector('#kxShareSheet')!;
    expect([...sheet.querySelectorAll('.bx-pick .tx')].map((e) => e.textContent)).toEqual(['My Reel', 'My rank']);
    expect(sheet.querySelector('#kxInviteHint')).toBeTruthy();                       // "Friend joins = +10 each" lives in the sheet now
    expect(document.querySelectorAll('#kxInviteHint').length).toBe(1);
    expect(document.querySelector('#kxShareRank')!.getAttribute('aria-label')).toBe('Share my rank as a story');
    fireEvent.click(document.querySelector('#kxShareReel')!);
    expect(onShare).toHaveBeenCalledWith('r1');
    expect(document.querySelector('#kxShareSheet')).toBeNull();
    r.unmount();
    kx.kxRanking.mockResolvedValue(board(ROWS.slice(1).map((x) => ({ ...x, is_me: false })), { gap: gap({ state: 'off', rank: null, rings: 0, prize_now: 0, target: { rank: 8, need: 25, prize: 100, open: false } }) }));
    page('en');
    await waitFor(() => expect(document.querySelector('#kxMeRow')).toBeTruthy());
    await waitFor(() => expect(document.querySelector('#kxBoardCta')!.getAttribute('aria-busy')).toBe('false'));
    fireEvent.click(document.querySelector('#kxBoardCta')!);
    expect(document.querySelector('#kxShareSheet')).toBeNull();
  });
  it('pinned row: one line, the bar only while chasing; rows show the ring + number only (the word stays in the pinned row)', async () => {
    page('en');
    await waitFor(() => expect(document.querySelector('#kxMeNext')).toBeTruthy());
    expect(document.querySelector('#kxMeNext')!.textContent).toBe('You’re #1 · 54 Rings ahead');
    expect(document.querySelector('#kxMeBar')).toBeNull();                            // #1: nothing to chase
    expect([...document.querySelectorAll('.bx-row .bx-sc')].map((e) => e.textContent)).toEqual(['19', '14', '9', '6', '5', '3', '2']);
    expect(document.querySelector('#kxRankList')!.textContent).not.toMatch(/Rings?\b/);
  });
  it('live countdown: days, then the last 24 h (pink, pulsing), then the last hour (big mm:ss); Thai units in Thai', async () => {
    const { liveClock } = await import('./V5KxRanking');
    const end = Date.parse('2026-11-22T17:00:00Z');
    const left = (d: number, h: number, m: number, s: number) => end - (((d * 24 + h) * 60 + m) * 60 + s) * 1000;
    expect(liveClock(left(3, 8, 14, 22), end, 'en')).toEqual({ text: '3d 08:14:22', mode: 'week' });
    expect(liveClock(left(3, 8, 14, 22), end, 'th')).toEqual({ text: '3 วัน 08:14:22', mode: 'week' });
    expect(liveClock(left(0, 8, 14, 22), end, 'en')).toEqual({ text: '08:14:22', mode: 'day' });
    expect(liveClock(left(0, 0, 14, 22), end, 'th')).toEqual({ text: '14:22', mode: 'hour' });
    expect(liveClock(end + 5000, end, 'en')).toEqual({ text: '00:00', mode: 'hour' });
    const css = fs.readFileSync(path.join(__dirname, 'kx.css'), 'utf8');
    expect(css).toMatch(/prefers-reduced-motion: no-preference\) \{ \.v8-app-root \.bx-cd\.day \{ animation: bxHot/);
  });
  it('card words: one language per card, every moment; pool line from the config; the code big and readable', () => {
    for (const moment of MOMENTS) {
      const t = cardText({ lang: 'th', moment, rank: 3, daysLeft: 4, won: 1500, paidN: 8, pool: 4400, code: 'k00037' });
      const words = [t.headline, t.chip, t.brand, t.pool, t.code, cardCaption('th', moment), linkCopiedToast('th').replace('IG', '')].join(' ').replace(/K\d{5}/, '');
      expect(words, moment).not.toMatch(LATIN_WORD);
      const e = cardText({ lang: 'en', moment, rank: 3, daysLeft: 4, won: 1500, paidN: 8, pool: 4400, code: 'k00037' });
      expect([...Object.values(e), cardCaption('en', moment), linkCopiedToast('en')].join(' '), moment).not.toMatch(THAI);
      expect(t.pool).toBe('8 อันดับแรกแบ่ง ฿4,400 ทุกสัปดาห์');
      expect(e.pool).toBe('Top 8 share ฿4,400 weekly');
      expect(e.code).toBe('Search Kring · K00037');
      // no Ring counts on any card
      expect(Object.values(e).join(' ')).not.toMatch(/Ring/);
    }
    expect(cardText({ lang: 'en', moment: 'help', rank: 7, daysLeft: 4, won: 0, paidN: 8, pool: 4400, code: '' }).chip).toBe('#7 this week · 4 days left');
    expect(cardText({ lang: 'th', moment: 'challenge', rank: 3, daysLeft: 2, won: 0, paidN: 8, pool: 4400, code: '' }).headline).toBe('อันดับ 3 ของกรุงเทพฯ\nสัปดาห์นี้\nใครจะแซงฉันได้?');
    expect(cardText({ lang: 'en', moment: 'proof', rank: 1, daysLeft: 0, won: 1500, paidN: 8, pool: 4400, code: '' }).amount).toBe('฿1,500');
    expect(cardText({ lang: 'en', moment: 'help', rank: 9, daysLeft: 1, won: 0, paidN: 6, pool: 3000, code: '' }).pool).toBe('Top 6 share ฿3,000 weekly');
    expect([storyButton('th'), storyButtonLabel('th')].join(' ')).not.toMatch(LATIN_WORD);
    expect([storyButton('en'), storyButtonLabel('en')].join(' ')).not.toMatch(THAI);
  });
  it('the link: the Reel with no sign-in, my invite code and the card type (utm_content)', () => {
    const u = new URL(cardLink({ origin: 'https://kringapp.com', base: '/app/', reel: 'r1', code: 'k00037', moment: 'challenge' }));
    expect(u.pathname).toBe('/app/');
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ reel: 'r1', ref: 'k00037', utm_content: 'share-challenge' });
    expect(new URL(cardLink({ origin: 'https://kringapp.com', short: 'abc2345', code: 'k00037', moment: 'help' })).pathname).toBe('/r/abc2345');
    expect(boardMoment(3, 8)).toBe('challenge');
    expect(boardMoment(9, 8)).toBe('help');
  });
  it('1080×1920 with story safe areas; draws only me (no other member names or photos reach the card)', () => {
    expect([STORY_W, STORY_H]).toEqual([1080, 1920]);
    expect(SAFE_TOP).toBeGreaterThanOrEqual(220);
    expect(SAFE_BOTTOM).toBeGreaterThanOrEqual(250);
    const src = fs.readFileSync(path.join(__dirname, 'V5KxRanking.tsx'), 'utf8');
    const built = src.slice(src.indexOf('const storyIn'), src.indexOf('const storyKey'));
    expect(built).not.toMatch(/rows|first_name|r\.photo|name:/);
    expect(built).toMatch(/refCode\(myNo\)/);
  });
});

describe('board-1: one Share tap', () => {
  it('copies the link + toast, then the share sheet gets the picture, the caption and the link; no sheet → download', async () => {
    const { shareCard } = await import('./rankStory');
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share, canShare: () => true });
    const copy = vi.fn().mockResolvedValue(true), toast = vi.fn();
    const blob = new Blob(['x'], { type: 'image/png' });
    expect(await shareCard(blob, { name: 'k.png', caption: 'Come heart my clip 💜', link: 'https://kringapp.com/app/?reel=r1&ref=k00037', copy, toast, copied: 'Link copied' })).toBe('shared');
    expect(copy).toHaveBeenCalledWith('https://kringapp.com/app/?reel=r1&ref=k00037');
    expect(toast).toHaveBeenCalledWith('Link copied');
    const d = share.mock.calls[0][0];
    expect(d.files[0].name).toBe('k.png');
    expect(d.url).toBe('https://kringapp.com/app/?reel=r1&ref=k00037');
    expect(d.text).toContain('Come heart my clip 💜');
    Object.assign(navigator, { share: undefined, canShare: undefined });
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:x';
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => undefined;
    expect(await shareCard(blob, { name: 'k.png', caption: '', link: 'L', copy, toast, copied: 'c' })).toBe('saved');
  });
});
