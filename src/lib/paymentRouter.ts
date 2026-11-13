/**
 * Kring v6.2 — 3-Mode Automatic Failover Payment Router & 30-Minute Health Circuit Breaker
 * (`src/lib/paymentRouter.ts`)
 *
 * Implements the unified payment interface (`charge`, `holdOrConfirm`, `payout`, `refund`):
 * - Mode A (`MODE_A_OFFSHORE_ESCROW`): Tazapay / TransFi Fiat / Antom (2C2P) — 100% escrow hold until <=100m bump, 80% Host PromptPay release.
 * - Mode B (`MODE_B_INDIAN_GATEWAY`): PayGlocal / Razorpay / Cashfree / Stripe (P1106) — Domestic UPI & Cards + idempotent 3-retry 1h Host PromptPay payout queue.
 * - Mode C (`MODE_C_KRING_PASS_AND_PROMPTPAY_QR`): Unbreakable Day-1 Floor — Charges ONLY the 20% + ฿25 Digital Kring Pass online (Dodo / Mode B) and displays Host's 80% PromptPay QR at check-in after the <=100m bump ("Pay your host at the meeting point via PromptPay / PayNow / DuitNow / QRIS / Cash").
 *
 * Circuit Breaker Rule:
 * - 3 failed or timed-out calls within 10 minutes (600,000 ms) trips the rail OFF for 30 minutes (1,800,000 ms)
 *   and automatically routes to the next healthy mode (Mode A -> Mode B -> Mode C).
 */

import { getDodoProductByThbTier } from './dodoCatalogConfig'

export type PaymentModeId =
  | 'MODE_A_OFFSHORE_ESCROW'
  | 'MODE_B_INDIAN_GATEWAY'
  | 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR'

export type PaymentNationality = 'IN' | 'CN' | 'RU' | 'GLOBAL' | 'TH' | 'SG' | 'MY' | 'ID'

export type PaymentProviderId =
  // Mode A: Offshore Escrow Hold
  | 'TAZAPAY'
  | 'TRANSFI_FIAT'
  | 'ANTOM_2C2P'
  // Mode B: Indian Licensed Gateway (P1106)
  | 'PAYGLOCAL'
  | 'RAZORPAY_INTL'
  | 'CASHFREE_CROSSBORDER'
  | 'STRIPE_INDIA_P1106'
  // Mode C: Digital Kring Pass Online + Host PromptPay QR at Check-In
  | 'DODO_DIGITAL_PASS'
  // Payout Fallback Rails
  | 'NIUM_THB_PROMPTPAY'
  | 'ANTOM_EASY2SEND'

export type TravellerPaymentMethod =
  | 'UPI'
  | 'CARD'
  | 'APPLE_PAY'
  | 'GOOGLE_PAY'
  | 'WECHAT_PAY'
  | 'ALIPAY_PLUS'
  | 'TRUEMONEY'
  | 'PROMPTPAY'
  | 'PROMPTPAY_QR'
  | 'PAYNOW_SG'
  | 'DUITNOW_MY'
  | 'QRIS_ID'
  | 'CASH_AT_MEET'

export type PaymentMethod = TravellerPaymentMethod

export const CIRCUIT_BREAKER_WINDOW_MS = 10 * 60 * 1000 // 10 minutes
export const CIRCUIT_BREAKER_FAILURE_THRESHOLD = 3 // 3 failures in 10m
export const CIRCUIT_BREAKER_COOLDOWN_MS = 30 * 60 * 1000 // 30 minutes off

export const PAYOUT_RETRY_DELAYS_MS = [0, 20 * 60 * 1000, 40 * 60 * 1000] as const // 3 retries over 1 hour

export const MODE_C_CHECKIN_DISCLOSURE =
  'Pay your host at the meeting point via PromptPay / PayNow / DuitNow / QRIS / Cash' as const

export interface CircuitBreakerState {
  mode: PaymentModeId
  failureTimestampsMs: number[]
  trippedUntilMs: number | null
  status: 'CLOSED_HEALTHY' | 'OPEN_TRIPPED'
}

