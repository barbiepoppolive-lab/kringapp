import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import {
  claimBrands, claimPrize, closeWeek, countdown, countOpens, inviteCode, levelFor, mathLines, memberNo, paidRanks, parseHandle, partsScore, prizeFor, prizeLadder, rankGap, reelParts,
  socialUrl, togglePick, valueFor, weekBoard, weekEnd, weeklyTotal, type Actor, type ReelIn, type ShareOpen,
} from './kxLogic';
import { KX_AREA_TH, KX_L, V5_L } from './v5Strings';

const kxMock = vi.hoisted(() => ({ kxClaimPrize: vi.fn(), kxRecentClaims: vi.fn(), kxMarkUsed: vi.fn(), kxBreakdown: vi.fn(), kxRanking: vi.fn() }));
vi.mock('./v5Kx', async (orig) => ({ ...(await orig<typeof import('./v5Kx')>()), ...kxMock }));
vi.mock('./v5Reel', () => ({ signReelPaths: vi.fn().mockResolvedValue({}) }));
import { ClaimedPage, ClaimPage, ResultPage, RewardsPage } from './V5KxRewards';
import { HOW_RINGS, HowSheet, MathSheet, ownRow, RankingPage } from './V5KxRanking';
import { FoundingChecklist } from './V5Me';
import { RINGS, ringsRules } from './rewardsConfig';
import { LEVEL_KEY } from './kxLogic';
import type { KxClaim, KxGap, KxPrize, KxRanking, KxRankRow, KxRewards } from './v5Kx';

const L = (en: string) => en;
const Lf = (en: string, a: string, b = '') => en.replace('{0}', a).replace('{1}', b);
const LT = (en: string) => KX_L.th[en] || en;
const rewards = (extra: Partial<KxRewards> = {}): KxRewards => ({ week: 0, rank: null, lifetime: 0, level: 1, gap: null, ends_at: '2026-11-15T17:00:00Z', member_no: 412,
  founding_no: null, founding_left: 36, floor: 25, rules: { ...RINGS, truemoney_payout_pct: 75 /* a 75% config; live default is 100 */ }, ladder: [1500, 900, 600, 500, 400, 250, 150, 100, 0, 0], streak: 0, checked_in_today: true, prizes: [], claims: [], ...extra });
const prize = (extra: Partial<KxPrize> = {}): KxPrize => ({ id: 'pz1', kind: 'weekly', week: '2026-11-09', rank: 4, founding_no: null, amount: 500, rings: 198, status: 'won', claim_id: null, created_at: new Date().toISOString(), ...extra });
const claim = (extra: Partial<KxClaim> = {}): KxClaim => ({ id: 'c1', brand: 'grab', amount: 500, status: 'assigned', value: 500, code: 'TEST-GRAB-0001', activation_url: null, used_at: null,
  created_at: new Date().toISOString(), assigned_at: new Date().toISOString(), kind: 'weekly', week: '2026-11-09', rank: 4, founding_no: null, ...extra });
beforeEach(() => { kxMock.kxRecentClaims.mockResolvedValue([]); kxMock.kxClaimPrize.mockReset(); kxMock.kxBreakdown.mockReset(); kxMock.kxRanking.mockReset(); });
afterEach(() => cleanup());

// people and Reels for the score tests
const loc = (id: string, cardDone = true): Actor => ({ id, who: 'local', cardDone });
const trav = (id: string, cardDone = true): Actor => ({ id, who: 'traveller', cardDone });
const W0 = Date.parse('2026-11-09T00:00:00+07:00');           // Monday 00:00 Bangkok
const DAY = 86400_000;
const open = (n: number, day = '2026-11-10', extra: Partial<ShareOpen> = {}): ShareOpen => ({ session: `s${n}-${day}`, device: `d${n}-${day}`, day, ...extra });
const reel = (id: string, author: string, extra: Partial<ReelIn> = {}): ReelIn => ({ id, author, postedAt: W0 + DAY, approved: true, places: 1, likes: [], saves: [], opens: [], ...extra });

describe('handle parsing (Instagram / TikTok)', () => {
  it('accepts @name, name and pasted profile links, lower-cased', () => {
    expect(parseHandle('ig', '@Mint.BKK')).toEqual({ ok: true, handle: 'mint.bkk' });
    expect(parseHandle('ig', 'https://www.instagram.com/mint.bkk/?igsh=abc123')).toEqual({ ok: true, handle: 'mint.bkk' });
    expect(parseHandle('ig', 'instagram.com/mint_bkk')).toEqual({ ok: true, handle: 'mint_bkk' });
    expect(parseHandle('ig', 'm.instagram.com/mint.bkk/reels/')).toEqual({ ok: true, handle: 'mint.bkk' });
    expect(parseHandle('tt', 'https://www.tiktok.com/@mintwalks?lang=th')).toEqual({ ok: true, handle: 'mintwalks' });
    expect(parseHandle('tt', 'tiktok.com/@mint.walks/video/7300000000')).toEqual({ ok: true, handle: 'mint.walks' });
    expect(parseHandle('tt', '@mintwalks')).toEqual({ ok: true, handle: 'mintwalks' });
    expect(parseHandle('tt', '  ')).toEqual({ ok: true, handle: null });
  });
  it('refuses bad characters, the other site and short links without a name', () => {
    expect(parseHandle('ig', 'mint bkk')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'mint-bkk')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'mint..bkk')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'มิ้นท์')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('ig', 'https://www.tiktok.com/@mintwalks')).toEqual({ ok: false, error: 'WRONG_SITE' });
    expect(parseHandle('tt', 'https://instagram.com/mint.bkk')).toEqual({ ok: false, error: 'WRONG_SITE' });
    expect(parseHandle('tt', 'https://vm.tiktok.com/ZSabc123/')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('tt', 'a')).toEqual({ ok: false, error: 'BAD_HANDLE' });
    expect(parseHandle('tt', 'x'.repeat(25))).toEqual({ ok: false, error: 'BAD_HANDLE' });
  });
  it('pills open the right profile URL', () => {
    expect(socialUrl('ig', 'mint.bkk')).toBe('https://www.instagram.com/mint.bkk/');
    expect(socialUrl('tt', 'mintwalks')).toBe('https://www.tiktok.com/@mintwalks');
  });
});

