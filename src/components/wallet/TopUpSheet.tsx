import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { dispatchInternalWalletDelta } from '../../lib/walletBus'
import { DEFAULT_PLATFORM_CONFIG } from '../../lib/configDefaults'
import { useOptionalAuth } from '../../context/AuthContext'
import {
  BalanceSplit,
  BALANCE_EVENT,
  island,
  lastKnownBalance,
  readApply,
  writeApply,
  setTopUpOpen,
  thb,
  TOPUP_DONE_EVENT,
  useIsThai,
  useTr,
  useTripSavedThb,
  useWalletActivityRecorder,
  type BalanceDetail,
  type TopUpRequest,
} from '../vip/walletKit'
import { ExpiryRing, QrArt, RollingBaht, saveSlip, shareSlip, slipRef, ThaiSlip, type SlipData } from './kringKit'
import { formatBahtValue } from '../../lib/money'
import { getDodoProductByThbTier, KRING_DODO_TEST_CHECKOUT_URL } from '../../lib/dodoCatalogConfig'
import StarterPackHost, { markStarterPack, openStarterPack, STARTER_PACK, STARTER_PACK_WORTH_THB, packPerks, PerkMark, useStarterPack } from './StarterPack'
import RewardsHost from '../rewards/RewardsSheet'
import '../../styles/wallet.css'

/**
 * Atlas D5 + D6 — THE one top-up sheet. Wallet, chat low-balance and the Clink sheet all open it with
 * `window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason?, needThb?, backLabel? } }))`.
 *
 * Money rules (unchanged): this sheet never credits coins. PromptPay / Apple Pay / Google Pay hand off to the
 * gateway; coins arrive only through the trusted wallet bus once the payment is confirmed, and the success state
 * plays when that accepted credit lands. Demo sessions keep the existing sandbox credit (App rejects it otherwise).
 *
 * Props are optional: App may pass the live balance; without it the sheet uses the last balance the Wallet broadcast.
 */
const AMOUNTS = [200, 500, 1000, 3000] as const
/**
 * KRING FIX3 · Wei r4: opened with a shortfall, the sheet offers EXACTLY that amount first (preselected) and only the
 * presets above it — never "฿3,000" for a ฿1,500 need. No need → the usual presets.
 */
export function amountChoices(needThb?: number): number[] {
  const need = Math.max(0, Math.ceil(needThb ?? 0))
  if (!need) return [...AMOUNTS]
  const above = AMOUNTS.filter((a) => a > need)
  return Array.from(new Set([need, ...above])).slice(0, 4)
}
type Method = 'promptpay' | 'applepay' | 'gpay'
type Step = 'pick' | 'waiting' | 'done'
/** Kring B7: the PromptPay QR lives 10 minutes (the ring drains over the real time). Display only. */
const QR_SECONDS = 10 * 60

