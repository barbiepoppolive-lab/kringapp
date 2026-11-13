import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { AccountMode } from './AccountModesRow'
import { prefersReducedMotion } from './walletKit'
import '../../styles/wallet.css'

/**
 * Atlas D1–D3 · the ONE metal balance card. Steel = Traveller, gold = Host, black titanium = Agency.
 * - Tilt: NEXT95 · one tilt space. No loop of its own: the card reads the app-wide `--tx/--ty` that lib/tilt.ts
 *   writes on :root (device motion, pointer fallback; -1…1), like the skyline and the Meet cards, and the light band
 *   follows the same values. Transforms only.
 * - Flip: switching mode turns the card 180° and the hidden face takes the new metal (one card, three faces).
 * - Glint: one rim glint sweeps once when `glintKey` changes (e.g. after a top-up lands).
 * Reduced motion (OS or in-app) → static card, instant face swap, no glint.
 */
export default function MetalCard({
  mode,
  renderFace,
  glintKey,
  testId,
}: {
  mode: AccountMode
  renderFace: (mode: AccountMode) => ReactNode
  glintKey?: number
  testId?: string
}) {
  const [flip, setFlip] = useState<{ rot: number; front: AccountMode; back: AccountMode }>({ rot: 0, front: mode, back: mode })
  const [glint, setGlint] = useState(false)
  const firstGlint = useRef(true)

  useEffect(() => {
    setFlip((f) => {
      const showingFront = Math.round(f.rot / 180) % 2 === 0
      const visible = showingFront ? f.front : f.back
      if (visible === mode) return f
      if (prefersReducedMotion()) return showingFront ? { ...f, front: mode } : { ...f, back: mode }
      return showingFront ? { rot: f.rot + 180, front: f.front, back: mode } : { rot: f.rot + 180, front: mode, back: f.back }
    })
  }, [mode])

  useEffect(() => {
    if (firstGlint.current) {
      firstGlint.current = false
      return
    }
    if (prefersReducedMotion()) return
    setGlint(false)
    const a = window.requestAnimationFrame(() => setGlint(true))
    const t = window.setTimeout(() => setGlint(false), 1300)
    return () => {
      window.cancelAnimationFrame(a)
      window.clearTimeout(t)
    }
  }, [glintKey])

  return (
    <div className="wl-card-wrap" data-testid={testId}>
      <div className={`wl-card-tilt${glint ? ' is-glint' : ''}`}>
        <div className="wl-card-flip" style={{ transform: `rotateY(${flip.rot}deg)` }}>
          <div className={`wl-face is-${flip.front}`} aria-hidden={Math.round(flip.rot / 180) % 2 !== 0}>
            <span className="wl-brush" aria-hidden="true" />
            <span className="wl-band" aria-hidden="true" />
            <span className="wl-glint" aria-hidden="true" />
            {renderFace(flip.front)}
          </div>
          <div className={`wl-face is-back is-${flip.back}`} aria-hidden={Math.round(flip.rot / 180) % 2 === 0}>
            <span className="wl-brush" aria-hidden="true" />
            <span className="wl-band" aria-hidden="true" />
            <span className="wl-glint" aria-hidden="true" />
            {flip.back !== flip.front || Math.round(flip.rot / 180) % 2 !== 0 ? renderFace(flip.back) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
