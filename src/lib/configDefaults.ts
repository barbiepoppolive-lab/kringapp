export type HostLevel = 'new' | 'rising' | 'top';
export type AgencyPackageTier = 'starter' | 'gold' | 'royal';
export type PaymentsMode = 'psp' | 'interim' | 'off';

export interface TreatGoalBand {
  minThb: number;
  maxThb: number;
}

export interface AgencyPackageSpec {
  price_thb: number;
  override_percent: number;
  boost_coins_included: number;
  auto_assigned_hosts_per_month: number;
  min_active_hosts_to_unlock_free: number;
}

export interface ReferralStepSpec {
  step: number;
  name: string;
  required_paid_coins: number;
  reward_thb: number;
  reward_points: number;
}

export interface KringV43AgencyTierSpec {
  id: 'bronze' | 'silver' | 'gold' | 'royal_crown';
  label: string;
  labelTh: string;
  min_active_locals: number;
  min_rolling_30d_thb: number;
  gross_override_pct: number;
  net_fee_share_pct: number;
}

export interface KringPartnersConfig {
  net_share_pct: number;
  months: number;
  activation_thb: number;
  activation_bookings: number;
  cap_pct_of_net: number;
  quality_min_rating: number;
  quality_max_noshow: number;
  frozen_until_month: number;
  typical_payout_per_booking_thb: number;
}

export interface HostPayoutRulesConfig {
  free_weekly_payout_day: 'Monday';
  free_weekly_payout_min_thb: number;
  instant_withdrawal_fee_thb: number;
  min_instant_withdrawal_thb: number;
  repeat_booking_reward_promo_thb: number;
}

export interface B2BPartnerEngineConfig {
  /** Stream 1: 20%–35% B2B Voucher Spread with 100% Upfront Net Rate before travel date */
  b2bVoucherSpreadMinShare?: number;
  b2bVoucherSpreadMaxShare?: number;
  upfrontPartnerNetSettlementPct?: 100;
  /** Stream 2: ฿1,990/mo Verified Safe Meeting Point Pin with 30-day free founding trial */
  verifiedMeetingPointMonthlyBaht: number;
  foundingTrialDays: number;
  /** Stream 3: ฿3,990/mo or 25% #1 Featured Deals Slot */
  featuredSlotMonthlyBaht: number;
  featuredSlotAlternativeShare?: number;
  /** Stream 4: 70% Kring / 30% Host Add-On Bonus shown in Baht only, never % */
  hostAddonCommissionShare: number;
  kringAddonCommissionShare: number;
  displayPercentagesOnUi: false;
}

export interface WalletCoinValidityConfig {
  bonusCoinValidityDays: number;
  paidCoinValidityDays: number;
  autoFulfillVoucherPackAtExpiry: boolean;
  allowRestoreAfterExpiry: boolean;
}

