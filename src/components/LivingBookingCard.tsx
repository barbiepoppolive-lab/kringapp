import { useMemo, useState } from 'react'
import BookingCard, { type BookingCardProps } from './booking/BookingCard'
import { triggerHaptic } from '../lib/haptics'
import { playKring } from '../lib/sfx'
import {
  paymentRouter,
  resolvePaymentRoute,
  calculatePaymentBreakdown,
  type PaymentNationality,
  type PaymentMethod,
  type HoldOrConfirmResponse,
  type PayoutResponse,
} from '../lib/paymentRouter'

export interface LivingBookingCardProps extends BookingCardProps {
  nationality?: PaymentNationality
  preferredMethod?: PaymentMethod
  forceModeC?: boolean
  hostPromptPayId?: string
  initialDistanceMeters?: number
  onModeCPromptPaySettled?: (bookingId: string, hostDirectBaht: number) => void
  onEscrowPayoutReleased?: (payout: PayoutResponse) => void
}

const fmtBaht = (n: number): string => `฿${Math.max(0, Math.round(n)).toLocaleString('en-US')}`

/**
 * LivingBookingCard — Combines the interactive 7C BookingCard with the 3-Mode Automatic Failover
 * Payment Router (`Mode A` Offshore Escrow · `Mode B` Indian Cross-Border Gateway · `Mode C`
 * `20% + ฿25` Digital Kring Pass online + `80%` Host PromptPay QR at check-in after `<=100m` `กริ๊ง!` bump).
 */
