/**
 * KRING VISUAL V2 · Wallet/Me B — "the header pill morphs into the card on Me".
 *
 * Contract with the shell (App.tsx, V1): the header balance pill carries `data-kr-pill` (or keeps
 * `data-testid="header-wallet-balance"`). On the Me tab it stays MOUNTED but hidden (opacity 0 / visibility hidden,
 * aria-hidden) so its spot can be measured; the Me header shows no logo, gift or pill.
 *
 *  • Entering Me: a card-coloured ghost grows from the pill's rect into the big card (FLIP, transform only, .56 s soft
 *    spring), then the real card fades in under it.
 *  • Leaving Me (the card unmounts): the ghost shrinks from the card's last rect back into the pill on the new tab;
 *    while it flies, html[data-kr-morph] hides the pill (wallet.css) so it "arrives" with the ghost.
 * Reduced motion = no ghost, the swap is instant.
 */
import { useLayoutEffect, type RefObject } from 'react'

const PILL_SEL = '[data-kr-pill], [data-testid="header-wallet-balance"]'
const MS = 560
const EASE = 'cubic-bezier(.3,1.12,.5,1)'

type Box = { x: number; y: number; w: number; h: number }

function reduced(): boolean {
  try {
    return document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return true
  }
}

function boxOf(el: Element | null): Box | null {
  if (!el) return null
  const r = el.getBoundingClientRect()
  if (r.width < 4 || r.height < 4) return null
  return { x: r.left, y: r.top, w: r.width, h: r.height }
}

/** The pill's spot — measured even while it is hidden on Me; a sensible header-right guess if it is not mounted. */
function pillBox(): Box {
  const el = document.querySelector(PILL_SEL)
  const b = boxOf(el)
  if (b) return b
  const w = Math.min(window.innerWidth, 480)
  return { x: w - 136, y: 14, w: 84, h: 34 }
}

function fly(from: Box, to: Box, onDone?: () => void) {
  const g = document.createElement('div')
  g.className = 'me5-ghost'
  g.setAttribute('aria-hidden', 'true')
  // the ghost is sized like the CARD; the pill end is a scaled-down transform (compositor only)
  const big = from.w * from.h >= to.w * to.h ? from : to
  const small = big === from ? to : from
  Object.assign(g.style, { left: `${big.x}px`, top: `${big.y}px`, width: `${big.w}px`, height: `${big.h}px` })
  const smallT = `translate(${small.x - big.x}px, ${small.y - big.y}px) scale(${small.w / big.w}, ${small.h / big.h})`
  const start = big === from ? 'none' : smallT
  const end = big === from ? smallT : 'none'
  document.body.appendChild(g)
  let finished = false
  const done = () => {
    if (finished) return
    finished = true
    g.style.transition = 'opacity .2s'
    g.style.opacity = '0'
    window.setTimeout(() => g.remove(), 220)
    onDone?.()
  }
  if (typeof g.animate === 'function') {
    try {
      const a = g.animate([{ transform: start, borderRadius: big === from ? '24px' : '60px' }, { transform: end, borderRadius: big === from ? '60px' : '24px' }], { duration: MS, easing: EASE, fill: 'forwards' })
      a.onfinish = done
      a.oncancel = done
      window.setTimeout(done, MS + 50)
    } catch {
      window.setTimeout(done, 0)
    }
  } else {
    window.setTimeout(done, 0)
  }
}

let leaving = false

/**
 * Mount on the Me card. `enabled` = the card is shown (traveller mode). The card should start with the class that
 * hides it (`me5-mo`) only while the ghost flies — this hook toggles it.
 */
export function useHeaderPillMorph(cardRef: RefObject<HTMLElement | null>, enabled: boolean) {
  useLayoutEffect(() => {
    const card = cardRef.current
    if (!enabled || !card || typeof window === 'undefined') return
    if (!reduced() && !leaving) {
      const to = boxOf(card)
      if (to) {
        card.classList.add('me5-mo')
        fly(pillBox(), to, () => card.classList.remove('me5-mo'))
      }
    }
    return () => {
      // leaving Me: remember where the card was, then fly into the pill once the new tab has painted its header
      const from = boxOf(card)
      if (!from || reduced()) return
      const html = document.documentElement
      html.setAttribute('data-kr-morph', '')
      leaving = true
      window.requestAnimationFrame(() =>
        window.requestAnimationFrame(() => {
          leaving = false
          // still on Me (re-mounted for a mode change)? then nothing to fly to
          if (document.querySelector('[data-testid="wallet-metal-card"]')) {
            html.removeAttribute('data-kr-morph')
            return
          }
          fly(from, pillBox(), () => html.removeAttribute('data-kr-morph'))
        }),
      )
    }
  }, [cardRef, enabled])
}
