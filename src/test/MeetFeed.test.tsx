import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MeetFeed, {
  DAILY_CLINK_COST,
  DAILY_CLINK_MAX_AWARD,
  DAILY_CLINK_MIN_AWARD,
  DEMO_LIVE_STORIES,
  DEMO_MEET_HOSTS,
  STORY_TOAST_COST,
  type MeetHost,
} from '../components/meet/MeetFeed'

function renderFeed() {
  const onSelectHost = vi.fn()
  render(<MeetFeed onSelectHost={onSelectHost} />)
  return { onSelectHost }
}

function hostCards(): HTMLElement[] {
  return screen.getAllByTestId('meet-host-card')
}

function openStory(hostName: string) {
  fireEvent.click(screen.getByRole('button', { name: `Open 10s live story from ${hostName}` }))
}

function toastActiveStory() {
  fireEvent.click(screen.getByRole('button', { name: /cheer this story \(฿1\)/i }))
}

function visibleHostIds(): Array<string | null> {
  return hostCards().map((card) => card.getAttribute('data-host-id'))
}

describe('Meet feed — live ticker, wallet & Daily Mystery Clink', () => {
  it('removes the fake live win ticker per BUG-034, and renders unified coin balance and the 1,000c Daily Clink button', () => {
    renderFeed()

    expect(screen.queryByRole('marquee', { name: /live win ticker/i })).toBeNull()
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('100,000 Coins 🪙')
    expect(
      screen.getByRole('button', { name: /1,000c daily mystery clink/i }),
    ).toBeInTheDocument()
  })

  it('spends exactly 1,000 Coins once per day and pays a guaranteed 1,200c–5,000c award', () => {
    renderFeed()

    fireEvent.click(screen.getByRole('button', { name: /1,000c daily mystery clink/i }))

    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('99,000 Coins 🪙')

    const awardText = screen.getByTestId('clink-award').textContent ?? ''
    const award = Number(awardText.match(/paid ([\d,]+) Coins/)?.[1]?.replace(/,/g, ''))
    expect(award).toBeGreaterThanOrEqual(DAILY_CLINK_MIN_AWARD)
    expect(award).toBeLessThanOrEqual(DAILY_CLINK_MAX_AWARD)

    const claimed = screen.getByRole('button', { name: /claimed/i })
    expect(claimed).toBeDisabled()
    fireEvent.click(claimed)
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('99,000 Coins 🪙')
    expect(DAILY_CLINK_COST).toBe(1_000)
  })
})

describe('Meet feed — 10s Live Story rail & Toast habit loop', () => {
  it('renders four 10s story avatars and opens the toast sheet with the golden whisper badge', () => {
    renderFeed()

    const storyButtons = screen.getAllByRole('button', { name: /open 10s live story from/i })
    expect(storyButtons).toHaveLength(DEMO_LIVE_STORIES.length)

    openStory('Mint')

    const dialog = screen.getByRole('dialog', { name: /Mint 10s live story/i })
    expect(within(dialog).getByAltText(/Mint live story frame/i)).toBeInTheDocument()
    expect(
      within(dialog).getByText(/First 3 Story Toasts today return \+400 Bonus Coins!/i),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByRole('button', { name: /cheer this story \(฿1\)/i }),
    ).toBeInTheDocument()
  })

  it('charges 100 Coins per toast and credits +400 Bonus Coins after the third toast', () => {
    renderFeed()

    openStory('Mint')
    toastActiveStory()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('99,900 Coins 🪙')
    expect(screen.getByTestId('toast-tracker')).toHaveTextContent('Story Toasts today: 1 / 3')

    openStory('Ploy')
    toastActiveStory()
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('99,800 Coins 🪙')
    expect(screen.queryByTestId('toast-bonus')).not.toBeInTheDocument()

    openStory('Kwan')
    toastActiveStory()
    expect(screen.getByTestId('wallet-balance')).toHaveTextContent('99,700 Coins 🪙')
    expect(screen.getByTestId('toast-tracker')).toHaveTextContent('Story Toasts today: 3 / 3')
    expect(screen.getByTestId('toast-bonus')).toHaveTextContent('+400 Bonus Coins')
    expect(STORY_TOAST_COST).toBe(100)
  })
})

describe('Meet feed — 2x2 portrait grid (D-019 / D-020)', () => {
  it('renders the 2x2 grid with unblurred photos, Real Face Matched badges, venue pills and Chon! buttons', () => {
    renderFeed()

    const cards = hostCards()
    expect(cards).toHaveLength(4)

    for (const card of cards) {
      const photo = within(card).getByRole('img')
      expect(photo).toHaveAttribute('src', expect.stringMatching(/^(https:\/\/|data:image\/svg\+xml)/))
      expect(photo.className).not.toMatch(/blur/)
      expect(card.className).not.toMatch(/blur/)
      expect(within(card).getByText('✓ Verified local · ID checked')).toBeInTheDocument()
      expect(within(card).getByTestId('host-venue').textContent).toMatch(/📍 /)
      expect(within(card).getByTestId('host-identity')).toHaveTextContent(/·/)
      expect(within(card).getByTestId('treat-goal')).toHaveTextContent(/\d+ experiences on Kring/)
      expect(within(card).getByRole('button', { name: /^book /i })).toBeInTheDocument()
    }
  })

  it('never stamps a raw Baht price across the host photo or feed card and has no Weight filter (BUG-033)', () => {
    renderFeed()

    for (const card of hostCards()) {
      expect(within(card).queryByText(/฿/)).toBeNull()
    }
    expect(screen.queryByText(/⚖️ Weight/i)).toBeNull()
  })

  it('calls onSelectHost(host) from the 🥂 Chon! button', () => {
    const { onSelectHost } = renderFeed()

    fireEvent.click(within(hostCards()[0]).getByRole('button', { name: /^book /i }))

    expect(onSelectHost).toHaveBeenCalledTimes(1)
    expect(onSelectHost).toHaveBeenCalledWith(DEMO_MEET_HOSTS[0] as MeetHost)
  })

  it('filters the grid with All Tonight, Flash 60m and district pills', () => {
    renderFeed()

    expect(hostCards()).toHaveLength(4)

    fireEvent.click(screen.getByRole('button', { name: /flash 60m/i }))
    expect(screen.getByRole('button', { name: /flash 60m/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(visibleHostIds()).toEqual(['host-mint', 'host-kwan'])

    fireEvent.click(screen.getByRole('button', { name: /thonglor \/ ekkamai/i }))
    expect(visibleHostIds()).toEqual(['host-mint', 'host-ploy'])

    fireEvent.click(screen.getByRole('button', { name: /asok \/ phrom phong/i }))
    expect(visibleHostIds()).toEqual(['host-kwan', 'host-bee'])

    fireEvent.click(screen.getByRole('button', { name: /all tonight/i }))
    expect(hostCards()).toHaveLength(4)
  })
})
