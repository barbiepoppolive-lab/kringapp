import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PLATFORM_CONFIG,
  calculateOutingSplit,
  calculateDirectGiftSplit,
  validateTreatGoalForLevel,
  getAgencyOverridePercent,
  calculateBlendedSpend,
  calculateRosterReleaseSplit,
  calculateHostGiftWithdrawalFeeThb,
  calculateKringPartnerPayout,
  calculateHostAddonBonusBaht,
  calculateB2BVoucherSpreadAndHostBonusBaht,
  evaluateWalletCoinExpiryRule,
} from './configDefaults';

describe('T-004: Level 2 Platform Config, Splits, Bands & Kring Partners Math (KRING_PAYOUT_LEAKS / KRING_AGENCY_PLAN)', () => {
  it('enforces unified 100 coins = 1 THB rate and 20+ age gate', () => {
    expect(DEFAULT_PLATFORM_CONFIG.coins_per_thb).toBe(100);
    expect(DEFAULT_PLATFORM_CONFIG.daily_micro_spend_cap_thb).toBe(300);
    expect(DEFAULT_PLATFORM_CONFIG.min_age_years).toBe(20);
  });

  it('enforces D-016: no offers below host Outing Treat Goal and 50 THB raise steps', () => {
    expect(DEFAULT_PLATFORM_CONFIG.allow_offers_below_treat_goal).toBe(false);
    expect(DEFAULT_PLATFORM_CONFIG.min_raise_step_thb).toBe(50);
    expect(DEFAULT_PLATFORM_CONFIG.max_single_raise_percent).toBe(20);
    expect(DEFAULT_PLATFORM_CONFIG.soft_close_window_seconds).toBe(300);
  });

  it('validates affordable Outing Treat Goal floor and cap per Host Level (New starts at 200 THB / 20,000c)', () => {
    // New: 200 - 1500 THB (20,000 - 150,000 Coins)
    expect(validateTreatGoalForLevel('new', 150)).toBe(false);
    expect(validateTreatGoalForLevel('new', 200)).toBe(true);
    expect(validateTreatGoalForLevel('new', 1500)).toBe(true);
    expect(validateTreatGoalForLevel('new', 1600)).toBe(false);

    // Rising: 400 - 2500 THB
    expect(validateTreatGoalForLevel('rising', 350)).toBe(false);
    expect(validateTreatGoalForLevel('rising', 2000)).toBe(true);
    expect(validateTreatGoalForLevel('rising', 2600)).toBe(false);

    // Top: 800 - 4000 THB
    expect(validateTreatGoalForLevel('top', 700)).toBe(false);
    expect(validateTreatGoalForLevel('top', 3500)).toBe(true);
    expect(validateTreatGoalForLevel('top', 4100)).toBe(false);
  });

  it('calculates exact 70% Host / 30% Platform split on Outing Treats and pays Kring Partner out of Platform share', () => {
    // 800 THB (80,000 coins at 100c/THB) with Kring Partner (5 active hosts -> 4% gross / 20% of net fee)
    const split = calculateOutingSplit(80_000, 5);
    expect(split.totalCoins).toBe(80_000);
    expect(split.hostPoints).toBe(56_000); // 70% guaranteed to host (560 THB)
    expect(split.hostTakeHomeThb).toBe(560);
    expect(split.agencyPoints).toBe(3_200); // 4% paid out of platform share
    expect(split.platformNetCoins).toBe(20_800); // 26% remaining to platform
    // Zero-sum invariant check
    expect(split.hostPoints + split.agencyPoints + split.platformNetCoins).toBe(80_000);
  });

  it('calculates exact 70% Host / 30% Platform split on Direct Gifts with zero-sum integrity', () => {
    const giftSplit = calculateDirectGiftSplit(5_000, 0); // Moo Kratha 5,000c (50 THB), no partner
    expect(giftSplit.hostPoints).toBe(3_500);
    expect(giftSplit.hostTakeHomeThb).toBe(35);
    expect(giftSplit.agencyPoints).toBe(0);
    expect(giftSplit.platformNetCoins).toBe(1_500);
    expect(giftSplit.hostPoints + giftSplit.agencyPoints + giftSplit.platformNetCoins).toBe(5_000);
  });

  it('enforces KRING_AGENCY_PLAN: Kring Partners 20% of net fee (~฿29/booking for 6 months), 0% Sub-Scout, quality gate, and 0 auto-assigned host leads', () => {
    expect(DEFAULT_PLATFORM_CONFIG.agency_override_max_pct).toBe(5);
    expect(DEFAULT_PLATFORM_CONFIG.subscout_bonus_pct).toBe(0);
    expect(getAgencyOverridePercent(0)).toBe(0);
    expect(getAgencyOverridePercent(1)).toBe(4);
    expect(getAgencyOverridePercent(5, DEFAULT_PLATFORM_CONFIG, 'starter')).toBe(4);
    expect(getAgencyOverridePercent(1, DEFAULT_PLATFORM_CONFIG, 'gold')).toBe(4);
    expect(getAgencyOverridePercent(1, DEFAULT_PLATFORM_CONFIG, 'royal')).toBe(4);
    expect(getAgencyOverridePercent(30, DEFAULT_PLATFORM_CONFIG)).toBe(4);

    // Sub-Scout is 0% (no pyramid / multi-level override)
    expect(getAgencyOverridePercent(5, DEFAULT_PLATFORM_CONFIG, 'starter', true)).toBe(4);

    // Kring Partner payout on a ฿740 booking where Kring net fee is ฿147 -> 20% = ฿29
    const activePartner = calculateKringPartnerPayout({
      kringNetFeeThb: 147,
      hostMonthsOnKring: 3,
      hostRating: 4.8,
      hostNoShowRate: 0.01,
      completedBookingsWithDistinctTravellers: 3,
      activationBonusAlreadyPaid: false,
    });
    expect(activePartner.eligible).toBe(true);
    expect(activePartner.partnerBookingShareThb).toBe(29);
    expect(activePartner.activationBonusThb).toBe(150);
    expect(activePartner.kringRetainedNetThb).toBe(118);

    // Month 7+ pays ฿0 to partner
    const expiredWindow = calculateKringPartnerPayout({
      kringNetFeeThb: 147,
      hostMonthsOnKring: 7,
      hostRating: 4.9,
      hostNoShowRate: 0,
    });
    expect(expiredWindow.eligible).toBe(false);
    expect(expiredWindow.partnerBookingShareThb).toBe(0);

    // Quality gate: rating < 4.6 or no-shows >= 5% pauses partner pay
    const lowQuality = calculateKringPartnerPayout({
      kringNetFeeThb: 147,
      hostMonthsOnKring: 2,
      hostRating: 4.4,
      hostNoShowRate: 0.06,
    });
    expect(lowQuality.eligible).toBe(false);
    expect(lowQuality.partnerBookingShareThb).toBe(0);

    const { agency_packages } = DEFAULT_PLATFORM_CONFIG;
    expect(agency_packages.starter.auto_assigned_hosts_per_month).toBe(0);
    expect(agency_packages.gold.auto_assigned_hosts_per_month).toBe(0);
    expect(agency_packages.royal.auto_assigned_hosts_per_month).toBe(0);
  });

  it('enforces D-022: 80% Paid / 20% Bonus blended coin spend rule and Spend-Gated 2% Daily Jackpot', () => {
    const blend = calculateBlendedSpend(1_500, 10_000, 5_000); // 1,500c Cha Yen treat
    expect(blend.bonusCoinsUsed).toBe(300); // Max 20% from bonus_coins
    expect(blend.paidCoinsUsed).toBe(1_200); // 80% from paid_coins
    expect(blend.bonusCoinsUsed + blend.paidCoinsUsed).toBe(1_500);
    expect(DEFAULT_PLATFORM_CONFIG.daily_jackpot_pool_percent).toBe(2);
    expect(DEFAULT_PLATFORM_CONFIG.daily_jackpot_min_paid_coins_spend).toBe(10_000);
  });

  it('enforces KRING_PAYOUT_LEAKS & KRING_AGENCY_PLAN: Free Monday payout (>=฿500) vs ฿15 Withdraw Now, and ฿0 Host Release Fee (free to leave any time)', () => {
    expect(calculateHostGiftWithdrawalFeeThb(500, true)).toBe(0); // Scheduled Monday >= ฿500 is free
    expect(calculateHostGiftWithdrawalFeeThb(400, true)).toBe(15); // Below ฿500
    expect(calculateHostGiftWithdrawalFeeThb(600, false)).toBe(15); // Manual "Withdraw now" any day is ฿15 paid by host

    const releaseSplit = calculateRosterReleaseSplit();
    expect(releaseSplit.totalFeeCoins).toBe(0); // ฿0 — hosts can leave any partner at any time for free
    expect(releaseSplit.platformShareCoins).toBe(0);
    expect(releaseSplit.agencySharePoints).toBe(0);
  });

  it('enforces B2B 4-Stream Commercial Model (Stream 1: 20%–35% Voucher Spread + 100% Upfront Net Rate, Stream 2: ฿1,990/mo Meeting Point Pin, Stream 3: ฿3,990/mo Featured Slot, Stream 4: 70% Kring / 30% Host Baht-only Add-On Bonus with zero % on UI)', () => {
    const { b2bPartnerEngine } = DEFAULT_PLATFORM_CONFIG;
    expect(b2bPartnerEngine.b2bVoucherSpreadMinShare).toBe(0.20);
    expect(b2bPartnerEngine.b2bVoucherSpreadMaxShare).toBe(0.35);
    expect(b2bPartnerEngine.upfrontPartnerNetSettlementPct).toBe(100);
    expect(b2bPartnerEngine.verifiedMeetingPointMonthlyBaht).toBe(1990);
    expect(b2bPartnerEngine.foundingTrialDays).toBe(30);
    expect(b2bPartnerEngine.featuredSlotMonthlyBaht).toBe(3990);
    expect(b2bPartnerEngine.featuredSlotAlternativeShare).toBe(0.25);
    expect(b2bPartnerEngine.hostAddonCommissionShare).toBe(0.30);
    expect(b2bPartnerEngine.kringAddonCommissionShare).toBe(0.70);
    expect(b2bPartnerEngine.displayPercentagesOnUi).toBe(false);

    // Stream 4 direct helper check (e.g. ฿420 total partner spread -> ฿126 Host Bonus / ฿294 Kring Retained)
    const addon = calculateHostAddonBonusBaht(420);
    expect(addon.hostBonusBaht).toBe(126);
    expect(addon.kringRetainedBaht).toBe(294);
    expect(addon.hostBonusBaht + addon.kringRetainedBaht).toBe(420);
    expect(addon.hostBadgeLabel).toBe('🎁 +฿126 Host Bonus on QR Scan');
    expect(addon.hostBadgeLabel).not.toContain('%');

    // Edge case: zero or negative commission
    const zeroAddon = calculateHostAddonBonusBaht(0);
    expect(zeroAddon.hostBonusBaht).toBe(0);
    expect(zeroAddon.kringRetainedBaht).toBe(0);
    expect(zeroAddon.hostBadgeLabel).toBe('🎁 +฿0 Host Bonus on QR Scan');
    expect(zeroAddon.hostBadgeLabel).not.toContain('%');

    // Full Stream 1 + Stream 4 voucher spread math (e.g. Chao Phraya Dinner Cruise: Walk-in ฿1,800, Kring Price ฿1,490, Partner 100% Upfront Net ฿1,070 -> ฿420 spread = 28.19% within 20%–35% band)
    const cruiseSpread = calculateB2BVoucherSpreadAndHostBonusBaht({
      walkInPriceBaht: 1800,
      kringPriceBaht: 1490,
      partnerUpfrontNetBaht: 1070,
      serviceFeeBaht: 25,
    });
    expect(cruiseSpread.upfrontNetSettlementPct).toBe(100);
    expect(cruiseSpread.guestSavingsVsWalkInBaht).toBe(310);
    expect(cruiseSpread.totalB2BSpreadBaht).toBe(420);
    expect(cruiseSpread.spreadWithinTargetBand).toBe(true);
    expect(cruiseSpread.hostBonusBaht).toBe(126);
    expect(cruiseSpread.kringRetainedFromSpreadBaht).toBe(294);
    expect(cruiseSpread.totalKringGrossMarginBaht).toBe(319); // ฿294 + ฿25 service fee
    expect(cruiseSpread.hostBadgeLabel).not.toContain('%');
  });

  it('enforces walletCoinValidity: 365-day paid coin validity (auto-fulfill voucher pack at expiry) and 90-day promotional bonus coin expiry', () => {
    const { walletCoinValidity } = DEFAULT_PLATFORM_CONFIG;
    expect(walletCoinValidity.paidCoinValidityDays).toBe(365);
    expect(walletCoinValidity.bonusCoinValidityDays).toBe(90);
    expect(walletCoinValidity.autoFulfillVoucherPackAtExpiry).toBe(true);
    expect(walletCoinValidity.allowRestoreAfterExpiry).toBe(false);

    const paidActive = evaluateWalletCoinExpiryRule('paid', 365);
    expect(paidActive.isExpired).toBe(false);
    expect(paidActive.daysRemaining).toBe(0);
    expect(paidActive.actionOnExpiry).toBe('AUTO_FULFILL_VOUCHER_PACK');

    const paidExpired = evaluateWalletCoinExpiryRule('paid', 366);
    expect(paidExpired.isExpired).toBe(true);
    expect(paidExpired.actionOnExpiry).toBe('AUTO_FULFILL_VOUCHER_PACK');

    const bonusActive = evaluateWalletCoinExpiryRule('bonus', 90);
    expect(bonusActive.isExpired).toBe(false);
    expect(bonusActive.daysRemaining).toBe(0);
    expect(bonusActive.actionOnExpiry).toBe('EXPIRE_PROMO_BONUS');

    const bonusExpired = evaluateWalletCoinExpiryRule('bonus', 91);
    expect(bonusExpired.isExpired).toBe(true);
    expect(bonusExpired.actionOnExpiry).toBe('EXPIRE_PROMO_BONUS');
  });
});


