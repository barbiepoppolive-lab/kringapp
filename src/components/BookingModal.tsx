import { useMemo, useState } from 'react'
import { KringMark } from './ui/KringMark'
import { triggerHaptic } from '../lib/haptics'
import { playKring } from '../lib/sfx'
import {
  paymentRouter,
  resolvePaymentRoute,
  calculatePaymentBreakdown,
  type PaymentNationality,
  type PaymentMethod,
  type PaymentModeId,
  type ChargeResponse,
  type HoldOrConfirmResponse,
} from '../lib/paymentRouter'

export interface BookingModalProps {
  open: boolean
  onClose: () => void
  bookingId?: string
  experienceId?: string
  experienceTitle: string
  hostId: string
  hostName: string
  venueName: string
  activityFeeBaht: number
  hostShareRate?: 0.80 | 0.83 | 0.85
  defaultNationality?: PaymentNationality
  forceModeC?: boolean
  th?: boolean
  onCheckoutComplete?: (result: {
    charge: ChargeResponse
    hold: HoldOrConfirmResponse
    mode: PaymentModeId
  }) => void
}

interface NationalityPillOption {
  nationality: PaymentNationality
  method: PaymentMethod
  flag: string
  labelEn: string
  labelTh: string
  subEn: string
}

const NATIONALITY_PAY_PILLS: readonly NationalityPillOption[] = [
  {
    nationality: 'IN',
    method: 'UPI',
    flag: '🇮🇳',
    labelEn: 'India · UPI / RuPay',
    labelTh: 'อินเดีย · UPI / RuPay',
    subEn: 'GPay · PhonePe · Paytm (INR)',
  },
  {
    nationality: 'CN',
    method: 'ALIPAY_PLUS',
    flag: '🇨🇳',
    labelEn: 'China · Alipay+ / WeChat',
    labelTh: 'จีน · Alipay+ / WeChat',
    subEn: 'Instant CNY cross-border',
  },
  {
    nationality: 'RU',
    method: 'TRUEMONEY',
    flag: '🇷🇺',
    labelEn: 'Russia · TrueMoney / Pass',
    labelTh: 'รัสเซีย · TrueMoney / Pass',
    subEn: 'Tourist Wallet & Kring Pass',
  },
  {
    nationality: 'GLOBAL',
    method: 'APPLE_PAY',
    flag: '🌍',
    labelEn: 'Global · Card / Apple Pay',
    labelTh: 'ทั่วโลก · บัตร / Apple Pay',
    subEn: 'Visa · Mastercard · Apple Pay',
  },
  {
    nationality: 'TH',
    method: 'PROMPTPAY_QR',
    flag: '🇹🇭',
    labelEn: 'Thailand · PromptPay QR',
    labelTh: 'ไทย · พร้อมเพย์ QR',
    subEn: 'Zero-fee Thai bank scan',
  },
] as const

const fmtBaht = (n: number): string => `฿${Math.max(0, Math.round(n)).toLocaleString('en-US')}`

