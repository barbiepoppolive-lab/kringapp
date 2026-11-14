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

/**
 * Rings (feat/card-rewards-rank-places, founder 14 Nov 15:33). Every earn value and cap in one place.
 * These are the DEFAULTS the app shows until the server answers; the server table kr8_rings_config (migration 0046)
 * is what actually pays, and the app reads it (kr8_rings_rules / kr8_my_rewards.rules), so numbers change without a code edit.
 * Change a number: update kr8_rings_config.value (and this default, to keep the first paint right).
 */
export const RINGS = {
  rings_per_baht: 10,
  checkin: 5,
  streak_days: 7,
  streak_bonus: 50,
  react_goal: 3,
  react: 10,
  reel_place: 100,
  reel_place_week_cap: 3,
  likes_50: 0,
  friend: 300,
  friend_welcome: 100,
  weekly_1: 5000,
  weekly_2: 3000,
  weekly_3: 2000,
  weekly_4_10: 500,
  claims_per_day: 3,
} as const;
export type RingsRules = { -readonly [K in keyof typeof RINGS]: number };
/** Server rules over the defaults (unknown keys ignored, missing keys keep the default). */
export function ringsRules(server?: Record<string, number> | null): RingsRules {
  const out = { ...RINGS } as RingsRules;
  for (const k of Object.keys(RINGS) as (keyof RingsRules)[]) if (server && typeof server[k] === 'number') out[k] = server[k];
  return out;
}
