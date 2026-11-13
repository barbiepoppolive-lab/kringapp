/**
 * Level 2 Double-Entry Chon! Wallet Ledger, Uncapped Meet-Only Escrow Holds,
 * 80% 5-Second Host Cashout & 3-Tier (8%–16% max) Platform-Funded Agency Override Engine (T-017 / D-035)
 */

export const CHON_MIN_OFFER_THB = 300
export const COINS_PER_THB = 100
export const HOST_PAYOUT_SHARE_PCT = 80
export const SUB_SCOUT_OVERRIDE_PCT = 0
export const AGENCY_OVERRIDE_MAX_PCT = 5
export const FREE_CASHOUT_THRESHOLD_THB = 500
export const UNDER_THRESHOLD_CASHOUT_FEE_THB = 15

export type CashoutChannel = 'PromptPay' | 'KBank' | 'TrueMoney'
export type AgencyTierName = 'Bronze' | 'Silver' | 'Gold'

export interface ChonWalletAccount {
  userId: string
  paidCoins: number
  bonusCoins: number
  escrowHeldCoins: number
  hostBahtBalance: number
}

export interface LedgerEntryRecord {
  id: string
  idempotencyKey: string
  accountId: string
  debitCoins: number
  creditCoins: number
  memo: string
  createdAt: string
}

export interface EscrowHoldRecord {
  holdId: string
  idempotencyKey: string
  guestId: string
  hostId: string
  offerThb: number
  heldPaidCoins: number
  status:
    | 'HELD'
    | 'ACCEPTED'
    | 'SETTLED_ON_MEET'
    | 'RELEASED_TO_CHON_WALLET'
    | 'NO_SHOW_GUEST'
    | 'NO_SHOW_HOST'
    | 'CANCELLED_MUTUAL_WALKAWAY'
    | 'DISPUTED'
}

export function validateUncappedChonOffer(
  offerThb: number,
  hostCustomMinThb: number = CHON_MIN_OFFER_THB,
): {
  valid: boolean
  effectiveMinThb: number
  requiredPaidCoins: number
  reason?: string
} {
  const effectiveMinThb = Math.max(CHON_MIN_OFFER_THB, Math.floor(hostCustomMinThb))
  const cleanOfferThb = Math.floor(offerThb)
  const requiredPaidCoins = cleanOfferThb * COINS_PER_THB

  if (!Number.isFinite(cleanOfferThb) || cleanOfferThb < effectiveMinThb) {
    return {
      valid: false,
      effectiveMinThb,
      requiredPaidCoins: Math.max(0, requiredPaidCoins),
      reason: `Minimum Chon! Request is ฿${effectiveMinThb.toLocaleString('en-US')} (🪙 ${(effectiveMinThb * COINS_PER_THB).toLocaleString('en-US')}).`,
    }
  }

  return {
    valid: true,
    effectiveMinThb,
    requiredPaidCoins,
  }
}

export function calculateAgencyRollingOverrideRate(
  rolling30dVolumeThb: number,
  daysSinceSettlement: number = 30,
  hostMonthsOnKring: number = 1,
): {
  tierName: AgencyTierName
  overridePct: 0 | 4 | 5
} {
  // KRING_AGENCY_PLAN: Partner earns 20% of Kring's net fee (~4% gross, capped at 5% / 25% of net) for first 6 months only
  if (hostMonthsOnKring > 6 || daysSinceSettlement > 30) {
    return { tierName: 'Bronze', overridePct: 0 }
  }
  const qualifiedVolumeThb = Math.max(0, rolling30dVolumeThb)
  if (qualifiedVolumeThb >= 400_000) {
    return { tierName: 'Gold', overridePct: 5 }
  }
  if (qualifiedVolumeThb >= 120_000) {
    return { tierName: 'Silver', overridePct: 4 }
  }
  return { tierName: 'Bronze', overridePct: 4 }
}

export function calculateEffectiveAgencyOverridePct(params: {
  tierRatePct: number
  hasSubScout?: boolean
  maxOverridePct?: number
}): number {
  const maxCap = params.maxOverridePct ?? AGENCY_OVERRIDE_MAX_PCT
  const cleanTier = Math.max(0, Math.min(maxCap, params.tierRatePct))
  if (cleanTier <= 0) return 0
  const subScoutBonus = params.hasSubScout ? SUB_SCOUT_OVERRIDE_PCT : 0
  return Math.min(cleanTier + subScoutBonus, maxCap)
}

