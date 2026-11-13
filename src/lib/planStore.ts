import { useSyncExternalStore } from 'react'
import { dispatchInternalWalletDelta } from './walletBus'
import { NIGHT_STORE_PREFIX, nightGet, nightOf, nightSet } from './demoState'

/**
 * ONE source of truth for plans (host requests + guest treats + the shared plan clock).
 *
 * Host side  — every request a host handles in Host home (accept / counter / decline) lands here, so the Chats row,
 *              the chat room's plan bar and the Plans tab all read the same venue, time, amount and state.
 * Guest side — a Clink that is HELD / CANCELLED / EXPIRED (`chon:offer-status`) is recorded with its 15-minute reply
 *              window, so the Chats preview and the Plans ticket speak the same language as the receipt.
 *              Once the guest confirms the plan the hold is `accepted` (it never "times out" after that).
 * Both sides — `meet[key]` is the plan's clock (start · agreed length). KRING FIX2: there are no paid hourly
 *              extensions — a time change goes through the offer card's "Suggest a change" (time), agreed by both.
 *
 * ROUND5 persistence: in a DEMO session everything here lives in localStorage for the night (06:00 → 06:00 Bangkok,
 * `nightStore` from demoState), so closing and reopening the app — even in a new tab — keeps the plans, the holds,
 * and the received-gift bubbles. Real sessions keep their per-tab sessionStorage, as before.
 *
 * ROUND5 demo counterpart: in a demo the other side answers so every flow can finish —
 *   · a held Clink whose reply window ran out while the Clink sheet was closed is refunded once, through the same
 *     escrow-refund call the sheet and the plan card's Cancel use, so the wallet and the plan always agree.
 *
 */

export const PLAN_STORE_KEY = 'chon_plan_store_v1'
/** nightStore key (localStorage `chon_night_v1:plans`) for demo sessions */
export const PLAN_NIGHT_KEY = 'plans'
/** Same window as the Clink receipt countdown (ClinkGiftSheet `ringCountdownSec` = 900). */
export const REPLY_WINDOW_MS = 15 * 60 * 1000

export type HostPlanState = 'pending' | 'confirmed' | 'countered' | 'declined'

export interface HostPlan {
  /** request id (Host home), e.g. 'alex' */
  id: string
  guest: string
  flag?: string
  venue: string
  /** 24 h clock, e.g. '20:00' */
  time: string
  /** what the guest put in the envelope */
  offerThb: number
  /** what the host receives after the platform share */
  receiveThb: number
  noShowThb: number
  state: HostPlanState
  counterThb?: number
  /** when the request first reached the host (keeps the reply countdown honest across reloads) */
  receivedAt: number
  updatedAt: number
}

export type GuestHoldStatus = 'held' | 'accepted' | 'cancelled' | 'expired'

export interface GuestHold {
  /** chat partner id, e.g. 'mint' (Meet ids lose their 'host-' prefix) */
  hostId: string
  hostName: string
  offerThb: number
  status: GuestHoldStatus
  heldAt: number
  replyBy: number
  updatedAt: number
  /** the moment the held amount went back to the wallet (expiry / cancel) — a refund happens at most once */
  refundedAt?: number
  /** the Clink sheet that placed the hold has closed (from then on only this store can refund an expiry) */
  sheetGone?: boolean
  /** KRING: the two met (กริ๊ง! bump / venue QR) and the held amount went to the local — it can never come back */
  releasedAt?: number
  /** KRING: the booking this hold pays for */
  bookingId?: string
  /** KRING FIX2: the money-note ref the sheet wrote on this hold (= the offer id riding on it) — refunds carry it too */
  ref?: string
}

export type PlanSide = 'guest' | 'host'

/**
 * The plan's clock, shared by BOTH sides of one meet (Chats guest view, Chats host view, Host home).
 * `key` is the host-side request id (the guest, e.g. 'alex'); the guest's chat row maps onto it.
 */
export interface MeetPlan {
  key: string
  guest: string
  host: string
  /** 24 h start, e.g. '20:00' */
  start: string
  /** agreed length */
  baseMin: number
  /** legacy (paid hourly extensions were removed in KRING FIX2): always 0 for new plans; old saved plans may carry it */
  extendedMin: number
  /** the plan's price (what the guest put in) */
  priceThb?: number
  /** legacy extension amounts (KRING FIX2: nothing writes these any more; kept so old saved nights still refund) */
  extraThb?: number
  extraHeldThb?: number
  extraRefundedAt?: number
  /** the guest confirmed the plan in the chat room (restores the confirmed state after a reload; nothing is re-charged) */
  guestConfirmedAt?: number
  /** when the clock was created (the ring drains from here toward the start) */
  createdAt?: number
  updatedAt: number
}

/** A gift the other person sent (host view) — a gold bubble that stays in the thread for the night. */
export interface ReceivedGift {
  id: string
  emoji: string
  name: string
  nameTh: string
  thb: number
  at: number
  /** When true, funded by non-withdrawable Promo Coins (boosts Host Spotlight rank; ฿0 cash payout liability). */
  promoFunded?: boolean
}

/** A plan is two hours unless the booking says otherwise. */
export const DEFAULT_PLAN_MIN = 120
/** The lowest price a host can set (and the fallback when a plan has no price on record). */
export const PLAN_PRICE_FLOOR = 300
/** The host keeps 80 % of what the guest puts in. */
export const HOST_SHARE = 0.8

export interface PlanStoreState {
  host: Record<string, HostPlan>
  guest: Record<string, GuestHold>
  /** one clock per meet, shared by both sides */
  meet: Record<string, MeetPlan>
  /** received-gift bubbles per guest key (host view) — they survive a reload for the night */
  gifts: Record<string, ReceivedGift[]>
  /** one-shot UI moments already played (e.g. 'gift:alex') */
  seen: Record<string, number>
  /** KRING · offer cards in chat (offer → counter / suggest a change → accept) */
  offers: Record<string, Offer>
  /** KRING · one hold, several pinned locals asked at once (first to accept gets it) */
  multi: Record<string, MultiRequest>
  /** KRING · accepted offers = bookings (private: only the guest and the local can read them) */
  bookings: Record<string, Booking>
  /** KRING · per-local settings chosen at go-live (e.g. "Guests may suggest another venue") */
  hostSettings: Record<string, HostSettings>
}

const empty = (): PlanStoreState => ({ host: {}, guest: {}, meet: {}, gifts: {}, seen: {}, offers: {}, multi: {}, bookings: {}, hostSettings: {} })

function normalise(parsed: Partial<PlanStoreState> | null | undefined): PlanStoreState {
  const p = parsed && typeof parsed === 'object' ? parsed : {}
  const obj = <T>(v: unknown): Record<string, T> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, T>) : {})
  return {
    host: obj(p.host),
    guest: obj(p.guest),
    meet: obj(p.meet),
    gifts: obj(p.gifts),
    seen: obj(p.seen),
    offers: obj(p.offers),
    multi: obj(p.multi),
    bookings: obj(p.bookings),
    hostSettings: obj(p.hostSettings),
  }
}

/* ------------------------------------------------------------------ */
/* persistence: demo → nightStore (localStorage), real → sessionStorage */
/* ------------------------------------------------------------------ */

const AUTH_KEY = 'chon_auth_session_v1'

/** The signed-in session as stored by AuthContext (read lazily: the store loads before React mounts). */
function readSession(): { isDemoMode?: boolean; role?: string } | null {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as { isDemoMode?: boolean; role?: string }) : null
  } catch {
    return null
  }
}

export function isDemoSession(): boolean {
  if (typeof window === 'undefined') return false
  return readSession()?.isDemoMode === true
}

function readSessionStore(): PlanStoreState | null {
  try {
    const raw = window.sessionStorage.getItem(PLAN_STORE_KEY)
    return raw ? normalise(JSON.parse(raw) as Partial<PlanStoreState>) : null
  } catch {
    return null
  }
}

function load(): PlanStoreState {
  if (typeof window === 'undefined') return empty()
  if (isDemoSession()) {
    const night = nightGet<Partial<PlanStoreState> | null>(PLAN_NIGHT_KEY, null)
    if (night) return normalise(night)
    // first load after the move: keep what this tab already had tonight
    return readSessionStore() ?? empty()
  }
  return readSessionStore() ?? empty()
}

let state: PlanStoreState = load()
/** the storage the current state came from (a sign-in after the first load can switch real ↔ demo) */
let loadedDemo = typeof window !== 'undefined' && isDemoSession()
const listeners = new Set<() => void>()

/** demo ↔ real switched since the last load (e.g. "Try the demo" after the store first loaded signed-out) */
function modeChanged(): boolean {
  return typeof window !== 'undefined' && isDemoSession() !== loadedDemo
}

function mergeStores(base: PlanStoreState, top: PlanStoreState): PlanStoreState {
  return {
    host: { ...base.host, ...top.host },
    guest: { ...base.guest, ...top.guest },
    meet: { ...base.meet, ...top.meet },
    gifts: { ...base.gifts, ...top.gifts },
    seen: { ...base.seen, ...top.seen },
    offers: { ...base.offers, ...top.offers },
    multi: { ...base.multi, ...top.multi },
    bookings: { ...base.bookings, ...top.bookings },
    hostSettings: { ...base.hostSettings, ...top.hostSettings },
  }
}

function persist(next: PlanStoreState) {
  if (typeof window === 'undefined') return
  if (isDemoSession()) {
    nightSet(PLAN_NIGHT_KEY, next)
    return
  }
  try {
    window.sessionStorage.setItem(PLAN_STORE_KEY, JSON.stringify(next))
  } catch {
    // storage blocked (private mode): the session still works in memory
  }
}

function commit(next: PlanStoreState) {
  if (modeChanged()) {
    // never let a signed-out tab overwrite tonight's saved plans: what was saved is the base, this change goes on top
    loadedDemo = isDemoSession()
    next = mergeStores(load(), next)
  }
  state = next
  persist(next)
  listeners.forEach((fn) => fn())
  scheduleDemo()
}

export function getPlanStore(): PlanStoreState {
  return state
}

export function subscribePlanStore(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function usePlanStore(): PlanStoreState {
  return useSyncExternalStore(subscribePlanStore, getPlanStore, getPlanStore)
}

/** Re-read storage (another tab wrote, or the session changed demo ↔ real). */
export function rehydratePlanStore() {
  loadedDemo = isDemoSession()
  state = load()
  listeners.forEach((fn) => fn())
  scheduleDemo()
}

/** Call on mount of a plan surface: re-reads storage when the session switched real ↔ demo since the last load. */
export function syncPlanStoreMode() {
  if (modeChanged()) rehydratePlanStore()
}

/** 'host-mint' / 'Mint' → 'mint' */
export function partnerKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/^host-/, '').split(/[\s,]/)[0] ?? ''
}

/* ------------------------------------------------------------------ */
/* host                                                                */
/* ------------------------------------------------------------------ */

