/**
 * Level 2 Money-Integrity Module: Pool-Backed Cryptographic RNG & Water-Tank Reservoir Engine
 * Implements Decisions D-009, D-021, D-022 and BUG-026 Unified Server Config.
 *
 * Mathematical Invariant:
 * 1. Every Lucky Chon! spin atomically deducts (matching SQL `config.lucky_chon` & `rpc_spin_lucky_gift_pool_backed`):
 *    - 12% -> Host Base Points (`hostBasePoints`)
 *    - 80% -> Live Lucky Return Reservoir (`poolContributionCoins`)
 *    -  8% -> Platform Untouchable Profit Vault (`platformVaultCoins`)
 * 2. A multiplier (`2x`, `5x`, `10x`, `50x`, `100x`, `500x`) can ONLY be awarded if
 *    `payoutCoins <= currentReservoirBalance`. If the reservoir does not hold enough coins
 *    for a rolled high multiplier, the engine automatically steps down to the highest
 *    multiplier that fits inside `currentReservoirBalance`.
 * 3. Published odds are 100% immutable (no hidden `poolWarmthFactor` scaling).
 */

export const AUTHORITATIVE_LUCKY_CHON_CONFIG = {
  hostPercent: 12,
  poolPercent: 80,
  housePercent: 8,
  maxSingleWinPoolCapPercent: 25,
  theoreticalRtpPercent: 80,
} as const;

export interface LuckyMultiplierTier {
  multiplier: 500 | 100 | 50 | 10 | 5 | 2;
  cumulativeProbability: number;
  tierProbability: number;
  label: string;
}

/**
 * Authoritative probability table tuned for exact 80.0% (0.8000) theoretical RTP:
 * - 500x: p = 0.0002 -> EV = 0.1000
 * - 100x: p = 0.0010 -> EV = 0.1000 (cum 0.0012)
 * -  50x: p = 0.0020 -> EV = 0.1000 (cum 0.0032)
 * -  10x: p = 0.0150 -> EV = 0.1500 (cum 0.0182)
 * -   5x: p = 0.0400 -> EV = 0.2000 (cum 0.0582)
 * -   2x: p = 0.0750 -> EV = 0.1500 (cum 0.1332)
 * Total EV = 0.8000 (80.0% RTP, matching 80% pool contribution).
 */
export const LUCKY_MULTIPLIER_TABLE: LuckyMultiplierTier[] = [
  { multiplier: 500, cumulativeProbability: 0.0002, tierProbability: 0.0002, label: '🐉 500x MEGA DRAGON JACKPOT!' },
  { multiplier: 100, cumulativeProbability: 0.0012, tierProbability: 0.0010, label: '👑 100x ROYAL SIAM JACKPOT!' },
  { multiplier: 50, cumulativeProbability: 0.0032, tierProbability: 0.0020, label: '💎 50x SUPER CLINK!' },
  { multiplier: 10, cumulativeProbability: 0.0182, tierProbability: 0.0150, label: '🧧 10x LUCKY COMBO!' },
  { multiplier: 5, cumulativeProbability: 0.0582, tierProbability: 0.0400, label: '🐘 5x GOLDEN HIT!' },
  { multiplier: 2, cumulativeProbability: 0.1332, tierProbability: 0.0750, label: '🍀 2x DOUBLE CLINK!' },
];

export interface LuckyPoolState {
  reservoirBalanceCoins: number;
  platformProfitVaultCoins: number;
  totalHostPointsCredited: number;
  totalCoinsWagered: number;
  totalPlayerPayoutCoins: number;
  totalSpinsProcessed: number;
  poolWarmthFactor: 1; // Locked to 1 (BUG-026: no hidden odds lever)
}

export interface LuckySpinOutcome {
  unitCoins: number;
  quantity: number;
  totalSpendCoins: number;
  hostBasePoints: number;
  poolContributionCoins: number;
  platformVaultCoins: number;
  multiplierWon: 0 | 2 | 5 | 10 | 50 | 100 | 500;
  payoutCoins: number;
  bannerLabel: string | null;
  wasSteppedDownByReservoirCap: boolean;
}

