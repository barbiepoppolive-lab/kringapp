import { useCallback, useEffect, useRef, useState } from 'react'
import { Sheet } from '../ui/Sheet'
import { triggerHaptic } from '../../lib/haptics'
import { useOptionalAuth } from '../../context/AuthContext'
import { island, openGuide, openTopUp, thb, useTr, type Tr } from '../vip/walletKit'
import '../../styles/wallet.css'

/**
 * NEXT95 · G3 — the Traveller Starter Pack. One calm, premium first-purchase offer (never a gacha popup):
 * worth ฿1,363 for ฿999: ฿1,000 to spend + eSIM 15 GB + ฿100 airport-cab rebate + 1 free bag drop. Once per traveller.
 * ROUND5 · Marco B12: every headline leads with the perks' value ("Worth ฿1,363 for ฿999"), never a ฿1 gain.
 *
 * Money rules: this file NEVER credits anything. "Get the pack" opens the existing top-up sheet with the pack
 * selected (`chon:open-topup` { pack: 'starter' }); the payment stops at the existing payment stop-point and coins land
 * only through the trusted wallet bus, exactly like any other top-up.
 * TODO(Argon): the gateway order must carry `product: 'starter_pack_v1'` and the server fulfils the pack on the paid
 * webhook (the +฿1 pack bonus as bonus coins, the eSIM voucher, the ฿100 cab rebate and the bag-drop credit) and
 * enforces once-per-account. The client only remembers "bought / dismissed" on this device to hide the offer.
 *
 * Anyone can open it with `window.dispatchEvent(new CustomEvent('chon:open-starter-pack', { detail: { source } }))`.
 * Locals / agencies never see it; nor does anyone after they bought or dismissed it.
 */

export const STARTER_PACK_OPEN_EVENT = 'chon:open-starter-pack'
/** fired whenever the offer's state changes (bought / dismissed) so every surface hides at once */
export const STARTER_PACK_EVENT = 'chon:starter-pack'
const STORE_KEY = 'chon_starter_pack_v1'

/** Prices match Pulse (eSIM ours ฿185, bag drop ours ฿105). */
export const STARTER_PACK = {
  id: 'starter_pack_v1',
  priceThb: 999,
  spendThb: 500,
  esimThb: 185,
  cabRebateThb: 665,
  bagDropThb: 0,
} as const
export const STARTER_PACK_WORTH_THB = STARTER_PACK.spendThb + STARTER_PACK.esimThb + STARTER_PACK.cabRebateThb

export type StarterPackState = 'new' | 'bought' | 'dismissed'
interface Stored {
  state: Exclude<StarterPackState, 'new'>
  at: number
}

function readAll(): Record<string, Stored> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Stored>) : {}
  } catch {
    return {}
  }
}

/** The offer's state for one account on this device. */
export function readStarterPack(userId: string | undefined | null): { state: StarterPackState; at?: number } {
  if (typeof window === 'undefined' || !userId) return { state: 'new' }
  const s = readAll()[userId]
  return s && (s.state === 'bought' || s.state === 'dismissed') ? s : { state: 'new' }
}

export function markStarterPack(userId: string | undefined | null, state: 'bought' | 'dismissed', now = Date.now()) {
  if (typeof window === 'undefined' || !userId) return
  const all = readAll()
  // a dismiss never overwrites a purchase
  if (all[userId]?.state === 'bought' && state === 'dismissed') return
  all[userId] = { state, at: now }
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the offer simply shows again next session
  }
  window.dispatchEvent(new CustomEvent(STARTER_PACK_EVENT, { detail: { state } }))
}

export function openStarterPack(source = 'wallet') {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(STARTER_PACK_OPEN_EVENT, { detail: { source } }))
}

/**
 * The one eligibility rule every surface uses (Welcome island, Pulse top, Wallet card):
 * a signed-in traveller ('guest' role) who has neither bought nor dismissed the pack.
 */
export function useStarterPack(): { eligible: boolean; state: StarterPackState; boughtAt?: number; userId?: string } {
  const auth = useOptionalAuth()
  const session = auth?.session
  const userId = session?.userId
  const isTraveller = Boolean(session) && session?.role === 'guest'
  const [v, setV] = useState(() => readStarterPack(userId))
  useEffect(() => {
    const on = () => setV(readStarterPack(userId))
    on()
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORE_KEY) on()
    }
    window.addEventListener(STARTER_PACK_EVENT, on)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(STARTER_PACK_EVENT, on)
      window.removeEventListener('storage', onStorage)
    }
  }, [userId])
  return { eligible: isTraveller && v.state === 'new', state: v.state, boughtAt: v.at, userId: userId ?? undefined }
}