describe('Rings: the score of one Reel', () => {
  it('like +1, save +3, share-link open +5', () => {
    const r = reel('r1', 'me', { likes: [loc('a'), loc('b')], saves: [loc('a')], opens: [open(1), open(2)] });
    expect(reelParts(r)).toEqual({ lLocal: 2, lTrav: 0, sLocal: 1, sTrav: 0, opens: 2, score: 2 + 3 + 10 });
  });
  it('a visitor’s like or save counts double (+2 / +6)', () => {
    const r = reel('r1', 'me', { likes: [loc('a'), trav('t1'), trav('t2')], saves: [trav('t1'), loc('b')] });
    expect(reelParts(r)).toMatchObject({ lLocal: 1, lTrav: 2, sLocal: 1, sTrav: 1, score: 1 + 4 + 3 + 6 });
    expect(mathLines({ lLocal: 16, lTrav: 3, sLocal: 4, sTrav: 1, opens: 6 }).map((x) => [x.n, x.each, x.total])).toEqual([[16, 1, 16], [3, 2, 6], [4, 3, 12], [1, 6, 6], [6, 5, 30]]);
    expect(partsScore({ lLocal: 16, lTrav: 3, sLocal: 4, sTrav: 1, opens: 6 })).toBe(70);      // the mock m3 example
  });
  it('one person counts once per Reel per action; own likes and saves count 0; un-like removes the Rings', () => {
    const liked = reel('r1', 'me', { likes: [loc('a'), loc('a'), loc('me'), trav('t')], saves: [loc('me'), loc('a'), loc('a')] });
    expect(reelParts(liked)).toMatchObject({ lLocal: 1, lTrav: 1, sLocal: 1, sTrav: 0, score: 1 + 2 + 3 });
    const unliked = { ...liked, likes: liked.likes.filter((x) => x.id !== 't'), saves: [] };                      // t un-likes, a un-saves
    expect(reelParts(unliked).score).toBe(1);
  });
  it('only members with a finished card (photo + first name) count', () => {
    expect(reelParts(reel('r1', 'me', { likes: [loc('a', false), trav('t', false), loc('b')], saves: [trav('t', false)] })).score).toBe(1);
  });
  it('only approved, non-hidden Reels with at least one place tag score', () => {
    const acts = { likes: [loc('a'), trav('t')], saves: [loc('a')], opens: [open(1)] };
    expect(reelParts(reel('r', 'me', acts)).score).toBe(11);
    expect(reelParts(reel('r', 'me', { ...acts, approved: false })).score).toBe(0);
    expect(reelParts(reel('r', 'me', { ...acts, hidden: true })).score).toBe(0);
    expect(reelParts(reel('r', 'me', { ...acts, places: 0 })).score).toBe(0);
  });
});

describe('Rings: share-link opens', () => {
  it('at most 30 opens count per Reel per Bangkok day', () => {
    const many = Array.from({ length: 45 }, (_, i) => open(i));
    expect(countOpens(many, 'me')).toBe(30);
    const twoDays = [...many, ...Array.from({ length: 12 }, (_, i) => open(i, '2026-11-11'))];
    expect(countOpens(twoDays, 'me')).toBe(42);
    expect(reelParts(reel('r', 'me', { opens: many })).score).toBe(150);
    expect(countOpens(many, 'me', 10)).toBe(10);                                                  // the cap is a config value
  });
  it('LINE opens and link-preview robots never count', () => {
    expect(countOpens([open(1, undefined, { line: true }), open(2, undefined, { robot: true }), open(3)], 'me')).toBe(1);
  });
  it('the same session or the same device counts once a day', () => {
    const o = [open(1), { ...open(1) }, { ...open(2), device: 'd1-2026-11-10' }, { ...open(1), day: '2026-11-11' }];
    expect(countOpens(o, 'me')).toBe(2);                                                           // once on the 10th, once on the 11th
  });
  it('the poster’s own opens count 0 (signed in, or the same phone later signed out)', () => {
    const mine = open(1, undefined, { opener: 'me' });
    const samePhoneNextDay = { ...open(9, '2026-11-11'), device: mine.device };
    expect(countOpens([mine, samePhoneNextDay, open(2, undefined, { opener: 'someone' })], 'me')).toBe(1);
  });
});

describe('weekly score: best Reel only (15 Nov), ties, one rank per person', () => {
  const likes = (n: number, p = 'x') => Array.from({ length: n }, (_, i) => loc(`${p}${i}`));
  it('a member’s weekly score = their ONE best Reel posted that week (founder rule 15 Nov)', () => {
    const b = weekBoard([
      reel('a1', 'ann', { likes: likes(10) }), reel('a2', 'ann', { likes: likes(40) }), reel('a3', 'ann', { likes: likes(25) }),
      reel('b1', 'ben', { likes: likes(30) }),
    ], W0);
    expect(b.map((r) => [r.member, r.rings, r.rank])).toEqual([['ann', 40, 1], ['ben', 30, 2]]);
    expect(b[0].reels).toEqual(['a2']);
    // the old two-Reel rule still works if the server config ever says 2
    const b2 = weekBoard([reel('a1', 'ann', { likes: likes(10) }), reel('a2', 'ann', { likes: likes(40) }), reel('a3', 'ann', { likes: likes(25) })], W0, { ...RINGS, best_reels: 2 });
    expect(b2[0].rings).toBe(65);
  });
  it('Reels posted before Monday 00:00 or after Sunday 23:59 Bangkok are another week', () => {
    const b = weekBoard([
      reel('old', 'ann', { postedAt: W0 - 1000, likes: likes(99) }), reel('in', 'ann', { postedAt: W0, likes: likes(5) }),
      reel('last', 'ben', { postedAt: W0 + 7 * DAY - 1000, likes: likes(3) }), reel('next', 'ben', { postedAt: W0 + 7 * DAY, likes: likes(99) }),
    ], W0);
    expect(b.map((r) => [r.member, r.rings])).toEqual([['ann', 5], ['ben', 3]]);
  });
  it('ties: the earlier-posted Reel wins, then the older member number', () => {
    const b = weekBoard([
      reel('late', 'late', { postedAt: W0 + 3 * DAY, likes: likes(20) }), reel('early', 'early', { postedAt: W0 + DAY, likes: likes(20) }),
      reel('same1', 'newer', { postedAt: W0 + 2 * DAY, likes: likes(7) }), reel('same2', 'older', { postedAt: W0 + 2 * DAY, likes: likes(7) }),
    ], W0, RINGS, (id) => (id === 'older' ? 3 : id === 'newer' ? 9 : 1));
    expect(b.map((r) => r.member)).toEqual(['early', 'late', 'older', 'newer']);
    expect(b.map((r) => r.rank)).toEqual([1, 2, 3, 4]);
  });
  it('one person holds one rank only; members with 0 Rings are not on the board', () => {
    const b = weekBoard([reel('a1', 'ann', { likes: likes(9) }), reel('a2', 'ann', { likes: likes(8) }), reel('a3', 'ann', { likes: likes(7) }), reel('z', 'zed')], W0);
    expect(b.length).toBe(1);
    expect(new Set(b.map((r) => r.member)).size).toBe(b.length);
    const prizes = closeWeek([{ member: 'ann', rings: 60, rank: 1, firstAt: 0, reels: [] }, { member: 'ann', rings: 50, rank: 2, firstAt: 0, reels: [] }]);
    expect(prizes.map((p) => p.rank)).toEqual([1]);                                               // even a bad board cannot pay one person twice
  });
});

