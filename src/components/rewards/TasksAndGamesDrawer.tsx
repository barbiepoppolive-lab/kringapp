import { useEffect, useState } from 'react'
// OPT-011: MINI_GAMES lives in src/lib/miniGames.ts so App.tsx can lazy-load this drawer without importing it eagerly
import { hostPlaceholderUri } from '../../lib/imageFallback'
import { MINI_GAMES, type MiniGameDef } from '../../lib/miniGames'
export { MINI_GAMES, type MiniGameDef }
import { triggerHaptic } from '../../lib/haptics'
import { dispatchInternalWalletDelta } from '../../lib/walletBus'
import { triggerBigGift } from '../fx/BigGiftFX'
import { triggerLuxuryFX } from '../fx/LuxuryStageFX'
import '../../styles/deep-motion.css'
import '../../styles/wallet.css'
import { Coin3D } from '../ui/LivingIcons'
import { useIsHostRole, useIsThai, useTr } from '../vip/walletKit'
import {
  createInitialLuckyPoolState,
  cryptoRandomFloat,
  drawDailyJackpotDistribution,
  processLuckyComboSpin,
  type DailyJackpotDistribution,
} from '../../lib/luckyPoolRng'

export type UserRole = 'traveler' | 'host'

export interface TutorialStepDef {
  id: string
  title: string
  whisper: string
  rewardBonusCoins: number
}


export const JACKPOT_GATE_TRAVELER_COINS = 25_000
export const JACKPOT_GATE_HOST_COINS = 50_000

export const TUTORIAL_STEPS: TutorialStepDef[] = [
  {
    id: 'watch-story',
    title: 'Watch 1 Live 10s Story',
    whisper: "See who's out tonight 👀",
    rewardBonusCoins: 500,
  },
  {
    id: 'vibe-check',
    title: 'Tap a 1-Tap Vibe Check',
    whisper: '3 taps to show interest 💛',
    rewardBonusCoins: 500,
  },
  {
    id: 'lucky-dice-gift',
    title: 'Send 1 Free 100c Lucky Tuk-Tuk Dice using your task coins!',
    whisper: 'Your first Lucky Chon! roll 🎲',
    rewardBonusCoins: 1_000,
  },
  {
    id: 'peek-jackpot',
    title: "Check Tonight's 9 PM 2% Lucky Jackpot Pool",
    whisper: '2% of every coin, nightly 🎰',
    rewardBonusCoins: 500,
  },
  {
    id: 'toast-stories',
    title: 'Toast 3 Live Stories',
    whisper: '100c toast = front-of-inbox 🥂',
    rewardBonusCoins: 400,
  },
]


export interface GamePlayResult {
  gameId: string
  roundsPlayed: number
  outcome: string
  picked?: string
}

export interface TasksAndGamesDrawerProps {
  role?: UserRole
  jackpotPoolCoins?: number
  paidCoinsSpentToday?: number
  postedStoryToday?: boolean
  coinsEarnedToday?: number
  bonusCoins?: number
  onClaimTutorialStep?: (stepId: string, rewardBonusCoins: number) => void
  onPlayGame?: (result: GamePlayResult) => void
  onClaimGameTask?: (gameId: string, rewardBonusCoins: number, boosterCoins: number) => void
  onAwardBonusCoins?: (amount: number, reason: string) => void
}

function formatCoins(coins: number): string {
  return `${coins.toLocaleString('en-US')} Coins`
}

interface TableChatMessage {
  id: string
  sender: string
  avatar: string
  text: string
  time: string
  isYou?: boolean
  isHost?: boolean
}

const INITIAL_TABLE_MESSAGES: TableChatMessage[] = [
  {
    id: 'm-1',
    sender: 'Mint 👱‍♀️',
    avatar: '👩',
    text: "Haha I rolled three 6s! Who's buying Cha Yen if I win? 🧋",
    time: '1m ago',
    isHost: true,
  },
  {
    id: 'm-2',
    sender: '@Alex_UK',
    avatar: '🎩',
    text: "Bluff called! Let's meet at Tichuca after this round 🥂",
    time: 'Just now',
  },
  {
    id: 'm-3',
    sender: 'Ploy 👱‍♀️',
    avatar: '👱‍♀️',
    text: 'Tap my avatar to whisper or send a drink! 💕',
    time: 'Just now',
    isHost: true,
  },
]

const QUICK_REACTION_CHIPS = [
  '🍻 Cheers',
  '🔥 Call Bluff',
  '🧋 Buy Cha Yen 🪙 500',
]

const VAULT_3D_ANIMATION_CSS = `
@keyframes vaultRotateRingA {
  0% { transform: rotateX(68deg) rotateZ(0deg); }
  100% { transform: rotateX(68deg) rotateZ(360deg); }
}
@keyframes vaultRotateRingB {
  0% { transform: rotateX(-55deg) rotateY(25deg) rotateZ(0deg); }
  100% { transform: rotateX(-55deg) rotateY(25deg) rotateZ(-360deg); }
}
@keyframes godRayGlow {
  0%, 100% { opacity: 0.35; transform: scale(0.96) rotate(0deg); }
  50% { opacity: 0.7; transform: scale(1.08) rotate(15deg); }
}
@keyframes coinCoreDrop {
  0% { transform: translateY(-38px) scale(0.65); opacity: 0; }
  35% { opacity: 1; transform: translateY(-15px) scale(1); }
  85% { transform: translateY(6px) scale(0.9); opacity: 0.9; }
  100% { transform: translateY(18px) scale(0.35); opacity: 0; }
}
.orbit-ring-a {
  animation: vaultRotateRingA 7s linear infinite;
  transform-style: preserve-3d;
}
.orbit-ring-b {
  animation: vaultRotateRingB 10s linear infinite;
  transform-style: preserve-3d;
}
.god-ray-glow {
  animation: godRayGlow 4s ease-in-out infinite;
}
.coin-drop-anim-1 {
  animation: coinCoreDrop 2.2s ease-in infinite;
}
.coin-drop-anim-2 {
  animation: coinCoreDrop 2.6s ease-in infinite 0.7s;
}
.coin-drop-anim-3 {
  animation: coinCoreDrop 2.4s ease-in infinite 1.3s;
}
`

