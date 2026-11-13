import { beforeEach, describe, expect, it } from 'vitest'
import {
  calculateMaxSafeBountyThb,
  calculateRepeatPairPlatformFeePct,
  getPaymentsMode,
  isLuckyRngVaulted,
  setPaymentsMode,
} from './configDefaults'
import { createInitialLuckyPoolState, processDeterministicResonanceCombo } from './luckyPoolRng'
import {
  captureAttributionFromUrl,
  readAttribution,
  readFunnelBySource,
  recordAttributedBump,
  recordAttributedHostVerification,
  recordAttributedSignUp,
} from './attribution'

describe('Fable Legal-First Launch & Option A Mitigations', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it('Option A · Vaults random RNG and runs Deterministic Resonance Combo (zero RNG, reservoir-safe)', () => {
    expect(isLuckyRngVaulted()).toBe(true)
    const state0 = createInitialLuckyPoolState(20_000)

    // Tap 1 (x1, streak 1): feeds reservoir, 0 milestone payout
    const step1 = processDeterministicResonanceCombo(state0, 500, 1, 1)
    expect(step1.outcome.payoutCoins).toBe(0)
    expect(step1.nextState.reservoirBalanceCoins).toBe(20_400)

    // Tap 3 (x1, streak 3): deterministic 2x echo milestone
    const step3 = processDeterministicResonanceCombo(step1.nextState, 500, 1, 3)
    expect(step3.outcome.multiplierWon).toBe(2)
    expect(step3.outcome.payoutCoins).toBe(1_000)
    expect(step3.nextState.reservoirBalanceCoins).toBeGreaterThan(0)

    // x10 combo: deterministic 5x resonance burst
    const step10 = processDeterministicResonanceCombo(step3.nextState, 500, 10, 4)
    expect(step10.outcome.multiplierWon).toBe(5)
    expect(step10.outcome.payoutCoins).toBe(2_500)
  })

  it('P1.1 & KRING_PAYOUT_LEAKS #5 · Enforces anti-collusion bounty cap R <= 0.15F and preserves full platform fee on repeat bookings', () => {
    expect(calculateMaxSafeBountyThb(900)).toBe(135)
    expect(calculateMaxSafeBountyThb(1200)).toBe(180)
    expect(calculateRepeatPairPlatformFeePct(0)).toBe(20)
    expect(calculateRepeatPairPlatformFeePct(1)).toBe(20)
    expect(calculateRepeatPairPlatformFeePct(2)).toBe(20)
    expect(calculateRepeatPairPlatformFeePct(5, true, true)).toBe(20)
  })

  it('P0.3 · Supports payments_mode switch (psp | interim | off)', () => {
    expect(getPaymentsMode()).toBe('psp')
    setPaymentsMode('off')
    expect(getPaymentsMode()).toBe('off')
    setPaymentsMode('interim')
    expect(getPaymentsMode()).toBe('interim')
  })

  it('P1.8 · Captures first-touch attribution (?src=, ?venue=, ?creator=) and records funnel conversions', () => {
    const rec = captureAttributionFromUrl('?src=QR_HOSTEL_LUBD&venue=lubd_siam&creator=ploy')
    expect(rec?.src).toBe('QR_HOSTEL_LUBD')
    expect(rec?.venue).toBe('lubd_siam')
    expect(readAttribution()?.src).toBe('QR_HOSTEL_LUBD')

    recordAttributedSignUp()
    recordAttributedHostVerification()
    recordAttributedBump()

    const funnel = readFunnelBySource()['QR_HOSTEL_LUBD']
    expect(funnel).toMatchObject({
      visits: 1,
      signUps: 1,
      verifiedHosts: 1,
      completedBumps: 1,
    })
  })
})