export interface HostRequestSeed {
  id: string
  guest: string
  flag?: string
  venue: string
  time: string
  offerThb: number
  receiveThb: number
  noShowThb: number
  minutesAgo: number
}

/** Registers incoming requests once (first sighting fixes `receivedAt`). Handled ones keep their state. */
export function seedHostRequests(seeds: HostRequestSeed[], now = Date.now()) {
  let changed = false
  const host = { ...state.host }
  for (const s of seeds) {
    if (host[s.id]) continue
    host[s.id] = {
      id: s.id,
      guest: s.guest,
      flag: s.flag,
      venue: s.venue,
      time: s.time,
      offerThb: s.offerThb,
      receiveThb: s.receiveThb,
      noShowThb: s.noShowThb,
      state: 'pending',
      receivedAt: now - s.minutesAgo * 60_000,
      updatedAt: now,
    }
    changed = true
  }
  if (changed) commit({ ...state, host })
}

export function hostAct(
  id: string,
  action: 'accepted' | 'countered' | 'declined',
  extra: { venue?: string; time?: string; counterThb?: number } = {},
  now = Date.now(),
) {
  const cur = state.host[id]
  if (!cur) return
  const next: HostPlan = {
    ...cur,
    venue: extra.venue ?? cur.venue,
    time: extra.time ?? cur.time,
    state: action === 'accepted' ? 'confirmed' : action === 'countered' ? 'countered' : 'declined',
    counterThb: action === 'countered' ? extra.counterThb ?? cur.counterThb : cur.counterThb,
    updatedAt: now,
  }
  commit({ ...state, host: { ...state.host, [id]: next } })
  // an accepted request gets the shared plan clock
  if (next.state === 'confirmed') ensureMeetPlan({ key: id, guest: next.guest, host: '', start: next.time, priceThb: next.counterThb ?? next.offerThb }, now)
}

/** What the host receives for a plan (legacy accepted extensions on old saved nights included). */
export function hostPlanTotalThb(p: Pick<HostPlan, 'receiveThb'>, m: Pick<MeetPlan, 'extraThb'> | undefined): number {
  return p.receiveThb + hostShareThb(m?.extraThb ?? 0)
}

/* ------------------------------------------------------------------ */
/* guest                                                               */
/* ------------------------------------------------------------------ */

export function recordGuestHold(hostIdOrName: string, hostName: string, offerThb: number, now = Date.now(), ref?: string) {
  const key = partnerKey(hostIdOrName || hostName)
  if (!key) return
  const hold: GuestHold = { hostId: key, hostName, offerThb, status: 'held', heldAt: now, replyBy: now + REPLY_WINDOW_MS, updatedAt: now, ...(ref ? { ref } : {}) }
  commit({ ...state, guest: { ...state.guest, [key]: hold } })
}

export function releaseGuestHold(hostIdOrName: string, status: 'cancelled' | 'expired', now = Date.now()) {
  const key = partnerKey(hostIdOrName)
  const cur = state.guest[key]
  if (!cur || cur.status !== 'held' || cur.releasedAt) return
  // the sheet / the plan card that sent this event also moved the money back
  commit({ ...state, guest: { ...state.guest, [key]: { ...cur, status, updatedAt: now, refundedAt: now } } })
  // KRING: the offer card riding on this hold closes with it (the sheet already moved the money back)
  closeAdoptedOffers(key, status === 'cancelled' ? 'withdrawn' : 'expired', now)
  // a legacy extension held on top of it comes back with it (same refund call)
  releaseExtrasForHold(key, now)
}

/** Every plan clock that sits on this guest hold gives its held extension back (once). */
function releaseExtrasForHold(holdKey: string, now = Date.now()): number {
  let back = 0
  for (const m of Object.values(state.meet)) {
    if (m.key === holdKey || partnerKey(m.host || '') === holdKey) back += releaseExtensionHold(m.key, now)
  }
  return back
}

/** The guest confirmed the plan: the held treat now waits for the meet (it can no longer time out). */
export function acceptGuestHold(hostIdOrName: string, now = Date.now()) {
  const key = partnerKey(hostIdOrName)
  const cur = state.guest[key]
  if (!cur || cur.status !== 'held') return
  commit({ ...state, guest: { ...state.guest, [key]: { ...cur, status: 'accepted', updatedAt: now } } })
}

/** A held treat whose reply window ran out reads as expired (the refund happens once, in `sweepHolds`). */
export function effectiveHoldStatus(h: GuestHold, now = Date.now()): GuestHoldStatus {
  return h.status === 'held' && now >= h.replyBy ? 'expired' : h.status
}

export function msLeft(h: GuestHold, now = Date.now()): number {
  return Math.max(0, h.replyBy - now)
}

export function mmss(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/* ------------------------------------------------------------------ */
/* the shared plan clock                                               */
/* ------------------------------------------------------------------ */

/** '8 PM' | '7:30 PM' | '20:00' | '20:00 น.' → '20:00' (null when it isn't a clock time). */
export function toClock24(t: string): string | null {
  const s = t.trim().replace(/\s*น\.?$/, '')
  const m12 = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i)
  if (m12) {
    let h = Number(m12[1]) % 12
    if (/pm/i.test(m12[3])) h += 12
    return `${String(h).padStart(2, '0')}:${m12[2] ?? '00'}`
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/)
  return m24 ? `${String(Number(m24[1]) % 24).padStart(2, '0')}:${m24[2]}` : null
}

