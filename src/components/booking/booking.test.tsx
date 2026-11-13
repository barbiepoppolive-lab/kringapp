import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetPlanStore,
  acceptOffer,
  bookingStartMs,
  checkInBooking,
  counterOffer,
  createOffer,
  getPlanStore,
  setAllowVenueChange,
  type Offer,
} from '../../lib/planStore'
import OfferCard from './OfferCard'
import SuggestChangeSheet from './SuggestChangeSheet'
import BumpCheckIn from './BumpCheckIn'
import PlanTicket from './PlanTicket'
import IncomingOffers from './IncomingOffers'
import { BubbleLine, StickerTray } from '../chat/ThaiChat'

type Delta = { paidDelta?: number; allowEscrowRefund?: boolean }
let deltas: Delta[] = []
const onDelta = (e: Event) => {
  const d = (e as CustomEvent<Delta & { accepted?: boolean }>).detail
  d.accepted = true
  deltas.push({ paidDelta: d.paidDelta, allowEscrowRefund: d.allowEscrowRefund })
}

const SEED = {
  experienceTitle: 'Yaowarat street-food walk',
  guestId: 'sarah',
  guestName: 'Sarah',
  localId: 'mint',
  localName: 'Mint',
  fromThb: 1200,
  terms: { priceThb: 1000, date: '2099-10-25', start: '17:00', end: '20:00', venue: 'Wat Mangkon MRT · exit 1', groupSize: 2 },
}

/** a booking that is happening now (Bangkok clock) — the bump / QR only release inside the booking window */
const nowTerms = () => {
  const d = new Date(Date.now() + 7 * 3600_000)
  const hh = (n: number) => String(n).padStart(2, '0')
  return { date: d.toISOString().slice(0, 10), start: `${hh(d.getUTCHours())}:${hh(d.getUTCMinutes())}`, end: `${hh((d.getUTCHours() + 2) % 24)}:${hh(d.getUTCMinutes())}` }
}

beforeEach(() => {
  __resetPlanStore()
  deltas = []
  window.addEventListener('chon:wallet-delta', onDelta)
})
afterEach(() => window.removeEventListener('chon:wallet-delta', onDelta))

