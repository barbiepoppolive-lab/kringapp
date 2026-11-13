import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClinkGiftSheet, { clinkPriceFromLabel, DEMO_CLINK_HOST } from '../components/meet/ClinkGiftSheet'
import { DEMO_MEET_HOSTS, hostPriceThb, interestLabel, meetOnlineCount } from '../components/meet/MeetFeed'
import { timeAtProgress, zoomGeometry, zoomKeyframes } from '../components/meet/StoryViewer'
import StarterPackNudge, { STARTER_NUDGE_MS } from '../components/onboarding/StarterPackNudge'
import OnboardingSheet from '../components/onboarding/OnboardingSheet'
import { ISLAND_VISIBLE_EVENT, reserveIslandSpace } from '../components/fx/island'
import { pauseTilt, startTilt } from '../lib/tilt'

beforeEach(() => {
  window.localStorage.clear()
  reserveIslandSpace('island', 0)
  reserveIslandSpace('starter-pack', 0)
})
afterEach(() => vi.useRealTimers())

describe('ROUND5 H2 · Wei B2 — one price per host', () => {
  it('the Clink sheet opens at the price on the host card', () => {
    for (const h of DEMO_MEET_HOSTS) expect(clinkPriceFromLabel(h.treatLabel)).toBe(hostPriceThb(h))
    const bee = DEMO_MEET_HOSTS.find((h) => h.name === 'Bee')!
    render(<ClinkGiftSheet host={{ ...DEMO_CLINK_HOST, id: bee.id, name: bee.name, treatLabel: bee.treatLabel }} initialTab="offer" />)
    expect(screen.getByTestId('chon-lock-offer-cta').textContent).toContain(`฿${hostPriceThb(bee)}`)
  })

  it('never opens below the ฿300 floor', () => {
    expect(clinkPriceFromLabel('Coffee Drop · ฿200')).toBe(300)
    expect(clinkPriceFromLabel(undefined)).toBe(300)
    expect(clinkPriceFromLabel('Rooftop Drop · ฿1,200')).toBe(1200)
  })
})

describe('ROUND5 H2 · Wei B15 / B14 — Welcome count and chip labels match Meet', () => {
  it('Welcome counts the hosts Meet shows by default', () => {
    expect(meetOnlineCount()).toBe(DEMO_MEET_HOSTS.filter((h) => !h.city || h.city === 'Bangkok').length)
  })
  it('an onboarding pick reads like its Meet chip', () => {
    expect(interestLabel('food', 'en')).toBe('Thai food')
    expect(interestLabel('food', 'th')).toBe('อาหารไทย')
    expect(interestLabel('rooftop', 'en')).toBe('Sunset cafés')
  })
})

describe('ROUND5 H2 · Wei B14 — onboarding resumes where it was', () => {
  it('a remount (reload) lands on the saved step with the answers so far', () => {
    const onDone = vi.fn()
    const { unmount } = render(<OnboardingSheet role="guest" provider="google" displayName="Wei" onDone={onDone} />)
    fireEvent.change(screen.getByTestId('onboarding-name'), { target: { value: 'Wei Chen' } })
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(screen.getByTestId('onboarding-step-2')).toBeTruthy()
    unmount()
    render(<OnboardingSheet role="guest" provider="google" displayName="Wei" onDone={onDone} />)
    expect(screen.getByTestId('onboarding-step-2')).toBeTruthy()
    // finishing clears the draft
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-next'))
    fireEvent.click(screen.getByTestId('onboarding-next'))
    expect(onDone).toHaveBeenCalled()
    expect(window.localStorage.getItem('chon_onboarding_draft_v1')).toBeNull()
    expect(JSON.parse(window.localStorage.getItem('chon_profile_v1') ?? '{}').name).toBe('Wei Chen')
  })

  it('guest vibe chips use the Meet label ("Thai food", not "Food guide")', () => {
    window.localStorage.setItem('chon_onboarding_draft_v1', JSON.stringify({ v: 1, who: 'guest|google|Wei', step: 1, p: {}, at: Date.now() }))
    render(<OnboardingSheet role="guest" provider="google" displayName="Wei" onDone={() => {}} />)
    expect(screen.getByTestId('onboarding-pref-food').textContent).toContain('Thai food')
  })
})