describe('prizes (one config, baht, ranks 1–8)', () => {
  it('ladder: ฿1,500 / 900 / 600 / 500 / 400 / 250 / 150 / 100; ranks 9–10 no prize', () => {
    expect(prizeLadder()).toEqual([1500, 900, 600, 500, 400, 250, 150, 100, 0, 0]);
    expect(paidRanks()).toBe(8);
    expect(weeklyTotal()).toBe(4400);
    expect([0, 9, 10, 11].map((r) => prizeFor(r))).toEqual([0, 0, 0, 0]);
  });
  it('the server config wins without a code edit; unknown keys are ignored', () => {
    const R = ringsRules({ prize_8: 120, prize_9: 50, opens_day_cap: 20, nonsense: 9 });
    expect(prizeFor(8, R)).toBe(120);
    expect(paidRanks(R)).toBe(9);
    expect(R.like).toBe(1);
    expect((R as Record<string, number>).nonsense).toBeUndefined();
  });
  it('defaults are the locked rules of 15 Nov; nothing left of the interim rules', () => {
    expect(RINGS).toMatchObject({ like: 1, save: 3, open: 5, traveller_mult: 2, opens_day_cap: 30, best_reels: 1, min_rings_for_paid_seat: 25, min_posters_for_payout: 0,
      shopeepay_on: 0, founding_slots: 50, founding_thb: 100 });
    for (const k of ['rings_per_baht', 'checkin', 'streak_bonus', 'react', 'reel_place', 'friend', 'friend_welcome', 'weekly_1']) expect(k in RINGS).toBe(false);
  });
  it('week close: one "prize won" per paid rank above the floor; idempotent; nothing with too few posters', () => {
    const board = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((rank) => ({ member: `m${rank}`, rings: rank === 5 ? 18 : 400 - rank * 30, rank, firstAt: 0, reels: [] }));
    const won = closeWeek(board);
    expect(won.map((p) => [p.rank, p.amount])).toEqual([[1, 1500], [2, 900], [3, 600], [4, 500], [6, 250], [7, 150], [8, 100]]);    // #5 has 18 < 25: needs 25
    expect(closeWeek(board, RINGS, 10, won)).toBe(won);                                          // second run: nothing new
    expect(closeWeek(board, ringsRules({ min_posters_for_payout: 12 }), 10)).toEqual([]);
    expect(closeWeek(board, ringsRules({ min_rings_for_paid_seat: 0 })).length).toBe(8);
  });
  it('TrueMoney is full value by default (live 100%), a 75% config pays 75%; Grab is full value; ShopeePay is hidden by a flag', () => {
    expect([1500, 900, 600, 500, 400, 250, 150, 100].map((a) => valueFor('truemoney', a))).toEqual([1500, 900, 600, 500, 400, 250, 150, 100]);
    expect([1500, 900, 600, 500, 400, 250, 150, 100].map((a) => valueFor('truemoney', a, 75))).toEqual([1125, 675, 450, 375, 300, 187, 112, 75]);
    expect(valueFor('grab', 1500)).toBe(1500);
    expect(claimBrands()).toEqual(['truemoney']);
    expect(claimBrands(ringsRules({ shopeepay_on: 1 }))).toEqual(['truemoney']);   // 19 Nov: TrueMoney only
  });
  it('claim: exact-amount code in stock → assigned; none → HELD (pending); wrong member or hidden brand → refused', () => {
    const p = { id: 'w-4', member: 'me', kind: 'weekly' as const, rank: 4, amount: 500, status: 'won' as const };
    const stock = [{ brand: 'truemoney' as const, amount: 100, code: 'G100' }, { brand: 'truemoney' as const, amount: 500, code: 'G500' }];
    const ok = claimPrize(p, 'me', 'truemoney', stock);
    expect(ok).toMatchObject({ status: 'assigned', code: 'G500', value: 500 });
    expect(ok.status === 'assigned' && ok.stock).toEqual([stock[0]]);
    expect(claimPrize({ ...p, amount: 1500 }, 'me', 'truemoney', stock)).toMatchObject({ status: 'pending', value: 1500 });   // no ฿1,500 code: held
    expect(claimPrize(p, 'someone', 'truemoney', stock)).toEqual({ status: 'error', error: 'NO_PRIZE' });
    expect(claimPrize(p, 'me', 'grab', stock)).toEqual({ status: 'error', error: 'BAD_REWARD' });
    expect(claimPrize(p, 'me', 'shopeepay', stock)).toEqual({ status: 'error', error: 'BAD_REWARD' });
    expect(claimPrize(undefined, 'me', 'grab', stock)).toEqual({ status: 'error', error: 'NO_PRIZE' });
  });
  it('levels from lifetime Rings: 0 / 1,000 / 3,000 / 8,000 / 20,000', () => {
    expect(levelFor(0)).toMatchObject({ n: 1, key: 'Newcomer', toNext: 1000, nextKey: 'Explorer' });
    expect(new Set(LEVEL_KEY).size).toBe(5);   // audit P3-1: no level name twice
    expect(levelFor(1000)).toMatchObject({ n: 2, key: 'Explorer', toNext: 2000 });
    expect(levelFor(20000)).toMatchObject({ n: 5, key: 'Legend', next: null, toNext: 0, pct: 100 });
  });
  it('member number and invite code', () => {
    expect(memberNo(412)).toBe('#00412');
    expect(memberNo(null)).toBe('#—');
    expect(inviteCode(412)).toBe('k00412');
  });
});

