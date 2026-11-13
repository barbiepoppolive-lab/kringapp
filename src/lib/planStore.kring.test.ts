import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  OFFER_REPLY_MS,
  DEMO_OFFER_REPLY_MS,
  FREE_CANCEL_MS,
  __resetPlanStore,
  acceptOffer,
  agencyTotals,
  allowsVenueChange,
  bookingStartMs,
  bookingEndMs,
  bookingsFor,
  canRelease,
  checkInBooking as checkIn,
  demoSkipToMeeting,
  tryAcceptOffer,
  viewerDisplayName,
  RELEASE_OPENS_BEFORE_MS,
  RELEASE_CLOSES_AFTER_MS,
  canViewBooking,
  cancelBooking,
  cancelRefundThb,
  checkInBooking,
  counterOffer,
  createOffer,
  declineOffer,
  effectiveMultiStatus,
  effectiveOfferStatus,
  getBookingFor,
  getOffer,
  getPlanStore,
  grantSafetyAccess,
  incomingOffersFor,
  markLocalNoShow,
  offerStage,
  releaseGuestHold,
  releaseMultiRequest,
  releaseNoMeet,
  requestMany,
  reviewBooking,
  myReview,
  splitEachThb,
  theirReview,
  runDueOffers,
  setAllowVenueChange,
  suggestChange,
  sweepOffers,
  changeOffer,
  reviseOffer,
} from './planStore'

type Delta = { paidDelta?: number; allowEscrowRefund?: boolean; hideGlobal?: boolean }
let deltas: Delta[] = []
let reject = false
const onDelta = (e: Event) => {
  const d = (e as CustomEvent<Delta & { accepted?: boolean }>).detail
  if (reject && (d.paidDelta ?? 0) < 0) {
    d.accepted = false
    return
  }
  d.accepted = true
  deltas.push({ paidDelta: d.paidDelta, allowEscrowRefund: d.allowEscrowRefund, hideGlobal: d.hideGlobal })
}
const HOLD = (thb: number): Delta => ({ paidDelta: -thb * 100, allowEscrowRefund: undefined, hideGlobal: true })
const BACK = (thb: number): Delta => ({ paidDelta: thb * 100, allowEscrowRefund: true, hideGlobal: undefined })

const last = <T,>(a: T[]): T | undefined => a[a.length - 1]
const T0 = Date.UTC(2026, 9, 21, 3, 0) // Tue 21 Oct 10:00 Bangkok
const SEED = {
  experienceId: 'yaowarat-food-walk',
  experienceTitle: 'Yaowarat street-food walk',
  guestId: 'sarah',
  guestName: 'Sarah',
  localId: 'mint',
  localName: 'Mint',
  fromThb: 1200,
  terms: { priceThb: 1000, date: '2026-10-25', start: '17:00', end: '20:00', venue: 'Wat Mangkon MRT · exit 1', groupSize: 2 },
}

beforeEach(() => {
  __resetPlanStore()
  deltas = []
  reject = false
  window.addEventListener('chon:wallet-delta', onDelta)
})
afterEach(() => window.removeEventListener('chon:wallet-delta', onDelta))

