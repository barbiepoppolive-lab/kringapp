/**
 * UX-P6 · Sound layer — tiny synthesized cues via WebAudio (no files, ~0 bytes). Paired with meaningful haptics only.
 * Pref: localStorage `chon_sfx_v1` = 'on' | 'off' (default on). Never plays before the first user gesture (browser rule).
 *
 * Kring sound logo · กริ๊ง! (KRING T2, concept A "Ching"): see `playKring` below. It plays only for the bump moments
 * (launch · Go Live · resume · release at the meet). Nothing else in the app chimes, so the sound stays special.
 * `clink` is kept as a name for older callers but is a short wooden tick (no glass, no drinking meaning).
 */
export type SfxName = 'kring' | 'kringSoft' | 'clink' | 'success' | 'combo' | 'jackpot' | 'warning' | 'error' | 'send' | 'fold'

let ctx: AudioContext | null = null
function ac(): AudioContext | null {
  try {
    if (typeof window === 'undefined') return null
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    if (!ctx) {
      ambientSession()
      ctx = new Ctor()
      idlePrewarm(ctx)
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** iOS 16.4+: an "ambient" audio session follows the ring/silent switch (silent phone → no Ching) */
function ambientSession(): void {
  try {
    const n = navigator as Navigator & { audioSession?: { type: string } }
    if (n.audioSession && n.audioSession.type !== 'ambient') n.audioSession.type = 'ambient'
  } catch {
    // not supported
  }
}
function idlePrewarm(c: AudioContext): void {
  try {
    window.setTimeout(() => prewarmKring(c), 0)
  } catch {
    // ignore
  }
}

/** true once the person has interacted with the page (browsers keep audio muted until then) */
function hasGesture(): boolean {
  try {
    const ua = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
    return ua ? ua.hasBeenActive : true
  } catch {
    return true
  }
}

/**
 * KRING FIX2 · Marco 1 — build (or resume) the AudioContext on a gesture, BEFORE the moment that rings the bell.
 * Constructing it costs 100–200 ms on a cold device; doing that on pointerdown keeps the bump's contact frame cheap.
 * Safe to call often; does nothing without a gesture, with sound off, or where there is no WebAudio.
 */
export function warmAudio(): void {
  try {
    if (!sfxEnabled() || !hasGesture()) return
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
      return
    }
    ac()
  } catch {
    // best-effort
  }
}

let warmupInstalled = false
/**
 * KRING FIX3 · Marco 1 — the AudioContext is never built on a frame that has to paint (a contact frame, a send).
 * Installed once at boot: the context is built in an idle moment once the launch has played (it starts suspended, which every
 * browser allows), and every later pointerdown / keydown only calls the cheap `resume()`. If the browser refuses a
 * pre-gesture context, it is built in an idle moment right after the FIRST gesture instead — never inside it.
 */
export function installAudioWarmup(): void {
  if (warmupInstalled || typeof window === 'undefined') return
  warmupInstalled = true
  const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return
  const idle = (fn: () => void, timeout: number) => {
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
    if (typeof ric === 'function') ric(fn, { timeout })
    else window.setTimeout(fn, 60)
  }
  const build = () => {
    try {
      if (!ctx && sfxEnabled()) {
        ambientSession()
        ctx = new Ctor()
        // T2: the Ching's room impulse + noise bursts are built in later idle steps — never on the contact frame
        prewarmKring(ctx)
      }
    } catch {
      // not allowed yet: the first gesture builds it
    }
  }
  // after the launch has played (never during it), in an idle moment
  window.setTimeout(() => idle(build, 3000), 3800)
  const onGesture = () => {
    if (!ctx) {
      idle(build, 300)
      return
    }
    if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined)
  }
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true })
  window.addEventListener('keydown', onGesture, { capture: true, passive: true })
}

export function sfxEnabled(): boolean {
  try {
    return (window.localStorage.getItem('chon_sfx_v1') ?? 'on') !== 'off'
  } catch {
    return true
  }
}
export function setSfxEnabled(on: boolean): void {
  try {
    window.localStorage.setItem('chon_sfx_v1', on ? 'on' : 'off')
  } catch {
    // ignore
  }
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = type
  o.frequency.setValueAtTime(freq, c.currentTime + start)
  g.gain.setValueAtTime(0.0001, c.currentTime + start)
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur)
  o.connect(g).connect(c.destination)
  o.start(c.currentTime + start)
  o.stop(c.currentTime + start + dur + 0.02)
}

