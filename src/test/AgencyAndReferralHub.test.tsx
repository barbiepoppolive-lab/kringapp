import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import AgencyAndReferralHub, {
  cashoutFloorPoints,
  pointsToThb,
  summarizeReferralProgress,
  type AgencyAndReferralHubProps,
  type CashoutRequest,
  type RosterReleaseRequest,
} from '../components/vip/AgencyAndReferralHub'
import { DEFAULT_PLATFORM_CONFIG } from '../lib/configDefaults'

function renderHub(options: Partial<AgencyAndReferralHubProps> = {}) {
  cleanup()
  const onRequestCashout = vi.fn()
  const onNudgeFriend = vi.fn()
  const onApproveRosterRelease = vi.fn()
  const onPayInstantRosterRelease = vi.fn()

  render(
    <AgencyAndReferralHub
      onRequestCashout={onRequestCashout}
      onNudgeFriend={onNudgeFriend}
      onApproveRosterRelease={onApproveRosterRelease}
      onPayInstantRosterRelease={onPayInstantRosterRelease}
      {...options}
    />,
  )

  return { onRequestCashout, onNudgeFriend, onApproveRosterRelease, onPayInstantRosterRelease }
}

function cashoutRegion() {
  return screen.getByRole('region', { name: /PromptPay cashout/i })
}

function referralRegion() {
  return screen.getByRole('region', { name: /555 baht referral tracker/i })
}

function referralStep(step: number, name: string) {
  return screen.getByRole('listitem', { name: new RegExp(`Referral step ${step}: ${name}`, 'i') })
}

