/**
 * KRING VISUAL V2 · "A · Liquid light" — the founder's pick for the ring animation (rings/kring-ring-animation.html).
 *
 * Glass tubes with light running through them. Each stroke is filled by a slowly turning CONIC gradient centred on the
 * ring, so colour really flows along the circle; glass = a dark inner edge, a bright outer rim and a fixed specular
 * streak. Glow is a ring sprite blurred ONCE and then only faded. On contact a pulse leaves both crossing points and
 * races round each ring, a white bloom + three ripples + sparks fire, the violet lens is born in the overlap, and from
 * then on each ring carries a comet in the PARTNER's colour (gold runs through blue, blue through gold).
 *
 * One beat, three lengths (contact at `ta`):  launch 2.9 s (contact .95 s) · Go Live 1.2 s (.42 s) · resume 0.8 s (.30 s).
 * Canvas 2D only (no WebGL), a few gradient strokes + sprites per frame: ~1–3 ms of script per frame at 4× CPU.
 * Geometry is given in the caller's units (KringBump uses its 200 × 120 viewBox); everything scales with R.
 */

export type LiquidVariant = 'launch' | 'golive' | 'resume'

export const LIQUID_BEAT: Record<LiquidVariant, { ta: number; travel: number; total: number; k: number }> = {
  // travel is in ring radii (the mock: 150 / 96 / 44 px at R = 76)
  launch: { ta: 0.95, travel: 150 / 76, total: 2.9, k: 1 },
  golive: { ta: 0.42, travel: 96 / 76, total: 1.2, k: 0.8 },
  resume: { ta: 0.3, travel: 44 / 76, total: 0.8, k: 0.55 },
}

