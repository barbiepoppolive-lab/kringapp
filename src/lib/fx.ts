/** UX-P6 · Coin burst: a 0.8 s radial shower from an element (gift send, clink, jackpot). Pure DOM, never blocks input. */
export function coinBurst(from?: Element | null, opts: { count?: number; jackpot?: boolean } = {}): void {
  try {
    if (typeof document === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const r = from?.getBoundingClientRect()
    const x = r ? r.left + r.width / 2 : window.innerWidth / 2
    const y = r ? r.top + r.height / 2 : window.innerHeight / 2
    const n = opts.count ?? (opts.jackpot ? 24 : 12)
    const host = document.createElement('div')
    host.className = `ux-burst${opts.jackpot ? ' is-jackpot' : ''}`
    host.style.transform = `translate(${x}px, ${y}px)`
    host.setAttribute('aria-hidden', 'true')
    for (let i = 0; i < n; i++) {
      const c = document.createElement('i')
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.4
      const dist = (opts.jackpot ? 150 : 90) + Math.random() * 60
      c.style.setProperty('--dx', `${Math.cos(ang) * dist}px`)
      c.style.setProperty('--dy', `${Math.sin(ang) * dist - 40}px`)
      c.style.animationDelay = `${Math.random() * 90}ms`
      host.appendChild(c)
    }
    document.body.appendChild(host)
    window.setTimeout(() => host.remove(), opts.jackpot ? 1500 : 1000)
  } catch {
    // best-effort
  }
}
