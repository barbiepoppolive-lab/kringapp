import { describe, expect, it } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Top10Sheet } from './V5Me';
import { PERKS, PerksCard, PerksStrip } from './V5Perks';
import { ReelNudgeSheet } from './V5ReelNudge';
import { DAILY_TOTAL, fmtBaht, REWARDS, rewardFor, SCORE, WEEK_ALL_IN, WEEKLY_TOTAL } from './rewardsConfig';
import type { V5TopRow } from './v5Live';

const L = (s: string) => s;
const Lf = (s: string, ...a: string[]) => a.reduce((x, v, i) => x.replace(`{${i}}`, v), s);
const rows: V5TopRow[] = ['Mint', 'Ploy', 'Aom', 'Marcus', 'Yui'].map((n, i) => ({
  rank: i + 1, reel_id: 'r' + i, user_id: 'u' + i, first_name: n, photo: null, area: 'Ari', body: 'Bang Pu', venue_name: null,
  poster_path: '', points: 200 - i * 20, prize: null, is_me: false,
}));

describe('rewards config (founder decision 13 Nov)', () => {
  it('has the exact weekly and daily amounts', () => {
    expect(REWARDS.week).toEqual([1000, 800, 600, 400, 200]);
    expect(REWARDS.today).toEqual([40, 30, 25, 20, 15]);
    expect(WEEKLY_TOTAL).toBe(3000);
    expect(DAILY_TOTAL).toBe(130);
    expect(WEEK_ALL_IN).toBe(3910);
  });
  it('keeps "up to ฿4,000 every week" true', () => {
    expect(WEEK_ALL_IN).toBeLessThanOrEqual(REWARDS.weeklyCap);
    expect(REWARDS.weeklyCap).toBe(4000);
  });
  it('uses the board formula weights', () => {
    expect(SCORE).toEqual({ like: 1, save: 2, share: 3, viewsPerPoint: 10 });
  });
  it('gives no reward outside the Top 5 or on the area board', () => {
    expect(rewardFor('week', 6)).toBeNull();
    expect(rewardFor('today', 0)).toBeNull();
    expect(rewardFor('area', 1)).toBeNull();
  });
});

async function openSheet() {
  render(<Top10Sheet L={L} Lf={Lf as never} load={async () => rows} myArea="Ari" onClose={() => {}} onPerson={() => {}} />);
  await act(async () => { await Promise.resolve(); });
}
const shown = (sel: string) => Array.from(document.querySelectorAll(sel)).map((e) => e.textContent);

describe('Top 5 sheet shows the configured amount next to each rank', () => {
  it('Today = daily amounts, on the ladder, podium and rows 4–5', async () => {
    await openSheet();
    expect(shown('#top10Ladder .lr b')).toEqual(REWARDS.today.map(fmtBaht));
    for (const r of rows) {
      const el = document.querySelector(`[data-rank="${r.rank}"].pd, .li[data-rank="${r.rank}"]`) as HTMLElement;
      expect(el.querySelector('.am')?.textContent).toBe(fmtBaht(REWARDS.today[r.rank - 1]));
    }
    expect(screen.getByText(`${fmtBaht(130)} a day · closes at midnight`)).toBeTruthy();
  });
  it('This week = weekly amounts', async () => {
    await openSheet();
    await act(async () => { fireEvent.click(document.getElementById('top10-week')!); await Promise.resolve(); });
    expect(shown('#top10Ladder .lr b')).toEqual(REWARDS.week.map(fmtBaht));
    for (const r of rows) {
      const el = document.querySelector(`[data-rank="${r.rank}"].pd, .li[data-rank="${r.rank}"]`) as HTMLElement;
      expect(el.querySelector('.am')?.textContent).toBe(fmtBaht(REWARDS.week[r.rank - 1]));
    }
    expect(screen.getByText(`${fmtBaht(3000)} a week · closes Sunday 23:59`)).toBeTruthy();
  });
  it('My area shows no amounts', async () => {
    await openSheet();
    await act(async () => { fireEvent.click(document.getElementById('top10-area')!); await Promise.resolve(); });
    expect(document.getElementById('top10Ladder')).toBeNull();
    expect(document.querySelectorAll('.am').length).toBe(0);
  });
  it('links "Rules ›" to /rules/ and names the voucher method', async () => {
    await openSheet();
    const a = document.getElementById('top10Rules') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('/rules/');
    expect(a.textContent).toBe('Rules ›');
    expect(document.getElementById('top10Voucher')?.textContent).toContain('TrueMoney / Starbucks / Grab');
  });
});

describe('Why post on Kring perks', () => {
  const BANNED = /\b(rate|host|guide|tour|creator|gift|wallet|credit|coins?|launch|lucky|draw|reviews?|stars?|hidden gem|alcohol|temples?|meet|dating)\b/i;
  it('has the 6 founder perks, Thai first + English, no banned words', () => {
    expect(PERKS.map((p) => p[0])).toEqual(['seen', 'grow', 'badge', 'featured', 'price', 'earn']);
    for (const p of PERKS) for (const t of p.slice(1)) expect(t).not.toMatch(BANNED);
    expect(PERKS[5][4]).toContain('฿30');
    expect(PERKS[5][4]).toContain('฿50');
  });
  it('renders the Me card and the nudge strip', () => {
    render(<><PerksCard /><PerksStrip /></>);
    expect(document.querySelectorAll('#mePerks [data-perk]').length).toBe(6);
    expect(document.querySelectorAll('#rnPerks [data-perk]').length).toBe(6);
  });
  it('first-Reel nudge includes the compact strip', () => {
    render(<ReelNudgeSheet poster="/p.jpg" onPost={() => {}} onLater={() => {}} />);
    expect(document.querySelector('#sh-reelnudge #rnPerks')).toBeTruthy();
  });
});
