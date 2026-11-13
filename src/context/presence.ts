import { useEffect, useState } from 'react'

/**
 * Local presence · Live / Paused (round-3 R2) + the go-live venue setting (round-2 A5/A6, spec "Offer card").
 *
 *  live                     what the Local chose. Paused hides the local from Experiences, Locals and search; chats,
 *                           bookings and wallet keep working.
 *  guestsMaySuggestVenue    "Guests may suggest another venue: Yes / No", chosen in "Before you go Live", default Yes,
 *                           editable any time from My profile.
 *
 * KRING FIX1 · Ploy 2/6/8 — switching to Local never makes you Live. Live needs (a) the one ID check done and
 * (b) at least one experience listed. Once someone has become a Local (`setup: true`) the stored choice only counts
 * while both are true, so `readPresence().live` (and selfGuard's getLiveState) can never say Live for an unchecked
 * account. A device that never set up a Local keeps the old default (Live) — nothing reads it there.
 *
 * Readers (Experiences/Locals grid, offer card, App header dot): `readPresence()` or `usePresence()`; listen to
 * PRESENCE_EVENT. Stored per device in localStorage `kring_presence_v1` (a real presence row is a backend stop-point).
 */
export interface ListedExperience {
  /** catalogue id (src/lib/experiences.ts) or a shared listing's own id ("share-…") */
  id: string
  /** her own "from" price (trip fee) */
  priceThb: number
  /** T3 · this listing's own Live / Paused. Absent = Live (back-compat with listings saved before T3). */
  live?: boolean
  /** T3 share flow ("＋ Share something you love"): her own name for it, when not a catalogue title */
  title?: string
  titleTh?: string
  /** public area / venue */
  area?: string
  /** photo (data: URL or remote) */
  photo?: string
  /** 'travellers' | 'thais' | 'two-way' (who it is for) */
  tag?: string
  /** ISO time it was first shared */
  createdAt?: string
}

export interface Presence {
  /** effective: the choice AND (once a Local was set up) the ID check + an experience */
  live: boolean
  guestsMaySuggestVenue: boolean
  /** ISO time of the last switch */
  changedAt?: string
  /** this device set up a Local (role switch) — from then on Live needs the checks */
  setup?: boolean
  /** what she hosts (at least one before going Live) */
  experiences?: ListedExperience[]
  /** the stored choice before the checks were applied */
  wantsLive?: boolean
}

export const PRESENCE_KEY = 'kring_presence_v1'
export const PRESENCE_EVENT = 'kring:presence'
export const DEFAULT_PRESENCE: Presence = { live: true, guestsMaySuggestVenue: true }

/* ------------------------------------------------------------------------------------------------ */
/* the one ID check (per account, on this device — the real check is the ID partner, a stop-point)   */
/* ------------------------------------------------------------------------------------------------ */

export const ID_CHECK_KEY = 'kring_id_check_v1'
export const ID_CHECK_EVENT = 'kring:id-check'
const AUTH_KEY = 'chon_auth_session_v1'

function currentUserId(): string {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    const s = raw ? (JSON.parse(raw) as { userId?: string }) : null
    return s?.userId ? String(s.userId) : ''
  } catch {
    return ''
  }
}