/** '20:00' + 150 → '22:30' (wraps past midnight). */
export function addMinutes(clock24: string, minutes: number): string {
  const [h, m] = clock24.split(':').map(Number)
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** The agreed end of the plan: start + its length. */
export function planEnd(p: Pick<MeetPlan, 'start' | 'baseMin' | 'extendedMin'>): string {
  return addMinutes(p.start, p.baseMin + p.extendedMin)
}

/**
 * The moment a Bangkok clock time happens TONIGHT (a night runs 06:00 → 06:00 Bangkok, like nightStore):
 * '20:00' → today 20:00 Bangkok; '01:30' → the early hours that still belong to tonight.
 */
export function clockAt(clock24: string, now = Date.now()): number {
  const [y, mo, d] = nightOf(new Date(now)).split('-').map(Number)
  const [h, m] = clock24.split(':').map(Number)
  const bkkMidnightUtc = Date.UTC(y, mo - 1, d) - 7 * 3600_000
  return bkkMidnightUtc + ((h < 6 ? h + 24 : h) * 60 + m) * 60_000
}

/** Where the plan stands in time: before the start, during, or over. */
export function planPhase(p: MeetPlan, now = Date.now()): { phase: 'before' | 'during' | 'after'; startMs: number; endMs: number } {
  const startMs = clockAt(p.start, now)
  const endMs = startMs + (p.baseMin + p.extendedMin) * 60_000
  return { phase: now < startMs ? 'before' : now < endMs ? 'during' : 'after', startMs, endMs }
}

/** The host's 80 % of a guest-side amount. */
export function hostShareThb(thb: number): number {
  return Math.round(Math.max(0, thb) * HOST_SHARE)
}

export interface MeetPlanSeed {
  key: string
  guest: string
  host: string
  /** any clock format ('8 PM', '20:00') */
  start: string
  /** the plan's price (guest side) */
  priceThb?: number
}

/** Creates the shared clock for a meet once; later calls only refresh names / start / price (never the agreed length). */
export function ensureMeetPlan(seed: MeetPlanSeed, now = Date.now()): MeetPlan | null {
  const key = partnerKey(seed.key)
  const start = toClock24(seed.start)
  if (!key || !start) return null
  const cur = state.meet[key]
  const price = typeof seed.priceThb === 'number' && seed.priceThb > 0 ? Math.round(seed.priceThb) : undefined
  if (
    cur &&
    cur.start === start &&
    (!seed.guest || cur.guest === seed.guest) &&
    (!seed.host || cur.host === seed.host) &&
    (price === undefined || cur.priceThb === price)
  )
    return cur
  const next: MeetPlan = cur
    ? { ...cur, guest: seed.guest || cur.guest, host: seed.host || cur.host, start, priceThb: price ?? cur.priceThb, updatedAt: now }
    : { key, guest: seed.guest, host: seed.host, start, baseMin: DEFAULT_PLAN_MIN, extendedMin: 0, priceThb: price, createdAt: now, updatedAt: now }
  commit({ ...state, meet: { ...state.meet, [key]: next } })
  return next
}

/** The guest tapped Confirm in the chat room (so a reload shows the plan as confirmed without charging again). */
export function markGuestConfirmed(seed: MeetPlanSeed, now = Date.now()) {
  const p = ensureMeetPlan(seed, now)
  if (!p || p.guestConfirmedAt) return
  commit({ ...state, meet: { ...state.meet, [p.key]: { ...p, guestConfirmedAt: now, updatedAt: now } } })
}

/** The guest's live Clink hold behind a plan clock (the meet key is the hold key, or the host's name maps onto it). */
export function liveGuestHoldForMeet(m: Pick<MeetPlan, 'key' | 'host'>, now = Date.now()): GuestHold | null {
  for (const k of [m.key, partnerKey(m.host || '')]) {
    const h = k ? state.guest[k] : undefined
    if (h && ['held', 'accepted'].includes(effectiveHoldStatus(h, now))) return h
  }
  return null
}

/** The extra (extension) amount this wallet holds for a plan right now — 0 once it went back. */
export function heldExtraThb(key: string): number {
  const m = state.meet[partnerKey(key)]
  return m && !m.extraRefundedAt ? Math.max(0, Math.round(m.extraHeldThb ?? 0)) : 0
}

/** Everything this wallet holds for one plan: the Clink + any accepted extension (0 once the treat went back). */
export function guestHeldTotalThb(key: string, now = Date.now()): number {
  const k = partnerKey(key)
  const h = state.guest[k]
  const base = h && ['held', 'accepted'].includes(effectiveHoldStatus(h, now)) ? h.offerThb : 0
  return base + heldExtraThb(k)
}

/**
 * The plan ended without a meet (cancel / no reply / no meet): the held extension amount goes back through the SAME
 * refund call the Clink Cancel uses. The record flips first, so a second call can never refund twice. Returns ฿ back.
 */
export function releaseExtensionHold(key: string, now = Date.now()): number {
  const k = partnerKey(key)
  const m = state.meet[k]
  const amount = heldExtraThb(k)
  if (!m || amount <= 0) return 0
  // met already (กริ๊ง! bump): the extra went to the local with the booking — nothing comes back
  if (state.guest[k]?.releasedAt || (m.host && state.guest[partnerKey(m.host)]?.releasedAt)) return 0
  commit({ ...state, meet: { ...state.meet, [k]: { ...m, extraRefundedAt: now, updatedAt: now } } })
  dispatchInternalWalletDelta({ paidDelta: amount * 100, allowEscrowRefund: true })
  return amount
}

/** The Clink was confirmed but the two never met: the whole treat (Clink + extensions) comes back. */
export function releaseNoMeet(hostIdOrName: string, now = Date.now()): number {
  const key = partnerKey(hostIdOrName)
  const cur = state.guest[key]
  let back = 0
  if (cur && (cur.status === 'held' || cur.status === 'accepted') && !cur.refundedAt && !cur.releasedAt) {
    commit({ ...state, guest: { ...state.guest, [key]: { ...cur, status: 'cancelled', updatedAt: now, refundedAt: now } } })
    refundThb(cur.offerThb, kringMoneyNote('refund', cur.hostName, holdRef(cur)))
    back += cur.offerThb
  }
  return back + releaseExtrasForHold(key, now)
}

/* ================================================================== */
/* KRING · offers, suggest-a-change, multi-request, bookings (K3)      */
/* ================================================================== */
/*
 * Offer card (chat):  createOffer → counterOffer / suggestChange (time · venue · price) → acceptOffer → Booking.
 *   · `lastBy` is the side whose terms are on the table; only the OTHER side can accept, counter or suggest a change.
 *   · Money (no new ledger logic): a guest's offer HOLDS its price with the same call the Clink send used
 *     (`dispatchInternalWalletDelta({ paidDelta: −coins, hideGlobal: true })`). On accept the hold is settled to the
 *     AGREED amount: more → the same hold call for the difference, less → the same refund call
 *     (`{ paidDelta: +coins, allowEscrowRefund: true }`) for the difference. Decline / withdraw / no reply → the
 *     whole hold comes back once. Money only moves on the device that placed the hold (`heldHere`) or when the guest
 *     accepts on her own device — a local's phone never touches its own wallet for a guest's hold.
 * Multi-request:      requestMany(experienceId, localIds, amount) → ONE hold, one child offer per local, 10-minute
 *   window each. The first local to accept (or the first counter the guest accepts) gets it; the others are
 *   released automatically ("this one was taken" — it never counts against their reply rate). Nobody accepts →
 *   the one hold comes back once.
 * Host setting:       setAllowVenueChange(localId, yes/no) — "Guests may suggest another venue" (default Yes). A
 *   guest's venue suggestion is refused when the local said No.
 * Private bookings:   a Booking is readable only by its guest and its local (`getBookingFor`, `bookingsFor`). An
 *   agency sees aggregates only (`agencyTotals`). The Kring safety team can open ONE booking only after an SOS or a
 *   report (`grantSafetyAccess`) — policy, documented in tickets/KRING_DONE_K3.md.
 * Bump / venue QR:    `checkInBooking` releases the held amount to the local (80 %) — the guest's money already left
 *   the wallet at hold time, so this flips the record only (the chat calls the existing `onPhoneClinkRelease`).
 */

/** Each request / offer waits 10 minutes for an answer (round 2 A4). */
export const OFFER_REPLY_MS = 10 * 60 * 1000
/** demo: the simulated local answers a guest's offer after ~5 s (and the simulated guest answers a local's counter) */
export const DEMO_OFFER_REPLY_MS = 5_000
/** demo: the live status on a sent request (Sent → Seen → Typing… → answer) */
export const DEMO_SEEN_MS = 1_500
export const DEMO_TYPING_MS = 3_000
/** Free cancel until meeting: 100% full refund if the booking does not happen (Rule 5: zero late-cancel penalty). */
export const FREE_CANCEL_MS = 24 * 3600_000
export const LATE_CANCEL_SHARE = 0

/** V3 · 'group' joins the fields one living card edits (Experience · When · Where · Group · Trip fee) */
export type OfferField = 'time' | 'venue' | 'price' | 'group'

export interface OfferTerms {
  priceThb: number
  /** Bangkok date 'YYYY-MM-DD' */
  date: string
  /** 24 h '18:00' */
  start: string
  end: string
  venue: string
  /** 1 = "Just me" (single is the default; "+ friends" is the quiet control) */
  groupSize: number
}

export type OfferStatus = 'open' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'released'
export type OfferStepKind = 'offer' | 'counter' | 'change' | 'accept' | 'decline' | 'withdraw' | 'release'

export interface OfferStep {
  kind: OfferStepKind
  by: PlanSide
  at: number
  terms: OfferTerms
  /** what changed against the previous terms (old values struck through on the card) */
  changed: OfferField[]
  prev?: OfferTerms
}

export interface Offer {
  id: string
  experienceId?: string
  experienceTitle?: string
  guestId: string
  guestName: string
  localId: string
  localName: string
  /** the local's own "from" price (shown next to the guest's offer in Local home) */
  fromThb?: number
  terms: OfferTerms
  /** whose terms are on the table — the other side answers */
  lastBy: PlanSide
  status: OfferStatus
  steps: OfferStep[]
  /** part of a multi-request (the hold sits on the multi-request until a local wins) */
  multiId?: string
  /** what this device's wallet holds for this offer right now */
  heldThb: number
  /** the hold was placed on THIS device (only then can this device move it) */
  heldHere: boolean
  /** the offer rides on the booking sheet's own hold (`guest[holdKey]`) — refunds go through that one record */
  holdKey?: string
  /** released because another local accepted first ("this one was taken" — no effect on reply rate) */
  taken?: boolean
  createdAt: number
  updatedAt: number
  replyBy: number
  bookingId?: string
  /** demo: when the simulated other side answers */
  demoReplyAt?: number
}

export type MultiStatus = 'open' | 'won' | 'released' | 'expired'

export interface MultiRequest {
  id: string
  experienceId: string
  experienceTitle?: string
  guestId: string
  guestName: string
  localIds: string[]
  amountThb: number
  /** the ONE hold behind all the requests (0 once it went to the winner or came back) */
  heldThb: number
  heldHere: boolean
  offerIds: Record<string, string>
  status: MultiStatus
  winner?: string
  createdAt: number
  replyBy: number
  updatedAt: number
  refundedAt?: number
}

export type BookingStatus = 'held' | 'released' | 'cancelled' | 'no-show'

export interface BookingReview {
  stars: number
  tags: string[]
  text: string
  at: number
  /** Fable P1.3 · CPC section 22: disclosed when the first booking was funded by Kring */
  foundingFundedByKring?: boolean
}

export interface Booking {
  /** 'KR-2510-0417' */
  id: string
  offerId: string
  experienceId?: string
  experienceTitle?: string
  guestId: string
  guestName: string
  localId: string
  localName: string
  terms: OfferTerms
  /** what is held until the two meet */
  heldThb: number
  /** the local's share once released (80 %) */
  localReceiveThb: number
  heldHere: boolean
  status: BookingStatus
  createdAt: number
  updatedAt: number
  metAt?: number
  method?: 'bump' | 'qr'
  releasedAt?: number
  cancelledAt?: number
  refundThb?: number
  /** the only two people who can read this booking */
  participants: [string, string]
  /** set only on SOS or a report — lets the Kring safety team open this one booking */
  safetyAccess?: { reason: 'sos' | 'report'; at: number }
  /** the guest's review of the local (the trip) */
  review?: BookingReview
  /** T3 · mutual reviews: the local's review of the guest, after the same bump */
  hostReview?: BookingReview
  /** demo only: "Skip to the meeting" was tapped — `canRelease` treats the booking as at the venue, on time */
  demoAtVenueAt?: number
  /** demo: this device is the local and her 80 % was credited here at the release (once) */
  creditedHere?: boolean
  /** Fable P1.3 · Founding Local first booking funded by Kring (disclosed on review & share card) */
  foundingFundedByKring?: boolean
}

export interface HostSettings {
  /** "Guests may suggest another venue: Yes / No" (chosen at go-live, default Yes) */
  allowVenueChange: boolean
  updatedAt: number
}

export interface OfferSeed {
  experienceId?: string
  experienceTitle?: string
  guestId?: string
  guestName?: string
  localId: string
  localName?: string
  fromThb?: number
  terms: Partial<OfferTerms> & { priceThb: number }
}

/** The signed-in user's id (demo or real); 'me' when nobody is signed in. */
export function currentViewerId(): string {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(AUTH_KEY) : null
    const s = raw ? (JSON.parse(raw) as { userId?: string }) : null
    return s?.userId ? String(s.userId) : 'me'
  } catch {
    return 'me'
  }
}

/** Placeholder names a demo session carries — never shown as a person (cross-cutting truth 3: real names). */
const PLACEHOLDER_NAME = /^(demo\s*(traveler|traveller|host|local|agency|user)|guest|host|you)$/i

/**
 * The signed-in person's real first name: the name they typed in onboarding (profile), else a real session name.
 * Never "Demo Traveler". Falls back to `fallback` (default 'You').
 */
export function viewerDisplayName(fallback = 'You'): string {
  try {
    const prof = JSON.parse(window.localStorage.getItem('chon_profile_v1') ?? 'null') as { name?: string } | null
    const pn = prof?.name?.trim()
    if (pn && !PLACEHOLDER_NAME.test(pn)) return pn
    const raw = window.localStorage.getItem(AUTH_KEY)
    const s = raw ? (JSON.parse(raw) as { displayName?: string }) : null
    const sn = s?.displayName?.trim()
    if (sn && !PLACEHOLDER_NAME.test(sn)) return sn
  } catch {
    // storage blocked
  }
  return fallback
}

function viewerName(): string {
  return viewerDisplayName('You')
}

function bkkDate(now: number): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10)
}

function fullTerms(t: Partial<OfferTerms> & { priceThb: number }, now: number): OfferTerms {
  const start = toClock24(t.start ?? '') ?? '18:00'
  const end = toClock24(t.end ?? '') ?? addMinutes(start, DEFAULT_PLAN_MIN)
  return {
    priceThb: Math.max(0, Math.round(t.priceThb)),
    date: t.date && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : bkkDate(now),
    start,
    end,
    venue: (t.venue ?? '').trim(),
    groupSize: Math.max(1, Math.min(8, Math.round(t.groupSize ?? 1))),
  }
}

function diffTerms(a: OfferTerms, b: OfferTerms): OfferField[] {
  const out: OfferField[] = []
  if (a.date !== b.date || a.start !== b.start || a.end !== b.end) out.push('time')
  if (a.venue !== b.venue) out.push('venue')
  if (a.priceThb !== b.priceThb) out.push('price')
  if (a.groupSize !== b.groupSize) out.push('group')
  return out
}

let seq = 0
function newId(prefix: string, now: number): string {
  seq = (seq + 1) % 1000
  return `${prefix}-${now.toString(36)}-${seq}`
}

