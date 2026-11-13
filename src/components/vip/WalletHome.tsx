import { useCallback, useEffect, useRef, useState } from 'react'
import { useFloatRef } from '../../design/floating'
import { triggerHaptic } from '../../lib/haptics'
import { DEFAULT_PLATFORM_CONFIG, getPaymentsMode, type PlatformConfig } from '../../lib/configDefaults'
import { formatBahtValue } from '../../lib/money'
import { type AccountMode } from './AccountModesRow'
import CashOutSheet from './CashOutSheet'
import WalletTimeline from './WalletTimeline'
import { heldExtraThb, usePlanStore } from '../../lib/planStore'
import { ActivityList, useMoneyInOut, YourExperiences, YourTrips } from './MeSections'
import { useTripStats } from '../../lib/tripSavings'
import { guestHeldNow, lastGuestRelease } from '../wallet/bookingMoney'
import LocalEarnings from '../wallet/LocalEarnings'
import AgencyDashboard from '../wallet/AgencyDashboard'
import { openStarterPack } from '../wallet/StarterPack'
import { CoinFlight } from '../wallet/CoinFlight'
import { KSheet, RollingBaht, roleToMode, ROLE_CHANGED_EVENT } from '../wallet/kringKit'
import { InvitePage, PrivacyPage, SettingsPage, VisitorsPage, AgencyPage } from './WalletPages'
import {
  copyText,
  island,
  logPayoutActivity,
  markPayoutSent,
  openSafety,
  openTopUp,
  recordHostPayout,
  useFirstName,
  useRolledBalance,
  useTr,
  WPage,
} from './walletKit'
import { EDIT_PROFILE_EVENT } from '../../lib/selfGuard'
import { useIdVerified } from '../../context/presence'
import { PHOTOS_EVENT, readPhotos } from '../../lib/profileStore'
import SavedPage from './SavedPage'
import { useHeaderPillMorph } from './pillMorph'
import { IcGear, IcHeart, IcInvite, IcShield } from './meIcons'
import { KringLogo } from '../ui/KringMark'
import { t as lex } from '../../lib/lexicon'
import { useLanguage } from '../../i18n/LanguageContext'
import { hasAgencyRole, useOptionalAuth } from '../../context/AuthContext'

/** A stable 7-digit support ID from the account id (display only). */
function memberIdFor(userId: string | undefined): string {
  let h = 2166136261
  for (const ch of userId || 'kring') h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0
  return String(1_000_000 + (h % 9_000_000))
}
import '../../styles/wallet.css'

/**
 * K5 · Kring Wallet → KRING T3 · Me, one app for travellers and Thai locals (W4). No Traveller · Local · Agency tiles.
 *   You (✓ Local badge after the ID check) → ONE wallet card: cash balance (+ promo line), IN · earned / OUT · spent,
 *   Top up · Withdraw → Your experiences (each listing Live / Paused, MeSections) + "＋ Share something you love" →
 *   Your trips → ONE Activity list (See all → the full timeline) → Saved · Invite · Safety · Settings.
 *   Earnings (Ready / This month / Pending) open from IN · earned; agency tools only from Settings for accounts that
 *   already have the agency role. `mode` stays a prop for back-compat (the hub still derives it from the role).
 */
export interface WalletHomeProps {
  mode: AccountMode
  onModeChange: (m: AccountMode) => void
  grantedByAuth: AccountMode[]
  language: string
  paidCoins: number
  bonusCoins: number
  isDemoMode: boolean
  /** coins currently held for bookings that haven't met yet (optional) */
  heldCoins?: number
  host: {
    readyThb: number
    points: number
    feeThb: number
    canCashOut: boolean
    blockedReason?: string
    onConfirmCashout: (promptPay: string) => void
  }
  activeHosts: number
  friendPaidCoins: number
  config?: PlatformConfig
  /** `chon:vip-subaction` deep links resolved by the hub ({ id: 'vip-referral' | 'vip-agency' | 'vip-cashout' | … }) */
  deepLink?: { id: string; n: number } | null
}

type PageId = null | 'settings' | 'privacy' | 'visitors' | 'invite' | 'agency' | 'activity' | 'saved' | 'earnings' | 'agencyTools'
type SheetId = null | 'balance' | 'withdraw'