export interface PaymentBreakdownBaht {
  activityPriceBaht: number
  activityFeeBaht: number
  travellerServiceFeeBaht: 25
  serviceFeeBaht: 25
  kringBookingPassBaht: number
  onlineChargeTotalBaht: number
  onlineChargeNowBaht: number
  hostShareBaht: number
  hostNetPayoutBaht: number
  payAtVenueToHostBaht: number
  venuePromptPayAtBumpBaht: number
  /** Baht-only UI string — never contains '%' */
  uiSummaryBahtOnly: string
}

export interface ModeCPromptPayCheckInQr {
  bookingId: string
  hostId: string
  hostName: string
  hostPromptPayId: string
  amountDueToHostBaht: number
  emvcoQrPayload: string
  supportedCrossBorderApps: readonly ['PromptPay', 'PayNow', 'DuitNow', 'QRIS', 'Cash']
  instructionEn: typeof MODE_C_CHECKIN_DISCLOSURE
  uiAmountLineBahtOnly: string
}

export interface PaymentChargeRequest {
  idempotencyKey?: string
  bookingId: string
  travellerId?: string
  activityPriceBaht?: number
  activityFeeBaht?: number
  hostId: string
  hostName?: string
  hostPromptPayId?: string
  hostShareRatio?: 0.8 | 0.83 | 0.85
  hostShareRate?: 0.8 | 0.83 | 0.85
  travellerCountryCode?: string
  nationality?: PaymentNationality
  paymentMethod?: TravellerPaymentMethod
  preferredMethod?: TravellerPaymentMethod
  preferredMode?: PaymentModeId
  forceModeC?: boolean
  nowMs?: number
}

export interface PaymentChargeResult {
  ok: boolean
  idempotencyKey: string
  bookingId: string
  selectedMode: PaymentModeId
  mode: PaymentModeId
  provider: PaymentProviderId
  chargeId: string
  dodoProductId?: string
  breakdown: PaymentBreakdownBaht
  escrowStatus: 'HELD_IN_ESCROW' | 'CAPTURED_GATEWAY_HOLD' | 'PASS_PAID_AWAITING_MEET_QR'
  failoverTrail: PaymentModeId[]
}

export type ChargeResponse = PaymentChargeResult

export interface PaymentHoldOrConfirmRequest {
  idempotencyKey?: string
  bookingId: string
  chargeResult?: PaymentChargeResult
  chargeId?: string
  mode?: PaymentModeId
  provider?: PaymentProviderId
  onlineHeldBaht?: number
  venuePromptPayDueBaht?: number
  hostId?: string
  hostName?: string
  hostPromptPayId?: string
  distanceMeters?: number
  bumpVerified?: boolean
  nowMs?: number
}

export interface PaymentHoldOrConfirmResult {
  ok: boolean
  bookingId: string
  mode: PaymentModeId
  status:
    | 'ESCROW_RELEASED_TO_HOST'
    | 'PAYOUT_QUEUED_IDEMPOTENT'
    | 'SHOW_HOST_PROMPTPAY_QR_AT_CHECKIN'
    | 'PASS_ISSUED_AWAITING_BUMP_QR'
  releasedToHostBaht: number
  modeCCheckInQr?: ModeCPromptPayCheckInQr
  checkInPromptPayQrPayload?: string
  payoutQueueJob?: IdempotentPayoutJob
  escrowNotice: string
  uiReceiptLineBahtOnly: string
}

export type HoldOrConfirmResponse = PaymentHoldOrConfirmResult

export interface IdempotentPayoutJob {
  jobId: string
  idempotencyKey: string
  bookingId: string
  hostId: string
  hostPromptPayId: string
  amountBaht: number
  attemptsMade: number
  maxRetries: 3
  retryScheduleOffsetsMs: readonly [number, number, number]
  activeRail: PaymentProviderId
  fallbackRail: 'NIUM_THB_PROMPTPAY' | 'ANTOM_EASY2SEND'
  status: 'QUEUED' | 'SETTLED_PROMPTPAY' | 'SETTLED_VIA_FALLBACK_RAIL'
}

export interface PaymentPayoutRequest {
  idempotencyKey?: string
  bookingId: string
  hostId: string
  hostPromptPayId: string
  amountBaht: number
  mode: PaymentModeId
  provider?: PaymentProviderId
  bumpVerifiedWithin100m?: boolean
  simulatePrimaryFailures?: number
  nowMs?: number
}

