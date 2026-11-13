import { useEffect, useState, type CSSProperties } from 'react'
import { Sheet } from '../ui/Sheet'
import { ShieldCheck } from '../ui/LivingIcons'
import { useOptionalAuth } from '../../context/AuthContext'
import { usePresence } from '../../context/presence'
import { EXPERIENCES } from '../../lib/experiences'
import BlockedListPanel from '../ui/BlockedListPanel'
import GuestPrivacyVault from '../guest/GuestPrivacyVault'
import { triggerHaptic, isHapticsEnabled, setHapticsEnabled, isReducedMotionEnabled, setReducedMotionEnabled } from '../../lib/haptics'
import { playSfx, setSfxEnabled, sfxEnabled } from '../../lib/sfx'
import { useSafety } from '../../lib/safetyStore'
import { useLanguage } from '../../i18n/LanguageContext'
import { LANGUAGE_OPTIONS } from '../../i18n/translations'
import ShareChips from '../ui/ShareChips'
import { DEFAULT_PLATFORM_CONFIG, type PlatformConfig } from '../../lib/configDefaults'
import { copyText, handleFromName, island, lastKnownBalance, openSafety, thb, useFirstName, useIsHostRole, useStoredState, useTr, WPage, WRow, WSwitch } from './walletKit'
import '../../styles/wallet.css'

/**
 * Atlas D8 · D10 · D11 · D12 · D16 · D17 — the wallet's sub-pages. Each is mounted only while open.
 * Display + preferences only: no ledger, escrow, coin or cash-out maths lives here.
 */

/* ---------------- Privacy (D11) ---------------- */
export const PRIVACY_KEY = 'chon_privacy_v1'
export interface PrivacyPrefs {
  hideCountry: boolean
  blurPhotos: boolean
  invisibleVisitor: boolean
  anonymousGifter: boolean
}
export const PRIVACY_DEFAULTS: PrivacyPrefs = { hideCountry: false, blurPhotos: false, invisibleVisitor: false, anonymousGifter: false }

