import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'
import ClinkGiftSheet, {
  CLINK_BONUS_COINS,
  CLINK_PAID_COINS,
  DEMO_CLINK_HOST,
  DEMO_HANGOUT_VENUE,
  DEMO_LUCKY_RETURN_MULTIPLIERS,
  FULL_RIDE_COINS,
  LUCKY_CHON_GIFTS,
  LUCKY_COMBO_MULTIPLIERS,
  THAI_VIBE_TREATS,
  VIP_RIDE_COINS,
  buildGrabTransportDeepLink,
  buildMuvMiDeepLink,
  type HangoutVenue,
} from '../components/meet/ClinkGiftSheet'

function renderSheet(props: Partial<ComponentProps<typeof ClinkGiftSheet>> = {}) {
  const onSendTreat = vi.fn()
  const onSendLuckyGift = vi.fn()
  const onUnlockHangoutPass = vi.fn()
  render(
    <ClinkGiftSheet
      onSendTreat={onSendTreat}
      onSendLuckyGift={onSendLuckyGift}
      onUnlockHangoutPass={onUnlockHangoutPass}
      {...props}
    />,
  )
  return { onSendTreat, onSendLuckyGift, onUnlockHangoutPass }
}

function walletBalance(): string {
  return screen.getByTestId('wallet-balance').textContent ?? ''
}

function raisedCoins(): string | null {
  return screen.getByTestId('envelope-progress').getAttribute('data-raised')
}

function envelopeBarWidth(): string {
  return screen.getByTestId('envelope-bar').style.width
}

// UX-P4 Poppo-style panel: tap a gift to select it, then tap Send (or the Combo button while the combo window is open)
function clickThaiTreat(index: number) {
  fireEvent.click(screen.getByTestId(`treat-${THAI_VIBE_TREATS[index].id}`))
  fireEvent.click(screen.queryByTestId('treat-send-button') ?? screen.getByTestId('treat-combo-button'))
}

function clickLuckyGift(index: number) {
  fireEvent.click(screen.getByTestId(`lucky-${LUCKY_CHON_GIFTS[index].id}`))
  fireEvent.click(screen.queryByTestId('lucky-roll-send-button') ?? screen.getByTestId('lucky-combo-button'))
}

describe('Clink & Gift Sheet — closed-loop envelope header (D-020 / D-022)', () => {
  it('renders the bubbling Outing Treat Cocktail Glass, the 100% envelope whisper and the hold-safety tooltip', () => {
    renderSheet()

    expect(screen.getByRole('dialog', { name: /book mint · kring/i })).toBeInTheDocument()

    const count = screen.getByTestId('envelope-count').textContent ?? ''
    expect(count.replace(/\s+/g, ' ')).toContain("38,000c / 50,000c · 76%")
    expect(screen.getByTestId('envelope-header')).toHaveTextContent('📍 Coffee Drop · ฿200')
    expect(envelopeBarWidth()).toBe('76%')

    const whisper = (screen.getByTestId('closed-loop-whisper').textContent ?? '').replace(/\s+/g, ' ')
    expect(whisper).toBe(
      '✨ Gifts are a small thank-you · bookings are always made with an offer, held until you meet',
    )

    const held = screen.getByTestId('held-safely')
    expect(held.textContent).toBe('🔒 Held Safely — 100% Instant Auto-Refund if not picked')
    expect(held).toHaveAttribute('title', '🔒 Held Safely — 100% Instant Auto-Refund if not picked')
  })

  it('shows the unified coin balance plus the paid / bonus ledger split', () => {
    renderSheet()

    expect(walletBalance()).toBe('125,000 Coins 🪙')
    expect(screen.getByTestId('paid-balance')).toHaveTextContent('Paid 100,000c')
    expect(screen.getByTestId('bonus-balance')).toHaveTextContent('Bonus 25,000c')
    expect(CLINK_PAID_COINS).toBe(100_000)
    expect(CLINK_BONUS_COINS).toBe(25_000)
  })
})

