import { beforeEach, describe, expect, it } from 'vitest'
import { afterEach, vi } from 'vitest'
import {
  acceptGuestHold,
  clockAt,
  hostShareThb,
  planPhase,
  recordGuestHold,
  recordReceivedGift,
  runDueDemo,
  sweepHolds,
  guestHeldTotalThb,
  releaseNoMeet,
} from './planStore'
import { NIGHT_STORE_PREFIX } from './demoState'
import {
  DEFAULT_PLAN_MIN,
  PLAN_STORE_KEY,
  REPLY_WINDOW_MS,
  __resetPlanStore,
  addMinutes,
  ensureMeetPlan,
  markGuestConfirmed,
  planEnd,
  toClock24,
  effectiveHoldStatus,
  getPlanStore,
  hostAct,
  mmss,
  msLeft,
  partnerKey,
  seedHostRequests,
} from './planStore'

const ALEX = { id: 'alex', guest: 'Alex', flag: '🇬🇧', venue: 'Tichuca Rooftop', time: '20:00', offerThb: 1500, receiveThb: 1200, noShowThb: 150, minutesAgo: 2 }

describe('planStore (Round 4 · one source of truth for plans)', () => {
  beforeEach(() => __resetPlanStore())

  it('seeds a request once and keeps its first-seen time (the reply countdown survives a reload)', () => {
    seedHostRequests([ALEX], 1_000_000)
    seedHostRequests([ALEX], 9_000_000)
    expect(getPlanStore().host.alex.receivedAt).toBe(1_000_000 - 2 * 60_000)
    expect(getPlanStore().host.alex.state).toBe('pending')
  })

  it('accept / counter update the same record and persist (real session → sessionStorage)', () => {
    seedHostRequests([ALEX])
    hostAct('alex', 'countered', { counterThb: 1650 })
    expect(getPlanStore().host.alex).toMatchObject({ state: 'countered', counterThb: 1650, venue: 'Tichuca Rooftop' })
    hostAct('alex', 'accepted', { venue: 'Octave Rooftop Bar', time: '20:30' })
    expect(getPlanStore().host.alex).toMatchObject({ state: 'confirmed', venue: 'Octave Rooftop Bar', time: '20:30' })
    const saved = JSON.parse(window.sessionStorage.getItem(PLAN_STORE_KEY) ?? '{}')
    expect(saved.host.alex.state).toBe('confirmed')
  })

  it('records a held Clink from chon:offer-status and reads it as expired after the 15-minute window', () => {
    window.dispatchEvent(new CustomEvent('chon:offer-status', { detail: { status: 'HELD', hostName: 'Mint', hostId: 'host-mint', offerBaht: 300 } }))
    const hold = getPlanStore().guest.mint
    expect(hold).toMatchObject({ hostId: 'mint', offerThb: 300, status: 'held' })
    expect(effectiveHoldStatus(hold, hold.heldAt + 60_000)).toBe('held')
    expect(mmss(msLeft(hold, hold.heldAt + 5_000))).toBe('14:55')
    expect(effectiveHoldStatus(hold, hold.heldAt + REPLY_WINDOW_MS)).toBe('expired')
    window.dispatchEvent(new CustomEvent('chon:offer-status', { detail: { status: 'CANCELLED', hostName: 'Mint', hostId: 'host-mint' } }))
    expect(getPlanStore().guest.mint.status).toBe('cancelled')
  })

  it('normalises Meet ids and names to chat partner keys', () => {
    expect(partnerKey('host-mint')).toBe('mint')
    expect(partnerKey('Ploy')).toBe('ploy')
    expect(partnerKey('Alex, 31')).toBe('alex')
  })
})