describe('KRING K3 · booking surfaces', () => {
  it("OfferCard: the guest answers the local's counter — old price struck, Accept makes the booking and stamps the card", () => {
    const o = createOffer(SEED, 'guest')!
    counterOffer(o.id, 'host', 1200)
    const { rerender } = render(<OfferCard offer={getPlanStore().offers[o.id]} side="guest" th={false} />)
    const card = screen.getByTestId('kring-offer-card')
    expect(card).toHaveAttribute('data-state', 'open')
    expect(card).toHaveTextContent('Counter · Mint')
    expect(card.querySelector('s')).toHaveTextContent('฿1,000')
    fireEvent.click(screen.getByTestId('kring-offer-accept'))
    rerender(<OfferCard offer={getPlanStore().offers[o.id]} side="guest" th={false} />)
    expect(screen.getByTestId('kring-offer-card')).toHaveAttribute('data-state', 'accepted')
    expect(screen.getByTestId('kring-offer-booked')).toHaveTextContent('Booked · ฿1,200 held until you meet')
    expect(screen.getByTestId('kring-offer-stamp')).toBeInTheDocument()
    expect(deltas).toEqual([{ paidDelta: -100_000, allowEscrowRefund: undefined }, { paidDelta: -20_000, allowEscrowRefund: undefined }])
  })

  it('OfferCard: my own offer waits with a countdown ring and can be withdrawn (refund once)', () => {
    const o = createOffer(SEED, 'guest')!
    render(<OfferCard offer={o} side="guest" th={false} />)
    expect(screen.getByTestId('kring-offer-ring')).toBeInTheDocument()
    expect(screen.getByTestId('kring-offer-waiting')).toHaveTextContent('Waiting for Mint')
    fireEvent.click(screen.getByTestId('kring-offer-withdraw'))
    expect(getPlanStore().offers[o.id].status).toBe('withdrawn')
    expect(deltas[deltas.length - 1]).toEqual({ paidDelta: 100_000, allowEscrowRefund: true })
  })

  it('SuggestChangeSheet: the venue row is locked for guests when the local keeps a fixed meeting point', () => {
    setAllowVenueChange('mint', false)
    const o = createOffer(SEED, 'guest')!
    counterOffer(o.id, 'host', 1200)
    render(<SuggestChangeSheet open offer={getPlanStore().offers[o.id] as Offer} side="guest" th={false} onClose={() => {}} />)
    expect(screen.getByTestId('kring-change-venue-row')).toHaveTextContent('Mint keeps a fixed meeting point')
    expect(screen.queryByTestId('kring-change-venue-input')).toBeNull()
    fireEvent.click(screen.getByTestId('kring-change-price-minus'))
    fireEvent.click(screen.getByTestId('kring-change-start-plus'))
    fireEvent.click(screen.getByTestId('kring-change-send'))
    const after = getPlanStore().offers[o.id]
    expect(after.lastBy).toBe('guest')
    expect(after.terms).toMatchObject({ priceThb: 1150, start: '17:30', end: '20:30', venue: 'Wat Mangkon MRT · exit 1' })
    expect(after.steps[after.steps.length - 1].changed).toEqual(['time', 'price'])
  })

  it('BumpCheckIn: the venue-QR fallback releases the hold to the local once and fires the release event', async () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, ...nowTerms(), priceThb: 1200 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    const released: unknown[] = []
    const onRel = (e: Event) => released.push((e as CustomEvent).detail)
    window.addEventListener('kring:released', onRel)
    let cb: string | null = null
    render(<BumpCheckIn booking={b} side="guest" th={false} onClose={() => {}} onReleased={(_bk, how) => (cb = how)} />)
    fireEvent.click(screen.getByTestId('kring-bump-qr-open'))
    await act(async () => {
      fireEvent.click(screen.getByTestId('kring-bump-qr-scan'))
      await new Promise((r) => setTimeout(r, 1500))
    })
    window.removeEventListener('kring:released', onRel)
    expect(getPlanStore().bookings[b.id]).toMatchObject({ status: 'released', method: 'qr' })
    expect(cb).toBe('qr')
    expect(released).toHaveLength(1)
    expect(screen.getByTestId('kring-bump-released')).toHaveTextContent('฿1,200')
  })

  it('PlanTicket: private chip names the only two people; Cancel refunds per the rules', () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    render(<PlanTicket booking={b} side="guest" th={false} />)
    fireEvent.click(screen.getByTestId('kring-ticket-private'))
    expect(screen.getByTestId('kring-ticket-who')).toHaveTextContent('Mint ✓')
    expect(screen.getByTestId('kring-ticket-who')).toHaveTextContent('Their agency · totals only')
    fireEvent.click(screen.getByTestId('kring-ticket-cancel'))
    deltas = []
    fireEvent.click(screen.getByTestId('kring-ticket-cancel-confirm'))
    expect(getPlanStore().bookings[b.id].status).toBe('cancelled')
    expect(deltas).toEqual([{ paidDelta: 120_000, allowEscrowRefund: true }])
  })

  it("IncomingOffers (Local home): Accept on a remote guest's offer books it without touching the local's wallet", () => {
    createOffer({ ...SEED, localId: 'me', localName: 'Mint' }, 'guest', Date.now(), { hold: false, demoReply: false })
    render(<IncomingOffers localId="me" localName="Mint" th={false} fromThb={1200} online />)
    const card = screen.getByTestId('kring-local-offers')
    expect(card).toHaveTextContent('Their offer')
    expect(card).toHaveTextContent('฿1,000')
    fireEvent.click(screen.getByTestId('kring-incoming-accept'))
    expect(Object.values(getPlanStore().bookings)[0]).toMatchObject({ localId: 'me', heldThb: 1000, heldHere: false })
    expect(deltas).toEqual([])
    expect(screen.getAllByTestId('kring-plan-ticket').length).toBeGreaterThan(0)
  })

  it('Thai-slang chat: stickers carry the polite particle; long-press opens the reaction bar (no Kring emoji)', async () => {
    const sent: string[] = []
    render(<StickerTray open th={false} onSticker={(s) => sent.push(s.text)} onEmoji={() => {}} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('radio', { name: 'ครับ' }))
    fireEvent.click(screen.getByTestId('chat-sticker-thanks'))
    expect(sent).toEqual(['ขอบคุณครับ 🙏'])
    const reacted: string[] = []
    render(
      <BubbleLine mine={false} th={false} onReact={(r) => reacted.push(r)} onReply={() => {}}>
        <span>สวัสดีค่ะ</span>
      </BubbleLine>,
    )
    fireEvent.contextMenu(screen.getByText('สวัสดีค่ะ'))
    const bar = screen.getByTestId('chat-reaction-bar')
    expect(bar).toHaveTextContent('🙏😆555👍🥹😱👌')
    fireEvent.click(screen.getByRole('menuitem', { name: '555 (haha)' }))
    expect(reacted).toEqual(['555'])
  })
})

