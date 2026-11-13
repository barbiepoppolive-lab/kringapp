import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WalletTimeline from '../components/vip/WalletTimeline'
import WalletHome from '../components/vip/WalletHome'
import LocalEarnings from '../components/wallet/LocalEarnings'
import { VisitorsPage } from '../components/vip/WalletPages'
import { __resetRolledBalance, cashThbOf, handleFromName, localReadyThb } from '../components/vip/walletKit'
import { guestMoneyRows } from '../components/wallet/bookingMoney'
import { __resetPlanStore, acceptOffer, counterOffer, createOffer, getPlanStore, recordGuestHold, recordReceivedGift, seedHostRequests, hostAct } from '../lib/planStore'
import { installKringBridge } from '../lib/kringBridge'
import { PRESENCE_EVENT } from '../context/presence'
import { AuthProvider } from '../context/AuthContext'

/**
 * KRING FIX2 · F2 — the wallet tells one money story: one row per booking (the Book-a-local sheet's own hold folds
 * in), gifts in their own group, no paid time extensions, cash and promo apart, and a new Local sees her real ฿0 with
 * a labelled example month instead of an invented one.
 */

const signIn = (userId: string, role = 'guest', displayName = 'Demo Traveler', isDemoMode = true) =>
  window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId, role, displayName, isDemoMode }))

let accepted = true
const onDelta = (e: Event) => {
  ;(e as CustomEvent<{ accepted?: boolean }>).detail.accepted = accepted
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  signIn('wei-1')
  __resetPlanStore()
  __resetRolledBalance()
  accepted = true
  window.addEventListener('chon:wallet-delta', onDelta)
})
afterEach(() => {
  window.removeEventListener('chon:wallet-delta', onDelta)
  cleanup()
  vi.useRealTimers()
})

const bkkDate = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)
const bkkClock = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(11, 16)

describe('Wei 2 · the ledger adds up: the sheet hold folds into its booking', () => {
  it('sheet hold ฿1,000 (ref sheet-kwan) + ฿200 on accept = ONE −฿1,200 booking row, never a dangling −฿1,000', () => {
    const now = Date.now()
    const start = now + 2 * 24 * 3600_000
    recordGuestHold('kwan', 'Kwan', 1000, now)
    const o = createOffer(
      { localId: 'kwan', localName: 'Kwan', experienceTitle: 'Street-food walk', terms: { priceThb: 1000, date: bkkDate(start), start: bkkClock(start), venue: 'Yaowarat Rd' } },
      'guest',
      now + 50,
      { adoptHold: true, demoReply: false },
    )!
    expect(o.holdKey).toBe('kwan')
    counterOffer(o.id, 'host', 1200, now + 5_000)
    const b = acceptOffer(o.id, 'guest', now + 60_000)!
    expect(b).toBeTruthy()
    // what the wallet recorded (the same shape walletKit's recorder writes)
    window.localStorage.setItem(
      'chon_wallet_activity_v1',
      JSON.stringify([
        { id: 'a3', kind: 'topup', label: 'Top up · PromptPay', deltaCoins: 20_000, at: now + 59_000 },
        { id: 'a2', kind: 'clink', label: 'Booking', who: 'Kwan', ref: o.id, deltaCoins: -20_000, at: now + 60_000 },
        { id: 'a1', kind: 'clink', label: 'Booking', who: 'Kwan', ref: 'sheet-kwan', deltaCoins: -100_000, at: now + 100 },
      ]),
    )
    expect(guestMoneyRows(getPlanStore())[0].sheetRefs).toContain('sheet-kwan')
    render(<WalletTimeline mode="traveller" isDemoMode coinsPerThb={100} />)
    const holds = screen.getAllByTestId('wallet-timeline-hold')
    expect(holds).toHaveLength(1)
    expect(holds[0]).toHaveTextContent('Street-food walk · Kwan')
    expect(holds[0]).toHaveTextContent('−฿1,200')
    const tl = screen.getByTestId('wallet-timeline')
    expect(tl).not.toHaveTextContent('−฿1,000')
    expect(tl).not.toHaveTextContent('−฿200')
    expect(tl).toHaveTextContent('+฿200') // the cash top-up is real money in, it stays
    expect(tl).not.toHaveTextContent(/Tonight/)
  })
})