describe('the pinned own row: next step in Rings and what it pays', () => {
  const board = (rings: number[]) => rings.map((r, i) => ({ member: `m${i + 1}`, rings: r, rank: i + 1 }));
  const full = board([312, 268, 241, 198, 176, 150, 131, 118, 107, 96]);
  it('"12 Rings to #8 · ฿100" for #9 and "23" for #10', () => {
    expect(rankGap(full, 'm9').target).toEqual({ rank: 8, need: 12, prize: 100, open: false });
    expect(rankGap(full, 'm10')).toMatchObject({ state: 'board', target: { rank: 8, need: 23, prize: 100 } });
  });
  it('already paid: the next rank up; #1 has no target', () => {
    expect(rankGap(full, 'm4')).toMatchObject({ state: 'paid', prizeNow: 500, target: { rank: 3, need: 44, prize: 600 } });
    expect(rankGap(full, 'm1')).toMatchObject({ state: 'top', prizeNow: 1500, target: null });
  });
  it('not on the board: to #8 when the seats are taken, an open seat when they are not; the floor always applies', () => {
    expect(rankGap(full, 'nobody')).toMatchObject({ state: 'off', target: { rank: 8, need: 119, prize: 100, open: false } });
    expect(rankGap(board([88, 64, 51, 33, 18]), 'nobody')).toMatchObject({ state: 'off', target: { rank: 6, need: 25, prize: 250, open: true } });
    expect(rankGap(board([88, 64, 51, 33, 18]), 'm5')).toMatchObject({ state: 'floor', prizeNow: 0, target: { rank: 5, need: 7, prize: 400 } });
    expect(rankGap(board([30, 10]), 'm2', ringsRules({ min_rings_for_paid_seat: 0 }))).toMatchObject({ state: 'paid', prizeNow: 900, target: { rank: 1, need: 21 } });
  });
  const gap = (g: Partial<KxGap>): KxGap => ({ state: 'board', rank: 9, rings: 107, floor: 25, prize_now: 0, target: { rank: 8, need: 12, prize: 100, open: false }, above: null, behind: null, top10_need: null, ...g });
  it('six states of the row text', () => {
    expect(ownRow(L, Lf, gap({}), null)).toMatchObject({ n: '9', l2: '12 Rings to pass #8 · ฿100', btn: 'math' });
    expect(ownRow(L, Lf, gap({ state: 'paid', rank: 4, rings: 198, prize_now: 500, target: { rank: 3, need: 44, prize: 600, open: false } }), null).l2).toBe('฿500 now · 44 Rings to pass #3 · ฿600');
    expect(ownRow(L, Lf, gap({ state: 'paid', rank: 8, rings: 118, prize_now: 100, target: { rank: 7, need: 14, prize: 150, open: false }, behind: { rank: 9, diff: 11 } }), null).l2).toBe('฿100 now · #9 is 11 behind you');
    expect(ownRow(L, Lf, gap({ state: 'far', rank: 37, rings: 14, above: { rank: 36, name: 'Fern', need: 3 }, top10_need: 82 }), null)).toMatchObject({ l2: '3 Rings to pass Fern · 82 to top 10', btn: 'share' });
    expect(ownRow(L, Lf, gap({ state: 'off', rank: null, rings: 0 }), { pending: 1, live: 0, no_place: 0 })).toMatchObject({ l2: 'Usually under 2 hours', btn: null, key: 'review' });
    expect(ownRow(L, Lf, gap({ state: 'off', rank: null, rings: 0 }), { pending: 0, live: 0, no_place: 0 })).toMatchObject({ l1: 'Not on the board yet', l2: 'One Reel at a place puts you on it', btn: 'post' });
    expect(ownRow(L, Lf, gap({ state: 'off', rank: null, rings: 0, target: { rank: 6, need: 25, prize: 250, open: true } }), null)).toMatchObject({ l2: 'Post a Reel · reach 25 Rings', btn: 'post', key: 'open' });
    expect(ownRow(L, Lf, gap({ state: 'floor', rank: 5, rings: 18, target: { rank: 5, need: 7, prize: 400, open: false } }), null).l2).toBe('7 Rings to take ฿400');
    expect(ownRow(L, Lf, null, null).btn).toBe('post');
  });
});

describe('week clock', () => {
  it('week ends Monday 00:00 Bangkok; countdown "1d 14:06"', () => {
    const fri = Date.parse('2026-11-13T12:00:00+07:00');
    expect(new Date(weekEnd(fri)).toISOString()).toBe('2026-11-15T17:00:00.000Z');
    expect(countdown(Date.parse('2026-11-14T09:54:00+07:00'), weekEnd(fri))).toBe('1d 14:06');
    expect(weekEnd(Date.parse('2026-11-16T00:00:30+07:00'))).toBe(Date.parse('2026-11-23T00:00:00+07:00'));
  });
});

const row = (rank: number, rings: number, extra: Partial<KxRankRow> = {}): KxRankRow => ({ rank, all_rank: rank, rings, prize: prizeFor(rank), paid: rank <= 8 && rings >= 25, needs: rank <= 8 && rings < 25 ? 25 : null,
  to_line: rank > 8 ? 118 - rings + 1 : null, user_id: `u${rank}`, first_name: `N${rank}`, photo: null, area: 'Ari', move: null, is_me: false, ...extra });