describe('KRING · offer card: offer → counter → accept (one hold, settled to the agreed amount)', () => {
  it("a guest's offer holds its price with the Clink hold call; the card carries price · date · start–end · venue · group", () => {
    const o = createOffer(SEED, 'guest', T0)!
    expect(o).toMatchObject({ status: 'open', lastBy: 'guest', heldThb: 1000, heldHere: true, replyBy: T0 + OFFER_REPLY_MS })
    expect(o.terms).toEqual({ priceThb: 1000, date: '2026-10-25', start: '17:00', end: '20:00', venue: 'Wat Mangkon MRT · exit 1', groupSize: 2 })
    expect(deltas).toEqual([HOLD(1000)])
    expect(incomingOffersFor('mint', T0 + 1)).toHaveLength(1)
  })

  it('not enough cash → no offer, nothing held', () => {
    reject = true
    expect(createOffer(SEED, 'guest', T0)).toBeNull()
    expect(Object.keys(getPlanStore().offers)).toHaveLength(0)
  })

  it('you can never offer yourself', () => {
    expect(createOffer({ ...SEED, localId: 'sarah' }, 'guest', T0)).toBeNull()
    expect(deltas).toEqual([])
  })

  it('only the other side can answer; the counter restarts the 10-minute window', () => {
    const o = createOffer(SEED, 'guest', T0)!
    expect(acceptOffer(o.id, 'guest', T0 + 1)).toBeNull()
    expect(counterOffer(o.id, 'guest', 900, T0 + 1)).toBeNull()
    const c = counterOffer(o.id, 'host', 1200, T0 + 60_000, { end: '20:30' })!
    expect(c).toMatchObject({ lastBy: 'host', replyBy: T0 + 60_000 + OFFER_REPLY_MS })
    expect(last(c.steps)).toMatchObject({ kind: 'counter', by: 'host', changed: ['time', 'price'] })
    expect(last(c.steps)?.prev?.priceThb).toBe(1000)
    expect(offerStage(c, T0 + 61_000)).toBe('countered')
    // the host cannot accept her own counter
    expect(acceptOffer(o.id, 'host', T0 + 70_000)).toBeNull()
  })

  it('accepting a higher counter holds only the difference; the booking carries the agreed terms', () => {
    const o = createOffer(SEED, 'guest', T0)!
    counterOffer(o.id, 'host', 1200, T0 + 1_000)
    const b = acceptOffer(o.id, 'guest', T0 + 2_000)!
    expect(deltas).toEqual([HOLD(1000), HOLD(200)])
    expect(b).toMatchObject({ status: 'held', heldThb: 1200, localReceiveThb: 960, guestId: 'sarah', localId: 'mint' })
    expect(b.id).toMatch(/^KR-2610-\d{4}$/)
    expect(getOffer(o.id)).toMatchObject({ status: 'accepted', bookingId: b.id, heldThb: 1200 })
    // the existing plan clock + guest hold mirror are set up for the chat (extension / no-show logic)
    expect(getPlanStore().guest.mint).toMatchObject({ status: 'accepted', offerThb: 1200, bookingId: b.id })
    expect(getPlanStore().meet.mint).toMatchObject({ start: '17:00', priceThb: 1200 })
  })

  it('accepting a lower price refunds the difference with the refund call', () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1500 } }, 'guest', T0)!
    suggestChange(o.id, 'host', { priceThb: 1300 }, T0 + 1)
    acceptOffer(o.id, 'guest', T0 + 2)
    expect(deltas).toEqual([HOLD(1500), BACK(200)])
  })

  it('a higher counter the wallet cannot cover is refused and nothing changes', () => {
    const o = createOffer(SEED, 'guest', T0)!
    counterOffer(o.id, 'host', 1600, T0 + 1)
    reject = true
    expect(acceptOffer(o.id, 'guest', T0 + 2)).toBeNull()
    expect(getOffer(o.id)?.status).toBe('open')
    expect(Object.keys(getPlanStore().bookings)).toHaveLength(0)
  })

  it("a local's offer holds nothing until the guest accepts it", () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200 } }, 'host', T0)!
    expect(o.heldThb).toBe(0)
    expect(deltas).toEqual([])
    const b = acceptOffer(o.id, 'guest', T0 + 1)!
    expect(deltas).toEqual([HOLD(1200)])
    expect(b.heldHere).toBe(true)
  })

  it("a local's phone accepting a remote guest's offer never touches its own wallet", () => {
    const o = createOffer(SEED, 'guest', T0, { hold: false })!
    const b = acceptOffer(o.id, 'host', T0 + 1)!
    expect(deltas).toEqual([])
    expect(b.heldHere).toBe(false)
  })

  it('decline / withdraw / no reply → the hold comes back once', () => {
    const a = createOffer(SEED, 'guest', T0)!
    declineOffer(a.id, 'host', T0 + 1)
    expect(getOffer(a.id)?.status).toBe('declined')
    const b = createOffer(SEED, 'guest', T0)!
    expect(declineOffer(b.id, 'guest', T0 + 1)?.status).toBe('withdrawn')
    const c = createOffer(SEED, 'guest', T0)!
    expect(effectiveOfferStatus(c, T0 + OFFER_REPLY_MS)).toBe('expired')
    expect(sweepOffers(T0 + OFFER_REPLY_MS)).toBe(1000)
    expect(sweepOffers(T0 + OFFER_REPLY_MS + 5)).toBe(0)
    expect(acceptOffer(c.id, 'host', T0 + OFFER_REPLY_MS + 10)).toBeNull()
    expect(deltas).toEqual([HOLD(1000), BACK(1000), HOLD(1000), BACK(1000), HOLD(1000), BACK(1000)])
  })
})