describe('Gifts stay — as their own group, baht, never inside a booking', () => {
  it('a guest’s thank-you shows under "Gifts · thank-yous" with her 80 %, apart from the booking rows', () => {
    signIn('ploy-1', 'host', 'ploy.host', false)
    seedHostRequests([{ id: 'sarah', guest: 'Sarah', flag: '🇬🇧', venue: 'Yaowarat', time: '14:00', offerThb: 1200, receiveThb: 960, noShowThb: 150, minutesAgo: 3 }])
    hostAct('sarah', 'accepted')
    act(() => {
      recordReceivedGift('sarah', { emoji: '🪷', name: 'Lotus', nameTh: 'ดอกบัว', thb: 500 })
    })
    render(<WalletTimeline mode="host" isDemoMode={false} coinsPerThb={100} />)
    const group = screen.getByTestId('wallet-timeline-gifts')
    expect(group).toHaveTextContent('Gifts · thank-yous')
    expect(group).toHaveTextContent('Thank-you gift from Sarah')
    expect(group).toHaveTextContent('+฿400')
    expect(screen.getByTestId('wallet-timeline-gift')).toBeInTheDocument()
    // the money groups above never contain the gift
    for (const g of screen.getByTestId('wallet-timeline').querySelectorAll('.wl-tl-grp:not(.is-gifts)')) expect(g.textContent).not.toContain('Thank-you')
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent(/rose|ต่อเวลา|Extended|Extension/i)
  })
})

describe('Ploy 35–38 · a brand-new Local sees her real ฿0; the example month is labelled and never mixed in', () => {
  it('real numbers by default (zeros + friendly empty state), then a labelled Example month that cannot be withdrawn', () => {
    signIn('ploy-1', 'host', 'ploy.host', true)
    expect(localReadyThb(getPlanStore(), true, 0)).toBe(0)
    render(<LocalEarnings readyThb={0} isDemoMode canWithdraw blockedReason={undefined} onWithdraw={() => {}} />)
    expect(screen.getByTestId('wallet-local-month')).toHaveTextContent('฿0')
    expect(screen.getByTestId('wallet-local-pending')).toHaveTextContent('฿0')
    expect(screen.getByTestId('wallet-local-empty')).toHaveTextContent('Your first booking lands here')
    expect(screen.queryByTestId('wallet-source-extensions')).toBeNull()
    expect(screen.getByTestId('wallet-local-earnings')).not.toHaveTextContent(/13,140|Extension|ต่อเวลา/)

    fireEvent.click(screen.getByTestId('wallet-local-example'))
    expect(screen.getByTestId('wallet-local-earnings')).toHaveAttribute('data-example', 'true')
    expect(screen.getByTestId('wallet-local-example-note')).toHaveTextContent('Not your money')
    expect(screen.getByTestId('wallet-local-month')).not.toHaveTextContent('฿0')
    expect(screen.getByTestId('wallet-home-cashout')).toBeDisabled()
    expect(screen.getByTestId('wallet-home-cashout')).toHaveTextContent('Example only')
    expect(screen.getByTestId('wallet-source-gifts')).toHaveTextContent('Gifts')
    fireEvent.click(screen.getByTestId('wallet-source-gifts'))
    expect(screen.getByTestId('wallet-source-page')).toHaveTextContent('Gifts · thank-yous')
    expect(screen.getByTestId('wallet-source-page')).toHaveTextContent('Thank-you gift · Mia')
    expect(screen.getByTestId('wallet-source-page')).not.toHaveTextContent(/Lotus|Jasmine/)
    expect(screen.getByTestId('wallet-local-earnings')).not.toHaveTextContent(/Extension|ต่อเวลา|\+1 h/)

    fireEvent.click(screen.getByTestId('wallet-local-mine'))
    expect(screen.getByTestId('wallet-local-month')).toHaveTextContent('฿0')
  })

  it('a real (non-demo) account has no example switch at all', () => {
    signIn('ploy-2', 'host', 'ploy.host', false)
    render(<LocalEarnings readyThb={0} isDemoMode={false} canWithdraw={false} onWithdraw={() => {}} />)
    expect(screen.queryByTestId('wallet-local-example-toggle')).toBeNull()
    expect(screen.getByTestId('wallet-local-empty')).toBeInTheDocument()
  })

  it('profile views: 0 by default in demo too; the example is labelled', () => {
    signIn('ploy-1', 'host', 'ploy.host', true)
    render(
      <AuthProvider>
        <VisitorsPage open onBack={() => {}} />
      </AuthProvider>,
    )
    expect(screen.getByTestId('views-total')).toHaveTextContent('0 views this week')
    fireEvent.click(screen.getByTestId('views-example'))
    expect(screen.getByTestId('views-total')).toHaveTextContent('example')
  })
})