export interface PlatformConfig {
  coins_per_thb: number;
  min_age_years: number;
  daily_micro_spend_cap_thb: number;
  allow_offers_below_treat_goal: boolean;
  min_raise_step_thb: number;
  max_single_raise_percent: number;
  soft_close_window_seconds: number;
  first_daily_entry_free: boolean;
  extra_entry_fee_thb: number;
  free_messages_per_host: number;
  extra_message_coins: number;
  story_toast_coins: number;
  daily_mystery_box_coins: number;
  taxi_gift_coins: number;
  outing_host_share_percent: number;
  outing_platform_share_percent: number;
  direct_gift_host_share_percent: number;
  direct_gift_platform_share_percent: number;
  lucky_chon_enabled: boolean;
  lucky_chon_base_host_percent: number;
  lucky_chon_rtp_pool_percent: number;
  usdt_bonus_coins_percent: number;
  blended_spend_max_bonus_percent: number;
  daily_jackpot_pool_percent: number;
  daily_jackpot_min_paid_coins_spend: number;
  first_withdrawal_min_points: number;
  standard_withdrawal_min_points: number;
  referral_bounty_total_thb: number;
  referral_bounty_total_points: number;
  referral_steps: ReferralStepSpec[];
  agency_roster_release_fee_coins: number;
  agency_roster_cooldown_days: number;
  host_level_bands: Record<HostLevel, TreatGoalBand>;
  agency_override_max_pct: number;
  subscout_bonus_pct: number;
  agency_tiers: {
    bronze_min_active: number;
    bronze_percent: number;
    silver_min_active: number;
    silver_percent: number;
    gold_min_active: number;
    gold_percent: number;
  };
  agency_packages: Record<AgencyPackageTier, AgencyPackageSpec>;
  kring_v43_agency_tiers?: {
    tiers: KringV43AgencyTierSpec[];
    lucky_override_gross_pct: number;
    full_tier_window_days: number;
    month_7_plus_maintenance_gross_pct: number;
    activation_bounty_thb: number;
    activation_bounty_min_bookings: number;
    activation_bounty_min_booking_thb: number;
  };
  kring_partners: KringPartnersConfig;
  host_payout_rules: HostPayoutRulesConfig;
  b2bPartnerEngine: B2BPartnerEngineConfig;
  walletCoinValidity: WalletCoinValidityConfig;
  app_store_review_mode?: boolean;
  /** Fable P0.3 · Payment Systems Act switch: 'psp' (Path A) | 'interim' (Path B) | 'off' (Path C) */
  payments_mode?: PaymentsMode;
  /** Option A · Vault RNG for Oct 30 lawyer check and run deterministic Poppo combo resonance now */
  lucky_rng_vaulted?: boolean;
}

/**
 * Default seed values for the database `public.config` table (D-003..D-037).
 * Note (D-034): Production ledger/SQL splits lock Treat Envelopes at 80% Host / 19% Platform / 1% Daily Pot,
 * Lucky Chon! at 12% Host / 8% House / 80% RTP Pool, and Cash-out fees at ฿15 under ฿1,000 / ฿0 at ฿1,000+.
 * Note (D-035 / BUG-035): Agency rolling 30d override tiers are 8% -> 12% -> 16% max, with 16% total cap
 * including the +4% Sub-Scout bonus (`effective_override_pct = min(tier_rate + (has_subscout ? 4 : 0), 16)`)
 * and 0 auto-assigned host leads across all tiers (Red Line #3).
 */