export default function BookingModal({
  open,
  onClose,
  bookingId = 'bk-live-001',
  experienceTitle,
  hostId,
  hostName,
  venueName,
  activityFeeBaht,
  hostShareRate = 0.80,
  defaultNationality = 'IN',
  forceModeC = false,
  th = false,
  onCheckoutComplete,
}: BookingModalProps) {
  const [selectedIdx, setSelectedIdx] = useState<number>(() => {
    const idx = NATIONALITY_PAY_PILLS.findIndex((p) => p.nationality === defaultNationality)
    return idx >= 0 ? idx : 0
  })
  const [preferModeC, setPreferModeC] = useState<boolean>(forceModeC)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [chargeResult, setChargeResult] = useState<ChargeResponse | null>(null)
  const [holdResult, setHoldResult] = useState<HoldOrConfirmResponse | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const selectedPill = NATIONALITY_PAY_PILLS[selectedIdx] ?? NATIONALITY_PAY_PILLS[0]

  const route = useMemo(
    () =>
      resolvePaymentRoute({
        nationality: selectedPill.nationality,
        preferredMethod: selectedPill.method,
        forceModeC: preferModeC,
      }),
    [selectedPill, preferModeC],
  )

  const breakdown = useMemo(
    () =>
      calculatePaymentBreakdown(activityFeeBaht, route.mode, {
        hostShareRate,
      }),
    [activityFeeBaht, route.mode, hostShareRate],
  )

  if (!open) return null

  const isModeC = route.mode === 'MODE_C_KRING_PASS_AND_PROMPTPAY_QR'

  const handleCheckout = async () => {
    if (submitting) return
    setSubmitting(true)
    setErrorMsg(null)
    triggerHaptic('select')

    try {
      const charge = await paymentRouter.charge({
        bookingId,
        travellerId: 'traveller-session',
        hostId,
        activityFeeBaht,
        nationality: selectedPill.nationality,
        preferredMethod: selectedPill.method,
        hostShareRate,
        forceModeC: preferModeC,
      })

      const hold = await paymentRouter.holdOrConfirm({
        bookingId,
        chargeId: charge.chargeId,
        mode: charge.mode,
        provider: charge.provider,
        onlineHeldBaht: charge.breakdown.onlineChargeNowBaht,
        venuePromptPayDueBaht: charge.breakdown.venuePromptPayAtBumpBaht,
      })

      setChargeResult(charge)
      setHoldResult(hold)
      triggerHaptic('success')
      playKring('release')
      onCheckoutComplete?.({ charge, hold, mode: charge.mode })
    } catch (err) {
      triggerHaptic('error')
      setErrorMsg(err instanceof Error ? err.message : 'Payment route temporarily unavailable')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 p-3"
      role="dialog"
      aria-modal="true"
      aria-label={th ? `จองทริปกับ ${hostName}` : `Book with ${hostName}`}
      data-testid="kring-booking-modal"
      data-payment-mode={route.mode}
      data-payment-provider={route.provider}
    >
      <div className="w-full max-w-md rounded-3xl bg-[#0B0D1E] border border-white/10 text-white p-4 space-y-3.5 shadow-2xl">
        {/* Header */}
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KringMark size={26} />
            <div>
              <h2 className="text-base font-extrabold leading-tight">
                {experienceTitle} · {hostName}
              </h2>
              <p className="text-xs text-slate-300">
                📍 {venueName} · {th ? 'ค่าทริปกิจกรรมเท่านั้น' : 'activity fee only'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={th ? 'ปิด' : 'Close'}
            data-testid="booking-modal-close"
            className="w-8 h-8 rounded-full bg-white/10 text-sm font-bold flex items-center justify-center"
          >
            ✕
          </button>
        </header>

        {/* Nationality Pay Pills */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-slate-300">
              {th ? 'เลือกช่องทางชำระเงินตามสัญชาติ' : 'Select Nationality Payment Rail'}
            </span>
            <button
              type="button"
              data-testid="booking-modal-toggle-mode-c"
              onClick={() => {
                triggerHaptic('select')
                setPreferModeC((v) => !v)
              }}
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition ${
                isModeC
                  ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                  : 'bg-indigo-500/15 border-indigo-400/30 text-indigo-300'
              }`}
            >
              {isModeC ? 'Mode C: Kring Pass + Host QR' : route.mode === 'MODE_A_OFFSHORE_ESCROW' ? 'Mode A: Escrow' : 'Mode B: Gateway'}
            </button>
          </div>

          <div className="grid grid-cols-1 gap-1.5" role="radiogroup" aria-label="Payment method">
            {NATIONALITY_PAY_PILLS.map((pill, idx) => {
              const active = idx === selectedIdx
              return (
                <button
                  key={pill.nationality}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  data-testid={`booking-pay-pill-${pill.nationality.toLowerCase()}`}
                  onClick={() => {
                    triggerHaptic('select')
                    setSelectedIdx(idx)
                  }}
                  className={`flex items-center justify-between px-3 py-2 rounded-2xl border text-left transition ${
                    active
                      ? 'bg-[#3446FF]/20 border-[#7381FF] text-white'
                      : 'bg-white/5 border-white/10 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">{pill.flag}</span>
                    <div>
                      <div className="text-xs font-extrabold">{th ? pill.labelTh : pill.labelEn}</div>
                      <div className="text-[11px] text-slate-400">{pill.subEn}</div>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-indigo-300">{active ? '✓ Active' : 'Select'}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Grab-Style Receipt Breakdown */}
        <div
          className="rounded-2xl bg-white/5 border border-white/10 p-3 space-y-1.5 text-xs"
          data-testid="booking-modal-breakdown"
        >
          <div className="flex items-center justify-between">
            <span className="text-slate-300">
              {th ? 'ค่าทริปกิจกรรม (Activity fee only)' : 'Activity session fee (activity fee only)'}
            </span>
            <span className="font-bold">{fmtBaht(breakdown.activityFeeBaht)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-slate-300">{th ? 'ค่าบริการแพลตฟอร์ม' : 'Kring Service Fee'}</span>
            <span className="font-bold">{fmtBaht(breakdown.serviceFeeBaht)}</span>
          </div>

          {isModeC ? (
            <>
              <div className="border-t border-white/10 pt-1.5 flex items-center justify-between text-amber-300 font-extrabold">
                <span>{th ? 'ชำระออนไลน์ตอนนี้ (Kring Pass)' : 'Online Digital Kring Pass Now'}</span>
                <span data-testid="booking-modal-online-now">{fmtBaht(breakdown.onlineChargeNowBaht)}</span>
              </div>
              <div className="flex items-center justify-between text-emerald-400 font-bold">
                <span>
                  {th
                    ? `สแกนพร้อมเพย์ ${hostName} เมื่อชนโทรศัพท์ กริ๊ง!`
                    : `Host PromptPay QR at Venue (after ≤100m กริ๊ง!)`}
                </span>
                <span data-testid="booking-modal-venue-qr">{fmtBaht(breakdown.venuePromptPayAtBumpBaht)}</span>
              </div>
              <p className="text-[11px] text-amber-200 font-semibold pt-0.5" data-testid="booking-modal-mode-c-copy">
                Pay 20% booking fee now to Kring · rest at the venue
              </p>
            </>
          ) : (
            <div className="border-t border-white/10 pt-1.5 flex items-center justify-between text-amber-300 font-extrabold text-sm">
              <span>{th ? 'ยอดพักเงินปลอดภัย (โอนเมื่อ กริ๊ง!)' : 'Total Held Safely till กริ๊ง!'}</span>
              <span data-testid="booking-modal-online-now">{fmtBaht(breakdown.onlineChargeNowBaht)}</span>
            </div>
          )}
        </div>

        {/* ATM Savings Callout */}
        <div
          className="px-3 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 font-bold"
          data-testid="booking-modal-atm-callout"
        >
          🟢 No ATM needed — Thai ATMs charge ฿220–250 a withdrawal
        </div>

        {errorMsg && (
          <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 font-bold" role="alert">
            {errorMsg}
          </div>
        )}

        {chargeResult && holdResult ? (
          <div
            className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 space-y-1 text-xs"
            data-testid="booking-modal-confirmed"
          >
            <div className="font-extrabold text-emerald-300">
              ✓ {holdResult.status === 'PASS_ISSUED_AWAITING_BUMP_QR' ? 'Digital Kring Pass Issued' : 'Escrow Hold Confirmed'} · {chargeResult.chargeId}
            </div>
            <p className="text-slate-200">{holdResult.escrowNotice}</p>
          </div>
        ) : null}

        {/* Primary Gold CTA (Gold ONLY on Primary CTA per Core Rule 2) */}
        <button
          type="button"
          disabled={submitting}
          data-testid="booking-modal-submit"
          onClick={handleCheckout}
          style={{ background: 'linear-gradient(135deg, #FFB21E 0%, #FFD067 100%)', color: '#05060D' }}
          className="w-full py-3 rounded-2xl font-extrabold text-sm shadow-lg transition active:scale-[0.99]"
        >
          {submitting
            ? th
              ? 'กำลังเชื่อมต่อระบบชำระเงิน…'
              : 'Routing payment…'
            : isModeC
              ? `Unlock Kring Pass · ${fmtBaht(breakdown.onlineChargeNowBaht)} Now`
              : `Hold ${fmtBaht(breakdown.onlineChargeNowBaht)} Safely till กริ๊ง!`}
        </button>
      </div>
    </div>
  )
}