describe('One money truth · cash and promo are always apart', () => {
  const hostProps = { readyThb: 0, points: 0, feeThb: 0, canCashOut: false, onConfirmCashout: () => {} }
  it('the Wallet card’s big number is cash only; promo is its own line', () => {
    render(
      <WalletHome mode="traveller" onModeChange={() => {}} grantedByAuth={[]} language="en" paidCoins={20_000} bonusCoins={100_000} isDemoMode host={hostProps} activeHosts={0} friendPaidCoins={0} />,
    )
    const big = screen.getByTestId('wallet-card-balance')
    expect(big.textContent?.replace(/[^\d.,฿]/g, '')).toContain('200')
    expect(big.textContent).not.toContain('1,200')
    expect(screen.getByTestId('wallet-card-split')).toHaveTextContent('promo')
    expect(screen.getByTestId('wallet-card-split')).toHaveTextContent('not bookings')
    expect(screen.getByTestId('wallet-metal-card').getAttribute('aria-label')).toMatch(/^Cash ฿200\.00, plus ฿1,000 promo/)
    expect(cashThbOf({ paid: 20_000 })).toBe(200)
    expect(cashThbOf({ paidCoins: 20_000 })).toBe(200)
  })
})

describe('Ploy 4 · going Live reaches the catalogue without a reload', () => {
  it('a role switch re-announces presence once the new session is stored', () => {
    vi.useFakeTimers()
    const off = installKringBridge()
    const seen = vi.fn()
    window.addEventListener(PRESENCE_EVENT, seen)
    window.dispatchEvent(new CustomEvent('kring:role-changed', { detail: { role: 'local', source: 'profile' } }))
    expect(seen).not.toHaveBeenCalled()
    vi.runAllTimers()
    expect(seen).toHaveBeenCalledTimes(1)
    window.removeEventListener(PRESENCE_EVENT, seen)
    off()
  })
})

describe('Ploy 9 · share handles are ASCII', () => {
  it('kringapp.com/@ploy, never @พลอย', () => {
    expect(handleFromName('พลอย')).toBe('ploy')
    expect(handleFromName('Kwan')).toBe('kwan')
    // the invite card and the agency link both build on walletKit.handleFromName → never Thai script in a URL
    expect(`kringapp.com/@${handleFromName('พลอย')}`).toMatch(/^kringapp\.com\/@[a-z0-9_.]+$/)
  })
})

describe('KRING FIX3 · F2 polish', () => {
  it('Marco 4 · a rolling figure never shows "฿000" — leading reels are blank, the comma hides with them', async () => {
    const { RollingBaht } = await import('../components/wallet/kringKit')
    const { container, rerender } = render(<RollingBaht value={0} fromZero={false} decimals />)
    rerender(<RollingBaht value={1500} fromZero={false} decimals />)
    // first frame after the change: target shape ฿1,500.00, shown still 0 → the three leading reels sit on the blank
    const reels = [...container.querySelectorAll('.kw-roll-d')].map((d) => (d as HTMLElement).style.getPropertyValue('--d'))
    expect(reels.slice(0, 3)).toEqual(['-1', '-1', '-1'])
    expect(reels[3]).toBe('0')
    expect(container.querySelector('.kw-roll-s.is-blank')?.textContent).toBe(',')
    // r4: blank reels collapse (class is-blank → width 0), so ฿ sits next to the first real digit
    expect(container.querySelectorAll('.kw-roll-d.is-blank')).toHaveLength(3)
    expect(container.querySelector('.sr-only')?.textContent).toBe('฿1,500.00')
  })

  it('Marco 4 · the "say Live" moment is its own event (header pill flips with the title)', async () => {
    const { announceLiveShown, LIVE_SHOWN_EVENT } = await import('../context/presence')
    const seen = vi.fn()
    window.addEventListener(LIVE_SHOWN_EVENT, (e) => seen((e as CustomEvent).detail.state))
    announceLiveShown('live')
    announceLiveShown('paused')
    expect(seen.mock.calls.map((c) => c[0])).toEqual(['live', 'paused'])
  })

  it('founder · the invite shares to LINE, WeChat and 小红书 with an ASCII link', async () => {
    const { InvitePage } = await import('../components/vip/WalletPages')
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, name: 'พลอย' }))
    render(<InvitePage open onBack={() => {}} friendPaidCoins={0} />)
    expect(screen.getByTestId('invite-share-line')).toBeInTheDocument()
    expect(screen.getByTestId('invite-share-wechat')).toHaveTextContent('WeChat')
    expect(screen.getByTestId('invite-share-xhs')).toHaveTextContent('小红书')
    expect(screen.getByTestId('invite-link')).toHaveTextContent(/kringapp\.com\/@[a-z0-9_.]+/)
    expect(screen.getByTestId('invite-link')).not.toHaveTextContent('พลอย')
  })
})

