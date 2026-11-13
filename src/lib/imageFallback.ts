/**
 * NEXT95 · Real faces, never letters.
 *
 * Every host image (cards, stories, viewer, lightbox, chat avatars…) sits on a soft, blurred colour placeholder that is
 * derived from the host (a hue picked from the name + a subtle head-and-shoulders silhouette). The photo crossfades in
 * on load; if it fails, the premium placeholder simply stays. Never a letter, never alt text over a frame.
 *
 * Shared helpers (G2 / G3 use these too):
 *   - `<HostPhoto src name … />` (src/components/ui/HostPhoto.tsx) — the React wrapper with the crossfade. Prefer it.
 *   - `hostHue(name)`                 → a hue (deg) for that host, stable across screens
 *   - `hostPlaceholderVars(name)`     → `{ '--hp-h': …, '--hp-h2': … }` for any element with class `hp-ph`
 *                                        (`.hp-ph` paints the same placeholder in CSS — see index.css "NEXT95 · photos")
 *   - `hostPlaceholderUri(name, round)` → the same placeholder as an SVG data URI (for `<img src>` / backgrounds)
 *
 * The global capture-phase `error` listener below is the safety net for any `<img>` that is not a HostPhoto: a failed
 * avatar / story / gallery image is swapped for the silhouette placeholder (round or portrait), named from
 * `data-fallback-name` on it or an ancestor, then from `alt`. Images marked `data-no-fallback` are left alone
 * (HostPhoto handles its own failure by keeping the placeholder underneath visible).
 */

/** Night palette: amber, rose gold, champagne, teal, violet, plum. Picked per name so a row is never identical. */
const HUES: ReadonlyArray<[number, number]> = [
  [234, 268], // Anchan -> Overlap Violet
  [38, 342],  // Marigold -> Rose
  [272, 318], // Violet -> Magenta
  [188, 226], // Aqua -> Anchan
  [326, 264], // Coral Rose -> Violet
  [214, 254], // Electric Blue -> Indigo
]

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return h >>> 0
}

function seedOf(label: string): string {
  // "Mint 2", "Mint photo 3 of 4", "@mint_bkk" → the same host colour as "Mint"
  const word = label.replace(/^@/, '').trim().split(/[\s_·(,]/)[0] ?? ''
  return (word || label || 'chon').toLowerCase()
}

/** Stable hue (degrees) for a host name. */
export function hostHue(label: string): number {
  return HUES[hash(seedOf(label)) % HUES.length][0]
}

/** CSS custom properties for `.hp-ph` / `.hp` (spread into a `style`). */
export function hostPlaceholderVars(label: string): Record<'--hp-h' | '--hp-h2', string> {
  const [h, h2] = HUES[hash(seedOf(label)) % HUES.length]
  return { '--hp-h': String(h), '--hp-h2': String(h2) }
}

function encode(svg: string): string {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

/**
 * The placeholder as an SVG: vibrant colourful portrait gradient, a soft key light from above and a blurred head-and-shoulders
 * silhouette. `round` crops it for avatars (the silhouette sits a little higher and larger).
 */
export function hostPlaceholderUri(label: string, round = false): string {
  const [h, h2] = HUES[hash(seedOf(label)) % HUES.length]
  const W = 400
  const H = round ? 400 : 500
  const headY = round ? 170 : 205
  const headR = round ? 74 : 70
  const bodyY = round ? 330 : 400
  const shape = round ? `<clipPath id="c"><circle cx="200" cy="200" r="200"/></clipPath>` : ''
  return encode(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">` +
      `<defs>${shape}` +
      `<linearGradient id="g" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="hsl(${h} 80% 42%)"/><stop offset="1" stop-color="hsl(${h2} 76% 14%)"/></linearGradient>` +
      `<radialGradient id="k" cx=".7" cy=".08" r=".7"><stop offset="0" stop-color="hsl(${h} 95% 68%)" stop-opacity=".68"/><stop offset="1" stop-color="hsl(${h} 95% 68%)" stop-opacity="0"/></radialGradient>` +
      `<filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${round ? 10 : 12}"/></filter>` +
      `</defs>` +
      `<g${round ? ' clip-path="url(#c)"' : ''}>` +
      `<rect width="${W}" height="${H}" fill="url(#g)"/><rect width="${W}" height="${H}" fill="url(#k)"/>` +
      `<g filter="url(#b)" opacity=".68">` +
      `<ellipse cx="200" cy="${bodyY}" rx="${round ? 150 : 158}" ry="${round ? 110 : 120}" fill="hsl(${h2} 54% 24%)"/>` +
      `<circle cx="200" cy="${headY}" r="${headR}" fill="hsl(${(h + 10) % 360} 72% 74%)" fill-opacity=".76"/>` +
      `</g></g></svg>`,
  )
}

/** @deprecated letters are gone: kept as an alias so old call sites still compile; draws the round silhouette. */
export function fallbackDataUri(label: string, round: boolean): string {
  return hostPlaceholderUri(label, round)
}

/** @deprecated alias of the portrait placeholder. */
export function portraitFallbackDataUri(label: string): string {
  return hostPlaceholderUri(label, false)
}

/** The name an image stands for: `data-fallback-name` on it or an ancestor, else its alt text (may be ''). */
export function fallbackLabelFor(img: HTMLImageElement): string {
  const own = img.dataset.fallbackName
  if (own) return own
  const holder = img.parentElement?.closest<HTMLElement>('[data-fallback-name]')
  if (holder?.dataset.fallbackName) return holder.dataset.fallbackName
  return img.alt || ''
}

export function installImageFallback(): () => void {
  if (typeof document === 'undefined') return () => {}
  const onError = (e: Event) => {
    const img = e.target as HTMLImageElement | null
    if (!img || img.tagName !== 'IMG') return
    if (img.dataset.noFallback !== undefined) return
    // React reuses <img> nodes (story cube faces, carousels) and swaps `src`: only skip when the fallback itself failed
    if (img.dataset.fallbackApplied === '1' && img.src.startsWith('data:image/svg+xml')) return
    img.dataset.fallbackApplied = '1'
    // KRING VISUAL V2 · perf: no layout read here (an error burst on a slow network forced one full layout per image)
    const label = fallbackLabelFor(img)
    const cls = img.className + ' ' + (img.parentElement?.className ?? '')
    const w = Number(img.getAttribute('width')) || 0
    const h = Number(img.getAttribute('height')) || 0
    const r = { width: w, height: h }
    const round =
      (Math.abs(w - h) < 4 && /rounded-full|ux-online|avatar|story|ring|av\b/i.test(cls)) || /rounded-full|avatar/i.test(cls)
    // the alt text must never paint over the frame while the swap happens
    img.style.color = 'transparent'
    img.src = hostPlaceholderUri(label, round || (r.width > 0 && r.width === r.height))
  }
  document.addEventListener('error', onError, true)
  return () => document.removeEventListener('error', onError, true)
}