describe('KRING FIX1 · never silent, one gate, a helpful Local home', () => {
  it('OfferCard: Accept with too little cash explains why and opens Top up with the exact shortfall', () => {
    const o = createOffer(SEED, 'guest')!
    counterOffer(o.id, 'host', 1200)
    const reject = (e: Event) => {
      const d = (e as CustomEvent<{ paidDelta?: number; accepted?: boolean }>).detail
      if ((d.paidDelta ?? 0) < 0) d.accepted = false
    }
    const topups: Array<{ needThb?: number; reason?: string }> = []
    const onTopup = (e: Event) => topups.push((e as CustomEvent).detail)
    window.removeEventListener('chon:wallet-delta', onDelta)
    window.addEventListener('chon:wallet-delta', reject)
    window.addEventListener('chon:open-topup', onTopup)
    try {
      render(<OfferCard offer={getPlanStore().offers[o.id]} side="guest" th={false} />)
      fireEvent.click(screen.getByTestId('kring-offer-accept'))
      expect(screen.getByTestId('kring-offer-short')).toHaveTextContent('฿200 more cash needed')
      expect(screen.getByTestId('kring-offer-short')).toHaveTextContent("Promo can't pay bookings")
      expect(topups).toEqual([{ needThb: 200, reason: "Add ฿200 cash to accept Mint's ฿1,200 · promo can't pay bookings" }])
      expect(getPlanStore().offers[o.id].status).toBe('open')
    } finally {
      window.removeEventListener('chon:wallet-delta', reject)
      window.removeEventListener('chon:open-topup', onTopup)
      window.addEventListener('chon:wallet-delta', onDelta)
    }
  })

  it('PlanTicket: the bump stays closed until the booking window and says when and where it opens', () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, priceThb: 1200 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    render(<PlanTicket booking={b} side="guest" th={false} onBump={() => {}} />)
    const gate = screen.getByTestId('kring-release-gate')
    expect(gate).toHaveAttribute('data-state', 'locked')
    expect(gate).toHaveTextContent('at 16:30 at Wat Mangkon MRT · exit 1')
    expect(screen.queryByTestId('kring-ticket-bump')).toBeNull()
  })

  it('PlanTicket: inside the window the bump button is there', () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, ...nowTerms(), priceThb: 1200 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    render(<PlanTicket booking={b} side="guest" th={false} onBump={() => {}} />)
    expect(screen.getByTestId('kring-release-gate')).toHaveAttribute('data-state', 'open')
    expect(screen.getByTestId('kring-ticket-bump')).toBeInTheDocument()
  })

  it('PlanTicket: V4.3 Option A displays the unified booking amount on the host ticket without upfront 80%/฿960 fee math', () => {
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, ...nowTerms(), priceThb: 1200 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    const { rerender } = render(<PlanTicket booking={b} side="host" th={false} />)
    const ticket = screen.getByTestId('kring-plan-ticket')
    expect(ticket).toHaveTextContent('฿1,200')
    expect(ticket).toHaveTextContent('Released to you when your phones bump: Kring!')
    expect(ticket).not.toHaveTextContent('฿960')
    expect(ticket).not.toHaveTextContent('80%')
    rerender(<PlanTicket booking={b} side="host" th />)
    expect(screen.getByTestId('kring-plan-ticket')).toHaveTextContent('โอนให้คุณเมื่อโทรศัพท์ชนกัน: กริ๊ง!')
    expect(screen.getByTestId('kring-plan-ticket')).not.toHaveTextContent(': คุณได้ครึ่งหนึ่ง')
    const { rerender: rerenderOffer } = render(<OfferCard offer={getPlanStore().offers[o.id]} side="host" th={false} />)
    expect(screen.getByTestId('kring-offer-booked')).toHaveTextContent('✓ Booked · you get ฿1,200 at the bump')
    rerenderOffer(<OfferCard offer={getPlanStore().offers[o.id]} side="host" th />)
    expect(screen.getByTestId('kring-offer-booked')).toHaveTextContent('✓ จองแล้ว · คุณได้ ฿1,200 ตอนกริ๊ง')
    act(() => {
      checkInBooking(b.id, 'bump', bookingStartMs(b))
    })
    rerenderOffer(<OfferCard offer={getPlanStore().offers[o.id]} side="host" th={false} />)
    expect(screen.getByTestId('kring-offer-booked')).toHaveTextContent('✓ Released · ฿1,200 to your wallet · Kring!')
    rerenderOffer(<OfferCard offer={getPlanStore().offers[o.id]} side="host" th />)
    expect(screen.getByTestId('kring-offer-booked')).toHaveTextContent('✓ โอนแล้ว · ฿1,200 เข้ากระเป๋าคุณ · กริ๊ง!')
    expect(screen.getByTestId('kring-offer-booked')).not.toHaveTextContent('฿960')
  })

  it('IncomingOffers: a Live local with no requests gets tips and a clearly labelled example, never silence', () => {
    render(<IncomingOffers localId="me" localName="Mint" th={false} fromThb={1200} online />)
    expect(screen.getByTestId('kring-local-empty')).toHaveTextContent('No booking requests yet')
    fireEvent.click(screen.getByTestId('kring-local-example-btn'))
    const ex = screen.getByTestId('kring-incoming-example')
    expect(ex).toHaveAttribute('data-state', 'example')
    expect(ex).toHaveTextContent('Example')
    expect(ex).toHaveTextContent('Hair & nails at Nara Salon')
    expect(ex.querySelector('[data-testid="kring-incoming-accept"]')).toBeNull()
    expect(Object.keys(getPlanStore().offers)).toEqual([])
  })
})