describe('KRING · the booking sheet keeps its own hold; the offer card rides on it (one money record)', () => {
  const sheetHold = (thb: number, at = T0) => {
    // what the sheet does: its own hold call, then chon:offer-status HELD
    deltas.push(HOLD(thb))
    window.dispatchEvent(new CustomEvent('chon:offer-status', { detail: { status: 'HELD', hostName: 'Mint', hostId: 'host-mint', offerBaht: thb } }))
    void at
  }

  it('adopting places no second hold; a decline refunds once through the hold record', () => {
    sheetHold(1000)
    const o = createOffer(SEED, 'guest', T0, { adoptHold: true })!
    expect(o).toMatchObject({ heldThb: 1000, heldHere: true, holdKey: 'mint' })
    expect(deltas).toEqual([HOLD(1000)])
    declineOffer(o.id, 'host', T0 + 1)
    expect(getPlanStore().guest.mint).toMatchObject({ status: 'cancelled' })
    expect(deltas).toEqual([HOLD(1000), BACK(1000)])
    // the sheet's own cancel afterwards finds nothing left to release
    releaseGuestHold('mint', 'cancelled', T0 + 2)
    expect(deltas).toHaveLength(2)
  })

  it("the sheet's Cancel closes the offer without a second refund", () => {
    sheetHold(1000)
    const o = createOffer(SEED, 'guest', T0, { adoptHold: true })!
    window.dispatchEvent(new CustomEvent('chon:offer-status', { detail: { status: 'CANCELLED', hostName: 'Mint', hostId: 'host-mint' } }))
    expect(getOffer(o.id)?.status).toBe('withdrawn')
    expect(deltas).toEqual([HOLD(1000)])
  })

  it('accept settles against the adopted hold and turns it into the booking', () => {
    sheetHold(1000)
    const o = createOffer(SEED, 'guest', T0, { adoptHold: true })!
    counterOffer(o.id, 'host', 1200, T0 + 1)
    const b = acceptOffer(o.id, 'guest', T0 + 2)!
    expect(deltas).toEqual([HOLD(1000), HOLD(200)])
    expect(getPlanStore().guest.mint).toMatchObject({ status: 'accepted', offerThb: 1200, bookingId: b.id })
  })

  it('no live sheet hold → nothing to adopt; a re-sent hold supersedes the old card', () => {
    expect(createOffer(SEED, 'guest', T0, { adoptHold: true })).toBeNull()
    sheetHold(1000)
    const a = createOffer(SEED, 'guest', T0, { adoptHold: true })!
    sheetHold(1100)
    const b = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1100 } }, 'guest', T0 + 5, { adoptHold: true })!
    expect(getOffer(a.id)?.status).toBe('withdrawn')
    expect(b.heldThb).toBe(1100)
    expect(deltas).toEqual([HOLD(1000), HOLD(1100)])
  })
})

describe('KRING · suggest a change (time · venue · price) + the host venue setting', () => {
  it('shows only what changed; either side can suggest; unchanged suggestions are ignored', () => {
    const o = createOffer(SEED, 'guest', T0)!
    expect(suggestChange(o.id, 'host', { venue: 'Wat Mangkon MRT · exit 1' }, T0 + 1)).toBeNull()
    const s = suggestChange(o.id, 'host', { start: '17:30', end: '20:30', venue: 'Chinatown Gate', priceThb: 1100 }, T0 + 1)!
    expect(last(s.steps)).toMatchObject({ kind: 'change', by: 'host', changed: ['time', 'venue', 'price'] })
    expect(last(s.steps)?.prev).toMatchObject({ start: '17:00', venue: 'Wat Mangkon MRT · exit 1', priceThb: 1000 })
    const back = suggestChange(o.id, 'guest', { start: '18:00', end: '21:00' }, T0 + 2)!
    expect(last(back.steps)?.changed).toEqual(['time'])
    expect(acceptOffer(o.id, 'host', T0 + 3)?.terms).toMatchObject({ start: '18:00', venue: 'Chinatown Gate', priceThb: 1100 })
  })

  it('"Guests may suggest another venue" defaults to Yes; No locks the venue for guests only', () => {
    expect(allowsVenueChange('mint')).toBe(true)
    setAllowVenueChange('host-mint', false)
    expect(allowsVenueChange('Mint')).toBe(false)
    const o = createOffer(SEED, 'guest', T0)!
    suggestChange(o.id, 'host', { priceThb: 1200 }, T0 + 1)
    expect(suggestChange(o.id, 'guest', { venue: 'Somewhere else' }, T0 + 2)).toBeNull()
    expect(suggestChange(o.id, 'guest', { priceThb: 1100 }, T0 + 3)?.terms.venue).toBe('Wat Mangkon MRT · exit 1')
    // the local can still move her own meeting point
    expect(suggestChange(o.id, 'host', { venue: 'Chinatown Gate' }, T0 + 4)?.terms.venue).toBe('Chinatown Gate')
    setAllowVenueChange('mint', true)
    expect(allowsVenueChange('mint')).toBe(true)
  })
})