export function calculateMeetSettlementSplit(params: {
  grossThb: number
  agencyOverridePct?: number
  hasSubScout?: boolean
  maxOverridePct?: number
}): {
  hostBaht: number
  agencyBaht: number
  subScoutBaht: number
  effectiveOverridePct: number
  platformNetBaht: number
} {
  const gross = Math.max(0, Math.floor(params.grossThb))
  // Host ALWAYS keeps 100% of their 80% share — zero agency cut from host!
  const hostBaht = Math.round((gross * HOST_PAYOUT_SHARE_PCT) / 100)
  const platformGrossPool = gross - hostBaht

  const maxCap = params.maxOverridePct ?? AGENCY_OVERRIDE_MAX_PCT
  const rawAgencyPct = Math.max(0, Math.min(maxCap, params.agencyOverridePct ?? 0))
  const effectiveOverridePct =
    rawAgencyPct > 0
      ? calculateEffectiveAgencyOverridePct({
          tierRatePct: rawAgencyPct,
          hasSubScout: params.hasSubScout,
          maxOverridePct: maxCap,
        })
      : 0
  const effectiveSubScoutPct = Math.max(0, effectiveOverridePct - rawAgencyPct)

  const rawAgencyBaht = Math.round((gross * rawAgencyPct) / 100)
  const agencyBaht = Math.min(platformGrossPool, rawAgencyBaht)

  const remainingAfterAgency = Math.max(0, platformGrossPool - agencyBaht)
  const rawSubScoutBaht = params.hasSubScout
    ? Math.round((gross * effectiveSubScoutPct) / 100)
    : 0
  const subScoutBaht = Math.min(remainingAfterAgency, rawSubScoutBaht)
  const platformNetBaht = Math.max(0, remainingAfterAgency - subScoutBaht)

  return {
    hostBaht,
    agencyBaht,
    subScoutBaht,
    effectiveOverridePct,
    platformNetBaht,
  }
}

/**
 * MOD1-17 Fix #3: Protect Chon! Net Margin Floor on 80% Host Split
 * Caps Agency Overrides at 5% -> 7% -> 9% -> 10% of Gross Volume (25%-50% of 20% Platform Fee)
 * + 1% Sub-Scout (5% of Platform Fee) so Chon! ALWAYS retains a guaranteed 9%–15% net margin!
 */
export function calculateCfoProtectedMeetSplit(params: {
  grossThb: number
  rolling30dVolumeThb: number
  hasSubScout?: boolean
}): {
  hostBaht: number
  agencyCapPct: 5 | 7 | 9 | 10
  agencyBaht: number
  subScoutBaht: number
  platformNetBaht: number
  platformNetMarginPct: number
} {
  const gross = Math.max(0, Math.floor(params.grossThb))
  const hostBaht = Math.round((gross * HOST_PAYOUT_SHARE_PCT) / 100)
  const platformFeePool = gross - hostBaht

  let agencyCapPct: 5 | 7 | 9 | 10 = 5
  if (params.rolling30dVolumeThb >= 800_000) {
    agencyCapPct = 10
  } else if (params.rolling30dVolumeThb >= 400_000) {
    agencyCapPct = 9
  } else if (params.rolling30dVolumeThb >= 120_000) {
    agencyCapPct = 7
  }

  const agencyBaht = Math.round((gross * agencyCapPct) / 100)
  const subScoutBaht = params.hasSubScout ? Math.round((gross * 1) / 100) : 0
  const platformNetBaht = Math.max(0, platformFeePool - agencyBaht - subScoutBaht)
  const platformNetMarginPct = gross > 0 ? Math.round((platformNetBaht / gross) * 100) : 0

  return {
    hostBaht,
    agencyCapPct,
    agencyBaht,
    subScoutBaht,
    platformNetBaht,
    platformNetMarginPct,
  }
}

/**
 * MOD1-17 Fix #3b: Cap Agency Override on Lucky Chon! spins at 1.5%
 * Locking 6.5% net house profit per spin (= 22.75% net profit after 3.5x Lucky churn).
 */
export function calculateCfoLuckySpinSplit(params: { spinCoins: number }): {
  rtpPoolCoins: number
  hostCoins: number
  agencyCoins: number
  houseNetProfitCoins: number
  effectiveChurnNetProfitPct: number
} {
  const coins = Math.max(0, Math.floor(params.spinCoins))
  const rtpPoolCoins = Math.round(coins * 0.8)
  const hostCoins = Math.round(coins * 0.12)
  const agencyCoins = Math.round(coins * 0.015)
  const houseNetProfitCoins = Math.max(0, coins - rtpPoolCoins - hostCoins - agencyCoins)
  return {
    rtpPoolCoins,
    hostCoins,
    agencyCoins,
    houseNetProfitCoins,
    effectiveChurnNetProfitPct: 22.75,
  }
}

/**
 * MOD1-17 Fix #4: Self-Funding 3% Referral Steps (฿555 Total Bounty on 100 🪙 = ฿1)
 */
export function calculateSelfFundingReferralMilestones(): {
  totalBountyThb: number
  effectiveRatePct: number
  steps: Array<{
    step: number
    requiredSpendThb: number
    requiredPaidCoins: number
    rewardThb: number
  }>
} {
  return {
    totalBountyThb: 555,
    effectiveRatePct: 3.0,
    steps: [
      { step: 1, requiredSpendThb: 1_000, requiredPaidCoins: 100_000, rewardThb: 30 },
      { step: 2, requiredSpendThb: 3_500, requiredPaidCoins: 350_000, rewardThb: 75 },
      { step: 3, requiredSpendThb: 8_500, requiredPaidCoins: 850_000, rewardThb: 150 },
      { step: 4, requiredSpendThb: 18_500, requiredPaidCoins: 1_850_000, rewardThb: 300 },
    ],
  }
}

/**
 * MOD1-19: Closing All 3 Daily Task & Free-Coin Leaks
 */
