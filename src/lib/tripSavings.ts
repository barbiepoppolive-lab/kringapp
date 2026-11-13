import { useEffect, useState } from 'react'

import { FLOOR_PRICES } from '../components/pulse/floorPrices'
import { currentViewerId, getPlanStore, partnerKey, subscribePlanStore, type Booking } from './planStore'

/**
 * Atlas integration #7 · trip savings (display only — no coins, no ledger).
 *
 * ROUND5 · ONE baseline everywhere (Wei B9): a saving is FLOOR − OURS, the floor being the cheapest real price we found
 * elsewhere today (pulse/floorPrices.ts) — the same "save ฿20" the Pulse rows print. Never the tourist walk-in price.
 * Pulse records each item the traveller booked; the Wallet ("You saved ฿X"), the Pulse hero and the top-up sheet read
 * the sum. One entry per item key, so booking the same thing twice never double-counts.
 * ฿0 until something is booked — there is no demo seed any more (a "You saved ฿706" with no booking was a lie).
 */
export const TRIP_SAVED_KEY = 'chon_trip_saved_thb_v1'
export const TRIP_SAVED_ITEMS_KEY = 'chon_trip_saved_items_v1'
export const TRIP_SAVED_EVENT = 'chon:trip-saved'
/** NEXT95 · G3: when each item was booked and the price paid to the partner (Wallet timeline; display only). */
export const TRIP_SAVED_META_KEY = 'chon_trip_saved_meta_v1'
/** @deprecated ROUND5: no demo seed — kept at 0 so old imports compile and can never show an unbooked saving. */
export const TRIP_SAVED_DEMO_THB = 0

/**
 * The floor for an item key Pulse records ('esim', 'ride:airport', 'arrival:bag', 'date:table' …) at the price paid.
 * Looks the item up in the one floor table, preferring the row whose "ours" equals what was paid. Null when unknown.
 */
export function floorForTripItem(itemKey: string, oursThb: number): number | null {
  const tail = itemKey.split(':').pop() ?? itemKey
  const cands = Object.entries(FLOOR_PRICES).filter(([k]) => {
    if (itemKey === 'esim') return k.startsWith('esim:')
    if (itemKey.startsWith('ride:')) {
      const zone = itemKey.split(':')[1]
      return k === `ride:${zone}:comfort` || k === `ride:${zone}:xl` || k === `ride:${zone}:tuk` || (zone === 'airport' && k === 'cab:airport')
    }
    return k === tail || k === itemKey
  })
  if (cands.length === 0) return null
  const exact = cands.find(([, f]) => f.oursThb === Math.round(oursThb))
  if (exact) return exact[1].floorThb
  return Math.min(...cands.map(([, f]) => f.floorThb))
}

export interface TripSavedMeta {
  at: number
  paidThb?: number
}
export interface TripSavedEntry {
  key: string
  savedThb: number
  paidThb?: number
  at: number
  /** KRING FIX1: a completed Kring booking ("Yaowarat street-food walk · Kwan") */
  label?: string
  /** where the comparison price came from, when a saving is claimed ("Klook app · checked 20 Oct") */
  source?: string
}

/* ------------------------------------------------------------------------------------------------ */
/* KRING FIX1 · Wei 7/8 — completed Kring bookings count, savings only where we can prove them        */
/* ------------------------------------------------------------------------------------------------ */

/**
 * The dated reference table for EXPERIENCES: the cheapest comparable product we found elsewhere, with its source and
 * the day it was checked. A completed booking claims `elsewhere − paid` ONLY when its experience is listed here (and
 * never below ฿0); otherwise it counts as a booking and claims nothing. Empty on purpose until someone checks a
 * real comparable price — add rows as `{ experienceId: { elsewhereThb, source, checked } }`.
 */
export interface ExperienceReference {
  elsewhereThb: number
  source: { en: string; th: string }
  /** 'YYYY-MM-DD' */
  checked: string
}
export const EXPERIENCE_REFERENCE: Record<string, ExperienceReference> = {}

