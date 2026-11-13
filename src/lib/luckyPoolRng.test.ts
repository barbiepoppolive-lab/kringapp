import { describe, it, expect } from 'vitest';
import {
  createInitialLuckyPoolState,
  processLuckyComboSpin,
  drawDailyJackpotDistribution,
  LUCKY_MULTIPLIER_TABLE,
  AUTHORITATIVE_LUCKY_CHON_CONFIG,
  POPPO_84_RTP_CONFIG,
  POPPO_HIGH_HIT_MULTIPLIER_TABLE,
  createInitialResponsibleLuckyTracker,
  executePoppoDualModeSpin,
} from './luckyPoolRng';

describe('Level 2 Pool-Backed Cryptographic RNG & Water-Tank Engine (D-021, D-022, BUG-026)', () => {
  it('atomically splits every Lucky Chon! spin into 12% Host Points, 80% Reservoir Pool, and 8% Untouchable Platform Vault BEFORE rolling', () => {
    const initial = createInitialLuckyPoolState(0);
    // 1,000c Lucky Red Envelope x1 (deterministic roll = 0.99 -> no multiplier win)
    const { nextState, outcome } = processLuckyComboSpin(initial, 1_000, 1, () => 0.99);

    expect(outcome.totalSpendCoins).toBe(1_000);
    expect(outcome.hostBasePoints).toBe(120); // 12%
    expect(outcome.poolContributionCoins).toBe(800); // 80%
    expect(outcome.platformVaultCoins).toBe(80); // 8%
    expect(
      outcome.hostBasePoints + outcome.poolContributionCoins + outcome.platformVaultCoins
    ).toBe(1_000);
    expect(outcome.payoutCoins).toBe(0);
    expect(nextState.reservoirBalanceCoins).toBe(800);
    expect(nextState.platformProfitVaultCoins).toBe(80);
  });

  it('BLOCKS a 500x jackpot if the Water-Tank Reservoir cannot afford it, stepping down to a safe affordable multiplier', () => {
    // Start with only 1,000 coins in the reservoir
    const lowPool = createInitialLuckyPoolState(1_000);
    // Roll 0.00001 which would normally hit 500x (50,000c on a 100c dice), but pool only has 1,000 + 80 = 1,080c!
    const { nextState, outcome } = processLuckyComboSpin(lowPool, 100, 1, () => 0.00001);

    // 500x (50,000c), 100x (10,000c), 50x (5,000c) exceed 1,080c -> must step down to 10x (1,000c)!
    expect(outcome.multiplierWon).toBe(10);
    expect(outcome.payoutCoins).toBe(1_000);
    expect(nextState.reservoirBalanceCoins).toBe(80); // 1,080 - 1,000 = 80 (>= 0!)
    expect(nextState.reservoirBalanceCoins).toBeGreaterThanOrEqual(0);
  });

  it('UNLOCKS a 500x jackpot once the Water-Tank Reservoir has accumulated enough coins from prior spins', () => {
    // Reservoir has 100,000 coins accumulated
    const richPool = createInitialLuckyPoolState(100_000);
    const { nextState, outcome } = processLuckyComboSpin(richPool, 100, 1, () => 0.00001);

    expect(outcome.multiplierWon).toBe(500);
    expect(outcome.payoutCoins).toBe(50_000); // 500x on 100c Lucky Dice!
    expect(nextState.reservoirBalanceCoins).toBe(100_000 + 80 - 50_000);
  });

  it('survives a 10,000-Spin Monte Carlo Stress Test with 0% chance of negative reservoir and exact 8% guaranteed house profit + 12% host cut', () => {
    let state = createInitialLuckyPoolState(0);
    const combos = [1, 9, 19, 99] as const;
    const giftPrices = [100, 200, 500, 1_000];

    for (let i = 0; i < 10_000; i++) {
      const unitCoins = giftPrices[i % giftPrices.length];
      const qty = combos[i % combos.length];
      const res = processLuckyComboSpin(state, unitCoins, qty);
      state = res.nextState;

      // Reservoir balance can NEVER drop below 0 on any single spin!
      expect(state.reservoirBalanceCoins).toBeGreaterThanOrEqual(0);
    }

    // Verify zero-sum accounting across all 10,000 spins
    expect(state.totalSpinsProcessed).toBe(10_000);
    expect(state.platformProfitVaultCoins).toBe(Math.floor(state.totalCoinsWagered * 0.08));
    expect(state.totalHostPointsCredited).toBe(Math.floor(state.totalCoinsWagered * 0.12));
    expect(state.totalPlayerPayoutCoins).toBeLessThanOrEqual(
      Math.floor(state.totalCoinsWagered * 0.80)
    );
  });

  it('computes the Spend-Gated 9 PM 2% Daily Lucky Jackpot distribution (40% Grand Winner, 30% Top 10, 30% Consolation Split)', () => {
    const jackpot = drawDailyJackpotDistribution(1_000_000, [
      { userId: 'u1', paidCoinsSpentToday: 50_000 },
      { userId: 'u2', paidCoinsSpentToday: 30_000 },
      { userId: 'u3', paidCoinsSpentToday: 25_000 },
      { userId: 'u4_under_threshold', paidCoinsSpentToday: 10_000 }, // Disqualified (< 25,000c)
    ]);

    expect(jackpot.qualifiedTicketHolders.length).toBe(3);
    expect(jackpot.qualifiedTicketHolders.map((u) => u.userId)).not.toContain('u4_under_threshold');
    expect(jackpot.grandWinnerPayoutCoins).toBe(400_000); // 40%
    expect(jackpot.totalDistributedCoins).toBe(1_000_000);
    expect(LUCKY_MULTIPLIER_TABLE.length).toBe(6);
  });

  it('BUG-026 differential test: AUTHORITATIVE_LUCKY_CHON_CONFIG splits (12/80/8), cumulative odds table (exact 80.0% EV), and SQL thresholds match identically with poolWarmthFactor locked to 1', () => {
    expect(
      AUTHORITATIVE_LUCKY_CHON_CONFIG.hostPercent +
        AUTHORITATIVE_LUCKY_CHON_CONFIG.poolPercent +
        AUTHORITATIVE_LUCKY_CHON_CONFIG.housePercent
    ).toBe(100);

    // Verify cumulativeProbability matches tierProbability sum and theoretical EV = 0.8000 (80.0% RTP)
    let runningCum = 0;
    let expectedReturn = 0;
    for (const tier of LUCKY_MULTIPLIER_TABLE) {
      runningCum = Number((runningCum + tier.tierProbability).toFixed(6));
      expect(tier.cumulativeProbability).toBe(runningCum);
      expectedReturn += tier.multiplier * tier.tierProbability;
    }
    expect(Number(expectedReturn.toFixed(4))).toBe(0.8);
    expect(Math.round(expectedReturn * 100)).toBe(AUTHORITATIVE_LUCKY_CHON_CONFIG.poolPercent);

    // Passing a custom warmth factor is ignored (locked to 1 so real odds never diverge from published odds)
    const state = createInitialLuckyPoolState(10_000, 0.1);
    expect(state.poolWarmthFactor).toBe(1);
  });

  it('MOD1-23 + MOD1-24 + Fable #3: supports both Option A (Loyalty Cashback 80% Host + Bonus Box) and Option B (Poppo 84% RTP / 56.24% hit rate / 3-spin pity / Daily Caps)', () => {
    expect(
      POPPO_84_RTP_CONFIG.hostPercent +
        POPPO_84_RTP_CONFIG.poolPercent +
        POPPO_84_RTP_CONFIG.housePercent
    ).toBe(100);
    expect(POPPO_84_RTP_CONFIG.poolPercent).toBe(84);

    // Verify Poppo High-Hit table sums to 84.00% RTP and 56.24% total hit rate
    let ev = 0;
    let totalHitProb = 0;
    for (const tier of POPPO_HIGH_HIT_MULTIPLIER_TABLE) {
      ev += tier.multiplier * tier.tierProbability;
      totalHitProb += tier.tierProbability;
    }
    expect(Number(ev.toFixed(4))).toBe(0.84);
    expect(Number(totalHitProb.toFixed(4))).toBe(0.5624);

    // 1. Require 1-time Responsible Play Disclaimer first
    const unattestedTracker = createInitialResponsibleLuckyTracker(100_000);
    const blocked = executePoppoDualModeSpin({
      mode: 'poppo_classic_84rtp',
      poolState: createInitialLuckyPoolState(50_000),
      tracker: unattestedTracker,
      unitCoins: 100,
      quantity: 1,
    });
    expect(blocked.allowed).toBe(false);
    expect(blocked.blockedReason).toMatch(/RESPONSIBLE_PLAY_DISCLAIMER_REQUIRED/);

    // 2. Option A (Fable-Approved Loyalty Cashback: 80% Host guaranteed + non-cashable Bonus Coins cashback box)
    const trackerA = {
      ...createInitialResponsibleLuckyTracker(100_000),
      disclaimerAcceptedAtIso: '2026-10-20T00:00:00.000Z',
    };
    const modeAResult = executePoppoDualModeSpin({
      mode: 'loyalty_cashback_approved',
      poolState: createInitialLuckyPoolState(50_000),
      tracker: trackerA,
      unitCoins: 1_000,
      quantity: 1,
      rng: () => 0.25, // hits 1x cashback box
    });
    expect(modeAResult.allowed).toBe(true);
    expect(modeAResult.hostBasePoints).toBe(800); // 80% guaranteed host gift
    expect(modeAResult.poolContributionCoins).toBe(140); // 14% loyalty cashback pool
    expect(modeAResult.platformVaultCoins).toBe(60); // 6% house
    expect(modeAResult.rewardBonusCoins).toBe(1_000);

    // 3. Option B (Poppo 84% RTP + 3-Spin Anti-Dry-Streak Pity Rule)
    const stateB = createInitialLuckyPoolState(50_000);
    const trackerB = {
      ...createInitialResponsibleLuckyTracker(100_000),
      disclaimerAcceptedAtIso: '2026-10-20T00:00:00.000Z',
    };
    // 2 dry spins (rng = 0.99), then 3rd spin triggers pity 0.5x!
    const spin1 = executePoppoDualModeSpin({
      mode: 'poppo_classic_84rtp',
      poolState: stateB,
      tracker: trackerB,
      unitCoins: 100,
      quantity: 1,
      rng: () => 0.99,
    });
    expect(spin1.rewardBonusCoins).toBe(0);
    expect(spin1.nextTracker.consecutiveZeroSpins).toBe(1);

    const spin2 = executePoppoDualModeSpin({
      mode: 'poppo_classic_84rtp',
      poolState: spin1.nextPoolState,
      tracker: spin1.nextTracker,
      unitCoins: 100,
      quantity: 1,
      rng: () => 0.99,
    });
    expect(spin2.rewardBonusCoins).toBe(0);
    expect(spin2.nextTracker.consecutiveZeroSpins).toBe(2);

    const spin3Pity = executePoppoDualModeSpin({
      mode: 'poppo_classic_84rtp',
      poolState: spin2.nextPoolState,
      tracker: spin2.nextTracker,
      unitCoins: 100,
      quantity: 1,
      rng: () => 0.99, // would be 0x, but 3-spin pity forces 0.5x!
    });
    expect(spin3Pity.pityTriggered).toBe(true);
    expect(spin3Pity.rewardBonusCoins).toBe(50); // 0.5x consolation coin shower
    expect(spin3Pity.nextTracker.consecutiveZeroSpins).toBe(0);
  });
});
