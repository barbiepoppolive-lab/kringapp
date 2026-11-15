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
 * Rings (LOCKED rules, founder 15 Nov 2026). Rings = a public weekly score, never money.
 * These are the DEFAULTS the app shows until the server answers; the server table kr8_rings_config (migration 0047) is what counts,
 * and the app reads it (kr8_rings_rules / kr8_my_rewards.rules), so numbers change without a code edit.
 * Change a number: update kr8_rings_config.value (and this default, to keep the first paint right).
 */
export const RINGS = {
  like: 1,
  save: 3,
  open: 5,
  traveller_mult: 2,
  opens_day_cap: 30,
  best_reels: 2,
  board_size: 10,
  prize_1: 1500,
  prize_2: 900,
  prize_3: 600,
  prize_4: 500,
  prize_5: 400,
  prize_6: 250,
  prize_7: 150,
  prize_8: 100,
  prize_9: 0,
  prize_10: 0,
  /** FOUNDER DECISION: a prize rank only pays when its holder has at least this many Rings. */
  min_rings_for_paid_seat: 25,
  /** FOUNDER DECISION: prizes only pay in weeks with at least this many members on the board (0 = always). */
  min_posters_for_payout: 0,
  shopeepay_on: 0,
  /** Share of a prize that lands when it is taken as TrueMoney (75 = cash-card stock that loses 25% on top-up; 100 = full value). */
  truemoney_payout_pct: 75,
  founding_on: 1,
  founding_slots: 50,
  founding_thb: 100,
} as const;
export type RingsRules = { -readonly [K in keyof typeof RINGS]: number };
/** Server rules over the defaults (unknown keys ignored, missing keys keep the default). */
export function ringsRules(server?: Record<string, number> | null): RingsRules {
  const out = { ...RINGS } as RingsRules;
  for (const k of Object.keys(RINGS) as (keyof RingsRules)[]) if (server && typeof server[k] === 'number') out[k] = server[k];
  return out;
}
