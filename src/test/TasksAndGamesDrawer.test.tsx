import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TasksAndGamesDrawer, {
  JACKPOT_GATE_HOST_COINS,
  JACKPOT_GATE_TRAVELER_COINS,
  MINI_GAMES,
  TUTORIAL_STEPS,
  type GamePlayResult,
  type TasksAndGamesDrawerProps,
} from '../components/rewards/TasksAndGamesDrawer'

function renderDrawer(options: Partial<TasksAndGamesDrawerProps> = {}) {
  const onClaimTutorialStep = vi.fn()
  const onPlayGame = vi.fn()
  const onClaimGameTask = vi.fn()

  render(
    <TasksAndGamesDrawer
      onClaimTutorialStep={onClaimTutorialStep}
      onPlayGame={onPlayGame}
      onClaimGameTask={onClaimGameTask}
      {...options}
    />,
  )

  return { onClaimTutorialStep, onPlayGame, onClaimGameTask }
}

describe('TasksAndGamesDrawer — Spend-Gated Jackpot Hero', () => {
  it('displays the 9 PM 2% Daily Lucky Jackpot Pool with the live growing pot', () => {
    renderDrawer({ jackpotPoolCoins: 1_250_000 })

    expect(
      screen.getByRole('heading', { name: /9 PM BKK 2% Daily Lucky Jackpot Pool 🎰/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('🪙 1,250,000')).toBeInTheDocument()
  })

  it("shows the traveler ticket gate progress until 25,000 paid coins are spent", () => {
    renderDrawer({ role: 'traveler', paidCoinsSpentToday: 12_500 })

    expect(screen.getByText(/Spent/)).toHaveTextContent('12,500')
    expect(screen.getByText(/Paid Coins today/)).toBeInTheDocument()
    expect(screen.queryByText(/Golden Jackpot Ticket Active/i)).not.toBeInTheDocument()
  })

  it('unlocks the Golden Jackpot Ticket badge once 25,000 paid coins are spent today', () => {
    renderDrawer({ role: 'traveler', paidCoinsSpentToday: JACKPOT_GATE_TRAVELER_COINS })

    const badge = screen.getByRole('status')
    expect(badge).toHaveTextContent(/Golden Jackpot Ticket Active — Claim Window Opens at 9:00 PM BKK/i)
    expect(badge).toHaveTextContent(/Unclaimed coins roll into tomorrow's pot/i)
  })

  it('switches the host ticket gate to story + earned coins qualification', () => {
    renderDrawer({
      role: 'host',
      postedStoryToday: true,
      coinsEarnedToday: JACKPOT_GATE_HOST_COINS,
    })

    expect(screen.getByText(/Posted 10s Story \+ Earned/)).toHaveTextContent('50,000')
    expect(screen.getByText(/Golden Jackpot Ticket Active/)).toBeInTheDocument()
  })

  it('does not qualify a host who posted a story but earned under 50,000 coins', () => {
    renderDrawer({ role: 'host', postedStoryToday: true, coinsEarnedToday: 49_999 })

    expect(screen.queryByText(/Golden Jackpot Ticket Active/i)).not.toBeInTheDocument()
  })
})

describe('TasksAndGamesDrawer — Tasks-as-Tutorial Starter Chest', () => {
  it('lists all 5 tutorial steps with rewards and a whisper pill of at most 6 words', () => {
    renderDrawer()

    const chain = screen.getByRole('region', { name: /Newcomer Starter Chest/i })
    TUTORIAL_STEPS.forEach((step) => {
      expect(within(chain).getByText(step.title)).toBeInTheDocument()
      expect(
        within(chain).getByRole('button', { name: `Claim reward for ${step.title}` }),
      ).toBeInTheDocument()
      const whisper = within(chain).getByText(`whisper: ${step.whisper}`)
      expect(whisper).toBeInTheDocument()
      const wordCount = step.whisper.trim().split(/\s+/).length
      expect(wordCount).toBeLessThanOrEqual(6)
    })
  })

  it('completes a step, marks it claimed, and fires the claim callback with the bonus coins', () => {
    const { onClaimTutorialStep } = renderDrawer()

    const diceStep = TUTORIAL_STEPS.find((step) => step.id === 'lucky-dice-gift')!
    const chain = screen.getByRole('region', { name: /Newcomer Starter Chest/i })
    fireEvent.click(
      within(chain).getByRole('button', { name: `Claim reward for ${diceStep.title}` }),
    )

    expect(onClaimTutorialStep).toHaveBeenCalledWith('lucky-dice-gift', 1_000)
    const completedButtons = within(chain)
      .getAllByRole('button')
      .filter((button) => /✓/.test(button.textContent ?? ''))
    expect(completedButtons).toHaveLength(1)
    expect(
      within(chain).getByRole('button', { name: `Claim reward for ${diceStep.title}` }),
    ).toHaveTextContent(/✓/)
  })

  it('claims every tutorial step exactly once and sums all five rewards', () => {
    const { onClaimTutorialStep } = renderDrawer()

    const chain = screen.getByRole('region', { name: /Newcomer Starter Chest/i })
    TUTORIAL_STEPS.forEach((step) => {
      fireEvent.click(within(chain).getByRole('button', { name: `Claim reward for ${step.title}` }))
    })

    expect(onClaimTutorialStep).toHaveBeenCalledTimes(TUTORIAL_STEPS.length)
    const total = TUTORIAL_STEPS.reduce((sum, step) => sum + step.rewardBonusCoins, 0)
    expect(total).toBe(2_900)
    const claimedButtons = within(chain)
      .getAllByRole('button')
      .filter((button) => /✓/.test(button.textContent ?? ''))
    expect(claimedButtons).toHaveLength(TUTORIAL_STEPS.length)
  })
})

describe('TasksAndGamesDrawer — 15s Habit Mini-Games', () => {
  it('lists the 3 mini-games with costs and daily play targets', () => {
    renderDrawer()

    const gamesSection = screen.getByRole('region', { name: /15 second habit mini games/i })
    MINI_GAMES.forEach((game) => {
      expect(within(gamesSection).getByText(`${game.emoji} ${game.name}`)).toBeInTheDocument()
      expect(within(gamesSection).getByText(`0/${game.roundsToUnlock} played`)).toBeInTheDocument()
    })
    expect(within(gamesSection).getAllByText(/Daily task reward:/)).toHaveLength(MINI_GAMES.length)
  })

  it('Chon! Lucky Dice Shake: plays 3 rounds then unlocks the +500 Bonus Coin claim', () => {
    const { onPlayGame, onClaimGameTask } = renderDrawer()

    const card = screen.getByRole('article', { name: /Chon! Lucky Dice Shake/i })
    const shake = within(card).getByRole('button', { name: /shake the dice/i })

    fireEvent.click(shake)
    fireEvent.click(shake)
    expect(onPlayGame).toHaveBeenCalledTimes(2)
    expect(onPlayGame.mock.calls[1][0]).toMatchObject({ gameId: 'dice-shake', roundsPlayed: 2 })

    fireEvent.click(shake)
    expect(within(card).getByText('3/3 played')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: /^claim$/i }))
    expect(onClaimGameTask).toHaveBeenCalledWith('dice-shake', 500, 0)
    expect(within(card).getByText('Claimed ✓')).toBeInTheDocument()
  })

  it('Sukhumvit Tuk-Tuk Sprint: requires a pick, races twice, and claims +800', () => {
    const { onPlayGame, onClaimGameTask } = renderDrawer()

    const card = screen.getByRole('article', { name: /Sukhumvit Tuk-Tuk Sprint/i })
    const race = within(card).getByRole('button', { name: /start the race/i })
    expect(race).toBeDisabled()

    fireEvent.click(within(card).getByRole('button', { name: /gold tuk-tuk/i }))
    fireEvent.click(race)
    fireEvent.click(race)

    expect(onPlayGame).toHaveBeenCalledTimes(2)
    const lastCall = onPlayGame.mock.calls[1][0] as GamePlayResult
    expect(lastCall).toMatchObject({ gameId: 'tuk-tuk-sprint', roundsPlayed: 2, picked: 'Gold Tuk-Tuk' })
    expect(within(card).getByText('2/2 played')).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: /^claim$/i }))
    expect(onClaimGameTask).toHaveBeenCalledWith('tuk-tuk-sprint', 800, 0)
  })

  it('60s Chemistry Vibe Duel: one matched duel unlocks +500 Bonus Coins and the 2,000c Envelope Booster', () => {
    const { onPlayGame, onClaimGameTask } = renderDrawer()

    const card = screen.getByRole('article', { name: /60s Chemistry Vibe Duel/i })
    const duel = within(card).getByRole('button', { name: /start 60s duel/i })
    expect(duel).toBeDisabled()

    fireEvent.click(within(card).getByRole('button', { name: /rooftop cocktail bar/i }))
    fireEvent.click(duel)

    expect(onPlayGame).toHaveBeenCalledTimes(1)
    expect(onPlayGame.mock.calls[0][0]).toMatchObject({ gameId: 'vibe-duel', roundsPlayed: 1 })
    expect(within(card).getByText('1/1 played')).toBeInTheDocument()
    expect(within(card).getByText(/2,000c Envelope Booster/)).toBeInTheDocument()

    fireEvent.click(within(card).getByRole('button', { name: /^claim$/i }))
    expect(onClaimGameTask).toHaveBeenCalledWith('vibe-duel', 500, 2_000)
  })

  it('keeps the game task claim locked until the daily play target is reached', () => {
    renderDrawer()

    const card = screen.getByRole('article', { name: /Chon! Lucky Dice Shake/i })
    fireEvent.click(within(card).getByRole('button', { name: /shake the dice/i }))
    fireEvent.click(within(card).getByRole('button', { name: /shake the dice/i }))

    expect(within(card).getByText('2/3 played')).toBeInTheDocument()
    expect(within(card).getByRole('button', { name: /^claim$/i })).toBeDisabled()
  })
})