function readChecks(): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(ID_CHECK_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** ISO time the signed-in account passed the ID check, or null. */
export function idVerifiedAt(userId = typeof window === 'undefined' ? '' : currentUserId()): string | null {
  if (typeof window === 'undefined' || !userId) return null
  const at = readChecks()[userId]
  return typeof at === 'string' && at ? at : null
}
export function isIdVerified(userId?: string): boolean {
  return Boolean(idVerifiedAt(userId))
}
/** Demo / preview: the quick check marks the account verified (the real one is done by the ID partner). */
export function markIdVerified(userId = currentUserId(), now = new Date()): void {
  if (typeof window === 'undefined' || !userId) return
  const wasLive = readPresence().live
  const all = { ...readChecks(), [userId]: now.toISOString() }
  try {
    window.localStorage.setItem(ID_CHECK_KEY, JSON.stringify(all))
  } catch {
    // storage blocked: the event still updates open screens
  }
  window.dispatchEvent(new CustomEvent(ID_CHECK_EVENT, { detail: { userId, at: all[userId] } }))
  // a Local who was waiting only on the check may now be Live → tell the readers
  const p = readPresence()
  window.dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: p }))
  if (p.live !== wasLive) window.dispatchEvent(new CustomEvent(LIVE_CHANGED_EVENT, { detail: { state: p.live ? 'live' : 'paused' } }))
}
export function useIdVerified(): boolean {
  const [v, setV] = useState(() => (typeof window === 'undefined' ? false : isIdVerified()))
  useEffect(() => {
    const on = () => setV(isIdVerified())
    on()
    window.addEventListener(ID_CHECK_EVENT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(ID_CHECK_EVENT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return v
}

/* ------------------------------------------------------------------------------------------------ */
/* presence                                                                                          */
/* ------------------------------------------------------------------------------------------------ */

interface Stored {
  live?: boolean
  guestsMaySuggestVenue?: boolean
  changedAt?: string
  setup?: boolean
  experiences?: ListedExperience[]
}

function readStored(): Stored {
  try {
    const raw = window.localStorage.getItem(PRESENCE_KEY)
    return raw ? (JSON.parse(raw) as Stored) : {}
  } catch {
    return {}
  }
}

const OPT_STRINGS = ['title', 'titleTh', 'area', 'photo', 'tag', 'createdAt'] as const

function cleanExperiences(v: unknown): ListedExperience[] {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  return v
    .filter((x): x is ListedExperience => Boolean(x) && typeof (x as ListedExperience).id === 'string' && Number.isFinite((x as ListedExperience).priceThb))
    .filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)))
    .map((x) => {
      const out: ListedExperience = { id: x.id, priceThb: Math.max(0, Math.round(x.priceThb)) }
      if (typeof x.live === 'boolean') out.live = x.live
      for (const k of OPT_STRINGS) if (typeof x[k] === 'string' && x[k]) out[k] = x[k]
      return out
    })
}

/** a listing is switched on (its own choice; the effective state also needs the ID check — see `isListingLive`) */
const listingOn = (x: Pick<ListedExperience, 'live'>) => x.live !== false

/** What is still missing before this Local can go Live (empty = ready). */
export function liveBlockers(p: Pick<Presence, 'experiences'> = readPresence()): Array<'id' | 'experience'> {
  const out: Array<'id' | 'experience'> = []
  if (!(p.experiences ?? []).length) out.push('experience')
  return out
}

export function canAcceptFirstPaidBooking(): boolean {
  return isIdVerified()
}

export function readPresence(): Presence {
  if (typeof window === 'undefined') return { ...DEFAULT_PRESENCE }
  try {
    const p = readStored()
    const wants = typeof p.live === 'boolean' ? p.live : true
    const experiences = cleanExperiences(p.experiences)
    const setup = p.setup === true
    // T3 · Templates First (<10s): account can go Live as soon as a template listing is switched on; ID verified before 1st paid booking
    const ready = !setup || experiences.some(listingOn)
    return {
      live: wants && ready,
      wantsLive: wants,
      guestsMaySuggestVenue: typeof p.guestsMaySuggestVenue === 'boolean' ? p.guestsMaySuggestVenue : true,
      changedAt: typeof p.changedAt === 'string' ? p.changedAt : undefined,
      setup,
      experiences,
    }
  } catch {
    return { ...DEFAULT_PRESENCE }
  }
}

/** Same name as `LIVE_EVENT` in lib/selfGuard (K2's Experiences listens to it); duplicated to avoid an import cycle. */
export const LIVE_CHANGED_EVENT = 'kring:live-changed'

export function writePresence(patch: Partial<Omit<Presence, 'wantsLive'>>): Presence {
  const before = readPresence()
  const prev = readStored()
  const next: Stored = { ...prev, ...patch, changedAt: new Date().toISOString() }
  if ('experiences' in patch) next.experiences = cleanExperiences(patch.experiences)
  // T3 · the account-wide switch (legacy callers: HostHome, selfGuard.setLiveState) drives every listing:
  // Pause = all listings Paused; Live with none switched on = all back on.
  if (typeof patch.live === 'boolean' && !('experiences' in patch)) {
    const list = cleanExperiences(next.experiences)
    if (list.length && (!patch.live || !list.some(listingOn))) next.experiences = list.map((x) => ({ ...x, live: patch.live }))
  }
  try {
    window.localStorage.setItem(PRESENCE_KEY, JSON.stringify(next))
  } catch {
    // storage blocked → the event still updates open screens
  }
  const after = readPresence()
  try {
    window.dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: after }))
    if ('live' in patch || before.live !== after.live) {
      window.dispatchEvent(new CustomEvent(LIVE_CHANGED_EVENT, { detail: { state: after.live ? 'live' : 'paused' } }))
    }
  } catch {
    // ignore
  }
  return after
}

/**
 * KRING FIX2 · Ploy 4: re-tell every reader (Experiences / Locals self card — selfGuard `useSelfLocal`, the header dot)
 * after something presence depends on changed outside this store — a role switch (the auth session's role decides
 * whether `selfLocalCard()` exists) or a profile edit (name / photo / city on the card).
 */
export function announcePresence(): Presence {
  const p = readPresence()
  if (typeof window === 'undefined') return p
  try {
    window.dispatchEvent(new CustomEvent(PRESENCE_EVENT, { detail: p }))
    window.dispatchEvent(new CustomEvent(LIVE_CHANGED_EVENT, { detail: { state: p.live ? 'live' : 'paused' } }))
  } catch {
    // ignore
  }
  return p
}