/** A guest's bookings that were completed (released at the กริ๊ง! bump / venue QR), newest first. */
export function completedKringBookings(viewer = currentViewerId()): Booking[] {
  if (typeof window === 'undefined') return []
  const me = partnerKey(viewer)
  return Object.values(getPlanStore().bookings ?? {})
    .filter((b) => b.status === 'released' && (b.heldHere || partnerKey(b.guestId) === me) && partnerKey(b.localId) !== me)
    .sort((a, b) => (b.releasedAt ?? b.updatedAt) - (a.releasedAt ?? a.updatedAt))
}

/** What one completed booking saved: elsewhere − paid from the dated table, else 0 (never claimed). */
export function bookingSavingThb(b: Pick<Booking, 'experienceId' | 'heldThb'>): number {
  const ref = b.experienceId ? EXPERIENCE_REFERENCE[b.experienceId] : undefined
  return ref ? Math.max(0, Math.round(ref.elsewhereThb - b.heldThb)) : 0
}

function bookingEntries(): TripSavedEntry[] {
  return completedKringBookings().map((b) => {
    const ref = b.experienceId ? EXPERIENCE_REFERENCE[b.experienceId] : undefined
    return {
      key: `kring:${b.id}`,
      savedThb: bookingSavingThb(b),
      paidThb: b.heldThb,
      at: b.releasedAt ?? b.updatedAt,
      label: `${b.experienceTitle || 'Kring booking'} · ${b.localName}`,
      source: ref ? `${ref.source.en} · checked ${ref.checked}` : undefined,
    }
  })
}

function readMeta(): Record<string, TripSavedMeta> {
  try {
    const raw = window.localStorage.getItem(TRIP_SAVED_META_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, TripSavedMeta> = {}
    for (const [k, m] of Object.entries(v as Record<string, { at?: unknown; paidThb?: unknown }>)) {
      if (m && typeof m.at === 'number' && Number.isFinite(m.at)) out[k] = { at: m.at, paidThb: typeof m.paidThb === 'number' ? m.paidThb : undefined }
    }
    return out
  } catch {
    return {}
  }
}
function writeMeta(meta: Record<string, TripSavedMeta>) {
  try {
    window.localStorage.setItem(TRIP_SAVED_META_KEY, JSON.stringify(meta))
  } catch {
    // storage blocked
  }
}

function readItems(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(TRIP_SAVED_ITEMS_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
    const out: Record<string, number> = {}
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n) && n >= 0) out[k] = Math.round(n)
    }
    return out
  } catch {
    return {}
  }
}

/**
 * The recorded items with every saving re-checked against the floor (entries written before ROUND5 were measured
 * against walk-in prices; this keeps an old device from showing an inflated figure).
 */
function floorItems(): Record<string, number> {
  const items = readItems()
  const meta = readMeta()
  const out: Record<string, number> = {}
  for (const [k, n] of Object.entries(items)) {
    const paid = meta[k]?.paidThb
    const floor = typeof paid === 'number' ? floorForTripItem(k, paid) : null
    out[k] = floor === null || typeof paid !== 'number' ? n : Math.max(0, Math.min(n, Math.round(floor - paid)))
  }
  return out
}

/** Total saved this trip (0 when nothing was booked). */
export function readTripSavedThb(): number {
  try {
    const n = Number(window.localStorage.getItem(TRIP_SAVED_KEY) ?? 0)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  } catch {
    return 0
  }
}

/** @deprecated kept for older callers: the real sum, or 0. There is no demo figure any more. */
export function tripSavedForDisplay(stored: number, _isDemo: boolean): number {
  void _isDemo
  return stored > 0 ? stored : 0
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, n) => a + n, 0)

/**
 * THE trip-savings number (Wallet "You saved", Top-up, Pulse hero): the sum of FLOOR − OURS over what was booked.
 * Demo and real accounts read the same thing — ฿0 until something is booked. (`isDemo` is kept for call-site compat.)
 */