export function createInitialLuckyPoolState(
  seedReservoirCoins: number = 0,
  _ignoredWarmthFactor: number = 1.0
): LuckyPoolState {
  if (seedReservoirCoins < 0) {
    throw new Error('seedReservoirCoins cannot be negative');
  }
  return {
    reservoirBalanceCoins: Math.floor(seedReservoirCoins),
    platformProfitVaultCoins: 0,
    totalHostPointsCredited: 0,
    totalCoinsWagered: 0,
    totalPlayerPayoutCoins: 0,
    totalSpinsProcessed: 0,
    poolWarmthFactor: 1,
  };
}

/**
 * Generates a cryptographically secure uniform float in [0, 1) using Web Crypto API
 * (`crypto.getRandomValues`). Never falls back to `Math.random()` (Level 2 CSPRNG lock).
 */
export function cryptoRandomFloat(
  cryptoProvider: Pick<Crypto, 'getRandomValues'> | undefined = globalThis.crypto
): number {
  if (
    typeof cryptoProvider === 'undefined' ||
    typeof cryptoProvider.getRandomValues !== 'function'
  ) {
    throw new Error(
      'CSPRNG_REQUIRED_FOR_LUCKY_POOL: crypto.getRandomValues is unavailable'
    );
  }
  const array = new Uint32Array(1);
  cryptoProvider.getRandomValues(array);
  return array[0] / (0xffffffff + 1);
}

/**
 * Processes a Lucky Chon! spin (`x1`, `x9`, `x19`, `x99`, `x520`) with strict Water-Tank Reservoir safety.
 */
export function processLuckyComboSpin(
  state: LuckyPoolState,
  unitCoins: number,
  quantity: number = 1,
  rng: () => number = cryptoRandomFloat
): { nextState: LuckyPoolState; outcome: LuckySpinOutcome } {
  if (unitCoins <= 0 || !Number.isInteger(unitCoins)) {
    throw new Error('unitCoins must be a positive integer');
  }
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error('quantity must be a positive integer');
  }

  const totalSpendCoins = unitCoins * quantity;
  const hostBasePoints = Math.floor(
    totalSpendCoins * (AUTHORITATIVE_LUCKY_CHON_CONFIG.hostPercent / 100)
  ); // 12% Host Base Share
  const poolContributionCoins = Math.floor(
    totalSpendCoins * (AUTHORITATIVE_LUCKY_CHON_CONFIG.poolPercent / 100)
  ); // 80% Return Pool
  const platformVaultCoins = totalSpendCoins - hostBasePoints - poolContributionCoins; // 8% House Vault

  let availableReservoir = state.reservoirBalanceCoins + poolContributionCoins;

  let multiplierWon: 0 | 2 | 5 | 10 | 50 | 100 | 500 = 0;
  let payoutCoins = 0;
  let bannerLabel: string | null = null;
  let wasSteppedDownByReservoirCap = false;

  // Poppo v2 Multi-Roll: when quantity === 1, roll once against totalSpendCoins; when quantity > 1 (e.g. x10/x50/x99),
  // roll `quantity` independent micro-spins of `unitCoins` each against the reservoir so combo bursts hit frequent wins!
  for (let s = 0; s < quantity; s++) {
    const roll = rng();
    let targetTierIndex = -1;
    for (let i = 0; i < LUCKY_MULTIPLIER_TABLE.length; i++) {
      if (roll < LUCKY_MULTIPLIER_TABLE[i].cumulativeProbability) {
        targetTierIndex = i;
        break;
      }
    }

    if (targetTierIndex !== -1) {
      let spinMultiplier: 0 | 2 | 5 | 10 | 50 | 100 | 500 = 0;
      let spinPayout = 0;
      let spinLabel: string | null = null;
      for (let i = targetTierIndex; i < LUCKY_MULTIPLIER_TABLE.length; i++) {
        const candidate = LUCKY_MULTIPLIER_TABLE[i];
        const candidatePayout = unitCoins * candidate.multiplier;
        if (candidatePayout <= availableReservoir) {
          spinMultiplier = candidate.multiplier;
          spinPayout = candidatePayout;
          spinLabel = candidate.label;
          if (i > targetTierIndex) {
            wasSteppedDownByReservoirCap = true;
          }
          break;
        }
      }
      if (spinMultiplier === 0) {
        wasSteppedDownByReservoirCap = true;
      } else {
        availableReservoir -= spinPayout;
        payoutCoins += spinPayout;
        if (spinMultiplier > multiplierWon) {
          multiplierWon = spinMultiplier;
          bannerLabel = spinLabel;
        }
      }
    }
  }

  const nextReservoirBalance = availableReservoir;
  if (nextReservoirBalance < 0) {
    throw new Error('Invariant violation: Reservoir balance cannot be negative');
  }

  const nextState: LuckyPoolState = {
    reservoirBalanceCoins: nextReservoirBalance,
    platformProfitVaultCoins: state.platformProfitVaultCoins + platformVaultCoins,
    totalHostPointsCredited: state.totalHostPointsCredited + hostBasePoints,
    totalCoinsWagered: state.totalCoinsWagered + totalSpendCoins,
    totalPlayerPayoutCoins: state.totalPlayerPayoutCoins + payoutCoins,
    totalSpinsProcessed: state.totalSpinsProcessed + 1,
    poolWarmthFactor: state.poolWarmthFactor,
  };

  return {
    nextState,
    outcome: {
      unitCoins,
      quantity,
      totalSpendCoins,
      hostBasePoints,
      poolContributionCoins,
      platformVaultCoins,
      multiplierWon,
      payoutCoins,
      bannerLabel,
      wasSteppedDownByReservoirCap,
    },
  };
}