export function usePrivacyPrefs() {
  const [prefs, setPrefs] = useStoredState<PrivacyPrefs>(PRIVACY_KEY, PRIVACY_DEFAULTS)
  useEffect(() => {
    // keep two open pages (Privacy + Visitors) in step: the invisible-visitor switch is ONE setting
    const on = () => {
      try {
        const raw = window.localStorage.getItem(PRIVACY_KEY)
        if (raw) setPrefs(JSON.parse(raw) as Partial<PrivacyPrefs>)
      } catch {
        // ignore
      }
    }
    window.addEventListener('chon:privacy-change', on)
    return () => window.removeEventListener('chon:privacy-change', on)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const set = (patch: Partial<PrivacyPrefs>) => {
    setPrefs(patch)
    window.setTimeout(() => window.dispatchEvent(new CustomEvent('chon:privacy-change')), 0)
  }
  return [prefs, set] as const
}

export function PrivacyPage({ open, onBack, language = 'en' }: { open: boolean; onBack: () => void; language?: string }) {
  const [prefs, set] = usePrivacyPrefs()
  const s = useSafety()
  const [vault, setVault] = useState(false)
  const [preblock, setPreblock] = useState(false)
  const blocked = s.blockedHostIds.length + s.preBlocked.length
  const tr = useTr()
  const isHost = useIsHostRole()
  const rows: Array<{ k: keyof PrivacyPrefs; title: string; sub: string; icon: string }> = [
    { k: 'hideCountry', title: tr('Hide my country', 'ซ่อนประเทศของฉัน'), sub: tr('Your flag stays off your profile', 'ไม่โชว์ธงชาติบนโปรไฟล์'), icon: '🌏' },
    {
      k: 'blurPhotos',
      title: tr('Blur my photos until we’ve chatted', 'เบลอรูปจนกว่าจะได้คุยกัน'),
      sub: tr('Clear after the first message', 'รูปชัดหลังข้อความแรก'),
      icon: '🫥',
    },
    isHost
      ? { k: 'anonymousGifter', title: tr('Hide my earnings board', 'ซ่อนอันดับรายได้'), sub: tr('Your name stays off the weekly ranks', 'ไม่โชว์ชื่อในอันดับรายสัปดาห์'), icon: '🏅' }
      : { k: 'anonymousGifter', title: tr('Anonymous gifter', 'ส่งของขวัญแบบไม่บอกชื่อ'), sub: tr('Gifts show “someone”, not your name', 'ของขวัญขึ้นว่า “ใครบางคน” แทนชื่อคุณ'), icon: '🎁' },
  ]
  return (
    <>
      <WPage open={open && !vault} onBack={onBack} title={tr('Privacy', 'ความเป็นส่วนตัว')} guide="safety" testId="privacy-page" tone="violet">
        <div className="wl-stack">
          <p className="wl-grp">{tr('What others see', 'สิ่งที่คนอื่นเห็น')}</p>
          <div className="wl-list">
            {rows.map((r) => (
              <div className="wl-row" key={r.k}>
                <span className="wl-row-ic" aria-hidden="true">{r.icon}</span>
                <span className="wl-row-t">
                  <b>{r.title}</b>
                  <small>{r.sub}</small>
                </span>
                <WSwitch on={prefs[r.k]} onChange={(v) => set({ [r.k]: v } as Partial<PrivacyPrefs>)} label={r.title} testId={`privacy-switch-${r.k}`} />
              </div>
            ))}
          </div>

          <p className="wl-grp">{tr('Pre-block', 'บล็อกล่วงหน้า')}</p>
          <div className="wl-list">
            <WRow
              icon="📱"
              title={tr('Phone contacts & LINE IDs', 'เบอร์ในเครื่องและ LINE ID')}
              sub={tr('they’ll never see you', 'คนพวกนี้จะไม่เห็นคุณเลย')}
              right={<span className="wl-count">{s.preBlocked.length}</span>}
              onClick={() => setPreblock((v) => !v)}
              chevron
            />
          </div>
          {preblock ? <BlockedListPanel language={language} variant="preblock" /> : null}

          {/* ROUND5 · Ploy: the PIN lock is its own thing, not a kind of pre-block */}
          <p className="wl-grp">{tr('Chat lock', 'ล็อกแชท')}</p>
          <div className="wl-list">
            <WRow
              icon="🔐"
              title={tr('Lock chats with a PIN', 'ล็อกแชทด้วย PIN')}
              sub={tr('Only you can open them', 'เปิดอ่านได้เฉพาะคุณ')}
              right={<span className="wl-dim">{tr('Set up', 'ตั้งค่า')}</span>}
              onClick={() => setVault(true)}
              chevron
            />
          </div>

          <p className="wl-grp">
            {tr('Blocked', 'บล็อกแล้ว')} · {blocked}
          </p>
          <BlockedListPanel language={language} variant="list" />
        </div>
      </WPage>
      <WPage open={open && vault} onBack={() => setVault(false)} title={tr('Chat lock', 'ล็อกแชท')} testId="privacy-vault-page" tone="violet">
        <div className="wl-stack wl-vault">
          <GuestPrivacyVault
            retained={{
              vipLevel: 'Kring member',
              faceVerified: false,
              coinBalance: (lastKnownBalance()?.paidCoins ?? 0) + (lastKnownBalance()?.bonusCoins ?? 0),
            }}
            onRequestDelete={() => window.dispatchEvent(new CustomEvent('chon:open-delete-account'))}
          />
        </div>
      </WPage>
    </>
  )
}

/* ---------------- Settings (D10) ---------------- */
export function SettingsPage({
  open,
  onBack,
  onPrivacy,
  onDelete,
  onAgency,
}: {
  open: boolean
  onBack: () => void
  onPrivacy: () => void
  onDelete: () => void
  /** T3 · only for accounts that already have the agency role: opens the agency tools (no mode switch) */
  onAgency?: () => void
}) {
  const { language, setLanguage } = useLanguage()
  const [sfx, setSfx] = useState(() => sfxEnabled())
  const [haptics, setHaptics] = useState(() => isHapticsEnabled())
  const [reduce, setReduce] = useState(() => isReducedMotionEnabled())
  const [notif, setNotif] = useState<string>(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'))
  const [feedback, setFeedback] = useState('')
  const name = useFirstName('')
  const tr = useTr()
  const isHost = useIsHostRole()
  return (
    <WPage open={open} onBack={onBack} title={tr('Settings', 'ตั้งค่า')} testId="wallet-settings-page">
      <div className="wl-stack">
        <p className="wl-grp">{tr('App', 'แอป')}</p>
        <div className="wl-list">
          <div className="wl-row is-lang-row">
            <span className="wl-row-ic" aria-hidden="true">🌐</span>
            <span className="wl-row-t">
              <b>{tr('Language', 'ภาษา')}</b>
            </span>
            <div className="wl-seg is-sm is-lang" role="group" aria-label="App language">
              {LANGUAGE_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  lang={opt.htmlLang}
                  data-testid={`wallet-settings-lang-${opt.code}`}
                  aria-pressed={language === opt.code}
                  onClick={() => setLanguage(opt.code)}
                >
                  {opt.nativeName ?? opt.label}
                </button>
              ))}
            </div>
          </div>
          <div className="wl-row">
            <span className="wl-row-ic" aria-hidden="true">🔊</span>
            <span className="wl-row-t">
              <b>{tr('Sounds', 'เสียง')}</b>
            </span>
            <WSwitch
              on={sfx}
              label="Sounds"
              testId="settings-sounds-switch"
              onChange={(v) => {
                setSfx(v)
                setSfxEnabled(v)
                if (v) playSfx('clink')
              }}
            />
          </div>
          <div className="wl-row">
            <span className="wl-row-ic" aria-hidden="true">📳</span>
            <span className="wl-row-t">
              <b>{tr('Haptics', 'การสั่น')}</b>
            </span>
            <WSwitch
              on={haptics}
              label="Haptics"
              testId="settings-haptics-switch"
              onChange={(v) => {
                setHaptics(v)
                setHapticsEnabled(v)
              }}
            />
          </div>
          <div className="wl-row">
            <span className="wl-row-ic" aria-hidden="true">🌀</span>
            <span className="wl-row-t">
              <b>{tr('Reduce motion', 'ลดการเคลื่อนไหว')}</b>
              <small>{tr('Stops tilt, flips and rolling numbers', 'ปิดการเอียง การพลิก และตัวเลขหมุน')}</small>
            </span>
            <WSwitch
              on={reduce}
              label="Reduce motion"
              testId="settings-reduce-motion-switch"
              onChange={(v) => {
                setReduce(v)
                setReducedMotionEnabled(v)
              }}
            />
          </div>
          <WRow
            icon="🔔"
            title={tr('Notifications', 'การแจ้งเตือน')}
            sub={
              notif === 'granted'
                ? isHost
                  ? tr('On · requests, messages', 'เปิดอยู่ · คำขอ · ข้อความ')
                  : tr('On · messages, plans', 'เปิดอยู่ · ข้อความ · แผนนัด')
                : notif === 'denied'
                  ? tr('Off — change it in your phone settings', 'ปิดอยู่ · เปิดได้ในตั้งค่าของมือถือ')
                  : isHost
                    ? tr('Requests · messages', 'คำขอ · ข้อความ')
                    : tr('Messages · plans', 'ข้อความ · แผนนัด')
            }
            onClick={() => {
              if (typeof Notification === 'undefined') {
                island(tr('This browser can’t send notifications', 'เบราว์เซอร์นี้ส่งแจ้งเตือนไม่ได้'), 'neutral')
                return
              }
              void Notification.requestPermission().then((p) => setNotif(p))
            }}
            chevron
          />
        </div>

        <p className="wl-grp">{tr('Account', 'บัญชี')}</p>
        <div className="wl-list">
          <WRow icon="🛡️" title={tr('Privacy', 'ความเป็นส่วนตัว')} onClick={onPrivacy} chevron testId="settings-privacy-row" />
          {onAgency ? (
            <WRow
              icon="🏢"
              title={tr('Kring Partners', 'พาร์ทเนอร์กริ๊ง')}
              sub={tr('Partner hosts · totals only', 'โลคอลพาร์ทเนอร์ · ดูแค่ยอดรวม')}
              onClick={onAgency}
              chevron
              testId="settings-agency-row"
            />
          ) : null}
          <WRow
            icon="🔄"
            title={tr('Switch account', 'สลับบัญชี')}
            sub={name || undefined}
            onClick={() => window.dispatchEvent(new CustomEvent('chon:open-login-sheet'))}
            chevron
          />
          <WRow icon="↩" title={tr('Log out', 'ออกจากระบบ')} onClick={() => window.dispatchEvent(new CustomEvent('chon:sign-out'))} />
        </div>

        <p className="wl-grp">{tr('Tell us anything', 'บอกเราได้ทุกเรื่อง')}</p>
        <div className="wl-box">
          <textarea
            className="wl-input wl-ta"
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={tr('The map pin was off by one soi…', 'หมุดในแผนที่เพี้ยนไปหนึ่งซอย…')}
            aria-label="Feedback"
          />
          <button
            type="button"
            className="ux-btn ux-btn-quiet wl-cta m-press"
            disabled={!feedback.trim()}
            onClick={() => {
              triggerHaptic('success')
              setFeedback('')
              island(tr('Thanks — the team reads every note', 'ขอบคุณนะ ทีมอ่านทุกข้อความ'), 'green', '✓')
            }}
          >
            {tr('Send feedback', 'ส่งความเห็น')}
          </button>
        </div>

        <div className="wl-list">
          <WRow
            icon="📄"
            title={tr('Privacy policy · PDPA', 'นโยบายความเป็นส่วนตัว · PDPA')}
            onClick={() => window.open('/privacy.html', '_blank', 'noopener,noreferrer')}
            chevron
            testId="settings-privacy-policy-row"
          />
          <WRow
            icon="⚖️"
            title={tr('Safety & 20+ policy', 'มาตรฐานความปลอดภัย 20+')}
            onClick={() => window.open('/safety.html', '_blank', 'noopener,noreferrer')}
            chevron
            testId="settings-safety-policy-row"
          />
          <WRow icon="🗑" title={tr('Delete account', 'ลบบัญชี')} danger onClick={onDelete} chevron testId="settings-delete-row" />
        </div>
      </div>
    </WPage>
  )
}

/* ---------------- Delete account (D16) ---------------- */
export function DeleteAccountSheet({ open, onClose, balanceThb }: { open: boolean; onClose: () => void; balanceThb: number }) {
  const [agree, setAgree] = useState(false)
  const [typed, setTyped] = useState('')
  useEffect(() => {
    if (open) {
      setAgree(false)
      setTyped('')
    }
  }, [open])
  const ok = agree && typed.trim().toUpperCase() === 'DELETE'
  const tr = useTr()
  return (
    <Sheet open={open} onClose={onClose} testId="delete-account-sheet" title={tr('Delete your account?', 'ลบบัญชีใช่ไหม?')} initialDetent="92%" detents={['92%']} className="wl-sheet">
      <div className="wl-stack">
        <p className="wl-s">
          {tr(
            'You have 30 days to change your mind — just log in. After that your photos, chats and stories are erased under Thailand’s PDPA.',
            'เปลี่ยนใจได้ภายใน 30 วัน แค่ล็อกอินกลับมา หลังจากนั้นรูป แชท และสตอรี่จะถูกลบตาม PDPA',
          )}
        </p>
        <div className="wl-list">
          <WRow icon="฿" title={tr('Wallet balance', 'ยอดในกระเป๋า')} sub={tr('refunded first', 'คืนให้ก่อน')} right={<b className="wl-strong">{thb(balanceThb)}</b>} />
          <WRow icon="§" title={tr('Kept by law', 'เก็บไว้ตามกฎหมาย')} sub={tr('payment records, 5 years', 'ประวัติการจ่ายเงิน 5 ปี')} />
        </div>
        <label className="wl-check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>{tr('I understand this can’t be undone after 30 days', 'เข้าใจแล้วว่าเลย 30 วันจะย้อนกลับไม่ได้')}</span>
        </label>
        <input
          className="wl-input"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={tr('Type DELETE to confirm', 'พิมพ์ DELETE เพื่อยืนยัน')}
          aria-label="Type DELETE to confirm"
          autoComplete="off"
          autoCapitalize="characters"
        />
        <button
          type="button"
          className="ux-btn wl-cta wl-red m-press"
          disabled={!ok}
          data-testid="delete-account-confirm-btn"
          onClick={() => {
            triggerHaptic('warning')
            try {
              window.localStorage.setItem('chon_delete_requested_at', new Date().toISOString())
            } catch {
              // ignore
            }
            island(tr('Deletion scheduled — log in within 30 days to cancel', 'ตั้งเวลาลบแล้ว · ล็อกอินภายใน 30 วันเพื่อยกเลิก'), 'red', '🗑')
            onClose()
            window.setTimeout(() => window.dispatchEvent(new CustomEvent('chon:sign-out')), 900)
          }}
        >
          {tr('Delete account', 'ลบบัญชี')}
        </button>
        <button type="button" className="ux-btn ux-btn-quiet wl-cta m-press" onClick={onClose}>
          {tr('Keep my account', 'เก็บบัญชีไว้')}
        </button>
      </div>
    </Sheet>
  )
}

/* ---------------- Profile views (D12 → KRING FIX1) ---------------- */
/**
 * Ploy 8: no list of people who looked at you and no "invisible visitor" mode — that is a dating-app pattern.
 * A Local sees how her EXPERIENCES are doing: views this week, which experience, and anonymous recent views
 * ("Couple · 🇯🇵 · Yaowarat street-food walk"). No names, no faces, nothing to message. Demo data only in demo.
 */
const VIEW_EXAMPLE = [
  { who: ['Solo traveller', 'นักเที่ยวคนเดียว'], flag: '🇯🇵', exp: ['Yaowarat street-food walk', 'เดินกินเยาวราช'], when: ['8 min ago', '8 นาทีก่อน'] },
  { who: ['Couple', 'คู่รัก'], flag: '🇩🇪', exp: ['Flower market at dawn', 'ตลาดดอกไม้ยามเช้า'], when: ['40 min ago', '40 นาทีก่อน'] },
  { who: ['Family of 4', 'ครอบครัว 4 คน'], flag: '🇦🇺', exp: ['Thai cooking class', 'คลาสทำอาหารไทย'], when: ['2 h', '2 ชม.'] },
  { who: ['Solo traveller', 'นักเที่ยวคนเดียว'], flag: '🇰🇷', exp: ['Temple & café morning', 'ไหว้พระ คาเฟ่ยามเช้า'], when: ['today', 'วันนี้'] },
  { who: ['Group of 3 friends', 'เพื่อน 3 คน'], flag: '🇮🇳', exp: ['Yaowarat street-food walk', 'เดินกินเยาวราช'], when: ['yesterday', 'เมื่อวาน'] },
] as const
const VIEW_DAYS = [9, 14, 11, 18, 22, 31, 23]

export function VisitorsPage({ open, onBack }: { open: boolean; onBack: () => void }) {
  const tr = useTr()
  const isDemo = Boolean(useOptionalAuth()?.session?.isDemoMode)
  // KRING FIX2 · Ploy 8/35: her real views (0 until a view backend exists) by default — never 128 on day one. Demo can
  // flip to a labelled example, and the example only names experiences SHE lists (none listed → a generic one).
  const [exampleOn, setExample] = useState(false)
  const example = isDemo && exampleOn
  const presence = usePresence()
  const mine = (presence.experiences ?? []).map((x) => EXPERIENCES.find((e) => e.id === x.id)).filter((e): e is NonNullable<typeof e> => Boolean(e))
  const days = example ? VIEW_DAYS : VIEW_DAYS.map(() => 0)
  const total = days.reduce((a, n) => a + n, 0)
  const max = Math.max(1, ...days)
  const list = example
    ? VIEW_EXAMPLE.map((v, i) => {
        const e = mine.length ? mine[i % mine.length] : null
        return { ...v, exp: e ? ([e.title, e.titleTh] as const) : (['Your experience', 'ทริปของคุณ'] as const) }
      })
    : []
  return (
    <WPage open={open} onBack={onBack} title={tr('Profile views', 'ยอดเข้าชม')} testId="visitors-page" tone="violet">
      <div className="wl-stack">
        {isDemo ? (
          <div className="kw-seg is-2" role="tablist" aria-label={tr('Which views', 'ดูข้อมูลไหน')} style={{ '--i': example ? 1 : 0 } as CSSProperties} data-testid="views-example-toggle">
            <i className="kw-seg-ind" aria-hidden="true" />
            <button type="button" role="tab" aria-selected={!example} onClick={() => setExample(false)}>
              {tr('Mine', 'ของฉัน')}
            </button>
            <button type="button" role="tab" aria-selected={example} onClick={() => setExample(true)} data-testid="views-example">
              {tr('Example', 'ตัวอย่าง')}
            </button>
          </div>
        ) : null}
        <div className="wl-headline">
          <p className="wl-big" data-testid="views-total">
            {example ? <span className="wl-ex">{tr('example', 'ตัวอย่าง')}</span> : null} {tr(`${total} ${total === 1 ? 'view' : 'views'} this week`, `สัปดาห์นี้มีคนดู ${total} ครั้ง`)}
          </p>
        </div>
        <div className="wl-viewbars" aria-hidden="true">
          {days.map((n, i) => (
            <i key={i} style={{ height: `${Math.max(6, Math.round((n / max) * 100))}%` }} />
          ))}
        </div>
        <p className="wl-s">
          {tr(
            'Travellers looking at your experiences. Names are never shown — and nobody sees who you looked at either.',
            'จำนวนคนที่ดูทริปของคุณ ไม่แสดงชื่อใคร และไม่มีใครเห็นว่าคุณดูใครเช่นกัน',
          )}
        </p>
        <p className="wl-grp">{tr('Recent views', 'ดูล่าสุด')}</p>
        {list.length === 0 ? (
          <p className="wl-s">{tr('No views yet — go Live and share your link.', 'ยังไม่มีคนดู ออนไลน์แล้วแชร์ลิงก์ของคุณได้เลย')}</p>
        ) : (
          <div className="wl-list">
            {list.map((v, i) => (
              <WRow key={i} icon={<span aria-hidden="true">{v.flag}</span>} title={tr(v.exp[0], v.exp[1])} sub={`${tr(v.who[0], v.who[1])} · ${tr(v.when[0], v.when[1])}`} />
            ))}
          </div>
        )}
        {example ? <p className="wl-ex">{tr('example data · not your views', 'ข้อมูลตัวอย่าง · ไม่ใช่ยอดของคุณ')}</p> : null}
      </div>
    </WPage>
  )
}

/* ---------------- Invite friends (D8) ---------------- */
/**
 * KRING FIX1 · Ploy 9 — the invite reads like a friend's tip, not a top-up scheme: your real link (kring.app/@ploy),
 * a reward that follows a COMPLETED EXPERIENCE (never a friend's top-up), and each milestone's own ฿ (no "฿555" pitch).
 * The amounts and unlock rule are unchanged (config.referral_steps · friend's paid bookings); only the words changed.
 */
export function InvitePage({
  open,
  onBack,
  friendPaidCoins,
  config = DEFAULT_PLATFORM_CONFIG,
}: {
  open: boolean
  onBack: () => void
  friendPaidCoins: number
  config?: PlatformConfig
}) {
  const name = useFirstName('')
  // a Thai name keeps a readable Latin handle from the account (ploy.host → @ploy) when there is one
  const sessionName = useOptionalAuth()?.session?.displayName ?? ''
  const fromSession = /^(demo\b|traveller|traveler|guest)/i.test(sessionName) ? '' : (sessionName.split(/[\s._\d@]/).find(Boolean) ?? '')
  const latin = /[a-z]/i.test(name) ? name : fromSession
  const link = `kringapp.com/@${handleFromName(/[a-z]/i.test(latin) ? latin : name || 'you')}`
  const isHost = useIsHostRole()
  const steps = config.referral_steps
  const ticks = steps.map((s) => ({ reward: s.reward_thb, done: friendPaidCoins >= s.required_paid_coins }))
  const earned = ticks.filter((t) => t.done).reduce((m, t) => m + t.reward, 0)
  const doneN = ticks.filter((t) => t.done).length
  const pct = Math.round((doneN / Math.max(1, ticks.length)) * 100)
  const first = ticks[0]?.reward ?? 0
  const tr = useTr()
  const { language } = useLanguage()
  const msg = isHost
    ? tr(
        `${name ? `${name} invites you to ` : ''}host experiences on Kring — street-food walks, markets and temples in public places, paid to PromptPay ✦ https://${link}`,
        `${name ? `${name} ชวนคุณ` : 'มา'}พาเที่ยวกับกริ๊ง — ทริปเดินกิน ตลาด วัด ในที่สาธารณะ ได้เงินเข้าพร้อมเพย์ ✦ https://${link}`,
      )
    : tr(
        `${name ? `${name} invites you to ` : ''}explore Bangkok with real locals on Kring · fair prices ✦ https://${link}`,
        `${name ? `${name} ชวนคุณ` : 'มา'}เที่ยวกับโลคอลตัวจริงในกริ๊ง · ราคาแฟร์ในกรุงเทพฯ ✦ https://${link}`,
      )
  const milestone = (i: number) =>
    i === 0 ? tr('1st experience', 'ทริปแรก') : i === 1 ? tr('2nd booking', 'จองครั้งที่ 2') : i === 2 ? tr('3rd booking', 'จองครั้งที่ 3') : tr('regular', 'ขาประจำ')
  return (
    <WPage open={open} onBack={onBack} title={tr('Invite friends', 'ชวนเพื่อน')} guide="rewards" testId="invite-page">
      <div className="wl-stack">
        <p className="wl-hero">
          {isHost
            ? tr('Invite a friend who hosts', 'ชวนเพื่อนที่อยากพาเที่ยว')
            : tr('Invite a friend to explore with a local', 'ชวนเพื่อนมาเที่ยวกับโลคอล')}
        </p>
        <p className="wl-s">
          {tr(
            `After their first completed experience you get ${thb(first)}, then a little more at each booking after. They pay nothing extra.`,
            `เพื่อนจบทริปแรกเมื่อไหร่ คุณได้ ${thb(first)} และได้เพิ่มทุกครั้งที่เพื่อนจองต่อ เพื่อนไม่ต้องจ่ายเพิ่ม`,
          )}
        </p>
        <ol className="wl-steps">
          <li>
            <i>1</i>
            {tr('Share your link', 'ส่งลิงก์ของคุณ')}
          </li>
          <li>
            <i>2</i>
            {isHost ? tr('They go Live and run their first experience', 'เพื่อนออนไลน์และพาเที่ยวทริปแรก') : tr('They book and complete their first experience', 'เพื่อนจองและเที่ยวทริปแรกจบ')}
          </li>
          <li>
            <i>3</i>
            {tr('Your reward lands in Wallet', 'รางวัลเข้ากระเป๋าคุณ')}
          </li>
        </ol>
        <div className="wl-copy" data-testid="invite-link">
          <span>{link}</span>
          <button
            type="button"
            className="wl-mini-btn m-press"
            onClick={async () => {
              const ok = await copyText(`https://${link}`)
              island(ok ? tr('Link copied', 'คัดลอกลิงก์แล้ว') : link, 'green', ok ? '✓' : undefined)
            }}
          >
            {tr('Copy', 'คัดลอก')}
          </button>
        </div>
        {/* KRING FIX3 · founder: LINE · WeChat · 小红书 (plain chips, F4's shared helper; native share first when there is one) */}
        <ShareChips text={msg.replace(/\s*https:\/\/\S+$/, '')} url={link} lang={language} testIdPrefix="invite-share" />
        <div className="wl-box">
          <div className="wl-row-flat">
            <b>{earned > 0 ? tr('Your friends are booking', 'เพื่อนของคุณเริ่มจองแล้ว') : tr('No friends joined yet', 'ยังไม่มีเพื่อนสมัคร')}</b>
            <span className="wl-g">
              {thb(earned)} {tr('earned', 'ได้แล้ว')}
            </span>
          </div>
          <div className="wl-bar" aria-hidden="true">
            <i style={{ width: `${pct}%` }} />
          </div>
          <div className="wl-ms">
            {ticks.map((t, i) => (
              <span key={i} className={t.done ? 'is-on' : ''}>
                +{thb(t.reward)} <small>{milestone(i)}</small>
              </span>
            ))}
          </div>
        </div>
      </div>
    </WPage>
  )
}

/* ---------------- Agency hub detail (D17) ---------------- */
const ROSTER_EXAMPLE = [
  { name: 'Ploy', state: 'Live today', stateTh: 'ออนไลน์อยู่วันนี้', thb: 492, tint: 'p1' },
  { name: 'Fah', state: '2 days ago', stateTh: '2 วันก่อน', thb: 366, tint: 'p3' },
  { name: 'Nam', state: 'checking story', stateTh: 'กำลังตรวจสตอรี่', thb: 0, tint: 'p2' },
] as const

export function agencyTierInfo(activeHosts: number, config: PlatformConfig = DEFAULT_PLATFORM_CONFIG) {
  const v43 = config.kring_v43_agency_tiers?.tiers ?? [
    { id: 'bronze' as const, label: 'Partner', labelTh: 'พาร์ทเนอร์', min_active_locals: 1, min_rolling_30d_thb: 0, gross_override_pct: 4, net_fee_share_pct: 20 },
    { id: 'silver' as const, label: 'Verified Partner', labelTh: 'พาร์ทเนอร์ยืนยัน', min_active_locals: 5, min_rolling_30d_thb: 50_000, gross_override_pct: 4, net_fee_share_pct: 20 },
    { id: 'gold' as const, label: 'Gold Partner', labelTh: 'พาร์ทเนอร์โกลด์', min_active_locals: 15, min_rolling_30d_thb: 150_000, gross_override_pct: 4, net_fee_share_pct: 20 },
    { id: 'royal_crown' as const, label: 'Premier Partner', labelTh: 'พาร์ทเนอร์พรีเมียร์', min_active_locals: 30, min_rolling_30d_thb: 400_000, gross_override_pct: 5, net_fee_share_pct: 25 },
  ]
  const ladder = v43.map((t) => ({
    id: t.id,
    label: t.label,
    labelTh: t.labelTh,
    pct: t.gross_override_pct,
    netFeeSharePct: t.net_fee_share_pct,
    min: t.min_active_locals,
    minVolThb: t.min_rolling_30d_thb,
    bahtPerBooking: config.kring_partners?.typical_payout_per_booking_thb ?? 29,
  }))
  const matched = [...ladder].reverse().find((l) => activeHosts >= l.min)
  const current = matched ? matched.pct : 4
  const next = ladder.find((l) => activeHosts < l.min)
  return { ladder, current, next, matched }
}

export function AgencyPage({
  open,
  onBack,
  activeHosts,
  config = DEFAULT_PLATFORM_CONFIG,
}: {
  open: boolean
  onBack: () => void
  activeHosts: number
  config?: PlatformConfig
}) {
  const name = useFirstName('team')
  const handle = handleFromName(name)
  const [lang, setLang] = useState<'th' | 'en' | 'bio'>('th')
  const { ladder, current } = agencyTierInfo(activeHosts, config)
  const partnerCfg = config.kring_partners
  const typicalBaht = partnerCfg?.typical_payout_per_booking_thb ?? 29
  const months = partnerCfg?.months ?? 6
  const activationThb = partnerCfg?.activation_thb ?? 150
  const activationBookings = partnerCfg?.activation_bookings ?? 3
  const tr = useTr()
  const scripts = {
    th: `พาเที่ยวแบบโลคอลตัวจริงกับกริ๊ง ได้เงินเข้าพร้อมเพย์ สมัครผ่านพาร์ทเนอร์เรา 👉 kringapp.com/a/${handle}`,
    en: `Show travellers your Bangkok — food walks, temples, markets. Get paid to PromptPay. Join via our Kring Partner link 👉 kringapp.com/a/${handle}`,
    bio: `✦ Kring Partner · public venues only · PromptPay payouts · kringapp.com/a/${handle}`,
  }
  return (
    <WPage open={open} onBack={onBack} title={tr('Kring Partners', 'พาร์ทเนอร์กริ๊ง')} guide="host" testId="agency-page" tone="violet">
      <div className="wl-stack">
        <p className="wl-big">{tr(`Your Locals earn, Kring pays you ≈฿${typicalBaht} per booking (${months} mo)`, `โลคอลมีรายได้ กริ๊งจ่ายเพิ่มให้คุณ ≈฿${typicalBaht} ต่อการจอง (${months} เดือน)`)}</p>
        <div className="wl-tiers">
          {ladder.map((l) => (
            <span key={l.id} className={current === l.pct ? 'is-on' : ''}>
              <b>≈฿{l.bahtPerBooking}</b>
              {tr(`${l.label} · ${l.min}+ Locals`, `${l.labelTh} · ${l.min}+ โลคอล`)}
              {current === l.pct ? tr(' · you', ' · คุณ') : ''}
            </span>
          ))}
        </div>
        <p className="wl-s">
          {tr(
            `Paid from Kring’s fee for each host’s first ${months} months (+฿${activationThb} after ${activationBookings} bookings). Registered businesses & groups only · hosts leave free any time.`,
            `จ่ายจากค่าธรรมเนียมของ Kring ในช่วง ${months} เดือนแรก (+฿${activationThb} เมื่อครบ ${activationBookings} ทริป) เฉพาะธุรกิจและกลุ่มที่จดทะเบียน · โลคอลออกได้ฟรีตลอดเวลา`,
          )}
        </p>

        <p className="wl-grp">
          {tr('Partner hosts', 'โลคอลพาร์ทเนอร์')} <span className="wl-ex">{tr('example', 'ตัวอย่าง')}</span>
        </p>
        <div className="wl-list">
          {ROSTER_EXAMPLE.map((r) => (
            <WRow
              key={r.name}
              icon={<span className={`wl-av is-${r.tint}`}>{r.name.slice(0, 1)}</span>}
              title={r.name}
              sub={tr(r.state, r.stateTh)}
              right={
                r.thb > 0 ? (
                  <span className="wl-strong">
                    {thb(r.thb)} <span className="wl-ex">{tr('example', 'ตัวอย่าง')}</span>
                  </span>
                ) : (
                  <span className="wl-tag is-gold">{tr('new', 'ใหม่')}</span>
                )
              }
            />
          ))}
        </div>
        <p className="wl-s">{tr('You see totals only — bookings are private between guest and Local.', 'คุณเห็นแค่ยอดรวม การจองเป็นความลับระหว่างแขกกับโลคอล')}</p>

        <p className="wl-grp">{tr('Recruit scripts', 'สคริปต์ชวนโลคอล')}</p>
        <div className="wl-box">
          <div className="wl-seg is-sm" role="group" aria-label="Script language">
            <button type="button" aria-pressed={lang === 'th'} onClick={() => setLang('th')}>
              ไทย
            </button>
            <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>
              EN
            </button>
            <button type="button" aria-pressed={lang === 'bio'} onClick={() => setLang('bio')}>
              LINE bio
            </button>
          </div>
          <p className="wl-quote" lang={lang === 'th' ? 'th' : undefined}>
            “{scripts[lang]}”
          </p>
          <button
            type="button"
            className="ux-btn ux-btn-quiet wl-cta m-press"
            onClick={async () => {
              const ok = await copyText(scripts[lang])
              island(ok ? tr('Script copied', 'คัดลอกสคริปต์แล้ว') : tr('Press and hold the text to copy', 'กดค้างที่ข้อความเพื่อคัดลอก'), ok ? 'green' : 'neutral', ok ? '✓' : undefined)
            }}
          >
            {tr('Copy script', 'คัดลอกสคริปต์')}
          </button>
        </div>
      </div>
    </WPage>
  )
}

/* ---------------- Verify chip (used by Safety/Wallet) ---------------- */
export function VerifiedNote({ text }: { text: string }) {
  return (
    <div className="wl-note">
      <ShieldCheck checked size={18} />
      <p className="wl-s">{text}</p>
    </div>
  )
}

export function openReport(hostName?: string, hostId?: string) {
  openSafety({ section: 'report', hostName, hostId })
}
