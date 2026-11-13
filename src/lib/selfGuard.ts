/**
 * Kring · silent self-guard (K2).
 *
 * Rule (locked, round 3 R5): you can't book, request, gift or offer yourself.
 * Wherever your own profile shows up (Experiences feed, Locals grid, story
 * rings, pins, share cards, search), the action buttons are simply ABSENT and
 * a quiet "✎ Edit" link sits where they would be. No banner, no toast, no
 * disabled-grey button.
 *
 * Usage (everyone):
 *   import { isSelf } from '../lib/selfGuard'
 *   if (isSelf(host.id)) → render the quiet edit link instead of Book/Offer
 *
 * `isSelf(idOrName)` with ONE argument compares against the signed-in identity:
 *   1. whatever was last registered with `setSelfIdentity()` (AuthProvider / App
 *      can call it on sign-in; optional), else
 *   2. the persisted session in localStorage (`chon_auth_session_v1`) plus the
 *      onboarding profile name (`chon_profile_v1`) and any host ids the user
 *      has published (`kring_self_host_ids_v1`).
 * Passing `me` explicitly (second arg) keeps the original stub signature.
 *
 * Comparison is case- and whitespace-insensitive; empty values never match.
 */

export interface SelfIdentity {
  userId?: string | null
  displayName?: string | null
  /** Extra ids this user is known by (their host card id, agency roster id…). */
  aliases?: Array<string | null | undefined>
}

import { useEffect, useState } from 'react'
import { ID_CHECK_EVENT, LIVE_CHANGED_EVENT, PRESENCE_EVENT, liveListings, readPresence, writePresence, type ListedExperience } from '../context/presence'

const AUTH_KEY = 'chon_auth_session_v1'
const PROFILE_KEY = 'chon_profile_v1'
const SELF_IDS_KEY = 'kring_self_host_ids_v1'

let registered: SelfIdentity | null = null
const listeners = new Set<() => void>()

function norm(v: unknown): string {
  return String(v ?? '').trim().toLowerCase()
}

/** Register the signed-in identity (call on sign-in; pass null on sign-out). */
export function setSelfIdentity(me: SelfIdentity | null): void {
  registered = me
  listeners.forEach((fn) => fn())
}

/** Remember an extra id that is "me" (e.g. the host card id created at go-live). */
export function addSelfAlias(id: string): void {
  if (!id) return
  try {
    const list = readAliases()
    if (!list.includes(id)) {
      window.localStorage.setItem(SELF_IDS_KEY, JSON.stringify([...list, id]))
      listeners.forEach((fn) => fn())
    }
  } catch {
    /* storage blocked — the explicit identity still works */
  }
}