export interface DailySpendCandidate {
  userId: string;
  paidCoinsSpentToday: number;
}

export interface DailyJackpotDistribution {
  poolTotalCoins: number;
  qualifiedTicketHolders: DailySpendCandidate[];
  grandWinnerUserId: string | null;
  grandWinnerPayoutCoins: number;
  runnerUpPoolCoins: number;
  consolationPoolCoins: number;
  totalDistributedCoins: number;
}

/**
 * Enforces D-022: Spend-Gated 9 PM BKK 2% Daily Lucky Jackpot Pool.
 * Only users who spent >= `minPaidCoins` (default 25,000 Paid Coins = 100 THB) today qualify.
 * - 40% to 1 Grand Lucky Winner
 * - 30% to Top Runner-Up Drops
 * - 30% split across all remaining qualified ticket holders (so every qualified spender wins!)
 */
export function drawDailyJackpotDistribution(
  poolTotalCoins: number,
  candidates: DailySpendCandidate[],
  minPaidCoins: number = 25_000,
  rng: () => number = cryptoRandomFloat
): DailyJackpotDistribution {
  const qualified = candidates.filter((c) => c.paidCoinsSpentToday >= minPaidCoins);

  if (qualified.length === 0 || poolTotalCoins <= 0) {
    return {
      poolTotalCoins,
      qualifiedTicketHolders: [],
      grandWinnerUserId: null,
      grandWinnerPayoutCoins: 0,
      runnerUpPoolCoins: 0,
      consolationPoolCoins: 0,
      totalDistributedCoins: 0,
    };
  }

  const grandIndex = Math.min(qualified.length - 1, Math.floor(rng() * qualified.length));
  const grandWinner = qualified[grandIndex];

  const grandWinnerPayoutCoins = Math.floor(poolTotalCoins * 0.4);
  const runnerUpPoolCoins = Math.floor(poolTotalCoins * 0.3);
  const consolationPoolCoins = poolTotalCoins - grandWinnerPayoutCoins - runnerUpPoolCoins;

  return {
    poolTotalCoins,
    qualifiedTicketHolders: qualified,
    grandWinnerUserId: grandWinner.userId,
    grandWinnerPayoutCoins,
    runnerUpPoolCoins,
    consolationPoolCoins,
    totalDistributedCoins: grandWinnerPayoutCoins + runnerUpPoolCoins + consolationPoolCoins,
  };
}

