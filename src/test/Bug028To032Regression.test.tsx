import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import App from '../App'
import ChatsAndPlansTab from '../components/chat/ChatsAndPlansTab'
import FeatureIncentiveOverlay from '../components/help/FeatureIncentiveOverlay'
import LoginSheet from '../components/LoginSheet'
import ClinkGiftSheet from '../components/meet/ClinkGiftSheet'
import MeetFeed from '../components/meet/MeetFeed'
import AgencyAndReferralHub from '../components/vip/AgencyAndReferralHub'
import { AuthProvider } from '../context/AuthContext'
import { LanguageProvider } from '../i18n/LanguageContext'
import { translations } from '../i18n/translations'
import { DEFAULT_PLATFORM_CONFIG } from '../lib/configDefaults'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
})

describe('BUG-028 — Demo balance isolation, Red Line #2 Bonus Coin guard & no silent chat deduction', () => {
  it('starts fresh Google / LINE / Agency accounts at 0 Paid Coins and 0 Bonus Coins (N1)', () => {
    render(<App />)

    fireEvent.click(screen.getByRole('checkbox', { name: /i am 20 or older/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /code of conduct/i }))
    fireEvent.click(screen.getByRole('button', { name: /1-tap with google/i }))

    expect(screen.getByTestId('header-wallet-balance')).toHaveTextContent('0')
    expect(screen.queryByTestId('demo-mode-banner')).not.toBeInTheDocument()
  })

  it('starts Demo Mode at 0 Paid Coins + 100,000 Demo Bonus Coins and blocks Treat Envelope holds (Red Line #2)', () => {
    render(
      <ClinkGiftSheet
        initialPaidCoins={0}
        initialBonusCoins={100_000}
      />,
    )

    fireEvent.click(screen.getByTestId('chon-lock-offer-cta'))
    expect(screen.getByRole('alert')).toHaveTextContent(/promo can't pay bookings/i)
    expect(screen.queryByTestId('offer-locked-next-steps-card')).not.toBeInTheDocument()
  })

  it('does not silently deduct 1,500 coins when opening VIP Chat after holding a Treat Envelope (N7)', () => {
    render(
      <ClinkGiftSheet
        initialPaidCoins={50_000}
        initialBonusCoins={0}
      />,
    )

    // Hold ฿300 (30,000 Paid Coins) -> remaining Paid Coins = 20,000
    fireEvent.click(screen.getByTestId('chon-lock-offer-cta'))
    expect(screen.getByTestId('paid-balance')).toHaveTextContent('Paid 20,000c')

    // Clicking Chat ➔ must NOT deduct 1,500 coins
    fireEvent.click(screen.getByTestId('deal-close-vip-chat-btn'))
    expect(screen.getByTestId('paid-balance')).toHaveTextContent('Paid 20,000c')
  })
})

describe('BUG-029 — PromptPay link check before PIN, cancelled offer state & no Sandbox text', () => {
  it('blocks cashout PIN step when no PromptPay number is linked and shows no (Sandbox Stop Point) label (N4, N10)', () => {
    render(<AgencyAndReferralHub />)

    expect(screen.queryByText(/Sandbox Stop Point/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Cash out ฿500 to PromptPay/i }))

    expect(screen.getByTestId('missing-promptpay-error')).toBeInTheDocument()
    expect(screen.queryByTestId('cashout-confirmation-pin-step')).not.toBeInTheDocument()
  })

  it('marks cancelled offers in ClinkGiftSheet and replaces chat Confirm CTA with Cancelled banner (N8)', () => {
    render(
      <div>
        <ClinkGiftSheet initialPaidCoins={50_000} initialBonusCoins={0} />
        <ChatsAndPlansTab />
      </div>,
    )

    fireEvent.click(screen.getByTestId('chon-lock-offer-cta'))
    fireEvent.click(screen.getByTestId('cancel-held-offer-refund-btn'))

    expect(screen.getByTestId('send-new-treat-after-cancel-btn')).toBeInTheDocument()
    expect(screen.getByTestId('chat-cancelled-offer-banner')).toHaveTextContent(/Offer Cancelled/i)
    expect(screen.queryByTestId('chat-confirm-plan-cta')).not.toBeInTheDocument()
  })
})

