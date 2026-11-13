import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import BkkPulseTab, {
  AIRPORT_ARRIVAL_OPTIONS,
  DEMO_REVERSE_DROP_HOSTS,
  REBATE_COINS_PER_THB,
  REBATE_DEALS,
  formatTaxiCardEnglish,
  formatTaxiCardThai,
  type BkkPulseTabProps,
} from '../components/pulse/BkkPulseTab'

function renderPulseTab(options: Partial<BkkPulseTabProps> = {}) {
  cleanup()
  const onEarnRebateCoins = vi.fn()
  render(<BkkPulseTab onEarnRebateCoins={onEarnRebateCoins} {...options} />)
  return { onEarnRebateCoins }
}

describe('BkkPulseTab — 🟢 Chon! Live Price Radar hero (D-025)', () => {
  it('leads with the Live Price Radar and never mentions 0% commission or zero-markup', () => {
    renderPulseTab()

    const tab = screen.getByTestId('bkk-pulse-tab')
    const hero = screen.getByRole('region', { name: /live price radar/i })
    expect(
      within(hero).getByRole('heading', {
        name: /🟢 Chon! Live Price Radar — Guaranteed Cheapest VIP Member Rate in Bangkok/i,
      }),
    ).toBeInTheDocument()
    expect(hero).toHaveTextContent(/Live Checked 2m ago/)
    expect(hero).toHaveTextContent(/cheapest VIP member rate in flat Baht/i)

    expect(tab).not.toHaveTextContent(/0% commission/i)
    expect(tab).not.toHaveTextContent(/zero-markup/i)
    expect(REBATE_COINS_PER_THB).toBe(250)
  })
})

describe('BkkPulseTab — Live Price Radar strikethrough market comparison (D-025)', () => {
  it('shows side-by-side strikethrough market prices vs the Chon! VIP Rate on the airport cab', () => {
    renderPulseTab()

    const radar = screen.getByTestId('price-radar-solo-suv')
    expect(radar).toHaveTextContent('Airport Counter:')
    expect(radar).toHaveTextContent('฿1,200')
    expect(radar).toHaveTextContent('Klook:')
    expect(radar).toHaveTextContent('฿750')
    expect(radar).toHaveTextContent('Grab:')
    expect(radar).toHaveTextContent('฿790')
    expect(radar).toHaveTextContent(/→ 🥂 Chon! VIP Rate: ฿680 THB/i)
    expect(radar).toHaveTextContent(/Save ฿70 Instantly!/i)
    expect(within(radar).getByText('฿1,200').tagName).toBe('S')

    const cab = screen.getByTestId('airport-arrival-option-solo-suv')
    expect(cab).toHaveTextContent('🟢 Chon! VIP Airport Cab')
    expect(cab).toHaveTextContent('฿680')
  })

  it('renders a Live Price Radar on the rooftop, cruise, Muay Thai, eSIM, luggage and GoWabi cards', () => {
    renderPulseTab()

    const rooftop = screen.getByTestId('price-radar-rooftop-table-for-2')
    expect(rooftop).toHaveTextContent('฿3,000')
    expect(rooftop).toHaveTextContent(/Chon! VIP Rate: ฿1,800 THB/i)

    const cruise = screen.getByTestId('price-radar-chao-phraya-sunset-cruise')
    expect(cruise).toHaveTextContent(/Chon! VIP Rate: ฿850 THB/i)
    expect(cruise).toHaveTextContent(/Save ฿300 Instantly!/i)

    expect(screen.getByTestId('price-radar-rajadamnern-vip-muay-thai')).toHaveTextContent(
      /Chon! VIP Rate: ฿1,500 THB/i,
    )
    expect(screen.getByTestId('price-radar-tourist-5g-esim')).toHaveTextContent(
      /Chon! VIP Rate: ฿175 THB/i,
    )
    expect(screen.getByTestId('price-radar-airportels-luggage-delivery')).toHaveTextContent(
      /Chon! VIP Rate: ฿265 THB/i,
    )
  })

  it('offers an optional "+20% Extra in Bonus Coins!" toggle that reveals the bonus coin amount', () => {
    renderPulseTab()

    const toggle = screen.getByTestId('bonus-boost-rooftop-table-for-2')
    expect(toggle).toHaveTextContent(/Or take \+20% Extra in Bonus Coins!/i)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveTextContent(/\+5,000 Bonus Coins!/i)
  })
})