describe('ROUND5 H2 · Wei B11 / Ploy B9 — nothing hangs over the row under the header', () => {
  it('island reservations take the largest live height and clear to 0', () => {
    reserveIslandSpace('a', 50)
    reserveIslandSpace('b', 52)
    expect(document.documentElement.style.getPropertyValue('--island-space')).toBe('52px')
    expect(document.documentElement.classList.contains('has-island-space')).toBe(true)
    reserveIslandSpace('b', 0)
    expect(document.documentElement.style.getPropertyValue('--island-space')).toBe('50px')
    reserveIslandSpace('a', 0)
    expect(document.documentElement.style.getPropertyValue('--island-space')).toBe('0px')
    expect(document.documentElement.classList.contains('has-island-space')).toBe(false)
  })

  it('the Starter nudge is a compact pill that reserves its band, steps aside for a toast and auto-hides', () => {
    vi.useFakeTimers()
    render(<StarterPackNudge role="guest" userId="u-wei" armed />)
    act(() => {
      vi.advanceTimersByTime(950)
    })
    const pill = screen.getByTestId('starter-pack-nudge')
    expect(pill.textContent).toContain('Worth ฿1,390')
    expect(pill.textContent).not.toContain('฿1,000')
    expect(document.documentElement.style.getPropertyValue('--island-space')).toBe('52px')
    // a toast takes the band → the pill steps aside and its timer waits
    act(() => {
      window.dispatchEvent(new CustomEvent(ISLAND_VISIBLE_EVENT, { detail: { visible: true } }))
    })
    expect(pill.className).toContain('is-away')
    act(() => {
      vi.advanceTimersByTime(STARTER_NUDGE_MS + 100)
    })
    expect(screen.queryByTestId('starter-pack-nudge')).not.toBeNull()
    act(() => {
      window.dispatchEvent(new CustomEvent(ISLAND_VISIBLE_EVENT, { detail: { visible: false } }))
    })
    act(() => {
      vi.advanceTimersByTime(STARTER_NUDGE_MS + 100)
    })
    expect(screen.queryByTestId('starter-pack-nudge')).toBeNull()
    expect(document.documentElement.style.getPropertyValue('--island-space')).toBe('0px')
  })
})

describe('ROUND5 H2 · Marco B1 / B2 — story zoom and cube turn maths', () => {
  it('the zoom starts at the ring and ends covering the screen', () => {
    const g = zoomGeometry({ x: 49, y: 150, size: 52 })
    // the circle reaches the farthest corner from the ring
    expect(g.radius).toBeGreaterThanOrEqual(Math.hypot(g.vw - 49, g.vh - 150))
    expect(g.s0 * g.radius * 2).toBeCloseTo(52, 0)
    const k = zoomKeyframes(g, 'open')
    expect(String(k.outer[0].transform)).toContain(`scale(${g.s0.toFixed(5)})`)
    expect(String(k.outer[k.outer.length - 1]?.transform)).toContain('scale(1.00000)')
    expect(String(k.inner[k.inner.length - 1]?.transform)).toBe('scale(1.00000)')
    // the inner counter-scale stays small so the first frame never rasterises at a huge scale
    const innerMax = Math.max(...k.inner.map((f) => Number(String(f.transform).match(/scale\(([\d.]+)\)/)?.[1])))
    expect(innerMax).toBeLessThanOrEqual(3.01)
    // closing goes back into the ring
    const c = zoomKeyframes(g, 'close')
    expect(String(c.outer[c.outer.length - 1]?.transform)).toContain(`scale(${g.s0.toFixed(5)})`)
  })

  it('the header swaps when the cube passes 45°, early in the turn', () => {
    const mid = timeAtProgress(0.5)
    expect(mid).toBeGreaterThan(0.15)
    expect(mid).toBeLessThan(0.35)
    expect(timeAtProgress(0)).toBe(0)
    expect(timeAtProgress(1)).toBe(1)
  })
})

describe('ROUND5 H2 · perf — the tilt holds still behind a full-screen layer', () => {
  it('pauseTilt is ref-counted and resumes', () => {
    const stop = startTilt()
    const resumeA = pauseTilt()
    const resumeB = pauseTilt()
    resumeA()
    resumeA() // idempotent
    resumeB()
    stop()
    expect(document.documentElement.style.getPropertyValue('--tx')).toBe('0.000')
  })
})