/**
 * KRING FIX3 · Marco 4: the moment the UI may SAY Live / Paused. My profile fires it on the Go Live rings' contact frame
 * (and at once on Pause), so the header pill, title, subline and chip flip on the same frame. The presence state itself
 * (PRESENCE_EVENT / LIVE_CHANGED_EVENT) still changes the moment it is saved — readers that gate behaviour use that.
 * detail: { state: 'live' | 'paused' }
 */
export const LIVE_SHOWN_EVENT = 'kring:live-shown'
export function announceLiveShown(state: 'live' | 'paused'): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(LIVE_SHOWN_EVENT, { detail: { state } }))
  } catch {
    // ignore
  }
}

/**
 * A role switch to Local: never Live on its own. Marks the device as set up and Paused; she goes Live from My profile
 * once the ID check and one experience are done.
 */
export function startLocalSetup(): Presence {
  return writePresence({ setup: true, live: false })
}

/* ------------------------------------------------------------------------------------------------ */
/* T3 · listings ("Your experiences") — per-listing Live / Paused; anyone can share                   */
/* ------------------------------------------------------------------------------------------------ */

/** Is this listing visible to guests now? Its own switch AND the ID check (the account's presence.live). */
export function isListingLive(id: string, p: Presence = readPresence()): boolean {
  const x = (p.experiences ?? []).find((e) => e.id === id)
  return Boolean(x && listingOn(x) && p.live)
}

/** The listings guests can see right now (empty while the ID check is missing or everything is Paused). */
export function liveListings(p: Presence = readPresence()): ListedExperience[] {
  return p.live ? (p.experiences ?? []).filter(listingOn) : []
}

/** Has at least one listing (AuthContext.isHosting also counts the legacy host role and host bookings). */
export function hasListings(p: Pick<Presence, 'experiences'> = readPresence()): boolean {
  return (p.experiences ?? []).length > 0
}

/**
 * Create or update one listing (the share flow's final step, or Me › Your experiences). Marks the device as set up, so
 * Live keeps needing the ID check. `live: true` switches this listing on (guests see it once the ID check is done).
 * Fires PRESENCE_EVENT (+ LIVE_CHANGED_EVENT when the account's Live state changes).
 */
export function upsertListing(input: ListedExperience): Presence {
  const prev = readStored()
  const list = cleanExperiences(prev.experiences)
  const i = list.findIndex((x) => x.id === input.id)
  const merged: ListedExperience = { ...(i >= 0 ? list[i] : { createdAt: new Date().toISOString() }), ...input }
  const next = i >= 0 ? list.map((x, j) => (j === i ? merged : x)) : [...list, merged]
  return writePresence({ setup: true, experiences: next, live: next.some(listingOn) })
}

/** Switch ONE listing Live / Paused (the others keep their own state). */
export function setListingLive(id: string, on: boolean): Presence {
  const list = cleanExperiences(readStored().experiences)
  if (!list.some((x) => x.id === id)) return readPresence()
  const next = list.map((x) => (x.id === id ? { ...x, live: on } : x))
  return writePresence({ setup: true, experiences: next, live: next.some(listingOn) })
}

export function removeListing(id: string): Presence {
  const next = cleanExperiences(readStored().experiences).filter((x) => x.id !== id)
  return writePresence({ experiences: next, live: next.some(listingOn) })
}

/**
 * Ask the share flow ("＋ Share something you love", W2's 3-step sheet) to open. detail: { source, handled }.
 * The sheet's listener sets `detail.handled = true`; returns false when nobody took it (callers fall back).
 */
export const OPEN_SHARE_EVENT = 'kring:open-share'
export function openShareFlow(source: 'me' | 'experiences' | 'profile' | string = 'me'): boolean {
  if (typeof window === 'undefined') return false
  const detail: { source: string; handled?: boolean } = { source }
  try {
    window.dispatchEvent(new CustomEvent(OPEN_SHARE_EVENT, { detail }))
  } catch {
    // ignore
  }
  return detail.handled === true
}

export function usePresence(): Presence {
  const [p, setP] = useState<Presence>(() => (typeof window === 'undefined' ? { ...DEFAULT_PRESENCE } : readPresence()))
  useEffect(() => {
    const on = () => setP(readPresence())
    window.addEventListener(PRESENCE_EVENT, on)
    window.addEventListener(ID_CHECK_EVENT, on)
    window.addEventListener('storage', on)
    return () => {
      window.removeEventListener(PRESENCE_EVENT, on)
      window.removeEventListener(ID_CHECK_EVENT, on)
      window.removeEventListener('storage', on)
    }
  }, [])
  return p
}