/* ------------------------------------------------------------------------------------------------ */
/* pieces                                                                                            */
/* ------------------------------------------------------------------------------------------------ */

export interface PackPerk {
  id: 'spend' | 'esim' | 'cab' | 'bag'
  title: string
  sub: string
  value: string
}

export function packPerks(tr: Tr): PackPerk[] {
  return [
    {
      id: 'cab',
      title: tr('Airport → Sukhumvit Car', 'รถรับสนามบิน → สุขุมวิท'),
      sub: tr('Private Camry · tolls in · Gate 4', 'รถส่วนตัว · รวมทางด่วน · ประตู 4'),
      value: thb(STARTER_PACK.cabRebateThb),
    },
    {
      id: 'esim',
      title: tr('5G eSIM · 15 GB', 'eSIM 5G · 15 GB'),
      sub: tr('8 days · instant QR when you land', '8 วัน · ได้ QR ทันทีตอนเครื่องลง'),
      value: thb(STARTER_PACK.esimThb),
    },
    {
      id: 'spend',
      title: tr(`+${thb(STARTER_PACK.spendThb)} Promo Credit`, `+โปร ${thb(STARTER_PACK.spendThb)} เครดิต`),
      sub: tr('Repeat-booking fee waiver & partner perks after 1st กริ๊ง!', 'ใช้ลดค่าธรรมเนียมจองซ้ำและแลกดีลพาร์ทเนอร์หลังกริ๊ง! ครั้งแรก'),
      value: thb(STARTER_PACK.spendThb),
    },
  ]
}

/** Small drawn marks instead of emoji: a coin, a SIM, a cab, a bag (stroke = currentColor). */
export function PerkMark({ id }: { id: PackPerk['id'] }) {
  return (
    <svg viewBox="0 0 24 24" className="sp-mark" aria-hidden="true">
      {id === 'spend' ? (
        <>
          <circle cx="12" cy="12" r="8" />
          <path d="M12 7.5v9M9.5 10c0-1.2 1.1-1.8 2.5-1.8s2.5.6 2.5 1.6c0 2.4-5 1.1-5 3.8 0 1 1.1 1.7 2.5 1.7s2.5-.6 2.5-1.8" />
        </>
      ) : id === 'esim' ? (
        <>
          <path d="M8 3.5h6.5L18 7v13.5H8z" />
          <rect x="10.5" y="11" width="5" height="6" rx="1" />
        </>
      ) : id === 'cab' ? (
        <>
          <path d="M5 16.5V12l2-4.5h10l2 4.5v4.5" />
          <path d="M4 12h16M8 16.5v2M16 16.5v2" />
          <circle cx="8" cy="14" r=".6" />
          <circle cx="16" cy="14" r=".6" />
        </>
      ) : (
        <>
          <rect x="6" y="8" width="12" height="11.5" rx="2.2" />
          <path d="M9.5 8V5.5h5V8M10 12v4M14 12v4" />
        </>
      )}
    </svg>
  )
}

/** The pass: Bangkok night with an anchan glow and a marigold foil edge (Kring). Leans with the shared tilt (`--tx/--ty` on :root). */
export function PackPass({ tr, compact = false }: { tr: Tr; compact?: boolean }) {
  return (
    <div className={`sp-pass${compact ? ' is-compact' : ''}`} aria-hidden={compact ? 'true' : undefined}>
      <span className="sp-pass-foil" aria-hidden="true" />
      <span className="sp-pass-sheen" aria-hidden="true" />
      <div className="sp-pass-top">
        <span>{tr('Kring · Starter', 'กริ๊ง · สตาร์ทเตอร์')}</span>
        {compact ? null : <span className="sp-pass-once">{tr('Once', 'ครั้งเดียว')}</span>}
      </div>
      <div className="sp-pass-mid">
        <b>{thb(STARTER_PACK.spendThb)}</b>
        {compact ? null : <small>{tr('to spend in Bangkok', 'ไว้ใช้ในกรุงเทพฯ')}</small>}
      </div>
      {compact ? null : (
        <div className="sp-pass-foot">
          <span>{tr(`Yours for ${thb(STARTER_PACK.priceThb)}`, `จ่ายแค่ ${thb(STARTER_PACK.priceThb)}`)}</span>
          <span>{tr(`Worth ${thb(STARTER_PACK_WORTH_THB)}`, `มูลค่า ${thb(STARTER_PACK_WORTH_THB)}`)}</span>
        </div>
      )}
    </div>
  )
}