export const DEFAULT_PLATFORM_CONFIG: PlatformConfig = {
  app_store_review_mode: false, // DEPRECATED — do not re-wire. Showing reviewers a different app than real users is an app-store/PSP terms violation (account termination risk). Kept false and unread; remove once no config references it.
  payments_mode: 'psp',
  lucky_rng_vaulted: true,
  coins_per_thb: 100, // Unified rate across the entire app: 100 Chon! Coins / Points = 1 THB
  min_age_years: 20,
  daily_micro_spend_cap_thb: 300,
  allow_offers_below_treat_goal: false, // D-016: Only at or above host's Outing Treat Goal
  min_raise_step_thb: 50,
  max_single_raise_percent: 20,
  soft_close_window_seconds: 300, // 5-minute soft close
  first_daily_entry_free: true,
  extra_entry_fee_thb: 20,
  free_messages_per_host: 5,
  extra_message_coins: 100,
  story_toast_coins: 100, // 100c Story Toast
  daily_mystery_box_coins: 1_000, // 1,000c Daily Mystery Clink Box
  taxi_gift_coins: 2_000, // 2,000 Coins (20 THB) VIP Tuk-Tuk Treat
  outing_host_share_percent: 70, // Legacy T-004 helper seed (superseded in SQL 0005 / chonLedgerEngine by D-034: 80% Host / 19% Platform / 1% Daily Pot)
  outing_platform_share_percent: 30,
  direct_gift_host_share_percent: 70, // Legacy T-004 helper seed (superseded in SQL 0005 by D-034: 80% Host / 20% Platform)
  direct_gift_platform_share_percent: 30,
  lucky_chon_enabled: true,
  lucky_chon_base_host_percent: 12, // D-034: 12% Host / 8% House / 80% RTP Pool
  lucky_chon_rtp_pool_percent: 80,
  usdt_bonus_coins_percent: 5, // D-018: +5% Bonus Coins on Stealth USDT / Binance Pay top-up
  blended_spend_max_bonus_percent: 20, // D-022: 80% Paid / 20% Bonus Coins after tutorial gift
  daily_jackpot_pool_percent: 2, // D-022: 2% Daily Lucky Jackpot Pool drawn at 9 PM BKK
  daily_jackpot_min_paid_coins_spend: 10_000, // Spend >= 10,000 Paid Coins (100 THB) today to qualify
  first_withdrawal_min_points: 10_000, // D-023: 100 THB (10,000 Points) instant Day-1 trust cashout on 1st withdrawal
  standard_withdrawal_min_points: 20_000, // D-023: 200 THB (20,000 Points) standard anytime minimum cashout
  referral_bounty_total_thb: 555, // D-023: 555 THB (55,500 Points at 100 Pts = 1 THB) 4-Step Self-Funding Referral
  referral_bounty_total_points: 55_500,
  referral_steps: [
    { step: 1, name: 'First Icebreaker Clink', required_paid_coins: 10_000, reward_thb: 30, reward_points: 3_000 },
    { step: 2, name: 'First Small Drop / Treats', required_paid_coins: 90_000, reward_thb: 75, reward_points: 7_500 },
    { step: 3, name: '255 THB Fast-Track Complete', required_paid_coins: 220_000, reward_thb: 150, reward_points: 15_000 },
    { step: 4, name: '555 THB Certified Star Bonus', required_paid_coins: 475_000, reward_thb: 300, reward_points: 30_000 },
  ],
  agency_roster_release_fee_coins: 0, // KRING_AGENCY_PLAN: ฿0 release fee — hosts can leave any partner at any time for free
  agency_roster_cooldown_days: 0, // KRING_AGENCY_PLAN: 0-day cooldown — zero exit penalty
  host_level_bands: {
    new: { minThb: 200, maxThb: 1500 }, // Affordable Coffee Drops start at 200 THB (20,000 Coins)
    rising: { minThb: 400, maxThb: 2500 },
    top: { minThb: 800, maxThb: 4000 },
  },
  agency_override_max_pct: 5, // KRING_AGENCY_PLAN: 20% of Kring's net fee (~4% gross, hard-capped at 25% of monthly net fee)
  subscout_bonus_pct: 0, // KRING_AGENCY_PLAN: 0% Sub-Scout — no multi-level / pyramid recruiting pay
  agency_tiers: {
    bronze_min_active: 1,
    bronze_percent: 4,
    silver_min_active: 5,
    silver_percent: 4,
    gold_min_active: 15,
    gold_percent: 4,
  },
  agency_packages: {
    starter: {
      price_thb: 0,
      override_percent: 4,
      boost_coins_included: 0,
      auto_assigned_hosts_per_month: 0, // D-035 / Red Line #3: Zero auto-assigned host leads
      min_active_hosts_to_unlock_free: 1,
    },
    gold: {
      price_thb: 0,
      override_percent: 4,
      boost_coins_included: 0,
      auto_assigned_hosts_per_month: 0, // D-035 / Red Line #3: Zero auto-assigned host leads
      min_active_hosts_to_unlock_free: 0,
    },
    royal: {
      price_thb: 0,
      override_percent: 4,
      boost_coins_included: 0,
      auto_assigned_hosts_per_month: 0, // D-035 / Red Line #3: Zero auto-assigned host leads on all tiers
      min_active_hosts_to_unlock_free: 0,
    },
  },
  kring_v43_agency_tiers: {
    tiers: [
      { id: 'bronze', label: 'Partner', labelTh: 'พาร์ทเนอร์', min_active_locals: 1, min_rolling_30d_thb: 0, gross_override_pct: 4, net_fee_share_pct: 20 },
      { id: 'silver', label: 'Verified Partner', labelTh: 'พาร์ทเนอร์ยืนยัน', min_active_locals: 5, min_rolling_30d_thb: 50_000, gross_override_pct: 4, net_fee_share_pct: 20 },
      { id: 'gold', label: 'Gold Partner', labelTh: 'พาร์ทเนอร์โกลด์', min_active_locals: 15, min_rolling_30d_thb: 150_000, gross_override_pct: 4, net_fee_share_pct: 20 },
      { id: 'royal_crown', label: 'Premier Partner', labelTh: 'พาร์ทเนอร์พรีเมียร์', min_active_locals: 30, min_rolling_30d_thb: 400_000, gross_override_pct: 5, net_fee_share_pct: 25 },
    ],
    lucky_override_gross_pct: 0,
    full_tier_window_days: 180,
    month_7_plus_maintenance_gross_pct: 0,
    activation_bounty_thb: 150,
    activation_bounty_min_bookings: 3,
    activation_bounty_min_booking_thb: 600,
  },
  kring_partners: {
    net_share_pct: 20, // 20% of Kring's net fee after payment costs (≈฿29 on a ฿740 booking)
    months: 6, // First 6 months per host only; Month 7+ = ฿0
    activation_thb: 150, // Paid once after host's 3rd completed booking with 3 different travellers
    activation_bookings: 3,
    cap_pct_of_net: 25, // Total partner payouts + bonuses capped at 25% of Kring's monthly net fee
    quality_min_rating: 4.6,
    quality_max_noshow: 0.05,
    frozen_until_month: 3, // Closed in Months 1–2; opens Month 3 for registered businesses/groups
    typical_payout_per_booking_thb: 29,
  },
  host_payout_rules: {
    free_weekly_payout_day: 'Monday',
    free_weekly_payout_min_thb: 500,
    instant_withdrawal_fee_thb: 15,
    min_instant_withdrawal_thb: 200,
    repeat_booking_reward_promo_thb: 50,
  },
  b2bPartnerEngine: {
    b2bVoucherSpreadMinShare: 0.20,
    b2bVoucherSpreadMaxShare: 0.35,
    upfrontPartnerNetSettlementPct: 100,
    verifiedMeetingPointMonthlyBaht: 1990,
    foundingTrialDays: 30,
    featuredSlotMonthlyBaht: 3990,
    featuredSlotAlternativeShare: 0.25,
    hostAddonCommissionShare: 0.30,
    kringAddonCommissionShare: 0.70,
    displayPercentagesOnUi: false,
  },
  walletCoinValidity: {
    bonusCoinValidityDays: 90,
    paidCoinValidityDays: 365,
    autoFulfillVoucherPackAtExpiry: true,
    allowRestoreAfterExpiry: false,
  },
};

