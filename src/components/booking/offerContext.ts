/**
 * Kring · what the booking / offer sheet is about (K3).
 *
 * The sheet (meet/ClinkGiftSheet) is opened by App for a local (`chon:open-host-profile` / Meet's onSelectHost). When
 * the guest came from an EXPERIENCE (ExperienceDetail "Make an offer", MultiRequestSheet…), call
 * `setOfferContext({ experienceId, title, fromThb, venue, hours })` first — or dispatch
 * `window.dispatchEvent(new CustomEvent('kring:offer-context', { detail: {...} }))` — and the sheet opens with that
 * experience, its "from" price, its public venue and its usual length. Without a context the sheet uses the local's
 * card price and venue, as before. The context is read once per local and kept for 10 minutes.
 */
export interface OfferContext {
  /** the local this context is for (id or name) — omitted = whoever the sheet opens next */
  localId?: string
  experienceId?: string
  title?: string
  titleTh?: string
  fromThb?: number
  venue?: string
  /** usual length in hours (sets the end time) */
  hours?: number
  /** 'YYYY-MM-DD' */
  date?: string
  start?: string
  groupSize?: number
}

let ctx: (OfferContext & { at: number }) | null = null
const TTL = 10 * 60_000
/** K2's MeetFeed / Experiences hand the plan over here too (the sheet chunk is lazy and may load after the event) */
export const OFFER_CTX_KEY = 'kring_offer_ctx_v1'

/** Accepts both shapes: ours, and K2's { hostId, experienceTitle, end, … }. */
function normalise(raw: Record<string, unknown> | null | undefined): OfferContext | null {
  if (!raw || typeof raw !== 'object') return null
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined)
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
  const start = str(raw.start)
  const end = str(raw.end)
  let hours = num(raw.hours)
  if (!hours && start && end && /^\d{1,2}:\d{2}$/.test(start) && /^\d{1,2}:\d{2}$/.test(end)) {
    const [sh, sm] = start.split(':').map(Number)
    const [eh, em] = end.split(':').map(Number)
    const mins = (((eh * 60 + em - (sh * 60 + sm)) % 1440) + 1440) % 1440
    if (mins > 0) hours = mins / 60
  }
  return {
    localId: str(raw.localId) ?? str(raw.hostId),
    experienceId: str(raw.experienceId),
    title: str(raw.title) ?? str(raw.experienceTitle),
    titleTh: str(raw.titleTh) ?? str(raw.experienceTitleTh),
    fromThb: num(raw.fromThb),
    venue: str(raw.venue),
    hours,
    date: str(raw.date),
    start,
    groupSize: num(raw.groupSize),
  }
}

export function setOfferContext(c: OfferContext | null) {
  const n = normalise(c as unknown as Record<string, unknown>)
  ctx = n ? { ...n, at: Date.now() } : null
}

function fromSession(): (OfferContext & { at: number }) | null {
  try {
    const raw = typeof window !== 'undefined' ? window.sessionStorage.getItem(OFFER_CTX_KEY) : null
    const n = raw ? normalise(JSON.parse(raw) as Record<string, unknown>) : null
    return n ? { ...n, at: Date.now() } : null
  } catch {
    return null
  }
}

/** The context for this local (or a local-agnostic one), if fresh. */
export function peekOfferContext(localIdOrName?: string): OfferContext | null {
  if (!ctx || Date.now() - ctx.at > TTL) ctx = fromSession()
  if (!ctx || Date.now() - ctx.at > TTL) return null
  if (ctx.localId && localIdOrName) {
    const norm = (s: string) => s.trim().toLowerCase().replace(/^host-/, '')
    if (norm(ctx.localId) !== norm(localIdOrName)) return null
  }
  return ctx
}

if (typeof window !== 'undefined') {
  window.addEventListener('kring:offer-context', (e: Event) => {
    const d = (e as CustomEvent<Record<string, unknown> | null>).detail
    setOfferContext((d as unknown as OfferContext) ?? null)
  })
}

/** The offer was sent: the context is used up (the next sheet for this local starts from her card again). */
export function clearOfferContext() {
  ctx = null
  try {
    window.sessionStorage.removeItem(OFFER_CTX_KEY)
  } catch {
    // storage blocked
  }
}

/* ------------------------------------------------------------------ */
/* KRING FIX2 · ONE booking sheet                                      */
/* ------------------------------------------------------------------ */

/** the event the Kring "Book a local" sheet listens to (ExperiencesTab's BOOK_LOCAL_EVENT, same string) */
export const BOOK_LOCAL_EVENT_NAME = 'kring:book-local'
/** a booking asked for while Experiences is not mounted (e.g. from a chat) — the sheet opens once it is */
export const BOOK_PENDING_KEY = 'kring_book_pending_v1'

/**
 * FIX2 · Wei 18–19 — every "Book" (chat ฿ orb, chat + panel, the room's Book line) opens the ONE Kring "Book a local"
 * sheet with the experience's real price — never the old offer sheet. Experiences may not be mounted (the guest is in
 * Chats): we switch to it and re-ask until the sheet is on screen (`mr-send`), then drop the pending request.
 */
export function openKringBooking(detail: { hostId: string; experienceId?: string }) {
  if (typeof window === 'undefined') return
  const hostId = /^host-/.test(detail.hostId) ? detail.hostId : `host-${detail.hostId.trim().toLowerCase()}`
  const d = { hostId, ...(detail.experienceId ? { experienceId: detail.experienceId } : {}) }
  const open = () => Boolean(document.querySelector('[data-testid="mr-send"]'))
  const clear = () => {
    try {
      window.sessionStorage.removeItem(BOOK_PENDING_KEY)
    } catch {
      // storage blocked
    }
  }
  try {
    window.sessionStorage.setItem(BOOK_PENDING_KEY, JSON.stringify({ ...d, at: Date.now() }))
  } catch {
    // storage blocked: the retries below still open it
  }
  window.dispatchEvent(new CustomEvent('chon:navigate', { detail: { tab: 'meet' } }))
  window.dispatchEvent(new CustomEvent(BOOK_LOCAL_EVENT_NAME, { detail: d }))
  if (open()) return clear()
  let tries = 0
  const retry = () => {
    if (open()) return clear()
    let pending: string | null = null
    try {
      pending = window.sessionStorage.getItem(BOOK_PENDING_KEY)
    } catch {
      pending = 'x'
    }
    if (!pending) return
    window.dispatchEvent(new CustomEvent(BOOK_LOCAL_EVENT_NAME, { detail: d }))
    if (open() || ++tries >= 8) return clear()
    window.setTimeout(retry, 200)
  }
  window.setTimeout(retry, 120)
}
