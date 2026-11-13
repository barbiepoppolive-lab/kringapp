/**
 * OPT-011: Mini-game catalogue shared by App.tsx (cost accounting) and TasksAndGamesDrawer (UI).
 * Kept in a tiny leaf module so the 68 KB rewards chunk is only downloaded when the drawer opens.
 */
export interface MiniGameDef {
  id: string
  name: string
  emoji: string
  costCoins: number
  roundsToUnlock: number
  rewardBonusCoins: number
  boosterCoins?: number
  options?: string[]
}

export const MINI_GAMES: MiniGameDef[] = [
  {
    id: 'dice-shake',
    name: 'Chon! Lucky Dice Shake',
    emoji: '🎲',
    costCoins: 200,
    roundsToUnlock: 3,
    rewardBonusCoins: 500,
  },
  {
    id: 'tuk-tuk-sprint',
    name: 'Sukhumvit Tuk-Tuk Sprint',
    emoji: '🛺',
    costCoins: 500,
    roundsToUnlock: 2,
    rewardBonusCoins: 800,
    options: ['Red Tuk-Tuk', 'Gold Tuk-Tuk', 'Neon Tuk-Tuk'],
  },
  {
    id: 'vibe-duel',
    name: '60s Chemistry Vibe Duel',
    emoji: '⚡',
    costCoins: 500,
    roundsToUnlock: 1,
    rewardBonusCoins: 500,
    boosterCoins: 2_000,
    options: ['Rooftop cocktail bar', 'Street-food tour', 'Riverside jazz'],
  },
]
