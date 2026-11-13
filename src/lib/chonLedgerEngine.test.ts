import { describe, expect, it } from 'vitest'
import {
  ChonLedgerStore,
  calculateAgencyRollingOverrideRate,
  calculateCfoLuckySpinSplit,
  calculateCfoProtectedMeetSplit,
  calculateDynamicCabFareAndRebate,
  calculateFastCashoutQuote,
  calculateMeetSettlementSplit,
  calculateSelfFundingReferralMilestones,
  evaluateDailyTaskLeakArmor,
  formatPureCoinWinPill,
  getBoard3ValueEstimates,
  validateUncappedChonOffer,
} from './chonLedgerEngine'

describe('T-017 Level 2 — Chon! Wallet Double-Entry Ledger & Uncapped Meet-Only Escrow', () => {
  it('enforces the ฿300 minimum floor (or host custom min) with zero upper cap (฿300 to ∞)', () => {
    expect(validateUncappedChonOffer(250, 300)).toEqual({
      valid: false,
      effectiveMinThb: 300,
      requiredPaidCoins: 25_000,
      reason: 'Minimum Chon! Request is ฿300 (🪙 30,000).',
    })

    expect(validateUncappedChonOffer(300, 300)).toEqual({
      valid: true,
      effectiveMinThb: 300,
      requiredPaidCoins: 30_000,
    })

    // Host sets custom minimum of ฿1,500; guest bids uncapped ฿25,000 (🪙 2,500,000)
    expect(validateUncappedChonOffer(1_200, 1_500).valid).toBe(false)
    expect(validateUncappedChonOffer(25_000, 1_500)).toEqual({
      valid: true,
      effectiveMinThb: 1_500,
      requiredPaidCoins: 2_500_000,
    })
  })

  it('places an idempotent escrow hold using Paid Coins only (Bonus Coins can never fund Hangout holds)', () => {
    const ledger = new ChonLedgerStore()
    ledger.seedWallet('guest-1', { paidCoins: 50_000, bonusCoins: 40_000, hostBahtBalance: 0 })

    // Attempting a ฿600 (60,000c) hold must fail even though paid + bonus = 90,000c
    expect(() =>
      ledger.placeChonRequestHold({
        idempotencyKey: 'hold-too-high',
        guestId: 'guest-1',
        hostId: 'host-mint',
        offerThb: 600,
      }),
    ).toThrow(/insufficient paid coins/i)

    // Placing a ฿300 (30,000c) hold succeeds and is idempotent on retry
    const first = ledger.placeChonRequestHold({
      idempotencyKey: 'hold-mint-300',
      guestId: 'guest-1',
      hostId: 'host-mint',
      offerThb: 300,
    })
    const duplicate = ledger.placeChonRequestHold({
      idempotencyKey: 'hold-mint-300',
      guestId: 'guest-1',
      hostId: 'host-mint',
      offerThb: 300,
    })

    expect(duplicate.holdId).toBe(first.holdId)
    expect(ledger.getWallet('guest-1').paidCoins).toBe(20_000)
    expect(ledger.getWallet('guest-1').escrowHeldCoins).toBe(30_000)
    expect(ledger.getWallet('guest-1').bonusCoins).toBe(40_000)
    expect(ledger.verifyZeroSumInvariant()).toBe(true)
  })

  it('auto-releases 100% of held coins back to Chon! Wallet when Guest and Host do not meet (0 🪙 charged)', () => {
    const ledger = new ChonLedgerStore()
    ledger.seedWallet('guest-1', { paidCoins: 120_000, bonusCoins: 5_000, hostBahtBalance: 0 })

    const hold = ledger.placeChonRequestHold({
      idempotencyKey: 'hold-ploy-1200',
      guestId: 'guest-1',
      hostId: 'host-ploy',
      offerThb: 1_200,
    })
    expect(ledger.getWallet('guest-1').paidCoins).toBe(0)
    expect(ledger.getWallet('guest-1').escrowHeldCoins).toBe(120_000)

    const release = ledger.releaseUnmetHoldToChonWallet({
      idempotencyKey: 'release-ploy-1200',
      holdId: hold.holdId,
    })

    expect(release.chargedCoins).toBe(0)
    expect(release.releasedCoins).toBe(120_000)
    expect(ledger.getWallet('guest-1').paidCoins).toBe(120_000)
    expect(ledger.getWallet('guest-1').escrowHeldCoins).toBe(0)
    expect(ledger.verifyZeroSumInvariant()).toBe(true)
  })

  it('deducts held coins ONLY once Guest & Host meet in person, paying 80% to Host and 8%–16% max platform-funded override to Agency', () => {
    const ledger = new ChonLedgerStore()
    ledger.seedWallet('guest-1', { paidCoins: 100_000, bonusCoins: 0, hostBahtBalance: 0 })
    ledger.seedWallet('host-mint', { paidCoins: 0, bonusCoins: 0, hostBahtBalance: 0 })
    ledger.seedWallet('agency-bkk', { paidCoins: 0, bonusCoins: 0, hostBahtBalance: 0 })

    const hold = ledger.placeChonRequestHold({
      idempotencyKey: 'hold-meet-1000',
      guestId: 'guest-1',
      hostId: 'host-mint',
      offerThb: 1_000,
    })

    const settlement = ledger.settleMeetInPerson({
      idempotencyKey: 'settle-meet-1000',
      holdId: hold.holdId,
      agencyId: 'agency-bkk',
      agencyRolling30dVolumeThb: 250_000, // Kring Partner 20% of net (~4% gross)
    })

    // Host ALWAYS gets 80% (฿800), Kring Partner gets 4% (฿40) paid by Kring, Platform keeps remaining 16% (฿160)
    expect(settlement.hostBahtEarned).toBe(800)
    expect(settlement.agencyOverrideBaht).toBe(40)
    expect(settlement.platformNetBaht).toBe(160)
    expect(ledger.getWallet('host-mint').hostBahtBalance).toBe(800)
    expect(ledger.getWallet('agency-bkk').hostBahtBalance).toBe(40)
    expect(ledger.getWallet('guest-1').escrowHeldCoins).toBe(0)
    expect(ledger.verifyZeroSumInvariant()).toBe(true)
  })

  it('enforces KRING_AGENCY_PLAN: Kring Partners 20% of net fee (~4% gross, capped at 5% / 25% of net), 6-month host limit, and 0% Sub-Scout', () => {
    // 1. Kring Partner rolling 30-day rates within 6-month host window
    expect(calculateAgencyRollingOverrideRate(40_000)).toEqual({
      tierName: 'Bronze',
      overridePct: 4,
    })
    expect(calculateAgencyRollingOverrideRate(120_000)).toEqual({
      tierName: 'Silver',
      overridePct: 4,
    })
    expect(calculateAgencyRollingOverrideRate(400_000)).toEqual({
      tierName: 'Gold',
      overridePct: 5,
    })

    // 2. 6-month host window & rolling 30-day boundary: Month 7+ or day 31+ pays 0%
    expect(calculateAgencyRollingOverrideRate(450_000, 30, 6)).toEqual({
      tierName: 'Gold',
      overridePct: 5,
    })
    expect(calculateAgencyRollingOverrideRate(450_000, 30, 7)).toEqual({
      tierName: 'Bronze',
      overridePct: 0,
    })
    expect(calculateAgencyRollingOverrideRate(450_000, 31, 3)).toEqual({
      tierName: 'Bronze',
      overridePct: 0,
    })

    // 3. 4% Partner share + 0% Sub-Scout (no pyramid pay)
    const partnerSettlement = calculateMeetSettlementSplit({
      grossThb: 1_000,
      agencyOverridePct: 4,
      hasSubScout: true,
    })
    expect(partnerSettlement.hostBaht).toBe(800)
    expect(partnerSettlement.agencyBaht).toBe(40)
    expect(partnerSettlement.subScoutBaht).toBe(0)
    expect(partnerSettlement.effectiveOverridePct).toBe(4)
    expect(partnerSettlement.platformNetBaht).toBe(160)
    expect(
      partnerSettlement.hostBaht +
        partnerSettlement.agencyBaht +
        partnerSettlement.subScoutBaht +
        partnerSettlement.platformNetBaht,
    ).toBe(1_000)

    // 4. Hard cap at 5% gross (25% of platform fee) even if higher % is passed
    const cappedPartner = calculateMeetSettlementSplit({
      grossThb: 1_000,
      agencyOverridePct: 16,
      hasSubScout: true,
    })
    expect(cappedPartner.hostBaht).toBe(800) // 80%
    expect(cappedPartner.effectiveOverridePct).toBe(5) // Capped at 5% max!
    expect(cappedPartner.agencyBaht + cappedPartner.subScoutBaht).toBe(50)
    expect(cappedPartner.platformNetBaht).toBe(150) // Guaranteed 15% platform net margin remaining
  })

  it('enforces KRING_PAYOUT_LEAKS: ฿15 fee on "Withdraw now" and ฿0 fee on scheduled Monday payout (≥ ฿500)', () => {
    const withdrawNow = calculateFastCashoutQuote({
      amountThb: 500,
      isFirstLifetimeCashout: false,
      channel: 'PromptPay',
    })
    expect(withdrawNow).toEqual({
      allowed: true,
      grossThb: 500,
      feeThb: 15,
      netThbToBank: 485,
      estimatedSeconds: 5,
      channel: 'PromptPay',
    })

    const scheduledMonday = calculateFastCashoutQuote({
      amountThb: 1_500,
      isFirstLifetimeCashout: false,
      channel: 'PromptPay',
      isScheduledMondayPayout: true,
    })
    expect(scheduledMonday).toEqual({
      allowed: true,
      grossThb: 1_500,
      feeThb: 0,
      netThbToBank: 1_500,
      estimatedSeconds: 5,
      channel: 'PromptPay',
    })
  })

  it('formats pure +🪙 win pills with zero extra words and calculates dynamic cab fares (-% + 🪙) & Board 3 estimates', () => {
    expect(formatPureCoinWinPill(4_500)).toBe('+🪙 4,500')
    expect(formatPureCoinWinPill(50_000)).toBe('+🪙 50,000')

    const camryQuote = calculateDynamicCabFareAndRebate({
      vehicle: 'camry',
      passengerMode: 'host',
      pickupLabel: 'Host Verified Pin (Hidden)',
      dropoffLabel: 'Tichuca Rooftop Bar',
    })
    expect(camryQuote.counterThb).toBe(850)
    expect(camryQuote.chonFareThb).toBe(480)
    expect(camryQuote.discountPct).toBe(43)
    expect(camryQuote.rebateCoins).toBe(3_500)
    expect(camryQuote.hostPinHidden).toBe(true)
    expect(camryQuote.savingsPillText).toBe('Save ฿370 😱 🔥 (-43% + 🪙 3,500)')

    const estimates = getBoard3ValueEstimates()
    expect(estimates.traveler4NightSavingsThb).toBe(4_000)
    expect(estimates.traveler4NightFreeCoins).toBe(21_000)
    expect(estimates.hostMonthlyCasualThb).toBe(18_000)
    expect(estimates.hostMonthlyActiveThb).toBe(52_000)
    expect(estimates.hostMonthlyTopVipRangeThb).toEqual([95_000, 140_000])
    expect(estimates.agency10GuestsBountyThb).toBe(5_550)
    expect(estimates.agency5HostsMonthlyThb).toBe(30_000)
    expect(estimates.agency15HostsDiamondRangeThb).toEqual([110_000, 165_000])
  })

  it('enforces MOD1-17 CFO net margin floor (9%–15% on Hangouts & 6.5% on Lucky Spins) and self-funding 3% referral milestones', () => {
    const diamondSplit = calculateCfoProtectedMeetSplit({
      grossThb: 1_500,
      rolling30dVolumeThb: 900_000,
      hasSubScout: true,
    })
    expect(diamondSplit.hostBaht).toBe(1_200) // 80%
    expect(diamondSplit.agencyCapPct).toBe(10) // Capped at 10% of gross (50% of platform fee)
    expect(diamondSplit.agencyBaht).toBe(150)
    expect(diamondSplit.subScoutBaht).toBe(15) // +1% Sub-Scout
    expect(diamondSplit.platformNetBaht).toBe(135) // Guaranteed 9% net margin floor!

    const luckySpin = calculateCfoLuckySpinSplit({ spinCoins: 10_000 })
    expect(luckySpin.rtpPoolCoins).toBe(8_000) // 80%
    expect(luckySpin.hostCoins).toBe(1_200) // 12%
    expect(luckySpin.agencyCoins).toBe(150) // 1.5%
    expect(luckySpin.houseNetProfitCoins).toBe(650) // 6.5% locked house profit

    const milestones = calculateSelfFundingReferralMilestones()
    expect(milestones.totalBountyThb).toBe(555)
    expect(milestones.steps).toHaveLength(4)
    expect(milestones.steps[0]).toEqual({
      step: 1,
      requiredSpendThb: 1_000,
      requiredPaidCoins: 100_000,
      rewardThb: 30,
    })
  })

  it('closes all 3 MOD1-19 daily task and zero-deposit bot leaks', () => {
    const mysteryDraw = evaluateDailyTaskLeakArmor({
      taskType: 'mystery_box_1000',
      hasVerifiedFirstTopUpThb300: true,
      rollBasisPoints: 5000,
    })
    expect(mysteryDraw.allowed).toBe(true)
    expect(mysteryDraw.houseProfitLockedCoins).toBe(80)
    expect(mysteryDraw.hostPoolLockedCoins).toBe(120)
    expect(mysteryDraw.rewardCoins).toBeGreaterThanOrEqual(200)

    const storyToastReward = evaluateDailyTaskLeakArmor({
      taskType: 'story_toast_3x',
      hasVerifiedFirstTopUpThb300: true,
    })
    expect(storyToastReward.rewardCoins).toBe(15) // Capped at +15 coins (locks +45 net profit!)

    const blockedBotChest = evaluateDailyTaskLeakArmor({
      taskType: 'starter_chest_500',
      hasVerifiedFirstTopUpThb300: false,
    })
    expect(blockedBotChest.allowed).toBe(false)
    expect(blockedBotChest.rewardCoins).toBe(0)

    const unlockedChest = evaluateDailyTaskLeakArmor({
      taskType: 'starter_chest_500',
      hasVerifiedFirstTopUpThb300: true,
    })
    expect(unlockedChest.allowed).toBe(true)
    expect(unlockedChest.rewardCoins).toBe(500)
  })

  it('enforces MOD1-22 Starter-Stage 3-Item Minimalist VIP (free on ฿3,000+ top-up or ฿490 7-day pass, 0 chat timers, 3 perks)', async () => {
    const { evaluateMinimalistStarterVipStatus } = await import('./chonLedgerEngine')
    const freeGuest = evaluateMinimalistStarterVipStatus({ rolling30dTopUpThb: 500 })
    expect(freeGuest.isVerifiedVip).toBe(false)
    expect(freeGuest.chatCooldownTimers).toBe(0)
    expect(freeGuest.lockedSearchFilters).toBe(0)

    const topUpVip = evaluateMinimalistStarterVipStatus({ rolling30dTopUpThb: 3_000 })
    expect(topUpVip.isVerifiedVip).toBe(true)
    expect(topUpVip.vipDurationDays).toBe(30)
    expect(topUpVip.retainedCoinSpendPct).toBe(100)
    expect(topUpVip.perks).toEqual({
      goldCrownAndTopOfInboxPin: true,
      incognitoStealthMode: true,
      freeTopRowBoostIncluded: 1,
      aLaCarteTopRowBoostCoins: 5_000,
    })

    const holidayVip = evaluateMinimalistStarterVipStatus({
      rolling30dTopUpThb: 200,
      purchased7DayHolidayPassThb490: true,
    })
    expect(holidayVip.isVerifiedVip).toBe(true)
    expect(holidayVip.vipDurationDays).toBe(7)
    expect(holidayVip.perks.freeTopRowBoostIncluded).toBe(1)
  })

  it('enforces Kring v3.0 / v4.0 Zero-MoR money invariants: +฿25 flat service fee, <=100m GPS bump release (80% -> 83% -> 85%), 100% 72h tips, <=3 sessions/day/pair, and ฿3,000/day (฿1,000 48h) pair caps', async () => {
    const {
      KRING_FLAT_SERVICE_FEE_THB,
      KRING_ATM_FEE_DISCLOSURE_EN,
      calculateKringV3BumpEscrowRelease,
      calculateKringPostBumpTipSplit,
      evaluateKringPairDailyAndSessionGuards,
      resolveKringHostTierByCompletedSessions,
    } = await import('./chonLedgerEngine')

    expect(KRING_FLAT_SERVICE_FEE_THB).toBe(25)
    expect(KRING_ATM_FEE_DISCLOSURE_EN).toBe(
      'No ATM needed — Thai ATMs charge ฿220–250 a withdrawal',
    )

    // 1. Host Tier Progression: 80% New -> 83% Pro (5+ sessions) -> 85% Star (20+ sessions)
    expect(resolveKringHostTierByCompletedSessions(0)).toEqual({
      tier: 'NEW_HOST_80',
      hostSharePct: 80,
      kringRetentionPct: 20,
    })
    expect(resolveKringHostTierByCompletedSessions(5)).toEqual({
      tier: 'PRO_HOST_83',
      hostSharePct: 83,
      kringRetentionPct: 17,
    })
    expect(resolveKringHostTierByCompletedSessions(20)).toEqual({
      tier: 'STAR_HOST_85',
      hostSharePct: 85,
      kringRetentionPct: 15,
    })

    // 2. Ordinary Local Host Activity (฿1,200 + ฿25 fee) — blocks if >100m away, releases at <=100m
    const tooFar = calculateKringV3BumpEscrowRelease({
      activityFeeThb: 1200,
      completedHostSessions: 22,
      gpsDistanceMeters: 145,
      namedPublicVenue: 'River City Bangkok Public Pier Gate',
      payRail: 'UPI_IN',
    })
    expect(tooFar.released).toBe(false)
    expect(tooFar.reason).toMatch(/<= 100m/)

    const newHostBump = calculateKringV3BumpEscrowRelease({
      activityFeeThb: 1000,
      completedHostSessions: 2,
      gpsDistanceMeters: 42,
      namedPublicVenue: 'Ari BTS Station Exit 3',
      payRail: 'UPI_IN',
    })
    expect(newHostBump.released).toBe(true)
    expect(newHostBump.travellerTotalPaidThb).toBe(1025)
    expect(newHostBump.hostPayoutThb).toBe(800) // 80%
    expect(newHostBump.kringCommissionThb).toBe(200) // 20%
    expect(newHostBump.kringTotalRetainedThb).toBe(225) // 20% + ฿25

    const proHostBump = calculateKringV3BumpEscrowRelease({
      activityFeeThb: 1000,
      completedHostSessions: 8,
      gpsDistanceMeters: 85,
      namedPublicVenue: 'Wat Mangkon MRT Exit 1',
      payRail: 'WECHAT_PAY_CN',
    })
    expect(proHostBump.released).toBe(true)
    expect(proHostBump.hostPayoutThb).toBe(830) // 83%
    expect(proHostBump.kringTotalRetainedThb).toBe(195) // 17% + ฿25

    const starHostBump = calculateKringV3BumpEscrowRelease({
      activityFeeThb: 1600,
      completedHostSessions: 25,
      gpsDistanceMeters: 100,
      namedPublicVenue: 'Tha Tien Public Sunset Deck',
      payRail: 'TRUEMONEY_RU_TH',
    })
    expect(starHostBump.released).toBe(true)
    expect(starHostBump.travellerTotalPaidThb).toBe(1625)
    expect(starHostBump.hostPayoutThb).toBe(1360) // 85%
    expect(starHostBump.kringCommissionThb).toBe(240) // 15%
    expect(starHostBump.kringTotalRetainedThb).toBe(265) // 15% + ฿25

    // 3. Post-Bump Tips (฿50 · ฿100 · ฿200 · ฿500 within 72h -> 100% to Host, ฿0 Kring fee)
    for (const tipAmt of [50, 100, 200, 500]) {
      const tip = calculateKringPostBumpTipSplit({
        tipThb: tipAmt,
        hoursSinceBump: 12,
        bumpCompleted: true,
      })
      expect(tip).toEqual({
        allowed: true,
        tipThb: tipAmt,
        hostReceivesThb: tipAmt,
        kringFeeThb: 0,
      })
    }
    expect(
      calculateKringPostBumpTipSplit({ tipThb: 500, hoursSinceBump: 73, bumpCompleted: true })
        .allowed,
    ).toBe(false)
    expect(
      calculateKringPostBumpTipSplit({ tipThb: 300, hoursSinceBump: 10, bumpCompleted: true })
        .allowed,
    ).toBe(false)

    // 4. Guards: <=3 sessions/day/pair + ฿3,000/day pair cap (฿1,000 first 48h)
    const newBuyerOk = evaluateKringPairDailyAndSessionGuards({
      sessionsCompletedTodayForPair: 1,
      requestedSessionNumberToday: 2,
      hasNamedPublicPlace: true,
      hasDedicated100mBumpGate: true,
      pairSpendTodayThb: 400,
      newSpendAmountThb: 600,
      buyerAccountAgeHours: 24, // < 48h -> ฿1,000 cap
    })
    expect(newBuyerOk.allowed).toBe(true)
    expect(newBuyerOk.effectiveDailyCapThb).toBe(1000)
    expect(newBuyerOk.remainingPairCapThb).toBe(0)

    const newBuyerOverCap = evaluateKringPairDailyAndSessionGuards({
      sessionsCompletedTodayForPair: 1,
      requestedSessionNumberToday: 2,
      hasNamedPublicPlace: true,
      hasDedicated100mBumpGate: true,
      pairSpendTodayThb: 800,
      newSpendAmountThb: 300,
      buyerAccountAgeHours: 12,
    })
    expect(newBuyerOverCap.allowed).toBe(false)
    expect(newBuyerOverCap.reason).toMatch(/฿1,000\/day/)

    const establishedBuyerCap = evaluateKringPairDailyAndSessionGuards({
      sessionsCompletedTodayForPair: 2,
      requestedSessionNumberToday: 3,
      hasNamedPublicPlace: true,
      hasDedicated100mBumpGate: true,
      pairSpendTodayThb: 2500,
      newSpendAmountThb: 500,
      buyerAccountAgeHours: 120, // >= 48h -> ฿3,000 cap
    })
    expect(establishedBuyerCap.allowed).toBe(true)
    expect(establishedBuyerCap.effectiveDailyCapThb).toBe(3000)

    const fourthSessionBlocked = evaluateKringPairDailyAndSessionGuards({
      sessionsCompletedTodayForPair: 3,
      requestedSessionNumberToday: 4,
      hasNamedPublicPlace: true,
      hasDedicated100mBumpGate: true,
      pairSpendTodayThb: 1000,
      newSpendAmountThb: 500,
      buyerAccountAgeHours: 120,
    })
    expect(fourthSessionBlocked.allowed).toBe(false)
    expect(fourthSessionBlocked.reason).toMatch(/Maximum 3 activity sessions/)
  })
})

