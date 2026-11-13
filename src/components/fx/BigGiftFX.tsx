import { useEffect, useRef, useState } from 'react'
import { playSfx } from '../../lib/sfx'
import { GiftToken } from '../ui/LivingIcons'
import '../../styles/meet-motion.css'

/**
 * UX-P8 · Big-gift stage: six Poppo-grade moments built with CSS 3D + SVG + a tiny canvas (no video assets).
 * mystery-box · yacht · fireworks · rose-rain · champagne-tower · tuktuk-dash
 * Rules: pointer-events none, aria-hidden, ≤ 2.6 s, never blocks input, reduced-motion shows the banner only.
 */
export type BigGiftKind = 'mystery-box' | 'yacht' | 'fireworks' | 'rose-rain' | 'champagne-tower' | 'tuktuk-dash' | 'hero'
export interface BigGiftEvent {
  id: number
  kind: BigGiftKind
  title: string
  subtitle?: string
  emoji?: string
  prize?: string
  /** Atlas B13: the sender's name, shown in gold 3D letters over the stage */
  sender?: string
  giftName?: string
  recipient?: string
  /** price of the gift in coins — only gifts at or above BIG_GIFT_MIN_COINS may play the stage */
  coins?: number
  /** optional transparent video (WebM VP9 alpha / HEVC alpha); CSS 3D scene is the fallback */
  videoSrc?: string
  /** bypass the price gate (reserved for a future founder-approved moment) */
  force?: boolean
}
/** Founder rule (Atlas B12/B13): Lucky and small gifts get a tiny pop only. Only BIG gifts (≥ ฿50) play this stage. */
export const BIG_GIFT_MIN_COINS = 5_000
/** Transparent-video sources per gift id (none shipped yet — the CSS/3D scene plays instead). */
export const BIG_GIFT_VIDEOS: Readonly<Record<string, string>> = {}
export function isBigGift(coins: number): boolean {
  return coins >= BIG_GIFT_MIN_COINS
}
type Listener = (e: BigGiftEvent) => void
const listeners = new Set<Listener>()
let counter = 1
let activeUntil = 0
export function triggerBigGift(payload: Omit<BigGiftEvent, 'id'>): void {
  // Atlas contract: no price, or a small price → not a big gift (Lucky rolls, rewards, small gifts). Callers keep their small pop.
  if (!payload.force && !(typeof payload.coins === 'number' && payload.coins >= BIG_GIFT_MIN_COINS)) return
  const e = { ...payload, id: counter++ }
  if (listeners.size > 0) activeUntil = Date.now() + 2000
  listeners.forEach((l) => l(e))
}
/** True while a big-gift stage is playing — the small-gift pop (LuxuryStageFX) stays quiet so only one moment shows. */
export function isBigGiftActive(): boolean {
  return Date.now() < activeUntil
}
/** Gift id → stage. Anything under ฿50 (5,000 coins) keeps the light LuxuryStageFX only. */
export function mapGiftToBigKind(id: string, coins: number): BigGiftKind | null {
  if (coins < BIG_GIFT_MIN_COINS) return null
  const k = id.toLowerCase()
  if (k.includes('crown') || k.includes('elephant') || k.includes('pearl') || k.includes('naga')) return 'hero'
  if (k.includes('envelope') || k.includes('dice') || k.includes('pearl') || k.includes('elephant') || k.includes('mango') || k.includes('surprise')) return 'mystery-box'
  if (k.includes('yacht') || k.includes('cruise') || k.includes('lantern')) return k.includes('lantern') ? 'fireworks' : 'yacht'
  if (k.includes('tuk')) return 'tuktuk-dash'
  if (k.includes('rose') || k.includes('wai')) return coins >= 1000 ? 'rose-rain' : null
  if (k.includes('jelly') || k.includes('champagne') || k.includes('pass') || k.includes('clink')) return 'champagne-tower'
  return coins >= 25_000 ? 'fireworks' : 'hero'
}
const DURATION: Record<BigGiftKind, number> = { 'mystery-box': 2400, yacht: 2600, fireworks: 2400, 'rose-rain': 2200, 'champagne-tower': 2200, 'tuktuk-dash': 2000, hero: 3000 }
const SOUND: Record<BigGiftKind, 'jackpot' | 'combo' | 'clink' | 'success'> = { 'mystery-box': 'jackpot', yacht: 'combo', fireworks: 'jackpot', 'rose-rain': 'success', 'champagne-tower': 'clink', 'tuktuk-dash': 'combo', hero: 'jackpot' }
function bahtOf(coins: number): string {
  const b = coins / 100
  return b.toLocaleString('en-US', { maximumFractionDigits: b < 10 ? 2 : 0 })
}
const SPARKS: ReadonlyArray<readonly [number, number]> = [[30, 28], [72, 24], [22, 50], [80, 46], [50, 16], [62, 62]]