export function validateTreatGoalForLevel(
  level: HostLevel,
  treatGoalThb: number,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): boolean {
  const band = config.host_level_bands[level];
  if (!band) return false;
  return treatGoalThb >= band.minThb && treatGoalThb <= band.maxThb;
}

export function getAgencyOverridePercent(
  activeHostCount: number,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG,
  packageTier?: AgencyPackageTier,
  hasSubScout: boolean = false
): number {
  let tierRate = 0;
  if (packageTier === 'royal') {
    tierRate = config.agency_packages.royal.override_percent;
  } else if (packageTier === 'gold') {
    tierRate = config.agency_packages.gold.override_percent;
  } else {
    const { agency_tiers } = config;
    if (activeHostCount >= agency_tiers.gold_min_active) {
      tierRate = agency_tiers.gold_percent;
    } else if (activeHostCount >= agency_tiers.silver_min_active) {
      tierRate = agency_tiers.silver_percent;
    } else if (activeHostCount >= agency_tiers.bronze_min_active) {
      tierRate = agency_tiers.bronze_percent;
    }
  }
  if (tierRate <= 0) return 0;
  const subscoutBonus = hasSubScout ? config.subscout_bonus_pct : 0;
  return Math.min(tierRate + subscoutBonus, config.agency_override_max_pct);
}

export interface BlendedSpendBreakdown {
  totalCostCoins: number;
  paidCoinsUsed: number;
  bonusCoinsUsed: number;
}

/**
 * Enforces D-022: Maximum 20% of a non-tutorial gift/treat can be funded by `bonus_coins`,
 * requiring at least 80% `paid_coins` so free task coins never bleed platform margin.
 */
