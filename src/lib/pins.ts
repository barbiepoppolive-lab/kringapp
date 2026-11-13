/**
 * Kring · Saved locals (K2 pins → V2 visual round: the founder's outline heart, red when saved). Never
 * "favourites/คนโปรด". Saving shows "Saved · see in Me › Saved"; the list lives in Me › Saved.
 *
 * One source of truth: the pinned list IS the safety store's `savedHostIds` (chon_safety_v1), so every surface
 * that already reads "saved" (Chats, filters, tests) agrees with the 📌 on a card. This module only adds the
 * Kring wording, the toast and a tiny hook.
 *
 *   import { usePins, togglePin, isPinned } from '../lib/pins'
 *   const pins = usePins()            // string[] of host ids, re-renders on change
 *   togglePin(host.id, host.name, lang) // flips it and shows "Saved · see in Me › Saved" on the island
 *
 * Self-guard: you can't pin yourself — `togglePin` on your own id is a silent no-op (the card shows ✎ there).
 */
import { listHas, readSafety, safety, useSafety } from './safetyStore'
import { isSelf } from './selfGuard'
import { showIsland } from '../components/fx/island'
import { triggerHaptic } from './haptics'
import { t as lex } from './lexicon'

export function pinnedIds(): string[] {
  return readSafety().savedHostIds
}

export function isPinned(hostId: string): boolean {
  return listHas(readSafety().savedHostIds, hostId)
}

/** React hook: the pinned host ids (re-renders on any pin change, in any tab). */
export function usePins(): string[] {
  return useSafety().savedHostIds
}

/** Flip a pin. Returns the new pinned state (false for yourself — silently ignored). */
export function togglePin(hostId: string, name?: string, lang: string = 'en'): boolean {
  if (!hostId || isSelf(hostId) || (name && isSelf(name))) return false
  const next = listHas(safety.toggleSaved(hostId).savedHostIds, hostId)
  triggerHaptic(next ? 'select' : 'tap')
  const th = lang === 'th'
  const who = name ? ` · ${name}` : ''
  if (next) showIsland(lex('saved.toast', th ? 'th' : lang === 'zh' ? 'zh' : 'en'), 'gold', '♥')
  else showIsland(th ? `เอาออกจากที่บันทึกไว้แล้ว${who}` : `Removed from Saved${who}`, 'neutral')
  return next
}

/** The pinned locals out of a list, in pin order (oldest first). */
export function pinnedOf<T extends { id: string }>(list: readonly T[], pins: readonly string[] = pinnedIds()): T[] {
  return pins.map((id) => list.find((x) => x.id === id || listHas([id], x.id))).filter((x): x is T => Boolean(x))
}