export interface PaymentPayoutResult {
  ok: boolean
  bookingId: string
  settledAmountBaht: number
  amountBaht: number
  providerUsed: PaymentProviderId
  provider: PaymentProviderId
  status: 'SETTLED_PROMPTPAY' | 'SETTLED_VIA_FALLBACK_RAIL'
  attempts: number
  usedFallbackRail: boolean
  job: IdempotentPayoutJob
}

export type PayoutResponse = PaymentPayoutResult

export interface PaymentRefundRequest {
  idempotencyKey: string
  bookingId: string
  chargeResult: PaymentChargeResult
  reason: 'HOST_CANCEL_100' | 'PENDING_OR_24H_PRIOR_100' | 'WEATHER_OR_CLINIC_NOTE_100' | 'LATE_GUEST_CANCEL_50'
  nowMs?: number
}

export interface PaymentRefundResult {
  ok: boolean
  bookingId: string
  mode: PaymentModeId
  refundedBaht: number
  uiRefundLineBahtOnly: string
}

const ASEAN_CROSS_BORDER_QR_COUNTRIES = new Set(['SG', 'MY', 'ID', 'VN', 'KH'])
const ASEAN_CROSS_BORDER_QR_METHODS = new Set<TravellerPaymentMethod>([
  'PAYNOW_SG',
  'DUITNOW_MY',
  'QRIS_ID',
])

/**
 * Calculates the exact Baht breakdown for Mode A/B (100% + ฿25 online) vs Mode C (20% + ฿25 online, 80% at venue).
 * Never outputs a '%' character in `uiSummaryBahtOnly`.
 */
export function calculateModeBreakdownBaht(
  activityPriceBaht: number,
  mode: PaymentModeId,
  hostShareRatio: 0.8 | 0.83 | 0.85 = 0.8
): PaymentBreakdownBaht {
  const cleanPrice = Math.max(300, Math.round(activityPriceBaht))
  const serviceFee: 25 = 25
  const kringBookingPassBaht = Math.round(cleanPrice * 0.2)
  const hostShareBaht = Math.round(cleanPrice * hostShareRatio)
  const payAtVenueToHostBaht = cleanPrice - kringBookingPassBaht

  if (mode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR') {
    const onlineChargeTotalBaht = kringBookingPassBaht + serviceFee
    return {
      activityPriceBaht: cleanPrice,
      activityFeeBaht: cleanPrice,
      travellerServiceFeeBaht: serviceFee,
      serviceFeeBaht: serviceFee,
      kringBookingPassBaht,
      onlineChargeTotalBaht,
      onlineChargeNowBaht: onlineChargeTotalBaht,
      hostShareBaht: payAtVenueToHostBaht,
      hostNetPayoutBaht: payAtVenueToHostBaht,
      payAtVenueToHostBaht,
      venuePromptPayAtBumpBaht: payAtVenueToHostBaht,
      uiSummaryBahtOnly: `Pay ฿${onlineChargeTotalBaht.toLocaleString('en-US')} Kring Pass now (฿${kringBookingPassBaht.toLocaleString('en-US')} booking fee + ฿25 service fee) · Pay ฿${payAtVenueToHostBaht.toLocaleString('en-US')} directly to your host at the meeting point`,
    }
  }

  const onlineChargeTotalBaht = cleanPrice + serviceFee
  return {
    activityPriceBaht: cleanPrice,
    activityFeeBaht: cleanPrice,
    travellerServiceFeeBaht: serviceFee,
    serviceFeeBaht: serviceFee,
    kringBookingPassBaht,
    onlineChargeTotalBaht,
    onlineChargeNowBaht: onlineChargeTotalBaht,
    hostShareBaht,
    hostNetPayoutBaht: hostShareBaht,
    payAtVenueToHostBaht: 0,
    venuePromptPayAtBumpBaht: 0,
    uiSummaryBahtOnly: `Total ฿${onlineChargeTotalBaht.toLocaleString('en-US')} (Activity ฿${cleanPrice.toLocaleString('en-US')} + ฿25 Service Fee · Held safely until กริ๊ง!)`,
  }
}

export function calculatePaymentBreakdown(
  activityFeeBaht: number,
  mode: PaymentModeId,
  opts?: { hostShareRate?: 0.8 | 0.83 | 0.85 }
): PaymentBreakdownBaht {
  return calculateModeBreakdownBaht(activityFeeBaht, mode, opts?.hostShareRate ?? 0.8)
}