/**
 * ============================================================================
 * MOD1-23, MOD1-24 & Fable Decision #3: Dual-Mode Lucky Gift Engine
 * - Mode 1 (`loyalty_cashback_approved` — Default for App Store / PSP / Thai Law):
 *   100% Guaranteed Fixed Gift to Host (80% Host Points — zero risk of losing the gift!)
 *   + Free Promotional Mystery Cashback Box (56.24% hit rate in non-cashable Bonus Coins).
 * - Mode 2 (`poppo_classic_84rtp` — Poppo Live Standard 84% RTP / 10% Host / 6% House):
 *   56.24% Hit-Frequency Table (0.5x..500x, exact 84.00% EV), per-unit Combo Multi-Roll,
 *   3-Spin Anti-Dry-Streak Pity Guarantee, Daily Max Win Cap (200,000 🪙), and
 *   User-Editable Daily Max Loss Cap Slider (default 100,000 🪙, min 10,000 🪙).
 * ============================================================================
 */

export type LuckyGiftOperatingMode = 'loyalty_cashback_approved' | 'poppo_classic_84rtp';

export const POPPO_84_RTP_CONFIG = {
  hostPercent: 10,
  poolPercent: 84,
  housePercent: 6,
  theoreticalRtpPercent: 84,
  totalHitRatePercent: 56.24,
  pityGuaranteeAfterZeroStreak: 2, // Spin #3 after 2 consecutive 0x spins is guaranteed >= 0.5x
  dailyMaxWinCoins: 200_000, // ฿2,000/day max win cap
  defaultDailyMaxLossCoins: 100_000, // ฿1,000/day default user loss cap
  minDailyMaxLossCoins: 10_000, // ฿100/day minimum slider setting
  maxDailyMaxLossCoins: 500_000, // ฿5,000/day maximum slider setting
} as const;

export interface PoppoHighHitMultiplierTier {
  multiplier: 500 | 100 | 50 | 10 | 5 | 2 | 1 | 0.5;
  cumulativeProbability: number;
  tierProbability: number;
  expectedValueContribution: number;
  label: string;
}

/**
 * Exact 84.00% (0.8400) RTP & 56.24% (0.5624) Hit-Frequency Table:
 * - 500.0x: p = 0.0001 -> EV = 0.0500 (cum 0.0001)
 * - 100.0x: p = 0.0006 -> EV = 0.0600 (cum 0.0007)
 * -  50.0x: p = 0.0017 -> EV = 0.0850 (cum 0.0024)
 * -  10.0x: p = 0.0080 -> EV = 0.0800 (cum 0.0104)
 * -   5.0x: p = 0.0220 -> EV = 0.1100 (cum 0.0324)
 * -   2.0x: p = 0.0650 -> EV = 0.1300 (cum 0.0974)
 * -   1.0x: p = 0.1850 -> EV = 0.1850 (cum 0.2824)
 * -   0.5x: p = 0.2800 -> EV = 0.1400 (cum 0.5624)
 * Total Hit Rate = 56.24% | Total EV = 0.8400 (84.00% RTP)
 */
export const POPPO_HIGH_HIT_MULTIPLIER_TABLE: PoppoHighHitMultiplierTier[] = [
  { multiplier: 500, cumulativeProbability: 0.0001, tierProbability: 0.0001, expectedValueContribution: 0.05, label: '👑 500x GRAND CHON! CROWN!' },
  { multiplier: 100, cumulativeProbability: 0.0007, tierProbability: 0.0006, expectedValueContribution: 0.06, label: '💎 100x MEGA CROWN!' },
  { multiplier: 50, cumulativeProbability: 0.0024, tierProbability: 0.0017, expectedValueContribution: 0.085, label: '✨ 50x GOLDEN BURST!' },
  { multiplier: 10, cumulativeProbability: 0.0104, tierProbability: 0.008, expectedValueContribution: 0.08, label: '🧧 10x SUPER TEN!' },
  { multiplier: 5, cumulativeProbability: 0.0324, tierProbability: 0.022, expectedValueContribution: 0.11, label: '🐘 5x LUCKY FIVE!' },
  { multiplier: 2, cumulativeProbability: 0.0974, tierProbability: 0.065, expectedValueContribution: 0.13, label: '🍀 2x DOUBLE SPARK!' },
  { multiplier: 1, cumulativeProbability: 0.2824, tierProbability: 0.185, expectedValueContribution: 0.185, label: '🥂 1x FULL FREE REBATE!' },
  { multiplier: 0.5, cumulativeProbability: 0.5624, tierProbability: 0.28, expectedValueContribution: 0.14, label: '🪙 0.5x HALF-BACK CONSOLATION!' },
];