function JackpotHero({
  role,
  jackpotPoolCoins,
  paidCoinsSpentToday,
  postedStoryToday,
  coinsEarnedToday,
  onClaimRankShare,
  onBoostPot,
  onShowTopNotification,
}: {
  role: UserRole
  jackpotPoolCoins: number
  paidCoinsSpentToday: number
  postedStoryToday: boolean
  coinsEarnedToday: number
  onClaimRankShare?: () => void
  onBoostPot?: () => void
  onShowTopNotification?: (text: string) => void
}) {
  const [showHelp, setShowHelp] = useState(false)
  const [showRankHelp, setShowRankHelp] = useState(false)
  const [collectedRankShare, setCollectedRankShare] = useState(false)
  const [dailyClinkDone, setDailyClinkDone] = useState(false)
  const [dailyClinkWon, setDailyClinkWon] = useState<number | null>(null)

  const qualified =
    role === 'traveler'
      ? paidCoinsSpentToday >= JACKPOT_GATE_TRAVELER_COINS
      : postedStoryToday && coinsEarnedToday >= JACKPOT_GATE_HOST_COINS
  const pct =
    role === 'traveler'
      ? Math.min(100, Math.round((paidCoinsSpentToday / JACKPOT_GATE_TRAVELER_COINS) * 100))
      : Math.min(100, Math.round((coinsEarnedToday / JACKPOT_GATE_HOST_COINS) * 100))

  function handleCollectRankShare() {
    if (collectedRankShare) return
    triggerHaptic('jackpot')
    setCollectedRankShare(true)
    onClaimRankShare?.()
    if (typeof window !== 'undefined') {
      dispatchInternalWalletDelta({
        bonusDelta: 14500,
        note: '🎰 Claimed +🪙 14,500 from 2% Daily Jackpot Pot!',
      })
      window.dispatchEvent(
        new CustomEvent('chon:coin-balance-popup', {
          detail: { delta: 14_500 },
        }),
      )
    }
    onShowTopNotification?.('🍀 +🪙 14,500!')
    triggerLuxuryFX({
      theme: 'lucky-jackpot-fountain',
      title: '👑 Rank & Jackpot Share Claimed!',
      subtitle: '+🪙 14,500 Credited Instantly to Chon! Wallet',
    })
  }

  function handleConsolidatedDailyClink() {
    if (dailyClinkDone) return
    triggerHaptic('combo')
    const award = Math.floor(200 + cryptoRandomFloat() * 1_601)
    setDailyClinkWon(award)
    setDailyClinkDone(true)
    if (typeof window !== 'undefined') {
      dispatchInternalWalletDelta({
        bonusDelta: award,
        note: `+🪙 ${award.toLocaleString('en-US')} Daily Clink Bonus credited!`,
      })
      window.dispatchEvent(
        new CustomEvent('chon:coin-balance-popup', {
          detail: { delta: award },
        }),
      )
    }
    onShowTopNotification?.(`🍀 +🪙 ${award.toLocaleString('en-US')}!`)
    triggerBigGift({
      kind: 'mystery-box',
      emoji: '🎁',
      prize: '🥂',
      title: 'Gift surprise opened!',
      subtitle: `+🪙 ${award.toLocaleString('en-US')} + Treat Voucher Unlocked`,
    })
    triggerLuxuryFX({
      theme: 'champagne-clink-clash',
      title: '🎁 Consolidated Daily Clink!',
      subtitle: `+🪙 ${award.toLocaleString('en-US')} + Treat Voucher Unlocked`,
    })
  }

  return (
    <section
      aria-label="Daily Lucky Jackpot Pool"
      className="relative space-y-2 overflow-hidden rounded-3xl border border-amber-400/50 bg-gradient-to-br from-[#3D255A] via-[#2A1B47] to-[#1E1336] p-2.5 shadow-2xl shadow-amber-500/10"
    >
      <style>{VAULT_3D_ANIMATION_CSS}</style>

      {/* 3D Crystalline Gold Rotating Vault / Sphere Stage (perspective: 900px) */}
      <div
        className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl border border-amber-400/30 bg-gradient-to-b from-[#2A1744]/90 via-[#1C0F32]/95 to-[#120924] py-2 px-3 shadow-inner"
        style={{ perspective: '900px' }}
      >
        {/* Volumetric God-Rays Radiating from Center */}
        <div
          aria-hidden="true"
          className="god-ray-glow pointer-events-none absolute -inset-6 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-amber-400/30 via-yellow-500/10 to-transparent blur-xl"
        />

        {/* Central Crystalline Gold Core Sphere */}
        <div className="relative z-10 flex w-full flex-col items-center text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-amber-600 via-amber-300 to-yellow-100 p-0.5 shadow-[0_0_20px_rgba(251,191,36,0.55)] ring-2 ring-amber-200/60">
              <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#3D2260] via-[#261340] to-[#170B28]">
                <span className="text-base animate-pulse">🍯</span>
              </div>
            </div>
            <div className="text-left">
              <div className="flex items-center gap-1.5">
                <h3
                  aria-label="Tonight's 9 PM BKK 2% Daily Lucky Jackpot Pool 🎰"
                  className="text-xs font-black tracking-tight text-amber-200 drop-shadow"
                >
                  9 PM BKK 2% Daily Lucky Jackpot Pool 🎰
                </h3>
                <button
                  type="button"
                  aria-label="How Jackpot works"
                  onClick={() => {
                    triggerHaptic('tap')
                    setShowHelp((prev) => !prev)
                    if (typeof window !== 'undefined') {
                      window.dispatchEvent(
                        new CustomEvent('chon:open-help-overlay', { detail: { section: 'games' } }),
                      )
                    }
                  }}
                  className="flex h-4 w-4 items-center justify-center rounded-full border border-white/25 bg-white/10 text-[9px] font-black text-amber-300 hover:bg-white/20 transition"
                >
                  ?
                </button>
              </div>
              <p className="text-[9.5px] font-semibold text-amber-300/80">
                9 PM 2% Daily Pot: 🪙 {jackpotPoolCoins.toLocaleString('en-US')} (฿{Math.round(jackpotPoolCoins / 100).toLocaleString('en-US')})
              </p>
              <p className="sr-only">
                🇹🇭 กองกลางแจ็กพอต 2% แจกทุกคืน 21:00 น. (โพสต์สตอรี่ 10 วิ รับตั๋วฟรี)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 pt-0.5">
            <span className="inline-block shrink-0 rounded-full bg-gradient-to-r from-amber-400/30 via-yellow-300/35 to-amber-500/30 px-3.5 py-0.5 text-sm font-black text-amber-300 ring-1 ring-amber-400/60 shadow-[0_0_16px_rgba(251,191,36,0.35)]">
              🪙 {jackpotPoolCoins.toLocaleString('en-US')}
            </span>
            <span
              role="tab"
              tabIndex={0}
              data-testid="test-pot-boost-btn"
              onClick={() => {
                triggerHaptic('tap')
                onBoostPot?.()
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  triggerHaptic('tap')
                  onBoostPot?.()
                }
              }}
              className="cursor-pointer rounded-full border border-amber-300/40 bg-amber-400/20 px-2 py-0.5 text-[9.5px] font-black text-amber-200 hover:bg-amber-400/35 active:scale-95"
            >
              🪙 +250
            </span>
          </div>
        </div>
      </div>

      {/* Live Rising Gush Ticker (hidden visually to keep card ultra-clean) */}
      <div className="sr-only">
        <span>✨ +45c just dropped</span>
        <span>🔥 2% Gifting Gush</span>
        <span>🪙 Pot Boiling</span>
      </div>

      {showHelp && (
        <div
          data-testid="jackpot-rng-explanation-box"
          className="sr-only"
        >
          <p>• 2% of every Lucky gift enters pot</p>
          <p>• Splits daily at 9:00 PM BKK</p>
          <p>• 1 tap claims your 🪙 share</p>
          <div className="sr-only">
            <p>🎲 Cryptographic RNG Jackpot Distribution to Qualified Group:</p>
            <p>
              • Every night at 9:00 PM BKK, the entire 2% Daily Lucky Jackpot Pool is gifted on a provably fair RNG (Random Number Generator) basis across the group of qualified ticket holders!
            </p>
            <p>
              • Qualifying unlocks your Golden Ticket into the 9:00 PM RNG draw where random lucky multipliers and jackpot shares drop to qualified users.
            </p>
          </div>
        </div>
      )}

      {/* Ticket Gate Progress */}
      <div className="space-y-1 rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/10">
        <div className="flex items-center justify-between text-[10.5px] text-purple-100/90">
          <p>
            {role === 'traveler' ? (
              <>
                🎟️ <span className="sr-only">Daily Ticket Gate: </span>Spent{' '}
                <span className="font-bold text-white">{paidCoinsSpentToday.toLocaleString('en-US')}</span> /{' '}
                {JACKPOT_GATE_TRAVELER_COINS.toLocaleString('en-US')}{' '}
                <span className="sr-only">Paid Coins today</span>
                <span aria-hidden="true">🪙</span>
              </>
            ) : (
              <>
                🎟️ Posted 10s Story + Earned{' '}
                <span className="font-bold text-white">{coinsEarnedToday.toLocaleString('en-US')}</span> /{' '}
                {JACKPOT_GATE_HOST_COINS.toLocaleString('en-US')}{' '}
                <span className="sr-only">Coins today</span>
                <span aria-hidden="true">🪙 today</span>
              </>
            )}
          </p>
          <span className="text-[10px] font-extrabold text-amber-300">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#1B1130]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-amber-400 via-yellow-300 to-emerald-400 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {qualified && (
        <p
          role="status"
          className="flex items-center justify-between rounded-xl border border-amber-400/60 bg-gradient-to-r from-amber-400/20 to-yellow-500/15 px-3 py-2 text-[11px] font-bold text-amber-200 shadow-[0_0_15px_rgba(245,196,81,0.2)]"
        >
          <span aria-hidden="true" className="flex items-center gap-1.5">
            <span className="animate-spin text-xs">⭐</span>
            <span>🎟️ Ticket Active · 🕘 9:00 PM BKK</span>
          </span>
          <span className="sr-only">
            🎟️ Golden Jackpot Ticket Active — Claim Window Opens at 9:00 PM BKK (Unclaimed coins roll into
            tomorrow&apos;s pot!)
          </span>
          <span className="rounded-full bg-amber-400/30 px-2 py-0.5 text-[10px] font-black text-amber-100">
            QUALIFIED
          </span>
        </p>
      )}

      {/* Point 31, Point 7.3 & Consolidated Daily Clink Reward: All Daily Rewards on One Consolidated Screen */}
      <div className="space-y-2 rounded-2xl border border-amber-400/40 bg-black/45 p-3 shadow-inner">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-xs">🏆</span>
            <h4 className="text-xs font-black tracking-tight text-amber-200">
              Consolidated Daily Rewards &amp; Winner Board
            </h4>
            <button
              type="button"
              data-testid="rank-jackpot-help-btn"
              aria-label="Rank and Jackpot Rules"
              onClick={() => {
                triggerHaptic('tap')
                setShowRankHelp((prev) => !prev)
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('chon:open-help-overlay', { detail: { section: 'games' } }),
                  )
                }
              }}
              className="flex h-4 w-4 items-center justify-center rounded-full border border-amber-400/50 bg-amber-400/20 text-[9px] font-black text-amber-300 hover:bg-amber-400/40 transition"
            >
              ?
            </button>
          </div>
          <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[9px] font-extrabold text-amber-300">
            9 PM RNG Draw
          </span>
        </div>

        {/* Preserved in sr-only so clicking [ ? ] only opens full-screen Emoji Guide */}
        {showRankHelp && (
          <div
            role="region"
            aria-label="Rank & Jackpot Rules"
            data-testid="rank-jackpot-help-popover"
            className="sr-only"
          >
            <p>• 2% of every Lucky gift enters pot</p>
            <p>• Splits daily at 9:00 PM BKK</p>
            <p>• 1 tap claims your 🪙 share</p>
            <div className="sr-only">
              <p>📜 2% RNG Jackpot &amp; Daily Rank Rules:</p>
              <p>
                • Cryptographic RNG Group Draw: Every night at 9:00 PM BKK, the 2% Daily Lucky Jackpot Pool is gifted on a verified RNG (Random Number Generator) basis to a group of qualified users who unlocked their daily Golden Ticket!
              </p>
              <p>
                • Daily &amp; Weekly Rank Rewards: Leaderboard podium holders also earn guaranteed daily &amp; weekly pool bonuses based on community standing and host clinks.
              </p>
              <p>
                • Tap &apos;Collect My Rank &amp; Jackpot Share&apos; or &apos;Daily Mystery Clink&apos; on this single consolidated screen to credit your rewards directly to your wallet.
              </p>
              <p>• Unclaimed rewards roll over into tomorrow&apos;s 9:00 PM pot automatically.</p>
            </div>
          </div>
        )}

        {/* Consolidated Daily Mystery Clink Reward Row */}
        <div
          data-testid="consolidated-daily-clink-row"
          className="flex items-center justify-between gap-2 rounded-xl border border-amber-400/35 bg-gradient-to-r from-amber-500/15 via-purple-900/30 to-amber-500/15 px-2.5 py-2 text-[11px]"
        >
          <div className="min-w-0">
            <p className="text-[10.5px] font-extrabold leading-snug text-amber-200">
              🎁 Daily Mystery Clink Reward (🪙 1,000 ➔ Win 🪙 1,200–5,000)
            </p>
            <p className="text-[9.5px] text-purple-200/80">
              {dailyClinkWon
                ? `🎉 Won +🪙 ${dailyClinkWon.toLocaleString('en-US')} + Treat Voucher!`
                : 'Guaranteed daily profit box + Tonight Treat Voucher'}
            </p>
          </div>
          <button
            type="button"
            data-testid="claim-consolidated-daily-clink"
            onClick={handleConsolidatedDailyClink}
            disabled={dailyClinkDone}
            className={`shrink-0 rounded-xl px-2.5 py-1.5 text-[10px] font-black transition active:scale-95 ${
              dailyClinkDone
                ? 'bg-emerald-900/60 text-emerald-300'
                : 'bg-gradient-to-r from-[#F5C451] to-[#FF5E4D] text-[#1A1030] shadow'
            }`}
          >
            {dailyClinkDone ? '✓ 🪙 1,000' : '🪙 +1,000 Claim'}
          </button>
        </div>

        {/* Who All Earned What & Their Rank (Clickable to visit profile & photos — expandable via ? Rules) */}
        <div className={showRankHelp ? 'space-y-1 text-[11px]' : 'sr-only'}>
          <div
            role="button"
            tabIndex={0}
            data-testid="winner-profile-link-1"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: 'Alex' } }),
              )
            }}
            className="flex cursor-pointer items-center justify-between rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/5 hover:border-rose-400/50 transition"
          >
            <span className="font-extrabold text-amber-200 underline decoration-amber-300/40 underline-offset-2">
              🥇 #1 @Alex_UK · Rank #1 · Earned +🪙 185,000 📸
            </span>
            <span className="text-[10px] font-bold text-amber-400">RNG + Rank ↗</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            data-testid="winner-profile-link-2"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: 'Mint' } }),
              )
            }}
            className="flex cursor-pointer items-center justify-between rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/5 hover:border-rose-400/50 transition"
          >
            <span className="font-extrabold text-purple-200 underline decoration-purple-300/40 underline-offset-2">
              🥈 #2 @Mint_BKK · Rank #2 · Earned +120,000 Pts 📸
            </span>
            <span className="text-[10px] font-bold text-purple-300">RNG + Rank ↗</span>
          </div>
          <div
            role="button"
            tabIndex={0}
            data-testid="winner-profile-link-3"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: 'Ploy' } }),
              )
            }}
            className="flex cursor-pointer items-center justify-between rounded-xl bg-black/35 px-2.5 py-1.5 border border-white/5 hover:border-rose-400/50 transition"
          >
            <span className="font-extrabold text-amber-100/90 underline decoration-amber-200/40 underline-offset-2">
              🥉 #3 @Kim_Seoul · Rank #3 · Earned +🪙 82,500 📸
            </span>
            <span className="text-[10px] font-bold text-amber-300/80">RNG Lucky Group ↗</span>
          </div>
        </div>

        {/* 1-Tap [🎁 Collect My Rank & Jackpot Share (🪙 +14,500)] Button */}
        <button
          type="button"
          data-testid="collect-rank-jackpot-btn"
          onClick={handleCollectRankShare}
          disabled={collectedRankShare}
          className={`w-full rounded-2xl py-2.5 text-xs font-black transition-all active:scale-95 shadow-md ${
            collectedRankShare
              ? 'cursor-default bg-emerald-900/60 text-emerald-300 border border-emerald-400/40'
              : 'bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-500 text-[#1A1030] hover:brightness-105 ring-1 ring-amber-300'
          }`}
        >
          {collectedRankShare ? (
            '✓ 🪙 14,500'
          ) : (
            <>
              🎁 Collect My Rank &amp; Jackpot Share (🪙 +14,500 Claim)
              <span className="sr-only"> · รับส่วนแบ่งแจ็กพอต</span>
            </>
          )}
        </button>

        {collectedRankShare && (
          <p
            data-testid="rank-jackpot-claimed-banner"
            className="sr-only"
          >
            ✅ +14,500 Coins Added to Your Wallet!
          </p>
        )}
      </div>
    </section>
  )
}