export function evaluateDailyTaskLeakArmor(params: {
  taskType: 'mystery_box_1000' | 'story_toast_3x' | 'starter_chest_500'
  hasVerifiedFirstTopUpThb300: boolean
  rollBasisPoints?: number
}): {
  allowed: boolean
  rewardCoins: number
  houseProfitLockedCoins: number
  hostPoolLockedCoins: number
  reason: string
} {
  if (params.taskType === 'mystery_box_1000') {
    const roll = params.rollBasisPoints ?? 5000
    const rewardCoins = roll >= 9500 ? 5_000 : roll >= 7000 ? 1_200 : roll >= 3500 ? 800 : 200
    return {
      allowed: true,
      rewardCoins,
      houseProfitLockedCoins: 80,
      hostPoolLockedCoins: 120,
      reason: '80% Return Pool Lucky draw (200–5,000 🪙) with +80 🪙 House Profit locked.',
    }
  }

  if (params.taskType === 'story_toast_3x') {
    return {
      allowed: true,
      rewardCoins: 15,
      houseProfitLockedCoins: 45,
      hostPoolLockedCoins: 240,
      reason: '3 Story Toasts (300 🪙) pays +15 🪙 daily reward (25% of 60 🪙 fee), locking +45 🪙 net profit.',
    }
  }

  if (!params.hasVerifiedFirstTopUpThb300) {
    return {
      allowed: false,
      rewardCoins: 0,
      houseProfitLockedCoins: 0,
      hostPoolLockedCoins: 0,
      reason: '🔒 Unlocks on Your First ฿300 Top-Up (Zero-Deposit Bot Shield).',
    }
  }

  return {
    allowed: true,
    rewardCoins: 500,
    houseProfitLockedCoins: 5_500,
    hostPoolLockedCoins: 24_000,
    reason: '✅ 500 🪙 (฿5) Starter Chest unlocked out of first ฿300 deposit platform fee.',
  }
}

export function calculateFastCashoutQuote(params: {
  amountThb: number
  isFirstLifetimeCashout: boolean
  channel: CashoutChannel
  isScheduledMondayPayout?: boolean
}): {
  allowed: boolean
  grossThb: number
  feeThb: number
  netThbToBank: number
  estimatedSeconds: number
  channel: CashoutChannel
  reason?: string
} {
  const minFloorThb = params.isScheduledMondayPayout ? FREE_CASHOUT_THRESHOLD_THB : 200
  const grossThb = Math.floor(params.amountThb)
  if (grossThb < minFloorThb) {
    return {
      allowed: false,
      grossThb,
      feeThb: 0,
      netThbToBank: 0,
      estimatedSeconds: 5,
      channel: params.channel,
      reason: `Minimum cashout is ฿${minFloorThb}.`,
    }
  }

  // KRING_PAYOUT_LEAKS #1 & #4: Free on scheduled Monday weekly run (>= ฿500); ฿15 paid by host for "Withdraw now"
  const feeThb =
    params.isScheduledMondayPayout && grossThb >= FREE_CASHOUT_THRESHOLD_THB
      ? 0
      : UNDER_THRESHOLD_CASHOUT_FEE_THB
  return {
    allowed: true,
    grossThb,
    feeThb,
    netThbToBank: grossThb - feeThb,
    estimatedSeconds: 5,
    channel: params.channel,
  }
}

export function formatPureCoinWinPill(rewardCoins: number): string {
  const clean = Math.max(0, Math.floor(rewardCoins))
  return `+🪙 ${clean.toLocaleString('en-US')}`
}

export function calculateDynamicCabFareAndRebate(params: {
  vehicle: 'camry' | 'alphard'
  passengerMode: 'host' | 'self' | 'both'
  pickupLabel: string
  dropoffLabel: string
}): {
  counterThb: number
  chonFareThb: number
  savedThb: number
  discountPct: number
  rebateCoins: number
  hostPinHidden: boolean
  savingsPillText: string
} {
  const isPattaya =
    params.pickupLabel.toLowerCase().includes('pattaya') ||
    params.dropoffLabel.toLowerCase().includes('pattaya')

  const counterThb =
    params.vehicle === 'camry'
      ? isPattaya
        ? 1_800
        : 850
      : isPattaya
        ? 2_900
        : 1_600

  const chonFareThb =
    params.vehicle === 'camry'
      ? isPattaya
        ? 1_090
        : 480
      : isPattaya
        ? 1_690
        : 890

  const savedThb = counterThb - chonFareThb
  const discountPct = Math.floor((savedThb / counterThb) * 100)
  const rebateCoins = params.vehicle === 'camry' ? 3_500 : 6_000
  const hostPinHidden = params.passengerMode === 'host' || params.passengerMode === 'both'

  return {
    counterThb,
    chonFareThb,
    savedThb,
    discountPct,
    rebateCoins,
    hostPinHidden,
    savingsPillText: `Save ฿${savedThb.toLocaleString('en-US')} 😱 🔥 (-${discountPct}% + 🪙 ${rebateCoins.toLocaleString('en-US')})`,
  }
}

export function getBoard3ValueEstimates() {
  return {
    traveler4NightSavingsThb: 4_000,
    traveler4NightFreeCoins: 21_000,
    hostPerHangoutRangeThb: [1_200, 3_000] as const,
    hostMonthlyCasualThb: 18_000,
    hostMonthlyActiveThb: 52_000,
    hostMonthlyTopVipRangeThb: [95_000, 140_000] as const,
    agency10GuestsBountyThb: 5_550,
    agency5HostsMonthlyThb: 30_000,
    agency15HostsDiamondRangeThb: [110_000, 165_000] as const,
  }
}

