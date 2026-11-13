import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import WalletTimeline from '../components/vip/WalletTimeline'
import { localReadyThb, parseKringNote, realName } from '../components/vip/walletKit'
import { guestHeldNow, guestMoneyRows, lastGuestRelease, localMoneyRows, localReleasedThb } from '../components/wallet/bookingMoney'
import { PinPad } from '../components/wallet/kringKit'
import { __resetPlanStore, acceptOffer, bookingStartMs, checkInBooking, counterOffer, createOffer, getPlanStore, declineOffer } from '../lib/planStore'
import { completedKringBookings, tripBookingCount, tripSavedTotal, EXPERIENCE_REFERENCE } from '../lib/tripSavings'
import { isIdVerified, liveBlockers, markIdVerified, readPresence, startLocalSetup, writePresence } from '../context/presence'

/**
 * KRING FIX1 · F2 — one money truth in the Wallet, Local readiness (no auto-Live), real names, honest savings, PIN.
 */

const ME = 'wei-1'
const signIn = (userId: string, role = 'guest', displayName = 'Demo Traveler', isDemoMode = true) =>
  window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId, role, displayName, isDemoMode }))

let accepted = true
const onDelta = (e: Event) => {
  const d = (e as CustomEvent<{ accepted?: boolean }>).detail
  d.accepted = accepted
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  signIn(ME)
  __resetPlanStore()
  accepted = true
  window.addEventListener('chon:wallet-delta', onDelta)
})
afterEach(() => {
  window.removeEventListener('chon:wallet-delta', onDelta)
  cleanup()
})

const bkkDate = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)
const bkkClock = (ms: number) => new Date(ms + 7 * 3600_000).toISOString().slice(11, 16)

function bookKwan(now = Date.now(), startIn = 10 * 60_000) {
  const start = now + startIn
  const o = createOffer(
    {
      localId: 'kwan',
      localName: 'Kwan',
      experienceId: 'yaowarat-food-walk',
      experienceTitle: 'Yaowarat street-food walk',
      terms: { priceThb: 1000, date: bkkDate(start), start: bkkClock(start), venue: 'Yaowarat Rd' },
    },
    'guest',
    now,
    { demoReply: false },
  )!
  counterOffer(o.id, 'host', 1200, now + 1_000)
  const b = acceptOffer(o.id, 'guest', now + 2_000)!
  return { o, b }
}

describe('Wei 3/4 · one money truth: ONE wallet row per booking', () => {
  it('offer ฿1,000 → counter ฿1,200 → accept is one ฿1,200 booking, held, with its experience named', () => {
    const { b } = bookKwan()
    const rows = guestMoneyRows(getPlanStore())
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ id: b.id, kind: 'booking', state: 'held', who: 'Kwan', title: 'Yaowarat street-food walk', thb: 1200 })
    const held = guestHeldNow(getPlanStore())
    expect(held.thb).toBe(1200)
    expect(held.names).toEqual(['Kwan'])
  })

  it('the timeline shows one booking line (not −฿1,000, −฿200 and −฿1,200) and, after กริ๊ง!, a Released line', () => {
    const { b } = bookKwan()
    render(<WalletTimeline mode="traveller" isDemoMode coinsPerThb={100} />)
    const holds = screen.getAllByTestId('wallet-timeline-hold')
    expect(holds).toHaveLength(1)
    expect(holds[0]).toHaveTextContent('Yaowarat street-food walk · Kwan')
    expect(holds[0]).toHaveTextContent('−฿1,200')
    expect(holds[0]).toHaveTextContent('held until you meet')
    expect(screen.queryByTestId('wallet-timeline-released')).toBeNull()

    act(() => {
      checkInBooking(b.id, 'bump', bookingStartMs(b))
    })
    expect(screen.getAllByTestId('wallet-timeline-hold')).toHaveLength(1)
    expect(screen.getByTestId('wallet-timeline-hold')).toHaveTextContent('met · released after กริ๊ง!')
    expect(screen.getByTestId('wallet-timeline-released')).toHaveTextContent('Released ฿1,200 to Kwan')
    expect(screen.getByTestId('wallet-timeline')).not.toHaveTextContent('Timed out')
    expect(guestHeldNow(getPlanStore()).thb).toBe(0)
    expect(lastGuestRelease(getPlanStore())?.who).toBe('Kwan')
  })

  it('a declined offer reads "not booked · every baht came back" with one Back line', () => {
    const now = Date.now()
    const o = createOffer({ localId: 'bell', localName: 'Bell', terms: { priceThb: 800 } }, 'guest', now, { demoReply: false })!
    declineOffer(o.id, 'host', now + 1_000)
    const rows = guestMoneyRows(getPlanStore())
    expect(rows[0]).toMatchObject({ kind: 'offer', state: 'refunded', backThb: 800 })
    render(<WalletTimeline mode="traveller" isDemoMode coinsPerThb={100} />)
    expect(screen.getByTestId('wallet-timeline-hold')).toHaveTextContent('not booked · every baht came back')
    expect(screen.getByTestId('wallet-timeline')).toHaveTextContent('+฿800')
  })

  it('planStore money notes fold into their booking by id', () => {
    expect(parseKringNote('Kring booking hold · Kwan · of-abc-1')).toEqual({ kind: 'hold', who: 'Kwan', ref: 'of-abc-1' })
    expect(parseKringNote('Kring booking refund · Kwan · of-abc-1')).toMatchObject({ kind: 'refund', ref: 'of-abc-1' })
    expect(parseKringNote('Kring booking released · Sarah · KR-2610-0001')).toMatchObject({ kind: 'released', who: 'Sarah', ref: 'KR-2610-0001' })
    expect(parseKringNote('Top up · PromptPay')).toBeNull()
  })
})

