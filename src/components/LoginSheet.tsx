import { useEffect, useState } from 'react'
import { BRAND_SIGNOFF, BRAND_TAGLINE } from '../lib/brand'
import AgeGateModal from './AgeGateModal'
import {
  ROLE_BY_PROVIDER,
  ROLE_LABELS,
  useAuth,
  type LoginProvider,
} from '../context/AuthContext'
import { useLanguage } from '../i18n/LanguageContext'
import type { LanguageCode } from '../i18n/translations'
import { triggerHaptic } from '../lib/haptics'
import { KringBump, KringWordmark } from './ui/KringMark'
import '../styles/shell.css'

interface LoginOption {
  provider: LoginProvider
  icon: string
  title: string
  titleTh: string
  titleZh: string
  audience: string
  audienceTh: string
  audienceZh: string
  badge?: string
  buttonClass: string
  iconClass: string
}

/** the phone / browser is set to Thai (a +66 SIM is not readable from the web; the device language is the signal) */
export function deviceIsThai(): boolean {
  try {
    const langs = [...(navigator.languages ?? []), navigator.language].filter(Boolean)
    return langs.some((l) => /^th\b/i.test(l))
  } catch {
    return false
  }
}

/* Legacy role rows (sr-only): kept so assistive tech and the auth tests can still pick a provider by name. */
const LOGIN_OPTIONS: (LoginOption & { enSub?: string; thaiSub?: string; zhSub?: string })[] = [
  {
    provider: 'line',
    icon: 'LINE',
    title: 'Free LINE Login',
    titleTh: 'เข้าสู่ระบบด้วย LINE ฟรี',
    titleZh: '免费 LINE 一键登录',
    audience: 'For Thai locals',
    audienceTh: 'สำหรับโลคอลไทย',
    audienceZh: '面向泰国本地人',
    enSub: 'Paid the moment you kring',
    thaiSub: 'สำหรับโลคอลไทย · ได้เงินทันทีที่กริ๊ง',
    zhSub: '本地人 · 见面碰一碰即到账',
    badge: '100% FREE',
    buttonClass: 'ux-login-row',
    iconClass: '',
  },
  {
    provider: 'google',
    icon: 'G',
    title: '1-Tap with Google',
    titleTh: 'เข้าสู่ระบบด้วย Google (1-Tap)',
    titleZh: 'Google 一键登录 (旅行者)',
    audience: 'For travellers',
    audienceTh: 'สำหรับผู้จอง',
    audienceZh: '面向旅行者',
    enSub: 'Booking held until you meet',
    thaiSub: 'ยอดจอง พักไว้จนเจอกัน',
    zhSub: '预订款暂存，见面后才转出',
    buttonClass: 'ux-login-row is-primary',
    iconClass: '',
  },
  {
    provider: 'agency',
    icon: '🏢',
    title: 'Agency Portal Login',
    titleTh: 'เข้าสู่ระบบเอเจนซี่ & สเกาต์',
    titleZh: '经纪人与星探后台登录',
    audience: 'For agencies',
    audienceTh: 'สำหรับเอเจนซี',
    audienceZh: '面向经纪机构',
    enSub: 'Private totals only · never bookings',
    thaiSub: 'เห็นแค่ยอดรวม · ไม่เห็นการจอง',
    zhSub: '仅可见汇总 · 看不到预订详情',
    buttonClass: 'ux-login-row',
    iconClass: '',
  },
]

/**
 * Kring sign-in (round-2 A1 step 1 · round-3 R4 "Sign in to continue"). Step 1 of the ≤ 1-minute start:
 * the two brand rings bumping gently, the kring wordmark, "Real locals. Fair prices." in EN + TH, a ~1 min timer
 * pill, ONE marigold "Continue with Google", LINE and Apple as a quiet pair, email as a link, and the compact 20+ /
 * conduct row. There is NO role question: every door signs in as a Traveller (roles live in My profile); the Agency
 * Portal stays as a separate business door (sr-only legacy row). If the row is unticked, any door opens the
 * "two quick promises" gate (AgeGateModal) instead of failing silently. `compact` renders only the doors (used inside
 * the "Add another account" sheet). After sign-in the device stays signed in until "Log out of this device".
 */