export function evaluateMinimalistStarterVipStatus(params: {
  rolling30dTopUpThb: number
  purchased7DayHolidayPassThb490?: boolean
}): {
  isVerifiedVip: boolean
  vipDurationDays: 0 | 7 | 30
  retainedCoinSpendPct: 100
  chatCooldownTimers: 0
  lockedSearchFilters: 0
  perks: {
    goldCrownAndTopOfInboxPin: boolean
    incognitoStealthMode: boolean
    freeTopRowBoostIncluded: number
    aLaCarteTopRowBoostCoins: 5_000
  }
} {
  const autoUnlocked30d = params.rolling30dTopUpThb >= 3_000
  const holidayPass7d = Boolean(params.purchased7DayHolidayPassThb490)
  const isVerifiedVip = autoUnlocked30d || holidayPass7d
  const vipDurationDays = autoUnlocked30d ? 30 : holidayPass7d ? 7 : 0

  return {
    isVerifiedVip,
    vipDurationDays,
    retainedCoinSpendPct: 100,
    chatCooldownTimers: 0,
    lockedSearchFilters: 0,
    perks: {
      goldCrownAndTopOfInboxPin: isVerifiedVip,
      incognitoStealthMode: isVerifiedVip,
      freeTopRowBoostIncluded: isVerifiedVip ? 1 : 0,
      aLaCarteTopRowBoostCoins: 5_000,
    },
  }
}

export class ChonLedgerStore {
  private wallets = new Map<string, ChonWalletAccount>()
  private holds = new Map<string, EscrowHoldRecord>()
  private idempotencyResults = new Map<string, unknown>()
  private idempotencyHashes = new Map<string, string>()
  private entries: LedgerEntryRecord[] = []

  private checkOrRecordIdempotency<T>(key: string, payload: Record<string, unknown>): T | undefined {
    const hash = JSON.stringify(payload)
    const existingHash = this.idempotencyHashes.get(key)
    if (existingHash !== undefined) {
      if (existingHash !== hash) {
        throw new Error(`Idempotency key conflict (${key}): payload differs from original request.`)
      }
      return this.idempotencyResults.get(key) as T
    }
    return undefined
  }

  private saveIdempotency<T>(key: string, payload: Record<string, unknown>, result: T): T {
    this.idempotencyHashes.set(key, JSON.stringify(payload))
    this.idempotencyResults.set(key, result)
    return result
  }

  seedWallet(
    userId: string,
    initial: {
      paidCoins: number
      bonusCoins: number
      hostBahtBalance: number
      escrowHeldCoins?: number
    },
  ): ChonWalletAccount {
    if (
      initial.paidCoins < 0 ||
      initial.bonusCoins < 0 ||
      initial.hostBahtBalance < 0
    ) {
      throw new Error('Wallet balances cannot be negative')
    }
    const acc: ChonWalletAccount = {
      userId,
      paidCoins: initial.paidCoins,
      bonusCoins: initial.bonusCoins,
      escrowHeldCoins: initial.escrowHeldCoins ?? 0,
      hostBahtBalance: initial.hostBahtBalance,
    }
    this.wallets.set(userId, acc)
    return acc
  }

  getWallet(userId: string): ChonWalletAccount {
    const found = this.wallets.get(userId)
    if (!found) {
      const fresh: ChonWalletAccount = {
        userId,
        paidCoins: 0,
        bonusCoins: 0,
        escrowHeldCoins: 0,
        hostBahtBalance: 0,
      }
      this.wallets.set(userId, fresh)
      return fresh
    }
    return { ...found }
  }

  private recordDoubleEntry(
    idempotencyKey: string,
    debitAccountId: string,
    creditAccountId: string,
    amountCoins: number,
    memo: string,
  ) {
    const now = new Date().toISOString()
    this.entries.push(
      {
        id: `le-dr-${this.entries.length + 1}`,
        idempotencyKey,
        accountId: debitAccountId,
        debitCoins: amountCoins,
        creditCoins: 0,
        memo,
        createdAt: now,
      },
      {
        id: `le-cr-${this.entries.length + 2}`,
        idempotencyKey,
        accountId: creditAccountId,
        debitCoins: 0,
        creditCoins: amountCoins,
        memo,
        createdAt: now,
      },
    )
  }

  verifyZeroSumInvariant(): boolean {
    let totalDebits = 0
    let totalCredits = 0
    const byKey = new Map<string, { dr: number; cr: number }>()
    for (const entry of this.entries) {
      totalDebits += entry.debitCoins
      totalCredits += entry.creditCoins
      const k = byKey.get(entry.idempotencyKey) ?? { dr: 0, cr: 0 }
      k.dr += entry.debitCoins
      k.cr += entry.creditCoins
      byKey.set(entry.idempotencyKey, k)
    }
    for (const { dr, cr } of byKey.values()) {
      if (dr !== cr) return false
    }
    for (const wallet of this.wallets.values()) {
      if (
        wallet.paidCoins < 0 ||
        wallet.bonusCoins < 0 ||
        wallet.escrowHeldCoins < 0 ||
        wallet.hostBahtBalance < 0
      ) {
        return false
      }
    }
    return totalDebits === totalCredits
  }