export interface ResponsibleLuckyTrackerState {
  disclaimerAcceptedAtIso: string | null;
  consecutiveZeroSpins: number;
  dailyWinsCoinsToday: number;
  dailyNetLossCoinsToday: number;
  userDailyMaxLossCapCoins: number;
}

export function createInitialResponsibleLuckyTracker(
  userDailyMaxLossCapCoins: number = POPPO_84_RTP_CONFIG.defaultDailyMaxLossCoins
): ResponsibleLuckyTrackerState {
  const clampedLossCap = Math.min(
    POPPO_84_RTP_CONFIG.maxDailyMaxLossCoins,
    Math.max(POPPO_84_RTP_CONFIG.minDailyMaxLossCoins, Math.floor(userDailyMaxLossCapCoins))
  );
  return {
    disclaimerAcceptedAtIso: null,
    consecutiveZeroSpins: 0,
    dailyWinsCoinsToday: 0,
    dailyNetLossCoinsToday: 0,
    userDailyMaxLossCapCoins: clampedLossCap,
  };
}

export function executePoppoDualModeSpin(params: {
  mode: LuckyGiftOperatingMode;
  poolState: LuckyPoolState;
  tracker: ResponsibleLuckyTrackerState;
  unitCoins: number;
  quantity: number;
  rng?: () => number;
}): {
  allowed: boolean;
  blockedReason?: string;
  nextPoolState: LuckyPoolState;
  nextTracker: ResponsibleLuckyTrackerState;
  totalSpendCoins: number;
  hostBasePoints: number;
  poolContributionCoins: number;
  platformVaultCoins: number;
  rewardBonusCoins: number;
  effectiveMultiplier: number;
  unitMultipliersRolled: number[];
  pityTriggered: boolean;
} {
  const rng = params.rng ?? cryptoRandomFloat;
  const totalSpendCoins = params.unitCoins * params.quantity;

  if (!params.tracker.disclaimerAcceptedAtIso) {
    return {
      allowed: false,
      blockedReason: 'RESPONSIBLE_PLAY_DISCLAIMER_REQUIRED: Please accept the 1-time 20+ social entertainment disclaimer first.',
      nextPoolState: params.poolState,
      nextTracker: params.tracker,
      totalSpendCoins: 0,
      hostBasePoints: 0,
      poolContributionCoins: 0,
      platformVaultCoins: 0,
      rewardBonusCoins: 0,
      effectiveMultiplier: 0,
      unitMultipliersRolled: [],
      pityTriggered: false,
    };
  }

  if (params.tracker.dailyWinsCoinsToday >= POPPO_84_RTP_CONFIG.dailyMaxWinCoins) {
    return {
      allowed: false,
      blockedReason: `DAILY_MAX_WIN_CAP_REACHED: You have reached today's 🪙 ${POPPO_84_RTP_CONFIG.dailyMaxWinCoins.toLocaleString('en-US')} Daily Max Lucky Win limit. Resets at 00:00 ICT.`,
      nextPoolState: params.poolState,
      nextTracker: params.tracker,
      totalSpendCoins: 0,
      hostBasePoints: 0,
      poolContributionCoins: 0,
      platformVaultCoins: 0,
      rewardBonusCoins: 0,
      effectiveMultiplier: 0,
      unitMultipliersRolled: [],
      pityTriggered: false,
    };
  }

  if (params.tracker.dailyNetLossCoinsToday + totalSpendCoins > params.tracker.userDailyMaxLossCapCoins) {
    return {
      allowed: false,
      blockedReason: `DAILY_MAX_LOSS_CAP_REACHED: Sending 🪙 ${totalSpendCoins.toLocaleString('en-US')} exceeds your Daily Lucky Spend/Loss Cap (🪙 ${params.tracker.userDailyMaxLossCapCoins.toLocaleString('en-US')}). Adjust in Settings or wait until 00:00 ICT.`,
      nextPoolState: params.poolState,
      nextTracker: params.tracker,
      totalSpendCoins: 0,
      hostBasePoints: 0,
      poolContributionCoins: 0,
      platformVaultCoins: 0,
      rewardBonusCoins: 0,
      effectiveMultiplier: 0,
      unitMultipliersRolled: [],
      pityTriggered: false,
    };
  }

  // Split according to operating mode:
  // - loyalty_cashback_approved: 80% Host Points (100% guaranteed fixed gift!) / 14% Loyalty Cashback Pool / 6% House
  // - poppo_classic_84rtp: 10% Host Points / 84% Return Pool / 6% House
  const hostPct = params.mode === 'loyalty_cashback_approved' ? 80 : POPPO_84_RTP_CONFIG.hostPercent;
  const poolPct = params.mode === 'loyalty_cashback_approved' ? 14 : POPPO_84_RTP_CONFIG.poolPercent;

  const hostBasePoints = Math.floor((totalSpendCoins * hostPct) / 100);
  const poolContributionCoins = Math.floor((totalSpendCoins * poolPct) / 100);
  const platformVaultCoins = totalSpendCoins - hostBasePoints - poolContributionCoins;

  let runningReservoir = params.poolState.reservoirBalanceCoins + poolContributionCoins;
  let consecutiveZeroSpins = params.tracker.consecutiveZeroSpins;
  let pityTriggered = false;
  let totalRewardCoins = 0;
  const unitMultipliersRolled: number[] = [];

  const remainingDailyWinRoom = Math.max(
    0,
    POPPO_84_RTP_CONFIG.dailyMaxWinCoins - params.tracker.dailyWinsCoinsToday
  );

  // Per-unit multi-roll (Combo x9, x10, x19, x50, x99 rolls each unit independently!)
  for (let u = 0; u < params.quantity; u++) {
    const r = rng();
    let rolledTier: PoppoHighHitMultiplierTier | null = null;
    for (const tier of POPPO_HIGH_HIT_MULTIPLIER_TABLE) {
      if (r < tier.cumulativeProbability) {
        rolledTier = tier;
        break;
      }
    }

    // 3-Spin Anti-Dry-Streak Pity Rule: if 2 consecutive units returned 0x, force at least 0.5x consolation
    if (!rolledTier && consecutiveZeroSpins >= POPPO_84_RTP_CONFIG.pityGuaranteeAfterZeroStreak) {
      rolledTier = POPPO_HIGH_HIT_MULTIPLIER_TABLE[POPPO_HIGH_HIT_MULTIPLIER_TABLE.length - 1]; // 0.5x
      pityTriggered = true;
    }

    let unitMultiplier = 0;
    let unitPayout = 0;

    if (rolledTier) {
      const startIndex = POPPO_HIGH_HIT_MULTIPLIER_TABLE.indexOf(rolledTier);
      for (let idx = startIndex; idx < POPPO_HIGH_HIT_MULTIPLIER_TABLE.length; idx++) {
        const candidate = POPPO_HIGH_HIT_MULTIPLIER_TABLE[idx];
        const candidateCoins = Math.floor(params.unitCoins * candidate.multiplier);
        if (
          candidateCoins <= runningReservoir &&
          totalRewardCoins + candidateCoins <= remainingDailyWinRoom
        ) {
          unitMultiplier = candidate.multiplier;
          unitPayout = candidateCoins;
          break;
        }
      }
    }

    if (unitPayout > 0) {
      runningReservoir -= unitPayout;
      totalRewardCoins += unitPayout;
      consecutiveZeroSpins = 0;
    } else {
      consecutiveZeroSpins += 1;
    }
    unitMultipliersRolled.push(unitMultiplier);
  }

  const effectiveMultiplier =
    totalSpendCoins > 0 ? Number((totalRewardCoins / totalSpendCoins).toFixed(2)) : 0;
  const netLossDelta = Math.max(0, totalSpendCoins - totalRewardCoins);

  const nextPoolState: LuckyPoolState = {
    reservoirBalanceCoins: runningReservoir,
    platformProfitVaultCoins: params.poolState.platformProfitVaultCoins + platformVaultCoins,
    totalHostPointsCredited: params.poolState.totalHostPointsCredited + hostBasePoints,
    totalCoinsWagered: params.poolState.totalCoinsWagered + totalSpendCoins,
    totalPlayerPayoutCoins: params.poolState.totalPlayerPayoutCoins + totalRewardCoins,
    totalSpinsProcessed: params.poolState.totalSpinsProcessed + 1,
    poolWarmthFactor: 1,
  };

  const nextTracker: ResponsibleLuckyTrackerState = {
    ...params.tracker,
    consecutiveZeroSpins,
    dailyWinsCoinsToday: params.tracker.dailyWinsCoinsToday + totalRewardCoins,
    dailyNetLossCoinsToday: params.tracker.dailyNetLossCoinsToday + netLossDelta,
  };

  return {
    allowed: true,
    nextPoolState,
    nextTracker,
    totalSpendCoins,
    hostBasePoints,
    poolContributionCoins,
    platformVaultCoins,
    rewardBonusCoins: totalRewardCoins,
    effectiveMultiplier,
    unitMultipliersRolled,
    pityTriggered,
  };
}

