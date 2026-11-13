import {
  currentViewerId,
  effectiveHoldStatus,
  effectiveMultiStatus,
  effectiveOfferStatus,
  partnerKey,
  type Booking,
  type MultiRequest,
  type Offer,
  type PlanStoreState,
} from '../../lib/planStore'

/**
 * KRING FIX1 · F2 — ONE money truth for every wallet surface (Wallet card strip, timeline, Local earnings, header Ready).
 *
 * Reads only the planStore records (the same ones the offer card, chat row, plan ticket and Plans read) and folds
 * them into what the WALLET says. Display only: no ledger call lives here.
 *
 *   booking     offered → held (on accept) → released (กริ๊ง! / QR) · or cancelled / no-show (refund)
 *   one row per booking (never one per hold call): the sheet hold, the "agreed price" top-up of the hold and any
 *   difference refunded on accept are all the SAME booking's money, so the timeline folds those wallet deltas into it.
 */

export type MoneyState = 'offered' | 'held' | 'released' | 'refunded'

export interface GuestMoneyRow {
  /** stable id (booking id, offer id or multi-request id) */
  id: string
  kind: 'booking' | 'offer' | 'multi'
  state: MoneyState
  /** who it is with (local name) or "3 locals" */
  who: string
  /** "Yaowarat street-food walk" when known */
  title?: string
  /** baht that left (or would leave) the wallet for this row */
  thb: number
  /** money came back (cancel / no reply / decline) */
  backThb?: number
  /** when the money first left the wallet (offer or multi-request created) */
  heldAt: number
  /** when it was released / came back */
  doneAt?: number
  /** the booking's own date + start ('2026-10-24', '14:00') */
  date?: string
  start?: string
  venue?: string
  /** the time window in which this row's wallet deltas happened (fallback for folding un-noted activity rows) */
  window: [number, number]
  /** ids planStore writes into its money notes for this row (booking, offer, multi-request) */
  refs: string[]
  /**
   * KRING FIX2 · Wei 2: the Book-a-local sheet holds first under `sheet-<local>` (ClinkGiftSheet), then the offer is
   * created on that hold. That ref is reused by the next booking with the same local, so it only folds into THIS row
   * inside the row's own time window.
   */
  sheetRefs?: string[]
}

export interface LocalMoneyRow {
  id: string
  state: 'held' | 'released' | 'refunded'
  guest: string
  title?: string
  /** what SHE receives (her share) */
  receiveThb: number
  at: number
  releasedAt?: number
  date: string
  start: string
  venue: string
  method?: 'bump' | 'qr'
}

const same = (a: string | undefined | null, b: string | undefined | null) => Boolean(a && b) && partnerKey(String(a)) === partnerKey(String(b))

function offerTitle(o: Pick<Offer, 'experienceTitle'> | Pick<Booking, 'experienceTitle'> | Pick<MultiRequest, 'experienceTitle'>): string | undefined {
  const t = (o.experienceTitle ?? '').trim()
  return t || undefined
}

/** The guest side of every booking / offer / multi-request this device paid for, newest first. */
export function guestMoneyRows(store: PlanStoreState, now = Date.now(), viewer = currentViewerId()): GuestMoneyRow[] {
  const rows: GuestMoneyRow[] = []
  const offers = store.offers ?? {}
  const bookings = Object.values(store.bookings ?? {})
  const bookedOffers = new Set<string>()

  for (const b of bookings) {
    // only bookings this viewer is the GUEST of (a local's own incoming bookings live in localMoneyRows)
    const mine = b.heldHere || same(b.guestId, viewer)
    if (!mine || same(b.localId, viewer)) continue
    bookedOffers.add(b.offerId)
    const o = offers[b.offerId]
    const multi = o?.multiId ? store.multi?.[o.multiId] : undefined
    const heldAt = Math.min(b.createdAt, o?.createdAt ?? b.createdAt, multi?.createdAt ?? b.createdAt)
    const state: MoneyState = b.status === 'released' ? 'released' : b.status === 'held' ? 'held' : 'refunded'
    rows.push({
      id: b.id,
      kind: 'booking',
      state,
      who: b.localName,
      title: offerTitle(b) ?? offerTitle(o ?? {}) ?? offerTitle(multi ?? {}),
      thb: b.heldThb,
      backThb: state === 'refunded' ? Math.max(0, b.refundThb ?? 0) : undefined,
      heldAt,
      doneAt: b.releasedAt ?? b.cancelledAt,
      date: b.terms.date,
      start: b.terms.start,
      venue: b.terms.venue,
      window: [heldAt - 5_000, b.createdAt + 20_000],
      refs: [b.id, b.offerId, o?.multiId ?? ''].filter(Boolean),
      sheetRefs: o?.holdKey ? [`sheet-${o.holdKey}`, `sheet-${partnerKey(o.localName || o.localId)}`] : undefined,
    })
  }

  // a guest offer that holds its own money (not the sheet's, not a multi child) and never became a booking
  for (const o of Object.values(offers)) {
    if (bookedOffers.has(o.id) || o.bookingId || o.multiId || o.holdKey || !o.heldHere) continue
    if (same(o.localId, viewer)) continue
    const st = effectiveOfferStatus(o, now)
    const held = o.steps[0]?.terms.priceThb ?? o.terms.priceThb
    if (!(held > 0)) continue
    const open = st === 'open'
    const closedAt = open ? undefined : o.updatedAt
    rows.push({
      id: o.id,
      kind: 'offer',
      state: open ? 'offered' : 'refunded',
      who: o.localName,
      title: offerTitle(o),
      thb: open ? o.heldThb || held : held,
      backThb: open ? undefined : held,
      heldAt: o.createdAt,
      doneAt: closedAt,
      date: o.terms.date,
      start: o.terms.start,
      venue: o.terms.venue,
      window: [o.createdAt - 5_000, (closedAt ?? o.createdAt) + 20_000],
      refs: [o.id],
    })
  }

  // a multi-request: ONE hold for several locals; a winner turns it into a booking (above)
  for (const m of Object.values(store.multi ?? {})) {
    if (!m.heldHere || m.status === 'won') continue
    const st = effectiveMultiStatus(m, now)
    const open = st === 'open'
    const n = m.localIds.length
    rows.push({
      id: m.id,
      kind: 'multi',
      state: open ? 'offered' : 'refunded',
      who: n === 1 ? (offers[m.offerIds[m.localIds[0]]]?.localName ?? m.localIds[0]) : `${n}`,
      title: offerTitle(m),
      thb: m.amountThb,
      backThb: open ? undefined : m.amountThb,
      heldAt: m.createdAt,
      doneAt: m.refundedAt ?? (open ? undefined : m.updatedAt),
      window: [m.createdAt - 5_000, (m.refundedAt ?? m.createdAt) + 20_000],
      refs: [m.id, ...Object.values(m.offerIds)],
    })
  }
  return rows.sort((a, b) => b.heldAt - a.heldAt)
}

