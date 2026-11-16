/** Baht in the app's style: ฿4,400. */
export const fmtBaht = (n: number) => `฿${n.toLocaleString('en-US')}`;
export const sumBaht = (a: readonly number[]) => a.reduce((s, n) => s + n, 0);

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
  best_reels: 1,   // 15 Nov founder rule: only each member's best Reel counts (live kr8_rings_config.best_reels = 1)
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

/**
 * The weekly prize ladder, read from the rules (server kr8_rings_config over the defaults above): prize_1, prize_2 … while > 0.
 * The ONE place the app gets "Top 8 · ฿4,400" from (audit P1-3, 16 Nov: the old Top 5 / ฿4,000 copy and the daily prizes are gone).
 */
export function weeklyLadder(r: Partial<RingsRules> = RINGS): number[] {
  const out: number[] = [];
  for (let k = 1; k <= 20; k++) {
    const v = (r as Record<string, number | undefined>)[`prize_${k}`] ?? (RINGS as Record<string, number>)[`prize_${k}`];
    if (!(typeof v === 'number' && v > 0)) break;
    out.push(v);
  }
  return out;
}
export const weeklySeats = (r?: Partial<RingsRules>) => weeklyLadder(r).length;          // 8
export const weeklyTotal = (r?: Partial<RingsRules>) => sumBaht(weeklyLadder(r));        // 4400
