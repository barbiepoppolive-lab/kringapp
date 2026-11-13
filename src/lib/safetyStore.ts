/**
 * UX-P5 · Founder rule 2 — Block / Report / Mute / Pre-block / Saved favourites.
 * One tiny localStorage-backed store shared by MeetFeed, ChatsAndPlansTab, ClinkGiftSheet and the Privacy sheet.
 * A `chon:safety-change` window event fires on every write so every tab re-renders instantly.
 */
import { useEffect, useState } from 'react'

export const SAFETY_STORAGE_KEY = 'chon_safety_v1'
export const SAFETY_EVENT = 'chon:safety-change'

export interface SafetyState {
  blockedHostIds: string[]
  mutedHostIds: string[]
  reportedHostIds: string[]
  /** phone numbers / @LINE ids the user never wants to be seen by */
  preBlocked: string[]
  savedHostIds: string[]
}

const EMPTY: SafetyState = { blockedHostIds: [], mutedHostIds: [], reportedHostIds: [], preBlocked: [], savedHostIds: [] }

export function readSafety(): SafetyState {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(SAFETY_STORAGE_KEY) : null
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<SafetyState>
    return { ...EMPTY, ...parsed }
  } catch {
    return { ...EMPTY }
  }
}

function write(next: SafetyState): SafetyState {
  try {
    window.localStorage.setItem(SAFETY_STORAGE_KEY, JSON.stringify(next))
  } catch {
    // storage may be unavailable (private mode); state still propagates via the event
  }
  try {
    window.dispatchEvent(new CustomEvent(SAFETY_EVENT, { detail: next }))
  } catch {
    // ignore
  }
  return next
}

/** Chat partner ids are `mint`, Meet host ids are `host-mint` — compare on the bare slug */
export function hostKey(id: string): string {
  return id.replace(/^host-/i, '').trim().toLowerCase()
}

export function listHas(list: string[], id: string): boolean {
  const k = hostKey(id)
  return list.some((x) => hostKey(x) === k)
}

function toggleIn(list: string[], id: string, on?: boolean): string[] {
  const has = listHas(list, id)
  const want = on ?? !has
  if (want && !has) return [...list, id]
  if (!want && has) return list.filter((x) => hostKey(x) !== hostKey(id))
  return list
}

export const safety = {
  block(hostId: string): SafetyState {
    const s = readSafety()
    return write({ ...s, blockedHostIds: toggleIn(s.blockedHostIds, hostId, true) })
  },
  unblock(hostId: string): SafetyState {
    const s = readSafety()
    return write({ ...s, blockedHostIds: toggleIn(s.blockedHostIds, hostId, false) })
  },
  toggleMute(hostId: string): SafetyState {
    const s = readSafety()
    return write({ ...s, mutedHostIds: toggleIn(s.mutedHostIds, hostId) })
  },
  report(hostId: string): SafetyState {
    const s = readSafety()
    return write({ ...s, reportedHostIds: toggleIn(s.reportedHostIds, hostId, true) })
  },
  preBlock(handle: string): SafetyState {
    const h = normaliseHandle(handle)
    if (!h) return readSafety()
    const s = readSafety()
    return write({ ...s, preBlocked: toggleIn(s.preBlocked, h, true) })
  },
  unPreBlock(handle: string): SafetyState {
    const s = readSafety()
    return write({ ...s, preBlocked: toggleIn(s.preBlocked, handle, false) })
  },
  toggleSaved(hostId: string): SafetyState {
    const s = readSafety()
    return write({ ...s, savedHostIds: toggleIn(s.savedHostIds, hostId) })
  },
}

export function normaliseHandle(raw: string): string {
  const v = raw.trim()
  if (!v) return ''
  if (v.startsWith('@')) {
    const id = v.slice(1).replace(/\s+/g, '').toLowerCase()
    return id.length >= 3 ? '@' + id : ''
  }
  // Phone: only when nothing but digits/+/separators remain → canonical E.164 for Thailand
  if (/^[\d+\s()\-.]+$/.test(v)) {
    let digits = v.replace(/\(0\)/g, '').replace(/[^\d+]/g, '')
    if (digits.startsWith('+')) digits = '+' + digits.slice(1).replace(/\+/g, '')
    if (digits.startsWith('0066')) digits = '+66' + digits.slice(4)
    else if (digits.startsWith('66') && digits.length >= 11) digits = '+' + digits
    else if (digits.startsWith('0') && digits.length >= 9) digits = '+66' + digits.slice(1)
    const n = digits.replace(/\D/g, '')
    return n.length >= 8 && n.length <= 15 ? digits : ''
  }
  const id = v.replace(/\s+/g, '').toLowerCase()
  return id.length >= 3 ? '@' + id : ''
}

/** React hook: live view of the safety state */
export function useSafety(): SafetyState {
  const [state, setState] = useState<SafetyState>(() => readSafety())
  useEffect(() => {
    const onChange = () => setState(readSafety())
    window.addEventListener(SAFETY_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(SAFETY_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  }, [])
  return state
}
