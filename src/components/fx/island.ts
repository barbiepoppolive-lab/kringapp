/**
 * Atlas contract · the ONE top island (A owns TopIsland). Every toast / win line in Meet, Clink, gifts and
 * Host home goes through here so nothing stacks, nothing lands on the header or the dock.
 */
export type IslandTone = 'gold' | 'green' | 'red' | 'neutral'

export function showIsland(text: string, tone: IslandTone = 'neutral', icon?: string, ms?: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:island', { detail: { text, tone, icon, ms } }))
}

/** Opens the shared full-screen guide (A owns FullGuide). */
export function openGuide(id: string, page?: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:open-guide', { detail: { id, page } }))
}

/** Opens the ONE top-up sheet (D owns TopUpSheet). */
export function openTopUp(reason?: string, needThb?: number): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:open-topup', { detail: { reason, needThb } }))
}

/** Atlas integration #6 · daily rewards: mark a task as done so the Rewards Claim turns gold. Never pays anything —
 *  the coins are credited only by the Tasks drawer's existing claim handler. Detail carries both `id` (Rewards hub)
 *  and `task` (contract name). */
export type RewardTaskId = 'watch-story' | 'vibe-check' | 'toast-stories' | 'lucky-dice-gift'
export function markTaskDone(task: RewardTaskId): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('chon:task-done', { detail: { id: task, task } }))
}

/* ---------- ROUND5 Ploy B9 / Wei B11 · the island never covers the header or the first row under it ----------
 * Anything that hangs under the App header (the top island, the Starter Pack pill) RESERVES its height instead of
 * printing over the row beneath (Host home's "Tonight" + online switch, the other-hosts back pill, Clink buttons).
 * App renders one spacer right under the header whose height is `--island-space` (the largest live reservation),
 * so the content slides down while a pill shows and back up when it goes. Writes only on change.
 */
const reservations = new Map<string, number>()
let appliedSpace = -1

export const ISLAND_VISIBLE_EVENT = 'chon:island-visible'

export function reserveIslandSpace(id: string, px: number): void {
  if (typeof document === 'undefined') return
  if (px > 0) reservations.set(id, Math.round(px))
  else reservations.delete(id)
  const max = reservations.size ? Math.max(...reservations.values()) : 0
  if (max === appliedSpace) return
  appliedSpace = max
  document.documentElement.style.setProperty('--island-space', `${max}px`)
  document.documentElement.classList.toggle('has-island-space', max > 0)
}
