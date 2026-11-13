/* Chat links and blocked hosts (area C).
   - openChat(actId, ref?, ask?) opens the conversation with an activity's host for ONE booking (its date/time show in
     the chat header), or as a "Question before booking" inquiry when there is no booking yet.
   - isBlocked(hostName) / isActBlocked(act) read the existing block list (S.blocked) so other screens
     (e.g. Explore) can hide a blocked host's activities. */
import { S, update, type Booking } from './store'
import { ACTS, type Act } from './data'
import { go } from './router'

export interface ChatTarget { ref?: string; ask?: boolean }

/** Which booking (or inquiry) the chat screen was opened for. Read from the hash so a reload keeps it. */
export function chatTarget(): ChatTarget {
  try {
    const q = new URLSearchParams(location.hash.split('?')[1] || '')
    return { ref: q.get('bk') || undefined, ask: q.get('ask') === '1' }
  } catch {
    return {}
  }
}

/** Open the chat with this activity's host, for the booking with this reference (or as a pre-booking question). */
/** Unsent chat text per activity (kept while the guest signs up). */
export const CHAT_DRAFT: Record<string, string> = {}

export function openChat(actId: string, ref?: string, ask = false): void {
  update((s) => { s.act = actId })
  go('chat', 'r')
  const q = ref ? '?bk=' + encodeURIComponent(ref) : ask ? '?ask=1' : ''
  try { history.replaceState(null, '', '#chat' + q) } catch { /* ignore */ }
  update()
}

const live = (b: Booking): boolean => b.kind === 'act' && b.status !== 'cancelled' && !b.done
/** The booking a chat is about: the one with `ref` if given, else the next upcoming live one, else the latest live one. */
export function chatBooking(actId: string, ref?: string): Booking | undefined {
  const mine = S.bookings.filter((b) => b.act === actId && live(b))
  if (ref) {
    const hit = mine.find((b) => b.ref === ref)
    if (hit) return hit
  }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const upcoming = mine.filter((b) => new Date(b.date).getTime() >= today.getTime()).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  return upcoming[0] || mine[mine.length - 1]
}

const norm = (v: string): string => v.trim().toLowerCase()

/** True when the guest has blocked this host. Accepts the host's English or Thai name (e.g. "Nicha" or "ณิชา"). */
export function isBlocked(hostName: string): boolean {
  const n = norm(hostName || '')
  if (!n) return false
  return S.blocked.some((b) => {
    if (norm(b.name) === n) return true
    const a = b.id.startsWith('host:') ? ACTS.find((x) => x.id === b.id.slice(5)) : undefined
    return !!a && (norm(a.host) === n || norm(a.hostTh) === n)
  })
}

/** True when the activity's host is blocked (use to hide it from Explore / Locals lists). */
export function isActBlocked(a: Act | string): boolean {
  const x = typeof a === 'string' ? ACTS.find((y) => y.id === a) : a
  if (!x) return false
  return S.blocked.some((b) => b.id === 'host:' + x.id) || isBlocked(x.host) || isBlocked(x.hostTh)
}

/* ---------- host side (round 3): the host messages a guest they accepted ----------
   Preview hosts answer three sample requests (r0, r1, r2 on #hreq). A guest's name is shown exactly as the guest
   wrote it, in every app language (never swapped for a "local" name), so the host recognises them at the place. */
export interface SampleGuest { name: string; code: string; note: string }
export const SAMPLE_GUESTS: Record<string, SampleGuest> = {
  r0: { name: 'Emma', code: 'EN', note: 'h6_hr_note0' },
  r1: { name: 'Lin', code: 'ZH', note: 'h6_hr_note1' },
  r2: { name: 'Arjun', code: 'HI', note: 'h6_hr_note2' },
}
interface HostReqRec { st?: string; name?: string; when?: string; time?: string; title?: string }
/** The host's saved answer for a request (kept on this phone by #hreq). */
export const hostReq = (reqId: string): HostReqRec | undefined => ((S.hostReqs || {}) as Record<string, HostReqRec>)[reqId]
/** The guest's own name for a request: never translated or swapped by app language. */
export function guestName(reqId: string): string {
  return SAMPLE_GUESTS[reqId]?.name || (hostReq(reqId)?.name || '').trim() || 'Guest'
}
/** Requests the host accepted (the guests the host can message), soonest first. */
export function acceptedGuests(): { id: string; name: string; when?: string; time?: string; title?: string }[] {
  const r = (S.hostReqs || {}) as Record<string, HostReqRec>
  return Object.entries(r)
    .filter(([, v]) => v && v.st === 'acc')
    .map(([id, v]) => ({ id, name: guestName(id), when: v.when, time: v.time, title: v.title }))
    .sort((a, b) => new Date(a.when || 0).getTime() - new Date(b.when || 0).getTime())
}
/** Conversation key for the host's chat with one guest (kept apart from the guest's own chats with hosts). */
export const guestChatKey = (reqId: string): string => 'guest:' + reqId
/** Which guest the host chat is for (from the hash, so a reload keeps it). */
export function hostChatTarget(): string {
  try {
    return new URLSearchParams(location.hash.split('?')[1] || '').get('g') || 'r0'
  } catch {
    return 'r0'
  }
}
/** Open the host's chat with the guest of this request. */
export function openHostChat(reqId: string): void {
  go('hchat', 'r')
  try { history.replaceState(null, '', '#hchat?g=' + encodeURIComponent(reqId)) } catch { /* ignore */ }
  update()
}