describe('BUG-030 — Agency / Scout Portal login lands on Agency & Scout Portal dashboard', () => {
  it('switches to the VIP tab and renders the Agency & Scout Portal dashboard when signing in as agency', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('checkbox', { name: /i am 20 or older/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /code of conduct/i }))
    fireEvent.click(screen.getByRole('button', { name: /agency portal login/i }))

    // OPT-011: VIP hub is a lazy chunk → await its first paint
    const portal = await screen.findByTestId('agency-portal-active-dashboard', {}, { timeout: 5000 })
    expect(portal).toBeInTheDocument()
    expect(portal).toHaveTextContent(/AGENCY & SCOUT PORTAL/i)
    expect(portal).toHaveTextContent(/8%–16% Override/i)
    expect(portal).not.toHaveTextContent(/20% Override/i)
    expect(portal).toHaveTextContent(/0 \/ 5 Hosts/i)
    expect(screen.getByTestId('agency-portal-copy-invite-btn')).toBeInTheDocument()
    expect(portal).toHaveTextContent(/📲 Invite Host on LINE/i)
  })
})

describe('BUG-031 — Chinese (中文) localization on Login/AgeGate, ClinkGiftSheet, FeatureIncentiveOverlay & CI i18n check', () => {
  it('switches LoginSheet and AgeGateModal to Chinese (中文) via the login language pill (N3)', () => {
    render(
      <LanguageProvider>
        <AuthProvider>
          <LoginSheet />
        </AuthProvider>
      </LanguageProvider>,
    )

    fireEvent.click(screen.getByTestId('login-lang-zh'))
    expect(screen.getByTestId('login-age-label-zh')).toHaveTextContent('我已年满 20 周岁 (20+)')
    expect(screen.getByTestId('login-conduct-label-zh')).toHaveTextContent(
      '我同意并遵守《Kring 公共场所行为准则》',
    )
  })

  it('renders Chinese labels in ClinkGiftSheet and matched titles/bullets in FeatureIncentiveOverlay (N6)', () => {
    window.localStorage.setItem('chon_language', 'zh')
    render(
      <LanguageProvider>
        <ClinkGiftSheet />
        <FeatureIncentiveOverlay open onClose={() => {}} />
      </LanguageProvider>,
    )

    expect(screen.getByTestId('chon-lock-offer-cta')).toHaveTextContent('发送预订请求')
    // KRING FIX1 · overlay copy rewritten to Kring (founder default) — zh titles/bullets still matched
    expect(screen.getByTestId('help-card-headline-0')).toHaveTextContent('1. 每位本地人均已实名认证')
    expect(screen.getByTestId('help-card-bullet-0')).toHaveTextContent('真实照片与评价')
    expect(screen.getByTestId('help-card-headline-2')).toHaveTextContent('3. 只在“กริ๊ง!”那一刻付款')
  })

  it('CI i18n check: every key in translations.en exists and is non-empty in th and zh', () => {
    const en = translations.en
    for (const lang of ['th', 'zh'] as const) {
      const target = translations[lang]
      expect(target.headerTagline.trim().length).toBeGreaterThan(0)
      expect(target.switcherLabel.trim().length).toBeGreaterThan(0)
      for (const tabKey of Object.keys(en.tabs) as Array<keyof typeof en.tabs>) {
        expect(target.tabs[tabKey].label.trim().length).toBeGreaterThan(0)
        expect(target.tabs[tabKey].title.trim().length).toBeGreaterThan(0)
        expect(target.tabs[tabKey].subtitle.trim().length).toBeGreaterThan(0)
      }
      for (const termKey of Object.keys(en.terms)) {
        expect((target.terms[termKey] ?? '').trim().length).toBeGreaterThan(0)
      }
      for (const uiKey of Object.keys(en.ui) as Array<keyof typeof en.ui>) {
        expect((target.ui[uiKey] ?? '').trim().length).toBeGreaterThan(0)
      }
    }
  })
})

describe('BUG-032 — Unified 100 = ฿1 rate, gift price parity, Escape/backdrop close & Guest Wallet role-gating', () => {
  it('enforces 100 Coins = ฿1 and 100 Points = ฿1 across DEFAULT_PLATFORM_CONFIG', () => {
    expect(DEFAULT_PLATFORM_CONFIG.coins_per_thb).toBe(100)
    expect(DEFAULT_PLATFORM_CONFIG.first_withdrawal_min_points).toBe(10_000)
    expect(DEFAULT_PLATFORM_CONFIG.standard_withdrawal_min_points).toBe(20_000)
    expect(DEFAULT_PLATFORM_CONFIG.referral_bounty_total_points).toBe(55_500)
  })

  it('matches Wai Rose (200) and Inhaler (500) prices in ChatsAndPlansTab and closes gift sheet on Escape or backdrop click (N5, N9)', () => {
    render(<ChatsAndPlansTab />)

    fireEvent.click(screen.getByTestId('in-chat-lucky-treat-btn'))
    expect(screen.getByTestId('in-chat-lucky-dock')).not.toHaveClass('sr-only')
    expect(screen.getByTestId('gift-tray-tab-treats')).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(screen.getByTestId('gift-tray-tab-lucky'))
    expect(screen.getByTestId('gift-tray-tab-lucky')).toHaveAttribute('aria-selected', 'true')
    const roseBtn = screen.getByTestId('in-chat-lucky-item-neon-rose')
    const inhalerBtn = screen.getByTestId('in-chat-lucky-item-thai-inhaler')
    expect(roseBtn).toHaveTextContent('200')
    expect(inhalerBtn).toHaveTextContent('500')

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.getByTestId('in-chat-lucky-dock')).toHaveClass('sr-only')
  })
})