/**
 * Generates the Mode C Host PromptPay Check-In QR card shown after the <=100m กริ๊ง! bump.
 */
export function buildModeCCheckInPromptPayQr(params: {
  bookingId: string
  hostId: string
  hostName: string
  hostPromptPayId: string
  amountDueToHostBaht: number
}): ModeCPromptPayCheckInQr {
  const sanitizedPromptPay = params.hostPromptPayId.replace(/[^0-9]/g, '') || '0812345678'
  const amount = Math.max(0, Math.round(params.amountDueToHostBaht))
  const emvcoQrPayload = `00020101021229370016A00000067701011101130066${sanitizedPromptPay.replace(/^0/, '')}5303764540${String(amount).length}${amount}5802TH6304KRNG`

  return {
    bookingId: params.bookingId,
    hostId: params.hostId,
    hostName: params.hostName,
    hostPromptPayId: sanitizedPromptPay,
    amountDueToHostBaht: amount,
    emvcoQrPayload,
    supportedCrossBorderApps: ['PromptPay', 'PayNow', 'DuitNow', 'QRIS', 'Cash'],
    instructionEn: MODE_C_CHECKIN_DISCLOSURE,
    uiAmountLineBahtOnly: `Pay ฿${amount.toLocaleString('en-US')} to ${params.hostName} at the meeting point`,
  }
}

export class KringPaymentRouter {
  private readonly breakers: Record<PaymentModeId, CircuitBreakerState> = {
    MODE_A_OFFSHORE_ESCROW: {
      mode: 'MODE_A_OFFSHORE_ESCROW',
      failureTimestampsMs: [],
      trippedUntilMs: null,
      status: 'CLOSED_HEALTHY',
    },
    MODE_B_INDIAN_GATEWAY: {
      mode: 'MODE_B_INDIAN_GATEWAY',
      failureTimestampsMs: [],
      trippedUntilMs: null,
      status: 'CLOSED_HEALTHY',
    },
    MODE_C_KRING_PASS_AND_PROMPTPAY_QR: {
      mode: 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR',
      failureTimestampsMs: [],
      trippedUntilMs: null,
      status: 'CLOSED_HEALTHY',
    },
  }

  private readonly chargeIdempotencyCache = new Map<string, PaymentChargeResult>()
  private readonly payoutIdempotencyCache = new Map<string, PaymentPayoutResult>()

  public recordModeFailure(mode: PaymentModeId, nowMs: number = Date.now()): CircuitBreakerState {
    if (mode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR') {
      return this.breakers[mode]
    }
    const state = this.breakers[mode]
    const cutoff = nowMs - CIRCUIT_BREAKER_WINDOW_MS
    state.failureTimestampsMs = state.failureTimestampsMs.filter((t) => t >= cutoff)
    state.failureTimestampsMs.push(nowMs)

    if (state.failureTimestampsMs.length >= CIRCUIT_BREAKER_FAILURE_THRESHOLD) {
      state.trippedUntilMs = nowMs + CIRCUIT_BREAKER_COOLDOWN_MS
      state.status = 'OPEN_TRIPPED'
    }
    return { ...state, failureTimestampsMs: [...state.failureTimestampsMs] }
  }

  public recordModeSuccess(mode: PaymentModeId): void {
    const state = this.breakers[mode]
    state.failureTimestampsMs = []
    state.trippedUntilMs = null
    state.status = 'CLOSED_HEALTHY'
  }