export default function WalletHome({
  mode,
  onModeChange,
  grantedByAuth,
  language,
  paidCoins,
  bonusCoins,
  isDemoMode,
  heldCoins = 0,
  host,
  activeHosts,
  friendPaidCoins,
  config = DEFAULT_PLATFORM_CONFIG,
  deepLink,
}: WalletHomeProps) {
  const tr = useTr()
  const lang = useLanguage().language
  const name = useFirstName('')
  const auth = useOptionalAuth()
  const memberId = memberIdFor(auth?.session?.userId)
  const isAgency = hasAgencyRole(auth?.session) || grantedByAuth.includes('agency')
  const verified = useIdVerified()
  const money = useMoneyInOut()
  const { savedThb: saved, bookings: tripBookings } = useTripStats(isDemoMode)
  // KRING FIX1 · one money truth: the held line reads the SAME booking records as the offer card, ticket and Plans
  // (one line per booking, never one per hold call), and a release shows as "Released ฿X to Kwan" right away.
  const plans = usePlanStore()
  const held = guestHeldNow(plans)
  const extraHolds = Object.values(plans.meet ?? {}).filter((m) => !(plans.host ?? {})[m.key] && heldExtraThb(m.key) > 0)
  const heldNames = Array.from(new Set([...held.names, ...extraHolds.map((m) => m.host || plans.guest?.[m.key]?.hostName || '')].filter(Boolean)))
  const heldThb = heldCoins > 0 ? heldCoins / config.coins_per_thb : held.thb + extraHolds.reduce((a, m) => a + heldExtraThb(m.key), 0)
  const heldFor = heldNames.length === 1 ? heldNames[0] : ''
  const released = lastGuestRelease(plans)
  const [page, setPage] = useState<PageId>(null)
  const [sheet, setSheet] = useState<SheetId>(null)
  const [cashout, setCashout] = useState(false)
  const privacyFromHome = useRef(false)
  const per = config.coins_per_thb
  const cardRef = useRef<HTMLButtonElement | null>(null)
  useHeaderPillMorph(cardRef, true)
  // the card is Me's ONE floating hero; it pauses off-screen (V1's shared observer)
  const floatRef = useFloatRef<HTMLButtonElement>()
  const setCard = useCallback(
    (el: HTMLButtonElement | null) => {
      cardRef.current = el
      floatRef(el)
    },
    [floatRef],
  )
  const [mainPhoto, setMainPhoto] = useState<string | undefined>(() => (typeof window === 'undefined' ? undefined : readPhotos()[0]?.src))
  useEffect(() => {
    const on = () => setMainPhoto(readPhotos()[0]?.src)
    window.addEventListener(PHOTOS_EVENT, on)
    window.addEventListener('chon:profile-updated', on)
    return () => {
      window.removeEventListener(PHOTOS_EVENT, on)
      window.removeEventListener('chon:profile-updated', on)
    }
  }, [])

  // payoff order: top-up sheet closes → (200 ms) card glint + coins fly INTO the figure → (520 ms) the balance rolls.
  // ONE clock (walletKit.useRolledBalance): the header pill, these digits and the cash · promo line share a snapshot.
  const shown = useRolledBalance(paidCoins, bonusCoins)
  const gainKey = shown.gainKey
  // KRING FIX2 · one money truth: the big number is CASH (what can pay a booking) — the same figure as the header pill
  // and the e-slip. Promo is its own line, never added in.
  const cashThb = shown.paid / per
  const promoThb = shown.bonus / per

  // other screens can deep-link into a wallet page (resolved by the hub from `chon:vip-subaction`)
  useEffect(() => {
    const sub = deepLink?.id
    if (!sub) return
    if (sub === 'vip-referral') setPage('invite')
    else if (sub === 'vip-agency') setPage(isAgency ? 'agencyTools' : 'agency')
    else if (sub === 'vip-cashout') setCashout(true)
    else if (sub === 'vip-settings') setPage('settings')
    else if (sub === 'vip-privacy') setPage('privacy')
    else if (sub === 'vip-visitors') setPage('visitors')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLink])

  // My profile's role sheet (K1) announces switches; follow them here too
  const modeRef = useRef(mode)
  modeRef.current = mode
  const changeRef = useRef(onModeChange)
  changeRef.current = onModeChange
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ role?: string; source?: string }>).detail
      if (d?.source === 'wallet') return
      const m = roleToMode(d?.role)
      if (m && m !== modeRef.current) changeRef.current(m)
    }
    window.addEventListener(ROLE_CHANGED_EVENT, on)
    return () => window.removeEventListener(ROLE_CHANGED_EVENT, on)
  }, [])

  // a confirmed withdrawal drops the Ready figure and leaves a "Sending to PromptPay" row
  const confirmCashout = (promptPay: string) => {
    const amount = host.readyThb
    host.onConfirmCashout(promptPay)
    const digits = promptPay.replace(/\D/g, '')
    const row = logPayoutActivity(amount, digits.length >= 4 ? `••${digits.slice(-4)}` : 'PromptPay')
    recordHostPayout(amount, isDemoMode)
    window.setTimeout(() => markPayoutSent(row.id), 4000)
  }

  const title = tr('Me', 'ฉัน')

  return (
    <div className="wl-home kw-home me5" data-testid="wallet-home" data-mode={mode} data-payments-mode={getPaymentsMode()}>
      <h2 className="sr-only">{title}</h2>
      {/* who you are → My profile (photos · ID · home city). ✓ Local after the ID check — a badge, never a mode. */}
      <button
        type="button"
        className="me5-id kf-press"
        data-testid="wallet-open-profile"
        onClick={() => {
          triggerHaptic('select')
          window.dispatchEvent(new CustomEvent(EDIT_PROFILE_EVENT))
        }}
      >
        <span className="me5-av" aria-hidden="true">{mainPhoto ? <img src={mainPhoto} alt="" /> : (name || 'K').slice(0, 1).toUpperCase()}</span>
        <span className="me5-idt">
          <b>
            <span className="me6-nm">{name || tr('You', 'คุณ')}</span>
            {verified ? (
              <span className="me6-lb" data-testid="me-local-badge">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
                {tr('Local', 'โลคอล')}
              </span>
            ) : null}
          </b>
          <small>{verified ? tr('Profile · photos · ID checked', 'โปรไฟล์ · รูป · ยืนยันตัวตนแล้ว') : lex('me.profile', lang)}</small>
        </span>
        <svg className="me5-chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>

      {/* ONE wallet card: the balance you spend from is the one your earnings land in */}
      <div className="me6-wal" data-testid="me-wallet-card">
        {/* the header pill morphs into this button (useHeaderPillMorph) */}
        <button
          ref={setCard}
          type="button"
          className="me6-balb kf-hero"
          data-testid="wallet-metal-card"
          aria-label={tr(
            `Cash ${formatBahtValue(cashThb, { decimals: true })}${promoThb > 0 ? `, plus ${formatBahtValue(promoThb)} promo` : ''} — see what each can pay`,
            `เงินสด ${formatBahtValue(cashThb, { decimals: true })}${promoThb > 0 ? ` และโปร ${formatBahtValue(promoThb)}` : ''} — ดูว่าแต่ละส่วนใช้อะไรได้`,
          )}
          onClick={() => {
            triggerHaptic('tap')
            setSheet('balance')
          }}
        >
          <span className="me5-wm" aria-hidden="true">KRING</span>
          <span className="me6-k">{tr('Wallet · one balance', 'กระเป๋า · ยอดเดียว')}</span>
          <KringLogo size={72} flowKey={gainKey} className="me5-rings" label="" />
          <span className="me6-bal" data-testid="wallet-card-balance">
            <RollingBaht value={cashThb} decimals />
          </span>
          <span className="me6-split" data-testid="wallet-card-split">
            {/* Marco 6: the promo figure rolls on the SAME clock as the big digits */}
            <span className="me5-promo">
              <i>{tr('promo', 'โปร')}</i>
              <RollingBaht value={promoThb} fromZero={false} className="me5-pn" />
              <span>{tr('gifts & extras', 'ของขวัญและของเสริม')}</span>
              <span className="sr-only">{tr(' · not bookings', ' · จองไม่ได้')}</span>
            </span>
            {heldThb > 0 ? (
              <span className="me5-held" data-testid="wallet-card-held">
                {tr(`${formatBahtValue(heldThb)} held`, `พัก ${formatBahtValue(heldThb)}`)}
              </span>
            ) : null}
          </span>
          {gainKey > 0 ? <i key={gainKey} className="kw-glint" aria-hidden="true" /> : null}
        </button>
        <div className="me6-io">
          <button
            type="button"
            className="me6-in kf-press"
            data-testid="wallet-money-in"
            onClick={() => {
              triggerHaptic('tap')
              setPage('earnings')
            }}
          >
            <small>{tr('In · earned', 'เข้า · รายได้')}</small>
            <b>+{formatBahtValue(money.inThb)}</b>
          </button>
          <button
            type="button"
            className="me6-out kf-press"
            data-testid="wallet-money-out"
            onClick={() => {
              triggerHaptic('tap')
              setPage('activity')
            }}
          >
            <small>{tr('Out · spent', 'ออก · ใช้ไป')}</small>
            <b>−{formatBahtValue(money.outThb)}</b>
          </button>
        </div>
        <div className="me6-btns">
          <button
            type="button"
            className="me6-btn is-up kf-press"
            data-testid="wallet-home-topup"
            onClick={() => {
              triggerHaptic('select')
              openTopUp({ backLabel: tr('Me', 'ฉัน') })
            }}
          >
            ＋ {lex('bal.topup', lang)}
          </button>
          <button
            type="button"
            className="me6-btn kf-press"
            data-testid="wallet-home-withdraw"
            onClick={() => {
              triggerHaptic('select')
              // earnings ready → the PromptPay cash-out; otherwise the cash withdraw sheet
              if (host.readyThb > 0) setCashout(true)
              else setSheet('withdraw')
            }}
          >
            {lex('bal.withdraw', lang)}
          </button>
        </div>
      </div>
      <CoinFlight />

      <YourExperiences local={money.local} />
      <YourTrips guest={money.guest} />
      <ActivityList guest={money.guest} local={money.local} onSeeAll={() => setPage('activity')} />

      <div className="me5-icons is-4">
        {[
          { id: 'saved', icon: <IcHeart />, label: lex('me.saved', lang), onClick: () => setPage('saved'), testId: 'wallet-home-saved' },
          { id: 'invite', icon: <IcInvite />, label: lex('me.invite', lang), onClick: () => setPage('invite'), testId: 'wallet-home-earn' },
          { id: 'safety', icon: <IcShield />, label: lex('me.safety', lang), onClick: () => openSafety({ section: 'sos' }), testId: 'wallet-home-safety' },
          { id: 'settings', icon: <IcGear />, label: lex('me.settings', lang), onClick: () => setPage('settings'), testId: 'wallet-home-settings' },
        ].map((it) => (
          <button
            key={it.id}
            type="button"
            className="me5-ic kf-press"
            data-testid={it.testId}
            onClick={() => {
              triggerHaptic('tap')
              it.onClick()
            }}
          >
            <span className="me5-ict" aria-hidden="true">{it.icon}</span>
            <span>{it.label}</span>
          </button>
        ))}
      </div>

      {/* Earnings (opened from IN · earned): Ready / This month / Pending, by source, Withdraw → PromptPay */}
      <WPage open={page === 'earnings'} onBack={() => setPage(null)} title={tr('Earnings', 'รายได้')} testId="wallet-earnings-page">
        <div className="wl-stack">
          <LocalEarnings
            readyThb={host.readyThb}
            isDemoMode={isDemoMode}
            canWithdraw={host.canCashOut}
            blockedReason={host.blockedReason}
            onWithdraw={() => setCashout(true)}
          />
        </div>
      </WPage>
      {/* Agency tools: only for accounts that already have the agency role (Settings › Agency tools) */}
      {isAgency ? (
        <WPage open={page === 'agencyTools'} onBack={() => setPage('settings')} title={tr('Agency tools', 'เครื่องมือเอเจนซี่')} testId="wallet-agency-tools-page">
          <div className="wl-stack">
            <AgencyDashboard activeHosts={activeHosts} isDemoMode={isDemoMode} config={config} onOpenCashOut={() => setCashout(true)} />
          </div>
        </WPage>
      ) : null}

      {/* Activity sub-page: what is held, savings, and the whole timeline (moved off the Me screen) */}
      <WPage open={page === 'activity'} onBack={() => setPage(null)} title={lex('me.activity', lang)} testId="wallet-activity-page">
        <div className="wl-stack me5-act">
          {(
            <div className="kw-strip">
              <button
                type="button"
                className={`kw-held m-press${heldThb <= 0 && released ? ' is-released' : ''}`}
                data-testid="wallet-held-line"
                data-state={heldThb > 0 ? 'held' : released ? 'released' : 'none'}
                onClick={() => setSheet('balance')}
              >
                <span className="kw-lockic" aria-hidden="true">
                  <i />
                </span>
                <span className="kw-grow">
                  <b>
                    {heldThb > 0
                      ? heldFor
                        ? tr(`${formatBahtValue(heldThb)} booking with ${heldFor}`, `ยอดจอง ${formatBahtValue(heldThb)} กับ ${heldFor}`)
                        : tr(`${formatBahtValue(heldThb)} in bookings`, `ยอดจอง ${formatBahtValue(heldThb)}`)
                      : released
                        ? tr(`Released ${formatBahtValue(released.thb)} to ${released.who}`, `โอน ${formatBahtValue(released.thb)} ให้ ${released.who} แล้ว`)
                        : tr('Every booking is held until you meet', 'ยอดจองพักไว้จนเจอกันทุกครั้ง')}
                  </b>
                  <small>
                    {heldThb > 0
                      ? tr('held until you meet · back if you don’t', 'พักไว้จนเจอกัน · ไม่ได้เจอ คืนเต็ม')
                      : released
                        ? tr('Kring! · you met, the booking is paid', 'กริ๊ง! · เจอกันแล้ว จ่ายเรียบร้อย')
                        : tr('released only after Kring! at the venue', 'โอนให้โลคอลหลังกริ๊ง! ที่จุดนัดเท่านั้น')}
                  </small>
                </span>
              </button>
              <div className="kw-saved" data-testid="wallet-saved-line">
                <b>{saved > 0 ? tr(`You saved ${formatBahtValue(saved)}`, `ประหยัดไป ${formatBahtValue(saved)}`) : tr('No savings counted yet', 'ยังไม่มียอดเซฟ')}</b>
                <small>
                  {tripBookings > 0
                    ? saved > 0
                      ? tr(`${tripBookings} completed ${tripBookings === 1 ? 'booking' : 'bookings'} · vs cheapest elsewhere`, `จบไปแล้ว ${tripBookings} การจอง · เทียบราคาถูกสุดที่อื่น`)
                      : // Wei r3 · one savings voice with Kring Price: "No savings counted yet · proven only"
                        tr(`${tripBookings} completed ${tripBookings === 1 ? 'booking' : 'bookings'} · proven only`, `จบไปแล้ว ${tripBookings} การจอง · นับเฉพาะที่ถูกกว่าจริง`)
                    : tr('vs cheapest price elsewhere', 'เทียบราคาถูกสุดที่อื่น')}
                </small>
              </div>
            </div>
          )}
          <WalletTimeline mode="traveller" isDemoMode={isDemoMode} coinsPerThb={per} />
          {money.local.length || host.readyThb > 0 ? (
            <>
              <p className="wl-grp">{tr('Hosting', 'ที่คุณพาเที่ยว')}</p>
              <WalletTimeline mode="host" isDemoMode={isDemoMode} coinsPerThb={per} />
            </>
          ) : null}
          <button
            type="button"
            className="kw-me m-press me5-supp"
            data-testid="wallet-member-id"
            aria-label={tr(`Copy your Kring ID ${memberId}`, `คัดลอกไอดีกริ๊ง ${memberId}`)}
            onClick={async () => {
              triggerHaptic('tap')
              const ok = await copyText(memberId)
              island(ok ? tr('ID copied — give it to support if you need help', 'คัดลอกไอดีแล้ว ใช้แจ้งทีมงานได้') : memberId, ok ? 'green' : 'neutral', ok ? '✓' : undefined)
            }}
          >
            <small>
              {tr('Kring ID for support', 'ไอดีกริ๊งสำหรับติดต่อทีมงาน')} · {memberId} <span aria-hidden="true">⧉</span>
            </small>
          </button>
        </div>
      </WPage>
      <SavedPage open={page === 'saved'} onBack={() => setPage(null)} />

      {/* tappable balance → what each part can do */}
      <KSheet open={sheet === 'balance'} onClose={() => setSheet(null)} title={tr('Your balance', 'ยอดของคุณ')} testId="wallet-balance-sheet">
        <div className="kw-bk">
          <div>
            <span className="kw-k">{tr('Cash', 'เงินสด')}</span>
            <b>{formatBahtValue(cashThb, { decimals: true })}</b>
            <small>{tr('From your top-ups. Pays bookings; the unused part can go back to PromptPay.', 'จากการเติมเงิน ใช้จองได้ ส่วนที่ไม่ได้ใช้ถอนกลับพร้อมเพย์ได้')}</small>
          </div>
          <div>
            <span className="kw-k">{tr('Promo', 'โปร')}</span>
            <b className="kw-violet">{formatBahtValue(promoThb, { decimals: true })}</b>
            <small>{tr('For Kring Price deals, gifts, repeat-booking fee waivers & partner vouchers (after 1st กริ๊ง!) — can’t pay bookings or withdraw.', 'ใช้กับดีลราคากริ๊ง ของขวัญ ลดค่าธรรมเนียมจองซ้ำ และคูปองพาร์ทเนอร์ (หลังกริ๊ง! ครั้งแรก) — จองไม่ได้ และถอนไม่ได้')}</small>
          </div>
          <div>
            <span className="kw-k">{tr('Held for bookings', 'พักไว้สำหรับการจอง')}</span>
            <b>{formatBahtValue(heldThb)}</b>
            <small>{tr('Released to your Local only after you both go Kring! at the venue. Back to you if you don’t meet.', 'โอนให้โลคอลหลังกริ๊ง! ที่ร้านเท่านั้น ถ้าไม่ได้เจอ คืนเต็ม')}</small>
          </div>
        </div>
        <button
          type="button"
          className="kw-btn kw-wide m-press"
          data-testid="wallet-home-starter-pack"
          onClick={() => {
            triggerHaptic('select')
            setSheet(null)
            openStarterPack('wallet')
          }}
        >
          {tr('Starter Pack · ฿999', 'แพ็กเริ่มต้น · ฿999')}
        </button>
        <button type="button" className="kw-btn is-mg kw-wide m-press" onClick={() => setSheet(null)}>
          {tr('Got it', 'เข้าใจแล้ว')}
        </button>
      </KSheet>

      {/* traveller withdraw: cash only, promo stays */}
      <KSheet open={sheet === 'withdraw'} onClose={() => setSheet(null)} title={tr('Withdraw cash', 'ถอนเงินสด')} testId="wallet-withdraw-sheet">
        <div className="kw-wd-amt">
          <span className="kw-k">{tr('Cash you can withdraw', 'เงินสดที่ถอนได้')}</span>
          <b>{formatBahtValue(cashThb, { decimals: true })}</b>
          <small>{tr(`${formatBahtValue(promoThb)} promo stays in your wallet — promo can be spent, not withdrawn.`, `โปร ${formatBahtValue(promoThb)} อยู่ในกระเป๋าต่อ ใช้ได้แต่ถอนไม่ได้`)}</small>
        </div>
        <p className="kw-sub">
          {tr(
            'Cash goes back to the PromptPay or card you topped up with. Kring support sends it and the slip lands in Wallet.',
            'เงินสดจะคืนเข้าพร้อมเพย์หรือบัตรที่ใช้เติม ทีมกริ๊งเป็นคนโอนให้ และสลิปจะอยู่ในกระเป๋า',
          )}
        </p>
        <button
          type="button"
          className="kw-btn is-mg kw-wide m-press"
          data-testid="wallet-withdraw-request"
          disabled={cashThb <= 0}
          onClick={() => {
            setSheet(null)
            window.dispatchEvent(new CustomEvent('chon:open-help-overlay', { detail: { section: 'wallet', topic: 'withdraw' } }))
          }}
        >
          {cashThb > 0 ? tr(`Ask to withdraw ${formatBahtValue(cashThb)}`, `ขอถอน ${formatBahtValue(cashThb)}`) : tr('No cash to withdraw', 'ไม่มีเงินสดให้ถอน')}
        </button>
      </KSheet>

      <SettingsPage
        open={page === 'settings'}
        onBack={() => setPage(null)}
        onPrivacy={() => setPage('privacy')}
        onDelete={() => window.dispatchEvent(new CustomEvent('chon:open-delete-account'))}
        onAgency={isAgency ? () => setPage('agencyTools') : undefined}
      />
      <PrivacyPage
        open={page === 'privacy'}
        onBack={() => {
          const home = privacyFromHome.current
          privacyFromHome.current = false
          setPage(home ? null : 'settings')
        }}
        language={language}
      />
      <VisitorsPage open={page === 'visitors'} onBack={() => setPage(null)} />
      <InvitePage open={page === 'invite'} onBack={() => setPage(null)} friendPaidCoins={friendPaidCoins} config={config} />
      <AgencyPage open={page === 'agency'} onBack={() => setPage(null)} activeHosts={activeHosts} config={config} />
      <CashOutSheet
        open={cashout}
        onClose={() => setCashout(false)}
        amountThb={host.readyThb}
        points={host.points}
        feeThb={host.feeThb}
        canCashOut={host.canCashOut}
        blockedReason={host.blockedReason}
        onConfirm={confirmCashout}
      />
    </div>
  )
}
