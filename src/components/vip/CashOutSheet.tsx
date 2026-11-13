import { useEffect, useRef, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { formatBahtValue } from '../../lib/money'
import { island, readJSON, useTr, writeJSON } from './walletKit'
import { PinPad, saveSlip, shareSlip, slipRef, ThaiSlip, type SlipData } from '../wallet/kringKit'
import '../../styles/wallet.css'

/**
 * K5 · B8 — THE one Withdraw sheet (Local). PromptPay only, no fee shown once, 6-digit payout PIN pad, Thai e-slip.
 * Money rules are the hub's (unchanged): the hub computes the floor / daily-free / amount and hands them in;
 * this sheet only collects the PromptPay number + PIN and then calls `onConfirm()` exactly once.
 * PIN: the first withdraw creates it (enter + confirm); later a wrong PIN shakes, turns the dots red and counts tries
 * (5 → 5-minute lock). TODO(Argon): verify the payout PIN server-side; this device check is only the first gate.
 */
export interface CashOutSheetProps {
  open: boolean
  onClose: () => void
  /** amount that will be requested (the hub's cashable amount) */
  amountThb: number
  /** points behind the amount (unused in the UI — baht only) */
  points: number
  feeThb: number
  canCashOut: boolean
  /** why the button is off, already worded for people (e.g. "Today's free withdrawal is used") */
  blockedReason?: string
  onConfirm: (promptPay: string) => void
}

const PP_KEY = 'chon_promptpay_v1'

function mask(pp: string) {
  const digits = pp.replace(/\D/g, '')
  return digits.length >= 4 ? `••• ${digits.slice(-4)}` : pp
}

export default function CashOutSheet({ open, onClose, amountThb, points: _points, feeThb, canCashOut, blockedReason, onConfirm }: CashOutSheetProps) {
  const [pp, setPp] = useState(() => readJSON<{ v: string }>(PP_KEY, { v: '' }).v)
  const [editPp, setEditPp] = useState(false)
  const [step, setStep] = useState<'amount' | 'pin' | 'receipt'>('amount')
  const [slip, setSlip] = useState<SlipData | null>(null)
  const effectiveFee = Math.max(0, feeThb)
  const net = Math.max(0, amountThb - effectiveFee)
  const submitted = useRef(false)
  const tr = useTr()

  useEffect(() => {
    if (!open) return
    setStep('amount')
    submitted.current = false
    setEditPp(!pp)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const ppOk = pp.replace(/\D/g, '').length >= 9

  const confirmed = () => {
    if (submitted.current) return
    submitted.current = true
    const dest = pp.trim()
    onConfirm(dest)
    const at = new Date()
    setSlip({
      kind: 'payout',
      amountThb: net,
      feeThb: effectiveFee,
      from: tr('Kring Wallet · Local', 'กระเป๋ากริ๊ง · โลคอล'),
      to: `PromptPay ${mask(pp)}`,
      ref: slipRef(at, Date.now()),
      at,
    })
    setStep('receipt')
    // the "฿500 sent to PromptPay" island is spoken once by App (from the cash-out request it queues)
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      testId="wallet-cashout-sheet"
      title={step === 'receipt' ? tr('Sent', 'โอนแล้ว') : step === 'pin' ? tr('Withdraw', 'ถอนเงิน') : tr('Withdraw to PromptPay', 'ถอนเข้าพร้อมเพย์')}
      ariaLabel="Cash out"
      initialDetent="92%"
      detents={['92%']}
      className="wl-sheet kw-sheetx"
    >
      {step === 'amount' ? (
        <div className="kw-stack">
          <div className="kw-wd-amt">
            <span className="kw-k">{tr('Ready to withdraw', 'พร้อมถอน')}</span>
            <b>{formatBahtValue(amountThb)}</b>
            <small data-testid="cashout-fee-summary">
              {effectiveFee > 0
                ? tr(
                    `Withdraw now fee ${formatBahtValue(effectiveFee)} · you get ${formatBahtValue(net)} (free Mondays ≥฿500)`,
                    `ค่าธรรมเนียมถอนทันที ${formatBahtValue(effectiveFee)} · ได้รับ ${formatBahtValue(net)} (โอนฟรีทุกวันจันทร์ ≥฿500)`,
                  )
                : tr(
                    `No fee · you get ${formatBahtValue(net)} · free Monday payout (≥฿500)`,
                    `ฟรีค่าธรรมเนียม · ได้รับ ${formatBahtValue(net)} · โอนฟรีวันจันทร์ (≥฿500)`,
                  )}
            </small>
          </div>
          <div className="kw-pp">
            <i className="kw-pp-mark" aria-hidden="true">PP</i>
            <span className="kw-grow">
              <b>{`PromptPay ${pp && !editPp ? mask(pp) : ''}`}</b>
              <small>{tr('Baht to PromptPay · arrives in < 60 seconds', 'เงินบาทเข้าพร้อมเพย์ · ถึงใน < 60 วินาที')}</small>
            </span>
            {pp && !editPp ? (
              <button type="button" className="kw-mini m-press" onClick={() => setEditPp(true)}>
                {tr('Change', 'เปลี่ยน')}
              </button>
            ) : null}
          </div>
          {editPp ? (
            <>
              <input
                className="wl-input"
                inputMode="tel"
                value={pp}
                onChange={(e) => setPp(e.target.value)}
                onBlur={() => {
                  if (ppOk) {
                    writeJSON(PP_KEY, { v: pp.trim() })
                    setEditPp(false)
                  }
                }}
                placeholder={tr('PromptPay phone or ID', 'เบอร์หรือเลขพร้อมเพย์')}
                aria-label="PromptPay number"
                aria-describedby="wl-pp-hint"
                autoComplete="off"
              />
              <p className="kw-fine" id="wl-pp-hint">
                {tr('The account name must match your verified name', 'ชื่อบัญชีต้องตรงกับชื่อที่ยืนยันตัวตนไว้')}
              </p>
            </>
          ) : null}
          {!canCashOut && blockedReason ? <p className="kw-warn">{blockedReason}</p> : null}
          {canCashOut && !ppOk ? (
            <p className="kw-fine" role="status" data-testid="wallet-cashout-need-pp">
              {tr('Add your PromptPay number (phone or ID) to continue', 'ใส่เบอร์หรือเลขพร้อมเพย์ก่อน แล้วกดถัดไปได้เลย')}
            </p>
          ) : null}
          <button
            type="button"
            className="kw-btn is-mg kw-wide m-press"
            data-testid="wallet-cashout-continue-btn"
            disabled={!canCashOut || !ppOk}
            onClick={() => {
              triggerHaptic('select')
              writeJSON(PP_KEY, { v: pp.trim() })
              setEditPp(false)
              setStep('pin')
            }}
          >
            {tr('Continue', 'ถัดไป')}
          </button>
        </div>
      ) : step === 'pin' ? (
        <div className="kw-stack">
          <PinPad onSuccess={confirmed} subtitle={tr(`${formatBahtValue(net)} → PromptPay ${mask(pp)}`, `${formatBahtValue(net)} → พร้อมเพย์ ${mask(pp)}`)} />
          <button type="button" className="wl-link" onClick={() => setStep('amount')}>
            {tr('Back', 'ย้อนกลับ')}
          </button>
        </div>
      ) : (
        <div className="kw-stack" data-testid="wallet-cashout-receipt">
          <div className="kw-done">
            <i aria-hidden="true">✓</i>
            <b>{tr(`${formatBahtValue(slip?.amountThb ?? net)} sent`, `โอน ${formatBahtValue(slip?.amountThb ?? net)} แล้ว`)}</b>
            <span className="kw-sub">{tr(`PromptPay ${mask(pp)} · slip saved to Wallet`, `พร้อมเพย์ ${mask(pp)} · บันทึกสลิปในกระเป๋าแล้ว`)}</span>
          </div>
          {slip ? (
            <ThaiSlip
              data={slip}
              onSave={() => {
                triggerHaptic('tap')
                void saveSlip(slip).then((ok) => island(ok ? tr('Slip saved', 'บันทึกสลิปแล้ว') : tr('Take a screenshot instead', 'แคปหน้าจอไว้แทนนะ'), ok ? 'green' : 'neutral', ok ? '✓' : undefined))
              }}
              onShare={() => {
                triggerHaptic('tap')
                void shareSlip(slip).then((r) => {
                  if (r === 'copied') island(tr('Slip details copied', 'คัดลอกรายละเอียดสลิปแล้ว'), 'green', '✓')
                })
              }}
            />
          ) : null}
          <button type="button" className="kw-btn is-mg kw-wide m-press" onClick={onClose}>
            {tr('Done', 'เสร็จแล้ว')}
          </button>
        </div>
      )}
    </Sheet>
  )
}