export function tripSavedTotal(_isDemo = false): number {
  void _isDemo
  if (typeof window === 'undefined') return 0
  return sum(floorItems()) + bookingEntries().reduce((a, e) => a + e.savedThb, 0)
}

/** How many things this trip was booked through Kring (Kring Price items + completed Kring bookings). */
export function tripBookingCount(): number {
  if (typeof window === 'undefined') return 0
  return Object.keys(readItems()).length + completedKringBookings().length
}

/** React hook: the one trip-savings figure, live (updates on `chon:trip-saved` and cross-tab storage). */
export function useTripSaved(isDemo: boolean): number {
  const [n, setN] = useState<number>(() => tripSavedTotal(isDemo))
  useEffect(() => {
    const on = () => setN(tripSavedTotal(isDemo))
    on()
    window.addEventListener(TRIP_SAVED_EVENT, on)
    window.addEventListener('storage', on)
    // a booking released at the bump counts at once
    const unsub = subscribePlanStore(on)
    return () => {
      window.removeEventListener(TRIP_SAVED_EVENT, on)
      window.removeEventListener('storage', on)
      unsub()
    }
  }, [isDemo])
  return n
}

/** React hook: { savedThb, bookings } — both live (Kring Price strip and Wallet read the same pair). */
export function useTripStats(isDemo = false): { savedThb: number; bookings: number } {
  const savedThb = useTripSaved(isDemo)
  const [bookings, setBookings] = useState<number>(() => tripBookingCount())
  useEffect(() => {
    const on = () => setBookings(tripBookingCount())
    on()
    window.addEventListener(TRIP_SAVED_EVENT, on)
    const unsub = subscribePlanStore(on)
    return () => {
      window.removeEventListener(TRIP_SAVED_EVENT, on)
      unsub()
    }
  }, [])
  return { savedThb, bookings }
}

/** Every booked item, newest first, with when it was booked, what the partner was paid and what it saved vs the floor. */
export function tripSavedEntries(_isDemo = false, now = Date.now()): TripSavedEntry[] {
  void _isDemo
  if (typeof window === 'undefined') return []
  const items = floorItems()
  const meta = readMeta()
  const out: TripSavedEntry[] = []
  for (const [key, savedThb] of Object.entries(items)) {
    const m = meta[key] ?? { at: now }
    out.push({ key, savedThb, paidThb: m.paidThb, at: m.at })
  }
  out.push(...bookingEntries())
  return out.sort((a, b) => b.at - a.at)
}

/**
 * Record (or replace) one booked item. `baselineThb` should be the FLOOR price (pulse/floorPrices); whatever a caller
 * passes, the saving is never measured against more than the item's known floor, so a walk-in figure can't inflate it.
 * A booking that saves nothing is still recorded (it belongs in the Wallet timeline), it just adds ฿0.
 */
export function recordTripSaving(itemKey: string, baselineThb: number, chonnThb: number): void {
  if (typeof window === 'undefined') return
  if (!Number.isFinite(baselineThb) || !Number.isFinite(chonnThb) || chonnThb < 0) return
  const floor = floorForTripItem(itemKey, chonnThb)
  const base = floor === null ? baselineThb : Math.min(baselineThb, floor)
  const saved = Math.max(0, Math.round(base - chonnThb))
  const items = { ...readItems(), [itemKey]: saved }
  const total = sum({ ...floorItems(), [itemKey]: saved }) + bookingEntries().reduce((a, e) => a + e.savedThb, 0)
  try {
    window.localStorage.setItem(TRIP_SAVED_ITEMS_KEY, JSON.stringify(items))
    window.localStorage.setItem(TRIP_SAVED_KEY, String(total))
    writeMeta({ ...readMeta(), [itemKey]: { at: Date.now(), paidThb: Math.max(0, Math.round(chonnThb)) } })
  } catch {
    // storage blocked — the event still carries the figure for this session
  }
  window.dispatchEvent(new CustomEvent(TRIP_SAVED_EVENT, { detail: { savedThb: total, itemKey } }))
}