/* ------------------------------------------------------------------ */
/* KRING FIX2 · F1                                                     */
/* ------------------------------------------------------------------ */
import { whoLine } from './parts'
import { thaiAgo } from '../chat/ChatsAndPlansTab'
import { signatureContext } from '../meet/ClinkGiftSheet'
import { openKringBooking, BOOK_PENDING_KEY } from './offerContext'

describe('KRING FIX2 · F1', () => {
  it('Wei 18–19: a sheet opened without context books the local’s own experience at its real price and length', () => {
    expect(signatureContext({ id: 'host-kwan', name: 'Kwan' }, 'en')).toMatchObject({ experienceId: 'street-food-walk', fromThb: 1200, hours: 3, venue: 'Yaowarat Rd, Chinatown' })
  })

  it('every chat "Book" asks the ONE Kring sheet (kring:book-local) and switches to Experiences', () => {
    const seen: Array<{ type: string; detail: unknown }> = []
    const on = (e: Event) => seen.push({ type: e.type, detail: (e as CustomEvent).detail })
    window.addEventListener('kring:book-local', on)
    window.addEventListener('chon:navigate', on)
    openKringBooking({ hostId: 'kwan', experienceId: 'street-food-walk' })
    window.removeEventListener('kring:book-local', on)
    window.removeEventListener('chon:navigate', on)
    expect(seen).toContainEqual({ type: 'chon:navigate', detail: { tab: 'meet' } })
    expect(seen).toContainEqual({ type: 'kring:book-local', detail: { hostId: 'host-kwan', experienceId: 'street-food-walk' } })
    expect(window.sessionStorage.getItem(BOOK_PENDING_KEY)).toContain('host-kwan')
    window.sessionStorage.removeItem(BOOK_PENDING_KEY)
  })

  it('Ploy: a local reads the party size, never "แค่ฉัน"; inbox times read in Thai', () => {
    expect(whoLine(1, true, 'host')).toBe('1 คน')
    expect(whoLine(1, true)).toBe('แค่ฉัน')
    expect(whoLine(3, false, 'host')).toBe('3 guests')
    expect(thaiAgo('14m')).toBe('14 นาที')
    expect(thaiAgo('2h')).toBe('2 ชม.')
    expect(thaiAgo('1d')).toBe('เมื่อวาน')
    expect(thaiAgo('now')).toBe('เมื่อกี้')
  })

  it('Ploy 22: a food walk’s venue suggestions are its own meeting places — never a spa', () => {
    const o = createOffer(
      { experienceId: 'street-food-walk', experienceTitle: 'Street-food walk', guestId: 'sarah', guestName: 'Sarah', localId: 'me-local', localName: 'Ploy', terms: { priceThb: 1000, date: '2099-10-25', start: '14:00', end: '17:00', venue: 'Wat Mangkon MRT · exit 1', groupSize: 1 } },
      'guest',
      Date.now(),
      { hold: false },
    )!
    render(<SuggestChangeSheet open offer={o} side="host" th={false} mode="counter" onClose={() => {}} />)
    const sheet = screen.getByTestId('kring-change-sheet')
    expect(sheet).toHaveTextContent('Yaowarat Rd, Chinatown')
    expect(sheet).toHaveTextContent('Chinatown Gate (Odeon Circle)')
    expect(sheet).not.toHaveTextContent(/Spa|ICONSIAM|Terminal 21/)
  })
})