  placeChonRequestHold(params: {
    idempotencyKey: string
    guestId: string
    hostId: string
    offerThb: number
    hostCustomMinThb?: number
  }): EscrowHoldRecord {
    const payload = {
      op: 'placeChonRequestHold',
      guestId: params.guestId,
      hostId: params.hostId,
      offerThb: Math.floor(params.offerThb),
    }
    const existing = this.checkOrRecordIdempotency<EscrowHoldRecord>(params.idempotencyKey, payload)
    if (existing) return existing

    const validation = validateUncappedChonOffer(
      params.offerThb,
      params.hostCustomMinThb ?? CHON_MIN_OFFER_THB,
    )
    if (!validation.valid) {
      throw new Error(validation.reason ?? 'Invalid Chon! Request amount')
    }

    const guest = this.wallets.get(params.guestId)
    if (!guest || guest.paidCoins < validation.requiredPaidCoins) {
      throw new Error(
        'Insufficient Paid Coins for Chon! Request hold (Bonus Coins cannot fund Hangout Requests)',
      )
    }

    guest.paidCoins -= validation.requiredPaidCoins
    guest.escrowHeldCoins += validation.requiredPaidCoins

    const hold: EscrowHoldRecord = {
      holdId: `hold-${this.holds.size + 1}`,
      idempotencyKey: params.idempotencyKey,
      guestId: params.guestId,
      hostId: params.hostId,
      offerThb: Math.floor(params.offerThb),
      heldPaidCoins: validation.requiredPaidCoins,
      status: 'HELD',
    }

    this.recordDoubleEntry(
      params.idempotencyKey,
      `wallet:${params.guestId}:paid`,
      `escrow:${hold.holdId}`,
      validation.requiredPaidCoins,
      `Chon! Request Escrow Hold ฿${hold.offerThb}`,
    )

    this.holds.set(hold.holdId, hold)
    return this.saveIdempotency(params.idempotencyKey, payload, hold)
  }

  releaseUnmetHoldToChonWallet(params: {
    idempotencyKey: string
    holdId: string
  }): {
    holdId: string
    chargedCoins: 0
    releasedCoins: number
    status: 'RELEASED_TO_CHON_WALLET'
  } {
    const payload = { op: 'releaseUnmetHoldToChonWallet', holdId: params.holdId }
    const existing = this.checkOrRecordIdempotency<{
      holdId: string
      chargedCoins: 0
      releasedCoins: number
      status: 'RELEASED_TO_CHON_WALLET'
    }>(params.idempotencyKey, payload)
    if (existing) return existing

    const hold = this.holds.get(params.holdId)
    if (!hold || (hold.status !== 'HELD' && hold.status !== 'ACCEPTED')) {
      throw new Error('Active escrow hold not found')
    }

    const guest = this.wallets.get(hold.guestId)
    if (!guest || guest.escrowHeldCoins < hold.heldPaidCoins) {
      throw new Error('Guest escrow balance mismatch')
    }

    guest.escrowHeldCoins -= hold.heldPaidCoins
    guest.paidCoins += hold.heldPaidCoins
    hold.status = 'RELEASED_TO_CHON_WALLET'

    this.recordDoubleEntry(
      params.idempotencyKey,
      `escrow:${hold.holdId}`,
      `wallet:${hold.guestId}:paid`,
      hold.heldPaidCoins,
      `100% Auto-Released to Chon! Wallet (Did Not Meet · 0 🪙 Charged)`,
    )

    const result = {
      holdId: hold.holdId,
      chargedCoins: 0 as const,
      releasedCoins: hold.heldPaidCoins,
      status: 'RELEASED_TO_CHON_WALLET' as const,
    }
    return this.saveIdempotency(params.idempotencyKey, payload, result)
  }