describe('KRING · multi-request: one hold, first to accept gets it, the others are released', () => {
  const ask = () =>
    requestMany('yaowarat-food-walk', ['mint', 'ploy', 'ton', 'sarah', 'mint'], 1200, {
      guestId: 'sarah',
      guestName: 'Sarah',
      localNames: { mint: 'Mint', ploy: 'Ploy', ton: 'Ton' },
      terms: { date: '2026-10-25', start: '18:00', venue: 'Wat Mangkon MRT · exit 1' },
      now: T0,
    })!

  it('places ONE hold and one 10-minute request per local (yourself and duplicates dropped)', () => {
    const m = ask()
    expect(m.localIds).toEqual(['mint', 'ploy', 'ton'])
    expect(deltas).toEqual([HOLD(1200)])
    expect(Object.keys(m.offerIds)).toEqual(['mint', 'ploy', 'ton'])
    for (const oid of Object.values(m.offerIds)) expect(getOffer(oid)).toMatchObject({ status: 'open', heldThb: 0, replyBy: T0 + OFFER_REPLY_MS, multiId: m.id })
  })

  it('first accept wins; the others are released ("taken"), the second accept is refused, no extra money moves', () => {
    const m = ask()
    const b = acceptOffer(m.offerIds.ploy, 'host', T0 + 30_000)!
    expect(b).toMatchObject({ localId: 'ploy', heldThb: 1200 })
    expect(getPlanStore().multi[m.id]).toMatchObject({ status: 'won', winner: 'ploy', heldThb: 0 })
    expect(getOffer(m.offerIds.mint)).toMatchObject({ status: 'released', taken: true })
    expect(getOffer(m.offerIds.ton)).toMatchObject({ status: 'released', taken: true })
    expect(acceptOffer(m.offerIds.mint, 'host', T0 + 31_000)).toBeNull()
    expect(deltas).toEqual([HOLD(1200)])
    expect(Object.keys(getPlanStore().bookings)).toEqual([b.id])
  })

  it('per-local price: each local is asked at their own price (capped at the one hold); the winner pays theirs', () => {
    const m = requestMany('yaowarat-food-walk', ['mint', 'ploy'], 1500, {
      guestId: 'sarah',
      pricesThb: { mint: 1500, ploy: 1100 },
      now: T0,
    })!
    expect(deltas).toEqual([HOLD(1500)])
    expect(getOffer(m.offerIds.mint)?.terms.priceThb).toBe(1500)
    expect(getOffer(m.offerIds.ploy)?.terms.priceThb).toBe(1100)
    const b = acceptOffer(m.offerIds.ploy, 'host', T0 + 1_000)!
    expect(b.heldThb).toBe(1100)
    expect(deltas).toEqual([HOLD(1500), BACK(400)])
  })

  it('a counter in a multi-request settles against the ONE hold when the guest accepts it', () => {
    const m = ask()
    counterOffer(m.offerIds.ton, 'host', 1300, T0 + 1_000)
    const b = acceptOffer(m.offerIds.ton, 'guest', T0 + 2_000)!
    expect(b.heldThb).toBe(1300)
    expect(deltas).toEqual([HOLD(1200), HOLD(100)])
    expect(getOffer(m.offerIds.mint)?.status).toBe('released')
  })

  it('nobody accepts in 10 minutes → everything is released and the one hold comes back once', () => {
    const m = ask()
    expect(effectiveMultiStatus(m, T0 + OFFER_REPLY_MS)).toBe('expired')
    expect(sweepOffers(T0 + OFFER_REPLY_MS)).toBe(1200)
    expect(sweepOffers(T0 + OFFER_REPLY_MS + 1)).toBe(0)
    expect(getOffer(m.offerIds.mint)?.status).toBe('expired')
    expect(deltas).toEqual([HOLD(1200), BACK(1200)])
  })

  it('all locals decline → the hold comes back; the guest can also call it off (once)', () => {
    const m = ask()
    declineOffer(m.offerIds.mint, 'host', T0 + 1)
    declineOffer(m.offerIds.ploy, 'host', T0 + 2)
    expect(deltas).toEqual([HOLD(1200)])
    declineOffer(m.offerIds.ton, 'host', T0 + 3)
    expect(deltas).toEqual([HOLD(1200), BACK(1200)])
    const n = ask()
    expect(releaseMultiRequest(n.id, 'released', T0 + 5)).toBe(1200)
    expect(releaseMultiRequest(n.id, 'released', T0 + 6)).toBe(0)
  })

  it('demo: the first local answers by herself and the rest are released', () => {
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'sarah', isDemoMode: true, role: 'guest' }))
    try {
      __resetPlanStore()
      const m = ask()
      expect(offerStage(getOffer(m.offerIds.mint)!, T0 + DEMO_OFFER_REPLY_MS - 1_000)).toBe('typing')
      runDueOffers(T0 + DEMO_OFFER_REPLY_MS + 1)
      expect(getPlanStore().multi[m.id]).toMatchObject({ status: 'won', winner: 'mint' })
      expect(getOffer(m.offerIds.ploy)?.status).toBe('released')
    } finally {
      window.localStorage.removeItem('chon_auth_session_v1')
      __resetPlanStore()
    }
  })
})