/** 'KR-2510-0417' — year+month + four digits (readable on the ticket and in support). */
function bookingNo(now: number): string {
  const d = new Date(now + 7 * 3600_000)
  const yymm = `${String(d.getUTCFullYear()).slice(2)}${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  let n = (Math.floor(now / 1000) + seq * 37) % 10000
  let id = `KR-${yymm}-${String(n).padStart(4, '0')}`
  while (state.bookings[id]) {
    n = (n + 1) % 10000
    id = `KR-${yymm}-${String(n).padStart(4, '0')}`
  }
  return id
}

/**
 * Wallet notes for booking money — one prefix so the Wallet timeline can fold every hold / top-up-of-the-hold /
 * refund of ONE booking into one line (`KRING_HOLD_NOTE` + local name + offer id).
 */
export const KRING_HOLD_NOTE = 'Kring booking hold'
export const KRING_REFUND_NOTE = 'Kring booking refund'
export function kringMoneyNote(kind: 'hold' | 'refund', localName: string, ref: string): string {
  return `${kind === 'hold' ? KRING_HOLD_NOTE : KRING_REFUND_NOTE} · ${localName} · ${ref}`
}
/** The ref a sheet hold's money notes carry: the offer riding on it (FIX2), else the legacy `sheet-<local>` ref. */
export function holdRef(h: Pick<GuestHold, 'hostId' | 'ref'>): string {
  return h.ref || `sheet-${partnerKey(h.hostId)}`
}
/** A fresh offer id for a sheet that holds money BEFORE its offer exists — the hold note and the offer share it. */
export function newOfferId(now = Date.now()): string {
  let id = newId('of', now)
  while (state.offers[id]) id = newId('of', now)
  return id
}
/** the same hold call the Clink send makes (rejected → false, nothing changes) */
function holdThb(thb: number, note: string): boolean {
  if (thb <= 0) return true
  return dispatchInternalWalletDelta({ paidDelta: -Math.round(thb * 100), hideGlobal: true, note })
}
/** the same refund call the Clink Cancel makes */
function refundThb(thb: number, note?: string) {
  if (thb <= 0) return
  dispatchInternalWalletDelta({ paidDelta: Math.round(thb * 100), allowEscrowRefund: true, ...(note ? { note } : {}) })
}

/* ---------------- host setting: guests may suggest another venue ---------------- */

export function allowsVenueChange(localId: string): boolean {
  const s = state.hostSettings[partnerKey(localId)]
  return s ? s.allowVenueChange : true
}

export function setAllowVenueChange(localId: string, allow: boolean, now = Date.now()) {
  const k = partnerKey(localId)
  if (!k) return
  commit({ ...state, hostSettings: { ...state.hostSettings, [k]: { allowVenueChange: allow, updatedAt: now } } })
}

/* ---------------- offers ---------------- */

export function getOffer(id: string): Offer | null {
  return state.offers[id] ?? null
}

/** `open` past its reply window reads as `expired` (the hold comes back once, in `sweepOffers`). */
export function effectiveOfferStatus(o: Offer, now = Date.now()): OfferStatus {
  return o.status === 'open' && now >= o.replyBy ? 'expired' : o.status
}

export function offerMsLeft(o: Pick<Offer, 'replyBy'>, now = Date.now()): number {
  return Math.max(0, o.replyBy - now)
}

/** Live status on a sent request: Sent · Seen · Typing… · Accepted / Countered / Released / … */
export function offerStage(o: Offer, now = Date.now()): 'sent' | 'seen' | 'typing' | 'countered' | OfferStatus {
  const st = effectiveOfferStatus(o, now)
  if (st !== 'open') return st
  if (o.lastBy === 'host') return 'countered'
  const since = now - o.updatedAt
  if (o.demoReplyAt && now >= o.demoReplyAt - (DEMO_OFFER_REPLY_MS - DEMO_TYPING_MS)) return 'typing'
  if (since >= DEMO_SEEN_MS) return 'seen'
  return 'sent'
}

/** Offers for one chat (guest ↔ local), newest last. */
export function offersBetween(guestId: string, localId: string): Offer[] {
  const g = partnerKey(guestId)
  const l = partnerKey(localId)
  return Object.values(state.offers)
    .filter((o) => partnerKey(o.guestId) === g && partnerKey(o.localId) === l)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** Offers in a chat with this partner, whichever side this device is on. */
export function offersWith(partnerIdOrName: string): Offer[] {
  const k = partnerKey(partnerIdOrName)
  return Object.values(state.offers)
    .filter((o) => partnerKey(o.localId) === k || partnerKey(o.localName) === k || partnerKey(o.guestId) === k || partnerKey(o.guestName) === k)
    .sort((a, b) => a.createdAt - b.createdAt)
}

/** Offers waiting for this local (Local home), soonest deadline first. */
export function incomingOffersFor(localId: string, now = Date.now()): Offer[] {
  const k = partnerKey(localId)
  return Object.values(state.offers)
    .filter((o) => partnerKey(o.localId) === k && effectiveOfferStatus(o, now) === 'open')
    .sort((a, b) => a.replyBy - b.replyBy)
}

/**
 * Either side opens an offer. A GUEST's offer holds its price now (rejected → null, nothing changes); a local's
 * offer holds nothing until the guest accepts. You can never offer yourself (null).
 */
export function createOffer(
  seed: OfferSeed,
  by: PlanSide = 'guest',
  now = Date.now(),
  opts: { hold?: boolean; multiId?: string; demoReply?: boolean; adoptHold?: boolean; id?: string } = {},
): Offer | null {
  const guestId = seed.guestId ?? currentViewerId()
  const localId = seed.localId
  if (!localId || partnerKey(guestId) === partnerKey(localId)) return null
  if (!(seed.terms.priceThb > 0)) return null
  const terms = fullTerms(seed.terms, now)
  // the booking sheet already placed the hold (its own Clink-hold call + `chon:offer-status` HELD): ride on it
  const holdKey = opts.adoptHold ? partnerKey(localId) : undefined
  const adopted = holdKey ? state.guest[holdKey] : undefined
  if (opts.adoptHold && (!adopted || adopted.status !== 'held' || adopted.refundedAt)) return null
  // FIX2: a sheet that held first passes the id its hold note already carries (same id on a re-send = the same offer)
  const prior = opts.id ? state.offers[opts.id] : undefined
  const reuse = opts.id && (!prior || (prior.holdKey === holdKey && prior.status === 'open' && !prior.bookingId)) ? opts.id : undefined
  if (holdKey) supersedeAdopted(holdKey, now)
  const wantsHold = by === 'guest' && !opts.multiId && opts.hold !== false && !adopted
  const id = reuse ?? newId('of', now)
  if (wantsHold && !holdThb(terms.priceThb, kringMoneyNote('hold', seed.localName ?? localId, id))) return null
  const demoReply = opts.demoReply ?? (isDemoSession() && (wantsHold || Boolean(adopted)))
  const offer: Offer = {
    id,
    experienceId: seed.experienceId,
    experienceTitle: seed.experienceTitle,
    guestId,
    guestName: seed.guestName ?? (by === 'guest' ? viewerName() : guestId),
    localId,
    localName: seed.localName ?? localId,
    fromThb: seed.fromThb,
    terms,
    lastBy: by,
    status: 'open',
    steps: [{ kind: 'offer', by, at: now, terms, changed: [] }],
    multiId: opts.multiId,
    heldThb: adopted ? adopted.offerThb : wantsHold ? terms.priceThb : 0,
    heldHere: wantsHold || Boolean(adopted),
    ...(holdKey ? { holdKey } : {}),
    createdAt: now,
    updatedAt: now,
    // an adopted hold keeps the sheet's own reply window (its ring and this card count down together)
    replyBy: adopted ? adopted.replyBy : now + OFFER_REPLY_MS,
    ...(demoReply ? { demoReplyAt: now + DEMO_OFFER_REPLY_MS } : {}),
  }
  commit({ ...state, offers: { ...state.offers, [id]: offer } })
  return offer
}

/** A re-sent sheet hold replaces the open offer that rode on the old one (no money moves — the sheet settled it). */
function supersedeAdopted(holdKey: string, now: number) {
  let offers = state.offers
  for (const o of Object.values(state.offers)) {
    if (o.holdKey !== holdKey || o.status !== 'open') continue
    offers = { ...offers, [o.id]: { ...o, status: 'withdrawn', heldThb: 0, updatedAt: now, demoReplyAt: undefined } }
  }
  if (offers !== state.offers) commit({ ...state, offers })
}

/** The sheet's hold went back (its Cancel / its own expiry): the offers riding on it close without a second refund. */
function closeAdoptedOffers(holdKey: string, status: 'withdrawn' | 'expired', now: number) {
  let offers = state.offers
  for (const o of Object.values(state.offers)) {
    if (o.holdKey !== holdKey || o.status !== 'open') continue
    offers = { ...offers, [o.id]: { ...o, status, heldThb: 0, updatedAt: now, demoReplyAt: undefined, steps: [...o.steps, { kind: 'withdraw', by: 'guest', at: now, terms: o.terms, changed: [] }] } }
  }
  if (offers !== state.offers) commit({ ...state, offers })
}

/** An offer riding on the sheet's hold is declined: the money comes back once, through that hold's record. */
function refundAdoptedHold(holdKey: string, now: number): number {
  const h = state.guest[holdKey]
  if (!h || h.status !== 'held' || h.refundedAt || h.releasedAt) return 0
  commit({ ...state, guest: { ...state.guest, [holdKey]: { ...h, status: 'cancelled', refundedAt: now, updatedAt: now } } })
  refundThb(h.offerThb, kringMoneyNote('refund', h.hostName, holdRef(h)))
  return h.offerThb
}

function canAnswer(o: Offer | undefined, as: PlanSide, now: number): o is Offer {
  if (!o || effectiveOfferStatus(o, now) !== 'open' || o.lastBy === as) return false
  if (o.multiId) {
    const m = state.multi[o.multiId]
    if (!m || m.status !== 'open') return false
  }
  return true
}

/**
 * New terms on the table from the side that did NOT make the last ones. `counterOffer` is the price-only shortcut
 * (round 1); `suggestChange` changes any of time · venue · price (round 2). The reply window restarts.
 * A guest's venue suggestion is refused when the local keeps a fixed meeting point.
 */
export type OfferChangeInput = Partial<OfferTerms> & { experienceId?: string; experienceTitle?: string }

export function suggestChange(id: string, as: PlanSide, change: OfferChangeInput, now = Date.now(), kind: 'counter' | 'change' = 'change'): Offer | null {
  const cur = state.offers[id]
  if (!canAnswer(cur, as, now)) return null
  const next = fullTerms({ ...cur.terms, ...change, priceThb: change.priceThb ?? cur.terms.priceThb }, now)
  const changed = diffTerms(cur.terms, next)
  const expChanged = (change.experienceId !== undefined && change.experienceId !== cur.experienceId) || (change.experienceTitle !== undefined && change.experienceTitle !== cur.experienceTitle)
  if (!changed.length && !expChanged) return null
  if (as === 'guest' && changed.includes('venue') && !allowsVenueChange(cur.localId)) return null
  // the simulated side answers in a demo (a local's counter to a remote guest; a guest's change to a sim local)
  const demoReply = isDemoSession() && (as === 'host' ? !cur.heldHere && !cur.multiId : cur.heldHere || Boolean(cur.multiId))
  const o: Offer = {
    ...cur,
    ...(change.experienceId !== undefined ? { experienceId: change.experienceId } : {}),
    ...(change.experienceTitle !== undefined ? { experienceTitle: change.experienceTitle } : {}),
    terms: next,
    lastBy: as,
    steps: [...cur.steps, { kind, by: as, at: now, terms: next, changed, prev: cur.terms }],
    updatedAt: now,
    replyBy: now + OFFER_REPLY_MS,
    demoReplyAt: demoReply ? now + DEMO_OFFER_REPLY_MS : undefined,
  }
  commit({ ...state, offers: { ...state.offers, [id]: o } })
  return o
}

/**
 * V3 · ONE living card per booking — the side whose terms are on the table may still edit them before the other side
 * answers ("Send change" while waiting). Same record, a new 'change' step, the reply window restarts. No money moves
 * here: the one hold is settled to the agreed fee at accept (the existing `tryAcceptOffer` top-up / refund step), and
 * an offer that closes unanswered gives back exactly what it holds (`declineOffer` / `sweepOffers`).
 */
export function reviseOffer(id: string, as: PlanSide, change: OfferChangeInput, now = Date.now()): Offer | null {
  const cur = state.offers[id]
  if (!cur || effectiveOfferStatus(cur, now) !== 'open' || cur.lastBy !== as) return null
  if (cur.multiId) {
    const m = state.multi[cur.multiId]
    if (!m || m.status !== 'open') return null
  }
  const next = fullTerms({ ...cur.terms, ...change, priceThb: change.priceThb ?? cur.terms.priceThb }, now)
  const changed = diffTerms(cur.terms, next)
  const expChanged = (change.experienceId !== undefined && change.experienceId !== cur.experienceId) || (change.experienceTitle !== undefined && change.experienceTitle !== cur.experienceTitle)
  if (!changed.length && !expChanged) return null
  if (as === 'guest' && changed.includes('venue') && !allowsVenueChange(cur.localId)) return null
  const demoReply = isDemoSession() && (as === 'host' ? !cur.heldHere && !cur.multiId : cur.heldHere || Boolean(cur.multiId))
  const o: Offer = {
    ...cur,
    ...(change.experienceId !== undefined ? { experienceId: change.experienceId } : {}),
    ...(change.experienceTitle !== undefined ? { experienceTitle: change.experienceTitle } : {}),
    terms: next,
    steps: [...cur.steps, { kind: 'change', by: as, at: now, terms: next, changed, prev: cur.terms }],
    updatedAt: now,
    replyBy: now + OFFER_REPLY_MS,
    demoReplyAt: demoReply ? now + DEMO_OFFER_REPLY_MS : undefined,
  }
  commit({ ...state, offers: { ...state.offers, [id]: o } })
  return o
}

/** V3 · the living card's "Send change": answer with new terms on your turn, or revise your own while waiting. */
export function changeOffer(id: string, as: PlanSide, change: OfferChangeInput, now = Date.now()): Offer | null {
  const cur = state.offers[id]
  if (!cur) return null
  return cur.lastBy === as ? reviseOffer(id, as, change, now) : suggestChange(id, as, change, now, 'change')
}

export function counterOffer(id: string, as: PlanSide, priceThb: number, now = Date.now(), extra: Partial<OfferTerms> = {}): Offer | null {
  return suggestChange(id, as, { ...extra, priceThb }, now, 'counter')
}

/**
 * The side that did not put the current terms on the table accepts → a Booking. The hold is settled to the agreed
 * amount (more → hold the difference; less → refund the difference). Not enough cash for a higher counter → null,
 * nothing changes. In a multi-request the first accept wins and the other locals are released.
 */
export function acceptOffer(id: string, as: PlanSide, now = Date.now(), opts: { remote?: boolean } = {}): Booking | null {
  return tryAcceptOffer(id, as, now, opts).booking
}

/** Why an accept could not go through (never silently: the card explains it and offers the fix). */
export type AcceptBlock = 'closed' | 'short-cash'
export interface AcceptResult {
  booking: Booking | null
  reason?: AcceptBlock
  /** 'short-cash': the extra cash this accept has to hold on top of what is already held */
  needThb?: number
}

/** The extra this device must hold to accept the terms on the table (0 when nothing more is needed). */
export function acceptExtraThb(id: string, as: PlanSide, opts: { remote?: boolean } = {}): number {
  const cur = state.offers[id]
  if (!cur) return 0
  const multi = cur.multiId ? state.multi[cur.multiId] : undefined
  const heldNow = multi ? multi.heldThb : cur.heldThb
  const heldHere = multi ? multi.heldHere : cur.heldHere
  const moveMoney = heldHere || (as === 'guest' && !opts.remote)
  return moveMoney ? Math.max(0, cur.terms.priceThb - heldNow) : 0
}

/** `acceptOffer` with the reason when it can't: closed (answered / expired / not yours) or not enough CASH. */
export function tryAcceptOffer(id: string, as: PlanSide, now = Date.now(), opts: { remote?: boolean } = {}): AcceptResult {
  const cur = state.offers[id]
  if (!canAnswer(cur, as, now)) return { booking: null, reason: 'closed' }
  const agreed = cur.terms.priceThb
  const multi = cur.multiId ? state.multi[cur.multiId] : undefined
  // what this device holds for the offer right now (a multi-request's one hold moves to the winner)
  const heldNow = multi ? multi.heldThb : cur.heldThb
  const heldHere = multi ? multi.heldHere : cur.heldHere
  // `remote`: the accepting guest is on ANOTHER device (demo counterpart) — this device's wallet never pays for her
  const moveMoney = heldHere || (as === 'guest' && !opts.remote)
  let held = heldNow
  if (moveMoney) {
    const diff = agreed - heldNow
    if (diff > 0 && !holdThb(diff, kringMoneyNote('hold', cur.localName, cur.id))) return { booking: null, reason: 'short-cash', needThb: diff }
    if (diff < 0) refundThb(-diff, kringMoneyNote('refund', cur.localName, cur.id))
    held = agreed
  }
  const bookingId = bookingNo(now)
  const accepted: Offer = {
    ...cur,
    status: 'accepted',
    heldThb: moveMoney ? held : cur.heldThb,
    heldHere: moveMoney,
    steps: [...cur.steps, { kind: 'accept', by: as, at: now, terms: cur.terms, changed: [] }],
    updatedAt: now,
    bookingId,
    demoReplyAt: undefined,
  }
  const booking: Booking = {
    id: bookingId,
    offerId: id,
    experienceId: cur.experienceId,
    experienceTitle: cur.experienceTitle,
    guestId: cur.guestId,
    guestName: cur.guestName,
    localId: cur.localId,
    localName: cur.localName,
    terms: cur.terms,
    heldThb: agreed,
    localReceiveThb: hostShareThb(agreed),
    heldHere: moveMoney,
    status: 'held',
    createdAt: now,
    updatedAt: now,
    participants: [cur.guestId, cur.localId],
  }
  let offers: Record<string, Offer> = { ...state.offers, [id]: accepted }
  let multiMap = state.multi
  if (multi) {
    for (const [lid, oid] of Object.entries(multi.offerIds)) {
      if (oid === id) continue
      const other = offers[oid]
      if (!other || other.status !== 'open') continue
      offers = {
        ...offers,
        [oid]: { ...other, status: 'released', taken: true, steps: [...other.steps, { kind: 'release', by: 'guest', at: now, terms: other.terms, changed: [] }], updatedAt: now, demoReplyAt: undefined },
      }
      void lid
    }
    multiMap = { ...state.multi, [multi.id]: { ...multi, status: 'won', winner: cur.localId, heldThb: 0, updatedAt: now } }
  }
  // the guest's wallet mirror: the existing plan clock, extension and no-show logic read `guest[localKey]`
  const localKey = partnerKey(cur.localId)
  const guest = moveMoney
    ? {
        ...state.guest,
        [localKey]: {
          hostId: localKey,
          hostName: cur.localName,
          offerThb: agreed,
          status: 'accepted' as const,
          heldAt: now,
          replyBy: now + REPLY_WINDOW_MS,
          updatedAt: now,
          sheetGone: true,
          bookingId,
        },
      }
    : state.guest
  commit({ ...state, offers, multi: multiMap, guest, bookings: { ...state.bookings, [bookingId]: booking } })
  ensureMeetPlan({ key: localKey, guest: cur.guestName, host: cur.localName, start: cur.terms.start, priceThb: agreed }, now)
  emit(BOOKING_EVENT, { bookingId, offerId: id, by: as })
  return { booking }
}

/** Decline (the answering side) or withdraw (the side whose terms are on the table): the hold comes back once. */
export function declineOffer(id: string, as: PlanSide, now = Date.now()): Offer | null {
  const cur = state.offers[id]
  if (!cur || effectiveOfferStatus(cur, now) !== 'open') return null
  const withdraw = cur.lastBy === as
  const back = cur.heldHere && !cur.holdKey ? cur.heldThb : 0
  const o: Offer = {
    ...cur,
    status: withdraw ? 'withdrawn' : 'declined',
    heldThb: 0,
    steps: [...cur.steps, { kind: withdraw ? 'withdraw' : 'decline', by: as, at: now, terms: cur.terms, changed: [] }],
    updatedAt: now,
    demoReplyAt: undefined,
  }
  commit({ ...state, offers: { ...state.offers, [id]: o } })
  refundThb(back, kringMoneyNote('refund', cur.localName, cur.id))
  if (cur.holdKey) refundAdoptedHold(cur.holdKey, now)
  // the last open child of a multi-request declining → the one hold comes back
  if (cur.multiId) settleMultiIfDone(cur.multiId, now)
  return o
}

/* ---------------- multi-request ---------------- */

export interface RequestManyOpts {
  experienceTitle?: string
  guestId?: string
  guestName?: string
  localNames?: Record<string, string>
  fromThb?: Record<string, number>
  /** Per-local price (each local's own "from"). A child's price is capped at `amount`, which is the ONE hold; the
   *  winner's accept refunds the difference through the existing settle step. Omitted → everyone gets `amount`. */
  pricesThb?: Record<string, number>
  /** FIX3 · per-local meeting place (e.g. Mint → "Nara Salon, Siam Square"); fallback `terms.venue` */
  venues?: Record<string, string>
  terms?: Partial<OfferTerms>
  now?: number
}

/**
 * Ask one or several pinned locals at once for the same experience: ONE hold of `amount`, one request per local,
 * 10 minutes each. Yourself and duplicates are dropped. Not enough cash → null, nothing changes.
 */
export function requestMany(experienceId: string, localIds: string[], amount: number, opts: RequestManyOpts = {}): MultiRequest | null {
  const now = opts.now ?? Date.now()
  const guestId = opts.guestId ?? currentViewerId()
  const ids = [...new Set(localIds.filter(Boolean))].filter((l) => partnerKey(l) !== partnerKey(guestId))
  const amountThb = Math.round(amount)
  if (!ids.length || !(amountThb > 0)) return null
  const id = newId('mr', now)
  if (!holdThb(amountThb, kringMoneyNote('hold', ids.map((l) => opts.localNames?.[l] ?? l).join(', '), id))) return null
  const demo = isDemoSession()
  const offerIds: Record<string, string> = {}
  const childPrice = (lid: string) => {
    const p = Math.round(opts.pricesThb?.[lid] ?? 0)
    return p > 0 && p <= amountThb ? p : amountThb
  }
  for (const [i, lid] of ids.entries()) {
    const o = createOffer(
      {
        experienceId,
        experienceTitle: opts.experienceTitle,
        guestId,
        guestName: opts.guestName,
        localId: lid,
        localName: opts.localNames?.[lid] ?? lid,
        fromThb: opts.fromThb?.[lid],
        terms: { ...opts.terms, ...(opts.venues?.[lid]?.trim() ? { venue: opts.venues[lid].trim() } : {}), priceThb: childPrice(lid) },
      },
      'guest',
      now,
      // demo: the first local answers (accepts) — the others see "this one was taken"
      { multiId: id, demoReply: demo && i === 0 },
    )
    if (o) offerIds[lid] = o.id
  }
  const m: MultiRequest = {
    id,
    experienceId,
    experienceTitle: opts.experienceTitle,
    guestId,
    guestName: opts.guestName ?? viewerName(),
    localIds: ids,
    amountThb,
    heldThb: amountThb,
    heldHere: true,
    offerIds,
    status: 'open',
    createdAt: now,
    replyBy: now + OFFER_REPLY_MS,
    updatedAt: now,
  }
  commit({ ...state, multi: { ...state.multi, [id]: m } })
  return m
}

export function getMultiRequest(id: string): MultiRequest | null {
  return state.multi[id] ?? null
}

/** `open` past its window reads as `expired`. */
export function effectiveMultiStatus(m: MultiRequest, now = Date.now()): MultiStatus {
  return m.status === 'open' && now >= m.replyBy ? 'expired' : m.status
}

/** The guest calls the whole request off (or nobody answered): every request is released and the ONE hold comes back once. */
export function releaseMultiRequest(id: string, reason: 'released' | 'expired' = 'released', now = Date.now()): number {
  const m = state.multi[id]
  if (!m || m.status !== 'open') return 0
  const back = m.heldHere ? m.heldThb : 0
  let offers = state.offers
  for (const oid of Object.values(m.offerIds)) {
    const o = offers[oid]
    if (!o || o.status !== 'open') continue
    offers = { ...offers, [oid]: { ...o, status: reason === 'expired' ? 'expired' : 'released', steps: [...o.steps, { kind: 'release', by: 'guest', at: now, terms: o.terms, changed: [] }], updatedAt: now, demoReplyAt: undefined } }
  }
  commit({ ...state, offers, multi: { ...state.multi, [id]: { ...m, status: reason, heldThb: 0, refundedAt: now, updatedAt: now } } })
  refundThb(back, kringMoneyNote('refund', m.localIds.map((l) => offers[m.offerIds[l]]?.localName ?? l).join(', '), m.id))
  return back
}

function settleMultiIfDone(multiId: string, now: number) {
  const m = state.multi[multiId]
  if (!m || m.status !== 'open') return
  const anyOpen = Object.values(m.offerIds).some((oid) => state.offers[oid]?.status === 'open')
  if (!anyOpen) releaseMultiRequest(multiId, 'released', now)
}

/* ---------------- bookings (private) ---------------- */

/** Only the guest and the local — or the safety team after an SOS / report on THIS booking. */
export function canViewBooking(b: Pick<Booking, 'participants' | 'safetyAccess'>, viewer: string | { id: string; role?: 'safety' | 'agency' | string }): boolean {
  const v = typeof viewer === 'string' ? { id: viewer } : viewer
  if (v.role === 'safety') return Boolean(b.safetyAccess)
  const id = partnerKey(v.id)
  return Boolean(id) && Array.isArray(b.participants) && b.participants.some((p) => partnerKey(p) === id)
}

/** Read one booking as `viewer` — null for anyone who is not its guest or its local. */
export function getBookingFor(id: string, viewer: string | { id: string; role?: 'safety' | 'agency' | string }): Booking | null {
  const b = state.bookings[id]
  return b && canViewBooking(b, viewer) ? b : null
}

/** Every booking this person is part of, soonest first. */
export function bookingsFor(viewerId: string): Booking[] {
  return Object.values(state.bookings)
    .filter((b) => canViewBooking(b, viewerId))
    .sort((a, b) => (a.terms.date + a.terms.start).localeCompare(b.terms.date + b.terms.start))
}

/** The live booking between this device and a chat partner (either side), if any. */
export function activeBookingWith(partnerIdOrName: string, viewerId = currentViewerId()): Booking | null {
  const k = partnerKey(partnerIdOrName)
  const list = bookingsFor(viewerId).filter(
    (b) => b.status === 'held' && [b.localId, b.localName, b.guestId, b.guestName].some((x) => partnerKey(x) === k),
  )
  return list[list.length - 1] ?? null
}

/** Agency view: counts and baht per local — never who, where, when, the price of one booking, or the chat. */
export function agencyTotals(localIds: string[]): { completed: number; earnedThb: number; byLocal: Record<string, { completed: number; earnedThb: number }> } {
  const keys = new Set(localIds.map(partnerKey))
  const byLocal: Record<string, { completed: number; earnedThb: number }> = {}
  let completed = 0
  let earnedThb = 0
  for (const b of Object.values(state.bookings)) {
    const k = partnerKey(b.localId)
    if (!keys.has(k) || b.status !== 'released') continue
    byLocal[k] = { completed: (byLocal[k]?.completed ?? 0) + 1, earnedThb: (byLocal[k]?.earnedThb ?? 0) + b.localReceiveThb }
    completed += 1
    earnedThb += b.localReceiveThb
  }
  return { completed, earnedThb, byLocal }
}

/** SOS or a report on this booking: the Kring safety team may open it (and only it). */
export function grantSafetyAccess(id: string, reason: 'sos' | 'report', now = Date.now()) {
  const b = state.bookings[id]
  if (!b || b.safetyAccess) return
  commit({ ...state, bookings: { ...state.bookings, [id]: { ...b, safetyAccess: { reason, at: now } } } })
}

/** Start of the booking as a timestamp (Bangkok wall clock). */
export function bookingStartMs(b: Pick<Booking, 'terms'>): number {
  const [y, mo, d] = b.terms.date.split('-').map(Number)
  const [h, m] = b.terms.start.split(':').map(Number)
  return Date.UTC(y, mo - 1, d, h, m) - 7 * 3600_000
}

/* ---------------- release gate: the bump / venue QR (time window + place) ---------------- */

/** The bump opens 30 min before the start … */
export const RELEASE_OPENS_BEFORE_MS = 30 * 60_000
/** … and stays open until 2 h after the agreed end. */
export const RELEASE_CLOSES_AFTER_MS = 2 * 3600_000
/** With location permission, both phones must be within ~300 m of the meeting point. */
export const RELEASE_RADIUS_M = 300

export interface GeoPoint {
  lat: number
  lng: number
  /** metres (GeolocationCoordinates.accuracy) — a fuzzy fix gets that much slack, capped at 200 m */
  accuracy?: number
}

/**
 * Known public meeting points (demo catalogue). Matched by a lower-case fragment of the venue text; a venue that is
 * not on the list skips the place check (time window still applies). Backend stop-point: real venue rows carry geo.
 */
export const VENUE_GEO: ReadonlyArray<{ match: string; lat: number; lng: number }> = [
  { match: 'siam herbal spa', lat: 13.7797, lng: 100.5446 },
  { match: 'yaowarat', lat: 13.7398, lng: 100.5097 },
  { match: 'talat noi', lat: 13.7323, lng: 100.5135 },
  { match: 'wat pho', lat: 13.7465, lng: 100.4927 },
  { match: 'wat arun', lat: 13.7437, lng: 100.4889 },
  { match: 'pak khlong', lat: 13.7426, lng: 100.4966 },
  { match: 'chatuchak', lat: 13.7999, lng: 100.5503 },
  { match: 'lumpini', lat: 13.7314, lng: 100.5414 },
  { match: 'emquartier', lat: 13.7317, lng: 100.5697 },
  { match: 'iconsiam', lat: 13.7266, lng: 100.5104 },
  { match: 'ari', lat: 13.7795, lng: 100.5446 },
  { match: 'jodd fairs', lat: 13.7570, lng: 100.5655 },
  { match: 'bali hai pier', lat: 12.9236, lng: 100.8687 },
  { match: 'terminal 21 pattaya', lat: 12.9500, lng: 100.8889 },
]

export function venueGeo(venue: string): { lat: number; lng: number } | null {
  const v = venue.toLowerCase()
  // longest fragment first ('siam herbal spa' beats 'ari')
  const hit = [...VENUE_GEO].sort((a, b) => b.match.length - a.match.length).find((g) => v.includes(g.match))
  return hit ? { lat: hit.lat, lng: hit.lng } : null
}

/** Great-circle distance in metres. */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371_000
  const rad = (d: number) => (d * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** End of the booking (Bangkok wall clock; an end before the start runs past midnight). */
export function bookingEndMs(b: Pick<Booking, 'terms'>): number {
  const start = bookingStartMs(b)
  const [sh, sm] = b.terms.start.split(':').map(Number)
  const [eh, em] = (b.terms.end || b.terms.start).split(':').map(Number)
  let mins = eh * 60 + em - (sh * 60 + sm)
  if (mins <= 0) mins += 1440
  return start + mins * 60_000
}

export type ReleaseBlock = 'not-found' | 'not-held' | 'too-early' | 'too-late' | 'too-far'

export interface ReleaseCheck {
  ok: boolean
  /** why the bump / QR can't release now (absent when ok) */
  reason?: ReleaseBlock
  /** when the window opens / closed (ms) */
  opensAt: number
  closesAt: number
  /** '13:30' Bangkok, for "Opens at 13:30 at Siam Herbal Spa" */
  opensClock: string
  venue: string
  /** metres from the venue when coords were given and the venue is known */
  distanceM?: number
  /** the status the booking is in (released / cancelled / no-show when reason = 'not-held') */
  status?: BookingStatus
  /** a one-line explanation, EN and TH, ready to show */
  text: { en: string; th: string }
}

/** demo only: "skip to the meeting" — the booking behaves as if it is start time and both phones are at the venue */
export function demoSkipToMeeting(id: string, now = Date.now()): Booking | null {
  const b = state.bookings[id]
  if (!b || b.status !== 'held' || !isDemoSession()) return null
  const next: Booking = { ...b, demoAtVenueAt: now, updatedAt: now }
  commit({ ...state, bookings: { ...state.bookings, [id]: next } })
  return next
}

function clockOf(ms: number): string {
  const d = new Date(ms + 7 * 3600_000)
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
}

function dayOf(ms: number, now: number, th: boolean): string {
  const d = new Date(ms + 7 * 3600_000).toISOString().slice(0, 10)
  const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10)
  const tomorrow = new Date(now + 31 * 3600_000).toISOString().slice(0, 10)
  if (d === today) return ''
  if (d === tomorrow) return th ? 'พรุ่งนี้ ' : 'tomorrow '
  const dt = new Date(ms + 7 * 3600_000)
  const en = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getUTCDay()]
  const thd = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'][dt.getUTCDay()]
  return th ? `${thd} ${dt.getUTCDate()} ` : `${en} ${dt.getUTCDate()} `
}

/**
 * May this booking be released NOW (กริ๊ง! bump or venue QR)? Only while it is held, inside the booking window
 * (30 min before the start until 2 h after the end) and — when the caller passes the phone's position (location
 * permission granted) — within ~300 m of a known venue. Read-only: nothing moves.
 * `checkInBooking` enforces the same gate.
 */
export function canRelease(bookingId: string, now = Date.now(), coords?: GeoPoint | null): ReleaseCheck {
  const b = state.bookings[bookingId]
  const empty = { en: '', th: '' }
  if (!b) return { ok: false, reason: 'not-found', opensAt: 0, closesAt: 0, opensClock: '', venue: '', text: { en: 'Booking not found', th: 'ไม่พบการจองนี้' } }
  const start = bookingStartMs(b)
  const opensAt = start - RELEASE_OPENS_BEFORE_MS
  const closesAt = bookingEndMs(b) + RELEASE_CLOSES_AFTER_MS
  const opensClock = clockOf(opensAt)
  const venue = b.terms.venue || b.experienceTitle || ''
  const base = { opensAt, closesAt, opensClock, venue, status: b.status }
  if (b.status !== 'held') {
    const en = b.status === 'released' ? `Already released to ${b.localName}` : b.status === 'cancelled' ? 'This booking was cancelled' : 'Marked as no-show · refunded'
    const th = b.status === 'released' ? `โอนให้ ${b.localName} แล้ว` : b.status === 'cancelled' ? 'การจองนี้ยกเลิกแล้ว' : 'โลคอลไม่มา · คืนเงินแล้ว'
    return { ok: false, reason: 'not-held', ...base, text: { en, th } }
  }
  // demo: "skip to the meeting" puts both phones at the venue at start time (clearly labelled Demo on the ticket)
  if (b.demoAtVenueAt && isDemoSession()) return { ok: true, ...base, text: empty }
  const at = venue ? ` at ${venue}` : ''
  const atTh = venue ? ` ที่ ${venue}` : ''
  if (now < opensAt) {
    const day = dayOf(opensAt, now, false)
    const dayTh = dayOf(opensAt, now, true)
    return { ok: false, reason: 'too-early', ...base, text: { en: `Opens ${day}at ${opensClock}${at}`, th: `เปิดให้กริ๊ง ${dayTh}${opensClock} น.${atTh}` } }
  }
  if (now > closesAt) {
    return { ok: false, reason: 'too-late', ...base, text: { en: 'The meeting window has closed · ask Kring support if you met', th: 'หมดเวลากริ๊งแล้ว · ถ้าเจอกันแล้ว ติดต่อทีมกริ๊ง' } }
  }
  const geo = coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng) ? venueGeo(venue) : null
  if (geo && coords) {
    const d = Math.round(distanceM(coords, geo))
    const slack = Math.min(200, Math.max(0, coords.accuracy ?? 0))
    if (d > RELEASE_RADIUS_M + slack) {
      const far = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${d} m`
      return { ok: false, reason: 'too-far', ...base, distanceM: d, text: { en: `You're ${far} away · bump at ${venue}`, th: `ยังห่าง ${far} · กริ๊งได้ที่ ${venue}` } }
    }
    return { ok: true, ...base, distanceM: d, text: empty }
  }
  return { ok: true, ...base, text: empty }
}