describe('planStore · NEXT95 the shared plan clock (KRING FIX2: no paid hourly extensions)', () => {
  beforeEach(() => __resetPlanStore())
  const SEED = { key: 'alex', guest: 'Alex', host: 'Ploy', start: '8 PM' }

  it('gives every meet one shared clock: 2 h from the start, wrapping past midnight', () => {
    const p = ensureMeetPlan(SEED, 1_000)!
    expect(p).toMatchObject({ key: 'alex', start: '20:00', baseMin: DEFAULT_PLAN_MIN, extendedMin: 0 })
    expect(planEnd(p)).toBe('22:00')
    expect(toClock24('7:30 PM')).toBe('19:30')
    expect(toClock24('20:00 น.')).toBe('20:00')
    expect(addMinutes('23:30', 60)).toBe('00:30')
    // a second sighting never resets the agreed length
    ensureMeetPlan(SEED, 2_000)
    expect(getPlanStore().meet.alex.updatedAt).toBe(1_000)
  })

  it('a host accept opens the shared clock at the agreed time; the guest confirm is remembered', () => {
    seedHostRequests([ALEX])
    hostAct('alex', 'accepted', { time: '20:30' })
    expect(planEnd(getPlanStore().meet.alex)).toBe('22:30')
    markGuestConfirmed({ key: 'alex', guest: 'Alex', host: 'Ploy', start: '20:30' }, 99)
    expect(getPlanStore().meet.alex).toMatchObject({ guestConfirmedAt: 99, host: 'Ploy', guest: 'Alex' })
  })
})

/* ------------------------------------------------------------------ */
/* ROUND5 · H1                                                        */
/* ------------------------------------------------------------------ */

const DEMO_SESSION = JSON.stringify({ userId: 'demo-traveler', role: 'guest', displayName: 'Wei', isDemoMode: true })
const NIGHT = `${NIGHT_STORE_PREFIX}plans`

describe('planStore · ROUND5 night persistence + demo counterpart', () => {
  beforeEach(() => {
    window.localStorage.setItem('chon_auth_session_v1', DEMO_SESSION)
    __resetPlanStore()
  })
  afterEach(() => {
    __resetPlanStore()
    window.localStorage.removeItem('chon_auth_session_v1')
    document.body.innerHTML = ''
  })

  it('a demo session keeps tonight in localStorage: closing and reopening the app (fresh module) restores plans and holds', async () => {
    seedHostRequests([ALEX])
    hostAct('alex', 'accepted')
    recordGuestHold('host-mint', 'Mint', 300)
    acceptGuestHold('mint')
    expect(window.sessionStorage.getItem(PLAN_STORE_KEY)).toBeNull()
    expect(JSON.parse(window.localStorage.getItem(NIGHT) ?? '{}').value.host.alex.state).toBe('confirmed')
    // "close the app": drop the in-memory module and the tab's sessionStorage, keep localStorage
    window.sessionStorage.clear()
    vi.resetModules()
    const fresh = await import('./planStore')
    expect(fresh.getPlanStore().host.alex.state).toBe('confirmed')
    expect(fresh.getPlanStore().guest.mint).toMatchObject({ status: 'accepted', offerThb: 300 })
    expect(fresh.getPlanStore().meet.alex.start).toBe('20:00')
    fresh.__resetPlanStore()
  })

  it("last night's plans do not come back the next night", async () => {
    seedHostRequests([ALEX])
    const env = JSON.parse(window.localStorage.getItem(NIGHT) ?? '{}')
    window.localStorage.setItem(NIGHT, JSON.stringify({ ...env, night: '2001-01-01' }))
    vi.resetModules()
    const fresh = await import('./planStore')
    expect(fresh.getPlanStore().host).toEqual({})
  })

  it('demo: a held Clink that ran out while the sheet was closed comes back to the wallet exactly once', () => {
    recordGuestHold('host-mint', 'Mint', 300, 0)
    const deltas: number[] = []
    const onDelta = (e: Event) => deltas.push((e as CustomEvent<{ paidDelta?: number }>).detail.paidDelta ?? 0)
    window.addEventListener('chon:wallet-delta', onDelta)
    sweepHolds(60_000) // inside the window: nothing
    sweepHolds(REPLY_WINDOW_MS)
    sweepHolds(REPLY_WINDOW_MS + 5_000)
    runDueDemo(REPLY_WINDOW_MS + 9_000)
    window.removeEventListener('chon:wallet-delta', onDelta)
    expect(deltas).toEqual([30_000])
    expect(getPlanStore().guest.mint).toMatchObject({ status: 'expired', refundedAt: REPLY_WINDOW_MS })
  })

  it('demo: while the Clink sheet that placed the hold stays open, the sheet refunds its own expiry (no second refund)', () => {
    const sheet = document.createElement('div')
    sheet.setAttribute('data-testid', 'clink-gift-sheet')
    document.body.appendChild(sheet)
    recordGuestHold('host-mint', 'Mint', 300, 0)
    const deltas: number[] = []
    const onDelta = (e: Event) => deltas.push((e as CustomEvent<{ paidDelta?: number }>).detail.paidDelta ?? 0)
    window.addEventListener('chon:wallet-delta', onDelta)
    sweepHolds(2_000)
    sweepHolds(REPLY_WINDOW_MS)
    window.removeEventListener('chon:wallet-delta', onDelta)
    expect(deltas).toEqual([])
    expect(getPlanStore().guest.mint.status).toBe('expired')
  })

  it('a confirmed plan keeps its treat: an accepted hold never times out or refunds', () => {
    recordGuestHold('host-mint', 'Mint', 300, 0)
    acceptGuestHold('mint', 10)
    const deltas: number[] = []
    const onDelta = () => deltas.push(1)
    window.addEventListener('chon:wallet-delta', onDelta)
    sweepHolds(REPLY_WINDOW_MS * 4)
    window.removeEventListener('chon:wallet-delta', onDelta)
    expect(deltas).toEqual([])
    expect(effectiveHoldStatus(getPlanStore().guest.mint, REPLY_WINDOW_MS * 4)).toBe('accepted')
  })

  it("received-gift bubbles are kept for the night", () => {
    recordReceivedGift('alex', { emoji: '🌹', name: 'Wai Rose', nameTh: 'กุหลาบ', thb: 2 }, 5)
    expect(getPlanStore().gifts.alex).toHaveLength(1)
    expect(JSON.parse(window.localStorage.getItem(NIGHT) ?? '{}').value.gifts.alex[0]).toMatchObject({ emoji: '🌹', at: 5 })
  })
})