describe('KRING · private bookings, the bump release and the cancel rules', () => {
  const book = () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200 } }, 'guest', T0)!
    return acceptOffer(o.id, 'host', T0 + 1)!
  }

  it('only the guest and the local can read a booking; agency sees totals only; safety only after SOS / report', () => {
    const b = book()
    expect(getBookingFor(b.id, 'sarah')?.id).toBe(b.id)
    expect(getBookingFor(b.id, 'Mint')?.id).toBe(b.id)
    expect(getBookingFor(b.id, 'ploy')).toBeNull()
    expect(getBookingFor(b.id, { id: 'silom-agency', role: 'agency' })).toBeNull()
    expect(getBookingFor(b.id, { id: 'kring-safety', role: 'safety' })).toBeNull()
    expect(bookingsFor('ploy')).toEqual([])
    expect(bookingsFor('sarah').map((x) => x.id)).toEqual([b.id])
    grantSafetyAccess(b.id, 'sos', T0 + 5)
    expect(canViewBooking(getPlanStore().bookings[b.id], { id: 'kring-safety', role: 'safety' })).toBe(true)
    // agency: counts and baht only — no booking objects, no who/where/when
    checkInBooking(b.id, 'bump', bookingStartMs(b) + 10)
    const tot = agencyTotals(['mint', 'ploy'])
    expect(tot).toEqual({ completed: 1, earnedThb: 960, byLocal: { mint: { completed: 1, earnedThb: 960 } } })
    expect(JSON.stringify(tot)).not.toMatch(/sarah|Wat Mangkon|17:00/i)
  })

  it('the bump releases the hold to the local once; nothing can be refunded after it', () => {
    const b = book()
    const seen: unknown[] = []
    const on = (e: Event) => seen.push((e as CustomEvent).detail)
    window.addEventListener('kring:released', on)
    const at = bookingStartMs(b) + 100
    const r = checkInBooking(b.id, 'bump', at)!
    window.removeEventListener('kring:released', on)
    expect(r).toMatchObject({ status: 'released', method: 'bump', metAt: at })
    expect(seen).toEqual([{ bookingId: b.id, method: 'bump', localName: 'Mint', guestName: 'Sarah', amountThb: 1200, localReceiveThb: 960 }])
    expect(checkInBooking(b.id, 'qr', at + 100)).toBeNull()
    deltas = []
    expect(cancelBooking(b.id, at + 200)).toBe(0)
    expect(releaseNoMeet('mint', T0 + 300)).toBe(0)
    releaseGuestHold('mint', 'cancelled', T0 + 300)
    expect(deltas).toEqual([])
  })

  it('free cancel until meeting; a no-show refunds everything', () => {
    const b = book()
    const start = bookingStartMs(b)
    expect(cancelRefundThb(b, start - FREE_CANCEL_MS)).toBe(1200)
    expect(cancelRefundThb(b, start - FREE_CANCEL_MS + 1)).toBe(1200)
    deltas = []
    expect(cancelBooking(b.id, start - 3600_000)).toBe(1200)
    expect(deltas).toEqual([BACK(1200)])
    expect(cancelBooking(b.id, start)).toBe(0)
    const c = book()
    deltas = []
    expect(markLocalNoShow(c.id, start + 3600_000)).toBe(1200)
    expect(deltas).toEqual([BACK(1200)])
  })

  it('one review per booking (stars clamped, tags kept)', () => {
    const b = book()
    expect(reviewBooking(b.id, { stars: 7, tags: ['Great food', 'Felt safe'], text: 'Nine stalls, felt safe the whole time.' }, T0)?.review).toMatchObject({ stars: 5, tags: ['Great food', 'Felt safe'] })
    expect(reviewBooking(b.id, { stars: 1, tags: [], text: '' }, T0)).toBeNull()
  })

  it('T3 · going with friends: ONE hold on the booker for the whole fee; the split is display only', () => {
    deltas = []
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200, groupSize: 3 } }, 'guest', T0)!
    expect(o.terms.groupSize).toBe(3)
    expect(deltas).toEqual([HOLD(1200)])
    expect(splitEachThb(o.terms.priceThb, o.terms.groupSize)).toBe(400)
    expect(splitEachThb(1000, 3)).toBe(334)
    expect(splitEachThb(1000, 0)).toBe(1000)
    expect(splitEachThb(1000, 99)).toBe(125)
    // growing the group on the card is a change, never a second hold
    const c = changeOffer(o.id, 'guest', { groupSize: 4 }, T0 + 1000)!
    expect(c.terms.groupSize).toBe(4)
    const b = acceptOffer(o.id, 'host', T0 + 2000)!
    expect(b.heldThb).toBe(1200)
    expect(deltas).toEqual([HOLD(1200)])
  })

  it('T3 · mutual reviews: the local reviews the guest only after the bump, once; each sees the other only after posting', () => {
    const b = book()
    const at = bookingStartMs(b) + 10
    // not met yet → a local cannot review the guest
    expect(reviewBooking(b.id, { stars: 5, tags: ['Kind'], text: '' }, T0, 'host')).toBeNull()
    expect(checkInBooking(b.id, 'bump', at)?.status).toBe('released')
    deltas = []
    const h = reviewBooking(b.id, { stars: 4, tags: ['On time'], text: 'Lovely guest' }, at + 1, 'host')!
    expect(h.hostReview).toMatchObject({ stars: 4, tags: ['On time'], text: 'Lovely guest' })
    expect(h.review).toBeUndefined()
    // once per side
    expect(reviewBooking(b.id, { stars: 1, tags: [], text: '' }, at + 2, 'host')).toBeNull()
    // the guest has not posted yet → she cannot see the local's review of her
    expect(theirReview(h, 'guest')).toBeUndefined()
    expect(theirReview(h, 'host')).toBeUndefined()
    const g = reviewBooking(b.id, { stars: 5, tags: ['Great food'], text: '' }, at + 3)!
    expect(myReview(g, 'guest')?.stars).toBe(5)
    expect(myReview(g, 'host')?.stars).toBe(4)
    expect(theirReview(g, 'guest')?.stars).toBe(4)
    expect(theirReview(g, 'host')?.stars).toBe(5)
    // reviews never move money
    expect(deltas).toEqual([])
    expect(g.status).toBe('released')
    expect(g.heldThb).toBe(b.heldThb)
  })
})

