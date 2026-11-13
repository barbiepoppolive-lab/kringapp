import { describe, expect, it } from 'vitest'
import {
  CIRCUIT_BREAKER_COOLDOWN_MS,
  MODE_C_CHECKIN_DISCLOSURE,
  createPaymentRouter,
} from './paymentRouter'

describe('Kring v6.2 — 3-Mode Automatic Failover Payment Router & Circuit Breaker', () => {
  it('1. routes standard bookings to Mode A (Offshore Escrow) and releases 80% to Host at <=100m bump', async () => {
    const router = createPaymentRouter()
    const charge = await router.charge({
      idempotencyKey: 'idem_mode_a_1',
      bookingId: 'bk_1001',
      activityPriceBaht: 1200,
      hostId: 'ploy',
      hostName: 'Ploy',
      travellerCountryCode: 'GB',
      paymentMethod: 'CARD',
    })

    expect(charge.selectedMode).toBe('MODE_A_OFFSHORE_ESCROW')
    expect(charge.provider).toBe('TAZAPAY')
    expect(charge.breakdown.onlineChargeTotalBaht).toBe(1225)
    expect(charge.breakdown.hostShareBaht).toBe(960)
    expect(charge.breakdown.uiSummaryBahtOnly.includes('%')).toBe(false)

    const confirm = await router.holdOrConfirm({
      idempotencyKey: 'idem_confirm_a_1',
      bookingId: 'bk_1001',
      chargeResult: charge,
      hostId: 'ploy',
      hostName: 'Ploy',
      hostPromptPayId: '0812345678',
      distanceMeters: 42,
      bumpVerified: true,
    })

    expect(confirm.status).toBe('ESCROW_RELEASED_TO_HOST')
    expect(confirm.releasedToHostBaht).toBe(960)
    expect(confirm.uiReceiptLineBahtOnly).toBe('Released to Ploy ฿960')
    expect(confirm.uiReceiptLineBahtOnly.includes('%')).toBe(false)
  })

  it('2. trips the 30-Minute Health Circuit Breaker after 3 failures in 10m (Mode A -> Mode B -> Mode C) and recovers after 30m', async () => {
    const router = createPaymentRouter()
    const t0 = 1_700_000_000_000

    // 3 failures on Mode A within 10 minutes
    router.recordModeFailure('MODE_A_OFFSHORE_ESCROW', t0 + 10_000)
    router.recordModeFailure('MODE_A_OFFSHORE_ESCROW', t0 + 50_000)
    const stateA = router.recordModeFailure('MODE_A_OFFSHORE_ESCROW', t0 + 120_000)
    expect(stateA.status).toBe('OPEN_TRIPPED')
    expect(router.isModeHealthy('MODE_A_OFFSHORE_ESCROW', t0 + 180_000)).toBe(false)

    // Next charge automatically fails over to Mode B (Indian Licensed Gateway)
    const chargeB = await router.charge({
      idempotencyKey: 'idem_failover_b',
      bookingId: 'bk_1002',
      activityPriceBaht: 1200,
      hostId: 'mint',
      hostName: 'Mint',
      travellerCountryCode: 'IN',
      paymentMethod: 'UPI',
      nowMs: t0 + 180_000,
    })
    expect(chargeB.selectedMode).toBe('MODE_B_INDIAN_GATEWAY')
    expect(chargeB.provider).toBe('PAYGLOCAL')
    expect(chargeB.failoverTrail).toEqual(['MODE_B_INDIAN_GATEWAY'])

    // Now trip Mode B with 3 failures in 10m -> automatic failover to Mode C (Unbreakable Day-1 Floor)
    router.recordModeFailure('MODE_B_INDIAN_GATEWAY', t0 + 200_000)
    router.recordModeFailure('MODE_B_INDIAN_GATEWAY', t0 + 220_000)
    router.recordModeFailure('MODE_B_INDIAN_GATEWAY', t0 + 240_000)

    const chargeC = await router.charge({
      idempotencyKey: 'idem_failover_c',
      bookingId: 'bk_1003',
      activityPriceBaht: 1200,
      hostId: 'mint',
      hostName: 'Mint',
      travellerCountryCode: 'US',
      paymentMethod: 'CARD',
      nowMs: t0 + 250_000,
    })
    expect(chargeC.selectedMode).toBe('MODE_C_KRING_PASS_AND_PROMPTPAY_QR')
    expect(chargeC.provider).toBe('DODO_DIGITAL_PASS')
    expect(chargeC.breakdown.onlineChargeTotalBaht).toBe(265) // ฿240 (20%) + ฿25 fee
    expect(chargeC.breakdown.payAtVenueToHostBaht).toBe(960) // ฿960 (80%) at check-in

    // After 30 minutes cooldown, Mode A automatically recovers to healthy
    expect(
      router.isModeHealthy('MODE_A_OFFSHORE_ESCROW', t0 + 120_000 + CIRCUIT_BREAKER_COOLDOWN_MS + 1)
    ).toBe(true)
  })

  it('3. routes Russian & ASEAN Cross-Border QR (SG PayNow / MY DuitNow / ID QRIS) to Mode C and displays Host PromptPay QR at check-in', async () => {
    const router = createPaymentRouter()

    const sgCharge = await router.charge({
      idempotencyKey: 'idem_sg_paynow',
      bookingId: 'bk_sg_1',
      activityPriceBaht: 1600,
      hostId: 'kwan',
      hostName: 'Kwan',
      travellerCountryCode: 'SG',
      paymentMethod: 'PAYNOW_SG',
    })

    expect(sgCharge.selectedMode).toBe('MODE_C_KRING_PASS_AND_PROMPTPAY_QR')
    expect(sgCharge.dodoProductId).toBe('pdt_0NqU0YbOcrbkdhD8PWvqg')
    expect(sgCharge.breakdown.onlineChargeTotalBaht).toBe(345) // ฿320 + ฿25
    expect(sgCharge.breakdown.payAtVenueToHostBaht).toBe(1280)

    const checkIn = await router.holdOrConfirm({
      idempotencyKey: 'idem_sg_checkin',
      bookingId: 'bk_sg_1',
      chargeResult: sgCharge,
      hostId: 'kwan',
      hostName: 'Kwan',
      hostPromptPayId: '0899998888',
      distanceMeters: 15,
      bumpVerified: true,
    })

    expect(checkIn.status).toBe('SHOW_HOST_PROMPTPAY_QR_AT_CHECKIN')
    expect(checkIn.modeCCheckInQr?.amountDueToHostBaht).toBe(1280)
    expect(checkIn.modeCCheckInQr?.instructionEn).toBe(MODE_C_CHECKIN_DISCLOSURE)
    expect(checkIn.uiReceiptLineBahtOnly.includes('%')).toBe(false)
  })

  it('4. executes Mode B idempotent 3-retry Host PromptPay payout queue and fails over to NIUM_THB_PROMPTPAY after 3 primary failures', async () => {
    const router = createPaymentRouter()
    const payoutFallback = await router.payout({
      idempotencyKey: 'idem_payout_retry_1',
      bookingId: 'bk_retry_1',
      hostId: 'ploy',
      hostPromptPayId: '0812345678',
      amountBaht: 960,
      mode: 'MODE_B_INDIAN_GATEWAY',
      simulatePrimaryFailures: 3,
    })

    expect(payoutFallback.ok).toBe(true)
    expect(payoutFallback.usedFallbackRail).toBe(true)
    expect(payoutFallback.providerUsed).toBe('NIUM_THB_PROMPTPAY')
    expect(payoutFallback.job.status).toBe('SETTLED_VIA_FALLBACK_RAIL')
    expect(payoutFallback.job.retryScheduleOffsetsMs).toEqual([0, 1200000, 2400000])
  })
})
