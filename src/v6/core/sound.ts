/* Synthesised bell / tick sounds and haptics (no audio files). */
import { S } from './store'
let A: AudioContext | null = null
export function ac(): AudioContext | null {
  if (!A) { try { const C = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext; A = new C() } catch { /* no audio */ } }
  if (A && A.state === 'suspended') void A.resume()
  return A
}
export function bell(gain = 0.5, f0 = 1318.5): void {
  const a = ac(); if (!a || !S.sound) return; const t0 = a.currentTime
  const m = a.createGain(); m.gain.value = gain; m.connect(a.destination)
  const n = a.createBuffer(1, Math.floor(a.sampleRate * 0.03), a.sampleRate), d = n.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 4)
  const ns = a.createBufferSource(); ns.buffer = n; const hp = a.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500
  const ng = a.createGain(); ng.gain.value = 0.5; ns.connect(hp); hp.connect(ng); ng.connect(m); ns.start(t0)
  ;[[1, 1, 2.4], [1.003, 0.6, 2.2], [2.76, 0.45, 1.3], [5.4, 0.22, 0.8], [8.93, 0.1, 0.45]].forEach(([r, amp, dec]) => {
    const o = a.createOscillator(); o.frequency.value = f0 * r; const g = a.createGain()
    g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(amp, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dec)
    o.connect(g); g.connect(m); o.start(t0); o.stop(t0 + dec + 0.05)
  })
}
export function tick(p = 0.5, vol = 0.14): void {
  const a = ac(); if (!a || !S.sound) return; const t0 = a.currentTime
  const o = a.createOscillator(); o.frequency.value = 420 + p * 520; const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06)
  o.connect(g); g.connect(a.destination); o.start(t0); o.stop(t0 + 0.08)
}
export function chime(): void { [0, 120, 240].forEach((d, i) => setTimeout(() => bell(0.18, [1568, 1975, 2349][i]), d)) }
export function buzz(p: number | number[]): void { try { navigator.vibrate?.(p) } catch { /* ignore */ } }