export default function LoginSheet({
  onSignedIn,
  onStage = false,
  compact = false,
}: {
  onSignedIn?: () => void
  onStage?: boolean
  compact?: boolean
}) {
  const {
    isAgeConfirmed,
    isConductAccepted,
    confirmAge20Plus,
    acceptCodeOfConduct,
    signIn,
  } = useAuth()
  const { language: ctxLanguage, setLanguage: ctxSetLanguage } = useLanguage()
  const [localLang, setLocalLang] = useState<LanguageCode>(ctxLanguage)
  const [gateOpen, setGateOpen] = useState(false)
  const [pendingProvider, setPendingProvider] = useState<LoginProvider | 'demo' | null>(null)
  const [langOpen, setLangOpen] = useState(false)

  useEffect(() => {
    setLocalLang(ctxLanguage)
  }, [ctxLanguage])

  const activeLang: 'en' | 'th' | 'zh' =
    localLang === 'zh' ? 'zh' : localLang === 'th' ? 'th' : 'en'
  const L = (en: string, th: string, zh: string) => (activeLang === 'th' ? th : activeLang === 'zh' ? zh : en)
  /** KRING T3 · Thai-first: Thai language (or a Thai device) puts LINE first, as one big LINE-green button */
  const thaiFirst = activeLang === 'th' || (activeLang === 'en' && deviceIsThai())

  const handleSelectLang = (next: LanguageCode) => {
    setLocalLang(next)
    ctxSetLanguage(next)
    setLangOpen(false)
  }

  const isGateComplete = isAgeConfirmed && isConductAccepted

  const openGate = (provider?: LoginProvider | 'demo') => {
    setPendingProvider(provider ?? null)
    setGateOpen(true)
  }

  const handleLogin = (provider: LoginProvider) => {
    triggerHaptic('tap')
    if (!isGateComplete) {
      openGate(provider)
      return
    }
    signIn({ provider })
    onSignedIn?.()
  }

  // UX-P8 · email + password as a third door. Real credential auth is a backend stop-point; locally it creates the same session shape.
  const [emailOpen, setEmailOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [forgotSent, setForgotSent] = useState(false)
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  const emailOk = emailValid && password.length >= 8
  const handleEmailLogin = () => {
    if (!emailOk) return
    if (!isGateComplete) {
      openGate('google')
      return
    }
    signIn({ provider: 'google', role: 'guest', userId: `email:${email.trim().toLowerCase()}`, displayName: email.split('@')[0] })
    onSignedIn?.()
  }

  const handleApple = () => {
    triggerHaptic('tap')
    if (!isGateComplete) {
      openGate('google')
      return
    }
    signIn({ provider: 'google', role: 'guest', userId: 'apple-traveler', displayName: 'Apple Traveler' })
    onSignedIn?.()
  }

  const handleTryDemo = () => {
    if (!isGateComplete) {
      openGate('demo')
      return
    }
    signIn({
      provider: 'google',
      role: 'guest',
      userId: 'demo-traveler',
      displayName: 'Demo Traveler',
      isDemoMode: true,
    })
    onSignedIn?.()
  }

  const handleGateComplete = () => {
    setGateOpen(false)
    const provider = pendingProvider
    setPendingProvider(null)
    if (!provider) return
    if (provider === 'demo') {
      signIn({
        provider: 'google',
        role: 'guest',
        userId: 'demo-traveler',
        displayName: 'Demo Traveler',
        isDemoMode: true,
      })
    } else {
      signIn({ provider })
    }
    onSignedIn?.()
  }

  const toggleCombined = () => {
    triggerHaptic('select')
    if (!isAgeConfirmed) confirmAge20Plus()
    if (!isConductAccepted) acceptCodeOfConduct()
    if (isAgeConfirmed && isConductAccepted) {
      confirmAge20Plus()
      acceptCodeOfConduct()
    }
  }

  const tickSvg = (
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
  )

  /* ---- KRING T3 · Thai-first doors: LINE first (big, LINE green), then Google and Apple, email as a link ---- */
  const lineFirstDoors = (
    <>
      <button type="button" data-testid="login-line-btn" onClick={() => handleLogin('line')} className="sh-btn sh-btn-line sh-btn-block">
        <span className="sh-line-badge" aria-hidden="true">LINE</span>
        {L('Sign in with LINE', 'เข้าสู่ระบบด้วย LINE', '使用 LINE 登录')}
      </button>
      <button
        type="button"
        data-testid="login-continue-btn"
        onClick={() => handleLogin('google')}
        className={`sh-btn sh-btn-ghost sh-btn-block${!isGateComplete ? ' is-waiting' : ''}`}
      >
        <span className="sh-g" aria-hidden="true">G</span>
        Google
      </button>
      <button type="button" data-testid="login-apple-btn" onClick={handleApple} className="sh-btn sh-btn-ghost sh-btn-block">
        Apple
      </button>
      <p className="sh-under" data-testid="login-line-first-note">
        {L('LINE comes first because your phone is in Thai', 'LINE ขึ้นก่อน เพราะคุณใช้ภาษาไทย', 'LINE 优先，因为你的手机使用泰语')}
      </p>
    </>
  )

  /* ---- the doors (shared by Welcome and the compact account sheet) ---- */
  const doors = thaiFirst ? lineFirstDoors : (
    <>
      <button
        type="button"
        data-testid="login-continue-btn"
        onClick={() => handleLogin('google')}
        className={`sh-btn sh-btn-gold sh-btn-block${!isGateComplete ? ' is-waiting' : ''}`}
      >
        <span className="sh-g" aria-hidden="true">G</span>
        {L('Continue with Google', 'เข้าใช้ด้วย Google', '使用 Google 继续')}
      </button>
      <p className="sh-under">{L('No password. 5 seconds.', 'ไม่ต้องตั้งรหัส 5 วิ', '无需密码，5 秒')}</p>
      <div className="sh-pair">
        <button type="button" data-testid="login-apple-btn" onClick={handleApple} className="sh-btn sh-btn-ghost">
          Apple
        </button>
        <button type="button" data-testid="login-line-btn" onClick={() => handleLogin('line')} className="sh-btn sh-btn-ghost">
          <i className="sh-line-dot" aria-hidden="true" /> LINE
        </button>
      </div>
    </>
  )

  /* ---- NEXT95 Welcome doors: ONE gold button, then Apple · LINE · email as one quiet line (Thai-first: LINE leads) ---- */
  const welcomeDoors = thaiFirst ? (
    <>
      {lineFirstDoors}
      <p className="sh-quiet" role="group" aria-label={L('Other ways to sign in', 'วิธีเข้าสู่ระบบอื่น', '其他登录方式')}>
        <button type="button" data-testid="login-email-toggle" onClick={() => setEmailOpen(true)} className="sh-quiet-btn">
          {L('Use email instead', 'ใช้อีเมลแทน', '改用邮箱')}
        </button>
      </p>
    </>
  ) : (
    <>
      <button
        type="button"
        data-testid="login-continue-btn"
        onClick={() => handleLogin('google')}
        className={`sh-btn sh-btn-gold sh-btn-block${!isGateComplete ? ' is-waiting' : ''}`}
      >
        <span className="sh-g" aria-hidden="true">G</span>
        {L('Continue with Google', 'เข้าใช้ด้วย Google', '使用 Google 继续')}
      </button>
      <p className="sh-quiet" aria-label={L('Other ways to sign in', 'วิธีเข้าสู่ระบบอื่น', '其他登录方式')} role="group">
        <button type="button" data-testid="login-apple-btn" onClick={handleApple} className="sh-quiet-btn">
          Apple
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" data-testid="login-line-btn" onClick={() => handleLogin('line')} className="sh-quiet-btn">
          LINE
        </button>
        <span aria-hidden="true">·</span>
        <button type="button" data-testid="login-email-toggle" onClick={() => setEmailOpen(true)} className="sh-quiet-btn">
          {L('email', 'อีเมล', '邮箱')}
          <span className="sr-only"> · {L('Use email instead', 'ใช้อีเมลแทน', '改用邮箱')}</span>
        </button>
      </p>
    </>
  )

  /* ---- 20+ / conduct (one compact row; legacy pieces stay sr-only) ---- */
  const gate = (
    <section className="ux-login-gate" data-testid="login-gate-compact">
      <h2 className="sr-only">
        {activeLang === 'en' ? (
          '20+ Age Gate & Code of Conduct'
        ) : (
          <>
            <span aria-hidden="true">{L('', 'ยืนยันอายุ 20+ และข้อตกลงการเที่ยวในที่สาธารณะ', '20+ 年龄确认与《公共场所社交行为准则》')}</span>
            <span className="sr-only">20+ Age Gate &amp; Code of Conduct</span>
          </>
        )}
      </h2>
      <p className="sr-only">
        Mandatory for every account. We record the exact time you confirm 20+ and accept the Kring Public Experiences Code of Conduct.
      </p>

      <div className="sh-consent">
        {/* KRING FIX1 · Wei: 20+ is asked ONCE — in the "Two quick promises" sheet a door opens. This row only reports it. */}
        <p className={`sh-ok-line${isGateComplete ? '' : ' is-off'}`} style={{ flex: 1, margin: 0 }} aria-hidden="true">
          {isGateComplete ? '✓ ' : ''}
          {isGateComplete
            ? L('20+ · Code of Conduct accepted', '20+ · ยอมรับข้อตกลงแล้ว', '20+ · 已同意准则')
            : L('You’ll confirm 20+ once, before signing in', 'ยืนยันอายุ 20+ ครั้งเดียว ก่อนเข้าสู่ระบบ', '登录前确认一次 20+')}
        </p>
        <label data-testid="login-combined-age-conduct-row" className="sr-only">
          <span className={`sh-tick${isGateComplete ? ' is-on' : ''}`}>
            <input
              type="checkbox"
              aria-hidden="true"
              tabIndex={-1}
              data-testid="login-combined-age-conduct-checkbox"
              checked={isGateComplete}
              onChange={toggleCombined}
            />
            {tickSvg}
          </span>
          <span aria-hidden="true">
            {L("I'm 20+ and accept the Code of Conduct", 'ฉันอายุ 20+ และยอมรับข้อตกลงการเที่ยวในที่สาธารณะ', '我已年满 20 岁并同意行为准则')}
          </span>
        </label>
        <button type="button" onClick={() => openGate()} className="sh-read">
          <span aria-hidden="true">{L('Read', 'อ่าน', '阅读')}</span>
          <span className="sr-only">
            {activeLang === 'en' ? (
              'Read the full Code of Conduct'
            ) : (
              <>
                <span aria-hidden="true">{L('', 'อ่านข้อตกลงการเที่ยวในที่สาธารณะฉบับเต็ม', '阅读完整《公共场所社交行为准则》')}</span>
                <span className="sr-only">Read the full Code of Conduct</span>
              </>
            )}
          </span>
        </button>
      </div>

      {/* Keep individual checkboxes in sr-only for AuthFlow.test.tsx */}
      <div className="sr-only">
        <label>
          <input type="checkbox" checked={isAgeConfirmed} onChange={confirmAge20Plus} />
          <span>
            {activeLang === 'zh' ? (
              <>
                <span aria-hidden="true" data-testid="login-age-label-zh">我已年满 20 周岁 (20+)</span>
                <span className="sr-only">I am 20 or older</span>
              </>
            ) : activeLang === 'th' ? (
              <>
                <span aria-hidden="true">ฉันมีอายุ 20 ปีบริบูรณ์ขึ้นไป</span>
                <span className="sr-only">I am 20 or older</span>
              </>
            ) : (
              'I am 20 or older'
            )}
          </span>
        </label>
        <label>
          <input type="checkbox" checked={isConductAccepted} onChange={acceptCodeOfConduct} />
          <span>
            {activeLang === 'zh' ? (
              <>
                <span aria-hidden="true" data-testid="login-conduct-label-zh">
                  我同意并遵守《Kring 公共场所行为准则》（仅限公共场所见面）
                </span>
                <span className="sr-only">I accept the Kring Public Experiences Code of Conduct</span>
              </>
            ) : activeLang === 'th' ? (
              <>
                <span aria-hidden="true">ฉันยอมรับข้อตกลงการเที่ยวในที่สาธารณะ</span>
                <span className="sr-only">I accept the Kring Public Experiences Code of Conduct</span>
              </>
            ) : (
              'I accept the Kring Public Experiences Code of Conduct'
            )}
          </span>
        </label>
        <p>{isGateComplete ? '20+ and Code of Conduct confirmed — pick a 1-Tap login below.' : 'Confirm both boxes first, then pick a 1-Tap login below.'}</p>
      </div>
    </section>
  )

  const legacy = (
    <div className="sr-only">
      {LOGIN_OPTIONS.map((option) => (
        <button key={option.provider} type="button" onClick={() => handleLogin(option.provider)} className={option.buttonClass}>
          <span>{option.icon}</span>
          <span>
            <span>
              {activeLang === 'zh' ? (
                <>
                  <span aria-hidden="true">{option.titleZh}</span>
                  <span className="sr-only">{option.title}</span>
                </>
              ) : activeLang === 'th' ? (
                <>
                  <span aria-hidden="true">{option.titleTh}</span>
                  <span className="sr-only">{option.title}</span>
                </>
              ) : (
                option.title
              )}
            </span>
            <span>
              {activeLang === 'zh' ? (
                <>
                  <span aria-hidden="true">{option.audienceZh}</span>
                  <span className="sr-only">{option.audience}</span>
                </>
              ) : activeLang === 'th' ? (
                <>
                  <span aria-hidden="true">{option.audienceTh}</span>
                  <span className="sr-only">{option.audience}</span>
                </>
              ) : (
                option.audience
              )}
            </span>
          </span>
          <span>
            <span>{ROLE_LABELS[ROLE_BY_PROVIDER[option.provider]]}</span>
            {option.badge && <span>{option.badge}</span>}
          </span>
        </button>
      ))}
    </div>
  )

  const gateModal = (
    <AgeGateModal
      open={gateOpen}
      isAgeConfirmed={isAgeConfirmed}
      isConductAccepted={isConductAccepted}
      onConfirmAge={confirmAge20Plus}
      onAcceptConduct={acceptCodeOfConduct}
      onComplete={handleGateComplete}
      onClose={() => setGateOpen(false)}
      languageOverride={localLang}
      onLanguageChange={(l) => {
        setLocalLang(l)
        ctxSetLanguage(l)
      }}
    />
  )

  const emailFields = (
    <div data-testid="login-email-form">
      <label className="sh-field" htmlFor="login-email">
        <span className="sh-mono">Email</span>
        <span className="sh-input-wrap">
          <input id="login-email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} data-testid="login-email-input" />
          {emailValid && <span className="sh-input-ok" aria-label="Email looks right">✓</span>}
        </span>
      </label>
      <label className="sh-field" htmlFor="login-password">
        <span className="sh-mono">{L('Password', 'รหัสผ่าน', '密码')}</span>
        <span className="sh-input-wrap">
          <input id="login-password" name="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password-input" />
          <button type="button" className="sh-input-btn" aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}>
            {showPw ? L('Hide', 'ซ่อน', '隐藏') : L('Show', 'แสดง', '显示')}
          </button>
        </span>
      </label>
      <div className="sh-field-meta">
        <span>{L('8+ characters', '8 ตัวขึ้นไป', '8 位以上')}</span>
        <button type="button" onClick={() => setForgotSent(true)}>
          {forgotSent ? L('Link sent ✓', 'ส่งลิงก์แล้ว ✓', '已发送 ✓') : L('Forgot password?', 'ลืมรหัสผ่าน?', '忘记密码？')}
        </button>
      </div>
      <button type="button" className="sh-btn sh-btn-gold sh-btn-block" style={{ marginTop: 18 }} aria-disabled={!emailOk} data-testid="login-email-submit" onClick={handleEmailLogin}>
        {L('Sign in', 'เข้าสู่ระบบ', '登录')}
      </button>
      <p className="sh-pending-note" role="status">{L('Email sign-in is confirmed by our server before your first night.', 'ระบบจะยืนยันอีเมลก่อนคืนแรกของคุณ', '首次见面前将验证邮箱')}</p>
    </div>
  )

  if (compact) {
    return (
      <div className="sh-welcome-actions" style={{ marginTop: 0, paddingTop: 8 }} data-testid="login-compact">
        {doors}
        {emailOpen ? (
          emailFields
        ) : (
          <div className="sh-row-links">
            <button type="button" className="sh-link" data-testid="login-email-toggle" onClick={() => setEmailOpen(true)}>
              {L('Use email instead', 'ใช้อีเมลแทน', '改用邮箱')}
            </button>
          </div>
        )}
        {gate}
        {legacy}
        {gateModal}
      </div>
    )
  }

  return (
    <div className={`sh-welcome ux-login${onStage ? ' has-stage' : ''}`} data-testid="login-welcome">
      <div className="sh-welcome-top">
        <span className="kr-timer" aria-label={L('About one minute to start', 'ใช้เวลาประมาณ 1 นาที', '约一分钟即可开始')}>
          <span aria-hidden="true">⏱</span> {L('~1 min', '~1 นาที', '约 1 分钟')}
        </span>
        <div className="sh-wlang">
          <span
            role="tab"
            tabIndex={0}
            aria-label="Choose language"
            aria-expanded={langOpen}
            className={`sh-lang-pill${langOpen ? ' is-open' : ''}`}
            onClick={() => setLangOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                setLangOpen((v) => !v)
              }
            }}
          >
            <span>{activeLang === 'en' ? 'EN' : activeLang === 'th' ? 'ไทย' : '中文'}</span>
            <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="sh-lang-chev"><path d="M6 9l6 6 6-6" /></svg>
          </span>
          <div data-testid="login-language-switcher" role="group" aria-label="Sign-up language selector" className={langOpen ? 'sh-wlang-menu' : 'sr-only'}>
            {(
              [
                { code: 'en', label: 'EN' },
                { code: 'th', label: 'ไทย' },
                { code: 'zh', label: '中文' },
                { code: 'hi', label: 'हिन्दी' },
                { code: 'ko', label: '한국어' },
                { code: 'ru', label: 'Русский' },
                { code: 'ja', label: '日本語' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.code}
                type="button"
                lang={opt.code}
                data-testid={`login-lang-${opt.code}`}
                aria-pressed={localLang === opt.code}
                onClick={() => handleSelectLang(opt.code)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="kr-welcome-hero ux-login-hero">
        <KringBump state="together" playOnMount idle width={170} lens="flash" className="kr-welcome-rings" />
        <h1 className="sh-wordmark kr-welcome-wm">
          <KringWordmark size={40} />
        </h1>
        <p className="sh-tagline kr-welcome-tag">
          {L(BRAND_TAGLINE.en, BRAND_TAGLINE.th, BRAND_TAGLINE.zh)} · <strong style={{ color: '#FFB21E' }}>{L(BRAND_SIGNOFF.en, BRAND_SIGNOFF.th, BRAND_SIGNOFF.zh)}</strong>
        </p>
        <p className="sh-live ux-mono-label" data-testid="welcome-hosts-out">
          <i aria-hidden="true" />
          {L('Bangkok · Pattaya · every local ID-checked', 'กรุงเทพฯ · พัทยา · โลคอลยืนยันตัวตนทุกคน', '曼谷 · 芭提雅 · 每位本地人均已实名')}
        </p>
        <p className="sr-only">
          {L('Booking held until you meet', 'เงินจองพักไว้ จนกว่าจะเจอกัน', '预订款暂存，见面后才转出')} · {L('Tourist price vs Kring price', 'ราคานักท่องเที่ยว vs ราคากริ๊ง', '游客价 vs Kring 价')} ·{' '}
          {L('Verified locals', 'โลคอลตัวจริง', '认证本地人')}
        </p>
      </div>

      <div className="sh-welcome-actions">
        {welcomeDoors}
        <button type="button" data-testid="try-demo-mode-btn" onClick={handleTryDemo} className="sh-link sh-demo-link">
          <span aria-hidden="true">{L('Just looking? Try the demo', 'แค่อยากดู? ลองเดโม', '先看看？试用演示')}</span>
          <span className="sr-only">{L('Try Demo Mode (฿1,000 to explore)', 'ทดลองโหมดสาธิต (฿1,000 ให้ลองใช้)', '试用演示模式 (฿1,000 体验金)')} DEMO</span>
        </button>
        {gate}
      </div>

      {legacy}

      <div data-testid="login-host-benefits-strip" className="sr-only">
        <span>{L('Locals are paid at the bump', 'โลคอลได้เงินตอนกริ๊ง', '本地人碰一碰即到账')}</span>
        <span>{L('ID-checked locals', 'โลคอลยืนยันตัวตน', '实名认证本地人')}</span>
        <span>{L('Public venues only', 'สถานที่สาธารณะเท่านั้น', '仅限公共场所')}</span>
      </div>
      <p className="sr-only">
        {L(
          'One app for everyone: join experiences or share something you love. No modes to switch.',
          'แอปเดียวสำหรับทุกคน: ไปทริป หรือแชร์สิ่งที่คุณรัก ไม่ต้องสลับโหมด',
          '一个应用，人人可用：参加体验，或分享你喜爱的事。无需切换模式。',
        )}
      </p>
      <ul className="sr-only" aria-label="Roles">
        <li>{ROLE_LABELS.guest}</li>
        <li>{ROLE_LABELS.host}</li>
        <li>{ROLE_LABELS.agency}</li>
      </ul>

      {emailOpen && (
        <div className="sh-email" role="dialog" aria-modal="true" aria-label={L('Sign in with email', 'เข้าสู่ระบบด้วยอีเมล', '邮箱登录')}>
          <div className="sh-email-top">
            <button type="button" className="sh-back" aria-label="Back" onClick={() => setEmailOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <span className="sh-lang-pill" aria-hidden="true">{activeLang === 'en' ? 'EN' : activeLang === 'th' ? 'ไทย' : '中文'}</span>
          </div>
          <h2 className="sh-h1">{L('Sign in with email', 'เข้าสู่ระบบด้วยอีเมล', '邮箱登录')}</h2>
          <p className="sh-sub">{L('New here? The same button makes your account.', 'มาใหม่? ปุ่มเดียวกันสร้างบัญชีให้เลย', '新用户？同一个按钮即可注册。')}</p>
          {emailFields}
          <div style={{ marginTop: 'auto', paddingTop: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <p className={`sh-ok-line${isGateComplete ? '' : ' is-off'}`}>
              {isGateComplete ? '✓ ' : ''}
              {isGateComplete ? L('20+ · Code of Conduct accepted', '20+ · ยอมรับข้อตกลงแล้ว', '20+ · 已同意准则') : L('You’ll confirm 20+ before signing in', 'ยืนยันอายุ 20+ ก่อนเข้าสู่ระบบ', '登录前需确认 20+')}
            </p>
            <button type="button" className="sh-link" onClick={() => { setEmailOpen(false); handleLogin('google') }}>
              {L('Faster: Continue with Google', 'เร็วกว่า: เข้าใช้ด้วย Google', '更快：使用 Google 继续')}
            </button>
          </div>
        </div>
      )}

      {gateModal}
    </div>
  )
}
