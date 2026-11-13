import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import WalletTimeline, { groupFor } from '../components/vip/WalletTimeline'
import { BalanceSplit, readHostPayouts, recordHostPayout } from '../components/vip/walletKit'
import { STARTER_PACK_WORTH_THB } from '../components/wallet/StarterPack'
import { FLOOR_PRICES } from '../components/pulse/floorPrices'
import { GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH } from '../lib/guideContent'
import { nightStore } from '../lib/demoState'
import { __resetPlanStore, hostAct, recordGuestHold, seedHostRequests } from '../lib/planStore'
import { recordTripSaving, tripSavedTotal } from '../lib/tripSavings'

/** ROUND5 · H3 — Wallet, top-up, timeline, Starter Pack, guides, Thai. */

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  __resetPlanStore()
})

describe('Ploy B1 · host cash-outs last for the night (demo)', () => {
  it('a demo cash-out survives closing the tab (sessionStorage gone) — the balance never comes back', () => {
    recordHostPayout(500, true)
    window.sessionStorage.clear() // "close and reopen"
    expect(readHostPayouts(true).paidOutThb).toBe(500)
    expect(nightStore.get<{ paidOutThb: number } | null>('host-payouts', null)?.paidOutThb).toBe(500)
  })
  it('real sessions keep their per-tab record (no nightStore write)', () => {
    recordHostPayout(300, false)
    expect(readHostPayouts(false).paidOutThb).toBe(300)
    expect(nightStore.get('host-payouts', null)).toBeNull()
  })
})

describe('Wei B1 · one balance line', () => {
  it('says what is cash and what is promo, and why a Clink needs cash', () => {
    render(<BalanceSplit paidCoins={20_000} bonusCoins={100_000} coinsPerThb={100} note testId="split" />)
    const el = screen.getByTestId('split')
    expect(el).toHaveTextContent('฿200 cash')
    expect(el).toHaveTextContent('฿1,000 promo')
    expect(el).toHaveTextContent('Promo can’t pay a booking')
    expect(el.textContent).not.toMatch(/coin/i)
  })
})

describe('Wei B9 · one savings baseline', () => {
  it('is FLOOR − OURS and ฿0 until something is booked, in demo too', () => {
    expect(tripSavedTotal(true)).toBe(0)
    recordTripSaving('esim', FLOOR_PRICES['esim:8d'].floorThb, 185)
    expect(tripSavedTotal(true)).toBe(10)
  })
})

describe('Wei B8 · the timeline groups by the clock', () => {
  // KRING FIX1 · the wallet groups by BANGKOK time (UTC+7), whatever the device zone
  const at = (h: number, m = 0, dayOffset = 0) => Date.UTC(2026, 9, 21 + dayOffset, h - 7, m)
  // KRING FIX2 · Wei 40 / Ploy 3: no "Tonight / คืนนี้" heading over a Friday booking — Bangkok calendar days
  it('Today for this Bangkok day, Yesterday for the one before, Earlier before that', () => {
    expect(groupFor(at(21), at(22))).toBe('today')
    expect(groupFor(at(7, 14), at(21))).toBe('today')
    expect(groupFor(at(0, 30), at(23, 50))).toBe('today')
    expect(groupFor(at(23, 0, -1), at(1))).toBe('yesterday') // 11 PM yesterday is yesterday, even at 1 AM
    expect(groupFor(at(22, 0, -2), at(10))).toBe('earlier')
  })

  it('a Clink hold reads "Held · comes back if you don’t meet", never "Spent in Chonn!"', () => {
    act(() => recordGuestHold('host-mint', 'Mint', 300))
    render(<WalletTimeline mode="traveller" isDemoMode coinsPerThb={100} />)
    const hold = screen.getByTestId('wallet-timeline-hold')
    expect(hold).toHaveTextContent('Booking with Mint')
    expect(hold).toHaveTextContent('held until you meet')
    expect(hold).toHaveTextContent('comes back if you don’t meet')
    expect(hold).toHaveTextContent('−฿300')
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent('Spent in Chonn!')
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent('Spent in Kring')
  })
})

describe('Ploy B2 · a confirmed plan shows what SHE receives, never "your host"', () => {
  beforeEach(() => {
    seedHostRequests([{ id: 'alex', guest: 'Alex', flag: '🇬🇧', venue: 'Tichuca Rooftop', time: '20:00', offerThb: 1500, receiveThb: 1200, noShowThb: 150, minutesAgo: 3 }])
    hostAct('alex', 'accepted')
  })

  it('her 80 % after you meet, one amount, and no paid time extension anywhere (founder, fix round 2)', () => {
    render(<WalletTimeline mode="host" isDemoMode coinsPerThb={100} />)
    expect(screen.getByTestId('wallet-timeline-earned')).toHaveTextContent('฿1,200 after you meet')
    expect(screen.queryByTestId('wallet-timeline-ext')).toBeNull()
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent(/your host|your guest|Extended|\+1 h/)
  })

  it('a host account’s own plan never shows up in its traveller timeline', () => {
    render(<WalletTimeline mode="traveller" isDemoMode coinsPerThb={100} />)
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent('your host')
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent('Alex')
  })
})

describe('guides tell the same truth as the app', () => {
  const all = [GUIDES, GUIDES_TH, HOST_GUIDES, HOST_GUIDES_TH].flatMap((set) => Object.values(set).filter(Boolean))
  const text = JSON.stringify(all)

  // KRING FIX2 · founder: hourly extensions are removed (approved removal). The 'extend' guide now explains a time
  // change through "Suggest a change" — same price, one hold — so there is no "Not tonight" decline and no +฿ extra.
  it('no guide offers a paid extension; a time change keeps the price ("Keep 18:00" / "ใช้เวลาเดิม")', () => {
    expect(text).not.toContain('ไว้คราวหน้า')
    expect(text).not.toMatch(/คืนนี้ไม่ต่อ|Not tonight|\+1 h\b|\+1 ชม|ต่อเวลา/)
    expect(GUIDES.extend.pages[1].demo?.alt).toBe('Keep 18:00')
    expect(HOST_GUIDES.extend?.pages[0].demo?.sub).toContain('Same price')
    expect(HOST_GUIDES_TH.extend?.pages[0].demo?.alt).toBe('ใช้เวลาเดิม')
  })

  it('Ploy B7 · a bad-behaviour example never uses her real guest', () => {
    for (const g of [HOST_GUIDES.safety, HOST_GUIDES_TH.safety, HOST_GUIDES.gifts, HOST_GUIDES_TH.gifts]) {
      const bad = g!.pages.map((p) => p.demo).filter((d) => d?.anon)
      expect(bad.length).toBeGreaterThan(0)
      bad.forEach((d) => expect(d?.title).not.toMatch(/Alex/))
    }
  })

  it('the Arrival kit is measured against the floor table, not walk-in', () => {
    const floor = FLOOR_PRICES['esim:8d'].floorThb + FLOOR_PRICES['cab:airport'].floorThb + FLOOR_PRICES.bag.floorThb
    expect(GUIDES.pulse.pages[1].demo?.from).toBe(`฿${floor.toLocaleString('en-US')}`)
    expect(text).not.toContain('706')
  })

  it('Marco B12 · the Starter Pack leads with its value', () => {
    expect(GUIDES.starter.pages[0].title).toContain(`฿${STARTER_PACK_WORTH_THB.toLocaleString('en-US')}`)
    expect(GUIDES_TH.starter.pages[0].title).toContain(`฿${STARTER_PACK_WORTH_THB.toLocaleString('en-US')}`)
  })
})