/* ====================================================================================================================
 * KRING T2 · sound logo A "Ching" (ฉิ่ง · two small bronze cups touch). Ported from the approved sound board
 * (scratchpad/sound/kring-sound-logo.html, concept A). Pure Web Audio synthesis, no files:
 *  • Thai equal 7-tone tuning: step 2^(1/7) ≈ 171.4 cents, reference 784 Hz. The ching sits at degree 7 (1568 Hz), the
 *    gold ring answers at degree 11 (a "Thai fifth", 686 cents), the lift goes to degrees 12 and 14. No 12-TET interval.
 *  • Each cut is high-passed at 420 Hz and low-passed at 9 kHz (energy ≈95 % in 500 Hz–6 kHz) with a short room.
 *  • Peak −3 dBFS (Resume −9 dBFS): `KRING_NORM` is the per-cut gain measured offline from the reference render.
 *  • Four cuts, contact at t = 0 of each: launch (cold start) · golive (Go Live) · resume (back to the app) ·
 *    release (payment released at the bump). Haptic patterns per cut live in haptics.ts (`KRING_HAPTICS`).
 * ================================================================================================================== */
export type KringVariant = 'launch' | 'golive' | 'resume' | 'release'

/** Thai 7-tone equal step and reference pitch */
export const THAI_STEP = Math.pow(2, 1 / 7)
export const THAI_T0 = 784
export const thaiDeg = (d: number): number => THAI_T0 * Math.pow(THAI_STEP, d)

/** cut length (s) and peak target (dBFS) — from the reference */
export const KRING_CUTS: Record<KringVariant, { len: number; target: number }> = {
  launch: { len: 1.6, target: -3 },
  golive: { len: 0.9, target: -3 },
  resume: { len: 0.45, target: -9 },
  release: { len: 0.8, target: -3 },
}
/** output gain per cut so the rendered peak lands on its target (measured at 48 kHz from this exact graph) */
export const KRING_NORM: Record<KringVariant, number> = { launch: 0.257, golive: 0.2619, resume: 0.276, release: 0.2928 }

function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
/* buffers are built once per context (in the idle warm-up), never on the contact frame */
const bufCache = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>()
function cached(c: BaseAudioContext, key: string, make: () => AudioBuffer): AudioBuffer {
  let m = bufCache.get(c)
  if (!m) bufCache.set(c, (m = new Map()))
  let b = m.get(key)
  if (!b) m.set(key, (b = make()))
  return b
}
function noiseBuffer(c: BaseAudioContext, dur: number, seed: number): AudioBuffer {
  return cached(c, `n${dur}:${seed}`, () => {
    const n = Math.max(1, Math.round(c.sampleRate * dur))
    const b = c.createBuffer(1, n, c.sampleRate)
    const d = b.getChannelData(0)
    const r = rng(seed)
    for (let i = 0; i < n; i++) d[i] = r() * 2 - 1
    return b
  })
}
function roomImpulse(c: BaseAudioContext): AudioBuffer {
  return cached(c, 'room', () => {
    const dur = 0.9
    const decay = 0.22
    const n = Math.round(c.sampleRate * dur)
    const b = c.createBuffer(2, n, c.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch)
      const r = rng(5 + ch * 101)
      let y = 0
      for (let i = 0; i < n; i++) {
        const t = i / c.sampleRate
        y += (r() * 2 - 1 - y) * 0.55
        d[i] = y * Math.exp(-t / decay) * Math.min(1, t / 0.006)
      }
    }
    return b
  })
}
/**
 * Builds everything a ching needs ahead of time — the room impulse, the convolver chain and the noise bursts — so the
 * contact frame only wires oscillators (~1 ms). Split into small idle steps (no long task) unless `sync`.
 */
