import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import DealsTab, {
  TOURIST_DEALS_CATALOG,
  KRING_CURATED_DEALS,
  THAILAND_SCAM_SHIELD_CARDS,
  DEAL_CITY_PILLS,
  DEAL_CATEGORY_PILLS,
} from '../DealsTab'
import TopUpModal from '../TopUpModal'
import B2BPartnerPitchModal from '../B2BPartnerPitchModal'
import { KRING_DODO_TEST_CHECKOUT_URL } from '../../lib/dodoCatalogConfig'
import { LanguageProvider } from '../../i18n/LanguageContext'

vi.mock('../../lib/haptics', () => ({
  triggerHaptic: vi.fn(),
}))

vi.mock('../../lib/sfx', () => ({
  playKring: vi.fn(),
}))

function renderDealsTab(props: React.ComponentProps<typeof DealsTab> = {}) {
  return render(
    <LanguageProvider>
      <DealsTab {...props} />
    </LanguageProvider>,
  )
}

describe('DealsTab — 28 BKK/Pattaya Deals, Zero-Scam Vetted Filter, 6 Street Scams Drawer & Zero-% UI Compliance', () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
    vi.clearAllMocks()
  })

  it('exports all 28 curated Bangkok & Pattaya deals (15 Bangkok + 13 Pattaya, including 8 Reddit-sworn Zero-Scam local gems)', () => {
    expect(TOURIST_DEALS_CATALOG).toHaveLength(28)
    expect(KRING_CURATED_DEALS).toBe(TOURIST_DEALS_CATALOG)

    const bkkDeals = TOURIST_DEALS_CATALOG.filter((d) => d.city === 'bangkok')
    const ptyDeals = TOURIST_DEALS_CATALOG.filter((d) => d.city === 'pattaya')
    const redditGems = TOURIST_DEALS_CATALOG.filter((d) => d.isRedditVerified)

    expect(bkkDeals).toHaveLength(15)
    expect(ptyDeals).toHaveLength(13)
    expect(redditGems).toHaveLength(8)

    for (const deal of TOURIST_DEALS_CATALOG) {
      expect(deal.serviceFeeBaht).toBe(25)
      expect(deal.walkInPriceBaht).toBeGreaterThan(deal.kringPriceBaht)
      expect(deal.hostBonusBaht).toBeGreaterThan(0)
    }
  })

  it('renders all 28 deals by default and filters accurately across All Thailand, Bangkok, and Pattaya & Koh Larn city pills', () => {
    renderDealsTab()

    expect(DEAL_CITY_PILLS).toHaveLength(3)
    expect(DEAL_CATEGORY_PILLS).toHaveLength(8)

    const catalogList = screen.getByTestId('deals-catalog-list')
    expect(within(catalogList).getAllByRole('article')).toHaveLength(28)

    fireEvent.click(screen.getByTestId('deals-city-bangkok'))
    expect(within(catalogList).getAllByRole('article')).toHaveLength(15)

    fireEvent.click(screen.getByTestId('deals-city-pattaya'))
    expect(within(catalogList).getAllByRole('article')).toHaveLength(13)

    fireEvent.click(screen.getByTestId('deals-city-all'))
    expect(within(catalogList).getAllByRole('article')).toHaveLength(28)
  })

  it('filters to the 8 Reddit-sworn Zero-Scam local gems when the 🛡️ Zero-Scam Vetted pill is toggled', () => {
    renderDealsTab()

    const zeroScamBtn = screen.getByTestId('deals-zero-scam-toggle')
    expect(zeroScamBtn).toHaveAttribute('aria-pressed', 'false')

    fireEvent.click(zeroScamBtn)
    expect(zeroScamBtn).toHaveAttribute('aria-pressed', 'true')

    const catalogList = screen.getByTestId('deals-catalog-list')
    const renderedCards = within(catalogList).getAllByRole('article')
    expect(renderedCards).toHaveLength(8)

    const expectedGemIds = [
      'bkk-nams-lady-drivers-pattaya-transfer',
      'pty-flintstones-private-taxi-transfer',
      'bkk-hidden-bangkok-longtail-canal-tour',
      'bkk-tailor-on-ten-sukhumvit-soi8',
      'bkk-perception-blind-massage-sathorn',
      'pty-real-divers-padi-5star-coral-dive',
      'pty-thai-sky-adventures-tandem-skydive',
      'bkk-sense-of-thai-wat-arun-costume',
    ]

    for (const gemId of expectedGemIds) {
      expect(screen.getByTestId(`deal-card-${gemId}`)).toHaveAttribute('data-reddit-verified', 'true')
      expect(screen.getByTestId(`deal-reddit-badge-${gemId}`)).toHaveTextContent('🛡️ Community-Vetted · Zero Tout')
      expect(screen.getByTestId(`deal-antiscam-note-${gemId}`)).toBeInTheDocument()
    }

    // Combine with Pattaya city filter -> 3 Pattaya Zero-Scam gems (Flintstones, Real Divers, Thai Sky Adventures)
    fireEvent.click(screen.getByTestId('deals-city-pattaya'))
    expect(within(catalogList).getAllByRole('article')).toHaveLength(3)

    // Combine with Bangkok city filter -> 5 Bangkok Zero-Scam gems
    fireEvent.click(screen.getByTestId('deals-city-bangkok'))
    expect(within(catalogList).getAllByRole('article')).toHaveLength(5)
  })

  it('opens and filters the 🛡️ 6 Street Scams We Block drawer and launches the linked antidote deal checkout sheet', () => {
    renderDealsTab()

    expect(THAILAND_SCAM_SHIELD_CARDS).toHaveLength(6)
    const drawerToggle = screen.getByTestId('deals-scam-shield-toggle')
    expect(drawerToggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByTestId('deals-scam-shield-sheet')).toBeNull()

    fireEvent.click(drawerToggle)
    expect(drawerToggle).toHaveAttribute('aria-expanded', 'true')
    const sheet = screen.getByTestId('deals-scam-shield-sheet')
    expect(sheet).toBeInTheDocument()

    for (const scam of THAILAND_SCAM_SHIELD_CARDS) {
      expect(screen.getByTestId(`scam-shield-card-${scam.id}`)).toBeInTheDocument()
    }

    // Filtering by Bangkok keeps 4 scam cards (2 Bangkok-specific + 2 All Thailand)
    fireEvent.click(screen.getByTestId('deals-city-bangkok'))
    expect(screen.getByTestId('scam-shield-card-scam-bkk-grand-palace-suit')).toBeInTheDocument()
    expect(screen.getByTestId('scam-shield-card-scam-all-thai-atm-dcc-trap')).toBeInTheDocument()
    expect(screen.queryByTestId('scam-shield-card-scam-pty-jetski-hull-scratch')).toBeNull()

    // Clicking Open Vetted Deal opens the linked deal checkout sheet (Tailor On Ten ฿3,200)
    fireEvent.click(screen.getByTestId('scam-shield-open-deal-scam-bkk-grand-palace-suit'))
    const checkoutSheet = screen.getByTestId('deal-checkout-voucher-sheet')
    expect(checkoutSheet).toHaveAttribute(
      'aria-label',
      'Tailor On Ten Sukhumvit Soi 8 (Bespoke Linen/Cotton Shirt + Suit Credit Voucher — Zero Street Tout)',
    )
  })

  it('supports Host Add-On View (+฿ Host Bonus) and Tourist 1-Tap Pay Gold-Foil QR Voucher issuance', () => {
    const onAttachDealToHangout = vi.fn()
    const onIssueGoldVoucher = vi.fn()
    renderDealsTab({ onAttachDealToHangout, onIssueGoldVoucher })

    // Switch to Host Add-On View
    fireEvent.click(screen.getByTestId('deals-mode-host'))
    expect(screen.getByTestId('deals-mode-host')).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('deal-host-bonus-pty-thai-sky-adventures-tandem-skydive')).toHaveTextContent(
      '+฿745 Host Bonus on QR Scan',
    )

    const attachBtn = screen.getByTestId('deal-host-attach-pty-thai-sky-adventures-tandem-skydive')
    fireEvent.click(attachBtn)
    expect(onAttachDealToHangout).toHaveBeenCalledTimes(1)
    expect(attachBtn).toHaveTextContent('✓ Attached (+฿745 Bonus)')

    // Switch back to Tourist View and issue Gold-Foil QR Voucher
    fireEvent.click(screen.getByTestId('deals-mode-tourist'))
    fireEvent.click(screen.getByTestId('deal-pick-btn-bkk-chao-phraya-dinner-cruise'))
    expect(screen.getByTestId('deal-one-tap-pay-step')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('deal-one-tap-pay-btn'))
    expect(screen.getByTestId('deal-gold-foil-voucher-card')).toBeInTheDocument()
    expect(screen.getByTestId('deal-voucher-qr-code')).toHaveTextContent('KRG-BKK-CRUISE-')
    expect(onIssueGoldVoucher).toHaveBeenCalledTimes(1)
  })

  it('enforces strict zero-% UI compliance across Tourist View, Host View, Scam Shield Drawer, and Gold-Foil Voucher Sheet', () => {
    const { container } = renderDealsTab()

    // 1. Default Tourist View (all 28 deals rendered)
    expect(container.textContent).not.toContain('%')

    // 2. Open the 6 Street Scams We Block drawer
    fireEvent.click(screen.getByTestId('deals-scam-shield-toggle'))
    expect(container.textContent).not.toContain('%')

    // 3. Open 1-Tap Pay Checkout Sheet & flip to Gold-Foil QR Voucher
    fireEvent.click(screen.getByTestId('deal-pick-btn-bkk-chao-phraya-dinner-cruise'))
    expect(container.textContent).not.toContain('%')
    fireEvent.click(screen.getByTestId('deal-one-tap-pay-btn'))
    expect(container.textContent).not.toContain('%')

    // 4. Switch to Host Add-On View
    fireEvent.click(screen.getByTestId('deals-mode-host'))
    expect(container.textContent).not.toContain('%')
  })

  it('wires KRING_DODO_CATALOG product_ids into TopUpModal (฿750/฿1,200/฿1,600), B2BPartnerPitchModal (฿1,990/mo Pin & ฿3,990/mo Featured Slot), and DealsTab checkout', () => {
    const onSelectDodoCheckout = vi.fn()
    const { container: topUpContainer, unmount: unmountTopUp } = render(
      <TopUpModal open={true} onClose={vi.fn()} initialThbAmount={750} onSelectDodoCheckout={onSelectDodoCheckout} />,
    )

    expect(topUpContainer.textContent).not.toContain('%')
    expect(screen.getByTestId('topup-dodo-checkout-btn')).toHaveAttribute('data-product-id', 'pdt_0NqU0YTgQV6SlWgiYuzBi')
    expect(screen.getByTestId('topup-dodo-checkout-btn')).toHaveAttribute('data-checkout-url', KRING_DODO_TEST_CHECKOUT_URL)

    fireEvent.click(screen.getByTestId('topup-dodo-tier-1200'))
    expect(screen.getByTestId('topup-dodo-checkout-btn')).toHaveAttribute('data-product-id', 'pdt_0NqU0YXtp22QEzxcTqn76')

    fireEvent.click(screen.getByTestId('topup-dodo-tier-1600'))
    expect(screen.getByTestId('topup-dodo-checkout-btn')).toHaveAttribute('data-product-id', 'pdt_0NqU0YbOcrbkdhD8PWvqg')

    fireEvent.click(screen.getByTestId('topup-dodo-checkout-btn'))
    expect(onSelectDodoCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pdt_0NqU0YbOcrbkdhD8PWvqg',
        thbBaseAmount: 1600,
        thbServiceFee: 25,
      }),
      KRING_DODO_TEST_CHECKOUT_URL,
    )
    unmountTopUp()

    const onSelectB2BCheckout = vi.fn()
    const { container: b2bContainer, unmount: unmountB2b } = render(
      <B2BPartnerPitchModal open={true} onClose={vi.fn()} onSelectB2BCheckout={onSelectB2BCheckout} />,
    )

    expect(b2bContainer.textContent).not.toContain('%')
    expect(screen.getByTestId('b2b-activate-dodo-btn')).toHaveAttribute('data-product-id', 'pdt_0NqU0YfwRAmkE1B9Rk0ZQ')

    fireEvent.click(screen.getByTestId('b2b-plan-featured-slot-3990'))
    expect(screen.getByTestId('b2b-activate-dodo-btn')).toHaveAttribute('data-product-id', 'pdt_0NqU0YjuhmvXSInm5b26a')

    fireEvent.click(screen.getByTestId('b2b-activate-dodo-btn'))
    expect(onSelectB2BCheckout).toHaveBeenCalledWith(
      expect.objectContaining({
        productId: 'pdt_0NqU0YjuhmvXSInm5b26a',
        thbBaseAmount: 3990,
      }),
      KRING_DODO_TEST_CHECKOUT_URL,
    )
    unmountB2b()
  })
})
