import { useEffect, useState } from 'react'
import { isBigGiftActive } from './BigGiftFX'
import '../../styles/meet-motion.css'

export type LuxuryFxTheme =
  | 'rose-petals'
  | 'mint-breeze'
  | 'cha-yen-splash'
  | 'tuktuk-drift'
  | 'moo-kratha-sizzle'
  | 'jellyfish-neon'
  | 'sky-lantern-royal'
  | 'lucky-jackpot-fountain'
  | 'champagne-clink-clash'
  | 'vip-pulse-ribbon'
  | 'promptpay-emerald-rain'
  | 'fireworks-burst'

export interface LuxuryFxEvent {
  id: number
  theme: LuxuryFxTheme
  emoji?: string
  title: string
  subtitle?: string
  accentPrice?: string
}

let globalFxCounter = 1
type FxListener = (event: LuxuryFxEvent) => void
const listeners = new Set<FxListener>()

/**
 * Triggers the non-blocking small-gift pop anywhere in the app (token + title, 900 ms).
 * Uses `pointer-events: none` + `aria-hidden="true"` so rapid combo tapping and automated tests are never blocked.
 */
export function triggerLuxuryFX(payload: Omit<LuxuryFxEvent, 'id'>): void {
  const event: LuxuryFxEvent = {
    ...payload,
    id: globalFxCounter++,
  }
  listeners.forEach((listener) => listener(event))
}

/** Maps any Thai Vibe Treat ID or name to its bespoke Chon!-style animation theme. */
export function mapTreatToFxTheme(treatIdOrName: string): LuxuryFxTheme {
  const key = treatIdOrName.toLowerCase()
  if (key.includes('firework') || key.includes('boost')) return 'fireworks-burst'
  if (key.includes('rose') || key.includes('wai')) return 'rose-petals'
  if (key.includes('hong') || key.includes('inhaler')) return 'mint-breeze'
  if (key.includes('cha') || key.includes('tea')) return 'cha-yen-splash'
  if (key.includes('tuk')) return 'tuktuk-drift'
  if (key.includes('moo') || key.includes('krata') || key.includes('bbq')) return 'moo-kratha-sizzle'
  if (key.includes('jelly') || key.includes('tichuca')) return 'jellyfish-neon'
  if (key.includes('lantern') || key.includes('royal')) return 'sky-lantern-royal'
  return 'champagne-clink-clash'
}

/** Small-gift pop length (Motion Lab #2). The token pops, holds, floats away; nothing blocks input. */
const POP_MS = 900

/**
 * Depth build · restrained small-gift pop (replaces the hidden full-screen stage).
 * A single 3D-ish token rises with its title line, then floats off — 900 ms, pointer-events none, aria-hidden.
 * Big gifts (≥ ฿50 tiers) are owned by BigGiftFX; while one of those is on stage this pop stays quiet.
 * Reduced motion → a plain crossfade (meet-motion.css).
 */
export default function LuxuryStageFX() {
  const [activeFx, setActiveFx] = useState<LuxuryFxEvent | null>(null)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const handler: FxListener = (event) => {
      if (isBigGiftActive()) return
      setActiveFx(event)
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        setActiveFx((current) => (current?.id === event.id ? null : current))
      }, POP_MS)
    }
    listeners.add(handler)
    return () => {
      listeners.delete(handler)
      if (timer) clearTimeout(timer)
    }
  }, [])

  if (!activeFx) return null

  return (
    <div
      key={activeFx.id}
      aria-hidden="true"
      data-testid="luxury-stage-fx"
      data-theme={activeFx.theme}
      className="mm-pop"
    >
      <span className="mm-pop-tok">{activeFx.emoji ?? THEME_EMOJI[activeFx.theme]}</span>
      <span className="mm-pop-ttl">
        <span>{activeFx.title}</span>
        {activeFx.subtitle && <span className="sr-only">{activeFx.subtitle}</span>}
        {activeFx.accentPrice && <small>{activeFx.accentPrice}</small>}
      </span>
    </div>
  )
}

const THEME_EMOJI: Record<LuxuryFxTheme, string> = {
  'rose-petals': '🌹',
  'mint-breeze': '🌿',
  'cha-yen-splash': '🧋',
  'tuktuk-drift': '🛺',
  'moo-kratha-sizzle': '🥓',
  'jellyfish-neon': '🪼',
  'sky-lantern-royal': '🏮',
  'lucky-jackpot-fountain': '🪙',
  'champagne-clink-clash': '🥂',
  'vip-pulse-ribbon': '👑',
  'promptpay-emerald-rain': '💸',
  'fireworks-burst': '🎆',
}
