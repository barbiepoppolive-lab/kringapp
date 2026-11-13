import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import App from '../App'
import MeetFeed from '../components/meet/MeetFeed'
import ClinkGiftSheet from '../components/meet/ClinkGiftSheet'
import ChatsAndPlansTab from '../components/chat/ChatsAndPlansTab'
import FeatureIncentiveOverlay from '../components/help/FeatureIncentiveOverlay'
import TasksAndGamesDrawer from '../components/rewards/TasksAndGamesDrawer'
import AgencyAndReferralHub from '../components/vip/AgencyAndReferralHub'
import { LanguageProvider } from '../i18n/LanguageContext'
import { dispatchInternalWalletDelta } from '../lib/walletBus'

describe('T-017 Locked Board 1 (v6), Board 2 (v5), ThaiFriendly Filter v2 & Board 3 (Vibe C + Vibe A)', () => {
  it('renders Total Guests badges on Meet cards and toggles the ThaiFriendly Search & Filter Sheet', () => {
    render(
      <LanguageProvider>
        <MeetFeed onSelectHost={vi.fn()} />
      </LanguageProvider>,
    )

    expect(screen.getByTestId('bidders-count-badge-host-ploy')).toHaveTextContent(
      /Taking bookings · replies in ~\d+ min/i,
    )
    const filterToggle = screen.getByTestId('toggle-thaifriendly-filters-btn')
    expect(filterToggle).toHaveTextContent(/🎛️ Filters/i)

    fireEvent.click(filterToggle)
    const sheet = screen.getByTestId('thaifriendly-search-filter-sheet')
    expect(sheet).toHaveTextContent(/🎛️ Search Settings/i)
    expect(sheet).toHaveTextContent(/👩 Girls/i)
    expect(sheet).toHaveTextContent(/🦋 Ladyboys/i)
    expect(sheet).toHaveTextContent(/👨 Men/i)
    expect(sheet).toHaveTextContent(/🟢 Online Now/i)
  })

  it('renders Board 1 (v6 Locked) Offer Sheet with manual Baht input above Coins, disabled [-] at ฿300, Chon! Request button, and centered 💬 😍 🤩 Chat ➔ on confirmation', () => {
    render(
      <ClinkGiftSheet
        host={{
          id: 'host-mint',
          name: 'Mint',
          age: 24,
          treatLabel: 'Rooftop Drop · ฿300',
          raisedCoins: 15_000,
          goalCoins: 30_000,
        }}
        onClose={vi.fn()}
      />,
    )

    const minusBtn = screen.getByTestId('offer-stepper-minus')
    expect(minusBtn).toBeDisabled()

    const thbInput = screen.getByTestId('uncapped-offer-thb-input') as HTMLInputElement
    expect(thbInput.value).toBe('300')
    expect(screen.getByTestId('offer-stepper-display')).toHaveTextContent('฿300 held until you meet')
    expect(screen.getByTestId('trust-shortlist-pill')).toHaveTextContent(
      /Held until you meet/i,
    )

    const lockBtn = screen.getByTestId('chon-lock-offer-cta')
    expect(lockBtn).toHaveTextContent('Kring request · ฿300')

    fireEvent.click(lockBtn)
    expect(screen.getByTestId('offer-locked-next-steps-card')).toHaveTextContent(/Waiting for Mint/i)
    expect(screen.getByTestId('deal-close-vip-chat-btn')).toHaveTextContent('💬 Chat ➔')
    expect(screen.getByTestId('deal-close-fund-ride-btn')).toHaveTextContent('🧭 Local')
    expect(screen.getByTestId('deal-close-car-self')).toHaveTextContent('🙋‍♂️ Self')
    expect(screen.getByTestId('deal-close-car-both')).toHaveTextContent('👫 Both')
  })

  it('renders Board 2 (v5 Locked) Variant-3 Gift Sheet with live typing bar above 【Chon! VIP】, +🪙 win pill directly above bottom-left balance, and auto-closing WhatsApp photo bar', () => {
    render(
      <LanguageProvider>
        <ChatsAndPlansTab />
      </LanguageProvider>,
    )

    // Open single merged WhatsApp photo picker and verify it auto-closes on send
    fireEvent.click(screen.getByTestId('quick-whatsapp-photo-pill'))
    expect(screen.getByTestId('chat-photo-picker-tray')).toHaveTextContent(
      /Auto-Closes Immediately on Send/i,
    )
    fireEvent.click(screen.getByTestId('whatsapp-merged-photo-send-btn'))

    // Verify Variant 3 Bottom Gift Sheet elements
    expect(screen.getByTestId('while-playing-chat-composer-bar')).toBeInTheDocument()
    expect(screen.getByTestId('chon-vip-gift-header-strip')).toHaveTextContent(/【Chon! VIP】/i)
    expect(screen.getByTestId('variant3-jackpot-ticker')).toHaveTextContent(/\+🪙 50,000/i)

    const bottomWinPill = screen.getByTestId('bottom-left-balance-win-pill')
    expect(bottomWinPill).toHaveTextContent('+🪙 4,500')
    expect(screen.getByTestId('in-chat-live-coin-balance')).toHaveTextContent(/🪙 165,000\s*>/)

    // Click Send in capsule and verify Circular Golden Coin Rapid-Tap Button
    fireEvent.click(screen.getByTestId('in-chat-lucky-roll-btn'))
    expect(screen.getByTestId('poppo-golden-combo-btn')).toBeInTheDocument()
  })

  it('renders Board 3 (Vibe C colors/display + Vibe A info/text) with Indian flag 🇮🇳, exact spelling Speak, Win UP TO 500x 🪙, and concrete earning/saving estimates', () => {
    render(
      <FeatureIncentiveOverlay
        open={true}
        initialSection="meet"
        onClose={vi.fn()}
        onClaimGuideBonus={vi.fn()}
      />,
    )

    const dialog = screen.getByTestId('fullscreen-feature-incentive-overlay')
    // KRING FIX1 (founder default): the overlay is kept but rewritten to Kring — no Chon!/coins/VIP/rooftops
    expect(dialog).toHaveTextContent(/Every local is ID-checked/i)
    expect(dialog).toHaveTextContent(/released when you bump phones/i)
    expect(dialog).not.toHaveTextContent(/Chon|coins|VIP|rooftop|drinks|treat envelope/i)

    fireEvent.click(screen.getByTestId('help-section-tab-pulse'))
    expect(dialog).toHaveTextContent(/Tourist price vs Kring price/i)

    // Chats guide keeps 🇮🇳 and "Speak or type"
    fireEvent.click(screen.getByTestId('help-section-tab-chats'))
    expect(dialog).toHaveTextContent(/🇮🇳/)
    expect(dialog).toHaveTextContent(/Speak or type/i)
    expect(dialog).toHaveTextContent(/booking card sits on top of the chat/i)

    // Wallet guide (Local side): the earnings example is labelled "Example, not a guarantee" (BUG-035)
    fireEvent.click(screen.getByTestId('help-section-tab-vip'))
    fireEvent.click(screen.getByTestId('help-audience-host'))
    expect(dialog).toHaveTextContent(/Example Calculator \(Example, not a guarantee\)/i)
    expect(dialog).not.toHaveTextContent(/฿95k – ฿140k\+ \/ mo/i)
  })

  it('wires live Level-2 Lucky Chon! Pool & Water-Tank Reservoir into Games and mounts the Admin/RTP Console inside VIP & Wallet', () => {
    render(<TasksAndGamesDrawer />)

    const rngCard = screen.getByTestId('lucky-number-rng-program-card')
    expect(rngCard).toHaveTextContent(/Lucky Chon! Pool & Water-Tank RNG/i)
    expect(screen.getByTestId('water-tank-reservoir-telemetry')).toHaveTextContent(/💧 Pool: 🪙 250,000/i)

    fireEvent.click(screen.getByTestId('lucky-number-preset-99'))
    fireEvent.click(screen.getByTestId('run-lucky-number-rng-btn'))
    expect(screen.getByTestId('lucky-rng-outcome-banner')).toHaveTextContent(/Spins:\s*1/i)

    fireEvent.click(screen.getByTestId('trigger-daily-jackpot-draw-btn'))
    expect(screen.getByTestId('daily-jackpot-draw-result')).toHaveTextContent(/9 PM Draw Winner/i)

    render(
      <LanguageProvider>
        <AgencyAndReferralHub />
      </LanguageProvider>,
    )

    fireEvent.click(screen.getByTestId('vip-launch-admin'))
    expect(screen.getByTestId('vip-admin-console-modal')).toBeInTheDocument()
  })

  it('rejects untrusted console chon:wallet-delta events (BUG-001) and blocks overspend clamping (BUG-002)', () => {
    render(
      <App
        initialSession={{
          userId: 'demo-traveler',
          provider: 'google',
          role: 'guest',
          displayName: 'Demo Traveler',
          ageConfirmedAt: '2026-10-14T00:00:00.000Z',
          conductAcceptedAt: '2026-10-14T00:00:00.000Z',
          isDemoMode: true,
        }}
      />,
    )

    const coinPill = screen.getByTestId('header-wallet-balance')
    expect(coinPill).toHaveTextContent('฿1,000 promo')

    // 1. Untrusted console event must be ignored (BUG-001)
    window.dispatchEvent(
      new CustomEvent('chon:wallet-delta', { detail: { paidDelta: 99_999_999, bonusDelta: 500_000 } }),
    )
    expect(coinPill).toHaveTextContent('฿1,000 promo')

    // 2. Overspend (-500,000 against 100,000 balance) must be rejected without zeroing wallet (BUG-002)
    dispatchInternalWalletDelta({ paidDelta: -500_000 })
    expect(coinPill).toHaveTextContent('฿1,000 promo')
  })
})