describe('KRING FIX3 r4 · Wei: top-up offers exactly what is missing', () => {
  it('need ฿1,500 → ฿1,500 first (then ฿3,000), never only ฿3,000; no need → the usual presets', async () => {
    const { amountChoices } = await import('../components/wallet/TopUpSheet')
    expect(amountChoices(1500)).toEqual([1500, 3000])
    expect(amountChoices(200)).toEqual([200, 500, 1000, 3000])
    expect(amountChoices(37.2)).toEqual([38, 200, 500, 1000])
    expect(amountChoices()).toEqual([200, 500, 1000, 3000])
  })

  it('KRING_AGENCY_PLAN & KRING_PAYOUT_LEAKS · Kring Partners (≈฿29/booking in Baht, never %), tiered card settlement (3–5d Trusted / 14d New) and unified Monday/฿15 host payout rule', async () => {
    const { agencyTierInfo } = await import('../components/vip/WalletPages')
    const AgencyDashboard = (await import('../components/wallet/AgencyDashboard')).default
    expect(agencyTierInfo(1).current).toBe(4)
    expect(agencyTierInfo(5).current).toBe(4)
    expect(agencyTierInfo(15).current).toBe(4)
    expect(agencyTierInfo(30).current).toBe(5)

    render(<AgencyDashboard activeHosts={6} isDemoMode />)
    expect(screen.getByTestId('agency-panel-earn')).toHaveTextContent('Kring Partner · ≈฿29 per booking (6 mo)')
    expect(screen.getByTestId('agency-panel-earn')).toHaveTextContent('+ ฿150 after 3 bookings')
    expect(screen.getByTestId('agency-panel-earn')).toHaveTextContent('businesses & groups only')
    fireEvent.click(screen.getByTestId('agency-tab-manage'))
    expect(screen.getByTestId('agency-local-ploy')).toHaveTextContent('฿282')
    expect(screen.getByTestId('agency-local-mint')).toHaveTextContent('฿183')
    expect(screen.getByTestId('agency-local-nok')).toHaveTextContent('฿144')
    expect(screen.getByTestId('agency-local-ton')).toHaveTextContent('฿87')
    fireEvent.click(screen.getByTestId('agency-tab-data'))
    expect(screen.getByTestId('agency-panel-data')).toHaveTextContent('฿696')
    cleanup()

    render(<LocalEarnings readyThb={500} isDemoMode canWithdraw onWithdraw={() => {}} />)
    expect(screen.getByTestId('wallet-host-fee-rule')).toHaveTextContent('Trip fees go straight to PromptPay at กริ๊ง! · Gift rewards paid free Mondays (≥฿500) or ฿15 now')
    fireEvent.click(screen.getByTestId('wallet-local-pending'))
    expect(screen.getByTestId('wallet-pending-sheet')).toHaveTextContent('cards take 3–5 days (14d for new Locals)')
  })

  it('Standalone PWA manifest + ?install=1 renders borderless 1-tap pwa-install-banner', async () => {
    const manifest = (await import('../../public/manifest.json')).default
    expect(manifest.name).toBe('Kring') // 6 Nov lock: name + launcher name = "Kring" ("Bangkok Locals" is banned wording)
    expect(manifest.short_name).toBe('Kring')
    expect(manifest.display).toBe('standalone')
    expect(manifest.orientation).toBe('portrait')
    expect(manifest.background_color).toBe('#12123A') // 6 Nov lock: Midnight #12123A
    expect(manifest.theme_color).toBe('#12123A')
    expect(manifest.start_url).toBe('/app/') // TWA start URL

    const prevHref = window.location.href
    window.history.replaceState({}, '', '/?coins=100000&install=1')
    try {
      const App = (await import('../App')).default
      render(<App />)
      const banner = screen.getByTestId('pwa-install-banner')
      expect(banner).toHaveTextContent('Install Kring App')
      expect(banner).toHaveTextContent('Continue')
      fireEvent.click(screen.getByRole('button', { name: 'Install Kring App' }))
      expect(banner).toHaveTextContent('Tap Share ⬆️ → Add to Home Screen')
      const buttons = banner.querySelectorAll('button')
      fireEvent.click(buttons[buttons.length - 1]!)
      expect(screen.queryByTestId('pwa-install-banner')).toBeNull()
    } finally {
      window.history.replaceState({}, '', prevHref)
    }
  })
})