function Fireworks({ run }: { run: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    if (!run) return
    const c = ref.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    const W = (c.width = c.clientWidth), H = (c.height = c.clientHeight)
    type P = { x: number; y: number; vx: number; vy: number; life: number; hue: number }
    const ps: P[] = []
    const burst = (x: number, y: number, hue: number) => { for (let i = 0; i < 70; i++) { const a = (Math.PI * 2 * i) / 70, v = 1.5 + Math.random() * 2.2; ps.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue }) } }
    const t0 = performance.now(); let raf = 0
    const bursts = [[0.3, 0.3, 42, 200], [0.7, 0.25, 330, 700], [0.5, 0.18, 48, 1250]] as const
    const fired = new Set<number>()
    const step = (t: number) => {
      const el = t - t0
      bursts.forEach(([fx, fy, hue, at], i) => { if (el > at && !fired.has(i)) { fired.add(i); burst(W * fx, H * fy, hue) } })
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 0, W, H)
      for (const p of ps) { p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.vx *= 0.985; p.vy *= 0.985; p.life -= 0.016; if (p.life <= 0) continue; ctx.fillStyle = `hsla(${p.hue},100%,${60 + 30 * p.life}%,${p.life})`; ctx.beginPath(); ctx.arc(p.x, p.y, 1.6 + p.life * 1.4, 0, Math.PI * 2); ctx.fill() }
      if (el < 2300) raf = requestAnimationFrame(step)
    }
    ctx.clearRect(0, 0, W, H)
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [run])
  return <canvas ref={ref} className="bg-fx-canvas" />
}