/** What a cancel now would give back: everything until 24 h before, half after that, nothing once released. */
export function cancelRefundThb(b: Booking, now = Date.now()): number {
  if (b.status !== 'held') return 0
  return now <= bookingStartMs(b) - FREE_CANCEL_MS ? b.heldThb : Math.round(b.heldThb * (1 - LATE_CANCEL_SHARE))
}

/**
 * The two met (กริ๊ง! bump, or the venue QR when bumping can't work): the held amount is released to the local.
 * The guest's money already left the wallet at hold time — this flips the record (once) so it can never come back.
 */
export function checkInBooking(id: string, method: 'bump' | 'qr' = 'bump', now = Date.now(), coords?: GeoPoint | null): Booking | null {
  const b = state.bookings[id]
  if (!b || b.status !== 'held') return null
  // the same gate the bump screen shows: inside the booking window and (with location) at the venue
  if (!canRelease(id, now, coords).ok) return null
  const next: Booking = { ...b, status: 'released', metAt: now, releasedAt: now, method, updatedAt: now }
  const lk = partnerKey(b.localId)
  const g = state.guest[lk]
  const guest = g && g.bookingId === id ? { ...state.guest, [lk]: { ...g, releasedAt: now, updatedAt: now } } : state.guest
  // demo: when THIS device is the local, her 80 % lands in her wallet now through the existing demo credit path
  // (the same trusted credit the demo "+฿500 test cash" uses) — real payouts are the server's job.
  const creditHere = isDemoSession() && partnerKey(b.localId) === partnerKey(currentViewerId()) && !b.heldHere
  commit({ ...state, bookings: { ...state.bookings, [id]: creditHere ? { ...next, creditedHere: true } : next }, guest })
  if (creditHere) {
    dispatchInternalWalletDelta({ paidDelta: Math.round(b.localReceiveThb * 100), allowEscrowRefund: true, note: `${KRING_RELEASE_NOTE} · ${b.guestName} · ${id}` })
  }
  emit(RELEASE_EVENT, { bookingId: id, method, localName: b.localName, guestName: b.guestName, amountThb: b.heldThb, localReceiveThb: b.localReceiveThb })
  return next
}

