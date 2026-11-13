/* Backend bridge for Kring v6.
   - With VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY set and a signed-in user token, calls the kr6_* RPCs
     from supabase/migrations/0008_kring_v6_core.sql through PostgREST.
   - Without keys (design reviews, offline demos) it runs in "local" mode: the app keeps state on the device
     and every call resolves locally, so screens behave the same.
   The money itself is always moved by the licensed payment partner; these RPCs only record the partner's
   hold / release / refund decisions and enforce the Kring rules. */

import { translateChatMessage } from './translate'
import { S, type Lang } from './store'
import { recordTableBill as accountRecordTableBill, fetchMeetingPlace, getUserId, type RecordTableBillInput } from './account'

const env = (import.meta.env ?? {}) as Record<string, string | undefined>
const URL_ = env.VITE_SUPABASE_URL?.trim() || ''
const ANON = env.VITE_SUPABASE_ANON_KEY?.trim() || ''
let token = ''

export const live = (): boolean => !!(URL_ && ANON && token)
export function setSession(accessToken: string): void { token = accessToken }

export class ApiError extends Error {
  constructor(public code: string) { super(code) }
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = await r.json().catch(() => null)
  if (!r.ok) {
    const msg = String((body as { message?: string } | null)?.message || r.statusText)
    throw new ApiError(msg.replace(/^.*?([A-Z_0-9]{6,}).*$/, '$1'))
  }
  return body as T
}

/** Server error codes → the app's words (keys in strings.json); unknown codes fall back to a generic line. */
export const ERR_KEYS: Record<string, string> = {
  MAX_2_PEOPLE: 'maxTwo', HOST_AWAY: 'waitHost', NOT_A_START_TIME: 'when', ALREADY_BOOKED_THIS_SLOT: 'groupLink',
  HOST_SLOT_TAKEN: 'moreOpts', TIP_MAX_500: 'tipWindow', LINK_NOT_ALLOWED: 'linkHidden', TOO_FAR_FROM_MEETING_POINT: 'touchRule',
}

export const api = {
  requestBooking: (activity: string, startISO: string, guests: number, payMethod: string, partnerRef: string) =>
    live() ? rpc<string>('kr6_request_booking', { p_activity: activity, p_start: startISO, p_guests: guests, p_pay_method: payMethod, p_partner_ref: partnerRef }) : Promise.resolve('local-' + Date.now()),
  hostRespond: (booking: string, accept: boolean) =>
    live() ? rpc<string>('kr6_host_respond', { p_booking: booking, p_accept: accept }) : Promise.resolve(accept ? 'confirmed' : 'declined'),
  cancel: (booking: string, reason: 'sick_note' | 'weather' | 'flight' | 'other') =>
    live() ? rpc<number>('kr6_cancel_booking', { p_booking: booking, p_reason: reason }) : Promise.resolve(-1),
  hostCancel: (booking: string, reason: string) => (live() ? rpc<void>('kr6_host_cancel', { p_booking: booking, p_reason: reason }) : Promise.resolve()),
  runningLate: (booking: string, minutes: number) => (live() ? rpc<void>('kr6_running_late', { p_booking: booking, p_minutes: minutes }) : Promise.resolve()),
  bump: (booking: string, lat: number | null, lng: number | null, code?: string) =>
    live() ? rpc<'released' | 'waiting_for_other_phone'>('kr6_bump', { p_booking: booking, p_lat: lat, p_lng: lng, p_code: code ?? null }) : Promise.resolve('released' as const),
  sendGift: (booking: string, code: string) => (live() ? rpc<number>('kr6_send_gift', { p_booking: booking, p_code: code }) : Promise.resolve(0)),
  tip: (booking: string, amount: number) => (live() ? rpc<void>('kr6_tip', { p_booking: booking, p_amount: amount }) : Promise.resolve()),
  rate: (booking: string, stars: number, tags: string[], note: string) => (live() ? rpc<void>('kr6_rate', { p_booking: booking, p_stars: stars, p_tags: tags, p_note: note }) : Promise.resolve()),
  report: (booking: string, reason: string, details: string) => (live() ? rpc<string>('kr6_report', { p_booking: booking, p_reason: reason, p_details: details }) : Promise.resolve('')),
  /** 0016: one ฿0 launch ticket per account, Zone 1 only. Offline/demo builds trust the local flag. */
  claimLaunchTicket: (area: string) => (live() ? rpc<boolean>('kr6_claim_launch_ticket', { p_area: area }) : Promise.resolve(true)),
  markNoShow: (booking: string) => (live() ? rpc<void>('kr6_mark_no_show', { p_booking: booking }) : Promise.resolve()),
  recordTableBill: async (opts: RecordTableBillInput) => {
    const uid = getUserId(token)
    const isHost = Boolean(S.prof?.isHost || S.host)
    const booking_id = opts.booking_id || null
    const host_id = opts.host_id !== undefined ? opts.host_id : (isHost ? uid : null)
    const guest_id = opts.guest_id !== undefined ? opts.guest_id : (!isHost ? uid : null)
    return accountRecordTableBill(
      {
        meeting_place_id: opts.meeting_place_id,
        booking_id,
        host_id,
        guest_id,
        bill_amount_thb: opts.bill_amount_thb,
        entered_by: opts.entered_by,
      },
      token,
    )
  },
  fetchMeetingPlace: (idOrSlug: string) => fetchMeetingPlace(idOrSlug),
  translateChat: (rawText: string, targetLang: Lang, sourceLang?: Lang) =>
    translateChatMessage(rawText, targetLang, sourceLang),
}
