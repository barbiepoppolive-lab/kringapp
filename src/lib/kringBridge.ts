/**
 * Kring integration bridge — keeps the builders' stores telling one story.
 *
 *  • Go-live venue setting: K1's My profile writes `presence.guestsMaySuggestVenue` (context/presence.ts); K3's
 *    planStore enforces `allowsVenueChange(localId)` and Local home has its own Yes/No toggle. Both now mirror each
 *    other for the signed-in local (`currentViewerId()`), so the setting reads the same everywhere.
 *  • Live / Paused needs no bridge: lib/selfGuard's `getLiveState/setLiveState` read and write the presence store.
 *  • KRING FIX2 · Ploy 4: a role switch (My profile / Wallet → `kring:role-changed`) or a profile edit
 *    (`chon:profile-updated`) re-announces presence once the new session is stored, so the viewer's own Local card
 *    (selfGuard `useSelfLocal` → Experiences + Locals) appears / disappears without a reload.
 *
 * Installed once by App (`useEffect(() => installKringBridge(), [])`); returns the uninstall function.
 */
import { announcePresence, PRESENCE_EVENT, readPresence, writePresence, type Presence } from '../context/presence'
import { allowsVenueChange, currentViewerId, getPlanStore, partnerKey, setAllowVenueChange, subscribePlanStore } from './planStore'

export function installKringBridge(): () => void {
  if (typeof window === 'undefined') return () => {}

  const pushToPlanStore = (p: Presence) => {
    const me = currentViewerId()
    if (!me || me === 'me') return
    if (allowsVenueChange(me) !== p.guestsMaySuggestVenue) setAllowVenueChange(me, p.guestsMaySuggestVenue)
  }

  // presence is the source of truth at start-up
  pushToPlanStore(readPresence())

  const onPresence = (e: Event) => pushToPlanStore((e as CustomEvent<Presence>).detail ?? readPresence())
  window.addEventListener(PRESENCE_EVENT, onPresence)

  // the session's role is persisted when React commits the switch — announce on the next task, after that write
  let t = 0
  const reannounce = () => {
    window.clearTimeout(t)
    t = window.setTimeout(() => announcePresence(), 0)
  }
  window.addEventListener('kring:role-changed', reannounce)
  window.addEventListener('chon:profile-updated', reannounce)

  // Local home's toggle (planStore) → presence (My profile row)
  const unsub = subscribePlanStore(() => {
    const me = currentViewerId()
    if (!me || me === 'me') return
    const s = getPlanStore().hostSettings[partnerKey(me)]
    if (!s) return
    if (s.allowVenueChange !== readPresence().guestsMaySuggestVenue) writePresence({ guestsMaySuggestVenue: s.allowVenueChange })
  })

  return () => {
    window.removeEventListener(PRESENCE_EVENT, onPresence)
    window.removeEventListener('kring:role-changed', reannounce)
    window.removeEventListener('chon:profile-updated', reannounce)
    window.clearTimeout(t)
    unsub()
  }
}