/** Atlas integration: callers pass short reason CODES ('clink', 'chat-gift', 'header'…) — turn them into one plain line. */
function reasonCopy(reason: string | undefined, needThb: number | undefined, th: boolean): string | null {
  if (!reason) return null
  const need = typeof needThb === 'number' && needThb > 0 ? `฿${Math.ceil(needThb).toLocaleString('en-US')}` : null
  switch (reason) {
    case 'clink':
      return need ? (th ? `เติมเงินสดอีก ${need} เพื่อส่งข้อเสนอ` : `Add ${need} cash to send your offer`) : th ? 'เติมเงินเพื่อส่งข้อเสนอ' : 'Top up to send your offer'
    // KRING FIX1 · never fail silently: Accept / Book with too little cash says why and how much
    case 'accept':
      return need
        ? th
          ? `เติมเงินสดอีก ${need} เพื่อตกลง · เครดิตโปรใช้จองไม่ได้`
          : `Add ${need} cash to accept · promo can’t pay bookings`
        : th
          ? 'เติมเงินสดเพื่อตกลง · เครดิตโปรใช้จองไม่ได้'
          : 'Add cash to accept · promo can’t pay bookings'
    case 'book':
    case 'multi':
      return need
        ? th
          ? `เติมเงินสดอีก ${need} เพื่อจอง · เครดิตโปรใช้จองไม่ได้`
          : `Add ${need} cash to book · promo can’t pay bookings`
        : th
          ? 'เติมเงินสดเพื่อจอง · เครดิตโปรใช้จองไม่ได้'
          : 'Add cash to book · promo can’t pay bookings'
    case 'chat-gift':
    case 'lucky':
      return need ? (th ? `เติมอีก ${need} เพื่อส่งของขวัญนี้` : `Add ${need} to send this gift`) : th ? 'เติมเงินเพื่อส่งของขวัญ' : 'Top up to send gifts'
    case 'header':
    case 'chat-balance':
    case 'wallet':
      return null
    default:
      // a human sentence passes through; any other bare code stays hidden
      return /\s/.test(reason) ? reason : need ? (th ? `เติมอีก ${need} เพื่อไปต่อ` : `Add ${need} to continue`) : null
  }
}

