/**
 * NEXT95 · "The night stays the night" — demo persistence.
 *
 * In a DEMO session the wallet (paid + bonus coins, spent today) used to reset on every reload, so the story a tester
 * started (held ฿300, topped up, toasted a story) fell apart. This keeps those numbers in localStorage for the
 * current night (a night runs 06:00 → 06:00 Bangkok, so 1 AM still belongs to "tonight"). App reads its initial demo
 * wallet from here and writes every change back.
 *
 * Demo only: real sessions never read or write it (their balance is the server's). No money logic lives here — it is
 * a snapshot of what App already shows. Every storage access is wrapped (private mode / blocked storage → no-op).
 *
 * Also a light mirror of G3's Starter Pack flags for the post-onboarding nudge (see the end of this file).
 */

const NIGHT_KEY = 'chon_demo_night_v1'

export interface DemoWallet {
  paid: number
  bonus: number
  spentToday: number
}

interface DemoNight extends DemoWallet {
  v: 1
  night: string
  userId: string
  savedAt: number
}

/**
 * The night a moment belongs to, in BANGKOK time (UTC+7, no DST) whatever the device's timezone: the Bangkok date of
 * (now − 6 h). So 01:00 Bangkok still belongs to "tonight", and 06:00 Bangkok starts a fresh night.
 * Bangkok = UTC + 7 h, minus the 6 h night offset → the UTC date of (now + 1 h).
 */
export function nightOf(now: Date = new Date()): string {
  const d = new Date(now.getTime() + (7 - 6) * 3600_000)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/* ---------------- nightStore — generic "lasts for the night" demo persistence ----------------
 * ROUND5 cross-cutting decision: demo plans, extensions, host payouts/balance, host story and received-gift bubbles
 * live in localStorage for the current night (06:00 → 06:00 Bangkok), so closing and reopening the app keeps the
 * story together (a plan's held amount and the wallet always agree). Real sessions keep their own source.
 *
 *   nightStore.get<T>(key, fallback)   → tonight's value or `fallback` (other night / nothing / corrupt / blocked)
 *   nightStore.set(key, value)         → saves `{ v, night, at, value }` under `chon_night_v1:<key>`
 *   nightStore.remove(key)
 *   nightStore.update<T>(key, fallback, fn) → read-modify-write helper
 *
 * Every access is try/catch'd (private mode / quota / blocked storage → a silent no-op that returns the fallback).
 * Values from an earlier night are removed on read. Changes fire `chon:night-store` `{ key }` on window so other
 * mounted surfaces can re-read; the native `storage` event covers other tabs.
 */
export const NIGHT_STORE_PREFIX = 'chon_night_v1:'
export const NIGHT_STORE_EVENT = 'chon:night-store'

interface NightEnvelope<T> {
  v: 1
  night: string
  at: number
  value: T
}

function nsKey(key: string): string {
  return NIGHT_STORE_PREFIX + key
}

function nsNotify(key: string): void {
  try {
    window.dispatchEvent(new CustomEvent(NIGHT_STORE_EVENT, { detail: { key } }))
  } catch {
    // no window / CustomEvent — nothing to notify
  }
}

export function nightGet<T>(key: string, fallback: T, now: Date = new Date()): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(nsKey(key))
    if (!raw) return fallback
    const env = JSON.parse(raw) as Partial<NightEnvelope<T>>
    if (!env || env.v !== 1 || typeof env.night !== 'string' || !('value' in env)) return fallback
    if (env.night !== nightOf(now)) {
      window.localStorage.removeItem(nsKey(key)) // last night's leftovers
      return fallback
    }
    return env.value as T
  } catch {
    return fallback
  }
}

export function nightSet<T>(key: string, value: T, now: Date = new Date()): void {
  if (typeof window === 'undefined') return
  try {
    const env: NightEnvelope<T> = { v: 1, night: nightOf(now), at: now.getTime(), value }
    window.localStorage.setItem(nsKey(key), JSON.stringify(env))
  } catch {
    return // storage blocked / quota → the demo simply resets on reload
  }
  nsNotify(key)
}

export function nightRemove(key: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(nsKey(key))
  } catch {
    return
  }
  nsNotify(key)
}

export function nightUpdate<T>(key: string, fallback: T, fn: (prev: T) => T, now: Date = new Date()): T {
  const next = fn(nightGet<T>(key, fallback, now))
  nightSet<T>(key, next, now)
  return next
}