/**
 * Option A (Gambling Act B.E. 2478 s.8 Compliant Mode):
 * Deterministic Golden Kring Resonance Milestone Engine.
 * - Zero random chance (RNG): rewards are 100% deterministic based on combo quantity (`×1`, `×10`, `×50`, `×99`) and streak count.
 * - Preserves the exact 12% Host / 80% Resonance Reservoir / 8% Platform split and Reservoir Cap (`payoutCoins <= availableReservoir`).
 */
export function processDeterministicResonanceCombo(
  state: LuckyPoolState,
  unitCoins: number,
  quantity: number = 1,
  streakCount: number = 1
): { nextState: LuckyPoolState; outcome: LuckySpinOutcome } {
  if (unitCoins <= 0 || !Number.isInteger(unitCoins)) {
    throw new Error('unitCoins must be a positive integer');
  }
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    throw new Error('quantity must be a positive integer');
  }

  const totalSpendCoins = unitCoins * quantity;
  const hostBasePoints = Math.floor(
    totalSpendCoins * (AUTHORITATIVE_LUCKY_CHON_CONFIG.hostPercent / 100)
  );
  const poolContributionCoins = Math.floor(
    totalSpendCoins * (AUTHORITATIVE_LUCKY_CHON_CONFIG.poolPercent / 100)
  );
  const platformVaultCoins = totalSpendCoins - hostBasePoints - poolContributionCoins;

  const availableReservoir = state.reservoirBalanceCoins + poolContributionCoins;
  const nextSpinIndex = state.totalSpinsProcessed + 1;

  // Deterministic milestone echo schedule (no RNG):
  // - quantity >= 99: 50x unit echo (triggers BigGiftFX stage)
  // - quantity >= 50: 10x unit echo
  // - quantity >= 10: 5x unit echo
  // - every 3rd single combo tap: 2x unit echo
  let targetMultiplier: 0 | 2 | 5 | 10 | 50 = 0;
  if (quantity >= 99) targetMultiplier = 50;
  else if (quantity >= 50) targetMultiplier = 10;
  else if (quantity >= 10) targetMultiplier = 5;
  else if (streakCount % 3 === 0) targetMultiplier = 2;

  const candidatePayout = unitCoins * targetMultiplier;
  const payoutCoins = candidatePayout <= availableReservoir ? candidatePayout : 0;
  const multiplierWon: 0 | 2 | 5 | 10 | 50 = payoutCoins > 0 ? targetMultiplier : 0;
  const wasSteppedDownByReservoirCap = targetMultiplier > 0 && payoutCoins === 0;

  const nextState: LuckyPoolState = {
    reservoirBalanceCoins: availableReservoir - payoutCoins,
    platformProfitVaultCoins: state.platformProfitVaultCoins + platformVaultCoins,
    totalHostPointsCredited: state.totalHostPointsCredited + hostBasePoints,
    totalCoinsWagered: state.totalCoinsWagered + totalSpendCoins,
    totalPlayerPayoutCoins: state.totalPlayerPayoutCoins + payoutCoins,
    totalSpinsProcessed: nextSpinIndex,
    poolWarmthFactor: 1,
  };

  return {
    nextState,
    outcome: {
      unitCoins,
      quantity,
      totalSpendCoins,
      hostBasePoints,
      poolContributionCoins,
      platformVaultCoins,
      multiplierWon,
      payoutCoins,
      bannerLabel:
        multiplierWon > 0 ? `🔔 ×${quantity} GOLDEN RESONANCE · +${payoutCoins}` : null,
      wasSteppedDownByReservoirCap,
    },
  };
}


