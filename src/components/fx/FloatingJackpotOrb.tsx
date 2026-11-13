import { useEffect, useState } from 'react'
import { triggerHaptic } from '../../lib/haptics'

export interface FloatingJackpotOrbProps {
  basePoolCoins?: number
  hidden?: boolean
  onOpenJackpotVault: () => void
}

const ABUNDANCE_POT_STYLE = `
@keyframes chonPotHover {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-3px); }
}
@keyframes chonCoinRainDropA {
  0% { transform: translate(-7px, -18px) scale(0.55) rotate(-18deg); opacity: 0; }
  25% { opacity: 1; }
  80% { transform: translate(-3px, 2px) scale(0.95) rotate(12deg); opacity: 1; }
  100% { transform: translate(-2px, 6px) scale(0.4); opacity: 0; }
}
@keyframes chonCoinRainDropB {
  0% { transform: translate(0px, -22px) scale(0.6) rotate(15deg); opacity: 0; }
  25% { opacity: 1; }
  80% { transform: translate(0px, 1px) scale(1) rotate(-8deg); opacity: 1; }
  100% { transform: translate(0px, 5px) scale(0.4); opacity: 0; }
}
@keyframes chonCoinRainDropC {
  0% { transform: translate(7px, -19px) scale(0.55) rotate(22deg); opacity: 0; }
  25% { opacity: 1; }
  80% { transform: translate(3px, 2px) scale(0.92) rotate(-14deg); opacity: 1; }
  100% { transform: translate(2px, 6px) scale(0.4); opacity: 0; }
}
@keyframes chonCoinOverflowLeft {
  0%, 100% { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 0.95; }
  50% { transform: translate(-4px, 4px) rotate(-28deg) scale(1.08); opacity: 1; }
}
@keyframes chonCoinOverflowRight {
  0%, 100% { transform: translate(0px, 0px) rotate(0deg) scale(1); opacity: 0.95; }
  50% { transform: translate(4px, 4px) rotate(28deg) scale(1.08); opacity: 1; }
}
@keyframes chonAbundanceAura {
  0%, 100% { opacity: 0.55; transform: scale(0.96); }
  50% { opacity: 0.95; transform: scale(1.1); }
}
.chon-pot-hover {
  animation: chonPotHover 3s ease-in-out infinite;
}
.chon-coin-rain-a {
  animation: chonCoinRainDropA 1.35s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
.chon-coin-rain-b {
  animation: chonCoinRainDropB 1.35s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.45s;
}
.chon-coin-rain-c {
  animation: chonCoinRainDropC 1.35s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.9s;
}
.chon-overflow-left {
  animation: chonCoinOverflowLeft 1.8s ease-in-out infinite;
}
.chon-overflow-right {
  animation: chonCoinOverflowRight 1.8s ease-in-out infinite 0.9s;
}
.chon-abundance-aura {
  animation: chonAbundanceAura 2.2s ease-in-out infinite;
}
`