export function calculateBlendedSpend(
  totalCostCoins: number,
  availablePaidCoins: number,
  availableBonusCoins: number,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): BlendedSpendBreakdown {
  if (totalCostCoins <= 0 || !Number.isInteger(totalCostCoins)) {
    throw new Error('totalCostCoins must be a positive integer');
  }
  const maxBonusAllowed = Math.floor(
    (totalCostCoins * config.blended_spend_max_bonus_percent) / 100
  );
  const bonusCoinsUsed = Math.min(maxBonusAllowed, Math.max(0, availableBonusCoins));
  const paidCoinsUsed = totalCostCoins - bonusCoinsUsed;

  if (paidCoinsUsed > availablePaidCoins) {
    throw new Error('Insufficient paid_coins balance for 80/20 blended spend');
  }

  return {
    totalCostCoins,
    paidCoinsUsed,
    bonusCoinsUsed,
  };
}

export interface RosterReleaseSplit {
  totalFeeCoins: number;
  platformShareCoins: number;
  agencySharePoints: number;
}

/**
 * Enforces D-024: 500,000 Coin (2,000 THB) Instant Agency Roster Release Fee
 * is split 50% to Platform and 50% to the Original Agency Owner.
 */
export function calculateRosterReleaseSplit(
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): RosterReleaseSplit {
  const totalFeeCoins = config.agency_roster_release_fee_coins;
  const agencySharePoints = Math.floor(totalFeeCoins / 2);
  const platformShareCoins = totalFeeCoins - agencySharePoints;
  return {
    totalFeeCoins,
    platformShareCoins,
    agencySharePoints,
  };
}

export interface SplitBreakdown {
  totalCoins: number;
  hostPoints: number;
  hostTakeHomeThb: number;
  agencyPoints: number;
  platformNetCoins: number;
}

/**
 * Calculates the 70% Host / 30% Platform split on an Outing Treat Envelope.
 * Agency override (8%-15%) comes strictly out of the Platform's 30% share, never reducing the host's 70%.
 */
export function calculateOutingSplit(
  totalCoins: number,
  agencyActiveHosts: number = 0,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG,
  packageTier?: AgencyPackageTier
): SplitBreakdown {
  if (totalCoins <= 0 || !Number.isInteger(totalCoins)) {
    throw new Error('totalCoins must be a positive integer');
  }
  const hostPoints = Math.floor((totalCoins * config.outing_host_share_percent) / 100);
  const agencyPercent = getAgencyOverridePercent(agencyActiveHosts, config, packageTier);
  const agencyPoints = Math.floor((totalCoins * agencyPercent) / 100);
  const platformNetCoins = totalCoins - hostPoints - agencyPoints;

  if (platformNetCoins < 0) {
    throw new Error('Invalid config: split shares exceed 100%');
  }

  return {
    totalCoins,
    hostPoints,
    hostTakeHomeThb: Math.floor(hostPoints / config.coins_per_thb),
    agencyPoints,
    platformNetCoins,
  };
}

/**
 * Calculates the 70% Host / 30% Platform split on Direct Gifts & Luxury Treats.
 */
export function calculateDirectGiftSplit(
  totalCoins: number,
  agencyActiveHosts: number = 0,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG,
  packageTier?: AgencyPackageTier
): SplitBreakdown {
  if (totalCoins <= 0 || !Number.isInteger(totalCoins)) {
    throw new Error('totalCoins must be a positive integer');
  }
  const hostPoints = Math.floor((totalCoins * config.direct_gift_host_share_percent) / 100);
  const agencyPercent = getAgencyOverridePercent(agencyActiveHosts, config, packageTier);
  const agencyPoints = Math.floor((totalCoins * agencyPercent) / 100);
  const platformNetCoins = totalCoins - hostPoints - agencyPoints;

  return {
    totalCoins,
    hostPoints,
    hostTakeHomeThb: Math.floor(hostPoints / config.coins_per_thb),
    agencyPoints,
    platformNetCoins,
  };
}

export const PAYMENTS_MODE_KEY = 'kring_payments_mode_v1';
export const PAYMENTS_MODE_EVENT = 'kring:payments-mode';