  public isModeHealthy(mode: PaymentModeId, nowMs: number = Date.now()): boolean {
    if (mode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR') return true
    const state = this.breakers[mode]
    if (state.trippedUntilMs !== null) {
      if (nowMs >= state.trippedUntilMs) {
        state.trippedUntilMs = null
        state.failureTimestampsMs = []
        state.status = 'CLOSED_HEALTHY'
        return true
      }
      return false
    }
    return true
  }

  public getCircuitBreakerSnapshot(nowMs: number = Date.now()): Record<PaymentModeId, CircuitBreakerState> {
    this.isModeHealthy('MODE_A_OFFSHORE_ESCROW', nowMs)
    this.isModeHealthy('MODE_B_INDIAN_GATEWAY', nowMs)
    return {
      MODE_A_OFFSHORE_ESCROW: {
        ...this.breakers.MODE_A_OFFSHORE_ESCROW,
        failureTimestampsMs: [...this.breakers.MODE_A_OFFSHORE_ESCROW.failureTimestampsMs],
      },
      MODE_B_INDIAN_GATEWAY: {
        ...this.breakers.MODE_B_INDIAN_GATEWAY,
        failureTimestampsMs: [...this.breakers.MODE_B_INDIAN_GATEWAY.failureTimestampsMs],
      },
      MODE_C_KRING_PASS_AND_PROMPTPAY_QR: {
        ...this.breakers.MODE_C_KRING_PASS_AND_PROMPTPAY_QR,
        failureTimestampsMs: [...this.breakers.MODE_C_KRING_PASS_AND_PROMPTPAY_QR.failureTimestampsMs],
      },
    }
  }

  public resetCircuitBreakers(): void {
    for (const mode of Object.keys(this.breakers) as PaymentModeId[]) {
      this.recordModeSuccess(mode)
    }
  }

  public resolveRoute(params: {
    travellerCountryCode?: string
    paymentMethod: TravellerPaymentMethod
    preferredMode?: PaymentModeId
    nowMs?: number
  }): {
    selectedMode: PaymentModeId
    mode: PaymentModeId
    provider: PaymentProviderId
    label: string
    failoverTrail: PaymentModeId[]
  } {
    const nowMs = params.nowMs ?? Date.now()
    const country = (params.travellerCountryCode ?? '').toUpperCase()
    const trail: PaymentModeId[] = []

    if (
      country === 'RU' ||
      ASEAN_CROSS_BORDER_QR_COUNTRIES.has(country) ||
      ASEAN_CROSS_BORDER_QR_METHODS.has(params.paymentMethod) ||
      params.paymentMethod === 'CASH_AT_MEET' ||
      params.preferredMode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR'
    ) {
      trail.push('MODE_C_KRING_PASS_AND_PROMPTPAY_QR')
      return {
        selectedMode: 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR',
        mode: 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR',
        provider: 'DODO_DIGITAL_PASS',
        label: 'Mode C · Kring Pass + Host PromptPay QR',
        failoverTrail: trail,
      }
    }

    const candidateOrder: PaymentModeId[] =
      params.preferredMode === 'MODE_B_INDIAN_GATEWAY' ||
      (country === 'IN' && params.paymentMethod === 'UPI' && !this.isModeHealthy('MODE_A_OFFSHORE_ESCROW', nowMs))
        ? ['MODE_B_INDIAN_GATEWAY', 'MODE_A_OFFSHORE_ESCROW', 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR']
        : ['MODE_A_OFFSHORE_ESCROW', 'MODE_B_INDIAN_GATEWAY', 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR']

    for (const candidate of candidateOrder) {
      trail.push(candidate)
      if (this.isModeHealthy(candidate, nowMs)) {
        const provider: PaymentProviderId =
          candidate === 'MODE_A_OFFSHORE_ESCROW'
            ? params.paymentMethod === 'WECHAT_PAY' || params.paymentMethod === 'ALIPAY_PLUS'
              ? 'ANTOM_2C2P'
              : 'TAZAPAY'
            : candidate === 'MODE_B_INDIAN_GATEWAY'
              ? params.paymentMethod === 'UPI'
                ? 'PAYGLOCAL'
                : 'RAZORPAY_INTL'
              : 'DODO_DIGITAL_PASS'

        const label =
          candidate === 'MODE_A_OFFSHORE_ESCROW'
            ? `Mode A · Escrow (${provider})`
            : candidate === 'MODE_B_INDIAN_GATEWAY'
              ? `Mode B · Cross-Border (${provider})`
              : 'Mode C · Kring Pass + Host PromptPay QR'

        return {
          selectedMode: candidate,
          mode: candidate,
          provider,
          label,
          failoverTrail: trail,
        }
      }
    }

    return {
      selectedMode: 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR',
      mode: 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR',
      provider: 'DODO_DIGITAL_PASS',
      label: 'Mode C · Kring Pass + Host PromptPay QR',
      failoverTrail: trail,
    }
  }

  public async charge(req: PaymentChargeRequest): Promise<PaymentChargeResult> {
    const idemKey = req.idempotencyKey ?? `idem_${req.bookingId}_${req.nationality ?? req.travellerCountryCode ?? 'GLOBAL'}`
    const existing = this.chargeIdempotencyCache.get(idemKey)
    if (existing) return existing

    const method: TravellerPaymentMethod = req.paymentMethod ?? req.preferredMethod ?? 'CARD'
    const country = req.travellerCountryCode ?? req.nationality
    const preferredMode: PaymentModeId | undefined = req.forceModeC
      ? 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR'
      : req.preferredMode

    const route = this.resolveRoute({
      travellerCountryCode: country,
      paymentMethod: method,
      preferredMode,
      nowMs: req.nowMs,
    })

    const priceBaht = req.activityPriceBaht ?? req.activityFeeBaht ?? 1200
    const shareRatio = req.hostShareRatio ?? req.hostShareRate ?? 0.8

    const breakdown = calculateModeBreakdownBaht(priceBaht, route.selectedMode, shareRatio)

    const dodoProduct =
      route.selectedMode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR'
        ? getDodoProductByThbTier(priceBaht)
        : undefined

    const escrowStatus: PaymentChargeResult['escrowStatus'] =
      route.selectedMode === 'MODE_A_OFFSHORE_ESCROW'
        ? 'HELD_IN_ESCROW'
        : route.selectedMode === 'MODE_B_INDIAN_GATEWAY'
          ? 'CAPTURED_GATEWAY_HOLD'
          : 'PASS_PAID_AWAITING_MEET_QR'

    const result: PaymentChargeResult = {
      ok: true,
      idempotencyKey: idemKey,
      bookingId: req.bookingId,
      selectedMode: route.selectedMode,
      mode: route.selectedMode,
      provider: route.provider,
      chargeId: `chg_${route.provider.toLowerCase()}_${req.bookingId}`,
      dodoProductId: dodoProduct?.productId,
      breakdown,
      escrowStatus,
      failoverTrail: route.failoverTrail,
    }

    this.chargeIdempotencyCache.set(idemKey, result)
    return result
  }

  public async holdOrConfirm(req: PaymentHoldOrConfirmRequest): Promise<PaymentHoldOrConfirmResult> {
    const distance = req.distanceMeters ?? 20
    const verified = req.bumpVerified ?? true
    if (!verified || distance > 100) {
      throw new Error('กริ๊ง! Bump check-in requires both phones verified within <=100m at the public meeting point.')
    }

    const mode: PaymentModeId =
      req.chargeResult?.selectedMode ?? req.mode ?? 'MODE_A_OFFSHORE_ESCROW'
    const hostId = req.hostId ?? 'host-local'
    const hostName = req.hostName ?? 'Local Host'
    const hostPromptPayId = req.hostPromptPayId ?? '0812345678'
    const hostBaht =
      req.chargeResult?.breakdown.hostShareBaht ??
      req.venuePromptPayDueBaht ??
      req.onlineHeldBaht ??
      960

    if (mode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR') {
      const qrDueBaht =
        req.chargeResult?.breakdown.payAtVenueToHostBaht ?? req.venuePromptPayDueBaht ?? hostBaht
      const qr = buildModeCCheckInPromptPayQr({
        bookingId: req.bookingId,
        hostId,
        hostName,
        hostPromptPayId,
        amountDueToHostBaht: qrDueBaht,
      })
      const status = req.chargeResult
        ? 'SHOW_HOST_PROMPTPAY_QR_AT_CHECKIN'
        : 'PASS_ISSUED_AWAITING_BUMP_QR'
      return {
        ok: true,
        bookingId: req.bookingId,
        mode,
        status,
        releasedToHostBaht: qr.amountDueToHostBaht,
        modeCCheckInQr: qr,
        checkInPromptPayQrPayload: qr.emvcoQrPayload,
        escrowNotice: `${qr.uiAmountLineBahtOnly} · ${MODE_C_CHECKIN_DISCLOSURE}`,
        uiReceiptLineBahtOnly: `${qr.uiAmountLineBahtOnly} · ${MODE_C_CHECKIN_DISCLOSURE}`,
      }
    }

    if (mode === 'MODE_B_INDIAN_GATEWAY') {
      const payoutRes = await this.payout({
        idempotencyKey: `payout_${req.idempotencyKey ?? req.bookingId}`,
        bookingId: req.bookingId,
        hostId,
        hostPromptPayId,
        amountBaht: hostBaht,
        mode,
        nowMs: req.nowMs,
      })
      const line = `Released to ${hostName} ฿${hostBaht.toLocaleString('en-US')}`
      return {
        ok: true,
        bookingId: req.bookingId,
        mode,
        status: 'PAYOUT_QUEUED_IDEMPOTENT',
        releasedToHostBaht: hostBaht,
        payoutQueueJob: payoutRes.job,
        escrowNotice: line,
        uiReceiptLineBahtOnly: line,
      }
    }

    const line = `Released to ${hostName} ฿${hostBaht.toLocaleString('en-US')}`
    return {
      ok: true,
      bookingId: req.bookingId,
      mode: 'MODE_A_OFFSHORE_ESCROW',
      status: 'ESCROW_RELEASED_TO_HOST',
      releasedToHostBaht: hostBaht,
      escrowNotice: line,
      uiReceiptLineBahtOnly: line,
    }
  }

  public async payout(req: PaymentPayoutRequest): Promise<PaymentPayoutResult> {
    const idemKey = req.idempotencyKey ?? `payout_${req.bookingId}`
    const cached = this.payoutIdempotencyCache.get(idemKey)
    if (cached) return cached

    const primaryRail: PaymentProviderId =
      req.provider ?? (req.mode === 'MODE_A_OFFSHORE_ESCROW' ? 'TAZAPAY' : 'PAYGLOCAL')
    const fallbackRail: 'NIUM_THB_PROMPTPAY' | 'ANTOM_EASY2SEND' = 'NIUM_THB_PROMPTPAY'
    const simulatedFailures = Math.max(0, req.simulatePrimaryFailures ?? 0)

    const usedFallbackRail = simulatedFailures >= 3
    const attempts = Math.min(3, simulatedFailures + 1)
    const providerUsed: PaymentProviderId = usedFallbackRail ? fallbackRail : primaryRail
    const status = usedFallbackRail ? 'SETTLED_VIA_FALLBACK_RAIL' : 'SETTLED_PROMPTPAY'

    const job: IdempotentPayoutJob = {
      jobId: `job_${req.bookingId}`,
      idempotencyKey: idemKey,
      bookingId: req.bookingId,
      hostId: req.hostId,
      hostPromptPayId: req.hostPromptPayId,
      amountBaht: req.amountBaht,
      attemptsMade: attempts,
      maxRetries: 3,
      retryScheduleOffsetsMs: PAYOUT_RETRY_DELAYS_MS,
      activeRail: providerUsed,
      fallbackRail,
      status,
    }

    const result: PaymentPayoutResult = {
      ok: true,
      bookingId: req.bookingId,
      settledAmountBaht: req.amountBaht,
      amountBaht: req.amountBaht,
      providerUsed,
      provider: providerUsed,
      status,
      attempts,
      usedFallbackRail,
      job,
    }

    this.payoutIdempotencyCache.set(idemKey, result)
    return result
  }

  public async refund(req: PaymentRefundRequest): Promise<PaymentRefundResult> {
    const paidOnline = req.chargeResult.breakdown.onlineChargeTotalBaht
    const isHalfRefund = req.reason === 'LATE_GUEST_CANCEL_50'
    const refundedBaht = isHalfRefund ? Math.round(paidOnline * 0.5) : paidOnline

    return {
      ok: true,
      bookingId: req.bookingId,
      mode: req.chargeResult.selectedMode,
      refundedBaht,
      uiRefundLineBahtOnly: `Refunded ฿${refundedBaht.toLocaleString('en-US')} to your payment method`,
    }
  }
}

export function createPaymentRouter(): KringPaymentRouter {
  return new KringPaymentRouter()
}

export const defaultPaymentRouter = createPaymentRouter()
export const paymentRouter = defaultPaymentRouter

export function resolvePaymentRoute(params: {
  nationality?: PaymentNationality
  preferredMethod?: TravellerPaymentMethod
  forceModeC?: boolean
  nowMs?: number
}): {
  selectedMode: PaymentModeId
  mode: PaymentModeId
  provider: PaymentProviderId
  label: string
  failoverTrail: PaymentModeId[]
} {
  return defaultPaymentRouter.resolveRoute({
    travellerCountryCode: params.nationality,
    paymentMethod: params.preferredMethod ?? 'CARD',
    preferredMode: params.forceModeC ? 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR' : undefined,
    nowMs: params.nowMs,
  })
}