const TAU = Math.PI * 2
type RGB = [number, number, number]
const C: Record<string, RGB> = {
  blueA: [52, 70, 255], blueB: [115, 129, 255], blueHi: [200, 206, 255],
  goldA: [255, 178, 30], goldB: [255, 208, 103], goldC: [255, 240, 184],
  white: [255, 255, 255],
}
const rgba = (c: RGB, a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a < 0 ? 0 : a > 1 ? 1 : +a.toFixed(3)})`
const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x)
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
const easeOut3 = (t: number) => 1 - Math.pow(1 - t, 3)
const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453
  return x - Math.floor(x)
}

const PAL = {
  a: {
    hi: C.blueHi, partner: C.goldB, dir: 1,
    glass: [[0, '#2434E8'], [0.16, '#3446FF'], [0.36, '#7381FF'], [0.5, '#B9C1FF'], [0.62, '#7381FF'], [0.82, '#3446FF'], [1, '#2434E8']] as [number, string][],
  },
  b: {
    hi: C.goldC, partner: C.blueB, dir: -1,
    glass: [[0, '#E89400'], [0.18, '#FFB21E'], [0.38, '#FFD067'], [0.52, '#FFF0B8'], [0.64, '#FFD067'], [0.84, '#FFB21E'], [1, '#E89400']] as [number, string][],
  },
}

export interface LiquidGeom {
  /** ring centre line (both rings) */
  cy: number
  /** midpoint between the rings */
  cx: number
  /** ring radius */
  r: number
  /** canvas covers [x0, x0 + w] × [y0, y0 + h] in the same units */
  x0: number
  y0: number
  w: number
  h: number
}

export interface LiquidFrame {
  t: number
  c: number
  ax: number
  bx: number
  mx: number
  dx: number
  h: number
  appear: number
  flash: number
  lens: number
  exch: number
  flow: number
  idleK: number
  floatY: number
  tiltX: number
  tiltY: number
  k: number
  reduced: boolean
}

/** The state of the beat at time t (seconds). `idle` keeps the slow float/flow alive after the beat. */
export function liquidFrame(g: LiquidGeom, t: number, v: LiquidVariant, reduced: boolean, idle: boolean): LiquidFrame {
  const b = LIQUID_BEAT[v]
  if (reduced) t = b.total + 3
  const c = t - b.ta
  const R = g.r
  const half = 0.8 * R
  let off: number
  if (c < 0) {
    const p = clamp(t / b.ta)
    off = b.travel * R * (1 - (0.22 * p + 0.78 * p * p * p))
  } else off = -(5 / 76) * R * b.k * Math.exp(-c * 6.5) * Math.sin(c * 20)
  const ax = g.cx - half - off
  const bx = g.cx + half + off
  const dx = (bx - ax) / 2
  const idleK = reduced || !idle ? 0 : smooth(b.total - 0.2, b.total + 1.4, t)
  return {
    t, c, k: b.k, reduced, ax, bx, mx: (ax + bx) / 2, dx, h: dx < R ? Math.sqrt(R * R - dx * dx) : -1,
    appear: v === 'launch' ? smooth(0, 0.3, t) : 1,
    flash: c >= 0 && !reduced ? Math.exp(-c * 7) * b.k : 0,
    lens: c < 0 ? 0 : Math.min(1, 0.86 + (reduced ? 0 : 0.12 * Math.sin((TAU * t) / 4.2) * idleK) + (reduced ? 0 : 0.45 * Math.exp(-c * 3.5))) * smooth(0, 0.05, c),
    exch: c < 0 ? 0 : smooth(0, 0.7, c),
    flow: reduced ? 2.2 : t,
    idleK,
    floatY: (3 / 76) * R * Math.sin((TAU * t) / 7) * idleK,
    tiltX: 0.05 * Math.sin((TAU * t) / 7 + 1.1) * idleK,
    tiltY: 0.05 * Math.sin((TAU * t) / 8.4) * idleK,
  }
}

type Sprite = { cv: HTMLCanvasElement; half: number }

/**
 * A canvas that draws the Liquid-light rings. `draw(frame)` paints one frame; the caller owns the clock (KringBump
 * runs it from requestAnimationFrame and fires its contact on the frame where c crosses 0).
 */
export class LiquidStage {
  private ctx: CanvasRenderingContext2D
  private scale = 1
  private sp: Record<string, Sprite> | null = null
  private spScale = 0
  private hasConic: boolean
  constructor(private canvas: HTMLCanvasElement, private g: LiquidGeom) {
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('no 2d context')
    this.ctx = ctx
    this.hasConic = 'createConicGradient' in ctx
  }

  /** Size the backing store for the canvas's CSS box (DPR capped at 2). */
  resize(): void {
    const r = this.canvas.getBoundingClientRect()
    // soft light: 1.5× backing store is indistinguishable from 2× here and fills ~45 % fewer pixels
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
    const pw = Math.max(1, Math.round(r.width * dpr))
    const ph = Math.max(1, Math.round(r.height * dpr))
    if (this.canvas.width !== pw || this.canvas.height !== ph) {
      this.canvas.width = pw
      this.canvas.height = ph
    }
    this.scale = pw / this.g.w
  }

  private sprites(): Record<string, Sprite> {
    if (this.sp && Math.abs(this.spScale - this.scale) < 0.01) return this.sp
    const R = this.g.r
    const f = R / 76
    const SW = R * (13 / 76)
    const sc = this.scale
    const ringGlow = (col: RGB, w: number, blur: number): Sprite => {
      const half = R + w + blur * 2.4
      const size = Math.max(2, Math.ceil(half * 2 * sc))
      const cv = document.createElement('canvas')
      cv.width = cv.height = size
      const x = cv.getContext('2d')!
      x.scale(sc, sc)
      x.shadowColor = rgba(col, 1)
      x.shadowBlur = blur * sc
      x.shadowOffsetX = 10000 * sc
      x.lineWidth = w
      x.strokeStyle = '#000'
      for (let i = 0; i < 2; i++) {
        x.beginPath()
        x.arc(half - 10000, half, R, 0, TAU)
        x.stroke()
      }
      return { cv, half }
    }
    const disc = (col: RGB, r: number, core = 0.35): Sprite => {
      const size = Math.max(2, Math.ceil(r * 2 * sc))
      const cv = document.createElement('canvas')
      cv.width = cv.height = size
      const x = cv.getContext('2d')!
      const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
      gr.addColorStop(0, rgba(col, 1))
      gr.addColorStop(core * 0.4, rgba(col, 0.55))
      gr.addColorStop(core, rgba(col, 0.18))
      gr.addColorStop(1, rgba(col, 0))
      x.fillStyle = gr
      x.fillRect(0, 0, size, size)
      return { cv, half: r }
    }
    this.sp = {
      gA: ringGlow(C.blueA, SW * 1.4, 16 * f),
      gB: ringGlow(C.goldA, SW * 1.4, 16 * f),
      white: disc(C.white, 160 * f, 0.3),
      blue: disc(C.blueA, 200 * f, 0.5),
      gold: disc(C.goldA, 200 * f, 0.5),
      warm: disc(C.goldC, 200 * f, 0.4),
    }
    this.spScale = this.scale
    return this.sp
  }

  private spr(s: Sprite, x: number, y: number, a: number, k = 1) {
    if (a <= 0.003) return
    const ctx = this.ctx
    ctx.globalAlpha = Math.min(1, a)
    const h = s.half * k
    ctx.drawImage(s.cv, x - h, y - h, h * 2, h * 2)
    ctx.globalAlpha = 1
  }

  private conic(start: number, x: number, y: number, stops: [number, string][]) {
    const ctx = this.ctx
    const R = this.g.r
    const gr = this.hasConic ? ctx.createConicGradient(start, x, y) : ctx.createLinearGradient(x - R, y - R, x + R, y + R)
    for (const [o, c] of stops) gr.addColorStop(o, c)
    return gr
  }

  private comet(x: number, y: number, r: number, head: number, len: number, dir: number, col: RGB, a: number, w: number) {
    if (a <= 0.01) return
    const ctx = this.ctx
    const L = len / TAU
    let gr: CanvasGradient
    if (dir > 0) {
      gr = this.conic(head - len, x, y, [[0, rgba(col, 0)], [L * 0.6, rgba(col, a * 0.25)], [L * 0.92, rgba(col, a * 0.8)], [L, rgba(col, a)], [Math.min(1, L + 0.002), rgba(col, 0)], [1, rgba(col, 0)]])
      ctx.beginPath()
      ctx.arc(x, y, r, head - len, head)
    } else {
      gr = this.conic(head, x, y, [[0, rgba(col, a)], [L * 0.08, rgba(col, a * 0.8)], [L * 0.4, rgba(col, a * 0.25)], [L, rgba(col, 0)], [1, rgba(col, 0)]])
      ctx.beginPath()
      ctx.arc(x, y, r, head, head + len)
    }
    ctx.strokeStyle = gr
    ctx.lineWidth = w
    ctx.lineCap = 'round'
    ctx.stroke()
    ctx.lineCap = 'butt'
  }

  /** Paint one frame. */
  draw(st: LiquidFrame): void {
    const ctx = this.ctx
    const g = this.g
    const R = g.r
    const SW = R * (13 / 76)
    const f = R / 76
    const CY = g.cy
    const s = this.sprites()
    ctx.setTransform(this.scale, 0, 0, this.scale, -g.x0 * this.scale, -g.y0 * this.scale)
    ctx.clearRect(g.x0, g.y0, g.w, g.h)

    // soft blue / gold pools behind the pair (pre-blurred discs, opacity only)
    ctx.globalCompositeOperation = 'lighter'
    this.spr(s.blue, st.ax - 20 * f, CY, (0.16 + 0.3 * st.flash) * st.appear, 1.25)
    this.spr(s.gold, st.bx + 20 * f, CY, (0.12 + 0.26 * st.flash) * st.appear, 1.25)
    ctx.globalCompositeOperation = 'source-over'

    ctx.save()
    if (st.idleK) {
      ctx.translate(g.cx, CY + st.floatY)
      ctx.transform(Math.cos(st.tiltY), st.tiltY * 0.2, st.tiltX * 0.2, Math.cos(st.tiltX), 0, 0)
      ctx.translate(-g.cx, -CY)
    }
    ctx.globalCompositeOperation = 'lighter'
    const ga = (0.5 + 0.1 * Math.sin(st.flow * 1.3) * st.idleK + 0.5 * st.flash) * st.appear
    this.spr(s.gA, st.ax, CY, ga)
    this.spr(s.gB, st.bx, CY, ga * 0.85)
    ctx.globalCompositeOperation = 'source-over'

    // the violet lens, only in the overlap
    if (st.lens > 0.01 && st.h >= 0) {
      const ri = R - SW / 2
      ctx.save()
      ctx.beginPath()
      ctx.arc(st.ax, CY, ri, 0, TAU)
      ctx.clip()
      const gr = ctx.createRadialGradient(st.mx, CY, 0, st.mx, CY, ri * 0.75)
      const a = st.lens
      gr.addColorStop(0, `rgba(214,186,255,${a})`)
      gr.addColorStop(0.3, `rgba(170,112,255,${a})`)
      gr.addColorStop(1, `rgba(155,92,255,${0.9 * a})`)
      ctx.fillStyle = gr
      ctx.beginPath()
      ctx.arc(st.bx, CY, ri, 0, TAU)
      ctx.fill()
      ctx.restore()
    }

    const specShift = st.tiltY * 6 - st.tiltX * 3
    const ring = (w: 'a' | 'b') => {
      const p = PAL[w]
      const x = w === 'a' ? st.ax : st.bx
      const dir = p.dir
      ctx.globalAlpha = st.appear
      ctx.strokeStyle = this.conic(st.flow * 0.55 * dir, x, CY, p.glass)
      ctx.lineWidth = SW
      ctx.beginPath()
      ctx.arc(x, CY, R, 0, TAU)
      ctx.stroke()
      // glass: dark inner edge, bright outer rim, inner core line
      ctx.lineWidth = SW * 0.26
      ctx.strokeStyle = 'rgba(5,6,20,.26)'
      ctx.beginPath()
      ctx.arc(x, CY, R - SW * 0.36, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = Math.max(0.6, 1.1 * f)
      ctx.strokeStyle = 'rgba(255,255,255,.32)'
      ctx.beginPath()
      ctx.arc(x, CY, R + SW / 2 - 0.6 * f, 0, TAU)
      ctx.stroke()
      ctx.lineWidth = Math.max(0.5, 0.8 * f)
      ctx.strokeStyle = rgba(p.hi, 0.35)
      ctx.beginPath()
      ctx.arc(x, CY, R - SW / 2 + 0.8 * f, 0, TAU)
      ctx.stroke()
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'lighter'
      // light running inside: own comet + the partner's comet after the bump
      this.comet(x, CY, R, st.flow * 1.05 * dir + (w === 'a' ? 0 : 2.4), 2.2, dir, p.hi, 0.55 * st.appear, SW * 0.42)
      this.comet(x, CY, R, st.flow * 0.8 * dir + (w === 'a' ? 3.4 : 0.4), 2.0, dir, p.partner, st.exch, SW * 0.62)
      // contact pulse: leaves both crossing points in both directions
      if (st.c >= 0 && st.c < 1.4 && !st.reduced) {
        const base = w === 'a' ? 0 : Math.PI
        const cr = Math.acos(clamp(st.dx / R, -1, 1))
        const pk = Math.exp(-st.c * 2.4) * st.k
        const trav = easeOut3(clamp(st.c / 1.1)) * 3.3
        const fi = smooth(0.03, 0.22, st.c)
        for (const sgn of [-1, 1]) {
          const a0 = base + sgn * cr * (w === 'a' ? 1 : -1)
          this.comet(x, CY, R, a0 + trav, 1.5, 1, p.hi, pk * 0.8 * fi, SW * 0.55)
          this.comet(x, CY, R, a0 + trav, 0.5, 1, C.white, pk * 0.7 * fi, SW * 0.3)
          this.comet(x, CY, R, a0 - trav, 1.5, -1, p.hi, pk * 0.8 * fi, SW * 0.55)
          this.comet(x, CY, R, a0 - trav, 0.5, -1, C.white, pk * 0.7 * fi, SW * 0.3)
        }
      }
      // specular streak (a fixed light, top-left) that moves slightly with the float tilt
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = st.appear
      ctx.lineCap = 'round'
      ctx.lineWidth = SW * 0.2
      ctx.strokeStyle = 'rgba(255,255,255,.62)'
      ctx.beginPath()
      ctx.arc(x, CY, R + SW * 0.1, -2.55 + specShift, -1.85 + specShift)
      ctx.stroke()
      ctx.lineWidth = SW * 0.16
      ctx.strokeStyle = 'rgba(255,255,255,.3)'
      ctx.beginPath()
      ctx.arc(x, CY, R + SW * 0.1, 0.65 + specShift, 0.95 + specShift)
      ctx.stroke()
      ctx.lineCap = 'butt'
      ctx.globalAlpha = 1
    }
    // over/under weave: blue over gold on top, gold over blue at the bottom crossing
    ring('b')
    ring('a')
    if (st.h > 0) {
      ctx.save()
      ctx.beginPath()
      ctx.rect(st.mx - SW * 1.7, CY + st.h - SW * 1.7, SW * 3.4, SW * 3.4)
      ctx.clip()
      ring('b')
      ctx.restore()
    }

    // contact: one soft white bloom, three ripples, sparks from both crossing points and the centre
    const c = st.c
    if (c >= 0 && c <= 1.7 && !st.reduced) {
      const k = st.k
      ctx.globalCompositeOperation = 'lighter'
      this.spr(s.white, st.mx, CY, st.flash * 0.95, 0.55 + 0.9 * (1 - st.flash))
      this.spr(s.warm, st.mx, CY, st.flash * 0.35, 1.4)
      const cols = [C.white, C.blueB, C.goldB]
      for (let i = 0; i < 3; i++) {
        const ci = c - i * 0.1
        if (ci < 0 || ci > 1.15) continue
        const p = ci / 1.15
        const rr = 26 * f + 300 * f * k * easeOut3(p)
        ctx.strokeStyle = rgba(cols[i], Math.pow(1 - p, 1.7) * 0.55 * k)
        ctx.lineWidth = (0.7 + 2.6 * (1 - p)) * Math.max(0.6, f)
        ctx.beginPath()
        ctx.arc(st.mx, CY, rr, 0, TAU)
        ctx.stroke()
      }
      const n = Math.round(30 * k)
      const hh = R * 0.6
      for (let i = 0; i < n; i++) {
        const org = i % 3
        const oy = org === 0 ? CY - hh : org === 1 ? CY + hh : CY
        let ang = rnd(i, 1) * TAU
        if (org === 0) ang = -Math.PI / 2 + (rnd(i, 1) - 0.5) * 2.4
        if (org === 1) ang = Math.PI / 2 + (rnd(i, 1) - 0.5) * 2.4
        const spd = (140 + rnd(i, 2) * 320) * f
        const life = 0.45 + rnd(i, 3) * 0.45
        if (c > life) continue
        const d = (spd * (1 - Math.exp(-c * 5))) / 5
        const tail = 4 * f + spd * 0.06 * Math.exp(-c * 5)
        const x = st.mx + Math.cos(ang) * d
        const y = oy + Math.sin(ang) * d
        const col = i % 4 === 0 ? C.white : i % 2 ? C.goldC : C.blueHi
        ctx.strokeStyle = rgba(col, 1 - c / life)
        ctx.lineWidth = (1.6 * (1 - c / life) + 0.4) * Math.max(0.6, f)
        ctx.beginPath()
        ctx.moveTo(x, y)
        ctx.lineTo(x - Math.cos(ang) * tail, y - Math.sin(ang) * tail)
        ctx.stroke()
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    ctx.restore()
  }
}

/** Canvas 2D is usable (not jsdom, not a headless stub). */
export function canLiquid(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) return false
  try {
    const c = document.createElement('canvas')
    return !!c.getContext && !!c.getContext('2d')
  } catch {
    return false
  }
}
