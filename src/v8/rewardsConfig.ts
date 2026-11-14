/**
 * Top 5 rewards (founder decision, 13 Nov). One source for every amount the app shows.
 * Weekly ฿3,000 + daily ฿130 × 7 = ฿3,910 a week, so "up to ฿4,000 in rewards every week" stays true.
 * Paid as TrueMoney / Starbucks / Grab vouchers (Tremendous). Ranked on merit only.
 */
export const REWARDS = {
  week: [1000, 800, 600, 400, 200],
  today: [40, 30, 25, 20, 15],
  /** The public headline cap. */
  weeklyCap: 4000,
} as const;

/** Score weights, same formula as the board: likes + 2 × saves + 3 × shares + views ÷ 10 (own likes never count). */
export const SCORE = { like: 1, save: 2, share: 3, viewsPerPoint: 10 } as const;

export const sumBaht = (a: readonly number[]) => a.reduce((s, n) => s + n, 0);
export const WEEKLY_TOTAL = sumBaht(REWARDS.week);              // 3000
export const DAILY_TOTAL = sumBaht(REWARDS.today);              // 130
export const WEEK_ALL_IN = WEEKLY_TOTAL + 7 * DAILY_TOTAL;      // 3910

export const fmtBaht = (n: number) => `฿${n.toLocaleString('en-US')}`;

/** Reward for a rank on a board ('area' boards carry no reward). null outside the Top 5. */
export function rewardFor(period: 'today' | 'week' | 'area', rank: number): number | null {
  if (period === 'area') return null;
  const t = period === 'week' ? REWARDS.week : REWARDS.today;
  return rank >= 1 && rank <= t.length ? t[rank - 1] : null;
}