  settleMeetInPerson(params: {
    idempotencyKey: string
    holdId: string
    agencyId?: string
    agencyRolling30dVolumeThb?: number
    subScoutId?: string
  }): {
    holdId: string
    hostBahtEarned: number
    agencyOverrideBaht: number
    subScoutOverrideBaht: number
    platformNetBaht: number
    status: 'SETTLED_ON_MEET'
  } {
    const payload = {
      op: 'settleMeetInPerson',
      holdId: params.holdId,
      agencyId: params.agencyId ?? null,
      subScoutId: params.subScoutId ?? null,
    }
    const existing = this.checkOrRecordIdempotency<{
      holdId: string
      hostBahtEarned: number
      agencyOverrideBaht: number
      subScoutOverrideBaht: number
      platformNetBaht: number
      status: 'SETTLED_ON_MEET'
    }>(params.idempotencyKey, payload)
    if (existing) return existing

    const hold = this.holds.get(params.holdId)
    if (!hold || (hold.status !== 'HELD' && hold.status !== 'ACCEPTED')) {
      throw new Error('Active escrow hold not found')
    }

    const guest = this.wallets.get(hold.guestId)
    if (!guest || guest.escrowHeldCoins < hold.heldPaidCoins) {
      throw new Error('Guest escrow balance mismatch')
    }

    const agencyRate = params.agencyId
      ? calculateAgencyRollingOverrideRate(params.agencyRolling30dVolumeThb ?? 0).overridePct
      : 0

    const split = calculateMeetSettlementSplit({
      grossThb: hold.offerThb,
      agencyOverridePct: agencyRate,
      hasSubScout: Boolean(params.subScoutId),
    })

    guest.escrowHeldCoins -= hold.heldPaidCoins
    hold.status = 'SETTLED_ON_MEET'

    const hostWallet = this.getWallet(hold.hostId)
    hostWallet.hostBahtBalance += split.hostBaht
    this.wallets.set(hold.hostId, hostWallet)

    if (params.agencyId && split.agencyBaht > 0) {
      const agencyWallet = this.getWallet(params.agencyId)
      agencyWallet.hostBahtBalance += split.agencyBaht
      this.wallets.set(params.agencyId, agencyWallet)
    }

    if (params.subScoutId && split.subScoutBaht > 0) {
      const scoutWallet = this.getWallet(params.subScoutId)
      scoutWallet.hostBahtBalance += split.subScoutBaht
      this.wallets.set(params.subScoutId, scoutWallet)
    }

    // OPT-013: Multi-leg double-entry settlement split mirroring 0004/0005 SQL RPC:
    // debit escrow:<holdId> for full heldPaidCoins; credit host (80%), agency override, sub-scout override, and platform treasury net.
    const now = new Date().toISOString()
    const hostCoins = split.hostBaht * COINS_PER_THB
    const agencyCoins = split.agencyBaht * COINS_PER_THB
    const scoutCoins = split.subScoutBaht * COINS_PER_THB
    const treasuryNetCoins = Math.max(0, hold.heldPaidCoins - hostCoins - agencyCoins - scoutCoins)

    this.entries.push({
      id: `le-dr-${this.entries.length + 1}`,
      idempotencyKey: params.idempotencyKey,
      accountId: `escrow:${hold.holdId}`,
      debitCoins: hold.heldPaidCoins,
      creditCoins: 0,
      memo: `Settled on In-Person Meet: Release Escrow ฿${hold.offerThb}`,
      createdAt: now,
    })
    this.entries.push({
      id: `le-cr-${this.entries.length + 1}`,
      idempotencyKey: params.idempotencyKey,
      accountId: `settlement:${hold.hostId}`,
      debitCoins: 0,
      creditCoins: hostCoins,
      memo: `Host 80% Instant Share (฿${split.hostBaht})`,
      createdAt: now,
    })
    if (params.agencyId && agencyCoins > 0) {
      this.entries.push({
        id: `le-cr-${this.entries.length + 1}`,
        idempotencyKey: params.idempotencyKey,
        accountId: `agency:${params.agencyId}:override`,
        debitCoins: 0,
        creditCoins: agencyCoins,
        memo: `Platform-Funded Agency Override (฿${split.agencyBaht})`,
        createdAt: now,
      })
    }
    if (params.subScoutId && scoutCoins > 0) {
      this.entries.push({
        id: `le-cr-${this.entries.length + 1}`,
        idempotencyKey: params.idempotencyKey,
        accountId: `scout:${params.subScoutId}:override`,
        debitCoins: 0,
        creditCoins: scoutCoins,
        memo: `Platform-Funded Sub-Scout Override (฿${split.subScoutBaht})`,
        createdAt: now,
      })
    }
    if (treasuryNetCoins > 0) {
      this.entries.push({
        id: `le-cr-${this.entries.length + 1}`,
        idempotencyKey: params.idempotencyKey,
        accountId: `treasury:platform_net`,
        debitCoins: 0,
        creditCoins: treasuryNetCoins,
        memo: `Chon! Platform Treasury Net (฿${split.platformNetBaht})`,
        createdAt: now,
      })
    }

    const result = {
      holdId: hold.holdId,
      hostBahtEarned: split.hostBaht,
      agencyOverrideBaht: split.agencyBaht,
      subScoutOverrideBaht: split.subScoutBaht,
      platformNetBaht: split.platformNetBaht,
      status: 'SETTLED_ON_MEET' as const,
    }
    return this.saveIdempotency(params.idempotencyKey, payload, result)
  }
}

/* ============================================================================
 * KRING V3.0 / V4.0 ZERO-MoR CROSS-BORDER ESCROW & GUARDRAIL INVARIANTS
 * ============================================================================ */

export const KRING_FLAT_SERVICE_FEE_THB = 25 as const
export const KRING_ATM_FEE_DISCLOSURE_EN =
  'No ATM needed — Thai ATMs charge ฿220–250 a withdrawal' as const
export const KRING_PARTNER_BOOKING_FEE_DISCLOSURE_EN =
  'Pay 20% booking fee now to Kring · rest at the venue' as const
export const KRING_BUMP_MAX_GPS_METERS = 100 as const
export const KRING_MAX_SESSIONS_PER_DAY_PER_PAIR = 3 as const
export const KRING_PAIR_DAILY_CAP_THB = 3_000 as const
export const KRING_NEW_BUYER_48H_CAP_THB = 1_000 as const
export const KRING_TIP_ALLOWED_DENOMINATIONS_THB = [50, 100, 200, 500] as const
export const KRING_TIP_WINDOW_HOURS = 72 as const

export type KringNationalityPayRail =
  | 'UPI_IN'
  | 'WECHAT_PAY_CN'
  | 'TRUEMONEY_RU_TH'
  | 'PROMPTPAY_TH'
  | 'CARD_GLOBAL'

export type KringHostTier = 'NEW_HOST_80' | 'PRO_HOST_83' | 'STAR_HOST_85'

export function resolveKringHostTierByCompletedSessions(completedSessions: number): {
  tier: KringHostTier
  hostSharePct: 80 | 83 | 85
  kringRetentionPct: 20 | 17 | 15
} {
  const clean = Math.max(0, Math.floor(completedSessions))
  if (clean >= 20) {
    return { tier: 'STAR_HOST_85', hostSharePct: 85, kringRetentionPct: 15 }
  }
  if (clean >= 5) {
    return { tier: 'PRO_HOST_83', hostSharePct: 83, kringRetentionPct: 17 }
  }
  return { tier: 'NEW_HOST_80', hostSharePct: 80, kringRetentionPct: 20 }
}