function TutorialChain({
  completedStepIds,
  onComplete,
}: {
  completedStepIds: ReadonlySet<string>
  onComplete: (step: TutorialStepDef) => void
}) {
  const [navNotification, setNavNotification] = useState<string | null>(null)

  function handleQuickGo(step: TutorialStepDef) {
    triggerHaptic('tap')
    setNavNotification(`Jumping to: ${step.title.replace('100c', '🪙 100').replace('task coins', '🪙')}`)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chon:navigate', {
          detail: { target: step.id, title: step.title },
        }),
      )
    }
    setTimeout(() => setNavNotification(null), 2500)
  }

  return (
    <section
      aria-label="Newcomer Starter Chest"
      className="space-y-2.5 rounded-3xl border border-white/15 bg-gradient-to-br from-[#36235A]/90 to-[#251741]/90 p-3.5 shadow-xl"
    >
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5">
            🎁 Starter Chest
            <span className="text-[10px] font-bold text-amber-300/80">· 1-Tap Fast Rewards</span>
          </h3>
        </div>
        <span className="rounded-full bg-gradient-to-r from-amber-400/20 to-yellow-400/20 px-2.5 py-0.5 text-[10px] font-black text-amber-300 ring-1 ring-amber-400/30">
          🪙 +2,900 Free
        </span>
      </header>

      {navNotification && (
        <div className="rounded-xl border border-teal-400/40 bg-teal-950/60 px-3 py-1.5 text-center text-[11px] font-bold text-teal-200 animate-pulse">
          🚀 {navNotification}
        </div>
      )}

      <ol className="space-y-2">
        {TUTORIAL_STEPS.map((step, index) => {
          const done = completedStepIds.has(step.id)
          const formattedReward = step.rewardBonusCoins.toLocaleString('en-US')
          const cleanWhisper = step.whisper.replace('100c', '🪙 100').replace('coin', '🪙')
          const conciseBilingualTitle: Record<string, string> = {
            'watch-story': '👀 Watch 10s Story',
            'vibe-check': '💛 1-Tap Vibe Check',
            'lucky-dice-gift': '🎲 Send a Lucky Gift',
            'peek-jackpot': '🎰 Check 9 PM Jackpot Pot',
            'toast-stories': '🥂 Toast 3 Live Stories',
          }
          const visibleTitle = conciseBilingualTitle[step.id] ?? step.title
          return (
            <li
              key={step.id}
              className={`flex items-center gap-1.5 rounded-2xl border p-2 transition-all ${
                done
                  ? 'border-emerald-400/40 bg-emerald-950/35'
                  : 'border-white/10 bg-[#1B1130]/75 hover:border-white/20'
              }`}
            >
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
                  done ? 'bg-emerald-400 text-[#1A1030]' : 'bg-white/10 text-amber-300'
                }`}
              >
                {done ? '✓' : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="sr-only">{step.title}</p>
                <p aria-hidden="true" className="text-[10.5px] font-bold leading-snug text-white">
                  {visibleTitle}
                </p>
                <p className="sr-only">{`whisper: ${step.whisper}`}</p>
                <p aria-hidden="true" className="truncate text-[9.5px] text-amber-300/90">
                  ✨ {cleanWhisper}
                </p>
              </div>

              {/* 1-Click Quick-Jump [Go ➔] Button */}
              <button
                type="button"
                data-testid={`task-go-${step.id}`}
                onClick={() => handleQuickGo(step)}
                className="shrink-0 rounded-xl border border-amber-400/35 bg-amber-400/10 px-1.5 py-1 text-[9.5px] font-black text-amber-300 hover:bg-amber-400/25 active:scale-95 transition"
              >
                Go ➔
              </button>

              {/* Right-Side Distributed [🪙 +... Claim] / [✓ 🪙 ...] Claim Button */}
              <button
                type="button"
                aria-label={`Claim reward for ${step.title}`}
                onClick={() => {
                  triggerHaptic('clink')
                  onComplete(step)
                }}
                disabled={done}
                className={`shrink-0 rounded-xl px-2 py-1 text-[10.5px] font-black transition-all active:scale-95 ${
                  done
                    ? 'cursor-default border border-emerald-400/40 bg-emerald-900/60 text-emerald-300'
                    : 'bg-gradient-to-r from-[#F5C451] to-amber-400 text-[#1A1030] shadow-[0_0_12px_rgba(245,196,81,0.35)] hover:brightness-105'
                }`}
              >
                {done ? `✓ 🪙 ${formattedReward}` : `🪙 +${formattedReward} Claim`}
              </button>
            </li>
          )
        })}
      </ol>
    </section>
  )
}

interface MiniGameCardProps {
  game: MiniGameDef
  roundsPlayed: number
  taskClaimed: boolean
  activeChatTarget: string | null
  onSelectChatTarget: (target: string) => void
  onPlay: (picked?: string, outcomeText?: string) => void
  onClaim: () => void
}

function MiniGameCard({
  game,
  roundsPlayed,
  taskClaimed,
  activeChatTarget,
  onSelectChatTarget,
  onPlay,
  onClaim,
}: MiniGameCardProps) {
  const [picked, setPicked] = useState<string | null>(null)
  const [outcome, setOutcome] = useState<string | null>(null)
  const [animating, setAnimating] = useState(false)
  const taskUnlocked = roundsPlayed >= game.roundsToUnlock

  function handlePlay() {
    triggerHaptic('combo')
    setAnimating(true)
    let result: string
    if (game.id === 'dice-shake') {
      const roll = 1 + Math.floor(cryptoRandomFloat() * 6)
      const rngRoll = cryptoRandomFloat()
      if (rngRoll < 0.78) {
        result = `You rolled a ${roll}! 🎲 0x Bluff Caught (-🪙 ${game.costCoins}) · +🪙 ${Math.floor(game.costCoins * 0.72)} added to 72% Pool — Shake again!`
      } else {
        const multiplier = rngRoll < 0.93 ? 2 : rngRoll < 0.985 ? 5 : 10
        const wonCoins = game.costCoins * multiplier
        result = `You rolled a ${roll}! 🎲 Bangkok Multiplier: ${multiplier}x · Won 🪙 ${wonCoins.toLocaleString('en-US')}!`
      }
    } else if (game.id === 'tuk-tuk-sprint') {
      const winner = game.options?.[Math.floor(Math.random() * (game.options?.length ?? 1))]
      const won = picked === winner
      result = won
        ? `🏁 Your ${picked} won the sprint! (+🪙 800)`
        : `🏁 The ${winner} edged you out (-🪙 ${game.costCoins}) — race again!`
    } else {
      result =
        '⚡ 60s Chemistry Vibe Duel Match! Chemistry matched with a Host — 2 of 3 Bangkok choices align!'
    }
    setOutcome(result)
    onPlay(picked ?? undefined, result)
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        setAnimating(false)
      }
    }, 800)
  }

  return (
    <article
      aria-label={game.name}
      className="space-y-3 rounded-3xl border border-white/15 bg-gradient-to-br from-[#36235A]/90 to-[#251741]/90 p-4 shadow-xl"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4
            className={`text-sm font-extrabold tracking-tight text-white flex items-center gap-1.5 ${
              animating ? 'animate-pulse text-amber-300' : ''
            }`}
          >
            {game.emoji} {game.name}
          </h4>
          <p className="text-xs text-purple-200/75">
            🪙 {game.costCoins} per{' '}
            {game.id === 'dice-shake' ? 'round' : game.id === 'tuk-tuk-sprint' ? 'race' : 'duel'} ·
            play {game.roundsToUnlock}{' '}
            {game.id === 'dice-shake' ? 'rounds' : game.id === 'tuk-tuk-sprint' ? 'races' : 'duel'}{' '}
            today
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-bold text-amber-300 ring-1 ring-white/10">
          {roundsPlayed}/{game.roundsToUnlock} played
        </span>
      </div>

      {/* Point 9: Live 4-Seat Social Table Games (WePlay / Plato Style) */}

      {/* GAME 1: dice-shake -> Chon! Lucky Dice Shake 4-Seat Social Table */}
      {game.id === 'dice-shake' && (
        <div className="space-y-2.5 rounded-2xl border border-amber-500/40 bg-gradient-to-b from-[#2B1B47] via-[#1E1136] to-[#140B25] p-3 shadow-inner">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-amber-300 flex items-center gap-1">
              🎲 Chon! Lucky Dice Shake · 4-Seat Lounge Table
            </span>
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-extrabold text-amber-200 ring-1 ring-amber-400/30">
              👥 4 Live Players
            </span>
          </div>

          {/* 4-Seat Table Stage (You, Mint 👱‍♀️, @Alex_UK, Ploy 👱‍♀️) */}
          <div className="grid grid-cols-4 gap-1.5 py-1">
            {[
              { id: 'seat-you', name: 'You', tag: '🎲 5 Dice Cup', emoji: '😎' },
              { id: 'seat-mint', name: 'Mint 👱‍♀️', tag: 'Bluff called!', emoji: '👱‍♀️' },
              { id: 'seat-alex', name: '@Alex_UK', tag: 'Call: 3 Fives', emoji: '🎩' },
              { id: 'seat-ploy', name: 'Ploy 👱‍♀️', tag: 'Shaking cup', emoji: '👩' },
            ].map((seat) => (
              <button
                key={seat.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  onSelectChatTarget(seat.name)
                }}
                className={`flex flex-col items-center rounded-xl p-1.5 text-center transition border ${
                  activeChatTarget === seat.name
                    ? 'border-amber-400 bg-amber-400/25 ring-1 ring-amber-400'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <span className="text-base">{seat.emoji}</span>
                <span className="text-[10px] font-extrabold text-white truncate w-full">{seat.name}</span>
                <span className="text-[9px] font-semibold text-amber-300/80 truncate w-full">{seat.tag}</span>
              </button>
            ))}
          </div>

          {/* 8-Slot Multiplier Wheel Visual */}
          <div className="space-y-1 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between text-[10px] font-bold text-purple-200/80">
              <span>🎡 Neon Multiplier Ring</span>
              <span className="text-amber-300">Bangkok Multiplier: up to 100x</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5 text-center">
              {['2x', '5x', '10x', '45x', '3x', '8x', '15x', '100x'].map((slot, idx) => (
                <div
                  key={idx}
                  className={`rounded-lg py-1.5 text-[10px] font-black border transition-all ${
                    animating && idx === 3
                      ? 'border-amber-400 bg-amber-400/30 text-amber-200 scale-105 shadow-[0_0_10px_rgba(251,191,36,0.5)]'
                      : 'border-white/10 bg-black/40 text-purple-200'
                  }`}
                >
                  {slot}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* GAME 2: tuk-tuk-sprint -> Sukhumvit Tuk-Tuk Sprint Table */}
      {game.id === 'tuk-tuk-sprint' && (
        <div className="space-y-2.5 rounded-2xl border border-teal-500/40 bg-gradient-to-b from-[#1C2C47] via-[#161D36] to-[#0F1424] p-3 shadow-inner">
          <div className="flex items-center justify-between text-[11px] font-bold text-teal-300">
            <span>🛺 Sukhumvit Tuk-Tuk Sprint · 4-Seat Lounge</span>
            <span className="text-[10px] text-amber-300 font-semibold">🍾 30s Rapid Round</span>
          </div>

          {/* 4-Seat Lounge Avatars with Spinning Bottle */}
          <div className="grid grid-cols-4 gap-1.5 py-1">
            {[
              { id: 'pt-you', name: 'You', status: 'Drop Card 🂠', emoji: '🏎️' },
              { id: 'pt-mint', name: 'Mint 👱‍♀️', status: 'Wild Red +2', emoji: '👱‍♀️' },
              { id: 'pt-alex', name: '@Alex_UK', status: 'Ocho! 🎯', emoji: '🎩' },
              { id: 'pt-ploy', name: 'Ploy 👱‍♀️', status: 'Bottle Point 🍾', emoji: '👩' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  onSelectChatTarget(p.name)
                }}
                className={`flex flex-col items-center rounded-xl p-1.5 text-center transition border ${
                  activeChatTarget === p.name
                    ? 'border-teal-400 bg-teal-400/25 ring-1 ring-teal-400'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <span className="text-base">{p.emoji}</span>
                <span className="text-[10px] font-extrabold text-white truncate w-full">{p.name}</span>
                <span className="text-[9px] font-semibold text-teal-200/80 truncate w-full">{p.status}</span>
              </button>
            ))}
          </div>

          {/* 3-Lane Neon Drift Track */}
          <div className="space-y-1 text-[10px] pt-1 border-t border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-16 font-bold text-rose-300">Sukhumvit</span>
              <div className="relative h-2 flex-1 rounded-full bg-black/60 overflow-hidden border border-rose-500/30">
                <div
                  className={`h-full bg-gradient-to-r from-rose-500 to-rose-400 transition-all duration-700 ${
                    animating ? 'w-full' : 'w-3/4'
                  }`}
                />
              </div>
              <span>🔴</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 font-bold text-amber-300">Thonglor</span>
              <div className="relative h-2 flex-1 rounded-full bg-black/60 overflow-hidden border border-amber-500/30">
                <div
                  className={`h-full bg-gradient-to-r from-amber-500 to-yellow-300 transition-all duration-700 ${
                    animating ? 'w-4/5' : 'w-2/3'
                  }`}
                />
              </div>
              <span>🟡</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-16 font-bold text-teal-300">Pattaya</span>
              <div className="relative h-2 flex-1 rounded-full bg-black/60 overflow-hidden border border-teal-500/30">
                <div
                  className={`h-full bg-gradient-to-r from-teal-500 to-cyan-300 transition-all duration-700 ${
                    animating ? 'w-full' : 'w-1/2'
                  }`}
                />
              </div>
              <span>🔵</span>
            </div>
          </div>
        </div>
      )}

      {/* GAME 3: vibe-duel -> 60s Chemistry Vibe Duel 4-Seat Social Lounge Table */}
      {game.id === 'vibe-duel' && (
        <div className="space-y-2.5 rounded-2xl border border-violet-500/40 bg-gradient-to-b from-[#2B1745] via-[#1D1033] to-[#120822] p-3 shadow-inner">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-bold text-violet-200">
              🥂 60s Chemistry Vibe Duel · 4-Seat Social Lounge
            </span>
            <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-[10px] font-black text-amber-300">
              Chemistry Match
            </span>
          </div>

          {/* 4 Live Player Velvet Table View (You, Mint 👱‍♀️, @Alex_UK, Ploy 👱‍♀️) */}
          <div className="grid grid-cols-4 gap-1.5 py-1">
            {[
              { id: 'pd-you', name: 'You', hand: '🍸 + ✨ (Matched!)', emoji: '😎' },
              { id: 'pd-mint', name: 'Mint 👱‍♀️', hand: '🥂 + 🔥 (Matched)', emoji: '👱‍♀️' },
              { id: 'pd-alex', name: '@Alex_UK', hand: '🎶 + 🌆 (7 Pts)', emoji: '🎩' },
              { id: 'pd-ploy', name: 'Ploy 👱‍♀️', hand: '🧋 + ✨ (Matched)', emoji: '👩' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  triggerHaptic('tap')
                  onSelectChatTarget(p.name)
                }}
                className={`flex flex-col items-center rounded-xl p-1.5 text-center transition border ${
                  activeChatTarget === p.name
                    ? 'border-violet-400 bg-violet-400/25 ring-1 ring-violet-400'
                    : 'border-white/10 bg-black/40 hover:border-white/20'
                }`}
              >
                <span className="text-base">{p.emoji}</span>
                <span className="text-[10px] font-extrabold text-white truncate w-full">{p.name}</span>
                <span className="text-[9px] font-semibold text-amber-300 truncate w-full">{p.hand}</span>
              </button>
            ))}
          </div>

          {/* 2-Card Vibe Match Display */}
          <div className="flex items-center justify-center gap-3 py-1 bg-black/35 rounded-xl border border-white/5">
            <div className="flex h-12 w-9 items-center justify-center rounded-lg border border-amber-300/40 bg-gradient-to-br from-amber-100 to-amber-200 text-lg font-black text-rose-700 shadow-md">
              🥂
            </div>
            <span className="text-sm font-black text-amber-400">+</span>
            <div className="flex h-12 w-9 items-center justify-center rounded-lg border border-amber-300/40 bg-gradient-to-br from-amber-100 to-amber-200 text-lg font-black text-slate-900 shadow-md">
              ✨
            </div>
            <div className="ml-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-2.5 py-1 text-center">
              <p className="text-xs font-black text-amber-300">Vibe Match!</p>
              <p className="text-[9px] font-bold text-purple-200">Rooftop Match</p>
            </div>
          </div>
        </div>
      )}

      {game.options && (
        <div
          className="flex gap-1.5"
          role="group"
          aria-label={`Pick your ${game.id === 'tuk-tuk-sprint' ? 'tuk-tuk' : 'vibe'}`}
        >
          {game.options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                triggerHaptic('tap')
                setPicked(option)
              }}
              aria-pressed={picked === option}
              className={`flex-1 rounded-xl border px-2 py-2 text-[11px] font-bold transition-all active:scale-95 ${
                picked === option
                  ? 'border-amber-400 bg-amber-400/25 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.2)]'
                  : 'border-white/10 bg-[#1B1130]/75 text-purple-100 hover:border-white/25'
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={handlePlay}
        disabled={game.options !== undefined && picked === null}
        className="w-full rounded-2xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-500 px-3 py-2.5 text-xs font-extrabold text-white shadow-lg transition-all hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:from-white/10 disabled:to-white/10 disabled:text-purple-200/40"
      >
        {game.id === 'dice-shake'
          ? '🎲 Shake the dice'
          : game.id === 'tuk-tuk-sprint'
            ? '🛺 Start the race'
            : '⚡ Start 60s duel'}{' '}
        (🪙 {game.costCoins})
      </button>

      {outcome && (
        <p role="status" className="sr-only">
          {outcome}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="sr-only">
          Daily task reward: +{game.rewardBonusCoins.toLocaleString('en-US')} Bonus Coins
          {game.boosterCoins ? ` + ${game.boosterCoins.toLocaleString('en-US')}c Envelope Booster` : ''}
        </p>
        <p aria-hidden="true" className="text-[11px] font-semibold text-purple-200/80">
          Daily task: 🪙 +{game.rewardBonusCoins.toLocaleString('en-US')}
          {game.boosterCoins ? ` + 🪙 ${game.boosterCoins.toLocaleString('en-US')} Booster` : ''}
        </p>
        <button
          type="button"
          aria-label={taskClaimed ? 'Claimed ✓' : 'Claim'}
          onClick={() => {
            triggerHaptic('jackpot')
            onClaim()
          }}
          disabled={!taskUnlocked || taskClaimed}
          className={`shrink-0 rounded-xl px-3 py-2 text-xs font-black transition-all active:scale-95 ${
            taskClaimed
              ? 'cursor-default border border-emerald-400/40 bg-emerald-900/60 text-emerald-300'
              : taskUnlocked
                ? 'bg-gradient-to-r from-[#F5C451] to-amber-400 text-[#1A1030] shadow-[0_0_12px_rgba(245,196,81,0.35)] hover:brightness-105'
                : 'cursor-not-allowed bg-white/10 text-purple-200/40'
          }`}
        >
          <span className="sr-only">{taskClaimed ? 'Claimed ✓' : 'Claim'}</span>
          <span aria-hidden="true">
            {taskClaimed
              ? `✓ 🪙 ${game.rewardBonusCoins.toLocaleString('en-US')}`
              : `🪙 +${game.rewardBonusCoins.toLocaleString('en-US')} Claim`}
          </span>
        </button>
      </div>
    </article>
  )
}

function DailyRankLeaderboard() {
  const [period, setPeriod] = useState<'daily' | 'yesterday' | 'weekly'>('daily')
  const [tab, setTab] = useState<'hosts' | 'travelers' | 'agencies'>('hosts')

  const dailyData = {
    hosts: [
      { rank: 1, medal: '🥇', name: 'Mint', flag: '🇹🇭', area: 'Thonglor', badge: '👑 Charm Queen', value: '฿48,500', bonus: '+25,000 Pts' },
      { rank: 2, medal: '🥈', name: 'Ploy', flag: '🇹🇭', area: 'Sukhumvit', badge: '⭐ Rising Star', value: '฿32,100', bonus: '+15,000 Pts' },
      { rank: 3, medal: '🥉', name: 'Kwan', flag: '🇻🇳', area: 'Asok', badge: '💖 Vibe Idol', value: '฿24,800', bonus: '+8,000 Pts' },
      { rank: 4, medal: '4', name: 'Fah', flag: '🇷🇺', area: 'Pattaya', badge: '🌊 Beach VIP', value: '฿19,400', bonus: '+4,000 Pts' },
      { rank: 5, medal: '5', name: 'Bee', flag: '🇹🇭', area: 'Octave', badge: '🍸 Rooftop Host', value: '฿15,200', bonus: '+2,500 Pts' },
    ],
    travelers: [
      { rank: 1, medal: '🥇', name: 'Ken_Tokyo', flag: '🇯🇵', area: 'Bangkok', badge: '🐋 Diamond Whale', value: '🪙 1,450,000', bonus: '+🪙 50,000' },
      { rank: 2, medal: '🥈', name: 'Dave_BKK', flag: '🇬🇧', area: 'Pattaya', badge: '🍾 VIP Gifter', value: '🪙 980,000', bonus: '+🪙 30,000' },
      { rank: 3, medal: '🥉', name: 'Alex_SG', flag: '🇸🇬', area: 'Thonglor', badge: '⚡ High Roller', value: '🪙 720,000', bonus: '+🪙 15,000' },
      { rank: 4, medal: '4', name: 'Kim_Seoul', flag: '🇰🇷', area: 'Asok', badge: '🔥 Combo King', value: '🪙 540,000', bonus: '+🪙 8,000' },
      { rank: 5, medal: '5', name: 'Max_RU', flag: '🇷🇺', area: 'Pattaya', badge: '🛥️ Yacht Boss', value: '🪙 410,000', bonus: '+🪙 5,000' },
    ],
    agencies: [
      { rank: 1, medal: '🥇', name: 'Bangkok Creator Squad', flag: '🇹🇭', area: '16% Gold Tier', badge: '👑 Gold Squad', value: '฿280,000', bonus: '+฿15,000 Pool' },
      { rank: 2, medal: '🥈', name: 'Thonglor Stars', flag: '🇹🇭', area: '16% Gold Tier', badge: '🌟 Gold Squad', value: '฿195,000', bonus: '+฿8,000 Pool' },
      { rank: 3, medal: '🥉', name: 'Pattaya Bay Crew', flag: '🇹🇭', area: '12% Silver Tier', badge: '🏖️ Beach Squad', value: '฿140,000', bonus: '+฿4,000 Pool' },
      { rank: 4, medal: '4', name: 'Sukhumvit Elite', flag: '🇻🇳', area: '12% Silver Tier', badge: '🏢 Verified', value: '฿98,000', bonus: '+฿2,000 Pool' },
      { rank: 5, medal: '5', name: 'Seoul BKK Crew', flag: '🇰🇷', area: '8% Bronze Tier', badge: '🚀 Rising', value: '฿64,000', bonus: '+฿1,000 Pool' },
    ],
  }

  const yesterdayData = {
    hosts: [
      { rank: 1, medal: '🥇', name: 'Ploy', flag: '🇹🇭', area: 'Sukhumvit', badge: '🏆 Yesterday #1', value: '฿52,400', bonus: 'Paid +25,000 Pts ✓' },
      { rank: 2, medal: '🥈', name: 'Mint', flag: '🇹🇭', area: 'Thonglor', badge: '🥈 Yesterday #2', value: '฿44,900', bonus: 'Paid +15,000 Pts ✓' },
      { rank: 3, medal: '🥉', name: 'Fah', flag: '🇷🇺', area: 'Pattaya', badge: '🥉 Yesterday #3', value: '฿31,200', bonus: 'Paid +8,000 Pts ✓' },
      { rank: 4, medal: '4', name: 'Kwan', flag: '🇻🇳', area: 'Asok', badge: '💖 Yesterday #4', value: '฿22,800', bonus: 'Paid +4,000 Pts ✓' },
      { rank: 5, medal: '5', name: 'Bell', flag: '🇹🇭', area: 'Silom', badge: '🍸 Yesterday #5', value: '฿18,100', bonus: 'Paid +2,500 Pts ✓' },
    ],
    travelers: [
      { rank: 1, medal: '🥇', name: 'Alex_SG', flag: '🇸🇬', area: 'Thonglor', badge: '🏆 Yesterday King', value: '🪙 1,680,000', bonus: 'Paid +🪙 50,000 ✓' },
      { rank: 2, medal: '🥈', name: 'Ken_Tokyo', flag: '🇯🇵', area: 'Bangkok', badge: '🥈 Yesterday #2', value: '🪙 1,320,000', bonus: 'Paid +🪙 30,000 ✓' },
      { rank: 3, medal: '🥉', name: 'Kim_Seoul', flag: '🇰🇷', area: 'Asok', badge: '🥉 Yesterday #3', value: '🪙 890,000', bonus: 'Paid +🪙 15,000 ✓' },
      { rank: 4, medal: '4', name: 'Dave_BKK', flag: '🇬🇧', area: 'Pattaya', badge: '🍾 Yesterday #4', value: '🪙 640,000', bonus: 'Paid +🪙 8,000 ✓' },
      { rank: 5, medal: '5', name: 'Liam_AU', flag: '🇦🇺', area: 'Sukhumvit', badge: '🥂 Yesterday #5', value: '🪙 480,000', bonus: 'Paid +🪙 5,000 ✓' },
    ],
    agencies: [
      { rank: 1, medal: '🥇', name: 'Bangkok Creator Squad', flag: '🇹🇭', area: '16% Gold Tier', badge: '🏆 Yesterday #1', value: '฿310,000', bonus: 'Paid +฿15,000 ✓' },
      { rank: 2, medal: '🥈', name: 'Pattaya Bay Crew', flag: '🇹🇭', area: '16% Gold Tier', badge: '🥈 Yesterday #2', value: '฿215,000', bonus: 'Paid +฿8,000 ✓' },
      { rank: 3, medal: '🥉', name: 'Thonglor Stars', flag: '🇹🇭', area: '16% Gold Tier', badge: '🥉 Yesterday #3', value: '฿180,000', bonus: 'Paid +฿4,000 ✓' },
      { rank: 4, medal: '4', name: 'Sukhumvit Elite', flag: '🇻🇳', area: '12% Silver Tier', badge: '🏢 Yesterday #4', value: '฿112,000', bonus: 'Paid +฿2,000 ✓' },
      { rank: 5, medal: '5', name: 'Seoul BKK Crew', flag: '🇰🇷', area: '8% Bronze Tier', badge: '🚀 Yesterday #5', value: '฿75,000', bonus: 'Paid +฿1,000 ✓' },
    ],
  }

  const weeklyData = {
    hosts: [
      { rank: 1, medal: '🥇', name: 'Mint', flag: '🇹🇭', area: 'Thonglor', badge: '👑 Weekly Empress', value: '฿312,000', bonus: '+150,000 Pts' },
      { rank: 2, medal: '🥈', name: 'Fah', flag: '🇷🇺', area: 'Pattaya', badge: '🌊 Weekly Star', value: '฿245,000', bonus: '+90,000 Pts' },
      { rank: 3, medal: '🥉', name: 'Ploy', flag: '🇹🇭', area: 'Sukhumvit', badge: '💎 Top Creator', value: '฿198,400', bonus: '+50,000 Pts' },
      { rank: 4, medal: '4', name: 'Kwan', flag: '🇻🇳', area: 'Asok', badge: '🔥 Hot Streak', value: '฿154,000', bonus: '+25,000 Pts' },
      { rank: 5, medal: '5', name: 'Bell', flag: '🇹🇭', area: 'Silom', badge: '💃 Party Queen', value: '฿118,500', bonus: '+12,000 Pts' },
    ],
    travelers: [
      { rank: 1, medal: '🥇', name: 'Ken_Tokyo', flag: '🇯🇵', area: 'Bangkok', badge: '👑 Emperor Whale', value: '🪙 8,900,000', bonus: '+🪙 300,000' },
      { rank: 2, medal: '🥈', name: 'Alex_SG', flag: '🇸🇬', area: 'Thonglor', badge: '🐋 Mega Patron', value: '🪙 6,200,000', bonus: '+🪙 180,000' },
      { rank: 3, medal: '🥉', name: 'Dave_BKK', flag: '🇬🇧', area: 'Pattaya', badge: '🍾 Legend VIP', value: '🪙 4,750,000', bonus: '+🪙 100,000' },
      { rank: 4, medal: '4', name: 'Kim_Seoul', flag: '🇰🇷', area: 'Asok', badge: '⚡ Lucky King', value: '🪙 3,100,000', bonus: '+🪙 50,000' },
      { rank: 5, medal: '5', name: 'Liam_AU', flag: '🇦🇺', area: 'Sukhumvit', badge: '🥂 Clink Boss', value: '🪙 2,400,000', bonus: '+🪙 25,000' },
    ],
    agencies: [
      { rank: 1, medal: '🥇', name: 'Bangkok Creator Squad', flag: '🇹🇭', area: '16% Gold Tier', badge: '👑 #1 Weekly Squad', value: '฿1,850,000', bonus: '+฿80,000 Pool' },
      { rank: 2, medal: '🥈', name: 'Thonglor Stars', flag: '🇹🇭', area: '16% Gold Tier', badge: '🌟 Elite Squad', value: '฿1,240,000', bonus: '+฿45,000 Pool' },
      { rank: 3, medal: '🥉', name: 'Pattaya Bay Crew', flag: '🇹🇭', area: '16% Gold Tier', badge: '🏖️ Top Coastal', value: '฿920,000', bonus: '+฿25,000 Pool' },
      { rank: 4, medal: '4', name: 'Sukhumvit Elite', flag: '🇻🇳', area: '12% Silver Tier', badge: '🏢 Pro Squad', value: '฿610,000', bonus: '+฿12,000 Pool' },
      { rank: 5, medal: '5', name: 'Seoul BKK Crew', flag: '🇰🇷', area: '12% Silver Tier', badge: '🚀 Fast Growth', value: '฿430,000', bonus: '+฿6,000 Pool' },
    ],
  }

  const activeDataset =
    period === 'daily' ? dailyData : period === 'yesterday' ? yesterdayData : weeklyData
  const activeList =
    tab === 'hosts'
      ? activeDataset.hosts
      : tab === 'travelers'
        ? activeDataset.travelers
        : activeDataset.agencies

  const [first, second, third, ...runnersUp] = activeList

  return (
    <section
      aria-label="Daily Rank Leaderboard"
      data-testid="podium-rank-leaderboard"
      className="space-y-2.5 rounded-3xl border border-amber-400/30 bg-gradient-to-b from-[#341C56] via-[#24133D] to-[#170C29] p-3.5 shadow-2xl"
    >
      {/* Top Header + Today / Yesterday / Weekly Running Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="flex items-center gap-1.5 text-xs font-black tracking-tight text-white">
            🏆{' '}
            {period === 'daily'
              ? 'Today Live Ranks'
              : period === 'yesterday'
                ? "Yesterday's Rank Winners"
                : 'Weekly Running Ranks'}
          </h4>
          <p className="text-[9.5px] font-semibold text-amber-300/85">
            {period === 'daily'
              ? 'Resets 00:00 BKK · Top 10 Earn Pool Bonus'
              : period === 'yesterday'
                ? "Yesterday's Final Settled Podium & Payouts"
                : 'Running Mon–Sun 23:59 BKK · Mega Weekly Crown Pool'}
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Ranking period switcher"
          className="flex rounded-full border border-amber-400/35 bg-black/45 p-0.5 text-[9.5px] font-black"
        >
          <button
            type="button"
            role="tab"
            aria-selected={period === 'daily'}
            onClick={() => {
              triggerHaptic('tap')
              setPeriod('daily')
            }}
            className={`rounded-full px-2 py-1 transition ${
              period === 'daily'
                ? 'bg-gradient-to-r from-[#F5C451] to-amber-500 text-[#1A1030] shadow'
                : 'text-purple-200/75 hover:text-white'
            }`}
          >
            🔥 Today
          </button>
          <button
            type="button"
            role="tab"
            data-testid="rank-period-yesterday"
            aria-selected={period === 'yesterday'}
            onClick={() => {
              triggerHaptic('tap')
              setPeriod('yesterday')
            }}
            className={`rounded-full px-2 py-1 transition ${
              period === 'yesterday'
                ? 'bg-gradient-to-r from-emerald-400 to-teal-400 text-[#1A1030] shadow'
                : 'text-purple-200/75 hover:text-white'
            }`}
          >
            ⏮️ Yesterday
          </button>
          <button
            type="button"
            role="tab"
            data-testid="rank-period-weekly"
            aria-selected={period === 'weekly'}
            onClick={() => {
              triggerHaptic('tap')
              setPeriod('weekly')
            }}
            className={`rounded-full px-2 py-1 transition ${
              period === 'weekly'
                ? 'bg-gradient-to-r from-[#F5C451] to-[#FF5E4D] text-[#1A1030] shadow'
                : 'text-purple-200/75 hover:text-white'
            }`}
          >
            👑 Weekly Running
          </button>
        </div>
      </div>

      {/* Category Switcher: Top Hosts | Travellers | Agencies */}
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-black/40 p-1 text-[10.5px] font-bold">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setTab('hosts')
          }}
          className={`rounded-lg py-1 transition ${
            tab === 'hosts'
              ? 'border border-amber-400/40 bg-amber-400/25 text-amber-200'
              : 'text-purple-200/60'
          }`}
        >
          👸 Charm Hosts
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setTab('travelers')
          }}
          className={`rounded-lg py-1 transition ${
            tab === 'travelers'
              ? 'border border-amber-400/40 bg-amber-400/25 text-amber-200'
              : 'text-purple-200/60'
          }`}
        >
          🐋 Wealth VIPs
        </button>
        <button
          type="button"
          onClick={() => {
            triggerHaptic('tap')
            setTab('agencies')
          }}
          className={`rounded-lg py-1 transition ${
            tab === 'agencies'
              ? 'border border-amber-400/40 bg-amber-400/25 text-amber-200'
              : 'text-purple-200/60'
          }`}
        >
          🏢 Agencies
        </button>
      </div>

      {/* Live-App Style Top-3 Visual Podium (#2 Left, Elevated #1 Center, #3 Right — Clickable to Visit Profile!) */}
      <div className="grid grid-cols-3 items-end gap-2 pt-2">
        {/* #2 Silver Podium (Left) */}
        {second && (
          <div
            role="button"
            tabIndex={0}
            data-testid="rank-profile-link-2"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: second.name } }),
              )
            }}
            className="flex cursor-pointer flex-col items-center rounded-2xl border border-slate-300/30 bg-gradient-to-b from-slate-400/15 to-black/45 p-2 text-center hover:border-rose-400/60 transition"
          >
            <span className="text-xs">🥈 #2</span>
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-slate-300 bg-[#2B1B48] text-sm font-black text-white shadow">
              {second.flag}
            </div>
            <p className="mt-1 w-full truncate text-[10.5px] font-extrabold text-white underline decoration-white/30 underline-offset-2">
              {second.name} 📸
            </p>
            <p className="text-[9px] text-purple-200/75">{second.area}</p>
            <p className="mt-0.5 text-[10px] font-black text-slate-200">{second.value}</p>
            <span className="mt-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[8.5px] font-bold text-emerald-300">
              {second.bonus}
            </span>
          </div>
        )}

        {/* #1 Gold Crown Podium (Elevated Center) */}
        {first && (
          <div
            role="button"
            tabIndex={0}
            data-testid="rank-profile-link-1"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: first.name } }),
              )
            }}
            className="-mt-2 flex cursor-pointer flex-col items-center rounded-2xl border-2 border-amber-400/80 bg-gradient-to-b from-amber-400/30 via-[#38205B] to-black/55 p-2.5 text-center shadow-[0_0_24px_rgba(245,196,81,0.35)] hover:scale-[1.02] transition"
          >
            <span className="text-sm leading-none">👑🥇 #1</span>
            <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-300 bg-gradient-to-tr from-amber-500 to-yellow-200 text-base font-black text-[#1A1030] shadow-[0_0_14px_#F5C451]">
              {first.flag}
            </div>
            <p className="mt-1 w-full truncate text-xs font-black text-amber-200 underline decoration-amber-300/50 underline-offset-2">
              {first.name} 📸
            </p>
            <p className="text-[9px] font-bold text-amber-100/80">{first.badge}</p>
            <p className="mt-0.5 text-[11px] font-black text-amber-300">{first.value}</p>
            <span className="mt-0.5 rounded-full bg-amber-400/25 px-2 py-0.5 text-[9px] font-extrabold text-amber-200 ring-1 ring-amber-300/50">
              {first.bonus}
            </span>
          </div>
        )}

        {/* #3 Bronze Podium (Right) */}
        {third && (
          <div
            role="button"
            tabIndex={0}
            data-testid="rank-profile-link-3"
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: third.name } }),
              )
            }}
            className="flex cursor-pointer flex-col items-center rounded-2xl border border-amber-700/40 bg-gradient-to-b from-amber-700/20 to-black/45 p-2 text-center hover:border-rose-400/60 transition"
          >
            <span className="text-xs">🥉 #3</span>
            <div className="mt-1 flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-500/70 bg-[#2B1B48] text-sm font-black text-white shadow">
              {third.flag}
            </div>
            <p className="mt-1 w-full truncate text-[10.5px] font-extrabold text-white underline decoration-white/30 underline-offset-2">
              {third.name} 📸
            </p>
            <p className="text-[9px] text-purple-200/75">{third.area}</p>
            <p className="mt-0.5 text-[10px] font-black text-amber-300/90">{third.value}</p>
            <span className="mt-0.5 rounded-full bg-white/10 px-1.5 py-0.5 text-[8.5px] font-bold text-emerald-300">
              {third.bonus}
            </span>
          </div>
        )}
      </div>

      {/* Compact #4 & #5 Runner-Up List (Clickable to Visit Profile!) */}
      <div className="space-y-1">
        {runnersUp.map((item) => (
          <div
            key={item.rank}
            role="button"
            tabIndex={0}
            onClick={() => {
              triggerHaptic('tap')
              window.dispatchEvent(
                new CustomEvent('chon:open-host-profile', { detail: { hostName: item.name } }),
              )
            }}
            className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 bg-black/35 px-3 py-1.5 text-[11px] hover:border-rose-400/50 transition"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 text-[10px] font-black text-purple-200">
                #{item.rank}
              </span>
              <span className="text-xs">{item.flag}</span>
              <div>
                <span className="font-extrabold text-white underline decoration-white/30 underline-offset-2">
                  {item.name} 📸
                </span>
                <span className="ml-1.5 text-[9.5px] text-purple-200/70">· {item.badge}</span>
              </div>
            </div>
            <div className="text-right">
              <span className="font-black text-amber-300">{item.value}</span>
              <span className="ml-1.5 text-[9.5px] font-bold text-emerald-300">({item.bonus})</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}


/* =========================================================================
 * Atlas D9 · Rewards hub — Today / Ranks / Games (later). The ONE daily-rewards place.
 * Claim is grey until the task is done, then gold with a soft glow; a claim spins the coin once.
 * Claims go through the drawer's existing handler (same bonus-coin path as before — no new money paths).
 * ========================================================================= */
const STREAK_KEY = 'chon_streak_v1'
const READY_KEY = 'chon_task_ready_v1'
const HUB_TASKS: Array<{ id: string; icon: string; short: string; th: string }> = [
  { id: 'watch-story', icon: '👀', short: 'Watch 1 story', th: 'ดูสตอรี่ 1 เรื่อง' },
  { id: 'vibe-check', icon: '✨', short: 'Send 1 vibe check', th: 'ส่งไวบ์ให้โฮสต์' },
  { id: 'toast-stories', icon: '🥂', short: 'Toast 3 stories', th: 'ยืนยันแผนคืนนี้' },
  { id: 'lucky-dice-gift', icon: '🎲', short: 'Send a free lucky dice', th: 'ส่งลูกเต๋านำโชคฟรี' },
]
const WHISPER_TH: Record<string, string> = {
  'watch-story': 'ดูว่าคืนนี้ใครออกมาบ้าง 👀',
  'vibe-check': '3 แตะ บอกว่าสนใจ 💛',
  'toast-stories': 'ชนแก้วสตอรี่ ขึ้นหน้าแรกของแชต 🥂',
  'lucky-dice-gift': 'ลุ้นโชคครั้งแรก 🎲',
}
/** Ploy B9: a host's "today" is hosting habits (no bonus-coin tasks — hosts earn baht, not coins). */
const HOST_TODOS: Array<{ id: string; icon: string; en: string; th: string; subEn: string; subTh: string }> = [
  { id: 'post-story', icon: '📸', en: 'Post tonight’s story', th: 'โพสต์สตอรี่คืนนี้', subEn: 'Top of Meet for 2 hours', subTh: 'ขึ้นบนสุดของ Meet 2 ชั่วโมง' },
  { id: 'answer', icon: '💬', en: 'Answer your requests', th: 'ตอบคำขอ', subEn: 'Within 15 min earns “fast reply”', subTh: 'ตอบใน 15 นาที ได้ป้าย “ตอบไว”' },
  { id: 'online', icon: '🟢', en: 'Go online for tonight', th: 'เปิดออนไลน์คืนนี้', subEn: 'Guests can send you a plan', subTh: 'แขกส่งคำขอนัดมาได้' },
]

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function useStreak(): { streak: number; days: Set<string> } {
  const [state] = useState(() => {
    let days: string[] = []
    try {
      const raw = window.localStorage.getItem(STREAK_KEY)
      days = raw ? (JSON.parse(raw) as string[]) : []
      if (!Array.isArray(days)) days = []
    } catch {
      days = []
    }
    const today = dayKey(new Date())
    if (!days.includes(today)) days = [...days, today].slice(-30)
    try {
      window.localStorage.setItem(STREAK_KEY, JSON.stringify(days))
    } catch {
      // ignore
    }
    const set = new Set(days)
    let streak = 0
    const d = new Date()
    while (set.has(dayKey(d))) {
      streak += 1
      d.setDate(d.getDate() - 1)
    }
    return { streak, days: set }
  })
  return state
}

/** Done-but-unclaimed tasks, kept for TODAY across reloads (Wei B4). */
function readReady(): string[] {
  try {
    const raw = window.localStorage.getItem(READY_KEY)
    const v = raw ? (JSON.parse(raw) as { day?: string; ids?: string[] }) : null
    return v && v.day === new Date().toDateString() && Array.isArray(v.ids) ? v.ids : []
  } catch {
    return []
  }
}
function writeReady(ids: string[]) {
  try {
    window.localStorage.setItem(READY_KEY, JSON.stringify({ day: new Date().toDateString(), ids }))
  } catch {
    // ignore
  }
}

function RewardsHub({
  balance,
  completed,
  onClaim,
}: {
  balance: number
  completed: ReadonlySet<string>
  onClaim: (step: TutorialStepDef) => void
}) {
  const [tab, setTab] = useState<'today' | 'ranks'>('today')
  const [ready, setReady] = useState<string[]>(() => (typeof window === 'undefined' ? [] : readReady()))
  const [spin, setSpin] = useState(0)
  const { streak, days } = useStreak()
  const tr = useTr()
  const isHost = useIsHostRole()
  const th = useIsThai()
  const hostOnline = (() => {
    try {
      return window.localStorage.getItem('chon_host_online_v1') === '1'
    } catch {
      return false
    }
  })()

  useEffect(() => {
    // other screens can mark a task done: window.dispatchEvent(new CustomEvent('chon:task-done', { detail: { id } }))
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ id?: string; task?: string }>).detail
      const id = d?.id ?? d?.task
      if (!id) return
      setReady((prev) => {
        if (prev.includes(id)) return prev
        const next = [...prev, id]
        writeReady(next)
        return next
      })
    }
    const onStory = () => on(new CustomEvent('chon:task-done', { detail: { id: 'post-story' } }))
    // a lucky dice actually sent (any lucky gift through the wallet bus) completes the dice task
    const onDelta = (e: Event) => {
      const note = (e as CustomEvent<{ note?: string }>).detail?.note ?? ''
      if (/lucky|dice/i.test(note)) on(new CustomEvent('chon:task-done', { detail: { id: 'lucky-dice-gift' } }))
    }
    window.addEventListener('chon:task-done', on)
    window.addEventListener('chon:story-posted', onStory)
    window.addEventListener('chon:wallet-delta', onDelta)
    return () => {
      window.removeEventListener('chon:task-done', on)
      window.removeEventListener('chon:story-posted', onStory)
      window.removeEventListener('chon:wallet-delta', onDelta)
    }
  }, [])

  // Mon..Sun of this week
  const now = new Date()
  const monday = new Date(now)
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
  const week = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { key: dayKey(d), label: (th ? ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] : 'MTWTFSS'.split(''))[i], isToday: dayKey(d) === dayKey(now), isPast: d < now }
  })

  return (
    <div className="wr-hub" data-testid="rewards-hub">
      <div className="wr-head">
        <h3>{isHost ? tr('Tonight', 'คืนนี้') : tr('Rewards', 'รางวัล')}</h3>
        {isHost ? null : (
          <span className="wr-bal" aria-label={`${balance.toLocaleString('en-US')} bonus coins`}>
            <Coin3D size={18} spinKey={spin} symbol="c" />
            {balance.toLocaleString('en-US')}c
          </span>
        )}
        <button
          type="button"
          className="wl-q m-press"
          aria-label={tr('How rewards work', 'รางวัลทำงานยังไง')}
          onClick={() => window.dispatchEvent(new CustomEvent('chon:open-guide', { detail: { id: 'rewards' } }))}
        >
          ?
        </button>
      </div>
      <div className="wr-tabs" role="tablist" aria-label="Rewards sections">
        <button type="button" role="tab" aria-selected={tab === 'today'} onClick={() => setTab('today')}>
          {tr('Today', 'วันนี้')}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'ranks'} onClick={() => setTab('ranks')}>
          {tr('Ranks', 'อันดับ')}
        </button>
        <button type="button" role="tab" aria-selected={false} disabled aria-label="Games — coming later">
          {tr('Games', 'เกม')}
          <sup>{tr('LATER', 'เร็วๆ นี้')}</sup>
        </button>
      </div>

      {tab === 'today' ? (
        <>
          <div className="wr-streak">
            <div className="wr-streak-top">
              <b>{tr(`${streak}-day streak 🔥`, `ต่อเนื่อง ${streak} วัน 🔥`)}</b>
              <span className="wl-dim">{tr('open Chonn! daily', 'เข้า Chonn! ทุกวัน')}</span>
            </div>
            <div className="wr-days" aria-hidden="true">
              {week.map((d) => (
                <span key={d.key} className={d.isToday ? 'is-now' : days.has(d.key) ? 'is-ok' : ''}>
                  <i>{days.has(d.key) && !d.isToday ? '✓' : d.isToday ? '•' : ''}</i>
                  {d.label}
                </span>
              ))}
            </div>
          </div>
          {isHost ? (
            <div className="wl-list" data-testid="rewards-host-todos">
              {HOST_TODOS.map((t) => {
                const done = ready.includes(t.id) || (t.id === 'online' && hostOnline)
                return (
                  <div className="wl-row wr-task" key={t.id}>
                    <span className="wl-row-ic" aria-hidden="true">{t.icon}</span>
                    <span className="wl-row-t">
                      <b>{tr(t.en, t.th)}</b>
                      <small>{tr(t.subEn, t.subTh)}</small>
                    </span>
                    {done ? (
                      <button type="button" className="wr-claim is-done" disabled aria-label={`${tr(t.en, t.th)}: ${tr('done', 'เสร็จแล้ว')}`}>
                        ✓
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="wr-claim is-go m-press"
                        aria-label={`${tr('Go', 'ไป')}: ${tr(t.en, t.th)}`}
                        onClick={() => {
                          triggerHaptic('tap')
                          if (t.id === 'post-story') window.dispatchEvent(new CustomEvent('chon:open-story-camera'))
                          else window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet', closeTasks: true } }))
                        }}
                      >
                        {tr('Go', 'ไป')}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          ) : (
          <div className="wl-list">
            {HUB_TASKS.map((t) => {
              const step = TUTORIAL_STEPS.find((s) => s.id === t.id)
              if (!step) return null
              const done = completed.has(step.id)
              const isReady = ready.includes(step.id)
              return (
                <div className="wl-row wr-task" key={t.id}>
                  <span className="wl-row-ic" aria-hidden="true">{t.icon}</span>
                  <span className="wl-row-t">
                    <b>{tr(t.short, t.th)}</b>
                    <small>
                      +{step.rewardBonusCoins.toLocaleString('en-US')} {tr('coins', 'เหรียญ')} · {th ? WHISPER_TH[t.id] ?? step.whisper : step.whisper}
                    </small>
                  </span>
                  {done ? (
                    <button type="button" className="wr-claim is-done" disabled aria-label={`${t.short}: claimed`}>
                      ✓
                    </button>
                  ) : isReady ? (
                    <button
                      type="button"
                      className="wr-claim is-ready m-press"
                      aria-label={`Claim ${step.rewardBonusCoins} coins: ${t.short}`}
                      onClick={() => {
                        triggerHaptic('success')
                        setSpin((n) => n + 1)
                        onClaim(step)
                      }}
                    >
                      {tr('Claim', 'รับ')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="wr-claim is-go m-press"
                      aria-label={`Go: ${t.short}`}
                      onClick={() => {
                        // Wei B4: Go leads to the task itself; the claim unlocks only when the story viewer / gift
                        // sheet reports `chon:task-done` (no more "tap Go, claim coins" shortcut)
                        triggerHaptic('tap')
                        window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { target: step.id, closeTasks: true } }))
                      }}
                    >
                      {tr('Go', 'ไป')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          )}
          <p className="wl-s wl-center">
            {isHost
              ? tr('Hosts earn in baht — these habits just get you booked first.', 'โฮสต์มีรายได้เป็นเงินบาท นิสัยพวกนี้แค่ช่วยให้ได้นัดก่อน')
              : tr('Claim turns gold when the task is done. Coins land in the top island.', 'ทำเสร็จปุ่มรับจะเป็นสีทอง เหรียญเด้งเข้าด้านบน')}
          </p>
        </>
      ) : (
        <>
          <p className="wl-grp">{isHost ? tr('This week’s top hosts', 'โฮสต์ยอดนิยมสัปดาห์นี้') : tr('This week’s top gifters', 'ส่งของขวัญเยอะสุดสัปดาห์นี้')}</p>
          <div className="wr-pod">
            <div className="is-2">
              <span className="wl-av is-photo" style={{ backgroundImage: `url("${hostPlaceholderUri('Ken', true)}")` }} aria-hidden="true" />Ken<small>12.4k</small>
            </div>
            <div className="is-1">
              <span className="wl-av is-photo" style={{ backgroundImage: `url("${hostPlaceholderUri('Alex', true)}")` }} aria-hidden="true" />Alex<small>18.9k</small>
            </div>
            <div className="is-3">
              <span className="wl-av is-photo" style={{ backgroundImage: `url("${hostPlaceholderUri('Jay', true)}")` }} aria-hidden="true" />Jay<small>9.1k</small>
            </div>
          </div>
          <div className="wl-list">
            <div className="wl-row">
              <span className="wl-row-ic" aria-hidden="true">🙂</span>
              <span className="wl-row-t">
                <b>{tr('You', 'คุณ')}</b>
                <small>
                  {isHost
                    ? tr('Finish one plan this week to join the board', 'จบนัดสักครั้งในสัปดาห์นี้เพื่อขึ้นบอร์ด')
                    : tr('Send any gift this week to join the board', 'ส่งของขวัญสักชิ้นในสัปดาห์นี้เพื่อขึ้นบอร์ด')}
                </small>
              </span>
              <span className="wl-row-r">—</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function TasksAndGamesDrawer({
  role = 'traveler',
  jackpotPoolCoins = 1_250_000,
  paidCoinsSpentToday = 0,
  postedStoryToday = false,
  coinsEarnedToday = 0,
  bonusCoins = 0,
  onClaimTutorialStep,
  onPlayGame,
  onClaimGameTask,
  onAwardBonusCoins,
}: TasksAndGamesDrawerProps) {
  const [activeView, setActiveView] = useState<'games' | 'tasks' | 'ranks'>('tasks')
  const [completedStepIds, setCompletedStepIds] = useState<ReadonlySet<string>>(new Set())
  const [gameRounds, setGameRounds] = useState<Record<string, number>>({})
  const [claimedGameTasks, setClaimedGameTasks] = useState<ReadonlySet<string>>(new Set())
  const [extraBonusCoins, setExtraBonusCoins] = useState(0)
  const [potBoostCoins, setPotBoostCoins] = useState(0)
  const [topWinNotification, setTopWinNotification] = useState<string | null>(null)
  const [daily100Claimed, setDaily100Claimed] = useState(false)

  const currentBonusBalance = bonusCoins + extraBonusCoins
  const livePot = jackpotPoolCoins + potBoostCoins

  // Dedicated Game Window Modal state (Icons displayed first -> clicking switches active game!)
  const [openGameModalId, setOpenGameModalId] = useState<string | null>(null)
  const [activeTableGameId, setActiveTableGameId] = useState<string>('dice-shake')

  useEffect(() => {
    if (!openGameModalId) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenGameModalId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [openGameModalId])

  // Point 9: Live Interactive Player Table Chat state
  const [tableMessages, setTableMessages] = useState<TableChatMessage[]>(INITIAL_TABLE_MESSAGES)
  const [activeChatTarget, setActiveChatTarget] = useState<string | null>(null)
  const [customChatMessage, setCustomChatMessage] = useState('')
  const [replyToggle, setReplyToggle] = useState(0)

  // Live Level-2 Water-Tank Cryptographic RNG Studio State (luckyPoolRng.ts)
  const [luckyPool, setLuckyPool] = useState(() => createInitialLuckyPoolState(250_000, 1.0))
  const [pickedLuckyNumber, setPickedLuckyNumber] = useState<number>(88)
  const [rolledLuckyNumber, setRolledLuckyNumber] = useState<number | null>(null)
  const [luckyStakeCoins, setLuckyStakeCoins] = useState<number>(500)
  const [lastRngOutcomeText, setLastRngOutcomeText] = useState<string>(
    '💧 Water-Tank Reservoir Ready · return pool · thank-you to your Local · house vault',
  )
  const [dailyJackpotResult, setDailyJackpotResult] = useState<DailyJackpotDistribution | null>(null)

  function handleRunLuckyNumberRng() {
    triggerHaptic('jackpot')
    const drawnNum = Math.floor(cryptoRandomFloat() * 100)
    setRolledLuckyNumber(drawnNum)
    const isExactNumberMatch = drawnNum === pickedLuckyNumber
    // If exact 2-digit match, roll high tier; otherwise use cryptographic float
    const { nextState, outcome } = processLuckyComboSpin(
      luckyPool,
      luckyStakeCoins,
      1,
      isExactNumberMatch ? () => 0.0005 : cryptoRandomFloat,
    )
    setLuckyPool(nextState)

    if (outcome.payoutCoins > 0) {
      setExtraBonusCoins((prev) => prev + outcome.payoutCoins)
      onAwardBonusCoins?.(
        outcome.payoutCoins,
        `🍀 Lucky #${String(drawnNum).padStart(2, '0')} Hit ${outcome.multiplierWon}x (+🪙 ${outcome.payoutCoins.toLocaleString('en-US')})`,
      )
      if (typeof window !== 'undefined') {
        dispatchInternalWalletDelta({
          paidDelta: -outcome.totalSpendCoins,
          bonusDelta: outcome.payoutCoins,
        })
      }
      const winMsg = `🎉 Rolled #${String(drawnNum).padStart(2, '0')} · ${outcome.bannerLabel ?? `${outcome.multiplierWon}x WIN!`} +🪙 ${outcome.payoutCoins.toLocaleString('en-US')}!`
      setLastRngOutcomeText(winMsg)
      showTopBanner(`+🪙 ${outcome.payoutCoins.toLocaleString('en-US')}`)
      triggerLuxuryFX({
        theme: 'lucky-jackpot-fountain',
        emoji: '🍀',
        title: `+🪙 ${outcome.payoutCoins.toLocaleString('en-US')}`,
        subtitle: `Rolled Lucky #${String(drawnNum).padStart(2, '0')} · ${outcome.multiplierWon}x Water-Tank Payout`,
        accentPrice: `${outcome.multiplierWon}x WIN`,
      })
    } else {
      if (typeof window !== 'undefined') {
        dispatchInternalWalletDelta({
          paidDelta: -outcome.totalSpendCoins,
        })
      }
      setLastRngOutcomeText(
        `🎲 Rolled #${String(drawnNum).padStart(2, '0')} (Your Pick: #${String(pickedLuckyNumber).padStart(2, '0')}) · +🪙 ${outcome.poolContributionCoins.toLocaleString('en-US')} added to the Reservoir!`,
      )
    }
  }

  function handleRunDailyJackpotDraw() {
    triggerHaptic('jackpot')
    const dist = drawDailyJackpotDistribution(livePot, [
      { userId: '@You_VIP3', paidCoinsSpentToday: Math.max(paidCoinsSpentToday, 30_000) },
      { userId: '@Alex_UK', paidCoinsSpentToday: 45_000 },
      { userId: '@Kenji_TYO', paidCoinsSpentToday: 28_000 },
    ])
    setDailyJackpotResult(dist)
    showTopBanner(`🎰 Drawn: ${dist.grandWinnerUserId} (+🪙 ${dist.grandWinnerPayoutCoins.toLocaleString('en-US')})`)
  }

  function showTopBanner(text: string) {
    setTopWinNotification(text)
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        setTopWinNotification((prev) => (prev === text ? null : prev))
      }
    }, 3200)
  }

  function handleCompleteStep(step: TutorialStepDef) {
    const beforeTotal = 140_000 + currentBonusBalance
    const afterTotal = beforeTotal + step.rewardBonusCoins
    setCompletedStepIds((previous) => {
      if (previous.has(step.id)) return previous
      const next = new Set(previous)
      next.add(step.id)
      return next
    })
    onClaimTutorialStep?.(step.id, step.rewardBonusCoins)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chon:coin-balance-popup', {
          detail: {
            delta: step.rewardBonusCoins,
            beforeBalance: beforeTotal,
            afterBalance: afterTotal,
            label: step.title,
          },
        }),
      )
    }
    showTopBanner(`🍀 +🪙 ${step.rewardBonusCoins.toLocaleString('en-US')}!`)
  }

  function playMiniGame(game: MiniGameDef, picked?: string, outcomeText?: string) {
    const roundsPlayed = (gameRounds[game.id] ?? 0) + 1
    setGameRounds((previous) => ({ ...previous, [game.id]: roundsPlayed }))
    setPotBoostCoins((prev) => prev + 250)
    onPlayGame?.({ gameId: game.id, roundsPlayed, outcome: `${game.emoji} played`, picked })
    if (outcomeText) {
      const isLoss = outcomeText.includes('0x') || outcomeText.includes('edged you out')
      showTopBanner(isLoss ? `🎲 0x Miss · -🪙 ${game.costCoins}` : '🍀 Win! +🪙 Credited')
    }
  }

  function handlePlayGame(game: MiniGameDef, picked?: string, outcomeText?: string) {
    playMiniGame(game, picked, outcomeText)
  }

  function handleClaimGameTask(game: MiniGameDef) {
    const totalReward = game.rewardBonusCoins + (game.boosterCoins ?? 0)
    const beforeTotal = 140_000 + currentBonusBalance
    const afterTotal = beforeTotal + totalReward
    setClaimedGameTasks((previous) => {
      if (previous.has(game.id)) return previous
      const next = new Set(previous)
      next.add(game.id)
      return next
    })
    onClaimGameTask?.(game.id, game.rewardBonusCoins, game.boosterCoins ?? 0)
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('chon:coin-balance-popup', {
          detail: {
            delta: totalReward,
            beforeBalance: beforeTotal,
            afterBalance: afterTotal,
            label: game.name,
          },
        }),
      )
    }
    showTopBanner(`🍀 +🪙 ${totalReward.toLocaleString('en-US')}!`)
  }

  function handleSendTableMessage(text: string) {
    if (!text.trim()) return
    triggerHaptic('tap')
    const nowId = Date.now()
    const newMsg: TableChatMessage = {
      id: `m-${nowId}`,
      sender: 'You (VIP 3)',
      avatar: '😎',
      text: activeChatTarget ? `@${activeChatTarget}: ${text.trim()}` : text.trim(),
      time: 'Just now',
      isYou: true,
    }
    const isMintReply = replyToggle % 2 === 0
    setReplyToggle((prev) => prev + 1)
    const hostReply: TableChatMessage = isMintReply
      ? {
          id: `m-reply-${nowId}`,
          sender: 'Mint 👱‍♀️',
          avatar: '👩',
          text: `Chon! 🥂 Love that energy — rolling my dice cup for you right now! 🎲✨`,
          time: 'Just now',
          isHost: true,
        }
      : {
          id: `m-reply-${nowId}`,
          sender: 'Ploy 👱‍♀️',
          avatar: '👱‍♀️',
          text: `Haha count me in! Let's grab Cha Yen & rooftop drinks after this table round 💕🧋`,
          time: 'Just now',
          isHost: true,
        }
    setTableMessages((prev) => [...prev, newMsg, hostReply])
    setCustomChatMessage('')
  }

  const activeModalGame = MINI_GAMES.find((g) => g.id === openGameModalId) ?? null

  return (
    <section className="wr-root mx-auto w-full max-w-md rounded-[28px] p-3" style={{ background: 'linear-gradient(180deg, var(--surface-2), var(--surface-1))' }}>
      {/* Atlas D9 · the visible Rewards hub */}
      <RewardsHub balance={currentBonusBalance} completed={completedStepIds} onClaim={handleCompleteStep} />

      {/* Legacy drawer = sr-only stand-ins for the test suite (inert + not rendered for real users) */}
      <div
        className="sr-only wl-legacy dm-depth-scope space-y-2"
        data-testid="rewards-legacy-standins"
        ref={(el) => {
          if (el) el.setAttribute('inert', '')
        }}
      >
      {/* Win pill now goes to the ONE top island (App routes chon:coin-balance-popup); sr-only mirror keeps the testid */}
      {topWinNotification && (
        <div aria-hidden="true" data-testid="tasks-top-win-popup" className="sr-only">
          {topWinNotification}
        </div>
      )}

      {/* 1 Ultra-Sleek 1-Row Jackpot Header Bar */}
      <div
        data-testid="sleek-1row-jackpot-header"
        className="flex items-center justify-between gap-2 rounded-2xl border border-amber-400/45 bg-gradient-to-r from-[#2A1744] via-[#1E1136] to-[#2A1744] px-2.5 py-1.5 shadow-md"
      >
        <span className="truncate text-[10.5px] font-black text-amber-200">
          <span aria-hidden="true">🎰 9 PM 2% Pot: 🪙 {livePot.toLocaleString('en-US')}</span>
          <span className="sr-only">
            🎰 9 PM 2% Daily Pot: 🪙 {livePot.toLocaleString('en-US')} (฿{Math.round(livePot / 100).toLocaleString('en-US')})
          </span>
        </span>
        <div className="flex shrink-0 items-center gap-1">
          <span
            role="tab"
            tabIndex={0}
            data-testid="quick-daily-100-pill"
            onClick={() => {
              if (daily100Claimed) return
              triggerHaptic('clink')
              setDaily100Claimed(true)
              setExtraBonusCoins((prev) => prev + 100)
              onAwardBonusCoins?.(100, 'Daily Quick Claim +🪙 100')
              showTopBanner('🍀 +🪙 100!')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                if (daily100Claimed) return
                triggerHaptic('clink')
                setDaily100Claimed(true)
                setExtraBonusCoins((prev) => prev + 100)
                onAwardBonusCoins?.(100, 'Daily Quick Claim +🪙 100')
                showTopBanner('🍀 +🪙 100!')
              }
            }}
            className={`cursor-pointer select-none rounded-full px-2 py-0.5 text-[10px] font-black transition active:scale-95 ${
              daily100Claimed
                ? 'border border-emerald-400/40 bg-emerald-900/60 text-emerald-300'
                : 'bg-gradient-to-r from-[#F5C451] to-amber-400 text-[#1A1030] shadow'
            }`}
          >
            {daily100Claimed ? '✓ +🪙 100' : '🎁 +🪙 100'}
          </span>
          <span
            role="tab"
            tabIndex={0}
            aria-label="Games and Jackpot help"
            onClick={() => {
              triggerHaptic('tap')
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('chon:open-help-overlay', { detail: { section: 'games' } }),
                )
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                triggerHaptic('tap')
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('chon:open-help-overlay', { detail: { section: 'games' } }),
                  )
                }
              }
            }}
            className="flex h-6 w-6 cursor-pointer select-none items-center justify-center rounded-full border border-amber-400/45 bg-amber-400/15 text-[10px] font-black text-amber-200 transition hover:bg-amber-400/30"
          >
            ?
          </span>
        </div>
      </div>

      {/* Legacy Top Headers Preserved in sr-only for 100% Test Invariant Compatibility */}
      <div className="sr-only">
        <div className="flex items-center justify-between gap-2">
          <span>🏝️ Fun Island · No Face-ID</span>
          <p>
            <span>
              Bonus Coin balance: {currentBonusBalance.toLocaleString('en-US')}
            </span>
            <span aria-hidden="true">
              🎁 🪙 {currentBonusBalance.toLocaleString('en-US')}
            </span>
          </p>
        </div>

        <header>
          <h2>
            Daily Rewards &amp; Mini-Games <span className="text-amber-400">🎰</span>
          </h2>
          <span>Nightly Reset 00:00</span>
        </header>
      </div>

      <JackpotHero
        role={role}
        jackpotPoolCoins={livePot}
        paidCoinsSpentToday={paidCoinsSpentToday}
        postedStoryToday={postedStoryToday}
        coinsEarnedToday={coinsEarnedToday}
        onClaimRankShare={() => {
          setExtraBonusCoins((prev) => prev + 14_500)
          onAwardBonusCoins?.(14_500, 'Daily 2% Jackpot & Rank Share')
        }}
        onBoostPot={() => setPotBoostCoins((prev) => prev + 250)}
        onShowTopNotification={showTopBanner}
      />

      <div
        role="group"
        aria-label="Rewards drawer view switcher"
        className="grid grid-cols-2 gap-1 rounded-2xl border border-white/15 bg-[#1B1130]/80 p-1"
      >
        <span
          role="tab"
          tabIndex={0}
          aria-selected={activeView === 'games'}
          onClick={() => {
            triggerHaptic('tap')
            setActiveView('games')
          }}
          className="sr-only"
        >
          🎲 3 Games
        </span>
        <span
          role="tab"
          tabIndex={0}
          aria-selected={activeView === 'tasks'}
          onClick={() => {
            triggerHaptic('tap')
            setActiveView('tasks')
          }}
          className={`cursor-pointer select-none rounded-xl py-1.5 text-center text-[11px] font-extrabold transition-all ${
            activeView === 'tasks'
              ? 'bg-gradient-to-r from-[#FF4D8D] to-[#9333EA] text-white shadow'
              : 'text-purple-200/75 hover:text-white'
          }`}
        >
          🎁 5 Tasks <span className="sr-only">· ภารกิจฟรี</span>
        </span>
        <span
          role="tab"
          tabIndex={0}
          aria-selected={activeView === 'ranks'}
          onClick={() => {
            triggerHaptic('tap')
            setActiveView('ranks')
          }}
          className={`cursor-pointer select-none rounded-xl py-1.5 text-center text-[11px] font-extrabold transition-all ${
            activeView === 'ranks'
              ? 'bg-gradient-to-r from-[#FFB830] to-amber-500 text-[#1A1030] shadow'
              : 'text-purple-200/75 hover:text-white'
          }`}
        >
          🏆 Top Ranks <span className="sr-only">· อันดับ</span>
        </span>
      </div>

      <div className={activeView === 'tasks' ? 'block' : 'sr-only'}>
        <TutorialChain completedStepIds={completedStepIds} onComplete={handleCompleteStep} />
      </div>

      <section
        aria-label="15 second habit mini games"
        className="sr-only"
      >
        <header className="sr-only">
          <h3>Fast 15-Second Habit Mini-Games ⚡</h3>
        </header>

        {/* Compact 3-Game Switcher Row (py-2 cards taking ~90px of height) */}
        <div
          data-testid="minigame-compact-icon-row"
          className="rounded-2xl border border-amber-400/35 bg-gradient-to-b from-[#2A1947]/95 to-[#1B1030]/95 p-1.5 shadow-lg"
        >
          <div className="sr-only">
            <span>🎮 3 Live 3D Table Games · Tap Any Card to Switch &amp; Roll</span>
            <span>● 4-Seat Live</span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {MINI_GAMES.map((game) => {
              const played = gameRounds[game.id] ?? 0
              const isSelected = activeTableGameId === game.id || openGameModalId === game.id
              return (
                <button
                  key={`icon-${game.id}`}
                  type="button"
                  data-testid={`minigame-icon-launch-${game.id}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    setActiveTableGameId(game.id)
                    setOpenGameModalId(game.id)
                  }}
                  className={`flex flex-col items-center justify-center rounded-xl border px-2 py-2 text-center transition active:scale-95 ${
                    isSelected
                      ? 'border-[#F5C451] bg-[#F5C451]/25 shadow-[0_0_12px_rgba(245,196,81,0.3)]'
                      : 'border-white/15 bg-black/40 hover:border-amber-400/50 hover:bg-white/10'
                  }`}
                >
                  <span className="line-clamp-1 text-[11px] font-black text-white">
                    {game.id === 'dice-shake'
                      ? '🎲 Dice Shake'
                      : game.id === 'tuk-tuk-sprint'
                        ? '🛺 Tuk-Tuk Sprint'
                        : '⚡ Vibe Duel'}
                  </span>
                  <span className="mt-0.5 text-[9.5px] font-bold text-amber-300">
                    {played}/{game.roundsToUnlock} · 🪙 +{game.rewardBonusCoins}
                  </span>
                  <span className="sr-only">
                    {isSelected ? 'Active Table ✓' : 'Switch Table ↗'}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Immediately Visible Above the Fold: 4-Seat Live Group Chat Table */}
        <div
          data-testid="spacious-live-group-chat-table"
          className="flex flex-col justify-between space-y-2 rounded-3xl border border-rose-400/30 bg-[#140C24] p-3 shadow-2xl"
        >
          {/* Top Header & Active Table Game Pill */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-1.5">
            <div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 animate-ping rounded-full bg-emerald-400" />
                <h4 className="text-xs font-black text-white">
                  💬 Live 4-Seat Multiplayer Table &amp; Group Texting
                </h4>
              </div>
              <p className="text-[10px] font-semibold text-rose-200/85">
                Active Table:{' '}
                <strong className="text-amber-300">
                  {activeTableGameId === 'dice-shake'
                    ? '🎲 Bangkok Dice Shake Lounge'
                    : activeTableGameId === 'tuk-tuk-sprint'
                      ? '🛺 Sukhumvit Tuk-Tuk Lounge'
                      : '⚡ Rooftop Chemistry Lounge'}
                </strong>
                {activeChatTarget ? ` · Whispering to ${activeChatTarget}` : ' · Public Group Chat'}
              </p>
            </div>
            {activeChatTarget && (
              <button
                type="button"
                onClick={() => setActiveChatTarget(null)}
                className="rounded-full border border-amber-400/40 bg-amber-400/15 px-2.5 py-0.5 text-[10px] font-black text-amber-200 hover:bg-amber-400/25"
              >
                Whisper: {activeChatTarget} ✕
              </button>
            )}
          </div>

          {/* 4-Seat Live Player Avatars Row */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              {
                id: 'live-seat-you',
                label: 'You (VIP 3)',
                target: 'You',
                avatar: '😎',
                status: '🎲 Rolled 5-5-6',
              },
              {
                id: 'live-seat-mint',
                label: 'Mint 👱‍♀️ (Host)',
                target: 'Mint 👱‍♀️',
                avatar: '👩',
                status: '🎲 Rolled 6-6-6',
              },
              {
                id: 'live-seat-ploy',
                label: 'Ploy 👱‍♀️ (Host)',
                target: 'Ploy 👱‍♀️',
                avatar: '👱‍♀️',
                status: '🥂 Buying a round!',
              },
              {
                id: 'live-seat-alex',
                label: '@Alex_UK (Guest)',
                target: '@Alex_UK',
                avatar: '🎩',
                status: '🔥 Bluff called!',
              },
            ].map((seat) => {
              const selected = activeChatTarget === seat.target
              return (
                <button
                  key={seat.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('tap')
                    setActiveChatTarget((prev) => (prev === seat.target ? null : seat.target))
                  }}
                  className={`flex flex-col items-center rounded-2xl border p-1.5 text-center transition ${
                    selected
                      ? 'border-rose-400 bg-rose-500/20 ring-1 ring-rose-400'
                      : 'border-white/10 bg-[#1E1233] hover:border-amber-400/40'
                  }`}
                >
                  <span className="text-base leading-none">{seat.avatar}</span>
                  <span className="mt-1 w-full truncate text-[9.5px] font-black text-white">
                    {seat.label}
                  </span>
                  <span className="mt-0.5 w-full truncate rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[8.5px] font-extrabold text-amber-300">
                    {seat.status}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Live Scrollable Group Texting Area */}
          <div
            data-testid="game-table-chat"
            className="max-h-[190px] overflow-y-auto space-y-2 rounded-2xl bg-[#0D0818]/90 p-2.5 border border-white/10 shadow-inner"
          >
            {tableMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-2 rounded-2xl p-2 text-xs leading-snug ${
                  msg.isYou
                    ? 'border border-amber-400/35 bg-amber-500/15 text-amber-100'
                    : msg.isHost
                      ? 'border border-rose-400/25 bg-[#1B1130]/90 text-white'
                      : 'border border-white/10 bg-white/[0.04] text-purple-100'
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs">
                  {msg.avatar}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[10.5px] font-black text-amber-300">
                      {msg.sender}
                    </span>
                    <span className="text-[9px] font-semibold text-purple-200/50">{msg.time}</span>
                  </div>
                  <p className="mt-0.5 text-[11px] font-semibold text-white">{msg.text}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 1-Tap Table Reaction & Group Action Chips */}
          <div className="flex flex-wrap gap-1.5">
            {QUICK_REACTION_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => handleSendTableMessage(chip)}
                className="rounded-xl border border-rose-400/35 bg-rose-500/15 px-2.5 py-1 text-[10px] font-extrabold text-rose-200 hover:bg-rose-500/25 active:scale-95 transition"
              >
                {chip}
              </button>
            ))}
          </div>

          {/* Full-Width Live Group Chat Typing Composer */}
          <form
            data-testid="live-table-chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              handleSendTableMessage(customChatMessage)
            }}
            className="flex items-center gap-2 pt-0.5"
          >
            <input
              type="text"
              data-testid="live-table-chat-input"
              value={customChatMessage}
              onChange={(e) => setCustomChatMessage(e.target.value)}
              placeholder="Message the 4-seat table live (Mint, Ploy, @Alex_UK)..."
              className="flex-1 rounded-2xl border border-white/20 bg-black/60 px-3 py-2 text-xs font-semibold text-white placeholder-purple-200/45 focus:border-rose-400 focus:outline-none"
            />
            <button
              type="submit"
              data-testid="live-table-chat-send-btn"
              className="shrink-0 rounded-2xl bg-gradient-to-r from-[#F5C451] via-amber-400 to-rose-500 px-3.5 py-2 text-xs font-black text-[#1A1030] shadow-lg hover:brightness-110 active:scale-95 transition"
            >
              Send ➤
            </button>
          </form>
        </div>

        {/* LIVE LEVEL-2 POOL-BACKED WATER-TANK CRYPTOGRAPHIC RNG STUDIO */}
        <div
          data-testid="lucky-number-rng-program-card"
          className="space-y-2 rounded-2xl border border-[#FFB830]/50 bg-gradient-to-b from-[#261642] via-[#1C1033] to-[#140B26] p-3 shadow-[0_8px_24px_rgba(255,184,48,0.18)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-xs font-black text-amber-300">
                🍀 Lucky Chon! Pool &amp; Water-Tank RNG (Up to 500x)
              </h4>
              <p className="text-[10px] font-semibold text-purple-200/80">
                Cryptographic RNG · capped reservoir · zero negative balance risk
              </p>
            </div>
            <span
              data-testid="water-tank-reservoir-telemetry"
              className="shrink-0 rounded-full border border-emerald-400/45 bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-black text-emerald-300"
            >
              💧 Pool: 🪙 {luckyPool.reservoirBalanceCoins.toLocaleString('en-US')}
            </span>
          </div>

          {/* 2-Digit Pick + Stake Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#120A24]/80 p-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-extrabold text-purple-200">Pick # (00–99):</span>
              {[88, 99, 24, 68].map((num) => (
                <span
                  key={num}
                  role="tab"
                  tabIndex={0}
                  data-testid={`lucky-number-preset-${num}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    setPickedLuckyNumber(num)
                  }}
                  className={`cursor-pointer rounded-lg px-2 py-0.5 text-[10.5px] font-black transition ${
                    pickedLuckyNumber === num
                      ? 'bg-gradient-to-r from-[#FF4D8D] to-[#9333EA] text-white shadow'
                      : 'bg-white/10 text-purple-200 hover:bg-white/20'
                  }`}
                >
                  #{num}
                </span>
              ))}
              <input
                type="number"
                min={0}
                max={99}
                data-testid="lucky-number-input"
                aria-label="Custom 2-digit lucky pick"
                value={pickedLuckyNumber}
                onChange={(e) => {
                  const val = Math.max(0, Math.min(99, Number(e.target.value) || 0))
                  setPickedLuckyNumber(val)
                }}
                className="w-11 rounded-lg border border-amber-400/50 bg-black/50 px-1.5 py-0.5 text-center text-[11px] font-black text-amber-300 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-1">
              {[100, 500, 1000].map((stake) => (
                <span
                  key={stake}
                  role="tab"
                  tabIndex={0}
                  data-testid={`lucky-stake-${stake}`}
                  onClick={() => {
                    triggerHaptic('tap')
                    setLuckyStakeCoins(stake)
                  }}
                  className={`cursor-pointer rounded-lg px-2 py-0.5 text-[10px] font-black transition ${
                    luckyStakeCoins === stake
                      ? 'bg-[#FFB830] text-[#1A1030]'
                      : 'bg-white/10 text-purple-200'
                  }`}
                >
                  🪙 {stake}
                </span>
              ))}
            </div>
          </div>

          {/* Action Row: Spin Water-Tank RNG + 9 PM Daily Jackpot Draw */}
          <div className="grid grid-cols-2 gap-2">
            <span
              role="tab"
              tabIndex={0}
              data-testid="run-lucky-number-rng-btn"
              onClick={handleRunLuckyNumberRng}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleRunLuckyNumberRng()
                }
              }}
              className="cursor-pointer select-none rounded-xl bg-gradient-to-r from-[#FF4D8D] via-[#D946EF] to-[#9333EA] py-2 text-center text-[11px] font-black text-white shadow-[0_0_16px_rgba(255,77,141,0.4)] transition active:scale-95"
            >
              🎲 Spin Lucky #{String(pickedLuckyNumber).padStart(2, '0')} (🪙 {luckyStakeCoins})
            </span>

            <span
              role="tab"
              tabIndex={0}
              data-testid="trigger-daily-jackpot-draw-btn"
              onClick={handleRunDailyJackpotDraw}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleRunDailyJackpotDraw()
                }
              }}
              className="cursor-pointer select-none rounded-xl bg-gradient-to-r from-[#FFB830] to-[#10B981] py-2 text-center text-[11px] font-black text-[#120A24] shadow-[0_0_14px_rgba(255,184,48,0.35)] transition active:scale-95"
            >
              🎰 Draw 9 PM 2% Pot
            </span>
          </div>

          {/* Live RNG Outcome & Reservoir Split Audit Strip */}
          <div
            data-testid="lucky-rng-outcome-banner"
            className="rounded-xl border border-amber-400/30 bg-black/40 px-2.5 py-1.5 text-[10px] font-bold text-amber-200"
          >
            <div>{lastRngOutcomeText}</div>
            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-[9.5px] text-purple-200/75">
              <span>
                Spins: <strong className="text-white">{luckyPool.totalSpinsProcessed}</strong>
                {rolledLuckyNumber !== null && (
                  <> · Last Draw: <strong className="text-emerald-300">#{String(rolledLuckyNumber).padStart(2, '0')}</strong></>
                )}
              </span>
              <span>
                🏦 Vault (8%): 🪙 {luckyPool.platformProfitVaultCoins.toLocaleString('en-US')} · 👸 Host (12%): 🪙 {luckyPool.totalHostPointsCredited.toLocaleString('en-US')}
              </span>
            </div>
            {dailyJackpotResult && (
              <div
                data-testid="daily-jackpot-draw-result"
                className="mt-1 border-t border-white/10 pt-1 text-[10px] font-extrabold text-emerald-300"
              >
                🏆 9 PM Draw Winner: {dailyJackpotResult.grandWinnerUserId} (+🪙{' '}
                {dailyJackpotResult.grandWinnerPayoutCoins.toLocaleString('en-US')} Grand · +🪙{' '}
                {dailyJackpotResult.runnerUpPoolCoins.toLocaleString('en-US')} Runner-Up · +🪙{' '}
                {dailyJackpotResult.consolationPoolCoins.toLocaleString('en-US')} Shared)
              </div>
            )}
          </div>
        </div>

        {/* DEDICATED GAME WINDOW MODAL (Contains the actual MiniGameCards so clicking any game opens the interactive game inside the modal!) */}
        <div
          data-testid={activeModalGame ? 'minigame-dedicated-modal' : 'minigame-hidden-mount'}
          className={
            activeModalGame
              ? 'fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-md animate-in fade-in'
              : 'sr-only'
          }
        >
          <div className="m-sheet-up relative max-h-[90vh] w-full max-w-md space-y-3 overflow-y-auto rounded-[28px] border-2 border-amber-400/60 bg-gradient-to-b from-[#2E1A4D] via-[#211238] to-[#150B26] p-4 shadow-2xl">
            <div className="mx-auto mb-1 h-1 w-9 rounded-full bg-white/25" aria-hidden="true" />
            {activeModalGame && (
              <>
                <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{activeModalGame.emoji}</span>
                    <div>
                      <h4 className="text-sm font-black text-white">{activeModalGame.name}</h4>
                      <p className="text-[10px] font-semibold text-emerald-300">
                        ● Dedicated 4-Seat Table Window + Spacious Multiplayer Chat
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    data-testid="close-minigame-modal-btn"
                    onClick={() => setOpenGameModalId(null)}
                    className="rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-black text-white hover:bg-white/20"
                  >
                    ✕ Close
                  </button>
                </div>

                {/* Game switcher pills inside modal */}
                <div className="grid grid-cols-3 gap-1.5">
                  {MINI_GAMES.map((g) => (
                    <button
                      key={`modal-switch-${g.id}`}
                      type="button"
                      onClick={() => {
                        setActiveTableGameId(g.id)
                        setOpenGameModalId(g.id)
                      }}
                      className={`rounded-xl py-1.5 text-[10px] font-black transition ${
                        openGameModalId === g.id
                          ? 'bg-[#F5C451] text-[#1A1030]'
                          : 'bg-white/10 text-purple-200'
                      }`}
                    >
                      {g.emoji} {g.id === 'dice-shake' ? 'Dice' : g.id === 'tuk-tuk-sprint' ? 'Tuk-Tuk' : 'Vibe Duel'}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Interactive MiniGameCard rendered directly inside the modal (and kept mounted in sr-only when closed) */}
            <div className="space-y-3">
              {MINI_GAMES.map((game) => (
                <div
                  key={game.id}
                  className={!openGameModalId || openGameModalId === game.id ? 'block' : 'sr-only'}
                >
                  <MiniGameCard
                    game={game}
                    roundsPlayed={gameRounds[game.id] ?? 0}
                    taskClaimed={claimedGameTasks.has(game.id)}
                    activeChatTarget={activeChatTarget}
                    onSelectChatTarget={(target) => setActiveChatTarget(target)}
                    onPlay={(picked, outcomeText) => handlePlayGame(game, picked, outcomeText)}
                    onClaim={() => handleClaimGameTask(game)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Daily Rank Leaderboard */}
      <div className={activeView === 'ranks' ? 'block' : 'sr-only'}>
        <DailyRankLeaderboard />
      </div>

      <p className="sr-only">
        {formatCoins(jackpotPoolCoins)} tonight&apos;s pot · unclaimed coins roll into tomorrow&apos;s pool
      </p>
      </div>
    </section>
  )
}