/** Baht the wallet holds right now for meetings that haven't happened yet, and who they are with. */
export function guestHeldNow(store: PlanStoreState, now = Date.now(), viewer = currentViewerId()): { thb: number; names: string[]; rows: GuestMoneyRow[] } {
  const rows = guestMoneyRows(store, now, viewer).filter((r) => r.state === 'held' || r.state === 'offered')
  let thb = rows.reduce((a, r) => a + r.thb, 0)
  const names = rows.filter((r) => r.kind !== 'multi').map((r) => r.who)
  // a legacy sheet hold that is still waiting for its offer card (no booking yet)
  const covered = new Set(rows.map((r) => partnerKey(r.who)))
  for (const h of Object.values(store.guest ?? {})) {
    if (h.bookingId || h.releasedAt || h.refundedAt) continue
    const st = effectiveHoldStatus(h, now)
    if (st !== 'held' && st !== 'accepted') continue
    if (covered.has(partnerKey(h.hostName || h.hostId))) continue
    thb += h.offerThb
    names.push(h.hostName)
  }
  return { thb, names: Array.from(new Set(names.filter(Boolean))), rows }
}

/** The most recent release this guest made (for "Released ฿1,200 to Kwan · กริ๊ง!"). */
export function lastGuestRelease(store: PlanStoreState, now = Date.now(), viewer = currentViewerId(), withinMs = 18 * 3600_000): GuestMoneyRow | null {
  const r = guestMoneyRows(store, now, viewer).filter((x) => x.state === 'released' && x.doneAt && now - x.doneAt < withinMs)
  r.sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
  return r[0] ?? null
}

/** The local side: every booking where the signed-in user is the LOCAL. */
export function localMoneyRows(store: PlanStoreState, viewer = currentViewerId()): LocalMoneyRow[] {
  const out: LocalMoneyRow[] = []
  for (const b of Object.values(store.bookings ?? {})) {
    if (!same(b.localId, viewer) && !same(b.localName, viewer)) continue
    if (same(b.guestId, viewer)) continue
    out.push({
      id: b.id,
      state: b.status === 'released' ? 'released' : b.status === 'held' ? 'held' : 'refunded',
      guest: b.guestName,
      title: offerTitle(b),
      receiveThb: b.localReceiveThb,
      at: b.createdAt,
      releasedAt: b.releasedAt,
      date: b.terms.date,
      start: b.terms.start,
      venue: b.terms.venue,
      method: b.method,
    })
  }
  return out.sort((a, b) => (b.releasedAt ?? b.at) - (a.releasedAt ?? a.at))
}

/** Released to this local (her share), in baht — what lands in Ready the moment the phones go กริ๊ง!. */
export function localReleasedThb(store: PlanStoreState, viewer = currentViewerId()): number {
  return localMoneyRows(store, viewer)
    .filter((r) => r.state === 'released')
    .reduce((a, r) => a + r.receiveThb, 0)
}

/** "Fri 24 Oct · 14:00" / "ศ. 24 ต.ค. · 14:00 น." from a booking's Bangkok date + start. */
export function whenLabel(date: string | undefined, start: string | undefined, th: boolean): string {
  if (!date) return start ? (th ? `${start} น.` : start) : ''
  const [y, m, d] = date.split('-').map(Number)
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1, 12))
  let day = date
  try {
    day = dt.toLocaleDateString(th ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '')
  } catch {
    // keep the ISO date
  }
  return start ? `${day} · ${th ? `${start} น.` : start}` : day
}