const ranking = (rows: KxRankRow[], extra: Partial<KxRanking> = {}): KxRanking => ({ week_start: '', ends_at: '', scope: 'all', area: 'Ari', total: rows.length, paid_ranks: 8, floor: 25, posters: rows.length,
  min_posters: 0, payout_on: true, open_seats: Math.max(0, 8 - rows.length), prizes: prizeLadder(), rows, me: null, gap: null, mine: null, ...extra });

describe('Ranking screen', () => {
  it('top 10: ฿ on the pedestals and on rows 4–8, PRIZE LINE under #8, #9–10 show "12 to #8", no prize in Rings anywhere', async () => {
    const rows = [312, 268, 241, 198, 176, 150, 131, 118, 107, 96].map((r, i) => row(i + 1, r, { is_me: i === 8 }));
    kxMock.kxRanking.mockResolvedValue(ranking(rows, { me: { rank: 9, all_rank: 9, rings: 107, prize: 0, move: null },
      gap: { state: 'board', rank: 9, rings: 107, floor: 25, prize_now: 0, target: { rank: 8, need: 12, prize: 100, open: false }, above: null, behind: null, top10_need: null } }));
    render(<RankingPage L={L} Lf={Lf} lang="en" myArea="Ari" myPhoto={null} myName="Mint" myId="u9" onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);
    await waitFor(() => expect(document.querySelector('#kxPrizeLine')!.textContent).toBe('Prize line'));   // board-1 v3: a tiny chip on a dotted line
    expect([...document.querySelectorAll('#kxPodium [data-prize]')].map((e) => e.textContent)).toEqual(['฿900', '฿1,500', '฿600']);
    expect([...document.querySelectorAll('.kx-row .kx-pz')].map((e) => e.textContent)).toEqual(['฿500', '฿400', '฿250', '฿150', '฿100']);
    expect([...document.querySelectorAll('.kx-row .kx-tl')].map((e) => e.textContent)).toEqual(['12 to #8', '23 to #8']);
    expect(document.querySelectorAll('[data-rank]').length).toBe(10);
    expect(document.querySelector('#kxMeNext')!.textContent).toBe('#9 · 12 Rings to #8');   // board-1 v3: one line
    expect(document.querySelector('.bx-tt h1')!.textContent).toBe('Weekly Ranking');
    // board-1 v3: a live countdown pill ("3d 08:14:22", last 24 h "08:14:22", last hour "14:22")
    expect(document.querySelector('#kxCountdown')!.textContent).toMatch(/^(\d+d \d\d:\d\d:\d\d|\d\d:\d\d:\d\d|\d\d:\d\d)$/);
    expect(document.querySelector('#kxRanking')!.textContent).not.toMatch(/\+5,000|\+500/);
    // look A (17 Nov): the All Bangkok · My area · Friends tabs are gone; the board is always All Bangkok
    expect(document.querySelector('[role="tablist"], #kxRank-area, #kxRank-friends, #kxHowBtn')).toBeNull();
    expect(kxMock.kxRanking).toHaveBeenCalledWith('all');
    expect(document.querySelector('#kxMeNextTh')).toBeNull();   // round 2: English page, no Thai line
  });
  it('cold start: empty paid ranks are "Your spot? · ฿250"; under the floor shows "needs 25"; the line says 25 Rings', async () => {
    const rows = [88, 64, 51, 33, 18].map((r, i) => row(i + 1, r));
    kxMock.kxRanking.mockResolvedValue(ranking(rows, { gap: { state: 'off', rank: null, rings: 0, floor: 25, prize_now: 0, target: { rank: 6, need: 25, prize: 250, open: true }, above: null, behind: null, top10_need: 1 } }));
    render(<RankingPage L={L} Lf={Lf} lang="en" myArea="Ari" myPhoto={null} myName="Mint" myId="me" onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);
    await waitFor(() => expect(document.querySelector('#kxPrizeLine')!.textContent).toMatch(/^Prize line · 25/));
    expect(document.querySelector('#kxPrizeLine')!.getAttribute('aria-label')).toBe('PRIZE LINE · 25 RINGS TO TAKE A SEAT');
    expect([...document.querySelectorAll('[data-seat="open"]')].map((e) => e.textContent)).toEqual(['6Your spot?฿250', '7Your spot?฿150', '8Your spot?฿100']);
    // board-1 (Kring Light): the "X more Rings to be eligible" line is only on MY row now; another member under the floor = dimmed prize
    expect(document.querySelector('[data-rank="5"]')!.textContent).not.toContain('more Rings to be eligible');
    expect(document.querySelector('[data-rank="5"] .kx-pz')!.className).toContain('off');
    expect(document.querySelector('[data-rank="5"]')!.className).toContain('low');
    expect(document.querySelector('#kxMeRow')!.textContent).toContain('Seat #6 is open · ฿250');
  });
  it('board V2: only 2 on the board → #3 is "Your spot?" with its ฿, 4–8 open seats, no prize line without a floor note', async () => {
    kxMock.kxRanking.mockResolvedValue(ranking([row(1, 72), row(2, 49)], { floor: 0, open_seats: 6 }));
    render(<RankingPage L={L} Lf={Lf} lang="en" myArea="Ari" myPhoto={null} myName="Mint" myId={null} onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);
    await waitFor(() => expect(document.querySelector('#kxPodium')).toBeTruthy());
    expect(document.querySelector('.bx-pc.p3.open [data-seat="open"]')).toBeTruthy();
    expect(document.querySelector('.bx-pc.p3.open .bx-nm')!.textContent).toBe('Your spot?');
    expect([...document.querySelectorAll('#kxPodium [data-prize]')].map((e) => e.textContent)).toEqual(['฿900', '฿1,500', '฿600']);
    expect(document.querySelectorAll('.bx-row.seat').length).toBe(5);
    expect(document.querySelector('#kxPrizeLine')).toBeNull();
  });
  it('look A: countdown chip pulses only in the last 6 h (Sun 18:00–24:00 Bangkok)', async () => {
    const { isLastHours } = await import('./V5KxRanking');
    const end = Date.parse('2026-11-22T17:00:00Z');
    expect(isLastHours(end - 6 * 3600_000 - 60_000, end)).toBe(false);
    expect(isLastHours(end - 6 * 3600_000, end)).toBe(true);
    expect(isLastHours(end - 60_000, end)).toBe(true);
    expect(isLastHours(end + 1, end)).toBe(false);
  });
  it('tap any score → the math: the Reel that counts, line by line', async () => {
    kxMock.kxRanking.mockResolvedValue(ranking([row(1, 107)]));
    kxMock.kxBreakdown.mockResolvedValue({ user_id: 'u1', first_name: 'Ploy', is_me: false, rings: 107, rank: 1, more: 1, weights: { like: 1, save: 3, open: 5, mult: 2, cap: 30, best: 1 },
      reels: [{ post_id: 'p1', posted_at: '2026-11-10T05:00:00Z', poster_path: null, place: 'Benjakitti Forest Park', place_th: null, l_local: 16, l_trav: 3, s_local: 4, s_trav: 1, opens: 6, score: 70 }] });
    render(<RankingPage L={L} Lf={Lf} lang="en" myArea="Ari" myPhoto={null} myName="Mint" myId={null} onBack={() => undefined} onPerson={() => undefined} onPost={() => undefined} onShare={() => undefined} />);
    fireEvent.click(await screen.findByLabelText('See the math'));
    await waitFor(() => expect(document.querySelector('#kxMathTotal')).toBeTruthy());
    expect(kxMock.kxBreakdown).toHaveBeenCalledWith('u1');
    const first = document.querySelector('[data-math-reel="p1"]')!;
    expect([...first.querySelectorAll('.kx-ml')].map((e) => e.textContent)).toEqual(['Local likes16 × 116', 'Visitor likes3 × 26', 'Local saves4 × 312', 'Visitor saves1 × 66', 'Link opens from Instagram / TikTok6 × 530']);
    expect(document.querySelectorAll('[data-math-reel]').length).toBe(1);
    expect(screen.getByText('your best Reel this week')).toBeTruthy();
    expect(screen.getByText('1 more Reel this week, not counted (only your best Reel counts)')).toBeTruthy();
    expect(document.querySelector('#kxMathShare')).toBeNull();                                   // someone else's score: no button
  });
  it('"How Rings work" is the exact founder copy, with Thai', () => {
    render(<HowSheet L={L} onClose={() => undefined} />);
    expect(document.querySelector('#kxHowText')!.textContent).toBe('Bangkok’s best Reels, chosen by the people who love the city. A like is 1 Ring. A save is 3. Each person who opens your Reel from Instagram or TikTok is 5. When a visitor to Bangkok likes or saves your Reel, it counts double, because you showed someone the real city. Only your best Reel of the week counts. Tap any score to see how it adds up.');
    expect(KX_L.th[HOW_RINGS]).toMatch(/ไลก์ = 1 ริง.*เซฟ = 3 ริง.*= 5 ริง.*สองเท่า/);
    void MathSheet;
  });
});