/** Runs `fn` after the next paint (rAF → setTimeout 0); straight away where there is no window (node tests). */
export function afterPaint(fn: () => void) {
  if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') {
    fn()
    return
  }
  window.requestAnimationFrame(() => window.setTimeout(fn, 0))
}

const pendingCheckIns = new Set<string>()

/**
 * KRING FIX2 · Marco 1 — the bump's contact frame paints first. Same gate and the SAME result as `checkInBooking`
 * (checked now, with the same `now` and coords), but the store write, the local's demo credit and the
 * `kring:released` event run after the next paint, so the seam flash and the haptic are not held up by them.
 * Returns the booking as it will be once released (null when the gate refuses — nothing is scheduled then).
 * `onCommitted` gets what `checkInBooking` returned once it ran.
 */
export function checkInBookingAfterPaint(
  id: string,
  method: 'bump' | 'qr' = 'bump',
  now = Date.now(),
  coords?: GeoPoint | null,
  onCommitted?: (b: Booking | null) => void,
): Booking | null {
  const b = state.bookings[id]
  if (!b || b.status !== 'held' || pendingCheckIns.has(id)) return null
  if (!canRelease(id, now, coords).ok) return null
  pendingCheckIns.add(id)
  afterPaint(() => {
    pendingCheckIns.delete(id)
    const done = checkInBooking(id, method, now, coords)
    onCommitted?.(done)
  })
  return { ...b, status: 'released', metAt: now, releasedAt: now, method, updatedAt: now }
}

