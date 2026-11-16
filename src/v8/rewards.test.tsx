import { describe, expect, it } from 'vitest';
import { act, render } from '@testing-library/react';
import { PERKS, PerksCard, PerksStrip } from './V5Perks';
import { ReelNudgeSheet, prizeLine } from './V5ReelNudge';
import { fmtBaht, RINGS, ringsRules, weeklyLadder, weeklySeats, weeklyTotal } from './rewardsConfig';

describe('weekly prize ladder (locked 15 Nov, audit P1-3 16 Nov)', () => {
  it('is Top 8, ฿1500/900/600/500/400/250/150/100 = ฿4,400, 25-Ring floor', () => {
    expect(weeklyLadder()).toEqual([1500, 900, 600, 500, 400, 250, 150, 100]);
    expect(weeklySeats()).toBe(8);
    expect(weeklyTotal()).toBe(4400);
    expect(fmtBaht(weeklyTotal())).toBe('฿4,400');
    expect(RINGS.min_rings_for_paid_seat).toBe(25);
  });
  it('follows the server rules, never a hard-coded Top 5', () => {
    const r = ringsRules({ prize_6: 0, min_rings_for_paid_seat: 30 });
    expect(weeklySeats(r)).toBe(5);
    expect(prizeLine(r).en).toBe('Every week the Top 5 share ฿3,900 · a prize seat needs 30 Rings');
    expect(prizeLine(ringsRules()).th).toContain('ท็อป 8 แบ่งกัน ฿4,400');
  });
});

describe('Why post on Kring perks', () => {
  const BANNED = /\b(rate|host|guide|tour|creator|gift|wallet|credit|coins?|launch|lucky|draw|reviews?|stars?|hidden gem|alcohol|temples?|meet|dating)\b/i;
  it('has 6 perks, Thai first + English, no banned words, no paid-referral promise', () => {
    expect(PERKS.map((p) => p[0])).toEqual(['seen', 'grow', 'badge', 'featured', 'price', 'prize']);
    for (const p of PERKS) for (const t of p.slice(1)) expect(t).not.toMatch(BANNED);
    const all = PERKS.flat().join(' ');
    expect(all).not.toMatch(/฿30|฿50|per friend|a friend|ชวนเพื่อน/);
    expect(PERKS[5][4]).toBe('Every week the Top 8 share ฿4,400');
  });
  it('renders the Me card and the nudge strip', () => {
    render(<><PerksCard /><PerksStrip /></>);
    expect(document.querySelectorAll('#mePerks [data-perk]').length).toBe(6);
    expect(document.querySelectorAll('#rnPerks [data-perk]').length).toBe(6);
  });
  it('first-Reel nudge includes the compact strip', async () => {
    render(<ReelNudgeSheet poster="/p.jpg" onPost={() => {}} onLater={() => {}} rules={{}} />);
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelector('#sh-reelnudge #rnPerks')).toBeTruthy();
  });
});