describe('Ploy 3/7 · the Local’s released 80% lands in Ready at once; a new real account starts at ฿0', () => {
  it('Ready = her 80% of released bookings − cash-outs (KRING FIX2: no invented demo start credit)', () => {
    signIn('ploy-1', 'host', 'ploy.host', false)
    const now = Date.now()
    const start = now + 10 * 60_000
    const o = createOffer(
      { guestId: 'sarah', guestName: 'Sarah', localId: 'ploy-1', localName: 'Ploy', experienceTitle: 'Yaowarat street-food walk', terms: { priceThb: 1200, date: bkkDate(start), start: bkkClock(start), venue: 'Yaowarat Rd' } },
      'guest',
      now,
      { hold: false, demoReply: false },
    )!
    const b = acceptOffer(o.id, 'host', now + 1)!
    expect(localReadyThb(getPlanStore(), false, 0)).toBe(0)
    expect(localReadyThb(getPlanStore(), true, 0)).toBe(0)
    expect(localMoneyRows(getPlanStore())[0]).toMatchObject({ state: 'held', guest: 'Sarah', receiveThb: 960 })
    checkInBooking(b.id, 'bump', bookingStartMs(b))
    expect(localReleasedThb(getPlanStore())).toBe(960)
    expect(localReadyThb(getPlanStore(), false, 0)).toBe(960)
    expect(localReadyThb(getPlanStore(), true, 0)).toBe(960)
    expect(localReadyThb(getPlanStore(), false, 960)).toBe(0)

    render(<WalletTimeline mode="host" isDemoMode={false} coinsPerThb={100} />)
    expect(screen.getByTestId('wallet-timeline-released')).toHaveTextContent('Released · Yaowarat street-food walk · Sarah')
    expect(screen.getByTestId('wallet-timeline-released')).toHaveTextContent('+฿960')
  })
})

describe('Wei 7/8 · savings: completed Kring bookings count, no unproven saving is claimed', () => {
  it('a released booking counts as a booking; it saves ฿0 unless the dated reference table lists its experience', () => {
    const { b } = bookKwan()
    expect(tripBookingCount()).toBe(0)
    checkInBooking(b.id, 'bump', bookingStartMs(b))
    expect(completedKringBookings()).toHaveLength(1)
    expect(tripBookingCount()).toBe(1)
    expect(tripSavedTotal()).toBe(0)
    EXPERIENCE_REFERENCE['yaowarat-food-walk'] = { elsewhereThb: 1450, source: { en: 'Klook app', th: 'แอป Klook' }, checked: '2026-10-20' }
    try {
      expect(tripSavedTotal()).toBe(250)
    } finally {
      delete EXPERIENCE_REFERENCE['yaowarat-food-walk']
    }
  })
})

describe('Ploy 2/6 · switching to Local never goes Live; Live needs the ID check + one experience', () => {
  it('a device that set up a Local is Paused until both checks pass', () => {
    signIn('ploy-1', 'host', 'Ploy', false)
    startLocalSetup()
    expect(readPresence().live).toBe(false)
    expect(liveBlockers()).toEqual(['id', 'experience'])
    // asking for Live is stored, but it does not count yet
    writePresence({ live: true })
    expect(readPresence().live).toBe(false)
    markIdVerified('ploy-1')
    expect(isIdVerified()).toBe(true)
    expect(readPresence().live).toBe(false)
    writePresence({ experiences: [{ id: 'yaowarat-food-walk', priceThb: 1200 }] })
    expect(liveBlockers()).toEqual([])
    expect(readPresence().live).toBe(true)
  })

  it('the ID check belongs to the account that did it', () => {
    signIn('ploy-1', 'host', 'Ploy', false)
    markIdVerified('ploy-1')
    signIn('somchai-2', 'host', 'Somchai', false)
    expect(isIdVerified()).toBe(false)
  })
})

describe('Wei 8 / Ploy 9 · real names, never "Demo Traveler"', () => {
  it('prefers the onboarding name, then a readable session name; generic stand-ins are dropped', () => {
    expect(realName('Demo Traveler')).toBe('')
    expect(realName('ploy.host')).toBe('Ploy')
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, name: 'Wei' }))
    expect(realName('Demo Traveler')).toBe('Wei')
  })
})

describe('Marco 9 · the PIN title never flips while the dots are red', () => {
  it('a mismatched confirm keeps "Enter it again" through the shake, then goes back to Create', async () => {
    render(<PinPad onSuccess={() => {}} />)
    const press = (d: string) => fireEvent.click(screen.getByRole('button', { name: d }))
    '111111'.split('').forEach(press)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400))
    })
    expect(screen.getByText('Enter it again')).toBeInTheDocument()
    '222222'.split('').forEach(press)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })
    // dots are red now, the title is unchanged
    expect(screen.getByRole('img', { name: /digits entered/ }).className).toMatch(/is-bad/)
    expect(screen.getByText('Enter it again')).toBeInTheDocument()
    await act(async () => {
      await new Promise((r) => setTimeout(r, 900))
    })
    expect(screen.getByText('Create a 6-digit payout PIN')).toBeInTheDocument()
  })
})
