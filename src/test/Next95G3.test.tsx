import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH, GUIDE_IDS, GUIDE_MAX_PAGES, getGuide, guideTargetFor } from '../lib/guideContent'
import { markStarterPack, readStarterPack, STARTER_PACK, STARTER_PACK_WORTH_THB, StarterPackCard } from '../components/wallet/StarterPack'
import { recordTripSaving, tripSavedEntries, tripSavedTotal } from '../lib/tripSavings'
import GuideDemo from '../components/help/GuideDemo'

describe('NEXT95 G3 · guides that show', () => {
  const sets = { GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH }
  it('every guide has at most 3 pages and every page has a demo', () => {
    for (const [name, set] of Object.entries(sets)) {
      for (const g of Object.values(set)) {
        if (!g) continue
        expect(g.pages.length, `${name}.${g.id}`).toBeGreaterThan(0)
        expect(g.pages.length, `${name}.${g.id}`).toBeLessThanOrEqual(GUIDE_MAX_PAGES)
        g.pages.forEach((p, i) => expect(p.demo?.kind, `${name}.${g.id}[${i}]`).toBeTruthy())
      }
    }
  })
  it('has Extend time, Floor price and Starter Pack guides in EN and ไทย', () => {
    for (const id of ['extend', 'floor', 'starter'] as const) {
      expect(GUIDE_IDS).toContain(id)
      expect(GUIDES[id].pages.length).toBe(3)
      expect(GUIDES_TH[id].pages.length).toBe(3)
    }
    expect(guideTargetFor('plan-extend').id).toBe('extend')
    expect(guideTargetFor('pulse-floor').id).toBe('floor')
    expect(guideTargetFor('starter-pack').id).toBe('starter')
  })
  it('is role-aware: hosts get the host extend guide and never the Starter Pack', () => {
    expect(getGuide('extend', 'en', 'host')).toBe(HOST_GUIDES.extend)
    expect(getGuide('starter', 'th', 'host')).toBe(HOST_GUIDES_TH.wallet)
    expect(getGuide('clink', 'th', 'guest')).toBe(GUIDES_TH.clink)
  })
  it('renders a demo for every kind used, with the tapped label', () => {
    const page = GUIDES.clink.pages[0]
    render(<GuideDemo demo={page.demo!} />)
    expect(screen.getByTestId('guide-demo')).toHaveAttribute('data-demo', 'lock')
    expect(screen.getByText('Book · ฿300')).toBeInTheDocument()
  })
})

describe('NEXT95 G3 · Starter Pack store', () => {
  beforeEach(() => window.localStorage.clear())
  it('prices add up and a dismiss never overwrites a purchase', () => {
    expect(STARTER_PACK.priceThb).toBe(999)
    expect(STARTER_PACK_WORTH_THB).toBe(500 + 185 + 665)
    expect(readStarterPack('u1').state).toBe('new')
    markStarterPack('u1', 'bought', 1000)
    markStarterPack('u1', 'dismissed', 2000)
    expect(readStarterPack('u1')).toEqual({ state: 'bought', at: 1000 })
    expect(readStarterPack('u2').state).toBe('new')
    expect(readStarterPack(undefined).state).toBe('new')
  })
  it('the Wallet card is hidden without a signed-in traveller', () => {
    render(<StarterPackCard />)
    expect(screen.queryByTestId('starter-pack-card')).toBeNull()
  })
})

describe('NEXT95 G3 · trip savings timeline entries', () => {
  beforeEach(() => window.localStorage.clear())
  it('records when and what was paid, measured against the FLOOR (ROUND5), even if a caller passes walk-in', () => {
    recordTripSaving('esim', 499, 185) // walk-in 499 → clamped to the Airalo floor ฿195
    recordTripSaving('ride:airport', 1200, 665) // walk-in 1,200 → Klook floor ฿700
    const e = tripSavedEntries(false)
    expect(e.map((x) => x.key).sort()).toEqual(['esim', 'ride:airport'])
    expect(e.find((x) => x.key === 'esim')).toMatchObject({ savedThb: 10, paidThb: 185 })
    expect(tripSavedTotal(false)).toBe(10 + 35)
  })
  it('there is no demo seed: ฿0 and no rows until something is booked', () => {
    expect(tripSavedTotal(true)).toBe(0)
    expect(tripSavedEntries(true)).toEqual([])
  })
})