describe('KRING FIX3 · F1', () => {
  it('Ploy 1: an expired request says so, with the money, on both sides', () => {
    const o = createOffer(
      { experienceId: 'street-food-walk', experienceTitle: 'Street-food walk', guestId: 'sarah', guestName: 'Sarah', localId: 'me-local', localName: 'Ploy', terms: { priceThb: 1000, date: '2099-10-25', start: '14:00', end: '17:00', venue: 'Yaowarat Rd', groupSize: 1 } },
      'guest',
      Date.now() - 11 * 60_000,
      { hold: false },
    )!
    const { unmount } = render(<OfferCard offer={o} side="host" th />)
    expect(screen.getByTestId('kring-offer-closed')).toHaveTextContent('หมดเวลา · ฿1,000 คืนให้แขกแล้ว · ไม่มีผลกับคุณ')
    unmount()
    render(<OfferCard offer={o} side="guest" th={false} />)
    expect(screen.getByTestId('kring-offer-closed')).toHaveTextContent('Expired · ฿1,000 back to you')
  })
})

describe('KRING VISUAL V2 · V3 · the ONE living booking card', () => {
  it('Book popup draft → Send request makes ONE record holding the trip fee; the dock card is the same record', async () => {
    const { default: BookingCard, BookingDock } = await import('./BookingCard')
    let sent: Offer | null = null
    render(
      <BookingCard
        side="guest"
        th={false}
        seed={{ experienceTitle: 'Street-food walk', hours: 3, guestId: 'sarah', guestName: 'Sarah', localId: 'mint', localName: 'Mint', terms: { date: '2099-10-25', start: '14:00', venue: 'Wat Mangkon MRT · exit 1', groupSize: 1, priceThb: 1200 } }}
        onSent={(o) => (sent = o)}
      />,
    )
    const card = screen.getByTestId('kring-offer-card')
    expect(card).toHaveAttribute('data-state', 'draft')
    expect(card).toHaveTextContent('Trip fee')
    expect(card).toHaveTextContent('History (0)')
    fireEvent.click(screen.getByTestId('kring-card-fee-minus'))
    fireEvent.click(screen.getByTestId('kring-card-fee-minus'))
    fireEvent.click(screen.getByTestId('kring-card-action'))
    expect(sent).not.toBeNull()
    const o = getPlanStore().offers[sent!.id]
    expect(o.terms).toMatchObject({ priceThb: 1000, start: '14:00', end: '17:00', groupSize: 1 })
    expect(deltas).toEqual([{ paidDelta: -100_000, allowEscrowRefund: undefined }])
    expect(Object.keys(getPlanStore().offers)).toHaveLength(1)
    render(<BookingDock offer={o} side="guest" th={false} open onToggle={() => {}} />)
    expect(screen.getByTestId('kring-card-slim')).toHaveTextContent('Waiting for Mint')
    expect(screen.getAllByTestId('kring-offer-card')[1]).toHaveAttribute('data-offer-id', o.id)
  })

  it('her change lands in place (old fee struck) → Accept · or change → Accepted · ฿1,200 held; one hold topped up once; one-line events', async () => {
    const { default: BookingCard, cardEvents } = await import('./BookingCard')
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, groupSize: 1 } }, 'guest')!
    const { rerender } = render(<BookingCard offer={o} side="host" th={false} />)
    // the local edits the same card: +฿200, later start → "Send change"
    fireEvent.click(screen.getByTestId('kring-card-fee-plus'))
    fireEvent.click(screen.getByTestId('kring-card-fee-plus'))
    fireEvent.click(screen.getByTestId('kring-card-time-plus'))
    expect(screen.getByTestId('kring-card-action')).toHaveTextContent('Send change')
    fireEvent.click(screen.getByTestId('kring-card-action'))
    const after = getPlanStore().offers[o.id]
    expect(after).toMatchObject({ lastBy: 'host', terms: { priceThb: 1200, start: '17:30', end: '20:30' } })
    rerender(<BookingCard offer={after} side="guest" th={false} />)
    expect(screen.getByTestId('kring-card-status')).toHaveTextContent('Your turn')
    expect(screen.getByTestId('kring-card-fee').querySelector('s')).toHaveTextContent('฿1,000')
    expect(screen.getByTestId('kring-card-fee').className).toMatch(/is-changed/)
    fireEvent.click(screen.getByTestId('kring-offer-accept'))
    const done = getPlanStore().offers[o.id]
    expect(done.status).toBe('accepted')
    expect(screen.getByTestId('kring-card-action')).toHaveTextContent('Accepted · ฿1,200 held')
    expect(deltas).toEqual([{ paidDelta: -100_000, allowEscrowRefund: undefined }, { paidDelta: -20_000, allowEscrowRefund: undefined }])
    const ev = cardEvents(done, 'guest', false)
    expect(ev).toHaveLength(3)
    fireEvent.click(screen.getByTestId('kring-card-history'))
    expect(screen.getByTestId('kring-offer-card')).toHaveTextContent('Mint · changed ฿1,200 · 17:30')
  })

  it('Thai: ค่าทริป, never ทิป; the gold action reads ส่งคำขอ', async () => {
    const { default: BookingCard } = await import('./BookingCard')
    render(<BookingCard side="guest" th seed={{ experienceTitle: 'เดินกินเยาวราช', hours: 3, localId: 'mint', localName: 'Mint', terms: { date: '2099-10-25', start: '14:00', venue: 'เยาวราช', groupSize: 1, priceThb: 1200 } }} />)
    const card = screen.getByTestId('kring-offer-card')
    expect(card).toHaveTextContent('ค่าทริป')
    expect(card).not.toHaveTextContent('ทิป')
    expect(screen.getByTestId('kring-card-action')).toHaveTextContent('ส่งคำขอ')
  })
})