describe('KRING · demo counterpart on a local phone', () => {
  it("a simulated guest accepting a local's counter never charges the local's wallet", () => {
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'mint', isDemoMode: true, role: 'host' }))
    try {
      __resetPlanStore()
      const o = createOffer({ ...SEED, guestId: 'sarah', localId: 'mint' }, 'guest', T0, { hold: false, demoReply: false })!
      counterOffer(o.id, 'host', 1100, T0 + 1)
      expect(getOffer(o.id)?.demoReplyAt).toBe(T0 + 1 + DEMO_OFFER_REPLY_MS)
      runDueOffers(T0 + 1 + DEMO_OFFER_REPLY_MS)
      expect(getOffer(o.id)?.status).toBe('accepted')
      expect(deltas).toEqual([])
      expect(Object.values(getPlanStore().bookings)[0]).toMatchObject({ heldThb: 1100, heldHere: false, localReceiveThb: 880 })
    } finally {
      window.localStorage.removeItem('chon_auth_session_v1')
      __resetPlanStore()
    }
  })
})

describe('KRING FIX1 · the release gate (time window + place), one money truth', () => {
  const book = () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200, venue: 'Siam Herbal Spa, Ari', start: '14:00', end: '17:00' } }, 'guest', T0)!
    return acceptOffer(o.id, 'host', T0 + 1)!
  }

  it('opens 30 min before the start and closes 2 h after the end; says when and where while closed', () => {
    const b = book()
    const start = bookingStartMs(b)
    const early = canRelease(b.id, start - RELEASE_OPENS_BEFORE_MS - 1)
    expect(early).toMatchObject({ ok: false, reason: 'too-early', opensClock: '13:30', venue: 'Siam Herbal Spa, Ari' })
    expect(early.text.en).toBe('Opens at 13:30 at Siam Herbal Spa, Ari')
    expect(early.text.th).toContain('13:30 น.')
    // days ahead, the line names the day too
    expect(canRelease(b.id, T0).text.en).toBe('Opens Sun 25 at 13:30 at Siam Herbal Spa, Ari')
    expect(canRelease(b.id, start - RELEASE_OPENS_BEFORE_MS).ok).toBe(true)
    expect(canRelease(b.id, bookingEndMs(b) + RELEASE_CLOSES_AFTER_MS).ok).toBe(true)
    expect(canRelease(b.id, bookingEndMs(b) + RELEASE_CLOSES_AFTER_MS + 1)).toMatchObject({ ok: false, reason: 'too-late' })
    // the store enforces the same gate: no release 1d 17h early (Wei 6)
    expect(checkIn(b.id, 'bump', T0 + 10)).toBeNull()
    expect(getPlanStore().bookings[b.id].status).toBe('held')
  })

  it('with location: within ~300 m of a known venue releases, far away explains the distance', () => {
    const b = book()
    const at = bookingStartMs(b)
    const near = canRelease(b.id, at, { lat: 13.7799, lng: 100.5447 })
    expect(near.ok).toBe(true)
    expect(near.distanceM).toBeLessThan(100)
    const far = canRelease(b.id, at, { lat: 13.7465, lng: 100.4927 })
    expect(far).toMatchObject({ ok: false, reason: 'too-far' })
    expect(far.text.en).toMatch(/^You're [\d.]+ km away · bump at Siam Herbal Spa, Ari$/)
    expect(checkIn(b.id, 'bump', at, { lat: 13.7465, lng: 100.4927 })).toBeNull()
    expect(checkIn(b.id, 'bump', at, { lat: 13.7799, lng: 100.5447 })?.status).toBe('released')
    expect(canRelease(b.id, at)).toMatchObject({ ok: false, reason: 'not-held', status: 'released' })
  })

  it('demo "skip to the meeting" opens the gate only in a demo session', () => {
    const b = book()
    expect(demoSkipToMeeting(b.id, T0 + 5)).toBeNull()
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'sarah', isDemoMode: true }))
    try {
      expect(demoSkipToMeeting(b.id, T0 + 5)?.demoAtVenueAt).toBe(T0 + 5)
      expect(canRelease(b.id, T0 + 6).ok).toBe(true)
    } finally {
      window.localStorage.removeItem('chon_auth_session_v1')
    }
  })

  it("accept with too little cash never fails silently: it says how much more the hold needs and changes nothing", () => {
    const o = createOffer(SEED, 'guest', T0)!
    counterOffer(o.id, 'host', 1200, T0 + 1)
    reject = true
    const r = tryAcceptOffer(o.id, 'guest', T0 + 2)
    expect(r).toEqual({ booking: null, reason: 'short-cash', needThb: 200 })
    expect(getOffer(o.id)?.status).toBe('open')
    reject = false
    expect(tryAcceptOffer(o.id, 'guest', T0 + 3).booking).toMatchObject({ heldThb: 1200 })
    expect(tryAcceptOffer(o.id, 'guest', T0 + 4)).toEqual({ booking: null, reason: 'closed' })
  })

  it('a local releasing on her own (demo) phone gets her 80 % once, through the demo credit path', () => {
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'mint', isDemoMode: true, role: 'host' }))
    try {
      __resetPlanStore()
      const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1000 } }, 'guest', T0, { hold: false, demoReply: false })!
      const b = acceptOffer(o.id, 'host', T0 + 1)!
      deltas = []
      checkIn(b.id, 'qr', bookingStartMs(b))
      expect(deltas).toEqual([{ paidDelta: 80_000, allowEscrowRefund: true, hideGlobal: undefined }])
      expect(getPlanStore().bookings[b.id]).toMatchObject({ status: 'released', creditedHere: true })
      expect(checkIn(b.id, 'qr', bookingStartMs(b) + 1)).toBeNull()
      expect(deltas).toHaveLength(1)
    } finally {
      window.localStorage.removeItem('chon_auth_session_v1')
      __resetPlanStore()
    }
  })

  it('names: the profile name, never the "Demo Traveler" placeholder', () => {
    window.localStorage.setItem('chon_auth_session_v1', JSON.stringify({ userId: 'demo-traveler', displayName: 'Demo Traveler', isDemoMode: true }))
    window.localStorage.setItem('chon_profile_v1', JSON.stringify({ v: 1, name: 'Wei' }))
    try {
      expect(viewerDisplayName()).toBe('Wei')
      window.localStorage.removeItem('chon_profile_v1')
      expect(viewerDisplayName('You')).toBe('You')
    } finally {
      window.localStorage.removeItem('chon_auth_session_v1')
      window.localStorage.removeItem('chon_profile_v1')
    }
  })
})