describe('Rewards screen (simplified)', () => {
  it('shows only: this week’s Rings + rank, My prizes, the ladder, the live line. No Today list, no invite card, no baht-for-Rings', async () => {
    render(<RewardsPage L={L} Lf={Lf} lang="en" data={rewards({ week: 107, rank: 9, streak: 3, prizes: [prize()],
      gap: { state: 'board', rank: 9, rings: 107, floor: 25, prize_now: 0, target: { rank: 8, need: 12, prize: 100, open: false }, above: null, behind: null, top10_need: null } })}
      onBack={() => undefined} onClaim={() => undefined} onCode={() => undefined} onHistory={() => undefined} onRanking={() => undefined} onMath={() => undefined} />);
    expect(document.querySelector('#kxWeekN')!.textContent).toBe('107');
    expect(document.querySelector('#kxWeekRank')!.textContent).toContain('#9');
    expect(document.querySelector('#kxWeekNext')!.textContent).toBe('12 Rings to pass #8 · ฿100');
    expect([...document.querySelectorAll('#kxLadder [data-rank]')].map((e) => e.getAttribute('data-amount'))).toEqual(['1500', '900', '600', '500', '400', '250', '150', '100', '0', '0']);
    expect(screen.getByText('Top 8 share ฿4,400 every week')).toBeTruthy();
    expect(document.querySelector('[data-claim-prize="pz1"]')!.textContent).toBe('Claim');
    expect(document.querySelector('#kxStreak')!.textContent).toContain('3 days in a row');
    expect(document.querySelector('#kxToday')).toBeNull();
    expect(document.querySelector('#kxInvite')).toBeNull();
    expect(document.querySelector('#kxRewards')!.textContent).not.toMatch(/Rings = ฿|Invite|Share my link|\+300|streak/i);
  });
  it('no prizes yet: says so; the streak badge only shows from day 2', () => {
    render(<RewardsPage L={L} Lf={Lf} lang="en" data={rewards({ streak: 1 })} onBack={() => undefined} onClaim={() => undefined} onCode={() => undefined} onHistory={() => undefined} onRanking={() => undefined} onMath={() => undefined} />);
    expect(document.querySelector('#kxNoPrizes')).toBeTruthy();
    expect(document.querySelector('#kxStreak')).toBeNull();
  });
});

