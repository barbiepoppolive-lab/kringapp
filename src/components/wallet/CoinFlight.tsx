import { useEffect, useRef } from 'react'
import { BALANCE_GAIN_EVENT, prefersReducedMotion } from '../vip/walletKit'
import { DUR, EASE, STAGGER } from '../../design/motion'

/**
 * KRING FIX1 · Marco 6 — when money lands (the shared balance clock fires `kring:balance-gain` on the glint frame),
 * a few marigold baht coins fly from the Top up tile INTO the balance figure — never toward a screen corner — and the
 * digits roll as the last one arrives. A viewport-fixed layer rendered next to the balance card. WAAPI on
 * transform/opacity only; nothing under reduced motion; the layer is aria-hidden and empty at rest.
 */
const COINS = 6

export function CoinFlight({ fromSelector = '[data-testid="wallet-home-topup"]', toSelector = '[data-testid="wallet-card-balance"]' }: { fromSelector?: string; toSelector?: string }) {
  const layer = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    const fly = () => {
      const host = layer.current
      if (!host || prefersReducedMotion() || typeof host.animate !== 'function') return
      // the layer is fixed to the viewport, so the coins can leave the Top up tile and enter the (clipped) card
      const card = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
      const to = document.querySelector(toSelector)?.getBoundingClientRect()
      if (!to || to.width < 4) return
      const from = document.querySelector(fromSelector)?.getBoundingClientRect()
      // landing point: the middle of the big figure; start: the Top up button (or just under the card)
      const tx = to.left - card.left + to.width * 0.55
      const ty = to.top - card.top + to.height * 0.5
      const sx = from && from.width > 0 ? from.left - card.left + from.width / 2 : card.width * 0.3
      const sy = from && from.height > 0 ? from.top - card.top + from.height / 2 : card.height + 40
      for (let i = 0; i < COINS; i += 1) {
        const c = document.createElement('i')
        c.className = 'kw-coin'
        c.textContent = '฿'
        c.style.left = `${tx}px`
        c.style.top = `${ty}px`
        host.appendChild(c)
        const spread = (i - (COINS - 1) / 2) * 14
        const dx = sx - tx + spread
        const dy = sy - ty + (i % 2) * 10
        // an arc: out and up first, then down into the figure
        const midX = dx * 0.45 + spread * 0.6
        const midY = Math.min(dy, 0) * 0.4 - 46 - (i % 3) * 10
        const anim = c.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(0.55)`, opacity: 0 },
            { transform: `translate(${dx}px, ${dy}px) scale(0.9)`, opacity: 1, offset: 0.12 },
            { transform: `translate(${midX}px, ${midY}px) scale(1)`, opacity: 1, offset: 0.55 },
            { transform: 'translate(0px, 0px) scale(0.45)', opacity: 0.9, offset: 0.94 },
            { transform: 'translate(0px, 0px) scale(0.3)', opacity: 0 },
          ],
          // glint frame + 400 ms + stagger ≈ the 520 ms roll: the last coin lands as the digits turn
          { duration: DUR.l, delay: i * STAGGER.base, easing: EASE.inOut, fill: 'both' },
        )
        anim.onfinish = () => c.remove()
        anim.oncancel = () => c.remove()
      }
    }
    window.addEventListener(BALANCE_GAIN_EVENT, fly)
    return () => window.removeEventListener(BALANCE_GAIN_EVENT, fly)
  }, [fromSelector, toSelector])
  return <span ref={layer} className="kw-coins" aria-hidden="true" />
}