export default function LivingBookingCard({
  nationality = 'IN',
  preferredMethod = 'UPI',
  forceModeC = false,
  hostPromptPayId = '081-234-5678',
  initialDistanceMeters = 45,
  onModeCPromptPaySettled,
  onEscrowPayoutReleased,
  ...cardProps
}: LivingBookingCardProps) {
  const [modeCOverride, setModeCOverride] = useState<boolean>(forceModeC)
  const [distanceMeters, setDistanceMeters] = useState<number>(initialDistanceMeters)
  const [bumpCompleted, setBumpCompleted] = useState<boolean>(false)
  const [holdInfo, setHoldInfo] = useState<HoldOrConfirmResponse | null>(null)
  const [payoutInfo, setPayoutInfo] = useState<PayoutResponse | null>(null)
  const [modeCQrPaid, setModeCQrPaid] = useState<boolean>(false)
  const [routerBusy, setRouterBusy] = useState<boolean>(false)

  const activityFeeBaht =
    cardProps.offer?.terms.priceThb ?? cardProps.seed?.terms.priceThb ?? 1200
  const hostName =
    cardProps.offer?.localName ?? cardProps.seed?.localName ?? 'Local Host'
  const hostId = cardProps.offer?.localId ?? cardProps.seed?.localId ?? 'host-local'
  const bookingId = cardProps.offer?.bookingId ?? cardProps.offer?.id ?? 'bk-living-001'

  const route = useMemo(
    () =>
      resolvePaymentRoute({
        nationality,
        preferredMethod,
        forceModeC: modeCOverride,
      }),
    [nationality, preferredMethod, modeCOverride],
  )

  const breakdown = useMemo(
    () => calculatePaymentBreakdown(activityFeeBaht, route.mode, { hostShareRate: 0.80 }),
    [activityFeeBaht, route.mode],
  )

  const isModeC = route.mode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR'
  const withinBumpRadius = distanceMeters <= 100

  const handleBumpAndRelease = async () => {
    if (!withinBumpRadius || routerBusy) return
    setRouterBusy(true)
    triggerHaptic('success')
    playKring('release')

    try {
      const charge = await paymentRouter.charge({
        bookingId,
        travellerId: cardProps.offer?.guestId ?? 'guest-01',
        hostId,
        activityFeeBaht,
        nationality,
        preferredMethod,
        forceModeC: modeCOverride,
      })

      const confirmed = await paymentRouter.holdOrConfirm({
        bookingId,
        chargeId: charge.chargeId,
        mode: charge.mode,
        provider: charge.provider,
        onlineHeldBaht: charge.breakdown.onlineChargeNowBaht,
        venuePromptPayDueBaht: charge.breakdown.venuePromptPayAtBumpBaht,
        hostPromptPayId,
      })

      setHoldInfo(confirmed)
      setBumpCompleted(true)

      if (charge.mode !== 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR') {
        const payout = await paymentRouter.payout({
          bookingId,
          hostId,
          hostPromptPayId,
          amountBaht: charge.breakdown.hostNetPayoutBaht,
          mode: charge.mode,
          provider: charge.provider,
          bumpVerifiedWithin100m: true,
        })
        setPayoutInfo(payout)
        onEscrowPayoutReleased?.(payout)
      }
    } finally {
      setRouterBusy(false)
    }
  }

  const handleConfirmModeCPromptPayScan = () => {
    triggerHaptic('success')
    playKring('release')
    setModeCQrPaid(true)
    onModeCPromptPaySettled?.(bookingId, breakdown.venuePromptPayAtBumpBaht)
  }

  return (
    <div className="space-y-3" data-testid="living-booking-card" data-payment-mode={route.mode}>
      {/* Core 7C BookingCard */}
      <BookingCard {...cardProps} />

      {/* 3-Mode Payment Router & Check-In Panel */}
      <section
        className="rounded-2xl bg-[#0B0D1E] border border-white/10 p-3.5 text-white space-y-2.5"
        aria-label="Kring Payment Router & Check-In"
        data-testid="living-card-payment-router"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-extrabold text-indigo-300" data-testid="living-card-active-route">
            ⚡ {route.label}
          </span>
          <button
            type="button"
            data-testid="living-card-mode-c-toggle"
            onClick={() => {
              triggerHaptic('select')
              setModeCOverride((v) => !v)
            }}
            className="px-2.5 py-1 rounded-xl bg-white/10 border border-white/15 text-[11px] font-bold"
          >
            {isModeC ? 'Switch to Mode A/B Escrow' : 'Use Mode C (Kring Pass + Host QR)'}
          </button>
        </div>

        {/* Breakdown Pill */}
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 text-xs space-y-1">
          {isModeC ? (
            <>
              <div className="font-extrabold text-amber-300" data-testid="living-card-mode-c-banner">
                Pay 20% booking fee now to Kring · rest at the venue
              </div>
              <div className="flex items-center justify-between text-slate-300">
                <span>Digital Kring Pass (Paid online + ฿25 fee)</span>
                <b data-testid="living-card-pass-baht">{fmtBaht(breakdown.onlineChargeNowBaht)}</b>
              </div>
              <div className="flex items-center justify-between text-emerald-400">
                <span>Host PromptPay QR at Check-In (after ≤100m กริ๊ง!)</span>
                <b data-testid="living-card-host-qr-baht">{fmtBaht(breakdown.venuePromptPayAtBumpBaht)}</b>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between text-slate-300">
                <span>Escrow Hold (Activity + ฿25 Service Fee)</span>
                <b data-testid="living-card-escrow-baht">{fmtBaht(breakdown.onlineChargeNowBaht)}</b>
              </div>
              <div className="flex items-center justify-between text-emerald-400">
                <span>Released to {hostName} on ≤100m กริ๊ง! Bump</span>
                <b data-testid="living-card-host-payout-baht">{fmtBaht(breakdown.hostNetPayoutBaht)}</b>
              </div>
            </>
          )}
          <div className="text-[11px] text-emerald-400 font-semibold pt-0.5">
            No ATM needed — Thai ATMs charge ฿220–250 a withdrawal
          </div>
        </div>

        {/* GPS Proximity + กริ๊ง! Check-In Trigger */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            data-testid="living-card-step-closer"
            onClick={() => setDistanceMeters((d) => Math.max(0, d - 15))}
            className="px-2.5 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs font-bold"
          >
            📍 {distanceMeters}m · {withinBumpRadius ? '≤100m Ready' : 'Step closer'}
          </button>

          <button
            type="button"
            disabled={!withinBumpRadius || routerBusy}
            data-testid="living-card-bump-checkin"
            onClick={handleBumpAndRelease}
            style={{ background: 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)', color: '#05060D' }}
            className="flex-1 py-2 px-3 rounded-xl font-extrabold text-xs shadow disabled:opacity-40"
          >
            {bumpCompleted ? '✓ กริ๊ง! Checked In' : 'Touch Phones · กริ๊ง! Check-In'}
          </button>
        </div>

        {/* Mode C Check-In Host PromptPay QR (Unlocked after <=100m Bump) */}
        {bumpCompleted && isModeC && holdInfo?.checkInPromptPayQrPayload && (
          <div
            className="p-3 rounded-2xl bg-indigo-500/15 border border-[#9B5CFF]/50 space-y-2 text-xs"
            data-testid="living-card-mode-c-qr-box"
          >
            <div className="flex items-center justify-between">
              <span className="font-extrabold text-white">
                📲 Scan {hostName}’s Direct PromptPay QR
              </span>
              <span className="px-2 py-0.5 rounded bg-emerald-400 text-slate-950 font-extrabold">
                {fmtBaht(breakdown.venuePromptPayAtBumpBaht)}
              </span>
            </div>
            <code
              className="block p-2 rounded-lg bg-black/50 text-[11px] text-indigo-200 font-mono break-all"
              data-testid="living-card-mode-c-qr-payload"
            >
              {holdInfo.checkInPromptPayQrPayload}
            </code>
            {!modeCQrPaid ? (
              <button
                type="button"
                data-testid="living-card-mode-c-confirm-scan"
                onClick={handleConfirmModeCPromptPayScan}
                className="w-full py-2 rounded-xl bg-emerald-500 text-slate-950 font-extrabold text-xs"
              >
                ✓ Confirm {fmtBaht(breakdown.venuePromptPayAtBumpBaht)} Paid to {hostName}’s PromptPay
              </button>
            ) : (
              <div
                className="text-center font-extrabold text-emerald-400"
                data-testid="living-card-mode-c-settled"
              >
                🎉 กริ๊ง! {fmtBaht(breakdown.venuePromptPayAtBumpBaht)} settled directly to {hostName}
              </div>
            )}
          </div>
        )}

        {/* Mode A / Mode B Automatic PromptPay Payout Receipt */}
        {bumpCompleted && !isModeC && payoutInfo && (
          <div
            className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-xs font-bold text-emerald-300"
            data-testid="living-card-escrow-settled"
          >
            ✓ {fmtBaht(payoutInfo.amountBaht)} released to {hostName} via {payoutInfo.provider} ({payoutInfo.status})
          </div>
        )}
      </section>
    </div>
  )
}