describe('BkkPulseTab — VIP Bangkok Airport Arrival (D-025 / R-011)', () => {
  it('renders the Chon! VIP Airport Cab and the VIP Host Gate 3 Welcome Drop', () => {
    renderPulseTab()

    const section = screen.getByRole('region', { name: /VIP Bangkok airport arrival/i })
    expect(section).toHaveTextContent(/Suvarnabhumi BKK & Don Mueang DMK/)

    const solo = screen.getByTestId('airport-arrival-option-solo-suv')
    expect(solo).toHaveTextContent('🟢 Chon! VIP Airport Cab')
    expect(solo).toHaveTextContent('฿680')
    expect(solo).toHaveTextContent(/\+15,000 Chon! Rebate Coins credited to your wallet/)

    const vip = screen.getByTestId('airport-arrival-option-vip-host-gate3')
    expect(vip).toHaveTextContent('🌺 VIP Host Airport Gate 3 Welcome Drop')
    expect(vip).toHaveTextContent('150,000 Coins / ฿600')
    expect(vip).toHaveTextContent(/Suvarnabhumi Level 2, Gate 3/)
    expect(vip).toHaveTextContent(/Starbucks \/ After You Public Lounge/)
    expect(vip).toHaveTextContent(/welcome Cha Yen/)
    expect(vip).toHaveTextContent(/SuperRich 0%-spread exchange/)
    expect(vip).toHaveTextContent(/tracked GrabSUV/)
    expect(vip).toHaveTextContent(/strictly public venues only!/)
    expect(AIRPORT_ARRIVAL_OPTIONS).toHaveLength(2)
  })

  it('credits the airport arrival rebate coins through the callback on booking', () => {
    const { onEarnRebateCoins } = renderPulseTab()

    fireEvent.click(screen.getByRole('button', { name: /Book .*VIP Airport Cab/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(1)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(15_000, expect.stringContaining('rebate'))

    fireEvent.click(screen.getByRole('button', { name: /Book .*VIP Host Airport Gate 3/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(2)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(5_300, expect.stringContaining('rebate'))
  })

  it('locks each arrival option after it is booked', () => {
    const { onEarnRebateCoins } = renderPulseTab()

    const button = screen.getByRole('button', {
      name: /Book .*VIP Host Airport Gate 3/i,
    })
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent(/Booked ✓/)

    fireEvent.click(button)
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(1)
  })
})

describe('BkkPulseTab — cheapest VIP dining, experiences & GoWabi cards (D-025 / R-001)', () => {
  it('renders all six deals with their VIP rates and rebate coin amounts, incl. the GoWabi card', () => {
    renderPulseTab()

    const section = screen.getByRole('region', {
      name: /rooftop dining and iconic Bangkok experiences/i,
    })

    const rooftop = screen.getByTestId('rebate-deal-rooftop-table-for-2')
    expect(rooftop).toHaveTextContent('🍸 Octave / Above Eleven / Tichuca Rooftop Table for 2')
    expect(rooftop).toHaveTextContent(/Up to 40% Off Set Menu/)
    expect(rooftop).toHaveTextContent(/via Hungry Hub \/ Eatigo/)
    expect(rooftop).toHaveTextContent(/\+25,000 Rebate Coins \(฿100 value\)/)
    expect(rooftop).toHaveTextContent('2 Verified Hosts want to go tonight!')

    const cruise = screen.getByTestId('rebate-deal-chao-phraya-sunset-cruise')
    expect(cruise).toHaveTextContent('🚢 Chao Phraya Princess Sunset Dinner Cruise')
    expect(cruise).toHaveTextContent(/฿850/)
    expect(cruise).toHaveTextContent(/\+13,750 Rebate Coins \(฿55 value\)/)

    const muayThai = screen.getByTestId('rebate-deal-rajadamnern-vip-muay-thai')
    expect(muayThai).toHaveTextContent('🥊 Rajadamnern Stadium VIP Ringside Muay Thai')
    expect(muayThai).toHaveTextContent(/฿1,500/)
    expect(muayThai).toHaveTextContent(/\+25,000 Rebate Coins \(฿100 value\)/)

    const esim = screen.getByTestId('rebate-deal-tourist-5g-esim')
    expect(esim).toHaveTextContent('📶 AIS / Airalo 5G Tourist eSIM (15GB)')
    expect(esim).toHaveTextContent(/฿175 Net/)
    expect(esim).toHaveTextContent(/\+6,000 Rebate Coins \(฿24 value\)/)

    const luggage = screen.getByTestId('rebate-deal-airportels-luggage-delivery')
    expect(luggage).toHaveTextContent('🧳 AIRPORTELs BKK-to-Hotel Luggage Delivery')
    expect(luggage).toHaveTextContent(/฿265 Net/)
    expect(luggage).toHaveTextContent(/\+5,300 Rebate Coins \(฿21 value\)/)

    const gowabi = screen.getByTestId('rebate-deal-gowabi-beauty-onsen-hangover-iv')
    expect(gowabi).toHaveTextContent('💆‍♀️ GoWabi Beauty, Onsen & Hangover IV Drip')
    expect(gowabi).toHaveTextContent(/Open to Travelers & Hosts/i)
    expect(within(gowabi).getByTestId('price-radar-gowabi-beauty-onsen-hangover-iv')).toHaveTextContent(
      /Walk-in: ฿900/,
    )
    expect(within(gowabi).getByTestId('price-radar-gowabi-beauty-onsen-hangover-iv')).toHaveTextContent(
      /Chon! VIP Rate: ฿420 THB/i,
    )

    expect(section).toBeInTheDocument()
    expect(REBATE_DEALS).toHaveLength(6)
  })

  it('credits each deal rebate coin amount through the callback when claimed', () => {
    const { onEarnRebateCoins } = renderPulseTab()

    fireEvent.click(screen.getByRole('button', { name: /Claim .*Rooftop Table for 2/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(1)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(25_000, expect.stringContaining('rebate'))

    fireEvent.click(screen.getByRole('button', { name: /Claim .*Sunset Dinner Cruise/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(2)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(13_750, expect.stringContaining('rebate'))

    fireEvent.click(screen.getByRole('button', { name: /Claim .*Muay Thai/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(3)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(25_000, expect.stringContaining('rebate'))

    fireEvent.click(screen.getByRole('button', { name: /Claim .*eSIM/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(4)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(6_000, expect.stringContaining('rebate'))

    fireEvent.click(screen.getByRole('button', { name: /Claim .*Luggage Delivery/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(5)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(5_300, expect.stringContaining('rebate'))

    fireEvent.click(screen.getByRole('button', { name: /Claim .*GoWabi/i }))
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(6)
    expect(onEarnRebateCoins).toHaveBeenCalledWith(8_000, expect.stringContaining('rebate'))
  })

  it('disables a claimed deal button so the rebate cannot be claimed twice', () => {
    const { onEarnRebateCoins } = renderPulseTab()

    const button = screen.getByRole('button', { name: /Claim .*Sunset Dinner Cruise/i })
    fireEvent.click(button)
    expect(button).toBeDisabled()
    expect(button).toHaveTextContent(/Claimed ✓ \+13,750 Coins added/)

    fireEvent.click(button)
    expect(onEarnRebateCoins).toHaveBeenCalledTimes(1)
  })

  it('works without an onEarnRebateCoins callback', () => {
    renderPulseTab({ onEarnRebateCoins: undefined })
    const button = screen.getByRole('button', { name: /Claim .*Muay Thai/i })
    expect(() => fireEvent.click(button)).not.toThrow()
    expect(button).toBeDisabled()
  })
})

describe('BkkPulseTab — 🍾 Reverse Hangout Table Drop (D-027)', () => {
  it('broadcasts a posted rooftop table and shows verified hosts tapping to clink', () => {
    renderPulseTab()

    const section = screen.getByRole('region', { name: /reverse hangout table drop/i })
    expect(within(section).getByRole('heading', { name: /Post My VIP Table Tonight!/i })).toBeInTheDocument()

    const postButton = screen.getByRole('button', {
      name: /🍾 Post My VIP Table — Invite Verified Hosts to Clink!/i,
    })
    expect(postButton).toBeInTheDocument()
    expect(screen.queryByTestId('reverse-drop-broadcast')).not.toBeInTheDocument()

    fireEvent.change(screen.getByTestId('reverse-drop-venue'), {
      target: { value: 'Tichuca Rooftop, Sukhumvit 55 (BTS Thong Lo)' },
    })
    fireEvent.click(postButton)

    const broadcast = screen.getByTestId('reverse-drop-broadcast')
    expect(broadcast).toHaveTextContent(/Broadcasting your Tichuca Rooftop, Sukhumvit 55/i)
    expect(screen.getByTestId('reverse-drop-host-nina')).toHaveTextContent(
      /🙋‍♀️ I'm free at 8 PM — Let's Clink!/i,
    )
    expect(DEMO_REVERSE_DROP_HOSTS.length).toBeGreaterThanOrEqual(3)

    const clinkButton = screen.getByTestId('clink-host-nina')
    expect(clinkButton).toHaveTextContent(/Let's Clink!/)
    fireEvent.click(clinkButton)
    expect(clinkButton).toBeDisabled()
    expect(clinkButton).toHaveTextContent(/Clinked 🥂/)
  })
})

describe('BkkPulseTab — 1-Tap Thai Taxi Driver Card & Tourist SOS (D-014)', () => {
  it('renders the Thai meter card with the selected Sukhumvit venue and its English gloss', () => {
    renderPulseTab()

    const section = screen.getByRole('region', {
      name: /1-Tap Thai taxi driver meter card and tourist SOS/i,
    })
    const card = within(section).getByTestId('taxi-driver-card')
    expect(card).toHaveTextContent(/รบกวนไปส่งที่/)
    expect(card).toHaveTextContent(/กรุณากดมิเตอร์ครับ\/ค่ะ/)
    expect(within(section).getByTestId('taxi-card-english')).toHaveTextContent(
      /Please take me to .* using the meter\./,
    )
    expect(formatTaxiCardThai('Tichuca')).toContain('กรุณากดมิเตอร์ครับ/ค่ะ')
    expect(formatTaxiCardEnglish('Tichuca')).toBe('Please take me to Tichuca using the meter.')
  })

  it('updates the card text when a different Sukhumvit venue is picked', () => {
    renderPulseTab()

    const card = screen.getByTestId('taxi-driver-card')
    expect(card).toHaveTextContent(/Tichuca Rooftop, Sukhumvit 55/)

    fireEvent.change(screen.getByTestId('taxi-venue-select'), {
      target: { value: 'Above Eleven, Sukhumvit 11' },
    })

    expect(card).toHaveTextContent(/Above Eleven, Sukhumvit 11/)
    expect(card).not.toHaveTextContent(/Tichuca/)
  })

  it('offers a 1-Tap Tourist Police 1155 SOS pill that dials straight out', () => {
    renderPulseTab()

    const pill = screen.getByRole('link', { name: /1-Tap Tourist Police 1155 emergency call/i })
    expect(pill).toHaveAttribute('href', 'tel:1155')
    expect(screen.getByTestId('tourist-sos-pill')).toHaveTextContent(/Tourist Police 1155/)
  })
})
