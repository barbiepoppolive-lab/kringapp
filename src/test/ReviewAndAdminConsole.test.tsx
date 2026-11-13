import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import MeetFeed from '../components/meet/MeetFeed'
import ReviewAndAdminConsole, {
  calculateHostTierProgression,
  resolveDoubleBlindVisibility,
} from '../components/admin/ReviewAndAdminConsole'
import { LanguageProvider } from '../i18n/LanguageContext'

describe('T-018 — Approved R-043 / R-039 Requirement #1 (7 Discord Pills in MeetFeed for Bangkok & Pattaya)', () => {
  it('renders the 3 Local Card Trust Pills (✓ Verified local · ID checked, 🌍 Speaks …, ✓ On time · Public venues only) on every local card', () => {
    render(
      <LanguageProvider>
        <MeetFeed />
      </LanguageProvider>,
    )

    expect(screen.getByTestId('liveness-badge-host-mint')).toHaveTextContent('✓ Verified local · ID checked')
    expect(screen.getByTestId('loves-expats-badge-host-mint')).toHaveTextContent('🌍 Speaks Thai · English')
    expect(screen.getByTestId('high-energy-pill-host-mint')).toHaveTextContent(
      '✓ On time · Public venues only',
    )
  })

  it('filters locals using the 4 Vibe Filter Pills (🎓 English Fluent, 🌿 Herbal spa, 🍲 Mookata dinner, 🏸 Badminton) across both Bangkok and Pattaya', () => {
    render(
      <LanguageProvider>
        <MeetFeed />
      </LanguageProvider>,
    )

    const englishPill = screen.getByTestId('vibe-filter-pill-english')
    const chill420Pill = screen.getByTestId('vibe-filter-pill-420')
    const mookataPill = screen.getByTestId('vibe-filter-pill-mookata')
    const poolPill = screen.getByTestId('vibe-filter-pill-pool')

    expect(englishPill).toHaveTextContent('🎓 English Fluent')
    expect(chill420Pill).toHaveTextContent('🌿 Herbal spa')
    expect(mookataPill).toHaveTextContent('🍲 Mookata dinner')
    expect(poolPill).toHaveTextContent('🏸 Badminton')

    // Filter by 🎓 English Fluent in Bangkok (Mint & Ploy)
    fireEvent.click(englishPill)
    const englishCards = screen.getAllByTestId('meet-host-card')
    expect(englishCards.map((c) => c.getAttribute('data-host-id'))).toEqual([
      'host-mint',
      'host-ploy',
    ])

    // Filter by 🍲 Mookata dinner in Bangkok (Ploy & Kwan)
    fireEvent.click(mookataPill)
    const mookataCards = screen.getAllByTestId('meet-host-card')
    expect(mookataCards.map((c) => c.getAttribute('data-host-id'))).toEqual([
      'host-ploy',
      'host-kwan',
    ])

    // Switch city to 🏖️ PTY (Pattaya) while 🍲 Mookata dinner is active -> returns Fah in Pattaya
    fireEvent.click(screen.getByRole('tab', { name: /🏖️ PTY/i }))
    const pattayaCards = screen.getAllByTestId('meet-host-card')
    expect(pattayaCards.map((c) => c.getAttribute('data-host-id'))).toEqual(['host-fah'])
    expect(screen.getByTestId('loves-expats-badge-host-fah')).toHaveTextContent('🌍 Speaks Thai · English · Русский')
  })
})