function readAliases(): string[] {
  try {
    const raw = window.localStorage.getItem(SELF_IDS_KEY)
    const arr = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

/** The identity used when `isSelf` is called with one argument. */
export function currentSelf(): SelfIdentity | null {
  if (registered) return registered
  if (typeof window === 'undefined') return null
  const out: SelfIdentity = { aliases: readAliases() }
  try {
    const raw = window.localStorage.getItem(AUTH_KEY)
    if (raw) {
      const s = JSON.parse(raw) as { userId?: string; displayName?: string }
      out.userId = s?.userId
      out.displayName = s?.displayName
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY)
    if (raw) {
      const p = JSON.parse(raw) as { name?: string }
      if (p?.name) out.aliases = [...(out.aliases ?? []), p.name]
    }
  } catch {
    /* ignore */
  }
  return out.userId || out.displayName || out.aliases?.length ? out : null
}

/**
 * True when `idOrName` belongs to the signed-in user.
 * Demo-mode generic names ("Demo Traveler") never match a catalogue host.
 */
export function isSelf(
  idOrName: string | undefined | null,
  me?: { userId?: string | null; displayName?: string | null; aliases?: Array<string | null | undefined> } | null,
): boolean {
  const a = norm(idOrName)
  if (!a) return false
  const who = me === undefined ? currentSelf() : me
  if (!who) return false
  const keys = [who.userId, who.displayName, ...(who.aliases ?? [])].map(norm).filter(Boolean)
  return keys.includes(a)
}

/** True when ANY of the given ids/names is the user (e.g. check id and name together). */
export function isSelfAny(...ids: Array<string | undefined | null>): boolean {
  const me = currentSelf()
  return ids.some((id) => isSelf(id, me))
}

/** Subscribe to identity changes (for components that cache the result). */
export function onSelfChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ── Live / Paused (your own profile's visibility) ──────────────────────────
/*
 * Paused = your local profile is hidden from Experiences, Locals and search; everything else keeps working.
 * Default Live. K1's My profile switch should call `setLiveState('paused' | 'live')`; Experiences/Locals read
 * `isSelfPaused()` and re-render on `kring:live-changed`.
 */
export type LiveState = 'live' | 'paused'
/** Legacy key; integration made K1's presence store (`kring_presence_v1`) the single source of truth. */
export const LIVE_STATE_KEY = 'kring_live_state_v1'
export const LIVE_EVENT = LIVE_CHANGED_EVENT

export function getLiveState(): LiveState {
  if (typeof window === 'undefined') return 'live'
  return readPresence().live ? 'live' : 'paused'
}
/** Writes K1's presence store (which fires `kring:presence` and `kring:live-changed`). */
export function setLiveState(next: LiveState): void {
  if (typeof window === 'undefined') return
  writePresence({ live: next === 'live' })
}
export function isSelfPaused(): boolean {
  return getLiveState() === 'paused'
}

/** Ask the app to open your own profile editor (K1's My profile listens). */
export const EDIT_PROFILE_EVENT = 'kring:edit-profile'
export function openEditProfile(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EDIT_PROFILE_EVENT))
}

// ── Your own Local card (KRING FIX2 · Ploy 4: "Going Live doesn't put me in the Locals grid") ─────────────
/*
 * Anyone who shared an experience (T3: no role switch), passed the ID check and is Live (presence.live). Until a
 * real host row exists (backend stop-point) her card is built on this device from what she entered: name + photo
 * (onboarding profile), city, and the experiences she listed with her own prices. MeetFeed puts it in the Locals grid
 * (first, as your own card: ✎ instead of 📌, no Book) and in Experiences under every experience she listed.
 * `id` is the signed-in userId, so `isSelf(id)` is true everywhere (no Book / Offer / Pin on yourself).
 * Paused, not verified, nothing listed, or not a Local → null (she is hidden, exactly as the preview says).
 */
export interface SelfLocal {
  id: string
  name: string
  photo?: string
  city: 'Bangkok' | 'Pattaya'
  langs: string[]
  experiences: ListedExperience[]
}

function readSession(): { userId?: string; displayName?: string; role?: string; isDemoMode?: boolean } | null {
  for (const store of [window.localStorage, window.sessionStorage]) {
    try {
      const raw = store.getItem(AUTH_KEY)
      if (raw) return JSON.parse(raw)
    } catch {
      /* ignore */
    }
  }
  return null
}

export function selfLocalCard(): SelfLocal | null {
  if (typeof window === 'undefined') return null
  const s = readSession()
  if (!s?.userId) return null
  // T3 · no modes: anyone who shared something (presence `setup` + a listing, ID ✓, Live) has a card — the stored
  // role no longer decides it (kept for back-compat only)
  const p = readPresence()
  // T3 · only listings switched Live (per listing) and only after the ID check (liveListings is empty otherwise)
  const live = liveListings(p).map((x) => ({ id: x.id, priceThb: x.priceThb }))
  if (!p.setup || !live.length) return null
  let prof: { name?: string; photo?: string; city?: string; langs?: string[] } | null = null
  try {
    prof = JSON.parse(window.localStorage.getItem(PROFILE_KEY) ?? 'null')
  } catch {
    prof = null
  }
  const generic = /^(demo traveler|demo traveller|traveller|traveler|guest|you)$/i
  const name = [prof?.name, s.displayName].map((x) => String(x ?? '').trim()).find((x) => x && !generic.test(x)) ?? 'You'
  return {
    id: String(s.userId),
    name,
    photo: prof?.photo || undefined,
    city: prof?.city === 'Pattaya' ? 'Pattaya' : 'Bangkok',
    langs: prof?.langs?.length ? prof.langs : ['th', 'en'],
    experiences: live,
  }
}

/** `selfLocalCard()` that re-reads on go-live / pause / ID check / profile edits. */
export function useSelfLocal(): SelfLocal | null {
  const [v, setV] = useState<SelfLocal | null>(() => selfLocalCard())
  useEffect(() => {
    const on = () =>
      setV((cur) => {
        const next = selfLocalCard()
        return JSON.stringify(next) === JSON.stringify(cur) ? cur : next
      })
    on()
    const evs = [PRESENCE_EVENT, LIVE_CHANGED_EVENT, ID_CHECK_EVENT, 'chon:profile-updated', 'storage', 'focus']
    evs.forEach((e) => window.addEventListener(e, on))
    const off = onSelfChange(on)
    return () => {
      evs.forEach((e) => window.removeEventListener(e, on))
      off()
    }
  }, [])
  return v
}