export default function FloatingJackpotOrb({
  basePoolCoins = 1_250_000,
  hidden = false,
  onOpenJackpotVault,
}: FloatingJackpotOrbProps) {
  const [livePot, setLivePot] = useState(basePoolCoins)

  useEffect(() => {
    setLivePot(basePoolCoins)
  }, [basePoolCoins])

  const compactPot = `${(livePot / 1_000_000).toFixed(2)}M`

  return (
    <>
      <style>{ABUNDANCE_POT_STYLE}</style>
      <div
        role="tab"
        tabIndex={0}
        data-testid="floating-3d-jackpot-orb"
        aria-label="Open 3D 2% Daily Lucky Jackpot Vault"
        onClick={() => {
          triggerHaptic('jackpot')
          onOpenJackpotVault()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            triggerHaptic('jackpot')
            onOpenJackpotVault()
          }
        }}
        className={
          hidden
            ? 'sr-only'
            : 'chon-pot-hover fixed bottom-20 right-3.5 z-30 flex cursor-pointer select-none flex-col items-center'
        }
      >
        {/* Same compact 56x56 (h-14 w-14) footprint with Coins Raining From Air & Overflowing Pot */}
        <div className="relative flex h-14 w-14 items-center justify-center">
          {/* Warm Golden Abundance Halo */}
          <span
            aria-hidden="true"
            className="chon-abundance-aura absolute -inset-1.5 rounded-full bg-[radial-gradient(circle,rgba(251,191,36,0.6)_0%,rgba(245,158,11,0.28)_52%,transparent_75%)]"
          />

          {/* Continuous Coins Dropping from the Air into the Open Rim */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-1 z-20 flex items-center justify-center"
          >
            <span className="chon-coin-rain-a absolute h-3 w-3 rounded-full border border-yellow-100 bg-gradient-to-b from-[#FFF7AD] via-[#F5C451] to-[#D97706] shadow-[0_0_6px_#F5C451]" />
            <span className="chon-coin-rain-b absolute h-3.5 w-3.5 rounded-full border border-white bg-gradient-to-b from-[#FFFBEB] via-[#FACC15] to-[#B45309] shadow-[0_0_8px_#FACC15]" />
            <span className="chon-coin-rain-c absolute h-3 w-3 rounded-full border border-yellow-100 bg-gradient-to-b from-[#FFF7AD] via-[#F5C451] to-[#D97706] shadow-[0_0_6px_#F5C451]" />
          </div>

          {/* Custom-Designed SVG Overflowing Royal Gold Treasure Pot */}
          <svg
            viewBox="0 0 64 64"
            aria-hidden="true"
            className="relative z-10 h-14 w-14 drop-shadow-[0_6px_14px_rgba(245,196,81,0.55)]"
          >
            <defs>
              <radialGradient id="chonPotGold" cx="35%" cy="30%" r="70%">
                <stop offset="0%" stopColor="#FFF8C9" />
                <stop offset="35%" stopColor="#F5C451" />
                <stop offset="75%" stopColor="#D97706" />
                <stop offset="100%" stopColor="#78350F" />
              </radialGradient>
              <linearGradient id="chonRimGold" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#B45309" />
                <stop offset="50%" stopColor="#FEF08A" />
                <stop offset="100%" stopColor="#B45309" />
              </linearGradient>
              <radialGradient id="chonCoinPile" cx="50%" cy="40%" r="60%">
                <stop offset="0%" stopColor="#FEF9C3" />
                <stop offset="55%" stopColor="#FACC15" />
                <stop offset="100%" stopColor="#CA8A04" />
              </radialGradient>
            </defs>

            {/* Mound of Overflowing Coins Piled Above the Rim */}
            <circle cx="23" cy="24" r="5.5" fill="url(#chonCoinPile)" stroke="#FEF08A" strokeWidth="0.9" />
            <circle cx="41" cy="24" r="5.5" fill="url(#chonCoinPile)" stroke="#FEF08A" strokeWidth="0.9" />
            <circle cx="28" cy="21" r="6" fill="url(#chonCoinPile)" stroke="#FFFBEB" strokeWidth="1" />
            <circle cx="36" cy="21" r="6" fill="url(#chonCoinPile)" stroke="#FFFBEB" strokeWidth="1" />
            <circle cx="32" cy="19.5" r="6.5" fill="url(#chonCoinPile)" stroke="#FFFFFF" strokeWidth="1.1" />

            {/* Spilling / Overflowing Coins Cascading Over Left & Right Rim */}
            <g className="chon-overflow-left">
              <circle cx="15.5" cy="27.5" r="4.2" fill="url(#chonCoinPile)" stroke="#FEF08A" strokeWidth="0.9" />
              <circle cx="13" cy="33" r="3.4" fill="url(#chonCoinPile)" stroke="#FEF08A" strokeWidth="0.8" />
            </g>
            <g className="chon-overflow-right">
              <circle cx="48.5" cy="27.5" r="4.2" fill="url(#chonCoinPile)" stroke="#FEF08A" strokeWidth="0.9" />
              <circle cx="51" cy="33" r="3.4" fill="url(#chonCoinPile)" stroke="#FEF08A" strokeWidth="0.8" />
            </g>

            {/* Ornate Golden Treasure Chalice / Pot Body */}
            <path
              d="M14 27 C11 39, 16 53, 32 55 C48 53, 53 39, 50 27 Z"
              fill="url(#chonPotGold)"
              stroke="#FEF08A"
              strokeWidth="1.4"
            />

            {/* Golden Rim Collar */}
            <rect
              x="13"
              y="24.5"
              width="38"
              height="4.8"
              rx="2.4"
              fill="url(#chonRimGold)"
              stroke="#FFFBEB"
              strokeWidth="1"
            />

            {/* Specular Highlight on Pot Belly */}
            <path
              d="M19 32 C17.5 39, 20 46, 25 49"
              fill="none"
              stroke="rgba(255,255,255,0.65)"
              strokeWidth="2.2"
              strokeLinecap="round"
            />

            {/* 2% Emblem Embossed on the Golden Belly */}
            <text
              x="32"
              y="44"
              textAnchor="middle"
              fill="#1E1035"
              fontSize="11"
              fontWeight="900"
              fontFamily="Plus Jakarta Sans, sans-serif"
            >
              2% POT
            </text>
          </svg>
        </div>

        {/* Live Ticking Abundance Pill */}
        <span className="-mt-2 rounded-full border border-amber-300/90 bg-gradient-to-r from-[#1E1136] via-[#2B184B] to-[#1E1136] px-2 py-0.5 text-[9px] font-black tracking-tight text-[#FDE047] shadow-[0_4px_12px_rgba(0,0,0,0.85)]">
          🪙 {compactPot}
        </span>
      </div>
    </>
  )
}