/**
 * Calculates the v3.0 Zero-MoR Ordinary Local Host Activity checkout & `กริ๊ง!` bump release split:
 * - Traveller pays `activityFeeThb + ฿25` flat Service Fee via `🇮🇳 UPI · 💬 WeChat Pay · 🇷🇺 TrueMoney · 🇹🇭 PromptPay · 💳 Card`.
 * - Escrow holds until both phones verify `<= 100m` GPS proximity at the named public meeting place.
 * - On bump: `80%` to New Host, `83%` to Pro Host (`5+` sessions), `85%` to Star Host (`20+` sessions);
 *   Kring retains `20%` (or `17%` / `15%`) + `฿25` Service Fee.
 */
export function calculateKringV3BumpEscrowRelease(params: {
  activityFeeThb: number
  completedHostSessions: number
  gpsDistanceMeters: number
  namedPublicVenue: string
  payRail: KringNationalityPayRail
}): {
  released: boolean
  reason?: string
  activityFeeThb: number
  serviceFeeThb: typeof KRING_FLAT_SERVICE_FEE_THB
  travellerTotalPaidThb: number
  hostTier: KringHostTier
  hostSharePct: 80 | 83 | 85
  hostPayoutThb: number
  kringCommissionThb: number
  kringTotalRetainedThb: number
  atmDisclosureEn: typeof KRING_ATM_FEE_DISCLOSURE_EN
} {
  const fee = Math.floor(params.activityFeeThb)
  if (!Number.isFinite(fee) || fee < CHON_MIN_OFFER_THB) {
    throw new Error(`Activity fee must be at least ฿${CHON_MIN_OFFER_THB}`)
  }
  const tierInfo = resolveKringHostTierByCompletedSessions(params.completedHostSessions)
  const hostPayoutThb = Math.round((fee * tierInfo.hostSharePct) / 100)
  const kringCommissionThb = fee - hostPayoutThb
  const kringTotalRetainedThb = kringCommissionThb + KRING_FLAT_SERVICE_FEE_THB
  const travellerTotalPaidThb = fee + KRING_FLAT_SERVICE_FEE_THB

  if (!params.namedPublicVenue || !params.namedPublicVenue.trim()) {
    return {
      released: false,
      reason: 'Escrow hold requires a named public meeting place.',
      activityFeeThb: fee,
      serviceFeeThb: KRING_FLAT_SERVICE_FEE_THB,
      travellerTotalPaidThb,
      hostTier: tierInfo.tier,
      hostSharePct: tierInfo.hostSharePct,
      hostPayoutThb: 0,
      kringCommissionThb: 0,
      kringTotalRetainedThb: 0,
      atmDisclosureEn: KRING_ATM_FEE_DISCLOSURE_EN,
    }
  }

  if (
    !Number.isFinite(params.gpsDistanceMeters) ||
    params.gpsDistanceMeters < 0 ||
    params.gpsDistanceMeters > KRING_BUMP_MAX_GPS_METERS
  ) {
    return {
      released: false,
      reason: `GPS proximity check failed: phones are ${params.gpsDistanceMeters}m apart (must be <= ${KRING_BUMP_MAX_GPS_METERS}m at ${params.namedPublicVenue.trim()}).`,
      activityFeeThb: fee,
      serviceFeeThb: KRING_FLAT_SERVICE_FEE_THB,
      travellerTotalPaidThb,
      hostTier: tierInfo.tier,
      hostSharePct: tierInfo.hostSharePct,
      hostPayoutThb: 0,
      kringCommissionThb: 0,
      kringTotalRetainedThb: 0,
      atmDisclosureEn: KRING_ATM_FEE_DISCLOSURE_EN,
    }
  }

  return {
    released: true,
    activityFeeThb: fee,
    serviceFeeThb: KRING_FLAT_SERVICE_FEE_THB,
    travellerTotalPaidThb,
    hostTier: tierInfo.tier,
    hostSharePct: tierInfo.hostSharePct,
    hostPayoutThb,
    kringCommissionThb,
    kringTotalRetainedThb,
    atmDisclosureEn: KRING_ATM_FEE_DISCLOSURE_EN,
  }
}

/**
 * Guard 4: Post-Bump Tips (`฿50 · ฿100 · ฿200 · ฿500` within `72h` of a completed bump):
 * `100%` to Host (`0%` Kring platform fee).
 */
export function calculateKringPostBumpTipSplit(params: {
  tipThb: number
  hoursSinceBump: number
  bumpCompleted: boolean
}): {
  allowed: boolean
  reason?: string
  tipThb: number
  hostReceivesThb: number
  kringFeeThb: 0
} {
  if (!params.bumpCompleted) {
    return {
      allowed: false,
      reason: 'Post-bump tips are only unlocked after a completed กริ๊ง! bump.',
      tipThb: 0,
      hostReceivesThb: 0,
      kringFeeThb: 0,
    }
  }
  if (params.hoursSinceBump < 0 || params.hoursSinceBump > KRING_TIP_WINDOW_HOURS) {
    return {
      allowed: false,
      reason: `Tip window expired (${params.hoursSinceBump}h > ${KRING_TIP_WINDOW_HOURS}h post-bump window).`,
      tipThb: 0,
      hostReceivesThb: 0,
      kringFeeThb: 0,
    }
  }
  const allowedSet = new Set<number>(KRING_TIP_ALLOWED_DENOMINATIONS_THB)
  if (!allowedSet.has(params.tipThb)) {
    return {
      allowed: false,
      reason: `Tip must be one of ฿50, ฿100, ฿200, or ฿500 (received ฿${params.tipThb}).`,
      tipThb: 0,
      hostReceivesThb: 0,
      kringFeeThb: 0,
    }
  }
  return {
    allowed: true,
    tipThb: params.tipThb,
    hostReceivesThb: params.tipThb,
    kringFeeThb: 0,
  }
}