function prefersQuiet(): boolean {
  try {
    return document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function fmtClock(s: number) {
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export default function TopUpSheet({ paidCoins, bonusCoins }: { paidCoins?: number; bonusCoins?: number } = {}) {
  const auth = useOptionalAuth()
  const isDemo = Boolean(auth?.session?.isDemoMode)
  const coinsPerThb = DEFAULT_PLATFORM_CONFIG.coins_per_thb
  const saved = useTripSavedThb(isDemo)
  const tr = useTr()
  const th = useIsThai()

  const [open, setOpen] = useState(false)
  const [req, setReq] = useState<TopUpRequest>({})
  const [amount, setAmount] = useState<number>(500)
  const [method, setMethod] = useState<Method>('promptpay')
  const [step, setStep] = useState<Step>('pick')
  const [left, setLeft] = useState(QR_SECONDS)
  const [ref, setRef] = useState(() => Math.floor(Math.random() * 90_000) + 10_000)
  const [credited, setCredited] = useState(0)
  const [paidFlash, setPaidFlash] = useState(false)
  const [rolled, setRolled] = useState(false)
  // the new balance mounts at the old figure and rolls up one column at a time once the success state is on screen
  useEffect(() => {
    if (step !== 'done') {
      setRolled(false)
      return
    }
    const id = window.setTimeout(() => setRolled(true), 260)
    return () => window.clearTimeout(id)
  }, [step])
  const [slip, setSlip] = useState<SlipData | null>(null)
  const [known, setKnown] = useState<BalanceDetail | null>(() =>
    typeof paidCoins === 'number' ? { paidCoins, bonusCoins: bonusCoins ?? 0 } : lastKnownBalance(),
  )
  const stepRef = useRef(step)
  stepRef.current = step
  const methodRef = useRef<Method>('promptpay')
  const refRef = useRef(0)
  // NEXT95 · G3: the Starter Pack rides the same flow with its price locked (no new money logic)
  const pack = req.pack === 'starter'
  const packRef = useRef(pack)
  packRef.current = pack
  const [packDone, setPackDone] = useState(false)
  // KRING VISUAL V2 · the Starter Pack left the gift sheet: it is an optional bundle here, where people already pay
  const packEligible = useStarterPack().eligible

  useEffect(() => {
    if (typeof paidCoins === 'number') setKnown({ paidCoins, bonusCoins: bonusCoins ?? 0 })
  }, [paidCoins, bonusCoins])
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<BalanceDetail>).detail
      if (d && typeof paidCoins !== 'number') setKnown(d)
    }
    window.addEventListener(BALANCE_EVENT, on)
    return () => window.removeEventListener(BALANCE_EVENT, on)
  }, [paidCoins])

  methodRef.current = method
  refRef.current = ref
  const reasonLine = reasonCopy(req.reason, req.needThb, th)
  // KRING FIX2 · Wei 4: every balance the sheet and the e-slip show is CASH (what pays a booking) — promo is apart
  const balanceThb = known ? known.paidCoins / coinsPerThb : null
  const promoThb = known ? known.bonusCoins / coinsPerThb : 0

  // Success = an accepted credit lands while we wait (gateway webhook in production, sandbox credit in demo).
  useWalletActivityRecorder((deltaCoins) => {
    if (stepRef.current !== 'waiting') return
    setCredited(deltaCoins)
    triggerHaptic('success')
    const at = new Date()
    setSlip({
      kind: 'topup',
      amountThb: deltaCoins / coinsPerThb,
      feeThb: 0,
      from: methodRef.current === 'promptpay' ? tr('Your bank · PromptPay', 'บัญชีของคุณ · พร้อมเพย์') : methodRef.current === 'applepay' ? 'Apple Pay' : 'Google Pay',
      to: tr('Kring Wallet · Traveller', 'กระเป๋ากริ๊ง · ผู้จอง'),
      ref: slipRef(at, refRef.current),
      at,
    })
    // B7: the check pops on the QR card first, then the e-slip rises
    if (methodRef.current === 'promptpay' && !prefersQuiet()) {
      setPaidFlash(true)
      window.setTimeout(() => {
        setPaidFlash(false)
        setStep('done')
      }, 900)
    } else {
      setStep('done')
    }
    if (packRef.current) {
      // display-only: hide the offer everywhere; the pack itself is fulfilled server-side (see StarterPack.tsx TODO)
      markStarterPack(auth?.session?.userId, 'bought')
      setPackDone(true)
    }
  })


  const openSheet = useCallback((detail: TopUpRequest) => {
    setReq(detail ?? {})
    const need = Math.max(0, Math.ceil(detail?.needThb ?? 0))
    setAmount(
      detail?.pack === 'starter'
        ? STARTER_PACK.priceThb
        : need > 0
          ? need
          : 500,
    )
    setPackDone(false)
    setMethod('promptpay')
    setStep('pick')
    setPaidFlash(false)
    setSlip(null)
    setCredited(0)
    setRef(Math.floor(Math.random() * 90_000) + 10_000)
    setOpen(true)
  }, [])

  useEffect(() => {
    const onOpen = (e: Event) => openSheet(((e as CustomEvent<TopUpRequest>).detail ?? {}) as TopUpRequest)
    const onLegacy = (e: Event) => {
      const sub = (e as CustomEvent<{ subAction?: string }>).detail?.subAction
      if (sub === 'vip-topup') openSheet({})
    }
    window.addEventListener('chon:open-topup', onOpen)
    window.addEventListener('chon:vip-subaction', onLegacy)
    return () => {
      window.removeEventListener('chon:open-topup', onOpen)
      window.removeEventListener('chon:vip-subaction', onLegacy)
    }
  }, [openSheet])

  // QR countdown: ticks only while the QR is on screen.
  useEffect(() => {
    if (!open || step !== 'waiting' || method !== 'promptpay') return
    setLeft(QR_SECONDS)
    const id = window.setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000)
    return () => window.clearInterval(id)
  }, [open, step, method])

  // Marco 2 · payoff order: the Wallet holds its card roll while this sheet is open, then plays glint → roll after close.
  useEffect(() => {
    setTopUpOpen(open)
    if (!open) window.dispatchEvent(new CustomEvent(TOPUP_DONE_EVENT, { detail: { credited } }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => () => setTopUpOpen(false), [])

  // Ploy B5: this sheet is always mounted, so it is where a story posted from the "Become a host" checklist is ticked
  // (the Wallet page itself is unmounted while the camera is open on Meet).
  useEffect(() => {
    const onStory = () => {
      const a = readApply()
      if (!a.storyAsked || a.story) return
      writeApply({ story: true })
      window.dispatchEvent(
        new CustomEvent('chon:island', {
          detail: { text: tr('Story posted · Local checklist 3/3 — tap to finish', 'โพสต์สตอรี่แล้ว · ครบ 3/3 แตะเพื่อไปต่อ'), tone: 'green', icon: '✓', ms: 4200, action: 'wallet' },
        }),
      )
    }
    // the story camera's "Post" button (MeetFeed) does not announce itself yet — treat its tap as the post
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target.closest('[data-testid="confirm-post-live-story-btn"]') : null
      if (el) window.setTimeout(onStory, 0)
    }
    window.addEventListener('chon:story-posted', onStory)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('chon:story-posted', onStory)
      document.removeEventListener('click', onClick, true)
    }
  }, [tr])

  const close = () => {
    if (step === 'waiting') island(tr('It lands the moment your bank confirms', 'ธนาคารยืนยันเมื่อไหร่ เงินเข้าทันที'), 'neutral', '⏳')
    setOpen(false)
  }

  const methods: Array<{ id: Method; mark: string; name: string; note: string }> = [
    { id: 'promptpay', mark: 'PP', name: 'PromptPay QR', note: tr('Min ฿100 · no fee', 'ขั้นต่ำ ฿100 · ฟรี') },
    { id: 'applepay', mark: '', name: 'Apple Pay', note: tr('1-tap · min ฿500', 'แตะเดียว · ขั้นต่ำ ฿500') },
    { id: 'gpay', mark: 'G', name: 'Google Pay', note: tr('1-tap · min ฿500', 'แตะเดียว · ขั้นต่ำ ฿500') },
  ]

  const saveQr = () => {
    triggerHaptic('tap')
    try {
      const svg = document.querySelector('.kw-qr-svg')
      if (!svg) return
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `kring-promptpay-${amount}.svg`
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 2000)
      island(tr('QR saved — open it in your bank app', 'บันทึก QR แล้ว เปิดในแอปธนาคารได้เลย'), 'green', '✓')
    } catch {
      island(tr('Take a screenshot of the QR instead', 'แคปหน้าจอ QR ไว้แทนนะ'), 'neutral')
    }
  }

  const choices = amountChoices(req.needThb)
  const amountIdx = Math.max(0, choices.indexOf(amount))

  const body = (() => {
    if (step === 'done') {
      const addedThb = credited / coinsPerThb
      const to = balanceThb !== null ? balanceThb : addedThb
      const from = Math.max(0, to - addedThb)
      return (
        <div className="kw-stack kw-topup-done" data-testid="topup-success">
          <div className="kw-done">
            <i aria-hidden="true">✓</i>
            <b className="kw-done-amt">
              <RollingBaht value={rolled ? to : from} decimals fromZero={false} />
            </b>
            <span className="kw-sub">
              {th
                ? `${balanceThb !== null ? 'เงินสดตอนนี้' : 'เติมแล้ว'} · เพิ่ม ${formatBahtValue(addedThb)} เงินสด`
                : `${balanceThb !== null ? 'Cash now' : 'Added'} · ${formatBahtValue(addedThb)} cash added`}
            </span>
            {promoThb > 0 ? (
              <span className="kw-sub kw-done-promo" data-testid="topup-done-promo">
                {tr(`${formatBahtValue(promoThb)} promo kept apart · can’t pay bookings`, `โปร ${formatBahtValue(promoThb)} แยกไว้ · ใช้จองไม่ได้`)}
              </span>
            ) : null}
          </div>
          {slip ? (
            <ThaiSlip
              data={slip}
              testId="topup-e-slip"
              onSave={() => {
                triggerHaptic('tap')
                void saveSlip(slip).then((ok) => island(ok ? tr('Slip saved to Photos', 'บันทึกสลิปลงรูปภาพแล้ว') : tr('Take a screenshot instead', 'แคปหน้าจอไว้แทนนะ'), ok ? 'green' : 'neutral', ok ? '✓' : undefined))
              }}
              onShare={() => {
                triggerHaptic('tap')
                void shareSlip(slip).then((r) => {
                  if (r === 'copied') island(tr('Slip details copied', 'คัดลอกรายละเอียดสลิปแล้ว'), 'green', '✓')
                })
              }}
            />
          ) : null}
          {packDone ? (
            <div className="sp-done" data-testid="topup-pack-done">
              <p className="sp-k">{tr('Your Starter Pack', 'แพ็กเริ่มต้นของคุณ')}</p>
              <ul>
                {packPerks(tr)
                  .filter((p) => p.id !== 'spend')
                  .map((p) => (
                    <li key={p.id}>
                      <span className="sp-perk-ic">
                        <PerkMark id={p.id} />
                      </span>
                      <span className="sp-perk-t">
                        <b>{p.title}</b>
                        <small>{tr('With your receipt · ready in Wallet', 'มากับใบเสร็จ · ดูได้ในกระเป๋า')}</small>
                      </span>
                    </li>
                  ))}
              </ul>
              <p className="sp-fine">
                {tr(
                  `${thb(STARTER_PACK.spendThb)} to spend lands with your receipt, and the three perks wait in Wallet: worth ${thb(STARTER_PACK_WORTH_THB)} in all.`,
                  `เครดิต ${thb(STARTER_PACK.spendThb)} เข้าพร้อมใบเสร็จ อีก 3 สิทธิ์รอในกระเป๋า รวมมูลค่า ${thb(STARTER_PACK_WORTH_THB)}`,
                )}
              </p>
            </div>
          ) : null}
          <button type="button" className="kw-btn is-mg kw-wide m-press" onClick={() => setOpen(false)}>
            {req.backLabel ? tr(`Back to ${req.backLabel}`, /^[A-Za-z]/.test(req.backLabel) ? `กลับไป ${req.backLabel}` : `กลับไป${req.backLabel}`) : tr('Done', 'เสร็จแล้ว')}
          </button>
        </div>
      )
    }
    if (step === 'waiting') {
      const isQr = method === 'promptpay'
      const mm = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`
      return (
        <div className="kw-stack kw-topup-wait" data-testid="topup-waiting">
          {pack ? <p className="sp-k wl-center">{tr('Starter Pack · once', 'แพ็กเริ่มต้น · ครั้งเดียว')}</p> : null}
          {isQr ? (
            <div className={`kw-qc${left <= 0 ? ' is-expired' : ''}${paidFlash ? ' is-paid' : ''}`}>
              <span className="kw-mono kw-qc-k">{tr('PromptPay QR · scan with any Thai bank app', 'QR พร้อมเพย์ · สแกนได้ทุกแอปธนาคาร')}</span>
              <div className="kw-qc-qr">
                <QrArt seed={ref + amount} />
                <b className="kw-qc-pp">PromptPay</b>
              </div>
              <div className="kw-qc-b">
                <span className="kw-grow">
                  <span className="kw-mono">{tr('Kring Wallet · Traveller', 'กระเป๋ากริ๊ง · ผู้จอง')}</span>
                  <b>{formatBahtValue(amount, { decimals: true })}</b>
                </span>
                <ExpiryRing left={left} total={QR_SECONDS} />
                <span className="kw-qc-t" data-testid="topup-qr-timer" aria-label={tr(`${fmtClock(left)} left`, `เหลือ ${fmtClock(left)}`)}>
                  {left > 0 ? mm : tr('Expired', 'หมดเวลา')}
                </span>
              </div>
              {paidFlash ? (
                <div className="kw-qc-paid" role="status">
                  <i aria-hidden="true">✓</i>
                  <span>{tr('Paid', 'ชำระแล้ว')}</span>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="kw-qc is-wallet">
              <span className="kw-wallet-mark" aria-hidden="true">{method === 'applepay' ? '' : 'G'}</span>
              <p className="kw-sub kw-c">
                {tr(
                  `Confirm ${thb(amount)} in the ${method === 'applepay' ? 'Apple Pay' : 'Google Pay'} sheet on your phone.`,
                  `ยืนยัน ${thb(amount)} ในหน้าต่าง ${method === 'applepay' ? 'Apple Pay' : 'Google Pay'} บนมือถือ`,
                )}
              </p>
            </div>
          )}
          <p className="kw-sub kw-c">
            {isQr
              ? left > 0
                ? tr('Save the QR and open it in your bank app, or scan it from another phone. It expires in 10 minutes.', 'บันทึก QR แล้วเปิดในแอปธนาคาร หรือสแกนจากอีกเครื่อง QR หมดอายุใน 10 นาที')
                : tr('This QR expired — make a new one.', 'QR นี้หมดเวลาแล้ว สร้างใหม่ได้เลย')
              : tr('It lands in your wallet automatically — you can close this.', 'เงินเข้ากระเป๋าอัตโนมัติ ปิดหน้านี้ได้เลย')}
          </p>
          {isQr ? (
            left > 0 ? (
              <button type="button" className="kw-btn is-ghost kw-wide m-press" onClick={saveQr}>
                {tr('Save QR to photos', 'บันทึก QR ลงรูปภาพ')}
              </button>
            ) : (
              <button
                type="button"
                className="kw-btn is-mg kw-wide m-press"
                onClick={() => {
                  setRef(Math.floor(Math.random() * 90_000) + 10_000)
                  setStep('pick')
                  window.requestAnimationFrame(() => setStep('waiting'))
                }}
              >
                {tr('New QR', 'QR ใหม่')} · {thb(amount)}
              </button>
            )
          ) : null}
          <button type="button" className="wl-link" onClick={() => setStep('pick')}>
            {pack ? tr('Change method', 'เปลี่ยนวิธีจ่าย') : tr('Change amount or method', 'เปลี่ยนยอดหรือวิธีจ่าย')}
          </button>
          {isDemo ? (
            <button
              type="button"
              className="wl-link"
              data-testid="topup-demo-paid-btn"
              onClick={() => {
                if (pack) {
                  dispatchInternalWalletDelta({
                    bonusDelta: STARTER_PACK.spendThb * coinsPerThb,
                    hideGlobal: true,
                    note: th ? `เดโม · แพ็กเริ่มต้น +โปร ${thb(STARTER_PACK.spendThb)}` : `Demo Starter Pack · +${thb(STARTER_PACK.spendThb)} Promo Credit`,
                  })
                  return
                }
                dispatchInternalWalletDelta({
                  paidDelta: amount * coinsPerThb,
                  allowEscrowRefund: true,
                  hideGlobal: true,
                  note: th ? `เดโม · เติมเงิน +${thb(amount)} ด้วยพร้อมเพย์` : `Demo top-up · +${thb(amount)} by PromptPay`,
                })
              }}
            >
              {tr('Demo only: mark as paid', 'เดโมเท่านั้น: ทำเป็นจ่ายแล้ว')}
            </button>
          ) : null}
        </div>
      )
    }
    return (
      <div className="kw-stack kw-topup-pick" data-testid="topup-pick">
        {pack ? null : reasonLine ? <p className="wl-reason">{reasonLine}</p> : saved > 0 ? (
          <p className="wl-reason is-green">{tr(`You saved ${thb(saved)} this trip`, `ทริปนี้ประหยัดไป ${thb(saved)}`)}</p>
        ) : null}
        {known && balanceThb !== null ? (
          // the same balance line as the Wallet card: what is cash, what is promo
          <div className="kw-bal" data-testid="topup-balance">
            <span className="kw-k">{tr('Cash', 'เงินสด')}</span>
            <b>{formatBahtValue(balanceThb, { decimals: true })}</b>
            {known.bonusCoins > 0 ? <BalanceSplit paidCoins={known.paidCoins} bonusCoins={known.bonusCoins} coinsPerThb={coinsPerThb} note testId="topup-balance-split" /> : null}
          </div>
        ) : null}
        <div className="kw-amts" role="radiogroup" aria-label={tr('Amount', 'ยอดเงิน')} hidden={pack} style={{ '--i': amountIdx, '--n': choices.length } as CSSProperties}>
          <i className="kw-amts-ind" aria-hidden="true" />
          {choices.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={amount === a}
              data-testid={`topup-amount-${a}`}
              className={`kw-amt${amount === a ? ' is-on' : ''}`}
              onClick={() => {
                triggerHaptic('select')
                setAmount(a)
              }}
            >
              {/* baht only — no coin counts on the amounts */}
              <b>{thb(a)}</b>
            </button>
          ))}
        </div>
        {packEligible || pack ? (
          <div className="tp5-bundle" data-testid="topup-bundle">
            <p className="tp5-k">{tr('Optional bundle', 'แพ็กเสริม (ไม่บังคับ)')}</p>
            <div className={`tp5-spk${pack ? ' is-on' : ''}`}>
              <span className="tp5-em" aria-hidden="true">🎒</span>
              <button type="button" className="tp5-spt" data-testid="topup-starter-info" onClick={() => openStarterPack('topup')}>
                <b>{tr('Starter Pack · once', 'แพ็กเริ่มต้น · ครั้งเดียว')}</b>
                <small>
                  {tr(
                    `Pay ${thb(STARTER_PACK.priceThb)} cash · get ${thb(STARTER_PACK.spendThb)} to spend + eSIM 15 GB · worth ${thb(STARTER_PACK_WORTH_THB)}`,
                    `จ่าย ${thb(STARTER_PACK.priceThb)} · ได้เครดิต ${thb(STARTER_PACK.spendThb)} + eSIM 15 GB · มูลค่า ${thb(STARTER_PACK_WORTH_THB)}`,
                  )}
                </small>
              </button>
              <button
                type="button"
                role="switch"
                aria-checked={pack}
                aria-label={tr('Add Starter Pack', 'เพิ่มแพ็กเริ่มต้น')}
                data-testid="topup-starter-switch"
                className="kr-switch tp5-sw"
                onClick={() => {
                  triggerHaptic('select')
                  if (pack) {
                    setReq((r) => ({ ...r, pack: undefined }))
                    setAmount(choices[0] ?? 500)
                  } else {
                    setReq((r) => ({ ...r, pack: 'starter' }))
                    setAmount(STARTER_PACK.priceThb)
                    island(tr(`Starter Pack added · ${thb(STARTER_PACK.priceThb)} cash`, `เพิ่มแพ็กเริ่มต้นแล้ว · ${thb(STARTER_PACK.priceThb)}`), 'neutral', '🎒')
                  }
                }}
              />
            </div>
          </div>
        ) : null}
        {/* Kring v3.0 — Multi-Nationality Home-App Checkout Rails */}
        <div
          className="p-2.5 rounded-2xl c-surface-1 border c-line space-y-1.5"
          data-testid="topup-nationality-rails"
          data-dodo-product-id={getDodoProductByThbTier(amount).productId}
          data-dodo-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
        >
          <div className="flex items-center justify-between text-xs font-extrabold">
            <span>{tr('🌏 Pay with your home app (Tazapay · 2C2P · Dodo)', '🌏 จ่ายด้วยแอปของคุณ')}</span>
            <span className="text-emerald-500">{tr('No ATM needed — Thai ATMs charge ฿220–250 a withdrawal', 'ไม่ต้องกดตู้ ATM (ประหยัด ฿220–250/ครั้ง)')}</span>
          </div>
          <div className="grid grid-cols-5 gap-1 text-center text-xs font-bold">
            <span className="p-1.5 rounded-xl c-surface-2">🇮🇳 UPI</span>
            <span className="p-1.5 rounded-xl c-surface-2">💬 WeChat Pay</span>
            <span className="p-1.5 rounded-xl c-surface-2">🇷🇺 TrueMoney</span>
            <span className="p-1.5 rounded-xl c-surface-2">🇹🇭 PromptPay</span>
            <span
              className="p-1.5 rounded-xl c-surface-2"
              data-testid="topup-dodo-card-pill"
              data-dodo-product-id={getDodoProductByThbTier(amount).productId}
            >
              💳 Card
            </span>
          </div>
        </div>
        <div className="kw-pays" role="radiogroup" aria-label={tr('Pay with', 'จ่ายด้วย')}>
          {methods.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={method === m.id}
              data-testid={`topup-method-${m.id}`}
              className={`kw-pay m-press${method === m.id ? ' is-on' : ''}`}
              onClick={() => {
                triggerHaptic('select')
                setMethod(m.id)
              }}
            >
              <i className={`kw-pay-mark is-${m.id}`} aria-hidden="true">{m.mark}</i>
              <span>{m.name}</span>
              <em>{m.note}</em>
            </button>
          ))}
        </div>
        <p className="kw-scam">
          <span aria-hidden="true">🛡️</span>
          {tr('Pay only inside Kring. Locals and staff never ask you to transfer money in chat.', 'จ่ายในกริ๊งเท่านั้น โลคอลและทีมงานไม่มีวันขอให้โอนเงินในแชท')}
        </p>
        <button
          type="button"
          className="kw-btn is-mg kw-wide m-press"
          data-testid="topup-pay-btn"
          data-dodo-product-id={getDodoProductByThbTier(amount).productId}
          data-dodo-checkout-url={KRING_DODO_TEST_CHECKOUT_URL}
          onClick={() => {
            triggerHaptic('select')
            setStep('waiting')
          }}
        >
          {pack
            ? tr(`Pay ${thb(amount)} · Starter Pack`, `จ่าย ${thb(amount)} · แพ็กเริ่มต้น`)
            : method === 'promptpay'
              ? tr(`Pay ${thb(amount)} with PromptPay`, `จ่าย ${thb(amount)} ด้วยพร้อมเพย์`)
              : tr(`Pay ${thb(amount)}`, `จ่าย ${thb(amount)}`)}
        </button>
        <p className="kw-fine kw-c">
          {tr('Top-ups are always cash · ฿ only · no fee', 'เติมเป็นเงินสดเสมอ · บาทเท่านั้น · ฟรีค่าธรรมเนียม')}
        </p>
        <button
          type="button"
          className="wl-link"
          data-testid="topup-recheck-btn"
          onClick={() => island(tr('Checking with your bank — it lands the moment it clears', 'กำลังเช็กกับธนาคาร เคลียร์เมื่อไหร่เงินเข้าทันที'), 'neutral', '⏳')}
        >
          {tr('Paid but it hasn’t arrived? Re-check', 'จ่ายแล้วแต่เงินยังไม่เข้า? เช็กอีกครั้ง')}
        </button>
      </div>
    )
  })()

  return (
    <>
    <StarterPackHost />
    <RewardsHost />
    <Sheet
      open={open}
      onClose={close}
      testId="topup-sheet"
      title={
        step === 'done'
          ? packDone
            ? tr('Starter Pack is yours', 'ได้แพ็กเริ่มต้นแล้ว')
            : tr('Top-up successful', 'เติมเงินสำเร็จ')
          : step === 'waiting'
            ? method === 'promptpay' ? tr('Scan to pay', 'สแกนเพื่อจ่าย') : tr('Pay', 'ชำระเงิน')
            : pack
              ? tr('Starter Pack', 'แพ็กเริ่มต้น')
              : tr('Top up', 'เติมเงิน')
      }
      ariaLabel="Top up"
      initialDetent="92%"
      detents={['92%']}
      className="wl-sheet kw-sheetx"
    >
      {body}
    </Sheet>
    </>
  )
}