/** Removes every nightStore entry (e.g. sign-out / "reset demo"). */
export function nightClearAll(): void {
  if (typeof window === 'undefined') return
  try {
    const ls = window.localStorage
    const doomed: string[] = []
    for (let i = 0; i < ls.length; i++) {
      const k = ls.key(i)
      if (k && k.startsWith(NIGHT_STORE_PREFIX)) doomed.push(k)
    }
    doomed.forEach((k) => ls.removeItem(k))
  } catch {
    // ignore
  }
}

export const nightStore = {
  get: nightGet,
  set: nightSet,
  remove: nightRemove,
  update: nightUpdate,
  clearAll: nightClearAll,
  key: nsKey,
  EVENT: NIGHT_STORE_EVENT,
} as const

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0

/** Tonight's saved demo wallet for this demo user, or null (other night, other user, nothing saved, storage blocked). */
export function readDemoWallet(userId: string, now: Date = new Date()): DemoWallet | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(NIGHT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Partial<DemoNight>
    if (!v || v.v !== 1 || v.userId !== userId || v.night !== nightOf(now)) return null
    if (!isCount(v.paid) || !isCount(v.bonus)) return null
    return { paid: Math.floor(v.paid), bonus: Math.floor(v.bonus), spentToday: isCount(v.spentToday) ? Math.floor(v.spentToday) : 0 }
  } catch {
    return null
  }
}

export function writeDemoWallet(userId: string, wallet: DemoWallet, now: Date = new Date()): void {
  if (typeof window === 'undefined') return
  if (!isCount(wallet.paid) || !isCount(wallet.bonus)) return
  try {
    const value: DemoNight = {
      v: 1,
      night: nightOf(now),
      userId,
      paid: Math.floor(wallet.paid),
      bonus: Math.floor(wallet.bonus),
      spentToday: isCount(wallet.spentToday) ? Math.floor(wallet.spentToday) : 0,
      savedAt: now.getTime(),
    }
    window.localStorage.setItem(NIGHT_KEY, JSON.stringify(value))
  } catch {
    // storage blocked → the demo simply resets on reload, as before
  }
}

export function clearDemoNight(): void {
  try {
    window.localStorage.removeItem(NIGHT_KEY)
  } catch {
    // ignore
  }
}

/* ---------------- Starter Pack flags (read-only mirror of G3's store) ----------------
 * G3 owns the offer (src/components/wallet/StarterPack.tsx): `chon_starter_pack_v1` is a map
 * `{ [userId]: { state: 'bought' | 'dismissed', at } }`, changes fire `chon:starter-pack`, and the sheet opens on
 * `chon:open-starter-pack { source }`. These helpers read/write the SAME format without importing the wallet chunk
 * (the post-onboarding nudge lives in the main bundle).
 */
export const STARTER_PACK_KEY = 'chon_starter_pack_v1'
export const STARTER_PACK_EVENT = 'chon:starter-pack'
export const OPEN_STARTER_PACK_EVENT = 'chon:open-starter-pack'

export type StarterPackState = 'new' | 'bought' | 'dismissed'

function readPackMap(): Record<string, { state?: string; at?: number }> {
  try {
    const raw = window.localStorage.getItem(STARTER_PACK_KEY)
    const v = raw ? (JSON.parse(raw) as unknown) : {}
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, { state?: string; at?: number }>) : {}
  } catch {
    return {}
  }
}

export function readStarterPackState(userId: string | null | undefined): StarterPackState {
  if (typeof window === 'undefined' || !userId) return 'new'
  const st = readPackMap()[userId]?.state
  return st === 'bought' || st === 'dismissed' ? st : 'new'
}

/** "No thanks" from the nudge — same record G3's sheet writes (a dismiss never overwrites a purchase). */
export function dismissStarterPack(userId: string | null | undefined): void {
  if (typeof window === 'undefined' || !userId) return
  const all = readPackMap()
  if (all[userId]?.state === 'bought') return
  all[userId] = { state: 'dismissed', at: Date.now() }
  try {
    window.localStorage.setItem(STARTER_PACK_KEY, JSON.stringify(all))
  } catch {
    // storage blocked
  }
  window.dispatchEvent(new CustomEvent(STARTER_PACK_EVENT, { detail: { state: 'dismissed' } }))
}

/** Travellers only, once: hidden for hosts / agencies and after a buy or a dismiss. */
export function starterPackHidden(role: string | null | undefined, userId: string | null | undefined): boolean {
  if (role !== 'guest') return true
  return readStarterPackState(userId) !== 'new'
}

export function openStarterPack(source: string): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_STARTER_PACK_EVENT, { detail: { source } }))
}