describe('KRING T3 · W3 — group booking, mutual reviews, no percentages', () => {
  it('ไปกับเพื่อน · 3 คน: the split view shows ฿400 each, Send request still places ONE hold on the booker for ฿1,200', async () => {
    const { default: BookingCard } = await import('./BookingCard')
    let sent: Offer | null = null
    render(
      <BookingCard
        side="guest"
        th
        seed={{ experienceTitle: 'ทริปเกาะล้าน', hours: 6, localId: 'ton', localName: 'Ton', terms: { date: '2099-10-25', start: '09:00', venue: 'Bali Hai Pier', groupSize: 1, priceThb: 1200 } }}
        onSent={(o) => (sent = o)}
      />,
    )
    expect(screen.queryByTestId('kring-card-split')).toBeNull()
    fireEvent.click(screen.getByTestId('kring-card-friends'))
    fireEvent.click(screen.getByTestId('kring-card-group-plus'))
    expect(screen.getByTestId('kring-card-friends')).toHaveTextContent('ไปกับเพื่อน · 3 คน')
    expect(screen.getByTestId('kring-card-split')).toHaveTextContent('หารกัน 3 คน · ฿400 / คน')
    // the fee never moves on its own when friends join (no hidden "+40 %")
    expect(screen.getByTestId('kring-card-fee')).toHaveTextContent('฿1,200')
    const card = screen.getByTestId('kring-offer-card')
    expect(card.textContent).not.toMatch(/\d\s?%/)
    fireEvent.click(screen.getByTestId('kring-card-action'))
    const o = getPlanStore().offers[sent!.id]
    expect(o.terms).toMatchObject({ groupSize: 3, priceThb: 1200 })
    expect(deltas).toEqual([{ paidDelta: -120_000, allowEscrowRefund: undefined }])
  })

  it('English split reads "Split 3 ways · ฿400 each"; the local reads "3 guests", no split, no %', async () => {
    const { default: BookingCard, groupLabel, splitLabel } = await import('./BookingCard')
    expect(splitLabel(1200, 3, false)).toBe('Split 3 ways · ฿400 each')
    expect(groupLabel(2, false)).toBe('With friends · 2')
    expect(groupLabel(1, false)).toBe('Just me')
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, groupSize: 3, priceThb: 1200 } }, 'guest')!
    render(<BookingCard offer={o} side="host" th={false} />)
    expect(screen.getByTestId('kring-card-group')).toHaveTextContent('3 guests')
    expect(screen.queryByTestId('kring-card-split')).toBeNull()
    expect(screen.getByTestId('kring-offer-card').textContent).not.toMatch(/\d\s?%/)
  })

  it('mutual reviews after the bump: both cards offer "Review …"; the other side shows only after you post; money untouched', async () => {
    const { default: BookingCard } = await import('./BookingCard')
    const { reviewBooking } = await import('../../lib/planStore')
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, ...nowTerms(), priceThb: 1200, groupSize: 1 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    expect(checkInBooking(b.id, 'bump', bookingStartMs(b) + 10)?.status).toBe('released')
    deltas = []
    let asked: string | null = null
    const { rerender } = render(<BookingCard offer={getPlanStore().offers[o.id]} side="host" th={false} onReview={(x) => (asked = x.id)} />)
    expect(screen.getByTestId('kring-card-review')).toHaveTextContent('Review Sarah')
    fireEvent.click(screen.getByTestId('kring-card-review-open'))
    expect(asked).toBe(b.id)
    act(() => {
      reviewBooking(b.id, { stars: 5, tags: ['Kind'], text: '' }, Date.now(), 'host')
    })
    rerender(<BookingCard offer={getPlanStore().offers[o.id]} side="host" th={false} onReview={() => {}} />)
    expect(screen.getByTestId('kring-card-review')).toHaveTextContent('You rated Sarah')
    expect(screen.queryByTestId('kring-card-review-theirs')).toBeNull()
    rerender(<BookingCard offer={getPlanStore().offers[o.id]} side="guest" th={false} onReview={() => {}} />)
    expect(screen.getByTestId('kring-card-review')).toHaveTextContent('Review Mint')
    // the guest has not posted → Mint's stars stay hidden from her
    expect(screen.queryByTestId('kring-card-review-theirs')).toBeNull()
    act(() => {
      reviewBooking(b.id, { stars: 4, tags: [], text: '' }, Date.now())
    })
    rerender(<BookingCard offer={getPlanStore().offers[o.id]} side="guest" th={false} onReview={() => {}} />)
    expect(screen.getByTestId('kring-card-review-theirs')).toHaveTextContent('Mint rated you')
    expect(deltas).toEqual([])
  })

  it('ReviewSheet (local side) rates the GUEST with guest tags and writes hostReview', async () => {
    const { default: ReviewSheet } = await import('./ReviewSheet')
    const o = createOffer({ ...SEED, terms: { ...SEED.terms, ...nowTerms(), priceThb: 1200, groupSize: 1 } }, 'guest')!
    const b = acceptOffer(o.id, 'host')!
    checkInBooking(b.id, 'bump', bookingStartMs(b) + 10)
    render(<ReviewSheet open booking={getPlanStore().bookings[b.id]} side="host" th={false} onClose={() => {}} />)
    const sheet = screen.getByTestId('kring-review-sheet')
    expect(sheet).toHaveTextContent('How was it with Sarah?')
    expect(sheet).toHaveTextContent('Respectful')
    fireEvent.click(screen.getByTestId('kring-review-star-5'))
    fireEvent.click(screen.getByTestId('kring-review-post'))
    expect(getPlanStore().bookings[b.id].hostReview?.stars).toBe(5)
    expect(getPlanStore().bookings[b.id].review).toBeUndefined()
  })
})
