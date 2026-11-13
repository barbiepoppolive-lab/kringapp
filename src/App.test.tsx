import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { AUTH_STORAGE_KEY, DEMO_TRAVELER_SESSION } from './context/AuthContext'
import { translations } from './i18n/translations'

beforeEach(() => {
  window.localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ ...DEMO_TRAVELER_SESSION, isDemoMode: false }),
  )
})

describe('App shell', () => {
  it('renders the Kring brand', () => {
    render(<App />)
    expect(screen.getByRole('heading', { name: /kring/i })).toBeInTheDocument()
    expect(screen.getByText('Real locals. Fair prices.')).toBeInTheDocument()
  })

  it('renders all 4 navigation tabs cleanly', () => {
    render(<App />)
    const tabs = [
      '✦ Experiences',
      '฿ Kring Price',
      '💬 Chats',
      '👤 Me',
    ] as const

    for (const label of tabs) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }

    const buttons = screen.getAllByRole('button')
    expect(buttons.length).toBeGreaterThanOrEqual(21)
    expect(screen.getByRole('button', { name: '✦ Experiences' })).toHaveAttribute('aria-current', 'page')
  })

  it('switches panels when a tab is tapped', () => {
    render(<App />)
    expect(screen.getByText(/Verified locals\. Public venues\. Fair prices\./i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))

    expect(screen.getByText(/Your baht: cash, promo, held and released/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '👤 Me' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('3-way language switcher (EN / ไทย / 中文)', () => {
  it('shows three pills with English active by default', () => {
    render(<App />)
    expect(screen.getByRole('group', { name: /language/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '中文' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches header tagline and tab copy across EN, TH and ZH', () => {
    render(<App />)
    expect(screen.getByText('Real locals. Fair prices.')).toBeInTheDocument()
    expect(screen.getByText(/Verified locals\. Public venues\. Fair prices\./i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ไทย' }))
    expect(screen.getByRole('button', { name: 'ไทย' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('เที่ยวกับโลคอลตัวจริง ในราคากันเอง')).toBeInTheDocument()
    expect(screen.getByText(/โลคอลตัวจริง เจอกันที่สาธารณะ ราคากันเอง/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '中文' }))
    expect(screen.getByRole('button', { name: '中文' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('真本地人 · 公道价')).toBeInTheDocument()
    expect(screen.getByText(/认证本地人 · 公共场所 · 公道价/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('Real locals. Fair prices.')).toBeInTheDocument()
    expect(screen.getByText(/Verified locals\. Public venues\. Fair prices\./i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('translates all 4 tab panels into each language', () => {
    render(<App />)
    expect(screen.getByText('✦ Experiences')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ไทย' }))
    expect(screen.getByText('✦ ประสบการณ์')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    expect(screen.getByText('👤 ฉัน')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '中文' }))
    expect(screen.getByText('👤 我')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'EN' }))
    expect(screen.getByText('👤 Me')).toBeInTheDocument()
    expect(screen.getByText(/Your baht: cash, promo, held and released/i)).toBeInTheDocument()
  })

  it('keeps every Chon! playful term translated and zero-stigma in EN, TH and ZH', () => {
    const forbidden = /auction|pimp|start price|bid on|buy a girl/i

    for (const lang of ['en', 'th', 'zh'] as const) {
      const terms = Object.values(translations[lang].terms)
      expect(terms.length).toBeGreaterThanOrEqual(8)
      for (const term of terms) {
        expect(term).not.toMatch(forbidden)
      }
      expect(translations[lang].terms.hangoutDrop).toContain('Hangout Drop')
      expect(translations[lang].terms.outingTreatGoal).toContain('Outing Treat Goal')
      expect(translations[lang].terms.frontRowVips).toContain('Front-Row VIPs')
      expect(translations[lang].terms.letsGo).toContain("Let's Go!")
    }
  })
})

describe('Phase 2 wiring — header wallet & quick rewards pill', () => {
  it('shows the live ฿1,000 balance (100,000 ledger coins), Daily Tasks & Rewards pill, and no 2% POT in header (BUG-034)', () => {
    render(<App />)

    expect(screen.getByTestId('header-wallet-balance')).toHaveTextContent('฿1,000')
    expect(screen.getByRole('button', { name: /daily tasks & rewards/i })).toBeInTheDocument()
    const header = document.querySelector('header')
    expect(header?.textContent ?? '').not.toMatch(/2%\s*POT/i)
  })

  it('opens the Tasks & Games drawer from any tab and closes it again', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    expect(screen.queryByRole('region', { name: /Newcomer Starter Chest/i })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /daily tasks & rewards/i }))

    // OPT-011: the rewards drawer is a lazy chunk now → await its first paint
    expect(
      await screen.findByRole('heading', { name: /9 PM BKK 2% Daily Lucky Jackpot Pool 🎰/i }, { timeout: 5000 }),
    ).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Newcomer Starter Chest/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /15 second habit mini games/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /close rewards drawer/i }))
    expect(
      screen.queryByRole('heading', { name: /9 PM BKK 2% Daily Lucky Jackpot Pool 🎰/i }),
    ).not.toBeInTheDocument()
  })

  it('spends coins from the shared wallet and pays Bonus Coins for tutorial claims', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /daily tasks & rewards/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Claim reward for Watch 1 Live 10s Story/i }, { timeout: 5000 }))
    expect(screen.getByText(/Bonus Coin balance:/)).toHaveTextContent('500')

    for (let round = 0; round < 3; round += 1) {
      fireEvent.click(screen.getByRole('button', { name: /shake the dice/i }))
    }

    expect(screen.getByTestId('header-wallet-balance')).toHaveTextContent('฿994')
    expect(screen.getByText(/Spent/)).toHaveTextContent('600')
    expect(screen.getByRole('button', { name: /Claim reward for Watch 1 Live 10s Story/i })).toBeDisabled()
  })
})

describe('Phase 2 wiring — Meet feed tab', () => {
  it('renders the 2x2 Meet feed grid, Live Story rail and Daily Mystery Clink under the tab copy', () => {
    render(<App />)

    expect(screen.getByText(/Verified locals\. Public venues\. Fair prices\./i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '✦ Experiences' })).toBeInTheDocument()

    const hostCards = screen.getAllByTestId('meet-host-card')
    expect(hostCards).toHaveLength(4)
    expect(within(hostCards[0]).getByText(/Mint · Siam/)).toBeInTheDocument()
    expect(within(hostCards[0]).getByText(/📍 Nara Salon, Siam Square/)).toBeInTheDocument()
    expect(within(hostCards[0]).getByText(/✓ Verified local · ID checked/)).toBeInTheDocument()
    expect(within(hostCards[0]).getByText(/Hair & nails at Nara Salon/)).toBeInTheDocument()

    expect(screen.getAllByRole('button', { name: /Open 10s live story from/ })).toHaveLength(4)
    expect(screen.getByText('Story Toasts today: 0 / 3')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /1,000c daily mystery clink/i }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('marquee', { name: /live win ticker/i })).toBeNull()
  })

  it('opens the Layer 2 dual gift sheet and Layer 3 MuvMi / Grab ride pass from a 🥂 Chon! tap', () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole('button', { name: /^Book Mint/ })[0])

    const sheet = screen.getByTestId('clink-gift-sheet')
    expect(within(sheet).getByRole('heading', { name: /Book Mint/ })).toBeInTheDocument()
    expect(within(sheet).getByTestId('envelope-header')).toHaveTextContent(/Held/)
    expect(within(sheet).getByTestId('held-safely')).toHaveTextContent(/Held Safely/)
    expect(within(sheet).getByTestId('treat-vip-tuktuk-ride')).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('tab', { name: /Lucky Chon!/ }))
    expect(within(sheet).getByTestId('lucky-panel')).toBeInTheDocument()
    expect(within(sheet).getByTestId('combo-9')).toBeInTheDocument()
    expect(within(sheet).getByTestId('lucky-golden-siam-elephant')).toBeInTheDocument()

    fireEvent.click(within(sheet).getByRole('tab', { name: /Thai Vibe Treats/ }))
    fireEvent.click(within(sheet).getByTestId('treat-vip-tuktuk-ride'))
    fireEvent.click(within(sheet).getByTestId('treat-send-button'))

    expect(within(sheet).getByTestId('ride-card')).toBeInTheDocument()
    expect(within(sheet).getByTestId('grab-deep-link').getAttribute('href')).toContain(
      'grab://open?screenType=TRANSPORT&dropoffLatitude=13.7',
    )
    expect(within(sheet).getByTestId('muvmi-deep-link').getAttribute('href')).toContain(
      'https://muvmi.co/?dropoffLatitude=13.7',
    )

    fireEvent.click(within(sheet).getByRole('button', { name: /close clink sheet/i }))
    expect(screen.queryByTestId('clink-gift-sheet')).not.toBeInTheDocument()
  })
})

describe('Phase 2 wiring — VIP & Wallet tab', () => {
  it('renders the Agency & Referral Hub above the Phase 1 Account and privacy vault cards', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))

    expect(screen.getByText(/Your baht: cash, promo, held and released/i)).toBeInTheDocument()
    // OPT-011: VIP hub is a lazy chunk → await its first paint
    expect(await screen.findByRole('heading', { name: /Cashout, Referral & Agency Hub/ }, { timeout: 5000 })).toBeInTheDocument()

    const hub = screen.getByRole('region', { name: /Fast working class PromptPay cashout/i })
    const accountCard = screen.getByRole('heading', { name: 'Account' })
    expect(hub.compareDocumentPosition(accountCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // KRING FIX1 · the legacy "Privacy Vault, Ghost Profile & Host Studio" preview block was removed from the Wallet tab
    expect(screen.queryByRole('heading', { name: /Phase 1 preview/ })).not.toBeInTheDocument()

    expect(screen.getByText(/Day-1 First-Trust Floor: 10,000 Points \(฿100 THB\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Cash out ฿500 to PromptPay/i })).toBeEnabled()
    expect(screen.getByRole('region', { name: /Self funding 555 baht referral tracker/i })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /3-Tier agency franchise hub/i })).toBeInTheDocument()
    expect(screen.getByText(/Bangkok Creator Squad/)).toBeInTheDocument()
    expect(screen.getByTestId('example-earnings-calculator')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: /Agency roster lock/i })).toBeInTheDocument()
    expect(screen.getByText('฿0 50/50 Split (0 Coins)')).toBeInTheDocument()

    const nudge = screen.getByRole('link', { name: /Nudge Friend on LINE/i })
    expect(nudge.getAttribute('href')).toContain('https://line.me/R/msg/text/?')

    fireEvent.click(screen.getByRole('button', { name: /Log out/i }))
    expect(screen.queryByRole('region', { name: /3-Tier agency franchise hub/i })).not.toBeInTheDocument()
  })

  it('queues a same-night PromptPay payout from the fast cashout card after linking PromptPay', async () => {
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: '👤 Me' }))
    const hub = await screen.findByRole('region', { name: /Fast working class PromptPay cashout/i }, { timeout: 5000 })
    expect(within(hub).getByRole('status')).toHaveTextContent(/Ready to send ฿500 to PromptPay/)

    fireEvent.change(screen.getByTestId('fast-cashout-bank-input'), {
      target: { value: '089-999-1111' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Cash out ฿500 to PromptPay/i }))

    expect(within(hub).getByText(/Payout request sent/)).toBeInTheDocument()
    // KRING FIX1 · baht only (no Points/coins wording in the Wallet note)
    expect(screen.getByText(/PromptPay payout #1 queued/)).toHaveTextContent('PromptPay payout #1 queued — ฿500 · fee ฿0.')
  })
})

describe('Phase 2 wiring — global keyboard navigation', () => {
  it('keeps the ArrowUp / ArrowDown / PageUp / PageDown scroll handler working', () => {
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})

    try {
      render(<App />)

      fireEvent.keyDown(window, { key: 'ArrowDown' })
      expect(scrollBy).toHaveBeenCalledWith({ top: 110, behavior: 'smooth' })

      fireEvent.keyDown(window, { key: 'ArrowUp' })
      expect(scrollBy).toHaveBeenCalledWith({ top: -110, behavior: 'smooth' })

      fireEvent.keyDown(window, { key: 'PageDown' })
      expect(scrollBy).toHaveBeenCalledWith({
        top: Math.round(window.innerHeight * 0.75),
        behavior: 'smooth',
      })

      fireEvent.keyDown(window, { key: 'PageUp' })
      expect(scrollBy).toHaveBeenCalledWith({
        top: -Math.round(window.innerHeight * 0.75),
        behavior: 'smooth',
      })
    } finally {
      scrollBy.mockRestore()
    }
  })
})