export default function BigGiftFX() {
  const [ev, setEv] = useState<BigGiftEvent | null>(null)
  const [videoFailed, setVideoFailed] = useState(false)
  const reduced =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.reduceMotion === 'true')
  useEffect(() => {
    const l: Listener = (e) => {
      setEv(e)
      setVideoFailed(false)
      playSfx(SOUND[e.kind])
      window.setTimeout(() => setEv((cur) => (cur?.id === e.id ? null : cur)), reduced ? 1400 : DURATION[e.kind])
    }
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [reduced])
  if (!ev) return null
  const k = ev.kind
  const video = ev.videoSrc ?? (ev.giftName ? BIG_GIFT_VIDEOS[ev.giftName.toLowerCase()] : undefined)
  const playVideo = !!video && !videoFailed && !reduced
  return (
    <div className={`bg-fx bg-fx-${k}${reduced ? ' is-reduced' : ''}${ev.sender ? ' has-sender' : ''}`} data-testid="big-gift-fx" data-kind={k} aria-hidden="true">
      <div className="bg-fx-dim" />
      {playVideo && (
        <video className="bgx-video" src={video} autoPlay muted playsInline onError={() => setVideoFailed(true)} onEnded={() => setEv(null)} />
      )}
      {!reduced && !playVideo && k === 'hero' && (
        <div className="bg-fx-scene bgx-hero">
          <span className="bgx-glow" />
          {/* R4 Marco 6 · the gift is a flat token (shadow on a flat wrapper), rising 24 px — no 3D glyph box edge */}
          <span className="bgx-rise">
            <GiftToken emoji={ev.emoji ?? '👑'} tint="gold" size={124} className="bgx-token" />
          </span>
          {SPARKS.map(([x, y], i) => <i key={i} className="bgx-spark" style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${300 + i * 120}ms` }} />)}
        </div>
      )}
      {reduced && k === 'hero' && (
        <div className="bg-fx-scene bgx-hero is-still">
          <span className="bgx-rise">
            <GiftToken emoji={ev.emoji ?? '👑'} tint="gold" size={124} className="bgx-token" />
          </span>
        </div>
      )}
      {!reduced && !playVideo && k === 'mystery-box' && (
        <div className="bg-fx-scene">
          <div className="bg-box"><div className="bg-box-lid" /><div className="bg-box-body" /><div className="bg-box-beam" /><div className="bg-box-prize">{ev.prize ?? ev.emoji ?? '🎁'}</div>
            {Array.from({ length: 14 }).map((_, i) => <i key={i} className="bg-coin" style={{ '--i': i } as React.CSSProperties} />)}
          </div>
        </div>
      )}
      {!reduced && !playVideo && k === 'yacht' && (
        <div className="bg-fx-scene">
          <div className="bg-moon" />
          <div className="bg-wave bg-wave-3" /><div className="bg-wave bg-wave-2" />
          <svg className="bg-yacht" viewBox="0 0 220 110" aria-hidden="true"><path d="M20 72h180l-22 24H42z" fill="#F7F8F8"/><path d="M60 72V40h70l18 32z" fill="#E4E7EB"/><path d="M70 40V22h40l10 18z" fill="#F7F8F8"/><rect x="78" y="28" width="26" height="8" rx="2" fill="#1B2A4A"/><rect x="70" y="50" width="52" height="10" rx="2" fill="#1B2A4A"/><circle cx="150" cy="58" r="3" fill="#FFB830"/><circle cx="138" cy="58" r="3" fill="#FFB830"/><circle cx="126" cy="58" r="3" fill="#FFB830"/></svg>
          <div className="bg-wave bg-wave-1" />
          <div className="bg-wake" />
        </div>
      )}
      {!reduced && !playVideo && k === 'fireworks' && (
        <div className="bg-fx-scene"><Fireworks run /><div className="bg-skyline" /></div>
      )}
      {!reduced && !playVideo && k === 'rose-rain' && (
        <div className="bg-fx-scene">{Array.from({ length: 36 }).map((_, i) => <i key={i} className="bg-petal" style={{ '--i': i, left: `${(i * 37) % 100}%` } as React.CSSProperties} />)}</div>
      )}
      {!reduced && !playVideo && k === 'champagne-tower' && (
        <div className="bg-fx-scene"><div className="bg-tower">{[1, 2, 3].map((row) => <div key={row} className="bg-tower-row">{Array.from({ length: row }).map((_, j) => <span key={j} className="bg-glass"><i /></span>)}</div>)}<div className="bg-pour" />{Array.from({ length: 18 }).map((_, i) => <b key={i} className="bg-bubble" style={{ '--i': i } as React.CSSProperties} />)}</div></div>
      )}
      {!reduced && !playVideo && k === 'tuktuk-dash' && (
        <div className="bg-fx-scene"><div className="bg-road" /><div className="bg-tuktuk"><div className="bg-tt-cab" /><div className="bg-tt-roof" /><div className="bg-tt-beam" /><i className="bg-tt-wheel w1" /><i className="bg-tt-wheel w2" /></div>{Array.from({ length: 6 }).map((_, i) => <i key={i} className="bg-streak" style={{ '--i': i } as React.CSSProperties} />)}</div>
      )}
      {ev.sender ? (
        <>
          {/* R4 Marco 5 / Wei B13 · one big-gift grammar: dim → name band (a dark pill, so it never prints over the
              chat) → token rising → the receipt line that lands in the thread */}
          <div className="bgx-name">
            <b>{ev.sender}</b>{' '}
            <small>
              {ev.recipient && ev.giftName ? `sent ${ev.recipient} a ${ev.giftName}` : ev.title}
            </small>
          </div>
          <div className="bgx-receipt">
            <span className="bgx-receipt-ico">{ev.emoji ?? '🎁'}</span>
            <span>{ev.giftName ?? ev.title}</span>
            {typeof ev.coins === 'number' && <b>฿{bahtOf(ev.coins)}</b>}
            <small>{ev.recipient ? `→ ${ev.recipient}` : '→ chat'}</small>
          </div>
        </>
      ) : (
        <div className="bg-fx-banner"><span className="bg-fx-emoji">{ev.emoji ?? '🎁'}</span><span><b>{ev.title}</b>{ev.subtitle && <small>{ev.subtitle}</small>}</span></div>
      )}
    </div>
  )
}