/* ------------------------------------------------------------------ */
/* KRING FIX2                                                          */
/* ------------------------------------------------------------------ */
import { checkInBookingAfterPaint, holdRef, newOfferId } from './planStore'

describe('KRING FIX2 · one money row per booking, deferred release', () => {
  const notes: string[] = []
  const onNote = (e: Event) => {
    const n = (e as CustomEvent<{ note?: string }>).detail.note
    if (n) notes.push(n)
  }
  beforeEach(() => {
    notes.length = 0
    window.addEventListener('chon:wallet-delta', onNote)
  })
  afterEach(() => window.removeEventListener('chon:wallet-delta', onNote))

  it('Wei 2: the sheet hold, the counter top-up and the booking share ONE ref (offer ฿1,000 → countered ฿1,200 = one ฿1,200 hold)', () => {
    const ref = newOfferId(T0)
    // the sheet: its own hold call carrying the offer id, then HELD with the same ref
    window.dispatchEvent(new CustomEvent('chon:wallet-delta', { detail: { paidDelta: -100_000, hideGlobal: true, note: `Kring booking hold · Mint · ${ref}` } }))
    window.dispatchEvent(new CustomEvent('chon:offer-status', { detail: { status: 'HELD', hostName: 'Mint', hostId: 'host-mint', offerBaht: 1000, ref } }))
    expect(getPlanStore().guest.mint.ref).toBe(ref)
    const o = createOffer(SEED, 'guest', T0, { adoptHold: true, id: ref })!
    expect(o.id).toBe(ref)
    counterOffer(o.id, 'host', 1200, T0 + 1)
    const b = acceptOffer(o.id, 'guest', T0 + 2)!
    expect(b.offerId).toBe(ref)
    expect(b.heldThb).toBe(1200)
    // every booking money note names the same offer → the Wallet folds them into the booking's one row
    expect(notes.filter((n) => n.startsWith('Kring booking')).every((n) => n.endsWith(ref))).toBe(true)
    expect(deltas.filter((d) => (d.paidDelta ?? 0) < 0).reduce((a, d) => a + (d.paidDelta ?? 0), 0)).toBe(-120_000)
  })

  it('a lower agreed price refunds the surplus with the booking note; a decline refunds with it too', () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200 } }, 'guest', T0)!
    counterOffer(o.id, 'host', 1100, T0 + 1)
    acceptOffer(o.id, 'guest', T0 + 2)
    expect(notes).toContain(`Kring booking refund · Mint · ${o.id}`)
    const o2 = createOffer({ ...SEED, localId: 'kwan', localName: 'Kwan' }, 'guest', T0 + 3)!
    declineOffer(o2.id, 'host', T0 + 4)
    expect(notes).toContain(`Kring booking refund · Kwan · ${o2.id}`)
    expect(holdRef({ hostId: 'mint' })).toBe('sheet-mint')
  })

  it('Marco 1: checkInBookingAfterPaint returns the same result now and commits after paint', async () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200 } }, 'guest', T0)!
    const b = acceptOffer(o.id, 'host', T0 + 1)!
    const at = bookingStartMs(b)
    expect(checkInBookingAfterPaint(b.id, 'bump', T0 + 10)).toBeNull() // gate refuses: nothing scheduled
    let committed: unknown = 'pending'
    const now = checkInBookingAfterPaint(b.id, 'bump', at, null, (x) => (committed = x))!
    expect(now).toMatchObject({ status: 'released', releasedAt: at, method: 'bump' })
    expect(getPlanStore().bookings[b.id].status).toBe('held') // not yet: the flash paints first
    expect(checkInBookingAfterPaint(b.id, 'bump', at)).toBeNull() // a second tap schedules nothing
    await new Promise((r) => setTimeout(r, 60))
    expect(getPlanStore().bookings[b.id]).toMatchObject({ status: 'released', releasedAt: at })
    expect(committed).toMatchObject({ status: 'released' })
  })
})