describe('T-018 — 48-Hour Double-Blind Review, Host Tier Progression & Founder Live Config Console', () => {
  it('enforces the 48-hour double-blind review rule until both submit or 48h expires, and auto-levels host from Rising Star (19) to Top VIP Host (20)', () => {
    render(<ReviewAndAdminConsole />)

    // Initially hidden in 48h blind window with 19 completed hangouts (🔥 Rising Star)
    expect(screen.getByTestId('double-blind-status-pill')).toHaveTextContent('🔒 Hidden')
    expect(screen.getByTestId('host-tier-badge')).toHaveTextContent('🔥 Rising Star')
    expect(screen.queryByTestId('unlocked-reviews-panel')).toBeNull()

    // Submit host review -> unlocks both reviews immediately and increments hangouts to 20 (👑 Top VIP Host)
    fireEvent.click(screen.getByTestId('submit-host-blind-review-btn'))

    expect(screen.getByTestId('double-blind-status-pill')).toHaveTextContent(
      '🔓 Double-Blind Unlocked & Published',
    )
    expect(screen.getByTestId('unlocked-reviews-panel')).toBeInTheDocument()
    expect(screen.getByTestId('host-tier-badge')).toHaveTextContent('👑 Top VIP Host')
    expect(screen.getByTestId('host-progression-stats')).toHaveTextContent('20 Verified Hangouts')
  })

  it('unlocks double-blind review automatically when 48h timer expires and saves live DB config updates', () => {
    render(<ReviewAndAdminConsole />)

    fireEvent.click(screen.getByTestId('fast-forward-48h-btn'))
    expect(screen.getByTestId('double-blind-status-pill')).toHaveTextContent(
      '🔓 Double-Blind Unlocked & Published',
    )

    // Test deterministic helpers directly
    expect(calculateHostTierProgression(2, 5.0, 99).tierId).toBe('new')
    expect(calculateHostTierProgression(10, 4.8, 98).tierId).toBe('rising')
    expect(calculateHostTierProgression(22, 4.92, 99).tierId).toBe('top_vip')
    expect(
      resolveDoubleBlindVisibility({
        hangoutId: 'h1',
        hostName: 'Mint',
        guestHandle: '@Alex',
        venue: 'Octave',
        elapsedHours: 12,
        guestReview: null,
        hostReview: null,
      }).isUnlocked,
    ).toBe(false)

    // Test Founder Live DB Config update
    const minBahtInput = screen.getByTestId('config-min-baht-input')
    fireEvent.change(minBahtInput, { target: { value: '350' } })
    fireEvent.click(screen.getByTestId('save-live-config-btn'))
    expect(screen.getByTestId('config-saved-notice')).toHaveTextContent('Min ฿350')
  })

  it('renders the 🛡️ Founder Fraud, Payout & Lucky Pool Circuit-Breaker Queue and lets Founder approve or freeze flagged alerts in 1 tap', () => {
    render(<ReviewAndAdminConsole />)

    const queueCard = screen.getByTestId('founder-circuit-breaker-queue')
    expect(queueCard).toBeInTheDocument()
    expect(screen.getByTestId('lucky-pool-solvency-pill')).toHaveTextContent(/Pool Reserve/i)

    // Flagged cashout item #1 (<24h PromptPay change) can be frozen or approved in 1 tap
    const freezeBtn = screen.getByTestId('circuit-freeze-btn-alert-cashout-ploy')
    fireEvent.click(freezeBtn)
    expect(screen.getByTestId('circuit-status-alert-cashout-ploy')).toHaveTextContent(
      /FROZEN BY FOUNDER/i,
    )

    // Flagged Lucky Pool glitch alert can be clamped & resolved in 1 tap
    const approveBtn = screen.getByTestId('circuit-approve-btn-alert-lucky-glitch')
    fireEvent.click(approveBtn)
    expect(screen.getByTestId('circuit-status-alert-lucky-glitch')).toHaveTextContent(
      /RESOLVED & SAFE/i,
    )
  })

  it('renders the 💰 Founder Real-Time Revenue & Lucky Churn Calculator across all 5 streams in ฿ / ₹ / $ and switches presets cleanly', () => {
    render(<ReviewAndAdminConsole />)

    const calcCard = screen.getByTestId('founder-revenue-calculator-card')
    expect(calcCard).toBeInTheDocument()
    expect(screen.getByTestId('founder-net-profit-thb')).toHaveTextContent(/฿180,950/i)
    expect(screen.getByTestId('founder-net-profit-inr-usd')).toHaveTextContent(/₹4,52,375/i)

    // Switch to 🔥 Growth (60 Meets/day) preset
    fireEvent.click(screen.getByTestId('revenue-preset-growth-btn'))
    expect(screen.getByTestId('founder-net-profit-thb')).toHaveTextContent(/฿1,124,800/i)

    // Switch to 👑 Scale (300 Meets/day) preset
    fireEvent.click(screen.getByTestId('revenue-preset-scale-btn'))
    expect(screen.getByTestId('founder-net-profit-thb')).toHaveTextContent(/฿6,078,000/i)
  })
})