/**
 * Fable P0.3 · Payment Systems Act 2017 Switch (`'psp' | 'interim' | 'off'`).
 * - `'psp'`: Path A — BOT-licensed PSP hold-and-release live.
 * - `'interim'`: Path B — Counsel-approved MoR platform fee + Fastwork contractor escrow.
 * - `'off'`: Path C — Free two-way exchanges (`฿0`) + 1-on-1 Chat + Two-Phone Bump + Kring Price Check; in-app money hold/top-up/cashout hidden.
 */
export function getPaymentsMode(config: PlatformConfig = DEFAULT_PLATFORM_CONFIG): PaymentsMode {
  if (typeof window !== 'undefined') {
    try {
      const qs = new URLSearchParams(window.location.search).get('payments');
      if (qs === 'psp' || qs === 'interim' || qs === 'off') return qs;
      const stored = window.localStorage.getItem(PAYMENTS_MODE_KEY);
      if (stored === 'psp' || stored === 'interim' || stored === 'off') return stored;
    } catch {
      /* ignore storage errors */
    }
  }
  return config.payments_mode ?? 'psp';
}

export function setPaymentsMode(mode: PaymentsMode): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PAYMENTS_MODE_KEY, mode);
    window.dispatchEvent(new CustomEvent(PAYMENTS_MODE_EVENT, { detail: { mode } }));
  } catch {
    /* ignore */
  }
}

/**
 * Option A · Vault RNG for Oct 30 Thai Lawyer Check while running Deterministic Poppo Combo Resonance Mode now.
 * Returns `false` only when `?rng=1` is passed after counsel clearance.
 */
export function isLuckyRngVaulted(config: PlatformConfig = DEFAULT_PLATFORM_CONFIG): boolean {
  if (typeof window !== 'undefined') {
    try {
      if (new URLSearchParams(window.location.search).get('rng') === '1') return false;
    } catch {
      /* ignore */
    }
  }
  return config.lucky_rng_vaulted ?? true;
}

/**
 * Fable P1.1 · Anti-collusion formula `R <= 0.15F`.
 * A collusion ring paying trip fee `F` receives `0.8F` back via the host and collects bounty `R`.
 * Enforcing `R <= 0.15F` ensures ring profit (`R - 0.2F = -0.05F < 0`) is strictly negative while Kring retains positive net margin (`0.165F - R >= 0.015F`).
 */
export function calculateMaxSafeBountyThb(tripFeeThb: number): number {
  if (!Number.isFinite(tripFeeThb) || tripFeeThb <= 0) return 0;
  return Math.floor(tripFeeThb * 0.15);
}

/**
 * KRING_PAYOUT_LEAKS #5 · Repeat-booking fee rule:
 * Never show a percentage or cut Kring's platform fee to 12%/10%/0%.
 * Kring keeps its full platform share on repeat bookings; repeat bookings earn a fixed ฿50 promo reward credit (30d expiry).
 */
export function calculateRepeatPairPlatformFeePct(
  _completedTripsBetweenPair: number,
  _promoFeeWaiverApplied: boolean = false,
  _hasCompletedAtLeastOneBump: boolean = false
): number {
  return 20;
}

/**
 * KRING_PAYOUT_LEAKS #1 & #4 · Unified Host Gift-Reward Withdrawal Fee Rule:
 * - Free weekly payout every Monday when balance is >= ฿500 (`isScheduledWeeklyRun = true`).
 * - "Withdraw now" any day costs ฿15 paid by the host (`instant_withdrawal_fee_thb = 15`).
 * (Trip fees are paid directly by Tazapay to the host at the Kring! bump with ฿0 fee.)
 */
export function calculateHostGiftWithdrawalFeeThb(
  amountThb: number,
  isScheduledWeeklyRun: boolean = false,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): number {
  const rules = config.host_payout_rules;
  if (isScheduledWeeklyRun && amountThb >= rules.free_weekly_payout_min_thb) {
    return 0;
  }
  return rules.instant_withdrawal_fee_thb;
}