describe('KRING FIX3 · per-local venue on a multi-request', () => {
  it('each local’s child offer carries her own meeting place (fallback: the shared venue)', () => {
    const m = requestMany('salon-nails', ['mint', 'ploy'], 1000, {
      localNames: { mint: 'Mint', ploy: 'Ploy' },
      venues: { mint: 'Nara Salon, Siam Square' },
      terms: { venue: 'Siam Paragon beauty floor (4F)', date: '2026-10-25', start: '11:00', end: '13:00' },
      now: T0,
    })!
    expect(getOffer(m.offerIds.mint)?.terms.venue).toBe('Nara Salon, Siam Square')
    expect(getOffer(m.offerIds.ploy)?.terms.venue).toBe('Siam Paragon beauty floor (4F)')
  })
})

describe('KRING VISUAL V2 · V3 · one living card per booking (both sides edit the same record)', () => {
  it('the sender revises her own pending card ("Send change" while waiting): same offer, one hold, accept settles the difference once', () => {
    const o = createOffer(SEED, 'guest', T0)!
    expect(deltas).toEqual([HOLD(1000)])
    const r = changeOffer(o.id, 'guest', { priceThb: 1100, groupSize: 3 }, T0 + 30_000)!
    expect(r.id).toBe(o.id)
    expect(r).toMatchObject({ lastBy: 'guest', heldThb: 1000, replyBy: T0 + 30_000 + OFFER_REPLY_MS })
    expect(last(r.steps)).toMatchObject({ kind: 'change', by: 'guest', changed: ['price', 'group'] })
    // no money moved on the edit — still the one hold
    expect(deltas).toEqual([HOLD(1000)])
    expect(Object.keys(getPlanStore().offers)).toHaveLength(1)
    const b = acceptOffer(o.id, 'host', T0 + 60_000)!
    expect(b.heldThb).toBe(1100)
    expect(deltas).toEqual([HOLD(1000), HOLD(100)])
  })

  it("on your turn the same call answers (Kwan changes ฿1,000 → ฿1,200 · 17:00 → 17:30); a lower agreed fee refunds the difference once", () => {
    const o = createOffer(SEED, 'guest', T0)!
    const c = changeOffer(o.id, 'host', { priceThb: 1200, start: '17:30', end: '20:30' }, T0 + 10_000)!
    expect(c).toMatchObject({ lastBy: 'host' })
    expect(last(c.steps)).toMatchObject({ kind: 'change', by: 'host', changed: ['time', 'price'] })
    const g = changeOffer(o.id, 'guest', { priceThb: 900 }, T0 + 20_000)!
    expect(g.lastBy).toBe('guest')
    acceptOffer(o.id, 'host', T0 + 30_000)
    expect(deltas).toEqual([HOLD(1000), BACK(100)])
  })

  it('nothing changed, a closed card, or a venue the local keeps fixed → refused, nothing moves', () => {
    const o = createOffer(SEED, 'guest', T0)!
    expect(changeOffer(o.id, 'guest', { priceThb: 1000 }, T0 + 1)).toBeNull()
    setAllowVenueChange('mint', false, T0)
    expect(reviseOffer(o.id, 'guest', { venue: 'Lumphini Park · main gate' }, T0 + 2)).toBeNull()
    declineOffer(o.id, 'host', T0 + 3)
    expect(changeOffer(o.id, 'guest', { priceThb: 1500 }, T0 + 4)).toBeNull()
    expect(deltas).toEqual([HOLD(1000), BACK(1000)])
  })
})