describe('AgencyAndReferralHub — Fast Working-Class PromptPay Cashout (D-023)', () => {
  it('offers the ฿100 (10,000 Points) Day-1 first-trust cashout on the 1st lifetime payout', () => {
    const { onRequestCashout } = renderHub({ cashablePoints: 10_000, completedPayouts: 0 })

    const card = cashoutRegion()
    expect(card).toHaveTextContent(/100 Points = ฿1 THB/)
    expect(card).toHaveTextContent(/Day-1 First-Trust Floor/)
    expect(card).toHaveTextContent('10,000 Points')
    expect(card).toHaveTextContent(/฿100 THB/)

    const button = screen.getByRole('button', { name: /Cash out ฿100 to PromptPay/i })
    expect(button).toBeEnabled()

    fireEvent.change(screen.getByTestId('fast-cashout-bank-input'), {
      target: { value: '089-999-1111' },
    })
    fireEvent.click(button)
    expect(onRequestCashout).toHaveBeenCalledTimes(1)

    const request: CashoutRequest = onRequestCashout.mock.calls[0][0]
    expect(request).toMatchObject({
      pointsRequested: 10_000,
      thbRequested: 100,
      payoutNumber: 1,
      minPointsForPayout: 10_000,
      promptPayFeeThb: 0,
    })
  })

  it('switches to the standard ฿200 (20,000 Points) minimum from payout #2 onward', () => {
    const { onRequestCashout } = renderHub({ cashablePoints: 20_000, completedPayouts: 1 })

    const card = cashoutRegion()
    expect(card).toHaveTextContent(/Payout #2/)
    expect(card).toHaveTextContent(/Standard Anytime Minimum/)
    expect(card).toHaveTextContent('20,000 Points')
    expect(card).toHaveTextContent(/฿200 THB/)

    fireEvent.change(screen.getByTestId('fast-cashout-bank-input'), {
      target: { value: '089-999-1111' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Cash out ฿200 to PromptPay/i }))
    expect(onRequestCashout).toHaveBeenCalledTimes(1)
    expect(onRequestCashout.mock.calls[0][0]).toMatchObject({
      thbRequested: 200,
      payoutNumber: 2,
      minPointsForPayout: 20_000,
    })
  })

  it('blocks payout #2 while the balance is still at the Day-1 ฿100 floor', () => {
    renderHub({ cashablePoints: 10_000, completedPayouts: 1 })

    expect(screen.getByRole('button', { name: /Cash out ฿100 to PromptPay/i })).toBeDisabled()
    expect(cashoutRegion()).toHaveTextContent(/Need 10,000 more Points to reach the ฿200 cashout floor/i)
  })

  it('allows only 1 free cashout per day', () => {
    renderHub({ cashablePoints: 50_000, cashoutsToday: 1 })

    const button = screen.getByRole('button', { name: /Cash out ฿500 to PromptPay/i })
    expect(button).toBeDisabled()
    expect(cashoutRegion()).toHaveTextContent("Today's free cashout is used")
  })

  it('prices out points to baht at 100 Points = ฿1 THB', () => {
    expect(pointsToThb(10_000)).toBe(100)
    expect(pointsToThb(20_000)).toBe(200)
    expect(pointsToThb(55_500)).toBe(555)
    expect(cashoutFloorPoints(0)).toBe(DEFAULT_PLATFORM_CONFIG.first_withdrawal_min_points)
    expect(cashoutFloorPoints(1)).toBe(DEFAULT_PLATFORM_CONFIG.standard_withdrawal_min_points)
  })
})

describe('AgencyAndReferralHub — Self-Funding ฿555 Referral Tracker (D-023)', () => {
  it('keeps a friend with 0 Paid Coins locked in the vault at ฿0 cashable', () => {
    renderHub({ friendName: 'Nok', friendPaidCoins: 0 })

    const card = referralRegion()
    expect(card).toHaveTextContent('ชวนเพื่อนรับ 555 บาท')
    expect(card).toHaveTextContent(/Nok has 0 Paid Coins = .* Pending in Vault/)
    expect(card).toHaveTextContent('฿0 cashable')

    DEFAULT_PLATFORM_CONFIG.referral_steps.forEach((step) => {
      expect(referralStep(step.step, step.name)).toHaveTextContent('🔒 Locked')
    })
  })

  it('unlocks Step 1 (+฿30 / 3,000 Pts) only after 10,000 Paid Coins', () => {
    renderHub({ friendPaidCoins: 9_999 })
    expect(referralRegion()).toHaveTextContent(/Pending in Vault/)
    expect(referralStep(1, 'First Icebreaker Clink')).toHaveTextContent('🔒 Locked')

    renderHub({ friendPaidCoins: 10_000 })
    const region = referralRegion()
    expect(region).toHaveTextContent(/1\/4 steps unlocked = ฿30/)
    expect(region).toHaveTextContent(/next ฿75 at 90,000 Paid Coins/)

    const step1 = referralStep(1, 'First Icebreaker Clink')
    expect(step1).toHaveTextContent('+฿30 · 3,000 Pts')
    expect(step1).toHaveTextContent(/Nok reaches 10,000 Paid Coins \(฿100\)/)
    expect(step1).toHaveTextContent('Unlocked ✓')
    expect(referralStep(2, 'First Small Drop / Treats')).toHaveTextContent('🔒 Locked')
  })

  it('reaches the ฿255 Fast Track at Step 3 and the full ฿555 Star Bonus at Step 4', () => {
    renderHub({ friendPaidCoins: 90_000 })
    expect(referralRegion()).toHaveTextContent(/2\/4 steps unlocked = ฿105/)

    renderHub({ friendPaidCoins: 220_000 })
    expect(referralRegion()).toHaveTextContent(/3\/4 steps unlocked = ฿255/)

    renderHub({ friendPaidCoins: 475_000 })
    const card = referralRegion()
    expect(card).toHaveTextContent(/4\/4 steps unlocked = ฿555 \(55,500 Points\) banked/)
    expect(card).toHaveTextContent('full ฿555 Star Bonus complete!')
    expect(referralStep(3, '255 THB Fast-Track Complete')).toHaveTextContent('฿255 Fast Track Complete!')
    expect(referralStep(4, '555 THB Certified Star Bonus')).toHaveTextContent('฿555 Star Bonus!')
  })

  it('sums unlocked referral rewards from real paid coin revenue only', () => {
    const frozen = summarizeReferralProgress(0)
    expect(frozen.earnedThb).toBe(0)
    expect(frozen.earnedPoints).toBe(0)
    expect(frozen.isPendingInVault).toBe(true)

    const full = summarizeReferralProgress(475_000)
    expect(full.earnedThb).toBe(DEFAULT_PLATFORM_CONFIG.referral_bounty_total_thb)
    expect(full.earnedPoints).toBe(DEFAULT_PLATFORM_CONFIG.referral_bounty_total_points)
    expect(full.isPendingInVault).toBe(false)
    expect(full.nextStep).toBeUndefined()
  })

  it('offers the 1-tap [💬 Nudge Friend on LINE] auto-nudge deep-link', () => {
    const { onNudgeFriend } = renderHub({ friendName: 'Nok' })

    const link = screen.getByRole('link', { name: /Nudge Friend on LINE/i })
    expect(link).toHaveTextContent('💬 Nudge Friend on LINE')
    expect(link.getAttribute('href')).toMatch(/^https:\/\/line\.me\/R\/msg\/text\/\?/)
    expect(link.getAttribute('href')).toContain(encodeURIComponent('ชวนเพื่อนรับ 555 บาท'))
    expect(link).toHaveAttribute('target', '_blank')

    fireEvent.click(link)
    expect(onNudgeFriend).toHaveBeenCalledTimes(1)
    expect(onNudgeFriend.mock.calls[0][0]).toBe('Nok')
    expect(String(onNudgeFriend.mock.calls[0][1])).toContain('https://line.me/R/msg/text/?')
  })
})

describe('AgencyAndReferralHub — Kring Partners Hub & Example Calculator (KRING_AGENCY_PLAN)', () => {
  it('renders all 3 partner tiers with ฿0 upfront prices and platform-funded 20% net share (~4% gross)', () => {
    renderHub()

    const starter = screen.getByRole('listitem', { name: /Free Starter Scout tier/i })
    const gold = screen.getByRole('listitem', { name: /Gold Agency Partner tier/i })
    const royal = screen.getByRole('listitem', { name: /Bangkok Creator Squad tier/i })

    expect(starter).toHaveTextContent('Free')
    expect(starter).toHaveTextContent('4% override')
    expect(gold).toHaveTextContent('฿0 THB')
    expect(gold).toHaveTextContent('4% override')
    expect(royal).toHaveTextContent('฿0 THB')
    expect(royal).toHaveTextContent('4% override')
  })

  it('enforces BUG-035 (Red Line #3): 0 auto-assigned host leads across all tiers and labels the calculator "Example, not a guarantee"', () => {
    renderHub({ activeTier: 'gold' })

    expect(screen.getByRole('listitem', { name: /Bangkok Creator Squad tier/i })).toHaveTextContent(
      '0 auto-leads',
    )
    expect(screen.getByRole('listitem', { name: /Free Starter Scout tier/i })).toHaveTextContent(
      '0 auto-leads',
    )
    expect(screen.getByRole('listitem', { name: /Gold Agency Partner tier/i })).toHaveTextContent(
      '0 auto-leads',
    )
    expect(document.body.textContent).not.toContain('Auto-Assigned Unclaimed Host Leads')
    expect(screen.getByTestId('example-earnings-calculator')).toHaveTextContent(
      /Example Calculator \(Example, not a guarantee\)/i,
    )
    expect(screen.getByTestId('example-not-a-guarantee-disclaimer')).toHaveTextContent(
      /Example, not a guarantee/i,
    )
  })

  it('tracks the free Tier 1 partner progress bar to its 1-active-host unlock', () => {
    renderHub({ recruitedActiveHosts: 0 })
    const starter = screen.getByRole('listitem', { name: /Free Starter Scout tier/i })
    expect(starter).toHaveTextContent('Recruited 0 / 1 Active Hosts')
    expect(starter).toHaveTextContent('Locked 🔒')

    const bar = screen.getByRole('progressbar', { name: /Starter Scout recruitment progress/i })
    expect(bar).toHaveAttribute('aria-valuenow', '0')
    expect(bar).toHaveAttribute('aria-valuemax', '1')

    renderHub({ recruitedActiveHosts: 1, activeTier: 'starter' })
    expect(screen.getByRole('listitem', { name: /Free Starter Scout tier/i })).toHaveTextContent(
      'Unlocked ✓',
    )
  })

  it('marks purchased tiers as unlocked once owned', () => {
    renderHub({ activeTier: 'royal' })

    expect(screen.getByRole('listitem', { name: /Gold Agency Partner tier/i })).toHaveTextContent(
      'Unlocked ✓',
    )
    expect(within(screen.getByRole('listitem', { name: /Bangkok Creator Squad tier/i })).getByText('Unlocked ✓')).toBeInTheDocument()
  })
})

describe('AgencyAndReferralHub — KRING_AGENCY_PLAN Zero-Fee Host Freedom (฿0 Release Fee & 0-Day Cooldown)', () => {
  it('enforces ฿0 release fee and 0-day cooldown so hosts can leave any partner at any time for free', () => {
    renderHub({ boundHostName: 'Ploy', boundDaysInactive: 0 })

    const card = screen.getByRole('region', { name: /Agency roster lock/i })
    expect(card).toHaveTextContent('0-day 1-Face cooldown')
    expect(card).toHaveTextContent('cooldown complete')
    expect(card).toHaveTextContent('0 Coins (฿0 THB), split 50/50')
    expect(card).toHaveTextContent('Platform: 0c (฿0)')
    expect(card).toHaveTextContent('Original Agency: 0 Pts (฿0)')
  })

  it('completes the 0-day cooldown door immediately', () => {
    renderHub({ boundDaysInactive: 1 })

    const card = screen.getByRole('region', { name: /Agency roster lock/i })
    expect(card).toHaveTextContent('cooldown complete')
    expect(card).not.toHaveTextContent('days to go')
  })

  it('releases the host when the partner taps Approve Release', () => {
    const { onApproveRosterRelease } = renderHub({ boundHostName: 'Ploy' })

    fireEvent.click(screen.getByRole('button', { name: 'Approve Release' }))
    expect(onApproveRosterRelease).toHaveBeenCalledWith('Ploy')
    const card = screen.getByRole('region', { name: /Agency roster lock/i })
    expect(card).toHaveTextContent('Release approved — Ploy may bind to a new agency instantly.')
  })

  it('processes the ฿0 instant release with zero fee charged to the host', () => {
    const { onPayInstantRosterRelease } = renderHub({ boundHostName: 'Ploy' })

    fireEvent.click(screen.getByRole('button', { name: 'Pay Instant Roster Transfer Fee' }))
    expect(onPayInstantRosterRelease).toHaveBeenCalledTimes(1)

    const request: RosterReleaseRequest = onPayInstantRosterRelease.mock.calls[0][0]
    expect(request).toEqual({
      hostName: 'Ploy',
      method: 'instant-fee',
      totalFeeCoins: 0,
      platformShareCoins: 0,
      agencySharePoints: 0,
    })

    const card = screen.getByRole('region', { name: /Agency roster lock/i })
    expect(card).toHaveTextContent(
      'Instant release processed: 0 Coins (฿0) — Platform 0 Coins (฿0) / Original Agency 0 Points (฿0).',
    )
  })
})

describe('AgencyAndReferralHub — BUG-022, BUG-024, BUG-029 & BUG-032 Payout & Red-Line Wording Guards', () => {
  it('starts with an empty PromptPay destination, blocks Step 2 PIN confirmation until PromptPay is entered, and contains zero hardcoded fake bank accounts or Sandbox Stop Point text', () => {
    renderHub({ cashablePoints: 50_000 })

    const bodyText = document.body.textContent ?? ''
    expect(bodyText).not.toContain('081-234-5678')
    expect(bodyText).not.toContain('4891')
    expect(bodyText).not.toContain('882910')
    expect(bodyText).not.toContain('Royal BKK Syndicate')
    expect(bodyText).not.toContain('สายเปย์')
    expect(bodyText).not.toContain('Settings & RTP')
    expect(bodyText).not.toContain('Anonymous Dev Box')
    expect(bodyText).not.toContain('Sandbox Stop Point')
    expect(bodyText).not.toContain('250 Points = ฿1 THB')

    expect(screen.getByTestId('fast-cashout-empty-bank-notice')).toHaveTextContent(
      'Add your PromptPay. Verified name must match',
    )

    // BUG-029: Clicking Cash out with empty PromptPay blocks Step 2 PIN confirmation and shows error
    fireEvent.click(screen.getByRole('button', { name: /Cash out ฿500 to PromptPay/i }))
    expect(screen.queryByTestId('cashout-confirmation-pin-step')).not.toBeInTheDocument()
    expect(screen.getByTestId('missing-promptpay-error')).toBeInTheDocument()

    // Once PromptPay is entered and Cash out is clicked, Step 2 PIN confirmation opens
    fireEvent.change(screen.getByTestId('fast-cashout-bank-input'), {
      target: { value: '089-999-1111' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Cash out ฿500 to PromptPay/i }))
    expect(screen.getByTestId('cashout-confirmation-pin-step')).toBeInTheDocument()

    const authorizeBtn = screen.getByTestId('confirm-cashout-pin-btn')
    expect(authorizeBtn).toBeDisabled()

    fireEvent.change(screen.getByTestId('cashout-pin-input'), {
      target: { value: '1234' },
    })
    expect(authorizeBtn).toBeEnabled()
    fireEvent.click(authorizeBtn)
    expect(screen.getByText(/PIN Verified/i)).toBeInTheDocument()
  })
})