describe('Clink & Gift Sheet — dual gift bar tabs (D-009 / D-021)', () => {
  it('switches cleanly between Tab 1 Thai Vibe Treats and Tab 2 Lucky Chon!', () => {
    renderSheet()

    expect(screen.getByTestId('tab-thai')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-lucky')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('thai-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('lucky-panel')).toBeNull()
    for (const treat of THAI_VIBE_TREATS) {
      expect(screen.getByTestId(`treat-${treat.id}`)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByTestId('tab-lucky'))

    expect(screen.getByTestId('tab-lucky')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('tab-thai')).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByTestId('lucky-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('thai-panel')).toBeNull()
    expect(screen.queryByTestId('combo-1')).toBeInTheDocument()
    for (const multiplier of LUCKY_COMBO_MULTIPLIERS) {
      expect(screen.getByTestId(`combo-${multiplier}`)).toHaveTextContent(`x${multiplier}`)
    }
    for (const gift of LUCKY_CHON_GIFTS) {
      expect(screen.getByTestId(`lucky-${gift.id}`)).toBeInTheDocument()
    }

    fireEvent.click(screen.getByTestId('tab-thai'))
    expect(screen.getByTestId('thai-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('lucky-panel')).toBeNull()
  })

  it('renders the fixed Thai Vibe Treat prices in coins', () => {
    renderSheet()

    const expected: Record<string, string> = {
      'treat-wai-rose': '200c',
      'treat-hong-thai-inhaler': '500c',
      'treat-cha-yen': '1,500c',
      'treat-vip-tuktuk-ride': '5,000c',
      'treat-moo-krata-set': '12,500c',
      'treat-jellyfish-cocktail': '25,000c',
      'treat-golden-lantern': '75,000c',
    }
    for (const [testId, coins] of Object.entries(expected)) {
      expect(screen.getByTestId(testId)).toHaveTextContent(coins)
    }
  })
})

describe('Clink & Gift Sheet — 100% Envelope credit & 80/20 blended spend (D-022)', () => {
  it('credits 100% of a sent Tab 1 Treat toward the Outing Treat Envelope progress bar', () => {
    const { onSendTreat } = renderSheet({ tutorialGiftsLeft: 0 })

    clickThaiTreat(0) // 🙏 Wai Rose — 200c

    expect(raisedCoins()).toBe('38200')
    expect(screen.getByTestId('envelope-progress')).toHaveAttribute('data-goal', '50000')
    expect(envelopeBarWidth()).toBe('76%')
    expect(walletBalance()).toBe('124,800 Coins 🪙')

    const receipt = screen.getByTestId('treat-receipt')
    expect(receipt).toHaveTextContent('Wai Rose (200c)')
    expect(receipt).toHaveTextContent('Envelope +200c')
    expect(onSendTreat).toHaveBeenCalledWith(THAI_VIBE_TREATS[0], 200)
  })

  it('makes the 1st Treat a free Task Tutorial gift that still fills the Envelope', () => {
    renderSheet()

    clickThaiTreat(2) // 🧋 Cha Yen — 1,500c

    expect(walletBalance()).toBe('125,000 Coins 🪙')
    expect(raisedCoins()).toBe('39500')
    expect(envelopeBarWidth()).toBe('79%')
    expect(screen.getByTestId('treat-receipt')).toHaveTextContent('sent free by the Task Tutorial! 🎁')
    expect(screen.queryByTestId('blend-note')).toBeNull()
    expect(screen.queryByTestId('tutorial-hint')).toBeNull()
  })

  it('enforces the 80% Paid / 20% Bonus blended spend rule after the tutorial gift', () => {
    renderSheet()

    clickThaiTreat(1) // 🌿 Hong Thai Inhaler — 500c (free tutorial gift)
    clickThaiTreat(2) // 🧋 Cha Yen — 1,500c → 1,200c paid + 300c bonus

    expect(walletBalance()).toBe('123,500 Coins 🪙')
    expect(screen.getByTestId('paid-balance')).toHaveTextContent('Paid 98,800c')
    expect(screen.getByTestId('bonus-balance')).toHaveTextContent('Bonus 24,700c')
    expect(screen.getByTestId('blend-note')).toHaveTextContent('✨ Task Bonus Coins covered 20%!')
  })

  it('caps Bonus Coins at the 20% share on luxury Treats', () => {
    renderSheet({ tutorialGiftsLeft: 0, initialBonusCoins: 1_000 })

    clickThaiTreat(6) // 🏮 Golden Lantern — 75,000c → max 15,000c bonus, only 1,000c held

    expect(walletBalance()).toBe('26,000 Coins 🪙')
    expect(screen.getByTestId('paid-balance')).toHaveTextContent('Paid 26,000c')
    expect(screen.getByTestId('bonus-balance')).toHaveTextContent('Bonus 0c')
    expect(screen.getByTestId('blend-note')).toHaveTextContent('✨ Task Bonus Coins covered 1,000c!')
  })

  it('blocks a Treat the wallet cannot afford and keeps the Envelope untouched', () => {
    renderSheet({ tutorialGiftsLeft: 0, initialPaidCoins: 100, initialBonusCoins: 0 })

    clickThaiTreat(4) // 🥓 Moo Kratha Set — 12,500c

    expect(screen.getByTestId('clink-error')).toHaveTextContent('Not enough Coins for that Treat')
    expect(walletBalance()).toBe('100 Coins 🪙')
    expect(raisedCoins()).toBe('38000')
    expect(screen.queryByTestId('treat-receipt')).toBeNull()
  })
})

describe('Clink & Gift Sheet — Lucky Chon! combo multipliers & RTP simulation (D-021 / R-009)', () => {
  it('plays an x9 combo, fires the combo streak counter and pays a 2x–500x variable return', () => {
    const { onSendLuckyGift } = renderSheet()

    fireEvent.click(screen.getByTestId('tab-lucky'))
    fireEvent.click(screen.getByTestId('combo-9'))

    expect(screen.getByTestId('combo-9')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('combo-streak')).toHaveTextContent('Combo x9!')

    const mangoButton = screen.getByTestId('lucky-mango-sticky-rice')
    expect(mangoButton).toHaveTextContent('1,800c')

    clickLuckyGift(1) // 🥭 Mango Sticky Rice 200c x9 = 1,800c

    const result = screen.getByTestId('lucky-result').textContent ?? ''
    const reward = Number(result.match(/Returned ([\d,]+) Coins/)?.[1]?.replace(/,/g, ''))
    expect(result).toContain('Mango Sticky Rice x9')
    expect(result).toContain('Combo x9!')
    expect(result).toContain('80% Return Pool')
    expect(reward).toBe(200 * DEMO_LUCKY_RETURN_MULTIPLIERS[0])
    expect(reward).toBeGreaterThanOrEqual(2 * 200)
    expect(walletBalance()).toBe('123,600 Coins 🪙')
    expect(raisedCoins()).toBe('38000') // Lucky winnings never touch the Envelope
    expect(screen.getByTestId('lucky-panel')).toHaveTextContent(
      '12% Host · 80% Return Pool · 8% Platform',
    )
    expect(onSendLuckyGift).toHaveBeenCalledWith(LUCKY_CHON_GIFTS[1], 9, 1_800)
  })

  it('racks up the rapid-fire combo streak and prices the x520 mega combo', () => {
    renderSheet()

    fireEvent.click(screen.getByTestId('tab-lucky'))
    fireEvent.click(screen.getByTestId('combo-520'))
    expect(screen.getByTestId('lucky-tuktuk-dice')).toHaveTextContent('52,000c')

    fireEvent.click(screen.getByTestId('combo-1'))
    clickLuckyGift(0) // 🍀 Lucky Tuk-Tuk Dice — 100c each
    clickLuckyGift(0)
    clickLuckyGift(0)

    expect(screen.getByTestId('combo-streak')).toHaveTextContent('Combo x1!')
    expect(screen.getByTestId('combo-rapid')).toHaveTextContent('🔥 3 in a row')

    const rewards =
      DEMO_LUCKY_RETURN_MULTIPLIERS[0] +
      DEMO_LUCKY_RETURN_MULTIPLIERS[1] +
      DEMO_LUCKY_RETURN_MULTIPLIERS[2]
    expect(walletBalance()).toBe(`${(125_000 - 300 + 100 * rewards).toLocaleString('en-US')} Coins 🪙`)
  })

  it('blocks a Lucky combo the wallet cannot afford', () => {
    renderSheet({ initialPaidCoins: 0, initialBonusCoins: 0 })

    fireEvent.click(screen.getByTestId('tab-lucky'))
    fireEvent.click(screen.getByTestId('combo-9'))
    clickLuckyGift(4) // 💎 Naga Dragon Pearl 5,000c x9 = 45,000c

    expect(screen.getByTestId('clink-error')).toHaveTextContent('Not enough Coins for that combo')
    expect(walletBalance()).toBe('0 Coins 🪙')
    expect(screen.queryByTestId('lucky-result')).toBeNull()
  })
})

describe('Clink & Gift Sheet — Layer 3 Hangout Pass & privacy-safe ride deep-links (R-010)', () => {
  it('renders the MuvMi / Grab ride card with verified public-venue deep links when the VIP Tuk-Tuk Ride is sent', () => {
    renderSheet({ tutorialGiftsLeft: 0 })

    clickThaiTreat(3) // 🛺 VIP Tuk-Tuk Ride — 5,000c

    const rideCard = screen.getByTestId('ride-card')
    expect(rideCard).toBeInTheDocument()
    expect(screen.getByTestId('ride-host-copy')).toHaveTextContent(
      '🛺 Ride funded! Home pickup address stays 100% private.',
    )
    expect(VIP_RIDE_COINS).toBe(5_000)

    const grabLink = screen.getByTestId('grab-deep-link')
    const muvmiLink = screen.getByTestId('muvmi-deep-link')
    expect(grabLink).toHaveAttribute(
      'href',
      'grab://open?screenType=TRANSPORT&dropoffLatitude=13.7398&dropoffLongitude=100.5097&dropoffAddress=Yaowarat%20Rd%2C%20Chinatown',
    )
    expect(muvmiLink).toHaveAttribute(
      'href',
      'https://muvmi.co/?dropoffLatitude=13.7398&dropoffLongitude=100.5097&dropoffAddress=Yaowarat%20Rd%2C%20Chinatown',
    )
    expect(grabLink).toHaveTextContent(`Open Grab to ${DEMO_HANGOUT_VENUE.name}`)
    expect(muvmiLink).toHaveTextContent(`Open MuvMi to ${DEMO_HANGOUT_VENUE.name}`)

    for (const href of [grabLink.getAttribute('href') ?? '', muvmiLink.getAttribute('href') ?? '']) {
      expect(href).not.toMatch(/pickup/i)
      expect(href).not.toContain(DEMO_CLINK_HOST.name)
      expect(href).toContain('13.7398')
    }

    expect(screen.getByTestId('ride-privacy-note')).toHaveTextContent(
      'her pickup pin stays on her own phone',
    )
  })

  it('upgrades the ride card to the 25,000c Full Ride tier', () => {
    renderSheet({ tutorialGiftsLeft: 0 })

    clickThaiTreat(5) // 🪼 Jellyfish Jelly — 25,000c

    expect(FULL_RIDE_COINS).toBe(25_000)
    expect(screen.getByTestId('ride-host-copy')).toHaveTextContent(
      '🛺 Full ride funded! Home pickup address stays 100% private.',
    )
  })

  it('unlocks the Layer 3 Hangout Pass from the simulated host "Let\'s Go!" tap', () => {
    const { onUnlockHangoutPass } = renderSheet()

    expect(screen.queryByTestId('hangout-pass')).toBeNull()
    expect(screen.queryByTestId('ride-card')).toBeNull()

    fireEvent.click(screen.getByTestId('host-let-go'))

    const pass = screen.getByTestId('hangout-pass')
    expect(pass).toBeInTheDocument()
    expect(pass).toHaveTextContent('🎟 Booking pass')
    expect(screen.getByTestId('hangout-pass-summary')).toHaveTextContent(
      `Mint accepted · 📍 ${DEMO_HANGOUT_VENUE.name}`,
    )
    expect(screen.getByTestId('ride-card')).toBeInTheDocument()
    expect(screen.getByTestId('grab-deep-link')).toBeInTheDocument()
    expect(screen.getByTestId('muvmi-deep-link')).toBeInTheDocument()
    expect(screen.getByTestId('ride-host-copy')).toHaveTextContent('🛺 Ride ready to fund!')

    const locked = screen.getByTestId('host-let-go')
    expect(locked).toBeDisabled()
    expect(locked).toHaveTextContent('Hangout Pass unlocked')

    fireEvent.click(locked)
    expect(onUnlockHangoutPass).toHaveBeenCalledTimes(1)
    expect(onUnlockHangoutPass).toHaveBeenCalledWith(DEMO_CLINK_HOST)
  })
})

describe('Clink & Gift Sheet — verified deep-link builders (R-010)', () => {
  const otherVenue: HangoutVenue = {
    name: 'Thonglor Market',
    address: 'Sukhumvit Soi 63, Bangkok',
    latitude: 13.72543,
    longitude: 100.58388,
  }

  it('builds the Grab Transport deep-link pre-filled with only the public venue', () => {
    expect(buildGrabTransportDeepLink(otherVenue)).toBe(
      'grab://open?screenType=TRANSPORT&dropoffLatitude=13.72543&dropoffLongitude=100.58388&dropoffAddress=Thonglor%20Market',
    )
    expect(buildGrabTransportDeepLink(DEMO_HANGOUT_VENUE)).toBe(
      'grab://open?screenType=TRANSPORT&dropoffLatitude=13.7398&dropoffLongitude=100.5097&dropoffAddress=Yaowarat%20Rd%2C%20Chinatown',
    )
  })

  it('builds the MuvMi Electric Tuk-Tuk link to the same public venue with no private pickup data', () => {
    const link = buildMuvMiDeepLink(otherVenue)
    expect(link).toBe(
      'https://muvmi.co/?dropoffLatitude=13.72543&dropoffLongitude=100.58388&dropoffAddress=Thonglor%20Market',
    )
    expect(link).not.toMatch(/pickup|home|condo|soi 63/i)
  })
})