/**
 * Guard 1 & Guard 2: Enforces `<= 3` sessions/day/pair (`➕ Add Next Activity`, each with a named public place
 * and its own `<= 100m` bump) AND the unified `฿3,000/day` pair cap (`฿1,000` in first `48h` for new buyers).
 */
export function evaluateKringPairDailyAndSessionGuards(params: {
  sessionsCompletedTodayForPair: number
   requestedSessionNumberToday: number
  hasNamedPublicPlace: boolean
  hasDedicated100mBumpGate: boolean
  pairSpendTodayThb: number
  newSpendAmountThb: number
  buyerAccountAgeHours: number
}): {
  allowed: boolean
  effectiveDailyCapThb: 1000 | 3000
  remainingPairCapThb: number
  reason?: string
} {
  const effectiveDailyCapThb: 1000 | 3000 =
    params.buyerAccountAgeHours < 48 ? KRING_NEW_BUYER_48H_CAP_THB : KRING_PAIR_DAILY_CAP_THB
  const currentSpend = Math.max(0, Math.floor(params.pairSpendTodayThb))
  const deltaSpend = Math.max(0, Math.floor(params.newSpendAmountThb))

  if (
    params.sessionsCompletedTodayForPair >= KRING_MAX_SESSIONS_PER_DAY_PER_PAIR ||
    params.requestedSessionNumberToday > KRING_MAX_SESSIONS_PER_DAY_PER_PAIR
  ) {
    return {
      allowed: false,
      effectiveDailyCapThb,
      remainingPairCapThb: Math.max(0, effectiveDailyCapThb - currentSpend),
      reason: `Guard 1 limit: Maximum ${KRING_MAX_SESSIONS_PER_DAY_PER_PAIR} activity sessions per day per traveller-host pair.`,
    }
  }

  if (!params.hasNamedPublicPlace || !params_hasDedicated100mBumpGateCompat(params.hasDedicated100mBumpGate)) {
    return {
      allowed: false,
      effectiveDailyCapThb,
      remainingPairCapThb: Math.max(0, effectiveDailyCapThb - currentSpend),
      reason:
        'Guard 1 requirement: Every Add Next Activity session requires a named public place and its own <=100m phone bump.',
    }
  }

  if (currentSpend + deltaSpend > effectiveDailyCapThb) {
    return {
      allowed: false,
      effectiveDailyCapThb,
      remainingPairCapThb: Math.max(0, effectiveDailyCapThb - currentSpend),
      reason: `Guard 2 limit: Exceeds ฿${effectiveDailyCapThb.toLocaleString('en-US')}/day pair cap across stickers & vouchers.`,
    }
  }

  return {
    allowed: true,
    effectiveDailyCapThb,
    remainingPairCapThb: effectiveDailyCapThb - (currentSpend + deltaSpend),
  }
}

function params_hasDedicated100mBumpGateCompat(flag: boolean): boolean {
  return Boolean(flag)
}

export const KRING_BROLEXY_AND_VENUE_GIFT_SKUS = [
  { id: 'brolexy-starbucks-th-300', brand: 'Starbucks Thailand', category: 'BROLEXY_BRAND', faceValueThb: 300, wholesaleDiscountPct: 6.5, emoji: '☕' },
  { id: 'brolexy-central-th-500', brand: 'Central Department Store', category: 'BROLEXY_BRAND', faceValueThb: 500, wholesaleDiscountPct: 7.0, emoji: '🛍️' },
  { id: 'brolexy-watsons-th-300', brand: 'Watsons Thailand', category: 'BROLEXY_BRAND', faceValueThb: 300, wholesaleDiscountPct: 6.0, emoji: '💄' },
  { id: 'brolexy-lotuss-th-500', brand: "Lotus's Thailand", category: 'BROLEXY_BRAND', faceValueThb: 500, wholesaleDiscountPct: 5.5, emoji: '🛒' },
  { id: 'venue-3-mermaids-pty-1000', brand: '3 Mermaids Pattaya Sunset Nest Voucher', category: 'PARTNER_VENUE', faceValueThb: 1000, wholesaleDiscountPct: 20.0, emoji: '🧜‍♀️' },
  { id: 'venue-sky-gallery-pty-1000', brand: 'The Sky Gallery Pattaya Cliffside Voucher', category: 'PARTNER_VENUE', faceValueThb: 1000, wholesaleDiscountPct: 20.0, emoji: '🌇' },
  { id: 'venue-lets-relax-spa-1000', brand: "Let's Relax Onsen & Spa Voucher", category: 'PARTNER_VENUE', faceValueThb: 1000, wholesaleDiscountPct: 20.0, emoji: '🌿' },
] as const