/** wallet note on the local's demo credit at the bump (folded into the booking's one line) */
export const KRING_RELEASE_NOTE = 'Kring booking released'

/** The guest cancels a held booking: refund per the rules, through the same refund call (once). */
export function cancelBooking(id: string, now = Date.now()): number {
  const b = state.bookings[id]
  if (!b || b.status !== 'held') return 0
  const back = b.heldHere ? cancelRefundThb(b, now) : 0
  const lk = partnerKey(b.localId)
  const g = state.guest[lk]
  const guest = g && g.bookingId === id ? { ...state.guest, [lk]: { ...g, status: 'cancelled' as const, refundedAt: now, updatedAt: now } } : state.guest
  commit({ ...state, bookings: { ...state.bookings, [id]: { ...b, status: 'cancelled', cancelledAt: now, refundThb: back, updatedAt: now } }, guest })
  refundThb(back, kringMoneyNote('refund', b.localName, b.id))
  // an extension held on top comes back with it
  if (b.heldHere) releaseExtensionHold(lk, now)
  return back
}

/** The local didn't show: full refund (the existing no-show protection). */
export function markLocalNoShow(id: string, now = Date.now()): number {
  const b = state.bookings[id]
  if (!b || b.status !== 'held') return 0
  const back = b.heldHere ? b.heldThb : 0
  const lk = partnerKey(b.localId)
  const g = state.guest[lk]
  const guest = g && g.bookingId === id ? { ...state.guest, [lk]: { ...g, status: 'cancelled' as const, refundedAt: now, updatedAt: now } } : state.guest
  commit({ ...state, bookings: { ...state.bookings, [id]: { ...b, status: 'no-show', cancelledAt: now, refundThb: back, updatedAt: now } }, guest })
  refundThb(back, kringMoneyNote('refund', b.localName, b.id))
  if (b.heldHere) releaseExtensionHold(lk, now)
  return back
}

/**
 * One review per side per booking. The guest reviews the local (`review`, the default — unchanged), the local reviews
 * the guest (`hostReview`, T3 · mutual reviews). A local can only review once the two have met (released at the bump).
 */
export function reviewBooking(id: string, review: Omit<BookingReview, 'at'>, now = Date.now(), by: PlanSide = 'guest'): Booking | null {
  const b = state.bookings[id]
  if (!b) return null
  if (by === 'host' ? b.hostReview || b.status !== 'released' : b.review) return null
  const stars = Math.max(1, Math.min(5, Math.round(review.stars)))
  const rec: BookingReview = { stars, tags: review.tags.slice(0, 6), text: review.text.slice(0, 280), at: now }
  const next: Booking = by === 'host' ? { ...b, hostReview: rec, updatedAt: now } : { ...b, review: rec, updatedAt: now }
  commit({ ...state, bookings: { ...state.bookings, [id]: next } })
  return next
}

/**
 * T3 · group booking with friends — what each person's share would be if the group splits the trip fee. Display only:
 * the booker still holds the WHOLE fee once (`createOffer` → one hold on the booker); friends settle with the booker.
 * Rounded up to a whole baht so the shares never add up to less than the fee.
 */
export function splitEachThb(priceThb: number, groupSize: number): number {
  const n = Math.max(1, Math.min(8, Math.round(groupSize || 1)))
  return Math.ceil(Math.max(0, priceThb) / n)
}

/** My review on this booking (guest → `review`, local → `hostReview`). */
export function myReview(b: Booking, side: PlanSide): BookingReview | undefined {
  return side === 'host' ? b.hostReview : b.review
}