/**
 * KRING_AGENCY_PLAN · Kring Partners (พาร์ทเนอร์กริ๊ง) Net-Fee Share & 6-Month Cap:
 * - 20% of Kring's net fee after payment & payout costs (~฿29 on a ฿740 booking where Kring net is ฿147).
 * - Paid only during the host's first 6 months on Kring (`hostMonthsOnKring <= 6`); Month 7+ = ฿0.
 * - Requires quality gate: `hostRating >= 4.6` and `hostNoShowRate < 0.05`.
 * - Activation bonus: ฿150 paid once after the host's 3rd completed booking with 3 different travellers.
 */
export function calculateKringPartnerPayout(
  params: {
    kringNetFeeThb: number;
    hostMonthsOnKring: number;
    hostRating?: number;
    hostNoShowRate?: number;
    completedBookingsWithDistinctTravellers?: number;
    activationBonusAlreadyPaid?: boolean;
  },
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): {
  eligible: boolean;
  partnerBookingShareThb: number;
  activationBonusThb: number;
  totalPartnerPayoutThb: number;
  kringRetainedNetThb: number;
} {
  const rules = config.kring_partners;
  const rating = params.hostRating ?? 5.0;
  const noShow = params.hostNoShowRate ?? 0;
  const withinWindow = params.hostMonthsOnKring >= 1 && params.hostMonthsOnKring <= rules.months;
  const passesQuality = rating >= rules.quality_min_rating && noShow < rules.quality_max_noshow;

  if (!withinWindow || !passesQuality || params.kringNetFeeThb <= 0) {
    return {
      eligible: false,
      partnerBookingShareThb: 0,
      activationBonusThb: 0,
      totalPartnerPayoutThb: 0,
      kringRetainedNetThb: Math.max(0, Math.floor(params.kringNetFeeThb)),
    };
  }

  const partnerBookingShareThb = Math.round((params.kringNetFeeThb * rules.net_share_pct) / 100);
  const qualifiesForActivation =
    !params.activationBonusAlreadyPaid &&
    (params.completedBookingsWithDistinctTravellers ?? 0) >= rules.activation_bookings;
  const activationBonusThb = qualifiesForActivation ? rules.activation_thb : 0;
  const totalPartnerPayoutThb = partnerBookingShareThb + activationBonusThb;
  const kringRetainedNetThb = Math.max(0, Math.floor(params.kringNetFeeThb) - partnerBookingShareThb);

  return {
    eligible: true,
    partnerBookingShareThb,
    activationBonusThb,
    totalPartnerPayoutThb,
    kringRetainedNetThb,
  };
}

/**
 * Calculates the 70/30 Host Add-On Partner Bonus in Baht only.
 * Never exposes percentage splits on any UI screen (`displayPercentagesOnUi === false`).
 */
export function calculateHostAddonBonusBaht(
  totalPartnerCommissionBaht: number,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): {
  hostBonusBaht: number;
  kringRetainedBaht: number;
  hostBadgeLabel: string;
} {
  if (!Number.isFinite(totalPartnerCommissionBaht) || totalPartnerCommissionBaht <= 0) {
    return {
      hostBonusBaht: 0,
      kringRetainedBaht: 0,
      hostBadgeLabel: '🎁 +฿0 Host Bonus on QR Scan',
    };
  }
  const hostBonusBaht = Math.round(
    totalPartnerCommissionBaht * config.b2bPartnerEngine.hostAddonCommissionShare
  );
  const kringRetainedBaht = Math.max(0, Math.round(totalPartnerCommissionBaht) - hostBonusBaht);
  return {
    hostBonusBaht,
    kringRetainedBaht,
    hostBadgeLabel: `🎁 +฿${hostBonusBaht.toLocaleString('en-US')} Host Bonus on QR Scan`,
  };
}

/**
 * B2B 4-Stream Commercial Model Calculator (Streams 1 & 4):
 * - Stream 1: 20%–35% B2B Voucher Spread with 100% Upfront Net Rate settled to partner before travel date
 * - Stream 4: 70% Kring / 30% Host Add-On Bonus shown in Baht only (never `%` on UI)
 */
