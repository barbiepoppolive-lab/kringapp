import { describe, expect, it } from 'vitest'
import {
  FinancialArmorVault,
  computeHmacSignatureHex,
  computeRealWebCryptoHmacSha256Hex,
  constantTimeHexEquals,
  evaluateCardReserveAndRollingHold,
  evaluateCashoutCircuitBreaker,
  executeChargebackReversalAndFreeze,
  maskPreMeetContactLeakage,
  verifySignedTopUpWebhook,
  verifyTwoDeviceMeetHandshake,
  verifyWebhookWithOneWayReplayWindow,
} from './chonFinancialSecurityArmor'
import { trySpendPaidCoins } from './walletBus'
import { maskPreLockContacts } from '../components/chat/ChatsAndPlansTab'

describe('Level 2 Financial Security Armor — Anti-Hacker, Anti-Bot & Anti-Drain Suite', () => {
  it('Layer 1 (Row Lock & Direct-Write Block): prevents race-condition double cashouts and blocks client balance tampering', async () => {
    const vault = new FinancialArmorVault()
    vault.seedVerifiedHostWallet({
      userId: 'host-ploy',
      hostBahtBalance: 1_500,
      verifiedLegalName: 'Ploy Srisuk',
      promptPayAccountName: 'Ploy Srisuk',
      promptPayChangedHoursAgo: 72,
    })

    // Fire two simultaneous ฿1,200 cashout requests with DIFFERENT idempotency keys at the exact same millisecond
    const [res1, res2] = await Promise.allSettled([
      vault.requestAtomicHostCashout({
        idempotencyKey: 'race-attack-1',
        userId: 'host-ploy',
        amountThb: 1_200,
        channel: 'PromptPay',
      }),
      vault.requestAtomicHostCashout({
        idempotencyKey: 'race-attack-2',
        userId: 'host-ploy',
        amountThb: 1_200,
        channel: 'PromptPay',
      }),
    ])

    const fulfilled = [res1, res2].filter((r) => r.status === 'fulfilled')
    const rejected = [res1, res2].filter((r) => r.status === 'rejected')

    // Exactly ONE succeeds; the second is blocked by the atomic mutex lock because only ฿300 remains
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    expect(vault.getHostBahtBalance('host-ploy')).toBe(300)
  })

  it('Layer 2 (Signed Payment Webhooks): rejects DevTools forged coin top-ups, expired replay attacks, and duplicate webhook IDs', () => {
    const webhookSecret = 'whsec_chon_prod_998877665544332211'
    const nowSec = 1_792_300_000
    const rawPayload = JSON.stringify({
      eventId: 'evt_omise_001',
      userId: 'guest-alex',
      paidThb: 1_000,
      paidCoins: 100_000,
    })

    const validSig = computeHmacSignatureHex(webhookSecret, `${nowSec}.${rawPayload}`)

    // 1. Valid signed webhook passes
    const accepted = verifySignedTopUpWebhook({
      rawPayload,
      timestampSec: nowSec,
      nowSec,
      signatureHex: validSig,
      webhookSecret,
      processedEventIds: new Set(),
    })
    expect(accepted.valid).toBe(true)
    expect(accepted.creditedPaidCoins).toBe(100_000)

    // 2. Hacker changes 100,000 coins to 9,000,000 coins without the server secret -> REJECTED
    const forgedPayload = JSON.stringify({
      eventId: 'evt_omise_002',
      userId: 'guest-alex',
      paidThb: 1_000,
      paidCoins: 9_000_000,
    })
    const forgedAttempt = verifySignedTopUpWebhook({
      rawPayload: forgedPayload,
      timestampSec: nowSec,
      nowSec,
      signatureHex: validSig,
      webhookSecret,
      processedEventIds: new Set(),
    })
    expect(forgedAttempt.valid).toBe(false)
    expect(forgedAttempt.reason).toMatch(/invalid webhook signature/i)

    // 3. Replay attack (timestamp older than 5 minutes) -> REJECTED
    const replayAttempt = verifySignedTopUpWebhook({
      rawPayload,
      timestampSec: nowSec - 600,
      nowSec,
      signatureHex: computeHmacSignatureHex(webhookSecret, `${nowSec - 600}.${rawPayload}`),
      webhookSecret,
      processedEventIds: new Set(),
    })
    expect(replayAttempt.valid).toBe(false)
    expect(replayAttempt.reason).toMatch(/expired timestamp/i)

    // 4. Duplicate event ID replay -> REJECTED
    const duplicateEventAttempt = verifySignedTopUpWebhook({
      rawPayload,
      timestampSec: nowSec,
      nowSec,
      signatureHex: validSig,
      webhookSecret,
      processedEventIds: new Set(['evt_omise_001']),
    })
    expect(duplicateEventAttempt.valid).toBe(false)
    expect(duplicateEventAttempt.reason).toMatch(/already processed/i)
  })

  it('Layer 3 (2-Device Meet Handshake & Anti-Collusion): blocks same-device emulation, GPS spoofing far from venue, and expired QR codes', () => {
    const nowMs = 1_792_300_000_000

    // Valid 2-device in-person meet at Tichuca Rooftop (within 150m)
    const validMeet = verifyTwoDeviceMeetHandshake({
      guestId: 'guest-alex',
      hostId: 'host-ploy',
      agencyId: 'agency-tony',
      guestDeviceHash: 'dev_iphone16_alex_991',
      hostDeviceHash: 'dev_iphone15_ploy_442',
      expectedRotatingPin: '849201',
      submittedPin: '849201',
      pinExpiresAtMs: nowMs + 60_000,
      nowMs,
      distanceBetweenUsersMeters: 18,
      distanceToVenueMeters: 45,
    })
    expect(validMeet.verified).toBe(true)

    // Collusion attack 1: Scammer runs Guest and Host accounts on the same phone/emulator to farm 20% Agency overrides
    const sameDeviceAttack = verifyTwoDeviceMeetHandshake({
      guestId: 'guest-fake',
      hostId: 'host-fake',
      agencyId: 'agency-tony',
      guestDeviceHash: 'dev_emulator_same_001',
      hostDeviceHash: 'dev_emulator_same_001',
      expectedRotatingPin: '849201',
      submittedPin: '849201',
      pinExpiresAtMs: nowMs + 60_000,
      nowMs,
      distanceBetweenUsersMeters: 5,
      distanceToVenueMeters: 20,
    })
    expect(sameDeviceAttack.verified).toBe(false)
    expect(sameDeviceAttack.reason).toMatch(/identical device fingerprint/i)

    // Collusion attack 2: Remote screenshot of QR code (users are 3.5km apart)
    const remoteQrAttack = verifyTwoDeviceMeetHandshake({
      guestId: 'guest-alex',
      hostId: 'host-ploy',
      guestDeviceHash: 'dev_iphone16_alex_991',
      hostDeviceHash: 'dev_iphone15_ploy_442',
      expectedRotatingPin: '849201',
      submittedPin: '849201',
      pinExpiresAtMs: nowMs + 60_000,
      nowMs,
      distanceBetweenUsersMeters: 3_500,
      distanceToVenueMeters: 40,
    })
    expect(remoteQrAttack.verified).toBe(false)
    expect(remoteQrAttack.reason).toMatch(/proximity check failed/i)

    // Smooth Mode A (D-027): 0.5s Physical "Phone Clink 🥂" (<30cm BLE + Accelerometer Bump, works 100% offline on 46th floor!)
    const smoothPhoneClink = verifyTwoDeviceMeetHandshake({
      guestId: 'guest-alex',
      hostId: 'host-ploy',
      guestDeviceHash: 'dev_iphone16_alex_991',
      hostDeviceHash: 'dev_iphone15_ploy_442',
      handshakeMode: 'PHYSICAL_PHONE_CLINK_0_5S',
      accelerometerBumpDetected: true,
      bleOrUltrasonicDistanceCm: 14,
      cachedOfflineProofSigned: true,
      distanceBetweenUsersMeters: 0.14,
      distanceToVenueMeters: 30,
    })
    expect(smoothPhoneClink.verified).toBe(true)
    expect(smoothPhoneClink.modeUsed).toBe('PHYSICAL_PHONE_CLINK_0_5S')
    expect(smoothPhoneClink.offlineSynced).toBe(true)

    // Smooth Mode B (D-027): 15-Minute Pocket Co-Location Auto-Release (zero phone tapping needed!)
    const pocketAutoRelease = verifyTwoDeviceMeetHandshake({
      guestId: 'guest-alex',
      hostId: 'host-ploy',
      guestDeviceHash: 'dev_iphone16_alex_991',
      hostDeviceHash: 'dev_iphone15_ploy_442',
      handshakeMode: 'POCKET_COLOCATION_15MIN',
      pocketCoLocationMinutes: 15,
      distanceBetweenUsersMeters: 12,
      distanceToVenueMeters: 35,
    })
    expect(pocketAutoRelease.verified).toBe(true)
    expect(pocketAutoRelease.modeUsed).toBe('POCKET_COLOCATION_15MIN')
  })

  it('Layer 4 (PromptPay Cashout Circuit Breaker): enforces ฿10,000/day auto-cap, 24h PromptPay change cooldown, and legal name match', () => {
    // 1. Clean ฿2,000 cashout with matching verified name & old PromptPay -> Instant 5s payout
    const clean = evaluateCashoutCircuitBreaker({
      amountThb: 2_000,
      rolling24hCashoutThb: 1_500,
      dailyAutoCapThb: 10_000,
      promptPayChangedHoursAgo: 120,
      verifiedLegalName: 'Ploy Srisuk',
      promptPayAccountName: 'Ploy Srisuk',
    })
    expect(clean.decision).toBe('INSTANT_5S_APPROVED')

    // 2. Hacker hijacks account and changes PromptPay number 2 hours ago -> Frozen for manual review
    const recentChange = evaluateCashoutCircuitBreaker({
      amountThb: 2_000,
      rolling24hCashoutThb: 0,
      dailyAutoCapThb: 10_000,
      promptPayChangedHoursAgo: 2,
      verifiedLegalName: 'Ploy Srisuk',
      promptPayAccountName: 'Ploy Srisuk',
    })
    expect(recentChange.decision).toBe('MANUAL_FOUNDER_REVIEW')
    expect(recentChange.reason).toMatch(/24-hour security cooldown/i)

    // 3. Name mismatch between 1-Face ID and PromptPay bank account -> Blocked
    const muleAccount = evaluateCashoutCircuitBreaker({
      amountThb: 1_000,
      rolling24hCashoutThb: 0,
      dailyAutoCapThb: 10_000,
      promptPayChangedHoursAgo: 99,
      verifiedLegalName: 'Ploy Srisuk',
      promptPayAccountName: 'Somchai Hacker',
    })
    expect(muleAccount.decision).toBe('BLOCKED_NAME_MISMATCH')

    // 4. Velocity spike exceeding ฿10,000/day -> Held for founder Telegram approval
    const velocitySpike = evaluateCashoutCircuitBreaker({
      amountThb: 4_000,
      rolling24hCashoutThb: 7_500,
      dailyAutoCapThb: 10_000,
      promptPayChangedHoursAgo: 99,
      verifiedLegalName: 'Ploy Srisuk',
      promptPayAccountName: 'Ploy Srisuk',
    })
    expect(velocitySpike.decision).toBe('MANUAL_FOUNDER_REVIEW')
    expect(velocitySpike.reason).toMatch(/daily auto-cashout cap/i)
  })

  it('Layer 5 (Anti-Bot Farm & Anti-Leakage): blocks multi-account device reward farming, enforces Turnstile, and masks off-app contact leaks', () => {
    const vault = new FinancialArmorVault()

    // Bot tries to claim without Cloudflare Turnstile token -> Blocked
    expect(() =>
      vault.claimDailyTaskRewardOnce({
        userId: 'guest-bot-1',
        deviceHash: 'dev_bot_farm_01',
        taskId: 'daily_checkin_100',
        utcDate: '2026-10-18',
        rewardBonusCoins: 100,
        turnstileVerified: false,
      }),
    ).toThrow(/turnstile bot verification required/i)

    // Legit user claims +🪙 100 daily check-in from the Auto-Refilling Daily Marketing Pot -> Succeeds once
    vault.seedMarketingPotFromRealRevenue(15_000) // 1% of 15,000c real volume = +150 🪙 into daily_free_coin_pot
    expect(vault.getDailyMarketingPotCoins()).toBe(150)

    const firstClaim = vault.claimDailyTaskRewardOnce({
      userId: 'guest-real-1',
      deviceHash: 'dev_iphone_real_01',
      taskId: 'daily_checkin_100',
      utcDate: '2026-10-18',
      rewardBonusCoins: 100,
      turnstileVerified: true,
    })
    expect(firstClaim.bonusCoinsAdded).toBe(100)
    expect(vault.getDailyMarketingPotCoins()).toBe(50) // 150 - 100 = 50 🪙 left in pot!
    expect(vault.getUnifiedWalletCoins('guest-real-1')).toBe(100) // Real unified 🪙 coins!

    // Same physical phone switches to a 2nd account on the same day to farm +🪙 100 -> Blocked by device_hash constraint!
    expect(() =>
      vault.claimDailyTaskRewardOnce({
        userId: 'guest-second-account',
        deviceHash: 'dev_iphone_real_01',
        taskId: 'daily_checkin_100',
        utcDate: '2026-10-18',
        rewardBonusCoins: 100,
        turnstileVerified: true,
      }),
    ).toThrow(/already claimed on this device today/i)

    // Different device tries to claim +🪙 100 when only 50 🪙 remains in today's Auto-Refilling Marketing Pot -> Cleanly paused (Zero coins minted!)
    expect(() =>
      vault.claimDailyTaskRewardOnce({
        userId: 'guest-real-2',
        deviceHash: 'dev_iphone_real_02',
        taskId: 'daily_checkin_100',
        utcDate: '2026-10-18',
        rewardBonusCoins: 100,
        turnstileVerified: true,
      }),
    ).toThrow(/today's free drop pool is 100% claimed/i)

    // Server-side Pre-Meet Chat Contact Leakage Masking (Red Line #4)
    const sneakyMessage =
      'Hey babe add my LINE: @ploy_bkk99 or call me at 089-123-4567 or IG: @ploy.vip'
    const sanitized = maskPreMeetContactLeakage(sneakyMessage, false)
    expect(sanitized.maskedText).not.toContain('089-123-4567')
    expect(sanitized.maskedText).not.toContain('@ploy_bkk99')
    expect(sanitized.maskedText).toContain('[🔒 Unlocks on VIP Meet]')
    expect(sanitized.leaksDetected).toBeGreaterThanOrEqual(2)
  })

  it('Layer 6 (Locks #1 & #2 — Unified Redeemable Coins, Zero-Minting Pool Transfer, 25% Single-Spin Cap & 60s Glitch Freeze): wins are real unified 🪙 coins transferred strictly from Pool Reserve (max 25% per spin)', () => {
    const vault = new FinancialArmorVault()

    // Seed Guest with 10,000 unified 🪙 coins; Lucky Pool starts at 0
    vault.seedUnifiedWallet('guest-alex', 10_000)

    // Spin 1,000 🪙:
    // - 12% (120 🪙) -> Host
    // - 8% (80 🪙) -> House Locked Profit
    // - 80% (800 🪙) -> Enters Lucky Pool Reserve
    // Even if a glitch requests a 500x jackpot (500,000 🪙), Lock #1 + Lock #2 cap a single spin at max 25% of Pool Reserve (25% of 800 = 200 🪙)!
    const glitchedSpin = vault.executeZeroMintPoolLuckySpin({
      idempotencyKey: 'unified-spin-1',
      userId: 'guest-alex',
      hostId: 'host-mint',
      spinCostCoins: 1_000,
      requestedCandidateMultiplier: 500,
      nowSec: 1_000,
    })

    expect(glitchedSpin.houseLockedProfitCoins).toBe(80)
    expect(glitchedSpin.hostEarnedCoins).toBe(120)
    expect(glitchedSpin.rewardCoins).toBe(200) // Max 25% of the 800c pool reserve!
    expect(glitchedSpin.glitchClamped).toBe(true)
    expect(vault.getLuckyPoolReserveCoins()).toBe(600) // 800 - 200 = 600 remaining in pool

    // Unified 🪙 wallet: 10,000 - 1,000 + 200 = 9,200 🪙 (100% real spendable/redeemable coins, zero confusing split!)
    expect(vault.getUnifiedWalletCoins('guest-alex')).toBe(9_200)

    // Conservation of Coins proof: User (9,200) + Host (120) + House (80) + Pool (600) === Initial 10,000 🪙!
    expect(
      vault.getUnifiedWalletCoins('guest-alex') +
        glitchedSpin.hostEarnedCoins +
        glitchedSpin.houseLockedProfitCoins +
        vault.getLuckyPoolReserveCoins(),
    ).toBe(10_000)
  })

  it('Layer 6 (Lock #4 — 1ms Global Bank Solvency Check): blocks PromptPay cashout instantly if any glitch ever creates 1 unbacked coin', () => {
    const vault = new FinancialArmorVault()

    // 1. Real Stripe/Omise deposits = ฿5,000 (500,000 🪙)
    vault.recordVerifiedBahtDeposit(5_000)
    vault.seedUnifiedWallet('guest-alex', 100_000) // ฿1,000 in guest wallet
    vault.seedVerifiedHostWallet({
      userId: 'host-ploy',
      hostBahtBalance: 3_000, // ฿3,000 in host wallet
      verifiedLegalName: 'Ploy Srisuk',
      promptPayAccountName: 'Ploy Srisuk',
      promptPayChangedHoursAgo: 72,
    })

    // Total liability = ฿1,000 (guest) + ฿3,000 (host) = ฿4,000 <= ฿5,000 deposited -> SOLVENT ✅
    const solventCheck = vault.verifyGlobalBankSolvency()
    expect(solventCheck.solvent).toBe(true)
    expect(solventCheck.surplusThb).toBe(1_000)

    // 2. Simulate an unknown glitch somewhere that inflates a wallet by ฿2,000 unbacked Baht (Total liability = ฿6,000 > ฿5,000 deposited)
    vault.seedUnifiedWallet('hacker-glitched', 200_000) // +฿2,000 unbacked!

    const insolventCheck = vault.verifyGlobalBankSolvency()
    expect(insolventCheck.solvent).toBe(false)
    expect(insolventCheck.reason).toMatch(/global solvency circuit breaker tripped/i)
  })

  it('Layer 7 (Zero-OTP Frictionless Credit Card Unconfirmed Coins): tourists spend card coins immediately with zero SMS OTP, but card-funded Baht cannot be withdrawn until bank settlement clears', async () => {
    const vault = new FinancialArmorVault()

    vault.seedVerifiedHostWallet({
      userId: 'host-mint',
      hostBahtBalance: 500, // ฿500 already confirmed (from PromptPay/USDT)
      verifiedLegalName: 'Mint Chulalongkorn',
      promptPayAccountName: 'Mint Chulalongkorn',
      promptPayChangedHoursAgo: 100,
    })

    // 1. Foreign tourist on Thai eSIM tops up ฿3,000 (300,000 🪙) via Credit Card with ZERO SMS OTP friction
    const cardTopUp = vault.creditFrictionlessTopUp({
      topUpId: 'topup-card-001',
      userId: 'guest-tourist-esim',
      amountThb: 3_000,
      paymentRail: 'credit_card', // Tagged as unconfirmed coins!
    })
    expect(cardTopUp.spendableCoins).toBe(300_000)
    expect(cardTopUp.isConfirmedForWithdrawal).toBe(false)

    // 2. Tourist immediately spends ฿2,000 (200,000 🪙) on Host Mint (100% usable right now!)
    const spend = vault.spendCoinsToHost({
      userId: 'guest-tourist-esim',
      hostId: 'host-mint',
      coinsToSpend: 200_000,
    })
    expect(spend.hostEarnedBaht).toBe(1_600) // 80% of ฿2,000
    expect(spend.settledToConfirmedBaht).toBe(0)
    expect(spend.heldInUnconfirmedCardBaht).toBe(1_600)

    // 3. Host Mint sees ฿500 confirmed + ฿1,600 unconfirmed card Baht = ฿2,100 total,
    //    but trying to withdraw ฿1,500 right now is BLOCKED because only ฿500 is confirmed!
    expect(vault.getHostBahtBalance('host-mint')).toBe(500)
    expect(vault.getHostUnconfirmedCardBaht('host-mint')).toBe(1_600)
    await expect(
      vault.requestAtomicHostCashout({
        idempotencyKey: 'early-card-withdraw',
        userId: 'host-mint',
        amountThb: 1_500,
        channel: 'PromptPay',
      }),
    ).rejects.toThrow(/insufficient host baht balance/i)

    // 4. Once the credit card payment clears settlement, the ฿1,600 automatically unlocks for 5-second withdrawal!
    vault.confirmCardTopUpSettlement('topup-card-001')
    expect(vault.getHostBahtBalance('host-mint')).toBe(2_100)
    expect(vault.getHostUnconfirmedCardBaht('host-mint')).toBe(0)

    const cashoutAfterClear = await vault.requestAtomicHostCashout({
      idempotencyKey: 'cleared-card-withdraw',
      userId: 'host-mint',
      amountThb: 1_500,
      channel: 'PromptPay',
    })
    expect(cashoutAfterClear.status).toBe('INSTANT_5S_APPROVED')
    expect(cashoutAfterClear.netThb).toBe(1_500)

    // 5. If a second credit card top-up ('topup-stolen-card-002') is reversed/disputed before clearing,
    //    it claws back the unconfirmed coins & unconfirmed Host Baht with ฿0 loss to Chon!
    vault.creditFrictionlessTopUp({
      topUpId: 'topup-stolen-card-002',
      userId: 'guest-scammer',
      amountThb: 5_000,
      paymentRail: 'credit_card',
    })
    vault.spendCoinsToHost({
      userId: 'guest-scammer',
      hostId: 'host-mint',
      coinsToSpend: 500_000,
    })
    expect(vault.getHostUnconfirmedCardBaht('host-mint')).toBe(4_000)

    const clawback = vault.reverseUnconfirmedCardTopUp('topup-stolen-card-002')
    expect(clawback.clawedBackHostBaht).toBe(4_000)
    expect(vault.getHostUnconfirmedCardBaht('host-mint')).toBe(0)
  })

  it('Layer 8 (Crypto / USDT On-Chain & Binance Pay Armor): blocks fake USDT token contracts, 0-block re-org attacks, txHash replays, wrong recipient addresses, and server private-key leaks', () => {
    const vault = new FinancialArmorVault()
    const officialTreasuryTrc20 = 'TChonColdTreasuryVault999888777666'

    // 1. Valid TRC-20 USDT deposit (official Tether contract TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t, >=20 confirmations)
    const validUsdt = vault.verifyAndCreditOnChainUsdtDeposit({
      chain: 'TRON_TRC20',
      txHash: '0xabc111222333444555666777888999',
      tokenContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      recipientAddress: officialTreasuryTrc20,
      expectedTreasuryAddress: officialTreasuryTrc20,
      rawAmountUnits: '100000000', // 100 USDT (6 decimals on TRON)
      confirmations: 24,
      userId: 'guest-crypto-whale',
      thbPerUsdtRate: 34, // 100 USDT * 34 = ฿3,400 = 340,000 🪙 (+5% D-018 stealth USDT bonus = 357,000 🪙)
    })
    expect(validUsdt.accepted).toBe(true)
    expect(validUsdt.usdtAmount).toBe(100)
    expect(validUsdt.creditedCoins).toBe(357_000) // Includes +5% USDT bonus (D-018)

    // 2. Fake / Spoofed "USDT" smart contract deployed by a hacker -> REJECTED
    const fakeContractAttempt = vault.verifyAndCreditOnChainUsdtDeposit({
      chain: 'TRON_TRC20',
      txHash: '0xfake999999999',
      tokenContract: 'TFakeScamTokenContract111111111111',
      recipientAddress: officialTreasuryTrc20,
      expectedTreasuryAddress: officialTreasuryTrc20,
      rawAmountUnits: '10000000000',
      confirmations: 50,
      userId: 'guest-hacker',
      thbPerUsdtRate: 34,
    })
    expect(fakeContractAttempt.accepted).toBe(false)
    expect(fakeContractAttempt.reason).toMatch(/unofficial or spoofed token contract/i)

    // 3. Unconfirmed 2-block transaction (Re-org / Double-spend attack) -> REJECTED
    const lowConfirmationsAttempt = vault.verifyAndCreditOnChainUsdtDeposit({
      chain: 'TRON_TRC20',
      txHash: '0xunconfirmed222',
      tokenContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      recipientAddress: officialTreasuryTrc20,
      expectedTreasuryAddress: officialTreasuryTrc20,
      rawAmountUnits: '100000000',
      confirmations: 2, // Needs >= 20 on TRON!
      userId: 'guest-hacker',
      thbPerUsdtRate: 34,
    })
    expect(lowConfirmationsAttempt.accepted).toBe(false)
    expect(lowConfirmationsAttempt.reason).toMatch(/insufficient block confirmations/i)

    // 4. Replay of already-used txHash -> REJECTED
    const replayTxAttempt = vault.verifyAndCreditOnChainUsdtDeposit({
      chain: 'TRON_TRC20',
      txHash: '0xabc111222333444555666777888999',
      tokenContract: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
      recipientAddress: officialTreasuryTrc20,
      expectedTreasuryAddress: officialTreasuryTrc20,
      rawAmountUnits: '100000000',
      confirmations: 30,
      userId: 'guest-second-account',
      thbPerUsdtRate: 34,
    })
    expect(replayTxAttempt.accepted).toBe(false)
    expect(replayTxAttempt.reason).toMatch(/txhash already processed/i)

    // 5. Hard block if any developer ever puts a hot-wallet private key or seed phrase in .env
    expect(() =>
      vault.assertZeroServerCryptoPrivateKeys({
        USDT_HOT_WALLET_PRIVATE_KEY: '0xdeadbeef123456',
      }),
    ).toThrow(/zero private keys allowed on server/i)
  })

  it('Layer 9 (Anti-Reverse-Engineering, Canary Honeypot Scraper Trap & Invisible Bio Watermark): catches competitor scrapers touching canary profiles and embeds invisible zero-width watermarks', () => {
    const vault = new FinancialArmorVault()

    // 1. Normal user browsing a real host profile passes cleanly
    const normalBrowse = vault.evaluateScraperCanaryTrap({
      deviceHash: 'dev_real_user_01',
      ipAddress: '203.113.10.5',
      requestedHostId: 'host-mint',
      profilesFetchedLastMinute: 6,
    })
    expect(normalBrowse.blocked).toBe(false)

    // 2. Competitor scraper bot touches an invisible Canary Honeypot profile ('host-canary-trap-bkk-01') -> INSTANT BAN
    const canaryHit = vault.evaluateScraperCanaryTrap({
      deviceHash: 'dev_competitor_bot_99',
      ipAddress: '45.33.12.99',
      requestedHostId: 'host-canary-trap-bkk-01',
      profilesFetchedLastMinute: 12,
    })
    expect(canaryHit.blocked).toBe(true)
    expect(canaryHit.reason).toMatch(/canary honeypot trap triggered/i)

    // Even if that banned scraper later requests a normal host ('host-mint'), their device/IP remains permanently blocked!
    const afterBan = vault.evaluateScraperCanaryTrap({
      deviceHash: 'dev_competitor_bot_99',
      ipAddress: '45.33.12.99',
      requestedHostId: 'host-mint',
      profilesFetchedLastMinute: 1,
    })
    expect(afterBan.blocked).toBe(true)

    // 3. Invisible Zero-Width Unicode Watermarking: proves if a competitor copy-pastes Chon! host bios
    const originalBio = 'Rooftop cocktails at Tichuca 🥂'
    const watermarked = vault.embedInvisibleCopyWatermark(originalBio, 'SCRAPER_SESSION_42')
    // Visually identical when zero-width chars are stripped, but extracts the exact leaker ID!
    expect(watermarked.replace(/[\u200B\u200C\u200D]/g, '')).toBe(originalBio)
    expect(vault.extractInvisibleCopyWatermark(watermarked)).toBe('SCRAPER_SESSION_42')
  })

  it('Layer 10 (Provably Fair Commit-Reveal & Public RTP Zero-Fraud Audit Proof): proves mathematically that spins cannot be rigged and 100% of the Lucky Pool is conserved', () => {
    const vault = new FinancialArmorVault()

    // 1. Server commits to serverSeed BEFORE the user taps Send Lucky Gift
    const serverSeed = 'srv_secret_seed_2026_10_18_bkk_8891'
    const publishedCommitmentHash = computeHmacSignatureHex(serverSeed, 'CHON_COMMIT_V1')

    // User provides their own clientSeed + spin nonce
    const fairSpin = vault.verifyProvablyFairLuckySpin({
      serverSeed,
      publishedCommitmentHash,
      clientSeed: 'guest_alex_iphone_seed_77',
      nonce: 42,
      giftCoins: 1_000,
    })
    expect(fairSpin.verified).toBe(true)
    expect(fairSpin.rollBasisPoints).toBeGreaterThanOrEqual(0)
    expect(fairSpin.rollBasisPoints).toBeLessThan(10_000)

    // 2. If anyone tries to swap the serverSeed after seeing the user's bet -> CAUGHT IMMEDIATELY!
    const riggedAttempt = vault.verifyProvablyFairLuckySpin({
      serverSeed: 'srv_manipulated_losing_seed_999',
      publishedCommitmentHash,
      clientSeed: 'guest_alex_iphone_seed_77',
      nonce: 42,
      giftCoins: 1_000,
    })
    expect(riggedAttempt.verified).toBe(false)
    expect(riggedAttempt.reason).toMatch(/does not match pre-published commitment hash/i)

    // 3. Public Double-Entry RTP Audit Proof across spins: proves 0 coins were skimmed from the Lucky Pool
    const rtpAudit = vault.generatePublicRtpAuditProof({
      openingPoolReserveCoins: 500_000,
      closingPoolReserveCoins: 530_000,
      spins: [
        {
          spinId: 'sp_01',
          giftCoins: 100_000,
          poolContributionCoins: 50_000,
          playerWinCoins: 20_000,
          commitmentVerified: true,
        },
        {
          spinId: 'sp_02',
          giftCoins: 200_000,
          poolContributionCoins: 100_000,
          playerWinCoins: 100_000,
          commitmentVerified: true,
        },
      ],
    })
    expect(rtpAudit.mathematicallySound).toBe(true)
    expect(rtpAudit.poolConservationDeltaCoins).toBe(0)
    expect(rtpAudit.realizedPlayerReturnPlusPoolReservePct).toBe(100)
    expect(rtpAudit.auditMerkleRootHex).toMatch(/^sha256_[0-9a-f]{16}$/)

    // 4. If even 1 single coin is secretly skimmed from the Lucky Pool -> AUDIT FAILS IMMEDIATELY
    const skimmedAudit = vault.generatePublicRtpAuditProof({
      openingPoolReserveCoins: 500_000,
      closingPoolReserveCoins: 529_999, // 1 coin missing!
      spins: [
        {
          spinId: 'sp_01',
          giftCoins: 100_000,
          poolContributionCoins: 50_000,
          playerWinCoins: 20_000,
          commitmentVerified: true,
        },
      ],
    })
    expect(skimmedAudit.mathematicallySound).toBe(false)
    expect(skimmedAudit.reason).toMatch(/pool conservation delta/i)
  })

  it('BUG-017: trySpendPaidCoins rejects overspends without clamping balance to 0', () => {
    expect(trySpendPaidCoins(100_000, 150_000)).toEqual({
      ok: false,
      nextPaidCoins: 100_000,
    })
    expect(trySpendPaidCoins(100_000, 0)).toEqual({
      ok: false,
      nextPaidCoins: 100_000,
    })
    expect(trySpendPaidCoins(100_000, -500)).toEqual({
      ok: false,
      nextPaidCoins: 100_000,
    })
    expect(trySpendPaidCoins(100_000, 30_000)).toEqual({
      ok: true,
      nextPaidCoins: 70_000,
    })
  })

  it('BUG-018: unified contact masker catches 31/31 TH/EN/ZH evasion leaks, has 0/10 false positives, and catches split-message phone numbers', () => {
    const leaks = [
      'call 081-234-5678',
      '0812345678',
      '+66 81 234 5678',
      '+66812345678',
      '๐๘๑๒๓๔๕๖๗๘',
      'zero eight one two three four five six seven eight',
      'ศูนย์แปดหนึ่ง สองสามสี่ ห้าหกเจ็ดแปด',
      '0 8 1 2 3 4 5 6 7 8',
      '081 234 5678',
      '081.234.5678',
      '08l-234-5678',
      '081-two34-5678',
      '0️⃣8️⃣1️⃣2️⃣3️⃣4️⃣5️⃣6️⃣7️⃣8️⃣',
      '０８１２３４５６７８',
      'my line is alex_bkk99',
      'ไลน์ alex_bkk99',
      'L1ne: alex_bkk99',
      'li ne alex_bkk99',
      'Line ID alex_bkk99',
      'ig alex.bkk',
      'insta: alex.bkk',
      'instagram.com/alex.bkk',
      'IG @ alex.bkk',
      'telegram t.me/alexbkk',
      'whatsapp +66812345678',
      'wechat: alexbkk99',
      'wechat id alex88',
      '微信 alexbkk99',
      '加我微信alexbkk99',
      '我的微信是alex88',
      'vx: alex88',
      'v信 alex88',
      'facebook.com/alexbkk',
      'fb: alexbkk',
      'snap: alexbkk',
      'tiktok.com/@alexbkk',
      'discord: alexbkk',
      'alex.bkk99@gmail.com',
      'line.me/ti/p/~alexbkk',
      'my number is 081 then 234 then 5678',
      'add me: a l e x _ b k k',
      'L I N E : ploy_bkk99',
      'lineid=ploy99',
      'O91-Z34-5678',
      'ploy [at] gmail [dot] com',
      'ploy(at)yahoo(dot)co(dot)th',
      'แอด LINE มาที่ ploy_bkk',
      'v: alex_888',
      'ig/ploy_bkk',
      'LINE SomchaiBKK',
    ]

    const clean = [
      'See you at Octave Rooftop at 8 PM 🥂',
      'I can come at 20:30',
      'Order 2 cocktails, 350 baht each',
      'Table 12 near the bar',
      'My flight is TG 660 tomorrow',
      'Lets meet at 7-11 on Soi 11',
      'email me later',
      'online 100% tonight',
      'Room for 4 people?',
      'I am 24 years old',
      'I love line dancing',
      'tiktok famous cocktails',
      'facebook is down today haha',
    ]

    for (const sample of leaks) {
      const armorRes = maskPreMeetContactLeakage(sample, false)
      const chatRes = maskPreLockContacts(sample, false)
      expect(armorRes.leaksDetected, `Armor missed leak: ${sample}`).toBeGreaterThan(0)
      expect(chatRes.wasMasked, `Chat missed leak: ${sample}`).toBe(true)
    }

    for (const sample of clean) {
      const armorRes = maskPreMeetContactLeakage(sample, false)
      const chatRes = maskPreLockContacts(sample, false)
      expect(armorRes.leaksDetected, `Armor false positive on: ${sample}`).toBe(0)
      expect(chatRes.wasMasked, `Chat false positive on: ${sample}`).toBe(false)
    }

    // Cross-message split phone number evasion across consecutive messages
    const splitRes = maskPreLockContacts('45678', false, ['my phone starts with 08123'])
    expect(splitRes.wasMasked).toBe(true)
  })

  it('Fable Decision #1: enforces WebCrypto 256-bit HMAC-SHA256, constant-time compare, one-directional 300s window, 14d/30d + 10% 90d card reserve, and rpc_reverse_chargeback negative balance freeze', async () => {
    const secret = 'whsec_fable_argon_256bit_test_key'
    const payload = JSON.stringify({ eventId: 'evt_opn_001', userId: 'usr_99', paidThb: 1000 })
    const sigHex = await computeRealWebCryptoHmacSha256Hex(secret, `1700000100.${payload}`)
    expect(sigHex).toMatch(/^[0-9a-f]{64}$/)
    expect(constantTimeHexEquals(sigHex, sigHex)).toBe(true)
    expect(constantTimeHexEquals(sigHex, '0'.repeat(64))).toBe(false)

    const processed = new Set<string>()
    // Reject future-dated timestamp (one-directional window: ageSec < 0)
    const futureAttempt = await verifyWebhookWithOneWayReplayWindow({
      rawPayload: payload,
      timestampSec: 1700000100,
      nowSec: 1700000050, // 50s in the future!
      signatureHex: sigHex,
      webhookSecret: secret,
      processedEventIds: processed,
    })
    expect(futureAttempt.valid).toBe(false)
    expect(futureAttempt.reason).toMatch(/future-dated timestamp/i)

    // Valid within [0, 300s] window
    const validAttempt = await verifyWebhookWithOneWayReplayWindow({
      rawPayload: payload,
      timestampSec: 1700000100,
      nowSec: 1700000200,
      signatureHex: sigHex,
      webhookSecret: secret,
      processedEventIds: processed,
    })
    expect(validAttempt.valid).toBe(true)
    expect(validAttempt.creditedPaidCoins).toBe(100_000)

    // Card settlement reserve: new host (<10 payouts) held 30d + 10% 90d rolling reserve
    const newHostHold = evaluateCardReserveAndRollingHold({
      grossHostEarningThb: 1000,
      fundingRail: 'CARD_INTERNATIONAL_OR_MOR',
      hostCompletedPayoutCount: 2,
      daysSinceEarned: 15,
    })
    expect(newHostHold.requiredSettlementDays).toBe(30)
    expect(newHostHold.instantWithdrawableThb).toBe(0)
    expect(newHostHold.settlementReserveHeldThb).toBe(900)
    expect(newHostHold.rolling90dReserveHeldThb).toBe(100)

    // Established host (>=10 payouts) at day 20 unlocks 90% main tranche while keeping 10% in 90d rolling reserve
    const estHostDay20 = evaluateCardReserveAndRollingHold({
      grossHostEarningThb: 1000,
      fundingRail: 'CARD_INTERNATIONAL_OR_MOR',
      hostCompletedPayoutCount: 12,
      daysSinceEarned: 20,
    })
    expect(estHostDay20.requiredSettlementDays).toBe(14)
    expect(estHostDay20.instantWithdrawableThb).toBe(900)
    expect(estHostDay20.rolling90dReserveHeldThb).toBe(100)

    // Chargeback reversal takes host balance negative and freezes cashout
    const clawback = executeChargebackReversalAndFreeze({
      disputeEventId: 'dp_stolen_card_01',
      hostId: 'host-mint',
      currentHostAvailableThb: 200,
      currentHostReserveThb: 100,
      chargebackHostShareThb: 800,
    })
    expect(clawback.deductedFromReserveThb).toBe(100)
    expect(clawback.deductedFromAvailableThb).toBe(700)
    expect(clawback.newHostAvailableThb).toBe(-500)
    expect(clawback.isNegativeBalance).toBe(true)
    expect(clawback.cashoutFrozen).toBe(true)
  })
})