export function prewarmKring(c: BaseAudioContext, sync = false): void {
  const steps: Array<() => void> = [
    () => roomImpulse(c),
    () => roomChain(c, c.destination),
    () => {
      for (const seed of [11, 21, 23, 25]) {
        noiseBuffer(c, 0.018 + 0.02, seed)
        noiseBuffer(c, 0.05 + 0.02, seed + 1)
      }
      for (let i = 0; i < 3; i++) noiseBuffer(c, 0.008 + 0.02, 71 + i)
    },
  ]
  if (sync || typeof window === 'undefined') {
    steps.forEach((f) => f())
    return
  }
  const ric = (window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback
  const next = () => {
    const f = steps.shift()
    if (!f) return
    try {
      f()
    } catch {
      return
    }
    if (typeof ric === 'function') ric(next, { timeout: 1500 })
    else window.setTimeout(next, 30)
  }
  next()
}

type Partial3 = readonly [ratio: number, amp: number, decay: number]
function partials(c: BaseAudioContext, out: AudioNode, t: number, f0: number, list: readonly Partial3[], o: { vel?: number; att?: number; dk?: number; beat?: number }) {
  const vel = o.vel ?? 1
  const att = o.att ?? 0.002
  const dk = o.dk ?? 1
  const beat = o.beat ?? 0
  for (const [r, a, d] of list) {
    const f = f0 * r
    if (f > 7600) continue
    const g = c.createGain()
    const A = a * vel
    const end = t + att + d * dk
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(A, t + att)
    g.gain.exponentialRampToValueAtTime(Math.max(1e-7, A * 1e-3), end)
    g.connect(out)
    const o1 = c.createOscillator()
    o1.frequency.value = f
    o1.connect(g)
    o1.start(t)
    o1.stop(end + 0.02)
    if (beat) {
      // two near-identical cups beat against each other
      const g2 = c.createGain()
      const o2 = c.createOscillator()
      g2.gain.value = 0.6
      o2.frequency.value = f * (1 + beat)
      o2.connect(g2).connect(g)
      o2.start(t)
      o2.stop(end + 0.02)
    }
  }
}
function burst(c: BaseAudioContext, out: AudioNode, t: number, o: { f: number; q: number; dur: number; gain: number; seed: number }) {
  const src = c.createBufferSource()
  const bp = c.createBiquadFilter()
  const g = c.createGain()
  src.buffer = noiseBuffer(c, o.dur + 0.02, o.seed)
  bp.type = 'bandpass'
  bp.frequency.value = o.f
  bp.Q.value = o.q
  g.gain.setValueAtTime(o.gain, t)
  g.gain.exponentialRampToValueAtTime(o.gain * 1e-3, t + o.dur)
  src.connect(bp).connect(g).connect(out)
  src.start(t)
  src.stop(t + o.dur + 0.02)
}
/** ching: small thick bronze cup pair (partials ratio · amp · decay s) */
const CHING: readonly Partial3[] = [[1, 1, 1.25], [1.47, 0.42, 0.85], [2.09, 0.5, 0.62], [2.68, 0.24, 0.44], [3.32, 0.13, 0.3], [4.1, 0.06, 0.2]]
function ching(c: BaseAudioContext, out: AudioNode, t: number, f: number, vel = 1, o: { dk?: number; seed?: number } = {}) {
  const s = o.seed ?? 11
  partials(c, out, t, f, CHING, { vel, att: 0.0015, dk: o.dk ?? 1, beat: 0.0032 })
  burst(c, out, t, { f: 4600, q: 0.8, dur: 0.018, gain: 0.5 * vel, seed: s })
  burst(c, out, t, { f, q: 6, dur: 0.05, gain: 0.22 * vel, seed: s + 1 })
}
/** coin sparkle (Release): three tiny metallic plinks rising in Thai steps */
const COIN: readonly Partial3[] = [[1, 1, 0.14], [2.32, 0.35, 0.07]]
function sparkle(c: BaseAudioContext, V: (p: number) => AudioNode, t: number, vel = 1) {
  ;([[15, 0, -0.35, 0.3], [16, 0.045, 0.35, 0.26], [18, 0.09, 0, 0.24]] as const).forEach(([d, dt, p, a], i) => {
    const o = V(p)
    partials(c, o, t + dt, thaiDeg(d), COIN, { vel: a * vel, att: 0.001, beat: 0.003 })
    burst(c, o, t + dt, { f: 6000, q: 1.4, dur: 0.008, gain: 0.12 * vel, seed: 71 + i })
  })
}
const BUILD: Record<KringVariant, (c: BaseAudioContext, V: (p: number) => AudioNode, t: number) => void> = {
  launch: (c, V, t) => {
    ching(c, V(-0.28), t, thaiDeg(7), 1)
    ching(c, V(0.28), t + 0.075, thaiDeg(11), 0.55, { seed: 21 })
    ching(c, V(-0.1), t + 0.34, thaiDeg(12), 0.22, { dk: 0.35, seed: 23 })
    ching(c, V(0.12), t + 0.47, thaiDeg(14), 0.26, { dk: 0.45, seed: 25 })
  },
  golive: (c, V, t) => {
    ching(c, V(-0.28), t, thaiDeg(7), 1, { dk: 0.62 })
    ching(c, V(0.28), t + 0.06, thaiDeg(11), 0.5, { dk: 0.55, seed: 21 })
    ching(c, V(-0.1), t + 0.24, thaiDeg(12), 0.2, { dk: 0.25, seed: 23 })
    ching(c, V(0.12), t + 0.33, thaiDeg(14), 0.24, { dk: 0.3, seed: 25 })
  },
  resume: (c, V, t) => {
    ching(c, V(0), t, thaiDeg(7), 0.6, { dk: 0.28 })
  },
  release: (c, V, t) => {
    ching(c, V(-0.28), t, thaiDeg(7), 0.9, { dk: 0.55 })
    ching(c, V(0.28), t + 0.06, thaiDeg(11), 0.45, { dk: 0.5, seed: 21 })
    sparkle(c, V, t + 0.2)
  },
}

/**
 * The room + band filters (dry + 20 % short room → high-pass 420 Hz → low-pass 9 kHz) are built ONCE per context and
 * destination (in the idle warm-up): setting a ConvolverNode's buffer is the expensive part, never on a contact frame.
 */
const chains = new WeakMap<BaseAudioContext, Map<AudioNode, AudioNode>>()
function roomChain(c: BaseAudioContext, dest: AudioNode): AudioNode {
  let m = chains.get(c)
  if (!m) chains.set(c, (m = new Map()))
  let pre = m.get(dest)
  if (pre) return pre
  const input = c.createGain()
  const post = c.createGain()
  const conv = c.createConvolver()
  const wet = c.createGain()
  const hp = c.createBiquadFilter()
  const lp = c.createBiquadFilter()
  conv.buffer = roomImpulse(c)
  wet.gain.value = 0.2
  hp.type = 'highpass'
  hp.frequency.value = 420
  hp.Q.value = 0.6
  lp.type = 'lowpass'
  lp.frequency.value = 9000
  lp.Q.value = 0.5
  input.connect(post)
  input.connect(conv).connect(wet).connect(post)
  post.connect(hp).connect(lp).connect(dest)
  m.set(dest, (pre = input))
  return pre
}

/**
 * Builds one cut into `dest` with contact at `t0` (also used offline to measure / verify the cut).
 * Returns the output gain node and the end time.
 */
export function buildKring(c: BaseAudioContext, dest: AudioNode, variant: KringVariant, t0: number, norm = KRING_NORM[variant]): { out: GainNode; end: number } {
  const len = KRING_CUTS[variant].len
  const out = c.createGain()
  out.connect(roomChain(c, dest))
  out.gain.setValueAtTime(norm, t0)
  out.gain.setValueAtTime(norm, t0 + len - 0.08)
  out.gain.linearRampToValueAtTime(0, t0 + len)
  const pre = out
  const hasPan = typeof (c as AudioContext).createStereoPanner === 'function'
  const V = (p: number): AudioNode => {
    if (!hasPan) return pre
    const sp = c.createStereoPanner()
    sp.pan.value = p
    sp.connect(pre)
    return sp
  }
  BUILD[variant](c, V, t0)
  return { out, end: t0 + len }
}

let current: { out: GainNode } | null = null
function pageHidden(): boolean {
  try {
    return typeof document !== 'undefined' && document.visibilityState === 'hidden'
  } catch {
    return false
  }
}

/**
 * KRING T2 · the sound logo. Call it on the CONTACT frame (KringBump / BumpCheckIn `onContact`): the haptic pattern for
 * the cut fires on the same frame and the first ching lands with it. Respects the Sound setting (`chon_sfx_v1`), the
 * Haptics setting, reduced motion, a hidden page (never rings in the background) and the phone's silent switch (iOS
 * `audioSession.type = 'ambient'`). Returns true when the sound was scheduled.
 *   playKring('golive')                       // sound + haptic
 *   playKring('release', { haptic: false })   // caller already vibrated
 */
export function playKring(variant: KringVariant, opts: { haptic?: boolean; sound?: boolean } = {}): boolean {
  if (opts.haptic !== false) kringHapticHook?.(variant)
  if (opts.sound === false) return false
  try {
    if (!sfxEnabled() || pageHidden()) return false
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return false
    if (!ctx && !hasGesture()) return false
    const c = ac()
    if (!c) return false
    if (current) {
      try {
        const g = current.out.gain
        g.cancelScheduledValues(c.currentTime)
        g.setValueAtTime(g.value, c.currentTime)
        g.linearRampToValueAtTime(0, c.currentTime + 0.03)
      } catch {
        // ignore
      }
    }
    current = buildKring(c, c.destination, variant, c.currentTime + 0.005)
    return true
  } catch {
    return false
  }
}

/* haptics.ts registers its per-cut vibration here (keeps sfx ⇄ haptics free of an import cycle) */
let kringHapticHook: ((v: KringVariant) => void) | null = null
export function registerKringHaptic(fn: (v: KringVariant) => void): void {
  kringHapticHook = fn
}

const RECIPES: Record<SfxName, (c: AudioContext) => void> = {
  // KRING T2: the old E6→B6 bell is gone — both names now ring the Ching (golive / resume cuts)
  kring: (c) => { current = buildKring(c, c.destination, 'golive', c.currentTime + 0.005) },
  kringSoft: (c) => { current = buildKring(c, c.destination, 'resume', c.currentTime + 0.005) },
  clink: (c) => { tone(c, 880, 0, 0.06, 'triangle', 0.045); tone(c, 1320, 0.02, 0.05, 'sine', 0.025) },
  success: (c) => { tone(c, 659, 0, 0.12); tone(c, 880, 0.1, 0.16); tone(c, 1319, 0.2, 0.28, 'sine', 0.06) },
  combo: (c) => { [523, 659, 784, 1047].forEach((f, i) => tone(c, f, i * 0.06, 0.14, 'triangle', 0.06)) },
  jackpot: (c) => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(c, f, i * 0.07, 0.3, 'triangle', 0.07)); tone(c, 2093, 0.45, 0.6, 'sine', 0.05) },
  warning: (c) => { tone(c, 440, 0, 0.12, 'square', 0.035); tone(c, 440, 0.16, 0.12, 'square', 0.035) },
  error: (c) => { tone(c, 220, 0, 0.22, 'sawtooth', 0.03) },
  send: (c) => { tone(c, 1175, 0, 0.08, 'sine', 0.05); tone(c, 1568, 0.05, 0.1, 'sine', 0.04) },
  fold: (c) => { tone(c, 740, 0, 0.05, 'sine', 0.025) },
}