export function calculateB2BVoucherSpreadAndHostBonusBaht(
  params: {
    walkInPriceBaht: number;
    kringPriceBaht: number;
    partnerUpfrontNetBaht: number;
    serviceFeeBaht?: number;
  },
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): {
  walkInPriceBaht: number;
  kringPriceBaht: number;
  partnerUpfrontNetBaht: number;
  upfrontNetSettlementPct: 100;
  guestSavingsVsWalkInBaht: number;
  totalB2BSpreadBaht: number;
  spreadShareOfKringPrice: number;
  spreadWithinTargetBand: boolean;
  hostBonusBaht: number;
  kringRetainedFromSpreadBaht: number;
  serviceFeeBaht: number;
  totalKringGrossMarginBaht: number;
  hostBadgeLabel: string;
} {
  const walkInPriceBaht = Math.max(0, Math.round(params.walkInPriceBaht));
  const kringPriceBaht = Math.max(0, Math.round(params.kringPriceBaht));
  const partnerUpfrontNetBaht = Math.max(0, Math.round(params.partnerUpfrontNetBaht));
  const serviceFeeBaht = Math.max(0, Math.round(params.serviceFeeBaht ?? 25));

  const guestSavingsVsWalkInBaht = Math.max(0, walkInPriceBaht - kringPriceBaht);
  const totalB2BSpreadBaht = Math.max(0, kringPriceBaht - partnerUpfrontNetBaht);
  const spreadShareOfKringPrice =
    kringPriceBaht > 0 ? Number((totalB2BSpreadBaht / kringPriceBaht).toFixed(4)) : 0;

  const minSpread = config.b2bPartnerEngine.b2bVoucherSpreadMinShare ?? 0.20;
  const maxSpread = config.b2bPartnerEngine.b2bVoucherSpreadMaxShare ?? 0.35;
  const spreadWithinTargetBand =
    spreadShareOfKringPrice >= minSpread - 0.0001 && spreadShareOfKringPrice <= maxSpread + 0.0001;

  const addonSplit = calculateHostAddonBonusBaht(totalB2BSpreadBaht, config);

  return {
    walkInPriceBaht,
    kringPriceBaht,
    partnerUpfrontNetBaht,
    upfrontNetSettlementPct: 100,
    guestSavingsVsWalkInBaht,
    totalB2BSpreadBaht,
    spreadShareOfKringPrice,
    spreadWithinTargetBand,
    hostBonusBaht: addonSplit.hostBonusBaht,
    kringRetainedFromSpreadBaht: addonSplit.kringRetainedBaht,
    serviceFeeBaht,
    totalKringGrossMarginBaht: addonSplit.kringRetainedBaht + serviceFeeBaht,
    hostBadgeLabel: addonSplit.hostBadgeLabel,
  };
}

/**
 * Evaluates wallet coin validity:
 * - Paid Coins: 365-day validity (`autoFulfillVoucherPackAtExpiry === true`)
 * - Promotional Bonus Coins: 90-day expiry (`allowRestoreAfterExpiry === false`)
 */
export function evaluateWalletCoinExpiryRule(
  coinType: 'paid' | 'bonus',
  ageInDays: number,
  config: PlatformConfig = DEFAULT_PLATFORM_CONFIG
): {
  coinType: 'paid' | 'bonus';
  validityDays: number;
  isExpired: boolean;
  daysRemaining: number;
  actionOnExpiry: 'AUTO_FULFILL_VOUCHER_PACK' | 'EXPIRE_PROMO_BONUS';
} {
  const validityDays =
    coinType === 'paid'
      ? config.walletCoinValidity.paidCoinValidityDays
      : config.walletCoinValidity.bonusCoinValidityDays;
  const cleanAge = Math.max(0, Math.floor(ageInDays));
  const isExpired = cleanAge > validityDays;
  const daysRemaining = Math.max(0, validityDays - cleanAge);

  return {
    coinType,
    validityDays,
    isExpired,
    daysRemaining,
    actionOnExpiry:
      coinType === 'paid' && config.walletCoinValidity.autoFulfillVoucherPackAtExpiry
        ? 'AUTO_FULFILL_VOUCHER_PACK'
        : 'EXPIRE_PROMO_BONUS',
  };
}