/** The Wallet entry (traveller mode only). Renders nothing for locals, after a purchase or after a dismiss. */
export function StarterPackCard() {
  const tr = useTr()
  const { eligible, userId } = useStarterPack()
  if (!eligible) return null
  return (
    <div className="sp-card" data-testid="starter-pack-card">
      <button
        type="button"
        className="sp-card-main m-press"
        aria-label={tr(
          `Traveller Starter Pack: worth ${thb(STARTER_PACK_WORTH_THB)} for ${thb(STARTER_PACK.priceThb)} — ${thb(STARTER_PACK.spendThb)} to spend, eSIM, cab rebate and bag drop`,
          `แพ็กเริ่มต้นนักเดินทาง: มูลค่า ${thb(STARTER_PACK_WORTH_THB)} จ่าย ${thb(STARTER_PACK.priceThb)} ได้เครดิต ${thb(STARTER_PACK.spendThb)} eSIM เงินคืนค่าแท็กซี่ และฝากกระเป๋า`,
        )}
        onClick={() => {
          triggerHaptic('select')
          openStarterPack('wallet')
        }}
      >
        <PackPass tr={tr} compact />
        <span className="sp-card-t">
          <span className="sp-k">{tr('Starter Pack · once', 'แพ็กเริ่มต้น · ครั้งเดียว')}</span>
          <b>{tr(`Worth ${thb(STARTER_PACK_WORTH_THB)} for ${thb(STARTER_PACK.priceThb)}`, `มูลค่า ${thb(STARTER_PACK_WORTH_THB)} จ่าย ${thb(STARTER_PACK.priceThb)}`)}</b>
          <small>{tr(`${thb(STARTER_PACK.spendThb)} to spend · eSIM 15 GB · cab rebate · bag drop`, `เครดิต ${thb(STARTER_PACK.spendThb)} · eSIM 15 GB · คืนค่าแท็กซี่ · ฝากกระเป๋า`)}</small>
        </span>
        <svg className="wl-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 5l7 7-7 7" />
        </svg>
      </button>
      <button
        type="button"
        className="sp-card-x"
        aria-label={tr('Hide the Starter Pack', 'ซ่อนแพ็กเริ่มต้น')}
        data-testid="starter-pack-card-dismiss"
        onClick={() => {
          triggerHaptic('tap')
          markStarterPack(userId, 'dismissed')
          island(tr('Starter Pack hidden', 'ซ่อนแพ็กเริ่มต้นแล้ว'), 'neutral')
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  )
}

/** Mounted once (inside the always-mounted TopUpSheet): listens for `chon:open-starter-pack` and shows the sheet. */
export default function StarterPackHost() {
  const tr = useTr()
  const { eligible, userId } = useStarterPack()
  const [open, setOpen] = useState(false)
  const eligibleRef = useLatest(eligible)

  useEffect(() => {
    const onOpen = () => {
      // locals, buyers and people who said "no thanks" never see it — a stray dispatch is a no-op
      if (!eligibleRef.current) return
      setOpen(true)
    }
    window.addEventListener(STARTER_PACK_OPEN_EVENT, onOpen)
    return () => window.removeEventListener(STARTER_PACK_OPEN_EVENT, onOpen)
  }, [eligibleRef])

  // bought elsewhere (another tab) or the role changed → close quietly
  useEffect(() => {
    if (!eligible) setOpen(false)
  }, [eligible])

  const buy = useCallback(() => {
    triggerHaptic('select')
    setOpen(false)
    // the existing top-up flow, pack selected; it stops at the existing payment stop-point
    window.setTimeout(() => openTopUp({ pack: 'starter', backLabel: tr('Wallet', 'กระเป๋า') }), 180)
  }, [tr])

  const perks = packPerks(tr)

  return (
    <Sheet
      open={open}
      onClose={() => setOpen(false)}
      testId="starter-pack-sheet"
      closeTestId="starter-pack-close"
      title={tr('Starter Pack', 'แพ็กเริ่มต้น')}
      ariaLabel={tr('Traveller Starter Pack', 'แพ็กเริ่มต้นนักเดินทาง')}
      initialDetent="92%"
      detents={['92%']}
      className="wl-sheet sp-sheet"
      headerRight={
        <button type="button" className="wl-q m-press" aria-label={tr('How the Starter Pack works', 'แพ็กเริ่มต้นทำงานยังไง')} onClick={() => openGuide('starter')}>
          ?
        </button>
      }
    >
      <div className="sp-body">
        <p className="sp-k sp-lede-k">{tr('For new travellers · once', 'สำหรับนักเดินทางใหม่ · ครั้งเดียว')}</p>
        <h3 className="sp-lede" data-testid="starter-pack-headline">
          {tr(`Worth ${thb(STARTER_PACK_WORTH_THB)}. Yours for ${thb(STARTER_PACK.priceThb)}.`, `มูลค่า ${thb(STARTER_PACK_WORTH_THB)} จ่ายแค่ ${thb(STARTER_PACK.priceThb)}`)}
        </h3>
        <p className="sp-lede-s">{tr('Land, and the first night is sorted.', 'ลงเครื่องปุ๊บ คืนแรกพร้อมเที่ยว')}</p>
        <div className="sp-pass-stage">
          <PackPass tr={tr} />
        </div>
        <ul className="sp-perks" aria-label={tr('What’s inside', 'ในแพ็กมีอะไร')}>
          {perks.map((p, i) => (
            <li key={p.id} style={{ animationDelay: `${140 + i * 70}ms` }} data-testid={`starter-pack-perk-${p.id}`}>
              <span className="sp-perk-ic">
                <PerkMark id={p.id} />
              </span>
              <span className="sp-perk-t">
                <b>{p.title}</b>
                <small>{p.sub}</small>
              </span>
              <span className="sp-perk-v">{p.value}</span>
            </li>
          ))}
        </ul>
        <div className="sp-sum" aria-label={tr(`Worth ${thb(STARTER_PACK_WORTH_THB)}, you pay ${thb(STARTER_PACK.priceThb)}`, `มูลค่า ${thb(STARTER_PACK_WORTH_THB)} จ่าย ${thb(STARTER_PACK.priceThb)}`)}>
          <span>
            {tr('Worth', 'มูลค่า')} <s>{thb(STARTER_PACK_WORTH_THB)}</s>
          </span>
          <b>
            {tr('You pay', 'คุณจ่าย')} {thb(STARTER_PACK.priceThb)}
          </b>
        </div>
        <button type="button" className="ux-btn ux-btn-gold wl-cta wl-gold m-press" data-testid="starter-pack-buy" onClick={buy}>
          {tr(`Get the pack · ${thb(STARTER_PACK.priceThb)}`, `รับแพ็ก · ${thb(STARTER_PACK.priceThb)}`)}
        </button>
        <p className="sp-fine">
          {tr(
            'One per traveller. Pay by PromptPay, Apple Pay or Google Pay — nothing moves until you confirm with your bank.',
            'หนึ่งคนรับได้ครั้งเดียว จ่ายผ่านพร้อมเพย์ Apple Pay หรือ Google Pay ไม่มีการตัดเงินจนกว่าคุณจะยืนยันในแอปธนาคาร',
          )}
        </p>
        <button
          type="button"
          className="wl-link"
          data-testid="starter-pack-dismiss"
          onClick={() => {
            triggerHaptic('tap')
            markStarterPack(userId, 'dismissed')
            setOpen(false)
          }}
        >
          {tr('No thanks', 'ไม่เป็นไร ขอบคุณ')}
        </button>
      </div>
    </Sheet>
  )
}

/** Compact pack summary shown inside the top-up sheet when the pack is selected. */
export function StarterPackSummary({ onChange }: { onChange: () => void }) {
  const tr = useTr()
  return (
    <div className="sp-mini" data-testid="topup-pack-summary">
      <PackPass tr={tr} compact />
      <span className="sp-card-t">
        <span className="sp-k">{tr('Starter Pack', 'แพ็กเริ่มต้น')}</span>
        <b>
          {tr(`Worth ${thb(STARTER_PACK_WORTH_THB)} for ${thb(STARTER_PACK.priceThb)}`, `มูลค่า ${thb(STARTER_PACK_WORTH_THB)} จ่าย ${thb(STARTER_PACK.priceThb)}`)}
        </b>
        <small>{tr(`${thb(STARTER_PACK.spendThb)} to spend · eSIM · cab rebate · bag drop`, `เครดิต ${thb(STARTER_PACK.spendThb)} · eSIM · คืนค่าแท็กซี่ · ฝากกระเป๋า`)}</small>
      </span>
      <button type="button" className="wl-mini-btn" onClick={onChange} data-testid="topup-pack-change">
        {tr('Change', 'เปลี่ยน')}
      </button>
    </div>
  )
}

function useLatest<T>(v: T) {
  const ref = useRef(v)
  ref.current = v
  return ref
}