describe('planStore · ROUND5 the plan clock is a real countdown', () => {
  beforeEach(() => __resetPlanStore())

  it('places a Bangkok clock time inside tonight (01:30 still belongs to tonight)', () => {
    // 2026-10-21 15:00 Bangkok = 08:00 UTC
    const now = Date.UTC(2026, 9, 21, 8, 0)
    expect(new Date(clockAt('20:00', now)).toISOString()).toBe('2026-10-21T13:00:00.000Z')
    expect(new Date(clockAt('01:30', now)).toISOString()).toBe('2026-10-21T18:30:00.000Z')
    // 00:30 Bangkok the next calendar day is still the same night
    const late = Date.UTC(2026, 9, 21, 17, 30)
    expect(new Date(clockAt('20:00', late)).toISOString()).toBe('2026-10-21T13:00:00.000Z')
  })

  it('reads before → during → after from the agreed length', () => {
    const p = ensureMeetPlan({ key: 'alex', guest: 'Alex', host: 'Ploy', start: '20:00' }, 0)!
    const start = clockAt('20:00', Date.UTC(2026, 9, 21, 8, 0))
    expect(planPhase(p, start - 60_000).phase).toBe('before')
    expect(planPhase(p, start + 60_000).phase).toBe('during')
    expect(planPhase(p, start + 120 * 60_000).phase).toBe('after')
  })
})

describe('planStore · KRING FIX2 refunds carry their booking note (Wallet folds them into one row)', () => {
  beforeEach(() => __resetPlanStore())
  let deltas: Array<{ paidDelta?: number; allowEscrowRefund?: boolean; note?: string }> = []
  const onDelta = (e: Event) => {
    const d = (e as CustomEvent<{ paidDelta?: number; allowEscrowRefund?: boolean; note?: string; accepted?: boolean }>).detail
    d.accepted = true
    deltas.push({ paidDelta: d.paidDelta, allowEscrowRefund: d.allowEscrowRefund, note: d.note })
  }
  beforeEach(() => {
    deltas = []
    window.addEventListener('chon:wallet-delta', onDelta)
  })
  afterEach(() => window.removeEventListener('chon:wallet-delta', onDelta))

  it('host share is 80 %, a whole baht', () => {
    expect(hostShareThb(380)).toBe(304)
    expect(hostShareThb(1200)).toBe(960)
  })

  it('no meet → the Clink comes back once, through the escrow-refund call, with the hold\'s own ref', () => {
    recordGuestHold('host-mint', 'Mint', 300, 1_000, 'of-abc-1')
    acceptGuestHold('mint', 2_000)
    expect(releaseNoMeet('mint', 4_000)).toBe(300)
    expect(deltas).toEqual([{ paidDelta: 30_000, allowEscrowRefund: true, note: 'Kring booking refund · Mint · of-abc-1' }])
    expect(releaseNoMeet('mint', 5_000)).toBe(0)
    expect(deltas).toHaveLength(1)
    expect(guestHeldTotalThb('mint', 5_000)).toBe(0)
  })
})