describe('BUG-033 (D-036) — Remove host card price pill, remove weight filter, default Hide-from-Thais to OFF & remove from login screen', () => {
  it('shows no Baht price pill on MeetFeed host cards and has no Weight filter in the filter drawer', () => {
    render(<MeetFeed />)

    const cards = screen.getAllByTestId('meet-host-card')
    expect(cards.length).toBeGreaterThanOrEqual(4)
    for (const card of cards) {
      expect(within(card).queryByText(/฿/)).toBeNull()
    }

    expect(screen.queryByText(/⚖️ Weight/i)).toBeNull()
    expect(screen.getByText(/📏 Age & Height/i)).toBeInTheDocument()
  })

  it('defaults Hide from Thai locals to OFF (false) in Privacy settings and removes it from LoginSheet', () => {
    render(
      <LanguageProvider>
        <AuthProvider>
          <LoginSheet />
          <AgencyAndReferralHub />
        </AuthProvider>
      </LanguageProvider>,
    )

    const loginStrip = screen.getByTestId('login-host-benefits-strip')
    expect(loginStrip.textContent).not.toMatch(/ซ่อนคนไทย|屏蔽熟人/i)

    const hideToggle = screen.getByTestId('hide-from-thai-locals-toggle')
    expect(hideToggle).toHaveAttribute('aria-checked', 'false')
  })
})

describe('BUG-034 & BUG-036A (D-037) — Normal Gift default tab, remove fake winner ticker & render real Baht-first 2% POT inside Lucky tab only', () => {
  it('opens Normal Gift tab by default in ChatsAndPlansTab, renders exact Baht pool from luckyPoolReserveCoins on Lucky tab, and hides when null', () => {
    const { unmount } = render(<ChatsAndPlansTab luckyPoolReserveCoins={320_000} />)

    fireEvent.click(screen.getByTestId('in-chat-lucky-treat-btn'))
    expect(screen.getByTestId('gift-tray-tab-treats')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('gift-tray-tab-lucky')).toHaveAttribute('aria-selected', 'false')
    expect(screen.queryByTestId('lucky-tab-pot-counter')).toBeNull()

    fireEvent.click(screen.getByTestId('gift-tray-tab-lucky'))
    expect(screen.getByTestId('gift-tray-tab-lucky')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('lucky-tab-pot-counter')).toHaveTextContent('🎰 2% POT: ฿3,200')
    unmount()

    render(<ChatsAndPlansTab luckyPoolReserveCoins={null} />)
    fireEvent.click(screen.getByTestId('in-chat-lucky-treat-btn'))
    fireEvent.click(screen.getByTestId('gift-tray-tab-lucky'))
    expect(screen.queryByTestId('lucky-tab-pot-counter')).toBeNull()
  })

  it('renders exact Baht pool from luckyPoolReserveCoins in ClinkGiftSheet Lucky tab and hides when null', () => {
    const { unmount } = render(<ClinkGiftSheet luckyPoolReserveCoins={450_000} />)
    fireEvent.click(screen.getByTestId('tab-lucky'))
    expect(screen.getByTestId('lucky-tab-pot-counter')).toHaveTextContent('🎰 2% POT: ฿4,500')
    unmount()

    render(<ClinkGiftSheet luckyPoolReserveCoins={null} />)
    fireEvent.click(screen.getByTestId('tab-lucky'))
    expect(screen.queryByTestId('lucky-tab-pot-counter')).toBeNull()
  })

  it('removes fake @Alex_UK winner ticker from MeetFeed', () => {
    render(<MeetFeed />)
    expect(screen.queryByTestId('meet-top-live-win-ticker')).toBeNull()
    expect(screen.queryByText(/@Alex_UK won/i)).toBeNull()
  })
})