/**
 * The other person's review of me — shown only once I have posted mine too (mutual, so nobody rates in reply to a
 * score they have already seen).
 */
export function theirReview(b: Booking, side: PlanSide): BookingReview | undefined {
  if (!myReview(b, side)) return undefined
  return side === 'host' ? b.review : b.hostReview
}

/* ---------------- events + demo counterpart + sweep ---------------- */

/** fired when an offer becomes a booking: detail { bookingId, offerId, by } */
export const BOOKING_EVENT = 'kring:booking'
/** fired when a booking is released at the bump / venue QR: detail { bookingId, method, localName, amountThb } */
export const RELEASE_EVENT = 'kring:released'

function emit(name: string, detail: Record<string, unknown>) {
  try {
    window.dispatchEvent(new CustomEvent(name, { detail }))
  } catch {
    // no window (tests in node)
  }
}

/** Offers / multi-requests whose window ran out give their hold back once. Returns ฿ back. */
export function sweepOffers(now = Date.now()): number {
  let back = 0
  for (const m of Object.values(state.multi)) {
    if (m.status === 'open' && now >= m.replyBy) back += releaseMultiRequest(m.id, 'expired', now)
  }
  const due = Object.values(state.offers).filter((o) => o.status === 'open' && !o.multiId && now >= o.replyBy)
  if (!due.length) return back
  let offers = state.offers
  const refunds: Array<{ thb: number; note: string }> = []
  for (const o of due) {
    // an offer riding on the sheet's hold expires with it — the hold sweep / the sheet gives that money back
    if (o.heldHere && o.heldThb > 0 && !o.holdKey) refunds.push({ thb: o.heldThb, note: kringMoneyNote('refund', o.localName, o.id) })
    offers = { ...offers, [o.id]: { ...o, status: 'expired', heldThb: 0, updatedAt: now, demoReplyAt: undefined } }
  }
  // the record flips first, so a second sweep can never refund twice
  commit({ ...state, offers })
  for (const r of refunds) {
    refundThb(r.thb, r.note)
    back += r.thb
  }
  return back
}

/** demo: the simulated other side answers (exported for tests; driven by `scheduleDemo` in the app). */
export function runDueOffers(now = Date.now()) {
  if (typeof window === 'undefined' || !isDemoSession()) return
  const th = uiThai()
  for (const o of Object.values(state.offers)) {
    if (!o.demoReplyAt || now < o.demoReplyAt || effectiveOfferStatus(o, now) !== 'open') continue
    const sim: PlanSide = o.lastBy === 'guest' ? 'host' : 'guest'
    const floor = o.fromThb ?? 0
    if (sim === 'host' && floor > 0 && o.terms.priceThb < floor && o.steps.length < 3) {
      // a sim local counters once at her own "from" price
      counterOffer(o.id, 'host', floor, now)
      const c = state.offers[o.id]
      if (c) commit({ ...state, offers: { ...state.offers, [o.id]: { ...c, demoReplyAt: undefined } } })
      island(th ? `${o.localName} เสนอกลับ ฿${floor.toLocaleString('en-US')}` : `${o.localName} countered · ฿${floor.toLocaleString('en-US')}`, 'gold', '💬')
      continue
    }
    // the simulated side is never this device's wallet: a sim guest pays from her own phone
    const b = acceptOffer(o.id, sim, now, { remote: sim === 'guest' && !o.heldHere })
    if (!b) {
      const c = state.offers[o.id]
      if (c) commit({ ...state, offers: { ...state.offers, [o.id]: { ...c, demoReplyAt: undefined } } })
      continue
    }
    const who = sim === 'host' ? o.localName : o.guestName
    island(th ? `${who} ตกลงแล้ว · จองแล้ว` : `${who} accepted · booked`, 'green', '✓')
  }
  sweepOffers(now)
}

/** the next moment an offer needs the timer (demo answers, reply windows) */
function nextOfferDue(now: number): number {
  let due = Infinity
  for (const o of Object.values(state.offers)) {
    if (o.status !== 'open') continue
    if (o.demoReplyAt) due = Math.min(due, o.demoReplyAt)
    if (!o.multiId && o.heldHere) due = Math.min(due, o.replyBy)
  }
  for (const m of Object.values(state.multi)) if (m.status === 'open') due = Math.min(due, m.replyBy)
  return Math.max(now, due)
}

/* ------------------------------------------------------------------ */
/* received gifts (host view)                                          */
/* ------------------------------------------------------------------ */

export function recordReceivedGift(guestKey: string, gift: Omit<ReceivedGift, 'id' | 'at'>, now = Date.now()): ReceivedGift | null {
  const k = partnerKey(guestKey)
  if (!k) return null
  const g: ReceivedGift = { ...gift, id: `gift-${k}-${now}`, at: now }
  commit({ ...state, gifts: { ...state.gifts, [k]: [...(state.gifts[k] ?? []), g] } })
  return g
}

/* ------------------------------------------------------------------ */
/* one-shot moments                                                    */
/* ------------------------------------------------------------------ */

export function hasSeen(key: string): boolean {
  return Boolean(state.seen[key])
}

export function markSeen(key: string) {
  if (state.seen[key]) return
  commit({ ...state, seen: { ...state.seen, [key]: Date.now() } })
}

/* ------------------------------------------------------------------ */
/* demo counterpart + hold sweep (one timer, only while something is due) */
/* ------------------------------------------------------------------ */

function island(text: string, tone: 'gold' | 'green' | 'red' | 'neutral', icon?: string) {
  window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone, icon } }))
}

function uiThai(): boolean {
  try {
    return document.documentElement.lang === 'th'
  } catch {
    return false
  }
}


/** The Clink sheet is open (it runs its own countdown and refunds its own expiry while it stays open). */
function clinkSheetOpen(): boolean {
  try {
    return Boolean(document.querySelector('[data-testid="clink-gift-sheet"]'))
  } catch {
    return false
  }
}

/** Event other surfaces use for the one "she agreed" moment (gold ring pulse once on the plan card). */
export const PLAN_AGREED_EVENT = 'chon:plan-agreed'

/**
 * Runs everything that is due now. Exported for tests (pass `now`); in the app it is driven by `scheduleDemo`.
 *  · demo: an expired held Clink is refunded once if the sheet that placed it is gone;
 *  · demo: the simulated other side answers an offer; reply windows that ran out give their hold back once.
 */
export function runDueDemo(now = Date.now()) {
  if (typeof window === 'undefined' || !isDemoSession()) return
  sweepHolds(now)
  runDueOffers(now)
}

/** Expired held Clinks go back to the wallet exactly once (demo sessions; real refunds are the server's job). */
export function sweepHolds(now = Date.now()) {
  if (typeof window === 'undefined' || !isDemoSession()) return
  const sheet = clinkSheetOpen()
  let guest = state.guest
  const refunds: GuestHold[] = []
  for (const h of Object.values(state.guest)) {
    if (h.status !== 'held') continue
    let cur = h
    if (!sheet && !cur.sheetGone) cur = { ...cur, sheetGone: true }
    if (now >= cur.replyBy) {
      // the sheet stayed open the whole time → it refunded its own expiry; otherwise this is the only refund
      if (cur.sheetGone || !sheet) refunds.push(cur)
      cur = { ...cur, status: 'expired', refundedAt: now, updatedAt: now }
    }
    if (cur !== h) guest = { ...guest, [h.hostId]: cur }
  }
  if (guest === state.guest) return
  // the record flips first, so a second sweep can never refund twice
  commit({ ...state, guest })
  for (const h of Object.values(guest)) if (h.status === 'expired') closeAdoptedOffers(h.hostId, 'expired', now)
  for (const h of refunds) {
    refundThb(h.offerThb, kringMoneyNote('refund', h.hostName, holdRef(h)))
    island(uiThai() ? `${h.hostName} ไม่ได้ตอบ · คืน ฿${h.offerThb.toLocaleString('en-US')} เข้ากระเป๋า` : `No reply from ${h.hostName} · ฿${h.offerThb.toLocaleString('en-US')} back in your wallet`, 'green', '↩️')
  }
}

let demoTimer: number | undefined
/** Arms ONE timeout for the next due moment (nothing runs at rest). */
function scheduleDemo() {
  if (typeof window === 'undefined') return
  if (demoTimer !== undefined) {
    window.clearTimeout(demoTimer)
    demoTimer = undefined
  }
  if (!isDemoSession()) return
  const now = Date.now()
  let due = Infinity
  // live holds: check every 2 s (tracks whether the Clink sheet closed) until they resolve
  if (Object.values(state.guest).some((h) => h.status === 'held')) due = Math.min(due, now + 2_000)
  // KRING: a simulated answer to an offer, or a request window that runs out
  due = Math.min(due, nextOfferDue(now))
  if (due === Infinity) return
  demoTimer = window.setTimeout(() => {
    demoTimer = undefined
    runDueDemo(Date.now())
    scheduleDemo()
  }, Math.max(0, Math.min(due - now, 2_147_000_000)))
}

/* ------------------------------------------------------------------ */
/* listeners: Clinks are sent on Meet while Chats may not be mounted.  */
/* ------------------------------------------------------------------ */

let installed = false
export function installPlanStoreListeners() {
  if (installed || typeof window === 'undefined') return
  installed = true
  window.addEventListener('chon:offer-status', (event: Event) => {
    const d = (event as CustomEvent<{ status?: string; hostName?: string; hostId?: string; offerBaht?: number; ref?: string }>).detail
    if (!d) return
    const id = d.hostId ?? d.hostName ?? ''
    if (d.status === 'HELD' && typeof d.offerBaht === 'number' && d.offerBaht > 0) {
      recordGuestHold(id, d.hostName ?? id, d.offerBaht, Date.now(), d.ref)
    } else if (d.status === 'CANCELLED' || d.status === 'EXPIRED') {
      releaseGuestHold(id || d.hostName || '', d.status === 'CANCELLED' ? 'cancelled' : 'expired')
    }
  })
  // another tab (or a reopened app) wrote tonight's plans → read them; a sign-in/out may switch demo ↔ real
  window.addEventListener('storage', (e: StorageEvent) => {
    if (e.key === null || e.key === NIGHT_STORE_PREFIX + PLAN_NIGHT_KEY || e.key === AUTH_KEY) rehydratePlanStore()
  })
  // whatever came due while the app was closed happens now (an ask she agreed to, a reply window that ran out)
  window.setTimeout(() => {
    runDueDemo()
    scheduleDemo()
  }, 0)
}

installPlanStoreListeners()

/** tests only */
export function __resetPlanStore() {
  state = empty()
  loadedDemo = isDemoSession()
  try {
    window.sessionStorage.removeItem(PLAN_STORE_KEY)
    window.localStorage.removeItem(NIGHT_STORE_PREFIX + PLAN_NIGHT_KEY)
  } catch {
    // ignore
  }
  if (demoTimer !== undefined) window.clearTimeout(demoTimer)
  demoTimer = undefined
  listeners.forEach((fn) => fn())
}