export function playSfx(name: SfxName): void {
  try {
    if (!sfxEnabled()) return
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    // no gesture yet: the browser would keep a new context muted anyway — never pay its construction cost for silence
    if (!ctx && !hasGesture()) return
    const c = ac()
    if (!c) return
    RECIPES[name](c)
  } catch {
    // audio is best-effort
  }
}

const CHIME_DAY_KEY = 'kring_chime_day_v1'

/**
 * Back-compat for older callers: the กริ๊ง! chime is now the Ching sound logo (no haptic here — callers vibrate).
 * `soft` → the Resume cut, otherwise Go Live. `oncePerDay` plays at most once per calendar day on this device.
 * Prefer `playKring(variant)`, which also fires the matching haptic.
 */
export function playKringChime(opts: { soft?: boolean; oncePerDay?: boolean; variant?: KringVariant } = {}): boolean {
  if (opts.oncePerDay) {
    try {
      const today = new Date().toDateString()
      if (window.localStorage.getItem(CHIME_DAY_KEY) === today) return false
      window.localStorage.setItem(CHIME_DAY_KEY, today)
    } catch {
      // storage blocked → play, it is only a soft chime
    }
  }
  return playKring(opts.variant ?? (opts.soft ? 'resume' : 'golive'), { haptic: false })
}
