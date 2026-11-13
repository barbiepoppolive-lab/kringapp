import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HAPTIC_PATTERNS, KRING_HAPTICS, hapPattern } from './haptics'
import { KRING_CUTS, KRING_NORM, THAI_STEP, playKring, playKringChime, setSfxEnabled, thaiDeg } from './sfx'

/** KRING T2 · sound logo A "Ching" — tuning, cuts, haptics and the gates (sound setting, hidden page). */

const cents = (a: number, b: number) => 1200 * Math.log2(b / a)

describe('Ching sound logo (T2)', () => {
  beforeEach(() => window.localStorage.clear())
  afterEach(() => vi.restoreAllMocks())

  it('is tuned to Thai 7-tone equal steps (≈171 cents), the ching at 1568 Hz, no 12-TET interval', () => {
    expect(cents(1, THAI_STEP)).toBeCloseTo(171.43, 1)
    expect(thaiDeg(7)).toBeCloseTo(1568, 3)
    // the answer (deg 11) and the first lift (deg 12) sit off the Western semitone grid (deg 14 is the octave)
    for (const d of [11, 12]) {
      const c = cents(thaiDeg(7), thaiDeg(d))
      expect(Math.abs(c / 100 - Math.round(c / 100))).toBeGreaterThan(0.1)
    }
    expect(cents(thaiDeg(7), thaiDeg(11))).toBeCloseTo(685.7, 1)
  })

  it('has four cuts: Launch 1.6 s, Go Live 0.9 s, Resume 0.45 s (−9 dBFS), Release 0.8 s, peak −3 dBFS', () => {
    expect(Object.keys(KRING_CUTS).sort()).toEqual(['golive', 'launch', 'release', 'resume'])
    expect(KRING_CUTS.launch).toEqual({ len: 1.6, target: -3 })
    expect(KRING_CUTS.resume.target).toBe(-9)
    for (const n of Object.values(KRING_NORM)) expect(n).toBeGreaterThan(0)
  })

  it('haptics: one short pulse per ching, timed to the audio', () => {
    expect(hapPattern(KRING_HAPTICS.launch)).toEqual([14, 61, 8, 257, 5, 125, 6])
    expect(hapPattern(KRING_HAPTICS.resume)).toEqual([8])
    expect(HAPTIC_PATTERNS.kring).toEqual(hapPattern(KRING_HAPTICS.golive))
    // no buzz: every pulse ≤ 14 ms
    for (const haps of Object.values(KRING_HAPTICS)) for (const [, ms] of haps) expect(ms).toBeLessThanOrEqual(14)
  })

  it('playKring vibrates the cut pattern even with sound off, and never rings with the Sound setting off', () => {
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    setSfxEnabled(false)
    expect(playKring('release')).toBe(false)
    expect(vibrate).toHaveBeenCalledWith(hapPattern(KRING_HAPTICS.release))
    vibrate.mockClear()
    expect(playKring('golive', { haptic: false })).toBe(false)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('never rings on a hidden page; playKringChime is the no-haptic back-compat path', () => {
    setSfxEnabled(true)
    const vis = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    expect(playKring('launch', { haptic: false })).toBe(false)
    vis.mockRestore()
    const vibrate = vi.fn(() => true)
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true })
    playKringChime({ soft: true })
    expect(vibrate).not.toHaveBeenCalled()
    // once a day
    window.localStorage.setItem('kring_chime_day_v1', new Date().toDateString())
    expect(playKringChime({ oncePerDay: true })).toBe(false)
  })
})