describe('Claim a prize', () => {
  it('TrueMoney only: a 75% config shows "75% of the prize value"; no Grab, no ShopeePay', () => {
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize({ amount: 1500, rank: 1 })} onBack={() => undefined} onDone={() => undefined} toast={() => undefined} />);
    const tm = document.querySelector('[data-brand="truemoney"]')!;
    expect(tm.textContent).toContain('฿1,125');
    expect(tm.textContent).toContain('75% of the prize value');
    expect(document.querySelector('[data-brand="grab"]')).toBeNull();
    expect(document.querySelector('[data-brand="shopeepay"]')).toBeNull();
    expect(screen.getByLabelText('Claim with TrueMoney · ฿1,125')).toBeTruthy();
    expect(document.querySelector('#kxClaim')!.textContent).not.toMatch(/Rings/);
  });
  it('one tap claims that prize on the chosen app', async () => {
    kxMock.kxClaimPrize.mockResolvedValue({ status: 'assigned', claim_id: 'c1', brand: 'truemoney', amount: 500, value: 375, code: 'TEST-123', activation_url: null });
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize()} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(screen.getByLabelText('Claim with TrueMoney · ฿375'));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(kxMock.kxClaimPrize).toHaveBeenCalledWith('pz1', 'truemoney');
  });
  it('one person, one account: the server refusal is shown', async () => {
    kxMock.kxClaimPrize.mockRejectedValue(new Error('KR8_ONE_ACCOUNT'));
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize()} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(screen.getByLabelText('Claim with TrueMoney · ฿375'));
    expect((await screen.findByRole('alert')).textContent).toContain('One person, one account');
    expect(onDone).not.toHaveBeenCalled();
  });
  it('no code of that amount in stock: the claim is HELD, "Your code is on the way"', async () => {
    kxMock.kxClaimPrize.mockResolvedValue({ status: 'pending', claim_id: 'p1', brand: 'truemoney', amount: 500, value: 375 });
    const onDone = vi.fn();
    render(<ClaimPage L={L} Lf={Lf} lang="en" data={rewards()} prize={prize()} onBack={() => undefined} onDone={onDone} toast={() => undefined} />);
    fireEvent.click(screen.getByLabelText('Claim with TrueMoney · ฿375'));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' })));
    cleanup();
    const held = rewards({ claims: [claim({ id: 'p1', status: 'pending', value: 500, code: null, assigned_at: null })] });
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={held} focus="p1" toast={() => undefined} onClose={() => undefined} onChanged={() => undefined} />);
    expect(screen.getAllByText(/Your code is on the way/).length).toBeGreaterThan(0);
    expect(screen.getByText('Your prize is safe. We’ll let you know here the moment your code is ready.')).toBeTruthy();
    expect(document.querySelector('#kxTicket')).toBeNull();
    expect(document.querySelector('[data-status="pending"]')).toBeTruthy();
  });
  it('claimed: gold ticket with the code, NEW tag, Mark as used flips it to USED', async () => {
    kxMock.kxMarkUsed.mockResolvedValue(true);
    render(<ClaimedPage L={L} Lf={Lf} lang="en" data={rewards({ claims: [claim()] })} focus="c1" fresh toast={() => undefined} onClose={() => undefined} onChanged={() => undefined} />);
    expect(screen.getByText('Claimed!')).toBeTruthy();
    expect(document.querySelector('#kxCode')!.textContent).toBe('TEST-GRAB-0001');
    expect(document.querySelector('#kxTicket .amt')!.textContent).toBe('฿500');
    expect(screen.getByText('Open Grab')).toBeTruthy();
    expect(screen.getByText('NEW')).toBeTruthy();
    fireEvent.click(document.querySelector('[data-mark="c1"]')!);
    await waitFor(() => expect(screen.getByText('USED')).toBeTruthy());
    expect(kxMock.kxMarkUsed).toHaveBeenCalledWith('c1', true);
  });
  it('week close result: winner sees the prize and one-tap Claim; #9 sees how close it was', () => {
    const onClaim = vi.fn();
    render(<ResultPage L={L} Lf={Lf} lang="en" r={{ week: '2026-11-09', rank: 4, rings: 198, reel: 'p1', prize: { id: 'pz1', amount: 500, status: 'won' }, line_need: null, line_prize: 100 }}
      photo={null} name="Mint" level={1} no={30} onClaim={onClaim} onShare={() => undefined} onPost={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText('You finished #4')).toBeTruthy();
    expect(document.querySelector('#kxResultAmt')!.textContent).toBe('฿500');
    fireEvent.click(screen.getByText('Claim ฿500'));
    expect(onClaim).toHaveBeenCalledWith('pz1');
    expect(screen.getByText('New week has started · everyone is back at 0')).toBeTruthy();
    cleanup();
    render(<ResultPage L={L} Lf={Lf} lang="en" r={{ week: '2026-11-09', rank: 9, rings: 107, reel: 'p1', prize: null, line_need: 12, line_prize: 100 }}
      photo={null} name="Mint" level={1} no={30} onClaim={onClaim} onShare={() => undefined} onPost={() => undefined} onClose={() => undefined} />);
    expect(screen.getByText('12 Rings from ฿100')).toBeTruthy();
    expect(document.querySelector('#kxResultClaim')).toBeNull();
  });
});

describe('Founding Local checklist on Me', () => {
  const kx = { member_no: 30, ig_handle: null, tiktok_handle: null, lifetime: 0, level: 1, week: 0, founding_no: null, founding_left: 36, founding_thb: 100, has_reel: false };
  it('one "Next step" card: true spots-left number, only the next step shown, ฿100 on the Reel step, gone when done (15 Nov polish)', () => {
    render(<FoundingChecklist L={L} Lf={Lf} kx={kx} hasSocial={false} onLink={() => undefined} onPost={() => undefined} />);
    expect(screen.getByText('Founding Local · ฿100')).toBeTruthy();
    expect(screen.getByText('36 of 50 spots left')).toBeTruthy();
    expect(document.querySelectorAll('#kxFounding .st').length).toBe(1);
    expect(document.querySelector('#kxFoundingAdd')).toBeTruthy();
    // audit P3-13: Instagram is optional; the next step is always the Reel (the server pays for the first approved Reel)
    expect(document.querySelector('#kxFoundingPost')!.textContent).toContain('฿100');
    expect(document.querySelector('#kxFoundingAdd')!.textContent).toContain('Optional');
    cleanup();
    render(<FoundingChecklist L={L} Lf={Lf} kx={kx} hasSocial onLink={() => undefined} onPost={() => undefined} />);
    expect(document.querySelector('#kxFoundingPost')!.textContent).toContain('฿100');
    cleanup();
    const { container } = render(<FoundingChecklist L={L} Lf={Lf} kx={{ ...kx, has_reel: true }} hasSocial onLink={() => undefined} onPost={() => undefined} />);
    expect(container.innerHTML).toBe('');
  });
  it('gone once the member is a Founding Local; "3 steps to the board" when the spots are taken', () => {
    const { container } = render(<FoundingChecklist L={L} Lf={Lf} kx={{ ...kx, founding_no: 14 }} hasSocial onLink={() => undefined} onPost={() => undefined} />);
    expect(container.innerHTML).toBe('');
    cleanup();
    render(<FoundingChecklist L={L} Lf={Lf} kx={{ ...kx, founding_left: 0 }} hasSocial={false} onLink={() => undefined} onPost={() => undefined} />);
    expect(screen.getByText('3 steps to the board')).toBeTruthy();
    expect(document.querySelector('#kxFounding')!.textContent).not.toContain('฿');
  });
});

describe('places: 2 at most', () => {
  it('third pick is refused, tapping a picked one removes it', () => {
    const a = { id: 'a' }, b = { id: 'b' }, c = { id: 'c' };
    let r = togglePick([], a); r = togglePick(r.list, b);
    expect(r.list.map((x) => x.id)).toEqual(['a', 'b']);
    const full = togglePick(r.list, c);
    expect(full.full).toBe(true);
    expect(full.list.map((x) => x.id)).toEqual(['a', 'b']);
    expect(togglePick(r.list, a).list.map((x) => x.id)).toEqual(['b']);
  });
});

// ───────── words that must never appear in any new UI string (TH or EN) ─────────
const BANNED_EN = ['rate', 'host', 'guide', 'tour', 'creator', 'gift', 'wallet', 'credit', 'coins', 'launch', 'lucky', 'draw', 'chance', 'reviews', 'stars',
  'hidden gem', 'alcohol', 'temples', 'temple', 'meet', 'dating', 'go together', 'find people to go with', 'beer', 'cocktail'];
const BANNED_TH = ['ไกด์', 'โฮสต์', 'ทัวร์', 'ครีเอเตอร์', 'ของขวัญ', 'กระเป๋าเงิน', 'วอลเล็ท', 'วอลเลท', 'เครดิต', 'เหรียญ', 'เปิดตัว', 'โชค', 'ลุ้น', 'จับฉลาก', 'โอกาส',
  'รีวิว', 'ดาว', 'แอลกอฮอล์', 'เหล้า', 'เบียร์', 'วัด', 'เดท', 'เจอ', 'พบ', 'ไปด้วยกัน', 'หาคนไปด้วย', 'นัด'];
const SRC = ['V5KxCard.tsx', 'V5KxRewards.tsx', 'V5KxRanking.tsx', 'V5KxPlaces.tsx', 'V5Me.tsx', 'KringAppV8.tsx'].map((f) => fs.readFileSync(path.join(__dirname, f), 'utf8'));
/** Strings of the four new-screen files (the two big older files are only scanned for the keys this branch added, via KX_L). */
const newKeys = () => { const keys = new Set<string>(); for (const s of SRC.slice(0, 4)) for (const m of s.matchAll(/\bLf?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) keys.add(m[2].replace(/\\'/g, "'")); keys.add(HOW_RINGS); return [...keys]; };
const wordHit = (text: string, w: string) => new RegExp(`(^|[^a-z])${w.replace(/ /g, '\\s+')}`, 'i').test(text);

describe('banned words', () => {
  it('no banned word in any new string (EN keys, TH values, area names, literal UI text)', () => {
    const en = [...newKeys(), ...Object.keys(KX_L.th), ...Object.keys(KX_AREA_TH)];
    const th = [...Object.values(KX_L.th), ...Object.values(KX_AREA_TH)];
    for (const t of en) for (const w of BANNED_EN) expect(wordHit(t, w), `"${w}" in "${t}"`).toBe(false);
    for (const t of th) {
      for (const w of BANNED_TH) expect(t.includes(w), `"${w}" in "${t}"`).toBe(false);
      for (const w of BANNED_EN) expect(wordHit(t, w), `"${w}" in "${t}"`).toBe(false);
    }
  });
  it('the scan really catches a banned word', () => {
    expect(wordHit('Grab credit', 'credit')).toBe(true);
    expect(wordHit('Go together', 'go together')).toBe(true);
    expect(wordHit('Separate', 'rate')).toBe(false);
  });
  it('rewards are named by brand + amount ("Grab ฿100"), never "Grab credit"', () => {
    for (const s of SRC.slice(0, 4)) expect(/credit/i.test(s.replace(/photo_credit/g, '').replace(/\/\/.*|\/\*[\s\S]*?\*\//g, ''))).toBe(false);
  });
  it('every new UI string has Thai', () => {
    const shared = new Set(['Back', 'Close', 'Done', 'Share', 'You', 'Rewards', 'Today', 'My area', 'Open in Maps', 'Link copied', 'First name', 'Saving…', 'Your Kring card',
      'More about you (optional) ›', 'Languages you speak', 'One line about you', 'Your area', 'e.g. Coffee walks, street food, sunset spots', 'I confirm I am 18 or older',
      'Add your first name.', 'Pick at least one language.', 'Please confirm you are 18 or older.', 'Card saved · กริ๊ง!', 'Something went wrong. Try again.',
      'Couldn’t reach Kring. Check your connection and try again.', 'Please agree to the Terms to continue.']);
    const missing = newKeys().filter((k) => !KX_L.th[k] && !(shared.has(k) && V5_L.th[k]));
    for (const k of ['Founding Local', '3 steps to the board', '{0} of {1} spots left', 'Add Instagram or TikTok', 'Post your first Reel at a place', 'Saved Reels', '{0} seats open', '{0} to {1}', 'A clip you already have works']) expect(KX_L.th[k], k).toBeTruthy();
    expect(missing).toEqual([]);
    expect(LT('Claim {0}')).toBe('กดรับ {0}');
  });
});

describe('admin: paste reward codes', () => {
  it('one per line (or comma), trimmed, deduped, junk dropped', async () => {
    const { parseCodes } = await import('../venue/adminApp');
    expect(parseCodes(' KRG7-Q4MX \nKRG7-Q4MX\n\nAB\nTMN-88K2, SPAY-1234 ;  ')).toEqual(['KRG7-Q4MX', 'TMN-88K2', 'SPAY-1234']);
  });
});
